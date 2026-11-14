"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Execute the actual job condition from the workflow. A successful manual
// status/restart/rollback must not trigger a migration, seed, or promotion PR.
function condition(file, job) {
  const source = fs.readFileSync(`.github/workflows/${file}`, "utf8").replace(/\r\n/g, "\n");
  const match = source.match(new RegExp(`^  ${job}:\\n[\\s\\S]*?^    if: >-\\n((?:      [^\\n]*\\n)+)`, "m"));
  assert.ok(match, `${file}: ${job} must have an explicit condition`);
  const expression = match[1].trim();
  return (event, branch, conclusion = "success") => vm.runInNewContext(`(${expression})`, {
    github: { event_name: "workflow_run", event: { workflow_run: { event, head_branch: branch, conclusion } } },
  });
}

for (const [file, job, branch] of [
  ["cwf-air-reset-seed-gate.yml", "seed-staging", "staging/home-server-test"],
  ["cwf-air-reset-seed-gate.yml", "seed-production", "production/home-server"],
  ["cwf-home-release-promotion.yml", "staging-to-production", "staging/home-server-test"],
]) {
  test(`${job}: only a successful push deployment starts the automatic follow-up`, () => {
    const allowed = condition(file, job);
    assert.equal(allowed("push", branch), true);
    assert.equal(allowed("workflow_dispatch", branch), false, "manual operations require their own reviewed data-operation approval");
    assert.equal(allowed("pull_request", branch), false);
    assert.equal(allowed("push", "unreviewed-feature"), false);
    for (const result of ["failure", "cancelled", "skipped"]) assert.equal(allowed("push", branch, result), false);
  });
}
