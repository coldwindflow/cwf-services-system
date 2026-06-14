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

function parseNumberText(value = "") {
  const n = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────
// PRICE TABLES (source of truth — edit here only)
// ─────────────────────────────────────────────────
const CLEANING_PACKAGE_DETAILS = {
  "ล้างปกติ": "ล้างฟิลเตอร์ คอยล์เย็น คอยล์ร้อน และฉีดอัดท่อน้ำทิ้ง เหมาะกับแอร์ที่ใช้งานปกติ/ล้างตามรอบ",
  "ล้างพรีเมียม": "ล้างละเอียดขึ้น ถอดรางน้ำทิ้ง ล้างโพรงกระรอก และฉีดอัดท่อน้ำทิ้ง เหมาะกับแอร์สกปรก มีกลิ่น หรืออยากล้างลึกกว่าแบบปกติ",
  "แขวนคอยล์": "ถอดแผงไฟ ยก/แขวนคอยล์ ล้างถาดหลังและซอกด้านใน เหมาะกับแอร์น้ำหยดหรือมีคราบสะสมด้านหลัง",
  "ตัดล้างใหญ่": "ถอดล้างทั้งตัว ทำความสะอาดครบระบบ เหมาะกับแอร์สกปรกหนัก ไม่ได้ล้างนาน หรือมีอาการสะสมมาก",
};

const WALL_AC_TIERS = {
  small: {
    label: "แอร์ผนังไม่เกิน 15,000 BTU",
    btu_range: "≤15,000",
    packages: [
      ["ล้างปกติ",     550],
      ["ล้างพรีเมียม", 790],
      ["แขวนคอยล์",   1290],
      ["ตัดล้างใหญ่", 1850],
    ],
    recommend: "ถ้าแอร์ใช้งานปกติ แนะนำเริ่มจากล้างปกติหรือพรีเมียมก็พอค่ะ",
  },
  large: {
    label: "แอร์ผนังมากกว่า 15,000 BTU",
    btu_range: ">15,000",
    packages: [
      ["ล้างปกติ",     690],
      ["ล้างพรีเมียม", 990],
      ["แขวนคอยล์",   1550],
      ["ตัดล้างใหญ่", 2150],
    ],
    recommend: "ถ้าแอร์ใช้งานปกติ แนะนำเริ่มจากล้างปกติหรือพรีเมียมก็พอค่ะ",
  },
};


function buildWallPriceLinesForTier(tier, count = 0) {
  return tier.packages.map(([name, unit_price]) => {
    const detail = CLEANING_PACKAGE_DETAILS[name] || "";
    if (count > 0) {
      const total = unit_price * count;
      return `- ${name} ${unit_price.toLocaleString("th-TH")} x ${count} = ${total.toLocaleString("th-TH")} บาท — ${detail}`;
    }
    return `- ${name} ${unit_price.toLocaleString("th-TH")} บาท/เครื่อง — ${detail}`;
  });
}

function buildWallPackagesForTier(tier, count = 0) {
  return tier.packages.map(([name, unit_price]) => ({
    name,
    unit_price,
    count: count || null,
    total: count > 0 ? unit_price * count : null,
    detail: CLEANING_PACKAGE_DETAILS[name] || "",
  }));
}

function buildWaterLeakCleaningAdvice(known = {}) {
  const count = Number(known.aircon_count || 0);
  const btu = Number(known.btu || 0);
  const intro = "อาการแอร์น้ำหยด เบื้องต้นแนะนำเป็นงานแขวนคอยล์ก่อนค่ะ เพราะมักมีคราบฝังลึก เชื้อรา หรือคราบสะสมบริเวณถาดหลัง/ซอกด้านในที่ล้างปกติออกได้ค่อนข้างยาก";
  const close = count > 0
    ? "ลูกค้าสะดวกส่งพื้นที่/โลเคชันให้แอดมินเช็กคิวช่างได้เลยค่ะ"
    : "รบกวนแจ้งจำนวนเครื่อง BTU และพื้นที่/โลเคชัน เดี๋ยวแอดมินคำนวณยอดรวมและเช็กคิวช่างให้ค่ะ";

  if (btu > 0) {
    const tier = btu <= 15000 ? WALL_AC_TIERS.small : WALL_AC_TIERS.large;
    const packages = buildWallPackagesForTier(tier, count);
    const lines = buildWallPriceLinesForTier(tier, count);
    return {
      type: "wall_ac_water_leak_cleaning",
      type_key: "wall",
      type_label: tier.label,
      btu,
      count: count || null,
      tier_label: tier.label,
      packages,
      lines,
      require_package_explanations: true,
      recommendation: "กรณีน้ำหยด แนะนำแขวนคอยล์เป็นหลัก เพราะช่วยล้างถาดหลังและซอกด้านในได้ลึกกว่าแบบปกติค่ะ",
      customer_reply: [
        intro,
        `${tier.label} ราคาโปรตามนี้ค่ะ`,
        ...lines,
        "กรณีน้ำหยด แนะนำแขวนคอยล์เป็นหลัก เพราะล้างได้ลึกถึงถาดหลังและซอกด้านในค่ะ",
        close,
      ].join("\n"),
    };
  }

  const smallLines = buildWallPriceLinesForTier(WALL_AC_TIERS.small, count);
  const largeLines = buildWallPriceLinesForTier(WALL_AC_TIERS.large, count);
  const packages = buildWallPackagesForTier(WALL_AC_TIERS.small, count)
    .concat(buildWallPackagesForTier(WALL_AC_TIERS.large, count).map((p) => Object.assign({}, p, { name: `${p.name} (มากกว่า 15,000 BTU)` })));
  return {
    type: "wall_ac_water_leak_cleaning",
    type_key: "wall",
    type_label: "แอร์ผนังน้ำหยด",
    btu: null,
    count: count || null,
    tier_label: "ต้องทราบ BTU เพื่อเลือกเรตราคา",
    packages,
    lines: ["กลุ่มไม่เกิน 15,000 BTU:", ...smallLines, "กลุ่มมากกว่า 15,000 BTU:", ...largeLines],
    require_package_explanations: true,
    recommendation: "กรณีน้ำหยด แนะนำแขวนคอยล์เป็นหลัก เพราะช่วยล้างถาดหลังและซอกด้านในได้ลึกกว่าแบบปกติค่ะ",
    customer_reply: [
      intro,
      "ราคาล้างแอร์ผนังโปรตามนี้ค่ะ",
      "กลุ่มไม่เกิน 15,000 BTU:",
      ...smallLines,
      "กลุ่มมากกว่า 15,000 BTU:",
      ...largeLines,
      "กรณีน้ำหยด แนะนำแขวนคอยล์เป็นหลัก เพราะล้างได้ลึกถึงถาดหลังและซอกด้านในค่ะ",
      close,
    ].join("\n"),
  };
}

const FLAT_RATE_TYPES = {
  cassette:  { label: "แอร์สี่ทิศทาง",    unit_price: 1500, note: "ราคาเริ่มต้นสำหรับหน้างานมาตรฐานนะคะ ถ้าหน้างานเข้าถึงยากหรืออยู่สูงช่างจะแจ้งก่อนเริ่มงานค่ะ" },
  hanging:   { label: "แอร์แขวน",          unit_price: 1200, note: "ราคาเริ่มต้นสำหรับหน้างานมาตรฐานนะคะ ถ้าหน้างานเข้าถึงยากหรืออยู่สูงช่างจะแจ้งก่อนเริ่มงานค่ะ" },
  concealed: { label: "แอร์เปลือย/ใต้ฝ้า", unit_price: 1200, note: "ราคาเริ่มต้นสำหรับหน้างานมาตรฐานนะคะ ถ้าหน้างานเข้าถึงยากช่างจะแจ้งก่อนเริ่มงานค่ะ" },
  // floor (ตู้ตั้ง) ยังไม่มีราคายืนยันในคลัง → คืน null → guided_reply ถามต่อ
};

/**
 * buildPriceQuote — คำนวณราคาทุก type / BTU
 * คืน null เมื่อข้อมูลไม่พอหรือประเภทไม่รู้ราคา (guard จะ guided_reply ถามต่อ)
 */
function buildPriceQuote(known = {}) {
  const type  = String(known.aircon_type || "").toLowerCase();
  const count = Number(known.aircon_count || 0);
  const btu   = Number(known.btu || 0);

  // ── FLAT RATE TYPES (แขวน / สี่ทิศ / เปลือย) ──────────────────────────────
  if (FLAT_RATE_TYPES[type]) {
    const { label, unit_price, note } = FLAT_RATE_TYPES[type];
    const total = count > 0 ? unit_price * count : null;
    const countLine = count > 0
      ? `${count} เครื่อง รวม ${total.toLocaleString("th-TH")} บาทค่ะ`
      : null;
    const packages = [{ name: `ล้าง${label}`, unit_price, count: count || null, total }];
    const lines = count > 0
      ? [`- ล้าง${label} ${unit_price.toLocaleString("th-TH")} x ${count} = ${total.toLocaleString("th-TH")} บาท`]
      : [`- ล้าง${label} ${unit_price.toLocaleString("th-TH")} บาท/เครื่อง`];
    const customer_reply = [
      `${label} ล้างราคา ${unit_price.toLocaleString("th-TH")} บาท/เครื่องค่ะ`,
      countLine,
      note,
      count > 0 ? "ลูกค้าสะดวกให้ช่างเข้าเช็กคิววันไหนคะ" : "ลูกค้าล้างกี่เครื่องคะ",
    ].filter(Boolean).join("\n");
    return {
      type: "flat_rate_cleaning",
      type_key: type,
      type_label: label,
      unit_price,
      count: count || null,
      total,
      packages,
      lines,
      recommendation: "ลูกค้าสะดวกให้ช่างเข้าเช็กคิววันไหนคะ",
      customer_reply,
    };
  }

  // ── WALL AC (multi-package, BTU tiers) ────────────────────────────────────
  if (type !== "wall" && type !== "") return null; // unknown/floor type

  // ไม่มี BTU → แสดงราคาทั้งสองกลุ่ม BTU (ตามสเปก) แล้วค่อยถาม BTU เพื่อเลือก tier
  if (!btu) {
    if (type !== "wall") return null; // ต้องรู้ว่าเป็นผนังก่อน (กันคำถามราคาลอย ๆ)
    const smallLines = buildWallPriceLinesForTier(WALL_AC_TIERS.small, count);
    const largeLines = buildWallPriceLinesForTier(WALL_AC_TIERS.large, count);
    const countNote = count > 0 ? `สำหรับ ${count} เครื่อง ` : "";
    const customer_reply = [
      `แอร์ผนังมีราคาตาม BTU ${count > 0 ? `(คิดราคา ${count} เครื่องให้แล้ว) ` : ""}2 กลุ่มค่ะ`,
      ``,
      `${WALL_AC_TIERS.small.label}`,
      ...smallLines,
      ``,
      `${WALL_AC_TIERS.large.label}`,
      ...largeLines,
      ``,
      `${WALL_AC_TIERS.small.recommend}`,
      `รบกวนเช็กที่ตัวเครื่องหน่อยนะคะว่ากี่ BTU ${countNote}เดี๋ยวแจ้งราคาที่ตรงรุ่นให้ค่ะ`,
    ].join("\n");
    return {
      type: "wall_ac_cleaning_promo_both_tiers",
      type_key: "wall",
      type_label: "แอร์ผนัง (ทั้งสองกลุ่ม BTU)",
      btu: null,
      count: count || null,
      both_tiers: true,
      require_package_explanations: true,
      lines: [
        `[${WALL_AC_TIERS.small.label}]`, ...smallLines,
        `[${WALL_AC_TIERS.large.label}]`, ...largeLines,
      ],
      packages: [
        ...buildWallPackagesForTier(WALL_AC_TIERS.small, count),
        ...buildWallPackagesForTier(WALL_AC_TIERS.large, count),
      ],
      tiers: [
        { label: WALL_AC_TIERS.small.label, packages: buildWallPackagesForTier(WALL_AC_TIERS.small, count) },
        { label: WALL_AC_TIERS.large.label, packages: buildWallPackagesForTier(WALL_AC_TIERS.large, count) },
      ],
      needs_btu_to_pick_tier: true,
      recommendation: `${WALL_AC_TIERS.small.recommend} รบกวนแจ้ง BTU เพื่อเลือกกลุ่มราคาที่ตรงรุ่นค่ะ`,
      customer_reply,
    };
  }

  const tier = btu <= 15000 ? WALL_AC_TIERS.small : WALL_AC_TIERS.large;

  const packages = buildWallPackagesForTier(tier, count);
  const lines = buildWallPriceLinesForTier(tier, count);
  return {
    type: "wall_ac_cleaning_promo",
    type_key: "wall",
    type_label: tier.label,
    btu,
    count: count || null,
    tier_label: tier.label,
    packages,
    lines,
    require_package_explanations: true,
    recommendation: `${tier.recommend} ลูกค้าสะดวกให้ช่างเข้าเช็กคิววันไหนคะ`,
    customer_reply: [
      `${tier.label} ราคาโปรตามนี้ค่ะ`,
      ...lines,
      `${tier.recommend} ลูกค้าสะดวกให้ช่างเข้าเช็กคิววันไหนคะ`,
    ].join("\n"),
  };
}

// backward-compat alias (เดิมใช้ชื่อนี้ใน analyzeThread — จะแทนที่ด้านล่างด้วย)
const buildWallAcPriceQuote = buildPriceQuote;

function analyzeThread(messages = [], latestText = "") {
  const inbound = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.direction === "inbound" && m.message_text)
    .map((m) => String(m.message_text));
  if (latestText) inbound.push(String(latestText));
  const blob = inbound.join("\n");
  const low = blob.toLowerCase();

  const known = {};
  const has = {};
  const isPriceQuestion = /ราคา|เท่าไหร่|เท่าไร|กี่บาท|ราคาทั้งหมด|price|cost|how much/i.test(low);
  const isWaterLeakSymptom = /น้ำหยด|หยดน้ำ|น้ำแอร์หยด|แอร์มีน้ำหยด|น้ำรั่วจากแอร์|แอร์น้ำรั่ว|แอร์มีน้ำรั่ว|แอร์รั่วน้ำ|น้ำแอร์ไหล|แอร์มีน้ำไหล|แอร์น้ำไหล|น้ำแอร์รั่ว/i.test(low);
  const isRepairCheckFeeQuestion = /ค่าตรวจ|ตรวจเช็ค|ตรวจเช็ก|เช็คอาการ|เช็กอาการ/i.test(low);

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
  const btuMatch = blob.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s*(btu|บีทียู)/i);
  if (btuMatch) { has.btu = true; known.btu = parseNumberText(btuMatch[1]); }
  const standaloneBtu = blob.match(/\b(9000|9200|12000|15000|17000|18000|24000|36000|48000)\b/);
  if (!has.btu && standaloneBtu) { has.btu = true; known.btu = parseNumberText(standaloneBtu[1]); }

  // aircon type — ลำดับสำคัญ: เช็ก specific ก่อน generic
  // หมายเหตุ: "แขวนคอยล์" = ชื่อแพ็กเกจล้าง ไม่ใช่ชนิดแอร์ → ต้องไม่ตีเป็น hanging
  const mentionsCoilHangPackage = /แขวนคอยล์/i.test(low);
  const lowNoCoilPackage = low.replace(/แขวนคอยล์/gi, " ");
  if (/ติดผนัง|ผนัง|wall/i.test(lowNoCoilPackage)) { known.aircon_type = "wall"; has.type = true; }
  else if (/สี่ทิศ|4 ?ทิศ|cassette|fourway|four-way/i.test(lowNoCoilPackage)) { known.aircon_type = "cassette"; has.type = true; }
  else if (/แขวนฝ้า|ใต้ฝ้า|เปลือย|concealed|duct/i.test(lowNoCoilPackage)) { known.aircon_type = "concealed"; has.type = true; }
  else if (/แอร์แขวน|ล้างแอร์แขวน|แขวนเพดาน|ceiling|hanging/i.test(lowNoCoilPackage)) { known.aircon_type = "hanging"; has.type = true; }
  else if (/ตู้ตั้ง|ตั้งพื้น|floor standing/i.test(lowNoCoilPackage)) { known.aircon_type = "floor"; has.type = true; }
  // ถ้าพูดถึง "แขวนคอยล์" ลอย ๆ โดยไม่ระบุชนิดแอร์ → ถือเป็นคำถามแพ็กเกจ ไม่กำหนด type
  if (mentionsCoilHangPackage && !has.type) { known.package_mentioned = "แขวนคอยล์"; }

  // service type
  if (isWaterLeakSymptom) { known.service_type = "cleaning"; known.aircon_type = known.aircon_type || "wall"; has.service = true; has.type = true; }
  else if (/ล้าง|clean|wash/i.test(low)) { known.service_type = "cleaning"; has.service = true; }
  else if (/ซ่อม|เสีย|ไม่เย็น|repair|fix/i.test(low)) { known.service_type = "repair"; has.service = true; }
  else if (/ติดตั้ง|install/i.test(low)) { known.service_type = "install"; has.service = true; }
  else if (/ย้าย|move|relocat/i.test(low)) { known.service_type = "relocate"; has.service = true; }
  else if (isPriceQuestion && (has.type || has.btu)) { known.service_type = "cleaning"; has.service = true; }

  // date / time preference
  const datetimeProbe = low.replace(/ไม่ค่อยเย็น|ไม่เย็น|ลมไม่เย็น|แอร์ไม่เย็น|not cold/gi, " ");
  has.datetime = /วันนี้|พรุ่งนี้|มะรืน|เสาร์|อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เช้า|บ่าย|เย็น|โมง|ทุ่ม|\d{1,2}[:.]\d{2}|วันที่\s*\d+|today|tomorrow|am|pm|\d+\s*(โมง|นาฬิกา)/i.test(datetimeProbe);
  if (has.datetime) known.preferred_time = "mentioned";

  // phone number
  const phoneMatch = blob.match(/0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}/);
  if (phoneMatch) { has.phone = true; known.phone = "given"; }

  // ── intent / sales stage ──
  let intent = "general";
  const looksLikeRepairSymptom = /ไม่เย็น|ไม่ค่อยเย็น|ลมไม่เย็น|รั่ว|เสียงดัง|กลิ่น|เหม็น|error|โค้ด|[eEhHfF]\d|ซ่อม|เสีย|ค่าตรวจ|ตรวจเช็ค|ตรวจเช็ก|เช็คอาการ|เช็กอาการ/i.test(low);
  if (/ร้องเรียน|ไม่พอใจ|เสียหาย|เคลม|คืนเงิน|เงินคืน|refund|police|ตำรวจ|ฟ้อง|lawsuit|ทนาย|เอาเรื่อง|ดำเนินคดี|ผิดหวัง|แย่มาก|ไม่โอเค|ไม่โอเก|ช่างทำ.*(พัง|เสีย|หัก|แตก|รั่ว)|พังหลังช่าง|เสียหลังช่าง|พังเพราะช่าง/i.test(low)) intent = "complaint";
  else if (/แพง|ลด|ส่วนลด|ทำไมราคา|expensive|discount/i.test(low)) intent = "price_objection";
  else if (isWaterLeakSymptom) intent = "water_leak_cleaning";
  else if (looksLikeRepairSymptom) intent = "repair_symptom";
  else if (isPriceQuestion) intent = "price_question";
  else if (/นัด|คิว|ว่าง|จอง|book|appointment|reserve/i.test(low)) intent = "booking";
  else if (/แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง|package/i.test(low)) intent = "package_question";

  // sales stage from accumulated info
  let stage = "discovery";
  if (has.location || has.address) stage = "has_location";
  if (has.count && (has.service || intent === "price_question")) stage = "qualifying";
  if ((has.count || has.service) && has.datetime) stage = "ready_to_book";
  if (intent === "water_leak_cleaning") stage = "qualifying";
  if (intent === "repair_symptom") stage = "diagnose";
  if (intent === "complaint") stage = "admin_review";
  if (intent === "price_objection") stage = "objection";

  // ── missing_info: only what is TRULY needed for the next step ──
  const missing = [];
  if (intent === "water_leak_cleaning") {
    if (!has.count) missing.push("aircon_count");
    if (!has.btu) missing.push("aircon_btu");
    if (!has.location && !has.address) missing.push("area_or_location");
  } else if (intent === "repair_symptom") {
    if (!has.type) missing.push("aircon_type");
    if (!has.location && !has.address) missing.push("area_or_location");
  } else if (intent === "complaint") {
    // Risk cases must not be handled as normal sales discovery.
  } else if (intent === "price_question" || intent === "package_question" || known.service_type === "cleaning") {
    if (!has.count) missing.push("aircon_count");
    if (!has.type && !has.btu) missing.push("aircon_type_or_btu");
    if (!isPriceQuestion && !has.location && !has.address) missing.push("area_or_location");
    if (!isPriceQuestion && !has.datetime && (has.count || has.location)) missing.push("preferred_datetime");
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
  } else if (intent === "water_leak_cleaning") {
    nextBestAction = "อาการน้ำหยดให้แนะนำแขวนคอยล์ก่อน เพราะมักมีคราบฝังลึก/เชื้อรา/คราบถาดหลังที่ล้างปกติออกยาก ห้ามเสนอค่าตรวจ 700 เว้นแต่เป็นแอร์เสีย/ปัญหาอื่นที่ไม่ใช่น้ำหยด";
  } else if (intent === "repair_symptom") {
    nextBestAction = "ช่วยคัดกรองอาการเบื้องต้น ไม่ฟันธง แล้วเสนอให้ช่างตรวจเช็ค (ค่าตรวจ 700 หักลดค่าซ่อมได้ สำหรับแอร์เสีย/แอร์มีปัญหาที่ไม่ใช่น้ำหยด) พร้อมถามพื้นที่/รุ่นถ้ายังไม่มี";
  } else if (intent === "price_objection") {
    nextBestAction = "ย้ำคุณค่า/มาตรฐานงาน ไม่ลดราคาเอง แล้วพาไปเช็กคิวหรือเริ่มจากแพ็กเกจปกติ";
  } else if (intent === "price_question") {
    const quote = buildPriceQuote(known);
    nextBestAction = quote
      ? `ตอบราคาโปรก่อนทันที ห้ามถามวันเวลา/เช็กคิวก่อนตอบราคา ใช้รายการนี้: ${quote.lines.join(" | ")} แล้วปิดการขายด้วย: ${quote.recommendation}`
      : "ตอบราคาเท่าที่คำนวณได้ก่อน ถ้าขาดจำนวนเครื่องหรือ BTU/ประเภทแอร์ ให้ถามเฉพาะข้อมูลนั้นเพื่อคำนวณราคา ห้ามถามวันเวลา/คิวก่อนตอบราคา";
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
    price_quote: intent === "water_leak_cleaning" ? buildWaterLeakCleaningAdvice(known) : (intent === "price_question" ? buildPriceQuote(known) : null),
    repair_check_reply: intent === "repair_symptom"
      ? "อาการนี้ต้องให้ช่างตรวจหน้างานก่อนนะคะ ยังไม่ฟันธงว่าอะไหล่ตัวไหนเสียได้ ค่าตรวจเช็คซ่อมเบื้องต้น 700 บาทค่ะ ค่าตรวจนำไปหักลดค่าซ่อมได้ ใช้กับเคสแอร์เสีย/แอร์มีปัญหาที่ไม่ใช่อาการน้ำหยดนะคะ ถ้าลูกค้าสะดวก รบกวนแจ้งพื้นที่/โลเคชัน และอาการที่เจอเพิ่มเติม เดี๋ยวแอดมินช่วยเช็กคิวช่างให้ค่ะ"
      : null,
    // ลูกค้าถามราคา/ค่าตรวจ/ซ่อมเท่าไหร่ ในเคสแอร์เสีย (ไม่ใช่น้ำหยด) → ต้อง enforce 700
    repair_check_fee_question: intent === "repair_symptom" && (isRepairCheckFeeQuestion || isPriceQuestion || /ซ่อมเท่าไหร่|ซ่อมกี่บาท|ซ่อมราคา|เท่าไหร่|กี่บาท/i.test(low)),
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
      price_quote: a.price_quote || null,
      repair_check_reply: a.repair_check_reply || null,
      already_has_location: !!a.already_has_location,
    }, null, 2),
    "HARD ANTI-LOOP RULES:",
    "- If intent is price_question, answer the price FIRST. Do not ask date/time, queue, or booking questions before giving the price, unless aircon_count or aircon_type_or_btu is truly missing.",
    "- If PRE_COMPUTED_THREAD_ANALYSIS.price_quote is present, use every package line exactly as the price basis, include totals when count is present, then naturally ask for preferred service date/time to close.",
    "- If intent is water_leak_cleaning, recommend แขวนคอยล์ first because water leak often comes from deep dirt/mold/hidden drain-tray buildup; do NOT offer the 700 baht repair check fee for water-leak-only cases.",
    "- The fields in known_info are ALREADY given by the customer. NEVER ask for any of them again.",
    a.already_has_location
      ? "- Location/address is ALREADY in the thread. Do NOT ask for location/address. Acknowledge it and ask the next missing field instead."
      : "- Location not yet shared; you may ask for area or a map pin if it is in missing_info.",
    "- Ask ONLY fields listed in missing_info, at most 1-2, the most important first.",
    "- Follow next_best_action to move the sale forward. If missing_info is empty, close toward booking / checking the queue.",
  ].join("\n");
}

