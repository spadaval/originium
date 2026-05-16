import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type SourceHeadingDraft,
  sourceDocumentRecordId,
  sourceHeadingRecordId,
  validatePageBodyCitationMarkers,
  wikiPageRecordId,
  wikiPageSlugFromTitle,
} from "@originium/domain";
import { createPdfSourceDocumentDraftFromFile, extractPdfHeadings, projectPdfChunk } from "@originium/pdf-ingest";
import {
  coreSchemaPath,
  describeSurrealTarget,
  executeSurrealQuery,
  localSurrealStartCommand,
  readSurrealConfig,
  type SurrealConfig,
  sourceDocumentBucketName,
  sourceDocumentBucketSurql,
} from "@originium/surreal";

type CliSuccess = {
  readonly ok: true;
  readonly command: string;
  readonly operation: string;
  readonly input: readonly string[];
  readonly message: string;
  readonly data?: unknown;
};

type CliFailure = {
  readonly ok: false;
  readonly command: string;
  readonly data?: unknown;
  readonly error: {
    readonly kind: "usage_error" | "operation_failure";
    readonly operation: string;
    readonly input: string;
    readonly reason: string;
    readonly action: string;
  };
};

export type CliResult = CliSuccess | CliFailure;

type CommandHandler = (argv: readonly string[]) => Promise<CliResult> | CliResult;

type QueryLogOptions = {
  readonly kind: "read" | "write";
  readonly targetRecords: readonly string[];
  readonly beforeQuery?: string;
  readonly afterQuery?: string;
  readonly sessionId?: string;
  readonly relateEditedTargets?: readonly string[];
};

type AcceptanceStageState = "pass" | "fail" | "blocked" | "deferred" | "not-applicable";

type AcceptanceStage = {
  readonly name: string;
  readonly state: AcceptanceStageState;
  readonly reason: string;
  readonly result?: CliResult;
};

type RetrievalCandidate = {
  readonly kind: "wiki_page" | "source_heading";
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly citedEvidence: readonly Record<string, unknown>[];
  readonly metadata: Record<string, unknown>;
};

type RankedRetrievalCandidate = {
  readonly kind: RetrievalCandidate["kind"];
  readonly id: string;
  readonly title: string;
  readonly score: number;
  readonly signals: {
    readonly lexical: number;
    readonly vector: number;
    readonly graphAuthority: number;
  };
  readonly citedEvidence: readonly Record<string, unknown>[];
  readonly metadata: Record<string, unknown>;
};

type OllamaEmbeddingConfig = {
  readonly url: string;
  readonly model: string;
};

