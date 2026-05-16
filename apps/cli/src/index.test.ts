import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bundledCli = fileURLToPath(new URL("../dist/originium", import.meta.url));

test("bundled CLI reports the configured SurrealDB target", () => {
  const output = execFileSync(bundledCli, ["db", "status"], {
    encoding: "utf8",
    env: {
      ...process.env,
      ORIGINIUM_SURREAL_DATABASE: "testdb",
      ORIGINIUM_SURREAL_NAMESPACE: "testns",
      ORIGINIUM_SURREAL_URL: "http://127.0.0.1:8000",
    },
  });

  assert.match(output, /SurrealDB target: http:\/\/127\.0\.0\.1:8000 ns=testns db=testdb/);
});
