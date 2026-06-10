const express = require("express");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

const ALLOWED_ITEM_TYPES = new Set([
  "service_fact",
  "pricing_rule",
  "sales_playbook",
  "objection_handler",
  "approved_reply",
  "bad_reply_pattern",
  "admin_correction",
  "policy_rule",
  "workflow_rule",
  "technician_rule",
  "customer_stage_rule",
]);

const EDITABLE_FIELDS = [
  "item_type",
  "title",
  "content",
  "intent",
  "service_type",
  "customer_stage",
  "agent_key",
  "language",
  "priority",
  "confidence",
  "tags",
  "source",
  "is_active",
  "metadata",
];

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampInt(value, def, min = 1, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 30);
  return String(value || "")
    .split(/[|,]/)
    .map((x) => cleanText(x, 80))
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return {};
}

function hasPrivateCustomerData(value) {
  const text = String(value || "");
  const digits = text.replace(/\D/g, "");
  const hasPhone = /(?:\+?66|0)\s*[-.]?\s*\d{1,2}\s*[-.]?\s*\d{3,4}\s*[-.]?\s*\d{3,4}/.test(text) || digits.length >= 9;
  const hasAddress = /(บ้านเลขที่|หมู่บ้าน|ซอย|ถนน|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|รหัสไปรษณีย์|address|house\s*no\.?)/i.test(text);
  const hasSensitive = /(บัตรประชาชน|เลขบัญชี|บัญชีธนาคาร|password|otp|token|secret)/i.test(text);
  return hasPhone || hasAddress || hasSensitive;
}

function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}

