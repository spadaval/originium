import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { toSlug } from "@originium/domain";

export type SurrealConfig = {
  readonly url: string;
  readonly namespace: string;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly binary: string;
  readonly bind: string;
  readonly dataDir: string;
  readonly bucketDir: string;
  readonly pidFile: string;
};

export type SafeSurrealTarget = {
  readonly url: string;
  readonly namespace: string;
  readonly database: string;
};

export type SurrealOperationFailure = {
  readonly kind: "operation_failure";
  readonly operation: string;
  readonly target: SafeSurrealTarget;
  readonly input: {
    readonly queryId: string;
  };
  readonly reason: string;
  readonly action: string;
};

export type SurrealQueryResult =
  | {
      readonly ok: true;
      readonly operation: "surreal.query";
      readonly target: SafeSurrealTarget;
      readonly input: {
        readonly queryId: string;
      };
      readonly result: unknown;
    }
  | {
      readonly ok: false;
      readonly error: SurrealOperationFailure;
    };

export type SurrealFetch = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

export const coreSchemaPath = "schema/core.surql";
export const sourceDocumentBucketName = "source_documents";
export const agentActivitySources = ["codex_app_server", "cli", "web"] as const;
export const agentActivityKinds = [
  "message",
  "command",
  "tool",
  "file_change",
  "graph_mutation",
  "status",
  "error",
] as const;
export const agentActivityStatuses = ["started", "streaming", "completed", "failed"] as const;

export type AgentActivitySource = (typeof agentActivitySources)[number];
export type AgentActivityKind = (typeof agentActivityKinds)[number];
export type AgentActivityStatus = (typeof agentActivityStatuses)[number];

export type AgentActivityRecord = {
  readonly id: string;
  readonly agent_session: string;
  readonly source: AgentActivitySource;
  readonly kind: AgentActivityKind;
  readonly status: AgentActivityStatus;
  readonly summary: string;
  readonly operation?: string;
  readonly target_records: readonly string[];
  readonly metadata?: Record<string, unknown>;
  readonly created_at?: string;
};

export type AgentActivityDraft = {
  readonly id?: string;
  readonly sessionId: string;
  readonly createSession?: boolean;
  readonly source: AgentActivitySource;
  readonly kind: AgentActivityKind;
  readonly status: AgentActivityStatus;
  readonly summary: string;
  readonly operation?: string;
  readonly targetRecords: readonly string[];
  readonly metadata?: Record<string, unknown>;
};

export function readSurrealConfig(env: NodeJS.ProcessEnv = process.env): SurrealConfig {
  return {
    url: env.ORIGINIUM_SURREAL_URL ?? "http://127.0.0.1:8000",
    namespace: env.ORIGINIUM_SURREAL_NAMESPACE ?? "originium",
    database: env.ORIGINIUM_SURREAL_DATABASE ?? "originium",
    user: env.ORIGINIUM_SURREAL_USER ?? "root",
    password: env.ORIGINIUM_SURREAL_PASSWORD ?? "root",
    binary: env.ORIGINIUM_SURREAL_BIN ?? "surreal",
    bind: env.ORIGINIUM_SURREAL_BIND ?? "127.0.0.1:8000",
    dataDir: resolve(env.ORIGINIUM_SURREAL_DATA_DIR ?? ".originium/surrealdb"),
    bucketDir: resolve(env.ORIGINIUM_SURREAL_BUCKET_DIR ?? ".originium/surreal-files"),
    pidFile: resolve(env.ORIGINIUM_SURREAL_PID_FILE ?? ".originium/surrealdb.pid"),
  };
}

export function describeSurrealTarget(config: SurrealConfig): SafeSurrealTarget {
  return {
    url: redactUrlCredentials(config.url),
    namespace: config.namespace,
    database: config.database,
  };
}

export async function executeSurrealQuery(
  config: SurrealConfig,
  query: string,
  options: {
    readonly fetch?: SurrealFetch;
    readonly queryId?: string;
  } = {},
): Promise<SurrealQueryResult> {
  const operation = "surreal.query";
  const target = describeSurrealTarget(config);
  const queryId = options.queryId ?? "inline-query";
  const fetchImpl = options.fetch ?? fetch;

  try {
    const endpoint = sqlEndpoint(config.url);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${config.user}:${config.password}`)}`,
        "Content-Type": "application/surrealql",
        "Surreal-DB": config.database,
        "Surreal-NS": config.namespace,
      },
      body: query,
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        error: operationFailure({
          operation,
          target,
          queryId,
          reason: `SurrealDB HTTP request failed with status ${response.status} ${response.statusText}: ${body}`.trim(),
          action: "Verify the SurrealDB process is reachable and the namespace, database, and credentials are valid.",
        }),
      };
    }

    const result = await response.json();
    const failure = firstSurrealStatementFailure(result);
    if (failure) {
      return {
        ok: false,
        error: operationFailure({
          operation,
          target,
          queryId,
          reason: failure,
          action:
            "Inspect the SurrealQL statement, database capabilities, namespace/database, and configured file bucket support.",
        }),
      };
    }

    return {
      ok: true,
      operation,
      target,
      input: { queryId },
      result,
    };
  } catch (error) {
    return {
      ok: false,
      error: operationFailure({
        operation,
        target,
        queryId,
        reason: error instanceof Error ? error.message : String(error),
        action: "Start SurrealDB or set ORIGINIUM_SURREAL_URL to a reachable HTTP endpoint.",
      }),
    };
  }
}

