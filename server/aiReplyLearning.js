const { sanitizeChatText, detectCustomerIntent, filterReplyExample } = require("./cwfAiKnowledge");

const ACTIVE_QUALITY = "admin_saved";
const FEEDBACK_TYPES = new Set(["usable", "too_long", "not_admin_style", "wrong_info", "save_example"]);

function cleanText(value, max = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeIntent(value, fallbackText = "") {
  return cleanText(value, 80) || detectCustomerIntent(fallbackText) || "general";
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((x) => cleanText(x, 40)).filter(Boolean).slice(0, 12);
  return String(value || "")
    .split(/[,\n|#]/)
    .map((x) => cleanText(x, 40))
    .filter(Boolean)
    .slice(0, 12);
}

function safeJsonTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return normalizeTags(value);
  if (typeof value === "string") {
    try { return normalizeTags(JSON.parse(value)); } catch (_) { return normalizeTags(value); }
  }
  return [];
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

function mapReplyExample(row) {
  const customerMessage = row.customer_message || row.customer_message_sanitized || "";
  const adminReply = row.final_admin_reply || row.admin_reply_sanitized || "";
  const situationType = row.situation_type || row.intent || "general";
  return {
    id: row.id,
    agent_key: row.agent_key || "sales",
    situation_type: situationType,
    intent: situationType,
    customer_message: customerMessage,
    final_admin_reply: adminReply,
    admin_reply: adminReply,
    language: row.language || "th",
    service_type: row.service_type || "",
    tags: safeJsonTags(row.tags),
    usage_count: Number(row.usage_count || 0),
    is_active: row.is_active !== false,
    source: row.source || "admin_memory",
    source_conversation_id: row.source_conversation_id || null,
    quality: row.quality || ACTIVE_QUALITY,
    created_by: row.created_by || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    disabled_at: row.disabled_at || null,
    strength: row.quality || "admin_saved",
  };
}

async function ensureAiReplyLearningSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_reply_examples (
      id BIGSERIAL PRIMARY KEY,
      intent TEXT NOT NULL DEFAULT 'general',
      customer_message_sanitized TEXT NOT NULL DEFAULT '',
      admin_reply_sanitized TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'admin_feedback',
      source_conversation_id BIGINT NULL,
      quality TEXT NOT NULL DEFAULT 'admin_saved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE public.ai_reply_examples
      ADD COLUMN IF NOT EXISTS agent_key TEXT NOT NULL DEFAULT 'sales',
      ADD COLUMN IF NOT EXISTS situation_type TEXT NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS customer_message TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS final_admin_reply TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'th',
      ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ NULL
  `);
  await pool.query(`
    UPDATE public.ai_reply_examples
       SET situation_type = COALESCE(NULLIF(situation_type,''), intent, 'general'),
           customer_message = COALESCE(NULLIF(customer_message,''), customer_message_sanitized, ''),
           final_admin_reply = COALESCE(NULLIF(final_admin_reply,''), admin_reply_sanitized, ''),
           updated_at = COALESCE(updated_at, created_at, NOW())
     WHERE (customer_message = '' OR final_admin_reply = '' OR situation_type = '')
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.ai_reply_learning_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      reply_example_id BIGINT NULL REFERENCES public.ai_reply_examples(id) ON DELETE SET NULL,
      conversation_id BIGINT NULL,
      agent_key TEXT NOT NULL DEFAULT 'sales',
      situation_type TEXT NOT NULL DEFAULT 'general',
      customer_message_sanitized TEXT NULL,
      ai_reply_sanitized TEXT NULL,
      final_admin_reply_sanitized TEXT NULL,
      source TEXT NOT NULL DEFAULT 'ai_office',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_examples_intent ON public.ai_reply_examples(intent, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_examples_active_situation ON public.ai_reply_examples(is_active, situation_type, usage_count DESC, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_examples_agent ON public.ai_reply_examples(agent_key, is_active, updated_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_feedback_type ON public.ai_reply_feedback(feedback_type, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_reply_learning_events_type ON public.ai_reply_learning_events(event_type, created_at DESC)`);
}

async function listReplyExamples(pool, opts = {}) {
  await ensureAiReplyLearningSchema(pool);
  const params = [];
  const where = [];
  if (opts.active_only !== false) where.push("is_active = TRUE");
  if (opts.agent_key) {
    params.push(cleanText(opts.agent_key, 40));
    where.push(`agent_key = $${params.length}`);
  }
  if (opts.situation_type) {
    params.push(cleanText(opts.situation_type, 80));
    where.push(`situation_type = $${params.length}`);
  }
  const search = cleanText(opts.search, 160);
  if (search) {
    params.push(`%${search}%`);
    where.push(`(customer_message ILIKE $${params.length} OR final_admin_reply ILIKE $${params.length} OR service_type ILIKE $${params.length})`);
  }
  params.push(Math.max(1, Math.min(Number(opts.limit || 80), 200)));
  const r = await pool.query(
    `SELECT *
       FROM public.ai_reply_examples
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY is_active DESC, usage_count DESC, updated_at DESC, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return (r.rows || []).map(mapReplyExample);
}

async function createReplyExample(pool, input = {}) {
  await ensureAiReplyLearningSchema(pool);
  const customerMessage = sanitizeChatText(input.customer_message || input.customer_message_sanitized || "");
  const finalReply = sanitizeChatText(input.final_admin_reply || input.admin_reply || input.ai_reply || "");
  const pair = filterReplyExample(customerMessage, finalReply);
  if (!pair) {
    const err = new Error("INVALID_REPLY_EXAMPLE");
    err.status = 400;
    throw err;
  }
  const situationType = normalizeIntent(input.situation_type || input.intent, `${pair.customer_message}\n${pair.admin_reply}`);
  const agentKey = cleanText(input.agent_key || "sales", 40) || "sales";
  const language = cleanText(input.language || "th", 16) || "th";
  const serviceType = cleanText(input.service_type || "", 120);
  const tags = normalizeTags(input.tags);
  const conversationId = Number(input.conversation_id || input.source_conversation_id || 0);
  const r = await pool.query(
    `INSERT INTO public.ai_reply_examples(
       agent_key, situation_type, intent, customer_message, final_admin_reply,
       customer_message_sanitized, admin_reply_sanitized, language, service_type, tags,
       usage_count, is_active, created_by, source, source_conversation_id, quality, updated_at
     )
     VALUES($1,$2,$2,$3,$4,$3,$4,$5,$6,$7::jsonb,0,$8,$9,$10,$11,$12,NOW())
     RETURNING *`,
    [
      agentKey,
      situationType,
      pair.customer_message,
      pair.admin_reply,
      language,
      serviceType,
      JSON.stringify(tags),
      boolValue(input.is_active, true),
      cleanText(input.created_by || input.admin_user || "", 80),
      cleanText(input.source || "admin_memory", 80),
      Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
      cleanText(input.quality || ACTIVE_QUALITY, 40),
    ]
  );
  await logReplyLearningEvent(pool, {
    event_type: "example_created",
    reply_example_id: r.rows[0]?.id,
    conversation_id: conversationId,
    agent_key: agentKey,
    situation_type: situationType,
    customer_message: pair.customer_message,
    final_admin_reply: pair.admin_reply,
    source: "reply_examples",
  });
  return mapReplyExample(r.rows[0]);
}

async function updateReplyExample(pool, id, input = {}) {
  await ensureAiReplyLearningSchema(pool);
  const exampleId = Number(id || 0);
  if (!Number.isFinite(exampleId) || exampleId <= 0) {
    const err = new Error("INVALID_REPLY_EXAMPLE_ID");
    err.status = 400;
    throw err;
  }
  const existing = await pool.query(`SELECT * FROM public.ai_reply_examples WHERE id=$1`, [exampleId]);
  if (!existing.rows?.length) {
    const err = new Error("REPLY_EXAMPLE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  const current = mapReplyExample(existing.rows[0]);
  const customerMessage = sanitizeChatText(input.customer_message ?? current.customer_message);
  const finalReply = sanitizeChatText(input.final_admin_reply ?? current.final_admin_reply);
  const pair = filterReplyExample(customerMessage, finalReply);
  if (!pair) {
    const err = new Error("INVALID_REPLY_EXAMPLE");
    err.status = 400;
    throw err;
  }
  const situationType = normalizeIntent(input.situation_type ?? current.situation_type, `${pair.customer_message}\n${pair.admin_reply}`);
  const r = await pool.query(
    `UPDATE public.ai_reply_examples
        SET agent_key=$2,
            situation_type=$3,
            intent=$3,
            customer_message=$4,
            final_admin_reply=$5,
            customer_message_sanitized=$4,
            admin_reply_sanitized=$5,
            language=$6,
            service_type=$7,
            tags=$8::jsonb,
            is_active=$9,
            updated_at=NOW(),
            disabled_at=CASE WHEN $9 THEN NULL ELSE COALESCE(disabled_at, NOW()) END
      WHERE id=$1
      RETURNING *`,
    [
      exampleId,
      cleanText(input.agent_key ?? current.agent_key, 40) || "sales",
      situationType,
      pair.customer_message,
      pair.admin_reply,
      cleanText(input.language ?? current.language, 16) || "th",
      cleanText(input.service_type ?? current.service_type, 120),
      JSON.stringify(normalizeTags(input.tags ?? current.tags)),
      boolValue(input.is_active, current.is_active),
    ]
  );
  await logReplyLearningEvent(pool, {
    event_type: "example_updated",
    reply_example_id: exampleId,
    agent_key: r.rows[0]?.agent_key || "sales",
    situation_type: situationType,
    customer_message: pair.customer_message,
    final_admin_reply: pair.admin_reply,
    source: "reply_examples",
  });
  return mapReplyExample(r.rows[0]);
}

async function disableReplyExample(pool, id) {
  await ensureAiReplyLearningSchema(pool);
  const exampleId = Number(id || 0);
  if (!Number.isFinite(exampleId) || exampleId <= 0) {
    const err = new Error("INVALID_REPLY_EXAMPLE_ID");
    err.status = 400;
    throw err;
  }
  const r = await pool.query(
    `UPDATE public.ai_reply_examples
        SET is_active=FALSE, disabled_at=COALESCE(disabled_at, NOW()), updated_at=NOW()
      WHERE id=$1
      RETURNING *`,
    [exampleId]
  );
  if (!r.rows?.length) {
    const err = new Error("REPLY_EXAMPLE_NOT_FOUND");
    err.status = 404;
    throw err;
  }
  await logReplyLearningEvent(pool, { event_type: "example_disabled", reply_example_id: exampleId, source: "reply_examples" });
  return mapReplyExample(r.rows[0]);
}

async function loadMatchingReplyExamples(pool, opts = {}) {
  await ensureAiReplyLearningSchema(pool);
  const situation = normalizeIntent(opts.situation_type || opts.intent, opts.text || "");
  const language = cleanText(opts.language || "", 16);
  const text = sanitizeChatText(opts.text || "");
  const words = text.toLowerCase().split(/\s+/).filter((x) => x.length >= 2).slice(0, 8);
  const params = [situation, Math.max(1, Math.min(Number(opts.limit || 5), 12))];
  let languageSql = "";
  if (language) {
    params.push(language);
    languageSql = ` OR language = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT *
       FROM public.ai_reply_examples
      WHERE is_active = TRUE
        AND (situation_type = $1 OR intent = $1 OR situation_type = 'general'${languageSql})
      ORDER BY
        CASE WHEN situation_type = $1 OR intent = $1 THEN 0 ELSE 1 END,
        usage_count DESC,
        updated_at DESC,
        created_at DESC
      LIMIT $2`,
    params
  );
  const mapped = (r.rows || []).map(mapReplyExample);
  if (!words.length) return mapped;
  return mapped.sort((a, b) => {
    const score = (item) => words.reduce((n, w) => n + (`${item.customer_message} ${item.final_admin_reply} ${item.service_type} ${item.tags.join(" ")}`.toLowerCase().includes(w) ? 1 : 0), 0);
    return score(b) - score(a);
  });
}

async function incrementReplyExampleUsage(pool, ids = []) {
  const cleanIds = ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0).slice(0, 12);
  if (!cleanIds.length) return;
  await ensureAiReplyLearningSchema(pool);
  await pool.query(
    `UPDATE public.ai_reply_examples
        SET usage_count = usage_count + 1, updated_at = NOW()
      WHERE id = ANY($1::bigint[])`,
    [cleanIds]
  );
}

async function logReplyLearningEvent(pool, input = {}) {
  await ensureAiReplyLearningSchema(pool);
  const eventType = cleanText(input.event_type || "event", 80);
  const conversationId = Number(input.conversation_id || 0);
  const replyExampleId = Number(input.reply_example_id || 0);
  const situationType = normalizeIntent(input.situation_type || input.intent, `${input.customer_message || ""}\n${input.ai_reply || input.final_admin_reply || ""}`);
  await pool.query(
    `INSERT INTO public.ai_reply_learning_events(
       event_type, reply_example_id, conversation_id, agent_key, situation_type,
       customer_message_sanitized, ai_reply_sanitized, final_admin_reply_sanitized,
       source, metadata, created_by
     )
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      eventType,
      Number.isFinite(replyExampleId) && replyExampleId > 0 ? replyExampleId : null,
      Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
      cleanText(input.agent_key || "sales", 40) || "sales",
      situationType,
      sanitizeChatText(input.customer_message || ""),
      sanitizeChatText(input.ai_reply || ""),
      sanitizeChatText(input.final_admin_reply || input.admin_reply || ""),
      cleanText(input.source || "ai_office", 80),
      JSON.stringify(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      cleanText(input.created_by || input.admin_user || "", 80),
    ]
  );
  return { ok: true };
}

async function loadSavedReplyExamples(pool, intent = "general", limit = 8) {
  const rows = await loadMatchingReplyExamples(pool, {
    situation_type: intent || "general",
    text: intent || "general",
    limit: Math.max(1, Math.min(Number(limit || 8), 20)),
  });
  return rows.map((row) => ({
    id: row.id,
    intent: row.situation_type,
    customer_message: row.customer_message,
    admin_reply: row.final_admin_reply,
    source: row.source,
    strength: row.quality || "admin_saved",
  }));
}

async function saveReplyFeedback(pool, input = {}) {
  await ensureAiReplyLearningSchema(pool);
  const feedbackType = cleanText(input.feedback_type, 40);
  if (!FEEDBACK_TYPES.has(feedbackType)) {
    const err = new Error("INVALID_FEEDBACK_TYPE");
    err.status = 400;
    throw err;
  }
  const customerMessage = sanitizeChatText(input.customer_message || "");
  const aiReply = sanitizeChatText(input.ai_reply || "");
  const intent = normalizeIntent(input.intent, `${customerMessage}\n${aiReply}`);
  const conversationId = Number(input.conversation_id || 0);
  await pool.query(
    `INSERT INTO public.ai_reply_feedback(
       feedback_type, intent, customer_message_sanitized, ai_reply_sanitized, source, source_conversation_id
     )
     VALUES($1,$2,$3,$4,$5,$6)`,
    [
      feedbackType,
      intent,
      customerMessage || null,
      aiReply || null,
      cleanText(input.source || "ai_office", 80),
      Number.isFinite(conversationId) && conversationId > 0 ? conversationId : null,
    ]
  );
  await logReplyLearningEvent(pool, {
    event_type: feedbackType,
    conversation_id: conversationId,
    agent_key: input.agent_key || "sales",
    situation_type: intent,
    customer_message: customerMessage,
    ai_reply: aiReply,
    source: input.source || "ai_office",
  });
  let savedExample = null;
  if (feedbackType === "save_example") {
    savedExample = await createReplyExample(pool, {
      agent_key: input.agent_key || "sales",
      situation_type: intent,
      customer_message: customerMessage,
      final_admin_reply: aiReply,
      language: input.language || "th",
      service_type: input.service_type || "",
      tags: input.tags || [],
      source: input.source || "admin_feedback",
      source_conversation_id: conversationId,
      created_by: input.created_by || "",
    }).catch(() => null);
  }
  return { ok: true, saved_example: Boolean(savedExample), example: savedExample };
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
      learning_events: { exists: true, table: "public.ai_reply_learning_events" },
      feedback: { exists: true, table: "public.ai_reply_feedback" },
      rag_usage: { exists: true, target: "Sales AI, Admin AI, Office Chat, Customer Inbox line-draft-reply" },
      privacy_protection: { exists: true, rule: "Only sanitized examples are used as style references; current CWF Knowledge overrides facts/prices" },
    },
    counts: {},
    table_fields: {
      line_conversations: ["id", "line_user_id", "display_name", "last_message_text", "last_message_at"],
      line_messages: ["id", "conversation_id", "line_user_id", "direction", "message_type", "message_text", "received_at", "created_at"],
      ai_reply_examples: ["id", "agent_key", "situation_type", "customer_message", "final_admin_reply", "language", "service_type", "tags", "usage_count", "is_active", "created_by", "created_at", "updated_at", "disabled_at"],
      ai_reply_learning_events: ["id", "event_type", "reply_example_id", "conversation_id", "agent_key", "situation_type", "customer_message_sanitized", "ai_reply_sanitized", "final_admin_reply_sanitized", "source", "metadata", "created_at"],
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
        (SELECT COUNT(*)::int FROM public.ai_reply_examples WHERE is_active=TRUE) AS active_saved_examples,
        (SELECT COUNT(*)::int FROM public.ai_reply_feedback) AS feedback_rows,
        (SELECT COUNT(*)::int FROM public.ai_reply_learning_events) AS learning_events
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
  listReplyExamples,
  createReplyExample,
  updateReplyExample,
  disableReplyExample,
  loadMatchingReplyExamples,
  incrementReplyExampleUsage,
  logReplyLearningEvent,
  loadSavedReplyExamples,
  saveReplyFeedback,
  getReplyLearningStatus,
};
