# Customer History claim methods production runbook

This schema-capability migration is owner-operated. It only widens the
`customer_history_claims_method_check` constraint; it does not enable the
phone-only or Booking-Code-only product flow.

## Preconditions

- Run from the reviewed and deployed schema-capability release commit.
- Use only database credentials injected by the Production service. The runner
  prefers `DATABASE_URL` when present; otherwise it uses `DB_HOST`, `DB_PORT`
  (default `5432`), `DB_USER`, `DB_PASSWORD`, and `DB_NAME`.
- Do not print, copy, or store connection settings or any secret.
- Do not apply until the owner gives a separate explicit Production approval.

## 1. Read-only preflight

```sh
npm run migrate:customer-history-claim-methods:check
```

| Status | Exit | Action |
| --- | ---: | --- |
| `READY_TO_APPLY` | 0 | Exact one-method legacy constraint and all other expected schema are present. Stop for owner apply approval. |
| `ALREADY_APPLIED` | 0 | Exact approved three-method constraint is present. Do not apply again; continue to verification. |
| `PREREQUISITE_MISSING` | 2 | `customer_history_claims` is missing. Stop. |
| `SCHEMA_DRIFT` | 3 | Exact columns/defaults, primary key, named CHECKs, FKs/delete actions, critical indexes, or migration checksum differ. Stop. |
| `FAILED` | 1 | Connection, timeout, lock, or unexpected failure. Stop and investigate without exposing secrets. |

Only these method capabilities are accepted:

- legacy: `booking_code_phone`
- widened: `phone`, `booking_code`, `booking_code_phone`

Every other method set or constraint shape fails closed.

## 2. Apply after separate owner approval

The confirmation token and `--apply` argument are both required:

```sh
CONFIRM_CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION=APPLY_20260717_CUSTOMER_HISTORY_CLAIM_METHODS npm run migrate:customer-history-claim-methods -- --apply
```

PowerShell:

```powershell
$env:CONFIRM_CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION='APPLY_20260717_CUSTOMER_HISTORY_CLAIM_METHODS'
npm run migrate:customer-history-claim-methods -- --apply
Remove-Item Env:CONFIRM_CUSTOMER_HISTORY_CLAIM_METHODS_MIGRATION
```

The SQL uses `lock_timeout = '5s'`, `statement_timeout = '30s'`, and the
transaction-scoped advisory lock `202607170177`. It snapshots row count and a
server-side fingerprint before the ALTER statements and rolls back if data
changes or validation fails.

## 3. Read-only verification

Run the same check again:

```sh
npm run migrate:customer-history-claim-methods:check
```

It must return `ALREADY_APPLIED` with exit 0. The current application must still
create only `booking_code_phone` claims; this release does not change the claim
route or Customer App UI.

## Rollback limitations

The migration does not rewrite rows and retains the existing
`booking_code_phone` default. Application rollback is safe while leaving the
widened constraint in place.

Before any `phone` or `booking_code` rows exist, a separately reviewed migration
may restore the legacy one-method constraint. After new-method rows exist,
narrowing the constraint would require deleting valid claims or falsely
relabeling audit data; do not do either. Retain the widened constraint and roll
back only the application unless the owner approves a separate data plan.
