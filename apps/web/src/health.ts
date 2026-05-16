import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import {
  describeSurrealTarget,
  executeSurrealQuery,
  type SurrealFetch,
  sourceDocumentBucketSurql,
} from "@originium/surreal";
import type { WebRuntimeConfig } from "./config.ts";

export type WebRuntimeHealthStatus = "ok" | "degraded" | "failed";

export type WebRuntimeHealthCheckName = "surrealdb" | "cli" | "codex-app-server" | "source-pdf-bucket" | "web-backend";

export type WebRuntimeHealthFailure = {
  readonly operation: string;
  readonly target: string;
  readonly input?: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
};

export type WebRuntimeHealthCheck = {
  readonly name: WebRuntimeHealthCheckName;
  readonly status: WebRuntimeHealthStatus;
  readonly operation: string;
  readonly target: string;
  readonly message: string;
  readonly input?: Record<string, unknown>;
  readonly failure?: WebRuntimeHealthFailure;
};

export type WebRuntimeHealthReport = {
  readonly operation: "web.runtime.health";
  readonly status: WebRuntimeHealthStatus;
  readonly checks: readonly WebRuntimeHealthCheck[];
};

type FileStat = {
  readonly isDirectory: () => boolean;
};

export type WebRuntimeHealthDependencies = {
  readonly access?: (path: string, mode?: number) => Promise<void>;
  readonly fetch?: SurrealFetch;
  readonly stat?: (path: string) => Promise<FileStat>;
};

export async function checkWebRuntimeHealth(
  config: WebRuntimeConfig,
  dependencies: WebRuntimeHealthDependencies = {},
): Promise<WebRuntimeHealthReport> {
  const checks = await Promise.all([
    checkSurrealDb(config, dependencies),
    checkCli(config, dependencies),
    checkCodexAppServer(config, dependencies),
    checkSourcePdfBucket(config, dependencies),
    checkWebBackend(config),
  ]);

  return {
    operation: "web.runtime.health",
    status: summarizeStatus(checks),
    checks,
  };
}

async function checkSurrealDb(
  config: WebRuntimeConfig,
  dependencies: WebRuntimeHealthDependencies,
): Promise<WebRuntimeHealthCheck> {
  const operation = "web.runtime.health.surrealdb";
  const target = describeSurrealTarget(config.surreal);
  const input = {
    bucketName: config.sourcePdf.bucketName,
    bucketDir: config.surreal.bucketDir,
    queryId: "web.runtime.health.surrealdb",
  };
  const result = await executeSurrealQuery(
    config.surreal,
    `${sourceDocumentBucketSurql(config.surreal)}\nRETURN true;`,
    {
      fetch: dependencies.fetch,
      queryId: input.queryId,
    },
  );

  if (result.ok) {
    return {
      name: "surrealdb",
      status: "ok",
      operation,
      target: `${target.url} ns=${target.namespace} db=${target.database}`,
      input,
      message: `SurrealDB is reachable and bucket '${config.sourcePdf.bucketName}' is definable.`,
    };
  }

  return failedCheck({
    name: "surrealdb",
    operation,
    target: `${target.url} ns=${target.namespace} db=${target.database}`,
    input,
    reason: result.error.reason,
    action:
      "Start SurrealDB with the Originium db start command, verify ORIGINIUM_SURREAL_URL, namespace, database, credentials, and ensure the file bucket directory is allowed.",
  });
}

async function checkCli(
  config: WebRuntimeConfig,
  dependencies: WebRuntimeHealthDependencies,
): Promise<WebRuntimeHealthCheck> {
  const operation = "web.runtime.health.cli";
  const input = { path: config.cli.path };
  const accessImpl = dependencies.access ?? access;

  try {
    await accessImpl(config.cli.path, constants.X_OK);
    return {
      name: "cli",
      status: "ok",
      operation,
      target: config.cli.path,
      input,
      message: "Originium CLI is present and executable.",
    };
  } catch (error) {
    return failedCheck({
      name: "cli",
      operation,
      target: config.cli.path,
      input,
      reason: errorReason(error),
      action:
        "Build the CLI with `bun run --filter=@originium/cli build` or set ORIGINIUM_CLI_PATH to an executable Originium CLI binary.",
    });
  }
}

