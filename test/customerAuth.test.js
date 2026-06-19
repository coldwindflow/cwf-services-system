const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const customerAuth = require("../server/customerAuth");

const READY_ENV = {
  CWF_JWT_SECRET: "secret",
  LINE_CHANNEL_ID: "line-id",
  LINE_CHANNEL_SECRET: "line-secret",
  LINE_V2_CALLBACK_URL: "https://app.cwf-air.com/auth/line/v2/callback",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  GOOGLE_CALLBACK_URL: "https://app.cwf-air.com/auth/google/callback",
};

function makePool({ identities = [], profiles = [], schemaReady = true } = {}) {
  const state = { identities: identities.map((x) => ({ ...x })), profiles: profiles.map((x) => ({ ...x })), queries: [], schemaReady };
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params });
      if (/to_regclass\('public\.customer_identities'\)/.test(sql)) {
        return { rows: [{ has_identities: state.schemaReady, has_email: state.schemaReady, has_email_verified: state.schemaReady }] };
      }
      if (/FROM public\.customer_identities WHERE provider=\$1 AND provider_subject=\$2/.test(sql)) {
        return { rows: state.identities.filter((x) => x.provider === params[0] && x.provider_subject === params[1]).slice(0, 1) };
      }
      if (/FROM public\.customer_identities WHERE customer_sub=\$1/.test(sql)) {
        return { rows: state.identities.filter((x) => x.customer_sub === params[0]).map((x) => ({ provider: x.provider })) };
      }
      if (/FROM public\.customer_profiles WHERE sub=\$1/.test(sql)) {
        return { rows: state.profiles.filter((x) => x.sub === params[0]).slice(0, 1) };
      }
      if (/FROM public\.customer_profiles\s+WHERE lower\(email\)=lower\(\$1\)/.test(sql)) {
        return { rows: state.profiles.filter((x) => String(x.email || "").toLowerCase() === String(params[0]).toLowerCase() && x.email_verified).slice(0, 2) };
      }
      if (/INSERT INTO public\.customer_profiles/.test(sql)) {
        const next = { sub: params[0], provider: params[1], display_name: params[2], picture_url: params[3], email: params[4], email_verified: params[5] };
        const found = state.profiles.find((x) => x.sub === next.sub);
        if (found) Object.assign(found, { ...next, phone: found.phone, address: found.address, maps_url: found.maps_url });
        else state.profiles.push(next);
        return { rows: [] };
      }
      if (/INSERT INTO public\.customer_identities/.test(sql)) {
        const next = { customer_sub: params[0], provider: params[1], provider_subject: params[2], email: params[3], email_verified: params[4], display_name: params[5], picture_url: params[6] };
        const found = state.identities.find((x) => x.provider === next.provider && x.provider_subject === next.provider_subject);
        if (found) Object.assign(found, next);
        else state.identities.push(next);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

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

function makeRouter({ pool = makePool(), env = READY_ENV, store = customerAuth.createMemoryOAuthStore(), exchangeGoogleCode, verifyGoogleIdToken, exchangeLineCode, verifyLineIdToken } = {}) {
  return customerAuth.createCustomerAuthRoutes({
    pool,
    env,
    oauthStore: store,
    exchangeGoogleCode: exchangeGoogleCode || (async () => ({ id_token: "google-token" })),
    verifyGoogleIdToken: verifyGoogleIdToken || (async () => ({ provider: "google", provider_subject: "g1", display_name: "Google User", email: "g@example.com", email_verified: true })),
    exchangeLineCode: exchangeLineCode || (async () => ({ id_token: "line-token" })),
    verifyLineIdToken: verifyLineIdToken || (async () => ({ provider: "line", provider_subject: "line-v2", display_name: "Line User" })),
  });
}

function cookieValue(setCookie, name) {
  const match = String(setCookie || "").match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

async function startFlow(base, provider, cookieName, cookie = "") {
  const res = await fetch(`${base}/auth/${provider}/start?returnTo=/customer-app/?view=profile`, {
    redirect: "manual",
    headers: cookie ? { cookie } : undefined,
  });
  const state = new URL(res.headers.get("location")).searchParams.get("state");
  const stateId = cookieValue(res.headers.get("set-cookie"), cookieName);
  return { res, state, stateId, cookie: `${cookieName}=${encodeURIComponent(stateId)}` };
}

test("safeReturnTo accepts Customer App routes and rejects open redirects", () => {
  assert.equal(customerAuth.safeReturnTo("/customer-app/?view=profile"), "/customer-app/?view=profile");
  assert.equal(customerAuth.safeReturnTo("/track.html?q=CWF123"), "/track.html?q=CWF123");
  assert.equal(customerAuth.safeReturnTo("https://evil.example/customer-app/"), "/customer-app/");
  assert.equal(customerAuth.safeReturnTo("//evil.example/customer-app/"), "/customer-app/");
  assert.equal(customerAuth.safeReturnTo("/admin/super-v2.html"), "/customer-app/");
});

test("legacy /auth/line remains owned by legacy route and returns customer.html", async () => {
  const app = express();
  app.use(makeRouter());
  app.get("/auth/line", (req, res) => res.redirect("/customer.html?legacy=1"));
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/auth/line`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/customer.html?legacy=1");
  });
});

test("V2 /auth/line/start creates PKCE state and returns to V2 callback", async () => {
  await withServer(makeRouter(), async (base) => {
    const started = await startFlow(base, "line", customerAuth.LINE_STATE_COOKIE);
    assert.equal(started.res.status, 302);
    const location = started.res.headers.get("location");
    assert.match(location, /^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/);
    assert.match(location, /code_challenge=/);
    assert.match(location, /nonce=/);
    assert.match(location, /redirect_uri=https%3A%2F%2Fapp\.cwf-air\.com%2Fauth%2Fline%2Fv2%2Fcallback/);
  });
});

test("Google start creates state and nonce", async () => {
  await withServer(makeRouter(), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE);
    assert.equal(started.res.status, 302);
    const location = started.res.headers.get("location");
    assert.match(location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    assert.match(location, /scope=openid\+email\+profile/);
    assert.match(location, /nonce=/);
  });
});

test("legacy /public/me response remains compatible when router is mounted first", async () => {
  const app = express();
  app.use(makeRouter());
  app.get("/public/me", (req, res) => res.json({ logged_in: false }));
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/public/me`);
    assert.deepEqual(await res.json(), { logged_in: false });
  });
});

