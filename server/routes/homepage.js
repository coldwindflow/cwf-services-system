"use strict";

const crypto = require("crypto");
const express = require("express");
const { ALLOWED_MIME_TYPES, detectImageSignature } = require("../lib/cloudinaryImageUpload");
const articleSync = require("../services/articleSync");

const CONFIG_KEY = "customer_homepage_v1";
const MAX_JSON_BYTES = 120 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_HERO_SLIDES = 5;
const SECTION_TYPES = new Set([
  "hero",
  "quick",
  "promo_banner",
  "active_job",
  "announcements",
  "featured_services",
  "updates",
  "articles",
  "social",
  "trust",
  "testimonials",
  "faq",
]);
const INTERNAL_ROUTES = new Set(["home", "booking", "scheduled", "urgent", "tracking", "profile", "store"]);
// Per-page header banners the admin manages independently of the homepage hero.
const PAGE_HEADER_KEYS = ["store", "booking", "tracking"];
const FOCAL_POSITIONS = new Set(["top", "center", "bottom"]);
const ASPECT_MODES = new Set(["contain", "cover"]);
const MAX_PROMO_BANNERS = 8;
const MAX_SOCIAL_ITEMS = 8;
const MAX_SEED_URLS = 8;
// Upper bound on total homepage sections. Higher than the original fixed set of
// ten so admins can add and duplicate sections, while still bounding growth.
const MAX_SECTIONS = 24;
const SOCIAL_PLATFORMS = new Set(["facebook", "youtube"]);
// Admin pastes a public post/video URL; no Graph/YouTube Data API calls are
// made server-side, so the only safety check we can do is confirm the URL
// actually points at the platform the admin selected.
const SOCIAL_HOST_PATTERNS = {
  facebook: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/,
  youtube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
};

const DEFAULT_CONFIG = {
  version: 1,
  sections: [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "ดูแลแอร์ง่าย จองงานได้ในไม่กี่ขั้นตอน",
      kicker: "Coldwindflow",
      body: "จองล้างแอร์ ติดตามงาน และรับประกาศสำคัญจาก CWF ได้ในหน้าเดียว",
      cta_primary: { label: "จองล้างแอร์", route: "scheduled" },
      cta_secondary: { label: "ติดตามงาน", route: "tracking" },
      focal_position: "center",
      items: [],
    },
    {
      id: "quick",
      type: "quick",
      enabled: true,
      sort_order: 20,
      title: "เมนูด่วน",
      body: "",
      items: [
        { title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" },
        { title: "แจ้งซ่อม", action: "contact", icon: "wrench" },
        { title: "ติดตามงาน", route: "tracking", icon: "pin" },
        { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "line" },
      ],
    },
    {
      id: "promo_banner",
      type: "promo_banner",
      enabled: true,
      sort_order: 25,
      title: "",
      body: "",
      items: [],
    },
    {
      id: "active_job",
      type: "active_job",
      enabled: true,
      sort_order: 30,
      title: "งานของฉัน",
      body: "",
      items: [],
    },
    {
      id: "announcements",
      type: "announcements",
      enabled: true,
      sort_order: 40,
      title: "ข่าวและประกาศ CWF",
      body: "",
      items: [
        { title: "ติดต่อทีม CWF", action: "contact", body: "สอบถามบริการหรือแจ้งข้อมูลเพิ่มเติมกับแอดมิน" },
      ],
    },
    {
      id: "featured_services",
      type: "featured_services",
      enabled: true,
      sort_order: 50,
      title: "บริการแนะนำ",
      body: "ราคาและรายละเอียดดึงจาก Catalog",
      featured_mode: "auto",
      featured_limit: 6,
      show_price: true,
      show_badge: true,
      item_ids: [],
      items: [],
    },
    {
      id: "updates",
      type: "updates",
      enabled: true,
      sort_order: 60,
      title: "ภาพกิจกรรมและโพสต์",
      body: "",
      items: [],
    },
    {
      id: "articles",
      type: "articles",
      enabled: true,
      sort_order: 70,
      title: "บทความแนะนำ",
      body: "",
      items: [],
    },
    {
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      title: "ติดตามเราบนโซเชียล",
      body: "อัปเดตล่าสุดจาก Facebook และ YouTube ของ Coldwindflow",
      items: [],
    },
    {
      id: "trust",
      type: "trust",
      enabled: true,
      sort_order: 80,
      title: "มาตรฐานที่ลูกค้าวางใจ",
      body: "ทีม Coldwindflow ดูแลงานด้วยขั้นตอนที่ตรวจสอบได้",
      items: [
        { title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" },
        { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" },
        { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" },
        { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" },
      ],
    },
  ],
};

function cleanText(value, max = 180) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function jsonSize(value) {
  return Buffer.byteLength(JSON.stringify(value || {}), "utf8");
}

function isSchemaError(error) {
  return ["42P01", "42703", "42883"].includes(String(error && error.code || ""));
}

function actorName(req) {
  return cleanText(req?.actor?.username || req?.auth?.username || req?.effective?.username || "admin", 120);
}

function validateDateRange(item, errors, pathName) {
  const from = cleanText(item.active_from || "", 32);
  const to = cleanText(item.active_to || "", 32);
  const datePattern = /^\d{4}-\d{2}-\d{2}(?:[T ][0-2]\d:[0-5]\d(?::[0-5]\d)?(?:Z|[+-][0-2]\d:[0-5]\d)?)?$/;
  if (from && !datePattern.test(from)) errors.push(`${pathName}.active_from invalid`);
  if (to && !datePattern.test(to)) errors.push(`${pathName}.active_to invalid`);
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) errors.push(`${pathName}.active range invalid`);
}

function validateUrlOrRoute(target, errors, pathName, options = {}) {
  const route = cleanText(target.route || "", 40);
  const url = cleanText(target.url || "", 500);
  const action = cleanText(target.action || "", 40);
  const targetCount = [route, url, action].filter(Boolean).length;
  if (targetCount > 1) errors.push(`${pathName}.target conflict`);
  if (route && !INTERNAL_ROUTES.has(route)) errors.push(`${pathName}.route not allowed`);
  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) errors.push(`${pathName}.url must be http/https`);
    } catch (_) {
      errors.push(`${pathName}.url invalid`);
    }
  }
  if (action && !["contact"].includes(action)) errors.push(`${pathName}.action not allowed`);
  if (options.externalRequired && !url) errors.push(`${pathName}.url required`);
  if (options.noImage && (target.image_url || target.image_public_id)) errors.push(`${pathName}.image not allowed`);
}

