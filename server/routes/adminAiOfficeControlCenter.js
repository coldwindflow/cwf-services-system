const express = require("express");

function cleanText(value, max = 2000) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function boolValue(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value == null ? "" : value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "เปิด", "enabled"].includes(s)) return true;
  if (["false", "0", "no", "off", "ปิด", "disabled"].includes(s)) return false;
  return fallback;
}

const DEFAULT_SETTINGS = [
  { key:"ai_office_enabled", category:"main", label:"เปิดใช้งาน AI Office", description:"เปิดให้ AI Office อ่านข้อมูลและช่วยร่างงานภายใน", value:true, locked:false },
  { key:"kill_switch", category:"main", label:"หยุด AI ตอบ/ร่างทันที", description:"เปิดสวิตช์นี้เพื่อหยุดการร่างคำตอบและการทำงานเชิงตอบลูกค้าทั้งหมดทันที", value:false, locked:false },

  { key:"line_inbox_read_enabled", category:"line", label:"อ่าน LINE Inbox", description:"ให้ AI Office อ่านข้อความจริงจาก LINE Inbox เพื่อช่วยแอดมิน", value:true, locked:false },
  { key:"line_intake_enabled", category:"line", label:"สร้างการ์ดงานจาก LINE", description:"ให้ระบบสร้างการ์ดลูกค้าจากข้อความ LINE ที่มีแนวโน้มเป็นงานจอง", value:true, locked:false },
  { key:"booking_card_alert_enabled", category:"line", label:"แจ้งเตือนบนหน้างานจอง", description:"แสดงการ์ดลูกค้า LINE ในหน้างานจองเฉพาะรายการที่ต้องให้แอดมินเห็น", value:true, locked:false },

  { key:"draft_reply_enabled", category:"reply", label:"ให้ AI ร่างคำตอบ", description:"AI ร่างข้อความให้แอดมินคัดลอก/แก้ไขเอง ไม่ส่ง LINE อัตโนมัติ", value:true, locked:false },
  { key:"ask_missing_info_enabled", category:"reply", label:"แนะนำคำถามข้อมูลที่ขาด", description:"ให้ AI ช่วยเขียนคำถามต่อเมื่อลูกค้ายังให้ข้อมูลไม่ครบ", value:true, locked:false },
  { key:"price_reply_draft_enabled", category:"reply", label:"ร่างคำตอบราคา/โปร", description:"ให้ AI ร่างคำตอบเรื่องราคาโดยใช้ราคาจริงของ CWF เท่านั้น", value:true, locked:false },
  { key:"sales_objection_draft_enabled", category:"reply", label:"ช่วยตอบลูกค้าบอกแพง", description:"ให้ AI ช่วยร่างคำตอบเชิงขายแบบสุภาพ ไม่ลดราคาเอง", value:true, locked:false },
  { key:"approval_required_enabled", category:"reply", label:"ข้อความสำคัญต้องให้แอดมินอนุมัติ", description:"เคสจอง/คิว/ต่อราคา/ซ่อม/เรื่องเสี่ยง ต้องให้แอดมินตรวจก่อนใช้", value:true, locked:false },
  { key:"approval_queue_enabled", category:"reply", label:"คิวอนุมัติข้อความตอบ", description:"ให้ AI ส่งร่างเข้าแผงอนุมัติก่อนใช้กับลูกค้า", value:true, locked:false },
  { key:"admin_approved_line_send_enabled", category:"reply", label:"แอดมินกดส่ง LINE จากคิวอนุมัติ", description:"ให้แอดมินส่งข้อความที่อนุมัติแล้วไป LINE ได้ด้วยปุ่มส่งเอง ไม่ใช่ Auto Send", value:false, locked:false },
  { key:"safe_reply_decision_enabled", category:"reply", label:"เครื่องกรองความปลอดภัยคำตอบ", description:"ให้ระบบคัดกรองข้อความลูกค้าว่าร่างตอบได้ รออนุมัติ หรือให้แอดมินตอบเอง", value:true, locked:false },
  { key:"safe_reply_preview_enabled", category:"reply", label:"ทดสอบคำตอบก่อนใช้", description:"ให้แอดมินวางข้อความลูกค้าแล้วดูคำตอบแนะนำก่อนส่งเข้าคิวอนุมัติ", value:true, locked:false },
  { key:"auto_create_approval_from_safe_reply", category:"reply", label:"ส่งร่างปลอดภัยเข้าคิวอนุมัติ", description:"เมื่อวิเคราะห์คำตอบแล้ว ให้สร้างรายการในคิวอนุมัติได้จากปุ่มเดียว ยังไม่ส่ง LINE เอง", value:true, locked:false },
  { key:"auto_safe_reply_send_enabled", category:"reply", label:"ให้ AI ส่งเองเฉพาะเคสปลอดภัย", description:"ล็อกปิดในระยะนี้ ระบบทำได้แค่วิเคราะห์และส่งเข้าคิวอนุมัติ", value:false, locked:true },
  { key:"auto_send_line_enabled", category:"reply", label:"ให้ AI ส่ง LINE เอง", description:"ล็อกปิดในระยะนี้ เพื่อความปลอดภัย ระบบยังไม่ส่งข้อความแทนแอดมิน", value:false, locked:true },

  { key:"complaint_admin_only", category:"safety", label:"ร้องเรียนให้แอดมินตอบเอง", description:"ร้องเรียน/เสียหาย/ขู่รีวิว/แจ้งความ ต้องไม่ให้ AI ตอบแทน", value:true, locked:true },
  { key:"tax_invoice_admin_only", category:"safety", label:"ใบกำกับภาษีให้แอดมินตรวจ", description:"ระบบ CWF ยังออกใบกำกับภาษีไม่ได้ ต้องไม่เสนอเอง", value:true, locked:true },
  { key:"price_discount_locked", category:"safety", label:"ห้าม AI ลดราคาเอง", description:"AI ห้ามให้ส่วนลด/เปลี่ยนราคา/ยืนยันราคาพิเศษเอง", value:true, locked:true },
  { key:"confirm_queue_locked", category:"safety", label:"ห้าม AI ยืนยันคิวเอง", description:"AI ห้ามยืนยันคิว/ช่างว่าง/นัดหมายเองถ้าแอดมินยังไม่ตรวจ", value:true, locked:true }
];

