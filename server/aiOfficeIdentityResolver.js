const PHONE_MIN_DIGITS = 6;

function cleanText(value, max = 2000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractPhoneHints(text) {
  const raw = String(text || "");
  const matches = raw.match(/(?:\+?66|0)?[\d\s().-]{7,}/g) || [];
  return unique(matches.map(onlyDigits).filter((digits) => digits.length >= PHONE_MIN_DIGITS).map((digits) => {
    if (digits.startsWith("66") && digits.length >= 11) return `0${digits.slice(2)}`;
    return digits;
  }));
}

function extractBookingHints(text) {
  const raw = String(text || "");
  const fromTracking = [];
  for (const m of raw.matchAll(/[?&]q=([A-Za-z0-9_-]{4,80})/g)) fromTracking.push(m[1]);
  const bookingLike = raw.match(/\b(?:CWF[-_ ]?)?[A-Z0-9]{5,20}\b/gi) || [];
  return unique([...fromTracking, ...bookingLike].map((v) => cleanText(v, 80).toUpperCase()));
}

async function ensureIdentitySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.line_customer_links (
      id BIGSERIAL PRIMARY KEY,
      line_user_id TEXT NOT NULL UNIQUE,
      conversation_id BIGINT REFERENCES public.line_conversations(id) ON DELETE SET NULL,
      customer_phone TEXT NULL,
      customer_name TEXT NULL,
      last_job_id TEXT NULL,
      match_source TEXT NOT NULL DEFAULT 'manual',
      confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
      verified_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
      verified_by TEXT NULL,
      verified_at TIMESTAMPTZ NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_customer_links_phone ON public.line_customer_links(customer_phone)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_line_customer_links_conversation ON public.line_customer_links(conversation_id)`);
}

async function loadConversation(pool, conversationId) {
  const r = await pool.query(
    `SELECT id, line_user_id, display_name, picture_url, last_message_text, last_message_type, last_message_at
     FROM public.line_conversations WHERE id=$1 LIMIT 1`,
    [conversationId]
  );
  return r.rows[0] || null;
}

async function loadRecentMessages(pool, conversationId, limit = 40) {
  const r = await pool.query(
    `SELECT id, direction, message_type, message_text, received_at, created_at
     FROM public.line_messages
     WHERE conversation_id=$1
     ORDER BY COALESCE(received_at, created_at) DESC
     LIMIT $2`,
    [conversationId, limit]
  );
  return (r.rows || []).reverse();
}

async function loadExistingLink(pool, lineUserId) {
  if (!lineUserId) return null;
  const r = await pool.query(
    `SELECT * FROM public.line_customer_links WHERE line_user_id=$1 LIMIT 1`,
    [lineUserId]
  );
  return r.rows[0] || null;
}

function mapJob(row) {
  return {
    job_id: row.job_id,
    booking_code: row.booking_code || null,
    customer_name: row.customer_name || "",
    customer_phone: row.customer_phone || "",
    job_type: row.job_type || "",
    appointment_datetime: row.appointment_datetime || null,
    job_status: row.job_status || "",
    payment_status: row.payment_status || "unpaid",
    job_price: Number(row.job_price || 0),
    address_text: row.address_text || "",
    job_zone: row.job_zone || "",
    technician_username: row.technician_username || "",
    technician_team: row.technician_team || "",
    created_at: row.created_at || null,
    finished_at: row.finished_at || null,
    paid_at: row.paid_at || null,
  };
}

async function findJobsByPhone(pool, digits, limit = 10) {
  if (!digits || String(digits).length < PHONE_MIN_DIGITS) return [];
  const r = await pool.query(
    `SELECT job_id, booking_code, customer_name, customer_phone, job_type, appointment_datetime,
            job_status, COALESCE(payment_status,'unpaid') AS payment_status, job_price, address_text,
            job_zone, technician_username, technician_team, created_at, finished_at, paid_at
     FROM public.jobs
     WHERE regexp_replace(COALESCE(customer_phone,''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
     ORDER BY COALESCE(appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
     LIMIT $2`,
    [onlyDigits(digits), limit]
  );
  return (r.rows || []).map(mapJob);
}

async function findJobsByBooking(pool, code, limit = 10) {
  const q = cleanText(code, 80);
  if (!q || q.length < 4) return [];
  const r = await pool.query(
    `SELECT job_id, booking_code, customer_name, customer_phone, job_type, appointment_datetime,
            job_status, COALESCE(payment_status,'unpaid') AS payment_status, job_price, address_text,
            job_zone, technician_username, technician_team, created_at, finished_at, paid_at
     FROM public.jobs
     WHERE UPPER(COALESCE(booking_code,'')) LIKE '%' || UPPER($1) || '%'
        OR CAST(job_id AS TEXT) = $1
     ORDER BY COALESCE(appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
     LIMIT $2`,
    [q, limit]
  );
  return (r.rows || []).map(mapJob);
}

function scoreCandidate({ source, jobs }) {
  if (!jobs || !jobs.length) return 0;
  if (source === "verified_link") return 1;
  if (source === "booking_code") return 0.95;
  if (source === "phone") return jobs.length === 1 ? 0.9 : 0.75;
  return 0.5;
}

async function findCustomerCandidates(pool, { conversationId, lineUserId, extraText = "" }) {
  await ensureIdentitySchema(pool);
  const conversation = conversationId ? await loadConversation(pool, conversationId) : null;
  const effectiveLineUserId = lineUserId || conversation?.line_user_id || "";
  const existing = await loadExistingLink(pool, effectiveLineUserId);
  const messages = conversationId ? await loadRecentMessages(pool, conversationId, 40) : [];
  const textBlob = [extraText, conversation?.last_message_text, ...messages.map((m) => m.message_text)].join("\n");

  const phoneHints = extractPhoneHints(textBlob);
  const bookingHints = extractBookingHints(textBlob);
  const candidates = [];

  if (existing?.customer_phone) {
    const jobs = await findJobsByPhone(pool, existing.customer_phone, 10);
    candidates.push({ source: "verified_link", confidence: 1, phone: existing.customer_phone, customer_name: existing.customer_name, linked: existing, jobs });
  }

  for (const phone of phoneHints.slice(0, 5)) {
    const jobs = await findJobsByPhone(pool, phone, 10);
    if (jobs.length) {
      candidates.push({ source: "phone", confidence: scoreCandidate({ source: "phone", jobs }), phone, customer_name: jobs[0]?.customer_name || "", jobs });
    }
  }

  for (const booking of bookingHints.slice(0, 5)) {
    const jobs = await findJobsByBooking(pool, booking, 10);
    if (jobs.length) {
      candidates.push({ source: "booking_code", confidence: scoreCandidate({ source: "booking_code", jobs }), booking_code: booking, phone: jobs[0]?.customer_phone || "", customer_name: jobs[0]?.customer_name || "", jobs });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const c of candidates) {
    const key = `${c.source}:${c.phone || c.booking_code || ""}:${c.jobs?.[0]?.job_id || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  return { conversation, line_user_id: effectiveLineUserId, existing_link: existing, phone_hints: phoneHints, booking_hints: bookingHints, candidates: deduped.slice(0, 10) };
}

async function linkLineCustomer(pool, payload) {
  await ensureIdentitySchema(pool);
  const conversationId = Number(payload.conversation_id || 0) || null;
  const conversation = conversationId ? await loadConversation(pool, conversationId) : null;
  const lineUserId = cleanText(payload.line_user_id || conversation?.line_user_id, 255);
  if (!lineUserId) throw new Error("LINE_USER_ID_REQUIRED");
  const phone = cleanText(payload.customer_phone, 80);
  const name = cleanText(payload.customer_name, 255);
  const jobId = cleanText(payload.last_job_id, 120);
  const verifiedBy = cleanText(payload.verified_by || "admin", 120);
  const notes = cleanText(payload.notes, 1000);
  const confidence = Math.max(0, Math.min(1, Number(payload.confidence ?? 1) || 1));

  const r = await pool.query(
    `INSERT INTO public.line_customer_links(
       line_user_id, conversation_id, customer_phone, customer_name, last_job_id,
       match_source, confidence, verified_by_admin, verified_by, verified_at, notes, updated_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,$8,NOW(),$9,NOW())
     ON CONFLICT(line_user_id) DO UPDATE SET
       conversation_id=COALESCE(EXCLUDED.conversation_id, public.line_customer_links.conversation_id),
       customer_phone=EXCLUDED.customer_phone,
       customer_name=EXCLUDED.customer_name,
       last_job_id=EXCLUDED.last_job_id,
       match_source=EXCLUDED.match_source,
       confidence=EXCLUDED.confidence,
       verified_by_admin=TRUE,
       verified_by=EXCLUDED.verified_by,
       verified_at=NOW(),
       notes=EXCLUDED.notes,
       updated_at=NOW()
     RETURNING *`,
    [lineUserId, conversationId, phone || null, name || null, jobId || null, "manual", confidence, verifiedBy, notes || null]
  );
  return r.rows[0];
}

async function loadLinkedCustomerContext(pool, { conversationId, lineUserId }) {
  await ensureIdentitySchema(pool);
  const conversation = conversationId ? await loadConversation(pool, conversationId) : null;
  const effectiveLineUserId = lineUserId || conversation?.line_user_id || "";
  const existing = await loadExistingLink(pool, effectiveLineUserId);
  const messages = conversationId ? await loadRecentMessages(pool, conversationId, 80) : [];
  const jobs = existing?.customer_phone ? await findJobsByPhone(pool, existing.customer_phone, 20) : [];
  return { conversation, link: existing, recent_messages: messages, jobs };
}

module.exports = {
  cleanText,
  onlyDigits,
  extractPhoneHints,
  extractBookingHints,
  ensureIdentitySchema,
  findCustomerCandidates,
  linkLineCustomer,
  loadLinkedCustomerContext,
  findJobsByPhone,
  findJobsByBooking,
};
