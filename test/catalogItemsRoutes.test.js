const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");

const createCatalogItemRoutes = require("../server/routes/catalog/items");
const { getBangkokNow } = require("../server/services/jobTiming");

function makePool(initialItems = [], initialRules = [], { schemaReady = true, marketplaceReady = false, autoplayReady = false, jobsCatalogLinkReady = false, jobs = [], jobUnits = [], forceBookingCountError = false, technicians = [], serviceMatrix = [], calendarRows = [] } = {}) {
  const state = {
    technicians: technicians.map((x) => ({ ...x })),
    serviceMatrix: serviceMatrix.map((x) => ({ ...x })),
    calendarRows: calendarRows.map((x) => ({ ...x })),
    items: initialItems.map((x) => ({
      image_url: null, image_public_id: null, price_rule_id: null,
      short_description: null, long_description: null, highlights: null, service_conditions: null,
      booking_mode: "contact_admin", booking_service_key: null, booking_ac_type: null, booking_btu: null,
      booking_wash_variant: null, is_featured: false,
      ...x,
    })),
    rules: initialRules.map((x) => ({ ...x })),
    images: [],
    jobs: jobs.map((x) => ({ ...x })),
    jobUnits: jobUnits.map((x) => ({ ...x })),
    queries: [],
    connectCount: 0,
    releaseCount: 0,
  };
  let nextItemId = 1 + state.items.reduce((max, x) => Math.max(max, Number(x.item_id) || 0), 0);
  let nextRuleId = 1 + state.rules.reduce((max, x) => Math.max(max, Number(x.rule_id) || 0), 0);
  let nextImageId = 1;

  function joinedRow(item) {
    const rule = item.price_rule_id ? state.rules.find((r) => String(r.rule_id) === String(item.price_rule_id)) : null;
    const row = {
      ...item,
      rule_normal_price: rule ? rule.normal_price : null,
      rule_active_price: rule ? rule.active_price : null,
      rule_campaign_name: rule ? rule.campaign_name : null,
      rule_is_active: rule ? rule.is_active : null,
      rule_effective_from: rule ? rule.effective_from : null,
      rule_effective_to: rule ? rule.effective_to : null,
      rule_wash_variant: rule ? rule.wash_variant : null,
      rule_label: rule ? rule.label : null,
      rule_priority: rule ? rule.priority : null,
    };
    // Mirrors a real SELECT: is_autoplay_enabled is only a real, readable column once its
    // own migration has run, regardless of what the in-memory fixture happens to hold.
    if (!autoplayReady) delete row.is_autoplay_enabled;
    return row;
  }

  function imagesForItem(itemId) {
    return state.images
      .filter((img) => String(img.item_id) === String(itemId))
      .sort((a, b) => (a.sort_order - b.sort_order) || (a.image_id - b.image_id));
  }

  async function query(sql, params = []) {
    state.queries.push({ sql, params });
    const s = String(sql);

    if (s.includes("information_schema.columns") && s.includes("catalog_items") && s.includes("is_autoplay_enabled")) {
      return { rows: [{ cnt: autoplayReady ? 1 : 0 }] };
    }
    if (s.includes("information_schema.columns") && s.includes("catalog_items") && s.includes("short_description")) {
      return { rows: [{ cnt: marketplaceReady ? 10 : 0 }] };
    }
    if (s.includes("to_regclass('public.catalog_item_images')")) {
      return { rows: [{ reg: marketplaceReady ? "public.catalog_item_images" : null }] };
    }
    if (s.includes("information_schema.columns") && s.includes("catalog_items")) {
      return { rows: [{ cnt: schemaReady ? 3 : 0 }] };
    }
    if (s.includes("information_schema.columns") && s.includes("table_name = 'jobs'")) {
      return { rows: [{ cnt: jobsCatalogLinkReady ? 2 : 0 }] };
    }

    // attachBookingCounts direct path: jobs.catalog_item_id set explicitly.
    if (s.includes("FROM public.jobs") && s.includes("GROUP BY catalog_item_id")) {
      const [ids, ...excludedStatuses] = params;
      const byItem = new Map();
      for (const job of state.jobs) {
        if (job.catalog_item_id == null) continue;
        if (!ids.map(Number).includes(Number(job.catalog_item_id))) continue;
        if (excludedStatuses.includes(job.job_status)) continue;
        if (job.canceled_at) continue;
        byItem.set(Number(job.catalog_item_id), (byItem.get(Number(job.catalog_item_id)) || 0) + 1);
      }
      return { rows: Array.from(byItem.entries()).map(([item_id, cnt]) => ({ item_id, cnt })) };
    }

    // bulkResolveHistoricalItemMatches: jobs with no catalog_item_id, matched via job_units.
    // Job-level consistency: a job only counts toward an item when EVERY one
    // of its active units unambiguously matches that same single item.
    if (s.includes("WITH active_units AS") && s.includes("JOIN public.jobs j")) {
      if (forceBookingCountError) throw new Error("simulated historical resolver failure");
      const [itemIds] = params;
      const excludedStatuses = ["ยกเลิก", "cancelled", "canceled", "ไม่พบช่างรับงาน"];
      const byItem = new Map();
      for (const job of state.jobs) {
        if (job.catalog_item_id != null) continue;
        if (excludedStatuses.includes(job.job_status)) continue;
        if (job.canceled_at) continue;
        const units = state.jobUnits.filter((u) => Number(u.job_id) === Number(job.job_id) &&
          !["cancelled", "removed", "deleted", "void", "inactive"].includes(String(u.status || "pending").toLowerCase()));
        if (!units.length) continue;
        const matchedItemIds = new Set();
        let allUnitsUnambiguous = true;
        for (const unit of units) {
          const btuText = String(unit.btu == null ? "" : unit.btu).trim().replace(/,/g, "");
          const btuValue = /^[0-9]+(\.[0-9]+)?$/.test(btuText) ? Number(btuText) : null;
          const matches = btuValue == null ? [] : state.items.filter((it) =>
            itemIds.map(Number).includes(Number(it.item_id)) &&
            it.job_category === job.job_type &&
            it.ac_type === unit.ac_type &&
            (it.btu_min == null || it.btu_min <= btuValue) &&
            (it.btu_max == null || it.btu_max >= btuValue)
          );
          if (matches.length !== 1) { allUnitsUnambiguous = false; break; }
          matchedItemIds.add(Number(matches[0].item_id));
        }
        if (!allUnitsUnambiguous || matchedItemIds.size !== 1) continue;
        const onlyItemId = matchedItemIds.values().next().value;
        const seen = byItem.get(onlyItemId) || new Set();
        seen.add(job.job_id);
        byItem.set(onlyItemId, seen);
      }
      return { rows: Array.from(byItem.entries()).map(([item_id, jobIds]) => ({ item_id, cnt: jobIds.size })) };
    }

    // listTechniciansForQueueCheck (attachTodayQueueAvailability's local proxy
    // for index.js's listTechniciansByType).
    if (s.includes("FROM public.users u") && s.includes("LEFT JOIN public.technician_profiles")) {
      const [techType, includePaused, isAll] = params;
      const rows = state.technicians.filter((t) => {
        if (!includePaused && (t.accept_status || "ready") === "paused") return false;
        if (isAll) return true;
        if (techType === "company") return ["company", "custom", "special_only"].includes(t.employment_type || "company");
        return (t.employment_type || "company") === techType;
      }).map((t) => ({
        username: t.username,
        employment_type: t.employment_type || "company",
        accept_status: t.accept_status || "ready",
        customer_slot_visible: t.customer_slot_visible === true,
      }));
      return { rows };
    }

    // customerAvailability.loadServiceMatrixMap
    if (s.includes("FROM public.technician_service_matrix")) {
      const [usernames] = params;
      const rows = state.serviceMatrix
        .filter((m) => usernames.map(String).includes(String(m.username)))
        .map((m) => ({ username: m.username, matrix_json: m.matrix_json }));
      return { rows };
    }

    // customerAvailability.loadAdvanceCalendarMap
    if (s.includes("FROM public.technician_monthly_work_calendar")) {
      const [usernames, date] = params;
      const rows = state.calendarRows.filter((c) =>
        usernames.map(String).includes(String(c.technician_username)) && String(c.work_date) === String(date)
      );
      return { rows };
    }

    // customerAvailability.loadDailyUsageMap -- tests never pre-seed competing
    // bookings for the queue-today check, so capacity is always open.
    if (s.includes("WITH assigned AS")) return { rows: [] };

    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(s)) return { rows: [] };
    if (s.includes("ALTER TABLE") || s.includes("CREATE INDEX") || s.includes("ADD CONSTRAINT") || s.includes("DO $$")) return { rows: [] };

    if (s.includes("INSERT INTO public.catalog_items") && s.includes("is_autoplay_enabled")) {
      const [
        item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
        short_description, long_description, highlights, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled,
      ] = params;
      const row = {
        item_id: nextItemId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max,
        is_active, is_customer_visible, image_url: null, image_public_id: null, price_rule_id: null,
        short_description, long_description, highlights: highlights ? JSON.parse(highlights) : null, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled,
      };
      state.items.push(row);
      return { rows: [{ item_id: row.item_id }] };
    }

    if (s.includes("INSERT INTO public.catalog_items") && s.includes("booking_mode")) {
      const [
        item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
        short_description, long_description, highlights, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured,
      ] = params;
      const row = {
        item_id: nextItemId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max,
        is_active, is_customer_visible, image_url: null, image_public_id: null, price_rule_id: null,
        short_description, long_description, highlights: highlights ? JSON.parse(highlights) : null, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured,
      };
      state.items.push(row);
      return { rows: [{ item_id: row.item_id }] };
    }

    if (s.includes("INSERT INTO public.catalog_items")) {
      const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible] = params;
      const row = {
        item_id: nextItemId++, item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max,
        is_active, is_customer_visible, image_url: null, image_public_id: null, price_rule_id: null,
        short_description: null, long_description: null, highlights: null, service_conditions: null,
        booking_mode: "contact_admin", booking_service_key: null, booking_ac_type: null, booking_btu: null,
        booking_wash_variant: null, is_featured: false,
      };
      state.items.push(row);
      return { rows: [{ item_id: row.item_id }] };
    }

    if (s.includes("INSERT INTO public.customer_service_price_rules")) {
      const [job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority] = params;
      const rule = { rule_id: nextRuleId++, job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority };
      state.rules.push(rule);
      return { rows: [{ rule_id: rule.rule_id }] };
    }

    if (s.includes("UPDATE public.customer_service_price_rules")) {
      const [rule_id, job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority] = params;
      const rule = state.rules.find((r) => String(r.rule_id) === String(rule_id));
      if (rule) Object.assign(rule, { job_type, ac_type, btu_min, btu_max, normal_price, active_price, campaign_name, effective_from, effective_to, is_active, updated_by, wash_variant, label, priority });
      return { rows: [] };
    }

    if (s.includes("SET price_rule_id=$1 WHERE item_id=$2")) {
      const [price_rule_id, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) row.price_rule_id = price_rule_id;
      return { rows: [] };
    }

    if (s.includes("SET price_rule_id=NULL WHERE item_id=$1")) {
      const [item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) row.price_rule_id = null;
      return { rows: [] };
    }

    if (s.includes("SET image_url=$1, image_public_id=$2 WHERE item_id=$3")) {
      const [image_url, image_public_id, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { image_url, image_public_id });
      return { rows: [] };
    }

    if (s.includes("SET image_url=NULL, image_public_id=NULL WHERE item_id=$1")) {
      const [item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { image_url: null, image_public_id: null });
      return { rows: [] };
    }

    if (s.includes("SET item_name=$1") && s.includes("is_autoplay_enabled=$21")) {
      const [
        item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
        short_description, long_description, highlights, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled,
        item_id,
      ] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) {
        Object.assign(row, {
          item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
          short_description, long_description, highlights: highlights ? JSON.parse(highlights) : null, service_conditions,
          booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured, is_autoplay_enabled,
        });
      }
      return { rows: [] };
    }

    if (s.includes("SET item_name=$1") && s.includes("short_description=$11")) {
      const [
        item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
        short_description, long_description, highlights, service_conditions,
        booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured,
        item_id,
      ] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) {
        Object.assign(row, {
          item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible,
          short_description, long_description, highlights: highlights ? JSON.parse(highlights) : null, service_conditions,
          booking_mode, booking_service_key, booking_ac_type, booking_btu, booking_wash_variant, is_featured,
        });
      }
      return { rows: [] };
    }

    if (s.includes("SET item_name=$1")) {
      const [item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible, item_id] = params;
      const row = state.items.find((x) => String(x.item_id) === String(item_id));
      if (row) Object.assign(row, { item_name, item_category, base_price, unit_label, job_category, ac_type, btu_min, btu_max, is_active, is_customer_visible });
      return { rows: [] };
    }

    if (s.includes("SELECT item_id, image_public_id FROM public.catalog_items")) {
      const row = state.items.find((x) => String(x.item_id) === String(params[0]));
      return { rows: row ? [{ item_id: row.item_id, image_public_id: row.image_public_id ?? null }] : [] };
    }

    if (s.includes("SELECT item_id FROM public.catalog_items WHERE item_id = $1")) {
      const row = state.items.find((x) => String(x.item_id) === String(params[0]));
      return { rows: row ? [{ item_id: row.item_id }] : [] };
    }

    if (s.includes("SELECT image_public_id FROM public.catalog_item_images WHERE item_id = $1 AND image_public_id IS NOT NULL")) {
      const rows = imagesForItem(params[0]).filter((img) => img.image_public_id != null).map((img) => ({ image_public_id: img.image_public_id }));
      return { rows };
    }

    if (s.includes("DELETE FROM public.catalog_items WHERE item_id = $1")) {
      const [itemId] = params;
      state.items = state.items.filter((x) => String(x.item_id) !== String(itemId));
      state.images = state.images.filter((img) => String(img.item_id) !== String(itemId));
      return { rows: [] };
    }

    if (s.includes("FROM public.catalog_item_images") && s.includes("ANY($1::bigint[])")) {
      const ids = (params[0] || []).map(String);
      const rows = state.images
        .filter((img) => ids.includes(String(img.item_id)))
        .sort((a, b) => (String(a.item_id).localeCompare(String(b.item_id))) || (a.sort_order - b.sort_order) || (a.image_id - b.image_id));
      return { rows };
    }

    if (s.includes("SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary FROM public.catalog_item_images WHERE item_id = $1 AND image_id")
      || (s.includes("FROM public.catalog_item_images WHERE image_id = $1 AND item_id = $2"))) {
      const [imageId, itemId] = params;
      const row = state.images.find((img) => String(img.image_id) === String(imageId) && String(img.item_id) === String(itemId));
      return { rows: row ? [row] : [] };
    }

    if (s.includes("SELECT image_id, item_id, image_url, image_public_id, alt_text, sort_order, is_primary") && s.includes("WHERE item_id = $1 ORDER BY sort_order")) {
      return { rows: imagesForItem(params[0]) };
    }

    if (s.includes("SELECT COUNT(*)::int AS cnt, COALESCE(MAX(sort_order), -1) AS max_sort")) {
      const rows = imagesForItem(params[0]);
      return { rows: [{ cnt: rows.length, max_sort: rows.length ? Math.max(...rows.map((r) => r.sort_order)) : -1 }] };
    }

    if (s.includes("INSERT INTO public.catalog_item_images")) {
      const [item_id, image_url, image_public_id, alt_text, sort_order, is_primary] = params;
      const row = { image_id: nextImageId++, item_id, image_url, image_public_id, alt_text, sort_order, is_primary };
      state.images.push(row);
      return { rows: [row] };
    }

    if (s.includes("DELETE FROM public.catalog_item_images WHERE image_id = $1")) {
      const [imageId] = params;
      state.images = state.images.filter((img) => String(img.image_id) !== String(imageId));
      return { rows: [] };
    }

    if (s.includes("UPDATE public.catalog_item_images SET is_primary = TRUE") && s.includes("WHERE image_id = (")) {
      const [itemId] = params;
      const rows = imagesForItem(itemId);
      if (rows.length) rows[0].is_primary = true;
      return { rows: rows.length ? [{ image_id: rows[0].image_id }] : [] };
    }

    if (s.includes("UPDATE public.catalog_item_images SET is_primary = FALSE WHERE item_id = $1")) {
      const [itemId] = params;
      state.images.filter((img) => String(img.item_id) === String(itemId)).forEach((img) => { img.is_primary = false; });
      return { rows: [] };
    }

    if (s.includes("UPDATE public.catalog_item_images SET is_primary = TRUE WHERE image_id = $1")) {
      const [imageId] = params;
      const row = state.images.find((img) => String(img.image_id) === String(imageId));
      if (row) row.is_primary = true;
      return { rows: [] };
    }

    if (s.includes("SELECT image_id FROM public.catalog_item_images WHERE item_id = $1")) {
      return { rows: imagesForItem(params[0]).map((img) => ({ image_id: img.image_id })) };
    }

    if (s.includes("UPDATE public.catalog_item_images SET sort_order = $1 WHERE image_id = $2 AND item_id = $3")) {
      const [sortOrder, imageId, itemId] = params;
      const row = state.images.find((img) => String(img.image_id) === String(imageId) && String(img.item_id) === String(itemId));
      if (row) row.sort_order = sortOrder;
      return { rows: [] };
    }

    if (s.includes("FROM public.catalog_items ci")) {
      if (s.includes("WHERE ci.item_id = $1") && s.includes("is_customer_visible = TRUE")) {
        const row = state.items.find((x) => String(x.item_id) === String(params[0]) && x.is_active === true && x.is_customer_visible === true);
        return { rows: row ? [joinedRow(row)] : [] };
      }
      if (s.includes("WHERE ci.item_id = $1")) {
        const row = state.items.find((x) => String(x.item_id) === String(params[0]));
        return { rows: row ? [joinedRow(row)] : [] };
      }
      if (!s.includes("WHERE")) {
        return { rows: state.items.map(joinedRow) };
      }
      let rows = state.items.filter((x) => x.is_active === true);
      if (s.includes("ci.is_customer_visible = TRUE")) rows = rows.filter((x) => x.is_customer_visible === true);
      return { rows: rows.map(joinedRow) };
    }

    return { rows: [] };
  }

  return {
    state,
    query,
    async connect() {
      state.connectCount += 1;
      return {
        query,
        release() {
          state.releaseCount += 1;
        },
      };
    },
  };
}

