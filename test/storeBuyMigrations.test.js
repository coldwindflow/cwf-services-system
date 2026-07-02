"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const orchestrator = require("../scripts/run-store-buy-migrations");
const ordersRunner = require("../scripts/run-customer-orders-migration");
const bookingModeRunner = require("../scripts/run-catalog-booking-mode-purchase-migration");

function makeLogger() {
  const lines = [];
  return { lines, log: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)) };
}

test("STEPS wires the two buy-flow migration runners in the correct order", () => {
  assert.equal(orchestrator.STEPS.length, 2);
  assert.equal(orchestrator.STEPS[0].runner, ordersRunner);
  assert.equal(orchestrator.STEPS[1].runner, bookingModeRunner);
});

test("runAll runs every step in order and returns 0 when all succeed", async () => {
  const calls = [];
  const logger = makeLogger();
  const steps = [
    { name: "one", runner: { async runCli() { calls.push("one"); return 0; } } },
    { name: "two", runner: { async runCli() { calls.push("two"); return 0; } } },
  ];
  const code = await orchestrator.runAll({ logger, steps });
  assert.equal(code, 0);
  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(logger.lines[0], "STORE_BUY_MIGRATIONS_START");
  assert.equal(logger.lines.at(-1), "STORE_BUY_MIGRATIONS_OK");
});

test("runAll stops at the first failing step and never runs later steps", async () => {
  const calls = [];
  const logger = makeLogger();
  const steps = [
    { name: "one", runner: { async runCli() { calls.push("one"); return 1; } } },
    { name: "two", runner: { async runCli() { calls.push("two"); return 0; } } },
  ];
  const code = await orchestrator.runAll({ logger, steps });
  assert.equal(code, 1);
  assert.deepEqual(calls, ["one"]); // second step never ran
  assert.match(logger.lines.join("\n"), /STORE_BUY_MIGRATIONS_ABORTED at: one/);
  assert.doesNotMatch(logger.lines.join("\n"), /STORE_BUY_MIGRATIONS_OK/);
});

test("runAll forwards options (env / clientFactory) to each underlying runner", async () => {
  const seen = [];
  const steps = [
    { name: "s", runner: { async runCli(opts) { seen.push(opts.marker); return 0; } } },
  ];
  await orchestrator.runAll({ logger: makeLogger(), steps, marker: "abc" });
  assert.deepEqual(seen, ["abc"]);
});
