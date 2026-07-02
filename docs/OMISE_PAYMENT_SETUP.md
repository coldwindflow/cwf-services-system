# Online payment (Omise / Opn) — store buy flow

The store buy flow lets a customer pay for a `purchase`-mode catalog item
online via **Omise (Opn Payments)** with either **PromptPay QR** or a
**credit/debit card**. This document is the operator's guide: which environment
variables to set, how the pieces fit together, and how to run the live test
once keys are in place.

> The app never sees raw card numbers. The browser tokenizes the card with
> Omise.js using the **public** key; our server only ever receives a one-time
> token and charges it with the **secret** key.

## 1. Environment variables (required)

Set these on the server (e.g. in the deployment environment / `.env`). Get the
values from the Omise dashboard → **Keys**. Never commit them; never paste a
secret key into chat, code, or a PR.

| Variable            | Example            | Notes                                  |
| ------------------- | ------------------ | -------------------------------------- |
| `OMISE_PUBLIC_KEY`  | `pkey_test_xxxxx`  | Safe to expose to the browser.         |
| `OMISE_SECRET_KEY`  | `skey_test_xxxxx`  | **Secret.** Server only. Never ships.  |

- Test-mode keys are prefixed `pkey_test_` / `skey_test_`; live keys are
  `pkey_...` / `skey_...` without `_test_`. Start with **test** keys.
- If `OMISE_SECRET_KEY` is unset, payment is simply **off**: the buy flow falls
  back to the existing LINE hand-off, and `GET /public/payment-config` returns
  `{ enabled: false }`. Nothing breaks.

## 2. Database

The buy-flow migrations are additive and auto-apply on boot (no manual step).
To run them by hand:

```
npm run migrate:store-buy         # runs all three buy-flow migrations in order
# or just the payment columns:
npm run migrate:customer-orders-payment
```

The payment migration only adds nullable `payment_*` columns to
`customer_orders` — it never rewrites existing rows.

## 3. Webhook

In the Omise dashboard → **Webhooks**, add an endpoint pointing at:

```
https://<your-host>/webhooks/omise
```

This is how **PromptPay** payments are confirmed (the customer scans the QR and
pays asynchronously). Omise webhooks are unsigned, so the handler does **not**
trust the payload: it takes the charge id, re-fetches the charge from the Omise
API, and only then updates the order. Replays are idempotent.

## 4. How the flow works

1. Customer fills the purchase sheet → `POST /public/orders` creates an order
   with status `pending_payment` (subtotal computed server-side).
2. App calls `GET /public/payment-config`; if enabled it shows the payment step.
3. **Card:** browser tokenizes via Omise.js → `POST /public/orders/:code/pay`
   with `{ method: "card", token }`. The charge is captured immediately; the
   order becomes `paid` (or `payment_failed`).
4. **PromptPay:** `POST /public/orders/:code/pay` with `{ method: "promptpay" }`
   returns a QR image URL. The order sits at `payment_processing`; the app polls
   `GET /public/orders/:code` until the webhook flips it to `paid`.

The amount charged is **always** the server-stored `subtotal` — the client
cannot influence it.

## 5. Live test (must run where Omise is reachable)

The CI/dev sandbox blocks outbound traffic to `api.omise.co`, so the live test
runs in your **staging/production** environment with test keys set.

1. Set `OMISE_PUBLIC_KEY` / `OMISE_SECRET_KEY` to your **test** keys; deploy.
2. `GET /public/payment-config` → expect `{ enabled: true, test_mode: true }`.
3. **Card:** in the app, buy a `purchase` item and pay with an Omise test card
   (e.g. `4242 4242 4242 4242`, any future expiry, any CVC). Expect the order to
   reach `paid`; confirm the charge in the Omise dashboard (test mode).
4. **PromptPay:** choose PromptPay, get the QR. In test mode Omise won't take a
   real scan — mark the charge as paid from the dashboard (or use the test
   webhook) and confirm the order flips to `paid` via polling.
5. When satisfied, swap to **live** keys and repeat a small real charge.