// Wraps a fake pool so it behaves like a pool with exactly one available connection:
// any pool.query() issued while a client is still checked out (between connect() and
// release()) throws instead of hanging forever, the way a real single-connection pool
// would. This is what catches the production hang: code that runs `pool.query(...)`
// for a post-COMMIT read instead of `client.query(...)` deadlocks against the same
// connection it is still holding — here that regresses to a thrown error (and
// therefore an HTTP 500) instead of an actual infinite hang, so the test fails fast.
function wrapAsSingleConnectionPool(pool) {
  let checkedOut = false;
  const poolQueryCallsWhileCheckedOut = [];
  const clientQueryCalls = [];
  let connectCalls = 0;
  let releaseCalls = 0;
  const originalQuery = pool.query;
  const originalConnect = pool.connect;

  pool.query = async (sql, params) => {
    if (checkedOut) {
      poolQueryCallsWhileCheckedOut.push(sql);
      throw new Error("SIMULATED_POOL_EXHAUSTED: pool.query() called while the only connection is checked out");
    }
    return originalQuery(sql, params);
  };

  pool.connect = async () => {
    if (checkedOut) throw new Error("SIMULATED_POOL_EXHAUSTED: no available connections");
    checkedOut = true;
    connectCalls += 1;
    const client = await originalConnect();
    return {
      query: async (sql, params) => {
        clientQueryCalls.push(sql);
        return client.query(sql, params);
      },
      release() {
        checkedOut = false;
        releaseCalls += 1;
        client.release();
      },
    };
  };

  return {
    poolQueryCallsWhileCheckedOut,
    clientQueryCalls,
    get connectCalls() { return connectCalls; },
    get releaseCalls() { return releaseCalls; },
  };
}

