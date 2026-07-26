"use strict";

const crypto = require("crypto");
const express = require("express");
const { ALLOWED_MIME_TYPES, detectImageSignature } = require("../lib/cloudinaryImageUpload");
const articleSync = require("../services/articleSync");
const iconRegistry = require("../../customer-app/modules/iconRegistry");
const { resolveUrgentCapability } = require("../services/urgent/capability");

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

// ---- Customer App page availability ------------------------------------------
// Which Customer App V2 top-level pages are enabled. Stored inside the same
// Homepage CMS config (published_config) â€” no new table/migration. Legacy
// configs without this field are interpreted as all-enabled. The urgent field is
// also the authoritative runtime kill switch for public urgent booking.
const PAGE_AVAILABILITY_KEYS = ["home", "store", "booking", "scheduled", "urgent", "tracking", "profile"];
const DEFAULT_PAGE_AVAILABILITY = Object.freeze({
  home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true,
});
// Fail-safe when there is no config AND no valid client cache: keep the landing
// page and Tracking reachable, close transactional/unfinished flows.
const DEGRADED_PAGE_AVAILABILITY = Object.freeze({
  home: true, store: false, booking: false, scheduled: false, urgent: false, tracking: true, profile: false,
});

// Strict validation for an admin-supplied page_availability object. Absent =
// legacy = all-enabled (not an error). When present it must be a plain object
// with exactly the 7 boolean keys, no unknown/missing keys, and at least one
// page enabled. Errors are pushed into `errors`; the returned object is always a
// complete 7-key map so callers never crash on it.
function normalizePageAvailability(raw, errors) {
  if (raw === undefined || raw === null) return { ...DEFAULT_PAGE_AVAILABILITY };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push("page_availability must be an object");
    return { ...DEFAULT_PAGE_AVAILABILITY };
  }
  for (const key of Object.keys(raw)) {
    if (!PAGE_AVAILABILITY_KEYS.includes(key)) errors.push(`page_availability.${key} is not a valid page`);
  }
  const out = {};
  let anyEnabled = false;
  for (const key of PAGE_AVAILABILITY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      errors.push(`page_availability.${key} is required`);
      out[key] = true;
      continue;
    }
    const v = raw[key];
    if (typeof v !== "boolean") {
      errors.push(`page_availability.${key} must be a boolean`);
      out[key] = true;
      continue;
    }
    out[key] = v;
    if (v) anyEnabled = true;
  }
  if (!anyEnabled) errors.push("page_availability must keep at least one page enabled");
  return out;
}