async function ensureAiOfficeControlSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_office_control_settings (
      key TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'main',
      label TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      value JSONB NOT NULL DEFAULT 'false'::jsonb,
      locked BOOLEAN NOT NULL DEFAULT false,
      updated_by TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_office_control_events (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NULL,
      old_value JSONB NULL,
      new_value JSONB NULL,
      action TEXT NOT NULL DEFAULT 'update',
      admin_user TEXT NULL,
      note TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_reply_approvals (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NULL,
      line_display_name TEXT NULL,
      customer_message TEXT NULL,
      ai_draft TEXT NOT NULL DEFAULT '',
      final_reply TEXT NOT NULL DEFAULT '',
      risk_label TEXT NOT NULL DEFAULT 'LOW',
      decision TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
      decision_reason TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'ai_draft',
      source_draft_id BIGINT NULL,
      approved_by TEXT NULL,
      approved_at TIMESTAMPTZ NULL,
      rejected_by TEXT NULL,
      rejected_at TIMESTAMPTZ NULL,
      sent_by TEXT NULL,
      sent_at TIMESTAMPTZ NULL,
      line_response TEXT NULL,
      admin_note TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_reply_approvals_status_created ON public.ai_auto_reply_approvals(status, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_reply_approvals_conversation ON public.ai_auto_reply_approvals(conversation_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_reply_decision_logs (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NULL,
      line_display_name TEXT NULL,
      customer_message TEXT NOT NULL DEFAULT '',
      normalized_intent TEXT NOT NULL DEFAULT 'unknown',
      decision TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
      risk_label TEXT NOT NULL DEFAULT 'MEDIUM',
      confidence INTEGER NOT NULL DEFAULT 0,
      decision_reason TEXT NULL,
      recommended_reply TEXT NULL,
      approval_id BIGINT NULL,
      source TEXT NOT NULL DEFAULT 'control_center',
      created_by TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_created ON public.ai_reply_decision_logs(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_decision ON public.ai_reply_decision_logs(decision, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_decision_logs_conversation ON public.ai_reply_decision_logs(conversation_id)`);
  for (const item of DEFAULT_SETTINGS) {
    await pool.query(`
      INSERT INTO public.ai_office_control_settings(key, category, label, description, value, locked)
      VALUES($1,$2,$3,$4,$5::jsonb,$6)
      ON CONFLICT (key) DO UPDATE SET
        category=EXCLUDED.category,
        label=EXCLUDED.label,
        description=EXCLUDED.description,
        locked=EXCLUDED.locked,
        updated_at=public.ai_office_control_settings.updated_at
    `, [item.key, item.category, item.label, item.description, JSON.stringify(item.value), item.locked]);
  }
}

function normalizeRow(row) {
  let value = row.value;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch (_) {}
  }
  return {
    key: row.key,
    category: row.category || "main",
    label: row.label || row.key,
    description: row.description || "",
    value,
    locked: !!row.locked,
    updated_by: row.updated_by || "",
    updated_at: row.updated_at || null,
  };
}

async function loadSettings(pool) {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`SELECT * FROM public.ai_office_control_settings ORDER BY category, key`);
  const settings = (r.rows || []).map(normalizeRow);
  const values = settings.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
  return { settings, values };
}

async function patchSetting(pool, key, value, adminUser = "", note = "") {
  await ensureAiOfficeControlSchema(pool);
  const safeKey = cleanText(key, 120);
  const found = await pool.query(`SELECT * FROM public.ai_office_control_settings WHERE key=$1`, [safeKey]);
  const row = found.rows?.[0];
  if (!row) {
    const err = new Error("UNKNOWN_AI_CONTROL_SETTING");
    err.status = 404;
    throw err;
  }
  if (row.locked) {
    const err = new Error("AI_CONTROL_SETTING_LOCKED");
    err.status = 423;
    throw err;
  }
  if (safeKey === "auto_send_line_enabled" && boolValue(value, false)) {
    const err = new Error("AUTO_SEND_LINE_LOCKED_FOR_PHASE_1");
    err.status = 423;
    throw err;
  }
  const oldValue = row.value;
  const saved = await pool.query(`
    UPDATE public.ai_office_control_settings
       SET value=$2::jsonb,
           updated_by=$3,
           updated_at=NOW()
     WHERE key=$1
     RETURNING *
  `, [safeKey, JSON.stringify(value), cleanText(adminUser, 160)]);
  await pool.query(`
    INSERT INTO public.ai_office_control_events(key, old_value, new_value, action, admin_user, note)
    VALUES($1,$2::jsonb,$3::jsonb,'update',$4,$5)
  `, [safeKey, JSON.stringify(oldValue), JSON.stringify(value), cleanText(adminUser, 160), cleanText(note, 1000)]).catch(()=>{});
  return normalizeRow(saved.rows?.[0]);
}

async function getControlValues(pool) {
  try {
    const { values } = await loadSettings(pool);
    return values || {};
  } catch (_) {
    return DEFAULT_SETTINGS.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
  }
}

function isDraftAllowed(values = {}) {
  if (boolValue(values.kill_switch, false)) return { ok:false, reason:"AI_KILL_SWITCH_ON" };
  if (!boolValue(values.ai_office_enabled, true)) return { ok:false, reason:"AI_OFFICE_DISABLED" };
  if (!boolValue(values.draft_reply_enabled, true)) return { ok:false, reason:"DRAFT_REPLY_DISABLED" };
  return { ok:true };
}

async function queryOptional(pool, sql, params = [], fallback = null) {
  try { return await pool.query(sql, params); } catch (_) { return fallback; }
}


function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch (_) { return {}; }
}

function normalizeApprovalRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
    line_user_id: row.line_user_id || "",
    line_display_name: row.line_display_name || "",
    customer_message: row.customer_message || "",
    ai_draft: row.ai_draft || "",
    final_reply: row.final_reply || row.ai_draft || "",
    risk_label: row.risk_label || "LOW",
    decision: row.decision || "APPROVAL_REQUIRED",
    decision_reason: row.decision_reason || "",
    status: row.status || "pending",
    source: row.source || "ai_draft",
    source_draft_id: row.source_draft_id == null ? null : Number(row.source_draft_id),
    approved_by: row.approved_by || "",
    approved_at: row.approved_at || null,
    rejected_by: row.rejected_by || "",
    rejected_at: row.rejected_at || null,
    sent_by: row.sent_by || "",
    sent_at: row.sent_at || null,
    line_response: row.line_response || "",
    admin_note: row.admin_note || "",
    metadata: parseJsonObject(row.metadata),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadConversationMeta(pool, conversationId) {
  const id = Number(conversationId || 0);
  if (!id) return null;
  try {
    const r = await pool.query(`SELECT * FROM public.line_conversations WHERE id=$1 LIMIT 1`, [id]);
    return r.rows?.[0] || null;
  } catch (_) { return null; }
}
function pickLineUserId(row) { return cleanText(row?.line_user_id || row?.user_id || row?.source_user_id || row?.line_id || "", 255); }
function pickDisplayName(row) { return cleanText(row?.display_name || row?.line_display_name || row?.profile_display_name || row?.name || "", 255); }

async function listApprovals(pool, options = {}) {
  await ensureAiOfficeControlSchema(pool);
  const status = cleanText(options.status || "pending", 80);
  const limit = Math.max(1, Math.min(200, Number(options.limit || 80)));
  const params = [];
  let where = "";
  if (status && status !== "all") {
    params.push(status === "open" ? ["pending","edited","approved"] : [status]);
    where = `WHERE a.status = ANY($${params.length}::text[])`;
  }
  params.push(limit);
  const r = await pool.query(`
    SELECT a.*,
           COALESCE(a.line_display_name, c.display_name, '') AS line_display_name,
           COALESCE(a.line_user_id, '') AS line_user_id
      FROM public.ai_auto_reply_approvals a
      LEFT JOIN public.line_conversations c ON c.id=a.conversation_id
      ${where}
     ORDER BY a.created_at DESC
     LIMIT $${params.length}
  `, params);
  return (r.rows || []).map(normalizeApprovalRow);
}

async function createApproval(pool, payload = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const conversationId = Number(payload.conversation_id || 0) || null;
  const meta = await loadConversationMeta(pool, conversationId);
  const lineUserId = cleanText(payload.line_user_id || pickLineUserId(meta), 255);
  const lineDisplayName = cleanText(payload.line_display_name || pickDisplayName(meta), 255);
  const aiDraft = cleanText(payload.ai_draft || payload.final_reply || payload.reply || "", 5000);
  const finalReply = cleanText(payload.final_reply || aiDraft, 5000);
  if (!finalReply) {
    const err = new Error("APPROVAL_REPLY_REQUIRED");
    err.status = 400;
    throw err;
  }
  const saved = await pool.query(`
    INSERT INTO public.ai_auto_reply_approvals(
      conversation_id,line_user_id,line_display_name,customer_message,ai_draft,final_reply,risk_label,decision,decision_reason,status,source,source_draft_id,admin_note,metadata,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13::jsonb,NOW())
    RETURNING *
  `, [
    conversationId,
    lineUserId,
    lineDisplayName,
    cleanText(payload.customer_message || "", 5000),
    aiDraft,
    finalReply,
    cleanText(payload.risk_label || "LOW", 80),
    cleanText(payload.decision || "APPROVAL_REQUIRED", 80),
    cleanText(payload.decision_reason || "รอแอดมินอนุมัติก่อนใช้", 1000),
    cleanText(payload.source || "manual", 80),
    Number(payload.source_draft_id || 0) || null,
    cleanText(payload.admin_note || `created_by:${adminUser}`, 1000),
    JSON.stringify(payload.metadata || {}),
  ]);
  return normalizeApprovalRow(saved.rows?.[0]);
}

async function createApprovalFromDraft(pool, draftId, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const id = Number(draftId || 0);
  if (!id) {
    const err = new Error("DRAFT_ID_REQUIRED");
    err.status = 400;
    throw err;
  }
  const hasTable = await queryOptional(pool, `SELECT to_regclass('public.ai_line_chat_drafts') AS name`, [], { rows:[{ name:null }] });
  if (!hasTable.rows?.[0]?.name) {
    const err = new Error("AI_LINE_CHAT_DRAFTS_TABLE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  const r = await pool.query(`
    SELECT d.*, c.display_name, c.picture_url, c.last_message_text
      FROM public.ai_line_chat_drafts d
      LEFT JOIN public.line_conversations c ON c.id=d.conversation_id
     WHERE d.id=$1
     LIMIT 1
  `, [id]);
  const d = r.rows?.[0];
  if (!d) {
    const err = new Error("DRAFT_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  const meta = await loadConversationMeta(pool, d.conversation_id);
  const approval = await createApproval(pool, {
    conversation_id: d.conversation_id,
    line_user_id: pickLineUserId(meta),
    line_display_name: d.display_name || pickDisplayName(meta),
    customer_message: d.selected_customer_message || d.last_message_text || "",
    ai_draft: d.ai_draft || "",
    final_reply: d.final_admin_reply || d.ai_draft || "",
    risk_label: d.risk_label || "LOW",
    decision: "APPROVAL_REQUIRED",
    decision_reason: d.admin_instruction || "สร้างจากร่างคำตอบ LINE",
    source: "ai_line_chat_draft",
    source_draft_id: id,
    metadata: { draft_id:id },
  }, adminUser);
  await pool.query(`UPDATE public.ai_line_chat_drafts SET action_status='pending_approval', updated_at=NOW() WHERE id=$1`, [id]).catch(()=>{});
  return approval;
}

async function updateApproval(pool, id, patch = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const approvalId = Number(id || 0);
  if (!approvalId) return null;
  const fields = [];
  const vals = [];
  let i = 1;
  function set(name, value) { vals.push(value); fields.push(`${name}=$${i++}`); }
  if (Object.prototype.hasOwnProperty.call(patch, "final_reply")) set("final_reply", cleanText(patch.final_reply, 5000));
  if (Object.prototype.hasOwnProperty.call(patch, "admin_note")) set("admin_note", cleanText(patch.admin_note, 1000));
  if (Object.prototype.hasOwnProperty.call(patch, "risk_label")) set("risk_label", cleanText(patch.risk_label, 80));
  if (Object.prototype.hasOwnProperty.call(patch, "decision_reason")) set("decision_reason", cleanText(patch.decision_reason, 1000));
  if (fields.length) set("status", cleanText(patch.status || "edited", 80));
  vals.push(approvalId);
  if (!fields.length) {
    const r0 = await pool.query(`SELECT * FROM public.ai_auto_reply_approvals WHERE id=$1`, [approvalId]);
    return normalizeApprovalRow(r0.rows?.[0]);
  }
  const r = await pool.query(`UPDATE public.ai_auto_reply_approvals SET ${fields.join(",")}, updated_at=NOW() WHERE id=$${i} RETURNING *`, vals);
  await pool.query(`INSERT INTO public.ai_office_control_events(action, admin_user, note, new_value) VALUES('approval_update',$1,$2,$3::jsonb)`, [cleanText(adminUser, 160), `approval:${approvalId}`, JSON.stringify(patch)]).catch(()=>{});
  return normalizeApprovalRow(r.rows?.[0]);
}

async function setApprovalStatus(pool, id, status, adminUser = "", note = "") {
  await ensureAiOfficeControlSchema(pool);
  const approvalId = Number(id || 0);
  const safeStatus = cleanText(status, 80);
  const fields = [`status=$1`, `admin_note=COALESCE(NULLIF($2,''), admin_note)`, `updated_at=NOW()`];
  const vals = [safeStatus, cleanText(note, 1000)];
  let p = 3;
  if (safeStatus === "approved") { fields.push(`approved_by=$${p++}`, `approved_at=NOW()`); vals.push(cleanText(adminUser, 160)); }
  if (safeStatus === "rejected") { fields.push(`rejected_by=$${p++}`, `rejected_at=NOW()`); vals.push(cleanText(adminUser, 160)); }
  vals.push(approvalId);
  const r = await pool.query(`UPDATE public.ai_auto_reply_approvals SET ${fields.join(",")} WHERE id=$${p} RETURNING *`, vals);
  await pool.query(`INSERT INTO public.ai_office_control_events(action, admin_user, note, new_value) VALUES($1,$2,$3,$4::jsonb)`, [`approval_${safeStatus}`, cleanText(adminUser,160), `approval:${approvalId}`, JSON.stringify({ id:approvalId, status:safeStatus })]).catch(()=>{});
  return normalizeApprovalRow(r.rows?.[0]);
}

async function pushLineMessageToUser(lineUserId, text) {
  const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  if (!token) {
    const err = new Error("LINE_CHANNEL_ACCESS_TOKEN_NOT_CONFIGURED");
    err.status = 503;
    throw err;
  }
  if (!lineUserId) {
    const err = new Error("LINE_USER_ID_REQUIRED");
    err.status = 400;
    throw err;
  }
  const body = { to: lineUserId, messages: [{ type:"text", text: cleanText(text, 5000) }] };
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method:"POST",
    headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await res.text().catch(()=>"");
  if (!res.ok) {
    const err = new Error(raw || `LINE_PUSH_${res.status}`);
    err.status = res.status || 500;
    throw err;
  }
  return raw || "OK";
}

async function sendApprovedLine(pool, id, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const values = await getControlValues(pool);
  if (boolValue(values.kill_switch, false)) {
    const err = new Error("AI_KILL_SWITCH_ON");
    err.status = 423;
    throw err;
  }
  if (!boolValue(values.ai_office_enabled, true)) {
    const err = new Error("AI_OFFICE_DISABLED");
    err.status = 423;
    throw err;
  }
  if (!boolValue(values.admin_approved_line_send_enabled, false)) {
    const err = new Error("ADMIN_APPROVED_LINE_SEND_DISABLED");
    err.status = 423;
    throw err;
  }
  const r = await pool.query(`SELECT * FROM public.ai_auto_reply_approvals WHERE id=$1 LIMIT 1`, [Number(id || 0)]);
  let approval = normalizeApprovalRow(r.rows?.[0]);
  if (!approval) {
    const err = new Error("APPROVAL_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  if (!["approved","edited","pending"].includes(approval.status)) {
    const err = new Error("APPROVAL_STATUS_NOT_SENDABLE");
    err.status = 409;
    throw err;
  }
  const meta = await loadConversationMeta(pool, approval.conversation_id);
  const lineUserId = approval.line_user_id || pickLineUserId(meta);
  const text = cleanText(approval.final_reply || approval.ai_draft, 5000);
  if (!text) {
    const err = new Error("FINAL_REPLY_REQUIRED");
    err.status = 400;
    throw err;
  }
  const raw = await pushLineMessageToUser(lineUserId, text);
  const saved = await pool.query(`
    UPDATE public.ai_auto_reply_approvals
       SET status='sent', sent_by=$2, sent_at=NOW(), line_user_id=COALESCE(NULLIF(line_user_id,''),$3), line_response=$4, updated_at=NOW()
     WHERE id=$1
     RETURNING *
  `, [approval.id, cleanText(adminUser,160), lineUserId, cleanText(raw, 4000)]);
  await pool.query(`INSERT INTO public.ai_office_control_events(action, admin_user, note, new_value) VALUES('approval_send_line',$1,$2,$3::jsonb)`, [cleanText(adminUser,160), `approval:${approval.id}`, JSON.stringify({ id:approval.id, line_user_id:lineUserId })]).catch(()=>{});
  return normalizeApprovalRow(saved.rows?.[0]);
}


function detectReplyIntent(text) {
  const s = cleanText(text, 5000).toLowerCase();
  if (!s) return "unknown";
  if (/(ร้องเรียน|ไม่พอใจ|เสียหาย|ชดเชย|รับผิดชอบ|ฟ้อง|ตำรวจ|แจ้งความ|ขู่|รีวิว|คืนเงิน|refund|complaint|legal|เสียเวลา|ไม่จ่าย)/i.test(s)) return "complaint";
  if (/(ใบกำกับภาษี|tax invoice|vat|ภาษี)/i.test(s)) return "tax_invoice";
  if (/(แพง|ลดได้ไหม|ลดหน่อย|ส่วนลด|discount|expensive|ลดราคา)/i.test(s)) return "price_objection";
  if (/(จอง|นัด|คิว|ว่าง|พรุ่งนี้|วันนี้|ช่างว่าง|พร้อม|ตกลง|book|booking|confirm)/i.test(s)) return "booking_or_queue";
  if (/(ซ่อม|ไม่เย็น|น้ำหยด|กลิ่น|รั่ว|น้ำยา|คอม|เสียงดัง|error|เสีย|เช็คอาการ|วิเคราะห์)/i.test(s)) return "repair_diagnosis";
  if (/(ราคา|กี่บาท|เท่าไหร่|โปร|package|แพ็กเกจ|ล้างปกติ|ล้างพรีเมียม|price|cost)/i.test(s)) return "price_question";
  if (/(พื้นที่|ไปไหม|รับงาน|แถว|อยู่ที่|service area|บางนา|อ่อนนุช|พระโขนง|พระราม 3|บางพลี)/i.test(s)) return "area_question";
  if (/(ล้างแบบไหนดี|ต่างกันยังไง|พรีเมียมคือ|แขวนคอยล์|ตัดล้าง|ล้างใหญ่)/i.test(s)) return "service_explain";
  if (/(hello|hi|สวัสดี|สอบถาม|สนใจ)/i.test(s)) return "general_greeting";
  return "unknown";
}

function decideReplySafety(text, values = {}) {
  const intent = detectReplyIntent(text);
  if (boolValue(values.kill_switch, false)) return { intent, decision:"BLOCKED", risk_label:"HIGH", confidence:100, reason:"Kill Switch เปิดอยู่ ระบบต้องหยุดร่าง/ตอบทั้งหมด" };
  if (!boolValue(values.ai_office_enabled, true)) return { intent, decision:"BLOCKED", risk_label:"HIGH", confidence:100, reason:"AI Office ถูกปิดจากแผงควบคุม" };
  if (!boolValue(values.safe_reply_decision_enabled, true)) return { intent, decision:"BLOCKED", risk_label:"MEDIUM", confidence:100, reason:"เครื่องกรองความปลอดภัยคำตอบถูกปิด" };
  if (["complaint","tax_invoice"].includes(intent)) return { intent, decision:"ADMIN_ONLY", risk_label:"HIGH", confidence:96, reason:"เคสเสี่ยงสูง ต้องให้แอดมินตอบเองเท่านั้น" };
  if (["booking_or_queue","repair_diagnosis","price_objection"].includes(intent)) return { intent, decision:"APPROVAL_REQUIRED", risk_label:"MEDIUM", confidence:88, reason:"เกี่ยวกับคิว จองงาน อาการเสีย หรือต่อราคา ต้องให้แอดมินตรวจก่อนใช้" };
  if (["price_question","area_question","service_explain","general_greeting"].includes(intent)) return { intent, decision:"SAFE_DRAFT", risk_label:"LOW", confidence:82, reason:"เป็นคำถามข้อมูลทั่วไป ร่างคำตอบได้ แต่ยังไม่ส่งเอง" };
  return { intent, decision:"APPROVAL_REQUIRED", risk_label:"MEDIUM", confidence:62, reason:"ระบบยังไม่มั่นใจประเภทคำถาม ให้แอดมินตรวจคำตอบก่อนใช้" };
}

function buildSafeRecommendedReply(text, safety) {
  const s = cleanText(text, 5000);
  const intent = safety.intent;
  if (intent === "price_question") {
    return [
      "ได้ค่ะ ราคาโปรตอนนี้สำหรับแอร์ผนังมีดังนี้นะคะ",
      "",
      "แอร์ไม่เกิน 12,000 BTU",
      "• ล้างปกติ 550 บาท",
      "• ล้างพรีเมียม 790 บาท",
      "• ล้างแบบแขวนคอยล์ 1,290 บาท",
      "• ตัดล้างใหญ่ 1,850 บาท",
      "",
      "แอร์ 18,000 BTU ขึ้นไป",
      "• ล้างปกติ 690 บาท",
      "• ล้างพรีเมียม 990 บาท",
      "• ล้างแบบแขวนคอยล์ 1,550 บาท",
      "• ตัดล้างใหญ่ 2,150 บาท",
      "",
      "ขอทราบจำนวนเครื่อง ขนาด BTU และพื้นที่หน้างานได้ไหมคะ เดี๋ยวแอดมินช่วยสรุปราคาและคิวให้ค่ะ"
    ].join("\n");
  }
  if (intent === "area_question") {
    return "รับงานค่ะ พื้นที่หลักของ Coldwindflow มีโซนพระโขนง บางจาก อ่อนนุช ปุณณวิถี อุดมสุข บางนา แบริ่ง สำโรง ลาซาล พระราม 3 ยานนาวา บางคอแหลม สาธุประดิษฐ์ เจริญกรุง ช่องนนทรี และบางพลีค่ะ\n\nขอโลเคชั่นหรือชื่อคอนโด/หมู่บ้านหน้างานได้ไหมคะ เดี๋ยวแอดมินเช็กคิวและระยะทางให้ค่ะ";
  }
  if (intent === "service_explain") {
    return "ได้ค่ะ โดยสรุปงานล้างมีหลายระดับนะคะ\n\n• ล้างปกติ: ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดท่อน้ำทิ้ง\n• ล้างพรีเมียม: ละเอียดขึ้น ถอดรางน้ำทิ้ง/โพรงกระรอกตามหน้างาน และทำความสะอาดลึกกว่า\n• ล้างแบบแขวนคอยล์: ถอดแผงไฟและถาดหลัง ทำความสะอาดละเอียดมากขึ้น\n• ตัดล้างใหญ่: ถอดล้างทั้งตัว เหมาะกับเครื่องสกปรกหนักหรือไม่เคยล้างละเอียดนานแล้วค่ะ\n\nถ้าลูกค้าแจ้งอาการหรือส่งรูปเครื่องมา แอดมินช่วยแนะนำแบบที่เหมาะให้ได้ค่ะ";
  }
  if (intent === "price_objection") {
    return "เข้าใจค่ะ งานของ Coldwindflow จะเน้นทำตามขั้นตอน ใช้อุปกรณ์เหมาะสม แจ้งราคาก่อนเริ่ม และมีการรับประกันงานล้าง 30 วันเฉพาะอาการที่เกิดจากการบริการนะคะ\n\nถ้าลูกค้าแจ้งจำนวนเครื่อง ขนาด BTU และพื้นที่หน้างาน แอดมินช่วยสรุปราคาโปรที่คุ้มที่สุดให้ได้ค่ะ";
  }
  if (intent === "booking_or_queue") {
    return "ได้ค่ะ ขอข้อมูลสำหรับเช็กคิวและสรุปงานให้ครบก่อนนะคะ\n\n1. ชื่อและเบอร์โทร\n2. ประเภทงาน เช่น ล้างแอร์/ซ่อมแอร์/ติดตั้ง\n3. จำนวนเครื่องและขนาด BTU\n4. ที่อยู่หรือโลเคชั่น Google Maps\n5. วันที่และช่วงเวลาที่สะดวก\n\nเดี๋ยวแอดมินตรวจคิวและแจ้งกลับให้ค่ะ";
  }
  if (intent === "repair_diagnosis") {
    return "เบื้องต้นแอดมินขอข้อมูลอาการเพิ่มนิดนึงนะคะ\n\n1. แอร์เป็นอาการอะไร เช่น ไม่เย็น น้ำหยด มีกลิ่น หรือมีโค้ด error\n2. ยี่ห้อ/ขนาด BTU โดยประมาณ\n3. เป็นมากี่วันแล้ว\n4. มีรูปหรือวิดีโออาการไหมคะ\n5. โลเคชั่นหน้างาน\n\nเดี๋ยวแอดมินส่งข้อมูลให้ช่างประเมินเบื้องต้นก่อนแจ้งคิวค่ะ";
  }
  if (intent === "complaint") {
    return "เคสนี้ควรให้แอดมินหรือผู้ดูแลตอบเองโดยตรง เนื่องจากเป็นเรื่องร้องเรียน/ความเสียหาย/ความไม่พอใจ ไม่ควรให้ AI ตอบแทนค่ะ";
  }
  if (intent === "tax_invoice") {
    return "เคสนี้ให้แอดมินตอบเองค่ะ หมายเหตุภายใน: ตอนนี้ CWF ยังไม่ออกใบกำกับภาษีได้ จึงไม่ควรให้ AI เสนอหรือยืนยันเรื่องใบกำกับภาษีเอง";
  }
  return "สวัสดีค่ะ Coldwindflow Air Services ยินดีให้บริการค่ะ ขอทราบรายละเอียดงานและพื้นที่หน้างานเพิ่มเติมได้ไหมคะ เดี๋ยวแอดมินช่วยเช็กข้อมูลให้ค่ะ";
}

async function saveReplyDecisionLog(pool, payload = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const safety = payload.safety || decideReplySafety(payload.customer_message || "", payload.values || {});
  const recommendedReply = cleanText(payload.recommended_reply || buildSafeRecommendedReply(payload.customer_message || "", safety), 5000);
  const meta = await loadConversationMeta(pool, Number(payload.conversation_id || 0) || null);
  const lineUserId = cleanText(payload.line_user_id || pickLineUserId(meta), 255);
  const lineDisplayName = cleanText(payload.line_display_name || pickDisplayName(meta), 255);
  const r = await pool.query(`
    INSERT INTO public.ai_reply_decision_logs(
      conversation_id,line_user_id,line_display_name,customer_message,normalized_intent,decision,risk_label,confidence,decision_reason,recommended_reply,source,created_by,metadata
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    RETURNING *
  `, [
    Number(payload.conversation_id || 0) || null,
    lineUserId,
    lineDisplayName,
    cleanText(payload.customer_message || "", 5000),
    safety.intent || "unknown",
    safety.decision || "APPROVAL_REQUIRED",
    safety.risk_label || "MEDIUM",
    Number(safety.confidence || 0),
    cleanText(safety.reason || "", 1000),
    recommendedReply,
    cleanText(payload.source || "control_center", 80),
    cleanText(adminUser, 160),
    JSON.stringify(payload.metadata || {}),
  ]);
  return normalizeDecisionRow(r.rows?.[0]);
}

function normalizeDecisionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    conversation_id: row.conversation_id == null ? null : Number(row.conversation_id),
    line_user_id: row.line_user_id || "",
    line_display_name: row.line_display_name || "",
    customer_message: row.customer_message || "",
    normalized_intent: row.normalized_intent || "unknown",
    decision: row.decision || "APPROVAL_REQUIRED",
    risk_label: row.risk_label || "MEDIUM",
    confidence: Number(row.confidence || 0),
    decision_reason: row.decision_reason || "",
    recommended_reply: row.recommended_reply || "",
    approval_id: row.approval_id == null ? null : Number(row.approval_id),
    source: row.source || "control_center",
    created_by: row.created_by || "",
    metadata: parseJsonObject(row.metadata),
    created_at: row.created_at || null,
  };
}

async function listDecisionLogs(pool, limit = 30) {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`SELECT * FROM public.ai_reply_decision_logs ORDER BY created_at DESC LIMIT $1`, [Math.min(100, Math.max(1, Number(limit || 30)))]);
  return (r.rows || []).map(normalizeDecisionRow);
}

async function createApprovalFromDecisionLog(pool, decisionId, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`SELECT * FROM public.ai_reply_decision_logs WHERE id=$1 LIMIT 1`, [Number(decisionId || 0)]);
  const d = normalizeDecisionRow(r.rows?.[0]);
  if (!d) {
    const err = new Error("REPLY_DECISION_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  const approval = await createApproval(pool, {
    conversation_id: d.conversation_id,
    line_user_id: d.line_user_id,
    line_display_name: d.line_display_name,
    customer_message: d.customer_message,
    ai_draft: d.recommended_reply,
    final_reply: d.recommended_reply,
    risk_label: d.risk_label,
    decision: d.decision === "SAFE_DRAFT" ? "APPROVAL_REQUIRED" : d.decision,
    decision_reason: d.decision_reason || "สร้างจากเครื่องกรองคำตอบ V8",
    source: "reply_decision_v8",
    metadata: { decision_log_id: d.id, original_decision: d.decision, confidence: d.confidence },
  }, adminUser);
  await pool.query(`UPDATE public.ai_reply_decision_logs SET approval_id=$2 WHERE id=$1`, [d.id, approval.id]).catch(()=>{});
  return approval;
}

function createAdminAiOfficeControlCenterRoutes(deps = {}) {
  const { pool, requireAdminSession = (req, res, next) => next() } = deps;
  if (!pool) throw new Error("AI_OFFICE_CONTROL_POOL_REQUIRED");
  const router = express.Router();

  router.get("/admin/ai-office/control/settings", requireAdminSession, async (_req, res) => {
    try {
      const data = await loadSettings(pool);
      return res.json({ ok:true, ...data });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AI_CONTROL_SETTINGS_FAILED" });
    }
  });

  router.patch("/admin/ai-office/control/settings", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const setting = await patchSetting(pool, req.body?.key, req.body?.value, adminUser, req.body?.note || "");
      return res.json({ ok:true, setting, ...(await loadSettings(pool)) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "UPDATE_AI_CONTROL_SETTING_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/settings/bulk", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
      const results = [];
      for (const u of updates) results.push(await patchSetting(pool, u.key, u.value, adminUser, req.body?.note || ""));
      return res.json({ ok:true, updated:results, ...(await loadSettings(pool)) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "BULK_UPDATE_AI_CONTROL_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/pending-drafts", requireAdminSession, async (_req, res) => {
    try {
      const hasTable = await queryOptional(pool, `SELECT to_regclass('public.ai_line_chat_drafts') AS name`, [], { rows:[{ name:null }] });
      if (!hasTable.rows?.[0]?.name) return res.json({ ok:true, drafts:[], counts:{ pending:0 } });
      const r = await pool.query(`
        SELECT d.id, d.conversation_id, d.selected_customer_message, d.admin_instruction, d.ai_draft,
               d.final_admin_reply, d.action_status, d.created_at, d.updated_at,
               c.display_name, c.picture_url, c.last_message_text
          FROM public.ai_line_chat_drafts d
          LEFT JOIN public.line_conversations c ON c.id=d.conversation_id
         WHERE COALESCE(d.action_status,'drafted') IN ('drafted','pending_approval','edited')
         ORDER BY d.created_at DESC
         LIMIT 50
      `);
      return res.json({ ok:true, drafts:r.rows || [], counts:{ pending:(r.rows || []).length } });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_PENDING_DRAFTS_FAILED" });
    }
  });


  router.get("/admin/ai-office/control/approvals", requireAdminSession, async (req, res) => {
    try {
      const approvals = await listApprovals(pool, { status: cleanText(req.query.status || "open", 80), limit: req.query.limit });
      const counts = approvals.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, { total: approvals.length });
      return res.json({ ok:true, approvals, counts });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AI_REPLY_APPROVALS_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const values = await getControlValues(pool);
      if (!boolValue(values.approval_queue_enabled, true)) return res.status(423).json({ ok:false, error:"APPROVAL_QUEUE_DISABLED" });
      const approval = await createApproval(pool, req.body || {}, adminUser);
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "CREATE_AI_REPLY_APPROVAL_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals/from-draft/:id", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const values = await getControlValues(pool);
      if (!boolValue(values.approval_queue_enabled, true)) return res.status(423).json({ ok:false, error:"APPROVAL_QUEUE_DISABLED" });
      const approval = await createApprovalFromDraft(pool, req.params.id, adminUser);
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "CREATE_APPROVAL_FROM_DRAFT_FAILED" });
    }
  });

  router.patch("/admin/ai-office/control/approvals/:id", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const approval = await updateApproval(pool, req.params.id, req.body || {}, adminUser);
      if (!approval) return res.status(404).json({ ok:false, error:"APPROVAL_NOT_FOUND" });
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "UPDATE_AI_REPLY_APPROVAL_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals/:id/approve", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      if (req.body?.final_reply) await updateApproval(pool, req.params.id, { final_reply:req.body.final_reply, status:"edited", admin_note:req.body.admin_note || "" }, adminUser);
      const approval = await setApprovalStatus(pool, req.params.id, "approved", adminUser, req.body?.admin_note || "อนุมัติข้อความแล้ว");
      if (!approval) return res.status(404).json({ ok:false, error:"APPROVAL_NOT_FOUND" });
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "APPROVE_AI_REPLY_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals/:id/reject", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const approval = await setApprovalStatus(pool, req.params.id, "rejected", adminUser, req.body?.admin_note || "ปฏิเสธร่างคำตอบ");
      if (!approval) return res.status(404).json({ ok:false, error:"APPROVAL_NOT_FOUND" });
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "REJECT_AI_REPLY_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals/:id/admin-only", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const approval = await setApprovalStatus(pool, req.params.id, "admin_only", adminUser, req.body?.admin_note || "ให้แอดมินตอบเอง");
      if (!approval) return res.status(404).json({ ok:false, error:"APPROVAL_NOT_FOUND" });
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "MARK_AI_REPLY_ADMIN_ONLY_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/approvals/:id/send", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      if (req.body?.final_reply) await updateApproval(pool, req.params.id, { final_reply:req.body.final_reply, status:"edited", admin_note:req.body.admin_note || "" }, adminUser);
      const approval = await sendApprovedLine(pool, req.params.id, adminUser);
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SEND_APPROVED_LINE_REPLY_FAILED" });
    }
  });


  router.get("/admin/ai-office/control/reply-decision/logs", requireAdminSession, async (req, res) => {
    try {
      const decisions = await listDecisionLogs(pool, req.query.limit || 30);
      return res.json({ ok:true, decisions, counts:{ total: decisions.length } });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_REPLY_DECISION_LOGS_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/reply-decision", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const values = await getControlValues(pool);
      if (!boolValue(values.safe_reply_preview_enabled, true)) return res.status(423).json({ ok:false, error:"SAFE_REPLY_PREVIEW_DISABLED" });
      const customerMessage = cleanText(req.body?.customer_message || req.body?.message || "", 5000);
      if (!customerMessage) return res.status(400).json({ ok:false, error:"CUSTOMER_MESSAGE_REQUIRED" });
      const safety = decideReplySafety(customerMessage, values);
      const recommended_reply = buildSafeRecommendedReply(customerMessage, safety);
      const decision = await saveReplyDecisionLog(pool, {
        conversation_id: req.body?.conversation_id,
        line_user_id: req.body?.line_user_id,
        line_display_name: req.body?.line_display_name,
        customer_message: customerMessage,
        safety,
        recommended_reply,
        source: req.body?.source || "control_center_v8",
        values,
        metadata: { requested_create_approval: !!req.body?.create_approval },
      }, adminUser);
      let approval = null;
      if (req.body?.create_approval) {
        if (!boolValue(values.approval_queue_enabled, true)) return res.status(423).json({ ok:false, error:"APPROVAL_QUEUE_DISABLED", decision });
        if (!boolValue(values.auto_create_approval_from_safe_reply, true)) return res.status(423).json({ ok:false, error:"CREATE_APPROVAL_FROM_SAFE_REPLY_DISABLED", decision });
        approval = await createApprovalFromDecisionLog(pool, decision.id, adminUser);
      }
      return res.json({ ok:true, decision, approval, auto_send_line_enabled:false, message:"V8 วิเคราะห์และส่งเข้าคิวอนุมัติได้ แต่ยังไม่ส่ง LINE เอง" });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "REPLY_DECISION_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/reply-decision/:id/approval", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const values = await getControlValues(pool);
      if (!boolValue(values.approval_queue_enabled, true)) return res.status(423).json({ ok:false, error:"APPROVAL_QUEUE_DISABLED" });
      const approval = await createApprovalFromDecisionLog(pool, req.params.id, adminUser);
      return res.json({ ok:true, approval });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "CREATE_APPROVAL_FROM_REPLY_DECISION_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/health", requireAdminSession, async (_req, res) => {
    try {
      const { settings, values } = await loadSettings(pool);
      const drafts = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_line_chat_drafts WHERE COALESCE(action_status,'drafted') IN ('drafted','pending_approval','edited')`, [], { rows:[{ count:0 }] });
      const intakes = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_booking_intakes WHERE status <> 'CLOSED'`, [], { rows:[{ count:0 }] });
      const approvals = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_reply_approvals WHERE status IN ('pending','edited','approved')`, [], { rows:[{ count:0 }] });
      const latestLine = await queryOptional(pool, `SELECT MAX(COALESCE(received_at, created_at)) AS latest FROM public.line_messages`, [], { rows:[{ latest:null }] });
      const decisions = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_reply_decision_logs WHERE created_at > NOW() - INTERVAL '7 days'`, [], { rows:[{ count:0 }] });
      return res.json({
        ok:true,
        mode: boolValue(values.kill_switch, false) ? "KILL_SWITCH" : (boolValue(values.draft_reply_enabled, true) ? "DRAFT_ONLY" : "OFF"),
        auto_send_line_enabled: false,
        admin_approved_line_send_enabled: boolValue(values.admin_approved_line_send_enabled, false),
        approval_queue_enabled: boolValue(values.approval_queue_enabled, true),
        settings,
        values,
        counts:{
          pending_drafts: Number(drafts.rows?.[0]?.count || 0),
          pending_approvals: Number(approvals.rows?.[0]?.count || 0),
          open_intakes: Number(intakes.rows?.[0]?.count || 0),
          reply_decisions_7d: Number(decisions.rows?.[0]?.count || 0)
        },
        line:{ latest_message_at: latestLine.rows?.[0]?.latest || null },
      });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "AI_CONTROL_HEALTH_FAILED" });
    }
  });

  router.post("/admin/ai-office/line-draft-reply", requireAdminSession, async (req, res, next) => {
    try {
      const values = await getControlValues(pool);
      const allowed = isDraftAllowed(values);
      if (!allowed.ok) return res.status(423).json({ ok:false, error:allowed.reason, message:"AI ร่างคำตอบถูกปิดจากแผงควบคุม" });
      return next();
    } catch (_e) {
      return next();
    }
  });

  return router;
}

createAdminAiOfficeControlCenterRoutes.ensureAiOfficeControlSchema = ensureAiOfficeControlSchema;
createAdminAiOfficeControlCenterRoutes.getControlValues = getControlValues;
module.exports = createAdminAiOfficeControlCenterRoutes;
