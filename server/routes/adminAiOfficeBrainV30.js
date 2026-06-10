"use strict";

const express = require("express");
const {
  ensureAiBrainItemsTable,
  normalizeBrainPackageFromFolder,
  seedCwfBrainV2,
  loadAiBrainContext,
  ALLOWED_ITEM_TYPES,
} = require("../aiBrainImportV30");

function cleanText(value, max = 4000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}

function parseBool(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|active)$/i.test(String(value));
}

function safeJson(value, fallback) {
  try { return JSON.stringify(value ?? fallback ?? {}); }
  catch (_) { return JSON.stringify(fallback ?? {}); }
}

function normalizeImportPayload(body = {}) {
  const payload = body && typeof body === "object" ? body : {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const warnings = [];
  const valid = [];
  const rejected = [];
  rawItems.forEach((row, idx) => {
    const item = row && typeof row === "object" ? row : {};
    const itemType = cleanText(item.item_type || item.type || "", 80);
    const content = cleanText(item.content || item.reply || item.answer || item.final_admin_reply || "", 12000);
    const title = cleanText(item.title || item.intent || `brain_item_${idx + 1}`, 240);
    const errors = [];
    if (!itemType || !ALLOWED_ITEM_TYPES.has(itemType)) errors.push(`unknown item_type: ${itemType || "empty"}`);
    if (!content) errors.push("empty content");
    if (/(\b0\d{8,10}\b|\d{2,5}\s*(?:ถนน|ซอย|หมู่บ้าน|คอนโด|ห้อง))/i.test(content)) warnings.push(`row ${idx + 1}: possible private customer data; review before commit`);
    if (errors.length) {
      rejected.push({ row: idx + 1, item, errors });
      return;
    }
    valid.push({
      item_type: itemType,
      title,
      content,
      intent: cleanText(item.intent || "", 120),
      service_type: cleanText(item.service_type || "", 120),
      customer_stage: cleanText(item.customer_stage || "", 120),
      agent_key: cleanText(item.agent_key || "all", 80),
      language: cleanText(item.language || "th", 20),
      priority: Math.max(1, Math.min(100, Number(item.priority || 50))),
      confidence: Math.max(1, Math.min(100, Number(item.confidence || 80))),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 30) : String(item.tags || "").split(/[|,]/).map((x) => cleanText(x, 80)).filter(Boolean),
      source: cleanText(item.source || payload.source || "manual_import", 120),
      source_file: cleanText(item.source_file || payload.file_name || "manual_import", 240),
      source_version: cleanText(item.source_version || payload.version || "", 80),
      risk_label: cleanText(item.risk_label || item.risk || "", 80),
      metadata: item.metadata && typeof item.metadata === "object" ? item.metadata : {},
    });
  });
  return { valid, rejected, warnings };
}

