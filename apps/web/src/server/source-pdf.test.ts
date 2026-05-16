import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { SurrealFetch } from "@originium/surreal";
import type { WebRuntimeConfig } from "../config.ts";
import { readWebRuntimeConfig } from "../config.ts";
import { streamSourcePdfResponse } from "./source-pdf.ts";

test("streams an imported PDF Source Document from the configured bucket", async () => {
  const bucketDir = await mkdtemp(join(tmpdir(), "originium-source-pdf-"));
  try {
    const fileKey = "ia_mining/IA Mining.pdf";
    await mkdir(join(bucketDir, "ia_mining"), { recursive: true });
    await writeFile(join(bucketDir, fileKey), "%PDF-1.7\nfixture\n");

    const queries: string[] = [];
    const response = await streamSourcePdfResponse("source_document:ia_mining", testConfig(bucketDir), {
      fetch: sourceDocumentFetch(
        {
          id: "source_document:ia_mining",
          title: "IA Mining",
          kind: "pdf",
          mime_type: "application/pdf",
          file: {
            bucket: "source_documents",
            key: `/${fileKey}`,
            pointer: `f"source_documents:/${fileKey}"`,
          },
        },
        queries,
      ),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-disposition"), 'inline; filename="IA Mining.pdf"');
    assert.equal(await response.text(), "%PDF-1.7\nfixture\n");
    assert.match(queries[0] ?? "", /DEFINE BUCKET IF NOT EXISTS source_documents/);
    assert.match(queries[0] ?? "", /SELECT id, title, kind, mime_type, file FROM source_document:ia_mining/);
  } finally {
    await rm(bucketDir, { force: true, recursive: true });
  }
});

test("missing Source Document returns bounded browser error", async () => {
  const bucketDir = await mkdtemp(join(tmpdir(), "originium-source-pdf-"));
  try {
    const response = await streamSourcePdfResponse("source_document:missing", testConfig(bucketDir), {
      fetch: sourceDocumentFetch(undefined),
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.operation, "web.source_pdf.stream");
    assert.deepEqual(body.error.input, { sourceDocumentId: "source_document:missing" });
    assert.match(body.error.reason, /does not exist/);
    assert.match(body.error.action, /Import the PDF Source Document first/);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(escapeRegExp(bucketDir)));
  } finally {
    await rm(bucketDir, { force: true, recursive: true });
  }
});

test("non-PDF Source Document returns unsupported-media browser error", async () => {
  const bucketDir = await mkdtemp(join(tmpdir(), "originium-source-pdf-"));
  try {
    const response = await streamSourcePdfResponse("source_document:text", testConfig(bucketDir), {
      fetch: sourceDocumentFetch({
        id: "source_document:text",
        title: "Text",
        kind: "markdown",
        mime_type: "text/markdown",
        file: {
          bucket: "source_documents",
          key: "/text/source.md",
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 415);
    assert.match(body.error.reason, /not a PDF/);
    assert.match(body.error.reason, /kind=markdown mime_type=text\/markdown/);
  } finally {
    await rm(bucketDir, { force: true, recursive: true });
  }
});

test("missing bucket file returns bounded browser error without bucket path", async () => {
  const bucketDir = await mkdtemp(join(tmpdir(), "originium-source-pdf-"));
  try {
    const response = await streamSourcePdfResponse("source_document:missing_file", testConfig(bucketDir), {
      fetch: sourceDocumentFetch({
        id: "source_document:missing_file",
        title: "Missing File",
        kind: "pdf",
        mime_type: "application/pdf",
        file: {
          bucket: "source_documents",
          key: "/missing/file.pdf",
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.match(body.error.reason, /bucket file is not readable/);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(escapeRegExp(bucketDir)));
  } finally {
    await rm(bucketDir, { force: true, recursive: true });
  }
});

test("bucket configuration failure returns bounded browser error without bucket path", async () => {
  const bucketDir = join(tmpdir(), `originium-source-pdf-missing-${Date.now()}`);
  const response = await streamSourcePdfResponse("source_document:any", testConfig(bucketDir), {
    fetch: sourceDocumentFetch(undefined),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.error.reason, /configured source PDF bucket is not readable/);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(escapeRegExp(bucketDir)));
});

function testConfig(bucketDir: string): WebRuntimeConfig {
  return readWebRuntimeConfig({
    ORIGINIUM_SURREAL_BUCKET_DIR: resolve(bucketDir),
    ORIGINIUM_WEB_SOURCE_PDF_BUCKET_DIR: resolve(bucketDir),
  });
}

function sourceDocumentFetch(record: Record<string, unknown> | undefined, queries: string[] = []): SurrealFetch {
  return async (_url, init) => {
    queries.push(String(init?.body));
    return new Response(
      JSON.stringify([
        {
          status: "OK",
          result: record ? [record] : [],
        },
      ]),
      { status: 200 },
    );
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
