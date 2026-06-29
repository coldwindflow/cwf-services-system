"use strict";

const crypto = require("crypto");
const express = require("express");
const { validateCatalogImageFile } = require("../lib/cloudinaryImageUpload");

const CONFIG_KEY = "customer_homepage_v1";
const MAX_JSON_BYTES = 120 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SECTION_TYPES = new Set([
  "hero",
  "quick",
  "announcements",
  "featured_services",
  "updates",
  "articles",
  "trust",
]);
const INTERNAL_ROUTES = new Set(["home", "booking", "scheduled", "urgent", "tracking", "profile", "store"]);

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
        { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "chat" },
      ],
    },
    {
      id: "announcements",
      type: "announcements",
      enabled: true,
      sort_order: 30,
      title: "ข่าวและประกาศ CWF",
      body: "",
      items: [],
    },
    {
      id: "featured_services",
      type: "featured_services",
      enabled: true,
      sort_order: 40,
      title: "บริการแนะนำ",
      body: "ราคาและรายละเอียดดึงจาก Catalog",
      items: [],
    },
    {
      id: "updates",
      type: "updates",
      enabled: true,
      sort_order: 50,
      title: "ภาพกิจกรรมและโพสต์",
      body: "เชื่อมต่อไปยัง Facebook",
      items: [],
    },
    {
      id: "articles",
      type: "articles",
      enabled: true,
      sort_order: 60,
      title: "บทความแนะนำ",
      body: "อ่านต่อบน cwf-air.com",
      items: [],
    },
    {
      id: "trust",
      type: "trust",
      enabled: true,
      sort_order: 70,
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
  };
  if (cleanText(item.icon, 30)) out.icon = cleanText(item.icon, 30);
  if (cleanText(item.route, 40)) out.route = cleanText(item.route, 40);
  if (cleanText(item.url, 500)) out.url = cleanText(item.url, 500);
  if (cleanText(item.action, 40)) out.action = cleanText(item.action, 40);
  if (cleanText(item.image_url, 700)) out.image_url = cleanText(item.image_url, 700);
  if (cleanText(item.image_public_id, 300)) out.image_public_id = cleanText(item.image_public_id, 300);
  if (cleanText(item.active_from, 32)) out.active_from = cleanText(item.active_from, 32);
  if (cleanText(item.active_to, 32)) out.active_to = cleanText(item.active_to, 32);
  if (!out.title && sectionType !== "quick") errors.push(`${pathName}.title required`);
  validateUrlOrRoute(out, errors, pathName, {
    externalRequired: sectionType === "updates" || sectionType === "articles",
    noImage: sectionType === "trust",
  });
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
  const maxItems = type === "quick" ? 4 : 12;
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
  validateImageUrl(out.image_url, errors, `${id}.image_url`);
  validateDateRange(out, errors, id);
  if (type === "hero" && !out.title) errors.push("hero.title required");
  return out;
}

function validateConfig(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) errors.push("payload must be object");
  if (jsonSize(input) > MAX_JSON_BYTES) errors.push("payload too large");
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  if (!sections.length) errors.push("sections required");
  if (sections.length > 10) errors.push("sections too many");
  const normalized = {
    version: 1,
    sections: sections.map((section, index) => normalizeSection(section, index, errors))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
  return { ok: errors.length === 0, errors, config: normalized };
}

function activeNow(item, now = new Date()) {
  const from = cleanText(item.active_from || "", 32);
  const to = cleanText(item.active_to || "", 32);
  const ts = now.getTime();
  if (from && new Date(from).getTime() > ts) return false;
  if (to && new Date(to).getTime() < ts) return false;
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
        .filter((item) => activeNow(item, now))
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((item) => {
          const cleanItem = { ...item };
          delete cleanItem.image_public_id;
          delete cleanItem.updated_by;
          return cleanItem;
        });
      return cleanSection;
    });
  return { version: 1, sections };
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
  if (!pool) throw new Error("createHomepageRoutes requires pool");
  if (!requireAdminSession) throw new Error("createHomepageRoutes requires requireAdminSession");

  router.get("/public/homepage", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const row = await loadPublished(pool);
      const config = row?.published_config || DEFAULT_CONFIG;
      res.json({
        ok: true,
        config: stripPublicConfig(config),
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

  router.get("/admin/homepage-cms/config", requireAdminSession, async (_req, res) => {
    try {
      const row = await ensureDraftRow(pool);
      res.json({
        ok: true,
        draft_config: row.draft_config || DEFAULT_CONFIG,
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
      const validation = validateCatalogImageFile(file);
      if (!validation.ok) return res.status(400).json({ error: validation.error });
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

  return router;
}

module.exports = {
  CONFIG_KEY,
  DEFAULT_CONFIG,
  MAX_IMAGE_BYTES,
  SECTION_TYPES,
  createHomepageRoutes,
  stripPublicConfig,
  validateConfig,
};
