const express = require("express");
const crypto = require("crypto");
const https = require("https");
const { URLSearchParams } = require("url");
const {
  cleanText,
  onlyDigits,
  findCustomerCandidates,
  linkLineCustomer,
  loadLinkedCustomerContext,
  ensureIdentitySchema,
} = require("../aiOfficeIdentityResolver");
const { loadGithubStatus, loadRenderStatus, loadGoogleAdsLatest, loadLineSummary } = require("../aiOfficeConnectorContext");

function requestJson({ method = "GET", hostname, path, headers = {}, body = null, timeout = 15000 }) {
  return new Promise((resolve) => {
    const payload = body ? (typeof body === "string" ? body : JSON.stringify(body)) : null;
    const req = https.request({ method, hostname, path, headers: { ...headers, ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}) }, timeout }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (_) { parsed = { raw: data.slice(0, 3000) }; }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data: parsed });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, status: 0, error: error.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function requiredEnv(names) {
  const missing = names.filter((name) => !String(process.env[name] || "").trim());
  return { ready: missing.length === 0, missing };
}

function googleAdsRedirectUri(req) {
  return String(process.env.GOOGLE_ADS_REDIRECT_URI || `${req.protocol}://${req.get("host")}/admin/ai-office/google-ads/callback`).trim();
}

function createState() {
  return crypto.randomBytes(18).toString("hex");
}

async function storeGoogleToken(pool, tokenData) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.ai_office_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL UNIQUE,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    token_type TEXT NULL,
    scope TEXT NULL,
    expires_at TIMESTAMPTZ NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  const expiresAt = tokenData.expires_in ? new Date(Date.now() + Number(tokenData.expires_in) * 1000) : null;
  await pool.query(
    `INSERT INTO public.ai_office_oauth_tokens(provider, access_token, refresh_token, token_type, scope, expires_at, metadata, updated_at)
     VALUES('google_ads',$1,$2,$3,$4,$5,$6::jsonb,NOW())
     ON CONFLICT(provider) DO UPDATE SET
       access_token=EXCLUDED.access_token,
       refresh_token=COALESCE(EXCLUDED.refresh_token, public.ai_office_oauth_tokens.refresh_token),
       token_type=EXCLUDED.token_type,
       scope=EXCLUDED.scope,
       expires_at=EXCLUDED.expires_at,
       metadata=EXCLUDED.metadata,
       updated_at=NOW()`,
    [tokenData.access_token || null, tokenData.refresh_token || null, tokenData.token_type || null, tokenData.scope || null, expiresAt, JSON.stringify(tokenData)]
  );
}

async function loadGoogleRefreshToken(pool) {
  const envRefresh = String(process.env.GOOGLE_ADS_REFRESH_TOKEN || "").trim();
  if (envRefresh) return envRefresh;
  const r = await pool.query(`SELECT refresh_token FROM public.ai_office_oauth_tokens WHERE provider='google_ads' LIMIT 1`).catch(() => ({ rows: [] }));
  return String(r.rows?.[0]?.refresh_token || "").trim();
}