export async function smokeSurrealConnection(
  config: SurrealConfig = readSurrealConfig(),
  options: {
    readonly fetch?: SurrealFetch;
  } = {},
): Promise<SurrealQueryResult> {
  return executeSurrealQuery(config, "RETURN true;", {
    fetch: options.fetch,
    queryId: "db-status-smoke",
  });
}

export function sourceDocumentBucketSurql(config: SurrealConfig = readSurrealConfig()): string {
  return `DEFINE BUCKET IF NOT EXISTS ${sourceDocumentBucketName} BACKEND "file:${config.bucketDir}";`;
}

export function buildAgentActivityRecordQuery(
  draft: AgentActivityDraft,
  options: {
    readonly newId?: () => string;
    readonly implicitSessionPurpose?: string;
  } = {},
): string {
  const sessionId = agentActivitySessionRecordId(draft.sessionId);
  const activityId = draft.id ?? `agent_activity:${(options.newId ?? randomUUID)().replaceAll("-", "")}`;
  const metadata = draft.metadata === undefined ? "NONE" : JSON.stringify(draft.metadata);

  return [
    draft.createSession
      ? `CREATE ${sessionId} SET purpose = "${escapeSurrealString(options.implicitSessionPurpose ?? "Implicit Agent Activity session")}", created_at = time::now();`
      : "",
    `CREATE ${activityId} SET agent_session = ${sessionId}, source = "${draft.source}", kind = "${draft.kind}", status = "${draft.status}", summary = "${escapeSurrealString(draft.summary)}", operation = ${draft.operation === undefined ? "NONE" : `"${escapeSurrealString(draft.operation)}"`}, target_records = ${surrealArray(draft.targetRecords)}, metadata = ${metadata}, created_at = time::now();`,
    `SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM ${activityId};`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAgentActivityListQuery(sessionId?: string, order: "ASC" | "DESC" = "ASC"): string {
  const where = sessionId ? ` WHERE agent_session = ${agentActivitySessionRecordId(sessionId)}` : "";
  return `SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM agent_activity${where} ORDER BY created_at ${order};`;
}

export function defaultAgentActivityStatus(kind: string | undefined): AgentActivityStatus {
  return kind === "error" ? "failed" : "completed";
}

export function isAgentActivitySource(value: string): value is AgentActivitySource {
  return agentActivitySources.includes(value as AgentActivitySource);
}

export function isAgentActivityKind(value: string | undefined): value is AgentActivityKind {
  return value !== undefined && agentActivityKinds.includes(value as AgentActivityKind);
}

export function isAgentActivityStatus(value: string): value is AgentActivityStatus {
  return agentActivityStatuses.includes(value as AgentActivityStatus);
}

export function localSurrealStartCommand(config: SurrealConfig = readSurrealConfig()): {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, string>;
} {
  return {
    command: config.binary,
    args: [
      "start",
      "--no-banner",
      "--log",
      "warn",
      "--bind",
      config.bind,
      "--user",
      config.user,
      "--pass",
      config.password,
      "--allow-http",
      "--allow-rpc",
      "--",
      `surrealkv:${config.dataDir}`,
    ],
    env: {
      SURREAL_BUCKET_FOLDER_ALLOWLIST: config.bucketDir,
      SURREAL_CAPS_ALLOW_EXPERIMENTAL: "files",
      SURREAL_DEFAULT_DATABASE: config.database,
      SURREAL_DEFAULT_NAMESPACE: config.namespace,
    },
  };
}

function operationFailure(input: {
  readonly operation: string;
  readonly target: SafeSurrealTarget;
  readonly queryId: string;
  readonly reason: string;
  readonly action: string;
}): SurrealOperationFailure {
  return {
    kind: "operation_failure",
    operation: input.operation,
    target: input.target,
    input: { queryId: input.queryId },
    reason: input.reason,
    action: input.action,
  };
}

function agentActivitySessionRecordId(value: string): string {
  if (value.includes(":")) return value;
  return `agent_session:${toSlug(value).replace(/-/g, "_")}`;
}

function escapeSurrealString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function surrealArray(values: readonly string[]): string {
  return `[${values.map((value) => `"${escapeSurrealString(value)}"`).join(", ")}]`;
}

function sqlEndpoint(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.pathname = joinPath(url.pathname, "sql");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function firstSurrealStatementFailure(result: unknown): string | undefined {
  if (!Array.isArray(result)) return undefined;

  const failure = result.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return "status" in entry && entry.status === "ERR";
  });
  if (!failure || typeof failure !== "object") return undefined;

  if ("result" in failure && typeof failure.result === "string") {
    return failure.result;
  }
  return JSON.stringify(failure);
}

function redactUrlCredentials(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.username = "";
    url.password = "";
    const safeUrl = url.toString();
    return url.pathname === "/" && !url.search && !url.hash ? safeUrl.slice(0, -1) : safeUrl;
  } catch {
    return "[invalid-url]";
  }
}

function joinPath(basePath: string, childPath: string): string {
  const normalizedBase = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  return `${normalizedBase}/${childPath}`;
}
