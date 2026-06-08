const express = require("express");

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 12);
  if (typeof value === "string") return value.split(",").map((x) => cleanText(x, 80)).filter(Boolean).slice(0, 12);
  return [];
}

function getAdminUser(req) {
  return cleanText(req.session?.user?.username || req.session?.user?.email || req.session?.username || req.user?.username || req.user?.email || "", 120);
}

async function ensureSharedMemorySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_memory_events (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'unknown',
      event_type TEXT NOT NULL DEFAULT 'event',
      agent_key TEXT NOT NULL DEFAULT 'admin',
      conversation_id BIGINT NULL,
      selected_customer_question TEXT NOT NULL DEFAULT '',
      customer_message TEXT NOT NULL DEFAULT '',
      ai_reply TEXT NOT NULL DEFAULT '',
      final_admin_reply TEXT NOT NULL DEFAULT '',
      action_status TEXT NOT NULL DEFAULT '',
      situation_type TEXT NOT NULL DEFAULT 'general',
      service_type TEXT NOT NULL DEFAULT '',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_memory_events_context ON public.ai_memory_events(conversation_id, agent_key, situation_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_memory_events_source_time ON public.ai_memory_events(source, event_type, created_at DESC)`);
}

async function saveSharedMemoryEvent(pool, req, body = {}) {
  await ensureSharedMemorySchema(pool);
  const tags = normalizeTags(body.tags);
  const r = await pool.query(`
    INSERT INTO public.ai_memory_events(
      source, event_type, agent_key, conversation_id, selected_customer_question,
      customer_message, ai_reply, final_admin_reply, action_status, situation_type,
      service_type, tags, created_by, metadata
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb)
    RETURNING *
  `, [
    cleanText(body.source || "unknown", 80),
    cleanText(body.event_type || body.action_status || "event", 80),
    cleanText(body.agent_key || "admin", 40),
    body.conversation_id ? Number(body.conversation_id) : null,
    cleanText(body.selected_customer_question, 4000),
    cleanText(body.customer_message, 4000),
    cleanText(body.ai_reply, 4000),
    cleanText(body.final_admin_reply, 4000),
    cleanText(body.action_status || body.event_type || "", 80),
    cleanText(body.situation_type || "general", 80),
    cleanText(body.service_type || "", 120),
    JSON.stringify(tags),
    getAdminUser(req),
    JSON.stringify(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
  ]);
  return r.rows[0];
}

function inferSituation(text) {
  const s = String(text || "").toLowerCase();
  if (/แพง|ลด|ส่วนลด|ทำไมราคา/.test(s)) return "expensive";
  if (/ราคา|เท่าไหร่|กี่บาท|price|cost/.test(s)) return "price_question";
  if (/กลิ่น|เหม็น|อับ/.test(s)) return "bad_smell";
  if (/ไม่เย็น|ไม่ค่อยเย็น|ลมไม่เย็น/.test(s)) return "air_not_cold";
  if (/น้ำหยด|หยดน้ำ|รั่ว/.test(s)) return "water_leak";
  if (/นัด|คิว|ว่าง|วันไหน|เวลา/.test(s)) return "appointment";
  if (/ล้างแบบ|แบบไหน|พรีเมียม|ปกติ|แขวนคอยล์|ตัดล้าง/.test(s)) return "cleaning_package";
  return "general";
}

async function loadSharedMemoryContext(pool, body = {}) {
  await ensureSharedMemorySchema(pool);
  const query = cleanText(body.query || body.selected_customer_question || body.customer_message || "", 1200);
  const situationType = cleanText(body.situation_type || inferSituation(query), 80);
  const agentKey = cleanText(body.agent_key || "", 40);
  const conversationId = body.conversation_id ? Number(body.conversation_id) : null;
  const limit = Math.max(1, Math.min(Number(body.limit || 10), 30));

  const params = [limit];
  const clauses = [`(final_admin_reply <> '' OR ai_reply <> '' OR customer_message <> '' OR selected_customer_question <> '')`];

  if (conversationId) {
    params.push(conversationId);
    clauses.push(`(conversation_id = $${params.length} OR conversation_id IS NULL)`);
  }
  if (agentKey) {
    params.push(agentKey);
    clauses.push(`(agent_key = $${params.length} OR source IN ('line_chat','reply_example'))`);
  }
  if (situationType) {
    params.push(situationType);
    clauses.push(`(situation_type = $${params.length} OR situation_type = 'general')`);
  }
  if (query) {
    params.push(`%${query.slice(0, 80)}%`);
    const idx = params.length;
    clauses.push(`(
      selected_customer_question ILIKE $${idx}
      OR customer_message ILIKE $${idx}
      OR final_admin_reply ILIKE $${idx}
      OR ai_reply ILIKE $${idx}
    )`);
  }

  const r = await pool.query(`
    SELECT id, source, event_type, agent_key, conversation_id, selected_customer_question,
           customer_message, ai_reply, final_admin_reply, action_status, situation_type,
           service_type, tags, metadata, created_at
      FROM public.ai_memory_events
     WHERE ${clauses.join(" AND ")}
       AND action_status <> 'disliked'
       AND event_type <> 'disliked'
     ORDER BY
       CASE WHEN event_type='admin_correction' OR action_status='correction' THEN 0 ELSE 1 END,
       CASE WHEN action_status IN ('saved','copied','liked') THEN 0 ELSE 1 END,
       CASE WHEN source='reply_example' THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT $1
  `, params);

  return {
    situation_type: situationType,
    query,
    items: r.rows || [],
  };
}

module.exports = function createAdminAiOfficeSharedMemoryRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeSharedMemoryRoutes requires pool and requireAdminSession");
  const router = express.Router();

  router.post("/admin/ai-office/shared-memory/event", requireAdminSession, async (req, res) => {
    try {
      const event = await saveSharedMemoryEvent(pool, req, req.body || {});
      return res.json({ ok: true, event });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "SAVE_SHARED_MEMORY_FAILED" });
    }
  });

  router.post("/admin/ai-office/shared-memory/context", requireAdminSession, async (req, res) => {
    try {
      const context = await loadSharedMemoryContext(pool, req.body || {});
      return res.json({ ok: true, context });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_SHARED_MEMORY_FAILED" });
    }
  });

  router.get("/admin/ai-office/shared-memory", requireAdminSession, async (req, res) => {
    try {
      const context = await loadSharedMemoryContext(pool, req.query || {});
      return res.json({ ok: true, events: context.items, context });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_SHARED_MEMORY_FAILED" });
    }
  });

  return router;
};

module.exports.ensureSharedMemorySchema = ensureSharedMemorySchema;
module.exports.saveSharedMemoryEvent = saveSharedMemoryEvent;
module.exports.loadSharedMemoryContext = loadSharedMemoryContext;
