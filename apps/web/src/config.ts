import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readSurrealConfig, type SurrealConfig, sourceDocumentBucketName } from "@originium/surreal";

export type ListenTarget = {
  readonly host: string;
  readonly port: number;
};

export type CodexAppServerConfig = {
  readonly listen: ListenTarget;
  readonly url: string;
};

export type SourcePdfServingConfig = {
  readonly enabled: boolean;
  readonly routePrefix: string;
  readonly bucketName: string;
  readonly bucketDir: string;
};

export type WebRuntimeConfig = {
  readonly operation: "web.runtime.config";
  readonly backend: {
    readonly listen: ListenTarget;
  };
  readonly codexAppServer: CodexAppServerConfig;
  readonly cli: {
    readonly path: string;
  };
  readonly sourcePdf: SourcePdfServingConfig;
  readonly surreal: SurrealConfig;
};

export type WebRuntimeConfigFailure = {
  readonly kind: "configuration_error";
  readonly operation: "web.runtime.config";
  readonly input: {
    readonly name: string;
    readonly value: string;
  };
  readonly reason: string;
  readonly action: string;
};

export class WebRuntimeConfigError extends Error {
  readonly failure: WebRuntimeConfigFailure;

  constructor(failure: WebRuntimeConfigFailure) {
    super(
      `operation=${failure.operation} input=${failure.input.name}=${failure.input.value} reason=${failure.reason} action=${failure.action}`,
    );
    this.name = "WebRuntimeConfigError";
    this.failure = failure;
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function readWebRuntimeConfig(env: NodeJS.ProcessEnv = process.env): WebRuntimeConfig {
  const surreal = readSurrealConfig({
    ...env,
    ORIGINIUM_SURREAL_BUCKET_DIR: env.ORIGINIUM_SURREAL_BUCKET_DIR ?? resolveRepoPath(".originium/surreal-files"),
    ORIGINIUM_SURREAL_DATA_DIR: env.ORIGINIUM_SURREAL_DATA_DIR ?? resolveRepoPath(".originium/surrealdb"),
    ORIGINIUM_SURREAL_PID_FILE: env.ORIGINIUM_SURREAL_PID_FILE ?? resolveRepoPath(".originium/surrealdb.pid"),
  });
  const backendListen = parseListenTarget(
    env.ORIGINIUM_WEB_BACKEND_BIND ?? "127.0.0.1:3000",
    "ORIGINIUM_WEB_BACKEND_BIND",
  );
  const codexListen = parseListenTarget(
    env.ORIGINIUM_CODEX_APP_SERVER_BIND ?? "127.0.0.1:3001",
    "ORIGINIUM_CODEX_APP_SERVER_BIND",
  );

  return {
    operation: "web.runtime.config",
    backend: {
      listen: backendListen,
    },
    codexAppServer: {
      listen: codexListen,
      url: parseUrl(
        env.ORIGINIUM_CODEX_APP_SERVER_URL ?? `http://${codexListen.host}:${codexListen.port}`,
        "ORIGINIUM_CODEX_APP_SERVER_URL",
      ),
    },
    cli: {
      path: parseRequiredPath(
        env.ORIGINIUM_CLI_PATH ?? resolveRepoPath("apps/cli/dist/originium"),
        "ORIGINIUM_CLI_PATH",
      ),
    },
    sourcePdf: {
      enabled: parseBoolean(env.ORIGINIUM_WEB_SOURCE_PDFS_ENABLED ?? "true", "ORIGINIUM_WEB_SOURCE_PDFS_ENABLED"),
      routePrefix: parseRoutePrefix(
        env.ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX ?? "/sources/pdf",
        "ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX",
      ),
      bucketName: sourceDocumentBucketName,
      bucketDir: resolve(env.ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR ?? surreal.bucketDir),
    },
    surreal,
  };
}

function resolveRepoPath(path: string): string {
  return resolve(repoRoot, path);
}

function parseListenTarget(value: string, name: string): ListenTarget {
  const separator = value.lastIndexOf(":");
  const host = separator === -1 ? "" : value.slice(0, separator);
  const rawPort = separator === -1 ? "" : value.slice(separator + 1);
  const port = Number(rawPort);

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw configFailure({
      name,
      value,
      reason: "expected host:port with a TCP port from 1 to 65535",
      action: `Set ${name} to a host-direct listen target such as 127.0.0.1:3000.`,
    });
  }

  return { host, port };
}

function parseUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      throw new Error(`unsupported protocol ${url.protocol}`);
    }
    return url.toString().replace(/\/$/, "");
  } catch (error) {
    throw configFailure({
      name,
      value,
      reason: error instanceof Error ? error.message : String(error),
      action: `Set ${name} to the Codex app-server endpoint, for example http://127.0.0.1:3001 or ws://127.0.0.1:3001.`,
    });
  }
}

function parseRequiredPath(value: string, name: string): string {
  if (!value.trim()) {
    throw configFailure({
      name,
      value,
      reason: "expected a non-empty filesystem path",
      action: `Set ${name} to the bundled Originium CLI path, for example apps/cli/dist/originium.`,
    });
  }

  return resolve(value);
}

function parseBoolean(value: string, name: string): boolean {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;

  throw configFailure({
    name,
    value,
    reason: "expected one of true, false, 1, or 0",
    action: `Set ${name}=true to enable backend PDF serving or ${name}=false to disable it.`,
  });
}

function parseRoutePrefix(value: string, name: string): string {
  if (!value.startsWith("/") || value.endsWith("/")) {
    throw configFailure({
      name,
      value,
      reason: "expected an absolute route prefix without a trailing slash",
      action: `Set ${name} to a backend route prefix such as /sources/pdf.`,
    });
  }

  return value;
}

function configFailure(input: {
  readonly name: string;
  readonly value: string;
  readonly reason: string;
  readonly action: string;
}): WebRuntimeConfigError {
  return new WebRuntimeConfigError({
    kind: "configuration_error",
    operation: "web.runtime.config",
    input: {
      name: input.name,
      value: input.value,
    },
    reason: input.reason,
    action: input.action,
  });
}