async function refreshGoogleAccessToken(pool) {
  const env = requiredEnv(["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET"]);
  if (!env.ready) throw new Error(`GOOGLE_ADS_ENV_MISSING:${env.missing.join(",")}`);
  const refreshToken = await loadGoogleRefreshToken(pool);
  if (!refreshToken) throw new Error("GOOGLE_ADS_REFRESH_TOKEN_MISSING");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const result = await requestJson({
    method: "POST",
    hostname: "oauth2.googleapis.com",
    path: "/token",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!result.ok) throw new Error(`GOOGLE_TOKEN_REFRESH_FAILED:${result.status}`);
  await storeGoogleToken(pool, { ...result.data, refresh_token: refreshToken });
  return result.data.access_token;
}

async function ensureGoogleAdsReportTable(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.ai_office_google_ads_daily (
    id BIGSERIAL PRIMARY KEY,
    customer_id TEXT NOT NULL,
    report_date DATE NOT NULL,
    campaign_id TEXT NULL,
    campaign_name TEXT NULL,
    ad_group_id TEXT NULL,
    ad_group_name TEXT NULL,
    search_term TEXT NULL,
    keyword_text TEXT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    cost_micros BIGINT NOT NULL DEFAULT 0,
    conversions NUMERIC(18,4) NOT NULL DEFAULT 0,
    source_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(customer_id, report_date, campaign_id, ad_group_id, search_term, keyword_text)
  )`);
}

async function syncGoogleAdsSearchTerms(pool, days = 14) {
  const env = requiredEnv(["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]);
  if (!env.ready) throw new Error(`GOOGLE_ADS_ENV_MISSING:${env.missing.join(",")}`);
  await ensureGoogleAdsReportTable(pool);
  const accessToken = await refreshGoogleAccessToken(pool);
  const version = String(process.env.GOOGLE_ADS_API_VERSION || "v24").trim();
  const customerId = onlyDigits(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = onlyDigits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "");
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      ad_group.id,
      ad_group.name,
      search_term_view.search_term,
      metrics.clicks,
      metrics.impressions,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_${Math.max(7, Math.min(30, Number(days) || 14))}_DAYS
    ORDER BY metrics.cost_micros DESC
    LIMIT 500
  `;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;
  const result = await requestJson({
    method: "POST",
    hostname: "googleads.googleapis.com",
    path: `/${version}/customers/${customerId}/googleAds:searchStream`,
    headers,
    body: { query },
    timeout: 30000,
  });
  if (!result.ok) throw new Error(`GOOGLE_ADS_SYNC_FAILED:${result.status}:${JSON.stringify(result.data).slice(0, 600)}`);

  const chunks = Array.isArray(result.data) ? result.data : [];
  let count = 0;
  for (const chunk of chunks) {
    const rows = Array.isArray(chunk.results) ? chunk.results : [];
    for (const row of rows) {
      const reportDate = row.segments?.date;
      const campaignId = String(row.campaign?.id || "");
      const adGroupId = String(row.adGroup?.id || "");
      const searchTerm = cleanText(row.searchTermView?.searchTerm, 1000);
      await pool.query(
        `INSERT INTO public.ai_office_google_ads_daily(
          customer_id, report_date, campaign_id, campaign_name, ad_group_id, ad_group_name, search_term,
          clicks, impressions, cost_micros, conversions, source_json, synced_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW())
        ON CONFLICT(customer_id, report_date, campaign_id, ad_group_id, search_term, keyword_text)
        DO UPDATE SET clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions, cost_micros=EXCLUDED.cost_micros,
          conversions=EXCLUDED.conversions, source_json=EXCLUDED.source_json, synced_at=NOW()`,
        [customerId, reportDate, campaignId, cleanText(row.campaign?.name, 500), adGroupId, cleanText(row.adGroup?.name, 500), searchTerm,
          Number(row.metrics?.clicks || 0), Number(row.metrics?.impressions || 0), Number(row.metrics?.costMicros || 0), Number(row.metrics?.conversions || 0), JSON.stringify(row)]
      );
      count += 1;
    }
  }
  return { synced_rows: count, api_version: version, customer_id: customerId };
}

function createAiOfficeConnectorRoutes({ pool, requireAdminSession }) {
  if (!pool) throw new Error("createAiOfficeConnectorRoutes requires pool");
  if (!requireAdminSession) throw new Error("createAiOfficeConnectorRoutes requires requireAdminSession");
  const router = express.Router();

  router.get("/admin/ai-office/connectors/status", requireAdminSession, async (req, res) => {
    try {
      await ensureIdentitySchema(pool);
      const lineEnv = requiredEnv(["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"]);
      const googleEnv = requiredEnv(["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]);
      const github = await loadGithubStatus();
      const render = await loadRenderStatus();
      const line = await loadLineSummary(pool).catch((e) => ({ error: e.message }));
      const googleRows = await loadGoogleAdsLatest(pool, 5).catch(() => []);
      return res.json({
        ok: true,
        connectors: {
          cwf_db: { connected: true },
          line: { connected: lineEnv.ready, missing_env: lineEnv.missing, summary: line },
          google_ads: { connected: googleEnv.ready && googleRows.length > 0, env_ready: googleEnv.ready, missing_env: googleEnv.missing, latest_rows: googleRows },
          github,
          render,
          openai: { connected: Boolean(String(process.env.OPENAI_API_KEY || "").trim()), model: process.env.AI_OFFICE_MODEL || null },
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/admin/ai-office/line/conversations/:id/identity", requireAdminSession, async (req, res) => {
    try {
      const result = await findCustomerCandidates(pool, { conversationId: Number(req.params.id), extraText: req.query.text || "" });
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/admin/ai-office/line/conversations/:id/context", requireAdminSession, async (req, res) => {
    try {
      const result = await loadLinkedCustomerContext(pool, { conversationId: Number(req.params.id) });
      return res.json({ ok: true, ...result });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post("/admin/ai-office/line/conversations/:id/link-customer", requireAdminSession, async (req, res) => {
    try {
      const result = await linkLineCustomer(pool, { ...req.body, conversation_id: Number(req.params.id), verified_by: req.session?.admin_username || req.user?.username || "admin" });
      return res.json({ ok: true, link: result });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  });

  router.get("/admin/ai-office/google-ads/auth", requireAdminSession, async (req, res) => {
    const env = requiredEnv(["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"]);
    if (!env.ready) return res.status(500).send(`Google Ads env missing: ${env.missing.join(", ")}`);
    const state = createState();
    req.session.aiOfficeGoogleAdsState = state;
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      redirect_uri: googleAdsRedirectUri(req),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/adwords",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  router.get("/admin/ai-office/google-ads/callback", requireAdminSession, async (req, res) => {
    try {
      if (!req.query.code) return res.status(400).send("Missing code");
      if (req.session?.aiOfficeGoogleAdsState && req.query.state !== req.session.aiOfficeGoogleAdsState) return res.status(400).send("Invalid OAuth state");
      const params = new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_ADS_CLIENT_ID,
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
        redirect_uri: googleAdsRedirectUri(req),
        grant_type: "authorization_code",
      });
      const result = await requestJson({ method: "POST", hostname: "oauth2.googleapis.com", path: "/token", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
      if (!result.ok) return res.status(500).send(`Google OAuth failed: ${result.status}`);
      await storeGoogleToken(pool, result.data);
      return res.send("Google Ads connected. You can close this tab and return to CWF AI Office.");
    } catch (e) {
      return res.status(500).send(e.message);
    }
  });

  router.post("/admin/ai-office/google-ads/sync", requireAdminSession, async (req, res) => {
    try {
      const result = await syncGoogleAdsSearchTerms(pool, req.body?.days || 14);
      return res.json({ ok: true, result });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/admin/ai-office/google-ads/report", requireAdminSession, async (req, res) => {
    try {
      const rows = await loadGoogleAdsLatest(pool, Math.min(200, Number(req.query.limit || 100)));
      return res.json({ ok: true, rows });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get("/admin/ai-office/dev/github/status", requireAdminSession, async (_req, res) => res.json({ ok: true, github: await loadGithubStatus() }));
  router.get("/admin/ai-office/dev/render/status", requireAdminSession, async (_req, res) => res.json({ ok: true, render: await loadRenderStatus() }));

  return router;
}

module.exports = { createAiOfficeConnectorRoutes, syncGoogleAdsSearchTerms };
