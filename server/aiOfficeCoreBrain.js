"use strict";

const {
  ensureAiBrainItemsTable,
  loadAiBrainContext,
  inferIntent,
  inferServiceType,
  inferCustomerStage,
} = require("./aiBrainImportV30");

function cleanText(value, max = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on|active)$/i.test(String(value).trim());
}

function detectLanguage(text = "") {
  const s = String(text || "");
  if (/[\u0E00-\u0E7F]/.test(s)) return "th";
  if (/[ぁ-ゟ゠-ヿ]/.test(s)) return "ja";
  if (/[\u4e00-\u9fff]/.test(s)) return "zh";
  if (/[A-Za-z]/.test(s)) return "en";
  return "unknown";
}

function dedupeItems(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row) continue;
    const key = String(row.id || `${row.item_type}:${row.title}:${row.source_file}`).slice(0, 240);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function mapAgentToBrainKey(agentKey = "") {
  const key = String(agentKey || "").trim().toLowerCase();
  if (["sales", "admin", "ops", "ads", "content", "dev", "office", "repair"].includes(key)) return key;
  return "all";
}

function uniqueStrings(values = []) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const v = cleanText(value, 140);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function intentAliases(intent = "", query = "") {
  const s = `${intent} ${query}`.toLowerCase();
  const aliases = [intent, inferIntent(query)];
  if (/appointment|booking|นัด|คิว|ว่าง|จอง/.test(s)) aliases.push("booking_request", "appointment", "general");
  if (/repair|symptom|ซ่อม|เสีย|ไม่เย็น|น้ำหยด|รั่ว|error|code/.test(s)) aliases.push("repair_question", "repair_symptom", "general");
  if (/expensive|price_objection|แพง|ลด|ส่วนลด/.test(s)) aliases.push("price_objection", "expensive", "price_question", "general");
  if (/price|ราคา|เท่าไหร่|กี่บาท|cost|โปร/.test(s)) aliases.push("price_question", "general");
  if (/package|cleaning_package|แบบไหน|พรีเมียม|แขวนคอยล์|ตัดล้าง/.test(s)) aliases.push("package_recommendation", "cleaning_package", "general");
  if (/area|พื้นที่|โซน|service_area/.test(s)) aliases.push("service_area", "general");
  if (/complaint|ร้องเรียน|โวย|ไม่พอใจ|refund|police|lawsuit/.test(s)) aliases.push("complaint", "general");
  if (/smell|bad_smell|กลิ่น|เหม็น|อับ/.test(s)) aliases.push("bad_smell", "general");
  aliases.push("customer_reply_style", "general", "");
  return uniqueStrings(aliases);
}

function queryVariants(query = "") {
  const q = cleanText(query, 500);
  const variants = [q];
  const words = q.match(/[A-Za-z0-9ก-๙]{2,}/g) || [];
  const important = words.filter((w) => !/^(ครับ|ค่ะ|คะ|จ้า|หน่อย|สอบถาม|อยาก|ช่วย|ได้ไหม|เท่าไหร่|วันนี้|พรุ่งนี้)$/i.test(w)).slice(0, 6);
  if (important.length) variants.push(important.join(" "));
  if (/ราคา|เท่าไหร่|กี่บาท|โปร/.test(q)) variants.push("ราคา โปร");
  if (/นัด|คิว|ว่าง|จอง/.test(q)) variants.push("นัด คิว จอง");
  if (/ไม่เย็น|น้ำหยด|รั่ว|ซ่อม|เสีย|error|โค้ด/i.test(q)) variants.push("ซ่อม อาการเสีย");
  if (/พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง|แบบไหน/.test(q)) variants.push("แพ็กเกจล้างแอร์");
  variants.push("");
  return uniqueStrings(variants);
}