function validateImageUrl(value, errors, pathName) {
  const imageUrl = cleanText(value || "", 700);
  if (!imageUrl) return;
  try {
    const parsed = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) errors.push(`${pathName} must be http/https`);
  } catch (_) {
    errors.push(`${pathName} invalid`);
  }
}

function normalizeCta(input, errors, pathName) {
  const cta = input && typeof input === "object" ? input : {};
  const out = {
    label: cleanText(cta.label, 42),
  };
  if (cleanText(cta.route, 40)) out.route = cleanText(cta.route, 40);
  if (cleanText(cta.url, 500)) out.url = cleanText(cta.url, 500);
  if (cleanText(cta.action, 40)) out.action = cleanText(cta.action, 40);
  validateUrlOrRoute(out, errors, pathName);
  return out;
}

function normalizeItem(raw, sectionType, index, errors) {
  const item = raw && typeof raw === "object" ? raw : {};
  const pathName = `${sectionType}.items.${index}`;
  const out = {
    title: cleanText(item.title, 120),
    body: cleanText(item.body || item.text, 260),
    tag: cleanText(item.tag || item.source, 40),
    date_label: cleanText(item.date_label || item.date, 40),
    sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index + 1,
    enabled: item.enabled !== false,
  };
  if (cleanText(item.icon, 30)) out.icon = cleanText(item.icon, 30);
  if (cleanText(item.route, 40)) out.route = cleanText(item.route, 40);
  if (cleanText(item.url, 500)) out.url = cleanText(item.url, 500);
  if (cleanText(item.action, 40)) out.action = cleanText(item.action, 40);
  if (cleanText(item.image_url, 700)) out.image_url = cleanText(item.image_url, 700);
  if (cleanText(item.image_public_id, 300)) out.image_public_id = cleanText(item.image_public_id, 300);
  if (item.cta_primary && typeof item.cta_primary === "object") out.cta_primary = normalizeCta(item.cta_primary, errors, `${pathName}.cta_primary`);
  if (item.cta_secondary && typeof item.cta_secondary === "object") out.cta_secondary = normalizeCta(item.cta_secondary, errors, `${pathName}.cta_secondary`);
  if (cleanText(item.active_from, 32)) out.active_from = cleanText(item.active_from, 32);
  if (cleanText(item.active_to, 32)) out.active_to = cleanText(item.active_to, 32);
  if (sectionType === "promo_banner") {
    out.alt_text = cleanText(item.alt_text, 200);
    out.aspect_mode = ASPECT_MODES.has(cleanText(item.aspect_mode, 10)) ? cleanText(item.aspect_mode, 10) : "contain";
    if (!out.image_url) errors.push(`${pathName}.image_url required`);
  }
  if (sectionType === "hero") {
    out.focal_position = FOCAL_POSITIONS.has(cleanText(item.focal_position, 10)) ? cleanText(item.focal_position, 10) : "center";
  }
  if (sectionType === "social") {
    out.platform = SOCIAL_PLATFORMS.has(cleanText(item.platform, 10)) ? cleanText(item.platform, 10) : "youtube";
  }
  if (sectionType === "testimonials") {
    // title = reviewer name, body = review text, tag = role/place (optional),
    // image_url = optional avatar. rating is the only new field (1–5 stars).
    const rating = Number(item.rating);
    out.rating = Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : 5;
  }
  if (!out.title && sectionType !== "quick" && sectionType !== "promo_banner") errors.push(`${pathName}.title required`);
  validateUrlOrRoute(out, errors, pathName, {
    // updates = activity photos/posts: an image + caption is enough, no link required.
    // articles/social inherently link out, so those still require a URL.
    externalRequired: sectionType === "articles" || sectionType === "social",
    noImage: sectionType === "trust",
  });
  if (sectionType === "social" && out.url) {
    try {
      const host = new URL(out.url).hostname.toLowerCase();
      if (!SOCIAL_HOST_PATTERNS[out.platform].test(host)) errors.push(`${pathName}.url must be a ${out.platform} link`);
    } catch (_) {
      // already flagged by validateUrlOrRoute
    }
  }
  validateImageUrl(out.image_url, errors, `${pathName}.image_url`);
  validateDateRange(out, errors, pathName);
  return out;
}

