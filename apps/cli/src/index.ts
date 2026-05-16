import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type SourceHeadingDraft,
  sourceDocumentRecordId,
  sourceHeadingRecordId,
  toSlug,
  validatePageBodyCitationMarkers,
  wikiPageRecordId,
  wikiPageSlugFromTitle,
} from "@originium/domain";
import {
  createPdfSourceDocumentDraftFromFile,
  extractPdfHeadings,
  nearestHeadingForPage,
  projectPdfChunk,
  projectPdfText,
  type SourceHeadingProjection,
  searchPdfText,
} from "@originium/pdf-ingest";
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

const agentActivitySources = ["codex_app_server", "cli", "web"] as const;
const agentActivityKinds = ["message", "command", "tool", "file_change", "graph_mutation", "status", "error"] as const;
const agentActivityStatuses = ["started", "streaming", "completed", "failed"] as const;

export type AgentActivitySource = (typeof agentActivitySources)[number];
export type AgentActivityKind = (typeof agentActivityKinds)[number];
export type AgentActivityStatus = (typeof agentActivityStatuses)[number];

export type AgentActivityDraft = {
  readonly sessionId: string;
  readonly createSession: boolean;
  readonly source: AgentActivitySource;
  readonly kind: AgentActivityKind;
  readonly status: AgentActivityStatus;
  readonly summary: string;
  readonly operation?: string;
  readonly targetRecords: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly id?: string;
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
  activity: routeActivity,
  citation: routeCitation,
  db: routeDb,
  ingest: routeIngest,
  link: routeLink,
  log: routeLog,
  page: routePage,
  graph: routeGraph,
  retrieval: routeRetrieval,
  session: routeSession,
  source: routeSource,
  workflow: routeWorkflow,
};

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<CliResult> {
  const routedArgv = withoutOutputFlags(argv);
  const [group] = routedArgv;

  if (!group) {
    return usageFailure({
      command: "",
      operation: "cli.route",
      input: routedArgv.join(" "),
      reason: "Missing command group.",
      action: `Choose one of: ${Object.keys(routeGroups).join(", ")}.`,
    });
  }

  const handler = routeGroups[group];
  if (!handler) {
    return usageFailure({
      command: group,
      operation: "cli.route",
      input: routedArgv.join(" "),
      reason: `Unknown command group '${group}'.`,
      action: `Choose one of: ${Object.keys(routeGroups).join(", ")}.`,
    });
  }

  return handler(routedArgv);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<string> {
  const result = await runCli(argv);
  return wantsJson(argv) ? JSON.stringify(result, null, 2) : renderCliResult(result);
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
      action: "Use one of: import-pdf, headings, chunk, read, search, find, anchor.",
    });
  }

  if (command === "anchor") return routeSourceAnchor(argv);

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
    const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);
    try {
      const headings = extractPdfHeadings(path, sourceId);
      const values = headings.map((heading) => {
        const draft = sourceHeadingDraftFromProjection(heading, sourceId);
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
        data: {
          sourceId,
          headingIdContract: "Use headings[].id as the persisted Source Heading ID for citation and link commands.",
          headings: headings.map((heading) => cliSourceHeading(heading, sourceId)),
        },
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
    const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);
    const maxTokens = Number.parseInt(valueAfter(argv, "--max-tokens") ?? "100000", 10);
    const heading = findSourceHeading(extractPdfHeadings(path, sourceId), sourceId, headingId);
    if (!heading) {
      return operationFailure(
        "source chunk",
        "source.chunk",
        argv,
        `No Source Heading matched '${headingId}'.`,
        `Run originium source headings ${path} --source ${sourceId} and pass data.headings[].id.`,
      );
    }
    const persistedHeadingId = persistedSourceHeadingId(heading, sourceId);
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
      data: {
        id: chunkId,
        persistedSourceHeadingId: persistedHeadingId,
        citationTarget: persistedHeadingId,
        extractionHeadingId: chunk.headingId,
        projectionHeadingId: chunk.headingId,
        sourceDocumentId: chunk.sourceDocumentId,
        pageRange: chunk.pageRange,
        tokenEstimate: chunk.tokenEstimate,
        extractionMethod: chunk.extractionMethod,
        text: chunk.text,
        result: result.result,
      },
    });
  }

  if (command === "read") return readSourceText(argv);
  if (command === "search" || command === "find") return searchSourceText(argv, command);

  return unknownCommand(
    "source",
    command,
    argv,
    "Use one of: import-pdf, headings, chunk, read, search, find, anchor.",
  );
}

