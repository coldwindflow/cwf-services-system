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

// Romanized Thai place/address tokens that must NOT be counted as "English".
// A Thai customer sharing a Google Maps pin often writes "Sukhumvit Soi 11, Bangkok"
// which previously tripped English detection. Strip these before judging language.
const ROMANIZED_TH_PLACE = new RegExp(
  "\\b(" +
  "soi|thanon|rd|road|alley|moo|mu|tambon|amphoe|amphur|khwaeng|khet|" +
  "bangkok|krung\\s*thep|nonthaburi|pathum|samut|prakan|sakhon|chon\\s*buri|" +
  "chiang\\s*mai|chiang\\s*rai|phuket|pattaya|rayong|nakhon|ratchasima|khon\\s*kaen|" +
  "sukhumvit|silom|sathorn|sathon|ratchada|ladprao|lat\\s*phrao|phaholyothin|" +
  "phahon\\s*yothin|rama|ratchaprarop|onnut|on\\s*nut|bearing|bangna|bang\\s*na|" +
  "ari|asok|asoke|thonglor|thong\\s*lor|ekkamai|phrom\\s*phong|chatuchak|" +
  "condo|tower|village|mansion|residence|building|floor|bldg|" +
  "google|maps|location|pin|map" +
  ")\\b", "gi"
);

function languageProbe(text = "") {
  return String(text || "")
    // strip links first (any URL, map link, www)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ")
    .replace(/goo\.gl\/\S*/gi, " ")
    .replace(/maps\.app\.goo\.gl\/\S+/gi, " ")
    .replace(/line\.me\/\S+/gi, " ")
    // strip romanized Thai place/address words so they don't read as English
    .replace(ROMANIZED_TH_PLACE, " ")
    // strip numbers, punctuation, symbols, emoji
    .replace(/[0-9+().,/:@_#&%*'"!?-]+/g, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u2190-\u21FF\u2B00-\u2BFF]/gu, " ")
    .trim();
}

// Single-message detection. "th" wins if any Thai char remains.
// Real English requires a few alphabetic words remaining AFTER place names are stripped.
function detectLanguage(text = "") {
  const s = languageProbe(text);
  if (/[\u0E00-\u0E7F]/.test(s)) return "th";
  if (/[ぁ-ゟ゠-ヿ]/.test(s)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(s)) return "ko";
  if (/[\u4e00-\u9fff]/.test(s)) return "zh";
  // require 2+ real alphabetic words (not just one leftover token) to call it English,
  // so a stray romanized fragment never flips a Thai customer to English.
  const words = (s.match(/[A-Za-z]{2,}/g) || []);
  if (words.length >= 2) return "en";
  if (words.length === 1 && words[0].length >= 4) return "en";
  return "unknown";
}

// Thread-aware detection: decide the reply language from the WHOLE inbound thread,
// not just the latest bubble. If the customer has ever written real Thai, stay Thai
// (a later location/map/English-looking pin must not flip the language). Only commit
// to English when inbound text is consistently English and has no Thai at all.
function detectThreadLanguage(messages = [], latestText = "") {
  const inbound = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.direction === "inbound") && m.message_text)
    .map((m) => String(m.message_text));
  if (latestText) inbound.push(String(latestText));
  if (!inbound.length) return detectLanguage(latestText);

  let thai = 0, english = 0;
  for (const msg of inbound) {
    const lang = detectLanguage(msg);
    if (lang === "th") thai += 1;
    else if (lang === "en") english += 1;
  }
  // Any genuine Thai in the thread -> reply Thai (covers TH customer who pasted a map pin).
  if (thai > 0) return "th";
  if (english > 0) return "en";
  // Nothing decisive (location-only / number-only thread): fall back to latest, else unknown.
  return detectLanguage(latestText) || "unknown";
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
  const baseRules = [
    "CWF_CORE_BRAIN_SINGLE_SOURCE_OF_TRUTH:",
    "- All customer-facing agents must use this shared core brain first.",
    "- CWF Professional Sales Admin Brain v2.8 is the customer-runtime sales brain: natural admin style, anti-loop, known_info/missing_info, and closing next step.",
    "- Role-specific expertise is only an overlay; do not ignore core rules/prices/style.",
    "- Approved/corrected training lessons are shared across agents.",
    "- item_type=bad_reply_pattern means DO NOT copy that answer; use it only as an avoid/negative lesson.",
    "- If facts conflict, policy_rule/pricing_rule/admin_correction/sales_admin_brain_v2_8 with higher priority wins.",
    "CUSTOMER_RUNTIME_HARD_RULES:",
    "- Reply like a real Coldwindflow sales admin, not AI, not a report, not a draft note.",
    "- Customer must see only customer_reply. Never expose confidence, risk, admin_note, JSON, phase, endpoint, or internal reasoning.",
    "- Before replying, infer known_info from the whole thread and ask only missing_info that is truly needed.",
    "- Do not ask for location again if map/location/address is already in the thread. Ask for date/time or aircon count instead.",
    "- Do not judge language from LINE display name, URL, emoji, phone number, or Google Maps link. If the thread has Thai, answer Thai. If location-only, use prior thread language.",
    "- Every safe customer reply must move the sale forward: price -> count/area/time, symptom -> inspection/needed info, booking -> missing booking field, location -> time/count.",
    "- Keep it short, warm, and natural: normally 1 bubble, no long bullets unless customer asked for full price details.",
  ];
  if (!items.length) return baseRules.concat(["CWF_CORE_BRAIN: no active item matched; use static CWF facts and ask admin when unsure."]).join("\n");
  return baseRules.concat([
    JSON.stringify({ inferred: coreBrain.inferred || {}, items }, null, 2),
  ]).join("\n");
}

