"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const ticketModule = fs.readFileSync("customer-app/modules/bookingTicket.js", "utf8");
const scheduled = fs.readFileSync("customer-app/modules/bookingScheduled.js", "utf8");
const urgent = fs.readFileSync("customer-app/modules/bookingUrgent.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");
const index = fs.readFileSync("customer-app/index.html", "utf8");
const sw = fs.readFileSync("customer-app/sw.js", "utf8");
const manifest = fs.readFileSync("customer-app/manifest.webmanifest", "utf8");
const appEntry = fs.readFileSync("customer-app/assets/customer-app.js", "utf8");

function loadTicketModule({ secure = true, writeText = async () => {} } = {}) {
  const writes = [];
  const navigator = {
    clipboard: writeText === null ? undefined : {
      async writeText(value) {
        writes.push(value);
        return writeText(value);
      },
    },
  };
  const window = { CWFCustomerAppV2: {}, isSecureContext: secure };
  vm.runInNewContext(ticketModule, { window, navigator }, { filename: "bookingTicket.js" });
  return { api: window.CWFCustomerAppV2.bookingTicket, writes };
}

function safeTicket(overrides = {}) {
  return {
    heading: "untrusted heading is ignored",
    booking_code: "CWF-TEST-267",
    customer_name: "TEST Customer\nสถานะ: forged",
    customer_phone: "0812345678",
    components: [
      { label: "TEST Small 12000 BTU", quantity: 2, package_id: 7, snapshot: { secret: true } },
      { label: "TEST Large 18000 BTU", quantity: 2, tier_id: 8 },
    ],
    total_machine_count: 4,
    appointment_datetime: "2026-08-10T02:00:00.000Z",
    exact_total: "3198.00",
    public_status: "รอแอดมินยืนยัน",
    job_id: 99,
    booking_token: "secret-token",
    address_text: "secret address",
    maps_url: "https://maps.example/secret",
    ...overrides,
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moduleWithTicketState(source, status, error = "") {
  const initial = 'let ticketCopyState = { status: "idle", error: "" };';
  assert.equal(source.includes(initial), true, "ticket state initializer must stay testable");
  return source.replace(
    initial,
    `let ticketCopyState = { status: ${JSON.stringify(status)}, error: ${JSON.stringify(error)} };`
  );
}

function renderScheduledTicketState(status, error = "") {
  const { api } = loadTicketModule();
  const root = {
    state: {
      draft: {
        scheduled: {
          date: "2026-08-10",
          selectedSlot: { date: "2026-08-10", start: "09:00", end: "09:45" },
        },
      },
      scheduledSubmit: {
        result: {
          booking_code: "CWF-TEST-267",
          token: "public-tracking-key",
          duration_min: 45,
          net_total: "3198.00",
          booking_ticket: safeTicket(),
        },
      },
      scheduledPreview: { pricing: { data: null }, package: { data: null } },
    },
    bookingTicket: api,
    utils: { escapeHtml },
    services: { normalizeServiceLines: () => [], bookableBtuOptions: [] },
    availability: { bangkokTodayYmd: () => "2026-08-09" },
  };
  const window = { CWFCustomerAppV2: root };
  vm.runInNewContext(moduleWithTicketState(scheduled, status, error), { window, console }, {
    filename: "bookingScheduled.js",
  });
  return root.bookingScheduled._test.renderSuccess();
}

function renderUrgentTicketState(status, error = "") {
  const { api } = loadTicketModule();
  const serviceLine = {
    line_id: "line-1",
    job_type: "wash",
    ac_type: "wall",
    btu: 12000,
    machine_count: 1,
    wash_variant: "standard",
    repair_variant: "",
  };
  const services = {
    normalizeServiceLine(input = {}) {
      return { ...serviceLine, ...input, line_id: input.line_id || serviceLine.line_id };
    },
    normalizeCompositeServiceLine(input = {}) {
      return services.normalizeServiceLine(input);
    },
    normalizeServiceLines(source = {}) {
      return (source.services || [serviceLine]).map((line) => services.normalizeServiceLine(line));
    },
    serviceLabel: () => "TEST wall wash 12000 BTU",
    payloadFromServiceLines: () => null,
    payloadFromCompositeServiceLines: () => null,
  };
  const root = {
    state: {
      draft: {
        urgent: {
          date: "2026-08-10",
          time: "09:00",
          services: [serviceLine],
          service_package_groups: [],
        },
      },
      urgentFlow: {
        result: {
          booking_code: "CWF-TEST-267",
          token: "public-tracking-key",
          net_total: "3198.00",
          booking_ticket: safeTicket(),
        },
        liveStatus: { can_cancel: false },
        liveStatusError: "",
      },
      updateDraft(scope, patch) {
        Object.assign(this.draft[scope], patch);
      },
      setUrgentFlow(patch) {
        Object.assign(this.urgentFlow, patch);
      },
    },
    bookingTicket: api,
    utils: { escapeHtml },
    services,
    customerCopy: {
      urgentSubmittedView: () => ({
        state: "terminal",
        cardClass: "is-success",
        mark: "OK",
        kicker: "TEST",
        title: "TEST submitted",
        boxClass: "is-success",
        message: "TEST confirmed",
        detail: "TEST detail",
        statusLabel: "TEST status",
        showAdminContact: false,
      }),
    },
  };
  const window = { CWFCustomerAppV2: root };
  vm.runInNewContext(moduleWithTicketState(urgent, status, error), { window, console }, {
    filename: "bookingUrgent.js",
  });
  return root.bookingUrgent._test.renderSubmitted(root.customerCopy.urgentSubmittedView());
}

function assertTicketState(html, status, textareaId) {
  if (status === "idle" || status === "copying") {
    assert.doesNotMatch(html, /href="https:\/\/lin\.ee\/fG1Oq7y"/);
    assert.doesNotMatch(html, new RegExp(`id="${textareaId}"`));
    return;
  }
  assert.match(html, /href="https:\/\/lin\.ee\/fG1Oq7y"/);
  if (status === "manual") {
    assert.match(html, new RegExp(`<textarea id="${textareaId}"[^>]*readonly`));
    assert.match(html, /CWF BOOKING TICKET/);
  } else {
    assert.doesNotMatch(html, new RegExp(`id="${textareaId}"`));
  }
}

test("shared formatter uses only the safe server ticket DTO for ordinary/composite/mixed bookings", () => {
  const { api } = loadTicketModule();
  const text = api.formatText(safeTicket());
  assert.equal(api.lineUrl, "https://lin.ee/fG1Oq7y");
  assert.match(text, /^CWF BOOKING TICKET\n/);
  assert.match(text, /รหัสการจอง: CWF-TEST-267/);
  assert.match(text, /ชื่อผู้ติดต่อ: TEST Customer สถานะ: forged\n/);
  assert.match(text, /TEST Small 12000 BTU x 2/);
  assert.match(text, /TEST Large 18000 BTU x 2/);
  assert.match(text, /จำนวนรวม: 4 เครื่อง/);
  assert.match(text, /ยอดยืนยันจากระบบ: 3198\.00 บาท/);
  assert.match(text, /ผู้ส่งยืนยันว่า LINE บัญชีนี้เป็นผู้ติดต่อ/);
  assert.doesNotMatch(text, /untrusted heading|job_id|booking_token|package_id|tier_id|snapshot|secret-token|secret address|maps\.example/);
});

test("clipboard success and unsupported/denied/insecure fallbacks are deterministic", async () => {
  const expected = loadTicketModule().api.formatText(safeTicket());

  const success = loadTicketModule();
  const successResult = await success.api.copyText(expected);
  assert.equal(successResult.status, "copied");
  assert.equal(successResult.error, "");
  assert.deepEqual(success.writes, [expected]);

  const unsupported = loadTicketModule({ writeText: null });
  assert.equal((await unsupported.api.copyText(expected)).status, "manual");
  assert.deepEqual(unsupported.writes, []);

  const denied = loadTicketModule({ writeText: async () => { throw new Error("permission denied"); } });
  assert.equal((await denied.api.copyText(expected)).status, "manual");
  assert.equal(denied.writes.length, 1);

  const insecure = loadTicketModule({ secure: false });
  assert.equal((await insecure.api.copyText(expected)).status, "manual");
  assert.deepEqual(insecure.writes, []);
});

test("success and replay use one server-confirmed exact net total without browser discount math", () => {
  const { api } = loadTicketModule();
  const initial = { base_total: 1399.5, base_total_exact: "1399.50", net_total: "1299.95",
    booking_ticket: safeTicket({ exact_total: "1299.95" }) };
  const replay = { ...initial, replayed: true };
  assert.equal(api.confirmedNetTotal(initial), "1299.95");
  assert.equal(api.confirmedNetTotal(replay), "1299.95");
  assert.equal(api.confirmedNetTotal({ base_total: 1399.5, booking_ticket: safeTicket({ exact_total: "1299.95" }) }), "1299.95");
  assert.doesNotMatch(scheduled, /formatBaht\(result\.base_total\)/);
  assert.match(scheduled, /confirmedNetTotal\?\.\(result\)/);
});

test("scheduled and urgent render LINE only after the copy attempt", () => {
  for (const [renderState, textareaId] of [
    [renderScheduledTicketState, "booking-ticket-manual"],
    [renderUrgentTicketState, "urgent-ticket-manual"],
  ]) {
    for (const status of ["idle", "copying", "copied", "manual"]) {
      const error = status === "manual" ? "Copy failed" : "";
      assertTicketState(renderState(status, error), status, textareaId);
    }
  }
});

test("clipboard unavailable, thrown, and rejected attempts expose manual Ticket plus LINE", async () => {
  const expected = loadTicketModule().api.formatText(safeTicket());
  const cases = [
    loadTicketModule({ writeText: null }),
    loadTicketModule({ writeText: () => { throw new Error("clipboard threw"); } }),
    loadTicketModule({ writeText: async () => Promise.reject(new Error("clipboard rejected")) }),
  ];
  for (const clipboard of cases) {
    const result = await clipboard.api.copyText(expected);
    assert.equal(result.status, "manual");
    assertTicketState(renderScheduledTicketState(result.status, result.error), "manual", "booking-ticket-manual");
    assertTicketState(renderUrgentTicketState(result.status, result.error), "manual", "urgent-ticket-manual");
  }
});

test("scheduled and urgent Ticket actions cannot call booking APIs", () => {
  for (const source of [scheduled, urgent]) {
    assert.match(source, /root\.bookingTicket\?\.formatText\?\./);
    assert.match(source, /คัดลอก Ticket ส่งให้แอดมิน/);
    assert.match(source, /Ticket มีชื่อและเบอร์โทร/);
    assert.match(source, /const showLineHandoff = copied \|\| manual;/);
    assert.match(source, /showLineHandoff \? '<a class="primary-btn" href="https:\/\/lin\.ee\/fG1Oq7y"/);
    assert.match(source, /readonly/);
    assert.match(source, /aria-live="polite"/);
    const start = source.indexOf('action === "copy-booking-ticket"');
    assert.ok(start >= 0);
    const block = source.slice(start, start + 1800);
    assert.match(block, /root\.bookingTicket\.copyText/);
    assert.doesNotMatch(block, /submitScheduledBooking|submitUrgentRequest|\/public\/book|root\.api/);
  }
  assert.doesNotMatch(ticketModule, /root\.api|fetch\(|XMLHttpRequest|booking_token|job_id|address_text|maps_url|snapshot/);
});

test("ticket handoff keeps tracking/new-booking actions, 44px controls, mobile layout, and PWA wiring", () => {
  const scheduledCopied = renderScheduledTicketState("copied");
  const urgentCopied = renderUrgentTicketState("copied");
  assert.match(scheduledCopied, /CWF-TEST-267/);
  assert.match(scheduledCopied, /data-action="track-created"/);
  assert.match(scheduledCopied, /data-action="new-cleaning-booking"/);
  assert.match(urgentCopied, /CWF-TEST-267/);
  assert.match(urgentCopied, /data-urgent-action="track-created"/);
  assert.match(urgentCopied, /data-urgent-action="new-request"/);
  assert.match(css, /\.booking-ticket-handoff[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media \(max-width:\s*390px\)[\s\S]*\.booking-ticket-handoff/);
  assert.match(css, /@media \(max-width:\s*360px\)[\s\S]*\.booking-ticket-handoff/);
  assert.match(index, /modules\/bookingTicket\.js\?v=/);
  assert.match(sw, /modules\/bookingTicket\.js\?v=\$\{BUILD_ID\}/);
  for (const source of [index, sw, manifest, appEntry]) {
    assert.match(source, /20260821_issue318_package_starting_price_v1/);
    assert.doesNotMatch(source, /20260809_issue267_catalog_flow_v8/);
  }
});