async function routeSourceAnchor(argv: readonly string[]): Promise<CliResult> {
  const [, , command] = argv;
  if (!command) return missingGroupCommand("source anchor", argv, "Use one of: create, read, search.");

  if (command === "create") {
    const title = valueAfter(argv, "--title");
    const source = valueAfter(argv, "--source");
    const heading = valueAfter(argv, "--heading");
    const reason = valueAfter(argv, "--reason");
    const locationHint = valueAfter(argv, "--location");
    const pageRange = parsePageRangeArgument(argv);
    if (pageRange && "ok" in pageRange) return pageRange;
    const startPage = pageRange?.start;
    const endPage = pageRange?.end;
    const session = valueAfter(argv, "--session");
    if (!title) return missingArgument("source anchor create", "source.anchor.create", argv, "--title <title>");
    if (!source)
      return missingArgument("source anchor create", "source.anchor.create", argv, "--source <source-document-id>");
    if (!heading)
      return missingArgument("source anchor create", "source.anchor.create", argv, "--heading <source-heading-id>");
    if (!reason) return missingArgument("source anchor create", "source.anchor.create", argv, "--reason <reason>");

    const anchorId = sourceAnchorRecordId(source, heading, title);
    const query = `UPSERT ${anchorId} SET title = "${escapeSurrealString(title)}", source_document = ${source}, source_heading = ${heading}, start_page = ${startPage ?? "NONE"}, end_page = ${endPage ?? "NONE"}, location_hint = ${locationHint ? `"${escapeSurrealString(locationHint)}"` : "NONE"}, reason = "${escapeSurrealString(reason)}", created_session = ${session ?? "NONE"}, updated_at = time::now(); SELECT * FROM ${anchorId} FETCH source_heading;`;

    return queryCommand(
      "source anchor create",
      "source.anchor.create",
      argv,
      query,
      `Created Source Anchor ${anchorId} under ${heading}.`,
      { id: anchorId },
      {
        kind: "write",
        targetRecords: [anchorId, source, heading],
        beforeQuery: `SELECT * FROM ${anchorId}`,
        afterQuery: `SELECT * FROM ${anchorId}`,
        sessionId: session,
        relateEditedTargets: [anchorId],
      },
    );
  }

  if (command === "read") {
    const id = argv[3] ?? valueAfter(argv, "--anchor");
    if (!id) return missingArgument("source anchor read", "source.anchor.read", argv, "<source-anchor-id>");
    return queryCommand(
      "source anchor read",
      "source.anchor.read",
      argv,
      `SELECT * FROM ${id} FETCH source_heading;`,
      `Read Source Anchor ${id}.`,
      {},
      { kind: "read", targetRecords: [id] },
    );
  }

  if (command === "search") {
    const queryText = positionalArgs(argv, 3).join(" ").trim();
    if (!queryText) return missingArgument("source anchor search", "source.anchor.search", argv, "<query>");
    return queryCommand(
      "source anchor search",
      "source.anchor.search",
      argv,
      `SELECT * FROM source_anchor WHERE title CONTAINS "${escapeSurrealString(queryText)}" OR reason CONTAINS "${escapeSurrealString(queryText)}" OR location_hint CONTAINS "${escapeSurrealString(queryText)}" ORDER BY updated_at DESC FETCH source_heading;`,
      `Searched Source Anchors for '${queryText}'.`,
      { query: queryText },
      { kind: "read", targetRecords: [`source_anchor:${queryText}`] },
    );
  }

  return unknownCommand("source anchor", command, argv, "Use one of: create, read, search.");
}

function readSourceText(argv: readonly string[]): CliResult {
  const path = argv[2];
  if (!path) return missingArgument("source read", "source.read", argv, "<pdf-path>");
  const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);

  try {
    const headings = extractPdfHeadings(path, sourceId);
    const selector = valueAfter(argv, "--heading") ?? valueAfter(argv, "--anchor");
    const pageRange = selector
      ? pageRangeForHeading(path, sourceId, headings, selector, argv)
      : parsePageRangeArgument(argv);
    if (!pageRange) {
      return missingArgument(
        "source read",
        "source.read",
        argv,
        "--pages <start-end> or --heading <source-heading-id>",
      );
    }
    if ("ok" in pageRange) return pageRange;

    const projection = projectPdfText(path, {
      sourceDocumentId: sourceId,
      pageRange,
      maxTokens: Number.parseInt(valueAfter(argv, "--max-tokens") ?? "4000", 10),
    });
    const nearestHeading = nearestHeadingForPage(headings, projection.pageRange.start);

    return success({
      command: "source read",
      operation: "source.read",
      input: argv,
      message: `Read lossy Source Text projection for ${sourceId} pages ${projection.pageRange.start}-${projection.pageRange.end}.`,
      data: {
        ...projection,
        sourceDocument: sourceId,
        nearestHeading: nearestHeading ? cliSourceHeading(nearestHeading, sourceId) : undefined,
      },
    });
  } catch (error) {
    return operationFailure(
      "source read",
      "source.read",
      argv,
      errorReason(error),
      "Verify the PDF path and page range, or run originium source headings <pdf-path> --source <source-document-id> to recover a valid heading ID.",
    );
  }
}

function searchSourceText(argv: readonly string[], command: "search" | "find"): CliResult {
  const path = argv[2];
  const query = argv[3] ?? valueAfter(argv, "--query");
  if (!path) return missingArgument(`source ${command}`, `source.${command}`, argv, "<pdf-path>");
  if (!query) return missingArgument(`source ${command}`, `source.${command}`, argv, "<query>");
  const sourceId = valueAfter(argv, "--source") ?? defaultSourceDocumentId(path);

  try {
    const pageRange = parsePageRangeArgument(argv);
    if (pageRange && "ok" in pageRange) return pageRange;
    const headings = extractPdfHeadings(path, sourceId);
    const hits = searchPdfText(path, headings, query, {
      sourceDocumentId: sourceId,
      pageRange,
      limit: Number.parseInt(valueAfter(argv, "--limit") ?? "10", 10),
    }).map((hit) => ({
      sourceDocument: hit.sourceDocumentId,
      pageRange: hit.pageRange,
      snippet: hit.snippet,
      nearestHeading: hit.nearestHeading ? cliSourceHeading(hit.nearestHeading, sourceId) : undefined,
      provenance: hit.provenance,
      warning: hit.warning,
    }));

    return success({
      command: `source ${command}`,
      operation: `source.${command}`,
      input: argv,
      message: `Found ${hits.length} lossy Source Text projection match(es) for '${query}' in ${sourceId}.`,
      data: { sourceDocument: sourceId, query, hits },
    });
  } catch (error) {
    return operationFailure(
      `source ${command}`,
      `source.${command}`,
      argv,
      errorReason(error),
      "Verify the PDF path and query, or narrow the search with --pages <start-end>.",
    );
  }
}

