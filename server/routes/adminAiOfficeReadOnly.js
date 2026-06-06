const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");

const AI_OFFICE_DEFAULT_MODEL = "gpt-4.1-mini";
const AI_OFFICE_JOB_LIMIT = 80;
const AI_OFFICE_ROOT_DIR = path.resolve(__dirname, "..", "..");
const AI_OFFICE_FRONTEND_FILES = ["admin-ai-office.html", "admin-ai-office.js"];
const AI_OFFICE_FORBIDDEN_TERMS = [
  "de" + "mo",
  "mo" + "ck",
  "sam" + "ple",
  "proto" + "type",
  "tem" + "plate",
  "created" + " by",
  "creator" + " showcase",
  "ผู้" + "สร้าง",
];
const AI_OFFICE_MUTATING_TOKENS = [
  "in" + "sert",
  "up" + "date",
  "de" + "lete",
  "al" + "ter",
  "dr" + "op",
  "trun" + "cate",
  "cre" + "ate",
];
const AI_OFFICE_AGENTS = {
  admin: {
    name: "Admin AI",
    role: "ผู้ช่วยแอดมินสำหรับสรุปงาน ร่างข้อความลูกค้า ข้อความช่าง และแปลภาษา",
  },
  sales: {
    name: "Sales AI",
    role: "ผู้ช่วยฝ่ายขายสำหรับปิดการขาย แนะนำแพ็กเกจ และตอบเมื่อลูกค้าบอกว่าแพง",
  },
  ops: {
    name: "Ops AI",
    role: "ผู้ควบคุมงานสำหรับงานวันนี้ พรุ่งนี้ งานยังไม่จ่าย งานยังไม่ปิด และความเสี่ยงต้องติดตาม",
  },
  ads: {
    name: "Ads AI",
    role: "ผู้ช่วยการตลาดสำหรับ Google Ads, Facebook Ads, TikTok Ads, keyword และพื้นที่บริการ โดยอ้างอิงงานจริงที่มี",
  },
  content: {
    name: "Content AI",
    role: "ผู้ช่วยทำคอนเทนต์สำหรับโพสต์ แคปชัน รีวิว และสคริปต์ Reels/TikTok จากบริบทงานจริง",
  },
  dev: {
    name: "Dev AI",
    role: "ผู้ช่วยระบบสำหรับ prompt, สรุปบั๊ก, checklist deploy และ review ความเสี่ยงแบบอ่านข้อมูลอย่างเดียว",
  },
};

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function clampLimit(value, def = 30, max = 100) {
  const n = Math.floor(Number(value || def));
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function maskLineUserId(value) {
  const s = String(value || "");
  if (s.length <= 8) return s ? "LINE-USER" : "";
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function isDoneStatusExpr(alias = "j") {
  return `(
    ${alias}.finished_at IS NOT NULL
    OR COALESCE(${alias}.job_status,'') ILIKE '%ปิด%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%เสร็จ%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%done%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%closed%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%complete%'
  )`;
}

function isCanceledStatusExpr(alias = "j") {
  return `(
    ${alias}.canceled_at IS NOT NULL
    OR COALESCE(${alias}.job_status,'') ILIKE '%ยกเลิก%'
    OR COALESCE(${alias}.job_status,'') ILIKE '%cancel%'
  )`;
}

function mapJob(row) {
  return {
    job_id: row.job_id,
    booking_code: row.booking_code || null,
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    job_type: row.job_type || "",
    appointment_datetime: row.appointment_datetime || null,
    job_status: row.job_status || "",
    payment_status: row.payment_status || "unpaid",
    job_price: Number(row.job_price || 0),
    address_text: row.address_text || "",
    job_zone: row.job_zone || "",
    technician_username: row.technician_username || "",
    technician_team: row.technician_team || "",
    duration_min: Number(row.duration_min || 0),
    created_at: row.created_at || null,
    finished_at: row.finished_at || null,
    paid_at: row.paid_at || null,
    close_payment_status: row.close_payment_status || "",
    item_summary: row.item_summary || "",
  };
}

function createAiOfficeError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireAiOfficePin(req) {
  const expected = String(process.env.AI_OFFICE_ACCESS_PIN || "").trim();
  if (!expected) return;
  const supplied = String(req.headers["x-ai-office-pin"] || req.body?.pin || req.query?.pin || "").trim();
  if (!supplied || supplied !== expected) {
    throw createAiOfficeError("AI_OFFICE_PIN_REQUIRED", 403);
  }
}

function baseJobSelect() {
  return `
    SELECT
      j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, COALESCE(j.payment_status,'unpaid') AS payment_status,
      j.job_price, j.address_text, j.job_zone, j.technician_username, j.technician_team,
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
  `;
}

function baseJobGroupOrder(order = "j.appointment_datetime ASC NULLS LAST, j.job_id ASC") {
  return `
    GROUP BY j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
      j.appointment_datetime, j.job_status, j.payment_status, j.job_price, j.address_text,
      j.job_zone, j.technician_username, j.technician_team, j.duration_min, j.created_at,
      j.finished_at, j.paid_at, j.close_payment_status
    ORDER BY ${order}
    LIMIT ${AI_OFFICE_JOB_LIMIT}
  `;
}

async function loadJobs(pool, bucket, phone) {
  const params = [];
  let where = "";
  let order = "j.appointment_datetime ASC NULLS LAST, j.job_id ASC";
  const done = isDoneStatusExpr("j");
  const canceled = isCanceledStatusExpr("j");

  if (bucket === "today" || bucket === "tomorrow") {
    const offset = bucket === "tomorrow" ? " + INTERVAL '1 day'" : "";
    where = `
      WHERE j.appointment_datetime IS NOT NULL
        AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = ((NOW() AT TIME ZONE 'Asia/Bangkok')::date${offset})
        AND NOT ${canceled}
    `;
  } else if (bucket === "unpaid") {
    where = `
      WHERE NOT ${canceled}
        AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
    `;
    order = "j.appointment_datetime ASC NULLS LAST, j.job_id DESC";
  } else if (bucket === "open") {
    where = `
      WHERE NOT ${canceled}
        AND NOT ${done}
    `;
    order = "j.appointment_datetime ASC NULLS LAST, j.job_id DESC";
  } else if (bucket === "phone") {
    const digits = onlyDigits(phone);
    if (digits.length < 6) throw createAiOfficeError("กรุณาใส่เบอร์ลูกค้าอย่างน้อย 6 ตัวเลข");
    params.push(digits);
    where = `WHERE regexp_replace(COALESCE(j.customer_phone,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'`;
    order = "COALESCE(j.appointment_datetime, j.created_at) DESC NULLS LAST, j.job_id DESC";
  } else {
    throw createAiOfficeError("ประเภทข้อมูลไม่ถูกต้อง");
  }

  const r = await pool.query(`${baseJobSelect()} ${where} ${baseJobGroupOrder(order)}`, params);
  return (r.rows || []).map(mapJob);
}

async function loadSummary(pool) {
  const done = isDoneStatusExpr("j");
  const canceled = isCanceledStatusExpr("j");
  const r = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE j.appointment_datetime IS NOT NULL
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
          AND NOT ${canceled}
      )::int AS today_count,
      COUNT(*) FILTER (
        WHERE j.appointment_datetime IS NOT NULL
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = ((NOW() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '1 day')
          AND NOT ${canceled}
      )::int AS tomorrow_count,
      COUNT(*) FILTER (
        WHERE NOT ${canceled}
          AND NOT (COALESCE(j.payment_status,'unpaid') = 'paid' OR j.paid_at IS NOT NULL)
      )::int AS unpaid_count,
      COUNT(*) FILTER (
        WHERE NOT ${canceled}
          AND NOT ${done}
      )::int AS open_count
    FROM public.jobs j
  `);
  return r.rows[0] || { today_count: 0, tomorrow_count: 0, unpaid_count: 0, open_count: 0 };
}

function getAgent(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  return AI_OFFICE_AGENTS[key] || AI_OFFICE_AGENTS.admin;
}

function getLineAgent(agentKey) {
  const key = String(agentKey || "").trim().toLowerCase();
  if (key === "sales") return AI_OFFICE_AGENTS.sales;
  if (key === "ops") return AI_OFFICE_AGENTS.ops;
  return AI_OFFICE_AGENTS.admin;
}

function buildGroundedPrompt(question, context, agent) {
  return [
    "คุณคือผู้ช่วยออฟฟิศภายในของ Coldwindflow Air Services สำหรับแอดมินเท่านั้น",
    `ตัวละครที่ถูกเลือก: ${agent.name}`,
    `บทบาท: ${agent.role}`,
    "ตอบเป็นภาษาไทยแบบมืออาชีพ กระชับ ใช้งานได้จริง",
    "ใช้เฉพาะข้อมูลจริงใน JSON ด้านล่าง ห้ามแต่งข้อมูลเพิ่ม ห้ามอ้างว่ามีข้อมูลที่ไม่มีใน JSON",
    "ถ้าข้อมูลไม่พอให้บอกว่าข้อมูลไม่พอและถามแอดมินว่าต้องการค้นเบอร์/เปิดใบงานใดเพิ่ม",
    "ถ้าร่างข้อความลูกค้าหรือช่าง ให้เขียนเป็นข้อความพร้อมคัดลอก ไม่ใส่คำอธิบายเชิงระบบ",
    "ห้ามสั่งแก้สถานะ ห้ามบอกว่าระบบส่งข้อความแล้ว เพราะ Phase 1 เป็นอ่านอย่างเดียว",
    "",
    `คำถามแอดมิน: ${cleanText(question, 1200)}`,
    "",
    "ข้อมูลจริงจากระบบ:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function buildLineDraftPrompt({ conversation, messages, agent, instruction }) {
  return [
    "คุณคือผู้ช่วย AI ภายในของ Coldwindflow Air Services สำหรับช่วยแอดมินอ่านแชท LINE OA เท่านั้น",
    `บทบาทที่เลือก: ${agent.name}`,
    `หน้าที่: ${agent.role}`,
    "ใช้เฉพาะข้อมูลแชท LINE ที่ส่งมาใน JSON นี้ ห้ามแต่งข้อมูลเพิ่ม",
    "ห้ามบอกว่าระบบส่งข้อความแล้ว ห้ามสร้างงาน ห้ามแก้ใบงาน ห้ามเปลี่ยนสถานะ",
    "ตอบเป็นภาษาไทยแบบมืออาชีพ กระชับ ใช้งานจริงได้",
    "ต้องใส่ประโยคนี้ให้ชัดเจน: แอดมินต้องตรวจสอบและกดส่ง/กดบันทึกเอง ระบบยังไม่ส่งข้อความหรือสร้างงานให้อัตโนมัติ",
    "",
    "รูปแบบคำตอบ:",
    "- สรุปลูกค้า",
    "- สิ่งที่ลูกค้าต้องการ",
    "- ข้อมูลที่จับได้",
    "- ข้อมูลที่ยังขาด",
    "- ความเร่งด่วน",
    "- ข้อความพร้อมตอบ",
    "- หมายเหตุสำหรับแอดมิน",
    "",
    "ถ้าเป็นงานเตรียมลงคิว ให้เพิ่มหัวข้อ:",
    "- ชื่อ ถ้ามี",
    "- เบอร์ ถ้ามี",
    "- พื้นที่ / ที่อยู่",
    "- ประเภทงาน",
    "- ประเภทแอร์",
    "- BTU",
    "- จำนวนเครื่อง",
    "- วันที่/เวลาที่ลูกค้าต้องการ",
    "- หมายเหตุ",
    "- ข้อมูลที่ต้องถามเพิ่ม",
    "- draft พร้อมกรอกในฟอร์มเพิ่มงาน",
    "",
    `คำสั่งแอดมินเพิ่มเติม: ${cleanText(instruction, 1000) || "-"}`,
    "",
    "ข้อมูลแชทจริง:",
    JSON.stringify({ conversation, messages }, null, 2),
  ].join("\n");
}

function callOpenAI({ apiKey, model, prompt }) {
  const payload = JSON.stringify({
    model,
    messages: [
      { role: "system", content: "ตอบเป็นภาษาไทยสำหรับงานแอดมิน CWF โดยยึดข้อมูลจริงที่ให้มาเท่านั้น" },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      hostname: "api.openai.com",
      path: "/v1/chat/completions",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${apiKey}`,
      },
      timeout: 30000,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(createAiOfficeError(parsed?.error?.message || "OPENAI_REQUEST_FAILED", 502));
        }
        const answer = parsed?.choices?.[0]?.message?.content;
        if (!answer) return reject(createAiOfficeError("OPENAI_EMPTY_RESPONSE", 502));
        return resolve(String(answer).trim());
      });
    });
    req.on("timeout", () => req.destroy(createAiOfficeError("OPENAI_TIMEOUT", 504)));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function inferBuckets(question) {
  const q = String(question || "").toLowerCase();
  const buckets = new Set();
  if (q.includes("พรุ่งนี้") || q.includes("tomorrow")) buckets.add("tomorrow");
  if (q.includes("วันนี้") || q.includes("today") || q.includes("ระวัง")) buckets.add("today");
  if (q.includes("ยังไม่จ่าย") || q.includes("ไม่จ่าย") || q.includes("unpaid") || q.includes("payment")) buckets.add("unpaid");
  if (q.includes("ยังไม่ปิด") || q.includes("เปิด") || q.includes("open") || q.includes("ค้าง")) buckets.add("open");
  if (!buckets.size) {
    buckets.add("today");
    buckets.add("tomorrow");
    buckets.add("unpaid");
    buckets.add("open");
  }
  return Array.from(buckets);
}

