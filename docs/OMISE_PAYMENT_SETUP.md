# Online payment (Omise / Opn) - store buy flow

The store buy flow lets a customer pay for a `purchase`-mode catalog item
online via **Omise (Opn Payments)** with either **PromptPay QR** or a
**credit/debit card**.

The app never sees raw card numbers. The browser tokenizes the card with
Omise.js using the **public** key; our server only receives a one-time token and
charges it with the **secret** key.

## 1. Environment variables

Set these on the server, for example in the deployment environment or `.env`.
Never commit them and never paste secrets into chat, code, or a PR.

| Variable | Example | Notes |
| --- | --- | --- |
| `OMISE_SECRET_KEY` | `skey_test_xxxxx` | **Secret.** Server only. Required for charge/retrieve. |
| `OMISE_WEBHOOK_SECRET` | `base64-secret-from-dashboard` | **Secret.** Base64 webhook signing secret from the Omise dashboard. Required before online payment is enabled. |
| `OMISE_PUBLIC_KEY` | `pkey_test_xxxxx` | Safe to expose. Required only for card payment UI. |

Readiness behavior:

- Online payment is **off** unless both `OMISE_SECRET_KEY` and
  `OMISE_WEBHOOK_SECRET` are set and the webhook secret is valid Base64.
- PromptPay can be advertised with only `OMISE_SECRET_KEY` and
  `OMISE_WEBHOOK_SECRET`.
- Card payment is advertised only when `OMISE_PUBLIC_KEY` is also set.
- When config is incomplete, `GET /public/payment-config` returns
  `enabled: false` or omits the unavailable method, and the Customer App keeps
  the LINE fallback.

## 2. Database

The existing buy-flow migrations are additive. Do not run migrations from
application startup unless that behavior has been separately approved for the
release.

Relevant existing schema:

- `public.customer_orders.status`
- `payment_provider`
- `payment_method`
- `payment_charge_id`
- `payment_status`
- `paid_at`
- unique partial index on non-null `payment_charge_id`

No new migration is required for the payment security change. The current
payment attempt is stored as `payment_status='processing:<attempt_id>'` until a
charge id is safely persisted.

## 3. Webhook

In the Omise dashboard -> **Webhooks**, add an endpoint pointing at:

```text
https://<your-host>/webhooks/omise
```

The endpoint must be configured with HMAC-SHA256 signatures. Omise exposes the
webhook signing secret as Base64 in the dashboard; set that exact Base64 value
as `OMISE_WEBHOOK_SECRET`. The server decodes it to bytes before calculating the
HMAC and fails closed if the value is empty or not valid Base64.

The server verifies:

- `Omise-Signature`
- `Omise-Signature-Timestamp`
- signed payload `<timestamp>.<raw request body>`

The handler still does not trust webhook payload fields after signature
verification. It extracts the charge id, retrieves the real charge from Omise,
checks metadata (`order_code` and `attempt_id`), amount, and THB currency, and
only then updates the order. Replays are idempotent.

## 4. How the flow works

1. Customer fills the purchase sheet.
2. `POST /public/orders` creates an order with status `pending_payment`.
   Product names and prices are loaded from the catalog database; client
   `name`, `unit_price`, and `subtotal` are ignored.
3. App calls `GET /public/payment-config`; if enabled it shows the payment step.
4. Before calling Omise, the server locks the order, creates a cryptographically
   random `attempt_id`, stores `payment_status='processing:<attempt_id>'`, moves
   the order to `payment_processing`, and commits.
5. **Card:** browser tokenizes via Omise.js, then calls
   `POST /public/orders/:code/pay` with `{ method: "card", token }`.
6. **PromptPay:** `POST /public/orders/:code/pay` with
   `{ method: "promptpay" }` returns a QR image URL. The order stays at
   `payment_processing` until webhook verification marks it paid or failed.

The amount charged is always the server-stored `subtotal`; the client cannot
influence it.

Ambiguous Omise failures (timeout, transport error, HTTP 408, HTTP 429, HTTP
5xx) remain non-retryable and keep the order at `payment_processing`. Only a
confirmed no-charge rejection or a verified terminal failed/expired/reversed
charge may become `payment_failed`.

## 5. Release checklist

Before enabling online payment in production:

1. Confirm `OMISE_SECRET_KEY` is set for the intended Omise account.
2. Confirm `OMISE_WEBHOOK_SECRET` is set and matches the Omise dashboard
   webhook signing secret Base64 value.
3. Confirm `OMISE_PUBLIC_KEY` is set if card payment should be shown.
4. Confirm `GET /public/payment-config` returns:
   - `enabled: true`
   - `methods` includes `promptpay`
   - `methods` includes `card` only when the public key is present
5. Create a test order with an approved test product and verify stored order
   item name/unit price match the catalog, not the browser payload.
6. Verify PromptPay webhook delivery reaches `paid`.

## 6. Manual reconciliation for stuck `payment_processing`

If an order remains `payment_processing`, do **not** reset it automatically to
`pending_payment`. That state means Omise may already have created a charge and
a retry could double-charge the customer.

Manual process:

1. Look up the order by `order_code`.
2. Read the current attempt from `payment_status` when it has the form
   `processing:<attempt_id>`.
3. Search the Omise dashboard/API for charges whose metadata contains the same
   `order_code` and `attempt_id`.
4. If a matching charge is paid/successful and amount/currency match the order,
   let the webhook process it or manually apply the same state update with owner
   approval.
5. If Omise confirms no charge exists or the matching charge is terminal
   failed/expired/reversed, owner-approved manual reconciliation may set the
   order to `payment_failed` so the customer can retry.
6. Never change production data without an approved reconciliation ticket.

## 7. Rollback notes

Do not remove `OMISE_WEBHOOK_SECRET` while there are `payment_processing` orders
or PromptPay QR charges that may still send webhooks. Removing it disables both
new payment readiness and the webhook receiver, so in-flight payments can no
longer reconcile automatically.

Before rollback, reconcile in-flight orders using the manual process above. The
safest rollback is to revert the payment-security application change. If the
system later supports disabling only the start of new online payments while
keeping webhook reconciliation active, that is also acceptable; do not change
production config destructively as part of rollback without owner approval.

## 8. Live test

Run this only in an environment that is intentionally configured to reach Omise.

1. Set `OMISE_SECRET_KEY`, `OMISE_WEBHOOK_SECRET`, and optionally
   `OMISE_PUBLIC_KEY` to test-mode values; deploy.
2. `GET /public/payment-config` should return enabled test mode and the expected
   method list.
3. Card: buy a `purchase` item and pay with an Omise test card. Expect the order
   to reach `paid`; confirm the charge in the Omise dashboard test mode.
4. PromptPay: choose PromptPay and get the QR. Use Omise test tooling/dashboard
   to complete the charge and confirm the order flips to `paid` via webhook and
   polling.
5. Swap to live keys only after owner approval.
