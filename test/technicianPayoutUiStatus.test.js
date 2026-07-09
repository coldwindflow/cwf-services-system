const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createElement(id = "") {
  const style = {
    setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name]; },
  };
  return {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    style,
    hidden: false,
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() { return false; },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    setAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
  };
}

function createAppSandbox({ fetchResponse } = {}) {
  const elements = new Map();
  const document = {
    body: { dataset: {}, style: createElement("body").style, classList: { add() {}, remove() {}, toggle() {} } },
    cookie: "",
    documentElement: { style: createElement("documentElement").style },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    createElement,
    addEventListener() {},
    removeEventListener() {},
  };
  const storage = new Map([
    ["username", "0661479791"],
    ["role", "technician"],
  ]);
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  };
  const location = {
    origin: "https://example.test",
    href: "https://example.test/tech.html",
    hash: "",
  };
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    window: {},
    document,
    localStorage,
    location,
    navigator: { serviceWorker: { register: async () => ({}), ready: Promise.resolve({}) } },
    Notification: function Notification() {},
    PushManager: function PushManager() {},
    FormData: class FormData {},
    FileReader: class FileReader {},
    Blob,
    URL,
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    RegExp,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    alert() {},
    confirm() { return true; },
    fetch: async () => ({
      json: async () => fetchResponse || { ok: true },
    }),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
  vm.runInContext(appSource, sandbox, { filename: "app.js" });
  return {
    sandbox,
    elements,
    run(code) {
      return vm.runInContext(code, sandbox);
    },
  };
}

test("technician payout display status maps payable states without mutating paid_status", () => {
  const { run } = createAppSandbox();
  const statuses = run(`[
    _payoutPaymentDisplayStatusTH({ net_amount: 0, paid_amount: 0, remaining_amount: 0, paid_status: "unpaid" }),
    _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 0, remaining_amount: 1000, paid_status: "unpaid" }),
    _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 400, remaining_amount: 600, paid_status: "partial" }),
    _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 1000, remaining_amount: 0, paid_status: "paid" })
  ]`);

  assert.deepEqual(Array.from(statuses), ["ไม่มียอดจ่าย", "รอจ่าย", "จ่ายบางส่วน", "จ่ายแล้ว"]);
});

test("technician payout display status preserves exceptional paid_status values unless the period has no payable amount", () => {
  const { run } = createAppSandbox();
  const result = run(`({
    hold: _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 0, remaining_amount: 1000, paid_status: "hold" }),
    holdExpected: _paidStatusTH("hold"),
    disputed: _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 400, remaining_amount: 600, paid_status: "disputed" }),
    disputedExpected: _paidStatusTH("disputed"),
    cancelled: _payoutPaymentDisplayStatusTH({ net_amount: 1000, paid_amount: 1000, remaining_amount: 0, paid_status: "cancelled" }),
    cancelledExpected: _paidStatusTH("cancelled"),
    noPay: _payoutPaymentDisplayStatusTH({ net_amount: 0, paid_amount: 0, remaining_amount: 0, paid_status: "hold" }),
    noPayExpected: _payoutPaymentDisplayStatusTH({ net_amount: 0, paid_amount: 0, remaining_amount: 0, paid_status: "unpaid" })
  })`);

  assert.equal(result.hold, result.holdExpected);
  assert.equal(result.disputed, result.disputedExpected);
  assert.equal(result.cancelled, result.cancelledExpected);
  assert.equal(result.noPay, result.noPayExpected);
  assert.notEqual(result.noPay, result.holdExpected);
});

test("technician payout list renders no-pay and payable statuses from the same display rule", () => {
  const { run, elements } = createAppSandbox();
  run(`renderTechPayoutPeriods([
    {
      payout_id: "payout_2026-06_25",
      period_type: "25",
      period_start: "2026-06-01T00:00:00.000Z",
      period_end: "2026-06-16T00:00:00.000Z",
      status: "locked",
      gross_amount: 0,
      deposit_deduction_amount: 0,
      net_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      paid_status: "unpaid"
    },
    {
      payout_id: "payout_2026-07_10",
      period_type: "10",
      period_start: "2026-06-16T00:00:00.000Z",
      period_end: "2026-07-01T00:00:00.000Z",
      status: "locked",
      gross_amount: 1000,
      deposit_deduction_amount: 0,
      net_amount: 1000,
      paid_amount: 400,
      remaining_amount: 600,
      paid_status: "partial"
    }
  ])`);

  const html = elements.get("techPayoutPeriods").innerHTML;
  assert.match(html, /จ่าย: ไม่มียอดจ่าย/);
  assert.match(html, /จ่าย: จ่ายบางส่วน/);
});

test("technician payout detail modal uses the same no-pay display rule as the list", async () => {
  const { run, elements } = createAppSandbox({
    fetchResponse: {
      ok: true,
      payout_id: "payout_2026-06_25",
      period_type: "25",
      period_start: "2026-06-01T00:00:00.000Z",
      period_end: "2026-06-16T00:00:00.000Z",
      status: "locked",
      gross_amount: 0,
      adj_total: 0,
      deposit_deduction_amount: 0,
      net_amount: 0,
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      paid_status: "unpaid",
      lines: [],
      adjustments: [],
      payment: null,
    },
  });

  await run(`openTechPayoutDetail("payout_2026-06_25")`);

  assert.match(elements.get("techPayoutModalSub").textContent, /ไม่มียอดจ่าย/);
});