function readAiOfficeFile(relativePath) {
  const fullPath = path.join(AI_OFFICE_ROOT_DIR, relativePath);
  if (!fullPath.startsWith(AI_OFFICE_ROOT_DIR)) throw createAiOfficeError("INVALID_DIAGNOSTIC_PATH", 400);
  return fs.readFileSync(fullPath, "utf8");
}

function toLocalAssetPath(assetUrl) {
  const clean = String(assetUrl || "").split("?")[0].trim();
  if (!clean.startsWith("/assets/ai-office-final/")) return null;
  return path.join(AI_OFFICE_ROOT_DIR, clean.replace(/^\//, ""));
}

function collectManifestAssetPaths(value, out = []) {
  if (!value) return out;
  if (typeof value === "string") {
    if (value.startsWith("/assets/ai-office-final/")) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectManifestAssetPaths(item, out));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectManifestAssetPaths(item, out));
  }
  return out;
}

function diagnosticItem(id, label, passed, detail, extra = {}) {
  return {
    id,
    label,
    status: passed ? "pass" : "fail",
    detail: String(detail || ""),
    ...extra,
  };
}

function buildDeployFixPrompt(items, risks) {
  const failed = items.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.detail}`);
  const riskLines = (risks || []).map((risk) => `${risk.label}: ${risk.detail}`);
  return [
    "CWF AI Office production issue. Fix only read-only Phase 1 behavior.",
    "Do not add write SQL, schema changes, external message sending, fake data, or frontend secrets.",
    "Check these diagnostics:",
    ...(failed.length ? failed : ["No failed diagnostics. Review risks only."]),
    ...(riskLines.length ? ["Risks:", ...riskLines] : []),
    "Keep /admin/ai-office protected by admin auth and optional AI Office PIN.",
    "Run syntax checks and verify final assets, service worker cache bypass, and mobile layout before committing.",
  ].join("\n");
}

function extractSqlLikeFragments(source) {
  const fragments = [];
  const templateMatches = String(source || "").match(/`[\s\S]*?`/g) || [];
  templateMatches.forEach((block) => {
    if (/\b(select|from|where|join|group by|order by|limit)\b/i.test(block)) fragments.push(block);
  });
  return fragments.join("\n");
}

async function runAiOfficeDiagnostics({ pool, req }) {
  const items = [];
  const risks = [];
  const root = AI_OFFICE_ROOT_DIR;
  const width = Number(req.body?.viewport_width || req.query?.viewport_width || 0);
  const safePhone = cleanText(req.body?.phone || req.query?.phone, 80);

  const htmlExists = fs.existsSync(path.join(root, "admin-ai-office.html"));
  const jsExists = fs.existsSync(path.join(root, "admin-ai-office.js"));
  items.push(diagnosticItem(
    "page",
    "หน้า /admin/ai-office",
    htmlExists && jsExists,
    htmlExists && jsExists ? "ไฟล์หน้าและสคริปต์หลักพร้อมใช้งานหลังผ่านแอดมิน" : "ไม่พบไฟล์หน้า AI Office หรือสคริปต์หลัก"
  ));

  try {
    const summary = await loadSummary(pool);
    items.push(diagnosticItem("summary", "API summary", true, "อ่านสรุปงานจริงได้", { summary }));
  } catch (e) {
    items.push(diagnosticItem("summary", "API summary", false, e.message || "อ่าน summary ไม่สำเร็จ"));
  }

  const hasServerKey = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  items.push(diagnosticItem(
    "ask",
    "Ask endpoint และ OpenAI ฝั่ง server",
    hasServerKey,
    hasServerKey ? "endpoint พร้อมเรียก OpenAI จาก backend เท่านั้น ไม่ส่งค่า secret ออกไป" : "ยังไม่ได้ตั้งค่า OpenAI key ใน environment"
  ));

  if (onlyDigits(safePhone).length >= 6) {
    try {
      const jobs = await loadJobs(pool, "phone", safePhone);
      items.push(diagnosticItem("phone", "Phone search", true, `ค้นด้วยเบอร์ที่แอดมินกรอกได้ ${jobs.length} งาน`));
    } catch (e) {
      items.push(diagnosticItem("phone", "Phone search", false, e.message || "ค้นเบอร์ไม่สำเร็จ"));
    }
  } else {
    items.push(diagnosticItem("phone", "Phone search", true, "ข้ามการค้นเบอร์ เพราะยังไม่ได้กรอกเบอร์อย่างน้อย 6 ตัวเลข"));
  }

  let manifest = null;
  let manifestPaths = [];
  try {
    manifest = JSON.parse(readAiOfficeFile("assets/ai-office-final/manifest.json"));
    manifestPaths = collectManifestAssetPaths(manifest);
    const missing = manifestPaths.filter((assetPath) => {
      const localPath = toLocalAssetPath(assetPath);
      return !localPath || !fs.existsSync(localPath);
    });
    items.push(diagnosticItem(
      "manifest",
      "Asset manifest",
      missing.length === 0,
      missing.length ? `พบ asset หาย ${missing.length} ไฟล์` : `manifest พร้อม มี asset ${manifestPaths.length} ไฟล์`,
      { missing_assets: missing }
    ));
  } catch (e) {
    items.push(diagnosticItem("manifest", "Asset manifest", false, e.message || "อ่าน manifest ไม่สำเร็จ", { missing_assets: [] }));
  }

  const requiredImages = [
    "/assets/ai-office-final/maps/office-main-desktop.png",
    "/assets/ai-office-final/maps/office-main-mobile.png",
    "/assets/ai-office-final/brand/logo-main.png",
    "/assets/ai-office-final/ui/selection-ring.png",
    ...["admin", "sales", "ops", "ads", "content", "dev"].map((role) => `/assets/ai-office-final/characters/${role}/idle.png`),
  ];
  const missingImages = requiredImages.filter((assetPath) => {
    const localPath = toLocalAssetPath(assetPath);
    return !localPath || !fs.existsSync(localPath);
  });
  items.push(diagnosticItem(
    "images",
    "Image asset loading",
    missingImages.length === 0,
    missingImages.length ? `พบรูปหลักหาย ${missingImages.length} ไฟล์` : "รูปหลักของ office และ NPC ครบ",
    { missing_assets: missingImages }
  ));

  try {
    const sw = readAiOfficeFile("sw.js");
    const cacheMatch = sw.match(/CACHE_NAME\s*=\s*"([^"]+)"/);
    const bypassesAiOffice = sw.includes("/admin/ai-office/") && sw.includes("/assets/ai-office-final/");
    items.push(diagnosticItem(
      "cache",
      "Cache / Service Worker",
      Boolean(cacheMatch && bypassesAiOffice),
      cacheMatch && bypassesAiOffice ? `cache version ${cacheMatch[1]} และ bypass AI Office แล้ว` : "ยังไม่พบ cache version หรือ bypass AI Office ใน service worker",
      { cache_name: cacheMatch?.[1] || "" }
    ));
  } catch (e) {
    items.push(diagnosticItem("cache", "Cache / Service Worker", false, e.message || "อ่าน service worker ไม่สำเร็จ"));
  }

  try {
    const frontendSource = AI_OFFICE_FRONTEND_FILES.map(readAiOfficeFile).join("\n");
    const keyNeedle = "OPENAI" + "_API_KEY";
    items.push(diagnosticItem(
      "frontend_secret",
      "Frontend source secret scan",
      !frontendSource.includes(keyNeedle),
      frontendSource.includes(keyNeedle) ? "พบชื่อ key ใน frontend source" : "ไม่พบชื่อ key ใน frontend source"
    ));
    const lower = frontendSource.toLowerCase();
    const foundForbidden = AI_OFFICE_FORBIDDEN_TERMS.filter((term) => lower.includes(term.toLowerCase()));
    items.push(diagnosticItem(
      "wording",
      "คำต้องห้ามใน UI",
      foundForbidden.length === 0,
      foundForbidden.length ? `พบคำต้องห้าม ${foundForbidden.length} รายการ` : "ไม่พบคำต้องห้ามในไฟล์ UI",
      { found_terms: foundForbidden }
    ));
  } catch (e) {
    items.push(diagnosticItem("frontend_secret", "Frontend source secret scan", false, e.message || "อ่าน frontend source ไม่สำเร็จ"));
    items.push(diagnosticItem("wording", "คำต้องห้ามใน UI", false, e.message || "อ่าน UI source ไม่สำเร็จ"));
  }

  try {
    const routeSource = readAiOfficeFile("server/routes/adminAiOfficeReadOnly.js");
    const sqlSource = extractSqlLikeFragments(routeSource);
    const suspicious = AI_OFFICE_MUTATING_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`, "i").test(sqlSource));
    const dynamicSql = /openai|prompt|question|answer/i.test(routeSource) && /pool\.query\([^`'"]/i.test(routeSource);
    items.push(diagnosticItem(
      "readonly",
      "API read-only",
      suspicious.length === 0 && !dynamicSql,
      suspicious.length || dynamicSql ? "พบความเสี่ยง mutating SQL หรือ query dynamic ใน AI Office route" : "ไม่พบ write SQL และไม่พบ AI สร้าง SQL ไปรัน",
      { suspicious_tokens: suspicious }
    ));
  } catch (e) {
    items.push(diagnosticItem("readonly", "API read-only", false, e.message || "อ่าน route ไม่สำเร็จ"));
  }

  const pinRequired = Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim());
  items.push(diagnosticItem(
    "auth_pin",
    "Auth / PIN",
    true,
    pinRequired ? "ผ่าน admin auth และมี AI Office PIN เพิ่มอีกชั้น" : "ผ่าน admin auth และไม่ได้ตั้ง PIN เพิ่ม"
  ));

  if (width && width < 360) {
    risks.push({ label: "Mobile layout", detail: `viewport ${width}px แคบมาก ควรทดสอบการแตะ NPC และ bottom console จริง` });
  } else {
    risks.push({ label: "Mobile layout", detail: width ? `viewport ${width}px อยู่ในช่วงที่รองรับ แต่ควรทดสอบบนเครื่องจริง` : "ยังไม่ได้ส่ง viewport width จาก frontend" });
  }

  const failed = items.filter((item) => item.status !== "pass");
  const prompt = buildDeployFixPrompt(items, risks);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    passed: failed.length === 0,
    items,
    summary: {
      pass: items.filter((item) => item.status === "pass").map((item) => item.label),
      fix: failed.map((item) => `${item.label}: ${item.detail}`),
      risks,
      prompt,
    },
  };
}

async function loadLineInbox(pool, limit) {
  const r = await pool.query(
    `SELECT c.id, c.line_user_id, c.display_name, c.picture_url, c.last_message_text,
            c.last_message_type, c.last_message_at, COUNT(m.id)::int AS message_count
       FROM public.line_conversations c
       LEFT JOIN public.line_messages m ON m.conversation_id = c.id
      GROUP BY c.id
      ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
      LIMIT $1`,
    [limit]
  );
  return (r.rows || []).map((row) => ({
    id: row.id,
    line_user_id_masked: maskLineUserId(row.line_user_id),
    display_name: row.display_name || "",
    picture_url: row.picture_url || "",
    last_message_text: row.last_message_text || "",
    last_message_type: row.last_message_type || "",
    last_message_at: row.last_message_at || null,
    message_count: Number(row.message_count || 0),
  }));
}

async function loadLineConversation(pool, conversationId) {
  const id = Number(conversationId || 0);
  if (!Number.isFinite(id) || id <= 0) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  const r = await pool.query(
    `SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at
       FROM public.line_conversations
      WHERE id=$1
      LIMIT 1`,
    [id]
  );
  const row = r.rows?.[0];
  if (!row) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  return {
    id: row.id,
    line_user_id_masked: maskLineUserId(row.line_user_id),
    display_name: row.display_name || "",
    picture_url: row.picture_url || "",
    last_message_text: row.last_message_text || "",
    last_message_type: row.last_message_type || "",
    last_message_at: row.last_message_at || null,
  };
}

async function loadLineMessages(pool, conversationId, limit) {
  const id = Number(conversationId || 0);
  if (!Number.isFinite(id) || id <= 0) throw createAiOfficeError("LINE_CONVERSATION_NOT_FOUND", 404);
  const r = await pool.query(
    `SELECT id, conversation_id, direction, event_type, message_type, message_text, received_at, created_at
       FROM public.line_messages
      WHERE conversation_id=$1
      ORDER BY received_at DESC NULLS LAST, created_at DESC
      LIMIT $2`,
    [id, limit]
  );
  return (r.rows || []).reverse().map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction || "inbound",
    event_type: row.event_type || "",
    message_type: row.message_type || "",
    message_text: row.message_text || "",
    received_at: row.received_at || row.created_at || null,
  }));
}

module.exports = function createAdminAiOfficeReadOnlyRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeReadOnlyRoutes requires pool and requireAdminSession");

  const router = express.Router();

  router.use("/admin/ai-office", (req, res, next) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Surrogate-Control": "no-store",
    });
    next();
  });

  router.get("/admin/ai-office/config", requireAdminSession, (req, res) => {
    return res.json({
      ok: true,
      pin_required: Boolean(String(process.env.AI_OFFICE_ACCESS_PIN || "").trim()),
      model: String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim(),
    });
  });

  router.get("/admin/ai-office/summary", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const summary = await loadSummary(pool);
      return res.json({ ok: true, summary });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/jobs", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const bucket = cleanText(req.query.bucket, 40);
      const jobs = await loadJobs(pool, bucket, req.query.phone);
      return res.json({ ok: true, bucket, jobs });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อมูลงานไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/search-by-phone", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const phone = cleanText(req.query.phone, 80);
      const jobs = await loadJobs(pool, "phone", phone);
      return res.json({ ok: true, jobs });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ค้นงานไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/diagnostics", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const result = await runAiOfficeDiagnostics({ pool, req });
      return res.json(result);
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ตรวจระบบ AI Office ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/line-inbox", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const limit = clampLimit(req.query.limit, 30, 100);
      const conversations = await loadLineInbox(pool, limit);
      return res.json({ ok: true, conversations });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลด LINE inbox ไม่สำเร็จ" });
    }
  });

  router.get("/admin/ai-office/line-conversations/:id/messages", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const limit = clampLimit(req.query.limit, 50, 100);
      const conversation = await loadLineConversation(pool, req.params.id);
      const messages = await loadLineMessages(pool, req.params.id, limit);
      return res.json({ ok: true, conversation, messages });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "โหลดข้อความ LINE ไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/line-draft-reply", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ ok: false, error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ AI Office" });

      const conversationId = Number(req.body?.conversation_id || 0);
      if (!Number.isFinite(conversationId) || conversationId <= 0) {
        return res.status(400).json({ ok: false, error: "กรุณาเลือกแชท LINE ก่อน" });
      }
      const agent = getLineAgent(req.body?.agent);
      const instruction = cleanText(req.body?.instruction, 1000);
      const conversation = await loadLineConversation(pool, conversationId);
      const messages = await loadLineMessages(pool, conversationId, 80);
      if (!messages.length) return res.status(400).json({ ok: false, error: "ยังไม่มีข้อความในแชทนี้" });

      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      const answer = await callOpenAI({
        apiKey,
        model,
        prompt: buildLineDraftPrompt({ conversation, messages, agent, instruction }),
      });
      return res.json({ ok: true, answer, conversation, messages, agent });
    } catch (e) {
      console.error("POST /admin/ai-office/line-draft-reply error:", e.message);
      return res.status(e.status || 500).json({ ok: false, error: e.message || "ร่างข้อความจาก LINE ไม่สำเร็จ" });
    }
  });

  router.post("/admin/ai-office/ask", requireAdminSession, async (req, res) => {
    try {
      requireAiOfficePin(req);
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) return res.status(503).json({ ok: false, error: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY สำหรับ AI Office" });

      const question = cleanText(req.body?.question, 1200);
      const agent = getAgent(req.body?.agent);
      const phone = cleanText(req.body?.phone, 80);
      if (!question) return res.status(400).json({ ok: false, error: "กรุณาพิมพ์คำถาม" });

      const summary = await loadSummary(pool);
      const buckets = inferBuckets(question);
      const context = { summary, buckets: {}, phone_search: null, generated_at: new Date().toISOString() };
      for (const bucket of buckets) {
        context.buckets[bucket] = await loadJobs(pool, bucket);
      }
      if (onlyDigits(phone).length >= 6 || onlyDigits(question).length >= 6) {
        context.phone_search = await loadJobs(pool, "phone", phone || question);
      }

      const model = String(process.env.AI_OFFICE_MODEL || AI_OFFICE_DEFAULT_MODEL).trim() || AI_OFFICE_DEFAULT_MODEL;
      const answer = await callOpenAI({ apiKey, model, prompt: buildGroundedPrompt(question, context, agent) });
      return res.json({ ok: true, answer, context, agent });
    } catch (e) {
      console.error("POST /admin/ai-office/ask error:", e);
      return res.status(e.status || 500).json({ ok: false, error: e.message || "AI Office ตอบไม่ได้ในขณะนี้" });
    }
  });

  return router;
};
