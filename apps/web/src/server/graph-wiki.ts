import { randomUUID } from "node:crypto";
import { toSlug, validatePageBodyCitationMarkers, wikiPageRecordId, wikiPageSlugFromTitle } from "@originium/domain";
import {
  describeSurrealTarget,
  executeSurrealQuery,
  readSurrealConfig,
  type SafeSurrealTarget,
  type SurrealConfig,
  type SurrealFetch,
  sourceDocumentBucketSurql,
} from "@originium/surreal";

type JsonPrimitive = string | number | boolean | null;
type OperationInput = Record<string, JsonPrimitive | readonly JsonPrimitive[]>;

export type WebGraphWikiOperationFailure = {
  readonly kind: "operation_failure";
  readonly operation: string;
  readonly target: SafeSurrealTarget;
  readonly input: OperationInput;
  readonly reason: string;
  readonly action: string;
};

export type WebGraphWikiValidationFailure = {
  readonly kind: "validation_failure";
  readonly operation: "web.graph.page.edit.validate";
  readonly target: SafeSurrealTarget;
  readonly input: OperationInput;
  readonly reason: string;
  readonly action: string;
  readonly issues: ReturnType<typeof validatePageBodyCitationMarkers>["issues"];
};

export type WebGraphWikiResult<T> =
  | {
      readonly ok: true;
      readonly operation: string;
      readonly target: SafeSurrealTarget;
      readonly input: OperationInput;
      readonly data: T;
    }
  | {
      readonly ok: false;
      readonly error: WebGraphWikiOperationFailure | WebGraphWikiValidationFailure;
    };

export type SourceDocumentRecord = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly sha256: string;
  readonly mime_type: string;
  readonly page_count?: number;
  readonly source_uri?: string;
  readonly extraction_status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
};

export type SourceHeadingRecord = {
  readonly id: string;
  readonly source_document: string;
  readonly title: string;
  readonly heading_path: readonly string[];
  readonly level: number;
  readonly start_page: number;
  readonly end_page?: number;
  readonly order: number;
  readonly extraction_method: string;
};

export type WikiPageRecord = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly body: string;
  readonly created_at?: string;
  readonly updated_at?: string;
};

export type CitationRecord = {
  readonly id?: string;
  readonly key: string;
  readonly label?: string;
  readonly quote?: string;
  readonly source_heading?: unknown;
};

export type WikiPageWithCitations = WikiPageRecord & {
  readonly citations: readonly CitationRecord[];
};

export type AgentSessionRecord = {
  readonly id: string;
  readonly purpose: string;
  readonly created_at?: string;
};

export type ChangeLogRecord = {
  readonly id: string;
  readonly agent_session?: string;
  readonly command: string;
  readonly operation: string;
  readonly target: string;
  readonly target_records: readonly string[];
  readonly summary: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly created_at?: string;
};

export type AgentActivityRecord = Record<string, unknown> & {
  readonly id?: string;
  readonly created_at?: string;
};

export type SaveWikiPageBodyInput = {
  readonly pageId?: string;
  readonly title?: string;
  readonly body: string;
  readonly sessionId?: string;
};

export type SaveWikiPageBodyData = {
  readonly pageId: string;
  readonly changed: boolean;
  readonly beforeLength: number;
  readonly afterLength: number;
  readonly citationValidation: ReturnType<typeof validatePageBodyCitationMarkers>;
  readonly result: unknown;
};

export type WebGraphWikiDependencies = {
  readonly config?: SurrealConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetch?: SurrealFetch;
  readonly newId?: () => string;
};

