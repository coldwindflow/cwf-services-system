"use strict";

const express = require("express");
const pricingHelpers = require("./pricing");
const {
  normalizeServiceType,
  normalizeAcType,
  normalizeWashVariantLabel,
  normalizeWashKey,
} = require("./normalizers");

const CAMPAIGN_NAME = "โปรดูแลแอร์รับหน้าฝน";
const CAMPAIGN_LABEL = "Rainy Season AC Cleaning";

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function intOrNull(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function boolish(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const s = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function normalizeLine(raw = {}, fallback = {}) {
  const job_type = normalizeServiceType(raw.job_type || raw.jobType || fallback.job_type || "");
  const ac_type = normalizeAcType(raw.ac_type || raw.acType || fallback.ac_type || "");
  const wash_variant = normalizeWashVariantLabel(raw.wash_variant || raw.washVariant || fallback.wash_variant || "");
  const btu = Number(raw.btu || fallback.btu || 0);
  const machine_count = Math.max(1, Math.round(Number(raw.machine_count || raw.machineCount || fallback.machine_count || 1) || 1));
  return {
    job_type,
    ac_type,
    wash_variant,
    wash_key: normalizeWashKey(wash_variant),
    btu: Number.isFinite(btu) ? btu : 0,
    machine_count,
    repair_variant: String(raw.repair_variant || raw.repairVariant || fallback.repair_variant || "").trim(),
    assigned_to: raw.assigned_to || raw.assigned_technician_username || fallback.assigned_to || fallback.assigned_technician_username || null,
    assigned_technician_username: raw.assigned_technician_username || raw.assigned_to || fallback.assigned_technician_username || fallback.assigned_to || null,
    allocations: raw.allocations || raw.allocation || null,
  };
}

function servicesFromPayload(payload = {}) {
  const services = Array.isArray(payload.services) ? payload.services : null;
  if (services && services.length) {
    return services.map((s) => normalizeLine(s, payload)).filter((s) => s.job_type && s.ac_type);
  }
  const line = normalizeLine(payload, payload);
  return line.job_type ? [line] : [];
}

function specificity(row) {
  let score = 0;
  if (row.job_type) score += 8;
  if (row.ac_type) score += 8;
  if (row.wash_variant) score += 8;
  if (row.btu_min != null || row.btu_max != null) score += 4;
  if (row.machine_min != null || row.machine_max != null) score += 2;
  return score;
}

function rowMatches(row, line) {
  const rowJob = normalizeServiceType(row.job_type || "");
  const rowAc = normalizeAcType(row.ac_type || "");
  const rowWash = normalizeWashVariantLabel(row.wash_variant || "");
  if (rowJob && rowJob !== line.job_type) return false;
  if (rowAc && rowAc !== line.ac_type) return false;
  if (rowWash && normalizeWashKey(rowWash) !== line.wash_key) return false;
  if (row.btu_min != null && Number(line.btu || 0) < Number(row.btu_min)) return false;
  if (row.btu_max != null && Number(line.btu || 0) > Number(row.btu_max)) return false;
  if (row.machine_min != null && Number(line.machine_count || 1) < Number(row.machine_min)) return false;
  if (row.machine_max != null && Number(line.machine_count || 1) > Number(row.machine_max)) return false;
  return true;
}

function serviceItemName(line) {
  const parts = [];
  if (line.job_type === "ล้าง") {
    parts.push(`ล้างแอร์${line.ac_type || ""}`.trim());
    if (line.ac_type === "ผนัง") parts.push(line.wash_variant || "ล้างธรรมดา");
  } else if (line.job_type === "ซ่อม") {
    parts.push(`ซ่อมแอร์${line.ac_type || ""}`.trim());
    if (line.repair_variant) parts.push(line.repair_variant);
  } else if (line.job_type === "ติดตั้ง") {
    parts.push(`ติดตั้งแอร์${line.ac_type || ""}`.trim());
  } else {
    parts.push(line.job_type || "ค่าบริการ");
  }
  if (line.btu) parts.push(`${Number(line.btu || 0)} BTU`);
  parts.push(`${Math.max(1, Number(line.machine_count || 1))} เครื่อง`);
  return parts.join(" • ");
}

async function ensureCustomerPriceBookSchema(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.customer_service_price_rules (
      rule_id BIGSERIAL PRIMARY KEY,
      job_type TEXT,
      ac_type TEXT,
      wash_variant TEXT,
      btu_min INT,
      btu_max INT,
      machine_min INT,
      machine_max INT,
      normal_price NUMERIC(12,2) DEFAULT 0,
      active_price NUMERIC(12,2) DEFAULT 0,
      label TEXT,
      campaign_name TEXT,
      campaign_copy TEXT,
      seed_key TEXT,
      effective_from TIMESTAMPTZ,
      effective_to TIMESTAMPTZ,
      is_active BOOLEAN DEFAULT TRUE,
      priority INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      updated_by TEXT
    )
  `);
  await db.query(`ALTER TABLE public.customer_service_price_rules ADD COLUMN IF NOT EXISTS campaign_copy TEXT`);
  await db.query(`ALTER TABLE public.customer_service_price_rules ADD COLUMN IF NOT EXISTS seed_key TEXT`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_price_rules_lookup ON public.customer_service_price_rules(is_active, job_type, ac_type, wash_variant, priority)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_price_rules_dates ON public.customer_service_price_rules(effective_from, effective_to)`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_price_rules_seed_key ON public.customer_service_price_rules(seed_key) WHERE seed_key IS NOT NULL`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_rule_id BIGINT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS normal_unit_price NUMERIC(12,2)`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_label TEXT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_campaign_name TEXT`);
  await db.query(`ALTER TABLE public.job_items ADD COLUMN IF NOT EXISTS customer_price_source TEXT`);
}

async function loadCandidateRules(db) {
  const r = await db.query(`
    SELECT rule_id, job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
           normal_price, active_price, label, campaign_name, campaign_copy, seed_key, effective_from, effective_to,
           is_active, priority, created_at, updated_at, updated_by
      FROM public.customer_service_price_rules
     WHERE COALESCE(is_active, TRUE)=TRUE
       AND (effective_from IS NULL OR effective_from <= NOW())
       AND (effective_to IS NULL OR effective_to >= NOW())
  `);
  return r.rows || [];
}

async function resolveLinePrice(line, db) {
  const fallbackTotal = money(pricingHelpers.computeStandardPrice(line));
  const qty = Math.max(1, Number(line.machine_count || 1));
  try {
    const rows = await loadCandidateRules(db);
    const match = rows
      .filter((row) => rowMatches(row, line))
      .sort((a, b) => (Number(b.priority || 0) - Number(a.priority || 0)) || (specificity(b) - specificity(a)) || (Number(b.rule_id || 0) - Number(a.rule_id || 0)))[0];
    if (match) {
      const normalUnit = money(match.normal_price || match.active_price || 0);
      const activeUnit = money(match.active_price || match.normal_price || 0);
      return {
        normal_unit_price: normalUnit,
        active_unit_price: activeUnit,
        normal_price: money(normalUnit * qty),
        active_price: money(activeUnit * qty),
        label: match.label || null,
        campaign_name: match.campaign_name || null,
        campaign_copy: match.campaign_copy || null,
        rule_id: match.rule_id,
        source: "customer_service_price_rules",
      };
    }
  } catch (e) {
    try { console.warn("[customer_pricing] DB lookup failed, using fallback:", e.message); } catch (_) {}
  }
  const fallbackUnit = qty > 0 ? money(fallbackTotal / qty) : fallbackTotal;
  return {
    normal_unit_price: fallbackUnit,
    active_unit_price: fallbackUnit,
    normal_price: fallbackTotal,
    active_price: fallbackTotal,
    label: null,
    campaign_name: null,
    campaign_copy: null,
    rule_id: null,
    source: "fallback_pricing_js",
  };
}

async function resolveCustomerPricingMulti(payload = {}, db) {
  const lines = servicesFromPayload(payload);
  if (!lines.length) {
    const fallback = money(pricingHelpers.computeStandardPriceMulti(payload));
    return { normal_price: fallback, active_price: fallback, standard_price: fallback, lines: [], source: "fallback_pricing_js" };
  }
  const resolved = [];
  for (const line of lines) {
    resolved.push({ line, pricing: await resolveLinePrice(line, db) });
  }
  const normalTotal = money(resolved.reduce((s, x) => s + Number(x.pricing.normal_price || 0), 0));
  const activeTotal = money(resolved.reduce((s, x) => s + Number(x.pricing.active_price || 0), 0));
  const applied = resolved.find((x) => x.pricing.source === "customer_service_price_rules" && (x.pricing.label || x.pricing.campaign_name))?.pricing || null;
  return {
    normal_price: normalTotal,
    active_price: activeTotal,
    standard_price: activeTotal,
    label: applied?.label || null,
    campaign_name: applied?.campaign_name || null,
    campaign_copy: applied?.campaign_copy || null,
    source: resolved.some((x) => x.pricing.source === "customer_service_price_rules") ? "customer_service_price_rules" : "fallback_pricing_js",
    lines: resolved.map((x) => ({ ...x.line, ...x.pricing })),
  };
}

async function buildCustomerServiceLineItemsFromPayload(payload = {}, db) {
  const preview = await resolveCustomerPricingMulti(payload, db);
  const items = [];
  for (const row of preview.lines || []) {
    const qty = Math.max(1, Number(row.machine_count || 1));
    const item_name = serviceItemName(row);
    const allocations = row.allocations && typeof row.allocations === "object" ? row.allocations : null;
    if (allocations) {
      for (const [tech, rawQty] of Object.entries(allocations)) {
        const q = Math.max(0, Number(rawQty || 0));
        if (!tech || q <= 0) continue;
        items.push({
          item_id: null,
          item_name,
          qty: q,
          unit_price: row.active_unit_price,
          line_total: money(row.active_unit_price * q),
          is_service: true,
          assigned_technician_username: tech,
          customer_price_rule_id: row.rule_id || null,
          normal_unit_price: row.normal_unit_price,
          customer_price_label: row.label || null,
          customer_campaign_name: row.campaign_name || null,
          customer_price_source: row.source || null,
        });
      }
    } else {
      items.push({
        item_id: null,
        item_name,
        qty,
        unit_price: row.active_unit_price,
        line_total: money(row.active_unit_price * qty),
        is_service: true,
        assigned_technician_username: row.assigned_to || row.assigned_technician_username || null,
        customer_price_rule_id: row.rule_id || null,
        normal_unit_price: row.normal_unit_price,
        customer_price_label: row.label || null,
        customer_campaign_name: row.campaign_name || null,
        customer_price_source: row.source || null,
      });
    }
  }
  return items;
}

function rainySeasonRows(updatedBy) {
  const base = {
    job_type: "ล้าง",
    ac_type: "ผนัง",
    label: "โปรดูแลแอร์รับหน้าฝน",
    campaign_name: CAMPAIGN_NAME,
    campaign_copy: "แอร์เริ่มมีกลิ่นอับ น้ำหยด ลมไม่เย็น หรือไม่ได้ล้างมานาน? Coldwindflow เปิดโปรพิเศษสำหรับลูกค้าในพื้นที่ใกล้พระโขนงและย่านใกล้เคียง",
    is_active: true,
    priority: 100,
    updated_by: updatedBy || "system",
  };
  return [
    { ...base, seed_key: "rainy_2026_wall_small_normal", wash_variant: "ล้างธรรมดา", btu_min: 0, btu_max: 12000, normal_price: 600, active_price: 550 },
    { ...base, seed_key: "rainy_2026_wall_small_premium", wash_variant: "ล้างพรีเมียม", btu_min: 0, btu_max: 12000, normal_price: 900, active_price: 790 },
    { ...base, seed_key: "rainy_2026_wall_small_coil", wash_variant: "ล้างแขวนคอยล์", btu_min: 0, btu_max: 12000, normal_price: 1400, active_price: 1290 },
    { ...base, seed_key: "rainy_2026_wall_small_overhaul", wash_variant: "ล้างแบบตัดล้าง", btu_min: 0, btu_max: 12000, normal_price: 2000, active_price: 1850 },
    { ...base, seed_key: "rainy_2026_wall_large_normal", wash_variant: "ล้างธรรมดา", btu_min: 18000, btu_max: null, normal_price: 750, active_price: 690 },
    { ...base, seed_key: "rainy_2026_wall_large_premium", wash_variant: "ล้างพรีเมียม", btu_min: 18000, btu_max: null, normal_price: 1100, active_price: 990 },
    { ...base, seed_key: "rainy_2026_wall_large_coil", wash_variant: "ล้างแขวนคอยล์", btu_min: 18000, btu_max: null, normal_price: 1700, active_price: 1550 },
    { ...base, seed_key: "rainy_2026_wall_large_overhaul", wash_variant: "ล้างแบบตัดล้าง", btu_min: 18000, btu_max: null, normal_price: 2300, active_price: 2150 },
  ];
}

function sameBtuRange(a, b) {
  const amin = a.btu_min == null ? null : Number(a.btu_min);
  const amax = a.btu_max == null ? null : Number(a.btu_max);
  const bmin = b.btu_min == null ? null : Number(b.btu_min);
  const bmax = b.btu_max == null ? null : Number(b.btu_max);
  return (amin ?? null) === (bmin ?? null) && (amax ?? null) === (bmax ?? null);
}

function sameRainySeedSlot(existing, seed) {
  if (!existing) return false;
  if (existing.seed_key && existing.seed_key === seed.seed_key) return true;
  const campaign = String(existing.campaign_name || "");
  const label = String(existing.label || "");
  const rainyLike = campaign === CAMPAIGN_NAME || label === seed.label || /rainy/i.test(campaign) || /rainy/i.test(label);
  if (!rainyLike) return false;
  return normalizeServiceType(existing.job_type || "") === seed.job_type
    && normalizeAcType(existing.ac_type || "") === seed.ac_type
    && normalizeWashKey(existing.wash_variant || "") === normalizeWashKey(seed.wash_variant || "")
    && sameBtuRange(existing, seed);
}

async function seedRainySeasonPromo(db, updatedBy, options = {}) {
  const forceUpdate = options.forceUpdate === true;
  await ensureCustomerPriceBookSchema(db);
  const rows = rainySeasonRows(updatedBy);
  const existingRows = (await db.query(
    `SELECT rule_id, job_type, ac_type, wash_variant, btu_min, btu_max, label, campaign_name, seed_key
       FROM public.customer_service_price_rules`
  )).rows || [];
  for (const row of rows) {
    const matchingLegacy = existingRows.filter((existing) => sameRainySeedSlot(existing, row));
    const existingRuleId = matchingLegacy[0]?.rule_id || null;
    if (existingRuleId) {
      if (forceUpdate) {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET normal_price=$2, active_price=$3, label=$4, campaign_name=$5, campaign_copy=$6,
                  seed_key=$7, is_active=TRUE, priority=$8, updated_by=$9, updated_at=NOW()
            WHERE rule_id=$1`,
          [existingRuleId, row.normal_price, row.active_price, row.label, row.campaign_name, row.campaign_copy, row.seed_key, row.priority, row.updated_by]
        );
      } else {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET seed_key=COALESCE(seed_key, $2), campaign_name=COALESCE(campaign_name, $3),
                  label=COALESCE(label, $4), is_active=TRUE, updated_by=$5, updated_at=NOW()
            WHERE rule_id=$1`,
          [existingRuleId, row.seed_key, row.campaign_name, row.label, row.updated_by]
        );
      }
      for (const dup of matchingLegacy.slice(1)) {
        await db.query(
          `UPDATE public.customer_service_price_rules
              SET is_active=FALSE, updated_by=$2, updated_at=NOW()
            WHERE rule_id=$1 AND seed_key IS NULL`,
          [dup.rule_id, row.updated_by]
        );
      }
      continue;
    }
    await db.query(
      `INSERT INTO public.customer_service_price_rules
        (job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
         normal_price, active_price, label, campaign_name, campaign_copy, seed_key, is_active, priority, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (seed_key) WHERE seed_key IS NOT NULL
       DO UPDATE SET normal_price=EXCLUDED.normal_price, active_price=EXCLUDED.active_price,
         label=EXCLUDED.label, campaign_name=EXCLUDED.campaign_name, campaign_copy=EXCLUDED.campaign_copy,
         is_active=TRUE, priority=EXCLUDED.priority, updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [
        row.job_type, row.ac_type, row.wash_variant, row.btu_min, row.btu_max,
        row.normal_price, row.active_price, row.label, row.campaign_name,
        row.campaign_copy, row.seed_key, row.is_active, row.priority, row.updated_by,
      ]
    );
  }
  const existing = await db.query(
    `SELECT COUNT(*)::int AS count FROM public.customer_service_price_rules
      WHERE campaign_name=$1 AND ac_type=$2 AND job_type=$3`,
    [CAMPAIGN_NAME, "ผนัง", "ล้าง"]
  );
  return { inserted_or_existing: Number(existing.rows?.[0]?.count || 0) };
}