async function checkCodexAppServer(
  config: WebRuntimeConfig,
  dependencies: WebRuntimeHealthDependencies,
): Promise<WebRuntimeHealthCheck> {
  const operation = "web.runtime.health.codex-app-server";
  const input = {
    url: config.codexAppServer.url,
    listen: `${config.codexAppServer.listen.host}:${config.codexAppServer.listen.port}`,
  };
  const fetchImpl = dependencies.fetch ?? fetch;

  try {
    const response = await fetchImpl(config.codexAppServer.url, {
      method: "GET",
      headers: { Accept: "application/json, text/plain, */*" },
    });

    if (response.status >= 500) {
      return failedCheck({
        name: "codex-app-server",
        operation,
        target: config.codexAppServer.url,
        input,
        reason: `Codex app-server HTTP request failed with status ${response.status} ${response.statusText}`.trim(),
        action:
          "Inspect the Codex app-server logs, restart it on the configured bind address, or set ORIGINIUM_CODEX_APP_SERVER_URL to the reachable endpoint.",
      });
    }

    return {
      name: "codex-app-server",
      status: "ok",
      operation,
      target: config.codexAppServer.url,
      input,
      message: `Codex app-server responded with HTTP ${response.status}.`,
    };
  } catch (error) {
    return failedCheck({
      name: "codex-app-server",
      operation,
      target: config.codexAppServer.url,
      input,
      reason: errorReason(error),
      action:
        "Start the Codex app-server on the configured bind address or set ORIGINIUM_CODEX_APP_SERVER_URL to the reachable HTTP endpoint.",
    });
  }
}

async function checkSourcePdfBucket(
  config: WebRuntimeConfig,
  dependencies: WebRuntimeHealthDependencies,
): Promise<WebRuntimeHealthCheck> {
  const operation = "web.runtime.health.source-pdf-bucket";
  const input = {
    enabled: config.sourcePdf.enabled,
    bucketName: config.sourcePdf.bucketName,
    bucketDir: config.sourcePdf.bucketDir,
    routePrefix: config.sourcePdf.routePrefix,
  };

  if (!config.sourcePdf.enabled) {
    return degradedCheck({
      name: "source-pdf-bucket",
      operation,
      target: config.sourcePdf.bucketDir,
      input,
      reason: "backend PDF serving is disabled by ORIGINIUM_WEB_SOURCE_PDFS_ENABLED",
      action: "Set ORIGINIUM_WEB_SOURCE_PDFS_ENABLED=true when this host must serve source PDFs.",
    });
  }

  const statImpl = dependencies.stat ?? stat;
  const accessImpl = dependencies.access ?? access;

  try {
    const bucketStat = await statImpl(config.sourcePdf.bucketDir);
    if (!bucketStat.isDirectory()) {
      return failedCheck({
        name: "source-pdf-bucket",
        operation,
        target: config.sourcePdf.bucketDir,
        input,
        reason: "configured source PDF bucket path is not a directory",
        action:
          "Create a directory for ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR or point it at the SurrealDB file bucket directory.",
      });
    }

    await accessImpl(config.sourcePdf.bucketDir, constants.R_OK | constants.W_OK);
    return {
      name: "source-pdf-bucket",
      status: "ok",
      operation,
      target: config.sourcePdf.bucketDir,
      input,
      message: `Source PDF bucket directory is readable and writable for route ${config.sourcePdf.routePrefix}.`,
    };
  } catch (error) {
    return failedCheck({
      name: "source-pdf-bucket",
      operation,
      target: config.sourcePdf.bucketDir,
      input,
      reason: errorReason(error),
      action:
        "Create the source PDF bucket directory and grant the web process read/write access, or set ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR to the correct bucket path.",
    });
  }
}

function checkWebBackend(config: WebRuntimeConfig): WebRuntimeHealthCheck {
  const operation = "web.runtime.health.web-backend";
  const target = `${config.backend.listen.host}:${config.backend.listen.port}`;
  return {
    name: "web-backend",
    status: "ok",
    operation,
    target,
    input: {
      listen: target,
      sourcePdfRoutePrefix: config.sourcePdf.routePrefix,
    },
    message: "Web backend listen target and host-direct route assumptions are configured.",
  };
}

function summarizeStatus(checks: readonly WebRuntimeHealthCheck[]): WebRuntimeHealthStatus {
  if (checks.some((check) => check.status === "failed")) return "failed";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

function failedCheck(input: {
  readonly name: WebRuntimeHealthCheckName;
  readonly operation: string;
  readonly target: string;
  readonly input?: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
}): WebRuntimeHealthCheck {
  return {
    name: input.name,
    status: "failed",
    operation: input.operation,
    target: input.target,
    input: input.input,
    message: `${input.operation} failed: ${input.reason}`,
    failure: {
      operation: input.operation,
      target: input.target,
      input: input.input,
      reason: input.reason,
      action: input.action,
    },
  };
}

function degradedCheck(input: {
  readonly name: WebRuntimeHealthCheckName;
  readonly operation: string;
  readonly target: string;
  readonly input?: Record<string, unknown>;
  readonly reason: string;
  readonly action: string;
}): WebRuntimeHealthCheck {
  return {
    name: input.name,
    status: "degraded",
    operation: input.operation,
    target: input.target,
    input: input.input,
    message: `${input.operation} degraded: ${input.reason}`,
    failure: {
      operation: input.operation,
      target: input.target,
      input: input.input,
      reason: input.reason,
      action: input.action,
    },
  };
}

function errorReason(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const path = "path" in error && typeof error.path === "string" ? ` ${error.path}` : "";
    return `${error.code}${path}`;
  }
  return error instanceof Error ? error.message : String(error);
}
