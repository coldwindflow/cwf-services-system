const express = require("express");

const BANGKOK_TZ = "Asia/Bangkok";
const DEFAULT_WORK_START = "09:00";
const DEFAULT_WORK_END = "18:00";
const DEFAULT_JOB_MINUTES = 120;
const TRAVEL_BUFFER_MINUTES = 30;

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}
function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}
function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}
function pad(n) { return String(n).padStart(2, "0"); }

function bangkokDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: BANGKOK_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}
function addDaysYmd(ymd, days) {
  const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days, 0, 0, 0));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function ymdString(ymd) { return `${ymd.y}-${pad(ymd.m)}-${pad(ymd.d)}`; }
function thaiDateLabel(ymd, text) {
  if (/พรุ่งนี้/.test(text)) return `พรุ่งนี้ (${ymd.d}/${ymd.m}/${ymd.y + 543})`;
  if (/วันนี้/.test(text) || !/พรุ่งนี้|มะรืน/.test(text)) return `วันนี้ (${ymd.d}/${ymd.m}/${ymd.y + 543})`;
  return `${ymd.d}/${ymd.m}/${ymd.y + 543}`;
}
function parseTargetDate(question) {
  const q = String(question || "");
  let ymd = bangkokDateParts(new Date());
  if (/พรุ่งนี้|tomorrow/i.test(q)) ymd = addDaysYmd(ymd, 1);
  else if (/มะรืน/.test(q)) ymd = addDaysYmd(ymd, 2);
  return { ymd, iso: ymdString(ymd), label: thaiDateLabel(ymd, q) };
}
function parseTimeToMinutes(str) {
  const s = String(str || "").trim();
  const m = s.match(/(\d{1,2})(?::|\.|：)?(\d{2})?/);
  if (!m) return null;
  let h = Number(m[1]);
  const mm = Number(m[2] || 0);
  if (/บ่าย/.test(s) && h < 12) h += 12;
  if (/เย็น/.test(s) && h < 12) h += 12;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}
function parseTimeConstraint(question) {
  const q = String(question || "");
  if (/หลังบ่าย\s*2|หลัง\s*14|หลัง\s*บ่ายสอง|หลัง\s*2\s*โมง/i.test(q)) return { type: "after", minutes: 14 * 60, label: "หลัง 14:00 น." };
  if (/บ่าย\s*2|14[:.]?00|14\s*น/.test(q)) return { type: "around_or_after", minutes: 14 * 60, label: "ตั้งแต่ 14:00 น." };
  if (/หลังบ่าย\s*3|หลัง\s*15/i.test(q)) return { type: "after", minutes: 15 * 60, label: "หลัง 15:00 น." };
  if (/หลังบ่าย\s*4|หลัง\s*16|ตอนเย็น|เย็น/i.test(q)) return { type: "after", minutes: 16 * 60, label: "ช่วงเย็น / หลัง 16:00 น." };
  if (/หลัง\s*17|หลัง\s*5\s*โมง/i.test(q)) return { type: "after", minutes: 17 * 60, label: "หลัง 17:00 น." };
  if (/ก่อนเที่ยง|ช่วงเช้า|เช้า/i.test(q)) return { type: "before", minutes: 12 * 60, label: "ช่วงเช้าก่อน 12:00 น." };
  const after = q.match(/หลัง\s*(\d{1,2})(?:[:.](\d{2}))?/i);
  if (after) {
    const mins = parseTimeToMinutes(after[0]);
    if (mins !== null) return { type: "after", minutes: mins, label: `หลัง ${formatMins(mins)} น.` };
  }
  return { type: "any", minutes: null, label: "ทั้งวัน" };
}
function formatMins(mins) {
  mins = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}
