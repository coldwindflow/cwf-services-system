# Customer History Claims production runbook

This migration is owner-operated. The application never applies it during server startup.

## 1. Preflight (read-only)

Run from the reviewed release commit with the production `DATABASE_URL` supplied through the deployment secret store:

```sh
npm run migrate:customer-history-claims:check
```

Expected status and exit codes:

| Status | Exit | Meaning / action |
| --- | ---: | --- |
| `READY_TO_APPLY` | 0 | Prerequisites match and the claims table is absent. Continue only after owner approval. |
| `ALREADY_APPLIED` | 0 | The exact expected schema is present. Do not apply again. Continue to verification. |
| `PREREQUISITE_MISSING` | 2 | `customer_profiles.sub` or `jobs.job_id` is unsuitable. Stop; fix the prerequisite in a separately reviewed change. |
| `SCHEMA_DRIFT` | 3 | The checked-in SQL checksum or an existing claims schema differs. Stop; inspect the drift. Do not overwrite it. |
| `FAILED` | 1 | Connection, lock, or unexpected database failure. Stop and investigate without printing secrets. |

The runner redacts database URLs, hosts, users, passwords, and tokens from surfaced errors. Do not paste the raw `DATABASE_URL` into a terminal transcript or ticket.

## 2. Apply (owner approval required)

Only when preflight returned `READY_TO_APPLY`, set the one-use confirmation value and apply from the same reviewed commit:

```sh
CONFIRM_CUSTOMER_HISTORY_CLAIMS_MIGRATION=APPLY_20260710_CUSTOMER_HISTORY_CLAIMS npm run migrate:customer-history-claims -- --apply
```

On PowerShell:

```powershell
$env:CONFIRM_CUSTOMER_HISTORY_CLAIMS_MIGRATION='APPLY_20260710_CUSTOMER_HISTORY_CLAIMS'
npm run migrate:customer-history-claims -- --apply
Remove-Item Env:CONFIRM_CUSTOMER_HISTORY_CLAIMS_MIGRATION
```

The apply path uses an advisory lock plus lock and statement timeouts. Any non-zero exit is a stop condition; do not retry blindly.

## 3. Verify

Run the read-only check again:

```sh
npm run migrate:customer-history-claims:check
```

It must return `ALREADY_APPLIED` with exit 0. Then verify through a non-production test account (or an owner-approved production smoke test) that:

1. Wrong phone/code combinations return the same generic public failure.
2. A valid full legacy phone plus Booking Code creates one claim.
3. Repeating the same proof on the same account succeeds without a duplicate row.
4. History and locations load, and a selected location prefills scheduled and urgent booking drafts.
5. Server logs contain diagnostic codes only and no phone or Booking Code.

## Rollback / stop conditions

Stop immediately on `PREREQUISITE_MISSING`, `SCHEMA_DRIFT`, any non-zero apply result, unexpected row creation, or public PII disclosure. Do not edit production data to recover.

The migration is additive. If rollback is approved before any claims exist, the reviewed outline is at the end of `migrations/20260710_customer_history_claims.sql`. Once claims exist, dropping the table destroys ownership records; take a backup and require an explicit owner/database review before any rollback. Application rollback can be performed independently by reverting the release commit; the server will fail closed with `CUSTOMER_HISTORY_SCHEMA_NOT_READY` when the expected schema is unavailable.