const routeGroups: Record<string, CommandHandler> = {
  acceptance: routeAcceptance,
  citation: routeCitation,
  db: routeDb,
  ingest: routeIngest,
  link: routeLink,
  log: routeLog,
  page: routePage,
  retrieval: routeRetrieval,
  session: routeSession,
  source: routeSource,
};

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<CliResult> {
  const [group] = argv;

  if (!group) {
    return usageFailure({
      command: "",
      operation: "cli.route",
      input: argv.join(" "),
      reason: "Missing command group.",
      action: `Choose one of: ${Object.keys(routeGroups).join(", ")}.`,
    });
  }

  const handler = routeGroups[group];
  if (!handler) {
    return usageFailure({
      command: group,
      operation: "cli.route",
      input: argv.join(" "),
      reason: `Unknown command group '${group}'.`,
      action: `Choose one of: ${Object.keys(routeGroups).join(", ")}.`,
    });
  }

  return handler(argv);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<string> {
  return JSON.stringify(await runCli(argv), null, 2);
}

async function routeDb(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  const config = readSurrealConfig();

  if (!command) {
    return usageFailure({
      command: "db",
      operation: "db.route",
      input: argv.join(" "),
      reason: "Missing db command.",
      action: "Use one of: start, stop, status, doctor, apply-schema.",
    });
  }

  if (command === "start") return startDb(argv, config);
  if (command === "stop") return stopDb(argv, config);

  if (command === "status") {
    const target = describeSurrealTarget(config);
    const pid = readPid(config);
    return success({
      command: "db status",
      operation: "db.status",
      input: argv,
      message: `SurrealDB target: ${target.url} ns=${target.namespace} db=${target.database}`,
      data: {
        target,
        managedProcess: pid ? { pid, running: isProcessRunning(pid), pidFile: config.pidFile } : undefined,
        bucketDir: config.bucketDir,
      },
    });
  }

  if (command === "doctor") {
    const result = await executeSurrealQuery(config, `${sourceDocumentBucketSurql(config)}\nINFO FOR DB;`, {
      queryId: "db.doctor.file-bucket",
    });
    if (!result.ok) return fromSurrealFailure("db doctor", argv, result.error);
    return success({
      command: "db doctor",
      operation: "db.doctor",
      input: argv,
      message: `SurrealDB doctor passed for ${describeSurrealTarget(config).url}; file bucket '${sourceDocumentBucketName}' is definable.`,
      data: result.result,
    });
  }

  if (command === "apply-schema") {
    const schema = await Bun.file(coreSchemaPath).text();
    const result = await executeSurrealQuery(config, `${sourceDocumentBucketSurql(config)}\n${schema}`, {
      queryId: coreSchemaPath,
    });
    if (!result.ok) return fromSurrealFailure("db apply-schema", argv, result.error);
    return success({
      command: "db apply-schema",
      operation: "db.apply-schema",
      input: argv,
      message: `Applied schema file: ${coreSchemaPath}`,
      data: { schemaPath: coreSchemaPath, target: describeSurrealTarget(config) },
    });
  }

  return usageFailure({
    command: `db ${command}`,
    operation: "db.route",
    input: argv.join(" "),
    reason: `Unknown db command '${command}'.`,
    action: "Use one of: start, stop, status, doctor, apply-schema.",
  });
}

async function routeSource(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  const config = readSurrealConfig();

  if (!command) {
    return usageFailure({
      command: "source",
      operation: "source.route",
      input: argv.join(" "),
      reason: "Missing source command.",
      action: "Use one of: import-pdf, headings, chunk.",
    });
  }

  if (command === "import-pdf") {
    const path = argv[2];
    if (!path) return missingArgument("source import-pdf", "source.import-pdf", argv, "<path>");

    try {
      const draft = await createPdfSourceDocumentDraftFromFile(path);
      const id = sourceDocumentRecordId(draft);
      const fileKey = `${id.replace("source_document:", "")}/${basename(path)}`;
      const filePointer = `${sourceDocumentBucketName}:/${fileKey}`;
      const bucketPath = join(config.bucketDir, fileKey);
      mkdirSync(dirname(bucketPath), { recursive: true });
      copyFileSync(path, bucketPath);
      const query = [
        sourceDocumentBucketSurql(config),
        `UPSERT ${id} SET title = "${escapeSurrealString(draft.title)}", kind = "pdf", file = { bucket: "${sourceDocumentBucketName}", key: "/${escapeSurrealString(fileKey)}", pointer: "f\\"${escapeSurrealString(filePointer)}\\"" }, sha256 = "${draft.sha256}", mime_type = "${draft.mimeType}", page_count = ${draft.pageCount ?? "NONE"}, source_uri = "${escapeSurrealString(draft.sourceUri ?? path)}", extraction_status = "imported", updated_at = time::now();`,
        `SELECT * FROM ${id};`,
      ].join("\n");
      const result = await executeSurrealQuery(
        config,
        loggedQuery("source import-pdf", "source.import-pdf", argv, query, {
          kind: "write",
          targetRecords: [id],
          beforeQuery: `SELECT * FROM ${id}`,
          afterQuery: `SELECT * FROM ${id}`,
          relateEditedTargets: [id],
        }),
        { queryId: `source.import-pdf:${path}` },
      );
      if (!result.ok) return fromSurrealFailure("source import-pdf", argv, result.error);
      return success({
        command: "source import-pdf",
        operation: "source.import-pdf",
        input: argv,
        message: `Imported Source Document ${id} into file bucket ${sourceDocumentBucketName}.`,
        data: { id, filePointer, sha256: draft.sha256, pageCount: draft.pageCount, result: result.result },
      });
    } catch (error) {
      return operationFailure(
        "source import-pdf",
        "source.import-pdf",
        argv,
        errorReason(error),
        "Verify the PDF path exists and poppler pdfinfo is installed.",
      );
    }
  }

  if (command === "headings") {
    const path = argv[2];
    if (!path) return missingArgument("source headings", "source.headings", argv, "<pdf-path>");
    const sourceId =
      valueAfter(argv, "--source") ??
      `source_document:${basename(path)
        .replace(/\.[^.]+$/, "")
        .toLowerCase()}`;
    try {
      const headings = extractPdfHeadings(path, sourceId);
      const values = headings.map((heading) => {
        const draft = {
          sourceDocumentId: sourceId,
          title: heading.title,
          headingPath: heading.headingPath,
          level: heading.level,
          startPage: heading.startPage,
          endPage: heading.endPage,
          order: heading.order,
          extractionMethod: heading.extractionMethod,
        };
        const id = sourceHeadingRecordId(draft);
        return `UPSERT ${id} SET source_document = ${sourceId}, title = "${escapeSurrealString(heading.title)}", heading_path = ${surrealArray(heading.headingPath)}, level = ${heading.level}, start_page = ${heading.startPage}, end_page = ${heading.endPage ?? "NONE"}, order = ${heading.order}, extraction_method = "${heading.extractionMethod}";`;
      });
      const result = await executeSurrealQuery(
        config,
        loggedQuery("source headings", "source.headings", argv, values.join("\n"), {
          kind: "write",
          targetRecords: [sourceId],
          afterQuery: `SELECT * FROM source_heading WHERE source_document = ${sourceId} ORDER BY order ASC`,
          relateEditedTargets: [sourceId],
        }),
        { queryId: `source.headings:${sourceId}` },
      );
      if (!result.ok) return fromSurrealFailure("source headings", argv, result.error);
      return success({
        command: "source headings",
        operation: "source.headings",
        input: argv,
        message: `Projected ${headings.length} Source Headings for ${sourceId}.`,
        data: { sourceId, headings },
      });
    } catch (error) {
      return operationFailure(
        "source headings",
        "source.headings",
        argv,
        errorReason(error),
        "Verify pdftotext can extract the fixture PDF.",
      );
    }
  }

  if (command === "chunk") {
    const path = argv[2];
    const headingId = valueAfter(argv, "--heading");
    if (!path) return missingArgument("source chunk", "source.chunk", argv, "<pdf-path>");
    if (!headingId) return missingArgument("source chunk", "source.chunk", argv, "--heading <heading-id>");
    const sourceId = valueAfter(argv, "--source") ?? "source_document:fixture";
    const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "100000", 10);
    const heading = extractPdfHeadings(path, sourceId).find((candidate) => {
      const persistedId = sourceHeadingRecordId({
        sourceDocumentId: sourceId,
        title: candidate.title,
        headingPath: candidate.headingPath,
        level: candidate.level,
        startPage: candidate.startPage,
        endPage: candidate.endPage,
        order: candidate.order,
        extractionMethod: candidate.extractionMethod,
      });
      return candidate.id === headingId || persistedId === headingId || candidate.title === headingId;
    });
    if (!heading) {
      return operationFailure(
        "source chunk",
        "source.chunk",
        argv,
        `No Source Heading matched '${headingId}'.`,
        "Run source headings first and pass a returned heading ID or title.",
      );
    }
    const persistedHeadingId = sourceHeadingRecordId({
      sourceDocumentId: sourceId,
      title: heading.title,
      headingPath: heading.headingPath,
      level: heading.level,
      startPage: heading.startPage,
      endPage: heading.endPage,
      order: heading.order,
      extractionMethod: heading.extractionMethod,
    });
    const chunk = projectPdfChunk(path, heading, { maxTokens });
    const chunkId = `ingestion_chunk:${persistedHeadingId.replace(/^source_heading:/, "")}_${maxTokens}`;
    const result = await executeSurrealQuery(
      readSurrealConfig(),
      loggedQuery(
        "source chunk",
        "source.chunk",
        argv,
        `UPSERT ${chunkId} SET source_document = ${sourceId}, source_heading = ${persistedHeadingId}, start_page = ${chunk.pageRange.start}, end_page = ${chunk.pageRange.end}, token_estimate = ${chunk.tokenEstimate}, extraction_method = "${chunk.extractionMethod}", created_at = time::now(); SELECT * FROM ${chunkId};`,
        {
          kind: "write",
          targetRecords: [chunkId, persistedHeadingId],
          beforeQuery: `SELECT * FROM ${chunkId}`,
          afterQuery: `SELECT * FROM ${chunkId}`,
          relateEditedTargets: [chunkId],
        },
      ),
      { queryId: `source.chunk:${persistedHeadingId}` },
    );
    if (!result.ok) return fromSurrealFailure("source chunk", argv, result.error);
    return success({
      command: "source chunk",
      operation: "source.chunk",
      input: argv,
      message: `Projected and recorded Ingestion Chunk ${chunkId} for ${persistedHeadingId} with estimated ${chunk.tokenEstimate} tokens.`,
      data: { ...chunk, id: chunkId, result: result.result },
    });
  }

  return unknownCommand("source", command, argv, "Use one of: import-pdf, headings, chunk.");
}

