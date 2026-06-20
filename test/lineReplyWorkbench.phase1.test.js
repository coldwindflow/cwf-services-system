const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const createRoutes = require("../server/routes/adminAiOfficeControlCenter");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeApprovalPool {
  constructor(approval, options = {}) {
    this.approvals = new Map([[Number(approval.id), clone(approval)]]);
    this.settings = options.settings || {
      kill_switch: false,
      admin_approved_line_send_enabled: true,
      ai_office_enabled: true,
    };
    this.claims = 0;
    this.sentTransitions = 0;
    this.eventRows = [];
  }

  async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim();
    if (/CREATE |ALTER |CREATE INDEX|CREATE UNIQUE INDEX|ON CONFLICT/i.test(text)) return { rows: [] };
    if (/INSERT INTO public\.ai_office_control_settings/i.test(text)) return { rows: [] };
    if (/SELECT \* FROM public\.ai_office_control_settings ORDER BY/i.test(text)) {
      return {
        rows: Object.entries(this.settings).map(([key, value]) => ({
          key,
          category: "reply",
          label: key,
          description: "",
          value,
          locked: false,
        })),
      };
    }
    if (/UPDATE public\.ai_auto_reply_approvals SET status='sending'/i.test(text)) {
      await new Promise((resolve) => setTimeout(resolve, 2));
      const id = Number(params[0]);
      const row = this.approvals.get(id);
      if (!row || row.status !== "approved") return { rows: [] };
      row.status = "sending";
      row.admin_note = params[1] || row.admin_note || "";
      this.claims += 1;
      return { rows: [clone(row)] };
    }
    if (/SELECT id, status FROM public\.ai_auto_reply_approvals WHERE id=\$1/i.test(text)) {
      const row = this.approvals.get(Number(params[0]));
      return { rows: row ? [{ id: row.id, status: row.status }] : [] };
    }
    if (/SELECT \* FROM public\.line_conversations WHERE id=\$1/i.test(text)) {
      return { rows: [{ id: Number(params[0]), line_user_id: "U-from-conversation", display_name: "LINE User" }] };
    }
    if (/UPDATE public\.ai_auto_reply_approvals SET status='approved'/i.test(text)) {
      const row = this.approvals.get(Number(params[0]));
      if (row && row.status === "sending") {
        row.status = "approved";
        row.line_response = params[1] || "";
      }
      return { rows: row ? [clone(row)] : [] };
    }
    if (/UPDATE public\.ai_auto_reply_approvals SET status='sent'/i.test(text)) {
      const row = this.approvals.get(Number(params[0]));
      if (!row || row.status !== "sending") return { rows: [] };
      row.status = "sent";
      row.sent_by = params[1];
      row.line_user_id = row.line_user_id || params[2];
      row.line_response = params[3];
      this.sentTransitions += 1;
      return { rows: [clone(row)] };
    }
    if (/INSERT INTO public\.ai_office_control_events/i.test(text)) {
      this.eventRows.push({ params });
      return { rows: [] };
    }
    return { rows: [] };
  }

  row(id = 1) {
    return this.approvals.get(Number(id));
  }
}

function approvedApproval(patch = {}) {
  return {
    id: 1,
    conversation_id: 10,
    line_user_id: "U-approved",
    line_display_name: "Customer",
    customer_message: "hello",
    ai_draft: "draft text",
    final_reply: "approved database reply",
    risk_label: "LOW",
    decision: "APPROVAL_REQUIRED",
    status: "approved",
    source: "ai_draft",
    source_draft_id: 55,
    metadata: {},
    ...patch,
  };
}

async function expectConflictForStatus(status) {
  const pool = new FakeApprovalPool(approvedApproval({ status }));
  let calls = 0;
  await assert.rejects(
    () => createRoutes.sendApprovedLine(pool, 1, "admin", {
      lineSender: async () => {
        calls += 1;
        return "OK";
      },
    }),
    (error) => error.status === 409 && error.message === "APPROVAL_STATUS_NOT_SENDABLE"
  );
  assert.equal(calls, 0);
}