function normalizeSection(raw, index, errors) {
  const section = raw && typeof raw === "object" ? raw : {};
  const type = cleanText(section.type || section.id, 40);
  if (!SECTION_TYPES.has(type)) errors.push(`sections.${index}.type invalid`);
  const id = cleanText(section.id || type, 60) || type;
  const items = Array.isArray(section.items) ? section.items : [];
  const maxItems = type === "quick" ? 4 : type === "hero" ? MAX_HERO_SLIDES : type === "promo_banner" ? MAX_PROMO_BANNERS : type === "social" ? MAX_SOCIAL_ITEMS : 12;
  if (items.length > maxItems) errors.push(`${id}.items too many`);
  const out = {
    id,
    type,
    enabled: section.enabled !== false,
    sort_order: Number.isFinite(Number(section.sort_order)) ? Number(section.sort_order) : (index + 1) * 10,
    title: cleanText(section.title, 140),
    kicker: cleanText(section.kicker, 60),
    body: cleanText(section.body || section.subtitle, 360),
    cta_primary: normalizeCta(section.cta_primary, errors, `${id}.cta_primary`),
    cta_secondary: normalizeCta(section.cta_secondary, errors, `${id}.cta_secondary`),
    items: items.slice(0, maxItems).map((item, itemIndex) => normalizeItem(item, type, itemIndex, errors)),
  };
  if (cleanText(section.image_url, 700)) out.image_url = cleanText(section.image_url, 700);
  if (cleanText(section.image_public_id, 300)) out.image_public_id = cleanText(section.image_public_id, 300);
  if (cleanText(section.view_all_label, 60)) out.view_all_label = cleanText(section.view_all_label, 60);
  const _viewAllRoute = cleanText(section.view_all_route, 40);
  if (_viewAllRoute && INTERNAL_ROUTES.has(_viewAllRoute)) out.view_all_route = _viewAllRoute;
  // Section-level scheduling: an admin can set a date window so a whole section
  // (e.g. a seasonal promo block) shows only between active_from and active_to.
  // stripPublicConfig already gates sections through activeNow(); persisting the
  // dates here is what makes that window take effect.
  if (cleanText(section.active_from, 32)) out.active_from = cleanText(section.active_from, 32);
  if (cleanText(section.active_to, 32)) out.active_to = cleanText(section.active_to, 32);
  validateImageUrl(out.image_url, errors, `${id}.image_url`);
  validateDateRange(out, errors, id);
  if (type === "hero") {
    out.focal_position = FOCAL_POSITIONS.has(cleanText(section.focal_position, 10)) ? cleanText(section.focal_position, 10) : "center";
    if (!out.title) errors.push("hero.title required");
  }
  if (type === "featured_services") {
    const mode = cleanText(section.featured_mode, 10) === "manual" ? "manual" : "auto";
    const limit = Number(section.featured_limit);
    out.featured_mode = mode;
    out.featured_limit = Number.isFinite(limit) ? Math.max(1, Math.min(12, Math.round(limit))) : 6;
    out.show_price = section.show_price !== false;
    out.show_badge = section.show_badge !== false;
    const itemIds = Array.isArray(section.item_ids) ? section.item_ids : [];
    out.item_ids = [...new Set(itemIds.map((value) => cleanText(value, 80)).filter(Boolean))].slice(0, 12);
    if (mode === "manual" && !out.item_ids.length) errors.push(`${id}.item_ids required for manual mode`);
  }
  if (type === "articles") {
    out.auto_sync = section.auto_sync === true;
    const sourceUrl = cleanText(section.source_url, 300);
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) errors.push(`${id}.source_url must be http/https`);
      } catch (_) {
        errors.push(`${id}.source_url invalid`);
      }
    }
    out.source_url = sourceUrl;
    const seedUrls = Array.isArray(section.seed_urls) ? section.seed_urls : [];
    out.seed_urls = seedUrls.slice(0, MAX_SEED_URLS).map((value, seedIndex) => {
      const url = cleanText(value, 500);
      if (!url) return "";
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) errors.push(`${id}.seed_urls.${seedIndex} must be http/https`);
      } catch (_) {
        errors.push(`${id}.seed_urls.${seedIndex} invalid`);
      }
      return url;
    }).filter(Boolean);
    if (out.auto_sync && !out.source_url) errors.push(`${id}.source_url required when auto_sync is enabled`);
  }
  return out;
}

