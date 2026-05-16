import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { coreSchemaPath } from "./index.ts";

test("core schema repairs table shape before defining flexible object metadata fields", () => {
  const schema = readFileSync(coreSchemaPath, "utf8");

  for (const table of ["source_document", "source_heading", "change_log", "agent_activity"]) {
    assert.match(schema, new RegExp(`DEFINE TABLE OVERWRITE ${table} SCHEMAFULL;`));
  }

  for (const [table, field] of [
    ["source_document", "file"],
    ["source_heading", "destination"],
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