function buildBrainSummary(items = [], limit = 14) {
  return dedupeItems(items).slice(0, limit).map((item, idx) => ({
    n: idx + 1,
    id: item.id,
    type: item.item_type,
    title: cleanText(item.title, 180),
    intent: cleanText(item.intent, 80),
    service_type: cleanText(item.service_type, 80),
    customer_stage: cleanText(item.customer_stage, 80),
    agent_key: cleanText(item.agent_key || "all", 40),
    priority: Number(item.priority || 0),
    confidence: Number(item.confidence || 0),
    risk_label: cleanText(item.risk_label, 80),
    source: cleanText(item.source, 80),
    content: cleanText(item.content, 1800),
  }));
}

async function buildCoreBrainContext(pool, params = {}) {
  if (!pool) return { available: false, reason: "missing_pool", items: [], summary: [] };
  await ensureAiBrainItemsTable(pool);
  const query = cleanText(params.query || params.customer_message || params.question || "", 800);
  const agentKey = mapAgentToBrainKey(params.agent_key || params.agent || "all");
  const language = cleanText(params.language || detectLanguage(query), 20);
  const requestedIntent = cleanText(params.intent || "", 120);
  const canonicalIntent = cleanText(inferIntent(query), 120);
  const intents = intentAliases(requestedIntent || canonicalIntent, query);
  const intent = intents[0] || canonicalIntent || "general";
  const serviceType = cleanText(params.service_type || inferServiceType(query), 120);
  const customerStage = cleanText(params.customer_stage || inferCustomerStage(query), 120);
  const limit = Math.max(6, Math.min(30, Number(params.limit || 16)));
  const batches = [];
  const agentFilter = agentKey === "all" ? "" : agentKey;
  const variants = queryVariants(query);

  // 1) Try role-specific + semantic aliases. Keep this small to avoid token bloat.
  for (const i of intents.slice(0, 5)) {
    for (const q of variants.slice(0, 3)) {
      try {
        batches.push(await loadAiBrainContext(pool, {
          query: q,
          agent_key: agentFilter,
          intent: i,
          service_type: serviceType,
          customer_stage: customerStage,
          language,
          limit: Math.ceil(limit / 2),
        }));
      } catch (_) {}
    }
  }

  // 2) Shared company rules for the same intent/service.
  for (const i of intents.slice(0, 5)) {
    try {
      batches.push(await loadAiBrainContext(pool, {
        query: "",
        agent_key: "all",
        intent: i,
        service_type: serviceType,
        customer_stage: customerStage,
        language,
        limit: Math.ceil(limit / 2),
      }));
    } catch (_) {}
  }

  // 3) Safety fallback: always bring a few high-priority shared rules/style/price items, so the brain is not empty.
  try {
    batches.push(await loadAiBrainContext(pool, {
      query: "",
      agent_key: "all",
      intent: "",
      service_type: serviceType,
      customer_stage: "",
      language,
      limit: Math.ceil(limit / 2),
    }));
  } catch (_) {}

  const items = dedupeItems(batches.flat()).slice(0, limit);
  return {
    available: items.length > 0,
    brain_name: "CWF Core Brain",
    rule: "Single shared company brain. All agents read this first; specialist agents may add overlays but must not bypass it.",
    query,
    agent_key: agentKey,
    inferred: { intent, requested_intent: requestedIntent, canonical_intent: canonicalIntent, intent_aliases: intents, service_type: serviceType, customer_stage: customerStage, language },
    items,
    summary: buildBrainSummary(items, limit),
    source_note: "ai_brain_items is the shared source of truth for CWF customer replies, training corrections, prices, policy, style, and service knowledge.",
  };
}

function formatCoreBrainForPrompt(coreBrain = {}) {
  const items = Array.isArray(coreBrain.summary) ? coreBrain.summary : [];
  if (!items.length) return "CWF_CORE_BRAIN: no active item matched; use static CWF facts and ask admin when unsure.";
  return [
    "CWF_CORE_BRAIN_SINGLE_SOURCE_OF_TRUTH:",
    "- All customer-facing agents must use this shared core brain first.",
    "- Role-specific expertise is only an overlay; do not ignore core rules/prices/style.",
    "- Approved/corrected training lessons are shared across agents.",
    "- item_type=bad_reply_pattern means DO NOT copy that answer; use it only as an avoid/negative lesson.",
    "- If facts conflict, policy_rule/pricing_rule/admin_correction with higher priority wins.",
    JSON.stringify({ inferred: coreBrain.inferred || {}, items }, null, 2),
  ].join("\n");
}