// Simulates Postgres row-level locking for `SELECT ... FOR UPDATE` against the
// fake in-memory pool: a second connection's FOR UPDATE on the same row must
// wait until the first connection releases (i.e. after its COMMIT/ROLLBACK),
// the way a real lock would. Without this, the fake pool's connect() calls are
// all independent and a race that the app's FOR UPDATE is meant to prevent
// would never actually race in a single-threaded test.
function wrapWithFakeRowLock(pool) {
  const locks = new Map();
  const originalConnect = pool.connect;
  pool.connect = async () => {
    const client = await originalConnect();
    let releaseLock = null;
    return {
      query: async (sql, params) => {
        const s = String(sql);
        if (s.includes("FOR UPDATE")) {
          const key = String(params[0]);
          while (locks.has(key)) await locks.get(key);
          let resolveFn;
          locks.set(key, new Promise((resolve) => { resolveFn = resolve; }));
          releaseLock = () => { locks.delete(key); resolveFn(); };
        }
        return client.query(sql, params);
      },
      release() {
        if (releaseLock) { releaseLock(); releaseLock = null; }
        client.release();
      },
    };
  };
  return pool;
}

function allowAdmin(req, res, next) { next(); }
function denyAdmin(req, res) { res.status(401).json({ error: "UNAUTHORIZED" }); }

async function withServer(router, fn) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function sampleItems() {
  return [
    { item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 12000, is_active: true, is_customer_visible: true },
    { item_id: 2, item_name: "ซ่อมแอร์ไม่เย็น", item_category: "ซ่อมแอร์", base_price: 0, unit_label: "งาน", job_category: "ซ่อม", ac_type: null, btu_min: null, btu_max: null, is_active: true, is_customer_visible: false },
    { item_id: 3, item_name: "ล้างแอร์สี่ทิศทาง (ปิดใช้งาน)", item_category: "ล้างแอร์", base_price: 900, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "สี่ทิศทาง", btu_min: 18000, btu_max: null, is_active: false, is_customer_visible: true },
  ];
}

const DONE_STATUS = "เสร็จแล้ว";
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01, 0x02, 0x03]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function multipartImageForm(buffer, { filename = "photo.jpg", mimetype = "image/jpeg", fieldName = "image" } = {}) {
  const fd = new FormData();
  fd.append(fieldName, new Blob([buffer], { type: mimetype }), filename);
  return fd;
}

test("createCatalogItemRoutes throws without a requireAdminSession dependency", () => {
  assert.throws(() => createCatalogItemRoutes({ pool: makePool() }), /requireAdminSession/);
});

test("public GET /catalog/items still filters is_active=true", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.every((x) => x.is_active === true));
    assert.equal(body.some((x) => x.item_id === 3), false);
  });
});

test("public GET /catalog/items?customer=1 still filters is_customer_visible=true", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.every((x) => x.is_customer_visible === true));
    assert.equal(body.some((x) => x.item_id === 2), false);
    assert.equal(body.some((x) => x.item_id === 3), false);
  });
});

test("public API does not expose hidden or inactive items", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const names = body.map((x) => x.item_name);
    assert.equal(names.includes("ซ่อมแอร์ไม่เย็น"), false);
    assert.equal(names.includes("ล้างแอร์สี่ทิศทาง (ปิดใช้งาน)"), false);
  });
});

// --- booking_count fail-open (production fix: a booking-count aggregation
// failure -- e.g. a legacy text-format BTU value the historical resolver
// can't normalize -- must never take down the Store listing). ---

test("public GET /catalog/items still returns 200 with the full item list when historical booking-count aggregation throws", async () => {
  const pool = makePool(sampleItems(), [], { jobsCatalogLinkReady: true, forceBookingCountError: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.length, 1); // sampleItems() filtered by the ?customer=1 contract (is_active && is_customer_visible)
    assert.ok(body.every((x) => x.item_id != null && x.item_name));
  });
});

test("booking_count falls back to 0 for every item when historical booking-count aggregation throws", async () => {
  const pool = makePool(sampleItems(), [], { jobsCatalogLinkReady: true, forceBookingCountError: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.every((x) => x.booking_count === 0));
  });
});

test("other catalog fields (price, rating, etc.) are not lost when booking-count aggregation fails open", async () => {
  const pool = makePool(sampleItems(), [], { jobsCatalogLinkReady: true, forceBookingCountError: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    const item1 = body.find((x) => x.item_id === 1);
    assert.ok(item1);
    assert.equal(item1.base_price, 700);
    assert.equal(item1.item_category, "ล้างแอร์");
  });
});

test("booking-count fail-open does not swallow a genuine failure in the main catalog query itself", async () => {
  const pool = makePool(sampleItems(), [], { jobsCatalogLinkReady: true });
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    if (String(sql).includes("FROM public.catalog_items") && String(sql).includes("WHERE") && !String(sql).includes("information_schema")) {
      throw new Error("simulated main catalog query failure");
    }
    return originalQuery(sql, params);
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    assert.equal(res.status, 500);
  });
});

