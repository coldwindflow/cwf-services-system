const { sanitizeChatText, detectCustomerIntent, filterReplyExample } = require("./cwfAiKnowledge");

async function ensureAiReplyLearningSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_reply_examples (
      id BIGSERIAL PRIMARY KEY,
      intent TEXT NOT NULL DEFAULT 'general',
      customer_message_sanitized TEXT NOT NULL,
      admin_reply_sanitized TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'admin_feedback',
      source_conversation_id BIGINT NULL,
      quality TEXT NOT NULL DEFAULT 'admin_saved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_reply_feedback (
      id BIGSERIAL PRIMARY KEY,
      feedback_type TEXT NOT NULL,
      intent TEXT NOT NULL DEFAULT 'general',
      customer_message_sanitized TEXT NULL,
      ai_reply_sanitized TEXT NULL,
      source TEXT NOT NULL DEFAULT 'ai_office',
      source_conversation_id BIGINT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_examples_intent ON public.ai_reply_examples(intent, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_feedback_type ON public.ai_reply_feedback(feedback_type, created_at DESC)`);
}

async function loadSavedReplyExamples(pool, intent = "general", limit = 8) {
  await ensureAiReplyLearningSchema(pool);
  const r = await pool.query(
    `SELECT intent, customer_message_sanitized, admin_reply_sanitized, source, quality, created_at
       FROM public.ai_reply_examples
      WHERE intent=$1 OR intent='general'
      ORDER BY CASE WHEN intent=$1 THEN 0 ELSE 1 END, created_at DESC
      LIMIT $2`,
    [intent || "general", Math.max(1, Math.min(Number(limit || 8), 20))]
  );
  return (r.rows || []).map((row) => ({
    intent: row.intent,
    customer_message: row.customer_message_sanitized,
    admin_reply: row.admin_reply_sanitized,
    source: row.source,
    strength: row.quality || "admin_saved",
  }));
}

async function saveReplyFeedback(pool, input = {}) {
  await ensureAiReplyLearningSchema(pool);
  const feedbackType = String(input.feedback_type || "").trim();
  const allowed = new Set(["usable", "too_long", "not_admin_style", "wrong_info", "save_example"]);
  if (!allowed.has(feedbackType)) {
    const err = new Error("INVALID_FEEDBACK_TYPE");
    err.status = 400;
    throw err;
  }
  const customerMessage = sanitizeChatText(input.customer_message || "");
  const aiReply = sanitizeChatText(input.ai_reply || "");
  const intent = String(input.intent || detectCustomerIntent(`${customerMessage}\n${aiReply}`) || "general").trim();
  const conversationId = Number(input.conversation_id || 0);
  await pool.query(
    `INSERT INTO public.ai_reply_feedback(
       feedback_type, intent, customer_message_sanitized, ai_reply_sanitized, source, source_conversation_id
     )
     VALUES($1,$2,$3,$4,$5,$6)`,
    [feedbackType, intent, customerMessage || null, aiReply || null, String(input.source || "ai_office").slice(0, 80), Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null]
  );
  if (feedbackType === "save_example") {
    const pair = filterReplyExample(customerMessage, aiReply);
    if (pair) {
      await pool.query(
        `INSERT INTO public.ai_reply_examples(
           intent, customer_message_sanitized, admin_reply_sanitized, source, source_conversation_id, quality
         )
         VALUES($1,$2,$3,$4,$5,'admin_saved')`,
        [intent, pair.customer_message, pair.admin_reply, "admin_feedback", Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null]
      );
    }
  }
  return { ok: true, saved_example: feedbackType === "save_example" };
}

async function getReplyLearningStatus(pool) {
  await ensureAiReplyLearningSchema(pool);
  const result = {
    ok: true,
    sources: {
      customer_chat_storage: { exists: false, tables: ["public.line_conversations", "public.line_messages"] },
      admin_reply_history: { exists: false, source: "public.line_messages.direction IN ('outbound','admin','reply')" },
      pairing_logic: { exists: true, method: "LEAD(direction/message_text) per conversation_id ordered by received_at" },
      pii_sanitization: { exists: true, method: "sanitizeChatText masks phone, links, email, booking-like codes and trims text" },
      intent_detection: { exists: true, source: "detectCustomerIntent" },
      approved_examples: { exists: true, source: "server/cwfAiKnowledge.js serviceKnowledge().approved_reply_style" },
      saved_examples: { exists: true, table: "public.ai_reply_examples" },
      feedback: { exists: true, table: "public.ai_reply_feedback" },
      rag_usage: { exists: true, target: "Sales AI, Admin AI, Office Chat via reply_style_memory" },
      privacy_protection: { exists: true, rule: "Only sanitized examples are used as weak style references; current CWF Knowledge overrides facts/prices" },
    },
    counts: {},
    table_fields: {
      line_conversations: ["id", "line_user_id", "display_name", "picture_url", "last_message_text", "last_message_type", "last_message_at", "created_at", "updated_at"],
      line_messages: ["id", "conversation_id", "line_user_id", "message_id", "direction", "event_type", "message_type", "message_text", "raw_event_json", "received_at", "created_at"],
      ai_reply_examples: ["id", "intent", "customer_message_sanitized", "admin_reply_sanitized", "source", "source_conversation_id", "quality", "created_at"],
      ai_reply_feedback: ["id", "feedback_type", "intent", "customer_message_sanitized", "ai_reply_sanitized", "source", "source_conversation_id", "created_at"],
    },
    limitations: [],
  };
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.line_conversations) AS conversations,
        (SELECT COUNT(*)::int FROM public.line_messages) AS messages,
        (SELECT COUNT(*)::int FROM public.line_messages WHERE direction='inbound') AS inbound_messages,
        (SELECT COUNT(*)::int FROM public.line_messages WHERE direction IN ('outbound','admin','reply')) AS admin_reply_messages,
        (SELECT COUNT(*)::int FROM public.ai_reply_examples) AS saved_examples,
        (SELECT COUNT(*)::int FROM public.ai_reply_feedback) AS feedback_rows
    `);
    result.counts = counts.rows?.[0] || {};
    result.sources.customer_chat_storage.exists = Number(result.counts.messages || 0) > 0;
    result.sources.admin_reply_history.exists = Number(result.counts.admin_reply_messages || 0) > 0;
  } catch (e) {
    result.limitations.push(`Could not count LINE/admin reply sources: ${e.message}`);
  }
  try {
    const pairs = await pool.query(`
      WITH ordered AS (
        SELECT conversation_id, direction, message_text, received_at,
               LEAD(direction) OVER (PARTITION BY conversation_id ORDER BY received_at ASC NULLS LAST, created_at ASC) AS next_direction,
               LEAD(message_text) OVER (PARTITION BY conversation_id ORDER BY received_at ASC NULLS LAST, created_at ASC) AS next_text
          FROM public.line_messages
         WHERE message_text IS NOT NULL
      )
      SELECT COUNT(*)::int AS pair_count
        FROM ordered
       WHERE direction='inbound'
         AND next_direction IN ('outbound','admin','reply')
         AND next_text IS NOT NULL
    `);
    result.counts.paired_customer_admin_examples = Number(pairs.rows?.[0]?.pair_count || 0);
  } catch (e) {
    result.limitations.push(`Could not test pairing query: ${e.message}`);
  }
  if (!result.sources.admin_reply_history.exists) {
    result.limitations.push("LINE webhook currently stores inbound messages; admin outbound reply capture may be missing unless another process writes outbound/admin rows to public.line_messages.");
  }
  return result;
}

module.exports = {
  ensureAiReplyLearningSchema,
  loadSavedReplyExamples,
  saveReplyFeedback,
  getReplyLearningStatus,
};