async function saveCoreBrainLesson(pool, input = {}) {
  if (!pool) return null;
  await ensureAiBrainItemsTable(pool);
  const customerMessage = cleanText(input.customer_message || input.selected_customer_question || "", 4000);
  const aiReply = cleanText(input.ai_reply || "", 4000);
  const finalReply = cleanText(input.final_admin_reply || input.corrected_reply || "", 4000);
  const verdict = cleanText(input.verdict || input.action_status || "approved", 80);
  const language = cleanText(input.language || detectLanguage(`${customerMessage}\n${finalReply || aiReply}`), 20);
  const intent = cleanText(input.intent || input.situation_type || inferIntent(`${customerMessage}\n${finalReply || aiReply}`), 120);
  const serviceType = cleanText(input.service_type || inferServiceType(`${customerMessage}\n${finalReply || aiReply}`), 120);
  const customerStage = cleanText(input.customer_stage || inferCustomerStage(`${customerMessage}\n${finalReply || aiReply}`), 120);
  const isRejected = /reject|wrong|ไม่ถูก|failed|bad|มั่ว|disliked|rejected/i.test(verdict);
  const isCorrection = Boolean(finalReply && finalReply !== aiReply);
  const itemType = isRejected ? "bad_reply_pattern" : (isCorrection ? "admin_correction" : "approved_reply");
  const content = isRejected
    ? [`ลูกค้าถาม: ${customerMessage}`, aiReply ? `คำตอบที่ห้ามใช้/ตอบผิด: ${aiReply}` : "", finalReply ? `แนวทางที่ควรใช้แทน: ${finalReply}` : "", input.reason ? `เหตุผล: ${cleanText(input.reason, 1000)}` : ""].filter(Boolean).join("\n")
    : [`ลูกค้าถาม: ${customerMessage}`, `คำตอบแอดมินที่อนุมัติ/สอนแล้ว: ${finalReply || aiReply}`].filter(Boolean).join("\n");
  if (!customerMessage || !content) return null;
  const tags = Array.isArray(input.tags) ? input.tags : ["shared_core_brain", "training", intent].filter(Boolean);
  const r = await pool.query(`
    INSERT INTO public.ai_brain_items(
      item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,is_active,metadata,created_by
    ) VALUES($1,$2,$3,$4,$5,$6,'all',$7,$8,$9,$10::jsonb,$11,$12,$13,$14,true,$15::jsonb,$16)
    RETURNING *
  `, [
    itemType,
    cleanText(input.title || `${itemType}: ${customerMessage}`, 240),
    content,
    intent,
    serviceType,
    customerStage,
    language,
    isRejected ? 72 : (isCorrection ? 96 : 90),
    isRejected ? 85 : 94,
    JSON.stringify(tags.map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 20)),
    cleanText(input.source || "admin_training_correction", 120),
    cleanText(input.source_file || "ai_training_auto_answers", 240),
    cleanText(input.source_version || "v36_shared_core_brain", 80),
    cleanText(input.risk_label || (isRejected ? "avoid" : ""), 80),
    JSON.stringify(Object.assign({ shared_core_brain: true, verdict, auto_answer_id: input.auto_answer_id || null, conversation_id: input.conversation_id || null, line_message_id: input.line_message_id || null }, input.metadata || {})),
    cleanText(input.created_by || "ai_training", 120),
  ]);
  return r.rows?.[0] || null;
}

module.exports = {
  buildCoreBrainContext,
  formatCoreBrainForPrompt,
  saveCoreBrainLesson,
  detectLanguage,
  mapAgentToBrainKey,
  boolValue,
};