async function routePage(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command)
    return missingGroupCommand("page", argv, "Use one of: create, read, update, replace, patch, append, search.");
  if (command === "create" || command === "update") return writePage(argv, command);
  if (command === "replace" || command === "patch" || command === "append") return editPage(argv, command);
  if (command === "read") return selectById("page read", "page.read", argv, argv[2], "Wiki Page ID");
  if (command === "search") return searchPages(argv);
  return unknownCommand("page", command, argv, "Use one of: create, read, update, replace, patch, append, search.");
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
    if (!result.ok) {
      const failure = fromSurrealFailure("citation add", argv, result.error);
      return {
        ...failure,
        error: {
          ...failure.error,
          action: `Verify '${headingId}' is a persisted Source Heading ID. To recover one, run originium source headings <pdf-path> --source <source-document-id>; to search text first, run originium source search <pdf-path> "<query>" --source <source-document-id>.`,
        },
      };
    }
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
  if (!command) return missingGroupCommand("session", argv, "Use one of: start, show, current, end.");
  if (command === "start") {
    const purpose = (valueAfter(argv, "--purpose") ?? argv.slice(2).join(" ")) || "Graph Wiki CLI session";
    const id = `agent_session:${randomUUID().replaceAll("-", "")}`;
    const result = await queryCommand(
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
    if (result.ok) writeCurrentSession(id);
    return result;
  }
  if (command === "show") return selectById("session show", "session.show", argv, argv[2], "Agent Session ID");
  if (command === "current") {
    const sessionId = resolveSessionId(argv, { createImplicit: false });
    return success({
      command: "session current",
      operation: "session.current",
      input: argv,
      message: sessionId ? `Current Agent Session: ${sessionId}.` : "No current Agent Session is set.",
      data: {
        id: sessionId,
        source: sessionSource(argv),
        currentSessionFile: currentSessionFile(),
      },
    });
  }
  if (command === "end" || command === "clear") {
    const prior = readCurrentSession();
    clearCurrentSession();
    return success({
      command: `session ${command}`,
      operation: "session.end",
      input: argv,
      message: prior ? `Cleared current Agent Session ${prior}.` : "No current Agent Session was set.",
      data: { cleared: prior, currentSessionFile: currentSessionFile() },
    });
  }
  return unknownCommand("session", command, argv, "Use one of: start, show, current, end.");
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

async function routeActivity(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("activity", argv, "Use one of: record, list, show.");

  if (command === "record") {
    const draft = agentActivityDraftFromArgv(argv);
    if ("ok" in draft) return draft;

    const result = await executeSurrealQuery(readSurrealConfig(), buildAgentActivityRecordQuery(draft), {
      queryId: `activity.record:${draft.sessionId}:${draft.kind}`,
    });
    if (!result.ok) return fromSurrealFailure("activity record", argv, result.error);

    return success({
      command: "activity record",
      operation: "activity.record",
      input: argv,
      message: `Recorded Agent Activity ${draft.id}.`,
      data: {
        id: draft.id,
        sessionId: draft.sessionId,
        source: draft.source,
        kind: draft.kind,
        status: draft.status,
        result: result.result,
      },
    });
  }

  if (command === "list") {
    const sessionId = valueAfter(argv, "--session") ?? resolveSessionId(argv, { createImplicit: false });
    const query = buildAgentActivityListQuery(sessionId);
    return queryCommand(
      "activity list",
      "activity.list",
      argv,
      query,
      sessionId ? `Listed Agent Activity records for ${sessionId}.` : "Listed Agent Activity records.",
      { sessionId },
      {
        kind: "read",
        targetRecords: sessionId ? [sessionId] : ["agent_activity"],
      },
    );
  }

  if (command === "show") {
    return selectById("activity show", "activity.show", argv, argv[2], "Agent Activity ID");
  }

  return unknownCommand("activity", command, argv, "Use one of: record, list, show.");
}

async function routeGraph(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("graph", argv, "Use one of: lint.");
  if (command !== "lint") return unknownCommand("graph", command, argv, "Use one of: lint.");

  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      "graph lint",
      "graph.lint",
      argv,
      [
        "SELECT id, title, slug, body FROM wiki_page;",
        "SELECT id, in, out, key, label, quote FROM cites;",
        "SELECT id, title, source_document, source_heading, start_page, end_page, location_hint, reason FROM source_anchor;",
        "SELECT id, title, heading_path, start_page, end_page FROM source_heading;",
        "SELECT id, in, out, reason, label FROM manual_link;",
      ].join("\n"),
      { kind: "read", targetRecords: ["wiki_page", "cites", "source_anchor", "source_heading", "manual_link"] },
    ),
    { queryId: "graph.lint" },
  );
  if (!result.ok) return fromSurrealFailure("graph lint", argv, result.error);

  const lint = lintGraphWikiStatements(result.result as Array<{ result?: unknown }>);
  return success({
    command: "graph lint",
    operation: "graph.lint",
    input: argv,
    message:
      lint.issueCount === 0
        ? "Graph Wiki lint found no hygiene issues."
        : `Graph Wiki lint found ${lint.issueCount} hygiene issue(s).`,
    data: lint,
  });
}

async function routeRetrieval(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("retrieval", argv, "Use one of: search.");
  if (command === "search") return searchPages(argv);
  return unknownCommand("retrieval", command, argv, "Use one of: search.");
}