function isAvailabilityQuestion(question) {
  const q = String(question || "");
  return /(คิว|ว่าง|เต็ม|ช่าง|นัด|เวลา|หลังบ่าย|หลัง\s*\d|วันนี้|พรุ่งนี้|รับงาน|เพิ่มงาน|เช็คคิว|เช็กคิว)/i.test(q);
}
function isCorrectionQuestion(question) {
  const q = String(question || "").toLowerCase();
  return /(ผิด|ไม่ใช่|อย่าบอก|ห้ามบอก|ยังว่าง|ยังไม่ควร|ควรตอบ|ต้องตอบ|จำไว้|คราวหน้า|งง|มั่ว|โง่|ไม่ตรง|ตอบผิด)/.test(q);
}
function correctionSituation(question) {
  const q = String(question || "").toLowerCase();
  if (/(คิว|ว่าง|ช่าง|เวลา|บ่าย|เช้า|เย็น|นัด|เต็ม)/.test(q)) return "availability_logic";
  if (/(ราคา|แพง|ส่วนลด|โปร)/.test(q)) return "sales_reply_logic";
  if (/(ลูกค้า|แชท|ตอบ|line|ไลน์)/.test(q)) return "customer_reply_style";
  return "admin_correction";
}
function normalizeTechName(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9ก-๙]/g, "");
}
function isLikelyPhone(value) {
  const d = onlyDigits(value);
  return d.length >= 8;
}
function splitTechs(row) {
  const vals = [];
  [row.technician_username, row.technician_team, row.technician_name, row.assigned_technicians].forEach((v) => {
    String(v || "").split(/[,|/、\s]+/).forEach((x) => {
      const t = cleanText(x, 80);
      if (t && !isLikelyPhone(t) && !/^[-–—]+$/.test(t)) vals.push(t);
    });
  });
  return Array.from(new Set(vals));
}
function extractRequestedTech(question) {
  const q = cleanText(question, 500);
  const m = q.match(/ช่าง\s*([A-Za-z0-9ก-๙._-]{2,30})/);
  if (m) return `ช่าง${m[1]}`.replace(/\s+/g, "");
  return "";
}
function estimateDuration(row) {
  const explicit = Number(row.duration_min || row.estimated_duration_min || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const text = `${row.job_type || ""} ${row.item_summary || ""}`.toLowerCase();
  if (/ตัดล้าง/.test(text)) return 180;
  if (/แขวนคอยล์|แขวนคอย/.test(text)) return 120;
  if (/พรีเมียม/.test(text)) return 90;
  if (/ติดตั้ง/.test(text)) return 180;
  if (/ซ่อม/.test(text)) return 120;
  return DEFAULT_JOB_MINUTES;
}
function toBangkokMinutes(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: BANGKOK_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}
function hasDoneOrCanceled(row) {
  const s = `${row.job_status || ""} ${row.close_payment_status || ""}`.toLowerCase();
  return /ยกเลิก|cancel/.test(s);
}

async function ensureSharedMemorySchema(pool) {
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
}
async function logMemory(pool, req, body = {}) {
  try {
    await ensureSharedMemorySchema(pool);
    await pool.query(`
      INSERT INTO public.ai_memory_events(source,event_type,agent_key,conversation_id,selected_customer_question,customer_message,ai_reply,final_admin_reply,action_status,situation_type,service_type,tags,created_by,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb)
    `, [
      body.source || "smart_assistant",
      body.event_type || "event",
      body.agent_key || "admin",
      body.conversation_id || null,
      body.selected_customer_question || "",
      body.customer_message || "",
      body.ai_reply || "",
      body.final_admin_reply || "",
      body.action_status || body.event_type || "",
      body.situation_type || "general",
      body.service_type || "",
      JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      getAdminUser(req),
      JSON.stringify(body.metadata || {}),
    ]);
  } catch (_) {}
}

async function loadDayJobs(pool, isoDate) {
  const r = await pool.query(`
    SELECT
      j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, j.payment_status, j.job_price,
      j.address_text, j.job_zone, j.technician_username, j.technician_team,
      j.duration_min, j.created_at, j.finished_at, j.paid_at, j.close_payment_status,
      COALESCE(
        STRING_AGG(
          DISTINCT NULLIF(CONCAT_WS(' ', ji.item_name, NULLIF(ji.qty::text,''), NULLIF(ji.line_total::text,'')), ''),
          ' | '
        ) FILTER (WHERE ji.job_id IS NOT NULL),
        ''
      ) AS item_summary
    FROM public.jobs j
    LEFT JOIN public.job_items ji ON CAST(ji.job_id AS TEXT)=CAST(j.job_id AS TEXT)
    WHERE j.appointment_datetime IS NOT NULL
      AND (
        (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $1::date
        OR j.appointment_datetime::date = $1::date
      )
    GROUP BY j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, j.payment_status, j.job_price, j.address_text,
      j.job_zone, j.technician_username, j.technician_team, j.duration_min, j.created_at,
      j.finished_at, j.paid_at, j.close_payment_status
    ORDER BY j.appointment_datetime ASC NULLS LAST, j.job_id ASC
  `, [isoDate]);
  return (r.rows || []).filter((row) => !hasDoneOrCanceled(row));
}

function buildBusySlots(jobs) {
  const busyByTech = new Map();
  const all = [];
  jobs.forEach((row) => {
    const start = toBangkokMinutes(row.appointment_datetime);
    if (start === null) return;
    const duration = estimateDuration(row);
    const end = start + duration + TRAVEL_BUFFER_MINUTES;
    const techs = splitTechs(row);
    const slot = {
      job_id: row.job_id,
      start,
      end,
      start_display: formatMins(start),
      end_display: formatMins(end),
      duration_min: duration,
      buffer_min: TRAVEL_BUFFER_MINUTES,
      job_type: row.job_type || "",
      item_summary: row.item_summary || "",
      technician_names: techs,
      customer_name: row.customer_name || "",
      customer_phone: row.customer_phone || "",
      raw: row,
    };
    all.push(slot);
    const names = techs.length ? techs : ["ไม่ระบุช่าง"];
    names.forEach((name) => {
      const key = normalizeTechName(name || "ไม่ระบุช่าง");
      if (!busyByTech.has(key)) busyByTech.set(key, { name, slots: [] });
      busyByTech.get(key).slots.push(slot);
    });
  });
  busyByTech.forEach((v) => v.slots.sort((a, b) => a.start - b.start));
  return { busyByTech, all };
}

function computeGaps(busySlots, constraint) {
  const dayStart = parseTimeToMinutes(DEFAULT_WORK_START);
  const dayEnd = parseTimeToMinutes(DEFAULT_WORK_END);
  let windowStart = dayStart;
  let windowEnd = dayEnd;
  if (constraint.type === "after" || constraint.type === "around_or_after") windowStart = Math.max(windowStart, constraint.minutes);
  if (constraint.type === "before") windowEnd = Math.min(windowEnd, constraint.minutes);

  const merged = [];
  busySlots
    .map((s) => ({ start: Math.max(s.start, dayStart), end: Math.min(s.end, dayEnd), ref: s }))
    .filter((s) => s.end > dayStart && s.start < dayEnd)
    .sort((a, b) => a.start - b.start)
    .forEach((s) => {
      if (!merged.length || s.start > merged[merged.length - 1].end) merged.push({ start: s.start, end: s.end, refs: [s.ref] });
      else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, s.end);
        merged[merged.length - 1].refs.push(s.ref);
      }
    });

  const gaps = [];
  let cursor = windowStart;
  merged.forEach((b) => {
    if (b.end <= windowStart || b.start >= windowEnd) return;
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, windowEnd) });
    cursor = Math.max(cursor, b.end);
  });
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });
  return gaps
    .filter((g) => g.end > g.start)
    .map((g) => ({ ...g, start_display: formatMins(g.start), end_display: formatMins(g.end), minutes: g.end - g.start }));
}