// ── Deterministic conversation analysis (runs BEFORE the LLM) ──────────────
// This gives the model a hard, pre-computed view of what the thread already
// contains so it never re-asks for something the customer already gave, and
// always knows the single most useful next step. The LLM still writes the
// natural reply, but it is anchored to these facts instead of re-deriving them.

function analyzeThread(messages = [], latestText = "") {
  const inbound = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.direction === "inbound" && m.message_text)
    .map((m) => String(m.message_text));
  if (latestText) inbound.push(String(latestText));
  const blob = inbound.join("\n");
  const low = blob.toLowerCase();

  const known = {};
  const has = {};

  // location / map pin already shared?
  has.location = /https?:\/\/\S*(goo\.gl|maps\.app|google\.[a-z.]+\/maps)/i.test(blob)
    || /พิกัด|โลเคชั่น|โลเคชัน|ตำแหน่ง|แชร์location|ส่งแผนที่|ปักหมุด|location/i.test(low);
  if (has.location) known.location = "shared";

  // explicit address text (Thai address keywords) or a known BKK zone name
  has.address = /บ้านเลขที่|หมู่บ้าน|ซอย|ถนน|ต\.|อ\.|จ\.|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|คอนโด|หมู่ที่/i.test(blob)
    || /บางนา|สุขุมวิท|สีลม|สาทร|รัชดา|ลาดพร้าว|พหลโยธิน|อ่อนนุช|บางกะปิ|รามคำแหง|พระราม\s*\d|ทองหล่อ|เอกมัย|อโศก|จตุจักร|ดอนเมือง|นนทบุรี|ปทุมธานี|สมุทรปราการ|บางแค|บางซื่อ|ดินแดง|ห้วยขวาง|ประเวศ|บางเขน/i.test(blob);
  if (has.address) known.area = "given";

  // aircon count (เครื่อง / units)
  const countMatch = blob.match(/(\d+)\s*(เครื่อง|ตัว|units?|เคส)/i);
  if (countMatch) { has.count = true; known.aircon_count = Number(countMatch[1]); }

  // BTU / size
  const btuMatch = blob.match(/(\d{4,6})\s*(btu|บีทียู)/i);
  if (btuMatch) { has.btu = true; known.btu = Number(btuMatch[1]); }
  if (/\b(9000|12000|18000|24000|36000|48000)\b/.test(blob)) { has.btu = true; }

  // aircon type
  if (/ติดผนัง|ผนัง|wall/i.test(low)) { known.aircon_type = "wall"; has.type = true; }
  else if (/แขวน|ceiling|hanging/i.test(low)) { known.aircon_type = "hanging"; has.type = true; }
  else if (/ตู้ตั้ง|ตั้งพื้น|floor/i.test(low)) { known.aircon_type = "floor"; has.type = true; }
  else if (/สี่ทิศ|4 ?ทิศ|cassette|fourway|four-way/i.test(low)) { known.aircon_type = "cassette"; has.type = true; }

  // service type
  if (/ล้าง|clean|wash/i.test(low)) { known.service_type = "cleaning"; has.service = true; }
  else if (/ซ่อม|เสีย|ไม่เย็น|repair|fix/i.test(low)) { known.service_type = "repair"; has.service = true; }
  else if (/ติดตั้ง|install/i.test(low)) { known.service_type = "install"; has.service = true; }
  else if (/ย้าย|move|relocat/i.test(low)) { known.service_type = "relocate"; has.service = true; }

  // date / time preference
  const datetimeProbe = low.replace(/ไม่ค่อยเย็น|ไม่เย็น|ลมไม่เย็น|แอร์ไม่เย็น|not cold/gi, " ");
  has.datetime = /วันนี้|พรุ่งนี้|มะรืน|เสาร์|อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เช้า|บ่าย|เย็น|โมง|ทุ่ม|\d{1,2}[:.]\d{2}|วันที่\s*\d+|today|tomorrow|am|pm|\d+\s*(โมง|นาฬิกา)/i.test(datetimeProbe);
  if (has.datetime) known.preferred_time = "mentioned";

  // phone number
  const phoneMatch = blob.match(/0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}/);
  if (phoneMatch) { has.phone = true; known.phone = "given"; }

  // ── intent / sales stage ──
  let intent = "general";
  if (/ร้องเรียน|ไม่พอใจ|เสียหาย|เคลม|คืนเงิน|refund|police|ตำรวจ|ฟ้อง|lawsuit|ทนาย/i.test(low)) intent = "complaint";
  else if (/แพง|ลด|ส่วนลด|ทำไมราคา|expensive|discount/i.test(low)) intent = "price_objection";
  else if (/ราคา|เท่าไหร่|เท่าไร|กี่บาท|โปร|price|cost|how much/i.test(low)) intent = "price_question";
  else if (/ไม่เย็น|น้ำหยด|รั่ว|เสียงดัง|กลิ่น|เหม็น|error|[eEhHfF]\d/i.test(low)) intent = "repair_symptom";
  else if (/นัด|คิว|ว่าง|จอง|book|appointment|reserve/i.test(low)) intent = "booking";
  else if (/แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง|package/i.test(low)) intent = "package_question";

  // sales stage from accumulated info
  let stage = "discovery";
  if (has.location || has.address) stage = "has_location";
  if (has.count && (has.service || intent === "price_question")) stage = "qualifying";
  if ((has.count || has.service) && has.datetime) stage = "ready_to_book";
  if (intent === "repair_symptom") stage = "diagnose";
  if (intent === "complaint") stage = "admin_review";
  if (intent === "price_objection") stage = "objection";

  // ── missing_info: only what is TRULY needed for the next step ──
  const missing = [];
  if (intent === "repair_symptom") {
    if (!has.type) missing.push("aircon_type");
    if (!has.location && !has.address) missing.push("area_or_location");
  } else if (intent === "complaint") {
    // Risk cases must not be handled as normal sales discovery.
  } else if (intent === "price_question" || intent === "package_question" || known.service_type === "cleaning") {
    if (!has.count) missing.push("aircon_count");
    if (!has.type && !has.btu) missing.push("aircon_type_or_btu");
    if (!has.location && !has.address) missing.push("area_or_location");
    if (!has.datetime && (has.count || has.location)) missing.push("preferred_datetime");
  } else if (intent === "booking" || stage === "ready_to_book") {
    if (!has.count) missing.push("aircon_count");
    if (!has.datetime) missing.push("preferred_datetime");
    if (!has.location && !has.address) missing.push("area_or_location");
    if (!has.phone) missing.push("phone");
  } else {
    if (!has.service) missing.push("service_type");
  }

  // ── next_best_action: single most useful step ──
  let nextBestAction = "";
  if (intent === "complaint") {
    nextBestAction = "หยุดตอบเชิงขาย รับเรื่องสั้น ๆ อย่างสุภาพ และส่งให้แอดมินจริงตรวจสอบ";
  } else if (intent === "repair_symptom") {
    nextBestAction = "ช่วยคัดกรองอาการเบื้องต้น ไม่ฟันธง แล้วเสนอให้ช่างตรวจเช็ค (ค่าตรวจ 700) พร้อมถามพื้นที่/รุ่นถ้ายังไม่มี";
  } else if (intent === "price_objection") {
    nextBestAction = "ย้ำคุณค่า/มาตรฐานงาน ไม่ลดราคาเอง แล้วพาไปเช็กคิวหรือเริ่มจากแพ็กเกจปกติ";
  } else if (stage === "ready_to_book") {
    nextBestAction = "ข้อมูลพอแล้ว ปิดการขาย: ยืนยันจะเช็กคิวช่างให้ และขอสิ่งที่ขาดชิ้นสุดท้าย (เช่น เบอร์โทร) ถ้ามี";
  } else if (missing.length) {
    nextBestAction = `ถามเฉพาะ ${missing.slice(0, 2).join(" + ")} (ห้ามถามข้อมูลที่ลูกค้าให้แล้ว) แล้วบอกว่าจะเช็กคิวให้`;
  } else {
    nextBestAction = "พาไปเช็กคิว/นัดหมายให้เร็วที่สุด";
  }

  return {
    known_info: known,
    has,
    missing_info: missing.slice(0, 3),
    intent,
    sales_stage: stage,
    next_best_action: nextBestAction,
    already_has_location: !!(has.location || has.address),
    inbound_turns: inbound.length,
  };
}

function formatThreadAnalysisForPrompt(a = {}) {
  return [
    "PRE_COMPUTED_THREAD_ANALYSIS (authoritative — trust this over re-deriving):",
    JSON.stringify({
      known_info: a.known_info || {},
      missing_info: a.missing_info || [],
      intent: a.intent || "general",
      sales_stage: a.sales_stage || "discovery",
      next_best_action: a.next_best_action || "",
      already_has_location: !!a.already_has_location,
    }, null, 2),
    "HARD ANTI-LOOP RULES:",
    "- The fields in known_info are ALREADY given by the customer. NEVER ask for any of them again.",
    a.already_has_location
      ? "- Location/address is ALREADY in the thread. Do NOT ask for location/address. Acknowledge it and ask the next missing field instead."
      : "- Location not yet shared; you may ask for area or a map pin if it is in missing_info.",
    "- Ask ONLY fields listed in missing_info, at most 1-2, the most important first.",
    "- Follow next_best_action to move the sale forward. If missing_info is empty, close toward booking / checking the queue.",
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
  detectThreadLanguage,
  analyzeThread,
  formatThreadAnalysisForPrompt,
  mapAgentToBrainKey,
  boolValue,
};