test("admin GET is rejected when unauthorized", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`);
    assert.equal(res.status, 401);
    assert.equal(pool.state.queries.length, 0);
  });
});

test("admin GET, when authorized, returns both active and inactive items", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.length, 3);
    assert.ok(body.some((x) => x.is_active === false));
    assert.ok(body.some((x) => x.is_active === true));
  });
});

test("admin POST create validation rejects an empty name", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "   ", base_price: 100 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ชื่อ/);
  });
});

test("admin POST create validation rejects a negative price", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", base_price: -1 }),
    });
    assert.equal(res.status, 400);
  });
});

test("admin POST create rejects btu_min > btu_max", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ BTU", btu_min: 24000, btu_max: 9000 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /btu_min/);
  });
});

test("admin POST create succeeds with valid payload and defaults is_customer_visible to false", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ติดตั้งแอร์ใหม่", item_category: "ติดตั้ง", base_price: 1500, unit_label: "เครื่อง" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.item_name, "ติดตั้งแอร์ใหม่");
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, false);
  });
});

test("admin PATCH update validation rejects an unknown item_id", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/9999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ไม่มีจริง" }),
    });
    assert.equal(res.status, 404);
  });
});

test("admin PATCH update rejects btu_min > btu_max against the merged record", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ btu_min: 99999 }),
    });
    assert.equal(res.status, 400);
  });
});

test("admin PATCH update only changes fields explicitly sent by the client", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_customer_visible: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_customer_visible, false);
    assert.equal(body.item_name, "ล้างแอร์ผนัง");
    assert.equal(Number(body.base_price), 700);
    assert.equal(body.is_active, true);
  });
});

test("deactivate uses UPDATE (is_active=false), never DELETE", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).is_active, false);
    assert.equal(pool.state.items.length, 3);
    assert.equal(pool.state.queries.some((q) => /DELETE\s+FROM/i.test(q.sql)), false);
  });
});

test("SQL injection attempts cannot change query structure", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  const malicious = "Robert'); DROP TABLE public.catalog_items;--";
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: malicious, base_price: 10 }),
    });
    assert.equal(res.status, 201);
    const insertQuery = pool.state.queries.find((q) => /INSERT INTO public\.catalog_items/.test(q.sql));
    assert.ok(insertQuery);
    assert.equal(insertQuery.sql.includes(malicious), false);
    assert.ok(insertQuery.params.includes(malicious));
    assert.equal(pool.state.items.some((x) => x.item_id === 4 && x.item_name === malicious), true);
  });
});

test("index.js passes the real requireAdminSession middleware into createCatalogItemRoutes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /app\.use\(createCatalogItemRoutes\(\{\s*pool,\s*requireAdminSession\s*\}\)\)/);
});

test("admin POST rejects an invalid is_active value and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "มั่ว" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /is_active/);
    assert.equal(pool.state.queries.some((q) => /INSERT INTO public\.catalog_items/.test(q.sql)), false);
  });
});

test("admin POST rejects an invalid is_customer_visible value (out-of-range number) and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_customer_visible: 2 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /is_customer_visible/);
    assert.equal(pool.state.queries.some((q) => /INSERT INTO public\.catalog_items/.test(q.sql)), false);
  });
});

test("admin PATCH rejects an invalid boolean and never writes to the DB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: "มั่ว" }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("SET item_name=$1")), false);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).is_active, true);
  });
});

test("admin POST accepts real booleans for is_active/is_customer_visible", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: true, is_customer_visible: true }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin POST accepts the supported \"1\"/\"0\" string forms for booleans", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "0", is_customer_visible: "1" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin POST accepts the backward-compatible \"yes\"/\"no\"/\"on\"/\"off\" string forms for booleans", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", is_active: "off", is_customer_visible: "yes" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_active, false);
    assert.equal(body.is_customer_visible, true);
  });
});

test("admin PATCH that does not send boolean fields preserves their existing values", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ล้างแอร์ผนัง (แก้ชื่อ)" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_active, true);
    assert.equal(body.is_customer_visible, true);
  });
});

test("legacy POST /catalog/items in index.js requires requireAdminSession", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.match(source, /app\.post\("\/catalog\/items",\s*requireAdminSession,\s*async/);
});

test("no unauthenticated catalog write route declaration remains in index.js", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.doesNotMatch(source, /app\.post\("\/catalog\/items",\s*async/);
});

test("public GET /catalog/items in index.js is not wrapped in requireAdminSession", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.js"), "utf8");
  assert.doesNotMatch(source, /app\.use\(createCatalogItemRoutes\(\{\s*pool,\s*requireAdminSession\s*\}\)\),\s*requireAdminSession/);
});

// ---------- Phase 2A.2: pricing (customer_service_price_rules link) ----------

test("an item without a price rule falls back to base_price for display_price and reports no promo", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(item.sale_price, null);
    assert.equal(Number(item.display_price), 700);
    assert.equal(item.has_promo, false);
  });
});

test("an active, currently-effective rule drives normal_price/sale_price and display_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 50;
  const rules = [{ rule_id: 50, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(Number(item.normal_price), 700);
    assert.equal(Number(item.sale_price), 550);
    assert.equal(Number(item.display_price), 550);
    assert.equal(item.has_promo, true);
    assert.equal(item.campaign_name, "โปรหน้าฝน");
  });
});

test("an inactive rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 51;
  const rules = [{ rule_id: 51, normal_price: 700, active_price: 550, is_active: false, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
    assert.equal(item.has_promo, false);
  });
});

test("an expired rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 52;
  const rules = [{ rule_id: 52, normal_price: 700, active_price: 550, is_active: true, effective_from: "2000-01-01T00:00:00Z", effective_to: "2000-02-01T00:00:00Z" }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
  });
});

test("a future rule is not used; falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 53;
  const rules = [{ rule_id: 53, normal_price: 700, active_price: 550, is_active: true, effective_from: "2999-01-01T00:00:00Z", effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.normal_price, null);
    assert.equal(Number(item.display_price), 700);
  });
});

test("admin GET of an inactive rule returns full raw pricing_* fields, but public GET falls back to base_price", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 61;
  const rules = [{
    rule_id: 61, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: false,
    effective_from: "2020-01-01T00:00:00Z", effective_to: "2099-01-01T00:00:00Z",
    wash_variant: "ล้างน้ำ", label: "โปรโมชันหน้าฝน", priority: 2,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 700);
    assert.equal(Number(adminItem.pricing_active_price), 550);
    assert.equal(adminItem.pricing_campaign_name, "โปรหน้าฝน");
    assert.equal(adminItem.pricing_is_active, false);
    assert.equal(adminItem.pricing_wash_variant, "ล้างน้ำ");
    assert.equal(adminItem.pricing_label, "โปรโมชันหน้าฝน");
    assert.equal(adminItem.pricing_priority, 2);
    // Effective/public fields must NOT use the inactive rule's data.
    assert.equal(adminItem.normal_price, null);
    assert.equal(adminItem.has_active_promotion, false);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
    assert.equal(publicItem.has_active_promotion, false);
    assert.equal(publicItem.pricing_normal_price, undefined);
  });
});

test("admin GET of a future rule returns full raw prices/dates/campaign, but public GET does not yet use the rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 62;
  const rules = [{
    rule_id: 62, normal_price: 800, active_price: 600, campaign_name: "โปรซัมเมอร์", is_active: true,
    effective_from: "2999-01-01T00:00:00Z", effective_to: null,
    wash_variant: "ล้างน้ำยา", label: "ลดราคาล่วงหน้า", priority: 5,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 800);
    assert.equal(Number(adminItem.pricing_active_price), 600);
    assert.equal(adminItem.pricing_campaign_name, "โปรซัมเมอร์");
    assert.equal(adminItem.pricing_effective_from, "2999-01-01T00:00:00Z");
    assert.equal(adminItem.pricing_wash_variant, "ล้างน้ำยา");
    assert.equal(adminItem.pricing_label, "ลดราคาล่วงหน้า");
    assert.equal(adminItem.pricing_priority, 5);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
    assert.equal(publicItem.has_active_promotion, false);
    assert.equal(publicItem.campaign_name, null);
    assert.equal(publicItem.effective_from, null);
  });
});

test("admin GET of an expired rule returns full raw prices", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 63;
  const rules = [{
    rule_id: 63, normal_price: 900, active_price: 650, campaign_name: "โปรเก่า", is_active: true,
    effective_from: "2000-01-01T00:00:00Z", effective_to: "2000-02-01T00:00:00Z",
    wash_variant: "ล้างน้ำ", label: "หมดอายุแล้ว", priority: 1,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    const adminItem = adminBody.find((x) => x.item_id === 1);
    assert.equal(Number(adminItem.pricing_normal_price), 900);
    assert.equal(Number(adminItem.pricing_active_price), 650);
    assert.equal(adminItem.pricing_campaign_name, "โปรเก่า");
    assert.equal(adminItem.pricing_effective_to, "2000-02-01T00:00:00Z");
    assert.equal(adminItem.pricing_is_active, true);

    const publicRes = await fetch(`${base}/catalog/items?customer=1`);
    const publicBody = await publicRes.json();
    const publicItem = publicBody.find((x) => x.item_id === 1);
    assert.equal(publicItem.normal_price, null);
    assert.equal(Number(publicItem.display_price), 700);
  });
});

test("the public contract fields are unchanged by the admin raw-pricing DTO addition", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 64;
  const rules = [{
    rule_id: 64, normal_price: 700, active_price: 550, campaign_name: "โปรหน้าฝน", is_active: true,
    effective_from: null, effective_to: null, wash_variant: "ล้างน้ำ", label: "โปร", priority: 1,
  }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(Number(item.normal_price), 700);
    assert.equal(Number(item.active_price), 550);
    assert.equal(item.has_active_promotion, true);
    assert.equal(Number(item.sale_price), 550);
    assert.equal(item.has_promo, true);
    assert.equal(item.campaign_name, "โปรหน้าฝน");
    assert.equal(item.price_label, "โปร");
    assert.equal(item.wash_variant, "ล้างน้ำ");
    assert.equal(item.priority, 1);
    // No raw admin-only fields ever leak into the public response.
    assert.equal(item.pricing_normal_price, undefined);
    assert.equal(item.pricing_is_active, undefined);
  });
});

test("admin POST with a pricing object creates the catalog item and the linked price rule transactionally", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ล้างแอร์โปร", base_price: 700,
        pricing: { normal_price: 700, active_price: 500, campaign_name: "โปรทดสอบ", pricing_is_active: true },
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.price_rule_id);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(Number(body.sale_price), 500);
    assert.equal(pool.state.rules.length, 1);
    assert.equal(pool.state.rules[0].rule_id, body.price_rule_id);
  });
});

test("admin POST with invalid pricing rejects the whole request and writes nothing", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ล้างแอร์โปร", base_price: 700,
        pricing: { normal_price: -1, active_price: 500 },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.items.length, 3);
    assert.equal(pool.state.rules.length, 0);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("INSERT INTO public.catalog_items")), false);
  });
});

test("admin PATCH that omits pricing entirely preserves the existing linked price rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 60;
  const rules = [{ rule_id: 60, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ล้างแอร์ผนัง (อัปเดตชื่อ)" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 60);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin PATCH with a pricing object updates the existing linked price rule in place", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 61;
  const rules = [{ rule_id: 61, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricing: { normal_price: 800, active_price: 600, campaign_name: "ใหม่", pricing_is_active: true } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 61);
    assert.equal(Number(body.normal_price), 800);
    assert.equal(Number(body.sale_price), 600);
    assert.equal(pool.state.rules.length, 1);
    assert.equal(pool.state.rules[0].campaign_name, "ใหม่");
  });
});

test("admin PATCH with invalid pricing rejects the whole request and changes nothing", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 62;
  const rules = [{ rule_id: 62, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "พังตรงนี้", pricing: { normal_price: "ไม่ใช่ตัวเลข", active_price: 600 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).item_name, "ล้างแอร์ผนัง");
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin requests are rejected when unauthorized for pricing-bearing writes too", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "x", pricing: { normal_price: 1, active_price: 1 } }),
    });
    assert.equal(res.status, 401);
    assert.equal(pool.state.items.length, 3);
  });
});

// ---------- Phase 2A.2: image upload/delete (Cloudinary via DI) ----------

test("image upload is rejected when unauthorized", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 401);
  });
});

test("image upload rejects an invalid item id", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/abc/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload rejects a missing file", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const fd = new FormData();
    fd.append("note", "no image field here");
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: fd });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /ไฟล์/);
  });
});

test("image upload rejects a file larger than 5MB", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const big = Buffer.concat([JPEG_BYTES, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(big),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /5MB/);
  });
});

test("image upload rejects an unsupported MIME type", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(Buffer.from("GIF89a"), { mimetype: "image/gif", filename: "x.gif" }),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload rejects a file whose bytes do not match its declared MIME type", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(Buffer.from("not really a jpeg"), { mimetype: "image/jpeg" }),
    });
    assert.equal(res.status, 400);
  });
});

test("image upload succeeds via the injected uploader and stores url/public_id without calling real Cloudinary", async () => {
  const pool = makePool(sampleItems());
  let calledWith = null;
  const uploadCatalogImage = async (args) => {
    calledWith = args;
    return { url: "https://res.cloudinary.com/demo/image/upload/v1/cwf/catalog-items/item-1.jpg", public_id: "cwf/catalog-items/item-1" };
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, "https://res.cloudinary.com/demo/image/upload/v1/cwf/catalog-items/item-1.jpg");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, "cwf/catalog-items/item-1");
    assert.ok(calledWith.buffer);
    assert.equal(calledWith.itemId, "1");
  });
});

test("a Cloudinary upload failure does not touch the database", async () => {
  const pool = makePool(sampleItems());
  const uploadCatalogImage = async () => { throw new Error("cloudinary down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, {
      method: "POST",
      body: multipartImageForm(JPEG_BYTES),
    });
    assert.equal(res.status, 500);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.queries.some((q) => q.sql.includes("SET image_url=$1")), false);
  });
});

test("replacing an image updates url/public_id and best-effort deletes the previous Cloudinary asset", async () => {
  const pool = makePool(sampleItems());
  const deletedIds = [];
  let uploadCount = 0;
  const uploadCatalogImage = async () => {
    uploadCount += 1;
    return { url: `https://res.cloudinary.com/demo/v${uploadCount}.jpg`, public_id: `cwf/catalog-items/item-1-v${uploadCount}` };
  };
  const deleteCatalogImage = async (publicId) => { deletedIds.push(publicId); return { ok: true }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage, deleteCatalogImage });
  await withServer(router, async (base) => {
    const first = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(PNG_BYTES, { mimetype: "image/png", filename: "x.png" }) });
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(secondBody.image_url, "https://res.cloudinary.com/demo/v2.jpg");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, "cwf/catalog-items/item-1-v2");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(deletedIds, ["cwf/catalog-items/item-1-v1"]);
  });
});

