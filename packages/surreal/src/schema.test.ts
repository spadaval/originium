import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coreSchemaPath } from "./index.ts";

test("core schema repairs table shape before defining flexible object metadata fields", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  for (const table of ["source_document", "change_log", "agent_activity"]) {
    assert.match(schema, new RegExp(`DEFINE TABLE OVERWRITE ${table} SCHEMAFULL;`));
  }

  for (const [table, field] of [
    ["source_document", "file"],
    ["change_log", "before"],
    ["change_log", "after"],
    ["agent_activity", "metadata"],
  ]) {
    assert.match(
      schema,
      new RegExp(`DEFINE FIELD IF NOT EXISTS ${field} ON TABLE ${table} TYPE option<object> FLEXIBLE;`),
    );
  }
});

test("core schema keys Source Text Projections to Source Documents and projection version", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS source_document ON source_text_projection TYPE record<source_document>;/,
  );
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS start_page ON source_text_projection TYPE int;/);
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS end_page ON source_text_projection TYPE int;/);
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS projection_version ON source_text_projection TYPE string;/);
  assert.match(
    schema,
    /DEFINE INDEX IF NOT EXISTS source_text_projection_document_range_version ON source_text_projection FIELDS source_document, start_page, end_page, projection_version UNIQUE;/,
  );
  assert.doesNotMatch(schema, /source_text_projection FIELDS source_heading UNIQUE/);
  assert.doesNotMatch(schema, /DEFINE FIELD IF NOT EXISTS source_heading ON source_text_projection/);
});

test("core schema stores citation locator metadata on Wiki Page to Source Document relations", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.match(schema, /DEFINE TABLE OVERWRITE cites TYPE RELATION IN wiki_page OUT source_document SCHEMAFULL;/);

  for (const field of [
    "key",
    "label",
    "claim",
    "locator_kind",
    "page_range",
    "location_hint",
    "quote",
    "context",
    "projection_id",
    "text_hash",
    "validation_status",
    "confidence",
  ]) {
    assert.match(schema, new RegExp(`DEFINE FIELD IF NOT EXISTS ${field} ON (?:TABLE )?cites `));
  }

  assert.match(
    schema,
    /locator_kind ON cites TYPE string ASSERT \$value IN \["whole-document", "page-range", "quote-context"\]/,
  );
  assert.match(
    schema,
    /validation_status ON cites TYPE string ASSERT \$value IN \["validated", "needs-review", "invalid"\]/,
  );
});

test("core schema no longer defines Source Heading or Source Anchor tables", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE source_heading\b/);
  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE source_anchor\b/);
  assert.doesNotMatch(schema, /TYPE record<source_heading>/);
});
