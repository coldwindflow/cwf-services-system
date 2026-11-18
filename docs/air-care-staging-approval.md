# AIR CARE staging approval scope — 2026-11-18

This is a proposal, not authorization. Exact final heads/bases and CI links are
recorded in PR #457 and PR #458. Recheck both heads/bases before executing; any
change invalidates the proposed approval. PR #453 requires separate production
approval and remains unmerged.

## New review results

The previously reviewed four-file #457 and thirteen-file #458 heads were unchanged.
Their CI passed. #457 now additionally creates automated promotion proposals as
Draft and removes the claim that deployment success proves verified staging.
Merging #457 into main can attempt to open a broad main-to-staging draft PR; it
does not merge or deploy. There was no existing main-to-staging promotion PR at
review time. Use #458, not a broad main promotion. The connector returned 403,
but read-only inspection using the existing Git credential then succeeded:
all three branches require a PR and enforce the rule for admins, but configure
zero approving reviews and no required status checks. Code-owner approval,
last-push approval, stale-review dismissal and conversation resolution are off;
force pushes/deletions are disabled. There are zero GitHub Environments.
Actions defaults to read permissions and cannot create/approve PRs through the
repository setting. Promotion attempts may therefore fail; do not broaden token
permissions or enable that setting automatically. Explicit workflow grants are
contents:read and pull-requests:write for promotion, contents:read for deployment.
Draft status and manual owner authorization currently provide process controls,
not a configured deployment approval gate. No repository setting was changed.

## Proposed authorization, in order

1. Review and merge only the exact #457 safety head into its verified main base.
   This enables default-branch workflow_run guards before any staging operation.
   It may create a draft promotion proposal; do not merge that proposal.
2. Perform staging-only preflight: inspect deployctl status, actual current
   revision/image and availability of that rollback image. Inspect host deployctl
   behavior and capture staging recovery evidence before any automatic migration.
   Abort if the approved base/head moved, another release is active, the runner
   is unhealthy, protection requirements cannot be satisfied, or recovery is not
   established. No production host/data inspection is included.
3. Merge #458 only at the approved head and base. GitHub creates a merge SHA;
   record it and require that exact resulting revision in deployment, seed and QA
   evidence. The reviewed head SHA alone is not the resulting merge SHA.
4. Allow the existing staging push workflow and its follow-ups described below.
   Verify all runs at the merge SHA; deployment success alone is insufficient.
5. Dispatch `CWF AIR CARE Staging QA` from the resulting staging revision with
   `action=fixture-accept`, then complete browser/Technician acceptance separately.
   Record every missing/failing check; do not label partial HTTP evidence as full
   customer readiness.

## Automatic data operations included in staging scope

- Pre-deploy: `scripts/apply-prepaid-service-entitlements-home.sh staging` applies
  `scripts/sql/20260906_prepaid_service_entitlements.sql` and checks columns and
  four entitlement/payment/redemption/cancellation triggers. It may add columns,
  functions, indexes and triggers; it is not a read-only check.
- Deploy: host deployctl builds/deploys the resulting staging merge SHA.
- Successful push follow-up: reapplies/verifies the prepaid SQL; applies
  `data-seeds/20260930_cwf_air_care.sql`; verifies two parents, four variants,
  sixteen tiers and twenty-five quotes. Existing rows can be updated by the seed.
  The real campaign sale dates remain closed; no actual sales are reopened.
- QA provisioning in the shared staging DB: upserts the designated QA customer,
  identity, Admin/Technician users, Technician profile/matrix/60-day calendar,
  and a four-hour Admin session. This existing operation uses the staging secret.
  It does not grant permission to touch ordinary customer/payment records.
- Promotion automation may open a Draft production proposal. It must not merge.

The migration/seed SQL bytes are unchanged by this staging PR. These existing
operators still write on deployment even when a PR adds no new migration.

## Isolated expired-campaign fixture

The new operator `scripts/run-staging-air-care-fixture.sh staging` requires
`EXPECTED_RELEASE_SHA`, checks the checkout/deployed revision, and uses immutable
image IDs from the deployed staging app and PostgreSQL containers. It performs a
read-only real-catalog quote probe before and after fixture acceptance.

It creates only `cwf-staging-aircare-qa-network` (internal),
`cwf-staging-aircare-qa-db`, and `cwf-staging-aircare-qa-app`, failing if any already
exist. No ports are published, no shared volumes/env files are attached, no real
data is copied, and no external notification/payment credentials are supplied.
Database/password/JWT secrets are ephemeral. The schema is built from repository
sources in a new database; actual seed bytes are applied and eight original
closed-window rejections are verified before synthetic dates are set in that
isolated database only. All 25 prices still use real server quote paths.

On success or failure, the trap removes only resources created by this invocation,
including the disposable DB's anonymous volume. Cleanup failure fails the run;
inspect retained resources before retrying. This operator never alters real
staging sale dates or connects to production. The existing acceptance runner
proves Customer HTTP authentication/orders/readback and Admin-assisted scheduling;
it does not yet prove complete browser or Technician flows.

Local validation: fresh disposable PostgreSQL bootstrap, eight original expired
rejections, forty-eight Customer/Admin q1-q6 quotes, target/collision guards, and
the real HTTP acceptance runner passed. Customer/Admin synthetic order/payment/job
cleanup left zero transactional rows. Docker orchestration has syntax/contract
checks only on the Windows workstation (Docker unavailable); its actual image,
network and host behavior must be verified in the approved staging run.
Final local full suite: 1,846 passed, zero failed/skipped. Node 20 fixture/identity/
release tests: 14 passed, zero failed/skipped. No live staging operation was run.

## Acceptance checklist at the actual deployed revision

- Real campaign: closed-sale rejection for all four variants, Customer and Admin;
  unchanged dates after fixture cleanup. Existing paid rights retain own expiry.
- Synthetic fixture: Customer browser login, q1-q6/two BTU groups/mixed price,
  pending order, reload persistence, no entitlement before payment.
- Admin: accurate order/location/notes, wrong-amount rejection, concurrent and
  repeated confirmation creates one entitlement; paid reservation cannot mutate.
- Customer: full calendar selection and actual scheduling submit, not just
  begin-redemption; forbidden ownership and role operations reject.
- Admin-assisted scheduling: one linked job, zero second charge, correct queue
  and Technician assignment; duplicate/concurrent redemption creates one live job.
- Technician: correct prepaid amount/customer due/location/notes, normal assigned
  job lifecycle and completion; no second collection; completion/warranty readback.
- Cancellation/rescheduling: legitimate paid right restored/preserved, replacement
  allowed once, completed right cannot be reused; reload Customer/Admin/Tech.
- Verify fixture removal, real campaign unchanged, migration/seed evidence,
  actual deployed SHA/image, logs without credentials, and normal staging health.

## Rollback and production boundary

Record the pre-operation deployed staging SHA/image first; the branch baseline is
not proof of what is running. Proposed authorization includes a code-only rollback
to that captured revision if acceptance fails, only after deployctl behavior and
compatibility are established. The unchanged prepaid SQL is already in the
previous release line, but host/database state must still be checked. Preserve
schema and paid-right snapshots; do not reverse migrations or silently restore
the database. A database restore needs a specific backup and separate approval.
Manual rollback must not trigger seeds after #457 is active.

Backup freshness and restore/recovery evidence have NOT been verified on the host.
No restore was attempted. Before any production approval request, establish
production backup freshness, successful recovery evidence, rollback image/schema
compatibility, exact final SHA and automatic production seed/migration effects.
This proposal authorizes no production merge, deploy, seed, migration or rollback.
