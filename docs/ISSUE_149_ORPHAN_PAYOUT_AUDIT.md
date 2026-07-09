# Issue 149 Orphan Payout Line Audit

This audit is read-only. It only reports technician payout lines whose `job_id`
no longer exists in `public.jobs`.

The generic audit below is intended for non-production copies. For the Issue
149 final closeout, use the scoped production read-only command in the
Production Closeout section. Neither path has a repair mode.

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

## Production Closeout Read-Only Audit

Owner-approved production read-only audit for technician `0661479791` and work
month `2026-06`:

```bash
NODE_ENV=production node scripts/issue-149-closeout-audit.js --run --json --allow-production-read --technician=0661479791 --month=2026-06 > issue-149-prod-audit-0661479791-2026-06.json
```

The script opens a `BEGIN READ ONLY` transaction, sets statement/lock timeouts,
and only runs SELECT statements. It reports current totals, expected totals
after safe cleanup candidates, exact orphan rows, cache leftovers, deposit
impact, and classification.

Generate the remediation SQL plan from that JSON without executing writes:

```bash
node scripts/issue-149-remediation-plan.js --audit=issue-149-prod-audit-0661479791-2026-06.json > issue-149-remediation-plan.sql
```

The generated plan defaults to `ROLLBACK`. Do not switch to `COMMIT` or run it
against production until the owner approves the exact audit output and plan.

## Decision Matrix

| Classification | Meaning | Required action |
| --- | --- | --- |
| `draft/unpaid-safe-to-clean` | Orphan line is tied only to draft/unpaid payout state. | Review with operations and decide whether a targeted cleanup PR or manual non-production validation is appropriate. |
| `locked/paid/payment-linked-reconciliation-required` | Orphan line is tied to locked, paid, partially paid, paid-at, or payment-row state. | Do not delete automatically. Reconcile payout/payment records with finance before any data change. |

## Notes

- The SQL includes `payment_id`, paid amount, paid status, and payout period
  status so reviewers can distinguish unpaid draft rows from rows that need
  finance reconciliation.
- Production data must not be modified by this PR.
- Any future repair must be a separate scoped change with its own review,
  tests, and operational sign-off.
