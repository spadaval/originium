import assert from "node:assert/strict";
import test from "node:test";
import type { SurrealFetch } from "@originium/surreal";
import { readWikiPage, saveWikiPageBody } from "./graph-wiki.ts";

test("reads Wiki Pages through the backend without returning SurrealDB credentials", async () => {
  const fetchImpl: SurrealFetch = async () =>
    new Response(
      JSON.stringify([
        {
          status: "OK",
          result: [{ id: "wiki_page:test", title: "Test", slug: "test", body: "Body.[^source]" }],
        },
        {
          status: "OK",
          result: [{ id: "cites:test", key: "source", label: "Source", source_heading: "source_heading:test" }],
        },
      ]),
      { status: 200 },
    );

  const result = await readWikiPage(
    { title: "Test" },
    {
      env: {
        ORIGINIUM_SURREAL_DATABASE: "graph",
        ORIGINIUM_SURREAL_NAMESPACE: "wiki",
        ORIGINIUM_SURREAL_PASSWORD: "do-not-leak",
        ORIGINIUM_SURREAL_URL: "http://root:do-not-leak@127.0.0.1:8000",
        ORIGINIUM_SURREAL_USER: "root",
      },
      fetch: fetchImpl,
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.operation, "web.graph.page.read");
  assert.deepEqual(result.target, {
    url: "http://127.0.0.1:8000",
    namespace: "wiki",
    database: "graph",
  });
  assert.equal(result.data?.id, "wiki_page:test");
  assert.equal(result.data?.citations[0]?.key, "source");
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak/);
});

test("save Wiki Page body validates citations and writes with change-log semantics", async () => {
  const queries: string[] = [];
  const fetchImpl: SurrealFetch = async (_url, init) => {
    const query = String(init?.body);
    queries.push(query);
    if (query.includes("SELECT id, title, slug, body FROM wiki_page:test")) {
      return new Response(
        JSON.stringify([
          {
            status: "OK",
            result: [{ id: "wiki_page:test", title: "Test", slug: "test", body: "Old body.[^source]" }],
          },
          { status: "OK", result: [{ key: "source" }] },
        ]),
        { status: 200 },
      );
    }

    return new Response(JSON.stringify([{ status: "OK", result: [{ id: "wiki_page:test" }] }]), { status: 200 });
  };

  const result = await saveWikiPageBody(
    {
      pageId: "wiki_page:test",
      body: "New body.[^source]",
      sessionId: "agent_session:abc",
    },
    {
      fetch: fetchImpl,
      newId: () => "00000000-0000-0000-0000-000000000001",
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.operation, "web.graph.page.edit.apply");
  assert.equal(result.data.pageId, "wiki_page:test");
  assert.equal(result.data.changed, true);
  assert.equal(result.data.citationValidation.issues.length, 0);

  const applyQuery = queries[1] ?? "";
  assert.match(applyQuery, /LET \$originium_before = \(SELECT body FROM wiki_page:test\)\[0\];/);
  assert.match(applyQuery, /UPDATE wiki_page:test SET body = "New body\.\[\^source\]"/);
  assert.match(applyQuery, /LET \$originium_after = \(SELECT body FROM wiki_page:test\)\[0\];/);
  assert.match(applyQuery, /CREATE change_log:00000000000000000000000000000001 SET/);
  assert.match(applyQuery, /operation = "web\.graph\.page\.edit\.apply"/);
  assert.match(applyQuery, /target_records = \["wiki_page:test"\]/);
  assert.match(applyQuery, /RELATE wiki_page:test->edited_in->agent_session:abc SET created_at = time::now\(\);/);
});

test("save Wiki Page body blocks citation marker mismatches before mutation", async () => {
  let callCount = 0;
  const fetchImpl: SurrealFetch = async () => {
    callCount += 1;
    return new Response(
      JSON.stringify([
        {
          status: "OK",
          result: [{ id: "wiki_page:test", title: "Test", slug: "test", body: "Old body.[^source]" }],
        },
        { status: "OK", result: [{ key: "source" }] },
      ]),
      { status: 200 },
    );
  };

  const result = await saveWikiPageBody({ pageId: "wiki_page:test", body: "New body." }, { fetch: fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.error.kind, "validation_failure");
  assert.equal(result.error.operation, "web.graph.page.edit.validate");
  assert.match(result.error.reason, /unused-graph-citation/);
  assert.equal(result.error.issues.length, 1);
  assert.equal(callCount, 1);
});

test("query failures return bounded operation-failure shapes without credentials", async () => {
  const fetchImpl: SurrealFetch = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:8000");
  };

  const result = await readWikiPage(
    { pageId: "wiki_page:test" },
    {
      env: {
        ORIGINIUM_SURREAL_DATABASE: "graph",
        ORIGINIUM_SURREAL_NAMESPACE: "wiki",
        ORIGINIUM_SURREAL_PASSWORD: "do-not-leak",
        ORIGINIUM_SURREAL_URL: "http://root:do-not-leak@127.0.0.1:8000",
        ORIGINIUM_SURREAL_USER: "root",
      },
      fetch: fetchImpl,
    },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, {
    kind: "operation_failure",
    operation: "web.graph.page.read",
    target: {
      url: "http://127.0.0.1:8000",
      namespace: "wiki",
      database: "graph",
    },
    input: { pageId: "wiki_page:test" },
    reason: "connect ECONNREFUSED 127.0.0.1:8000",
    action: "Read the Wiki Page from the Graph Wiki database after verifying the record ID or title.",
  });
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak|root:do-not-leak/);
});