test("deleting an image clears image_url/image_public_id in the database", async () => {
  const items = sampleItems();
  items[0].image_url = "https://res.cloudinary.com/demo/old.jpg";
  items[0].image_public_id = "cwf/catalog-items/item-1-old";
  const pool = makePool(items);
  let deletedId = null;
  const deleteCatalogImage = async (publicId) => { deletedId = publicId; return { ok: true }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, null);
    assert.equal(deletedId, "cwf/catalog-items/item-1-old");
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, null);
  });
});

test("a Cloudinary delete failure still clears the database (DB-first, Cloudinary best-effort)", async () => {
  const items = sampleItems();
  items[0].image_url = "https://res.cloudinary.com/demo/old.jpg";
  items[0].image_public_id = "cwf/catalog-items/item-1-old";
  const pool = makePool(items);
  const deleteCatalogImage = async () => { throw new Error("cloudinary delete down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_url, null);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).image_public_id, null);
  });
});

// ---------- Phase 2A.2 production-blocker regression tests ----------

test("no route ever issues DDL during a request", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    await fetch(`${base}/catalog/items`);
    await fetch(`${base}/admin/catalog/items`);
    await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ DDL", base_price: 10 }),
    });
    const ddl = pool.state.queries.some((q) => /ALTER TABLE|CREATE INDEX|ADD CONSTRAINT/i.test(q.sql));
    assert.equal(ddl, false);
  });
});

test("when the media/pricing schema is not ready, GET falls back to the legacy select with no DDL", async () => {
  const pool = makePool(sampleItems(), [], { schemaReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.length > 0);
    const ddl = pool.state.queries.some((q) => /ALTER TABLE|CREATE INDEX|ADD CONSTRAINT/i.test(q.sql));
    assert.equal(ddl, false);
  });
});

test("admin PATCH with pricing explicitly set to null preserves the existing linked price rule", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 70;
  const rules = [{ rule_id: 70, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricing: null }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.price_rule_id, 70);
    assert.equal(Number(body.normal_price), 700);
    assert.equal(pool.state.items.find((x) => x.item_id === 1).price_rule_id, 70);
    assert.equal(pool.state.rules[0].campaign_name, "เดิม");
  });
});

test("admin POST rejects pricing.active_price greater than pricing.normal_price", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", pricing: { normal_price: 500, active_price: 600 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an empty-string normal_price instead of coercing it to 0", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", pricing: { normal_price: "", active_price: 500 } }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an effective_from after effective_to", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบ",
        pricing: { normal_price: 500, active_price: 400, effective_from: "2026-12-31", effective_to: "2026-01-01" },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("admin POST rejects an invalid effective_from date string", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบ",
        pricing: { normal_price: 500, active_price: 400, effective_from: "not-a-date" },
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.rules.length, 0);
  });
});

test("a validation failure never calls pool.connect()", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "" }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.connectCount, 0);
  });
});

test("a successful admin POST connects exactly once and releases exactly once", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ connect" }),
    });
    assert.equal(res.status, 201);
    assert.equal(pool.state.connectCount, 1);
    assert.equal(pool.state.releaseCount, 1);
  });
});

test("a successful admin PATCH connects exactly once and releases exactly once", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ patch connect" }),
    });
    assert.equal(res.status, 200);
    assert.equal(pool.state.connectCount, 1);
    assert.equal(pool.state.releaseCount, 1);
  });
});

test("an admin PATCH on an unknown item never calls pool.connect()", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/9999`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ไม่มีจริง" }),
    });
    assert.equal(res.status, 404);
    assert.equal(pool.state.connectCount, 0);
  });
});

test("admin POST responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ single-connection pool" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    // The post-COMMIT final SELECT must go through the held client, not the pool.
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("WHERE ci.item_id = $1")));
  });
});

test("admin PATCH responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ patch single-connection pool" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("WHERE ci.item_id = $1")));
  });
});

test("admin POST in marketplaceReady mode responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ single-connection pool marketplace" }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    // attachCatalogImages() must read through the still-open client, not pool.query().
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("FROM public.catalog_item_images") && String(sql).includes("ANY($1::bigint[])")));
  });
});

test("admin PATCH in marketplaceReady mode responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ patch single-connection pool marketplace" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
    assert.ok(tracker.clientQueryCalls.some((sql) => String(sql).includes("FROM public.catalog_item_images") && String(sql).includes("ANY($1::bigint[])")));
  });
});

test("admin POST with a pricing rule still responds successfully against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ทดสอบราคา",
        pricing: { normal_price: 700, active_price: 550, pricing_is_active: true },
      }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.releaseCalls, 1);
  });
});

test("a failed admin PATCH against a single-connection pool still rolls back and releases without hanging", async () => {
  const items = sampleItems();
  const pool = makePool(items);
  const originalConnect = pool.connect;
  pool.connect = async () => {
    const client = await originalConnect();
    return {
      query: async (sql, params) => {
        if (String(sql).includes("UPDATE public.catalog_items") && String(sql).includes("SET item_name=$1")) {
          throw new Error("simulated write failure");
        }
        return client.query(sql, params);
      },
      release: client.release ? client.release.bind(client) : () => {},
    };
  };
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ rollback" }),
    });
    assert.equal(res.status, 500);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
  });
});

test("image upload SQL is parameterized: a hostile filename/public_id never appears as raw SQL text", async () => {
  const pool = makePool(sampleItems());
  const hostilePublicId = "x'); DROP TABLE public.catalog_items;--";
  const uploadCatalogImage = async () => ({ url: "https://res.cloudinary.com/demo/x.jpg", public_id: hostilePublicId });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/image`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(res.status, 200);
    const updateQuery = pool.state.queries.find((q) => q.sql.includes("SET image_url=$1, image_public_id=$2"));
    assert.ok(updateQuery);
    assert.equal(updateQuery.sql.includes(hostilePublicId), false);
    assert.ok(updateQuery.params.includes(hostilePublicId));
  });
});

// ---------- DELETE /admin/catalog/items/:itemId ----------

test("DELETE admin catalog item removes the row and never touches customer_service_price_rules", async () => {
  const items = sampleItems();
  items[0].price_rule_id = 70;
  const rules = [{ rule_id: 70, normal_price: 700, active_price: 550, campaign_name: "เดิม", is_active: true, effective_from: null, effective_to: null }];
  const pool = makePool(items, rules);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(pool.state.items.some((x) => x.item_id === 1), false);
    assert.equal(pool.state.rules.length, 1);
    assert.equal(pool.state.rules[0].rule_id, 70);
    const deleteQuery = pool.state.queries.some((q) => /DELETE FROM public\.customer_service_price_rules/i.test(q.sql));
    assert.equal(deleteQuery, false);
  });
});

test("DELETE admin catalog item also removes its gallery images (cascade)", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.equal(pool.state.images.length, 0);
  });
});

test("DELETE admin catalog item cleans up legacy and gallery Cloudinary assets", async () => {
  const items = sampleItems();
  items[0].image_public_id = "legacy-pub-id";
  const pool = makePool(items, [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "gallery-pub-1", alt_text: null, sort_order: 0, is_primary: true }
  );
  const cleanedUp = [];
  const deleteCatalogImage = async (publicId) => { cleanedUp.push(publicId); return { ok: true }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.deepEqual(cleanedUp.sort(), ["gallery-pub-1", "legacy-pub-id"]);
  });
});

test("DELETE admin catalog item still reports success with a warning when Cloudinary cleanup fails", async () => {
  const items = sampleItems();
  items[0].image_public_id = "legacy-pub-id";
  const pool = makePool(items);
  const deleteCatalogImage = async () => { throw new Error("cloudinary down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.warning, /Cloudinary/);
    assert.equal(pool.state.items.some((x) => x.item_id === 1), false);
  });
});

test("DELETE admin catalog item returns 404 for an unknown item and changes nothing", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/999`, { method: "DELETE" });
    assert.equal(res.status, 404);
    assert.equal(pool.state.items.length, sampleItems().length);
  });
});

test("DELETE admin catalog item returns 400 for a malformed item id", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/abc`, { method: "DELETE" });
    assert.equal(res.status, 400);
  });
});

test("DELETE admin catalog item requires an admin session", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 401);
    assert.equal(pool.state.items.length, sampleItems().length);
  });
});

test("a repeated DELETE of an already-deleted item returns 404 instead of double-deleting", async () => {
  const pool = makePool(sampleItems());
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const first = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(first.status, 200);
    const second = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(second.status, 404);
  });
});

test("DELETE admin catalog item responds successfully (no hang/deadlock) against a single-connection pool", async () => {
  const pool = makePool(sampleItems());
  const tracker = wrapAsSingleConnectionPool(pool);
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.deepEqual(tracker.poolQueryCallsWhileCheckedOut, []);
    assert.equal(tracker.connectCalls, 1);
    assert.equal(tracker.releaseCalls, 1);
  });
});

// ---------- Marketplace v2 (migrations/20260623_catalog_store_marketplace_v2.sql) ----------

const { validateMarketplaceFields } = createCatalogItemRoutes;

test("validateMarketplaceFields rejects an unknown booking_mode", () => {
  const result = validateMarketplaceFields({ booking_mode: "ship_it" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_mode/.test(e)));
});

test("validateMarketplaceFields rejects bookable without booking_ac_type or booking_btu", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_ac_type/.test(e)));
  assert.ok(result.errors.some((e) => /booking_btu/.test(e)));
});

// booking_service_key is categorization metadata only — the customer app does
// not consume it for prefill, so it must never be treated as sufficient on
// its own for a bookable item.
test("validateMarketplaceFields rejects bookable with only booking_service_key set", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_service_key: "wash_wall" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_ac_type/.test(e)));
});

test("validateMarketplaceFields rejects bookable with only booking_ac_type set (missing booking_btu)", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ผนัง" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_btu/.test(e)));
});

test("validateMarketplaceFields rejects an unsupported booking_ac_type", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ไม่รู้จัก", booking_btu: 12000, booking_wash_variant: "ล้างธรรมดา" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_ac_type/.test(e)));
});

