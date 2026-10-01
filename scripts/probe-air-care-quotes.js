#!/usr/bin/env node
"use strict";

const pool = require("../db");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");

const PHASE = String(process.argv[2] || "manual").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "manual";
const MATRICES = Object.freeze([
  { label: "standard-small", bundle: "coldwindflow-air-care-standard", packageKey: "coldwindflow-air-care-standard-small", btu: 12000, prices: { 1: 499, 4: 1699, 5: 2198, 6: 2598 } },
  { label: "standard-large", bundle: "coldwindflow-air-care-standard", packageKey: "coldwindflow-air-care-standard-large", btu: 18000, prices: { 1: 599, 4: 2099, 5: 2698, 6: 3198 } },
  { label: "premium-small", bundle: "coldwindflow-air-care-premium", packageKey: "coldwindflow-air-care-premium-small", btu: 12000, prices: { 1: 699, 4: 2489, 5: 3188, 6: 3798 } },
  { label: "premium-large", bundle: "coldwindflow-air-care-premium", packageKey: "coldwindflow-air-care-premium-large", btu: 18000, prices: { 1: 899, 4: 3399, 5: 4298, 6: 5197 } },
]);

function evidence(name, fields = {}) {
  const values = Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`).join(" ");
  console.log(`[AIR_CARE_QUOTE_EVIDENCE] phase=${PHASE} ${name}${values ? ` ${values}` : ""}`);
}

async function catalogIds() {
  const result = await pool.query(
    `SELECT item_id, service_bundle_key
       FROM public.catalog_items
      WHERE service_bundle_key=ANY($1::text[])
        AND is_active=TRUE AND is_customer_visible=TRUE`,
    [["coldwindflow-air-care-standard", "coldwindflow-air-care-premium"]]
  );
  return new Map(result.rows.map((row) => [String(row.service_bundle_key), Number(row.item_id)]));
}

async function main() {
  const ids = await catalogIds();
  const service = createPrepaidOrderService({ pool });
  let failures = 0;

  for (const matrix of MATRICES) {
    const itemId = ids.get(matrix.bundle);
    if (!Number.isSafeInteger(itemId)) {
      evidence("failure", { matrix: matrix.label, code: "AIR_CARE_PARENT_NOT_FOUND" });
      failures += 1;
      continue;
    }
    const actual = [];
    for (const quantity of [1, 4, 5, 6]) {
      try {
        const quote = await service.quoteOrder({
          catalog_item_id: itemId,
          service_package_groups: [{ package_key: matrix.packageKey, btu: matrix.btu, quantity }],
        }, { identity: "customer" });
        const price = Number(quote?.fixed_total_price);
        actual.push(price);
        if (price !== matrix.prices[quantity]) {
          evidence("failure", { matrix: matrix.label, quantity, code: "AIR_CARE_PRICE_MISMATCH", expected: matrix.prices[quantity], actual: price });
          failures += 1;
        }
      } catch (error) {
        const code = String(error?.code || error?.message || "AIR_CARE_QUOTE_FAILED").replace(/\s+/g, "_").slice(0, 160);
        evidence("failure", { matrix: matrix.label, quantity, code, status: Number(error?.statusCode || 500) });
        failures += 1;
      }
    }
    evidence("matrix", { matrix: matrix.label, q1_q4_q5_q6: actual.join(",") || "none" });
  }

  if (failures) {
    evidence("result", { status: "failed", failures });
    process.exitCode = 1;
  } else {
    evidence("result", { status: "passed", matrices: MATRICES.length, quotes: MATRICES.length * 4 });
  }
}

main()
  .catch((error) => {
    const code = String(error?.code || error?.message || "AIR_CARE_QUOTE_PROBE_FAILED").replace(/\s+/g, "_").slice(0, 160);
    evidence("result", { status: "failed", code });
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
