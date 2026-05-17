import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildAgentActivityListQuery, buildAgentActivityRecordQuery } from "@originium/surreal";
import { lintGraphWikiStatements, previewPageReplace } from "./index";

const bundledCli = fileURLToPath(new URL("../dist/originium", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const acceptanceFixture = fileURLToPath(
  new URL("../../../fixtures/source-documents/IA-Mining-DG.pdf", import.meta.url),
);

test("bundled CLI reports the configured SurrealDB target", () => {
  const output = execFileSync(bundledCli, ["db", "status", "--json"], {
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

test("bundled CLI defaults to concise human-readable output", () => {
  const output = execFileSync(bundledCli, ["db", "status"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_SURREAL_DATABASE: "testdb",
      ORIGINIUM_SURREAL_NAMESPACE: "testns",
      ORIGINIUM_SURREAL_URL: "http://127.0.0.1:8000",
    },
  });

  assert.match(output, /^OK db status\nSurrealDB target:/);
  assert.doesNotMatch(output, /^\{/);
});

test("bundled CLI reports structured unknown command failures", () => {
  const result = spawnSync(bundledCli, ["unknown", "--json"], {
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
  const result = spawnSync(bundledCli, ["db", "--json"], {
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
  const result = spawnSync(bundledCli, ["source", "bogus", "--json"], {
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

test("bundled CLI reports session current from ORIGINIUM_SESSION without database access", () => {
  const result = spawnSync(bundledCli, ["session", "current", "--json"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_SESSION: "agent_session:test_env_override",
    },
  });

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.operation, "session.current");
  assert.equal(output.data.id, "agent_session:test_env_override");
  assert.equal(output.data.source, "env");
});

test("Agent Activity record query persists message, status, and error events without Change Log entries", () => {
  const base = {
    sessionId: "agent_session:test",
    createSession: false,
    source: "cli" as const,
    operation: "activity.test",
    targetRecords: ["wiki_page:test"],
  };

  const message = buildAgentActivityRecordQuery({
    ...base,
    id: "agent_activity:message",
    kind: "message",
    status: "completed",
    summary: "Agent said hello",
    metadata: { role: "assistant" },
  });
  const status = buildAgentActivityRecordQuery({
    ...base,
    id: "agent_activity:status",
    kind: "status",
    status: "started",
    summary: "Agent started work",
  });
  const error = buildAgentActivityRecordQuery({
    ...base,
    id: "agent_activity:error",
    kind: "error",
    status: "failed",
    summary: "Tool failed",
    metadata: { reason: "connection refused" },
  });

  for (const query of [message, status, error]) {
    assert.match(query, /CREATE agent_activity:/);
    assert.match(query, /agent_session = agent_session:test/);
    assert.match(query, /source = "cli"/);
    assert.match(query, /operation = "activity\.test"/);
    assert.match(query, /target_records = \["wiki_page:test"\]/);
    assert.doesNotMatch(query, /change_log/);
  }
  assert.match(message, /kind = "message"/);
  assert.match(message, /metadata = \{"role":"assistant"\}/);
  assert.match(status, /kind = "status"/);
  assert.match(status, /metadata = NONE/);
  assert.match(error, /kind = "error"/);
  assert.match(error, /status = "failed"/);
});

test("Agent Activity list query reads records by Agent Session", () => {
  assert.equal(
    buildAgentActivityListQuery("agent_session:test"),
    "SELECT id, agent_session, source, kind, status, summary, operation, target_records, metadata, created_at FROM agent_activity WHERE agent_session = agent_session:test ORDER BY created_at ASC;",
  );
});

test("bundled activity record reports concrete validation failures before database access", () => {
  const result = spawnSync(bundledCli, ["activity", "record", "--summary", "Missing kind", "--json"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.command, "activity record");
  assert.equal(output.error.operation, "activity.record");
  assert.equal(output.error.input, "activity record --summary Missing kind");
  assert.equal(output.error.reason, "Missing Agent Activity kind.");
  assert.match(output.error.action, /Pass --kind with one of:/);
});

test("bundled acceptance harness reports blocked stages with nonzero exit", () => {
  const result = spawnSync(bundledCli, ["acceptance", "poc", acceptanceFixture, "--json"], {
    cwd: repoRoot,
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
      ["session-start", "blocked"],
      ["chapter-ingestion", "blocked"],
      ["citation-validation", "blocked"],
      ["graph-retrieval", "blocked"],
      ["change-log", "blocked"],
      ["surrealist-inspection", "not-applicable"],
    ],
  );
});

test("bundled page search reports concrete Ollama embedding failures", () => {
  const result = spawnSync(bundledCli, ["page", "search", "mining", "--json"], {
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

test("bundled source read returns lossy text projection by page range", () => {
  const result = spawnSync(
    bundledCli,
    ["source", "read", acceptanceFixture, "--pages", "1", "--max-tokens", "800", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.operation, "source.read");
  assert.equal(output.data.sourceDocument, "source_document:ia-mining-dg");
  assert.deepEqual(output.data.pageRange, { start: 1, end: 1 });
  assert.equal(output.data.provenance.lossy, true);
  assert.match(output.data.provenance.checksumSha256, /^[a-f0-9]{64}$/);
  assert.match(output.data.warning, /Lossy source text projection/);
  assert.match(output.data.text, /Autonomous|Mining/);
  assert.match(output.data.nearestHeading.id, /^source_heading:/);
  assert.match(output.data.nearestHeading.extractionHeadingId, /^source_heading:/);
});

test("bundled source search returns IA Mining snippets with persisted heading context", () => {
  const result = spawnSync(
    bundledCli,
    [
      "source",
      "search",
      acceptanceFixture,
      "Cisco Ultra-Reliable Wireless Backhaul",
      "--pages",
      "11-20",
      "--limit",
      "2",
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.operation, "source.search");
  assert.equal(output.data.sourceDocument, "source_document:ia-mining-dg");
  assert.ok(output.data.hits.length > 0);
  assert.match(output.data.hits[0].snippet, /Cisco Ultra-Reliable Wireless Backhaul/);
  assert.match(output.data.hits[0].nearestHeading.id, /^source_heading:/);
  assert.equal(output.data.hits[0].nearestHeading.id, output.data.hits[0].nearestHeading.persistedSourceHeadingId);
  assert.equal(output.data.hits[0].provenance.lossy, true);
});

test("bundled link add rejects unsupported labels before database access", () => {
  const result = spawnSync(
    bundledCli,
    [
      "link",
      "add",
      "--from",
      "wiki_page:a",
      "--to",
      "wiki_page:b",
      "--label",
      "see also",
      "--reason",
      "A specific relationship that should be traversable later.",
      "--json",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.error.operation, "link.add");
  assert.match(output.error.reason, /Unsupported Manual Link label 'see also'/);
  assert.match(output.error.action, /depends on/);
});

test("bundled link add rejects vague reasons before database access", () => {
  const result = spawnSync(
    bundledCli,
    [
      "link",
      "add",
      "--from",
      "wiki_page:a",
      "--to",
      "wiki_page:b",
      "--label",
      "uses",
      "--reason",
      "related",
      "--json",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.error.operation, "link.add");
  assert.match(output.error.reason, /too vague/);
  assert.match(output.error.action, /concrete reason/);
});

test("Wiki Page replace preview reports before/after context and does not mutate", () => {
  const result = previewPageReplace("wiki_page:test", "Alpha detail.[^source]\n\nBeta detail.", ["source"], {
    find: "Beta detail.",
    replace: "Gamma detail.",
  });

  assert.equal(result.ok, true);
  assert.equal(result.nextBody, "Alpha detail.[^source]\n\nGamma detail.");
  assert.equal(result.data.matchCount, 1);
  assert.match(result.data.beforeContext, /Beta detail/);
  assert.match(result.data.afterContext, /Gamma detail/);
  assert.equal(result.data.citationValidation.issues.length, 0);
});

test("Wiki Page replace fails for absent and ambiguous find text", () => {
  const absent = previewPageReplace("wiki_page:test", "Alpha body.", [], {
    find: "Missing",
    replace: "Replacement",
  });
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /absent/);
  assert.deepEqual(absent.data, { pageId: "wiki_page:test", find: "Missing", matchCount: 0 });

  const ambiguous = previewPageReplace("wiki_page:test", "Alpha Beta Alpha", [], {
    find: "Alpha",
    replace: "Gamma",
  });
  assert.equal(ambiguous.ok, false);
  assert.match(ambiguous.reason, /ambiguous/);
  assert.deepEqual(ambiguous.data, { pageId: "wiki_page:test", find: "Alpha", matchCount: 2 });
});

test("Wiki Page replace blocks edits that break citation marker validation", () => {
  const result = previewPageReplace("wiki_page:test", "Alpha detail.[^source]", ["source"], {
    find: "[^source]",
    replace: "",
  });

  assert.equal(result.ok, false);
  assert.match(result.reason, /unused-graph-citation/);
  assert.equal(
    (result.data as { citationValidation: { issues: readonly unknown[] } }).citationValidation.issues.length,
    1,
  );
});

test("Graph Wiki lint reports empty uncited residue pages", () => {
  const result = lintGraphWikiStatements([
    { result: [{ id: "wiki_page:test", title: "Test", slug: "test", body: "" }] },
    { result: [] },
    { result: [] },
    { result: [] },
    { result: [] },
  ]);

  assert.equal(result.summary["empty-wiki-page"], 1);
  assert.equal(result.summary["uncited-wiki-page"], 1);
  assert.equal(result.summary["orphan-page"], 1);
  assert.equal(result.issueCount, 3);
});
