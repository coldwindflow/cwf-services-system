const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("staging bootstrap supplies technician columns required by admin creation and listing", () => {
  const coreSchema = read("test/e2e/schema-core.sql");
  const bootstrap = read("scripts/bootstrap-staging-database.js");

  for (const column of ["technician_code", "position", "done_count"]) {
    assert.match(
      coreSchema,
      new RegExp(`\\b${column}\\s+`),
      `fresh staging schema must declare ${column}`
    );
    assert.match(
      bootstrap,
      new RegExp(
        `ALTER TABLE public\\.technician_profiles ADD COLUMN IF NOT EXISTS ${column}\\b`
      ),
      `existing staging databases must be repaired with ${column}`
    );
  }

  assert.match(
    bootstrap,
    /technician_profiles schema incomplete; missing:/,
    "bootstrap must fail closed if the required technician columns are absent"
  );
});