test("backend send rejects every non-approved approval status with 409", async () => {
  for (const status of ["pending", "edited", "rejected", "admin_only", "sent", "sending", "unknown", "", null]) {
    await expectConflictForStatus(status);
  }
});

test("backend approved send atomically claims and sends exact stored final_reply", async () => {
  const pool = new FakeApprovalPool(approvedApproval());
  const sent = [];
  const result = await createRoutes.sendApprovedLine(pool, 1, "admin", {
    lineSender: async (lineUserId, text) => {
      sent.push({ lineUserId, text });
      return "LINE_OK";
    },
  });
  assert.equal(pool.claims, 1);
  assert.equal(pool.sentTransitions, 1);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { lineUserId: "U-approved", text: "approved database reply" });
  assert.equal(result.status, "sent");
  assert.equal(pool.row().final_reply, "approved database reply");
});

test("send route ignores malicious final_reply and preserves approved database reply", async () => {
  const pool = new FakeApprovalPool(approvedApproval());
  const sent = [];
  const app = express();
  app.use(express.json());
  app.use(createRoutes({
    pool,
    requireAdminSession: (req, _res, next) => {
      req.session = { user: { username: "admin" } };
      next();
    },
    lineSender: async (_to, text) => {
      sent.push(text);
      return "OK";
    },
  }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/admin/ai-office/control/approvals/1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final_reply: "malicious replacement", admin_note: "send" }),
    });
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.deepEqual(sent, ["approved database reply"]);
    assert.equal(pool.row().final_reply, "approved database reply");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("concurrent sends produce one claim, one LINE call, one sent transition, and one conflict", async () => {
  const pool = new FakeApprovalPool(approvedApproval());
  const sent = [];
  const send = () => createRoutes.sendApprovedLine(pool, 1, "admin", {
    lineSender: async (_to, text) => {
      sent.push(text);
      await new Promise((resolve) => setTimeout(resolve, 4));
      return "OK";
    },
  }).then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
  const results = await Promise.all([send(), send()]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.error.status === 409).length, 1);
  assert.equal(pool.claims, 1);
  assert.equal(sent.length, 1);
  assert.equal(pool.sentTransitions, 1);
  assert.equal(pool.row().status, "sent");
});

test("LINE API failure reverts to approved and retry can claim again", async () => {
  const pool = new FakeApprovalPool(approvedApproval());
  let attempts = 0;
  await assert.rejects(
    () => createRoutes.sendApprovedLine(pool, 1, "admin", {
      lineSender: async () => {
        attempts += 1;
        throw Object.assign(new Error("provider failed Bearer SECRET_TOKEN"), { status: 502 });
      },
    }),
    (error) => error.status === 502 && error.message === "LINE_SEND_FAILED"
  );
  assert.equal(pool.row().status, "approved");
  assert.match(pool.row().line_response, /SEND_FAILED/);
  assert.doesNotMatch(pool.row().line_response, /SECRET_TOKEN/);
  const result = await createRoutes.sendApprovedLine(pool, 1, "admin", {
    lineSender: async () => {
      attempts += 1;
      return "OK";
    },
  });
  assert.equal(attempts, 2);
  assert.equal(result.status, "sent");
});

test("sending already sent approval returns 409 and does not send twice", async () => {
  const pool = new FakeApprovalPool(approvedApproval());
  let calls = 0;
  await createRoutes.sendApprovedLine(pool, 1, "admin", {
    lineSender: async () => {
      calls += 1;
      return "OK";
    },
  });
  await assert.rejects(
    () => createRoutes.sendApprovedLine(pool, 1, "admin", {
      lineSender: async () => {
        calls += 1;
        return "OK";
      },
    }),
    (error) => error.status === 409
  );
  assert.equal(calls, 1);
});

test("safeProviderError redacts bearer tokens", () => {
  const cleaned = createRoutes.safeProviderError(new Error("bad Bearer SECRET_TOKEN LINE_CHANNEL_ACCESS_TOKEN=VERYSECRET"));
  assert.doesNotMatch(cleaned, /SECRET_TOKEN|VERYSECRET/);
  assert.match(cleaned, /redacted/);
});