async function routeWorkflow(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (!command) return missingGroupCommand("workflow", argv, "Use one of: answer-context, page-upsert.");

  if (command === "answer-context") {
    const query = positionalArgs(argv, 2).join(" ").trim();
    if (!query) return missingArgument("workflow answer-context", "workflow.answer-context", argv, "<query>");
    const retrieval = await searchPages(["retrieval", "search", query, ...sessionArgsForChild(argv)]);
    if (!retrieval.ok) return retrieval;
    return success({
      command: "workflow answer-context",
      operation: "workflow.answer-context",
      input: argv,
      message: `Prepared answer context for '${query}'.`,
      data: {
        query,
        retrieval: retrieval.data,
      },
    });
  }

  if (command === "page-upsert") {
    const title = valueAfter(argv, "--title");
    const body = valueAfter(argv, "--body") ?? "";
    const heading = valueAfter(argv, "--heading");
    const key = valueAfter(argv, "--key") ?? "source";
    const label = valueAfter(argv, "--label") ?? key;
    if (!title) return missingArgument("workflow page-upsert", "workflow.page-upsert", argv, "--title <title>");
    if (!heading)
      return missingArgument("workflow page-upsert", "workflow.page-upsert", argv, "--heading <source-heading-id>");
    const page = await writePage(
      ["page", "update", "--title", title, "--body", body, ...sessionArgsForChild(argv)],
      "update",
    );
    if (!page.ok) return page;
    const pageId = (page.data as { id?: string }).id;
    if (!pageId) {
      return operationFailure(
        "workflow page-upsert",
        "workflow.page-upsert",
        argv,
        `Page upsert for title '${title}' did not return a Wiki Page ID.`,
        "Run page update directly and inspect the result.",
      );
    }
    const citation = await routeCitation([
      "citation",
      "add",
      "--page",
      pageId,
      "--heading",
      heading,
      "--key",
      key,
      "--label",
      label,
      ...sessionArgsForChild(argv),
    ]);
    if (!citation.ok) return citation;
    return success({
      command: "workflow page-upsert",
      operation: "workflow.page-upsert",
      input: argv,
      message: `Upserted Wiki Page ${pageId} and Citation ${key}.`,
      data: { page: page.data, citation: citation.data },
    });
  }

  return unknownCommand("workflow", command, argv, "Use one of: answer-context, page-upsert.");
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

async function editPage(argv: readonly string[], command: "replace" | "patch" | "append"): Promise<CliResult> {
  const pageId =
    valueAfter(argv, "--page") ??
    (valueAfter(argv, "--title") ? wikiPageRecordId(valueAfter(argv, "--title") ?? "") : argv[2]);
  if (!pageId) return missingArgument(`page ${command}`, `page.${command}`, argv, "--page <wiki-page-id>");

  const pageResult = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      `page ${command}`,
      `page.${command}`,
      argv,
      `SELECT title, slug, body FROM ${pageId}; SELECT key FROM cites WHERE in = ${pageId};`,
      { kind: "read", targetRecords: [pageId] },
    ),
    { queryId: `page.${command}:${pageId}:read` },
  );
  if (!pageResult.ok) return fromSurrealFailure(`page ${command}`, argv, pageResult.error);

  const statements = pageResult.result as Array<{ result?: unknown }>;
  const currentBody = pageBodyFromStatements(statements);
  const pageExists = pageRecordFromStatements(statements) !== undefined;
  if (!pageExists) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Wiki Page ${pageId} does not exist; SELECT returned no page record.`,
      "Create the Wiki Page first, or pass the exact --page record ID returned by page search/read.",
    );
  }

  const graphCitationKeys = citationKeysFromStatements(statements);
  let edit: PageEditPreviewResult;
  try {
    edit =
      command === "replace"
        ? previewPageReplace(pageId, currentBody, graphCitationKeys, {
            find: valueAfter(argv, "--find"),
            replace: valueAfter(argv, "--replace") ?? "",
          })
        : command === "patch"
          ? previewPagePatch(pageId, currentBody, graphCitationKeys, readBodyInput(argv, "--body", "--body-file"))
          : previewPageAppend(
              pageId,
              currentBody,
              graphCitationKeys,
              readBodyInput(argv, "--body", "--body-file", "--append-file"),
            );
  } catch (error) {
    return operationFailure(
      `page ${command}`,
      `page.${command}`,
      argv,
      `Could not read Wiki Page edit input for ${pageId}: ${errorReason(error)}`,
      "Pass inline --body text or a readable body file path.",
    );
  }

  if (!edit.ok) {
    return operationFailure(`page ${command}`, `page.${command}`, argv, edit.reason, edit.action, edit.data);
  }

  const apply = argv.includes("--apply");
  if (!apply) {
    return success({
      command: `page ${command}`,
      operation: `page.${command}`,
      input: argv,
      message: `Previewed Wiki Page ${command} for ${pageId}; no data was mutated. Pass --apply to write it.`,
      data: { ...edit.data, preview: true, applied: false },
    });
  }

  const result = await executeSurrealQuery(
    readSurrealConfig(),
    loggedQuery(
      `page ${command}`,
      `page.${command}`,
      argv,
      `UPDATE ${pageId} SET body = "${escapeSurrealString(edit.nextBody)}", updated_at = time::now();`,
      {
        kind: "write",
        targetRecords: [pageId],
        beforeQuery: `SELECT body FROM ${pageId}`,
        afterQuery: `SELECT body FROM ${pageId}`,
        relateEditedTargets: [pageId],
      },
    ),
    { queryId: `page.${command}:${pageId}:apply` },
  );
  if (!result.ok) return fromSurrealFailure(`page ${command}`, argv, result.error);

  return success({
    command: `page ${command}`,
    operation: `page.${command}`,
    input: argv,
    message: `Applied Wiki Page ${command} to ${pageId}.`,
    data: { ...edit.data, preview: false, applied: true, result: result.result },
  });
}

type PageEditPreviewResult =
  | {
      readonly ok: true;
      readonly nextBody: string;
      readonly data: {
        readonly pageId: string;
        readonly changed: boolean;
        readonly beforeLength: number;
        readonly afterLength: number;
        readonly beforeContext: string;
        readonly afterContext: string;
        readonly citationValidation: ReturnType<typeof validatePageBodyCitationMarkers>;
        readonly matchCount?: number;
      };
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly action: string;
      readonly data?: unknown;
    };

export function previewPageReplace(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  input: { readonly find?: string; readonly replace: string },
): PageEditPreviewResult {
  if (!input.find) {
    return {
      ok: false,
      reason: "Missing required find text for Wiki Page replace.",
      action: "Pass --find <text> with the exact body text to replace.",
    };
  }

  const matchCount = countPageEditOccurrences(currentBody, input.find);
  if (matchCount === 0) {
    return {
      ok: false,
      reason: `Find text was absent in ${pageId}: ${JSON.stringify(input.find)}.`,
      action: "Run page read to inspect the current body, then retry with exact text from that Wiki Page.",
      data: { pageId, find: input.find, matchCount },
    };
  }
  if (matchCount > 1) {
    return {
      ok: false,
      reason: `Find text was ambiguous in ${pageId}: ${matchCount} matches for ${JSON.stringify(input.find)}.`,
      action: "Use a longer unique --find value that includes surrounding context.",
      data: { pageId, find: input.find, matchCount },
    };
  }

  const matchIndex = currentBody.indexOf(input.find);
  const nextBody = `${currentBody.slice(0, matchIndex)}${input.replace}${currentBody.slice(matchIndex + input.find.length)}`;
  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex,
    contextLength: Math.max(input.find.length, input.replace.length),
    matchCount,
  });
}

export function previewPagePatch(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  nextBody: string | undefined,
): PageEditPreviewResult {
  if (nextBody === undefined) {
    return {
      ok: false,
      reason: "Missing required replacement body for Wiki Page patch.",
      action: "Pass --body <text> or --body-file <path>.",
    };
  }

  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex: firstDifferenceIndex(currentBody, nextBody),
    contextLength: 80,
  });
}

export function previewPageAppend(
  pageId: string,
  currentBody: string,
  graphCitationKeys: readonly string[],
  appendedBody: string | undefined,
): PageEditPreviewResult {
  if (appendedBody === undefined) {
    return {
      ok: false,
      reason: "Missing required appended body for Wiki Page append.",
      action: "Pass --body <text>, --body-file <path>, or --append-file <path>.",
    };
  }

  const separator = currentBody.length === 0 || currentBody.endsWith("\n") ? "" : "\n\n";
  const nextBody = `${currentBody}${separator}${appendedBody}`;
  return validatePageEditPreview(pageId, currentBody, nextBody, graphCitationKeys, {
    matchIndex: currentBody.length,
    contextLength: appendedBody.length,
  });
}

function validatePageEditPreview(
  pageId: string,
  currentBody: string,
  nextBody: string,
  graphCitationKeys: readonly string[],
  options: { readonly matchIndex: number; readonly contextLength: number; readonly matchCount?: number },
): PageEditPreviewResult {
  const citationValidation = validatePageBodyCitationMarkers({
    wikiPageId: pageId,
    pageBody: nextBody,
    graphCitationKeys,
  });
  if (citationValidation.issues.length > 0) {
    return {
      ok: false,
      reason: `Wiki Page edit would break citation marker validation for ${pageId}: ${citationValidation.issues.map((issue) => issue.message).join(" ")}`,
      action:
        "Keep Citation Markers aligned with graph Citation keys, or update Citations before applying the Page Body edit.",
      data: { pageId, citationValidation },
    };
  }

  const start = Math.max(0, options.matchIndex - 80);
  const end = Math.min(currentBody.length, options.matchIndex + Math.max(options.contextLength, 80));
  const nextEnd = Math.min(nextBody.length, options.matchIndex + Math.max(options.contextLength, 80));

  return {
    ok: true,
    nextBody,
    data: {
      pageId,
      changed: currentBody !== nextBody,
      beforeLength: currentBody.length,
      afterLength: nextBody.length,
      beforeContext: currentBody.slice(start, end),
      afterContext: nextBody.slice(start, nextEnd),
      citationValidation,
      ...(options.matchCount === undefined ? {} : { matchCount: options.matchCount }),
    },
  };
}

function readBodyInput(
  argv: readonly string[],
  inlineFlag: string,
  fileFlag: string,
  alternateFileFlag?: string,
): string | undefined {
  const inline = valueAfter(argv, inlineFlag);
  if (inline !== undefined) return inline;
  const file = valueAfter(argv, fileFlag) ?? (alternateFileFlag ? valueAfter(argv, alternateFileFlag) : undefined);
  return file ? readFileSync(file, "utf8") : undefined;
}

function countPageEditOccurrences(body: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = body.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = body.indexOf(needle, index + needle.length);
  }
  return count;
}

function firstDifferenceIndex(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return length;
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

export function buildAgentActivityRecordQuery(draft: AgentActivityDraft): string {
  const activityId = draft.id ?? `agent_activity:${randomUUID().replaceAll("-", "")}`;
  const metadata = draft.metadata === undefined ? "NONE" : JSON.stringify(draft.metadata);
  return [
    draft.createSession
      ? `CREATE ${draft.sessionId} SET purpose = "Implicit Agent Activity CLI session", created_at = time::now();`
      : "",
    `CREATE ${activityId} SET agent_session = ${draft.sessionId}, source = "${draft.source}", kind = "${draft.kind}", status = "${draft.status}", summary = "${escapeSurrealString(draft.summary)}", operation = ${draft.operation === undefined ? "NONE" : `"${escapeSurrealString(draft.operation)}"`}, target_records = ${surrealArray(draft.targetRecords)}, metadata = ${metadata}, created_at = time::now();`,
    `SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM ${activityId};`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAgentActivityListQuery(sessionId?: string): string {
  const where = sessionId ? ` WHERE agent_session = ${sessionId}` : "";
  return `SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM agent_activity${where} ORDER BY created_at ASC;`;
}

function agentActivityDraftFromArgv(argv: readonly string[]): AgentActivityDraft | CliFailure {
  const sessionId = resolveSessionId(argv, { createImplicit: true });
  const source = valueAfter(argv, "--source") ?? "cli";
  const kind = valueAfter(argv, "--kind");
  const status = valueAfter(argv, "--status") ?? defaultAgentActivityStatus(kind);
  const summary = valueAfter(argv, "--summary") ?? positionalArgs(argv, 2).join(" ");
  const operation = valueAfter(argv, "--operation");
  const targetRecords = valuesAfter(argv, "--target");
  const metadataJson = valueAfter(argv, "--metadata-json");
  const metadata = metadataJson === undefined ? undefined : parseMetadataJson(metadataJson);

  if (!sessionId) return missingArgument("activity record", "activity.record", argv, "<Agent Session ID>");
  if (!isAgentActivitySource(source)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid Agent Activity source '${source}'.`,
      `Use one of: ${agentActivitySources.join(", ")}.`,
    );
  }
  if (!isAgentActivityKind(kind)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      kind ? `Invalid Agent Activity kind '${kind}'.` : "Missing Agent Activity kind.",
      `Pass --kind with one of: ${agentActivityKinds.join(", ")}.`,
    );
  }
  if (!isAgentActivityStatus(status)) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid Agent Activity status '${status}'.`,
      `Pass --status with one of: ${agentActivityStatuses.join(", ")}.`,
    );
  }
  if (!summary.trim()) return missingArgument("activity record", "activity.record", argv, "--summary <summary>");
  if (metadata instanceof Error) {
    return operationFailure(
      "activity record",
      "activity.record",
      argv,
      `Invalid --metadata-json value: ${metadata.message}.`,
      "Pass a JSON object such as --metadata-json '{\"exitCode\":1}'.",
    );
  }

  const providedSessionId = valueAfter(argv, "--session") ?? process.env.ORIGINIUM_SESSION ?? readCurrentSession();
  const id = `agent_activity:${randomUUID().replaceAll("-", "")}`;
  return {
    id,
    sessionId,
    createSession: !providedSessionId,
    source,
    kind,
    status,
    summary,
    operation,
    targetRecords,
    metadata,
  };
}

function loggedQuery(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  options: QueryLogOptions | undefined,
): string {
  if (!options) return query;
  if (options.kind === "read") return query;

  const providedSessionId = options.sessionId ?? valueAfter(argv, "--session");
  const sessionId = providedSessionId ?? resolveSessionId(argv, { createImplicit: true });
  const targetRecords = options.targetRecords.length === 0 ? ["<unspecified>"] : options.targetRecords;
  const logId = `change_log:${randomUUID().replaceAll("-", "")}`;
  const implicitSessionStatement =
    sessionId && !providedSessionId && !process.env.ORIGINIUM_SESSION && !readCurrentSession()
      ? `CREATE ${sessionId} SET purpose = "Implicit Graph Wiki CLI session", created_at = time::now();`
      : "";
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
    implicitSessionStatement,
    beforeStatement,
    query,
    afterStatement,
    `CREATE ${logId} SET agent_session = ${sessionId ?? "NONE"}, command = "${escapeSurrealString(command)}", operation = "${escapeSurrealString(operation)}", target = "${escapeSurrealString(targetRecords.join(", "))}", target_records = ${surrealArray(targetRecords)}, summary = "${escapeSurrealString(`${options.kind} ${command}`)}", before = $originium_before, after = $originium_after, created_at = time::now();`,
    editedRelations,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderCliResult(result: CliResult): string {
  if (!result.ok) {
    return [
      `ERROR ${result.command || result.error.operation}`,
      `operation: ${result.error.operation}`,
      `input: ${result.error.input}`,
      `reason: ${result.error.reason}`,
      `action: ${result.error.action}`,
    ].join("\n");
  }

  const lines = [`OK ${result.command}`, result.message];
  const details = humanDetails(result.data);
  if (details.length > 0) lines.push(...details);
  return lines.join("\n");
}

function humanDetails(data: unknown): readonly string[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const lines: string[] = [];
  for (const key of ["id", "slug", "sourceId", "pageId", "headingId", "chunkId", "query"] as const) {
    const value = record[key];
    if (typeof value === "string") lines.push(`${key}: ${value}`);
  }
  if (Array.isArray(record.results)) {
    lines.push(`results: ${record.results.length}`);
    for (const result of record.results.slice(0, 5)) {
      if (!result || typeof result !== "object") continue;
      const item = result as { id?: unknown; title?: unknown; score?: unknown };
      lines.push(`- ${String(item.id ?? "<unknown>")} ${String(item.title ?? "")} ${String(item.score ?? "")}`.trim());
    }
  }
  if (Array.isArray(record.headings)) {
    lines.push(`headings: ${record.headings.length}`);
    for (const heading of record.headings.slice(0, 8)) {
      if (!heading || typeof heading !== "object") continue;
      const item = heading as {
        id?: unknown;
        persistedId?: unknown;
        title?: unknown;
        startPage?: unknown;
        endPage?: unknown;
      };
      lines.push(
        `- ${String(item.persistedId ?? item.id ?? "<unknown>")} ${String(item.title ?? "")} pages ${String(item.startPage ?? "?")}-${String(item.endPage ?? item.startPage ?? "?")}`,
      );
    }
  }
  return lines;
}

function wantsJson(argv: readonly string[]): boolean {
  return argv.includes("--json");
}

function withoutOutputFlags(argv: readonly string[]): readonly string[] {
  return argv.filter((arg) => arg !== "--json" && arg !== "--ndjson");
}

function resolveSessionId(argv: readonly string[], options: { readonly createImplicit: boolean }): string | undefined {
  const explicit = valueAfter(argv, "--session");
  if (explicit) return explicit;
  if (process.env.ORIGINIUM_SESSION) return process.env.ORIGINIUM_SESSION;
  const current = readCurrentSession();
  if (current) return current;
  return options.createImplicit ? `agent_session:${randomUUID().replaceAll("-", "")}` : undefined;
}

function sessionSource(argv: readonly string[]): string | undefined {
  if (valueAfter(argv, "--session")) return "explicit";
  if (process.env.ORIGINIUM_SESSION) return "env";
  if (readCurrentSession()) return "current";
  return undefined;
}

function sessionArgsForChild(argv: readonly string[]): readonly string[] {
  const sessionId = resolveSessionId(argv, { createImplicit: false });
  return sessionId ? ["--session", sessionId] : [];
}

function currentSessionFile(): string {
  return join(process.cwd(), ".originium", "current-session");
}

function readCurrentSession(): string | undefined {
  try {
    const value = readFileSync(currentSessionFile(), "utf8").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function writeCurrentSession(sessionId: string): void {
  mkdirSync(dirname(currentSessionFile()), { recursive: true });
  writeFileSync(currentSessionFile(), `${sessionId}\n`);
}

function clearCurrentSession(): void {
  try {
    unlinkSync(currentSessionFile());
  } catch {
    // The command is idempotent for operators clearing stale local state.
  }
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

function pageRecordFromStatements(
  statements: readonly { readonly result?: unknown }[],
): Record<string, unknown> | undefined {
  for (const statement of statements) {
    if (!Array.isArray(statement.result)) continue;
    const row = statement.result.find((candidate) => {
      return candidate && typeof candidate === "object" && "body" in candidate;
    });
    if (row && typeof row === "object") return row as Record<string, unknown>;
  }

  return undefined;
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

type GraphLintIssue = {
  readonly kind:
    | "empty-wiki-page"
    | "uncited-wiki-page"
    | "citation-marker-mismatch"
    | "unused-citation"
    | "duplicate-ish-page"
    | "orphan-page"
    | "stub-wiki-page"
    | "broad-citation-target"
    | "weak-manual-link";
  readonly severity: "error" | "warning";
  readonly recordId: string;
  readonly message: string;
  readonly suggestion: string;
  readonly details?: Record<string, unknown>;
};

export function lintGraphWikiStatements(statements: readonly { readonly result?: unknown }[]): {
  readonly issueCount: number;
  readonly issues: readonly GraphLintIssue[];
  readonly summary: Record<string, number>;
} {
  const rowsByStatement = statements.map((statement) =>
    Array.isArray(statement.result) ? statement.result.filter(isRecord) : [],
  );
  const pages = rowsByStatement[0] ?? [];
  const citations = rowsByStatement[1] ?? [];
  const anchors = rowsByStatement[2] ?? [];
  const manualLinks = rowsByStatement[4] ?? [];
  const issues: GraphLintIssue[] = [];
  const citationsByPage = groupBy(citations, "in");
  const manualLinksByEndpoint = new Map<string, number>();

  for (const link of manualLinks) {
    const from = stringField(link, "in");
    const to = stringField(link, "out");
    if (from) manualLinksByEndpoint.set(from, (manualLinksByEndpoint.get(from) ?? 0) + 1);
    if (to) manualLinksByEndpoint.set(to, (manualLinksByEndpoint.get(to) ?? 0) + 1);
    const reason = stringField(link, "reason");
    if (!reason || hasWeakGraphManualLinkReason(reason)) {
      const id = stringField(link, "id") || `${from}->manual_link->${to}`;
      issues.push({
        kind: "weak-manual-link",
        severity: "warning",
        recordId: id,
        message: `Manual Link ${id} has a missing or vague reason.`,
        suggestion: `Run link add --from ${from || "<from>"} --to ${to || "<to>"} --reason <specific relationship reason> to replace it with an actionable reason.`,
        details: { from, to, reason },
      });
    }
  }

  const pagesByDuplicateKey = new Map<string, Record<string, unknown>[]>();
  for (const page of pages) {
    const id = stringField(page, "id");
    const title = stringField(page, "title");
    const slug = stringField(page, "slug");
    const body = stringField(page, "body") ?? "";
    if (!id) continue;

    const pageCitations = citationsByPage.get(id) ?? [];
    const pageCitationKeys = pageCitations.flatMap((citation) => {
      const key = stringField(citation, "key");
      return key ? [key] : [];
    });
    const validation = validatePageBodyCitationMarkers({
      wikiPageId: id,
      pageBody: body,
      graphCitationKeys: pageCitationKeys,
    });
    for (const issue of validation.issues) {
      issues.push({
        kind: issue.kind === "unused-graph-citation" ? "unused-citation" : "citation-marker-mismatch",
        severity: "error",
        recordId: id,
        message: issue.message,
        suggestion:
          issue.kind === "unused-graph-citation"
            ? `Add Citation Marker [^${issue.graphCitationKey}] to ${id}, or remove the unused Citation relation.`
            : `Add the missing Citation relation for ${id}, remove the stale marker, or use page replace/patch with --apply after previewing.`,
        details: { validationIssue: issue },
      });
    }

    if (body.trim().length === 0) {
      issues.push({
        kind: "empty-wiki-page",
        severity: "error",
        recordId: id,
        message: `Wiki Page ${id} is empty.`,
        suggestion: `Use page patch --page ${id} --body-file <path> --apply, or remove the residue through an explicit cleanup bead.`,
      });
    } else if (body.trim().length < 120) {
      issues.push({
        kind: "stub-wiki-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} is very short (${body.trim().length} characters).`,
        suggestion: `Expand ${id} with cited synthesis, or mark the page as intentional in a follow-up note.`,
      });
    }

    if (pageCitations.length === 0) {
      issues.push({
        kind: "uncited-wiki-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has no graph Citations.`,
        suggestion: `Run citation add --page ${id} --heading <source-heading-id> --key <marker-key> after adding a matching Citation Marker.`,
      });
    }

    if (pageCitations.length === 0 && (manualLinksByEndpoint.get(id) ?? 0) === 0) {
      issues.push({
        kind: "orphan-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} has no Citations or Manual Links.`,
        suggestion: `Connect ${id} with citation add or link add, or clean up the orphan page explicitly.`,
      });
    }

    const duplicateKey = toSlug(slug || title || id);
    const duplicateSet = pagesByDuplicateKey.get(duplicateKey) ?? [];
    duplicateSet.push(page);
    pagesByDuplicateKey.set(duplicateKey, duplicateSet);
  }

  for (const [duplicateKey, duplicates] of pagesByDuplicateKey) {
    if (duplicates.length < 2) continue;
    const ids = duplicates.flatMap((page) => {
      const id = stringField(page, "id");
      return id ? [id] : [];
    });
    for (const id of ids) {
      issues.push({
        kind: "duplicate-ish-page",
        severity: "warning",
        recordId: id,
        message: `Wiki Page ${id} appears duplicate-ish with slug/title key '${duplicateKey}'.`,
        suggestion: `Compare duplicate-ish pages ${ids.join(", ")} and merge or rename intentionally.`,
        details: { duplicateKey, ids },
      });
    }
  }

  const anchorsByHeading = groupBy(anchors, "source_heading");
  for (const citation of citations) {
    const heading = stringField(citation, "out");
    const pageId = stringField(citation, "in");
    if (!heading || !pageId) continue;
    const headingAnchors = anchorsByHeading.get(heading) ?? [];
    if (headingAnchors.length === 0) continue;
    const key = stringField(citation, "key") ?? "<unknown>";
    issues.push({
      kind: "broad-citation-target",
      severity: "warning",
      recordId: `${pageId}:${key}`,
      message: `Citation ${key} on ${pageId} targets broad Source Heading ${heading} even though ${headingAnchors.length} Source Anchor(s) exist below it.`,
      suggestion:
        "Prefer citing the most specific Source Anchor once Citation relations support Source Anchor targets, or record why the heading-level citation is intentional.",
      details: {
        pageId,
        heading,
        citationKey: key,
        sourceAnchors: headingAnchors.map((anchor) => stringField(anchor, "id")).filter(Boolean),
      },
    });
  }

  const summary = issues.reduce<Record<string, number>>((accumulator, issue) => {
    accumulator[issue.kind] = (accumulator[issue.kind] ?? 0) + 1;
    return accumulator;
  }, {});

  return { issueCount: issues.length, issues, summary };
}