function cleanRuleBody(b = {}) {
  return {
    job_type: String(b.job_type || "").trim() || null,
    ac_type: String(b.ac_type || "").trim() || null,
    wash_variant: String(b.wash_variant || "").trim() || null,
    btu_min: intOrNull(b.btu_min),
    btu_max: intOrNull(b.btu_max),
    machine_min: intOrNull(b.machine_min),
    machine_max: intOrNull(b.machine_max),
    normal_price: money(b.normal_price),
    active_price: money(b.active_price),
    label: String(b.label || "").trim() || null,
    campaign_name: String(b.campaign_name || "").trim() || null,
    campaign_copy: String(b.campaign_copy || "").trim() || null,
    effective_from: String(b.effective_from || "").trim() || null,
    effective_to: String(b.effective_to || "").trim() || null,
    is_active: boolish(b.is_active, true),
    priority: intOrNull(b.priority) || 0,
  };
}

function createCustomerPricingRoutes({ pool, requireAdminSoft }) {
  const router = express.Router();
  const guard = requireAdminSoft || ((req, res, next) => next());

  router.get("/admin/customer-pricing/rules", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const r = await pool.query(
        `SELECT rule_id, job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
                normal_price, active_price, label, campaign_name, campaign_copy, effective_from, effective_to,
                is_active, priority, created_at, updated_at, updated_by
           FROM public.customer_service_price_rules
          ORDER BY is_active DESC, priority DESC, job_type, ac_type, wash_variant, btu_min NULLS FIRST, rule_id DESC`
      );
      res.json({ success: true, rules: r.rows || [] });
    } catch (e) {
      console.error("GET /admin/customer-pricing/rules", e);
      res.status(500).json({ error: "โหลดราคาบริการไม่สำเร็จ" });
    }
  });

  router.post("/admin/customer-pricing/rules", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const b = cleanRuleBody(req.body || {});
      if (!b.job_type || !b.ac_type || !b.normal_price || !b.active_price) return res.status(400).json({ error: "กรอกประเภทงาน ประเภทแอร์ ราคาปกติ และราคาที่ใช้จริง" });
      const r = await pool.query(
        `INSERT INTO public.customer_service_price_rules
          (job_type, ac_type, wash_variant, btu_min, btu_max, machine_min, machine_max,
           normal_price, active_price, label, campaign_name, campaign_copy, effective_from, effective_to,
           is_active, priority, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
         RETURNING rule_id`,
        [b.job_type, b.ac_type, b.wash_variant, b.btu_min, b.btu_max, b.machine_min, b.machine_max, b.normal_price, b.active_price, b.label, b.campaign_name, b.campaign_copy, b.effective_from, b.effective_to, b.is_active, b.priority, req.actor?.username || req.headers["x-admin-username"] || "admin"]
      );
      res.json({ success: true, rule_id: r.rows?.[0]?.rule_id });
    } catch (e) {
      console.error("POST /admin/customer-pricing/rules", e);
      res.status(500).json({ error: "บันทึกราคาบริการไม่สำเร็จ" });
    }
  });

  router.put("/admin/customer-pricing/rules/:id", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "rule_id ไม่ถูกต้อง" });
      const b = cleanRuleBody(req.body || {});
      await pool.query(
        `UPDATE public.customer_service_price_rules
            SET job_type=$2, ac_type=$3, wash_variant=$4, btu_min=$5, btu_max=$6, machine_min=$7, machine_max=$8,
                normal_price=$9, active_price=$10, label=$11, campaign_name=$12, campaign_copy=$13,
                effective_from=$14, effective_to=$15, is_active=$16, priority=$17, updated_by=$18, updated_at=NOW()
          WHERE rule_id=$1`,
        [id, b.job_type, b.ac_type, b.wash_variant, b.btu_min, b.btu_max, b.machine_min, b.machine_max, b.normal_price, b.active_price, b.label, b.campaign_name, b.campaign_copy, b.effective_from, b.effective_to, b.is_active, b.priority, req.actor?.username || req.headers["x-admin-username"] || "admin"]
      );
      res.json({ success: true });
    } catch (e) {
      console.error("PUT /admin/customer-pricing/rules/:id", e);
      res.status(500).json({ error: "แก้ไขราคาบริการไม่สำเร็จ" });
    }
  });

  router.patch("/admin/customer-pricing/rules/:id/toggle", guard, async (req, res) => {
    try {
      await ensureCustomerPriceBookSchema(pool);
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "rule_id ไม่ถูกต้อง" });
      const active = boolish(req.body?.is_active, true);
      await pool.query(`UPDATE public.customer_service_price_rules SET is_active=$2, updated_at=NOW() WHERE rule_id=$1`, [id, active]);
      res.json({ success: true });
    } catch (e) {
      console.error("PATCH /admin/customer-pricing/rules/:id/toggle", e);
      res.status(500).json({ error: "เปลี่ยนสถานะราคาไม่สำเร็จ" });
    }
  });

  router.post("/admin/customer-pricing/seed-rainy-season-promo", guard, async (req, res) => {
    try {
      const result = await seedRainySeasonPromo(pool, req.actor?.username || req.headers["x-admin-username"] || "admin", { forceUpdate: true });
      res.json({ success: true, ...result });
    } catch (e) {
      console.error("POST /admin/customer-pricing/seed-rainy-season-promo", e);
      res.status(500).json({ error: "เพิ่มราคาโปรหน้าฝนไม่สำเร็จ" });
    }
  });

  return router;
}

module.exports = {
  ensureCustomerPriceBookSchema,
  resolveCustomerPricingMulti,
  buildCustomerServiceLineItemsFromPayload,
  seedRainySeasonPromo,
  createCustomerPricingRoutes,
};
