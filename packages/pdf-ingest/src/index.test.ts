import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateTokens,
  extractPdfHeadings,
  parsePdfInfo,
  parseTableOfContentsHeadings,
  projectPdfChunk,
} from "./index";

const fixturePath = "fixtures/source-documents/IA-Mining-DG.pdf";

test("parsePdfInfo extracts title and page count", () => {
  const metadata = parsePdfInfo("Title: Example Guide\nPages: 174\n");

  assert.deepEqual(metadata, {
    title: "Example Guide",
    pageCount: 174,
  });
});

test("parseTableOfContentsHeadings creates ordered Source Headings", () => {
  const headings = parseTableOfContentsHeadings(
    "source_document:fixture",
    [
      "Contents",
      "Chapter 1: Autonomous and Tele-Remote Operations . . . . . . . . . . . . . . 1",
      "Executive Summary . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 1",
      "Chapter 2: CURWB Architecture . . . . . . . . . . . . . . . . . . . . . . . . . . 11",
    ].join("\n"),
  );

  assert.equal(headings.length, 3);
  assert.equal(headings[0].level, 1);
  assert.equal(headings[1].level, 2);
  assert.deepEqual(headings[1].headingPath, ["Chapter 1: Autonomous and Tele-Remote Operations", "Executive Summary"]);
  assert.equal(headings[0].endPage, undefined);
  assert.match(headings[2].id, /^source_heading:fixture_3_11_chapter_2_curwb_architecture$/);
});

test("extractPdfHeadings finds fixture chapter headings", () => {
  const headings = extractPdfHeadings(fixturePath, "source_document:ia_mining_dg_fixture");

  assert.ok(headings.length > 20);
  assert.equal(headings[0].title, "Chapter 1: Autonomous and Tele-Remote Operations in Open-Pit Mining");
  assert.equal(headings[0].extractionMethod, "table-of-contents");
  assert.ok(headings.some((heading) => heading.title.includes("Cisco Ultra-Reliable Wireless Backhaul")));
});

test("projectPdfChunk returns bounded text and evidence metadata", () => {
  const [heading] = extractPdfHeadings(fixturePath, "source_document:ia_mining_dg_fixture");
  assert.ok(heading);

  const chunk = projectPdfChunk(fixturePath, heading, { maxTokens: 800 });

  assert.equal(chunk.sourceDocumentId, "source_document:ia_mining_dg_fixture");
  assert.equal(chunk.headingId, heading.id);
  assert.equal(chunk.pageRange.start, heading.startPage);
  assert.ok(chunk.tokenEstimate <= 800);
  assert.match(chunk.text, /Autonomous|Mining/);
});

test("estimateTokens uses a stable rough word-based estimate", () => {
  assert.equal(estimateTokens("one two three"), 5);
});