function analyzeAvailability({ jobs, question }) {
  const dateInfo = parseTargetDate(question);
  const constraint = parseTimeConstraint(question);
  const requestedTech = extractRequestedTech(question);
  const requestedNorm = normalizeTechName(requestedTech);
  const { busyByTech, all } = buildBusySlots(jobs);
  const techRows = Array.from(busyByTech.values()).filter((v) => v.name && v.name !== "ไม่ระบุช่าง");
  const targetTechs = requestedNorm
    ? techRows.filter((v) => normalizeTechName(v.name).includes(requestedNorm.replace(/^ช่าง/, "")) || requestedNorm.includes(normalizeTechName(v.name)))
    : techRows;

  const analyses = (targetTechs.length ? targetTechs : techRows).map((tech) => ({
    technician: tech.name,
    busy_slots: tech.slots.map((s) => ({
      job_id: s.job_id,
      start: s.start_display,
      end: s.end_display,
      job_type: s.job_type,
      item_summary: s.item_summary,
      duration_min: s.duration_min,
      buffer_min: s.buffer_min,
    })),
    available_slots: computeGaps(tech.slots, constraint).map((g) => ({ start: g.start_display, end: g.end_display, minutes: g.minutes })),
  }));

  const allGaps = computeGaps(all, constraint);
  const hasAnySlot = analyses.some((a) => a.available_slots.some((s) => s.minutes >= 45)) || allGaps.some((s) => s.minutes >= 45);
  return {
    date: dateInfo.iso,
    date_label: dateInfo.label,
    requested_technician: requestedTech || "",
    requested_technician_found: requestedTech ? targetTechs.length > 0 : true,
    time_constraint: constraint,
    total_jobs: jobs.length,
    jobs: all.map((s) => ({ job_id: s.job_id, start: s.start_display, end: s.end_display, job_type: s.job_type, item_summary: s.item_summary, technicians: s.technician_names, customer_phone: s.customer_phone })),
    technicians: analyses,
    overall_available_slots: allGaps.map((g) => ({ start: g.start_display, end: g.end_display, minutes: g.minutes })),
    has_available_slot: hasAnySlot,
    confidence: jobs.some((j) => !Number(j.duration_min || 0)) ? "medium" : "high",
    warning: "คำนวณจากงานในระบบและ buffer เดินทาง 30 นาที ถ้าจะรับงานจริงควรเช็กพื้นที่และจำนวนเครื่องก่อนยืนยันลูกค้า",
  };
}