function uniqueArray(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((x) => cleanText(x, 120)).filter(Boolean)));
}

function hasCoreBrainEvidence(coreBrain = {}) {
  if (Array.isArray(coreBrain.summary) && coreBrain.summary.length) return true;
  if (Array.isArray(coreBrain.items) && coreBrain.items.length) return true;
  if (coreBrain.inferred && Object.keys(coreBrain.inferred).length) return true;
  return false;
}

function buildTrainingCard(reason = "", nextBestAction = "") {
  return {
    title: "AI ยังไม่ควรตอบเคสนี้",
    reason: cleanText(reason || "เคสนี้ต้องให้แอดมินตรวจและสอนก่อน", 800),
    instruction: "ควรให้แอดมินสอนคำตอบที่ถูกต้อง",
    customer_reply: "",
    next_best_action: cleanText(nextBestAction || "เปิดช่องสอนคำตอบที่ถูกต้องก่อนนำไปใช้จริง", 500),
    internal_only: true,
    no_line_send: true,
  };
}

function replyDecisionBadge(mode = "") {
  if (mode === "safe_reply") return "ตอบได้";
  if (mode === "guided_reply") return "ต้องถามต่อ";
  if (mode === "admin_only") return "AI ยังไม่ควรตอบ";
  if (mode === "needs_teaching") return "ต้องสอนก่อน";
  return "ต้องตรวจ";
}

