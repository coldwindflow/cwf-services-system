"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createOmiseClient,
  bahtToSatang,
  chargeToOrderStatus,
  promptPayQrUri,
} = require("../server/services/omise");

// A fake transport that records requests and returns queued responses.
function makeHttp(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? responses.slice() : [responses];
  return {
    calls,
    request: async (opts) => {
      calls.push(opts);
      const next = queue.shift();
      return next || { status: 200, body: {} };
    },
  };
}

test("bahtToSatang converts to integer satang and guards against float dust", () => {
  assert.equal(bahtToSatang(14900), 1490000);
  assert.equal(bahtToSatang(1499.99), 149999);
  assert.equal(bahtToSatang(0), 0);
  assert.equal(bahtToSatang(-5), 0);
  assert.equal(bahtToSatang("abc"), 0);
});

test("createCardCharge posts a captured charge in satang with the card token", async () => {
  const http = makeHttp({ status: 200, body: { id: "chrg_1", status: "successful", paid: true } });
  const omise = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_test_x" }, httpRequest: http.request });
  const charge = await omise.createCardCharge({ amount: 14900, token: "tokn_abc" });
  assert.equal(charge.id, "chrg_1");
  const req = http.calls[0];
  assert.equal(req.method, "POST");
  assert.equal(req.path, "/charges");
  assert.equal(req.payload.amount, 1490000);
  assert.equal(req.payload.currency, "thb");
  assert.equal(req.payload.card, "tokn_abc");
  assert.equal(req.payload.capture, true);
  assert.equal(req.secretKey, "skey_test_x");
});

test("createPromptPayCharge creates a source then a charge on that source", async () => {
  const http = makeHttp([
    { status: 200, body: { id: "src_1", type: "promptpay" } },
    { status: 200, body: { id: "chrg_pp", status: "pending", source: { scannable_code: { image: { download_uri: "https://cdn.omise.co/q.png" } } } } },
  ]);
  const omise = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_test_x" }, httpRequest: http.request });
  const charge = await omise.createPromptPayCharge({ amount: 14900 });
  assert.equal(http.calls[0].path, "/sources");
  assert.equal(http.calls[0].payload.type, "promptpay");
  assert.equal(http.calls[0].payload.amount, 1490000);
  assert.equal(http.calls[1].path, "/charges");
  assert.equal(http.calls[1].payload.source, "src_1");
  assert.equal(promptPayQrUri(charge), "https://cdn.omise.co/q.png");
});

test("retrieveCharge does a GET on the charge id", async () => {
  const http = makeHttp({ status: 200, body: { id: "chrg_9", status: "successful", paid: true } });
  const omise = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_test_x" }, httpRequest: http.request });
  const charge = await omise.retrieveCharge("chrg_9");
  assert.equal(http.calls[0].method, "GET");
  assert.equal(http.calls[0].path, "/charges/chrg_9");
  assert.equal(charge.paid, true);
});

test("an Omise error response is turned into a thrown error carrying the code", async () => {
  const http = makeHttp({ status: 402, body: { object: "error", code: "invalid_card", message: "card was declined" } });
  const omise = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_test_x" }, httpRequest: http.request });
  await assert.rejects(
    () => omise.createCardCharge({ amount: 100, token: "tokn_bad" }),
    (err) => { assert.equal(err.code, "invalid_card"); assert.equal(err.status, 402); return true; }
  );
});

test("with no secret key the client is not configured and refuses to call out", async () => {
  const http = makeHttp({ status: 200, body: {} });
  const omise = createOmiseClient({ env: {}, httpRequest: http.request });
  assert.equal(omise.isConfigured(), false);
  await assert.rejects(() => omise.createCardCharge({ amount: 100, token: "t" }), /OMISE_NOT_CONFIGURED/);
  assert.equal(http.calls.length, 0);
});

test("isTestMode and getPublicKey reflect the configured keys", () => {
  const omise = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_test_x", OMISE_PUBLIC_KEY: "pkey_test_y" }, httpRequest: () => {} });
  assert.equal(omise.isConfigured(), true);
  assert.equal(omise.isTestMode(), true);
  assert.equal(omise.getPublicKey(), "pkey_test_y");
  const live = createOmiseClient({ env: { OMISE_SECRET_KEY: "skey_live_x", OMISE_PUBLIC_KEY: "pkey_live_y" }, httpRequest: () => {} });
  assert.equal(live.isTestMode(), false);
});

test("chargeToOrderStatus maps Omise charge states to persisted order statuses", () => {
  assert.equal(chargeToOrderStatus({ status: "successful", paid: true }), "paid");
  assert.equal(chargeToOrderStatus({ status: "pending", paid: false }), "payment_processing");
  assert.equal(chargeToOrderStatus({ status: "failed" }), "payment_failed");
  assert.equal(chargeToOrderStatus({ status: "expired" }), "payment_failed");
  assert.equal(chargeToOrderStatus({}), "payment_processing");
});