function answerAvailability(result) {
  const dateText = result.date_label;
  const constraintText = result.time_constraint?.label || "ทั้งวัน";
  const reqTech = result.requested_technician;
  if (reqTech && !result.requested_technician_found) {
    return `${dateText} ยังไม่เจอชื่อ ${reqTech} ในงานที่อ่านได้ค่ะ\n\nจากข้อมูลรวมมีงานนัด ${result.total_jobs} งาน ถ้าจะเช็กช่างคนนี้แบบแม่น ๆ รบกวนตรวจชื่อช่างในระบบอีกทีนะคะ`;
  }

  const target = reqTech ? result.technicians[0] : null;
  const slots = target ? target.available_slots : result.overall_available_slots;
  const goodSlots = (slots || []).filter((s) => s.minutes >= 45);

  if (goodSlots.length) {
    const slotText = goodSlots.slice(0, 3).map((s) => `${s.start}-${s.end} น.`).join(", ");
    if (reqTech) {
      return `${dateText} ${reqTech} ยังมีช่วงที่พอเช็กคิวได้ ${constraintText} คือ ${slotText} ค่ะ\n\nยังไม่ควรสรุปว่าคิวเต็มทันทีนะคะ ก่อนยืนยันลูกค้าแนะนำเช็กพื้นที่ ระยะทาง และจำนวนเครื่องอีกครั้งค่ะ`;
    }
    return `${dateText} ยังมีช่วงที่พอเช็กคิวได้ ${constraintText} คือ ${slotText} ค่ะ\n\nยังไม่ควรบอกลูกค้าว่าคิวเต็มทันทีนะคะ ก่อนยืนยันแนะนำเช็กช่าง พื้นที่ และจำนวนเครื่องอีกครั้งค่ะ`;
  }

  if (reqTech) {
    return `${dateText} ${reqTech} ยังไม่เห็นช่องว่างชัดเจนในช่วง ${constraintText} ค่ะ\n\nถ้าจะรับเพิ่ม แนะนำเช็กเวลาจบงานเดิม ระยะทาง และจำนวนเครื่องก่อน เพราะตอนนี้ข้อมูลยังไม่พอให้ฟันธงว่ารับได้ค่ะ`;
  }
  return `${dateText} ช่วง ${constraintText} ยังไม่เห็นช่องว่างชัดเจนจากงานในระบบค่ะ\n\nแต่ไม่ควรสรุปว่าคิวเต็มจากจำนวนงานอย่างเดียว ต้องดูเวลางาน ช่างที่รับงาน และ buffer เดินทางก่อนค่ะ`;
}

module.exports = function createAdminAiOfficeSmartAssistantV28Routes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeSmartAssistantV28Routes requires pool and requireAdminSession");
  const router = express.Router();

  router.post("/admin/ai-office/ask", requireAdminSession, async (req, res, next) => {
    const question = cleanText(req.body?.question, 2000);
    try {
      if (isCorrectionQuestion(question)) {
        await logMemory(pool, req, {
          source: "agent_chat",
          event_type: "admin_correction",
          agent_key: cleanText(req.body?.agent || "admin", 40),
          customer_message: question,
          final_admin_reply: question,
          action_status: "correction",
          situation_type: correctionSituation(question),
          tags: ["auto_learn", "admin_correction"],
          metadata: { auto_detected: true },
        });
      }

      if (!isAvailabilityQuestion(question)) return next();

      const dateInfo = parseTargetDate(question);
      const jobs = await loadDayJobs(pool, dateInfo.iso);
      const result = analyzeAvailability({ jobs, question });
      const answer = answerAvailability(result);

      await logMemory(pool, req, {
        source: "availability_engine",
        event_type: "availability_answered",
        agent_key: cleanText(req.body?.agent || "admin", 40),
        customer_message: question,
        ai_reply: answer,
        action_status: "answered",
        situation_type: "availability_logic",
        tags: ["deterministic", "availability", "v28"],
        metadata: { availability_result: result },
      });

      return res.json({
        ok: true,
        answer,
        agent: { key: req.body?.agent || "admin", name: "Admin AI", role: "deterministic availability engine" },
        context: { availability_result: result },
      });
    } catch (e) {
      console.error("V28 /admin/ai-office/ask availability error:", e);
      return res.status(e.status || 500).json({ ok: false, error: e.message || "คำนวณคิวช่างไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/availability/analyze", requireAdminSession, async (req, res) => {
    try {
      const question = cleanText(req.body?.question || req.query?.question, 2000);
      const dateInfo = parseTargetDate(question);
      const jobs = await loadDayJobs(pool, dateInfo.iso);
      const result = analyzeAvailability({ jobs, question });
      return res.json({ ok: true, result, answer: answerAvailability(result) });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ANALYZE_AVAILABILITY_FAILED" });
    }
  });

  return router;
};

module.exports.analyzeAvailability = analyzeAvailability;
module.exports.parseTimeConstraint = parseTimeConstraint;
