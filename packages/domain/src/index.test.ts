import assert from "node:assert/strict";
import test from "node:test";

import { toSlug } from "./index";

test("toSlug normalizes a Wiki Page title", () => {
  assert.equal(toSlug("CURWB Deployment for Autonomous Operations"), "curwb-deployment-for-autonomous-operations");
});