// Per-page header banners (store/booking/tracking) reuse the hero slide shape:
// each is an auto-sliding, optionally-clickable image banner the admin manages
// in the CMS, independent of the homepage hero.
function normalizePageHeaders(raw, errors) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of PAGE_HEADER_KEYS) {
    const header = src[key];
    if (!header || typeof header !== "object") continue;
    const rawItems = Array.isArray(header.items) ? header.items : [];
    if (rawItems.length > MAX_HERO_SLIDES) errors.push(`page_headers.${key}.items too many`);
    const items = rawItems.slice(0, MAX_HERO_SLIDES).map((item, index) =>
      normalizeItem(item, "hero", index, errors));
    out[key] = {
      enabled: header.enabled !== false,
      kicker: cleanText(header.kicker, 60),
      title: cleanText(header.title, 120),
      body: cleanText(header.body, 260),
      focal_position: FOCAL_POSITIONS.has(cleanText(header.focal_position, 10)) ? cleanText(header.focal_position, 10) : "center",
      items,
    };
  }
  return out;
}

function validateConfig(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("payload must be object");
  if (jsonSize(input) > MAX_JSON_BYTES) errors.push("payload too large");
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  if (!sections.length) errors.push("sections required");
  // Admins can add/duplicate sections, so allow more than the original fixed
  // set while still bounding payload growth.
  if (sections.length > MAX_SECTIONS) errors.push("sections too many");
  const normalizedSections = sections.map((section, index) => normalizeSection(section, index, errors));
  // Defensive id uniqueness: duplicated sections must not share an id, or the
  // customer/admin lookups (sectionByType, move/toggle/edit by id) would target
  // the wrong instance. Suffix any collision in input order before sorting.
  const seenIds = new Set();
  for (const section of normalizedSections) {
    let uid = section.id;
    let n = 2;
    while (seenIds.has(uid)) uid = `${section.id}-${n++}`;
    section.id = uid;
    seenIds.add(uid);
  }
  const normalized = {
    version: 1,
    sections: normalizedSections.sort((a, b) => a.sort_order - b.sort_order),
    page_headers: normalizePageHeaders(input?.page_headers, errors),
  };
  return { ok: errors.length === 0, errors, config: normalized };
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BANGKOK_OFFSET = "+07:00";

// Date-only active_from/active_to are CMS scheduling dates, not timestamps —
// resolve them to the start/end of that calendar day in Asia/Bangkok so a
// banner stays live through the full selected end date rather than expiring
// at 00:00 UTC (07:00 Bangkok) on that date. Explicit date-times keep
// whatever offset/local semantics they already carry.
function resolveDateBoundary(raw, edge) {
  if (!raw) return null;
  if (DATE_ONLY_PATTERN.test(raw)) {
    const suffix = edge === "end" ? "T23:59:59.999" : "T00:00:00.000";
    const ts = new Date(`${raw}${suffix}${BANGKOK_OFFSET}`).getTime();
    return Number.isNaN(ts) ? NaN : ts;
  }
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? NaN : ts;
}

function activeNow(item, now = new Date()) {
  const from = cleanText(item.active_from || "", 32);
  const to = cleanText(item.active_to || "", 32);
  const ts = now.getTime();
  if (from) {
    const fromTs = resolveDateBoundary(from, "start");
    if (Number.isNaN(fromTs) || fromTs > ts) return false;
  }
  if (to) {
    const toTs = resolveDateBoundary(to, "end");
    if (Number.isNaN(toTs) || toTs < ts) return false;
  }
  return true;
}

function stripPublicConfig(config) {
  const now = new Date();
  const sections = (config?.sections || [])
    .filter((section) => section.enabled !== false && activeNow(section, now))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((section) => {
      const cleanSection = { ...section };
      delete cleanSection.updated_by;
      delete cleanSection.image_public_id;
      cleanSection.items = (section.items || [])
        .filter((item) => item.enabled !== false && activeNow(item, now))
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((item) => {
          const cleanItem = { ...item };
          delete cleanItem.image_public_id;
          delete cleanItem.updated_by;
          return cleanItem;
        });
      return cleanSection;
    });
  // Carry per-page headers to the public config, stripping admin metadata and
  // dropping disabled/expired slides (and headers with no live slide).
  const rawHeaders = config?.page_headers && typeof config.page_headers === "object" ? config.page_headers : {};
  const page_headers = {};
  for (const key of Object.keys(rawHeaders)) {
    const header = rawHeaders[key];
    if (!header || typeof header !== "object" || header.enabled === false) continue;
    const items = (header.items || [])
      .filter((item) => item.enabled !== false && activeNow(item, now))
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
      .map((item) => {
        const cleanItem = { ...item };
        delete cleanItem.image_public_id;
        delete cleanItem.updated_by;
        return cleanItem;
      });
    if (!items.length) continue;
    const cleanHeader = { ...header, items };
    delete cleanHeader.image_public_id;
    delete cleanHeader.updated_by;
    page_headers[key] = cleanHeader;
  }
  return { version: 1, sections, page_headers };
}

async function hydrateAutoSyncArticles(pool, publicConfig) {
  const sections = publicConfig?.sections || [];
  for (const section of sections) {
    if (section.type !== "articles" || !section.auto_sync || !section.source_url) continue;
    try {
      const synced = await articleSync.getSyncedArticles(pool, section.source_url, 8);
      if (synced.articles.length) section.items = synced.articles;
    } catch (error) {
      if (!isSchemaError(error)) console.error("[homepage/public/sync-hydrate] failed", error);
      // sync cache unavailable — keep whatever items were already on the section
    }
  }
}

function safeHomepageActiveJob(row) {
  if (!row) return null;
  return {
    booking_code: cleanText(row.booking_code, 40),
    job_type: cleanText(row.job_type, 80),
    job_status: cleanText(row.job_status, 80),
    appointment_datetime: row.appointment_datetime || null,
  };
}

async function loadActiveJobForCustomer(pool, customerSub) {
  const sub = cleanText(customerSub, 160);
  if (!sub) return null;
  const result = await pool.query(
    `SELECT booking_code, job_type, job_status, appointment_datetime
       FROM public.jobs
      WHERE customer_sub=$1
        AND COALESCE(job_status,'') NOT IN ('เสร็จสิ้น', 'ยกเลิก', 'ยกเลิกงาน', 'ปิดงานแล้ว')
      ORDER BY appointment_datetime NULLS LAST, job_id DESC
      LIMIT 1`,
    [sub]
  );
  return safeHomepageActiveJob(result.rows?.[0]);
}

async function ensureDraftRow(pool) {
  const existing = await pool.query(
    `SELECT config_key, draft_config, published_config, version, updated_by, updated_at, published_at
     FROM public.homepage_cms_configs
     WHERE config_key=$1`,
    [CONFIG_KEY]
  );
  if (existing.rows.length) return existing.rows[0];
  const inserted = await pool.query(
    `INSERT INTO public.homepage_cms_configs (config_key, draft_config, published_config, version)
     VALUES ($1, $2::jsonb, NULL, 1)
     ON CONFLICT (config_key) DO UPDATE SET config_key=EXCLUDED.config_key
     RETURNING config_key, draft_config, published_config, version, updated_by, updated_at, published_at`,
    [CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG)]
  );
  return inserted.rows[0];
}

