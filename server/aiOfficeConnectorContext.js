const https = require("https");
const { cleanText, loadLinkedCustomerContext } = require("./aiOfficeIdentityResolver");

function requestJson({ method = "GET", hostname, path, headers = {}, body = null, timeout = 8000 }) {
  return new Promise((resolve) => {
    const req = https.request({ method, hostname, path, headers, timeout }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { parsed = { raw: data.slice(0, 2000) }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, status: 0, error: error.message }));
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

async function loadJobBucket(pool, bucket, limit = 20) {
  const done = `(j.finished_at IS NOT NULL OR COALESCE(j.job_status,'') ILIKE '%ปิด%' OR COALESCE(j.job_status,'') ILIKE '%เสร็จ%' OR COALESCE(j.job_status,'') ILIKE '%done%' OR COALESCE(j.job_status,'') ILIKE '%closed%' OR COALESCE(j.job_status,'') ILIKE '%complete%')`;
  const canceled = `(j.canceled_at IS NOT NULL OR COALESCE(j.job_status,'') ILIKE '%ยกเลิก%' OR COALESCE(j.job_status,'') ILIKE '%cancel%')`;
  let where = `WHERE NOT ${canceled}`;
  if (bucket === "today") where += ` AND j.appointment_datetime IS NOT NULL AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = (NOW() AT TIME ZONE 'Asia/Bangkok')::date`;
  if (bucket === "tomorrow") where += ` AND j.appointment_datetime IS NOT NULL AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = ((NOW() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '1 day')`;
  if (bucket === "open") where += ` AND NOT ${done}`;
  if (bucket === "unpaid") where += ` AND NOT (COALESCE(j.payment_status,'unpaid')='paid' OR j.paid_at IS NOT NULL)`;
  const r = await pool.query(
    `SELECT j.job_id, j.booking_code, j.customer_name, j.customer_phone, j.job_type,
            j.appointment_datetime, j.job_status, COALESCE(j.payment_status,'unpaid') AS payment_status,
            j.job_price, j.address_text, j.job_zone, j.technician_username, j.technician_team,
            j.created_at, j.finished_at, j.paid_at
     FROM public.jobs j ${where}
     ORDER BY COALESCE(j.appointment_datetime, j.created_at) ASC NULLS LAST, j.job_id DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows || [];
}

async function loadLineSummary(pool) {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.line_conversations) AS conversations,
      (SELECT COUNT(*)::int FROM public.line_messages) AS messages,
      (SELECT COUNT(*)::int FROM public.line_customer_links WHERE verified_by_admin=TRUE) AS verified_links,
      (SELECT COUNT(*)::int FROM public.line_conversations c LEFT JOIN public.line_customer_links l ON l.line_user_id=c.line_user_id WHERE l.id IS NULL)::int AS unlinked_conversations
  `);
  return r.rows[0] || { conversations: 0, messages: 0, verified_links: 0, unlinked_conversations: 0 };
}

async function loadRecentLineInbox(pool, limit = 10) {
  const r = await pool.query(
    `SELECT c.id, c.line_user_id, c.display_name, c.picture_url, c.last_message_text, c.last_message_type,
            c.last_message_at, l.customer_phone, l.customer_name, l.verified_by_admin
     FROM public.line_conversations c
     LEFT JOIN public.line_customer_links l ON l.line_user_id=c.line_user_id
     ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows || [];
}

async function loadGoogleAdsLatest(pool, limit = 50) {
  const r = await pool.query(
    `SELECT report_date, campaign_name, ad_group_name, search_term, keyword_text,
            clicks, impressions, cost_micros, conversions, synced_at
     FROM public.ai_office_google_ads_daily
     ORDER BY report_date DESC, cost_micros DESC
     LIMIT $1`,
    [limit]
  ).catch(() => ({ rows: [] }));
  return r.rows || [];
}

async function loadGithubStatus() {
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  const repo = String(process.env.GITHUB_REPO_FULL_NAME || "coldwindflow/cwf-services-system").trim();
  if (!token || !repo) return { connected: false, repo, reason: "missing_env" };
  const result = await requestJson({
    hostname: "api.github.com",
    path: `/repos/${encodeURIComponent(repo).replace(/%2F/g, "/")}`,
    headers: { "User-Agent": "CWF-AI-Office", Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  return { connected: result.ok, repo, status: result.status, name: result.data?.full_name, default_branch: result.data?.default_branch, private: result.data?.private };
}

async function loadRenderStatus() {
  const key = String(process.env.RENDER_API_KEY || "").trim();
  const serviceId = String(process.env.RENDER_SERVICE_ID || "").trim();
  if (!key || !serviceId) return { connected: false, service_id: serviceId, reason: "missing_env" };
  const service = await requestJson({ hostname: "api.render.com", path: `/v1/services/${encodeURIComponent(serviceId)}`, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const deploys = await requestJson({ hostname: "api.render.com", path: `/v1/services/${encodeURIComponent(serviceId)}/deploys?limit=1`, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  return { connected: service.ok, service_status: service.status, service: service.data, latest_deploy_status: deploys.status, latest_deploy: Array.isArray(deploys.data) ? deploys.data[0] : deploys.data };
}

async function buildAiOfficeAgentContext({ pool, agent, body = {} }) {
  const key = String(agent || "admin").toLowerCase();
  const context = { connector_context_version: "identity-v2", agent: key, readonly: true };

  if (["admin", "sales", "ops"].includes(key)) {
    context.line = { summary: await loadLineSummary(pool).catch((e) => ({ error: e.message })), inbox: await loadRecentLineInbox(pool, 12).catch(() => []) };
  }
  if (body.conversation_id && ["admin", "sales", "ops"].includes(key)) {
    context.line_customer_context = await loadLinkedCustomerContext(pool, { conversationId: Number(body.conversation_id) }).catch((e) => ({ error: e.message }));
  }
  if (key === "ops" || key === "admin") {
    context.jobs = {
      today: await loadJobBucket(pool, "today", 20).catch(() => []),
      tomorrow: await loadJobBucket(pool, "tomorrow", 20).catch(() => []),
      open: await loadJobBucket(pool, "open", 20).catch(() => []),
      unpaid: await loadJobBucket(pool, "unpaid", 20).catch(() => []),
    };
  }
  if (key === "sales") {
    context.jobs = { open: await loadJobBucket(pool, "open", 15).catch(() => []), unpaid: await loadJobBucket(pool, "unpaid", 15).catch(() => []) };
  }
  if (key === "ads") {
    context.google_ads = { latest_rows: await loadGoogleAdsLatest(pool, 50).catch(() => []), env_ready: Boolean(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID) };
    context.jobs = { recent_open: await loadJobBucket(pool, "open", 20).catch(() => []) };
  }
  if (key === "content") {
    context.line = { summary: await loadLineSummary(pool).catch((e) => ({ error: e.message })) };
    context.jobs = { recently_closed_or_open: await loadJobBucket(pool, "open", 20).catch(() => []) };
  }
  if (key === "dev") {
    context.github = await loadGithubStatus();
    context.render = await loadRenderStatus();
  }
  return context;
}

module.exports = { buildAiOfficeAgentContext, loadGithubStatus, loadRenderStatus, loadGoogleAdsLatest, loadLineSummary, loadRecentLineInbox };