function buildReplyDecisionGuard(input = {}) {
  const threadAnalysis = input.threadAnalysis || {};
  const coreBrain = input.coreBrain || {};
  const language = cleanText(input.language || "", 30);
  const text = cleanText(input.customerMessage || input.customer_message || input.selected_customer_question || "", 6000);
  const low = text.toLowerCase();
  const intent = cleanText(threadAnalysis.intent || input.intent || "general", 80);
  const knownInfo = Object.assign({}, threadAnalysis.known_info || {});
  let missingInfo = uniqueArray(threadAnalysis.missing_info || []);
  const nextBestAction = cleanText(threadAnalysis.next_best_action || "", 800);
  const priceQuote = threadAnalysis.price_quote || null;
  const priceAsk = intent === "price_question" || intent === "water_leak_cleaning" || /ราคา|เท่าไหร่|เท่าไร|กี่บาท|ราคาทั้งหมด|price|how much/i.test(low);

  const adminOnlyRules = [
    { key: "complaint_or_claim", re: /ร้องเรียน|ไม่พอใจ|โวย|เสียหาย|เคลม|รับผิดชอบ|งานเสีย|ช่างทำ.*(พัง|เสีย|หัก|แตก|รั่ว)|ช่างทำของ.*เสีย|พังหลังช่าง|เสียหลังช่าง|พังเพราะช่าง|ผิดหวัง|แย่มาก|ไม่โอเค|ไม่โอเก|complain|complaint|claim|damage/i, reason: "ลูกค้าร้องเรียน/งานเสียหาย/เคลม ต้องให้แอดมินรับเรื่องเอง" },
    { key: "legal_threat", re: /คืนเงิน|เงินคืน|ขอคืนเงิน|แจ้งตำรวจ|ตำรวจ|ฟ้อง|ทนาย|เอาเรื่อง|ดำเนินคดี|รีวิวเสีย|รีวิวไม่ดี|refund|police|lawsuit|lawyer|bad review/i, reason: "มีความเสี่ยงด้านกฎหมายหรือชื่อเสียง ต้องให้แอดมินจัดการ" },
    { key: "technician_conflict", re: /ช่าง.*(ผิด|สาย|พูดไม่ดี|ทะเลาะ|ด่า|ไม่สุภาพ)|มาสาย|technician.*(late|rude|wrong)|conflict/i, reason: "เป็นประเด็นช่าง/ความขัดแย้งกับลูกค้า ต้องให้แอดมินตรวจสอบ" },
    { key: "money_exception", re: /โอนเงินผิด|เงินผิด|ยอดผิด|มัดจำ|คืนมัดจำ|deposit|wrong transfer|payment error/i, reason: "เรื่องเงินผิดปกติหรือมัดจำ ห้าม AI เดา ต้องให้แอดมินตรวจสอบ" },
    { key: "tax_invoice", re: /ใบกำกับภาษี|ใบเสร็จภาษี|tax invoice|vat invoice/i, reason: "เรื่องใบกำกับภาษีเป็น policy เฉพาะ ต้องให้แอดมินตอบตามนโยบายจริง" },
    { key: "special_discount", re: /ลดพิเศษ|ส่วนลดพิเศษ|ราคาพิเศษ|ลดนอกโปร|ถูกกว่านี้|ต่ำกว่านโยบาย|special discount|lower price|below policy/i, reason: "ลูกค้าขอส่วนลดพิเศษนอกโปร ห้าม AI ต่อรองเอง" },
    { key: "real_queue_confirm", re: /ยืนยันคิว|คิวจริง|คอนเฟิร์มคิว|confirm.*(booking|queue)|available slot/i, reason: "การยืนยันคิวจริงต้องอ่านคิวจากระบบก่อน ห้าม AI ยืนยันเอง" },
    { key: "deep_repair_diagnosis", re: /อะไหล่เสีย|คอมเพรสเซอร์|แผงวงจร|มอเตอร์เสีย|น้ำยาแอร์หมดแน่|ฟันธง|compressor|pcb|control board|part.*broken/i, reason: "งานซ่อมลึกหรือฟันธงอะไหล่เสียต้องให้ช่าง/แอดมินตรวจ" },
    { key: "electrical_safety", re: /ไฟฟ้า|ไฟช็อต|ช็อต|ไหม้|กลิ่นไหม้|ประกายไฟ|ไฟรั่ว|เบรกเกอร์|อันตราย|electric|shock|burning smell|spark|breaker|safety/i, reason: "มีความเสี่ยงไฟฟ้าหรือความปลอดภัย ต้องให้แอดมินจัดการอย่างระมัดระวัง" },
    { key: "sensitive_info", re: /บัตรประชาชน|เลขบัตร|เลขบัญชี|ข้อมูลส่วนตัว|รหัสผ่าน|otp|password|id card|bank account|personal data/i, reason: "เกี่ยวข้องกับข้อมูลส่วนตัวหรือข้อมูลที่ไม่ควรเดา ต้องให้แอดมินดูแล" },
  ];

  const matchedAdminOnly = adminOnlyRules.find((rule) => rule.re.test(low));
  if (intent === "complaint" || matchedAdminOnly) {
    const reason = matchedAdminOnly?.reason || "ลูกค้าร้องเรียนหรือมีความเสี่ยงสูง ต้องให้แอดมินตอบเอง";
    return {
      can_answer: false,
      mode: "admin_only",
      reason,
      missing_info: missingInfo,
      known_info: knownInfo,
      next_best_action: "ส่งให้แอดมินตรวจเคสและสอนคำตอบที่ถูกต้อง ห้ามสร้างคำตอบขายให้ลูกค้า",
      intent,
      sales_stage: threadAnalysis.sales_stage || "admin_review",
      price_quote: priceQuote,
      badge_label: replyDecisionBadge("admin_only"),
      training_card: buildTrainingCard(reason, "ส่งให้แอดมินตรวจเคสและสอนคำตอบที่ถูกต้อง"),
    };
  }

  if (priceAsk && intent !== "repair_symptom") {
    if (priceQuote) {
      // both-tier quote (ยังไม่รู้ BTU) → ตอบราคาทั้งสองกลุ่มได้ แต่ยังต้องถาม BTU/count ต่อ = guided
      const stillNeedsInfo = priceQuote.needs_btu_to_pick_tier === true || missingInfo.length > 0;
      const priceMode = stillNeedsInfo ? "guided_reply" : "safe_reply";
      return {
        can_answer: true,
        mode: priceMode,
        reason: stillNeedsInfo
          ? "ลูกค้าถามราคา ตอบราคาทั้งสองกลุ่ม BTU ได้เลย แต่ยังต้องถาม BTU/จำนวนเครื่องเพื่อระบุกลุ่มที่ตรงรุ่น ห้ามถามวันเวลา"
          : "ลูกค้าถามราคาและมีข้อมูลพอคำนวณ ต้องตอบราคาโปรก่อนถามวันเวลา",
        missing_info: missingInfo,
        known_info: knownInfo,
        next_best_action: nextBestAction || "ตอบราคาโปรครบทุกประเภท รวมยอดตามจำนวนเครื่อง แล้วถามวันเวลาปิดการขาย",
        intent,
        sales_stage: threadAnalysis.sales_stage || "qualifying",
        price_quote: priceQuote,
        badge_label: replyDecisionBadge(priceMode),
      };
    }
    missingInfo = uniqueArray(missingInfo.length ? missingInfo : ["aircon_count", "aircon_type_or_btu"]).slice(0, 2);
    return {
      can_answer: true,
      mode: "guided_reply",
      reason: "ลูกค้าถามราคาแต่ข้อมูลยังไม่พอคำนวณ ต้องถามเฉพาะจำนวนเครื่องหรือประเภท/BTU ก่อน ห้ามถามวันเวลา",
      missing_info: missingInfo,
      known_info: knownInfo,
      next_best_action: "ถามเฉพาะข้อมูลที่ขาดสำหรับคำนวณราคา 1-2 อย่าง ห้ามถามวันเวลา/คิวก่อนตอบราคา",
      intent,
      sales_stage: threadAnalysis.sales_stage || "discovery",
      price_quote: null,
      badge_label: replyDecisionBadge("guided_reply"),
    };
  }

  if (language && !["th", "en"].includes(language)) {
    const reason = "ลูกค้าถามด้วยภาษาที่ระบบยังไม่มั่นใจ";
    return {
      can_answer: false,
      mode: "needs_teaching",
      reason,
      missing_info: missingInfo,
      known_info: knownInfo,
      next_best_action: "ให้แอดมินสอนแนวตอบหรือยืนยันภาษาที่ควรใช้",
      intent,
      sales_stage: threadAnalysis.sales_stage || "discovery",
      price_quote: priceQuote,
      badge_label: replyDecisionBadge("needs_teaching"),
      training_card: buildTrainingCard(reason, "ให้แอดมินสอนแนวตอบหรือยืนยันภาษาที่ควรใช้"),
    };
  }

  if (missingInfo.length >= 3 || (intent === "general" && missingInfo.includes("service_type") && !hasCoreBrainEvidence(coreBrain))) {
    const reason = missingInfo.length >= 3
      ? "ข้อมูลที่ขาดมากเกินไป เสี่ยงถามยาวหรือเดาคำตอบ"
      : "brain ยังไม่มีข้อมูลพอและคำถามยังกำกวม";
    return {
      can_answer: false,
      mode: "needs_teaching",
      reason,
      missing_info: missingInfo.slice(0, 3),
      known_info: knownInfo,
      next_best_action: "ให้แอดมินสอนคำตอบหรือกรอบคำถามสั้น ๆ ที่ถูกต้องก่อน",
      intent,
      sales_stage: threadAnalysis.sales_stage || "discovery",
      price_quote: priceQuote,
      badge_label: replyDecisionBadge("needs_teaching"),
      training_card: buildTrainingCard(reason, "ให้แอดมินสอนคำตอบหรือกรอบคำถามสั้น ๆ ที่ถูกต้องก่อน"),
    };
  }

  if (intent === "water_leak_cleaning") {
    const guided = missingInfo.length > 0;
    return {
      can_answer: true,
      mode: guided ? "guided_reply" : "safe_reply",
      reason: "อาการน้ำหยดให้แนะนำแขวนคอยล์ก่อน ไม่ใช้ค่าตรวจ 700 สำหรับน้ำหยดอย่างเดียว",
      missing_info: missingInfo.slice(0, 2),
      known_info: knownInfo,
      next_best_action: nextBestAction || "แนะนำแขวนคอยล์ อธิบายเหตุผล แล้วถาม BTU/จำนวนเครื่อง/พื้นที่เท่าที่ขาด",
      intent,
      sales_stage: threadAnalysis.sales_stage || "qualifying",
      price_quote: priceQuote,
      badge_label: replyDecisionBadge(guided ? "guided_reply" : "safe_reply"),
    };
  }

  if (intent === "repair_symptom") {
    const guided = missingInfo.length > 0;
    return {
      can_answer: true,
      mode: guided ? "guided_reply" : "safe_reply",
      reason: "ตอบคัดกรองอาการสั้น ๆ ได้ แต่ห้ามฟันธงอะไหล่เสีย และเสนอค่าตรวจ 700 เฉพาะแอร์เสีย/แอร์มีปัญหาที่ไม่ใช่น้ำหยด",
      missing_info: missingInfo.slice(0, 2),
      known_info: knownInfo,
      next_best_action: nextBestAction || "คัดกรองอาการสั้น ๆ เสนอค่าตรวจ 700 (หักลดค่าซ่อมได้) และถามข้อมูลที่ขาดเท่านั้น",
      intent,
      sales_stage: threadAnalysis.sales_stage || "diagnose",
      price_quote: priceQuote,
      badge_label: replyDecisionBadge(guided ? "guided_reply" : "safe_reply"),
    };
  }

  return {
    can_answer: true,
    mode: missingInfo.length ? "guided_reply" : "safe_reply",
    reason: missingInfo.length ? "ตอบได้แบบถามต่อ โดยถามเฉพาะข้อมูลที่ยังขาด 1-2 อย่าง" : "ข้อมูลพอสำหรับตอบสั้น ๆ และพาไปขั้นตอนถัดไป",
    missing_info: missingInfo.slice(0, 2),
    known_info: knownInfo,
    next_best_action: nextBestAction || "ตอบแบบแอดมินขายงานจริง สั้น กระชับ และพาไปขั้นตอนถัดไป",
    intent,
    sales_stage: threadAnalysis.sales_stage || "discovery",
    price_quote: priceQuote,
    badge_label: replyDecisionBadge(missingInfo.length ? "guided_reply" : "safe_reply"),
  };
}