function hydrateDraftConfig(rawConfig) {
  const base = rawConfig && typeof rawConfig === "object" && Array.isArray(rawConfig.sections) ? rawConfig : DEFAULT_CONFIG;
  const existingTypes = new Set(base.sections.map((section) => section && (section.type || section.id)));
  const missing = DEFAULT_CONFIG.sections.filter((defaultSection) => !existingTypes.has(defaultSection.type));
  if (!missing.length) return base;
  return {
    version: base.version || 1,
    sections: [...base.sections, ...missing.map((section) => JSON.parse(JSON.stringify(section)))],
  };
}

async function loadPublished(pool) {
  const result = await pool.query(
    `SELECT published_config, version, updated_at, published_at
     FROM public.homepage_cms_configs
     WHERE config_key=$1`,
    [CONFIG_KEY]
  );
  const row = result.rows[0];
  if (!row || !row.published_config) return null;
  return row;
}

function createHomepageRoutes(deps = {}) {
  const router = express.Router();
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  const upload = deps.upload;
  const cloudinaryUploadBuffer = deps.cloudinaryUploadBuffer;
  const cloudinaryDestroyPublicId = deps.cloudinaryDestroyPublicId;
  const requireCustomerJwt = deps.requireCustomerJwt;
  if (!pool) throw new Error("createHomepageRoutes requires pool");
  if (!requireAdminSession) throw new Error("createHomepageRoutes requires requireAdminSession");
  if (requireCustomerJwt && typeof requireCustomerJwt !== "function") throw new Error("createHomepageRoutes requires requireCustomerJwt to be a function");

  function optionalCustomerSession(req, res, next) {
    if (!requireCustomerJwt) return next();
    let finished = false;
    const passthrough = () => {
      if (finished) return;
      finished = true;
      next();
    };
    const failClosedRes = {
      status() { return this; },
      json() {
        req.customer = null;
        passthrough();
        return this;
      },
    };
    try {
      return requireCustomerJwt(req, failClosedRes, passthrough);
    } catch (_) {
      req.customer = null;
      return passthrough();
    }
  }

  router.get("/public/homepage", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const row = await loadPublished(pool);
      const config = row?.published_config || DEFAULT_CONFIG;
      const publicConfig = stripPublicConfig(config);
      await hydrateAutoSyncArticles(pool, publicConfig);
      res.json({
        ok: true,
        config: publicConfig,
        featured_services: [],
        fallback: !row?.published_config,
      });
    } catch (error) {
      if (isSchemaError(error)) {
        return res.json({ ok: true, config: stripPublicConfig(DEFAULT_CONFIG), featured_services: [], fallback: true, schema_ready: false });
      }
      console.error("[homepage/public] failed", error);
      res.status(500).json({ error: "โหลดหน้าแรกไม่สำเร็จ" });
    }
  });

  router.get("/public/homepage/active-job", optionalCustomerSession, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const activeJob = await loadActiveJobForCustomer(pool, req.customer?.sub || "");
      return res.json({ ok: true, active_job: activeJob });
    } catch (error) {
      if (isSchemaError(error)) return res.json({ ok: true, active_job: null, schema_ready: false });
      console.error("[homepage/active-job] failed", { code: error?.code || "ERR" });
      return res.json({ ok: true, active_job: null });
    }
  });

  router.get("/admin/homepage-cms/config", requireAdminSession, async (_req, res) => {
    try {
      const row = await ensureDraftRow(pool);
      res.json({
        ok: true,
        draft_config: hydrateDraftConfig(row.draft_config),
        published_config: row.published_config || null,
        version: row.version,
        updated_by: row.updated_by,
        updated_at: row.updated_at,
        published_at: row.published_at,
      });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/get] failed", error);
      res.status(500).json({ error: "โหลดข้อมูล CMS ไม่สำเร็จ" });
    }
  });

  router.put("/admin/homepage-cms/draft", requireAdminSession, async (req, res) => {
    try {
      const validation = validateConfig(req.body?.config || req.body);
      if (!validation.ok) return res.status(400).json({ error: "VALIDATION_FAILED", details: validation.errors });
      const actor = actorName(req);
      const result = await pool.query(
        `INSERT INTO public.homepage_cms_configs (config_key, draft_config, version, updated_by, updated_at)
         VALUES ($1, $2::jsonb, 1, $3, NOW())
         ON CONFLICT (config_key) DO UPDATE
           SET draft_config=EXCLUDED.draft_config,
               version=public.homepage_cms_configs.version + 1,
               updated_by=EXCLUDED.updated_by,
               updated_at=NOW()
         RETURNING draft_config, version, updated_by, updated_at, published_at`,
        [CONFIG_KEY, JSON.stringify(validation.config), actor]
      );
      res.json({ ok: true, ...result.rows[0] });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/draft] failed", error);
      res.status(500).json({ error: "บันทึก Draft ไม่สำเร็จ" });
    }
  });

  router.post("/admin/homepage-cms/publish", requireAdminSession, async (req, res) => {
    try {
      const row = await ensureDraftRow(pool);
      const validation = validateConfig(req.body?.config || row.draft_config);
      if (!validation.ok) return res.status(400).json({ error: "VALIDATION_FAILED", details: validation.errors });
      const actor = actorName(req);
      const result = await pool.query(
        `UPDATE public.homepage_cms_configs
         SET draft_config=$2::jsonb,
             published_config=$2::jsonb,
             version=version + 1,
             updated_by=$3,
             updated_at=NOW(),
             published_at=NOW()
         WHERE config_key=$1
         RETURNING draft_config, published_config, version, updated_by, updated_at, published_at`,
        [CONFIG_KEY, JSON.stringify(validation.config), actor]
      );
      res.json({ ok: true, ...result.rows[0] });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/publish] failed", error);
      res.status(500).json({ error: "Publish ไม่สำเร็จ" });
    }
  });

  const uploadMiddleware = upload && typeof upload.single === "function" ? upload.single("image") : null;
  router.post("/admin/homepage-cms/images", requireAdminSession, (req, res, next) => {
    if (!uploadMiddleware) return res.status(500).json({ error: "UPLOAD_NOT_CONFIGURED" });
    uploadMiddleware(req, res, next);
  }, async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "กรุณาเลือกไฟล์ภาพ" });
      if (!file.buffer || !file.buffer.length) return res.status(400).json({ error: "ไม่พบไฟล์รูปภาพ" });
      if ((file.size || file.buffer.length) > MAX_IMAGE_BYTES) return res.status(400).json({ error: "ไฟล์รูปภาพใหญ่เกิน 10MB" });
      const declaredMime = String(file.mimetype || "").toLowerCase();
      if (!ALLOWED_MIME_TYPES.has(declaredMime)) return res.status(400).json({ error: "รองรับเฉพาะไฟล์ JPEG, PNG หรือ WEBP" });
      const actualMime = detectImageSignature(file.buffer);
      if (!actualMime || actualMime !== declaredMime) return res.status(400).json({ error: "ไฟล์รูปภาพไม่ถูกต้องหรือเสียหาย" });
      if (!cloudinaryUploadBuffer) return res.status(503).json({ error: "CLOUDINARY_NOT_CONFIGURED" });
      const publicId = `homepage_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const uploaded = await cloudinaryUploadBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        folder: "cwf/homepage",
        publicId,
        transformation: "c_limit,w_1400/q_auto/f_auto",
      });
      const actor = actorName(req);
      await pool.query(
        `INSERT INTO public.homepage_cms_media (image_public_id, image_url, original_name, mime_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (image_public_id) DO NOTHING`,
        [uploaded.public_id || publicId, uploaded.secure_url, file.originalname || "", file.mimetype, file.size || null, actor]
      );
      res.json({ ok: true, image_url: uploaded.secure_url, image_public_id: uploaded.public_id || publicId });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/upload] failed", error);
      res.status(500).json({ error: error.message || "อัปโหลดรูปไม่สำเร็จ" });
    }
  });

  router.delete("/admin/homepage-cms/images/:publicId", requireAdminSession, async (req, res) => {
    try {
      const publicId = cleanText(req.params.publicId, 300);
      if (!publicId) return res.status(400).json({ error: "INVALID_PUBLIC_ID" });
      const row = await ensureDraftRow(pool);
      const publishedText = JSON.stringify(row.published_config || {});
      if (publishedText.includes(publicId)) return res.status(409).json({ error: "IMAGE_USED_BY_PUBLISHED_CONFIG" });
      if (cloudinaryDestroyPublicId) await cloudinaryDestroyPublicId(publicId);
      await pool.query(
        `UPDATE public.homepage_cms_media
         SET deleted_at=NOW(), deleted_by=$2
         WHERE image_public_id=$1 AND deleted_at IS NULL`,
        [publicId, actorName(req)]
      );
      res.json({ ok: true });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/delete-image] failed", error);
      res.status(500).json({ error: "ลบรูปไม่สำเร็จ" });
    }
  });

  router.delete("/admin/homepage-cms/images", requireAdminSession, async (req, res) => {
    try {
      const publicId = cleanText(req.body?.public_id || req.body?.image_public_id, 300);
      if (!publicId) return res.status(400).json({ error: "INVALID_PUBLIC_ID" });
      const row = await ensureDraftRow(pool);
      const publishedText = JSON.stringify(row.published_config || {});
      if (publishedText.includes(publicId)) return res.status(409).json({ error: "IMAGE_USED_BY_PUBLISHED_CONFIG" });
      if (cloudinaryDestroyPublicId) await cloudinaryDestroyPublicId(publicId);
      await pool.query(
        `UPDATE public.homepage_cms_media
         SET deleted_at=NOW(), deleted_by=$2
         WHERE image_public_id=$1 AND deleted_at IS NULL`,
        [publicId, actorName(req)]
      );
      res.json({ ok: true });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/delete-image] failed", error);
      res.status(500).json({ error: "ลบรูปไม่สำเร็จ" });
    }
  });

  router.post("/admin/homepage-cms/sync-articles", requireAdminSession, async (req, res) => {
    try {
      const sourceUrl = cleanText(req.body?.source_url, 300);
      if (!sourceUrl) return res.status(400).json({ error: "source_url required" });
      const seedUrls = Array.isArray(req.body?.seed_urls)
        ? req.body.seed_urls.map((value) => cleanText(value, 500)).filter(Boolean).slice(0, MAX_SEED_URLS)
        : [];
      const result = await articleSync.syncArticles(pool, sourceUrl, { seedUrls, limit: 12 });
      if (!result.ok) return res.status(400).json({ error: result.error || "SYNC_FAILED" });
      const synced = await articleSync.getSyncedArticles(pool, sourceUrl, 12);
      res.json({
        ok: true,
        synced_count: result.synced,
        fetched_count: result.fetched,
        articles: synced.articles,
        last_synced_at: synced.last_synced_at,
      });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/sync-articles] failed", error);
      res.status(500).json({ error: error.message || "ซิงค์บทความไม่สำเร็จ" });
    }
  });

  router.get("/admin/homepage-cms/synced-articles", requireAdminSession, async (req, res) => {
    try {
      const sourceUrl = cleanText(req.query?.source_url, 300);
      if (!sourceUrl) return res.json({ ok: true, articles: [], last_synced_at: null });
      const synced = await articleSync.getSyncedArticles(pool, sourceUrl, 12);
      res.json({ ok: true, ...synced });
    } catch (error) {
      if (isSchemaError(error)) return res.status(503).json({ error: "HOMEPAGE_CMS_SCHEMA_NOT_READY" });
      console.error("[homepage/admin/synced-articles] failed", error);
      res.status(500).json({ error: "โหลดข้อมูลที่ซิงค์ไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  MAX_IMAGE_BYTES,
  SECTION_TYPES,
  activeNow,
  createHomepageRoutes,
  stripPublicConfig,
  validateConfig,
};