async function routePage(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("page", argv, "Use one of: create, read, update, search.");
  if (command === "create" || command === "update") return writePage(argv, command);
  if (command === "read") return selectById("page read", "page.read", argv, argv[2], "Wiki Page ID");
  if (command === "search") return searchPages(argv);
  return unknownCommand("page", command, argv, "Use one of: create, read, update, search.");
}

async function routeCitation(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("citation", argv, "Use one of: add, list, validate.");

  const config = readSurrealConfig();
  if (command === "add") {
    const pageId = valueAfter(argv, "--page");
    const headingId = valueAfter(argv, "--heading");
    const key = valueAfter(argv, "--key");
    const label = valueAfter(argv, "--label") ?? key;
    const quote = valueAfter(argv, "--quote");
    if (!pageId) return missingArgument("citation add", "citation.add", argv, "--page <wiki-page-id>");
    if (!headingId) return missingArgument("citation add", "citation.add", argv, "--heading <source-heading-id>");
    if (!key) return missingArgument("citation add", "citation.add", argv, "--key <citation-key>");

    const relationTarget = `${pageId}->cites->${headingId}:${key}`;
    const relationQuery = `SELECT * FROM cites WHERE in = ${pageId} AND key = "${escapeSurrealString(key)}"`;
    const query = `RELATE ${pageId}->cites->${headingId} SET key = "${escapeSurrealString(key)}", label = "${escapeSurrealString(label ?? key)}", quote = ${quote ? `"${escapeSurrealString(quote)}"` : "NONE"}, created_at = time::now();`;
    const result = await executeSurrealQuery(
      config,
      loggedQuery("citation add", "citation.add", argv, query, {
        kind: "write",
        targetRecords: [relationTarget, pageId, headingId],
        beforeQuery: relationQuery,
        afterQuery: relationQuery,
        relateEditedTargets: [pageId],
      }),
      { queryId: `citation.add:${pageId}:${key}` },
    );
    if (!result.ok) return fromSurrealFailure("citation add", argv, result.error);
    return success({
      command: "citation add",
      operation: "citation.add",
      input: argv,
      message: `Added Citation ${key} from ${pageId} to ${headingId}.`,
      data: result.result,
    });
  }

  if (command === "list") {
    const pageId = argv[2] ?? valueAfter(argv, "--page");
    if (!pageId) return missingArgument("citation list", "citation.list", argv, "<wiki-page-id>");
    return queryCommand(
      "citation list",
      "citation.list",
      argv,
      `SELECT *, out.* AS source_heading FROM cites WHERE in = ${pageId};`,
      `Listed Citations for ${pageId}.`,
      {},
      { kind: "read", targetRecords: [pageId] },
    );
  }

  if (command === "validate") {
    const pageId = argv[2] ?? valueAfter(argv, "--page");
    if (!pageId) return missingArgument("citation validate", "citation.validate", argv, "<wiki-page-id>");
    const pageResult = await executeSurrealQuery(
      config,
      loggedQuery(
        "citation validate",
        "citation.validate",
        argv,
        `SELECT body FROM ${pageId}; SELECT key FROM cites WHERE in = ${pageId};`,
        { kind: "read", targetRecords: [pageId] },
      ),
      {
        queryId: `citation.validate:${pageId}`,
      },
    );
    if (!pageResult.ok) return fromSurrealFailure("citation validate", argv, pageResult.error);
    const statements = pageResult.result as Array<{ result?: unknown }>;
    const body = pageBodyFromStatements(statements);
    const keys = citationKeysFromStatements(statements);
    const validation = validatePageBodyCitationMarkers({ wikiPageId: pageId, pageBody: body, graphCitationKeys: keys });
    return success({
      command: "citation validate",
      operation: "citation.validate",
      input: argv,
      message:
        validation.issues.length === 0
          ? `Citation Markers match graph Citations for ${pageId}.`
          : `Citation validation found ${validation.issues.length} issue(s) for ${pageId}.`,
      data: validation,
    });
  }

  return unknownCommand("citation", command, argv, "Use one of: add, list, validate.");
}

