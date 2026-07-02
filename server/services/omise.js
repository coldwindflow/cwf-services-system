"use strict";

// Omise (Opn Payments) API client for the store buy-flow.
//
// Scope: create a charge for an order (card token or PromptPay source) and read
// a charge back to confirm its real status. Card data NEVER touches our server —
// the browser tokenizes it with Omise.js using the PUBLIC key, and we only ever
// see a one-time token here. All money-moving calls use the SECRET key, which is
// read from the environment and never hardcoded or logged.
//
// Amounts are handled in the smallest currency unit (satang for THB): 1 THB =
// 100 satang. Callers pass whole-baht amounts; we convert once, here.
//
// Everything is injectable (env + httpRequest) so the whole flow is unit-tested
// without a network — see test/omiseService.test.js.

const https = require("https");

const OMISE_API_HOST = "api.omise.co";
const DEFAULT_CURRENCY = "thb";

// The real transport: one HTTPS request to api.omise.co with HTTP Basic auth
// (secret key as the username, empty password). Resolves { status, body } where
// body is the parsed JSON (or null). Rejects only on a transport-level error.
function defaultHttpRequest({ method, path, secretKey, payload, timeoutMs = 20000 }) {
  return new Promise((resolve, reject) => {
    const data = payload ? JSON.stringify(payload) : null;
    const auth = Buffer.from(`${secretKey}:`).toString("base64");
    const req = https.request(
      {
        method,
        hostname: OMISE_API_HOST,
        path,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let body = null;
          try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = null; }
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("omise request timed out")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function cleanKey(value) {
  return String(value == null ? "" : value).trim();
}

// Whole baht -> integer satang. Guards against floating dust (1499.99 * 100).
function bahtToSatang(baht) {
  const n = Number(baht);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function createOmiseClient(options = {}) {
  const env = options.env || process.env;
  const httpRequest = options.httpRequest || defaultHttpRequest;
  const secretKey = cleanKey(env.OMISE_SECRET_KEY);
  const publicKey = cleanKey(env.OMISE_PUBLIC_KEY);

  // True only when a secret key is present. The routes use this to fail closed
  // (503 "payment not configured") instead of making a doomed API call.
  function isConfigured() {
    return Boolean(secretKey);
  }

  function getPublicKey() {
    return publicKey;
  }

  // Test-mode keys are prefixed pkey_test_ / skey_test_ by Omise. Handy for the
  // client to show a "test mode" banner without another round-trip.
  function isTestMode() {
    return /_test_/.test(secretKey) || /_test_/.test(publicKey);
  }

  async function call(method, path, payload) {
    if (!secretKey) {
      const err = new Error("OMISE_NOT_CONFIGURED");
      err.code = "OMISE_NOT_CONFIGURED";
      throw err;
    }
    const { status, body } = await httpRequest({ method, path, secretKey, payload });
    // Omise returns { object: "error", code, message } on failure.
    if (status < 200 || status >= 300 || (body && body.object === "error")) {
      const err = new Error((body && body.message) || `omise ${method} ${path} failed (${status})`);
      err.code = (body && body.code) || "OMISE_REQUEST_FAILED";
      err.status = status;
      err.omise = body || null;
      throw err;
    }
    return body;
  }

  // Charge a card token (from Omise.js in the browser). capture=true settles
  // immediately; status comes back 'successful' or 'failed'.
  function createCardCharge({ amount, currency = DEFAULT_CURRENCY, token, metadata }) {
    return call("POST", "/charges", {
      amount: bahtToSatang(amount),
      currency,
      card: token,
      capture: true,
      ...(metadata ? { metadata } : {}),
    });
  }

  // PromptPay: create a source, then a charge on it. The returned charge is
  // 'pending' and carries the QR (source.scannable_code.image.download_uri).
  // Actual payment is confirmed asynchronously by an Omise webhook.
  async function createPromptPayCharge({ amount, currency = DEFAULT_CURRENCY, metadata }) {
    const satang = bahtToSatang(amount);
    const source = await call("POST", "/sources", { type: "promptpay", amount: satang, currency });
    return call("POST", "/charges", {
      amount: satang,
      currency,
      source: source.id,
      ...(metadata ? { metadata } : {}),
    });
  }

  // Read a charge back from Omise. Used by the webhook handler to VERIFY status
  // from source of truth rather than trusting the webhook payload.
  function retrieveCharge(chargeId) {
    const id = cleanKey(chargeId);
    if (!id) return Promise.reject(new Error("charge id required"));
    return call("GET", `/charges/${encodeURIComponent(id)}`, null);
  }

  return {
    isConfigured,
    isTestMode,
    getPublicKey,
    createCardCharge,
    createPromptPayCharge,
    retrieveCharge,
  };
}

// Map an Omise charge to the order status we persist. Omise charge statuses:
// 'successful' | 'pending' | 'failed' | 'expired' | 'reversed'.
function chargeToOrderStatus(charge) {
  const status = charge && charge.status;
  if (charge && charge.paid === true) return "paid";
  if (status === "successful") return "paid";
  if (status === "pending") return "payment_processing";
  if (status === "failed" || status === "expired" || status === "reversed") return "payment_failed";
  return "payment_processing";
}

// The scannable PromptPay QR image URL, if present on a charge.
function promptPayQrUri(charge) {
  const source = charge && charge.source;
  const image = source && source.scannable_code && source.scannable_code.image;
  return (image && (image.download_uri || image.uri)) || null;
}

module.exports = {
  createOmiseClient,
  defaultHttpRequest,
  bahtToSatang,
  chargeToOrderStatus,
  promptPayQrUri,
  DEFAULT_CURRENCY,
};
