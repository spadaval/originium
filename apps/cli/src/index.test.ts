import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bundledCli = fileURLToPath(new URL("../dist/originium", import.meta.url));

test("bundled CLI reports the configured SurrealDB target", () => {
  const output = execFileSync(bundledCli, ["db", "status"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_SURREAL_DATABASE: "testdb",
      ORIGINIUM_SURREAL_NAMESPACE: "testns",
      ORIGINIUM_SURREAL_URL: "http://127.0.0.1:8000",
    },
  });

  assert.match(output, /SurrealDB target: http:\/\/127\.0\.0\.1:8000 ns=testns db=testdb/);
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.operation, "db.status");
  assert.deepEqual(result.data.target, {
    url: "http://127.0.0.1:8000",
    namespace: "testns",
    database: "testdb",
  });
});

test("bundled CLI reports structured unknown command failures", () => {
  const result = spawnSync(bundledCli, ["unknown"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.error.kind, "usage_error");
  assert.equal(output.error.operation, "cli.route");
  assert.equal(output.error.input, "unknown");
  assert.match(output.error.reason, /Unknown command group 'unknown'/);
  assert.match(output.error.action, /Choose one of:/);
});

test("bundled CLI reports structured missing argument failures", () => {
  const result = spawnSync(bundledCli, ["db"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.command, "db");
  assert.equal(output.error.kind, "usage_error");
  assert.equal(output.error.operation, "db.route");
  assert.equal(output.error.input, "db");
  assert.equal(output.error.reason, "Missing db command.");
  assert.equal(output.error.action, "Use one of: start, stop, status, doctor, apply-schema.");
});

test("bundled CLI reports structured unknown subgroup failures", () => {
  const result = spawnSync(bundledCli, ["source", "bogus"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.command, "source bogus");
  assert.equal(output.error.kind, "usage_error");
  assert.equal(output.error.operation, "source.route");
  assert.match(output.error.reason, /Unknown source command 'bogus'/);
});

test("bundled acceptance harness reports blocked stages with nonzero exit", () => {
  const result = spawnSync(bundledCli, ["acceptance", "poc", "fixtures/source-documents/IA-Mining-DG.pdf"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_SURREAL_URL: "http://127.0.0.1:1",
    },
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.command, "acceptance poc");
  assert.equal(output.error.operation, "acceptance.poc");
  assert.match(output.error.reason, /POC acceptance blocked at stage 'db-doctor'/);
  assert.equal(output.data.overallState, "blocked");
  assert.deepEqual(
    output.data.stages.map((stage: { name: string; state: string }) => [stage.name, stage.state]),
    [
      ["db-status", "pass"],
      ["db-doctor", "blocked"],
      ["schema", "blocked"],
      ["source-import", "blocked"],
      ["heading-projection", "blocked"],
      ["wiki-authoring", "deferred"],
      ["graph-retrieval", "deferred"],
      ["surrealist-inspection", "not-applicable"],
    ],
  );
});

test("bundled page search reports concrete Ollama embedding failures", () => {
  const result = spawnSync(bundledCli, ["page", "search", "mining"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_OLLAMA_URL: "http://127.0.0.1:1",
      ORIGINIUM_OLLAMA_EMBED_MODEL: "missing-embed-model",
    },
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.command, "page search");
  assert.equal(output.error.operation, "page.search");
  assert.match(output.error.reason, /Ollama embedding request failed/);
  assert.match(output.error.reason, /missing-embed-model/);
  assert.match(output.error.action, /ollama pull missing-embed-model/);
});