async function routeLink(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("link", argv, "Use one of: add, list.");

  if (command === "add") {
    const from = valueAfter(argv, "--from");
    const to = valueAfter(argv, "--to");
    const reason = valueAfter(argv, "--reason");
    const label = valueAfter(argv, "--label");
    const session = valueAfter(argv, "--session");
    if (!from) return missingArgument("link add", "link.add", argv, "--from <record-id>");
    if (!to) return missingArgument("link add", "link.add", argv, "--to <record-id>");
    if (!reason) return missingArgument("link add", "link.add", argv, "--reason <reason>");

    return queryCommand(
      "link add",
      "link.add",
      argv,
      `RELATE ${from}->manual_link->${to} SET reason = "${escapeSurrealString(reason)}", label = ${label ? `"${escapeSurrealString(label)}"` : "NONE"}, created_session = ${session ?? "NONE"}, created_at = time::now();`,
      `Added Manual Link from ${from} to ${to}.`,
      {},
      {
        kind: "write",
        targetRecords: [`${from}->manual_link->${to}`, from, to],
        relateEditedTargets: [from],
        sessionId: session,
      },
    );
  }

  if (command === "list") {
    const record = valueAfter(argv, "--record") ?? argv[2];
    const where = record ? `WHERE in = ${record} OR out = ${record}` : "";
    return queryCommand(
      "link list",
      "link.list",
      argv,
      `SELECT * FROM manual_link ${where};`,
      "Listed Manual Links.",
      {},
      {
        kind: "read",
        targetRecords: record ? [record] : ["manual_link"],
      },
    );
  }

  return unknownCommand("link", command, argv, "Use one of: add, list.");
}

async function routeSession(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("session", argv, "Use one of: start, show.");
  if (command === "start") {
    const purpose = (valueAfter(argv, "--purpose") ?? argv.slice(2).join(" ")) || "Graph Wiki CLI session";
    const id = `agent_session:${randomUUID().replaceAll("-", "")}`;
    return queryCommand(
      "session start",
      "session.start",
      argv,
      `CREATE ${id} SET purpose = "${escapeSurrealString(purpose)}", created_at = time::now();`,
      `Started Agent Session ${id}.`,
      { id, purpose },
      {
        kind: "write",
        targetRecords: [id],
        afterQuery: `SELECT * FROM ${id}`,
        sessionId: id,
      },
    );
  }
  if (command === "show") return selectById("session show", "session.show", argv, argv[2], "Agent Session ID");
  return unknownCommand("session", command, argv, "Use one of: start, show.");
}

async function routeLog(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("log", argv, "Use one of: show.");
  if (command === "show") {
    const session = valueAfter(argv, "--session");
    const where = session ? `WHERE agent_session = ${session}` : "";
    return queryCommand(
      "log show",
      "log.show",
      argv,
      `SELECT * FROM change_log ${where} ORDER BY created_at ASC;`,
      "Listed Change Log entries.",
    );
  }
  return unknownCommand("log", command, argv, "Use one of: show.");
}

async function routeRetrieval(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("retrieval", argv, "Use one of: search.");
  if (command === "search") return searchPages(argv);
  return unknownCommand("retrieval", command, argv, "Use one of: search.");
}

async function routeIngest(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("ingest", argv, "Use one of: chapter.");
  if (command !== "chapter") return unknownCommand("ingest", command, argv, "Use one of: chapter.");
  const source = valueAfter(argv, "--source");
  const heading = valueAfter(argv, "--heading");
  if (!source) return missingArgument("ingest chapter", "ingest.chapter", argv, "--source <source-document-id>");
  if (!heading) return missingArgument("ingest chapter", "ingest.chapter", argv, "--heading <source-heading-id>");
  const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "100000", 10);
  const chunkId = `ingestion_chunk:${heading.replace(/^source_heading:/, "")}_${maxTokens}`;
  const title = valueAfter(argv, "--title");
  const citationKey = valueAfter(argv, "--key") ?? "source";
  const body =
    valueAfter(argv, "--body") ?? (title ? `${title} synthesis from Chapter Ingestion.[^${citationKey}]` : undefined);
  const pageId = title ? wikiPageRecordId(title) : undefined;
  const pageSlug = title ? wikiPageSlugFromTitle(title) : undefined;
  const label = valueAfter(argv, "--label") ?? citationKey;
  const quote = valueAfter(argv, "--quote");
  const linkTo = valueAfter(argv, "--link-to");
  const linkReason = valueAfter(argv, "--link-reason");
  const session = valueAfter(argv, "--session");
  const validation =
    pageId && body
      ? validatePageBodyCitationMarkers({ wikiPageId: pageId, pageBody: body, graphCitationKeys: [citationKey] })
      : undefined;
  if (validation && validation.issues.length > 0) {
    return operationFailure(
      "ingest chapter",
      "ingest.chapter",
      argv,
      `Chapter Ingestion citation validation failed for ${pageId}: ${validation.issues.map((issue) => issue.message).join(" ")}`,
      "Use a Page Body with a Citation Marker matching --key, or change --key to match the Page Body.",
    );
  }

  const pageStatements =
    title && body && pageId && pageSlug
      ? [
          `UPSERT ${pageId} SET title = "${escapeSurrealString(title)}", slug = "${pageSlug}", body = "${escapeSurrealString(body)}", updated_at = time::now();`,
          `DELETE cites WHERE in = ${pageId} AND key = "${escapeSurrealString(citationKey)}";`,
          `RELATE ${pageId}->cites->${heading} SET key = "${escapeSurrealString(citationKey)}", label = "${escapeSurrealString(label)}", quote = ${quote ? `"${escapeSurrealString(quote)}"` : "NONE"}, created_at = time::now();`,
          ...(linkTo && linkReason
            ? [
                `RELATE ${pageId}->manual_link->${linkTo} SET reason = "${escapeSurrealString(linkReason)}", label = NONE, created_session = ${session ?? "NONE"}, created_at = time::now();`,
              ]
            : []),
        ]
      : [];
  const query = [
    `LET $originium_heading = (SELECT * FROM ${heading})[0];`,
    `UPSERT ${chunkId} SET source_document = ${source}, source_heading = ${heading}, start_page = $originium_heading.start_page ?? 0, end_page = $originium_heading.end_page ?? $originium_heading.start_page ?? 0, token_estimate = ${maxTokens}, extraction_method = "chapter-ingestion", created_at = time::now();`,
    ...pageStatements,
    `SELECT * FROM ${source};`,
    `SELECT * FROM ${heading};`,
    `SELECT * FROM ${chunkId};`,
    `SELECT id, title, slug, body, updated_at, ->cites->source_heading AS cited_evidence FROM wiki_page ORDER BY updated_at DESC LIMIT 10;`,
  ].join("\n");
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery("ingest chapter", "ingest.chapter", argv, query, {
      kind: "write",
      targetRecords: [source, heading, chunkId, ...(pageId ? [pageId] : [])],
      beforeQuery: `SELECT * FROM ${chunkId}`,
      afterQuery: `SELECT * FROM ${chunkId}`,
      sessionId: session,
      relateEditedTargets: [chunkId, ...(pageId ? [pageId] : [])],
    }),
    { queryId: `ingest.chapter:${heading}` },
  );
  if (!result.ok) return fromSurrealFailure("ingest chapter", argv, result.error);
  return success({
    command: "ingest chapter",
    operation: "ingest.chapter",
    input: argv,
    message: pageId
      ? `Prepared Chapter Ingestion context for ${heading} and updated Wiki Page ${pageId}.`
      : `Prepared Chapter Ingestion context for ${heading}.`,
    data: {
      source,
      heading,
      chunkId,
      pageId,
      citationKey: pageId ? citationKey : undefined,
      citationValidation: validation,
      result: result.result,
    },
  });
}