// Non-throwing read for public responses. A published config is either legacy
// (no field â†’ all-enabled) or already validated; defensively coerce anything
// odd to a safe complete map, and never emit an all-disabled result.
function readPageAvailability(config) {
  const raw = config && typeof config === "object" ? config.page_availability : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_PAGE_AVAILABILITY };
  const out = {};
  let anyEnabled = false;
  for (const key of PAGE_AVAILABILITY_KEYS) {
    const v = raw[key];
    out[key] = typeof v === "boolean" ? v : true;
    if (out[key]) anyEnabled = true;
  }
  return anyEnabled ? out : { ...DEFAULT_PAGE_AVAILABILITY };
}
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
  page_availability: { home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true },
  navigation: iconRegistry.defaultNavigation(),
  icon_overrides: iconRegistry.defaultOverrides(),
  sections: [
    {
      id: "hero",
      type: "hero",
      enabled: true,
      sort_order: 10,
      title: "à¸”à¸¹à¹à¸¥à¹à¸­à¸£à¹Œà¸‡à¹ˆà¸²à¸¢ à¸ˆà¸­à¸‡à¸‡à¸²à¸™à¹„à¸”à¹‰à¹ƒà¸™à¹„à¸¡à¹ˆà¸à¸µà¹ˆà¸‚à¸±à¹‰à¸™à¸•à¸­à¸™",
      kicker: "Coldwindflow",
      body: "à¸ˆà¸­à¸‡à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ à¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™ à¹à¸¥à¸°à¸£à¸±à¸šà¸›à¸£à¸°à¸à¸²à¸¨à¸ªà¸³à¸„à¸±à¸à¸ˆà¸²à¸ CWF à¹„à¸”à¹‰à¹ƒà¸™à¸«à¸™à¹‰à¸²à¹€à¸”à¸µà¸¢à¸§",
      cta_primary: { label: "à¸ˆà¸­à¸‡à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ", route: "scheduled" },
      cta_secondary: { label: "à¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™", route: "tracking" },
      focal_position: "center",
      items: [],
    },
    {
      id: "quick",
      type: "quick",
      enabled: true,
      sort_order: 20,
      title: "à¹€à¸¡à¸™à¸¹à¸”à¹ˆà¸§à¸™",
      body: "",
      items: [
        { title: "à¸ˆà¸­à¸‡à¸¥à¹‰à¸²à¸‡à¹à¸­à¸£à¹Œ", route: "scheduled", icon: "sparkle" },
        { title: "à¹à¸ˆà¹‰à¸‡à¸‹à¹ˆà¸­à¸¡", action: "contact", icon: "wrench" },
        { title: "à¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™", route: "tracking", icon: "pin" },
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
      title: "à¸‡à¸²à¸™à¸‚à¸­à¸‡à¸‰à¸±à¸™",
      body: "",
      items: [],
    },
    {
      id: "announcements",
      type: "announcements",
      enabled: true,
      sort_order: 40,
      title: "à¸‚à¹ˆà¸²à¸§à¹à¸¥à¸°à¸›à¸£à¸°à¸à¸²à¸¨ CWF",
      body: "",
      items: [
        { title: "à¸•à¸´à¸”à¸•à¹ˆà¸­à¸—à¸µà¸¡ CWF", action: "contact", body: "à¸ªà¸­à¸šà¸–à¸²à¸¡à¸šà¸£à¸´à¸à¸²à¸£à¸«à¸£à¸·à¸­à¹à¸ˆà¹‰à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸à¸´à¹ˆà¸¡à¹€à¸•à¸´à¸¡à¸à¸±à¸šà¹à¸­à¸”à¸¡à¸´à¸™" },
      ],
    },
    {
      id: "featured_services",
      type: "featured_services",
      enabled: true,
      sort_order: 50,
      title: "à¸šà¸£à¸´à¸à¸²à¸£à¹à¸™à¸°à¸™à¸³",
      body: "à¸£à¸²à¸„à¸²à¹à¸¥à¸°à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸”à¸¶à¸‡à¸ˆà¸²à¸ Catalog",
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
      title: "à¸ à¸²à¸à¸à¸´à¸ˆà¸à¸£à¸£à¸¡à¹à¸¥à¸°à¹‚à¸à¸ªà¸•à¹Œ",
      body: "",
      items: [],
    },
    {
      id: "articles",
      type: "articles",
      enabled: true,
      sort_order: 70,
      title: "à¸šà¸—à¸„à¸§à¸²à¸¡à¹à¸™à¸°à¸™à¸³",
      body: "",
      items: [],
    },
    {
      id: "social",
      type: "social",
      enabled: true,
      sort_order: 75,
      title: "à¸•à¸´à¸”à¸•à¸²à¸¡à¹€à¸£à¸²à¸šà¸™à¹‚à¸‹à¹€à¸Šà¸µà¸¢à¸¥",
      body: "à¸­à¸±à¸›à¹€à¸”à¸•à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸ˆà¸²à¸ Facebook à¹à¸¥à¸° YouTube à¸‚à¸­à¸‡ Coldwindflow",
      items: [],
    },
    {
      id: "trust",
      type: "trust",
      enabled: true,
      sort_order: 80,
      title: "à¸¡à¸²à¸•à¸£à¸à¸²à¸™à¸—à¸µà¹ˆà¸¥à¸¹à¸à¸„à¹‰à¸²à¸§à¸²à¸‡à¹ƒà¸ˆ",
      body: "à¸—à¸µà¸¡ Coldwindflow à¸”à¸¹à¹à¸¥à¸‡à¸²à¸™à¸”à¹‰à¸§à¸¢à¸‚à¸±à¹‰à¸™à¸•à¸­à¸™à¸—à¸µà¹ˆà¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¹„à¸”à¹‰",
      items: [
        { title: "à¹à¸ˆà¹‰à¸‡à¸£à¸²à¸„à¸²à¸à¹ˆà¸­à¸™à¸—à¸³", body: "à¸£à¸°à¸šà¸šà¸„à¸³à¸™à¸§à¸“à¸ˆà¸²à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸šà¸£à¸´à¸à¸²à¸£à¸ˆà¸£à¸´à¸‡" },
        { title: "à¸Šà¹ˆà¸²à¸‡à¸œà¹ˆà¸²à¸™à¸¡à¸²à¸•à¸£à¸à¸²à¸™", body: "à¸—à¸µà¸¡à¸‡à¸²à¸™à¹„à¸”à¹‰à¸£à¸±à¸šà¸à¸²à¸£à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸à¹ˆà¸­à¸™à¸£à¸±à¸šà¸‡à¸²à¸™" },
        { title: "à¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™à¹„à¸”à¹‰", body: "à¸”à¸¹à¸ªà¸–à¸²à¸™à¸°à¸ªà¸³à¸„à¸±à¸à¸”à¹‰à¸§à¸¢ Booking Code" },
        { title: "à¸•à¸´à¸”à¸•à¹ˆà¸­à¹à¸­à¸”à¸¡à¸´à¸™à¸‡à¹ˆà¸²à¸¢", body: "à¸£à¸­à¸‡à¸£à¸±à¸š LINE à¹à¸¥à¸°à¹‚à¸—à¸£à¸¨à¸±à¸à¸—à¹Œ" },
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
  if (sectionType === "quick") {
    const quickDefault = iconRegistry.defaultIconForSlot("quick." + (index + 1));
    const quickIcon = cleanText(item.icon, 30);
    out.icon = iconRegistry.isLibraryIcon(quickIcon) ? quickIcon : quickDefault;
  } else if (cleanText(item.icon, 30)) {
    out.icon = cleanText(item.icon, 30);
  }
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
    // image_url = optional avatar. rating is the only new field (1â€“5 stars).
    const rating = Number(item.rating);
    out.rating = Number.isFinite(rating) ? Math.max(1, Math.min(5, Math.round(rating))) : 5;
  }
  if (!out.title && sectionType !== "quick" && sectionType !== "promo_banner") errë·¶‰ËkºwµçI•ÅÕ¥É•ÌÉ•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸ˆ¤ì4(€¥˜€¡É•ÅÕ¥É•ÕÍÑ½µ•É)İĞ€˜˜ÑåÁ•½˜É•ÅÕ¥É•ÕÍÑ½µ•É)İĞ€„ôô€‰™Õ¹Ñ¥½¸ˆ¤Ñ¡É½Ü¹•ÜÉÉ½È ‰É•…Ñ•!½µ•Á…•I½ÕÑ•ÌÉ•ÅÕ¥É•ÌÉ•ÅÕ¥É•ÕÍÑ½µ•É)İĞÑ¼‰”„™Õ¹Ñ¥½¸ˆ¤ì4(4(€™Õ¹Ñ¥½¸½ÁÑ¥½¹…±ÕÍÑ½µ•ÉM•ÍÍ¥½¸¡É•Ä°É•Ì°¹•áĞ¤ì4(€€€¥˜€ …É•ÅÕ¥É•ÕÍÑ½µ•É)İĞ¤É•ÑÕÉ¸¹•áĞ ¤ì4(€€€±•Ğ™¥¹¥Í¡•€ô™…±Í”ì4(€€€½¹ÍĞÁ…ÍÍÑ¡É½Õ €ô€ ¤€ôøì4(€€€€€¥˜€¡™¥¹¥Í¡•¤É•ÑÕÉ¸ì4(€€€€€™¥¹¥Í¡•€ôÑÉÕ”ì4(€€€€€¹•áĞ ¤ì4(€€€ôì4(€€€½¹ÍĞ™…¥±±½Í•‘I•Ì€ôì4(€€€€€ÍÑ…ÑÕÌ ¤ìÉ•ÑÕÉ¸Ñ¡¥Ììô°4(€€€€€©Í½¸ ¤ì4(€€€€€€€É•Ä¹ÕÍÑ½µ•È€ô¹Õ±°ì4(€€€€€€€Á…ÍÍÑ¡É½Õ  ¤ì4(€€€€€€€É•ÑÕÉ¸Ñ¡¥Ìì4(€€€€€ô°4(€€€ôì4(€€€ÑÉäì4(€€€€€É•ÑÕÉ¸É•ÅÕ¥É•ÕÍÑ½µ•É)İĞ¡É•Ä°™…¥±±½Í•‘I•Ì°Á…ÍÍÑ¡É½Õ ¤ì4(€€€ô…Ñ €¡|¤ì4(€€€€€É•Ä¹ÕÍÑ½µ•È€ô¹Õ±°ì4(€€€€€É•ÑÕÉ¸Á…ÍÍÑ¡É½Õ  ¤ì4(€€€ô4(€ô4(4(€É½ÕÑ•È¹•Ğ ˆ½ÁÕ‰±¥Œ½¡½µ•Á…”ˆ°…Íå¹Œ€¡}É•Ä°É•Ì¤€ôøì4(€€€É•Ì¹Í•Ğ ‰…¡”µ½¹ÑÉ½°ˆ°€‰¹¼µÍÑ½É”ˆ¤ì4(€€€ÑÉäì4(€€€€€½¹ÍĞÉ½Ü€ô…İ…¥Ğ±½…‘AÕ‰±¥Í¡•¡Á½½°¤ì(€€€€€½¹ÍĞ½¹™¥œ€ôÉ½Üü¹ÁÕ‰±¥Í¡•‘}½¹™¥œñğU1Q}=9%ì4(€€€€€½¹ÍĞÁÕ‰±¥½¹™¥œ€ôÍÑÉ¥ÁAÕ‰±¥½¹™¥œ¡½¹™¥œ¤ì4(€€€€€…İ…¥Ğ¡å‘É…Ñ•ÕÑ½Må¹ÉÑ¥±•Ì¡Á½½°°ÁÕ‰±¥½¹™¥œ¤ì4(€€€€€É•Ì¹©Í½¸¡ì4(€€€€€€€½¬èÑÉÕ”°4(€€€€€€€½¹™¥œèÁÕ‰±¥½¹™¥œ°4(€€€€€€€™•…ÑÕÉ•‘}Í•ÉÙ¥•Ìèmt°4(€€€€€€€™…±±‰…¬è€…É½Üü¹ÁÕ‰±¥Í¡•‘}½¹™¥œ°4(€€€€€ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤ì4(€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°½¹™¥œèÍÑÉ¥ÁAÕ‰±¥½¹™¥œ¡U1Q}=9%¤°™•…ÑÕÉ•‘}Í•ÉÙ¥•Ìèmt°™…±±‰…¬èÑÉÕ”°Í¡•µ…}É•…‘äè™…±Í”ô¤ì4(€€€€€ô4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½ÁÕ‰±¥t™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â¯‚â—‚âS‚â¯‚âg‚æ'‚âË‚æ‚â‚â‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€€¼¼1¥¡Ñİ•¥¡ĞÁÕ‰±¥ŒÉ•…½˜Ñ¡”ÕÍÑ½µ•ÈÁÀÁ…”µ…Ù…¥±…‰¥±¥Ñä™±…Ì¸I•…‘Ì4(€€¼¼Ñ¡”M5ÁÕ‰±¥Í¡•!½µ•Á…”5L½¹™¥œìÉ•ÑÕÉ¹Ì½¹±äÑ¡”Á…”™±…Ì€¬Í…™”4(€€¼¼µ•Ñ…‘…Ñ„€¡¹¼É…™Ğ°¹¼ÕÁ‘…Ñ•‘}‰ä°¹¼…‘µ¥¸½ÕÍÑ½µ•È‘…Ñ„¤¸9•Ù•È€ÔÀÁÌƒŠP½¸4(€€¼¼…¹ä½Í¡•µ„½Õ¹•áÁ•Ñ••ÉÉ½È¥ĞÉ•ÑÕÉ¹ÌÑ¡”‘•É…‘•™…¥°µÍ…™”İ¥Ñ !QQ@4(€€¼¼€ÈÀÀÍ¼Ñ¡”…ÁÀ…¸ÍÑ¥±°‰½½Ğ¥¹Ñ¼!½µ”€¬QÉ…­¥¹œ¸4(€É½ÕÑ•È¹•Ğ ˆ½ÁÕ‰±¥Œ½ÕÍÑ½µ•Èµ…ÁÀµ½¹™¥œˆ°…Íå¹Œ€¡}É•Ä°É•Ì¤€ôøì4(€€€É•Ì¹Í•Ğ ‰…¡”µ½¹ÑÉ½°ˆ°€‰¹¼µÍÑ½É”ˆ¤ì4(€€€ÑÉäì4(€€€€€½¹ÍĞmÉ½Ü°ÕÉ•¹Ñ…Á…‰¥±¥Ñåt€ô…İ…¥ĞAÉ½µ¥Í”¹…±°¡l(€€€€€€€±½…‘AÕ‰±¥Í¡•¡Á½½°¤°(€€€€€€€É•Í½±Ù•UÉ•¹Ñ…Á…‰¥±¥Ñä¡Á½½°¤°(€€€€€t¤ì(€€€€€¥˜€ …É½Üñğ€…É½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œ¤ì4(€€€€€€€€¼¼9¼ÁÕ‰±¥Í¡•½¹™¥œå•ĞƒŠH‘•™…Õ±Ğ…±°µ•¹…‰±•€¡™…±±‰…¬°¹½Ğ‘•É…‘•¤¸4(€€€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì4(€€€€€€€€€½¬èÑÉÕ”°4(€€€€€€€€€Á…•}…Ù…¥±…‰¥±¥Ñäèì(€€€€€€€€€€€€¸¸¹U1Q}A}Y%1	%1%Qd°(€€€€€€€€€€€ÕÉ•¹ĞèÕÉ•¹Ñ…Á…‰¥±¥Ñä¹•¹…‰±•°(€€€€€€€€€ô°(€€€€€€€€€€¸¸¹¥½¹I•¥ÍÑÉä¹¹½Éµ…±¥é•½¹™¥œ¡U1Q}=9%°€‰ÁÕ‰±¥Œˆ¤°4(€€€€€€€€€½¹™¥}Ù•ÉÍ¥½¸è¹Õ±°°4(€€€€€€€€€ÁÕ‰±¥Í¡•‘}…Ğè¹Õ±°°4(€€€€€€€€€™…±±‰…¬èÑÉÕ”°4(€€€€€€€€€‘•É…‘•è™…±Í”°4(€€€€€€€ô¤ì4(€€€€€ô4(€€€€€€¼¼1•…äÁÕ‰±¥Í¡•½¹™¥œİ¥Ñ ¹¼Á…•}…Ù…¥±…‰¥±¥ÑäƒŠH…±°µ•¹…‰±•°¹½Ğ„™…±±‰…¬¸4(€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì4(€€€€€€€½¬èÑÉÕ”°4(€€€€€€€Á…•}…Ù…¥±…‰¥±¥Ñäèì(€€€€€€€€€€¸¸¹É•…‘A…•Ù…¥±…‰¥±¥Ñä¡É½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œ¤°(€€€€€€€€€ÕÉ•¹ĞèÕÉ•¹Ñ…Á…‰¥±¥Ñä¹•¹…‰±•°(€€€€€€€ô°(€€€€€€€€¸¸¹¥½¹I•¥ÍÑÉä¹¹½Éµ…±¥é•½¹™¥œ¡É½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œ°€‰ÁÕ‰±¥Œˆ¤°4(€€€€€€€½¹™¥}Ù•ÉÍ¥½¸èÉ½Ü¹Ù•ÉÍ¥½¸€üü¹Õ±°°4(€€€€€€€ÁÕ‰±¥Í¡•‘}…ĞèÉ½Ü¹ÁÕ‰±¥Í¡•‘}…Ğ€üü¹Õ±°°4(€€€€€€€™…±±‰…¬è™…±Í”°4(€€€€€€€‘•É…‘•è™…±Í”°4(€€€€€ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€€¼¼9•Ù•ÈÉ…Í Ñ¡”…ÁÀè½Í¡•µ„½Õ¹•áÁ•Ñ•ƒŠH‘•É…‘•™…¥°µÍ…™”°!QQ@€ÈÀÀ¸4(€€€€€½¹Í½±”¹İ…É¸ ‰mÕÍÑ½µ•Èµ…ÁÀµ½¹™¥t‘•É…‘•™…±±‰…¬ˆ°ìµ•ÍÍ…”è•ÉÉ½È€˜˜•ÉÉ½È¹µ•ÍÍ…”ô¤ì4(€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì4(€€€€€€€½¬èÑÉÕ”°4(€€€€€€€Á…•}…Ù…¥±…‰¥±¥Ñäèì€¸¸¹I}A}Y%1	%1%Qdô°4(€€€€€€€€¸¸¹¥½¹I•¥ÍÑÉä¹¹½Éµ…±¥é•½¹™¥œ¡U1Q}=9%°€‰ÁÕ‰±¥Œˆ¤°4(€€€€€€€½¹™¥}Ù•ÉÍ¥½¸è¹Õ±°°4(€€€€€€€ÁÕ‰±¥Í¡•‘}…Ğè¹Õ±°°4(€€€€€€€™…±±‰…¬èÑÉÕ”°4(€€€€€€€‘•É…‘•èÑÉÕ”°4(€€€€€ô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹•Ğ ˆ½ÁÕ‰±¥Œ½¡½µ•Á…”½…Ñ¥Ù”µ©½ˆˆ°½ÁÑ¥½¹…±ÕÍÑ½µ•ÉM•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€É•Ì¹Í•Ğ ‰…¡”µ½¹ÑÉ½°ˆ°€‰¹¼µÍÑ½É”ˆ¤ì4(€€€ÑÉäì4(€€€€€½¹ÍĞ…Ñ¥Ù•)½ˆ€ô…İ…¥Ğ±½…‘Ñ¥Ù•)½‰½ÉÕÍÑ½µ•È¡Á½½°°É•Ä¹ÕÍÑ½µ•Èü¹ÍÕˆñğ€ˆˆ¤ì4(€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°…Ñ¥Ù•}©½ˆè…Ñ¥Ù•)½ˆô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°…Ñ¥Ù•}©½ˆè¹Õ±°°Í¡•µ…}É•…‘äè™…±Í”ô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…Ñ¥Ù”µ©½‰t™…¥±•ˆ°ì½‘”è•ÉÉ½Èü¹½‘”ñğ€‰IHˆô¤ì4(€€€€€É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°…Ñ¥Ù•}©½ˆè¹Õ±°ô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹•Ğ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½½¹™¥œˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡}É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÉ½Ü€ô…İ…¥Ğ•¹ÍÕÉ•É…™ÑI½Ü¡Á½½°¤ì4(€€€€€É•Ì¹©Í½¸¡ì4(€€€€€€€½¬èÑÉÕ”°4(€€€€€€€‘É…™Ñ}½¹™¥œè¡å‘É…Ñ•É…™Ñ½¹™¥œ¡É½Ü¹‘É…™Ñ}½¹™¥œ¤°4(€€€€€€€ÁÕ‰±¥Í¡•‘}½¹™¥œèÉ½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œñğ¹Õ±°°4(€€€€€€€Ù•ÉÍ¥½¸èÉ½Ü¹Ù•ÉÍ¥½¸°4(€€€€€€€ÕÁ‘…Ñ•‘}‰äèÉ½Ü¹ÕÁ‘…Ñ•‘}‰ä°4(€€€€€€€ÕÁ‘…Ñ•‘}…ĞèÉ½Ü¹ÕÁ‘…Ñ•‘}…Ğ°4(€€€€€€€ÁÕ‰±¥Í¡•‘}…ĞèÉ½Ü¹ÁÕ‰±¥Í¡•‘}…Ğ°4(€€€€€ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½•Ñt™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â¯‚â—‚âS‚â‚æ'‚â·‚â‡‚âç‚â”5Lƒ‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹ÁÕĞ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½‘É…™Ğˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸€ôÙ…±¥‘…Ñ•½¹™¥œ¡É•Ä¹‰½‘äü¹½¹™¥œñğÉ•Ä¹‰½‘ä¤ì4(€€€€€…İ…¥ĞÉ•Í½±Ù•%½¹5•‘¥„¡Á½½°°Ù…±¥‘…Ñ¥½¸¤ì4(€€€€€¥˜€ …Ù…±¥‘…Ñ¥½¸¹½¬¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰Y1%Q%=9}%1ˆ°‘•Ñ…¥±ÌèÙ…±¥‘…Ñ¥½¸¹•ÉÉ½ÉÌô¤ì4(€€€€€½¹ÍĞ…Ñ½È€ô…Ñ½É9…µ”¡É•Ä¤ì4(€€€€€½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}½¹™¥Ì€¡½¹™¥}­•ä°‘É…™Ñ}½¹™¥œ°Ù•ÉÍ¥½¸°ÕÁ‘…Ñ•‘}‰ä°ÕÁ‘…Ñ•‘}…Ğ¤4(€€€€€€€€Y1UL€ Ä°€Èèé©Í½¹ˆ°€Ä°€Ì°9=\ ¤¤4(€€€€€€€€=8=91%P€¡½¹™¥}­•ä¤<UAQ4(€€€€€€€€€€MP‘É…™Ñ}½¹™¥œõa1U¹‘É…™Ñ}½¹™¥œ°4(€€€€€€€€€€€€€€Ù•ÉÍ¥½¸õÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}½¹™¥Ì¹Ù•ÉÍ¥½¸€¬€Ä°4(€€€€€€€€€€€€€€ÕÁ‘…Ñ•‘}‰äõa1U¹ÕÁ‘…Ñ•‘}‰ä°4(€€€€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğõ9=\ ¤4(€€€€€€€€IQUI9%9‘É…™Ñ}½¹™¥œ°Ù•ÉÍ¥½¸°ÕÁ‘…Ñ•‘}‰ä°ÕÁ‘…Ñ•‘}…Ğ°ÁÕ‰±¥Í¡•‘}…Ñ€°4(€€€€€€€m=9%}-d°)M=8¹ÍÑÉ¥¹¥™ä¡Ù…±¥‘…Ñ¥½¸¹½¹™¥œ¤°…Ñ½Ét4(€€€€€€¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°€¸¸¹É•ÍÕ±Ğ¹É½İÍlÁtô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½‘É…™Ñt™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚âk‚âÇ‚âg‚â_‚âÛ‚âÉ…™Ğƒ‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹Á½ÍĞ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½ÁÕ‰±¥Í ˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÉ½Ü€ô…İ…¥Ğ•¹ÍÕÉ•É…™ÑI½Ü¡Á½½°¤ì4(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸€ôÙ…±¥‘…Ñ•½¹™¥œ¡É•Ä¹‰½‘äü¹½¹™¥œñğÉ½Ü¹‘É…™Ñ}½¹™¥œ¤ì4(€€€€€…İ…¥ĞÉ•Í½±Ù•%½¹5•‘¥„¡Á½½°°Ù…±¥‘…Ñ¥½¸¤ì4(€€€€€¥˜€ …Ù…±¥‘…Ñ¥½¸¹½¬¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰Y1%Q%=9}%1ˆ°‘•Ñ…¥±ÌèÙ…±¥‘…Ñ¥½¸¹•ÉÉ½ÉÌô¤ì4(€€€€€½¹ÍĞ…Ñ½È€ô…Ñ½É9…µ”¡É•Ä¤ì4(€€€€€½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}½¹™¥Ì4(€€€€€€€€MP‘É…™Ñ}½¹™¥œôÈèé©Í½¹ˆ°4(€€€€€€€€€€€€ÁÕ‰±¥Í¡•‘}½¹™¥œôÈèé©Í½¹ˆ°4(€€€€€€€€€€€€Ù•ÉÍ¥½¸õÙ•ÉÍ¥½¸€¬€Ä°4(€€€€€€€€€€€€ÕÁ‘…Ñ•‘}‰äôÌ°4(€€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ğõ9=\ ¤°4(€€€€€€€€€€€€ÁÕ‰±¥Í¡•‘}…Ğõ9=\ ¤4(€€€€€€€€]!I½¹™¥}­•äôÄ4(€€€€€€€€IQUI9%9‘É…™Ñ}½¹™¥œ°ÁÕ‰±¥Í¡•‘}½¹™¥œ°Ù•ÉÍ¥½¸°ÕÁ‘…Ñ•‘}‰ä°ÕÁ‘…Ñ•‘}…Ğ°ÁÕ‰±¥Í¡•‘}…Ñ€°4(€€€€€€€m=9%}-d°)M=8¹ÍÑÉ¥¹¥™ä¡Ù…±¥‘…Ñ¥½¸¹½¹™¥œ¤°…Ñ½Ét4(€€€€€€¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°€¸¸¹É•ÍÕ±Ğ¹É½İÍlÁtô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½ÁÕ‰±¥Í¡t™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰AÕ‰±¥Í ƒ‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€½¹ÍĞÕÁ±½…‘5¥‘‘±•İ…É”€ôÕÁ±½…€˜˜ÑåÁ•½˜ÕÁ±½…¹Í¥¹±”€ôôô€‰™Õ¹Ñ¥½¸ˆ€üÕÁ±½…¹Í¥¹±” ‰¥µ…”ˆ¤€è¹Õ±°ì4(€É½ÕÑ•È¹Á½ÍĞ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½¥µ…•Ìˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°€¡É•Ä°É•Ì°¹•áĞ¤€ôøì4(€€€¥˜€ …ÕÁ±½…‘5¥‘‘±•İ…É”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰UA1=}9=Q}=9%UIˆô¤ì4(€€€ÕÁ±½…‘5¥‘‘±•İ…É”¡É•Ä°É•Ì°¹•áĞ¤ì4(€ô°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞ™¥±”€ôÉ•Ä¹™¥±”ì4(€€€€€¥˜€ …™¥±”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚â‚â‚âã‚âO‚âË‚æ‚â—‚âß‚â·‚â‚æ‚â‚â—‚æ3‚âƒ‚âË‚âxˆô¤ì4(€€€€€¥˜€ …™¥±”¹‰Õ™™•Èñğ€…™¥±”¹‰Õ™™•È¹±•¹Ñ ¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â‡‚æ#‚â{‚âk‚æ‚â‚â—‚æ3‚â‚âç‚âo‚âƒ‚âË‚âxˆô¤ì4(€€€€€¥˜€ ¡™¥±”¹Í¥é”ñğ™¥±”¹‰Õ™™•È¹±•¹Ñ ¤€ø5a}%5}	eQL¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â‚â—‚æ3‚â‚âç‚âo‚âƒ‚âË‚â{‚æ‚â¯‚â7‚æ#‚æ‚â‚âÓ‚âd€ÄÁ5ˆô¤ì4(€€€€€½¹ÍĞ‘•±…É•‘5¥µ”€ôMÑÉ¥¹œ¡™¥±”¹µ¥µ•ÑåÁ”ñğ€ˆˆ¤¹Ñ½1½İ•É…Í” ¤ì4(€€€€€¥˜€ …11=]}5%5}QeAL¹¡…Ì¡‘•±…É•‘5¥µ”¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚â‚â·‚â‚â‚âÇ‚âk‚æ‚â'‚â{‚âË‚âÃ‚æ‚â‚â—‚æ0)A°A9ƒ‚â¯‚â‚âß‚â´]	@ˆô¤ì4(€€€€€½¹ÍĞ…ÑÕ…±5¥µ”€ô‘•Ñ•Ñ%µ…•M¥¹…ÑÕÉ”¡™¥±”¹‰Õ™™•È¤ì4(€€€€€¥˜€ ……ÑÕ…±5¥µ”ñğ…ÑÕ…±5¥µ”€„ôô‘•±…É•‘5¥µ”¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â‚â—‚æ3‚â‚âç‚âo‚âƒ‚âË‚â{‚æ‚â‡‚æ#‚â[‚âç‚â‚âW‚æ'‚â·‚â‚â¯‚â‚âß‚â·‚æ‚â«‚â×‚â‹‚â¯‚âË‚âˆˆô¤ì4(€€€€€¥˜€ …±½Õ‘¥¹…ÉåUÁ±½…‘	Õ™™•È¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰1=U%9Ie}9=Q}=9%UIˆô¤ì4(€€€€€½¹ÍĞÁÕ‰±¥%€ô¡½µ•Á…•|‘í…Ñ”¹¹½Ü ¥õ|‘íÉåÁÑ¼¹É…¹‘½µUU% ¤¹Í±¥” À°€à¥õ€ì4(€€€€€½¹ÍĞÕÁ±½…‘•€ô…İ…¥Ğ±½Õ‘¥¹…ÉåUÁ±½…‘	Õ™™•È¡ì4(€€€€€€€‰Õ™™•Èè™¥±”¹‰Õ™™•È°4(€€€€€€€µ¥µ•ÑåÁ”è™¥±”¹µ¥µ•ÑåÁ”°4(€€€€€€€™½±‘•Èè€‰İ˜½¡½µ•Á…”ˆ°4(€€€€€€€ÁÕ‰±¥%°4(€€€€€€€ÑÉ…¹Í™½Éµ…Ñ¥½¸è€‰}±¥µ¥Ğ±İ|ÄĞÀÀ½Å}…ÕÑ¼½™}…ÕÑ¼ˆ°4(€€€€€ô¤ì4(€€€€€½¹ÍĞ…Ñ½È€ô…Ñ½É9…µ”¡É•Ä¤ì4(€€€€€…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€€€%9MIP%9Q<ÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}µ•‘¥„€¡¥µ…•}ÁÕ‰±¥}¥°¥µ…•}ÕÉ°°½É¥¥¹…±}¹…µ”°µ¥µ•}ÑåÁ”°™¥±•}Í¥é”°ÕÁ±½…‘•‘}‰ä¤4(€€€€€€€€Y1UL€ Ä°€È°€Ì°€Ğ°€Ô°€Ø¤4(€€€€€€€€=8=91%P€¡¥µ…•}ÁÕ‰±¥}¥¤<9=Q!%9€°4(€€€€€€€mÕÁ±½…‘•¹ÁÕ‰±¥}¥ñğÁÕ‰±¥%°ÕÁ±½…‘•¹Í•ÕÉ•}ÕÉ°°™¥±”¹½É¥¥¹…±¹…µ”ñğ€ˆˆ°™¥±”¹µ¥µ•ÑåÁ”°™¥±”¹Í¥é”ñğ¹Õ±°°…Ñ½Ét4(€€€€€€¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°¥µ…•}ÕÉ°èÕÁ±½…‘•¹Í•ÕÉ•}ÕÉ°°¥µ…•}ÁÕ‰±¥}¥èÕÁ±½…‘•¹ÁÕ‰±¥}¥ñğÁÕ‰±¥%ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½ÕÁ±½…‘t™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÉ½È¹µ•ÍÍ…”ñğ€‹‚â·‚âÇ‚âo‚æ‚â¯‚â—‚âS‚â‚âç‚âo‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹‘•±•Ñ” ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½¥µ…•Ì¼éÁÕ‰±¥%ˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÁÕ‰±¥%€ô±•…¹Q•áĞ¡É•Ä¹Á…É…µÌ¹ÁÕ‰±¥%°€ÌÀÀ¤ì4(€€€€€¥˜€ …ÁÕ‰±¥%¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰%9Y1%}AU	1%}%ˆô¤ì4(€€€€€½¹ÍĞÉ½Ü€ô…İ…¥Ğ•¹ÍÕÉ•É…™ÑI½Ü¡Á½½°¤ì4(€€€€€½¹ÍĞÁÕ‰±¥Í¡•‘Q•áĞ€ô)M=8¹ÍÑÉ¥¹¥™ä¡É½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œñğíô¤ì4(€€€€€¥˜€¡ÁÕ‰±¥Í¡•‘Q•áĞ¹¥¹±Õ‘•Ì¡ÁÕ‰±¥%¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀä¤¹©Í½¸¡ì•ÉÉ½Èè€‰%5}UM}	e}AU	1%M!}=9%ˆô¤ì4(€€€€€¥˜€¡±½Õ‘¥¹…Éå•ÍÑÉ½åAÕ‰±¥%¤…İ…¥Ğ±½Õ‘¥¹…Éå•ÍÑÉ½åAÕ‰±¥%¡ÁÕ‰±¥%¤ì4(€€€€€…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}µ•‘¥„4(€€€€€€€€MP‘•±•Ñ•‘}…Ğõ9=\ ¤°‘•±•Ñ•‘}‰äôÈ4(€€€€€€€€]!I¥µ…•}ÁÕ‰±¥}¥ôÄ9‘•±•Ñ•‘}…Ğ%L9U11€°4(€€€€€€€mÁÕ‰±¥%°…Ñ½É9…µ”¡É•Ä¥t4(€€€€€€¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½‘•±•Ñ”µ¥µ…•t™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚â—‚âk‚â‚âç‚âo‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹‘•±•Ñ” ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½¥µ…•Ìˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÁÕ‰±¥%€ô±•…¹Q•áĞ¡É•Ä¹‰½‘äü¹ÁÕ‰±¥}¥ñğÉ•Ä¹‰½‘äü¹¥µ…•}ÁÕ‰±¥}¥°€ÌÀÀ¤ì4(€€€€€¥˜€ …ÁÕ‰±¥%¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰%9Y1%}AU	1%}%ˆô¤ì4(€€€€€½¹ÍĞÉ½Ü€ô…İ…¥Ğ•¹ÍÕÉ•É…™ÑI½Ü¡Á½½°¤ì4(€€€€€½¹ÍĞÁÕ‰±¥Í¡•‘Q•áĞ€ô)M=8¹ÍÑÉ¥¹¥™ä¡É½Ü¹ÁÕ‰±¥Í¡•‘}½¹™¥œñğíô¤ì4(€€€€€¥˜€¡ÁÕ‰±¥Í¡•‘Q•áĞ¹¥¹±Õ‘•Ì¡ÁÕ‰±¥%¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀä¤¹©Í½¸¡ì•ÉÉ½Èè€‰%5}UM}	e}AU	1%M!}=9%ˆô¤ì4(€€€€€¥˜€¡±½Õ‘¥¹…Éå•ÍÑÉ½åAÕ‰±¥%¤…İ…¥Ğ±½Õ‘¥¹…Éå•ÍÑÉ½åAÕ‰±¥%¡ÁÕ‰±¥%¤ì4(€€€€€…İ…¥ĞÁ½½°¹ÅÕ•Éä 4(€€€€€€€UAQÁÕ‰±¥Œ¹¡½µ•Á…•}µÍ}µ•‘¥„4(€€€€€€€€MP‘•±•Ñ•‘}…Ğõ9=\ ¤°‘•±•Ñ•‘}‰äôÈ4(€€€€€€€€]!I¥µ…•}ÁÕ‰±¥}¥ôÄ9‘•±•Ñ•‘}…Ğ%L9U11€°4(€€€€€€€mÁÕ‰±¥%°…Ñ½É9…µ”¡É•Ä¥t4(€€€€€€¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½‘•±•Ñ”µ¥µ…•t™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚â—‚âk‚â‚âç‚âo‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹Á½ÍĞ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½Íå¹Œµ…ÉÑ¥±•Ìˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÍ½ÕÉ•UÉ°€ô±•…¹Q•áĞ¡É•Ä¹‰½‘äü¹Í½ÕÉ•}ÕÉ°°€ÌÀÀ¤ì4(€€€€€¥˜€ …Í½ÕÉ•UÉ°¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‰Í½ÕÉ•}ÕÉ°É•ÅÕ¥É•ˆô¤ì4(€€€€€½¹ÍĞÍ••‘UÉ±Ì€ôÉÉ…ä¹¥ÍÉÉ…ä¡É•Ä¹‰½‘äü¹Í••‘}ÕÉ±Ì¤4(€€€€€€€€üÉ•Ä¹‰½‘ä¹Í••‘}ÕÉ±Ì¹µ…À ¡Ù…±Õ”¤€ôø±•…¹Q•áĞ¡Ù…±Õ”°€ÔÀÀ¤¤¹™¥±Ñ•È¡	½½±•…¸¤¹Í±¥” À°5a}M}UI1L¤4(€€€€€€€€èmtì4(€€€€€½¹ÍĞÉ•ÍÕ±Ğ€ô…İ…¥Ğ…ÉÑ¥±•Må¹Œ¹Íå¹ÉÑ¥±•Ì¡Á½½°°Í½ÕÉ•UÉ°°ìÍ••‘UÉ±Ì°±¥µ¥Ğè€ÄÈô¤ì4(€€€€€¥˜€ …É•ÍÕ±Ğ¹½¬¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ĞÀÀ¤¹©Í½¸¡ì•ÉÉ½ÈèÉ•ÍÕ±Ğ¹•ÉÉ½Èñğ€‰Me9}%1ˆô¤ì4(€€€€€½¹ÍĞÍå¹•€ô…İ…¥Ğ…ÉÑ¥±•Må¹Œ¹•ÑMå¹•‘ÉÑ¥±•Ì¡Á½½°°Í½ÕÉ•UÉ°°€ÄÈ¤ì4(€€€€€É•Ì¹©Í½¸¡ì4(€€€€€€€½¬èÑÉÕ”°4(€€€€€€€Íå¹•‘}½Õ¹ĞèÉ•ÍÕ±Ğ¹Íå¹•°4(€€€€€€€™•Ñ¡•‘}½Õ¹ĞèÉ•ÍÕ±Ğ¹™•Ñ¡•°4(€€€€€€€…ÉÑ¥±•ÌèÍå¹•¹…ÉÑ¥±•Ì°4(€€€€€€€±…ÍÑ}Íå¹•‘}…ĞèÍå¹•¹±…ÍÑ}Íå¹•‘}…Ğ°4(€€€€€ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½Íå¹Œµ…ÉÑ¥±•Ít™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè•ÉÉ½È¹µ•ÍÍ…”ñğ€‹‚â/‚âÓ‚â‚â‚æ3‚âk‚â_‚â‚âŸ‚âË‚â‡‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É½ÕÑ•È¹•Ğ ˆ½…‘µ¥¸½¡½µ•Á…”µµÌ½Íå¹•µ…ÉÑ¥±•Ìˆ°É•ÅÕ¥É•‘µ¥¹M•ÍÍ¥½¸°…Íå¹Œ€¡É•Ä°É•Ì¤€ôøì4(€€€ÑÉäì4(€€€€€½¹ÍĞÍ½ÕÉ•UÉ°€ô±•…¹Q•áĞ¡É•Ä¹ÅÕ•Éäü¹Í½ÕÉ•}ÕÉ°°€ÌÀÀ¤ì4(€€€€€¥˜€ …Í½ÕÉ•UÉ°¤É•ÑÕÉ¸É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°…ÉÑ¥±•Ìèmt°±…ÍÑ}Íå¹•‘}…Ğè¹Õ±°ô¤ì4(€€€€€½¹ÍĞÍå¹•€ô…İ…¥Ğ…ÉÑ¥±•Må¹Œ¹•ÑMå¹•‘ÉÑ¥±•Ì¡Á½½°°Í½ÕÉ•UÉ°°€ÄÈ¤ì4(€€€€€É•Ì¹©Í½¸¡ì½¬èÑÉÕ”°€¸¸¹Íå¹•ô¤ì4(€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€¥˜€¡¥ÍM¡•µ…ÉÉ½È¡•ÉÉ½È¤¤É•ÑÕÉ¸É•Ì¹ÍÑ…ÑÕÌ ÔÀÌ¤¹©Í½¸¡ì•ÉÉ½Èè€‰!=5A}5M}M!5}9=Q}Idˆô¤ì4(€€€€€½¹Í½±”¹•ÉÉ½È ‰m¡½µ•Á…”½…‘µ¥¸½Íå¹•µ…ÉÑ¥±•Ít™…¥±•ˆ°•ÉÉ½È¤ì4(€€€€€É•Ì¹ÍÑ…ÑÕÌ ÔÀÀ¤¹©Í½¸¡ì•ÉÉ½Èè€‹‚æ‚â¯‚â—‚âS‚â‚æ'‚â·‚â‡‚âç‚â—‚â_‚â×‚æ#‚â/‚âÓ‚â‚â‚æ3‚æ‚â‡‚æ#‚â«‚âÏ‚æ‚â‚æ‚â ˆô¤ì4(€€€ô4(€ô¤ì4(4(€É•ÑÕÉ¸É½ÕÑ•Èì4)ô4(4)µ½‘Õ±”¹•áÁ½ÉÑÌ€ôì4(€=9%}-d°4(€U1Q}=9%°4(€5a}%5}	eQL°4(€MQ%=9}QeAL°4(€A}Y%1	%1%Qe}-eL°4(€U1Q}A}Y%1	%1%Qd°4(€I}A}Y%1	%1%Qd°4(€…Ñ¥Ù•9½Ü°4(€É•…Ñ•!½µ•Á…•I½ÕÑ•Ì°4(€¡å‘É…Ñ•É…™Ñ½¹™¥œ°4(€¹½Éµ…±¥é•A…•Ù…¥±…‰¥±¥Ñä°4(€É•…‘A…•Ù…¥±…‰¥±¥Ñä°4(€É•Í½±Ù•%½¹5•‘¥„°4(€ÍÑÉ¥ÁAÕ‰±¥½¹™¥œ°4(€Ù…±¥‘…Ñ•½¹™¥œ°4)ôì4