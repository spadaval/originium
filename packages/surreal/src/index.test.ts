import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  describeSurrealTarget,
  executeSurrealQuery,
  localSurrealStartCommand,
  readSurrealConfig,
  type SurrealFetch,
} from "./index.ts";

test("reads SurrealDB config defaults and environment overrides", () => {
  assert.deepEqual(readSurrealConfig({}), {
    url: "http://127.0.0.1:8000",
    namespace: "originium",
    database: "originium",
    binary: "surreal",
    bind: "127.0.0.1:8000",
    bucketDir: resolve(".originium/surreal-files"),
    dataDir: resolve(".originium/surrealdb"),
    pidFile: resolve(".originium/surrealdb.pid"),
    user: "root",
    password: "root",
  });

  const config = readSurrealConfig({
    ORIGINIUM_SURREAL_DATABASE: "db",
    ORIGINIUM_SURREAL_NAMESPACE: "ns",
    ORIGINIUM_SURREAL_PASSWORD: "secret",
    ORIGINIUM_SURREAL_URL: "http://user:secret@localhost:9000",
    ORIGINIUM_SURREAL_USER: "user",
  });

  assert.equal(config.password, "secret");
  assert.deepEqual(describeSurrealTarget(config), {
    url: "http://localhost:9000",
    namespace: "ns",
    database: "db",
  });
});

test("failed SurrealDB query returns bounded operation failure without credentials", async () => {
  const config = readSurrealConfig({
    ORIGINIUM_SURREAL_DATABASE: "graph",
    ORIGINIUM_SURREAL_NAMESPACE: "wiki",
    ORIGINIUM_SURREAL_PASSWORD: "do-not-leak",
    ORIGINIUM_SURREAL_URL: "http://root:do-not-leak@127.0.0.1:8000",
    ORIGINIUM_SURREAL_USER: "root",
  });
  const failingFetch: SurrealFetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
  };

  const result = await executeSurrealQuery(config, "RETURN true;", {
    fetch: failingFetch,
    queryId: "connection-test",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, "operation_failure");
  assert.equal(result.error.operation, "surreal.query");
  assert.deepEqual(result.error.target, {
    url: "http://127.0.0.1:8000",
    namespace: "wiki",
    database: "graph",
  });
  assert.deepEqual(result.error.input, { queryId: "connection-test" });
  assert.match(result.error.reason, /ECONNREFUSED/);
  assert.match(result.error.action, /ORIGINIUM_SURREAL_URL/);
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak/);
});

test("SurrealDB query sends current HTTP namespace and database headers", async () => {
  const config = readSurrealConfig({
    ORIGINIUM_SURREAL_DATABASE: "graph",
    ORIGINIUM_SURREAL_NAMESPACE: "wiki",
    ORIGINIUM_SURREAL_PASSWORD: "secret",
    ORIGINIUM_SURREAL_URL: "http://127.0.0.1:8000",
    ORIGINIUM_SURREAL_USER: "root",
  });
  let headers: HeadersInit | undefined;
  const okFetch: SurrealFetch = async (_url, init) => {
    headers = init?.headers;
    return new Response(JSON.stringify([{ status: "OK", result: true }]), { status: 200 });
  };

  const result = await executeSurrealQuery(config, "RETURN true;", { fetch: okFetch });

  assert.equal(result.ok, true);
  assert.equal((headers as Record<string, string>)["Surreal-NS"], "wiki");
  assert.equal((headers as Record<string, string>)["Surreal-DB"], "graph");
});

test("local SurrealDB start command allows Surrealist-compatible HTTP and RPC routes", () => {
  const command = localSurrealStartCommand(readSurrealConfig({}));

  assert.equal(command.command, "surreal");
  assert.deepEqual(command.args, [
    "start",
    "--no-banner",
    "--log",
    "warn",
    "--bind",
    "127.0.0.1:8000",
    "--user",
    "root",
    "--pass",
    "root",
    "--allow-http",
    "--allow-rpc",
    "--",
    `surrealkv:${resolve(".originium/surrealdb")}`,
  ]);
  assert.equal(command.env.SURREAL_CAPS_ALLOW_EXPERIMENTAL, "files");
  assert.equal(command.env.SURREAL_DEFAULT_NAMESPACE, "originium");
  assert.equal(command.env.SURREAL_DEFAULT_DATABASE, "originium");
});

test("SurrealDB query converts statement errors into operation failures", async () => {
  const failedFetch: SurrealFetch = async () =>
    new Response(JSON.stringify([{ status: "ERR", result: "Parse error: Unexpected token `BUCKET`" }]), {
      status: 200,
    });

  const result = await executeSurrealQuery(readSurrealConfig({}), "DEFINE BUCKET source_documents;", {
    fetch: failedFetch,
    queryId: "schema.bucket",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.input.queryId, "schema.bucket");
  assert.match(result.error.reason, /Unexpected token `BUCKET`/);
});