async function ensureAiBrainSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_brain_items (
      id BIGSERIAL PRIMARY KEY,
      item_type TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT '',
      service_type TEXT NOT NULL DEFAULT '',
      customer_stage TEXT NOT NULL DEFAULT '',
      agent_key TEXT NOT NULL DEFAULT 'all',
      language TEXT NOT NULL DEFAULT 'th',
      priority INTEGER NOT NULL DEFAULT 50,
      confidence INTEGER NOT NULL DEFAULT 80,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      source TEXT NOT NULL DEFAULT 'manual',
      is_active BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT ai_brain_items_item_type_check CHECK (item_type IN (
        'service_fact','pricing_rule','sales_playbook','objection_handler','approved_reply',
        'bad_reply_pattern','admin_correction','policy_rule','workflow_rule','technician_rule','customer_stage_rule'
      ))
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_active_lookup ON public.ai_brain_items(is_active, agent_key, item_type, intent, service_type, customer_stage, priority DESC, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_source_active ON public.ai_brain_items(source, is_active, updated_at DESC)`);
  await seedAiBrainIfEmpty(pool);
}

async function seedAiBrainIfEmpty(pool) {
  const r = await pool.query("SELECT COUNT(*)::int AS count FROM public.ai_brain_items");
  if (Number(r.rows?.[0]?.count || 0) > 0) return;
  const seed = [
    {
      item_type: "service_fact",
      title: "Coldwindflow public contact",
      content: "Coldwindflow Air Services provides air cleaning, air repair, air installation, and air inspection. Public LINE OA is @cwfair and public phone is 098-877-7321.",
      agent_key: "all",
      tags: ["cwf", "public_contact"],
    },
    {
      item_type: "pricing_rule",
      title: "Rainy season air cleaning promotion",
      content: "Rainy season promo: wall AC <= 12,000 BTU normal 550, premium 790, hanging coil 1290, deep clean 1850. Wall AC >= 18,000 BTU normal 690, premium 990, hanging coil 1550, deep clean 2150. Check fee 700. Cassette 1500. Suspended/concealed 1200.",
      intent: "price_question",
      service_type: "air_cleaning",
      agent_key: "sales",
      priority: 90,
      confidence: 90,
      tags: ["pricing", "promotion", "air_cleaning"],
    },
    {
      item_type: "policy_rule",
      title: "Cleaning warranty",
      content: "Cleaning warranty is 30 days for symptoms caused by the cleaning service. For repair, leak, or uncertain price cases, the technician must inspect before final quote.",
      intent: "warranty",
      agent_key: "all",
      priority: 85,
      confidence: 90,
      tags: ["warranty", "policy"],
    },
  ];
  for (const item of seed) {
    await pool.query(`
      INSERT INTO public.ai_brain_items(item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,is_active,metadata,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'internal_seed',true,$12::jsonb,'system')
    `, [
      item.item_type,
      item.title,
      item.content,
      item.intent || "",
      item.service_type || "",
      item.customer_stage || "",
      item.agent_key || "all",
      item.language || "th",
      item.priority || 50,
      item.confidence || 80,
      JSON.stringify(item.tags || []),
      JSON.stringify({ seed: "cwf-ai-brain-v1" }),
    ]);
  }
}

function validateBrainItem(input = {}, rowNumber = 1) {
  const warnings = [];
  const errors = [];
  const item = {
    item_type: cleanText(input.item_type, 80),
    title: cleanText(input.title, 240),
    content: cleanText(input.content, 8000),
    intent: cleanText(input.intent, 120),
    service_type: cleanText(input.service_type, 120),
    customer_stage: cleanText(input.customer_stage, 120),
    agent_key: cleanText(input.agent_key || "all", 40) || "all",
    language: cleanText(input.language || "th", 20) || "th",
    priority: clampInt(input.priority, 50),
    confidence: clampInt(input.confidence, 80),
    tags: normalizeTags(input.tags),
    source: cleanText(input.source || "manual", 120) || "manual",
    is_active: input.is_active === undefined ? true : input.is_active !== false && input.is_active !== "false",
    metadata: normalizeJsonObject(input.metadata),
  };
  if (!item.item_type) errors.push("item_type required");
  else if (!ALLOWED_ITEM_TYPES.has(item.item_type)) errors.push(`unknown item_type: ${item.item_type}`);
  if (!item.content) errors.push("content required");
  if (!item.title) warnings.push("title is recommended");
  if (String(input.content || "").length > 8000) warnings.push("content truncated to 8000 characters");
  if (hasPrivateCustomerData(`${item.title}\n${item.content}`)) warnings.push("possible private customer data detected");
  return { row_number: rowNumber, ok: errors.length === 0, item, warnings, errors };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((v) => String(v).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => String(v).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((h) => cleanText(h, 80));
  return rows.map((values) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ""; });
    return obj;
  });
}

function parseImportPayload(req) {
  const fileText = req.file?.buffer ? req.file.buffer.toString("utf8") : "";
  if (Array.isArray(req.body?.items)) return req.body.items;
  if (req.body?.version && Array.isArray(req.body?.items)) return req.body.items;
  const raw = fileText || String(req.body?.brain_text || req.body?.content || req.body?.data || "").trim();
  if (!raw) return [];
  const fileName = String(req.file?.originalname || "").toLowerCase();
  const format = cleanText(req.body?.format, 20).toLowerCase();
  if (format === "csv" || fileName.endsWith(".csv")) return parseCsv(raw);
  if (format === "jsonl" || fileName.endsWith(".jsonl")) {
    return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

async function listBrainItems(pool, filters = {}) {
  await ensureAiBrainSchema(pool);
  const params = [];
  const clauses = ["1=1"];
  const add = (value, sql) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    params.push(value);
    clauses.push(sql(params.length));
  };
  add(cleanText(filters.item_type, 80), (i) => `item_type = $${i}`);
  add(cleanText(filters.agent_key, 40), (i) => `(agent_key = $${i} OR agent_key = 'all')`);
  add(cleanText(filters.service_type, 120), (i) => `service_type = $${i}`);
  add(cleanText(filters.intent, 120), (i) => `intent = $${i}`);
  add(cleanText(filters.customer_stage, 120), (i) => `customer_stage = $${i}`);
  if (String(filters.active || "").trim() !== "") {
    params.push(String(filters.active) !== "false");
    clauses.push(`is_active = $${params.length}`);
  }
  const q = cleanText(filters.q, 200);
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    clauses.push(`(title ILIKE $${i} OR content ILIKE $${i} OR intent ILIKE $${i} OR service_type ILIKE $${i} OR tags::text ILIKE $${i})`);
  }
  params.push(Math.max(1, Math.min(Number(filters.limit || 120), 10000)));
  const r = await pool.query(`
    SELECT id,item_type,title,content,intent,service_type,customer_stage,agent_key,language,
           priority,confidence,tags,source,is_active,metadata,created_by,created_at,updated_at
      FROM public.ai_brain_items
     WHERE ${clauses.join(" AND ")}
     ORDER BY is_active DESC, priority DESC, updated_at DESC, id DESC
     LIMIT $${params.length}
  `, params);
  return r.rows || [];
}

async function loadAiBrainContext(pool, opts = {}) {
  await ensureAiBrainSchema(pool);
  const query = cleanText(opts.query, 500);
  const params = [
    cleanText(opts.intent, 120),
    cleanText(opts.service_type, 120),
    cleanText(opts.customer_stage, 120),
    cleanText(opts.agent_key || "all", 40) || "all",
    cleanText(opts.language || "th", 20) || "th",
    query ? `%${query.slice(0, 160)}%` : "",
    Math.max(1, Math.min(Number(opts.limit || 8), 30)),
  ];
  const r = await pool.query(`
    SELECT id,item_type,title,content,intent,service_type,customer_stage,agent_key,language,
           priority,confidence,tags,source,updated_at
      FROM public.ai_brain_items
     WHERE is_active = true
       AND ($5 = '' OR language = $5 OR language = 'th' OR language = 'unknown')
       AND ($4 = '' OR agent_key = $4 OR agent_key = 'all')
     ORDER BY
       CASE WHEN $1 <> '' AND intent = $1 THEN 0 ELSE 1 END,
       CASE WHEN $2 <> '' AND service_type = $2 THEN 0 ELSE 1 END,
       CASE WHEN $3 <> '' AND customer_stage = $3 THEN 0 ELSE 1 END,
       CASE WHEN agent_key = $4 THEN 0 WHEN agent_key = 'all' THEN 1 ELSE 2 END,
       CASE item_type
         WHEN 'policy_rule' THEN 0
         WHEN 'admin_correction' THEN 1
         WHEN 'bad_reply_pattern' THEN 2
         WHEN 'pricing_rule' THEN 3
         WHEN 'sales_playbook' THEN 4
         WHEN 'objection_handler' THEN 5
         WHEN 'approved_reply' THEN 6
         WHEN 'service_fact' THEN 7
         ELSE 8
       END,
       priority DESC,
       updated_at DESC,
       CASE WHEN $6 <> '' AND (title ILIKE $6 OR content ILIKE $6 OR tags::text ILIKE $6) THEN 0 ELSE 1 END
     LIMIT $7
  `, params);
  return {
    query,
    agent_key: params[3],
    intent: params[0],
    service_type: params[1],
    customer_stage: params[2],
    language: params[4],
    items: r.rows || [],
  };
}

module.exports = function createAdminAiOfficeBrainManagerRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeBrainManagerRoutes requires pool and requireAdminSession");
  const router = express.Router();

  router.get("/admin/ai-office/brain/items", requireAdminSession, async (req, res) => {
    try {
      const items = await listBrainItems(pool, req.query || {});
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AI_BRAIN_FAILED" });
    }
  });

  router.post("/admin/ai-office/brain/import-preview", requireAdminSession, upload.single("file"), async (req, res) => {
    try {
      const rows = parseImportPayload(req);
      const checked = rows.map((row, idx) => validateBrainItem(row, idx + 1));
      const previewItems = checked.filter((x) => x.ok).map((x) => ({ ...x.item, row_number: x.row_number, warnings: x.warnings }));
      const rejectedItems = checked.filter((x) => !x.ok).map((x) => ({ row_number: x.row_number, item: x.item, errors: x.errors, warnings: x.warnings }));
      const warnings = checked.flatMap((x) => x.warnings.map((w) => `row ${x.row_number}: ${w}`));
      return res.json({
        ok: true,
        total_rows: rows.length,
        valid_count: previewItems.length,
        invalid_count: rejectedItems.length,
        warnings,
        preview_items: previewItems,
        rejected_items: rejectedItems,
      });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message || "IMPORT_PREVIEW_FAILED", total_rows: 0, valid_count: 0, invalid_count: 0, warnings: [], preview_items: [], rejected_items: [] });
    }
  });

  router.post("/admin/ai-office/brain/import-commit", requireAdminSession, async (req, res) => {
    const client = await pool.connect();
    try {
      await ensureAiBrainSchema(pool);
      const mode = cleanText(req.body?.mode || "append", 40);
      const source = cleanText(req.body?.source || "manual_import", 120) || "manual_import";
      const rows = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body?.preview_items) ? req.body.preview_items : [];
      const checked = rows.map((row, idx) => validateBrainItem({ ...row, source: row.source || source }, idx + 1)).filter((x) => x.ok);
      await client.query("BEGIN");
      if (mode === "replace_same_source") {
        await client.query("UPDATE public.ai_brain_items SET is_active=false, updated_at=NOW() WHERE source=$1 AND is_active=true", [source]);
      }
      const saved = [];
      for (const x of checked) {
        const item = { ...x.item, source };
        const r = await client.query(`
          INSERT INTO public.ai_brain_items(item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,is_active,metadata,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb,$15)
          RETURNING *
        `, [
          item.item_type,
          item.title,
          item.content,
          item.intent,
          item.service_type,
          item.customer_stage,
          item.agent_key,
          item.language,
          item.priority,
          item.confidence,
          JSON.stringify(item.tags),
          item.source,
          item.is_active,
          JSON.stringify(item.metadata),
          getAdminUser(req),
        ]);
        saved.push(r.rows[0]);
      }
      await client.query("COMMIT");
      return res.json({ ok: true, saved_count: saved.length, items: saved });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      return res.status(e.status || 500).json({ ok: false, error: e.message || "IMPORT_COMMIT_FAILED" });
    } finally {
      client.release();
    }
  });

  router.get("/admin/ai-office/brain/export", requireAdminSession, async (req, res) => {
    try {
      const items = await listBrainItems(pool, { ...(req.query || {}), active: "true", limit: 10000 });
      const payload = {
        version: "cwf-ai-brain-v1",
        exported_at: new Date().toISOString(),
        business: "Coldwindflow Air Services",
        items: items.map(({ id, created_at, updated_at, created_by, ...item }) => item),
      };
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="cwf-ai-brain-${new Date().toISOString().slice(0, 10)}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "EXPORT_AI_BRAIN_FAILED" });
    }
  });

  router.patch("/admin/ai-office/brain/items/:id", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainSchema(pool);
      const id = Number(req.params.id || 0);
      const existing = await pool.query("SELECT * FROM public.ai_brain_items WHERE id=$1 LIMIT 1", [id]);
      if (!existing.rows?.[0]) return res.status(404).json({ ok: false, error: "AI_BRAIN_ITEM_NOT_FOUND" });
      const input = {};
      EDITABLE_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) input[field] = req.body[field];
      });
      const checked = validateBrainItem({ ...existing.rows[0], ...input }, 1);
      if (!checked.ok) return res.status(400).json({ ok: false, errors: checked.errors, warnings: checked.warnings });
      const item = checked.item;
      const r = await pool.query(`
        UPDATE public.ai_brain_items
           SET item_type=$2,title=$3,content=$4,intent=$5,service_type=$6,customer_stage=$7,
               agent_key=$8,language=$9,priority=$10,confidence=$11,tags=$12::jsonb,
               source=$13,is_active=$14,metadata=$15::jsonb,updated_at=NOW()
         WHERE id=$1
         RETURNING *
      `, [id, item.item_type, item.title, item.content, item.intent, item.service_type, item.customer_stage, item.agent_key, item.language, item.priority, item.confidence, JSON.stringify(item.tags), item.source, item.is_active, JSON.stringify(item.metadata)]);
      return res.json({ ok: true, item: r.rows[0], warnings: checked.warnings });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "UPDATE_AI_BRAIN_ITEM_FAILED" });
    }
  });

  router.patch("/admin/ai-office/brain/items/:id/disable", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainSchema(pool);
      const r = await pool.query("UPDATE public.ai_brain_items SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING *", [Number(req.params.id || 0)]);
      if (!r.rows?.[0]) return res.status(404).json({ ok: false, error: "AI_BRAIN_ITEM_NOT_FOUND" });
      return res.json({ ok: true, item: r.rows[0] });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "DISABLE_AI_BRAIN_ITEM_FAILED" });
    }
  });

  return router;
};

module.exports.ensureAiBrainSchema = ensureAiBrainSchema;
module.exports.loadAiBrainContext = loadAiBrainContext;
module.exports.validateBrainItem = validateBrainItem;
module.exports.parseCsv = parseCsv;
