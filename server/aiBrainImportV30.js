"use strict";

const fs = require("fs");
const path = require("path");

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
  "error_code_rule",
  "style_rule",
]);

const DEFAULT_BRAIN_FOLDER = path.join(__dirname, "ai-brain", "cwf-complete-reply-brain-v2.0");

function cleanText(value, max = 12000) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

function compactText(value, max = 12000) {
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return cleanText(raw, max);
}

function clampInt(value, fallback, min = 1, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function safeJson(value, fallback) {
  try { return JSON.stringify(value ?? fallback ?? {}); }
  catch (_) { return JSON.stringify(fallback ?? {}); }
}

function inferIntent(text = "") {
  const s = String(text || "").toLowerCase();
  if (/แพง|ลด|ส่วนลด|expensive|discount/.test(s)) return "price_objection";
  if (/ราคา|เท่าไหร่|กี่บาท|price|cost/.test(s)) return "price_question";
  if (/แบบไหนดี|แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง|package/.test(s)) return "package_recommendation";
  if (/นัด|คิว|ว่าง|จอง|booking|appointment/.test(s)) return "booking_request";
  if (/พื้นที่|อยู่|zone|area|service area/.test(s)) return "service_area";
  if (/รับประกัน|warranty/.test(s)) return "warranty";
  if (/ร้องเรียน|ขอคืน|refund|complaint|lawsuit|police/.test(s)) return "complaint";
  if (/ซ่อม|เสีย|error|code|โค้ด|ไม่เย็น|น้ำยา|รั่ว|compressor|repair/.test(s)) return "repair_question";
  if (/ไม่เย็น|not cold/.test(s)) return "not_cold";
  if (/น้ำหยด|water leak|leak/.test(s)) return "water_leak";
  if (/กลิ่น|เหม็น|อับ|smell/.test(s)) return "bad_smell";
  return "general";
}

function inferServiceType(text = "") {
  const s = String(text || "").toLowerCase();
  if (/ล้าง|clean/.test(s)) return "air_cleaning";
  if (/ซ่อม|repair|error|โค้ด|ไม่เย็น|รั่ว|น้ำยา/.test(s)) return "air_repair";
  if (/ติดตั้ง|install/.test(s)) return "air_installation";
  if (/ตรวจ|check|inspection/.test(s)) return "air_inspection";
  if (/cassette|สี่ทิศ|แขวน|เปลือย|non.wall|non_wall/.test(s)) return "non_wall_ac";
  return "";
}

function inferCustomerStage(text = "") {
  const s = String(text || "").toLowerCase();
  if (/แพง|ลด|เทียบ|compare/.test(s)) return "comparing";
  if (/ราคา|price|cost|กี่บาท|เท่าไหร่/.test(s)) return "asking_price";
  if (/จอง|นัด|ว่าง|booking|appointment/.test(s)) return "booking_ready";
  if (/ที่อยู่|โลเค|location|address/.test(s)) return "waiting_address";
  if (/ร้องเรียน|ไม่พอใจ|refund|คืนเงิน|complaint|lawsuit/.test(s)) return "complaint";
  if (/หลังบริการ|ใบเสร็จ|receipt|review/.test(s)) return "after_service";
  return "new_lead";
}

function filenameMeta(fileName) {
  const lower = fileName.toLowerCase();
  const meta = {
    item_type: "service_fact",
    agent_key: "all",
    language: "th",
    priority: 70,
    confidence: 85,
    intent: "general",
    service_type: "",
    customer_stage: "",
    risk_label: "",
  };
  if (/style|reply-style/.test(lower)) Object.assign(meta, { item_type: "style_rule", intent: "customer_reply_style", priority: 100, confidence: 95 });
  else if (/thai-customer-qa/.test(lower)) Object.assign(meta, { item_type: "approved_reply", agent_key: "sales", language: "th", priority: 85, confidence: 90 });
  else if (/foreign|english/.test(lower)) Object.assign(meta, { item_type: "approved_reply", agent_key: "sales", language: "en", priority: 80, confidence: 88 });
  else if (/repair-sales/.test(lower)) Object.assign(meta, { item_type: "sales_playbook", agent_key: "sales", service_type: "air_repair", priority: 90, confidence: 90 });
  else if (/cleaning-options/.test(lower)) Object.assign(meta, { item_type: "sales_playbook", intent: "package_recommendation", service_type: "air_cleaning", priority: 88, confidence: 90 });
  else if (/admin-reply-rules/.test(lower)) Object.assign(meta, { item_type: "policy_rule", priority: 92, confidence: 92 });
  else if (/error-code/.test(lower)) Object.assign(meta, { item_type: "error_code_rule", service_type: "air_repair", risk_label: "technician_review", priority: 95, confidence: 90 });
  else if (/non-wall/.test(lower)) Object.assign(meta, { item_type: "pricing_rule", service_type: "non_wall_ac", priority: 95, confidence: 95 });
  else if (/master/.test(lower)) Object.assign(meta, { item_type: "service_fact", priority: 100, confidence: 95 });
  return meta;
}

function titleFromItem(item, fallback) {
  return cleanText(item.title || item.name || item.category || item.intent || item.id || item.kb_name || fallback, 240);
}

function tagsFromItem(item, extra = []) {
  const tags = [];
  if (Array.isArray(item.tags)) tags.push(...item.tags.map(String));
  if (item.category) tags.push(String(item.category));
  if (item.intent) tags.push(String(item.intent));
  if (item.risk) tags.push(String(item.risk));
  tags.push(...extra);
  return [...new Set(tags.filter(Boolean).map((x) => cleanText(x, 80)).filter(Boolean))].slice(0, 30);
}

function buildQaContent(item) {
  const q = item.customer_questions || item.questions || item.question || item.customer_message || item.customer_question || "";
  const reply = item.admin_reply_th || item.admin_reply_en || item.reply || item.answer || item.admin_reply || item.final_admin_reply || "";
  const parts = [];
  if (Array.isArray(q)) parts.push(`ลูกค้าถาม: ${q.join(" | ")}`);
  else if (q) parts.push(`ลูกค้าถาม: ${q}`);
  if (reply) parts.push(`คำตอบแอดมิน: ${reply}`);
  if (item.next_action) parts.push(`ขั้นต่อไป: ${item.next_action}`);
  if (item.notes || item.notes_th) parts.push(`หมายเหตุ: ${item.notes || item.notes_th}`);
  return cleanText(parts.join("\n"), 12000);
}

function createBrainItem(base, item, sourceFile, sourceVersion, overrides = {}) {
  const rawContent = overrides.content || buildQaContent(item) || compactText(item);
  const content = cleanText(rawContent, 12000);
  if (!content) return null;
  const title = cleanText(overrides.title || titleFromItem(item, sourceFile), 240);
  const intent = cleanText(overrides.intent || item.intent || base.intent || inferIntent(`${title}\n${content}`), 120);
  const serviceType = cleanText(overrides.service_type || item.service_type || base.service_type || inferServiceType(`${title}\n${content}`), 120);
  const customerStage = cleanText(overrides.customer_stage || item.customer_stage || base.customer_stage || inferCustomerStage(`${title}\n${content}`), 120);
  const itemType = cleanText(overrides.item_type || item.item_type || base.item_type, 80);
  if (!ALLOWED_ITEM_TYPES.has(itemType)) return null;
  return {
    item_type: itemType,
    title,
    content,
    intent,
    service_type: serviceType,
    customer_stage: customerStage,
    agent_key: cleanText(overrides.agent_key || item.agent_key || base.agent_key || "all", 80),
    language: cleanText(overrides.language || item.language || base.language || "th", 20),
    priority: clampInt(overrides.priority ?? item.priority ?? base.priority, 50),
    confidence: clampInt(overrides.confidence ?? (typeof item.confidence === "number" ? item.confidence : base.confidence), 80),
    tags: tagsFromItem(item, overrides.tags || []),
    source: "cwf_brain_v2",
    source_file: sourceFile,
    source_version: cleanText(sourceVersion || item.version || base.version || "", 80),
    risk_label: cleanText(overrides.risk_label || item.risk_label || item.risk || base.risk_label || "", 80),
    is_active: true,
    metadata: {
      source_id: item.id || item.code || item.kb_name || null,
      raw_type: Array.isArray(item) ? "array" : typeof item,
      imported_by: "aiBrainImportV30",
      original_keys: item && typeof item === "object" ? Object.keys(item).slice(0, 30) : [],
    },
  };
}

function pushIfValid(items, item) {
  if (item && item.content && ALLOWED_ITEM_TYPES.has(item.item_type)) items.push(item);
}

function flattenTopLevelObjects(data, base, sourceFile, sourceVersion, warnings) {
  const items = [];
  const addSection = (key, value, typeOverride) => {
    if (value == null || value === "") return;
    const content = compactText(value, 12000);
    if (!content) return;
    pushIfValid(items, createBrainItem(base, { title: key, content }, sourceFile, sourceVersion, {
      title: key,
      content,
      item_type: typeOverride || base.item_type,
      intent: inferIntent(`${key}\n${content}`),
      service_type: inferServiceType(`${key}\n${content}`),
      customer_stage: inferCustomerStage(`${key}\n${content}`),
    }));
  };

  if (data.price_book) addSection("price_book", data.price_book, "pricing_rule");
  if (data.service_prices) addSection("service_prices", data.service_prices, "pricing_rule");
  if (data.risk_labels) addSection("risk_labels", data.risk_labels, "policy_rule");
  if (data.customer_facing_style) addSection("customer_facing_style", data.customer_facing_style, "style_rule");
  if (data.admin_persona || data.persona || data.brand_voice) addSection("admin_persona_and_voice", data.admin_persona || data.persona || data.brand_voice, "style_rule");
  if (data.rules) addSection("rules", data.rules, "policy_rule");
  if (data.reply_rules) addSection("reply_rules", data.reply_rules, "policy_rule");
  if (data.templates) addSection("templates", data.templates, base.item_type === "policy_rule" ? "policy_rule" : "sales_playbook");
  if (data.reply_templates) addSection("reply_templates", data.reply_templates, "approved_reply");
  if (data.service_cleaning_types || data.cleaning_customer_facing_summary) addSection("cleaning_options", data.service_cleaning_types || data.cleaning_customer_facing_summary, "sales_playbook");
  if (data.price_conditions || data.warranty_conditions || data.fault_triage || data.error_code_knowledge_base) {
    addSection("warranty_fault_error_code_rules", {
      price_conditions: data.price_conditions,
      warranty_conditions: data.warranty_conditions,
      fault_triage: data.fault_triage,
      error_code_knowledge_base: data.error_code_knowledge_base,
    }, "policy_rule");
  }

  const known = new Set(["version", "updated_at", "kb_name", "brain_name", "project", "purpose", "scope", "phase", "business", "modules", "items", "records", "qa", "price_book", "service_prices", "risk_labels", "customer_facing_style", "admin_persona", "persona", "brand_voice", "rules", "reply_rules", "templates", "reply_templates", "service_cleaning_types", "cleaning_customer_facing_summary", "price_conditions", "warranty_conditions", "fault_triage", "error_code_knowledge_base", "items_count", "records_count", "coverage_summary"]);
  Object.entries(data).forEach(([key, value]) => {
    if (known.has(key)) return;
    if (Array.isArray(value) || (value && typeof value === "object")) addSection(key, value, base.item_type);
  });
  if (!items.length) warnings.push(`No structured sections found in ${sourceFile}; imported compact whole file.`);
  return items;
}

function normalizeJsonFile(data, sourceFile) {
  const warnings = [];
  const base = filenameMeta(sourceFile);
  const sourceVersion = cleanText(data?.version || data?.updated_at || "", 80);
  const items = [];

  const list = Array.isArray(data) ? data : (data.items || data.records || data.qa || null);
  if (Array.isArray(list)) {
    list.forEach((entry, idx) => {
      const item = entry && typeof entry === "object" ? entry : { value: entry };
      const overrides = {};
      if (/error-code/i.test(sourceFile)) {
        overrides.item_type = "error_code_rule";
        overrides.service_type = "air_repair";
        overrides.risk_label = item.risk_label || item.risk || "technician_review";
        overrides.priority = 95;
        overrides.title = `${item.brand || "AC"} ${item.code ? `code ${item.code}` : item.record_type || "error code"}`;
        overrides.content = cleanText([
          item.brand ? `ยี่ห้อ: ${item.brand}` : "",
          item.model_family ? `รุ่น/ตระกูล: ${item.model_family}` : "",
          item.code ? `โค้ด: ${item.code}` : "",
          item.meaning_th ? `ความหมาย: ${item.meaning_th}` : "",
          item.code_display_method ? `วิธีเช็ค: ${item.code_display_method}` : "",
          Array.isArray(item.customer_safe_checks) ? `ข้อแนะนำปลอดภัย: ${item.customer_safe_checks.join(" | ")}` : "",
          item.admin_reply_template ? `คำตอบแอดมิน: ${item.admin_reply_template}` : "",
          item.safety_note ? `หมายเหตุความปลอดภัย: ${item.safety_note}` : "",
        ].filter(Boolean).join("\n"), 12000);
      }
      pushIfValid(items, createBrainItem(base, item, sourceFile, sourceVersion, overrides));
    });
  } else if (data && typeof data === "object") {
    items.push(...flattenTopLevelObjects(data, base, sourceFile, sourceVersion, warnings));
    if (!items.length) {
      pushIfValid(items, createBrainItem(base, data, sourceFile, sourceVersion, {
        title: data.kb_name || data.brain_name || sourceFile,
        content: compactText(data, 12000),
      }));
    }
  } else {
    warnings.push(`${sourceFile}: unsupported JSON root type ${typeof data}`);
  }

  const rejected = [];
  const cleanItems = items.filter((item) => {
    if (!item || !item.content) { rejected.push("empty content"); return false; }
    if (!ALLOWED_ITEM_TYPES.has(item.item_type)) { rejected.push(`unknown item_type ${item?.item_type}`); return false; }
    return true;
  });
  if (rejected.length) warnings.push(`${sourceFile}: rejected ${rejected.length} rows (${[...new Set(rejected)].slice(0, 3).join(", ")})`);
  return { items: cleanItems, warnings };
}

function normalizeBrainPackageFromFolder(folderPath = DEFAULT_BRAIN_FOLDER) {
  const root = path.resolve(folderPath);
  const warnings = [];
  if (!fs.existsSync(root)) {
    return { items: [], source_files: [], warnings: [`Brain package files not found at ${root}`], missing: true };
  }
  const sourceFiles = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith(".json")).sort();
  if (!sourceFiles.length) return { items: [], source_files: [], warnings: [`No JSON brain files found at ${root}`], missing: true };
  const allItems = [];
  for (const file of sourceFiles) {
    const fullPath = path.join(root, file);
    try {
      const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const result = normalizeJsonFile(data, file);
      allItems.push(...result.items);
      warnings.push(...result.warnings);
    } catch (e) {
      warnings.push(`${file}: ${e.message}`);
    }
  }
  return { items: allItems, source_files: sourceFiles, warnings };
}