function groupBy(records: readonly Record<string, unknown>[], key: string): Map<string, Record<string, unknown>[]> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const record of records) {
    const value = stringField(record, key);
    if (!value) continue;
    const group = groups.get(value) ?? [];
    group.push(record);
    groups.set(value, group);
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function hasWeakGraphManualLinkReason(reason: string): boolean {
  const normalized = reason.trim().toLowerCase();
  return normalized.length < 16 || /^(related|see also|link|manual|todo|tbd|context)$/.test(normalized);
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

function defaultSourceDocumentId(path: string): string {
  return `source_document:${basename(path)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()}`;
}

function sourceHeadingDraftFromProjection(
  heading: SourceHeadingProjection,
  sourceDocumentId = heading.sourceDocumentId,
): SourceHeadingDraft {
  return {
    sourceDocumentId,
    title: heading.title,
    headingPath: heading.headingPath,
    level: heading.level,
    startPage: heading.startPage,
    endPage: heading.endPage,
    order: heading.order,
    extractionMethod: heading.extractionMethod,
  };
}

function persistedSourceHeadingId(
  heading: SourceHeadingProjection,
  sourceDocumentId = heading.sourceDocumentId,
): string {
  return sourceHeadingRecordId(sourceHeadingDraftFromProjection(heading, sourceDocumentId));
}

function cliSourceHeading(
  heading: SourceHeadingProjection,
  sourceDocumentId = heading.sourceDocumentId,
): Record<string, unknown> {
  const persistedId = persistedSourceHeadingId(heading, sourceDocumentId);
  return {
    id: persistedId,
    persistedSourceHeadingId: persistedId,
    citationTarget: persistedId,
    extractionHeadingId: heading.id,
    projectionHeadingId: heading.id,
    sourceDocumentId,
    title: heading.title,
    headingPath: heading.headingPath,
    level: heading.level,
    startPage: heading.startPage,
    endPage: heading.endPage,
    order: heading.order,
    extractionMethod: heading.extractionMethod,
  };
}

function findSourceHeading(
  headings: readonly SourceHeadingProjection[],
  sourceDocumentId: string,
  selector: string,
): SourceHeadingProjection | undefined {
  return headings.find((candidate) => {
    const persistedId = persistedSourceHeadingId(candidate, sourceDocumentId);
    return (
      candidate.id === selector ||
      persistedId === selector ||
      candidate.title === selector ||
      candidate.headingPath.join(" / ") === selector
    );
  });
}

type PageRange = { readonly start: number; readonly end: number };

function pageRangeForHeading(
  path: string,
  sourceDocumentId: string,
  headings: readonly SourceHeadingProjection[],
  selector: string,
  argv: readonly string[],
): PageRange | CliFailure {
  const heading = findSourceHeading(headings, sourceDocumentId, selector);
  if (!heading) {
    return operationFailure(
      "source read",
      "source.read",
      argv,
      `No Source Heading matched '${selector}'.`,
      `Run originium source headings ${path} --source ${sourceDocumentId} and pass data.headings[].id.`,
    );
  }
  return { start: heading.startPage, end: heading.endPage ?? heading.startPage };
}

function parsePageRangeArgument(argv: readonly string[]): PageRange | CliFailure | undefined {
  const pages = valueAfter(argv, "--pages") ?? valueAfter(argv, "--page-range");
  if (pages) {
    const match = pages.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      return operationFailure(
        argv.slice(0, 2).join(" "),
        `${argv[0]}.${argv[1]}`,
        argv,
        `Invalid page range '${pages}'.`,
        "Pass a page range such as --pages 12-14.",
      );
    }
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (end < start) {
      return operationFailure(
        argv.slice(0, 2).join(" "),
        `${argv[0]}.${argv[1]}`,
        argv,
        `Invalid page range '${pages}' because the end page is before the start page.`,
        "Pass a page range such as --pages 12-14.",
      );
    }
    return { start, end };
  }

  const page = optionalIntegerAfter(argv, "--page");
  if (page !== undefined) return { start: page, end: page };
  const start = optionalIntegerAfter(argv, "--start-page") ?? optionalIntegerAfter(argv, "--from-page");
  const end = optionalIntegerAfter(argv, "--end-page") ?? optionalIntegerAfter(argv, "--to-page") ?? start;
  return start === undefined || end === undefined ? undefined : { start, end };
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

function valuesAfter(argv: readonly string[], flag: string): readonly string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1] !== undefined) values.push(argv[index + 1]);
  }
  return values;
}

