"use strict";

// One safe command to apply every migration the store buy-flow needs, in order:
//   1. customer_orders table
//   2. catalog_items.booking_mode CHECK widened to allow 'purchase'
//   3. customer_orders payment_* columns (Omise online payment)
//   4. customer_orders fulfilment columns (order lifecycle)
//
// Why this is safe to run (including on production, and repeatedly):
//   - Each underlying migration is additive-only (CREATE ... IF NOT EXISTS /
//     widen a CHECK constraint) — it never drops, deletes, or rewrites existing
//     data, so it cannot break the running app.
//   - Each step is idempotent, so re-running is a no-op.
//   - Each step takes its own advisory lock (safe against concurrent runs) and
//     verifies the resulting schema, failing loudly if something is off.
//   - Steps run in order and STOP at the first failure — a later step never
//     runs on top of a failed earlier one.
//
// Usage (on the server, where DATABASE_URL / DB_* env vars are set):
//   npm run migrate:store-buy

const ordersRunner = require("./run-customer-orders-migration");
const bookingModeRunner = require("./run-catalog-booking-mode-purchase-migration");
const ordersPaymentRunner = require("./run-customer-orders-payment-migration");
const ordersFulfillmentRunner = require("./run-customer-orders-fulfillment-migration");

const STEPS = [
  { name: "customer_orders table", runner: ordersRunner },
  { name: "catalog booking_mode 'purchase'", runner: bookingModeRunner },
  { name: "customer_orders payment columns", runner: ordersPaymentRunner },
  { name: "customer_orders fulfilment columns", runner: ordersFulfillmentRunner },
];

async function runAll(options = {}) {
  const logger = options.logger || console;
  const steps = options.steps || STEPS;
  logger.log("STORE_BUY_MIGRATIONS_START");
  for (const step of steps) {
    logger.log(`--> ${step.name}`);
    // Each runner catches its own errors and returns 0 (ok) / 1 (failed),
    // logging its own START/OK/FAILED lines.
    const code = await step.runner.runCli(options);
    if (code !== 0) {
      logger.error(`STORE_BUY_MIGRATIONS_ABORTED at: ${step.name}`);
      return code;
    }
  }
  logger.log("STORE_BUY_MIGRATIONS_OK");
  return 0;
}

if (require.main === module) {
  runAll().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { runAll, STEPS };