module.exports = function createAdminAiOfficeBrainV30Routes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeBrainV30Routes requires pool and requireAdminSession");

  const router = express.Router();
  router.use(express.json({ limit: "6mb" }));

  router.post("/admin/ai-office/brain/seed-cwf-v2", requireAdminSession, async (req, res) => {
    try {
      const result = await seedCwfBrainV2(pool, { createdBy: getAdminUser(req) || "admin" });
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (e) {
      return res.status(e.status || 500).json({
        ok: false,
        error: e.message || "SEED_CWF_BRAIN_V2_FAILED",
        inserted_count: 0,
        disabled_old_count: 0,
        source_files: [],
        warnings: [String(e.message || e)],
      });
    }
  });

  router.get("/admin/ai-office/brain/items", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainItemsTable(pool);
      const q = cleanText(req.query.q || "", 300);
      const active = parseBool(req.query.active, true);
      const params = [
        q ? `%${q}%` : "",
        cleanText(req.query.item_type || "", 80),
        cleanText(req.query.agent_key || "", 80),
        cleanText(req.query.source || "", 120),
        active,
        Math.max(1, Math.min(200, Number(req.query.limit || 100))),
      ];
      const r = await pool.query(`
        SELECT id,item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,is_active,metadata,created_at,updated_at
          FROM public.ai_brain_items
         WHERE is_active=$5
           AND ($1='' OR title ILIKE $1 OR content ILIKE $1 OR tags::text ILIKE $1)
           AND ($2='' OR item_type=$2)
           AND ($3='' OR agent_key=$3 OR agent_key='all')
           AND ($4='' OR source=$4)
         ORDER BY priority DESC, updated_at DESC, id DESC
         LIMIT $6
      `, params);
      return res.json({ ok: true, items: r.rows || [], total: (r.rows || []).length });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AI_BRAIN_ITEMS_FAILED" });
    }
  });

  router.post("/admin/ai-office/brain/import-preview", requireAdminSession, async (req, res) => {
    try {
      const normalized = normalizeImportPayload(req.body || {});
      return res.json({
        ok: true,
        total_rows: (req.body?.items || []).length,
        valid_count: normalized.valid.length,
        invalid_count: normalized.rejected.length,
        warnings: normalized.warnings,
        preview_items: normalized.valid.slice(0, 30),
        rejected_items: normalized.rejected.slice(0, 30),
      });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "IMPORT_PREVIEW_FAILED" });
    }
  });

  router.post("/admin/ai-office/brain/import-commit", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainItemsTable(pool);
      const mode = cleanText(req.body?.mode || "append", 40);
      const normalized = normalizeImportPayload(req.body || {});
      if (!normalized.valid.length) return res.status(400).json({ ok: false, error: "ไม่มีรายการสมองที่ผ่านการตรวจสอบ", warnings: normalized.warnings, rejected_items: normalized.rejected });
      let disabledOld = 0;
      const source = cleanText(req.body?.source || normalized.valid[0]?.source || "manual_import", 120);
      if (mode === "replace_same_source") {
        const d = await pool.query(`UPDATE public.ai_brain_items SET is_active=false, updated_at=NOW() WHERE source=$1 AND is_active=true`, [source]);
        disabledOld = d.rowCount || 0;
      }
      const sql = `
        INSERT INTO public.ai_brain_items(item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,is_active,metadata,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,true,$16::jsonb,$17)
      `;
      for (const item of normalized.valid) {
        await pool.query(sql, [
          item.item_type,item.title,item.content,item.intent,item.service_type,item.customer_stage,item.agent_key,item.language,item.priority,item.confidence,
          safeJson(item.tags, []),item.source,item.source_file,item.source_version,item.risk_label,safeJson(item.metadata, {}),getAdminUser(req) || "admin",
        ]);
      }
      return res.json({ ok: true, inserted_count: normalized.valid.length, disabled_old_count: disabledOld, warnings: normalized.warnings, rejected_count: normalized.rejected.length });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "IMPORT_COMMIT_FAILED" });
    }
  });

  router.get("/admin/ai-office/brain/export", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainItemsTable(pool);
      const r = await pool.query(`
        SELECT item_type,title,content,intent,service_type,customer_stage,agent_key,language,priority,confidence,tags,source,source_file,source_version,risk_label,metadata
          FROM public.ai_brain_items
         WHERE is_active=true
         ORDER BY source, priority DESC, id ASC
      `);
      const payload = { version: "cwf-ai-brain-v1", business: "Coldwindflow Air Services", exported_at: new Date().toISOString(), items: r.rows || [] };
      const fileName = `cwf-ai-brain-${new Date().toISOString().slice(0,10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "EXPORT_AI_BRAIN_FAILED" });
    }
  });

  router.patch("/admin/ai-office/brain/items/:id", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainItemsTable(pool);
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ ok: false, error: "invalid brain item id" });
      const fields = ["title","content","intent","service_type","customer_stage","agent_key","language","priority","confidence","risk_label"];
      const patch = {};
      fields.forEach((f) => { if (Object.prototype.hasOwnProperty.call(req.body || {}, f)) patch[f] = req.body[f]; });
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: "no editable fields" });
      const sets = [];
      const values = [];
      Object.entries(patch).forEach(([key, value], idx) => { sets.push(`${key}=$${idx + 1}`); values.push(key === "priority" || key === "confidence" ? Math.max(1, Math.min(100, Number(value || 50))) : cleanText(value, key === "content" ? 12000 : 240)); });
      values.push(id);
      const r = await pool.query(`UPDATE public.ai_brain_items SET ${sets.join(",")}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`, values);
      return res.json({ ok: true, item: r.rows?.[0] || null });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "UPDATE_AI_BRAIN_ITEM_FAILED" });
    }
  });

  router.patch("/admin/ai-office/brain/items/:id/disable", requireAdminSession, async (req, res) => {
    try {
      await ensureAiBrainItemsTable(pool);
      const id = Number(req.params.id || 0);
      if (!id) return res.status(400).json({ ok: false, error: "invalid brain item id" });
      const r = await pool.query(`UPDATE public.ai_brain_items SET is_active=false, updated_at=NOW() WHERE id=$1 RETURNING id,is_active`, [id]);
      return res.json({ ok: true, item: r.rows?.[0] || null });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "DISABLE_AI_BRAIN_ITEM_FAILED" });
    }
  });

  router.post("/admin/ai-office/brain/context", requireAdminSession, async (req, res) => {
    try {
      const items = await loadAiBrainContext(pool, req.body || {});
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AI_BRAIN_CONTEXT_FAILED" });
    }
  });

  router.get("/admin/ai-office/brain/package-preview", requireAdminSession, async (_req, res) => {
    try {
      const normalized = normalizeBrainPackageFromFolder();
      return res.status(normalized.missing ? 500 : 200).json({
        ok: !normalized.missing,
        item_count: normalized.items.length,
        source_files: normalized.source_files,
        warnings: normalized.warnings,
        preview_items: normalized.items.slice(0, 20),
      });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "BRAIN_PACKAGE_PREVIEW_FAILED" });
    }
  });

  return router;
};
