import assert from "node:assert/strict";
import test from "node:test";
import type { SurrealFetch } from "@originium/surreal";
import { listSourceDocuments, readSourceHeadings, readWikiPage, saveWikiPageBody } from "./graph-wiki.ts";

test("lists Source Documents through the backend without returning credentials or file bucket paths", async () => {
  const queries: string[] = [];
  const fetchImpl: SurrealFetch = async (_url, init) => {
    queries.push(String(init?.body));
    return new Response(
      JSON.stringify([
        { status: "OK", result: null },
        {
          status: "OK",
          result: [
            {
              id: "source_document:ia_mining",
              title: "IA Mining DG",
              kind: "pdf",
              sha256: "abc123",
              mime_type: "application/pdf",
              page_count: 12,
              source_uri: "file:///imports/IA Mining DG.pdf",
              extraction_status: "completed",
            },
          ],
        },
      ]),
      { status: 200 },
    );
  };

  const result = await listSourceDocuments({
    env: {
      ORIGINIUM_SURREAL_DATABASE: "graph",
      ORIGINIUM_SURREAL_NAMESPACE: "wiki",
      ORIGINIUM_SURREAL_PASSWORD: "do-not-leak",
      ORIGINIUM_SURREAL_URL: "http://root:do-not-leak@127.0.0.1:8000",
      ORIGINIUM_SURREAL_USER: "root",
    },
    fetch: fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.operation, "web.graph.source_document.list");
  assert.match(queries[0] ?? "", /DEFINE BUCKET IF NOT EXISTS source_documents/);
  assert.match(queries[0] ?? "", /SELECT id, title, kind, sha256, mime_type, page_count, source_uri/);
  assert.doesNotMatch(queries[0] ?? "", /file FROM source_document/);
  assert.equal(result.data[0]?.title, "IA Mining DG");
  assert.equal("file" in (result.data[0] ?? {}), false);
  assert.doesNotMatch(JSON.stringify(result), /do-not-leak|root:do-not-leak/);
});

test("reads Source Headings for a selected Source Document in outline order", async () => {
  const queries: string[] = [];
  const fetchImpl: SurrealFetch = async (_url, init) => {
    queries.push(String(init?.body));
    return new Response(
      JSON.stringify([
        {
          status: "OK",
          result: [
            {
              id: "source_heading:ia_mining_1",
              source_document: "source_document:ia_mining",
              title: "Introduction",
              heading_path: ["Introduction"],
              level: 1,
              start_page: 1,
              end_page: 3,
              order: 1,
              extraction_method: "pdf-outline",
            },
          ],
        },
      ]),
      { status: 200 },
    );
  };

  const result = await readSourceHeadings("source_document:ia_mining", { fetch: fetchImpl });

  assert.equal(result.ok, true);
  assert.match(queries[0] ?? "", /WHERE source_document = source_document:ia_mining ORDER BY order ASC/);
  assert.equal(result.data[0]?.title, "Introduction");
  assert.deepEqual(result.data[0]?.heading_path, ["Introduction"]);
});

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