test("validateMarketplaceFields rejects an unsupported booking_btu", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 15000, booking_wash_variant: "ล้างธรรมดา" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_btu/.test(e)));
});

test("validateMarketplaceFields rejects a wall ac_type bookable item without a supported booking_wash_variant", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 12000 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_wash_variant/.test(e)));
});

test("validateMarketplaceFields rejects a wall ac_type bookable item with an unsupported booking_wash_variant", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 12000, booking_wash_variant: "ล้างไม่รู้จัก" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /booking_wash_variant/.test(e)));
});

test("validateMarketplaceFields accepts a fully-specified bookable wall ac_type item", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 12000, booking_wash_variant: "ล้างธรรมดา" });
  assert.equal(result.ok, true);
  assert.equal(result.value.booking_ac_type, "ผนัง");
  assert.equal(result.value.booking_btu, 12000);
  assert.equal(result.value.booking_wash_variant, "ล้างธรรมดา");
});

test("validateMarketplaceFields accepts a fully-specified bookable non-wall ac_type item without a wash_variant", () => {
  const result = validateMarketplaceFields({ booking_mode: "bookable", booking_ac_type: "สี่ทิศทาง", booking_btu: 24000 });
  assert.equal(result.ok, true);
  assert.equal(result.value.booking_ac_type, "สี่ทิศทาง");
  assert.equal(result.value.booking_btu, 24000);
});

test("validateMarketplaceFields defaults booking_mode to contact_admin and is_featured to false", () => {
  const result = validateMarketplaceFields({});
  assert.equal(result.ok, true);
  assert.equal(result.value.booking_mode, "contact_admin");
  assert.equal(result.value.is_featured, false);
});

test("validateMarketplaceFields rejects highlights that are not an array", () => {
  const result = validateMarketplaceFields({ highlights: "not an array or json array" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /highlights/.test(e)));
});

test("validateMarketplaceFields parses a JSON-string highlights array and trims/drops empties", () => {
  const result = validateMarketplaceFields({ highlights: JSON.stringify(["ฟรีน้ำยา", "  ", "รับประกัน 30 วัน"]) });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.highlights, ["ฟรีน้ำยา", "รับประกัน 30 วัน"]);
});

test("validateMarketplaceFields rejects a short_description longer than 300 characters", () => {
  const result = validateMarketplaceFields({ short_description: "ก".repeat(301) });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /คำอธิบายสั้น/.test(e)));
});

test("admin POST returns 503 when marketplace fields are sent but the migration has not run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", short_description: "สั้นๆ" }),
    });
    assert.equal(res.status, 503);
    assert.equal(pool.state.items.length, 3);
  });
});

test("admin PATCH returns 503 when marketplace fields are sent but the migration has not run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_featured: true }),
    });
    assert.equal(res.status, 503);
  });
});

test("admin POST without marketplace fields still succeeds when the migration has not run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ ไม่มี marketplace" }),
    });
    assert.equal(res.status, 201);
  });
});

test("admin POST creates a bookable item with marketplace fields once the migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_name: "ล้างแอร์ฝัง", item_category: "ล้างแอร์", base_price: 800,
        short_description: "ล้างแอร์เปลือยใต้ฝ้าเพดาน", highlights: ["ฟรีน้ำยา"],
        booking_mode: "bookable", booking_ac_type: "เปลือยใต้ฝ้า", booking_btu: 18000, is_featured: true,
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.booking_mode, "bookable");
    assert.equal(body.short_description, "ล้างแอร์เปลือยใต้ฝ้าเพดาน");
    assert.deepEqual(body.highlights, ["ฟรีน้ำยา"]);
    assert.equal(body.is_featured, true);
    assert.equal(body.booking_ac_type, "เปลือยใต้ฝ้า");
    assert.equal(body.booking_btu, 18000);
  });
});

test("admin PATCH updates marketplace fields once the migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        booking_mode: "bookable", booking_service_key: "wash_wall",
        booking_ac_type: "ผนัง", booking_btu: 12000, booking_wash_variant: "ล้างธรรมดา",
        is_featured: true,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.booking_mode, "bookable");
    assert.equal(body.booking_service_key, "wash_wall");
    assert.equal(body.is_featured, true);
  });
});

test("admin POST rejects a bookable item without booking_ac_type or booking_btu", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", booking_mode: "bookable" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /booking_ac_type/);
    assert.equal(pool.state.items.length, 3);
  });
});

test("admin POST rejects a bookable item with only booking_service_key set", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ", booking_mode: "bookable", booking_service_key: "wash_wall" }),
    });
    assert.equal(res.status, 400);
    assert.equal(pool.state.items.length, 3);
  });
});

// ---------- Auto-slide (is_autoplay_enabled) ----------

test("validateMarketplaceFields defaults is_autoplay_enabled to true", () => {
  const result = validateMarketplaceFields({});
  assert.equal(result.ok, true);
  assert.equal(result.value.is_autoplay_enabled, true);
});

test("validateMarketplaceFields rejects a non-boolean is_autoplay_enabled", () => {
  const result = validateMarketplaceFields({ is_autoplay_enabled: "not-a-boolean" });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /is_autoplay_enabled/.test(e)));
});

test("public/detail/admin DTOs fail-safe is_autoplay_enabled to false before the autoplay migration has run", async () => {
  const items = sampleItems();
  items[0].is_autoplay_enabled = true; // even if the column somehow had a value pre-migration
  const pool = makePool(items, [], { marketplaceReady: true, autoplayReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const listRes = await fetch(`${base}/catalog/items?customer=1`);
    const listBody = await listRes.json();
    assert.equal(listBody.find((x) => x.item_id === 1).is_autoplay_enabled, false);

    const adminRes = await fetch(`${base}/admin/catalog/items`);
    const adminBody = await adminRes.json();
    assert.equal(adminBody.find((x) => x.item_id === 1).is_autoplay_enabled, false);
  });
});

test("admin POST creates an item with is_autoplay_enabled once the autoplay migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true, autoplayReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ autoplay", is_autoplay_enabled: false }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_autoplay_enabled, false);
  });
});

test("admin POST defaults is_autoplay_enabled to true when omitted, once the autoplay migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true, autoplayReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ autoplay default" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_autoplay_enabled, true);
  });
});

test("admin PATCH round-trips is_autoplay_enabled and leaves it unchanged when not sent", async () => {
  const items = sampleItems();
  items[0].is_autoplay_enabled = false;
  const pool = makePool(items, [], { marketplaceReady: true, autoplayReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: "ทดสอบ ไม่เปลี่ยน autoplay" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_autoplay_enabled, false);

    const res2 = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_autoplay_enabled: true }),
    });
    const body2 = await res2.json();
    assert.equal(body2.is_autoplay_enabled, true);
  });
});

test("opening an item for edit and saving without changes round-trips is_autoplay_enabled unchanged", async () => {
  const items = sampleItems();
  items[0].is_autoplay_enabled = false;
  items[0].is_featured = true;
  const pool = makePool(items, [], { marketplaceReady: true, autoplayReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.is_autoplay_enabled, false);
    assert.equal(body.is_featured, true);
  });
});

test("public GET /catalog/items includes marketplace fields and the images gallery once ready", async () => {
  const items = sampleItems();
  items[0].booking_mode = "bookable";
  items[0].booking_ac_type = "ผนัง";
  items[0].short_description = "ล้างแอร์ผนังครบชุด";
  items[0].highlights = ["ฟรีน้ำยา", "รับประกัน 30 วัน"];
  items[0].is_featured = true;
  const pool = makePool(items, [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "https://res.cloudinary.com/demo/a1.jpg", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "https://res.cloudinary.com/demo/a2.jpg", image_public_id: "p2", alt_text: "มุมที่สอง", sort_order: 1, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.booking_mode, "bookable");
    assert.equal(item.short_description, "ล้างแอร์ผนังครบชุด");
    assert.deepEqual(item.highlights, ["ฟรีน้ำยา", "รับประกัน 30 วัน"]);
    assert.equal(item.is_featured, true);
    assert.equal(item.images.length, 2);
    assert.equal(item.images[0].is_primary, true);
    assert.equal(item.images[1].alt_text, "มุมที่สอง");
  });
});

test("public GET /catalog/items exposes booking_ac_type/booking_btu/booking_wash_variant for a bookable item, so the Store card can book without a detail fetch", async () => {
  const items = sampleItems();
  items[0].booking_mode = "bookable";
  items[0].booking_ac_type = "ผนัง";
  items[0].booking_btu = 12000;
  items[0].booking_wash_variant = "ล้างธรรมดา";
  items[0].booking_service_key = "wash_wall";
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.booking_mode, "bookable");
    assert.equal(item.booking_ac_type, "ผนัง");
    assert.equal(item.booking_btu, 12000);
    assert.equal(item.booking_wash_variant, "ล้างธรรมดา");
    assert.equal(item.booking_service_key, undefined, "List DTO must not expose booking_service_key");
  });
});

test("public GET /catalog/items suppresses booking_ac_type/booking_btu/booking_wash_variant when booking_mode is contact_admin", async () => {
  const items = sampleItems();
  items[0].booking_ac_type = "ผนัง";
  items[0].booking_btu = 12000;
  items[0].booking_wash_variant = "ล้างธรรมดา";
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.booking_mode, "contact_admin");
    assert.equal(item.booking_ac_type, null);
    assert.equal(item.booking_btu, null);
    assert.equal(item.booking_wash_variant, null);
  });
});

