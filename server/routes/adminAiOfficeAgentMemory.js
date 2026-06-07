const express = require("express");

function cleanText(value, max = 4000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function ensureAiAgentChatMemorySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_agent_messages (
      id BIGSERIAL PRIMARY KEY,
      agent_key TEXT NOT NULL DEFAULT 'admin',
      admin_user TEXT NOT NULL DEFAULT '',
      message_role TEXT NOT NULL CHECK (message_role IN ('user','assistant','system')),
      message_text TEXT NOT NULL DEFAULT '',
      source_page TEXT NOT NULL DEFAULT 'admin-ai-office',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_agent_messages_agent_user_time ON public.ai_agent_messages(agent_key, admin_user, created_at DESC)`);
}

function getAdminUser(req) {
  return cleanText(
    req.session?.user?.username ||
    req.session?.user?.email ||
    req.session?.username ||
    req.user?.username ||
    req.user?.email ||
    "",
    120
  );
}

module.exports = function createAdminAiOfficeAgentMemoryRoutes(deps = {}) {
  const pool = deps.pool;
  const requireAdminSession = deps.requireAdminSession;
  if (!pool || !requireAdminSession) throw new Error("createAdminAiOfficeAgentMemoryRoutes requires pool and requireAdminSession");

  const router = express.Router();

  router.get("/admin/ai-office/agent-chat-history", requireAdminSession, async (req, res) => {
    try {
      await ensureAiAgentChatMemorySchema(pool);
      const adminUser = getAdminUser(req);
      const agentKey = cleanText(req.query.agent_key || "admin", 40) || "admin";
      const limit = Math.max(1, Math.min(Number(req.query.limit || 30), 80));
      const params = [agentKey, limit];
      let userSql = "";
      if (adminUser) {
        params.push(adminUser);
        userSql = `AND admin_user = $${params.length}`;
      }
      const r = await pool.query(
        `SELECT id, agent_key, admin_user, message_role, message_text, source_page, metadata, created_at
           FROM public.ai_agent_messages
          WHERE agent_key = $1
            ${userSql}
          ORDER BY created_at DESC
          LIMIT $2`,
        params
      );
      return res.json({ ok: true, messages: (r.rows || []).reverse() });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "LOAD_AGENT_CHAT_HISTORY_FAILED" });
    }
  });

  router.post("/admin/ai-office/agent-chat-history", requireAdminSession, async (req, res) => {
    try {
      await ensureAiAgentChatMemorySchema(pool);
      const agentKey = cleanText(req.body?.agent_key || "admin", 40) || "admin";
      const role = cleanText(req.body?.message_role || "user", 20);
      if (!["user", "assistant", "system"].includes(role)) return res.status(400).json({ ok: false, error: "INVALID_AGENT_MESSAGE_ROLE" });
      const text = cleanText(req.body?.message_text, 6000);
      if (!text) return res.status(400).json({ ok: false, error: "EMPTY_AGENT_MESSAGE" });
      const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};
      const r = await pool.query(
        `INSERT INTO public.ai_agent_messages(agent_key, admin_user, message_role, message_text, source_page, metadata)
         VALUES($1,$2,$3,$4,$5,$6::jsonb)
         RETURNING id, agent_key, admin_user, message_role, message_text, source_page, metadata, created_at`,
        [
          agentKey,
          getAdminUser(req),
          role,
          text,
          cleanText(req.body?.source_page || "admin-ai-office", 120),
          JSON.stringify(metadata),
        ]
      );
      return res.json({ ok: true, message: r.rows[0] });
    } catch (e) {
      return res.status(e.status || 500).json({ ok: false, error: e.message || "SAVE_AGENT_CHAT_HISTORY_FAILED" });
    }
  });

  return router;
};

module.exports.ensureAiAgentChatMemorySchema = ensureAiAgentChatMemorySchema;