async function routeAcceptance(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (command !== "poc") return unknownCommand("acceptance", command ?? "", argv, "Use: acceptance poc <pdf-path>.");
  const path = argv[2] ?? "fixtures/source-documents/IA-Mining-DG.pdf";
  const stages: AcceptanceStage[] = [];

  stages.push(acceptanceStage("db-status", await routeDb(["db", "status"])));
  stages.push(acceptanceStage("db-doctor", await routeDb(["db", "doctor"])));
  stages.push(acceptanceStage("schema", await routeDb(["db", "apply-schema"])));

  const importResult = await routeSource(["source", "import-pdf", path]);
  stages.push(acceptanceStage("source-import", importResult));
  const sourceId = importResult.ok ? (importResult.data as { id?: string }).id : undefined;

  const headingsResult = await routeSource([
    "source",
    "headings",
    path,
    "--source",
    sourceId ?? "source_document:fixture",
  ]);
  stages.push(acceptanceStage("heading-projection", headingsResult));
  const heading = headingsResult.ok ? firstSourceHeading(headingsResult.data) : undefined;
  const headingId = heading ? sourceHeadingRecordId(heading) : undefined;

  if (!sourceId || !heading || !headingId) {
    stages.push(
      blockedStage(
        "session-start",
        "Blocked because Source Document import or Source Heading projection did not produce IDs.",
      ),
    );
    stages.push(
      blockedStage(
        "chapter-ingestion",
        "Blocked because Source Document import or Source Heading projection did not produce IDs.",
      ),
    );
    stages.push(blockedStage("citation-validation", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("graph-retrieval", "Blocked because Chapter Ingestion did not run."));
    stages.push(blockedStage("change-log", "Blocked because no Agent Session was created."));
  } else {
    const sessionResult = await routeSession(["session", "start", "--purpose", `POC acceptance for ${path}`]);
    stages.push(acceptanceStage("session-start", sessionResult));
    const sessionId = sessionResult.ok ? (sessionResult.data as { id?: string }).id : undefined;

    if (!sessionId) {
      stages.push(blockedStage("chapter-ingestion", "Blocked because Agent Session creation did not produce an ID."));
      stages.push(blockedStage("citation-validation", "Blocked because Chapter Ingestion did not run."));
      stages.push(blockedStage("graph-retrieval", "Blocked because Chapter Ingestion did not run."));
      stages.push(blockedStage("change-log", "Blocked because no Agent Session was created."));
    } else {
      const pageTitle = "POC Mining Deployment";
      const pageId = wikiPageRecordId(pageTitle);
      stages.push(
        acceptanceStage(
          "chapter-ingestion",
          await routeIngest([
            "ingest",
            "chapter",
            "--source",
            sourceId,
            "--heading",
            headingId,
            "--title",
            pageTitle,
            "--body",
            `${heading.title} synthesized for POC acceptance.[^source]`,
            "--key",
            "source",
            "--label",
            heading.title,
            "--session",
            sessionId,
          ]),
        ),
      );
      stages.push(
        acceptanceStage(
          "citation-validation",
          await routeCitation(["citation", "validate", pageId, "--session", sessionId]),
        ),
      );
      stages.push(
        acceptanceStage(
          "graph-retrieval",
          await routeRetrieval(["retrieval", "search", heading.title, "POC", "acceptance", "--session", sessionId]),
        ),
      );
      stages.push(acceptanceStage("change-log", await routeLog(["log", "show", "--session", sessionId])));
    }
  }

  stages.push({
    name: "surrealist-inspection",
    state: "not-applicable",
    reason:
      "Not applicable to the automated CLI harness; Surrealist inspection is validated by the manual inspection beads.",
  });
  const blockingStage = stages.find((stage) => stage.state === "fail" || stage.state === "blocked");
  const data = { stages, overallState: blockingStage?.state ?? "pass" };

  if (blockingStage) {
    return operationFailure(
      "acceptance poc",
      "acceptance.poc",
      argv,
      `POC acceptance ${blockingStage.state} at stage '${blockingStage.name}': ${blockingStage.reason}`,
      "Resolve the stage failure or record the environment blocker before relying on POC acceptance proof.",
      data,
    );
  }

  return success({
    command: "acceptance poc",
    operation: "acceptance.poc",
    input: argv,
    message: "POC acceptance stages passed or were explicitly deferred/not-applicable.",
    data,
  });
}

async function writePage(argv: readonly string[], command: "create" | "update"): Promise<CliResult> {
  const title = valueAfter(argv, "--title");
  const body = valueAfter(argv, "--body") ?? "";
  if (!title) return missingArgument(`page ${command}`, `page.${command}`, argv, "--title <title>");
  const slug = wikiPageSlugFromTitle(title);
  const id = wikiPageRecordId(title);
  const query = `UPSERT ${id} SET title = "${escapeSurrealString(title)}", slug = "${slug}", body = "${escapeSurrealString(body)}", updated_at = time::now();`;
  return queryCommand(
    `page ${command}`,
    `page.${command}`,
    argv,
    query,
    `${command === "create" ? "Created" : "Updated"} Wiki Page ${id}.`,
    { id, slug },
    {
      kind: "write",
      targetRecords: [id],
      beforeQuery: `SELECT * FROM ${id}`,
      afterQuery: `SELECT * FROM ${id}`,
      relateEditedTargets: [id],
    },
  );
}

async function searchPages(argv: readonly string[]): Promise<CliResult> {
  const queryText = positionalArgs(argv, 2).join(" ").trim();
  const command = argv[0] === "retrieval" ? "retrieval search" : "page search";
  const operation = argv[0] === "retrieval" ? "retrieval.search" : "page.search";
  if (!queryText) return missingArgument(command, operation, argv, "<query>");

  const queryEmbedding = await fetchOllamaEmbedding(queryText, command, operation, argv);
  if (!queryEmbedding.ok) return queryEmbedding.failure;

  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      command,
      operation,
      argv,
      "SELECT id, title, slug, body, ->cites->source_heading AS cited_evidence FROM wiki_page; SELECT id, title, heading_path, start_page, end_page FROM source_heading;",
      { kind: "read", targetRecords: [`${operation}:${queryText}`] },
    ),
    { queryId: `${operation}:${queryText}` },
  );

  if (!result.ok) return fromSurrealFailure(command, argv, result.error);

  const candidates = retrievalCandidatesFromStatements(result.result as Array<{ result?: unknown }>);
  let ranked: readonly RankedRetrievalCandidate[];
  try {
    ranked = await rankRetrievalCandidates(candidates, queryText, queryEmbedding.embedding);
  } catch (error) {
    return operationFailure(
      command,
      operation,
      argv,
      errorReason(error),
      `Start Ollama and pull the embedding model with: ollama pull ${queryEmbedding.config.model}`,
    );
  }

  return success({
    command,
    operation,
    input: argv,
    message: `Graph Retrieval ranked ${ranked.length} candidate(s) for '${queryText}' using ${queryEmbedding.config.model}.`,
    data: {
      query: queryText,
      embedding: queryEmbedding.config,
      results: ranked.slice(0, 10),
      result: result.result,
    },
  });
}

