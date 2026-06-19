"use strict";

const crypto = require("crypto");
const express = require("express");
const { OAuth2Client } = require("google-auth-library");

const SESSION_COOKIE = "cwf_token";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;
const OAUTH_MAX_AGE_SEC = OAUTH_MAX_AGE_MS / 1000;
const LINE_STATE_COOKIE = "cwf_oauth_line";
const GOOGLE_STATE_COOKIE = "cwf_oauth_google";
const CUSTOMER_ROUTE_ALLOWLIST = [
  /^\/customer-app(?:\/|\?|$)/,
  /^\/customer(?:\.html)?(?:\?|$)/,
  /^\/track(?:\.html)?(?:\?|$)/,
];

const defaultOAuthStore = createMemoryOAuthStore();

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function b64urlEncode(input) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBuffer(str) {
  const s = clean(str).replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64");
}

function randomUrlToken(bytes = 32) {
  return b64urlEncode(crypto.randomBytes(bytes));
}

function sha256Base64Url(value) {
  return b64urlEncode(crypto.createHash("sha256").update(String(value)).digest());
}

function jwtSign(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac("sha256", String(secret)).update(data).digest();
  return `${data}.${b64urlEncode(sig)}`;
}

function jwtVerify(token, secret) {
  const parts = clean(token).split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac("sha256", String(secret)).update(data).digest();
  const got = b64urlDecodeToBuffer(s);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(p).toString("utf8"));
  } catch (_) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload && payload.exp && now > Number(payload.exp)) return null;
  return payload || null;
}

function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    let val = part.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (!key) return;
    try { val = decodeURIComponent(val); } catch (_) {}
    out[key] = val;
  });
  return out;
}

function parseCookieValue(req, name) {
  return parseCookies(req.headers?.cookie || "")[name] || null;
}

function appendSetCookie(res, cookieStr) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) return res.setHeader("Set-Cookie", cookieStr);
  if (Array.isArray(prev)) return res.setHeader("Set-Cookie", [...prev, cookieStr]);
  return res.setHeader("Set-Cookie", [prev, cookieStr]);
}

function setCookie(res, name, value, opts = {}) {
  const maxAgeSec = Number(opts.maxAgeSec || SESSION_MAX_AGE_SEC);
  const sameSite = opts.sameSite || "Lax";
  const pathVal = opts.path || "/";
  const encoded = encodeURIComponent(String(value));
  let cookie = `${name}=${encoded}; Max-Age=${maxAgeSec}; Path=${pathVal}; SameSite=${sameSite}`;
  if (opts.httpOnly !== false) cookie += "; HttpOnly";
  if (opts.secure) cookie += "; Secure";
  appendSetCookie(res, cookie);
}

function clearCookie(res, name) {
  appendSetCookie(res, `${name}=; Max-Age=0; Path=/; SameSite=Lax`);
  appendSetCookie(res, `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure`);
}

function getReqBaseUrl(req) {
  const xfProto = clean(req.headers["x-forwarded-proto"]).split(",")[0].trim();
  const proto = xfProto || req.protocol || "http";
  return `${proto}://${req.get("host")}`;
}

function isHttpsReq(req) {
  const xfProto = clean(req.headers["x-forwarded-proto"]).split(",")[0].trim();
  return xfProto ? xfProto === "https" : req.protocol === "https";
}

function safeReturnTo(value, fallback = "/customer-app/") {
  const raw = clean(value);
  if (!raw) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return fallback;
  if (!raw.startsWith("/")) return fallback;
  return CUSTOMER_ROUTE_ALLOWLIST.some((pattern) => pattern.test(raw)) ? raw : fallback;
}

function callbackUrl(req, provider, env = process.env) {
  if (provider === "line") {
    const lineV2 = clean(env.LINE_V2_CALLBACK_URL || env.LINE_CUSTOMER_V2_CALLBACK_URL);
    return lineV2 || `${getReqBaseUrl(req)}/auth/line/v2/callback`;
  }
  const google = clean(env.GOOGLE_CALLBACK_URL || env.GOOGLE_OAUTH_CALLBACK_URL);
  return google || `${getReqBaseUrl(req)}/auth/google/callback`;
}