function optionalIntegerAfter(argv: readonly string[], flag: string): number | undefined {
  const value = valueAfter(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sourceAnchorRecordId(sourceDocumentId: string, headingId: string, title: string): string {
  const sourcePart = toSurrealIdPart(toSlug(sourceDocumentId.replace(/^[^:]+:/, "")));
  const headingPart = toSurrealIdPart(toSlug(headingId.replace(/^[^:]+:/, "")));
  return `source_anchor:${sourcePart}_${headingPart}_${toSurrealIdPart(toSlug(title))}`;
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

function toSurrealIdPart(input: string): string {
  return input.replace(/-/g, "_");
}

function surrealArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeSurrealString(value)}"`).join(", ")}]`;
}

function defaultAgentActivityStatus(kind: string | undefined): AgentActivityStatus {
  return kind === "error" ? "failed" : "completed";
}

function isAgentActivitySource(value: string): value is AgentActivitySource {
  return agentActivitySources.includes(value as AgentActivitySource);
}

function isAgentActivityKind(value: string | undefined): value is AgentActivityKind {
  return value !== undefined && agentActivityKinds.includes(value as AgentActivityKind);
}

function isAgentActivityStatus(value: string): value is AgentActivityStatus {
  return agentActivityStatuses.includes(value as AgentActivityStatus);
}

function parseMetadataJson(value: string): Record<string, unknown> | Error {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Error("expected a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    return new Error(errorReason(error));
  }
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.main) {
  const result = await runCli();
  console.log(wantsJson(process.argv.slice(2)) ? JSON.stringify(result, null, 2) : renderCliResult(result));
  process.exitCode = result.ok ? 0 : 1;
}
