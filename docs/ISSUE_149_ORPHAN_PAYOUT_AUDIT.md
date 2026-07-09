# Issue 149 Orphan Payout Line Audit

This audit is read-only. It only reports technician payout lines whose `job_id`
no longer exists in `public.jobs`.

Do not run this against production. Run it only against a non-production copy
of production data after the copy has been verified.

## Dry Run

Review the SQL without executing it:

```bash
node scripts/audit-orphan-payout-lines.js --limit=200
```

## Read-Only Execution

Execute the SELECT against a non-production database:

```bash
NODE_ENV=staging node scripts/audit-orphan-payout-lines.js --run --limit=200
NODE_ENV=staging node scripts/audit-orphan-payout-lines.js --run --json --limit=200
```

`--apply` is intentionally unsupported. There is no repair mode in this script.

## Decision Matrix

| Classification | Meaning | Required action |
| --- | --- | --- |
| `draft/unpaid-safe-to-review` | Orphan line is tied only to draft/unpaid payout state. | Review with operations and decide whether a targeted cleanup PR or manual non-production validation is appropriate. |
| `locked/paid/payment-linked-reconciliation-required` | Orphan line is tied to locked, paid, partially paid, paid-at, or payment-row state. | Do not delete automatically. Reconcile payout/payment records with finance before any data change. |

## Notes

- The SQL includes `payment_id`, paid amount, paid status, and payout period
  status so reviewers can distinguish unpaid draft rows from rows that need
  finance reconciliation.
- Production data must not be modified by this PR.
- Any future repair must be a separate scoped change with its own review,
  tests, and operational sign-off.
