import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateTokens,
  extractPdfOutline,
  nearestOutlineForPage,
  parsePdfInfo,
  parseTableOfContentsOutline,
  projectPdfChunk,
  projectPdfText,
  searchPdfText,
} from "./index";

const fixturePath = "fixtures/source-documents/IA-Mining-DG.pdf";

test("parsePdfInfo extracts title and page count", () => {
  const metadata = parsePdfInfo("Title: Example Guide\nPages: 174\n");

  assert.deepEqual(metadata, {
    title: "Example Guide",
    pageCount: 174,
  });
});

test("parseTableOfContentsOutline creates ordered Source Outlines", () => {
  const outline = parseTableOfContentsOutline(
    "source_document:fixture",
    [
      "Contents",
      "Chapter 1: Autonomous and Tele-Remote Operations . . . . . . . . . . . . . . 1",
      "Executive Summary . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 1",
      "Chapter 2: CURWB Architecture . . . . . . . . . . . . . . . . . . . . . . . . . . 11",
    ].join("\n"),
  );

  assert.equal(outline.length, 3);
  assert.equal(outline[0].level, 1);
  assert.equal(outline[1].level, 2);
  assert.deepEqual(outline[1].outlinePath, ["Chapter 1: Autonomous and Tele-Remote Operations", "Executive Summary"]);
  assert.equal(outline[0].endPage, undefined);
  assert.match(outline[2].id, /^source_outline:fixture_3_11_chapter_2_curwb_architecture$/);
});

test("extractPdfOutline finds fixture chapter outline", () => {
  const outline = extractPdfOutline(fixturePath, "source_document:ia_mining_dg_fixture");

  assert.ok(outline.length > 20);
  assert.equal(outline[0].title, "Chapter 1: Autonomous and Tele-Remote Operations in Open-Pit Mining");
  assert.equal(outline[0].extractionMethod, "table-of-contents");
  assert.ok(outline.some((outlineEntry) => outlineEntry.title.includes("Cisco Ultra-Reliable Wireless Backhaul")));
});

test("projectPdfChunk returns bounded text and evidence metadata", () => {
  const [outlineEntry] = extractPdfOutline(fixturePath, "source_document:ia_mining_dg_fixture");
  assert.ok(outlineEntry);

  const chunk = projectPdfChunk(fixturePath, outlineEntry, { maxTokens: 800 });

  assert.equal(chunk.sourceDocumentId, "source_document:ia_mining_dg_fixture");
  assert.equal(chunk.outlineId, outlineEntry.id);
  assert.equal(chunk.pageRange.start, outlineEntry.startPage);
  assert.ok(chunk.tokenEstimate <= 800);
  assert.match(chunk.text, /Autonomous|Mining/);
});

test("projectPdfText returns lossy projection provenance for IA Mining pages", () => {
  const projection = projectPdfText(fixturePath, {
    sourceDocumentId: "source_document:ia_mining_dg_fixture",
    pageRange: { start: 1, end: 1 },
    maxTokens: 800,
  });

  assert.equal(projection.sourceDocumentId, "source_document:ia_mining_dg_fixture");
  assert.deepEqual(projection.pageRange, { start: 1, end: 1 });
  assert.equal(projection.provenance.extractionMethod, "pdftotext-page-projection");
  assert.equal(projection.provenance.lossy, true);
  assert.match(projection.provenance.checksumSha256, /^[a-f0-9]{64}$/);
  assert.match(projection.warning, /Lossy source text projection/);
  assert.match(projection.text, /Autonomous|Mining/);
});

test("searchPdfText returns concise IA Mining snippets with nearest outline context", () => {
  const outline = extractPdfOutline(fixturePath, "source_document:ia_mining_dg_fixture");
  const hits = searchPdfText(fixturePath, outline, "Cisco Ultra-Reliable Wireless Backhaul", {
    sourceDocumentId: "source_document:ia_mining_dg_fixture",
    pageRange: { start: 11, end: 20 },
    limit: 3,
  });

  assert.ok(hits.length > 0);
  assert.match(hits[0].snippet, /Cisco Ultra-Reliable Wireless Backhaul/);
  assert.equal(hits[0].sourceDocumentId, "source_document:ia_mining_dg_fixture");
  assert.ok(hits[0].pageRange.start >= 11);
  assert.ok(hits[0].nearestOutline);
  assert.equal(nearestOutlineForPage(outline, hits[0].pageRange.start)?.id, hits[0].nearestOutline?.id);
});

test("estimateTokens uses a stable rough word-based estimate", () => {
  assert.equal(estimateTokens("one two three"), 5);
});