function formatReplyDecisionGuardForPrompt(guard = {}) {
  return [
    "REPLY_DECISION_GUARD (authoritative):",
    JSON.stringify({
      can_answer: guard.can_answer === true,
      mode: guard.mode || "guided_reply",
      reason: guard.reason || "",
      missing_info: guard.missing_info || [],
      known_info: guard.known_info || {},
      next_best_action: guard.next_best_action || "",
      price_quote: guard.price_quote || null,
    }, null, 2),
    "GUARD RULES:",
    "- If mode is admin_only or needs_teaching, do not write a customer reply. Show the training card for admin teaching instead.",
    "- If mode is guided_reply, ask only the listed missing_info, max 1-2 items, and never repeat known_info.",
    "- If mode is safe_reply, answer naturally and keep it short.",
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

// ─────────────────────────────────────────────────
// REPAIR CHECK FEE — deterministic 700 baht enforcement
// ใช้ตอน intent=repair_symptom และลูกค้าถามราคา/ค่าตรวจ/ซ่อมเท่าไหร่
// (ไม่ใช้กับน้ำหยด เพราะน้ำหยด = water_leak_cleaning แนะนำแขวนคอยล์)
// ─────────────────────────────────────────────────
const REPAIR_CHECK_FEE_REPLY =
  "เบื้องต้นอาการนี้ต้องให้ช่างตรวจเช็กหน้างานก่อนนะคะ ยังไม่ฟันธงว่าอะไหล่ตัวไหนเสียได้ค่ะ\n" +
  "ค่าตรวจเช็คซ่อมเบื้องต้น 700 บาทค่ะ และค่าตรวจนำไปหักลดค่าซ่อมได้ด้วยนะคะ\n" +
  "รบกวนแจ้งพื้นที่/โลเคชัน และอาการที่เจอเพิ่มเติม เดี๋ยวแอดมินช่วยเช็กคิวช่างให้ค่ะ";

/**
 * enforceRepairCheckReply — ถ้าเป็นเคสถามค่าตรวจ/ซ่อม (ไม่ใช่น้ำหยด)
 * และคำตอบ LLM ไม่มี "700" → แทนด้วยคำตอบมาตรฐาน
 * กันทั้งกรณี LLM ลืมบอกราคา และกรณี LLM ฟันธงอะไหล่
 */
function enforceRepairCheckReply(reply, threadAnalysis = {}) {
  if (!threadAnalysis || !threadAnalysis.repair_check_fee_question) return reply;
  const text = String(reply || "");
  const has700 = /700/.test(text);
  const hasDeduct = /หักลด|หักค่าซ่อม|นำไปหัก/.test(text);
  // ฟันธงอะไหล่ = คำที่บ่งบอกว่า AI วินิจฉัยเองว่าอะไหล่ตัวไหนเสีย (ห้าม)
  const diagnosesPart = /(คอมเพรสเซอร์|แผงวงจร|คาปาซิเตอร์|มอเตอร์|น้ำยา(หมด|รั่ว)|การ์ด|เมนบอร์ด|อะไหล่.*เสีย).*(เสีย|พัง|ต้องเปลี่ยน|หมด)/.test(text);
  if (has700 && hasDeduct && !diagnosesPart) return reply;
  return REPAIR_CHECK_FEE_REPLY;
}

module.exports = {
  buildPriceQuote,   // unified price quote (all types)
  WALL_AC_TIERS,     // price tables (exported for tests)
  enforceRepairCheckReply,   // deterministic 700 baht repair-check enforcement
  REPAIR_CHECK_FEE_REPLY,
  buildCoreBrainContext,
  formatCoreBrainForPrompt,
  saveCoreBrainLesson,
  detectLanguage,
  detectThreadLanguage,
  analyzeThread,
  formatThreadAnalysisForPrompt,
  buildReplyDecisionGuard,
  formatReplyDecisionGuardForPrompt,
  mapAgentToBrainKey,
  boolValue,
};