test("legacy GET logout behavior remains compatible", async () => {
  const app = express();
  app.use(makeRouter());
  app.get("/public/logout", (req, res) => res.redirect("/customer.html?logout=1"));
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/public/logout`, { redirect: "manual" });
    assert.equal(res.headers.get("location"), "/customer.html?logout=1");
  });
});

test("V2 POST logout clears session and OAuth cookies", async () => {
  await withServer(makeRouter(), async (base) => {
    const res = await fetch(`${base}/public/logout`, { method: "POST" });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /cwf_token=; Max-Age=0/);
    assert.match(cookie, /cwf_oauth_line=; Max-Age=0/);
    assert.match(cookie, /cwf_oauth_google=; Max-Age=0/);
  });
});

test("provider unavailable when schema is missing", async () => {
  await withServer(makeRouter({ pool: makePool({ schemaReady: false }) }), async (base) => {
    const res = await fetch(`${base}/public/auth/config`);
    const data = await res.json();
    assert.equal(data.schema_ready, false);
    assert.equal(data.providers.line.available, false);
    assert.equal(data.providers.google.available, false);
  });
});

test("provider unavailable when callback is not HTTPS", async () => {
  const env = { ...READY_ENV, LINE_V2_CALLBACK_URL: "http://app.cwf-air.com/auth/line/v2/callback" };
  await withServer(makeRouter({ env }), async (base) => {
    const res = await fetch(`${base}/public/auth/config`);
    const data = await res.json();
    assert.equal(data.providers.line.available, false);
  });
});

test("tampered OAuth context cookie is rejected before provider exchange", async () => {
  let called = false;
  await withServer(makeRouter({ exchangeGoogleCode: async () => { called = true; } }), async (base) => {
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=bad`, {
      redirect: "manual",
      headers: { cookie: `${customerAuth.GOOGLE_STATE_COOKIE}=tampered` },
    });
    assert.match(res.headers.get("location"), /reason=missing_state/);
    assert.equal(called, false);
  });
});

test("expired OAuth context is rejected", async () => {
  let now = Date.now();
  const store = customerAuth.createMemoryOAuthStore(() => now);
  await withServer(makeRouter({ store }), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE);
    now += 11 * 60 * 1000;
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: started.cookie },
    });
    assert.match(res.headers.get("location"), /reason=expired_state/);
  });
});

test("replayed callback state is rejected after one successful consume", async () => {
  await withServer(makeRouter(), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE);
    const first = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: started.cookie },
    });
    assert.match(first.headers.get("location"), /auth=success/);
    const replay = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: started.cookie },
    });
    assert.match(replay.headers.get("location"), /reason=missing_state/);
  });
});

test("linking after session logout is rejected", async () => {
  const token = customerAuth.jwtSign({ sub: "line:u1", exp: Math.floor(Date.now() / 1000) + 60 }, READY_ENV.CWF_JWT_SECRET);
  await withServer(makeRouter(), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE, `cwf_token=${encodeURIComponent(token)}`);
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: started.cookie },
    });
    assert.match(res.headers.get("location"), /reason=link_session_missing/);
  });
});

