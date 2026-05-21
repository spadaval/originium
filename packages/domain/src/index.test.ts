import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCitationPageRange,
  formatGraphWikiRecordIdConflict,
  GraphWikiRecordIdConflictError,
  parseCitationPageRange,
  sourceDocumentRecordId,
  sourceTextProjectionRecordId,
  toSlug,
  validateCitationLocator,
  validatePageBodyCitationMarkers,
  wikiPageRecordId,
  wikiPageSlugFromTitle,
} from "./index";

test("toSlug normalizes a Wiki Page title", () => {
  assert.equal(toSlug("CURWB Deployment for Autonomous Operations"), "curwb-deployment-for-autonomous-operations");
});

test("record ID helpers produce stable normalized IDs", () => {
  assert.equal(
    sourceDocumentRecordId({
      title: "  Résumé: CURWB Deployment!! ",
      kind: "pdf",
      sha256: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
      mimeType: "application/pdf",
    }),
    "source_document:resume_curwb_deployment_abcdef012345",
  );
  assert.equal(
    sourceDocumentRecordId({
      title: "",
      kind: "pdf",
      sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
      mimeType: "application/pdf",
      sourceUri: "file:///fixtures/source_documents/IA Mining DG.pdf",
    }),
    "source_document:ia_mining_dg_abcdef012345",
  );
  assert.equal(wikiPageSlugFromTitle(" Résumé: CURWB Deployment!! "), "resume-curwb-deployment");
  assert.equal(wikiPageRecordId(" Résumé: CURWB Deployment!! "), "wiki_page:resume_curwb_deployment");
  assert.equal(
    sourceTextProjectionRecordId({
      sourceDocumentId: "source_document:industrial_automation",
      startPage: 1,
      endPage: 2,
      projectionVersion: "pdf-text-v1",
    }),
    "source_text_projection:industrial_automation_p1_2_pdf_text_v1",
  );
});

test("record ID helpers are idempotent for equivalent repeated input", () => {
  const firstSourceDocumentId = sourceDocumentRecordId({
    title: "CURWB Deployment",
    kind: "pdf",
    sha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    mimeType: "application/pdf",
  });
  const repeatedSourceDocumentId = sourceDocumentRecordId({
    title: "  curwb---deployment  ",
    kind: "pdf",
    sha256: "ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789",
    mimeType: "application/pdf",
  });
  const firstSourceTextProjectionId = sourceTextProjectionRecordId({
    sourceDocumentId: firstSourceDocumentId,
    startPage: 3,
    endPage: 3,
    projectionVersion: " PDF Text V1 ",
  });
  const repeatedSourceTextProjectionId = sourceTextProjectionRecordId({
    sourceDocumentId: repeatedSourceDocumentId,
    startPage: 3,
    endPage: 3,
    projectionVersion: "pdf---text---v1",
  });

  assert.equal(firstSourceDocumentId, repeatedSourceDocumentId);
  assert.equal(firstSourceTextProjectionId, repeatedSourceTextProjectionId);
  assert.equal(wikiPageRecordId("System Overview"), wikiPageRecordId(" system---overview "));
});