async function queryCommand(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  message: string,
  data: Record<string, unknown> = {},
  logOptions?: QueryLogOptions,
): Promise<CliResult> {
  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(command, operation, argv, query, logOptions),
    {
      queryId: `${operation}:${argv.join(" ")}`,
    },
  );
  if (!result.ok) return fromSurrealFailure(command, argv, result.error);
  return success({ command, operation, input: argv, message, data: { ...data, result: result.result } });
}

async function selectById(
  command: string,
  operation: string,
  argv: readonly string[],
  id: string | undefined,
  label: string,
): Promise<CliResult> {
  if (!id) return missingArgument(command, operation, argv, `<${label}>`);
  return queryCommand(
    command,
    operation,
    argv,
    `SELECT * FROM ${id};`,
    `Read ${label} ${id}.`,
    {},
    {
      kind: "read",
      targetRecords: [id],
    },
  );
}

function loggedQuery(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  options: QueryLogOptions | undefined,
): string {
  if (!options) return query;

  const sessionId = options.sessionId ?? valueAfter(argv, "--session");
  const targetRecords = options.targetRecords.length === 0 ? ["<unspecified>"] : options.targetRecords;
  const logId = `change_log:${randomUUID().replaceAll("-", "")}`;
  const beforeStatement = options.beforeQuery
    ? `LET $originium_before = (${options.beforeQuery})[0];`
    : "LET $originium_before = NONE;";
  const afterStatement = options.afterQuery
    ? `LET $originium_after = (${options.afterQuery})[0];`
    : "LET $originium_after = NONE;";
  const editedRelations =
    options.kind === "write" && sessionId
      ? (options.relateEditedTargets ?? targetRecords)
          .map((target) => `RELATE ${target}->edited_in->${sessionId} SET created_at = time::now();`)
          .join("\n")
      : "";

  return [
    beforeStatement,
    query,
    afterStatement,
    `CREATE ${logId} SET agent_session = ${sessionId ?? "NONE"}, command = "${escapeSurrealString(command)}", operation = "${escapeSurrealString(operation)}", target = "${escapeSurrealString(targetRecords.join(", "))}", target_records = ${surrealArray(targetRecords)}, summary = "${escapeSurrealString(`${options.kind} ${command}`)}", before = $originium_before, after = $originium_after, created_at = time::now();`,
    editedRelations,
  ]
    .filter(Boolean)
    .join("\n");
}

function pageBodyFromStatements(statements: readonly { readonly result?: unknown }[]): string {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const row = statement.result.find((candidate) => {
      return candidate && typeof candidate === "object" && "body" in candidate;
    }) as { body?: unknown } | undefined;
    if (typeof row?.body === "string") return row.body;
  }

  return "";
}

function citationKeysFromStatements(statements: readonly { readonly result?: unknown }[]): readonly string[] {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const keys = statement.result.flatMap((row) => {
      if (!row || typeof row !== "object" || !("key" in row)) return [];
      const key = (row as { key?: unknown }).key;
      return typeof key === "string" ? [key] : [];
    });
    if (keys.length > 0) return keys;
  }

  return [];
}

async function fetchOllamaEmbedding(
  text: string,
  command: string,
  operation: string,
  argv: readonly string[],
): Promise<
  | { readonly ok: true; readonly embedding: readonly number[]; readonly config: OllamaEmbeddingConfig }
  | { readonly ok: false; readonly failure: CliFailure }
