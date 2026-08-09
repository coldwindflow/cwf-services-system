"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcBookingPricing } = require("../server/services/booking/exactPricing");

test("authoritative package line total is not recomputed from rounded unit price", () => {
  assert.deepEqual(calcBookingPricing([{ qty: 4, unit_price: "349.88", line_total: "1399.50" }]), {
    subtotal: 1399.5, discount: 0, total: 1399.5,
  });
});
