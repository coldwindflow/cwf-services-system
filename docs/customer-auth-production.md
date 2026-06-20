# Customer App V2 LINE + Google Login

## Routes

- `GET /auth/line`
- `GET /auth/line/start`
- `GET /auth/line/callback`
- `GET /auth/line/v2/callback`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /public/auth/config`
- `GET /public/me`
- `GET /public/logout`
- `POST /public/logout`

Legacy `GET /auth/line` and `GET /auth/line/callback` remain reserved for `customer.html`. Customer App V2 starts LINE through `/auth/line/start` and uses `/auth/line/v2/callback`.

Both V2 providers issue the existing `cwf_token` customer session cookie and return to Customer App V2 through a strict same-origin customer-route `returnTo` allowlist.

## Required Environment Variables

Shared:

- `CWF_JWT_SECRET` or existing `JWT_SECRET`

LINE:

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_CALLBACK_URL=https://app.cwf-air.com/auth/line/callback` for legacy `customer.html`
- `LINE_V2_CALLBACK_URL=https://app.cwf-air.com/auth/line/v2/callback` for Customer App V2
- `LINE_EMAIL_SCOPE_ENABLED=true` only after LINE email permission is approved

Google:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://app.cwf-air.com/auth/google/callback`

Do not commit provider secrets, access tokens, refresh tokens, private keys, or production cookies.

## LINE Developers Setup

1. Create or use a LINE Login channel, not a Messaging API-only channel.
2. Keep legacy callback URL `https://app.cwf-air.com/auth/line/callback`.
3. Add Customer App V2 callback URL `https://app.cwf-air.com/auth/line/v2/callback`.
4. Enable scopes: `openid`, `profile`.
5. Map the channel ID to `LINE_CHANNEL_ID`.
6. Map the channel secret to `LINE_CHANNEL_SECRET`.
7. Map the V2 callback to `LINE_V2_CALLBACK_URL`.
8. LINE Official Account linking is optional for this login flow; the customer login only requires LINE Login.

LINE email is optional and disabled by default. Apply for email permission in LINE Developers Console first; after approval, set `LINE_EMAIL_SCOPE_ENABLED=true` and add the `email` scope in the channel settings. Without that env var, Customer App V2 requests only `openid profile`, and LINE login still works without an email address.

## Google Cloud Setup

1. Configure OAuth consent screen for the production app.
2. Create a Web application OAuth client.
3. Add authorized redirect URI: `https://app.cwf-air.com/auth/google/callback`.
4. Authorized JavaScript origin is not required for the server-side authorization-code flow unless future browser-side Google APIs are added.
5. Use only `openid email profile` scopes.
6. Map OAuth client ID to `GOOGLE_CLIENT_ID`.
7. Map OAuth client secret to `GOOGLE_CLIENT_SECRET`.
8. If consent screen is in testing mode, add real QA accounts as test users before production testing.

## Identity Storage

New normalized table: `public.customer_identities`.

- Unique `(provider, provider_subject)`.
- Foreign key to `public.customer_profiles(sub)`.
- Stores optional verified email and display metadata.
- Does not store provider access tokens or refresh tokens.

Existing LINE customers keep their legacy customer profile key, e.g. `line:<LINE user id>`. The migration includes a reviewed optional backfill statement to populate `customer_identities` from existing `customer_profiles` rows.

The application does not run DDL at normal startup. The owner must explicitly approve and run the Customer Auth migration as a separate controlled deployment step before enabling provider env vars. Until the schema is present, `/public/auth/config` reports providers as unavailable.

Recommended deployment order:

1. Deploy the code with provider env vars unset.
2. Confirm a recent Render PostgreSQL backup or restore point exists.
3. Configure the Render Web Service Pre-Deploy Command:

   ```text
   npm run migrate:customer-auth
   ```

   In Render this is:

   ```text
   Render Web Service
   -> Settings
   -> Pre-Deploy Command
   -> npm run migrate:customer-auth
   ```

4. Deploy. Render must stop the deployment if the migration runner exits non-zero.
5. Verify `https://app.cwf-air.com/public/auth/config`.
6. Add provider client IDs/secrets, safe HTTPS callbacks, and JWT secret.
7. Enable LINE email scope only after LINE approves the permission.

The runner reads and executes the merged SQL file `migrations/20260620_customer_identities.sql` exactly as committed. It uses a PostgreSQL advisory lock, verifies the resulting schema, closes the database connection in success and failure paths, and does not run the optional commented LINE backfill separately. It is intentionally not attached to `npm start`, `prestart`, `postinstall`, application boot, request handlers, or health checks.

After a successful migration and complete provider env configuration, `/public/auth/config` should report:

```json
{
  "schema_ready": true,
  "providers": {
    "line": { "available": true },
    "google": { "available": true }
  }
}
```

Provider availability may remain `false` when required provider env vars, JWT secret, or safe HTTPS callback URLs are incomplete, even when `schema_ready` is `true`.

## OAuth State Store

OAuth state is stored server-side in a bounded in-memory store with expiry cleanup and oldest-entry eviction. This is safe for a single running Node instance. A horizontally scaled deployment needs a shared one-time store, such as Redis or a database-backed state table, so callbacks can be consumed by any instance without losing state.

## Rollback Plan

See `migrations/20260620_customer_identities.sql`.

Rollback removes:

- `public.customer_identities`
- `idx_customer_profiles_verified_email`
- `customer_profiles.email_verified`
- `customer_profiles.email`

Do not run rollback while active customer sessions depend on newly linked Google identities.

## Manual QA Checklist

1. Guest Customer App V2 loads and booking remains available.
2. LINE Login succeeds and returns to the original Customer App V2 route.
3. LINE cancellation returns to Customer App V2 with a non-blocking error.
4. Invalid/expired LINE callback state is rejected.
5. Existing legacy LINE customer keeps the same `customer_profiles.sub`.
6. Google Login succeeds and returns to the original Customer App V2 route.
7. Google cancellation returns to Customer App V2 with a non-blocking error.
8. Existing Google identity signs in to the same customer.
9. New Google identity creates a customer profile.
10. Logged-in LINE customer can explicitly link Google.
11. Logged-in Google customer can explicitly link LINE.
12. Logout clears `cwf_token` and OAuth state cookies.
13. Refresh after login keeps `/public/me.logged_in=true`.
14. PWA reopen after login keeps the session until cookie expiry.
15. Missing provider env vars show unavailable buttons.
16. Mobile widths 360 / 390 / 430px keep provider buttons readable.
17. Legacy `customer.html` still works with `cwf_token`.
18. Tracking without login still works.
19. Guest booking still works.
20. No provider token appears in localStorage, URLs after redirect, or `/public/me`.
