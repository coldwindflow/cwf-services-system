# Customer App V2 LINE + Google Login

## Routes

- `GET /auth/line`
- `GET /auth/line/start`
- `GET /auth/line/callback`
- `GET /auth/google`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /public/auth/config`
- `GET /public/me`
- `GET /public/logout`
- `POST /public/logout`

Both providers issue the existing `cwf_token` customer session cookie and return to Customer App V2 through a strict same-origin customer-route `returnTo` allowlist.

## Required Environment Variables

Shared:

- `CWF_JWT_SECRET` or existing `JWT_SECRET`

LINE:

- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_SECRET`
- `LINE_CALLBACK_URL=https://app.cwf-air.com/auth/line/callback`

Google:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://app.cwf-air.com/auth/google/callback`

Do not commit provider secrets, access tokens, refresh tokens, private keys, or production cookies.

## LINE Developers Setup

1. Create or use a LINE Login channel, not a Messaging API-only channel.
2. Set callback URL to `https://app.cwf-air.com/auth/line/callback`.
3. Enable scopes: `openid`, `profile`, `email`.
4. Map the channel ID to `LINE_CHANNEL_ID`.
5. Map the channel secret to `LINE_CHANNEL_SECRET`.
6. LINE Official Account linking is optional for this login flow; the customer login only requires LINE Login.

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
