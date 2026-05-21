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

test("core schema defines sparse advisory Domain Frames and metadata slots", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.match(schema, /DEFINE TABLE OVERWRITE domain_frame SCHEMAFULL;/);
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS record_scope ON domain_frame TYPE string ASSERT \$value IN \["source_document", "wiki_page"\];/,
  );
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS status ON domain_frame TYPE string DEFAULT "draft" ASSERT \$value IN \["draft", "reviewed", "deprecated"\];/,
  );
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS created_session ON domain_frame TYPE option<record<agent_session>>;/,
  );
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS updated_session ON domain_frame TYPE option<record<agent_session>>;/,
  );
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS reviewed_at ON domain_frame TYPE option<datetime>;/);
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS reviewed_by ON domain_frame TYPE option<string>;/);

  assert.match(schema, /DEFINE TABLE OVERWRITE metadata_slot_definition SCHEMAFULL;/);
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS domain_frame ON metadata_slot_definition TYPE record<domain_frame>;/,
  );
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS presence ON metadata_slot_definition TYPE string ASSERT \$value IN \["required", "recommended", "optional"\];/,
  );
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS value_kind ON metadata_slot_definition TYPE string ASSERT \$value IN \["string", "string_list", "date", "boolean", "number", "controlled_string"\];/,
  );
  assert.match(
    schema,
    /DEFINE INDEX IF NOT EXISTS metadata_slot_definition_frame_name ON metadata_slot_definition FIELDS domain_frame, name UNIQUE;/,
  );
});

test("core schema represents frame assignments for Source Documents and Wiki Pages", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.match(schema, /DEFINE TABLE OVERWRITE frame_assignment TYPE RELATION SCHEMAFULL;/);
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS record_scope ON frame_assignment TYPE string ASSERT \$value IN \["source_document", "wiki_page"\];/,
  );
  assert.match(schema, /DEFINE FIELD IF NOT EXISTS metadata ON TABLE frame_assignment TYPE option<object> FLEXIBLE;/);
  assert.match(
    schema,
    /DEFINE FIELD IF NOT EXISTS assignment_status ON frame_assignment TYPE string DEFAULT "advisory" ASSERT \$value IN \["advisory", "needs-review", "reviewed", "deprecated"\];/,
  );
  assert.match(
    schema,
    /DEFINE INDEX IF NOT EXISTS frame_assignment_record_frame ON frame_assignment FIELDS in, out UNIQUE;/,
  );
});

test("core schema explicitly defers broader Domain Model governance", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.match(
    schema,
    /Deferred: relation-label registries, Domain Model proposal workflows, and full model versioning\./,
  );
  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE relation_label/);
  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE domain_model_proposal/);
  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE domain_model_version/);
});

test("core schema no longer defines Source Heading or Source Anchor tables", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE source_heading\b/);
  assert.doesNotMatch(schema, /DEFINE TABLE OVERWRITE source_anchor\b/);
  assert.doesNotMatch(schema, /TYPE record<source_heading>/);
});
