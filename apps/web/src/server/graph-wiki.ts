import { randomUUID } from "node:crypto";
import {
  parseWikiPageReferences,
  toSlug,
  validatePageBodyCitationMarkers,
  wikiPageRecordId,
  wikiPageSlugFromTitle,
} from "@originium/domain";
import {
  type AgentActivityDraft,
  type AgentActivityRecord,
  buildAgentActivityListQuery,
  buildAgentActivityRecordQuery as buildSurrealAgentActivityRecordQuery,
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
  readonly corpus?: string;
  readonly publisher?: string;
  readonly document_class?: string;
  readonly industries?: readonly string[];
  readonly product_families?: readonly string[];
  readonly version?: string;
  readonly publication_date?: string;
  readonly trust_status?: string;
  readonly frame?: string;
  readonly frame_metadata?: OperationInput;
  readonly extraction_status?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
};

export type SourceOutlineRecord = {
  readonly id: string;
  readonly source_document: string;
  readonly start_page: number;
  readonly end_page?: number;
  readonly extraction_method: string;
  readonly projection_version?: string;
  readonly projection_status?: string;
};

export type WikiPageRecord = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly body: string;
  readonly frame?: string;
  readonly frame_metadata?: OperationInput;
  readonly created_at?: string;
  readonly updated_at?: string;
};

export type CitationRecord = {
  readonly id?: string;
  readonly key: string;
  readonly label?: string;
  readonly quote?: string;
  readonly source_document?: unknown;
};

export type WikiPageWithCitations = WikiPageRecord & {
  readonly citations: readonly CitationRecord[];
};

export type ManualLinkRecord = {
  readonly id?: string;
  readonly in?: unknown;
  readonly out?: unknown;
  readonly reason?: string;
  readonly label?: string;
  readonly created_session?: unknown;
  readonly created_at?: string;
};

export type GraphNeighborhoodInput = {
  readonly recordId?: string;
  readonly pageId?: string;
  readonly title?: string;
  readonly limit?: number;
};

export type GraphNeighborhoodNode = {
  readonly id: string;
  readonly kind: "source_document" | "wiki_page";
  readonly label: string;
  readonly selected: boolean;
  readonly navigation: {
    readonly recordId: string;
    readonly slug?: string;
    readonly sourceDocumentId?: string;
  };
  readonly metadata: OperationInput;
};

export type GraphNeighborhoodEdge = {
  readonly id: string;
  readonly kind: "citation" | "manual_link" | "wiki_page_reference";
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly metadata: OperationInput;
};

export type GraphNeighborhoodData = {
  readonly selectedRecordId: string;
  readonly selectedKind: GraphNeighborhoodNode["kind"];
  readonly limit: number;
  readonly nodes: readonly GraphNeighborhoodNode[];
  readonly edges: readonly GraphNeighborhoodEdge[];
};

export type AgentSessionRecord = {
  readonly id: string;
  readonly purpose: string;
  readonly workspace_key?: string;
  readonly codex_thread_id?: string;
  readonly codex_model?: string;
  readonly codex_model_provider?: string;
  readonly codex_cwd?: string;
  readonly created_at?: string;
  readonly updated_at?: string;
};

export type WorkspaceAgentSessionInput = {
  readonly workspaceKey: string;
  readonly purpose?: string;
};

export type WorkspaceAgentSessionData = {
  readonly session: AgentSessionRecord;
  readonly created: boolean;
};

export type CodexThreadMetadataInput = {
  readonly sessionId: string;
  readonly threadId: string;
  readonly model?: string;
  readonly modelProvider?: string;
  readonly cwd?: string;
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
  const query = `${sourceDocumentBucketSurql(resolveConfig(dependencies))}\nSELECT id, title, kind, sha256, mime_type, page_count, source_uri, corpus, publisher, document_class, industries, product_families, version, publication_date, trust_status, frame, frame_metadata, extraction_status, created_at, updated_at FROM source_document ORDER BY updated_at DESC, title ASC;`;
  return queryRows(operation, query, { table: "source_document" }, dependencies, "source_document");
}