> {
  const config = readOllamaEmbeddingConfig();
  const endpoint = new URL("/api/embeddings", config.url).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, prompt: text }),
    });

    if (!response.ok) {
      return {
        ok: false,
        failure: operationFailure(
          command,
          operation,
          argv,
          `Ollama embedding request failed for model '${config.model}' at ${endpoint}: ${response.status} ${response.statusText} ${await response.text()}`.trim(),
          `Start Ollama and pull the embedding model with: ollama pull ${config.model}`,
        ),
      };
    }

    const body = (await response.json()) as { embedding?: unknown; embeddings?: unknown };
    const embedding = parseOllamaEmbedding(body);
    if (!embedding) {
      return {
        ok: false,
        failure: operationFailure(
          command,
          operation,
          argv,
          `Ollama embedding response for model '${config.model}' at ${endpoint} did not include a numeric embedding vector.`,
          "Inspect the Ollama response shape or configure ORIGINIUM_OLLAMA_EMBED_MODEL to a local embedding model.",
        ),
      };
    }

    return { ok: true, embedding, config };
  } catch (error) {
    return {
      ok: false,
      failure: operationFailure(
        command,
        operation,
        argv,
        `Ollama embedding request failed for model '${config.model}' at ${endpoint}: ${errorReason(error)}`,
        `Start Ollama and pull the embedding model with: ollama pull ${config.model}`,
      ),
    };
  }
}

function readOllamaEmbeddingConfig(env: NodeJS.ProcessEnv = process.env): OllamaEmbeddingConfig {
  return {
    url: env.ORIGINIUM_OLLAMA_URL ?? "http://127.0.0.1:11434",
    model: env.ORIGINIUM_OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  };
}

function parseOllamaEmbedding(body: {
  readonly embedding?: unknown;
  readonly embeddings?: unknown;
}): readonly number[] | undefined {
  if (isNumberVector(body.embedding)) return body.embedding;
  if (Array.isArray(body.embeddings) && isNumberVector(body.embeddings[0])) return body.embeddings[0];
  return undefined;
}

function isNumberVector(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "number");
}

function retrievalCandidatesFromStatements(
  statements: readonly { readonly result?: unknown }[],
): readonly RetrievalCandidate[] {
  const candidates: RetrievalCandidate[] = [];
  const rows = statements.flatMap((statement) => (Array.isArray(statement.result) ? statement.result : []));
  const sourceHeadingsById = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    if (id && Array.isArray(record.heading_path)) sourceHeadingsById.set(id, sourceHeadingEvidence(record));
  }

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const title = typeof record.title === "string" ? record.title : "";
    if (!id || !title) continue;

    if (typeof record.body === "string") {
      candidates.push({
        kind: "wiki_page",
        id,
        title,
        text: `${title}\n${record.body}`,
        citedEvidence: citationEvidence(record.cited_evidence, sourceHeadingsById),
        metadata: { slug: record.slug },
      });
      continue;
    }

    if (Array.isArray(record.heading_path)) {
      candidates.push({
        kind: "source_heading",
        id,
        title,
        text: `${title}\n${record.heading_path.join(" ")}`,
        citedEvidence: [],
        metadata: {
          headingPath: record.heading_path,
          startPage: record.start_page,
          endPage: record.end_page,
        },
      });
    }
  }

  return candidates;
}

async function rankRetrievalCandidates(
  candidates: readonly RetrievalCandidate[],
  queryText: string,
  queryEmbedding: readonly number[],
): Promise<readonly RankedRetrievalCandidate[]> {
  const ranked: RankedRetrievalCandidate[] = [];

  for (const candidate of candidates) {
    const candidateEmbedding = await fetchOllamaEmbedding(candidate.text, "retrieval rank", "retrieval.rank", [
      "retrieval",
      "rank",
      candidate.id,
    ]);
    if (!candidateEmbedding.ok) throw new Error(candidateEmbedding.failure.error.reason);

    const lexical = lexicalScore(queryText, candidate.text);
    const vector = cosineSimilarity(queryEmbedding, candidateEmbedding.embedding);
    const graphAuthority =
      (candidate.kind === "wiki_page" ? 0.35 : -0.1) + Math.min(candidate.citedEvidence.length, 3) * 0.15;
    const score = vector * 0.55 + lexical * 0.3 + graphAuthority;

    ranked.push({
      kind: candidate.kind,
      id: candidate.id,
      title: candidate.title,
      score: Number(score.toFixed(6)),
      signals: {
        lexical: Number(lexical.toFixed(6)),
        vector: Number(vector.toFixed(6)),
        graphAuthority: Number(graphAuthority.toFixed(6)),
      },
      citedEvidence: candidate.citedEvidence,
      metadata: candidate.metadata,
    });
  }

  return ranked.sort((left, right) => right.score - left.score);
}

function citationEvidence(
  value: unknown,
  sourceHeadingsById: ReadonlyMap<string, Record<string, unknown>>,
): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry): Record<string, unknown>[] => {
    if (typeof entry === "string") return [sourceHeadingsById.get(entry) ?? { id: entry }];
    return entry && typeof entry === "object" ? [entry as Record<string, unknown>] : [];
  });
}

function sourceHeadingEvidence(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: record.id,
    title: record.title,
    headingPath: record.heading_path,
    startPage: record.start_page,
    endPage: record.end_page,
  };
}

