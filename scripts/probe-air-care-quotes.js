#!/usr/bin/env node
"use strict";

// Seed verification for the AIR CARE price matrix.
//
// This asks two different questions, and conflating them is what made the gate
// wrong. Price correctness is a property of the seeded tiers and the pricing
// engine; it does not change when the campaign stops selling. Purchase
// eligibility is a property of the sale window and today's date. Checking
// prices with the current clock meant the whole gate began failing the moment
// the window closed, reporting seventeen "failures" against seed data that was
// in fact perfectly correct.
//
// So: verify prices at an instant inside the seeded window, and separately
// verify that the eligibility rule is being enforced correctly right now. The
// sale window itself is never widened here, and nothing on the Customer or
// Admin path is bypassed — this script only reads.
const pool = require("../db");
const { createPrepaidOrderService } = require("../server/services/prepaid/prepaidOrderServiceV2");
const { createServicePackageResolver } = require("../server/services/packages/servicePackageResolver");

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

const BUNDLES = ["coldwindflow-air-care-standard", "coldwindflow-air-care-premium"];

async function catalogRows() {
  const result = await pool.query(
    `SELECT item_id, service_bundle_key,
            service_package_sell_start_at AS sell_start,
            service_package_sell_end_at   AS sell_end
       FROM public.catalog_items
      WHERE service_bundle_key=ANY($1::text[])
        AND is_active=TRUE AND is_customer_visible=TRUE`,
    [BUNDLES]
  );
  return result.rows;
}

// An instant the seeded campaign was actually on sale. Read from the seeded
// rows rather than written down here, so this never needs editing when the
// campaign dates move and can never silently drift outside the window.
function instantInsideWindow(rows) {
  const starts = rows.map((r) => r.sell_start).filter(Boolean).map((d) => new Date(d).getTime());
  const ends = rows.map((r) => r.sell_end).filter(Boolean).map((d) => new Date(d).getTime());
  if (!starts.length || !ends.length) return null;
  const start = Math.max(...starts);
  const end = Math.min(...ends);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return new Date(Math.floor((start + end) / 2));
}

async function main() {
  const rows = await catalogRows();
  const ids = new Map(rows.map((row) => [String(row.service_bundle_key), Number(row.item_id)]));
  let failures = 0;

  const priceAt = instantInsideWindow(rows);
  if (!priceAt) {
    evidence("failure", { check: "sale_window", code: "AIR_CARE_SALE_WINDOW_NOT_SEEDED" });
    evidence("result", { status: "failed", failures: 1 });
    process.exitCode = 1;
    return;
  }
  evidence("pricing_clock", { at: priceAt.toISOString(), source: "seeded_sale_window_midpoint" });

  // Prices are verified at that instant. Everything else — the tiers, the
  // modifiers, the composition rules above q4 — is exactly what production
  // uses; only the clock handed to the resolver differs.
  const service = createPrepaidOrderService({
    pool,
    resolverFactory: ({ db }) => createServicePackageResolver({ db, now: () => priceAt }),
  });

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

  try {
    const mixed = await service.quoteOrder({
      catalog_item_id: ids.get("coldwindflow-air-care-premium"),
      service_package_groups: [
        { package_key: "coldwindflow-air-care-premium-small", btu: 12000, quantity: 1 },
        { package_key: "coldwindflow-air-care-premium-large", btu: 18000, quantity: 2 },
      ],
    }, { identity: "customer" });
    if (Number(mixed.fixed_total_price) !== 2498) {
      evidence("failure", { matrix: "premium-mixed", code: "AIR_CARE_PRICE_MISMATCH", expected: 2498, actual: mixed.fixed_total_price });
      failures += 1;
    } else evidence("matrix", { matrix: "premium-mixed", small: 1, large: 2, price: 2498 });
  } catch (error) {
    evidence("failure", { matrix: "premium-mixed", code: String(error?.code || error?.message || "QUOTE_FAILED") });
    failures += 1;
  }

  // Second, independent question: is the sale window being enforced right now,
  // on the clock the customer actually gets? This passes whether the campaign
  // is open or closed — what it refuses to accept is the wrong answer. Selling
  // after the window closed, or refusing while it is open, fails the gate.
  const liveService = createPrepaidOrderService({ pool });
  const now = new Date();
  const open = rows.every((row) =>
    (!row.sell_start || now >= new Date(row.sell_start))
    && (!row.sell_end || now <= new Date(row.sell_end)));
  const sample = MATRICES[0];
  let sold = false;
  let rejection = "";
  try {
    await liveService.quoteOrder({
      catalog_item_id: ids.get(sample.bundle),
      service_package_groups: [{ package_key: sample.packageKey, btu: sample.btu, quantity: 1 }],
    }, { identity: "customer" });
    sold = true;
  } catch (error) {
    rejection = String(error?.code || error?.message || "UNKNOWN").replace(/\s+/g, "_").slice(0, 160);
  }
  if (open && !sold) {
    evidence("failure", { check: "purchase_eligibility", expected: "sellable", code: rejection });
    failures += 1;
  } else if (!open && sold) {
    evidence("failure", { check: "purchase_eligibility", expected: "rejected_after_sale_window", code: "AIR_CARE_SOLD_OUTSIDE_WINDOW" });
    failures += 1;
  } else {
    evidence("purchase_eligibility", {
      window: open ? "open" : "closed",
      live_quote: sold ? "sellable" : "rejected",
      code: rejection || "none",
      verdict: "enforced_correctly",
    });
  }

  if (failures) {
    evidence("result", { status: "failed", failures });
    process.exitCode = 1;
  } else {
    evidence("result", {
      status: "passed",
      matrices: MATRICES.length + 1,
      quotes: MATRICES.length * 4 + 1,
      priced_at: priceAt.toISOString(),
      sale_window: open ? "open" : "closed",
    });
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