export async function readSourceDocument(
  id: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<SourceDocumentRecord | undefined>> {
  const operation = "web.graph.source_document.read";
  return querySingle(
    operation,
    `${sourceDocumentBucketSurql(resolveConfig(dependencies))}\nSELECT id, title, kind, sha256, mime_type, page_count, source_uri, corpus, publisher, document_class, industries, product_families, version, publication_date, trust_status, frame, frame_metadata, extraction_status, created_at, updated_at FROM ${recordId(id, "source_document")};`,
    { id },
    dependencies,
    "source_document",
  );
}

export async function readSourceOutline(
  sourceDocumentId: string,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly SourceOutlineRecord[]>> {
  const operation = "web.graph.source_outline.list";
  return queryRows(
    operation,
    `SELECT id, source_document, start_page, end_page, extraction_method, projection_version, projection_status FROM source_text_projection WHERE source_document = ${recordId(sourceDocumentId, "source_document")} ORDER BY start_page ASC;`,
    { sourceDocumentId },
    dependencies,
    "source outline projection",
  );
}

export async function listWikiPages(
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<readonly WikiPageRecord[]>> {
  const operation = "web.graph.page.list";
  return queryRows(
    operation,
    "SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM wiki_page ORDER BY updated_at DESC, title ASC;",
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
    `SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM ${pageId}; SELECT id, key, label, quote, out AS source_document FROM cites WHERE in = ${pageId} ORDER BY key ASC;`,
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

export async function readGraphNeighborhood(
  input: GraphNeighborhoodInput,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<GraphNeighborhoodData>> {
  const operation = "web.graph.neighborhood.read";
  const selectedRecordId = graphSelectedRecordId(input);
  const selectedKind = graphNodeKind(selectedRecordId);
  const limit = graphLimit(input.limit);
  const queryInput = compactInput(
    { recordId: input.recordId, pageId: input.pageId, title: input.title },
    { selectedRecordId, limit },
  );

  if (selectedKind === undefined) {
    return {
      ok: false,
      error: operationFailure({
        operation,
        config: resolveConfig(dependencies),
        input: queryInput,
        reason: `Record ${selectedRecordId} is not supported for graph neighborhood reads; expected a wiki_page record ID.`,
        action: "Select a Wiki Page record, then retry the bounded Graph Wiki neighborhood read.",
      }),
    };
  }

  const result = await runQuery(
    operation,
    wikiPageNeighborhoodQuery(selectedRecordId, limit),
    queryInput,
    dependencies,
    "Read the selected Wiki Page neighborhood, including Citation and Manual Link edges, from the Graph Wiki database.",
  );
  if (!result.ok) return result;

  return {
    ...result,
    data: wikiPageNeighborhoodData(selectedRecordId, limit, result.data),
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
    agentSessionSelect("agent_session", "ORDER BY created_at DESC"),
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
    agentSessionSelect(recordId(id, "agent_session")),
    { id },
    dependencies,
    "agent_session",
  );
}

export async function createOrResumeWorkspaceAgentSession(
  input: WorkspaceAgentSessionInput,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<WorkspaceAgentSessionData>> {
  const operation = "web.graph.agent_session.workspace.resume";
  const workspaceKey = normalizeWorkspaceKey(input.workspaceKey);
  const purpose = input.purpose ?? "Codex-powered Agent Workspace";
  const existingResult = await queryRows<AgentSessionRecord>(
    operation,
    agentSessionSelect("agent_session", `WHERE workspace_key = "${escapeSurrealString(workspaceKey)}" LIMIT 1`),
    { workspaceKey },
    dependencies,
    "agent_session",
  );
  if (!existingResult.ok) return existingResult;

  const existing = existingResult.data[0];
  if (existing) {
    return {
      ...existingResult,
      data: { session: existing, created: false },
    };
  }

  const sessionId = `agent_session:${(dependencies.newId ?? randomUUID)().replaceAll("-", "")}`;
  const createdResult = await querySingle<AgentSessionRecord>(
    operation,
    [
      `CREATE ${sessionId} SET purpose = "${escapeSurrealString(purpose)}", workspace_key = "${escapeSurrealString(workspaceKey)}", created_at = time::now();`,
      agentSessionSelect(sessionId),
    ].join("\n"),
    { workspaceKey, sessionId },
    dependencies,
    "agent_session",
  );
  if (!createdResult.ok) return createdResult;
  if (createdResult.data === undefined) {
    return {
      ok: false,
      error: operationFailure({
        operation,
        config: resolveConfig(dependencies),
        input: { workspaceKey, sessionId },
        reason: `Agent Session ${sessionId} was created but SELECT returned no session record.`,
        action: "Retry workspace startup and inspect the agent_session table if creation continues to return no row.",
      }),
    };
  }

  return {
    ...createdResult,
    data: { session: createdResult.data, created: true },
  };
}

export async function recordAgentSessionCodexThread(
  input: CodexThreadMetadataInput,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<AgentSessionRecord | undefined>> {
  const operation = "web.graph.agent_session.codex_thread.record";
  const sessionId = recordId(input.sessionId, "agent_session");
  return querySingle(
    operation,
    [
      `UPDATE ${sessionId} SET codex_thread_id = "${escapeSurrealString(input.threadId)}", codex_model = ${optionalString(input.model)}, codex_model_provider = ${optionalString(input.modelProvider)}, codex_cwd = ${optionalString(input.cwd)};`,
      agentSessionSelect(sessionId),
    ].join("\n"),
    compactInput({ sessionId, threadId: input.threadId, model: input.model, modelProvider: input.modelProvider }),
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
  return queryRows(
    operation,
    buildAgentActivityListQuery(input.sessionId, "DESC"),
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
    `SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM ${recordId(id, "agent_activity")};`,
    { id },
    dependencies,
    "agent_activity",
  );
}

export async function recordAgentActivity(
  draft: AgentActivityDraft,
  dependencies: WebGraphWikiDependencies = {},
): Promise<WebGraphWikiResult<AgentActivityRecord | undefined>> {
  const operation = "web.graph.agent_activity.record";
  return querySingle(
    operation,
    buildAgentActivityRecordQuery(draft, dependencies.newId),
    compactInput(
      {
        sessionId: draft.sessionId,
        kind: draft.kind,
        status: draft.status,
        operation: draft.operation,
      },
      {
        table: "agent_activity",
        source: draft.source,
      },
    ),
    dependencies,
    "agent_activity",
  );
}

export function buildAgentActivityRecordQuery(draft: AgentActivityDraft, newId: (() => string) | undefined): string {
  return buildSurrealAgentActivityRecordQuery(draft, { newId });
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
  input: Record<string, JsonPrimitive | readonly JsonPrimitive[] | undefined>,
  base: Record<string, JsonPrimitive | readonly JsonPrimitive[] | undefined> = {},
): OperationInput {
  const entries = Object.entries({ ...base, ...input }).filter(
    (entry): entry is [string, JsonPrimitive | readonly JsonPrimitive[]] => isOperationInputValue(entry[1]),
  );
  return Object.fromEntries(entries);
}

function isOperationInputValue(value: unknown): value is JsonPrimitive | readonly JsonPrimitive[] {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return true;
  }
  return Array.isArray(value) && value.every((item) => isOperationInputValue(item) && !Array.isArray(item));
}

function queryId(operation: string, input: OperationInput): string {
  const identifier =
    input.id ??
    input.selectedRecordId ??
    input.pageId ??
    input.sourceDocumentId ??
    input.sessionId ??
    input.table ??
    "query";
  return `${operation}:${String(identifier)}`;
}

function agentSessionSelect(target: string, suffix = ""): string {
  const clause = suffix ? ` ${suffix}` : "";
  return `SELECT id, purpose, workspace_key, codex_thread_id, codex_model, codex_model_provider, codex_cwd, created_at FROM ${target}${clause};`;
}

function normalizeWorkspaceKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "default";
}

function optionalString(value: string | undefined): string {
  return value === undefined ? "NONE" : `"${escapeSurrealString(value)}"`;
}

function recordId(
  value: string,
  fallbackTable: "agent_activity" | "agent_session" | "change_log" | "source_document" | "wiki_page",
): string {
  if (value.includes(":")) return value;
  const slug = toSlug(value);
  return `${fallbackTable}:${slug.replace(/-/g, "_")}`;
}

function graphSelectedRecordId(input: GraphNeighborhoodInput): string {
  if (input.pageId) return recordId(input.pageId, "wiki_page");
  if (input.recordId) return input.recordId;
  return pageIdFromInput(input);
}

function graphNodeKind(recordIdValue: string): GraphNeighborhoodNode["kind"] | undefined {
  if (recordIdValue.startsWith("wiki_page:")) return "wiki_page";
  return undefined;
}

function graphLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return 25;
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

function wikiPageNeighborhoodQuery(pageId: string, limit: number): string {
  const citedDocuments = `(SELECT VALUE out FROM cites WHERE in = ${pageId} LIMIT ${limit})`;
  return [
    `SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM ${pageId} LIMIT ${limit};`,
    `SELECT id, in, out, key, label, quote, created_at FROM cites WHERE in = ${pageId} ORDER BY key ASC LIMIT ${limit};`,
    `SELECT id, title, kind, sha256, mime_type, page_count, source_uri, extraction_status, created_at, updated_at FROM source_document WHERE id IN ${citedDocuments} ORDER BY updated_at DESC, title ASC LIMIT ${limit};`,
    `SELECT id, in, out, reason, label, created_session, created_at FROM manual_link WHERE in = ${pageId} OR out = ${pageId} ORDER BY created_at DESC LIMIT ${limit};`,
    `SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM wiki_page WHERE id IN (SELECT VALUE out FROM manual_link WHERE in = ${pageId} LIMIT ${limit}) OR id IN (SELECT VALUE in FROM manual_link WHERE out = ${pageId} LIMIT ${limit}) ORDER BY updated_at DESC, title ASC LIMIT ${limit};`,
    `SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM wiki_page WHERE id != ${pageId} AND id IN (SELECT VALUE in FROM cites WHERE out IN ${citedDocuments} LIMIT ${limit}) ORDER BY updated_at DESC, title ASC LIMIT ${limit};`,
    `SELECT id, in, out, key, label, quote, created_at FROM cites WHERE in != ${pageId} AND out IN ${citedDocuments} ORDER BY key ASC LIMIT ${limit};`,
    `SELECT id, title, slug, body, frame, frame_metadata, created_at, updated_at FROM wiki_page ORDER BY updated_at DESC LIMIT ${limit * 4};`,
  ].join("\n");
}

function wikiPageNeighborhoodData(selectedRecordId: string, limit: number, result: unknown): GraphNeighborhoodData {
  const nodes = new Map<string, GraphNeighborhoodNode>();
  const edges = new Map<string, GraphNeighborhoodEdge>();

  addWikiPageNodes(nodes, rowsAt<WikiPageRecord>(result, 0), selectedRecordId);
  addSourceDocumentNodes(nodes, rowsAt<SourceDocumentRecord>(result, 2));
  addGraphEdges(edges, rowsAt<CitationGraphEdgeRow>(result, 1), "citation");
  addGraphEdges(edges, rowsAt<ManualLinkRecord>(result, 3), "manual_link");
  addWikiPageNodes(nodes, rowsAt<WikiPageRecord>(result, 4), selectedRecordId);
  addWikiPageNodes(nodes, rowsAt<WikiPageRecord>(result, 5), selectedRecordId);
  addGraphEdges(edges, rowsAt<CitationGraphEdgeRow>(result, 6), "citation");
  addWikiPageReferenceEdges(nodes, edges, rowsAt<WikiPageRecord>(result, 0), rowsAt<WikiPageRecord>(result, 7));

  return {
    selectedRecordId,
    selectedKind: "wiki_page",
    limit,
    nodes: [...nodes.values()],
    edges: [...edges.values()].filter((edge) => nodes.has(edge.from) && nodes.has(edge.to)),
  };
}

type CitationGraphEdgeRow = CitationRecord & {
  readonly in?: unknown;
  readonly out?: unknown;
  readonly created_at?: string;
};

function addWikiPageNodes(
  nodes: Map<string, GraphNeighborhoodNode>,
  records: readonly WikiPageRecord[],
  selectedRecordId: string,
): void {
  for (const record of records) {
    if (!record.id || nodes.has(record.id)) continue;
    nodes.set(record.id, {
      id: record.id,
      kind: "wiki_page",
      label: record.title,
      selected: record.id === selectedRecordId,
      navigation: {
        recordId: record.id,
        slug: record.slug,
      },
      metadata: compactInput({
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        frame: graphRecordId(record.frame),
        frameMetadata: metadataSummary(record.frame_metadata),
      }),
    });
  }
}

function addSourceDocumentNodes(
  nodes: Map<string, GraphNeighborhoodNode>,
  records: readonly SourceDocumentRecord[],
): void {
  for (const record of records) {
    if (!record.id || nodes.has(record.id)) continue;
    nodes.set(record.id, {
      id: record.id,
      kind: "source_document",
      label: record.title,
      selected: false,
      navigation: {
        recordId: record.id,
        sourceDocumentId: record.id,
      },
      metadata: compactInput({
        kind: record.kind,
        mimeType: record.mime_type,
        pageCount: record.page_count,
        extractionStatus: record.extraction_status,
        corpus: record.corpus,
        documentClass: record.document_class,
        trustStatus: record.trust_status,
        frame: graphRecordId(record.frame),
        frameMetadata: metadataSummary(record.frame_metadata),
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      }),
    });
  }
}

function addWikiPageReferenceEdges(
  nodes: Map<string, GraphNeighborhoodNode>,
  edges: Map<string, GraphNeighborhoodEdge>,
  sourcePages: readonly WikiPageRecord[],
  candidatePages: readonly WikiPageRecord[],
): void {
  for (const source of sourcePages) {
    for (const reference of parseWikiPageReferences(source.body ?? "").references) {
      const target = candidatePages.find(
        (page) =>
          page.id === reference.target || page.slug === toSlug(reference.target) || page.title === reference.target,
      );
      if (!target?.id) continue;
      addWikiPageNodes(nodes, [target], source.id);
      const id = `${source.id}->wiki_page_reference->${target.id}:${reference.index}`;
      edges.set(id, {
        id,
        kind: "wiki_page_reference",
        from: source.id,
        to: target.id,
        label: reference.label ?? reference.target,
        metadata: compactInput({
          marker: reference.marker,
          index: reference.index,
        }),
      });
    }
  }
}

function addGraphEdges(
  edges: Map<string, GraphNeighborhoodEdge>,
  records: readonly (CitationGraphEdgeRow | ManualLinkRecord)[],
  kind: GraphNeighborhoodEdge["kind"],
): void {
  for (const record of records) {
    const from = graphRecordId(record.in);
    const to = graphRecordId(record.out);
    if (!from || !to) continue;
    const id = record.id ?? `${from}->${kind === "citation" ? "cites" : "manual_link"}->${to}`;
    if (edges.has(id)) continue;
    edges.set(id, {
      id,
      kind,
      from,
      to,
      label: edgeLabel(record, kind),
      metadata:
        kind === "citation"
          ? compactInput({
              key: "key" in record ? record.key : undefined,
              quote: "quote" in record ? record.quote : undefined,
              createdAt: record.created_at,
            })
          : compactInput({
              reason: "reason" in record ? record.reason : undefined,
              createdSession: "created_session" in record ? graphRecordId(record.created_session) : undefined,
              createdAt: record.created_at,
            }),
    });
  }
}

function edgeLabel(
  record: CitationGraphEdgeRow | ManualLinkRecord,
  kind: GraphNeighborhoodEdge["kind"],
): string | undefined {
  if (typeof record.label === "string" && record.label.length > 0) return record.label;
  if (kind === "citation" && "key" in record && typeof record.key === "string") return record.key;
  return undefined;
}

function graphRecordId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return undefined;
}

function metadataSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  return JSON.stringify(value);
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