test("linking after session changes is rejected", async () => {
  const tokenA = customerAuth.jwtSign({ sub: "line:u1", exp: Math.floor(Date.now() / 1000) + 60 }, READY_ENV.CWF_JWT_SECRET);
  const tokenB = customerAuth.jwtSign({ sub: "line:u2", exp: Math.floor(Date.now() / 1000) + 60 }, READY_ENV.CWF_JWT_SECRET);
  await withServer(makeRouter(), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE, `cwf_token=${encodeURIComponent(tokenA)}`);
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: `${started.cookie}; cwf_token=${encodeURIComponent(tokenB)}` },
    });
    assert.match(res.headers.get("location"), /reason=link_session_changed/);
  });
});

test("valid same-session provider linking succeeds", async () => {
  const pool = makePool({ profiles: [{ sub: "line:u1", display_name: "Line User" }] });
  const token = customerAuth.jwtSign({ sub: "line:u1", exp: Math.floor(Date.now() / 1000) + 60 }, READY_ENV.CWF_JWT_SECRET);
  await withServer(makeRouter({ pool }), async (base) => {
    const started = await startFlow(base, "google", customerAuth.GOOGLE_STATE_COOKIE, `cwf_token=${encodeURIComponent(token)}`);
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=${started.state}`, {
      redirect: "manual",
      headers: { cookie: `${started.cookie}; cwf_token=${encodeURIComponent(token)}` },
    });
    assert.match(res.headers.get("location"), /auth=linked/);
    assert.equal(pool.state.identities[0].customer_sub, "line:u1");
  });
});

test("existing provider identity signs into the same customer", async () => {
  const pool = makePool({
    identities: [{ provider: "google", provider_subject: "g-1", customer_sub: "line:legacy" }],
    profiles: [{ sub: "line:legacy", display_name: "Legacy", email: "a@example.com", email_verified: true }],
  });
  const result = await customerAuth.completeProviderLogin({
    pool,
    identity: { provider: "google", provider_subject: "g-1", display_name: "Google", email: "a@example.com", email_verified: true },
  });
  assert.equal(result.customer.customer_sub, "line:legacy");
  assert.equal(result.mode, "existing_identity");
});

test("new provider identity creates profile before identity and avoids display-name matching", async () => {
  const pool = makePool({ profiles: [{ sub: "line:other", display_name: "Same Name" }] });
  const result = await customerAuth.completeProviderLogin({
    pool,
    identity: { provider: "google", provider_subject: "g-new", display_name: "Same Name", email: "", email_verified: false },
  });
  assert.equal(result.customer.customer_sub, "google:g-new");
  assert.match(pool.state.queries[1].sql, /INSERT INTO public\.customer_profiles/);
  assert.match(pool.state.queries[2].sql, /INSERT INTO public\.customer_identities/);
});

test("duplicate provider identity linked to another customer is rejected safely", async () => {
  const pool = makePool({
    identities: [{ provider: "line", provider_subject: "u1", customer_sub: "line:u1" }],
    profiles: [{ sub: "line:u1", display_name: "Line User" }],
  });
  const result = await customerAuth.completeProviderLogin({
    pool,
    loggedInCustomer: { sub: "google:g1" },
    identity: { provider: "line", provider_subject: "u1", display_name: "Line User" },
  });
  assert.equal(result.error, "PROVIDER_ALREADY_LINKED");
});

test("ambiguous verified email does not auto-link", async () => {
  const pool = makePool({
    profiles: [
      { sub: "line:a", email: "same@example.com", email_verified: true },
      { sub: "line:b", email: "same@example.com", email_verified: true },
    ],
  });
  const result = await customerAuth.completeProviderLogin({
    pool,
    identity: { provider: "google", provider_subject: "g3", email: "same@example.com", email_verified: true, display_name: "Google" },
  });
  assert.equal(result.customer.customer_sub, "google:g3");
  assert.equal(result.mode, "ambiguous_email_new_customer");
});

test("Google verifier uses official OAuth2Client abstraction with n/e JWKS hidden behind library", async () => {
  const oauthClient = {
    async verifyIdToken({ idToken, audience }) {
      assert.equal(idToken, "google-id-token");
      assert.equal(audience, "google-id");
      return {
        getPayload() {
          return {
            iss: "https://accounts.google.com",
            aud: "google-id",
            exp: Math.floor(Date.now() / 1000) + 60,
            nonce: "nonce",
            sub: "google-sub",
            email: "user@example.com",
            email_verified: true,
          };
        },
      };
    },
  };
  const identity = await customerAuth.verifyGoogleIdToken({ idToken: "google-id-token", clientId: "google-id", nonce: "nonce", oauthClient });
  assert.equal(identity.provider_subject, "google-sub");
  assert.equal(identity.email_verified, true);
});

test("Google token audience mismatch is rejected after official verification payload", () => {
  assert.throws(
    () => customerAuth.googleIdentityFromPayload({
      iss: "https://accounts.google.com",
      aud: "wrong-client",
      exp: Math.floor(Date.now() / 1000) + 60,
      nonce: "nonce",
      sub: "g1",
      email: "user@example.com",
      email_verified: true,
    }, "expected-client", "nonce"),
    /GOOGLE_AUD_INVALID/
  );
});
