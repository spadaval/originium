import { resolve } from "node:path";

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
