import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readWebRuntimeConfig, WebRuntimeConfigError } from "./config.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const webRoot = resolve(repoRoot, "apps/web");

test("reads host-direct web runtime defaults", () => {
  const config = readWebRuntimeConfig({});

  assert.deepEqual(config.backend.listen, { host: "127.0.0.1", port: 3000 });
  assert.deepEqual(config.codexAppServer.listen, { host: "127.0.0.1", port: 3001 });
  assert.equal(config.codexAppServer.url, "http://127.0.0.1:3001");
  assert.equal(config.cli.path, resolve(repoRoot, "apps/cli/dist/originium"));
  assert.equal(config.sourcePdf.enabled, true);
  assert.equal(config.sourcePdf.routePrefix, "/sources/pdf");
  assert.equal(config.sourcePdf.bucketName, "source_documents");
  assert.equal(config.sourcePdf.bucketDir, resolve(repoRoot, ".originium/surreal-files"));
  assert.equal(config.surreal.url, "http://127.0.0.1:8000");
  assert.equal(config.surreal.namespace, "originium");
  assert.equal(config.surreal.database, "originium");
});

test("repo-owned defaults are stable from repo root or apps/web cwd", () => {
  const expectedCliPath = resolve(repoRoot, "apps/cli/dist/originium");
  const expectedBucketDir = resolve(repoRoot, ".originium/surreal-files");
  const expectedDataDir = resolve(repoRoot, ".originium/surrealdb");
  const expectedPidFile = resolve(repoRoot, ".originium/surrealdb.pid");

  for (const cwd of [repoRoot, webRoot]) {
    withWorkingDirectory(cwd, () => {
      const config = readWebRuntimeConfig({});

      assert.equal(config.cli.path, expectedCliPath);
      assert.equal(config.sourcePdf.bucketDir, expectedBucketDir);
      assert.equal(config.surreal.bucketDir, expectedBucketDir);
      assert.equal(config.surreal.dataDir, expectedDataDir);
      assert.equal(config.surreal.pidFile, expectedPidFile);
    });
  }
});

test("reads web runtime environment overrides", () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_CLI_PATH: "tmp/originium",
    ORIGINIUM_CODEX_APP_SERVER_BIND: "127.0.0.1:4101",
    ORIGINIUM_CODEX_APP_SERVER_URL: "http://localhost:4101/api/",
    ORIGINIUM_SURREAL_BUCKET_DIR: "tmp/surreal-bucket",
    ORIGINIUM_SURREAL_DATABASE: "graph",
    ORIGINIUM_SURREAL_NAMESPACE: "wiki",
    ORIGINIUM_SURREAL_URL: "http://127.0.0.1:8100",
    ORIGINIUM_WEB_BACKEND_BIND: "0.0.0.0:4100",
    ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR: "tmp/web-pdfs",
    ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX: "/pdfs",
    ORIGINIUM_WEB_SOURCE_PDFS_ENABLED: "false",
  });

  assert.deepEqual(config.backend.listen, { host: "0.0.0.0", port: 4100 });
  assert.deepEqual(config.codexAppServer.listen, { host: "127.0.0.1", port: 4101 });
  assert.equal(config.codexAppServer.url, "http://localhost:4101/api");
  assert.equal(config.cli.path, resolve("tmp/originium"));
  assert.equal(config.sourcePdf.enabled, false);
  assert.equal(config.sourcePdf.routePrefix, "/pdfs");
  assert.equal(config.sourcePdf.bucketDir, resolve("tmp/web-pdfs"));
  assert.equal(config.surreal.bucketDir, resolve("tmp/surreal-bucket"));
  assert.equal(config.surreal.namespace, "wiki");
  assert.equal(config.surreal.database, "graph");
});

function withWorkingDirectory(cwd: string, callback: () => void): void {
  const previous = process.cwd();
  try {
    process.chdir(cwd);
    callback();
  } finally {
    process.chdir(previous);
  }
}

test("source PDF serving defaults to the SurrealDB bucket directory override", () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_SURREAL_BUCKET_DIR: "tmp/shared-bucket",
  });

  assert.equal(config.sourcePdf.bucketDir, resolve("tmp/shared-bucket"));
});

test("configuration failures name operation input reason and action", () => {
  assert.throws(
    () =>
      readWebRuntimeConfig({
        ORIGINIUM_CODEX_APP_SERVER_BIND: "127.0.0.1:not-a-port",
      }),
    (error) => {
      assert.equal(error instanceof WebRuntimeConfigError, true);
      const configError = error as WebRuntimeConfigError;
      assert.equal(configError.failure.kind, "configuration_error");
      assert.equal(configError.failure.operation, "web.runtime.config");
      assert.deepEqual(configError.failure.input, {
        name: "ORIGINIUM_CODEX_APP_SERVER_BIND",
        value: "127.0.0.1:not-a-port",
      });
      assert.match(configError.failure.reason, /host:port/);
      assert.match(configError.failure.action, /ORIGINIUM_CODEX_APP_SERVER_BIND/);
      assert.match(configError.message, /operation=web\.runtime\.config/);
      assert.match(configError.message, /input=ORIGINIUM_CODEX_APP_SERVER_BIND=127\.0\.0\.1:not-a-port/);
      assert.match(configError.message, /reason=/);
      assert.match(configError.message, /action=/);
      return true;
    },
  );
});

test("configuration failures reject invalid backend PDF route prefixes", () => {
  assert.throws(
    () =>
      readWebRuntimeConfig({
        ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX: "sources/pdf/",
      }),
    (error) => {
      assert.equal(error instanceof WebRuntimeConfigError, true);
      const configError = error as WebRuntimeConfigError;
      assert.equal(configError.failure.input.name, "ORIGINIUM_WEB_SOURCE_PDF_ROUTE_PREFIX");
      assert.equal(configError.failure.reason, "expected an absolute route prefix without a trailing slash");
      assert.match(configError.failure.action, /\/sources\/pdf/);
      return true;
    },
  );
});
