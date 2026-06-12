const express = require("express");
const crypto = require("crypto");
const https = require("https");
const { ingestLineBookingIntakeFromEvent } = require("../aiBookingIntake");
const { handleAutoSafeLineReplyFromWebhook } = require("./adminAiOfficeControlCenter");
const { handleAutoInternalTrainingFromWebhook } = require("../aiTrainingAutoReplyV36");

function safeText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function lineTimestampToDate(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return new Date();
  return new Date(n);
}

function verifyLineSignature(rawBody, signature, secret) {
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(String(signature || ""), "base64");
  const b = Buffer.from(expected, "base64");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function fetchLineProfile(userId, token) {
  return new Promise((resolve) => {
    const safeUserId = encodeURIComponent(String(userId || ""));
    if (!safeUserId || !token) return resolve(null);
    const req = https.request({
      method: "GET",
      hostname: "api.line.me",
      path: `/v2/bot/profile/${safeUserId}`,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 2500,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return resolve(null);
        try {
          const parsed = JSON.parse(body);
          return resolve({
            display_name: safeText(parsed.displayName, 200),
            picture_url: safeText(parsed.pictureUrl, 1000),
          });
        } catch (_) {
          return resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

function normalizeLineEvent(event) {
  const message = event?.message || {};
  const messageType = safeText(message.type, 80) || null;
  const text = messageType === "text" ? safeText(message.text, 4000) : null;
  return {
    line_user_id: safeText(event?.source?.userId, 255),
    event_type: safeText(event?.type, 80) || null,
    message_id: safeText(message.id, 255) || null,
    message_type: messageType,
    message_text: text,
    last_message_text: text || (messageType ? `[${messageType}]` : null),
    received_at: lineTimestampToDate(event?.timestamp),
    raw_event_json: event || {},
  };
}

let lineInboxSchemaReady = false;

async function ensureLineInboxSchemaOnce(pool) {
  if (lineInboxSchemaReady) return;
  await ensureLineInboxSchema(pool);
  lineInboxSchemaReady = true;
}

async function storeInboundLineMessage(pool, event, profile = null) {
  const data = normalizeLineEvent(event);
  if (!data.line_user_id) return { stored: false, reason: "missing_user_id" };
  if (data.event_type !== "message") return { stored: false, reason: "unsupported_event" };

  const convo = await pool.query(
    `INSERT INTO public.line_conversations(
       line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at, updated_at
     )
     VALUES($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (line_user_id)
     DO UPDATE SET
       display_name=COALESCE(EXCLUDED.display_name, public.line_conversations.display_name),
       picture_url=COALESCE(EXCLUDED.picture_url, public.line_conversations.picture_url),
       last_message_text=EXCLUDED.last_message_text,
       last_message_type=EXCLUDED.last_message_type,
       last_message_at=EXCLUDED.last_message_at,
       updated_at=NOW()
     RETURNING id`,
    [
      data.line_user_id,
      profile?.display_name || null,
      profile?.picture_url || null,
      data.last_message_text,
      data.message_type,
      data.received_at,
    ]
  );
  const conversationId = convo.rows?.[0]?.id;
  if (!conversationId) return { stored: false, reason: "conversation_not_found" };

  const inserted = await pool.query(
    `INSERT INTO public.line_messages(
       conversation_id, line_user_id, message_id, direction, event_type, message_type,
       message_text, raw_event_json, received_at
     )
     VALUES($1,$2,$3,'inbound',$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT (message_id) WHERE message_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      conversationId,
      data.line_user_id,
      data.message_id,
      data.event_type,
      data.message_type,
      data.message_text,
      JSON.stringify(data.raw_event_json),
      data.received_at,
    ]
  );
  return { stored: Boolean(inserted.rows?.[0]?.id), conversation_id: conversationId };
}

async function ensureLineInboxSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.line_conversations (
      id BIGSERIAL PRIMARY KEY,
      line_user_id TEXT NOT NULL UNIQUE,
      display_name TEXT NULL,
      picture_url TEXT NULL,
      last_message_text TEXT NULL,
      last_message_type TEXT NULL,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.line_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT REFERENCES public.line_conversations(id) ON DELETE CASCADE,
      line_user_id TEXT NOT NULL,
      message_id TEXT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      event_type TEXT NULL,
      message_type TEXT NULL,
      message_text TEXT NULL,
      raw_event_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_conversations_last_message_at ON public.line_conversations(last_message_at DESC NULLS LAST)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_messages_conversation_created ON public.line_messages(conversation_id, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_messages_line_user_created ON public.line_messages(line_user_id, created_at DESC)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_line_messages_message_id_unique ON public.line_messages(message_id) WHERE message_id IS NOT NULL`);
}

function createLineWebhookRoutes({ pool }) {
  if (!pool) throw new Error("createLineWebhookRoutes requires pool");
  const router = express.Router();

  router.post("/line/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    try {
      const secret = String(process.env.LINE_MESSAGING_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || "").trim();
      if (!secret) return res.status(500).json({ ok: false, error: "LINE webhook is not configured" });

      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
      const signature = req.headers["x-line-signature"];
      if (!verifyLineSignature(rawBody, signature, secret)) {
        return res.status(401).json({ ok: false, error: "Invalid LINE signature" });
      }

      let payload = null;
      try { payload = JSON.parse(rawBody.toString("utf8")); } catch (_) {}
      const events = Array.isArray(payload?.events) ? payload.events : [];
      const token = String(process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim();

      res.status(200).json({ ok: true });

      await ensureLineInboxSchemaOnce(pool);
      for (const event of events) {
        try {
          const lineUserId = safeText(event?.source?.userId, 255);
          const profile = token && lineUserId ? await fetchLineProfile(lineUserId, token) : null;
          const stored = await storeInboundLineMessage(pool, event, profile);
          ingestLineBookingIntakeFromEvent(pool, event, stored).then((result) => {
            if (result && result.ok === false && !result.skipped) {
              console.warn("[line-webhook] ai booking intake failed:", result.error || result.reason || "unknown");
            }
          }).catch((e) => {
            console.warn("[line-webhook] ai booking intake failed:", e.message);
          });
          if (typeof handleAutoInternalTrainingFromWebhook === "function") {
            handleAutoInternalTrainingFromWebhook(pool, event, stored).then((result) => {
              if (result?.auto_answer?.id) console.log("[line-webhook] auto internal training drafted", { conversation_id: stored.conversation_id, auto_answer_id: result.auto_answer.id });
              else if (result && result.error) console.warn("[line-webhook] auto internal training failed:", result.error);
            }).catch((e) => {
              console.warn("[line-webhook] auto internal training failed:", e.message);
            });
          }
          if (typeof handleAutoSafeLineReplyFromWebhook === "function") {
            handleAutoSafeLineReplyFromWebhook(pool, event, stored).then((result) => {
              if (result?.sent) console.log("[line-webhook] auto safe reply sent", { conversation_id: stored.conversation_id, log_id: result.log_id });
              else if (result && result.error) console.warn("[line-webhook] auto safe reply failed:", result.error);
            }).catch((e) => {
              console.warn("[line-webhook] auto safe reply failed:", e.message);
            });
          }
        } catch (e) {
          console.warn("[line-webhook] store inbound event failed:", e.message);
        }
      }
    } catch (e) {
      console.warn("[line-webhook] safe error:", e.message);
      if (!res.headersSent) return res.status(500).json({ ok: false, error: "LINE webhook failed" });
    }
  });

  return router;
}

module.exports = {
  createLineWebhookRoutes,
  ensureLineInboxSchema,
  verifyLineSignature,
};
