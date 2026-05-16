import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readWebRuntimeConfig } from "./config.ts";
import { checkWebRuntimeHealth, type WebRuntimeHealthCheckName } from "./health.ts";

test("reports ok runtime health when host deployment dependencies respond", async () => {
  const bucketDir = await mkdtemp(join(tmpdir(), "originium-web-health-"));
  try {
    const config = readWebRuntimeConfig({
      ORIGINIUM_CLI_PATH: "apps/cli/dist/originium",
      ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR: bucketDir,
    });
    const report = await checkWebRuntimeHealth(config, {
      access: async () => {},
      fetch: async (url) => {
        if (String(url).endsWith("/sql")) {
          return new Response(JSON.stringify([{ status: "OK", result: true }]), { status: 200 });
        }
        return new Response("ok", { status: 204 });
      },
    });

    assert.equal(report.operation, "web.runtime.health");
    assert.equal(report.status, "ok");
    assert.deepEqual(
      report.checks.map((check) => [check.name, check.status]),
      [
        ["surrealdb", "ok"],
        ["cli", "ok"],
        ["codex-app-server", "ok"],
        ["source-pdf-bucket", "ok"],
        ["web-backend", "ok"],
      ],
    );
  } finally {
    await rm(bucketDir, { force: true, recursive: true });
  }
});

test("reports concrete remediation when runtime dependencies are unavailable", async () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_CLI_PATH: "missing/originium",
    ORIGINIUM_CODEX_APP_SERVER_URL: "http://127.0.0.1:3999",
    ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR: "missing/pdfs",
  });
  const report = await checkWebRuntimeHealth(config, {
    access: async (path) => {
      throw Object.assign(new Error(`no access to ${path}`), { code: "ENOENT", path });
    },
    fetch: async (url) => {
      if (String(url).endsWith("/sql")) {
        throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
      }
      throw new Error("connect ECONNREFUSED 127.0.0.1:3999");
    },
    stat: async (path) => {
      throw Object.assign(new Error(`missing ${path}`), { code: "ENOENT", path });
    },
  });

  assert.equal(report.status, "failed");
  assertCheckFailure(report, "surrealdb", /ECONNREFUSED 127\.0\.0\.1:8000/, /Start SurrealDB/);
  assertCheckFailure(report, "cli", /ENOENT.*missing\/originium/, /ORIGINIUM_CLI_PATH/);
  assertCheckFailure(report, "codex-app-server", /ECONNREFUSED 127\.0\.0\.1:3999/, /Codex app-server/);
  assertCheckFailure(report, "source-pdf-bucket", /ENOENT.*missing\/pdfs/, /ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR/);

  const backend = report.checks.find((check) => check.name === "web-backend");
  assert.equal(backend?.status, "ok");
});

test("reports degraded source PDF status when backend PDF serving is disabled", async () => {
  const config = readWebRuntimeConfig({
    ORIGINIUM_WEB_SOURCE_PDFS_ENABLED: "false",
  });
  const report = await checkWebRuntimeHealth(config, {
    access: async () => {},
    fetch: async (url) => {
      if (String(url).endsWith("/sql")) {
        return new Response(JSON.stringify([{ status: "OK", result: true }]), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    },
  });

  assert.equal(report.status, "degraded");
  assertCheckFailure(report, "source-pdf-bucket", /PDF serving is disabled/, /ORIGINIUM_WEB_SOURCE_PDFS_ENABLED=true/);
});

test("reports non-directory source PDF bucket paths as failed", async () => {
  const config = readWebRuntimeConfig({});
  const report = await checkWebRuntimeHealth(config, {
    access: async () => {},
    fetch: async (url) => {
      if (String(url).endsWith("/sql")) {
        return new Response(JSON.stringify([{ status: "OK", result: true }]), { status: 200 });
      }
      return new Response("ok", { status: 200 });
    },
    stat: async () => ({ isDirectory: () => false }),
  });

  assert.equal(report.status, "failed");
  assertCheckFailure(report, "source-pdf-bucket", /not a directory/, /Create a directory/);
});

function assertCheckFailure(
  report: Awaited<ReturnType<typeof checkWebRuntimeHealth>>,
  name: WebRuntimeHealthCheckName,
  reason: RegExp,
  action: RegExp,
): void {
  const check = report.checks.find((candidate) => candidate.name === name);
  assert.equal(check?.failure?.operation, check?.operation);
  assert.equal(check?.failure?.target, check?.target);
  assert.match(check?.failure?.reason ?? "", reason);
  assert.match(check?.failure?.action ?? "", action);
}
