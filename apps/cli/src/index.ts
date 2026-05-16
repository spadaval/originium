import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
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
      const result = await executeSurrealQuery(config, query, { queryId: `source.import-pdf:${path}` });
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
      const result = await executeSurrealQuery(config, values.join("\n"), { queryId: `source.headings:${sourceId}` });
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
    const heading = extractPdfHeadings(path, sourceId).find(
      (candidate) => candidate.id === headingId || candidate.title === headingId,
    );
    if (!heading) {
      return operationFailure(
        "source chunk",
        "source.chunk",
        argv,
        `No Source Heading matched '${headingId}'.`,
        "Run source headings first and pass a returned heading ID or title.",
      );
    }
    const chunk = projectPdfChunk(path, heading, { maxTokens });
    return success({
      command: "source chunk",
      operation: "source.chunk",
      input: argv,
      message: `Projected Ingestion Chunk for ${heading.id} with estimated ${chunk.tokenEstimate} tokens.`,
      data: chunk,
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

    const query = `RELATE ${pageId}->cites->${headingId} SET key = "${escapeSurrealString(key)}", label = "${escapeSurrealString(label ?? key)}", quote = ${quote ? `"${escapeSurrealString(quote)}"` : "NONE"}, created_at = time::now();`;
    const result = await executeSurrealQuery(config, query, { queryId: `citation.add:${pageId}:${key}` });
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
    );
  }

  if (command === "validate") {
    const pageId = argv[2] ?? valueAfter(argv, "--page");
    if (!pageId) return missingArgument("citation validate", "citation.validate", argv, "<wiki-page-id>");
    const pageResult = await executeSurrealQuery(
      config,
      `SELECT body FROM ${pageId}; SELECT key FROM cites WHERE in = ${pageId};`,
      {
        queryId: `citation.validate:${pageId}`,
      },
    );
    if (!pageResult.ok) return fromSurrealFailure("citation validate", argv, pageResult.error);
    const statements = pageResult.result as Array<{ result?: unknown }>;
    const body = (((statements[0]?.result as unknown[])?.[0] as { body?: string } | undefined)?.body ?? "") as string;
    const keys = ((statements[1]?.result as Array<{ key?: string }> | undefined) ?? []).flatMap((row) =>
      row.key ? [row.key] : [],
    );
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
    );
  }

  if (command === "list") {
    const record = valueAfter(argv, "--record") ?? argv[2];
    const where = record ? `WHERE in = ${record} OR out = ${record}` : "";
    return queryCommand("link list", "link.list", argv, `SELECT * FROM manual_link ${where};`, "Listed Manual Links.");
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
  return queryCommand(
    "ingest chapter",
    "ingest.chapter",
    argv,
    `SELECT * FROM ${source}; SELECT * FROM ${heading}; SELECT * FROM wiki_page ORDER BY updated_at DESC LIMIT 10;`,
    `Prepared Chapter Ingestion context for ${heading}.`,
  );
}

async function routeAcceptance(argv: readonly string[]): Promise<CliResult> {
  const [, command] = argv;
  if (command !== "poc") return unknownCommand("acceptance", command ?? "", argv, "Use: acceptance poc <pdf-path>.");
  const path = argv[2] ?? "fixtures/source-documents/IA-Mining-DG.pdf";
  const stages = [
    { name: "db-status", result: await routeDb(["db", "status"]) },
    { name: "db-doctor", result: await routeDb(["db", "doctor"]) },
    { name: "schema", result: await routeDb(["db", "apply-schema"]) },
    { name: "source-import", result: await routeSource(["source", "import-pdf", path]) },
    {
      name: "heading-projection",
      result: await routeSource(["source", "headings", path, "--source", "source_document:ia_mining_dg_fixture"]),
    },
  ];
  const failed = stages.find((stage) => !stage.result.ok);
  return success({
    command: "acceptance poc",
    operation: "acceptance.poc",
    input: argv,
    message: failed ? `POC acceptance blocked at stage ${failed.name}.` : "POC acceptance core stages passed.",
    data: { stages },
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
  );
}

async function searchPages(argv: readonly string[]): Promise<CliResult> {
  const queryText = argv.slice(2).join(" ").trim();
  if (!queryText) return missingArgument("page search", "page.search", argv, "<query>");
  const term = escapeSurrealString(queryText.toLowerCase());
  return queryCommand(
    "page search",
    "page.search",
    argv,
    `SELECT *, (string::lowercase(title).contains("${term}") OR string::lowercase(body).contains("${term}")) AS matched FROM wiki_page WHERE string::lowercase(title).contains("${term}") OR string::lowercase(body).contains("${term}") ORDER BY updated_at DESC LIMIT 10;`,
    `Searched Wiki Pages for '${queryText}'.`,
  );
}

async function queryCommand(
  command: string,
  operation: string,
  argv: readonly string[],
  query: string,
  message: string,
  data: Record<string, unknown> = {},
): Promise<CliResult> {
  const result = await executeSurrealQuery(readSurrealConfig(), query, { queryId: `${operation}:${argv.join(" ")}` });
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
  return queryCommand(command, operation, argv, `SELECT * FROM ${id};`, `Read ${label} ${id}.`);
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
): CliFailure {
  return {
    ok: false,
    command,
    error: {
      kind: "operation_failure",
      operation,
      input: argv.join(" "),
      reason,
      action,
    },
  };
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