export async function listSourceDocuments(
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly SourceDocumentRecord[]>> {
  const operation = "web.graph.source_document.list";
  const query = `${sourceDocumentBucketSurql(resolveConfig(dependencies))}\nSELECT id, title, kind, sha256, mime_type, page_count, source_uri, extraction_status, created_at, updated_at FROM source_document ORDER BY updated_at DESC, title ASC;`;
  return queryRows(operation, query, { table: "source_document" }, dependencies, "source_document");
}

export async function readSourceDocument(
  id: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<SourceDocumentRecord | undefined>> {
  const operation = "web.graph.source_document.read";
  return querySingle(
    operation,
    `${sourceDocumentBucketSurql(resolveConfig(dependencies))}\nSELECT id, title, kind, sha256, mime_type, page_count, source_uri, extraction_status, created_at, updated_at FROM ${recordId(id, "source_document")};`,
    { id },
    dependencies,
    "source_document",
  );
}

export async function readSourceHeadings(
  sourceDocumentId: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly SourceHeadingRecord[]>> {
  const operation = "web.graph.source_heading.list";
  return queryRows(
    operation,
    `SELECT id, source_document, title, heading_path, level, start_page, end_page, order, extraction_method FROM source_heading WHERE source_document = ${recordId(sourceDocumentId, "source_document")} ORDER BY order ASC;`,
    { sourceDocumentId },
    dependencies,
    "source_heading",
  );
}

export async function listWikiPages(
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly WikiPageRecord[]>> {
  const operation = "web.graph.page.list";
  return queryRows(
    operation,
    "SELECT id, title, slug, body, created_at, updated_at FROM wiki_page ORDER BY updated_at DESC, title ASC;",
    { table: "wiki_page" },
    dependencies,
    "wiki_page",
  );
}

export async function readWikiPage(
  input: { readonly pageId?: string; readonly title?: string },
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<WikiPageWithCitations | undefined>> {
  const operation = "web.graph.page.read";
  const pageId = pageIdFromInput(input);
  const result = await runQuery(
    operation,
    `SELECT id, title, slug, body, created_at, updated_at FROM ${pageId}; SELECT id, key, label, quote, out AS source_heading FROM cites WHERE in = ${pageId} ORDER BY key ASC;`,
    inputForPage(input, pageId),
    dependencies,
    "Read the Wiki Page from the Graph Wiki database after verifying the record ID or title.",
  );
  if (!result.ok) return result;

  const page = rowsAt<WikiPageRecord>(result.data, 0)[0];
  return {
    ...result,
    data: page === undefined ? undefined : { ...page, citations: rowsAt<CitationRecord>(result.data, 1) },
  };
}

export async function saveWikiPageBody(
  input: SaveWikiPageBodyInput,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<SaveWikiPageBodyData>> {
  const pageId = pageIdFromInput(input);
  const readOperation = "web.graph.page.edit.read";
  const readResult = await runQuery(
    readOperation,
    `SELECT id, title, slug, body FROM ${pageId}; SELECT key FROM cites WHERE in = ${pageId};`,
    inputForPage(input, pageId),
    dependencies,
    "Read the Wiki Page and graph Citation keys before applying the Page Body edit.",
  );
  if (!readResult.ok) return readResult;

  const page = rowsAt<WikiPageRecord>(readResult.data, 0)[0];
  if (page === undefined) {
    return {
      ok: false,
      error: operationFailure({
        operation: "web.graph.page.edit.apply",
        config: resolveConfig(dependencies),
        input: inputForPage(input, pageId),
        reason: `Wiki Page ${pageId} does not exist; SELECT returned no page record.`,
        action:
          "Create the Wiki Page first, or pass the exact pageId returned by the Graph Wiki page list/read function.",
      }),
    };
  }

  const graphCitationKeys = rowsAt<{ readonly key?: unknown }>(readResult.data, 1).flatMap((row) =>
    typeof row.key === "string" ? [row.key] : [],
  );
  const citationValidation = validatePageBodyCitationMarkers({
    wikiPageId: pageId,
    pageBody: input.body,
    graphCitationKeys,
  });
  if (citationValidation.issues.length > 0) {
    const config = resolveConfig(dependencies);
    return {
      ok: false,
      error: {
        kind: "validation_failure",
        operation: "web.graph.page.edit.validate",
        target: describeSurrealTarget(config),
        input: inputForPage(input, pageId),
        reason: `Wiki Page edit would break citation marker validation for ${pageId}: ${citationValidation.issues.map((issue) => issue.message).join(" ")}`,
        action:
          "Keep Citation Markers aligned with graph Citation keys, or update Citations before applying the Page Body edit.",
        issues: citationValidation.issues,
      },
    };
  }

  const applyOperation = "web.graph.page.edit.apply";
  const targetRecords = [pageId];
  const query = loggedWriteQuery({
    command: "web page body save",
    operation: applyOperation,
    query: `UPDATE ${pageId} SET body = "${escapeSurrealString(input.body)}", updated_at = time::now();`,
    targetRecords,
    beforeQuery: `SELECT body FROM ${pageId}`,
    afterQuery: `SELECT body FROM ${pageId}`,
    sessionId: input.sessionId,
    newId: dependencies.newId,
  });
  const applyResult = await runQuery(
    applyOperation,
    query,
    inputForPage(input, pageId),
    dependencies,
    "Verify the Wiki Page exists, citation markers match graph Citation keys, and SurrealDB accepts the logged Page Body mutation.",
  );
  if (!applyResult.ok) return applyResult;

  return {
    ...applyResult,
    data: {
      pageId,
      changed: page.body !== input.body,
      beforeLength: page.body.length,
      afterLength: input.body.length,
      citationValidation,
      result: applyResult.data,
    },
  };
}

export async function listAgentSessions(
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly AgentSessionRecord[]>> {
  const operation = "web.graph.agent_session.list";
  return queryRows(
    operation,
    "SELECT id, purpose, created_at FROM agent_session ORDER BY created_at DESC;",
    { table: "agent_session" },
    dependencies,
    "agent_session",
  );
}

export async function readAgentSession(
  id: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<AgentSessionRecord | undefined>> {
  const operation = "web.graph.agent_session.read";
  return querySingle(
    operation,
    `SELECT id, purpose, created_at FROM ${recordId(id, "agent_session")};`,
    { id },
    dependencies,
    "agent_session",
  );
}

export async function listChangeLogs(
  input: { readonly sessionId?: string; readonly target?: string } = {},
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly ChangeLogRecord[]>> {
  const operation = "web.graph.change_log.list";
  const filters = [
    input.sessionId ? `agent_session = ${recordId(input.sessionId, "agent_session")}` : undefined,
    input.target ? `target = "${escapeSurrealString(input.target)}"` : undefined,
  ].filter(Boolean);
  const where = filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "";
  return queryRows(
    operation,
    `SELECT id, agent_session, command, operation, target, target_records, summary, before, after, created_at FROM change_log${where} ORDER BY created_at DESC;`,
    compactInput(input, { table: "change_log" }),
    dependencies,
    "change_log",
  );
}

export async function readChangeLog(
  id: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<ChangeLogRecord | undefined>> {
  const operation = "web.graph.change_log.read";
  return querySingle(
    operation,
    `SELECT id, agent_session, command, operation, target, target_records, summary, before, after, created_at FROM ${recordId(id, "change_log")};`,
    { id },
    dependencies,
    "change_log",
  );
}

export async function listAgentActivity(
  input: { readonly sessionId?: string } = {},
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly AgentActivityRecord[]>> {
  const operation = "web.graph.agent_activity.list";
  const where = input.sessionId ? ` WHERE agent_session = ${recordId(input.sessionId, "agent_session")}` : "";
  return queryRows(
    operation,
    `SELECT * FROM agent_activity${where} ORDER BY created_at DESC;`,
    compactInput(input, { table: "agent_activity" }),
    dependencies,
    "agent_activity",
  );
}

export async function readAgentActivity(
  id: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<AgentActivityRecord | undefined>> {
  const operation = "web.graph.agent_activity.read";
  return querySingle(
    operation,
    `SELECT * FROM ${recordId(id, "agent_activity")};`,
    { id },
    dependencies,
    "agent_activity",
  );
}

async function queryRows<T>(
  operation: string,
  query: string,
  input: OperationInput,
  dependencies: WebGraphWikiDependencies,
  table: string,
): Promise<WebGraphWikiResult<readonly T[]>> {
  const result = await runQuery(
    operation,
    query,
    input,
    dependencies,
    `Read ${table} records from the Graph Wiki database.`,
  );
  if (!result.ok) return result;
  return { ...result, data: lastRows<T>(result.data) };
}

async function querySingle<T>(
  operation: string,
  query: string,
  input: OperationInput,
  dependencies: WebGraphWikiDependencies,
  table: string,
): Promise<WebGraphWikiResult<T | undefined>> {
  const result = await runQuery(
    operation,
    query,
    input,
    dependencies,
    `Read a ${table} record from the Graph Wiki database.`,
  );
  if (!result.ok) return result;
  return { ...result, data: firstRow<T>(result.data) };
}

async function runQuery(
  operation: string,
  query: string,
  input: OperationInput,
  dependencies: WebGraphWikiDependencies,
  action: string,
): Promise<WebGraphWikiResult<unknown>> {
  const config = resolveConfig(dependencies);
  const result = await executeSurrealQuery(config, query, {
    fetch: dependencies.fetch,
    queryId: queryId(operation, input),
  });

  if (!result.ok) {
    return {
      ok: false,
      error: operationFailure({
        operation,
        config,
        input,
        reason: result.error.reason,
        action,
      }),
    };
  }

  return {
    ok: true,
    operation,
    target: describeSurrealTarget(config),
    input,
    data: result.result,
  };
}

function loggedWriteQuery(input: {
  readonly command: string;
  readonly operation: string;
  readonly query: string;
  readonly targetRecords: readonly string[];
  readonly beforeQuery: string;
  readonly afterQuery: string;
  readonly sessionId?: string;
  readonly newId?: () => string;
}): string {
  const logId = `change_log:${(input.newId ?? randomUUID)().replaceAll("-", "")}`;
  const beforeStatement = `LET $originium_before = (${input.beforeQuery})[0];`;
  const afterStatement = `LET $originium_after = (${input.afterQuery})[0];`;
  const editedRelations = input.sessionId
    ? input.targetRecords
        .map((target) => `RELATE ${target}->edited_in->${input.sessionId} SET created_at = time::now();`)
        .join("\n")
    : "";

  return [
    beforeStatement,
    input.query,
    afterStatement,
    `CREATE ${logId} SET agent_session = ${input.sessionId ?? "NONE"}, command = "${escapeSurrealString(input.command)}", operation = "${escapeSurrealString(input.operation)}", target = "${escapeSurrealString(input.targetRecords.join(", "))}", target_records = ${surrealArray(input.targetRecords)}, summary = "write web page body save", before = $originium_before, after = $originium_after, created_at = time::now();`,
    editedRelations,
  ]
    .filter(Boolean)
    .join("\n");
}

function operationFailure(input: {
  readonly operation: string;
  readonly config: SurrealConfig;
  readonly input: OperationInput;
  readonly reason: string;
  readonly action: string;
}): WebGraphWikiOperationFailure {
  return {
    kind: "operation_failure",
    operation: input.operation,
    target: describeSurrealTarget(input.config),
    input: input.input,
    reason: redactConfigSecrets(input.reason, input.config),
    action: input.action,
  };
}

function resolveConfig(dependencies: WebGraphWikiDependencies): SurrealConfig {
  return dependencies.config ?? readSurrealConfig(dependencies.env);
}

function pageIdFromInput(input: { readonly pageId?: string; readonly title?: string }): string {
  if (input.pageId) return recordId(input.pageId, "wiki_page");
  return wikiPageRecordId(input.title ?? "");
}

function inputForPage(input: { readonly pageId?: string; readonly title?: string }, pageId: string): OperationInput {
  return compactInput(
    {
      pageId: input.pageId,
      title: input.title,
    },
    {
      pageId,
      slug: input.title ? wikiPageSlugFromTitle(input.title) : undefined,
    },
  );
}

function compactInput(
  input: Record<string, string | undefined>,
  base: Record<string, JsonPrimitive | readonly JsonPrimitive[] | undefined> = {},
): OperationInput {
  const entries = Object.entries({ ...base, ...input }).filter((entry): entry is [string, JsonPrimitive] => {
    const value = entry[1];
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null;
  });
  return Object.fromEntries(entries);
}

function queryId(operation: string, input: OperationInput): string {
  const identifier = input.id ?? input.pageId ?? input.sourceDocumentId ?? input.sessionId ?? input.table ?? "query";
  return `${operation}:${String(identifier)}`;
}

function recordId(
  value: string,
  fallbackTable: "agent_activity" | "agent_session" | "change_log" | "source_document" | "wiki_page",
): string {
  if (value.includes(":")) return value;
  const slug = toSlug(value);
  return `${fallbackTable}:${slug.replace(/-/g, "_")}`;
}

function rowsAt<T>(result: unknown, index: number): readonly T[] {
  if (!Array.isArray(result)) return [];
  const statement = result[index];
  if (!statement || typeof statement !== "object" || !("result" in statement)) return [];
  const rows = statement.result;
  return Array.isArray(rows) ? (rows as readonly T[]) : [];
}

function lastRows<T>(result: unknown): readonly T[] {
  if (!Array.isArray(result)) return [];
  for (let index = result.length - 1; index >= 0; index -= 1) {
    const rows = rowsAt<T>(result, index);
    if (rows.length > 0 || hasArrayResult(result[index])) return rows;
  }
  return [];
}

function firstRow<T>(result: unknown): T | undefined {
  return lastRows<T>(result)[0];
}

function hasArrayResult(statement: unknown): boolean {
  return Boolean(
    statement && typeof statement === "object" && "result" in statement && Array.isArray(statement.result),
  );
}

function escapeSurrealString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function surrealArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeSurrealString(value)}"`).join(", ")}]`;
}

function redactConfigSecrets(reason: string, config: SurrealConfig): string {
  return [config.password, config.user ? `${config.user}:${config.password}` : undefined]
    .filter((secret): secret is string => Boolean(secret))
    .reduce((redacted, secret) => redacted.replaceAll(secret, "[redacted]"), reason);
}