test("Graph Wiki record ID conflict errors name operation, input, proposed ID, and existing record", () => {
  const conflict = {
    operation: "create Wiki Page",
    inputIdentifier: "Wiki Page title: Résumé: CURWB Deployment",
    proposedId: "wiki_page:resume_curwb_deployment",
    existingRecordId: "wiki_page:resume_curwb_deployment",
  };
  const expectedMessage =
    'Graph Wiki create Wiki Page failed for input "Wiki Page title: Résumé: CURWB Deployment". Proposed record ID "wiki_page:resume_curwb_deployment" conflicts with existing record "wiki_page:resume_curwb_deployment". Use a distinct title, filename, page range, projection version, or slug before retrying.';

  assert.equal(formatGraphWikiRecordIdConflict(conflict), expectedMessage);
  assert.throws(
    () => {
      throw new GraphWikiRecordIdConflictError(conflict);
    },
    new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
});

test("Citation locator page ranges parse and format concrete pages", () => {
  assert.deepEqual(parseCitationPageRange("p12"), { startPage: 12, endPage: 12 });
  assert.deepEqual(parseCitationPageRange("pp. 12-18"), { startPage: 12, endPage: 18 });
  assert.equal(formatCitationPageRange({ startPage: 12, endPage: 12 }), "p12");
  assert.equal(formatCitationPageRange({ startPage: 12, endPage: 18 }), "pp12-18");
  assert.equal(parseCitationPageRange("18-12"), undefined);
  assert.equal(parseCitationPageRange("0-2"), undefined);
});

test("Citation locator validation accepts whole document, page range, and quote/context evidence", () => {
  assert.deepEqual(validateCitationLocator({ locatorKind: "whole-document", confidence: 0.4 }), []);
  assert.deepEqual(
    validateCitationLocator({
      locatorKind: "page-range",
      pageRange: { startPage: 12, endPage: 18 },
      confidence: 0.8,
    }),
    [],
  );
  assert.deepEqual(
    validateCitationLocator({
      locatorKind: "quote-context",
      quote: "Validated quote text",
      context: "Nearby paragraph context",
      confidence: 1,
    }),
    [],
  );
});

test("Citation locator validation reports actionable locator failures", () => {
  assert.deepEqual(validateCitationLocator({ locatorKind: "page-range", confidence: 0.5 }), [
    "Citation locator kind page-range requires pageRange.",
  ]);
  assert.deepEqual(
    validateCitationLocator({
      locatorKind: "whole-document",
      pageRange: { startPage: 2, endPage: 3 },
      confidence: 1.2,
    }),
    [
      "Citation locator confidence 1.2 is invalid. Use a number from 0 to 1.",
      "Citation locator kind whole-document must not include a page range. Use page-range when pages are known.",
    ],
  );
  assert.deepEqual(validateCitationLocator({ locatorKind: "quote-context", confidence: 0.5 }), [
    "Citation locator kind quote-context requires quote or context evidence.",
  ]);
});

test("Citation Marker validation accepts markers with keys and optional labels", () => {
  const validation = validatePageBodyCitationMarkers({
    wikiPageId: "wiki_page:curwb_deployment",
    pageBody:
      "Mesh reliability improved after the backbone redesign [^source-1|Backbone evidence]. Coverage also improved [^source_2].",
    graphCitationKeys: ["source-1", "source_2"],
  });

  assert.deepEqual(validation.markers, [
    {
      key: "source-1",
      label: "Backbone evidence",
      marker: "[^source-1|Backbone evidence]",
      index: 54,
    },
    {
      key: "source_2",
      label: undefined,
      marker: "[^source_2]",
      index: 108,
    },
  ]);
  assert.deepEqual(validation.issues, []);
});

test("Citation Marker validation reports duplicate markers", () => {
  const validation = validatePageBodyCitationMarkers({
    wikiPageId: "wiki_page:curwb_deployment",
    pageBody: "First claim [^source-1]. Repeated claim [^source-1].",
    graphCitationKeys: ["source-1"],
  });

  assert.equal(validation.issues.length, 1);
  assert.equal(validation.issues[0]?.kind, "duplicate-marker");
  assert.equal(
    validation.issues[0]?.message,
    'Citation validation failed for Wiki Page "wiki_page:curwb_deployment": duplicate-marker for Citation Marker key "source-1" and graph Citation key "source-1". Each Citation Marker key may appear once in a Page Body.',
  );
});

test("Citation Marker validation reports missing graph Citations", () => {
  const validation = validatePageBodyCitationMarkers({
    wikiPageId: "wiki_page:curwb_deployment",
    pageBody: "Unsupported claim [^source-1].",
    graphCitationKeys: [],
  });

  assert.equal(validation.issues.length, 1);
  assert.equal(validation.issues[0]?.kind, "missing-graph-citation");
  assert.equal(
    validation.issues[0]?.message,
    'Citation validation failed for Wiki Page "wiki_page:curwb_deployment": missing-graph-citation for Citation Marker key "source-1" and graph Citation key "<missing>". Add a Citation graph relation for this marker key or remove the marker.',
  );
});

test("Citation Marker validation reports unused graph Citations", () => {
  const validation = validatePageBodyCitationMarkers({
    wikiPageId: "wiki_page:curwb_deployment",
    pageBody: "Claim with no marker.",
    graphCitationKeys: ["source-1"],
  });

  assert.equal(validation.issues.length, 1);
  assert.equal(validation.issues[0]?.kind, "unused-graph-citation");
  assert.equal(
    validation.issues[0]?.message,
    'Citation validation failed for Wiki Page "wiki_page:curwb_deployment": unused-graph-citation for Citation Marker key "<missing>" and graph Citation key "source-1". Add a matching Citation Marker to the Page Body or remove the unused Citation graph relation.',
  );
});

test("Citation Marker validation reports invalid marker syntax", () => {
  const validation = validatePageBodyCitationMarkers({
    wikiPageId: "wiki_page:curwb_deployment",
    pageBody: "Uppercase keys are invalid [^Source-1]. Empty labels are invalid [^source-2|].",
    graphCitationKeys: [],
  });

  assert.deepEqual(
    validation.issues.map((issue) => issue.kind),
    ["invalid-marker-syntax", "invalid-marker-syntax"],
  );
  assert.equal(
    validation.issues[0]?.message,
    'Citation validation failed for Wiki Page "wiki_page:curwb_deployment": invalid-marker-syntax for Citation Marker "[^Source-1]". Use "[^key]" or "[^key|label]" with lowercase key characters a-z, 0-9, "_" or "-".',
  );
  assert.equal(
    validation.issues[1]?.message,
    'Citation validation failed for Wiki Page "wiki_page:curwb_deployment": invalid-marker-syntax for Citation Marker "[^source-2|]". Use "[^key]" or "[^key|label]" with lowercase key characters a-z, 0-9, "_" or "-".',
  );
});
