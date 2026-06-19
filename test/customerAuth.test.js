const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const customerAuth = require("../server/customerAuth");

function makePool({ identities = [], profiles = [] } = {}) {
  const state = { identities: identities.map((x) => ({ ...x })), profiles: profiles.map((x) => ({ ...x })), queries: [] };
  return {
    state,
    async query(sql, params = []) {
      state.queries.push({ sql, params });
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
      if (/INSERT INTO public\.customer_identities/.test(sql)) {
        const next = {
          customer_sub: params[0],
          provider: params[1],
          provider_subject: params[2],
          email: params[3],
          email_verified: params[4],
          display_name: params[5],
          picture_url: params[6],
        };
        const found = state.identities.find((x) => x.provider === next.provider && x.provider_subject === next.provider_subject);
        if (found) Object.assign(found, next);
        else state.identities.push(next);
        return { rows: [] };
      }
      if (/INSERT INTO public\.customer_profiles/.test(sql)) {
        const next = {
          sub: params[0],
          provider: params[1],
          display_name: params[2],
          picture_url: params[3],
          email: params[4],
          email_verified: params[5],
        };
        const found = state.profiles.find((x) => x.sub === next.sub);
        if (found) Object.assign(found, { ...next, phone: found.phone, address: found.address, maps_url: found.maps_url });
        else state.profiles.push(next);
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
  const port = server.address().port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("safeReturnTo accepts Customer App routes and rejects open redirects", () => {
  assert.equal(customerAuth.safeReturnTo("/customer-app/?view=profile"), "/customer-app/?view=profile");
  assert.equal(customerAuth.safeReturnTo("/track.html?q=CWF123"), "/track.html?q=CWF123");
  assert.equal(customerAuth.safeReturnTo("https://evil.example/customer-app/"), "/customer-app/");
  assert.equal(customerAuth.safeReturnTo("//evil.example/customer-app/"), "/customer-app/");
  assert.equal(customerAuth.safeReturnTo("/admin/super-v2.html"), "/customer-app/");
});

test("LINE start creates state, PKCE cookie, and authorize redirect", async () => {
  const router = customerAuth.createCustomerAuthRoutes({
    pool: makePool(),
    env: { LINE_CHANNEL_ID: "line-id", LINE_CHANNEL_SECRET: "line-secret", CWF_JWT_SECRET: "secret" },
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/auth/line?returnTo=/customer-app/?view=profile`, { redirect: "manual" });
    assert.equal(res.status, 302);
    const location = res.headers.get("location");
    assert.match(location, /^https:\/\/access\.line\.me\/oauth2\/v2\.1\/authorize/);
    assert.match(location, /code_challenge=/);
    assert.match(location, /nonce=/);
    assert.match(res.headers.get("set-cookie"), /cwf_oauth_line=/);
  });
});

test("Google start creates state and nonce", async () => {
  const router = customerAuth.createCustomerAuthRoutes({
    pool: makePool(),
    env: { GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", CWF_JWT_SECRET: "secret" },
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/auth/google`, { redirect: "manual" });
    assert.equal(res.status, 302);
    const location = res.headers.get("location");
    assert.match(location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    assert.match(location, /scope=openid\+email\+profile/);
    assert.match(location, /nonce=/);
    assert.match(res.headers.get("set-cookie"), /cwf_oauth_google=/);
  });
});

test("callbacks reject invalid or missing state before provider HTTP calls", async () => {
  let called = false;
  const router = customerAuth.createCustomerAuthRoutes({
    pool: makePool(),
    env: { GOOGLE_CLIENT_ID: "google-id", GOOGLE_CLIENT_SECRET: "google-secret", CWF_JWT_SECRET: "secret" },
    exchangeGoogleCode: async () => { called = true; },
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/auth/google/callback?code=abc&state=bad`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /auth=failed/);
    assert.match(res.headers.get("location"), /reason=missing_state/);
    assert.equal(called, false);
  });
});

test("provider cancellation redirects safely", async () => {
  const router = customerAuth.createCustomerAuthRoutes({
    pool: makePool(),
    env: { LINE_CHANNEL_ID: "line-id", LINE_CHANNEL_SECRET: "line-secret", CWF_JWT_SECRET: "secret" },
  });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/auth/line/callback?error=access_denied`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /reason=access_denied/);
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

test("new provider identity creates a customer without duplicate display-name matching", async () => {
  const pool = makePool({ profiles: [{ sub: "line:other", display_name: "Same Name" }] });
  const result = await customerAuth.completeProviderLogin({
    pool,
    identity: { provider: "google", provider_subject: "g-new", display_name: "Same Name", email: "", email_verified: false },
  });
  assert.equal(result.customer.customer_sub, "google:g-new");
  assert.equal(pool.state.identities.length, 1);
  assert.match(pool.state.queries[1].sql, /INSERT INTO public\.customer_profiles/);
  assert.match(pool.state.queries[2].sql, /INSERT INTO public\.customer_identities/);
});

test("logged-in customer explicitly links a new provider", async () => {
  const pool = makePool({ profiles: [{ sub: "line:u1", display_name: "Line User" }] });
  const result = await customerAuth.completeProviderLogin({
    pool,
    loggedInCustomer: { sub: "line:u1" },
    identity: { provider: "google", provider_subject: "g-2", display_name: "Google User", email: "g@example.com", email_verified: true },
  });
  assert.equal(result.customer.customer_sub, "line:u1");
  assert.equal(result.mode, "linked_to_session");
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

test("provider unavailable is reported through public config", async () => {
  const router = customerAuth.createCustomerAuthRoutes({ pool: makePool(), env: { CWF_JWT_SECRET: "secret" } });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/auth/config`);
    const data = await res.json();
    assert.equal(data.providers.line.available, false);
    assert.equal(data.providers.google.available, false);
  });
});

test("logout clears session and OAuth cookies", async () => {
  const router = customerAuth.createCustomerAuthRoutes({ pool: makePool(), env: { CWF_JWT_SECRET: "secret" } });
  await withServer(router, async (base) => {
    const res = await fetch(`${base}/public/logout`, { method: "POST" });
    assert.equal(res.status, 200);
    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /cwf_token=; Max-Age=0/);
    assert.match(cookie, /cwf_oauth_line=; Max-Age=0/);
    assert.match(cookie, /cwf_oauth_google=; Max-Age=0/);
  });
});

test("/public/me guest and authenticated customer", async () => {
  const pool = makePool({
    identities: [{ provider: "line", provider_subject: "u1", customer_sub: "line:u1" }],
    profiles: [{ sub: "line:u1", display_name: "Line User", address: "Bangkok", maps_url: "", email: "", email_verified: false }],
  });
  const env = { CWF_JWT_SECRET: "secret" };
  const router = customerAuth.createCustomerAuthRoutes({ pool, env });
  await withServer(router, async (base) => {
    const guest = await fetch(`${base}/public/me`);
    assert.deepEqual(await guest.json(), { logged_in: false });
    const token = customerAuth.jwtSign({ sub: "line:u1", provider: "line", name: "Line User", exp: Math.floor(Date.now() / 1000) + 60 }, env.CWF_JWT_SECRET);
    const authed = await fetch(`${base}/public/me`, { headers: { cookie: `cwf_token=${encodeURIComponent(token)}` } });
    const data = await authed.json();
    assert.equal(data.logged_in, true);
    assert.equal(data.user.provider, "line");
    assert.equal(data.profile.address, "Bangkok");
  });
});

test("Google token audience mismatch is rejected by verifier before identity use", async () => {
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