function loadWorkbench() {
  const source = fs.readFileSync(path.join(__dirname, "..", "admin-ai-control-center.js"), "utf8");
  const listeners = {};
  const context = {
    console,
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { search: "" },
    URLSearchParams,
    FormData: class {},
    alert: () => {},
    confirm: () => true,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    window: {},
    document: {
      readyState: "loading",
      body: { getAttribute: () => null, appendChild: () => {} },
      head: { appendChild: () => {} },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ id: "", style: {}, textContent: "", appendChild: () => {}, setAttribute: () => {} }),
      addEventListener: (name, fn) => { listeners[name] = fn; },
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "admin-ai-control-center.js" });
  return context.window.__CWF_LINE_REPLY_WORKBENCH_TEST__;
}

test("frontend send body contains only allowed fields and no final_reply", () => {
  const wb = loadWorkbench();
  const body = wb.approvedLineSendBody();
  assert.deepEqual(Object.keys(body), ["admin_note"]);
  assert.equal(body.admin_note, "sent_by_admin_from_control_center");
  assert.equal(Object.prototype.hasOwnProperty.call(body, "final_reply"), false);
});

test("frontend duplicate approval matching requires conversation_id and source_draft_id", () => {
  const wb = loadWorkbench();
  const approvals = [
    { id: 1, conversation_id: 10, source_draft_id: 100, status: "approved" },
    { id: 2, conversation_id: 10, source_draft_id: 200, status: "sent" },
    { id: 3, conversation_id: 11, source_draft_id: 200, status: "pending" },
    { id: 4, conversation_id: 10, source_draft_id: 200, status: "edited" },
  ];
  assert.equal(wb.reusableApprovalForDraft(approvals, 10, 200).id, 4);
  assert.equal(wb.reusableApprovalForDraft(approvals, 10, 100).id, 1);
  assert.equal(wb.reusableApprovalForDraft(approvals, 11, 100), null);
});

test("frontend only pending edited approved records are reused for a draft", () => {
  const wb = loadWorkbench();
  for (const status of ["rejected", "admin_only", "sent", "sending", "unknown", "", null]) {
    assert.equal(wb.reusableApprovalForDraft([{ id: 1, conversation_id: 9, source_draft_id: 8, status }], 9, 8), null);
  }
  for (const status of ["pending", "edited", "approved"]) {
    assert.equal(wb.reusableApprovalForDraft([{ id: 1, conversation_id: 9, source_draft_id: 8, status }], 9, 8).id, 1);
  }
});

test("frontend unknown and empty guard modes fail closed with admin review label", () => {
  const wb = loadWorkbench();
  for (const guard of [{ mode: "unknown" }, { mode: "" }, null, { mode: "unsupported" }]) {
    const state = wb.humanGuardState(guard);
    assert.equal(state.canSend, false);
    assert.equal(state.label, "ตรวจสอบโดยแอดมินก่อน");
  }
});

test("frontend queue button is hidden for admin_only needs_teaching unknown guards", () => {
  const wb = loadWorkbench();
  for (const mode of ["admin_only", "needs_teaching", "unknown", "", "unsupported"]) {
    wb.STATE.selectedConversation = { id: 10 };
    wb.STATE.lineDraftResult = { answer: "reply", draft: { saved_draft_id: 5, conversation_id: 10, reply_guard: { mode, can_answer: !["admin_only", "needs_teaching"].includes(mode) } } };
    assert.equal(wb.canQueueLineDraft(wb.STATE.lineDraftResult.draft), false);
    assert.doesNotMatch(wb.renderLineDraftResult(), /data-create-approval-from-draft/);
  }
});

test("frontend safe known guard modes retain queue behavior", () => {
  const wb = loadWorkbench();
  for (const mode of ["safe_reply", "guided_reply"]) {
    const draft = { saved_draft_id: 5, conversation_id: 10, reply_guard: { mode, can_answer: true } };
    wb.STATE.lineDraftResult = { answer: "reply", draft };
    assert.equal(wb.canQueueLineDraft(draft), true);
    assert.match(wb.renderLineDraftResult(), /data-create-approval-from-draft/);
  }
});