async function ensureAiBrainItemsTable(pool) {
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
      source TEXT NOT NULL DEFAULT 'cwf_brain_v2',
      source_file TEXT NOT NULL DEFAULT '',
      source_version TEXT NOT NULL DEFAULT '',
      risk_label TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_active ON public.ai_brain_items(is_active)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_type ON public.ai_brain_items(item_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_agent ON public.ai_brain_items(agent_key)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_intent ON public.ai_brain_items(intent)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_service ON public.ai_brain_items(service_type)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_stage ON public.ai_brain_items(customer_stage)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_brain_items_source ON public.ai_brain_items(source)`);
}

async function seedCwfBrainV2(pool, { createdBy = "ai-office" } = {}) {
  await ensureAiBrainItemsTable(pool);
  const normalized = normalizeBrainPackageFromFolder(DEFAULT_BRAIN_FOLDER);
  if (normalized.missing || !normalized.items.length) {
    return { ok: false, inserted_count: 0, disabled_old_count: 0, source_files: normalized.source_files, warnings: normalized.warnings };
  }
  const disabled = await pool.query(`
    UPDATE public.ai_brain_items
       SET is_active=false, updated_at=NOW()
     WHERE source='cwf_brain_v2' AND is_active=true
  `);

  const insertSql = `
    INSERT INTO public.ai_brain_items(item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,is_active,metadata,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,true,$16::jsonb,$17)
  `;
  for (const item of normalized.items) {
    await pool.query(insertSql, [
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
      safeJson(item.tags, []),
      item.source,
      item.source_file,
      item.source_version,
      item.risk_label,
      safeJson(item.metadata, {}),
      createdBy,
    ]);
  }
  return {
    ok: true,
    inserted_count: normalized.items.length,
    disabled_old_count: disabled.rowCount || 0,
    source_files: normalized.source_files,
    warnings: normalized.warnings,
  };
}

async function loadAiBrainContext(pool, params = {}) {
  await ensureAiBrainItemsTable(pool);
  const query = cleanText(params.query || "", 500);
  const like = query ? `%${query}%` : "";
  const values = [
    cleanText(params.agent_key || "", 80),
    cleanText(params.intent || "", 120),
    cleanText(params.service_type || "", 120),
    cleanText(params.customer_stage || "", 120),
    cleanText(params.language || "", 20),
    cleanText(params.risk_label || "", 80),
    like,
    Math.max(1, Math.min(50, Number(params.limit || 12))),
  ];
  const r = await pool.query(`
    SELECT id,item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,metadata,updated_at
      FROM public.ai_brain_items
     WHERE is_active=true
       AND ($1='' OR agent_key=$1 OR agent_key='all')
       AND ($2='' OR intent=$2 OR intent='general' OR intent='customer_reply_style')
       AND ($3='' OR service_type=$3 OR service_type='')
       AND ($4='' OR customer_stage=$4 OR customer_stage='' OR customer_stage='all')
       AND ($5='' OR language=$5 OR language='th' OR language='unknown')
       AND ($6='' OR risk_label=$6 OR risk_label='')
       AND ($7='' OR title ILIKE $7 OR content ILIKE $7 OR tags::text ILIKE $7)
     ORDER BY
       CASE item_type
         WHEN 'policy_rule' THEN 0
         WHEN 'style_rule' THEN 1
         WHEN 'pricing_rule' THEN 2
         WHEN 'admin_correction' THEN 3
         WHEN 'bad_reply_pattern' THEN 4
         WHEN 'sales_playbook' THEN 5
         WHEN 'objection_handler' THEN 6
         WHEN 'approved_reply' THEN 7
         WHEN 'error_code_rule' THEN 8
         ELSE 9
       END,
       CASE WHEN $2<>'' AND intent=$2 THEN 0 ELSE 1 END,
       CASE WHEN $3<>'' AND service_type=$3 THEN 0 ELSE 1 END,
       CASE WHEN $4<>'' AND customer_stage=$4 THEN 0 ELSE 1 END,
       CASE WHEN $1<>'' AND agent_key=$1 THEN 0 ELSE 1 END,
       priority DESC,
       updated_at DESC
     LIMIT $8
  `, values);
  return r.rows || [];
}

module.exports = {
  ALLOWED_ITEM_TYPES,
  DEFAULT_BRAIN_FOLDER,
  ensureAiBrainItemsTable,
  normalizeBrainPackageFromFolder,
  seedCwfBrainV2,
  loadAiBrainContext,
  inferIntent,
  inferServiceType,
  inferCustomerStage,
};
