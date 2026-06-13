const express = require("express");
const { buildCoreBrainContext } = require("../aiOfficeCoreBrain");

function cleanText(value, max = 2000) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function hasThaiText(value) {
  return /[\u0E00-\u0E7F]/.test(String(value || ""));
}

function configuredReplyTone(values = {}) {
  const tone = cleanText(values.ai_office_customer_reply_tone || process.env.AI_OFFICE_REPLY_TONE || process.env.CWF_REPLY_TONE || "female", 20).toLowerCase();
  if (["male", "female", "neutral", "auto"].includes(tone)) return tone;
  return "female";
}

function applyCustomerReplyTone(text, values = {}) {
  let out = cleanText(text, 5000);
  if (!hasThaiText(out)) return out;
  const tone = configuredReplyTone(values);
  if (tone === "male") {
    out = out.replace(/นะคะ/g, "นะครับ").replace(/ค่ะ/g, "ครับ").replace(/คะ/g, "ครับ").replace(/ครับครับ/g, "ครับ").trim();
    if (!/ครับ(\s|$|[.!?…🙏])/.test(out)) out = `${out}ครับ`;
    return out;
  }
  if (tone === "female") {
    out = out.replace(/นะครับ/g, "นะคะ").replace(/ครับ/g, "ค่ะ").replace(/ค่ะค่ะ/g, "ค่ะ").replace(/คะค่ะ/g, "คะ").trim();
    if (!/(ค่ะ|คะ)(\s|$|[.!?…🙏])/.test(out)) out = `${out}ค่ะ`;
    return out;
  }
  return out.replace(/ค่ะค่ะ/g, "ค่ะ").replace(/ครับครับ/g, "ครับ").trim();
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
  { key:"ai_office_enabled", category:"main", label:"สถานะระบบ AI Office ภายใน", description:"ใช้เป็นค่า compatibility ภายในเท่านั้น ไม่ใช้ปิดงานตอบลูกค้า", value:true, locked:true },
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
  { key:"auto_safe_reply_send_enabled", category:"reply", label:"AI ส่ง LINE เองเฉพาะคำถามปลอดภัย", description:"เปิดให้ AI ส่ง LINE เองเฉพาะคำถามความเสี่ยงต่ำ เช่น ราคา พื้นที่บริการ อธิบายบริการ และทักทายทั่วไป", value:false, locked:false },
  { key:"auto_safe_reply_cooldown_minutes", category:"reply", label:"พักก่อนตอบซ้ำอัตโนมัติ", description:"จำนวน นาที ที่ต้องเว้นก่อน AI ตอบเองซ้ำในแชทเดิม", value:15, locked:false },
  { key:"auto_safe_reply_daily_limit", category:"reply", label:"จำนวนตอบเองสูงสุดต่อแชทต่อวัน", description:"กัน AI ตอบเองถี่เกินไปในแชทเดียว", value:5, locked:false },
  { key:"auto_safe_reply_confidence_threshold", category:"reply", label:"คะแนนมั่นใจขั้นต่ำก่อนส่งเอง", description:"AI จะส่งเองเฉพาะคำถามที่ผ่านเกณฑ์ความมั่นใจนี้ขึ้นไป", value:85, locked:false },
  { key:"auto_safe_human_takeover_minutes", category:"reply", label:"พักอัตโนมัติหลังแอดมินตอบเอง", description:"ถ้าแอดมินเพิ่งตอบลูกค้าในแชทนั้น ให้ AI หยุดตอบเองตามจำนวนนาทีนี้", value:60, locked:false },
  { key:"auto_safe_reply_quiet_hours_enabled", category:"reply", label:"งด AI ตอบเองนอกเวลาที่กำหนด", description:"เปิดเพื่อกัน AI ส่ง LINE เองช่วงดึกหรือช่วงที่ไม่ต้องการ", value:false, locked:false },
  { key:"auto_safe_reply_quiet_start", category:"reply", label:"เริ่มงดตอบเอง", description:"เวลาเริ่มงด AI ตอบเอง รูปแบบ HH:mm ตามเวลาไทย", value:"22:00", locked:false },
  { key:"auto_safe_reply_quiet_end", category:"reply", label:"สิ้นสุดงดตอบเอง", description:"เวลาสิ้นสุดงด AI ตอบเอง รูปแบบ HH:mm ตามเวลาไทย", value:"08:00", locked:false },
  { key:"auto_safe_quality_guard_enabled", category:"reply", label:"เรียนรู้จาก feedback ก่อนส่งเอง", description:"กัน AI ส่งเองซ้ำในแนวคำถามที่แอดมินเคยบอกว่าไม่ดีหรือผิด", value:true, locked:false },
  { key:"auto_safe_negative_feedback_threshold", category:"reply", label:"จำนวน feedback ลบก่อนบล็อกแนวตอบ", description:"ถ้าแนวคำถาม/intent นี้โดน feedback ลบครบจำนวนนี้ จะกันไม่ให้ Auto Safe ส่งเอง", value:2, locked:false },
  { key:"auto_safe_negative_feedback_window_days", category:"reply", label:"ช่วงวันย้อนหลังของ feedback ลบ", description:"ใช้ feedback ลบย้อนหลังตามจำนวนวันนี้เพื่อคุม Auto Safe", value:14, locked:false },
  { key:"auto_safe_auto_pause_on_bad_feedback", category:"reply", label:"พักแชทอัตโนมัติเมื่อ feedback ลบ", description:"เมื่อแอดมินกดว่าคำตอบ Auto Safe ไม่ดี ให้พัก AI เฉพาะแชทนั้นทันที", value:true, locked:false },
  { key:"auto_safe_auto_pause_minutes", category:"reply", label:"เวลาพักแชทหลัง feedback ลบ", description:"จำนวน นาที ที่พัก AI ตอบเองเฉพาะแชทหลังแอดมินให้ feedback ลบ", value:1440, locked:false },
  { key:"auto_safe_playbook_enabled", category:"reply", label:"ใช้ Playbook ที่อนุมัติแล้วก่อน AI ร่างเอง", description:"ให้ Auto Safe Reply ใช้คำตอบที่ผ่านการอนุมัติแล้วสำหรับราคา พื้นที่บริการ และคำอธิบายแพ็กเกจ เพื่อลดการตอบเพี้ยน", value:true, locked:false },
  { key:"auto_safe_playbook_required", category:"reply", label:"ส่งเองเฉพาะเมื่อมี Playbook ตรงเคส", description:"ถ้าเปิด AI จะส่ง LINE เองเฉพาะคำถามที่ match playbook ที่อนุมัติแล้ว ถ้าไม่ match จะกันไว้ให้แอดมิน", value:true, locked:false },
  { key:"auto_safe_playbook_seed_enabled", category:"reply", label:"เปิดชุด Playbook หลักของ CWF", description:"เปิดชุดคำตอบหลักที่ seed จากข้อมูลธุรกิจ CWF เช่น ราคา พื้นที่ และความต่างบริการ", value:true, locked:false },
  { key:"auto_internal_training_enabled", category:"training", label:"Auto Training ภายใน", description:"ให้ระบบสร้างคำตอบ AI ภายในทันทีเมื่อข้อความ LINE ลูกค้าเข้า ยังไม่ส่งหาลูกค้าจริง", value:false, locked:false },
  { key:"auto_internal_training_auto_answer", category:"training", label:"Auto ตอบภายในเมื่อ LINE เข้า", description:"เมื่อลูกค้าส่งข้อความ ให้ AI ร่างคำตอบไว้ใน Training Queue อัตโนมัติ เพื่อให้แอดมินมากดถูก/ไม่ถูก/สอนเพิ่ม", value:false, locked:false },
  { key:"auto_internal_training_learn_to_core_brain", category:"training", label:"บันทึกบทเรียนเข้าคลังสมองกลาง", description:"เมื่อแอดมินกดถูกหรือสอนคำตอบ ให้บันทึกเป็นความรู้กลางที่ทุก Agent ใช้ร่วมกัน", value:true, locked:false },
  { key:"auto_internal_training_cooldown_seconds", category:"training", label:"พักก่อนสร้างคำตอบซ้ำในแชทเดิม", description:"จำนวนวินาทีขั้นต่ำก่อน Auto Internal Training จะร่างคำตอบใหม่ให้แชทเดิม", value:30, locked:false },
  { key:"auto_internal_training_concurrency_limit", category:"training", label:"จำกัด AI training ที่ประมวลผลพร้อมกัน", description:"กัน webhook ยิงงาน AI training พร้อมกันมากเกินไป", value:2, locked:false },
  { key:"auto_safe_playbook_suggestions_enabled", category:"reply", label:"แนะนำ Playbook จากคำถามที่พบบ่อย", description:"ให้ระบบดูคำถามจริงที่ Auto Safe กันไว้เพราะไม่มี Playbook แล้วเสนอให้แอดมินสร้างชุดคำตอบใหม่", value:true, locked:false },
  { key:"auto_safe_playbook_suggestion_min_count", category:"reply", label:"จำนวนคำถามซ้ำก่อนเสนอ Playbook", description:"คำถามแนวเดียวกันต้องพบอย่างน้อยกี่ครั้งก่อนเสนอให้สร้าง Playbook", value:2, locked:false },
  { key:"auto_safe_playbook_suggestion_window_days", category:"reply", label:"ช่วงวันที่ใช้หา Playbook แนะนำ", description:"ดูคำถามย้อนหลังตามจำนวนวันนี้เพื่อเสนอ Playbook ใหม่", value:14, locked:false },
  { key:"auto_safe_dashboard_enabled", category:"reply", label:"แดชบอร์ดผลลัพธ์ Auto Safe", description:"เปิดการคำนวณตัวเลขลดงานแอดมินจาก Auto Safe Reply", value:true, locked:false },
  { key:"auto_safe_dashboard_window_days", category:"reply", label:"ช่วงวันที่ใช้คำนวณแดชบอร์ด", description:"จำนวนวันย้อนหลังที่ใช้สรุปผลลัพธ์ Auto Safe", value:30, locked:false },
  { key:"auto_safe_estimated_admin_seconds_per_reply", category:"reply", label:"เวลาที่แอดมินใช้ตอบต่อข้อความ", description:"ใช้ประเมินเวลาที่ประหยัดได้ต่อข้อความที่ AI ตอบเอง", value:45, locked:false },
  { key:"auto_safe_admin_hourly_cost_thb", category:"reply", label:"ต้นทุนเวลาต่อชั่วโมงของแอดมิน", description:"ใช้ประเมินมูลค่าเวลาที่ Auto Safe ช่วยประหยัด", value:120, locked:false },
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_reply_logs (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NULL,
      line_user_id TEXT NULL,
      message_id TEXT NULL,
      customer_message TEXT NOT NULL DEFAULT '',
      reply_text TEXT NOT NULL DEFAULT '',
      intent TEXT NOT NULL DEFAULT 'unknown',
      decision TEXT NOT NULL DEFAULT 'BLOCKED',
      risk_label TEXT NOT NULL DEFAULT 'MEDIUM',
      confidence INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'skipped',
      skipped_reason TEXT NULL,
      line_response TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_message_id_unique ON public.ai_auto_safe_reply_logs(message_id) WHERE message_id IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_conversation_created ON public.ai_auto_safe_reply_logs(conversation_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_logs_status_created ON public.ai_auto_safe_reply_logs(status, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_conversation_pauses (
      conversation_id BIGINT PRIMARY KEY,
      line_user_id TEXT NULL,
      paused_until TIMESTAMPTZ NOT NULL,
      paused_by TEXT NULL,
      reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_conversation_pauses_until ON public.ai_auto_safe_conversation_pauses(paused_until)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_quality_feedback (
      id BIGSERIAL PRIMARY KEY,
      log_id BIGINT NULL,
      conversation_id BIGINT NULL,
      line_user_id TEXT NULL,
      customer_message TEXT NOT NULL DEFAULT '',
      reply_text TEXT NOT NULL DEFAULT '',
      feedback_type TEXT NOT NULL DEFAULT 'bad',
      reason TEXT NULL,
      admin_note TEXT NULL,
      created_by TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_log ON public.ai_auto_safe_quality_feedback(log_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_conv ON public.ai_auto_safe_quality_feedback(conversation_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_quality_feedback_type_created ON public.ai_auto_safe_quality_feedback(feedback_type, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_learning_rules (
      id BIGSERIAL PRIMARY KEY,
      rule_type TEXT NOT NULL DEFAULT 'similar_customer_message',
      phrase TEXT NULL,
      intent TEXT NULL,
      action TEXT NOT NULL DEFAULT 'block_auto_safe',
      reason TEXT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      source_feedback_id BIGINT NULL,
      created_by TEXT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_learning_rules_active ON public.ai_auto_safe_learning_rules(is_active, rule_type)`);
  await pool.query(`ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS quality_status TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS feedback_reason TEXT NULL`).catch(()=>{});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_reply_playbooks (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      intent TEXT NOT NULL DEFAULT 'unknown',
      language TEXT NOT NULL DEFAULT 'th',
      trigger_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
      response_text TEXT NOT NULL DEFAULT '',
      risk_level TEXT NOT NULL DEFAULT 'LOW',
      priority INTEGER NOT NULL DEFAULT 100,
      is_active BOOLEAN NOT NULL DEFAULT true,
      approved_by TEXT NULL,
      approved_at TIMESTAMPTZ NULL,
      version INTEGER NOT NULL DEFAULT 1,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_playbooks_title_intent_unique ON public.ai_auto_safe_reply_playbooks(title, intent)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_reply_playbooks_active_intent ON public.ai_auto_safe_reply_playbooks(is_active, intent, priority)`);
  await pool.query(`ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_id BIGINT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_reply_logs ADD COLUMN IF NOT EXISTS playbook_title TEXT NULL`).catch(()=>{});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_auto_safe_playbook_suggestions (
      id BIGSERIAL PRIMARY KEY,
      intent TEXT NOT NULL DEFAULT 'unknown',
      normalized_question TEXT NOT NULL DEFAULT '',
      trigger_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
      suggested_title TEXT NOT NULL DEFAULT '',
      suggested_response_text TEXT NOT NULL DEFAULT '',
      sample_customer_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      occurrences INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'auto_safe_analytics',
      approved_playbook_id BIGINT NULL,
      dismissed_by TEXT NULL,
      dismissed_at TIMESTAMPTZ NULL,
      approved_by TEXT NULL,
      approved_at TIMESTAMPTZ NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_auto_safe_playbook_suggestions_unique ON public.ai_auto_safe_playbook_suggestions(intent, normalized_question)`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_auto_safe_playbook_suggestions_status ON public.ai_auto_safe_playbook_suggestions(status, occurrences DESC, updated_at DESC)`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_title TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_intent TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_trigger_phrases JSONB NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_response_text TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_priority INTEGER NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS review_note TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_by TEXT NULL`).catch(()=>{});
  await pool.query(`ALTER TABLE public.ai_auto_safe_playbook_suggestions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ NULL`).catch(()=>{});
  await seedAutoSafeReplyPlaybooks(pool);

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
    return Object.assign({}, values || {}, { ai_office_enabled: true });
  } catch (_) {
    const fallback = DEFAULT_SETTINGS.reduce((acc, s) => { acc[s.key] = s.value; return acc; }, {});
    fallback.ai_office_enabled = true;
    return fallback;
  }
}

function isDraftAllowed(values = {}) {
  // V12: AI Reply Control คุมเฉพาะการร่าง/ตอบลูกค้าเท่านั้น
  // ไม่ใช้ ai_office_enabled มาปิดทั้ง AI Office อีก เพื่อกันค่าเก่าจาก V10 ค้างแล้วทำให้ระบบตอบลูกค้าหยุดผิดจุด
  if (boolValue(values.kill_switch, false)) return { ok:false, reason:"AI_REPLY_KILL_SWITCH_ON" };
  if (!boolValue(values.draft_reply_enabled, true)) return { ok:false, reason:"DRAFT_REPLY_DISABLED" };
  return { ok:true };
}

async function queryOptional(pool, sql, params = [], fallback = null) {
  try { return await pool.query(sql, params); } catch (_) { return fallback; }
}

function normalizeLineConversation(row) {
  return {
    id: Number(row.id || 0),
    line_user_id: row.line_user_id || "",
    display_name: row.display_name || "ลูกค้า LINE",
    picture_url: row.picture_url || "",
    last_message_text: row.last_message_text || "",
    last_message_type: row.last_message_type || "",
    last_message_at: row.last_message_at || null,
    updated_at: row.updated_at || null,
    open_intake_count: Number(row.open_intake_count || 0),
    pending_draft_count: Number(row.pending_draft_count || 0),
    pending_approval_count: Number(row.pending_approval_count || 0),
  };
}

function normalizeLineMessage(row) {
  return {
    id: Number(row.id || 0),
    conversation_id: Number(row.conversation_id || 0),
    direction: row.direction || "inbound",
    message_type: row.message_type || "text",
    message_text: row.message_text || "",
    received_at: row.received_at || null,
    created_at: row.created_at || null,
  };
}

async function listLineConversations(pool, { limit = 50 } = {}) {
  const n = Math.min(Math.max(Number(limit || 50), 1), 120);
  const base = await queryOptional(pool, `
    SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at, updated_at
      FROM public.line_conversations
     ORDER BY COALESCE(last_message_at,updated_at,created_at) DESC
     LIMIT $1
  `, [n], { rows: [] });
  const rows = (base.rows || []).map((row) => Object.assign({}, row, {
    open_intake_count: 0,
    pending_draft_count: 0,
    pending_approval_count: 0,
  }));
  const ids = rows.map((r) => Number(r.id || 0)).filter(Boolean);
  if (!ids.length) return [];
  const applyCounts = (result, field) => {
    const map = new Map((result?.rows || []).map((r) => [Number(r.conversation_id), Number(r.count || 0)]));
    rows.forEach((r) => { r[field] = map.get(Number(r.id)) || 0; });
  };
  applyCounts(await queryOptional(pool, `
    SELECT conversation_id, COUNT(*)::int AS count
      FROM public.ai_booking_intakes
     WHERE conversation_id = ANY($1::bigint[])
       AND status NOT IN ('CLOSED','JOB_CREATED')
     GROUP BY conversation_id
  `, [ids], { rows: [] }), "open_intake_count");
  applyCounts(await queryOptional(pool, `
    SELECT conversation_id, COUNT(*)::int AS count
      FROM public.ai_line_chat_drafts
     WHERE conversation_id = ANY($1::bigint[])
       AND COALESCE(action_status,'drafted') IN ('drafted','pending_approval','edited')
     GROUP BY conversation_id
  `, [ids], { rows: [] }), "pending_draft_count");
  applyCounts(await queryOptional(pool, `
    SELECT conversation_id, COUNT(*)::int AS count
      FROM public.ai_auto_reply_approvals
     WHERE conversation_id = ANY($1::bigint[])
       AND status IN ('pending','edited','approved')
     GROUP BY conversation_id
  `, [ids], { rows: [] }), "pending_approval_count");
  return rows.map(normalizeLineConversation);
}

async function getLineThread(pool, conversationId, { limit = 40 } = {}) {
  const id = Number(conversationId || 0);
  if (!id) { const err = new Error("LINE_CONVERSATION_ID_REQUIRED"); err.status = 400; throw err; }
  const c = await pool.query(`SELECT * FROM public.line_conversations WHERE id=$1 LIMIT 1`, [id]);
  if (!c.rows?.[0]) { const err = new Error("LINE_CONVERSATION_NOT_FOUND"); err.status = 404; throw err; }
  const n = Math.min(Math.max(Number(limit || 40), 1), 80);
  const m = await pool.query(`
    SELECT id, conversation_id, direction, message_type, message_text, received_at, created_at
      FROM public.line_messages
     WHERE conversation_id=$1
     ORDER BY COALESCE(received_at,created_at) DESC
     LIMIT $2
  `, [id, n]);
  return { conversation: normalizeLineConversation(c.rows[0]), messages: (m.rows || []).reverse().map(normalizeLineMessage) };
}

async function saveDraftFeedback(pool, req, payload = {}) {
  const draftId = Number(payload.draft_id || 0) || null;
  const conversationId = Number(payload.conversation_id || 0) || null;
  const reason = cleanText(payload.reason || "ไม่ชอบคำตอบนี้", 300);
  const customerMessage = cleanText(payload.customer_message || "", 4000);
  const aiReply = cleanText(payload.ai_reply || payload.final_reply || "", 4000);
  const note = cleanText(payload.admin_note || "", 1000);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_memory_events (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'unknown',
      event_type TEXT NOT NULL DEFAULT 'event',
      agent_key TEXT NOT NULL DEFAULT 'admin',
      conversation_id BIGINT NULL,
      selected_customer_question TEXT NOT NULL DEFAULT '',
      customer_message TEXT NOT NULL DEFAULT '',
      ai_reply TEXT NOT NULL DEFAULT '',
      final_admin_reply TEXT NOT NULL DEFAULT '',
      action_status TEXT NOT NULL DEFAULT '',
      situation_type TEXT NOT NULL DEFAULT 'general',
      service_type TEXT NOT NULL DEFAULT '',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  if (draftId) {
    await pool.query(`UPDATE public.ai_line_chat_drafts SET action_status='disliked', updated_at=NOW() WHERE id=$1`, [draftId]).catch(()=>{});
  }
  const adminUser = cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || "", 160);
  const r = await pool.query(`
    INSERT INTO public.ai_memory_events(source,event_type,agent_key,conversation_id,selected_customer_question,customer_message,ai_reply,final_admin_reply,action_status,situation_type,created_by,metadata)
    VALUES('ai_reply_control','disliked','admin',$1,$2,$3,$4,'','disliked','reply_feedback',$5,$6::jsonb)
    RETURNING *
  `, [conversationId, customerMessage, customerMessage, aiReply, adminUser, JSON.stringify({ reason, admin_note: note, draft_id: draftId, version: 'v12' })]);
  return r.rows?.[0] || null;
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


function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; }
  }
  return [];
}

const AUTO_SAFE_PLAYBOOK_SEEDS = [
  {
    title: "ราคาโปรล้างแอร์ผนัง",
    intent: "price_question",
    priority: 10,
    trigger_phrases: ["ราคา", "กี่บาท", "เท่าไหร่", "โปร", "ล้างปกติ", "ล้างพรีเมียม", "price", "cost"],
    response_text: [
      "ได้ค่ะ ราคาโปรตอนนี้สำหรับแอร์ผนังมีดังนี้นะคะ",
      "",
      "แอร์ผนังไม่เกิน 12,000 BTU",
      "• ล้างปกติ 550 บาท",
      "• ล้างพรีเมียม 790 บาท",
      "• ล้างแบบแขวนคอยล์ 1,290 บาท",
      "• ตัดล้างใหญ่ 1,850 บาท",
      "",
      "แอร์ผนัง 18,000 BTU ขึ้นไป",
      "• ล้างปกติ 690 บาท",
      "• ล้างพรีเมียม 990 บาท",
      "• ล้างแบบแขวนคอยล์ 1,550 บาท",
      "• ตัดล้างใหญ่ 2,150 บาท",
      "",
      "ราคาจะขึ้นอยู่กับขนาด BTU และจำนวนเครื่องค่ะ ขอทราบจำนวนเครื่อง ขนาด BTU และพื้นที่หน้างานได้ไหมคะ"
    ].join("\n")
  },
  {
    title: "พื้นที่บริการหลัก",
    intent: "area_question",
    priority: 20,
    trigger_phrases: ["พื้นที่", "ไปไหม", "รับงาน", "โซน", "บางนา", "อ่อนนุช", "พระโขนง", "พระราม 3", "บางพลี", "สุขุมวิท", "สำโรง", "ลาซาล", "ยานนาวา"],
    response_text: "รับงานค่ะ พื้นที่หลักของ Coldwindflow มีโซนพระโขนง บางจาก อ่อนนุช ปุณณวิถี อุดมสุข บางนา แบริ่ง สำโรง ลาซาล สุขุมวิทตอนปลาย พระราม 3 ยานนาวา บางคอแหลม สาธุประดิษฐ์ เจริญกรุง ช่องนนทรี และบางพลีค่ะ\n\nขอโลเคชั่นหรือชื่อคอนโด/หมู่บ้านหน้างานได้ไหมคะ เดี๋ยวแอดมินเช็กคิวและระยะทางให้ค่ะ"
  },
  {
    title: "อธิบายความต่างบริการล้าง",
    intent: "service_explain",
    priority: 30,
    trigger_phrases: ["ต่างกัน", "แบบไหนดี", "พรีเมียม", "แขวนคอยล์", "ตัดล้าง", "ล้างใหญ่", "ล้างปกติ"],
    response_text: "ได้ค่ะ โดยสรุปงานล้างมีหลายระดับนะคะ\n\n• ล้างปกติ: ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดท่อน้ำทิ้ง\n• ล้างพรีเมียม: ละเอียดขึ้น ถอดรางน้ำทิ้ง/โพรงกระรอกตามหน้างาน และทำความสะอาดลึกกว่า\n• ล้างแบบแขวนคอยล์: ถอดแผงไฟและถาดหลัง ทำความสะอาดละเอียดมากขึ้น\n• ตัดล้างใหญ่: ถอดล้างทั้งตัว เหมาะกับเครื่องสกปรกหนักหรือไม่เคยล้างละเอียดนานแล้วค่ะ\n\nถ้าลูกค้าแจ้งอาการหรือส่งรูปเครื่องมา แอดมินช่วยแนะนำแบบที่เหมาะให้ได้ค่ะ"
  },
  {
    title: "ทักทายและขอข้อมูลเบื้องต้น",
    intent: "general_greeting",
    priority: 40,
    trigger_phrases: ["สวัสดี", "สอบถาม", "สนใจ", "hello", "hi"],
    response_text: "สวัสดีค่ะ Coldwindflow Air Services ยินดีให้บริการค่ะ\n\nสอบถามงานล้างแอร์ ซ่อมแอร์ ติดตั้ง หรือตรวจเช็คแอร์ได้เลยนะคะ ขอทราบพื้นที่หน้างานและรายละเอียดเบื้องต้นได้ไหมคะ"
  }
];

async function seedAutoSafeReplyPlaybooks(pool) {
  for (const item of AUTO_SAFE_PLAYBOOK_SEEDS) {
    await pool.query(`
      INSERT INTO public.ai_auto_safe_reply_playbooks(title,intent,language,trigger_phrases,response_text,risk_level,priority,is_active,approved_by,approved_at,metadata)
      VALUES($1,$2,'th',$3::jsonb,$4,'LOW',$5,true,'system_seed',NOW(),$6::jsonb)
      ON CONFLICT DO NOTHING
    `, [item.title, item.intent, JSON.stringify(item.trigger_phrases || []), item.response_text, Number(item.priority || 100), JSON.stringify({ seed:"v16", locked_business_fact:true })]).catch(()=>{});
  }
}

function normalizePlaybookRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    title: row.title || "",
    intent: row.intent || "unknown",
    language: row.language || "th",
    trigger_phrases: parseJsonArray(row.trigger_phrases),
    response_text: row.response_text || "",
    risk_level: row.risk_level || "LOW",
    priority: Number(row.priority || 100),
    is_active: row.is_active !== false,
    approved_by: row.approved_by || "",
    approved_at: row.approved_at || null,
    version: Number(row.version || 1),
    metadata: parseJsonObject(row.metadata),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function playbookMatchScore(row, text, safety = {}) {
  if (!row || row.is_active === false) return 0;
  const s = cleanText(text, 5000).toLowerCase();
  const intent = cleanText(safety.intent || "", 80);
  let score = row.intent === intent ? 50 : 0;
  const phrases = parseJsonArray(row.trigger_phrases).map((x) => cleanText(x, 120).toLowerCase()).filter(Boolean);
  for (const phrase of phrases) {
    if (phrase && s.includes(phrase)) score += 20;
  }
  if (row.risk_level !== "LOW") score -= 100;
  return score;
}

async function listAutoSafePlaybooks(pool, { activeOnly = false, limit = 80 } = {}) {
  await ensureAiOfficeControlSchema(pool);
  const where = activeOnly ? "WHERE is_active=true" : "";
  const r = await pool.query(`SELECT * FROM public.ai_auto_safe_reply_playbooks ${where} ORDER BY is_active DESC, priority ASC, updated_at DESC LIMIT $1`, [Math.min(200, Math.max(1, Number(limit || 80)))]);
  return (r.rows || []).map(normalizePlaybookRow);
}

async function selectAutoSafePlaybook(pool, text, safety = {}, values = {}) {
  if (!boolValue(values.auto_safe_playbook_enabled, true)) return { matched:false, reason:"PLAYBOOK_DISABLED" };
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`SELECT * FROM public.ai_auto_safe_reply_playbooks WHERE is_active=true AND risk_level='LOW' ORDER BY priority ASC, updated_at DESC LIMIT 120`);
  let best = null;
  let bestScore = 0;
  const seedEnabled = boolValue(values.auto_safe_playbook_seed_enabled, true);
  for (const row of (r.rows || [])) {
    const meta = parseJsonObject(row.metadata);
    if (!seedEnabled && meta.seed) continue;
    const score = playbookMatchScore(row, text, safety);
    if (score > bestScore) { bestScore = score; best = row; }
  }
  if (!best || bestScore < 50) return { matched:false, reason:"PLAYBOOK_NOT_MATCHED", score:bestScore };
  return { matched:true, playbook:normalizePlaybookRow(best), score:bestScore };
}

function renderPlaybookReply(playbook, _text, _safety = {}, values = {}) {
  return applyCustomerReplyTone(playbook?.response_text || "", values);
}

async function upsertAutoSafePlaybook(pool, payload = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const id = Number(payload.id || 0);
  const title = cleanText(payload.title, 200);
  const intent = cleanText(payload.intent || "general_greeting", 80);
  const responseText = cleanText(payload.response_text, 5000);
  if (!title || !responseText) { const err = new Error("PLAYBOOK_TITLE_AND_RESPONSE_REQUIRED"); err.status = 400; throw err; }
  const phrases = Array.isArray(payload.trigger_phrases) ? payload.trigger_phrases : String(payload.trigger_phrases || "").split(",");
  const cleanPhrases = phrases.map((x) => cleanText(x, 120)).filter(Boolean).slice(0, 30);
  if (id) {
    const r = await pool.query(`
      UPDATE public.ai_auto_safe_reply_playbooks
         SET title=$2,intent=$3,trigger_phrases=$4::jsonb,response_text=$5,priority=$6,is_active=$7,approved_by=$8,approved_at=NOW(),version=version+1,updated_at=NOW()
       WHERE id=$1
       RETURNING *
    `, [id, title, intent, JSON.stringify(cleanPhrases), responseText, Number(payload.priority || 100), payload.is_active !== false, cleanText(adminUser,160)]);
    return normalizePlaybookRow(r.rows?.[0]);
  }
  const r = await pool.query(`
    INSERT INTO public.ai_auto_safe_reply_playbooks(title,intent,language,trigger_phrases,response_text,risk_level,priority,is_active,approved_by,approved_at,metadata)
    VALUES($1,$2,'th',$3::jsonb,$4,'LOW',$5,true,$6,NOW(),$7::jsonb)
    RETURNING *
  `, [title, intent, JSON.stringify(cleanPhrases), responseText, Number(payload.priority || 100), cleanText(adminUser,160), JSON.stringify({ source:"admin_v16" })]);
  return normalizePlaybookRow(r.rows?.[0]);
}

function suggestedPlaybookTitle(intent, sampleText = "") {
  const map = {
    price_question: "คำตอบราคา/โปรจากคำถามที่พบบ่อย",
    area_question: "คำตอบพื้นที่บริการจากคำถามที่พบบ่อย",
    service_explain: "คำอธิบายบริการจากคำถามที่พบบ่อย",
    general_greeting: "คำทักทายและขอข้อมูลเบื้องต้นจากคำถามที่พบบ่อย",
  };
  const base = map[intent] || "คำตอบอัตโนมัติจากคำถามที่พบบ่อย";
  const hint = cleanText(sampleText, 36);
  return hint ? `${base} - ${hint}`.slice(0, 180) : base;
}

function suggestedPlaybookResponse(intent) {
  if (intent === "price_question") return "ได้ค่ะ ราคาโปรล้างแอร์ผนังของ Coldwindflow ตอนนี้\n\n• แอร์ผนังไม่เกิน 12,000 BTU: ล้างปกติ 550 / พรีเมียม 790 / แขวนคอยล์ 1,290 / ตัดล้างใหญ่ 1,850 บาท\n• แอร์ผนัง 18,000 BTU ขึ้นไป: ล้างปกติ 690 / พรีเมียม 990 / แขวนคอยล์ 1,550 / ตัดล้างใหญ่ 2,150 บาท\n\nถ้าลูกค้าแจ้งจำนวนเครื่อง ขนาด BTU และพื้นที่หน้างาน แอดมินช่วยสรุปราคาให้ชัดเจนได้ค่ะ";
  if (intent === "area_question") return "รับงานค่ะ พื้นที่หลักของ Coldwindflow มีโซนพระโขนง บางจาก อ่อนนุช ปุณณวิถี อุดมสุข บางนา แบริ่ง สำโรง ลาซาล สุขุมวิทตอนปลาย พระราม 3 ยานนาวา บางคอแหลม สาธุประดิษฐ์ เจริญกรุง ช่องนนทรี และบางพลีค่ะ\n\nขอโลเคชั่นหรือชื่อคอนโด/หมู่บ้านหน้างานได้ไหมคะ เดี๋ยวแอดมินเช็กคิวและระยะทางให้ค่ะ";
  if (intent === "service_explain") return "ได้ค่ะ โดยสรุปงานล้างมีหลายระดับนะคะ\n\n• ล้างปกติ: ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดท่อน้ำทิ้ง\n• ล้างพรีเมียม: ละเอียดขึ้น ถอดรางน้ำทิ้ง/โพรงกระรอกตามหน้างาน และทำความสะอาดลึกกว่า\n• ล้างแบบแขวนคอยล์: ถอดแผงไฟและถาดหลัง ทำความสะอาดละเอียดมากขึ้น\n• ตัดล้างใหญ่: ถอดล้างทั้งตัว เหมาะกับเครื่องสกปรกหนักหรือไม่เคยล้างละเอียดนานแล้วค่ะ\n\nถ้าลูกค้าแจ้งอาการหรือส่งรูปเครื่องมา แอดมินช่วยแนะนำแบบที่เหมาะให้ได้ค่ะ";
  return "สวัสดีค่ะ Coldwindflow Air Services ยินดีให้บริการค่ะ\n\nสอบถามงานล้างแอร์ ซ่อมแอร์ ติดตั้ง หรือตรวจเช็คแอร์ได้เลยนะคะ ขอทราบพื้นที่หน้างานและรายละเอียดเบื้องต้นได้ไหมคะ";
}

function suggestedTriggersFromText(intent, text = "") {
  const base = {
    price_question: ["ราคา", "กี่บาท", "เท่าไหร่", "โปร"],
    area_question: ["พื้นที่", "ไปไหม", "รับงาน", "โซน"],
    service_explain: ["ต่างกัน", "พรีเมียม", "แบบไหนดี", "ล้างปกติ"],
    general_greeting: ["สวัสดี", "สอบถาม", "สนใจ"],
  }[intent] || [];
  const words = cleanText(text, 300).split(/\s+/).map((x) => cleanText(x, 40)).filter((x) => x.length >= 3 && !/^\d+$/.test(x));
  return Array.from(new Set([...base, ...words.slice(0, 6)])).slice(0, 16);
}

function normalizeSuggestionRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    intent: row.intent || "unknown",
    normalized_question: row.normalized_question || "",
    trigger_phrases: parseJsonArray(row.trigger_phrases),
    suggested_title: row.suggested_title || "",
    suggested_response_text: row.suggested_response_text || "",
    reviewed_title: row.reviewed_title || "",
    reviewed_intent: row.reviewed_intent || "",
    reviewed_trigger_phrases: parseJsonArray(row.reviewed_trigger_phrases),
    reviewed_response_text: row.reviewed_response_text || "",
    reviewed_priority: row.reviewed_priority == null ? null : Number(row.reviewed_priority),
    review_note: row.review_note || "",
    reviewed_by: row.reviewed_by || "",
    reviewed_at: row.reviewed_at || null,
    final_title: row.reviewed_title || row.suggested_title || "",
    final_intent: row.reviewed_intent || row.intent || "unknown",
    final_trigger_phrases: parseJsonArray(row.reviewed_trigger_phrases).length ? parseJsonArray(row.reviewed_trigger_phrases) : parseJsonArray(row.trigger_phrases),
    final_response_text: row.reviewed_response_text || row.suggested_response_text || "",
    final_priority: row.reviewed_priority == null ? 90 : Number(row.reviewed_priority),
    sample_customer_messages: parseJsonArray(row.sample_customer_messages),
    occurrences: Number(row.occurrences || 0),
    status: row.status || "pending",
    approved_playbook_id: row.approved_playbook_id == null ? null : Number(row.approved_playbook_id),
    metadata: parseJsonObject(row.metadata),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function generateAutoSafePlaybookSuggestions(pool, values = {}) {
  await ensureAiOfficeControlSchema(pool);
  if (!boolValue(values.auto_safe_playbook_suggestions_enabled, true)) return [];
  const minCount = Math.max(1, Number(values.auto_safe_playbook_suggestion_min_count || 2));
  const windowDays = Math.max(1, Number(values.auto_safe_playbook_suggestion_window_days || 14));
  const r = await queryOptional(pool, `
    SELECT COALESCE(intent,'unknown') AS intent,
           LOWER(REGEXP_REPLACE(TRIM(COALESCE(customer_message,'')), '\\s+', ' ', 'g')) AS normalized_question,
           COUNT(*)::int AS occurrences,
           ARRAY_AGG(customer_message ORDER BY created_at DESC) AS samples,
           MAX(created_at) AS latest_at
      FROM public.ai_auto_safe_reply_logs
     WHERE created_at > NOW() - ($1::text || ' days')::interval
       AND status='skipped'
       AND COALESCE(skipped_reason,'') IN ('PLAYBOOK_NOT_MATCHED','PLAYBOOK_REQUIRED','NO_PLAYBOOK_MATCH')
       AND COALESCE(intent,'unknown') IN ('price_question','area_question','service_explain','general_greeting')
       AND LENGTH(TRIM(COALESCE(customer_message,''))) >= 3
     GROUP BY 1,2
    HAVING COUNT(*) >= $2
     ORDER BY COUNT(*) DESC, MAX(created_at) DESC
     LIMIT 30
  `, [windowDays, minCount], { rows: [] });
  const out = [];
  for (const row of (r.rows || [])) {
    const samples = (row.samples || []).filter(Boolean).slice(0, 5);
    const sample = samples[0] || row.normalized_question || "";
    const payload = {
      intent: row.intent,
      normalized_question: row.normalized_question,
      trigger_phrases: suggestedTriggersFromText(row.intent, sample),
      suggested_title: suggestedPlaybookTitle(row.intent, sample),
      suggested_response_text: suggestedPlaybookResponse(row.intent),
      sample_customer_messages: samples,
      occurrences: Number(row.occurrences || 0),
      metadata: { generated_from:"auto_safe_logs", latest_at: row.latest_at || null, window_days: windowDays, min_count: minCount }
    };
    const ins = await pool.query(`
      INSERT INTO public.ai_auto_safe_playbook_suggestions(intent, normalized_question, trigger_phrases, suggested_title, suggested_response_text, sample_customer_messages, occurrences, status, metadata)
      VALUES($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7,'pending',$8::jsonb)
      ON CONFLICT (intent, normalized_question) DO UPDATE SET
        trigger_phrases=EXCLUDED.trigger_phrases,
        suggested_title=EXCLUDED.suggested_title,
        suggested_response_text=EXCLUDED.suggested_response_text,
        sample_customer_messages=EXCLUDED.sample_customer_messages,
        occurrences=GREATEST(public.ai_auto_safe_playbook_suggestions.occurrences, EXCLUDED.occurrences),
        metadata=EXCLUDED.metadata,
        updated_at=NOW()
      RETURNING *
    `, [payload.intent, payload.normalized_question, JSON.stringify(payload.trigger_phrases), payload.suggested_title, payload.suggested_response_text, JSON.stringify(payload.sample_customer_messages), payload.occurrences, JSON.stringify(payload.metadata)]).catch(()=>null);
    if (ins?.rows?.[0]) out.push(normalizeSuggestionRow(ins.rows[0]));
  }
  return out;
}

async function getAutoSafePlaybookAnalytics(pool, values = {}) {
  await ensureAiOfficeControlSchema(pool);
  await generateAutoSafePlaybookSuggestions(pool, values).catch(()=>[]);
  const windowDays = Math.max(1, Number(values.auto_safe_playbook_suggestion_window_days || 14));
  const playbookUsage = await queryOptional(pool, `
    SELECT COALESCE(playbook_title,'ไม่ระบุ') AS playbook_title, COUNT(*)::int AS sent_count
      FROM public.ai_auto_safe_reply_logs
     WHERE created_at > NOW() - ($1::text || ' days')::interval
       AND status='sent'
     GROUP BY 1
     ORDER BY COUNT(*) DESC
     LIMIT 20
  `, [windowDays], { rows: [] });
  const skippedReasons = await queryOptional(pool, `
    SELECT COALESCE(skipped_reason,'UNKNOWN') AS reason, COUNT(*)::int AS count
      FROM public.ai_auto_safe_reply_logs
     WHERE created_at > NOW() - ($1::text || ' days')::interval
       AND status='skipped'
     GROUP BY 1
     ORDER BY COUNT(*) DESC
     LIMIT 20
  `, [windowDays], { rows: [] });
  const intentCoverage = await queryOptional(pool, `
    SELECT COALESCE(intent,'unknown') AS intent,
           COUNT(*)::int AS total,
           SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END)::int AS sent,
           SUM(CASE WHEN status='skipped' AND COALESCE(skipped_reason,'')='PLAYBOOK_NOT_MATCHED' THEN 1 ELSE 0 END)::int AS missing_playbook
      FROM public.ai_auto_safe_reply_logs
     WHERE created_at > NOW() - ($1::text || ' days')::interval
     GROUP BY 1
     ORDER BY total DESC
     LIMIT 20
  `, [windowDays], { rows: [] });
  const suggestions = await pool.query(`SELECT * FROM public.ai_auto_safe_playbook_suggestions WHERE status='pending' ORDER BY occurrences DESC, updated_at DESC LIMIT 30`).catch(()=>({ rows: [] }));
  return {
    window_days: windowDays,
    playbook_usage: playbookUsage.rows || [],
    skipped_reasons: skippedReasons.rows || [],
    intent_coverage: intentCoverage.rows || [],
    suggestions: (suggestions.rows || []).map(normalizeSuggestionRow),
  };
}

async function updateAutoSafePlaybookSuggestionReview(pool, id, body = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const suggestionId = Number(id || 0);
  const title = cleanText(body.reviewed_title || body.title || body.suggested_title, 240);
  const intent = cleanText(body.reviewed_intent || body.intent, 80);
  const responseText = cleanText(body.reviewed_response_text || body.response_text || body.suggested_response_text, 5000);
  const rawTriggers = Array.isArray(body.reviewed_trigger_phrases) ? body.reviewed_trigger_phrases : (Array.isArray(body.trigger_phrases) ? body.trigger_phrases : String(body.trigger_phrases || "").split(/[,\n]/));
  const triggers = Array.from(new Set(rawTriggers.map((x) => cleanText(x, 80)).filter(Boolean))).slice(0, 30);
  const priority = Math.max(1, Math.min(999, Number(body.reviewed_priority || body.priority || 90)));
  const note = cleanText(body.review_note || body.admin_note || "", 1000);
  const r = await pool.query(`
    UPDATE public.ai_auto_safe_playbook_suggestions
       SET reviewed_title=$2,
           reviewed_intent=$3,
           reviewed_trigger_phrases=$4::jsonb,
           reviewed_response_text=$5,
           reviewed_priority=$6,
           review_note=$7,
           reviewed_by=$8,
           reviewed_at=NOW(),
           updated_at=NOW()
     WHERE id=$1
     RETURNING *
  `, [suggestionId, title, intent, JSON.stringify(triggers), responseText, priority, note, cleanText(adminUser,160)]);
  const row = normalizeSuggestionRow(r.rows?.[0]);
  if (!row) { const err = new Error("PLAYBOOK_SUGGESTION_NOT_FOUND"); err.status = 404; throw err; }
  return row;
}

async function approveAutoSafePlaybookSuggestion(pool, id, adminUser = "", body = null) {
  await ensureAiOfficeControlSchema(pool);
  let suggestion;
  if (body && Object.keys(body || {}).length) suggestion = await updateAutoSafePlaybookSuggestionReview(pool, id, body, adminUser);
  else {
    const r = await pool.query(`SELECT * FROM public.ai_auto_safe_playbook_suggestions WHERE id=$1 LIMIT 1`, [Number(id || 0)]);
    suggestion = normalizeSuggestionRow(r.rows?.[0]);
  }
  if (!suggestion) { const err = new Error("PLAYBOOK_SUGGESTION_NOT_FOUND"); err.status = 404; throw err; }
  if (suggestion.status !== "pending") { const err = new Error("PLAYBOOK_SUGGESTION_NOT_PENDING"); err.status = 409; throw err; }
  const playbook = await upsertAutoSafePlaybook(pool, {
    title: suggestion.final_title || suggestion.suggested_title,
    intent: suggestion.final_intent || suggestion.intent,
    trigger_phrases: suggestion.final_trigger_phrases && suggestion.final_trigger_phrases.length ? suggestion.final_trigger_phrases : suggestion.trigger_phrases,
    response_text: suggestion.final_response_text || suggestion.suggested_response_text,
    priority: suggestion.final_priority || 90,
    is_active: true,
    metadata: { approved_from_suggestion_id: suggestion.id, review_note: suggestion.review_note || "" }
  }, adminUser);
  await pool.query(`UPDATE public.ai_auto_safe_playbook_suggestions SET status='approved', approved_playbook_id=$2, approved_by=$3, approved_at=NOW(), updated_at=NOW() WHERE id=$1`, [suggestion.id, playbook.id, cleanText(adminUser,160)]).catch(()=>{});
  return { suggestion:{ ...suggestion, status:"approved", approved_playbook_id:playbook.id }, playbook };
}

async function dismissAutoSafePlaybookSuggestion(pool, id, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`UPDATE public.ai_auto_safe_playbook_suggestions SET status='dismissed', dismissed_by=$2, dismissed_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`, [Number(id || 0), cleanText(adminUser,160)]);
  const row = normalizeSuggestionRow(r.rows?.[0]);
  if (!row) { const err = new Error("PLAYBOOK_SUGGESTION_NOT_FOUND"); err.status = 404; throw err; }
  return row;
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
  if (!boolValue(values.safe_reply_decision_enabled, true)) return { intent, decision:"BLOCKED", risk_label:"MEDIUM", confidence:100, reason:"เครื่องกรองความปลอดภัยคำตอบถูกปิด" };
  if (["complaint","tax_invoice"].includes(intent)) return { intent, decision:"ADMIN_ONLY", risk_label:"HIGH", confidence:96, reason:"เคสเสี่ยงสูง ต้องให้แอดมินตอบเองเท่านั้น" };
  if (["booking_or_queue","repair_diagnosis","price_objection"].includes(intent)) return { intent, decision:"APPROVAL_REQUIRED", risk_label:"MEDIUM", confidence:88, reason:"เกี่ยวกับคิว จองงาน อาการเสีย หรือต่อราคา ต้องให้แอดมินตรวจก่อนใช้" };
  if (["price_question","area_question","service_explain","general_greeting"].includes(intent)) return { intent, decision:"SAFE_DRAFT", risk_label:"LOW", confidence:82, reason:"เป็นคำถามข้อมูลทั่วไป ร่างคำตอบได้ แต่ยังไม่ส่งเอง" };
  return { intent, decision:"APPROVAL_REQUIRED", risk_label:"MEDIUM", confidence:62, reason:"ระบบยังไม่มั่นใจประเภทคำถาม ให้แอดมินตรวจคำตอบก่อนใช้" };
}

function buildSafeRecommendedReply(text, safety) {
  const intent = safety.intent;
  // Customer-runtime replies follow CWF Professional Sales Admin Brain v2.8:
  // short, natural, no internal metadata, and always move the customer to the next booking step.
  if (intent === "price_question") {
    return `ได้ค่ะ ล้างแอร์ผนังโปรเริ่มต้น 550 บาทนะคะ

ถ้าเป็นเครื่องไม่เกิน 12,000 BTU: ปกติ 550 / พรีเมียม 790 บาทค่ะ
ถ้า 18,000 BTU ขึ้นไป: ปกติ 690 / พรีเมียม 990 บาทค่ะ

ลูกค้าล้างกี่เครื่อง และอยู่โซนไหนคะ เดี๋ยวช่วยสรุปราคาให้ตรงหน้างานค่ะ`;
  }
  if (intent === "area_question") {
    return `รับค่ะ โซนหลักมีพระโขนง อ่อนนุช บางนา แบริ่ง สำโรง ลาซาล และพระราม 3 / ยานนาวา / บางคอแหลมด้วยค่ะ

ลูกค้าส่งโลเคชั่นหรือชื่อคอนโดมาได้เลยนะคะ เดี๋ยวเช็กคิวช่างให้ค่ะ`;
  }
  if (intent === "service_explain") {
    return `ได้ค่ะ ถ้าแอร์ล้างตามรอบทั่วไป ล้างปกติก็พอค่ะ เริ่ม 550 บาท

ถ้าแอร์ฝุ่นเยอะ มีกลิ่น น้ำหยด หรือไม่ได้ล้างนาน แนะนำพรีเมียมหรือแขวนคอยล์จะเหมาะกว่าค่ะ

ลูกค้ามีอาการอะไรเป็นพิเศษไหมคะ เดี๋ยวช่วยแนะนำแบบที่คุ้มสุดให้ค่ะ`;
  }
  if (intent === "price_objection") {
    return `เข้าใจค่ะ ถ้าเครื่องไม่มีอาการหนัก แนะนำเริ่มจากล้างปกติ 550 บาทก่อนได้เลยค่ะ ไม่จำเป็นต้องเลือกแพ็กเกจแพง

ถ้าลูกค้าบอกจำนวนเครื่องกับพื้นที่ เดี๋ยวช่วยสรุปราคาโปรที่คุ้มที่สุดให้ค่ะ`;
  }
  if (intent === "booking_or_queue") {
    return `ได้ค่ะ เดี๋ยวเช็กคิวให้ค่ะ

รบกวนแจ้งจำนวนเครื่อง พื้นที่/โลเคชั่น และวัน-ช่วงเวลาที่สะดวกนะคะ ถ้ามีเบอร์ติดต่อส่งมาพร้อมกันได้เลยค่ะ`;
  }
  if (intent === "repair_diagnosis") {
    return `อาการนี้ต้องให้ช่างเช็กหน้างานนิดนึงค่ะ เพราะอาจเกิดได้หลายสาเหตุ

รบกวนแจ้งอาการหลัก เช่น ไม่เย็น/น้ำหยด/มีโค้ด และส่งรูปเครื่องหรือโค้ด error มาได้เลยค่ะ เดี๋ยวช่วยดูเบื้องต้นให้ก่อนนะคะ`;
  }
  if (intent === "complaint") {
    return "ขออภัยด้วยค่ะ เคสนี้เดี๋ยวให้ผู้ดูแลตรวจสอบและตอบกลับโดยตรงนะคะ";
  }
  if (intent === "tax_invoice") {
    return "ขอแจ้งตรง ๆ นะคะ ตอนนี้ทางร้านยังไม่สามารถออกใบกำกับภาษีได้ค่ะ";
  }
  return "สวัสดีค่ะ Coldwindflow ยินดีให้บริการค่ะ ลูกค้าต้องการล้างแอร์ ซ่อมแอร์ หรือตรวจเช็คอาการแอร์คะ";
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

const AUTO_SAFE_ALLOWED_INTENTS = new Set(["price_question", "area_question", "service_explain", "general_greeting"]);

function autoSafeGate(text, safety, values = {}) {
  const safeTextValue = cleanText(text, 5000);
  if (boolValue(values.kill_switch, false)) return { ok:false, reason:"KILL_SWITCH_ON" };
  if (!boolValue(values.auto_safe_reply_send_enabled, false)) return { ok:false, reason:"AUTO_SAFE_REPLY_DISABLED" };
  if (!boolValue(values.draft_reply_enabled, true)) return { ok:false, reason:"DRAFT_REPLY_DISABLED" };
  if (!boolValue(values.safe_reply_decision_enabled, true)) return { ok:false, reason:"SAFETY_DECISION_DISABLED" };
  if (!safety || safety.decision !== "SAFE_DRAFT") return { ok:false, reason:"NOT_SAFE_DRAFT" };
  if (safety.risk_label !== "LOW") return { ok:false, reason:"RISK_NOT_LOW" };
  const confidenceThreshold = Math.max(50, Math.min(99, Number(values.auto_safe_reply_confidence_threshold || 85)));
  if (Number(safety.confidence || 0) < confidenceThreshold) return { ok:false, reason:"CONFIDENCE_TOO_LOW", threshold: confidenceThreshold };
  if (!AUTO_SAFE_ALLOWED_INTENTS.has(safety.intent)) return { ok:false, reason:"INTENT_NOT_ALLOWED" };
  if (/(จอง|นัด|คิว|ว่าง|พรุ่งนี้|วันนี้|ช่างว่าง|พร้อม|ตกลง|ซ่อม|ไม่เย็น|น้ำหยด|รั่ว|ร้องเรียน|เสียหาย|คืนเงิน|ใบกำกับ|ภาษี|ลด|ส่วนลด|แพง|แจ้งความ|ตำรวจ|รีวิว)/i.test(safeTextValue)) {
    return { ok:false, reason:"TEXT_HAS_RISK_KEYWORD" };
  }
  return { ok:true, reason:"AUTO_SAFE_ALLOWED" };
}

async function insertAutoSafeLog(pool, payload = {}) {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`
    INSERT INTO public.ai_auto_safe_reply_logs(
      conversation_id,line_user_id,message_id,customer_message,reply_text,intent,decision,risk_label,confidence,status,skipped_reason,line_response,metadata,playbook_id,playbook_title
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
    ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
    RETURNING *
  `, [
    Number(payload.conversation_id || 0) || null,
    cleanText(payload.line_user_id || "", 255),
    cleanText(payload.message_id || "", 255) || null,
    cleanText(payload.customer_message || "", 5000),
    cleanText(payload.reply_text || "", 5000),
    cleanText(payload.intent || "unknown", 80),
    cleanText(payload.decision || "BLOCKED", 80),
    cleanText(payload.risk_label || "MEDIUM", 80),
    Number(payload.confidence || 0),
    cleanText(payload.status || "skipped", 80),
    cleanText(payload.skipped_reason || "", 300),
    cleanText(payload.line_response || "", 4000),
    JSON.stringify(payload.metadata || {}),
    Number(payload.playbook_id || 0) || null,
    cleanText(payload.playbook_title || "", 255) || null,
  ]);
  return r.rows?.[0] || null;
}

async function listAutoSafeReplyLogs(pool, limit = 30) {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`SELECT * FROM public.ai_auto_safe_reply_logs ORDER BY created_at DESC LIMIT $1`, [Math.min(100, Math.max(1, Number(limit || 30)))]);
  return r.rows || [];
}

async function countAutoSafeWindow(pool, conversationId, values = {}) {
  const id = Number(conversationId || 0);
  if (!id) return { cooldown_count: 0, daily_count: 0 };
  const cooldown = Math.max(1, Math.min(1440, Number(values.auto_safe_reply_cooldown_minutes || 15)));
  const cooldownRows = await queryOptional(pool, `
    SELECT COUNT(*)::int AS count
      FROM public.ai_auto_safe_reply_logs
     WHERE conversation_id=$1 AND status='sent' AND created_at > NOW() - ($2::int * INTERVAL '1 minute')
  `, [id, cooldown], { rows:[{ count:0 }] });
  const dailyRows = await queryOptional(pool, `
    SELECT COUNT(*)::int AS count
      FROM public.ai_auto_safe_reply_logs
     WHERE conversation_id=$1 AND status='sent' AND created_at > NOW() - INTERVAL '1 day'
  `, [id], { rows:[{ count:0 }] });
  return {
    cooldown_count: Number(cooldownRows.rows?.[0]?.count || 0),
    daily_count: Number(dailyRows.rows?.[0]?.count || 0),
  };
}

function parseTimeToMinutes(value, fallback) {
  const m = String(value == null ? "" : value).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Math.max(0, Math.min(23, Number(m[1] || 0)));
  const min = Math.max(0, Math.min(59, Number(m[2] || 0)));
  return h * 60 + min;
}

function bangkokMinutesNow(date = new Date()) {
  return ((date.getUTCHours() + 7) % 24) * 60 + date.getUTCMinutes();
}

function isQuietHoursActive(values = {}, date = new Date()) {
  if (!boolValue(values.auto_safe_reply_quiet_hours_enabled, false)) return false;
  const start = parseTimeToMinutes(values.auto_safe_reply_quiet_start, 22 * 60);
  const end = parseTimeToMinutes(values.auto_safe_reply_quiet_end, 8 * 60);
  const now = bangkokMinutesNow(date);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

async function getConversationPause(pool, conversationId) {
  const id = Number(conversationId || 0);
  if (!id) return null;
  await ensureAiOfficeControlSchema(pool);
  const r = await queryOptional(pool, `
    SELECT * FROM public.ai_auto_safe_conversation_pauses
     WHERE conversation_id=$1 AND paused_until > NOW()
     LIMIT 1
  `, [id], { rows: [] });
  return r.rows?.[0] || null;
}

async function pauseAutoSafeConversation(pool, conversationId, payload = {}, adminUser = "") {
  const id = Number(conversationId || 0);
  if (!id) { const err = new Error("CONVERSATION_ID_REQUIRED"); err.status = 400; throw err; }
  await ensureAiOfficeControlSchema(pool);
  const minutes = Math.max(5, Math.min(43200, Number(payload.minutes || payload.pause_minutes || 1440)));
  const lineUserId = cleanText(payload.line_user_id || "", 255);
  const reason = cleanText(payload.reason || "แอดมินพัก AI ตอบเองในแชทนี้", 1000);
  const r = await pool.query(`
    INSERT INTO public.ai_auto_safe_conversation_pauses(conversation_id,line_user_id,paused_until,paused_by,reason,updated_at)
    VALUES($1,$2,NOW()+($3::int * INTERVAL '1 minute'),$4,$5,NOW())
    ON CONFLICT (conversation_id) DO UPDATE SET
      line_user_id=COALESCE(EXCLUDED.line_user_id, public.ai_auto_safe_conversation_pauses.line_user_id),
      paused_until=EXCLUDED.paused_until,
      paused_by=EXCLUDED.paused_by,
      reason=EXCLUDED.reason,
      updated_at=NOW()
    RETURNING *
  `, [id, lineUserId || null, minutes, cleanText(adminUser, 160), reason]);
  return r.rows?.[0] || null;
}

async function resumeAutoSafeConversation(pool, conversationId, adminUser = "") {
  const id = Number(conversationId || 0);
  if (!id) { const err = new Error("CONVERSATION_ID_REQUIRED"); err.status = 400; throw err; }
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`
    UPDATE public.ai_auto_safe_conversation_pauses
       SET paused_until=NOW(), paused_by=$2, reason='resume_by_admin', updated_at=NOW()
     WHERE conversation_id=$1
     RETURNING *
  `, [id, cleanText(adminUser, 160)]);
  return r.rows?.[0] || null;
}

async function autoSafeContextGate(pool, conversationId, lineUserId, values = {}) {
  const id = Number(conversationId || 0);
  if (!id) return { ok:false, reason:"MISSING_CONVERSATION" };
  if (isQuietHoursActive(values)) return { ok:false, reason:"QUIET_HOURS_ACTIVE" };
  const pause = await getConversationPause(pool, id);
  if (pause) return { ok:false, reason:"CONVERSATION_PAUSED", pause };
  const takeoverMinutes = Math.max(0, Math.min(1440, Number(values.auto_safe_human_takeover_minutes || 60)));
  if (takeoverMinutes > 0) {
    const adminRows = await queryOptional(pool, `
      SELECT id, created_at, message_text
        FROM public.line_messages
       WHERE conversation_id=$1
         AND direction='outbound'
         AND COALESCE(event_type,'') <> 'auto_safe_reply'
         AND COALESCE(raw_event_json->>'source','') <> 'ai_auto_safe_reply'
         AND created_at > NOW() - ($2::int * INTERVAL '1 minute')
       ORDER BY created_at DESC
       LIMIT 1
    `, [id, takeoverMinutes], { rows: [] });
    if (adminRows.rows?.[0]) return { ok:false, reason:"HUMAN_TAKEOVER_ACTIVE", latest_admin_reply: adminRows.rows[0] };
  }
  return { ok:true, reason:"CONTEXT_OK" };
}

async function storeAutoSafeOutboundLineMessage(pool, conversationId, lineUserId, replyText, raw = "") {
  const id = Number(conversationId || 0);
  if (!id || !lineUserId || !replyText) return;
  await pool.query(`
    INSERT INTO public.line_messages(conversation_id,line_user_id,message_id,direction,event_type,message_type,message_text,raw_event_json,received_at)
    VALUES($1,$2,NULL,'outbound','auto_safe_reply','text',$3,$4::jsonb,NOW())
  `, [id, lineUserId, cleanText(replyText, 5000), JSON.stringify({ source:"ai_auto_safe_reply", line_response: raw })]).catch(()=>{});
  await pool.query(`
    UPDATE public.line_conversations
       SET last_message_text=$2,last_message_type='text',last_message_at=NOW(),updated_at=NOW()
     WHERE id=$1
  `, [id, cleanText(replyText, 5000)]).catch(()=>{});
}

async function createAutoSafeSentApproval(pool, payload = {}) {
  await ensureAiOfficeControlSchema(pool);
  const r = await pool.query(`
    INSERT INTO public.ai_auto_reply_approvals(
      conversation_id,line_user_id,line_display_name,customer_message,ai_draft,final_reply,risk_label,decision,decision_reason,status,source,sent_by,sent_at,line_response,admin_note,metadata,updated_at
    ) VALUES($1,$2,$3,$4,$5,$5,$6,'SAFE_AUTO_SENT',$7,'sent','auto_safe_reply','ai_auto_safe',NOW(),$8,$9,$10::jsonb,NOW())
    RETURNING *
  `, [
    Number(payload.conversation_id || 0) || null,
    cleanText(payload.line_user_id || "", 255),
    cleanText(payload.line_display_name || "", 255),
    cleanText(payload.customer_message || "", 5000),
    cleanText(payload.reply_text || "", 5000),
    cleanText(payload.risk_label || "LOW", 80),
    cleanText(payload.decision_reason || "AI ส่งเองเฉพาะคำถามปลอดภัย", 1000),
    cleanText(payload.line_response || "", 4000),
    cleanText(payload.admin_note || "auto_safe_reply_sent", 1000),
    JSON.stringify(payload.metadata || {}),
  ]);
  return normalizeApprovalRow(r.rows?.[0]);
}


function extractLearningPhrase(text) {
  return cleanText(text || "", 180).toLowerCase();
}

function isNegativeAutoSafeFeedback(type) {
  return ["bad", "wrong", "wrong_price", "too_aggressive", "unsafe", "not_natural", "admin_only"].includes(cleanText(type, 80));
}

async function saveAutoSafeQualityFeedback(pool, logId, payload = {}, adminUser = "") {
  await ensureAiOfficeControlSchema(pool);
  const id = Number(logId || payload.log_id || 0) || null;
  let log = null;
  if (id) {
    const r0 = await queryOptional(pool, `SELECT * FROM public.ai_auto_safe_reply_logs WHERE id=$1 LIMIT 1`, [id], { rows: [] });
    log = r0.rows?.[0] || null;
  }
  const feedbackType = cleanText(payload.feedback_type || payload.type || "bad", 80) || "bad";
  const reason = cleanText(payload.reason || "", 500);
  const adminNote = cleanText(payload.admin_note || "", 1000);
  const conversationId = Number(payload.conversation_id || log?.conversation_id || 0) || null;
  const lineUserId = cleanText(payload.line_user_id || log?.line_user_id || "", 255);
  const customerMessage = cleanText(payload.customer_message || log?.customer_message || "", 5000);
  const replyText = cleanText(payload.reply_text || log?.reply_text || "", 5000);
  const r = await pool.query(`
    INSERT INTO public.ai_auto_safe_quality_feedback(log_id,conversation_id,line_user_id,customer_message,reply_text,feedback_type,reason,admin_note,created_by,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    RETURNING *
  `, [id, conversationId, lineUserId, customerMessage, replyText, feedbackType, reason, adminNote, cleanText(adminUser, 160), JSON.stringify({ source:"ai_reply_control_v15", original_log_status: log?.status || "" })]);
  const fb = r.rows?.[0] || null;
  if (id) {
    await pool.query(`UPDATE public.ai_auto_safe_reply_logs SET quality_status=$2, feedback_reason=$3 WHERE id=$1`, [id, feedbackType, reason || adminNote]).catch(()=>{});
  }
  if (fb && isNegativeAutoSafeFeedback(feedbackType)) {
    const phrase = extractLearningPhrase(customerMessage);
    if (phrase) {
      await pool.query(`
        INSERT INTO public.ai_auto_safe_learning_rules(rule_type, phrase, intent, action, reason, is_active, source_feedback_id, created_by, metadata)
        VALUES('similar_customer_message',$1,$2,'block_auto_safe',$3,true,$4,$5,$6::jsonb)
      `, [phrase, cleanText(log?.intent || payload.intent || "", 80), reason || feedbackType, fb.id, cleanText(adminUser, 160), JSON.stringify({ feedback_type: feedbackType })]).catch(()=>{});
    }
    const values = await getControlValues(pool);
    if (conversationId && boolValue(values.auto_safe_auto_pause_on_bad_feedback, true)) {
      await pauseAutoSafeConversation(pool, conversationId, { minutes: Number(values.auto_safe_auto_pause_minutes || 1440), line_user_id: lineUserId, reason: `feedback_${feedbackType}:${reason || "admin_negative_feedback"}` }, adminUser).catch(()=>{});
    }
  }
  return fb;
}

async function autoSafeQualityGate(pool, text, safety = {}, values = {}) {
  if (!boolValue(values.auto_safe_quality_guard_enabled, true)) return { ok:true, reason:"QUALITY_GUARD_DISABLED" };
  await ensureAiOfficeControlSchema(pool);
  const phrase = extractLearningPhrase(text);
  if (phrase) {
    const ruleRows = await queryOptional(pool, `
      SELECT * FROM public.ai_auto_safe_learning_rules
       WHERE is_active=true AND action='block_auto_safe'
         AND rule_type='similar_customer_message'
         AND phrase IS NOT NULL
         AND ($1 ILIKE '%' || phrase || '%' OR phrase ILIKE '%' || $1 || '%')
       ORDER BY created_at DESC
       LIMIT 1
    `, [phrase], { rows: [] });
    if (ruleRows.rows?.[0]) return { ok:false, reason:"QUALITY_RULE_BLOCKED", rule: ruleRows.rows[0] };
  }
  const windowDays = Math.max(1, Math.min(180, Number(values.auto_safe_negative_feedback_window_days || 14)));
  const threshold = Math.max(1, Math.min(20, Number(values.auto_safe_negative_feedback_threshold || 2)));
  const negRows = await queryOptional(pool, `
    SELECT COUNT(*)::int AS count
      FROM public.ai_auto_safe_quality_feedback f
      LEFT JOIN public.ai_auto_safe_reply_logs l ON l.id=f.log_id
     WHERE f.created_at > NOW() - ($1::int * INTERVAL '1 day')
       AND f.feedback_type IN ('bad','wrong','wrong_price','too_aggressive','unsafe','not_natural','admin_only')
       AND COALESCE(l.intent,'') = $2
  `, [windowDays, cleanText(safety.intent || "", 80)], { rows:[{ count:0 }] });
  const count = Number(negRows.rows?.[0]?.count || 0);
  if (count >= threshold) return { ok:false, reason:"NEGATIVE_FEEDBACK_THRESHOLD", count, threshold, intent:safety.intent };
  return { ok:true, reason:"QUALITY_OK" };
}

async function getAutoSafeQualitySummary(pool) {
  await ensureAiOfficeControlSchema(pool);
  const feedback = await queryOptional(pool, `
    SELECT feedback_type, COUNT(*)::int AS count
      FROM public.ai_auto_safe_quality_feedback
     WHERE created_at > NOW() - INTERVAL '30 days'
     GROUP BY feedback_type
     ORDER BY count DESC
  `, [], { rows: [] });
  const rules = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_learning_rules WHERE is_active=true`, [], { rows:[{ count:0 }] });
  const latest = await queryOptional(pool, `SELECT * FROM public.ai_auto_safe_quality_feedback ORDER BY created_at DESC LIMIT 30`, [], { rows: [] });
  return { feedback_counts: feedback.rows || [], active_rules: Number(rules.rows?.[0]?.count || 0), latest_feedback: latest.rows || [] };
}

async function handleAutoSafeLineReplyFromWebhook(pool, event, stored = {}) {
  try {
    if (!pool || !event || event.type !== "message" || event.message?.type !== "text") return { ok:false, skipped:true, reason:"UNSUPPORTED_EVENT" };
    const customerMessage = cleanText(event.message?.text || "", 5000);
    const lineUserId = cleanText(event.source?.userId || stored.line_user_id || "", 255);
    const conversationId = Number(stored.conversation_id || 0) || null;
    const messageId = cleanText(event.message?.id || "", 255);
    if (!customerMessage || !lineUserId || !conversationId) return { ok:false, skipped:true, reason:"MISSING_LINE_CONTEXT" };
    await ensureAiOfficeControlSchema(pool);
    const values = await getControlValues(pool);
    const safety = decideReplySafety(customerMessage, values);
    const coreBrain = await buildCoreBrainContext(pool, {
      query: customerMessage,
      agent_key: "admin",
      intent: safety.intent,
      language: hasThaiText(customerMessage) ? "th" : "auto",
      limit: 10,
    }).catch(() => null);
    const coreBrainMeta = {
      core_brain_used: !!coreBrain,
      used_core_brain_item_ids: (coreBrain?.summary || []).map((item) => item.id).filter(Boolean),
      core_brain_sources: (coreBrain?.summary || []).slice(0, 6).map((item) => item.source || item.item_type || "core_brain"),
    };
    const gate = autoSafeGate(customerMessage, safety, values);
    if (!gate.ok) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason: gate.reason, metadata:{ source:"webhook", ...coreBrainMeta } });
      return { ok:false, skipped:true, reason: gate.reason, safety };
    }
    const contextGate = await autoSafeContextGate(pool, conversationId, lineUserId, values);
    if (!contextGate.ok) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason: contextGate.reason, metadata:{ source:"webhook", contextGate, ...coreBrainMeta } });
      return { ok:false, skipped:true, reason: contextGate.reason, safety, contextGate };
    }
    const qualityGate = await autoSafeQualityGate(pool, customerMessage, safety, values);
    if (!qualityGate.ok) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason: qualityGate.reason, metadata:{ source:"webhook", qualityGate, ...coreBrainMeta } });
      return { ok:false, skipped:true, reason: qualityGate.reason, safety, qualityGate };
    }
    const playbookMatch = await selectAutoSafePlaybook(pool, customerMessage, safety, values);
    const playbookRequired = boolValue(values.auto_safe_playbook_required, true);
    if (playbookRequired && !playbookMatch.matched) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason:"PLAYBOOK_NOT_MATCHED", metadata:{ source:"webhook", playbookMatch, ...coreBrainMeta } });
      return { ok:false, skipped:true, reason:"PLAYBOOK_NOT_MATCHED", safety, playbookMatch };
    }
    const limits = await countAutoSafeWindow(pool, conversationId, values);
    const dailyLimit = Math.max(1, Math.min(50, Number(values.auto_safe_reply_daily_limit || 5)));
    if (limits.cooldown_count > 0) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason:"COOLDOWN_ACTIVE", metadata:{ source:"webhook", limits, ...coreBrainMeta } });
      return { ok:false, skipped:true, reason:"COOLDOWN_ACTIVE", safety };
    }
    if (limits.daily_count >= dailyLimit) {
      await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"skipped", skipped_reason:"DAILY_LIMIT_REACHED", metadata:{ source:"webhook", limits, dailyLimit, ...coreBrainMeta } });
      return { ok:false, skipped:true, reason:"DAILY_LIMIT_REACHED", safety };
    }
    const selectedPlaybook = playbookMatch.matched ? playbookMatch.playbook : null;
    const replyText = selectedPlaybook ? renderPlaybookReply(selectedPlaybook, customerMessage, safety, values) : applyCustomerReplyTone(buildSafeRecommendedReply(customerMessage, safety), values);
    const raw = await pushLineMessageToUser(lineUserId, replyText);
    await storeAutoSafeOutboundLineMessage(pool, conversationId, lineUserId, replyText, raw);
    const decision = await saveReplyDecisionLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, customer_message: customerMessage, safety, recommended_reply: replyText, source:"auto_safe_webhook", values, metadata:{ auto_sent:true, message_id: messageId, ...coreBrainMeta, playbook_id: selectedPlaybook?.id || null, playbook_title: selectedPlaybook?.title || null } }, "ai_auto_safe").catch(()=>null);
    const approval = await createAutoSafeSentApproval(pool, { conversation_id: conversationId, line_user_id: lineUserId, customer_message: customerMessage, reply_text: replyText, risk_label: safety.risk_label, decision_reason: safety.reason, line_response: raw, metadata:{ decision_log_id: decision?.id || null, message_id: messageId, ...coreBrainMeta, intent: safety.intent, playbook_id: selectedPlaybook?.id || null, playbook_title: selectedPlaybook?.title || null } }).catch(()=>null);
    const log = await insertAutoSafeLog(pool, { conversation_id: conversationId, line_user_id: lineUserId, message_id: messageId, customer_message: customerMessage, reply_text: replyText, intent: safety.intent, decision: safety.decision, risk_label: safety.risk_label, confidence: safety.confidence, status:"sent", line_response: raw, metadata:{ source:"webhook", ...coreBrainMeta, decision_log_id: decision?.id || null, approval_id: approval?.id || null, playbook_id: selectedPlaybook?.id || null, playbook_title: selectedPlaybook?.title || null }, playbook_id: selectedPlaybook?.id || null, playbook_title: selectedPlaybook?.title || null });
    return { ok:true, sent:true, safety, reply_text: replyText, log_id: log?.id || null, approval_id: approval?.id || null };
  } catch (e) {
    try { await insertAutoSafeLog(pool, { conversation_id: stored?.conversation_id, line_user_id: event?.source?.userId, message_id: event?.message?.id, customer_message: event?.message?.text, status:"failed", skipped_reason:e.message || "AUTO_SAFE_REPLY_FAILED", metadata:{ source:"webhook_error" } }); } catch (_) {}
    return { ok:false, skipped:false, error:e.message || "AUTO_SAFE_REPLY_FAILED" };
  }
}