function isUsableCallbackUrl(url, req) {
  const raw = clean(url);
  if (!raw) return false;
  if (raw.startsWith("https://")) return true;
  return raw.startsWith(`${getReqBaseUrl(req)}/`) && isHttpsReq(req);
}

function baseProviderConfig(env = process.env) {
  const lineClientId = clean(env.LINE_CHANNEL_ID || env.LINE_CLIENT_ID);
  const lineClientSecret = clean(env.LINE_CHANNEL_SECRET || env.LINE_CLIENT_SECRET);
  const googleClientId = clean(env.GOOGLE_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = clean(env.GOOGLE_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET);
  return {
    line: { clientId: lineClientId, clientSecret: lineClientSecret },
    google: { clientId: googleClientId, clientSecret: googleClientSecret },
    jwtSecret: clean(env.CWF_JWT_SECRET || env.JWT_SECRET),
  };
}

function createMemoryOAuthStore(nowFn = () => Date.now()) {
  const map = new Map();
  return {
    put(ctx) {
      const id = randomUrlToken(32);
      map.set(id, { ...ctx, stateId: id, createdAt: nowFn(), expiresAt: nowFn() + OAUTH_MAX_AGE_MS });
      return id;
    },
    consume(id) {
      const key = clean(id);
      const ctx = map.get(key);
      if (!ctx) return { ok: false, reason: "missing_state" };
      map.delete(key);
      if (Number(ctx.expiresAt || 0) < nowFn()) return { ok: false, reason: "expired_state" };
      return { ok: true, ctx };
    },
    peek(id) {
      return map.get(clean(id)) || null;
    },
    clear() {
      map.clear();
    },
    _map: map,
  };
}

function currentCustomer(req, jwtSecret) {
  const token = parseCookieValue(req, SESSION_COOKIE);
  return token && jwtSecret ? jwtVerify(token, jwtSecret) : null;
}

function issueCustomerSession(res, customer, jwtSecret, secureCookie) {
  const now = Math.floor(Date.now() / 1000);
  const providers = Array.isArray(customer.linked_providers) ? customer.linked_providers : [customer.provider].filter(Boolean);
  const payload = {
    sub: clean(customer.customer_sub),
    provider: clean(customer.provider || providers[0] || ""),
    provider_sub: clean(customer.provider_subject || ""),
    name: clean(customer.display_name || customer.name || "ลูกค้า CWF"),
    picture: clean(customer.picture_url || customer.picture || ""),
    email: clean(customer.email || ""),
    email_verified: !!customer.email_verified,
    linked_providers: providers,
    iat: now,
    exp: now + SESSION_MAX_AGE_SEC,
  };
  setCookie(res, SESSION_COOKIE, jwtSign(payload, jwtSecret), { maxAgeSec: SESSION_MAX_AGE_SEC, secure: secureCookie });
  return payload;
}

async function schemaReady(pool) {
  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.customer_identities') IS NOT NULL AS has_identities,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='customer_profiles' AND column_name='email'
        ) AS has_email,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='customer_profiles' AND column_name='email_verified'
        ) AS has_email_verified
    `);
    const row = result.rows && result.rows[0] ? result.rows[0] : {};
    return !!(row.has_identities && row.has_email && row.has_email_verified);
  } catch (_) {
    return false;
  }
}

async function providerAvailability({ pool, req, env }) {
  const cfg = baseProviderConfig(env);
  const ready = await schemaReady(pool);
  const lineCallback = callbackUrl(req, "line", env);
  const googleCallback = callbackUrl(req, "google", env);
  return {
    line: {
      clientId: cfg.line.clientId,
      clientSecret: cfg.line.clientSecret,
      callback: lineCallback,
      available: !!(cfg.line.clientId && cfg.line.clientSecret && cfg.jwtSecret && ready && isUsableCallbackUrl(lineCallback, req)),
    },
    google: {
      clientId: cfg.google.clientId,
      clientSecret: cfg.google.clientSecret,
      callback: googleCallback,
      available: !!(cfg.google.clientId && cfg.google.clientSecret && cfg.jwtSecret && ready && isUsableCallbackUrl(googleCallback, req)),
    },
    jwtSecret: cfg.jwtSecret,
    schemaReady: ready,
  };
}

async function findProfile(pool, customerSub) {
  const r = await pool.query(
    `SELECT sub, provider, display_name, picture_url, phone, address, maps_url, email, email_verified
       FROM public.customer_profiles WHERE sub=$1 LIMIT 1`,
    [customerSub]
  );
  return r.rows && r.rows[0] ? r.rows[0] : null;
}

async function linkedProviders(pool, customerSub) {
  const r = await pool.query(
    `SELECT provider FROM public.customer_identities WHERE customer_sub=$1 ORDER BY provider`,
    [customerSub]
  );
  return (r.rows || []).map((row) => row.provider).filter(Boolean);
}

async function ensureProfile(pool, identity) {
  await pool.query(
    `INSERT INTO public.customer_profiles
       (sub, provider, display_name, picture_url, email, email_verified, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (sub)
     DO UPDATE SET
       provider=COALESCE(public.customer_profiles.provider, EXCLUDED.provider),
       display_name=COALESCE(NULLIF(public.customer_profiles.display_name,''), EXCLUDED.display_name),
       picture_url=COALESCE(NULLIF(public.customer_profiles.picture_url,''), EXCLUDED.picture_url),
       email=COALESCE(NULLIF(public.customer_profiles.email,''), EXCLUDED.email),
       email_verified=(COALESCE(public.customer_profiles.email_verified, FALSE) OR EXCLUDED.email_verified),
       updated_at=NOW()`,
    [
      identity.customer_sub,
      identity.provider,
      identity.display_name || null,
      identity.picture_url || null,
      identity.email || null,
      !!identity.email_verified,
    ]
  );
}

async function upsertIdentity(pool, identity) {
  await ensureProfile(pool, identity);
  await pool.query(
    `INSERT INTO public.customer_identities
       (customer_sub, provider, provider_subject, email, email_verified, display_name, picture_url, linked_at, last_login_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
     ON CONFLICT (provider, provider_subject)
     DO UPDATE SET
       email=EXCLUDED.email,
       email_verified=EXCLUDED.email_verified,
       display_name=EXCLUDED.display_name,
       picture_url=EXCLUDED.picture_url,
       last_login_at=NOW()`,
    [
      identity.customer_sub,
      identity.provider,
      identity.provider_subject,
      identity.email || null,
      !!identity.email_verified,
      identity.display_name || null,
      identity.picture_url || null,
    ]
  );
}

async function resolveCustomerForIdentity(pool, identity, loggedInCustomer) {
  const existing = await pool.query(
    `SELECT customer_sub FROM public.customer_identities WHERE provider=$1 AND provider_subject=$2 LIMIT 1`,
    [identity.provider, identity.provider_subject]
  );
  const existingSub = existing.rows?.[0]?.customer_sub || "";
  if (existingSub) {
    if (loggedInCustomer?.sub && loggedInCustomer.sub !== existingSub) {
      return { error: "PROVIDER_ALREADY_LINKED", customerSub: existingSub };
    }
    return { customerSub: existingSub, mode: "existing_identity" };
  }
  if (loggedInCustomer?.sub) return { customerSub: loggedInCustomer.sub, mode: "linked_to_session" };
  if (identity.provider === "line") {
    const legacySub = `line:${identity.provider_subject}`;
    const legacy = await findProfile(pool, legacySub);
    if (legacy) return { customerSub: legacySub, mode: "legacy_line_profile" };
  }
  if (identity.email && identity.email_verified) {
    const emailMatch = await pool.query(
      `SELECT sub FROM public.customer_profiles
        WHERE lower(email)=lower($1) AND email_verified=TRUE
        LIMIT 2`,
      [identity.email]
    );
    if ((emailMatch.rows || []).length === 1) return { customerSub: emailMatch.rows[0].sub, mode: "verified_email_match" };
    if ((emailMatch.rows || []).length > 1) return { customerSub: `${identity.provider}:${identity.provider_subject}`, mode: "ambiguous_email_new_customer" };
  }
  return { customerSub: `${identity.provider}:${identity.provider_subject}`, mode: "new_customer" };
}

async function completeProviderLogin({ pool, identity, loggedInCustomer }) {
  const resolved = await resolveCustomerForIdentity(pool, identity, loggedInCustomer);
  if (resolved.error) return resolved;
  const fullIdentity = { ...identity, customer_sub: resolved.customerSub };
  await upsertIdentity(pool, fullIdentity);
  const profile = await findProfile(pool, resolved.customerSub);
  const providers = await linkedProviders(pool, resolved.customerSub);
  return {
    mode: resolved.mode,
    customer: {
      customer_sub: resolved.customerSub,
      provider: identity.provider,
      provider_subject: identity.provider_subject,
      display_name: profile?.display_name || identity.display_name,
      picture_url: profile?.picture_url || identity.picture_url,
      email: profile?.email || identity.email,
      email_verified: profile?.email_verified || identity.email_verified,
      linked_providers: providers.length ? providers : [identity.provider],
    },
  };
}

async function exchangeLineCode({ fetchImpl, code, redirectUri, clientId, clientSecret, codeVerifier }) {
  const res = await fetchImpl("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: codeVerifier }),
  });
  const text = await res.text().catch(() => "");
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok) throw Object.assign(new Error("LINE_TOKEN_EXCHANGE_FAILED"), { status: res.status, body: text });
  return json;
}

async function verifyLineIdToken({ fetchImpl, idToken, clientId, nonce }) {
  const res = await fetchImpl("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  const text = await res.text().catch(() => "");
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok) throw Object.assign(new Error("LINE_ID_TOKEN_INVALID"), { status: res.status, body: text });
  if (clean(json.nonce) !== clean(nonce)) throw new Error("LINE_NONCE_MISMATCH");
  const sub = clean(json.sub);
  if (!sub) throw new Error("LINE_SUB_MISSING");
  return {
    provider: "line",
    provider_subject: sub,
    display_name: clean(json.name) || "LINE User",
    picture_url: clean(json.picture),
    email: clean(json.email).toLowerCase(),
    email_verified: !!json.email,
  };
}

async function exchangeGoogleCode({ fetchImpl, code, redirectUri, clientId, clientSecret, codeVerifier }) {
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret, code_verifier: codeVerifier }),
  });
  const text = await res.text().catch(() => "");
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) {}
  if (!res.ok) throw Object.assign(new Error("GOOGLE_TOKEN_EXCHANGE_FAILED"), { status: res.status, body: text });
  return json;
}

async function verifyGoogleIdToken({ idToken, clientId, nonce, oauthClient }) {
  const client = oauthClient || new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  return googleIdentityFromPayload(ticket.getPayload(), clientId, nonce);
}

function googleIdentityFromPayload(payload, clientId, nonce, now = Math.floor(Date.now() / 1000)) {
  if (!payload || typeof payload !== "object") throw new Error("GOOGLE_PAYLOAD_MISSING");
  if (!clean(payload.sub)) throw new Error("GOOGLE_SUB_MISSING");
  if (!["https://accounts.google.com", "accounts.google.com"].includes(payload.iss)) throw new Error("GOOGLE_ISS_INVALID");
  if (payload.aud !== clientId) throw new Error("GOOGLE_AUD_INVALID");
  if (payload.exp && now > Number(payload.exp)) throw new Error("GOOGLE_TOKEN_EXPIRED");
  if (payload.nonce !== nonce) throw new Error("GOOGLE_NONCE_MISMATCH");
  if (payload.email && payload.email_verified !== true) throw new Error("GOOGLE_EMAIL_NOT_VERIFIED");
  return {
    provider: "google",
    provider_subject: clean(payload.sub),
    display_name: clean(payload.name) || clean(payload.email) || "Google User",
    picture_url: clean(payload.picture),
    email: clean(payload.email).toLowerCase(),
    email_verified: payload.email_verified === true,
  };
}

function authErrorRedirect(provider, reason, returnTo) {
  const url = new URL(returnTo, "https://local.invalid");
  url.searchParams.set("auth", "failed");
  url.searchParams.set("provider", provider);
  url.searchParams.set("reason", reason);
  return `${url.pathname}${url.search}${url.hash}`;
}

function authSuccessRedirect(provider, returnTo, linked) {
  const url = new URL(returnTo, "https://local.invalid");
  url.searchParams.set("auth", linked ? "linked" : "success");
  url.searchParams.set("provider", provider);
  return `${url.pathname}${url.search}${url.hash}`;
}

function getStore(deps) {
  return deps.oauthStore || defaultOAuthStore;
}

function createStartHandler(provider, deps) {
  return async (req, res) => {
    const availability = await providerAvailability({ pool: deps.pool, req, env: deps.env });
    const providerCfg = availability[provider];
    const returnTo = safeReturnTo(req.query?.returnTo || req.query?.next);
    if (!providerCfg.available) return res.redirect(authErrorRedirect(provider, "provider_unavailable", returnTo));
    const verifier = randomUrlToken(48);
    const state = randomUrlToken(32);
    const nonce = randomUrlToken(32);
    const current = currentCustomer(req, availability.jwtSecret);
    const stateId = getStore(deps).put({
      provider,
      state,
      nonce,
      codeVerifier: verifier,
      returnTo,
      linkCustomerSub: current?.sub || "",
    });
    const redirectUri = callbackUrl(req, provider, deps.env);
    setCookie(res, provider === "line" ? LINE_STATE_COOKIE : GOOGLE_STATE_COOKIE, stateId, {
      maxAgeSec: OAUTH_MAX_AGE_SEC,
      secure: redirectUri.startsWith("https://") || isHttpsReq(req),
    });
    const authorize = new URL(provider === "line" ? "https://access.line.me/oauth2/v2.1/authorize" : "https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", providerCfg.clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("scope", provider === "line" ? "openid profile email" : "openid email profile");
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("code_challenge", sha256Base64Url(verifier));
    authorize.searchParams.set("code_challenge_method", "S256");
    if (provider === "google") authorize.searchParams.set("prompt", "select_account");
    return res.redirect(authorize.toString());
  };
}

function createCallbackHandler(provider, deps) {
  return async (req, res) => {
    const cookieName = provider === "line" ? LINE_STATE_COOKIE : GOOGLE_STATE_COOKIE;
    const stateId = parseCookieValue(req, cookieName);
    const consumed = getStore(deps).consume(stateId);
    const ctx = consumed.ctx || null;
    const returnTo = safeReturnTo(ctx?.returnTo);
    clearCookie(res, cookieName);
    try {
      if (req.query?.error) return res.redirect(authErrorRedirect(provider, clean(req.query.error), returnTo));
      if (!consumed.ok) return res.redirect(authErrorRedirect(provider, consumed.reason, returnTo));
      if (!ctx || ctx.provider !== provider) return res.redirect(authErrorRedirect(provider, "invalid_state", returnTo));
      if (!clean(req.query?.state) || clean(req.query.state) !== ctx.state) return res.redirect(authErrorRedirect(provider, "invalid_state", returnTo));
      if (!clean(req.query?.code)) return res.redirect(authErrorRedirect(provider, "missing_code", returnTo));

      const availability = await providerAvailability({ pool: deps.pool, req, env: deps.env });
      const providerCfg = availability[provider];
      if (!providerCfg.available) return res.redirect(authErrorRedirect(provider, "provider_unavailable", returnTo));

      let loggedInCustomer = null;
      if (ctx.linkCustomerSub) {
        const current = currentCustomer(req, availability.jwtSecret);
        if (!current?.sub) return res.redirect(authErrorRedirect(provider, "link_session_missing", returnTo));
        if (current.sub !== ctx.linkCustomerSub) return res.redirect(authErrorRedirect(provider, "link_session_changed", returnTo));
        loggedInCustomer = current;
      }

      const redirectUri = callbackUrl(req, provider, deps.env);
      const fetchImpl = deps.fetchImpl || fetch;
      const tokens = provider === "line"
        ? await (deps.exchangeLineCode || exchangeLineCode)({ fetchImpl, code: clean(req.query.code), redirectUri, clientId: providerCfg.clientId, clientSecret: providerCfg.clientSecret, codeVerifier: ctx.codeVerifier })
        : await (deps.exchangeGoogleCode || exchangeGoogleCode)({ fetchImpl, code: clean(req.query.code), redirectUri, clientId: providerCfg.clientId, clientSecret: providerCfg.clientSecret, codeVerifier: ctx.codeVerifier });
      const idToken = clean(tokens.id_token);
      if (!idToken) return res.redirect(authErrorRedirect(provider, "missing_id_token", returnTo));
      const identity = provider === "line"
        ? await (deps.verifyLineIdToken || verifyLineIdToken)({ fetchImpl, idToken, clientId: providerCfg.clientId, nonce: ctx.nonce })
        : await (deps.verifyGoogleIdToken || verifyGoogleIdToken)({ idToken, clientId: providerCfg.clientId, nonce: ctx.nonce, oauthClient: deps.googleOAuthClient });
      if (!identity.provider_subject) return res.redirect(authErrorRedirect(provider, "missing_provider_subject", returnTo));
      const result = await completeProviderLogin({ pool: deps.pool, identity, loggedInCustomer });
      if (result.error === "PROVIDER_ALREADY_LINKED") return res.redirect(authErrorRedirect(provider, "account_already_linked", returnTo));
      issueCustomerSession(res, result.customer, availability.jwtSecret, redirectUri.startsWith("https://") || isHttpsReq(req));
      return res.redirect(authSuccessRedirect(provider, returnTo, result.mode === "linked_to_session"));
    } catch (e) {
      if (deps.logger) deps.logger.error(`[CUSTOMER_${provider.toUpperCase()}_AUTH]`, e);
      return res.redirect(authErrorRedirect(provider, "server", returnTo));
    }
  };
}

async function ensureCustomerAuthSchema(pool) {
  await pool.query(`ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE public.customer_profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.customer_identities (
      identity_id BIGSERIAL PRIMARY KEY,
      customer_sub TEXT NOT NULL REFERENCES public.customer_profiles(sub) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email TEXT,
      email_verified BOOLEAN DEFAULT FALSE,
      display_name TEXT,
      picture_url TEXT,
      linked_at TIMESTAMPTZ DEFAULT NOW(),
      last_login_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(provider, provider_subject)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_identities_customer_sub ON public.customer_identities(customer_sub)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_profiles_verified_email ON public.customer_profiles(lower(email)) WHERE email_verified=TRUE`);
}

function createCustomerAuthRoutes(deps) {
  const router = express.Router();
  router.get("/auth/line/start", createStartHandler("line", deps));
  router.get("/auth/line/v2/callback", createCallbackHandler("line", deps));
  router.get("/auth/google/start", createStartHandler("google", deps));
  router.get("/auth/google/callback", createCallbackHandler("google", deps));
  router.get("/public/auth/config", async (req, res) => {
    const availability = await providerAvailability({ pool: deps.pool, req, env: deps.env });
    const returnTo = safeReturnTo(req.query?.returnTo);
    res.json({
      ok: true,
      schema_ready: availability.schemaReady,
      providers: {
        line: { available: availability.line.available, start_url: `/auth/line/start?returnTo=${encodeURIComponent(returnTo)}` },
        google: { available: availability.google.available, start_url: `/auth/google/start?returnTo=${encodeURIComponent(returnTo)}` },
      },
    });
  });
  router.post("/public/logout", (req, res) => {
    clearCookie(res, SESSION_COOKIE);
    clearCookie(res, LINE_STATE_COOKIE);
    clearCookie(res, GOOGLE_STATE_COOKIE);
    res.json({ ok: true });
  });
  return router;
}

module.exports = {
  SESSION_COOKIE,
  LINE_STATE_COOKIE,
  GOOGLE_STATE_COOKIE,
  safeReturnTo,
  baseProviderConfig,
  providerAvailability,
  schemaReady,
  b64urlEncode,
  b64urlDecodeToBuffer,
  jwtSign,
  jwtVerify,
  sha256Base64Url,
  createMemoryOAuthStore,
  verifyGoogleIdToken,
  googleIdentityFromPayload,
  verifyLineIdToken,
  resolveCustomerForIdentity,
  completeProviderLogin,
  ensureCustomerAuthSchema,
  createCustomerAuthRoutes,
};