function lexicalScore(queryText: string, candidateText: string): number {
  const queryTokens = tokenSet(queryText);
  if (queryTokens.size === 0) return 0;
  const candidateTokens = tokenSet(candidateText);
  const matches = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  return matches / queryTokens.size;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 1),
  );
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }

  return leftMagnitude === 0 || rightMagnitude === 0 ? 0 : dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function startDb(argv: readonly string[], config: SurrealConfig): CliResult {
  const existingPid = readPid(config);
  if (existingPid && isProcessRunning(existingPid)) {
    return success({
      command: "db start",
      operation: "db.start",
      input: argv,
      message: `Managed SurrealDB process is already running with PID ${existingPid}.`,
      data: { pid: existingPid, pidFile: config.pidFile },
    });
  }

  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.bucketDir, { recursive: true });
  mkdirSync(config.pidFile.slice(0, config.pidFile.lastIndexOf("/")), { recursive: true });
  const command = localSurrealStartCommand(config);
  const child = spawn(command.command, command.args, {
    detached: true,
    env: { ...process.env, ...command.env },
    stdio: "ignore",
  });
  child.unref();
  writeFileSync(config.pidFile, String(child.pid));

  return success({
    command: "db start",
    operation: "db.start",
    input: argv,
    message: `Started managed SurrealDB process PID ${child.pid} at ${config.url}.`,
    data: { pid: child.pid, pidFile: config.pidFile, bucketDir: config.bucketDir },
  });
}

function stopDb(argv: readonly string[], config: SurrealConfig): CliResult {
  const pid = readPid(config);
  if (!pid) {
    return operationFailure(
      "db stop",
      "db.stop",
      argv,
      `No managed pid file found at ${config.pidFile}.`,
      "Run db status to inspect the configured external target.",
    );
  }
  if (isProcessRunning(pid)) process.kill(pid, "SIGINT");
  unlinkSync(config.pidFile);
  return success({
    command: "db stop",
    operation: "db.stop",
    input: argv,
    message: `Stopped managed SurrealDB process PID ${pid}.`,
    data: { pid, pidFile: config.pidFile },
  });
}

function readPid(config: SurrealConfig): number | undefined {
  if (!existsSync(config.pidFile)) return undefined;
  const pid = Number.parseInt(readFileSync(config.pidFile, "utf8"), 10);
  return Number.isFinite(pid) ? pid : undefined;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function success(input: Omit<CliSuccess, "ok">): CliSuccess {
  return { ok: true, ...input };
}

function fromSurrealFailure(
  command: string,
  _argv: readonly string[],
  error: {
    readonly operation: string;
    readonly input: { readonly queryId: string };
    readonly reason: string;
    readonly action: string;
  },
): CliFailure {
  return {
    ok: false,
    command,
    error: {
      kind: "operation_failure",
      operation: error.operation,
      input: error.input.queryId,
      reason: error.reason,
      action: error.action,
    },
  };
}

function usageFailure(input: {
  readonly command: string;
  readonly operation: string;
  readonly input: string;
  readonly reason: string;
  readonly action: string;
}): CliFailure {
  return {
    ok: false,
    command: input.command,
    error: {
      kind: "usage_error",
      operation: input.operation,
      input: input.input,
      reason: input.reason,
      action: input.action,
    },
  };
}

function operationFailure(
  command: string,
  operation: string,
  argv: readonly string[],
  reason: string,
  action: string,
  data?: unknown,
): CliFailure {
  return {
    ok: false,
    command,
    ...(data === undefined ? {} : { data }),
    error: {
      kind: "operation_failure",
      operation,
      input: argv.join(" "),
      reason,
      action,
    },
  };
}

function acceptanceStage(name: string, result: CliResult): AcceptanceStage {
  if (result.ok) {
    return {
      name,
      state: "pass",
      reason: result.message,
      result,
    };
  }

  return {
    name,
    state: isEnvironmentBlocked(result.error.reason) ? "blocked" : "fail",
    reason: result.error.reason,
    result,
  };
}

function blockedStage(name: string, reason: string): AcceptanceStage {
  return {
    name,
    state: "blocked",
    reason,
  };
}

function firstSourceHeading(data: unknown): SourceHeadingDraft | undefined {
  const headings = (data as { headings?: unknown }).headings;
  if (!Array.isArray(headings)) return undefined;
  const heading = headings[0] as Partial<SourceHeadingDraft> | undefined;
  if (
    !heading ||
    typeof heading.sourceDocumentId !== "string" ||
    typeof heading.title !== "string" ||
    !Array.isArray(heading.headingPath) ||
    typeof heading.level !== "number" ||
    typeof heading.startPage !== "number" ||
    typeof heading.order !== "number" ||
    typeof heading.extractionMethod !== "string"
  ) {
    return undefined;
  }

  return {
    sourceDocumentId: heading.sourceDocumentId,
    title: heading.title,
    headingPath: heading.headingPath.filter((entry): entry is string => typeof entry === "string"),
    level: heading.level,
    startPage: heading.startPage,
    endPage: typeof heading.endPage === "number" ? heading.endPage : undefined,
    order: heading.order,
    extractionMethod: heading.extractionMethod as SourceHeadingDraft["extractionMethod"],
  };
}

function isEnvironmentBlocked(reason: string): boolean {
  return /ECONNREFUSED|fetch failed|connection refused|not found|No such file|could not connect|unreachable|Unable to connect/i.test(
    reason,
  );
}

function missingGroupCommand(group: string, argv: readonly string[], action: string): CliFailure {
  return usageFailure({
    command: group,
    operation: `${group}.route`,
    input: argv.join(" "),
    reason: `Missing ${group} command.`,
    action,
  });
}

function missingArgument(command: string, operation: string, argv: readonly string[], argument: string): CliFailure {
  return usageFailure({
    command,
    operation,
    input: argv.join(" "),
    reason: `Missing required argument ${argument}.`,
    action: `Provide ${argument} and retry.`,
  });
}

function unknownCommand(group: string, command: string, argv: readonly string[], action: string): CliFailure {
  return usageFailure({
    command: command ? `${group} ${command}` : group,
    operation: `${group}.route`,
    input: argv.join(" "),
    reason: command ? `Unknown ${group} command '${command}'.` : `Missing ${group} command.`,
    action,
  });
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function positionalArgs(argv: readonly string[], startIndex: number): readonly string[] {
  const values: string[] = [];
  for (let index = startIndex; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      index += 1;
      continue;
    }
    values.push(value);
  }
  return values;
}

function escapeSurrealString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function surrealArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeSurrealString(value)}"`).join(", ")}]`;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const result = await runCli();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