async function getAutoSafeDashboard(pool, values = {}) {
  await ensureAiOfficeControlSchema(pool);
  const windowDays = Math.max(1, Math.min(180, Number(values.auto_safe_dashboard_window_days || 30)));
  const secondsPerReply = Math.max(5, Math.min(600, Number(values.auto_safe_estimated_admin_seconds_per_reply || 45)));
  const hourlyCost = Math.max(0, Math.min(5000, Number(values.auto_safe_admin_hourly_cost_thb || 120)));
  const [sent24, sent7, sentWindow, skipped24, skipped7, skippedWindow, reasons, intents, playbookUsage, qualityRows, activeRules, pendingSuggestions, activePauses, activePlaybooks] = await Promise.all([
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - INTERVAL '24 hours'`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - INTERVAL '7 days'`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - ($1::int * INTERVAL '1 day')`, [windowDays], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='skipped' AND created_at > NOW() - INTERVAL '24 hours'`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='skipped' AND created_at > NOW() - INTERVAL '7 days'`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='skipped' AND created_at > NOW() - ($1::int * INTERVAL '1 day')`, [windowDays], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COALESCE(skipped_reason,'UNKNOWN') AS reason, COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='skipped' AND created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY count DESC LIMIT 12`, [windowDays], { rows:[] }),
    queryOptional(pool, `SELECT COALESCE(intent,'unknown') AS intent, COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY count DESC LIMIT 12`, [windowDays], { rows:[] }),
    queryOptional(pool, `SELECT COALESCE(playbook_title,'ไม่ระบุ') AS playbook_title, COUNT(*)::int AS sent_count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY 1 ORDER BY sent_count DESC LIMIT 12`, [windowDays], { rows:[] }),
    queryOptional(pool, `SELECT feedback_type, COUNT(*)::int AS count FROM public.ai_auto_safe_quality_feedback WHERE created_at > NOW() - ($1::int * INTERVAL '1 day') GROUP BY feedback_type`, [windowDays], { rows:[] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_learning_rules WHERE is_active=true`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_playbook_suggestions WHERE status='pending'`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_conversation_pauses WHERE paused_until > NOW()`, [], { rows:[{ count:0 }] }),
    queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_playbooks WHERE is_active=true`, [], { rows:[{ count:0 }] }),
  ]);
  const sentWindowCount = Number(sentWindow.rows?.[0]?.count || 0);
  const skippedWindowCount = Number(skippedWindow.rows?.[0]?.count || 0);
  const totalWindow = sentWindowCount + skippedWindowCount;
  const playbookSent = (playbookUsage.rows || []).reduce((sum, row) => sum + Number(row.sent_count || 0), 0);
  const quality = (qualityRows.rows || []).reduce((acc, row) => { acc[row.feedback_type || 'unknown'] = Number(row.count || 0); return acc; }, {});
  const riskBlockedReasons = new Set(['NOT_SAFE_DRAFT','RISK_NOT_LOW','INTENT_NOT_ALLOWED','TEXT_HAS_RISK_KEYWORD','QUALITY_RULE_BLOCKED','NEGATIVE_FEEDBACK_THRESHOLD','HUMAN_TAKEOVER_ACTIVE','CONVERSATION_PAUSED']);
  const riskBlocked = (reasons.rows || []).reduce((sum, row) => riskBlockedReasons.has(row.reason) ? sum + Number(row.count || 0) : sum, 0);
  const minutesSaved = Math.round((sentWindowCount * secondsPerReply) / 60);
  const thbSaved = Math.round((minutesSaved / 60) * hourlyCost);
  return {
    window: { days: windowDays, seconds_per_reply: secondsPerReply, hourly_cost_thb: hourlyCost },
    sent_24h: Number(sent24.rows?.[0]?.count || 0),
    sent_7d: Number(sent7.rows?.[0]?.count || 0),
    sent_window: sentWindowCount,
    skipped_24h: Number(skipped24.rows?.[0]?.count || 0),
    skipped_7d: Number(skipped7.rows?.[0]?.count || 0),
    skipped_window: skippedWindowCount,
    estimated: { minutes_saved_30d: minutesSaved, thb_saved_30d: thbSaved, replies_saved: sentWindowCount },
    performance: {
      auto_reply_rate_percent: totalWindow ? Math.round((sentWindowCount / totalWindow) * 100) : 0,
      playbook_coverage_percent: sentWindowCount ? Math.round((playbookSent / sentWindowCount) * 100) : 0,
    },
    safety: { risk_blocked_window: riskBlocked, active_pauses: Number(activePauses.rows?.[0]?.count || 0) },
    quality: { good: Number(quality.good || 0), bad: Number(quality.bad || 0), wrong_price: Number(quality.wrong_price || 0), active_rules: Number(activeRules.rows?.[0]?.count || 0) },
    active_playbooks: Number(activePlaybooks.rows?.[0]?.count || 0),
    pending_suggestions: Number(pendingSuggestions.rows?.[0]?.count || 0),
    skipped_reasons: reasons.rows || [],
    sent_by_intent: intents.rows || [],
    playbook_usage: playbookUsage.rows || [],
  };
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


  router.get("/admin/ai-office/control/line-conversations", requireAdminSession, async (req, res) => {
    try {
      const conversations = await listLineConversations(pool, { limit: req.query.limit || 60 });
      return res.json({ ok:true, conversations, counts:{ total: conversations.length } });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_LINE_CONVERSATIONS_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/line-conversations/:id/thread", requireAdminSession, async (req, res) => {
    try {
      const thread = await getLineThread(pool, req.params.id, { limit: req.query.limit || 40 });
      return res.json({ ok:true, ...thread });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_LINE_THREAD_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/draft-feedback", requireAdminSession, async (req, res) => {
    try {
      const feedback = await saveDraftFeedback(pool, req, req.body || {});
      return res.json({ ok:true, feedback });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_DRAFT_FEEDBACK_FAILED" });
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

  router.get("/admin/ai-office/control/auto-safe/playbooks", requireAdminSession, async (req, res) => {
    try {
      const playbooks = await listAutoSafePlaybooks(pool, { activeOnly: req.query.active_only === "true", limit: req.query.limit || 120 });
      const counts = playbooks.reduce((acc, item) => { acc.total += 1; if (item.is_active) acc.active += 1; acc.by_intent[item.intent] = (acc.by_intent[item.intent] || 0) + 1; return acc; }, { total:0, active:0, by_intent:{} });
      return res.json({ ok:true, playbooks, counts });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AUTO_SAFE_PLAYBOOKS_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/playbooks", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const playbook = await upsertAutoSafePlaybook(pool, req.body || {}, adminUser);
      return res.json({ ok:true, playbook });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_AUTO_SAFE_PLAYBOOK_FAILED" });
    }
  });

  router.patch("/admin/ai-office/control/auto-safe/playbooks/:id", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const playbook = await upsertAutoSafePlaybook(pool, { ...(req.body || {}), id:req.params.id }, adminUser);
      return res.json({ ok:true, playbook });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "UPDATE_AUTO_SAFE_PLAYBOOK_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/playbooks/:id/disable", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const r = await pool.query(`UPDATE public.ai_auto_safe_reply_playbooks SET is_active=false, approved_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [Number(req.params.id || 0), cleanText(adminUser,160)]);
      return res.json({ ok:true, playbook:normalizePlaybookRow(r.rows?.[0]) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "DISABLE_AUTO_SAFE_PLAYBOOK_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/auto-safe/quality", requireAdminSession, async (_req, res) => {
    try {
      const quality = await getAutoSafeQualitySummary(pool);
      return res.json({ ok:true, quality });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AUTO_SAFE_QUALITY_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/logs/:id/feedback", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const feedback = await saveAutoSafeQualityFeedback(pool, req.params.id, req.body || {}, adminUser);
      const quality = await getAutoSafeQualitySummary(pool).catch(()=>null);
      return res.json({ ok:true, feedback, quality });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "SAVE_AUTO_SAFE_QUALITY_FEEDBACK_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/auto-safe/logs", requireAdminSession, async (req, res) => {
    try {
      const logs = await listAutoSafeReplyLogs(pool, req.query.limit || 40);
      const counts = logs.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, { total: logs.length });
      return res.json({ ok:true, logs, counts });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AUTO_SAFE_REPLY_LOGS_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/auto-safe/conversation/:id/pause", requireAdminSession, async (req, res) => {
    try {
      const pause = await getConversationPause(pool, req.params.id);
      return res.json({ ok:true, pause, paused:Boolean(pause) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "LOAD_AUTO_SAFE_CONVERSATION_PAUSE_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/conversation/:id/pause", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const pause = await pauseAutoSafeConversation(pool, req.params.id, req.body || {}, adminUser);
      return res.json({ ok:true, pause });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "PAUSE_AUTO_SAFE_CONVERSATION_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/conversation/:id/resume", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const pause = await resumeAutoSafeConversation(pool, req.params.id, adminUser);
      return res.json({ ok:true, pause });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "RESUME_AUTO_SAFE_CONVERSATION_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/test", requireAdminSession, async (req, res) => {
    try {
      const values = await getControlValues(pool);
      const customerMessage = cleanText(req.body?.customer_message || req.body?.message || "", 5000);
      if (!customerMessage) return res.status(400).json({ ok:false, error:"CUSTOMER_MESSAGE_REQUIRED" });
      const safety = decideReplySafety(customerMessage, values);
      const gate = autoSafeGate(customerMessage, safety, values);
      const playbookMatch = gate.ok ? await selectAutoSafePlaybook(pool, customerMessage, safety, values) : { matched:false, reason:"GATE_BLOCKED" };
      const replyText = gate.ok && playbookMatch.matched ? renderPlaybookReply(playbookMatch.playbook, customerMessage, safety, values) : (gate.ok && !boolValue(values.auto_safe_playbook_required, true) ? applyCustomerReplyTone(buildSafeRecommendedReply(customerMessage, safety), values) : "");
      return res.json({ ok:true, safety, gate, playbook:playbookMatch, reply_text: replyText });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "AUTO_SAFE_TEST_FAILED" });
    }
  });

  router.get("/admin/ai-office/control/auto-safe/playbook-analytics", requireAdminSession, async (_req, res) => {
    try {
      const values = await getControlValues(pool);
      const analytics = await getAutoSafePlaybookAnalytics(pool, values);
      return res.json({ ok:true, analytics });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "AUTO_SAFE_PLAYBOOK_ANALYTICS_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/playbook-suggestions/generate", requireAdminSession, async (_req, res) => {
    try {
      const values = await getControlValues(pool);
      const suggestions = await generateAutoSafePlaybookSuggestions(pool, values);
      const analytics = await getAutoSafePlaybookAnalytics(pool, values).catch(()=>null);
      return res.json({ ok:true, suggestions, analytics });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "GENERATE_PLAYBOOK_SUGGESTIONS_FAILED" });
    }
  });

  router.patch("/admin/ai-office/control/auto-safe/playbook-suggestions/:id", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const suggestion = await updateAutoSafePlaybookSuggestionReview(pool, req.params.id, req.body || {}, adminUser);
      const analytics = await getAutoSafePlaybookAnalytics(pool, await getControlValues(pool)).catch(()=>null);
      return res.json({ ok:true, suggestion, analytics });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "UPDATE_PLAYBOOK_SUGGESTION_REVIEW_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/playbook-suggestions/:id/approve", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const result = await approveAutoSafePlaybookSuggestion(pool, req.params.id, adminUser, req.body || {});
      const analytics = await getAutoSafePlaybookAnalytics(pool, await getControlValues(pool)).catch(()=>null);
      return res.json({ ok:true, ...result, analytics });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "APPROVE_PLAYBOOK_SUGGESTION_FAILED" });
    }
  });

  router.post("/admin/ai-office/control/auto-safe/playbook-suggestions/:id/dismiss", requireAdminSession, async (req, res) => {
    try {
      const adminUser = req.session?.user?.username || req.session?.user?.email || req.session?.username || "";
      const suggestion = await dismissAutoSafePlaybookSuggestion(pool, req.params.id, adminUser);
      const analytics = await getAutoSafePlaybookAnalytics(pool, await getControlValues(pool)).catch(()=>null);
      return res.json({ ok:true, suggestion, analytics });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "DISMISS_PLAYBOOK_SUGGESTION_FAILED" });
    }
  });


  router.get("/admin/ai-office/control/auto-safe/dashboard", requireAdminSession, async (_req, res) => {
    try {
      const values = await getControlValues(pool);
      const dashboard = await getAutoSafeDashboard(pool, values);
      return res.json({ ok:true, dashboard });
    } catch (e) {
      return res.status(e.status || 500).json({ ok:false, error:e.message || "AUTO_SAFE_DASHBOARD_FAILED" });
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
      const autoSafeSent = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='sent' AND created_at > NOW() - INTERVAL '24 hours'`, [], { rows:[{ count:0 }] });
      const autoSafeSkipped = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_logs WHERE status='skipped' AND created_at > NOW() - INTERVAL '24 hours'`, [], { rows:[{ count:0 }] });
      const activePlaybooks = await queryOptional(pool, `SELECT COUNT(*)::int AS count FROM public.ai_auto_safe_reply_playbooks WHERE is_active=true`, [], { rows:[{ count:0 }] });
      const dashboard = await getAutoSafeDashboard(pool, values).catch(()=>null);
      return res.json({
        ok:true,
        mode: boolValue(values.kill_switch, false) ? "KILL_SWITCH" : (boolValue(values.draft_reply_enabled, true) ? "DRAFT_ONLY" : "OFF"),
        auto_send_line_enabled: false,
        auto_safe_reply_send_enabled: boolValue(values.auto_safe_reply_send_enabled, false),
        admin_approved_line_send_enabled: boolValue(values.admin_approved_line_send_enabled, false),
        approval_queue_enabled: boolValue(values.approval_queue_enabled, true),
        settings,
        values,
        counts:{
          pending_drafts: Number(drafts.rows?.[0]?.count || 0),
          pending_approvals: Number(approvals.rows?.[0]?.count || 0),
          open_intakes: Number(intakes.rows?.[0]?.count || 0),
          reply_decisions_7d: Number(decisions.rows?.[0]?.count || 0),
          auto_safe_sent_24h: Number(autoSafeSent.rows?.[0]?.count || 0),
          auto_safe_skipped_24h: Number(autoSafeSkipped.rows?.[0]?.count || 0),
          auto_safe_active_playbooks: Number(activePlaybooks.rows?.[0]?.count || 0)
        },
        auto_safe_dashboard: dashboard,
        line:{
          latest_message_at: latestLine.rows?.[0]?.latest || null,
          webhook_ready: true,
          channel_secret_configured: Boolean(String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim()),
          channel_access_token_configured: Boolean(String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim())
        },
        openai:{
          configured: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
          model: String(process.env.AI_OFFICE_MODEL || "gpt-4.1-mini").trim() || "gpt-4.1-mini"
        },
        reply_control:{
          ai_office_enabled_ignored_for_reply: true,
          kill_switch_controls_reply_only: true,
          auto_safe_reply_send_enabled: boolValue(values.auto_safe_reply_send_enabled, false),
          auto_safe_allowed_intents: Array.from(AUTO_SAFE_ALLOWED_INTENTS),
          auto_safe_confidence_threshold: Number(values.auto_safe_reply_confidence_threshold || 85),
          auto_safe_human_takeover_minutes: Number(values.auto_safe_human_takeover_minutes || 60),
          auto_safe_quiet_hours_enabled: boolValue(values.auto_safe_reply_quiet_hours_enabled, false),
          auto_safe_playbook_enabled: boolValue(values.auto_safe_playbook_enabled, true),
          auto_safe_playbook_required: boolValue(values.auto_safe_playbook_required, true)
        },
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
createAdminAiOfficeControlCenterRoutes.handleAutoSafeLineReplyFromWebhook = handleAutoSafeLineReplyFromWebhook;
module.exports = createAdminAiOfficeControlCenterRoutes;