test("public GET /catalog/items/:itemId puts the Primary image first even when it is not sort_order 0", async () => {
  const items = sampleItems();
  const pool = makePool(items, [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "https://res.cloudinary.com/demo/non-primary.jpg", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: false },
    { image_id: 2, item_id: 1, image_url: "https://res.cloudinary.com/demo/primary.jpg", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: true }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1`);
    const body = await res.json();
    assert.equal(body.images[0].image_id, 2);
    assert.equal(body.images[0].is_primary, true);
    assert.equal(body.images[0].image_url, "https://res.cloudinary.com/demo/primary.jpg");
    assert.equal(body.images[1].image_id, 1);
  });
});

test("public GET /catalog/items falls back to a synthetic single image when the gallery is empty", async () => {
  const items = sampleItems();
  items[0].image_url = "https://res.cloudinary.com/demo/legacy.jpg";
  items[0].image_public_id = "legacy-id";
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.images.length, 1);
    assert.equal(item.images[0].image_url, "https://res.cloudinary.com/demo/legacy.jpg");
    assert.equal(item.images[0].is_primary, true);
  });
});

test("public GET /catalog/items still works (legacy fields only) before the marketplace migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.booking_mode, "contact_admin");
    assert.deepEqual(item.highlights, []);
  });
});

test("public GET /catalog/items/:itemId returns the full detail DTO for a bookable item", async () => {
  const items = sampleItems();
  items[0].booking_mode = "bookable";
  items[0].booking_ac_type = "ผนัง";
  items[0].booking_btu = 12000;
  items[0].long_description = "รายละเอียดเต็มของบริการล้างแอร์ผนัง";
  items[0].service_conditions = "ราคานี้สำหรับแอร์ผนังเท่านั้น";
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.item_id, 1);
    assert.equal(body.long_description, "รายละเอียดเต็มของบริการล้างแอร์ผนัง");
    assert.equal(body.service_conditions, "ราคานี้สำหรับแอร์ผนังเท่านั้น");
    assert.equal(body.booking_ac_type, "ผนัง");
    assert.equal(body.booking_btu, 12000);
  });
});

test("public GET /catalog/items/:itemId suppresses booking_* fields when booking_mode is contact_admin", async () => {
  const items = sampleItems();
  items[0].booking_ac_type = "ผนัง";
  items[0].booking_btu = 12000;
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1`);
    const body = await res.json();
    assert.equal(body.booking_mode, "contact_admin");
    assert.equal(body.booking_ac_type, null);
    assert.equal(body.booking_btu, null);
  });
});

test("public GET /catalog/items/:itemId returns 404 for an inactive item", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/3`);
    assert.equal(res.status, 404);
  });
});

test("public GET /catalog/items/:itemId returns 404 for an item hidden from customers", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/2`);
    assert.equal(res.status, 404);
  });
});

test("public GET /catalog/items/:itemId rejects a non-numeric item id", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/abc`);
    assert.equal(res.status, 400);
  });
});

test("admin GET returns the raw marketplace DTO including long_description/service_conditions", async () => {
  const items = sampleItems();
  items[0].long_description = "รายละเอียดยาว";
  items[0].service_conditions = "เงื่อนไข";
  items[0].booking_mode = "bookable";
  items[0].booking_service_key = "wash_wall";
  const pool = makePool(items, [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items`);
    const body = await res.json();
    const item = body.find((x) => x.item_id === 1);
    assert.equal(item.long_description, "รายละเอียดยาว");
    assert.equal(item.service_conditions, "เงื่อนไข");
    assert.equal(item.booking_service_key, "wash_wall");
  });
});

// ---------- Marketplace v2: multi-image gallery routes ----------

test("gallery image routes return 503 before the marketplace migration has run", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: false });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const listRes = await fetch(`${base}/admin/catalog/items/1/images`);
    assert.equal(listRes.status, 503);
    const uploadRes = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(uploadRes.status, 503);
  });
});

test("uploading the first gallery image marks it primary with sort_order 0", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const uploadCatalogImage = async () => ({ url: "https://res.cloudinary.com/demo/g1.jpg", public_id: "g1" });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_primary, true);
    assert.equal(body.sort_order, 0);
  });
});

test("uploading a second gallery image is not primary and gets the next sort_order", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  let n = 0;
  const uploadCatalogImage = async () => { n += 1; return { url: `https://res.cloudinary.com/demo/g${n}.jpg`, public_id: `g${n}` }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    const res = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(PNG_BYTES, { mimetype: "image/png", filename: "x.png" }) });
    const body = await res.json();
    assert.equal(body.is_primary, false);
    assert.equal(body.sort_order, 1);
  });
});

test("uploading a 5th gallery image is rejected and never persisted", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false },
    { image_id: 3, item_id: 1, image_url: "u3", image_public_id: "p3", alt_text: null, sort_order: 2, is_primary: false },
    { image_id: 4, item_id: 1, image_url: "u4", image_public_id: "p4", alt_text: null, sort_order: 3, is_primary: false }
  );
  let uploadCalled = false;
  const uploadCatalogImage = async () => { uploadCalled = true; return { url: "https://res.cloudinary.com/demo/g5.jpg", public_id: "g5" }; };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.match(body.error, /4 รูป/);
    assert.equal(uploadCalled, false);
    assert.equal(pool.state.images.length, 4);
  });
});

test("concurrent gallery uploads at the cap never exceed 4 images for an item", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  wrapWithFakeRowLock(pool);
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false },
    { image_id: 3, item_id: 1, image_url: "u3", image_public_id: "p3", alt_text: null, sort_order: 2, is_primary: false }
  );
  let n = 0;
  const uploadCatalogImage = async () => {
    n += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { url: `https://res.cloudinary.com/demo/cap${n}.jpg`, public_id: `cap${n}` };
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const [res1, res2] = await Promise.all([
      fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) }),
      fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(PNG_BYTES, { mimetype: "image/png", filename: "x.png" }) }),
    ]);
    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const itemImages = pool.state.images.filter((img) => String(img.item_id) === "1");
    assert.equal(itemImages.length, 4);
  });
});

test("concurrent first-image uploads for the same item never produce two Primary images", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  wrapWithFakeRowLock(pool);
  let n = 0;
  const uploadCatalogImage = async () => {
    n += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { url: `https://res.cloudinary.com/demo/c${n}.jpg`, public_id: `c${n}` };
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const [res1, res2] = await Promise.all([
      fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) }),
      fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(PNG_BYTES, { mimetype: "image/png", filename: "x.png" }) }),
    ]);
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    const itemImages = pool.state.images.filter((img) => String(img.item_id) === "1");
    assert.equal(itemImages.length, 2);
    assert.equal(itemImages.filter((img) => img.is_primary).length, 1);
  });
});

test("uploading a gallery image accepts and stores alt_text", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const uploadCatalogImage = async () => ({ url: "https://res.cloudinary.com/demo/g1.jpg", public_id: "g1" });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage });
  await withServer(router, async (base) => {
    const fd = new FormData();
    fd.append("image", new Blob([JPEG_BYTES], { type: "image/jpeg" }), "photo.jpg");
    fd.append("alt_text", "มุมหน้าตรง");
    const res = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: fd });
    const body = await res.json();
    assert.equal(body.alt_text, "มุมหน้าตรง");
  });
});

test("uploading a gallery image cleans up the Cloudinary asset if the DB insert fails", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const uploadCatalogImage = async () => ({ url: "https://res.cloudinary.com/demo/orphan.jpg", public_id: "orphan-id" });
  const cleanedUp = [];
  const deleteCatalogImage = async (publicId) => { cleanedUp.push(publicId); return { ok: true }; };
  const originalConnect = pool.connect;
  pool.connect = async () => {
    const client = await originalConnect();
    return {
      query: async (sql, params) => {
        if (String(sql).includes("INSERT INTO public.catalog_item_images")) {
          throw new Error("simulated DB insert failure");
        }
        return client.query(sql, params);
      },
      release: () => client.release(),
    };
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, uploadCatalogImage, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images`, { method: "POST", body: multipartImageForm(JPEG_BYTES) });
    assert.equal(res.status, 500);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(cleanedUp, ["orphan-id"]);
    assert.equal(pool.state.images.length, 0);
  });
});

test("GET gallery images list is ordered by sort_order", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 1, is_primary: false },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 0, is_primary: true }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images`);
    const body = await res.json();
    assert.deepEqual(body.map((x) => x.image_id), [2, 1]);
  });
});

test("deleting a non-primary gallery image succeeds and reports the real Cloudinary result", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const deleteCatalogImage = async (publicId) => ({ ok: true, result: { public_id: publicId, result: "ok" } });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/2`, { method: "DELETE" });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.deleted, true);
    assert.equal(body.cloudinary_deleted, true);
    assert.equal(pool.state.images.some((img) => img.image_id === 2), false);
    assert.equal(pool.state.images.find((img) => img.image_id === 1).is_primary, true);
  });
});

test("deleting the primary gallery image promotes the next image by sort_order", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const deleteCatalogImage = async () => ({ ok: true, result: {} });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.equal(pool.state.images.find((img) => img.image_id === 2).is_primary, true);
  });
});

test("deleting a gallery image keeps the DB row when Cloudinary delete fails (no orphan, retry possible)", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push({ image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true });
  const deleteCatalogImage = async () => { throw new Error("cloudinary down"); };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, deleteCatalogImage });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/1`, { method: "DELETE" });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.deleted, false);
    assert.equal(body.cloudinary_deleted, false);
    assert.match(body.error, /Cloudinary|cloudinary/i);
    const row = pool.state.images.find((img) => img.image_id === 1);
    assert.ok(row, "the DB row must be retained when Cloudinary delete fails");
    assert.equal(row.image_public_id, "p1");
  });
});

test("deleting an unknown gallery image returns 404", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/999`, { method: "DELETE" });
    assert.equal(res.status, 404);
  });
});

test("setting a gallery image as primary unsets every other image for that item", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/2/primary`, { method: "POST" });
    assert.equal(res.status, 200);
    const body = await res.json();
    const byId = (id) => body.find((x) => x.image_id === id);
    assert.equal(byId(1).is_primary, false);
    assert.equal(byId(2).is_primary, true);
  });
});

test("setting an unknown image as primary returns 404 and changes nothing", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push({ image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/999/primary`, { method: "POST" });
    assert.equal(res.status, 404);
    assert.equal(pool.state.images.find((img) => img.image_id === 1).is_primary, true);
  });
});

test("reordering gallery images applies the requested order as sort_order", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false },
    { image_id: 3, item_id: 1, image_url: "u3", image_public_id: "p3", alt_text: null, sort_order: 2, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: [3, 1, 2] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.map((x) => x.image_id), [3, 1, 2]);
  });
});

test("reordering rejects a request that omits an existing image", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: [1] }),
    });
    assert.equal(res.status, 400);
  });
});

test("reordering rejects a request with a duplicate image id", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push(
    { image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true },
    { image_id: 2, item_id: 1, image_url: "u2", image_public_id: "p2", alt_text: null, sort_order: 1, is_primary: false }
  );
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/admin/catalog/items/1/images/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_ids: [1, 1] }),
    });
    assert.equal(res.status, 400);
  });
});

test("gallery image routes require admin session", async () => {
  const pool = makePool(sampleItems(), [], { marketplaceReady: true });
  pool.state.images.push({ image_id: 1, item_id: 1, image_url: "u1", image_public_id: "p1", alt_text: null, sort_order: 0, is_primary: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: denyAdmin });
  await withServer(router, async (base) => {
    assert.equal((await fetch(`${base}/admin/catalog/items/1/images`)).status, 401);
    assert.equal((await fetch(`${base}/admin/catalog/items/1/images/1`, { method: "DELETE" })).status, 401);
    assert.equal((await fetch(`${base}/admin/catalog/items/1/images/1/primary`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/admin/catalog/items/1/images/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_ids: [1] }) })).status, 401);
  });
});

// ---- Real booking_count (attachBookingCounts) ----

test("booking_count is 0 for every item before the jobs.catalog_item_id migration has run", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: false,
    jobs: [{ job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null }],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    assert.ok(body.every((x) => x.booking_count === 0));
  });
});

test("booking_count counts DISTINCT job_id directly linked via jobs.catalog_item_id, excluding cancelled/rejected/no-technician jobs", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: true,
    jobs: [
      { job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null },
      { job_id: 2, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null },
      { job_id: 3, catalog_item_id: 1, job_status: "ยกเลิก", canceled_at: null },
      { job_id: 4, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: "2026-06-01T00:00:00Z" },
      { job_id: 5, catalog_item_id: 1, job_status: "ไม่พบช่างรับงาน", canceled_at: null },
    ],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    const item1 = body.find((x) => x.item_id === 1);
    assert.equal(item1.booking_count, 2);
  });
});

test("booking_count never counts job_units quantity, only distinct job_id", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: true,
    jobs: [{ job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null }],
    jobUnits: [
      { job_id: 1, unit_id: 1, ac_type: "ผนัง", btu: 10000, status: "active" },
      { job_id: 1, unit_id: 2, ac_type: "ผนัง", btu: 10000, status: "active" },
      { job_id: 1, unit_id: 3, ac_type: "ผนัง", btu: 10000, status: "active" },
    ],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    const item1 = body.find((x) => x.item_id === 1);
    // job_id 1 is directly linked, so its multiple units must not multiply the count.
    assert.equal(item1.booking_count, 1);
  });
});

test("booking_count adds historical (unlinked) jobs matched unambiguously via job_units to the direct count", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: true,
    jobs: [
      { job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null },
      { job_id: 2, catalog_item_id: null, job_type: "ล้าง", job_status: DONE_STATUS, canceled_at: null },
    ],
    jobUnits: [{ job_id: 2, unit_id: 1, ac_type: "ผนัง", btu: 10000, status: "active" }],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    const item1 = body.find((x) => x.item_id === 1);
    assert.equal(item1.booking_count, 2);
  });
});

test("booking_count never guesses a historical job whose unit ambiguously matches more than one catalog item", async () => {
  const ambiguousItems = [
    { item_id: 10, item_name: "ล้างแอร์ผนัง A", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, is_active: true, is_customer_visible: true },
    { item_id: 11, item_name: "ล้างแอร์ผนัง B", item_category: "ล้างแอร์", base_price: 800, unit_label: "เครื่อง", job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 15000, is_active: true, is_customer_visible: true },
  ];
  const pool = makePool(ambiguousItems, [], {
    jobsCatalogLinkReady: true,
    jobs: [{ job_id: 1, catalog_item_id: null, job_type: "ล้าง", job_status: DONE_STATUS, canceled_at: null }],
    jobUnits: [{ job_id: 1, unit_id: 1, ac_type: "ผนัง", btu: 10000, status: "active" }],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items`);
    const body = await res.json();
    assert.equal(body.find((x) => x.item_id === 10).booking_count, 0);
    assert.equal(body.find((x) => x.item_id === 11).booking_count, 0);
  });
});

test("booking_count is aggregated in at most two grouped queries for a list request, never one query per item", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: true,
    jobs: [
      { job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null },
      { job_id: 2, catalog_item_id: null, job_type: "ซ่อม", job_status: DONE_STATUS, canceled_at: null },
    ],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    await fetch(`${base}/catalog/items`);
    const bookingCountQueries = pool.state.queries.filter((q) =>
      q.sql.includes("GROUP BY catalog_item_id") || (q.sql.includes("WITH active_units AS") && q.sql.includes("JOIN public.jobs j"))
    );
    assert.equal(bookingCountQueries.length, 2);
  });
});

test("booking_count is also attached on the single-item public detail endpoint", async () => {
  const pool = makePool(sampleItems(), [], {
    jobsCatalogLinkReady: true,
    jobs: [{ job_id: 1, catalog_item_id: 1, job_status: DONE_STATUS, canceled_at: null }],
  });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1`);
    const body = await res.json();
    assert.equal(body.booking_count, 1);
  });
});

// ---- has_queue_today (real technician-eligibility check, never hardcoded) ----
// Verifies matrix/calendar/capacity eligibility PLUS a same-day cutoff check
// (a technician whose work window for today has already ended never counts),
// derived from the real getNowBangkokParts clock unless a test injects a
// fixed one for determinism.

function queueSlotDeps({ nowParts } = {}) {
  return nowParts ? { getNowBangkokParts: () => nowParts } : {};
}

function bookableWashWallItem(overrides = {}) {
  return {
    item_id: 1, item_name: "ล้างแอร์ผนัง", item_category: "ล้างแอร์", base_price: 700, unit_label: "เครื่อง",
    job_category: "ล้าง", ac_type: "ผนัง", btu_min: 9000, btu_max: 12000, is_active: true, is_customer_visible: true,
    booking_mode: "bookable", booking_ac_type: "ผนัง", booking_btu: 9000, booking_wash_variant: "ล้างธรรมดา",
    ...overrides,
  };
}

function eligibleTodayFixtures() {
  const today = getBangkokNow().ymd;
  return {
    technicians: [{ username: "tech1", employment_type: "company", accept_status: "ready", customer_slot_visible: true }],
    serviceMatrix: [{ username: "tech1", matrix_json: { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } } }],
    calendarRows: [{ technician_username: "tech1", work_date: today, can_accept_advance_job: true, start_time: "09:00:00", end_time: "18:00:00", max_jobs_per_day: null, max_units_per_day: null }],
  };
}

const QUEUE_TODAY_MORNING_NOW = { ymd: getBangkokNow().ymd, hour: 9, minute: 0 };

test("has_queue_today is true on the list endpoint when a real bookable start slot exists today", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem()], [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, true);
  });
});

test("has_queue_today is true and consistent on the single-item detail endpoint", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem()], [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items/1`);
    const body = await res.json();
    assert.equal(body.has_queue_today, true);
  });
});

test("has_queue_today is false (never guessed true) when no real technician is eligible today", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem()], [], { marketplaceReady: true });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, false);
  });
});

test("has_queue_today is false for contact_admin items even with an eligible technician", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem({ booking_mode: "contact_admin" })], [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, false);
  });
});

test("has_queue_today is false when the current time has already passed the technician's end-of-day window", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem()], [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const router = createCatalogItemRoutes({
    pool, requireAdminSession: allowAdmin,
    ...queueSlotDeps({ nowParts: { ymd: getBangkokNow().ymd, hour: 19, minute: 0 } }),
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, false);
  });
});

test("has_queue_today is false when the technician's daily job capacity is already used up today", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const today = getBangkokNow().ymd;
  const pool = makePool([bookableWashWallItem()], [], {
    marketplaceReady: true,
    technicians: [{ username: "tech1", employment_type: "company", accept_status: "ready", customer_slot_visible: true }],
    serviceMatrix: [{ username: "tech1", matrix_json: { job_types: { wash: true }, ac_types: { wall: true }, wash_wall_variants: { normal: true } } }],
    calendarRows: [{ technician_username: "tech1", work_date: today, can_accept_advance_job: true, start_time: "09:00:00", end_time: "18:00:00", max_jobs_per_day: 1, max_units_per_day: null }],
  });
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    if (String(sql).includes("WITH assigned AS")) return { rows: [{ technician_username: "tech1", jobs_count: 1, units_count: 1 }] };
    return originalQuery(sql, params);
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, false);
  });
});

test("has_queue_today fails open to false (never crashes the Store listing) when the eligibility check throws", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const pool = makePool([bookableWashWallItem()], [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const originalQuery = pool.query;
  pool.query = async (sql, params) => {
    if (String(sql).includes("FROM public.technician_service_matrix")) throw new Error("simulated queue-today failure");
    return originalQuery(sql, params);
  };
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.find((x) => x.item_id === 1).has_queue_today, false);
  });
});

test("has_queue_today reuses one cached eligibility check across multiple items with identical service criteria", async () => {
  createCatalogItemRoutes.__resetQueueTodayCacheForTests();
  const items = [
    bookableWashWallItem({ item_id: 1, item_name: "ล้างแอร์ผนัง A" }),
    bookableWashWallItem({ item_id: 2, item_name: "ล้างแอร์ผนัง B" }),
  ];
  const pool = makePool(items, [], { marketplaceReady: true, ...eligibleTodayFixtures() });
  const router = createCatalogItemRoutes({ pool, requireAdminSession: allowAdmin, ...queueSlotDeps({ nowParts: QUEUE_TODAY_MORNING_NOW }) });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/catalog/items?customer=1`);
    const body = await res.json();
    assert.ok(body.every((x) => x.has_queue_today === true));
    const matrixQueries = pool.state.queries.filter((q) => q.sql.includes("FROM public.technician_service_matrix"));
    assert.equal(matrixQueries.length, 1);
  });
});
