# AIR CARE release candidate: PR #453

Audit date: 2026-11-14 (Asia/Bangkok). This document records code/test evidence,
not permission to deploy or evidence that a live environment has been verified.

## Source and scope

- Existing PR: https://github.com/coldwindflow/cwf-services-system/pull/453
- Head before this audit: `b3c439381f2678c5c31164c05cb4055098be467a`,
  `fix/prepaid-lifecycle-db-gate-production`.
- Production base: `0de0963556e9e333b7b9786038459000d5a881f3`.
- Staging base: `3b91c6876f90fbeb209bfabe533e321de1ac85e5`.
- Main: `ab78cae9be7d58f3822b47fdadc5540e464b9bc5`.
- Issue #382 is completed through PR #383. PR #394 is merged. Their historical
  branches are not the current release candidate.

The original six commits explain the 25-file PR diff: database lifecycle tests
and migration prerequisites; technician notes/prepaid settlement projections;
matching PWA versions; repair of database fixtures and clocks; full PostgreSQL
CI; and seed pricing separated from live eligibility. These changes are retained.
The old four-file/no-application-change description was inaccurate.

Before the corrections in this audit, the PR head and staging had identical
application/test/operator content. The only tree differences were five
production infrastructure files: `.env.production.example`,
`Dockerfile.production`, `compose.production.yml`,
`.github/workflows/cwf-home-production.yml`, and
`scripts/local-postgres-preload.js`. Promote only the new correction commits
onto the existing staging development branch; do not copy those five files into
staging and do not merge all of main. Main still carries intentionally deferred
Partner override changes.

## Confirmed corrections

1. Closed-window seed verification accepted any exception as correct rejection
   and checked only Standard/customer. It now requires the expected eligibility
   error for all four variants, Customer and Admin, using each bundle's window.
2. The operator omitted q2/q3. It now verifies q1-q6 plus mixed Premium: 25 prices.
   Behavioral tests reproduce corrupt q2 and Premium/Admin-only bypasses.
3. Historical pricing used a historical resolver clock but a live snapshot
   expiry clock. The snapshot now accepts an injected service clock; only the
   historical verifier/test supplies it. Default Customer/Admin behavior stays
   on real time. Existing sale dates and prices are unchanged.
4. A real Admin booking test skipped HTTP 500 because its fixture lacked
   `catalog_items.price_rule_id`. The fixture is repaired and unsuccessful
   booking now fails the assertion. No production schema is changed.
5. The prepaid database suite now exercises real order/payment/redemption
   services and the real seed, including concurrent purchase/payment/redemption,
   owner checks, cancellation, Admin replacement, completion and warranty.
   Schema setup failures no longer turn into skipped tests.
6. Automatic seed/migration and staging-to-production PR follow-ups must require
   the triggering deployment's event to be `push`. A successful manual status,
   restart, rollback or manual deploy is not authorization for follow-on writes.
   The companion release-control correction must land on main as well as the
   release branches before relying on this guard.

No auth protocol, payment provider, stored campaign seed, historical migration,
Partner override, frontend bytes, or deployment target is changed by this audit.
The existing PR's technician/PWA corrections remain part of its total scope.

## Lifecycle trace and evidence

Customer `customer-app/modules/prepaid.js` and Admin prepaid screens send package
groups to their prepaid quote/order routes. Both call
`server/services/prepaid/prepaidOrderServiceV2.js`, which uses the shared package
resolver, repository and pricing policy. Client prices are not authoritative.
The pending order stores contact/location and immutable service/price snapshots.
Manual confirmation locks the order and the paid-order trigger issues one right.
Customer ownership checks or guarded Admin preparation issue redemption tokens;
the package resolver revalidates the paid snapshot inside the booking transaction.
Database triggers bind one live job, set customer due to zero, and preserve
payment/revenue. Cancelling an unfinished job restores the right; completion does
not. Rights readback computes the warranty from completion.

Local validation uses Node 22.22.2 and a newly initialized, loopback-only
PostgreSQL 18 cluster on port 55453. No shared/production database is used.
Both opt-in database suites use separate throwaway databases with bootstrap
enabled. Git source bytes are LF, matching CI; Windows autocrlf initially broke
source-text/checksum tests and was corrected in the isolated worktree.

- Final full suite including release guards: 1,840 passed, 0 failed,
  0 skipped. This includes syntax checks for all tracked JavaScript.
- Node 20.20.2 compatibility: 113 scoped tests passed, 0 failed, 0 skipped.
- Three added release-condition tests fail on the old workflow expressions and
  pass with the push-event guards. They execute the actual job conditions.
- Real seed probe: valid seed passes; corrupt q2 fails. Historical expiry and
  closed-sale eligibility are separate tests.
- Real HTTP Admin location suite: 19 passed, 0 skipped.
- `git diff --check` and changed shell syntax checks pass.

These are service/SQL, route and regression tests. They do not replace live
browser acceptance, production authentication, operator readiness, or external
payment/notification verification. CI uses PostgreSQL 16; checked-in deployment
compose files specify PostgreSQL 17. Dockerfiles use Node 20 while CI uses 22;
this audit tests both Node majors instead of silently upgrading deployment.

### Application layout and reproducible commands

`index.js` boots the Express API; `server/routes` and `server/services` contain
HTTP handlers and domain logic, including shared pricing and prepaid services.
`db.js` configures PostgreSQL. Root HTML/JavaScript serves Admin and Technician
screens; `customer-app` contains the customer PWA. Root `sw.js`/`cwf-pwa.js` and
customer app cache files require coordinated versioning for frontend changes.
`migrations` owns schema, `data-seeds` owns catalog/campaign data, `scripts` owns
migration/probe/operator entry points, and `test` contains Node test-runner suites.

Install with Node 22: `npm ci --no-audit --no-fund`. Run `npm test` (equivalent
to `node --test test/*.test.js`). Run changed JavaScript through `node --check`,
changed shell scripts through `bash -n`, and `git diff --check BASE...HEAD`.
For PostgreSQL evidence, use only a disposable local server and set
`PGHOST=127.0.0.1`, its explicit `PGPORT`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE=cwf_test`, and `PGSSLMODE=disable`. Clear inherited production
connection settings before testing. The two opt-in suites additionally require
`CWF_ISSUE267_TEST_DATABASE_URL` and `CWF_ISSUE310_TEST_DATABASE_URL` pointing to
two separate disposable databases; first-run bootstrap uses
`CWF_ISSUE267_TEST_BOOTSTRAP=1` and `CWF_ISSUE310_TEST_BOOTSTRAP=1`.
Run `node --test test/prepaidLifecycleDatabase.test.js` for the 14-case lifecycle
gate and reject any skips. Full zero-skip output is the stronger local gate.

## Release controls and required order

1. Review the exact PR diff and latest head SHA; require successful ordinary and
   PostgreSQL CI. Local zero-skip evidence covers the four opt-in database cases
   that the existing CI configuration intentionally skips.
2. Review the companion main-only release-control PR. `workflow_run` executes
   against the default branch, so changing only PR #453 cannot activate its
   guard. See [GitHub's event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run).
3. Audit branch protection with an owner/admin-capable connection. Branches
   main/staging/production report protected, but the integration cannot read
   required checks, reviewer counts or bypass rights (403). The environments
   endpoint returned zero environments on the audit date. Deployment jobs do not
   reference protected environments. Do not infer owner approval enforcement.
4. The latest automatic promotion failures say Actions is not permitted to create
   or approve PRs. An owner can enable the intended permission or retain a
   manually reviewed promotion process. No repository setting was changed here.
5. Authorize the narrow staging promotion only after review and CI. A push to
   `staging/home-server-test` applies the guarded prepaid migration and deploys;
   its successful push workflow triggers migration/seed verification and QA
   provisioning. Those are writes, not just code deployment.
6. Verify the deployed staging SHA, seed/migration evidence, Customer/Admin/Tech
   browser behavior, refresh persistence, ownership, manual payment, scheduling,
   cancellation, completion and receipts. Use the designated QA identity and
   `CWF_STAGING_QA_SECRET`; do not use ordinary customer records.
7. The campaign ended on 2026-10-06. The existing staging acceptance runner starts
   by purchasing AIR CARE on the live clock, so it cannot establish a successful
   new purchase now. Keep closed-sale rejection as an acceptance requirement.
   A separately authorized, isolated staging fixture/campaign is needed to prove
   the full new-purchase flow; never reopen the real campaign to make QA green.
   Existing paid rights must remain usable until their own expiry.
8. Before production approval, verify backup freshness and a restoration drill,
   rollback revision/schema compatibility, runner health, and host deployctl
   behavior. This audit did not access that host or production data. YAML calls
   `/usr/local/sbin/cwf-deployctl`; its backup/rollback guarantees cannot be
   established from this repository alone. The app healthcheck only exercises
   pricing preview, not the full prepaid lifecycle.
9. Obtain explicit owner approval for the final production SHA and each automatic
   migration/seed operation before merging PR #453. A production branch push is
   a deployment event. Follow-up schema/seed failure occurs after app deployment;
   workflow success alone is not a complete release verdict. A manual rollback
   requires separate owner approval and must not automatically reseed.
10. After approved deployment, verify actual revision and owner-approved live
    acceptance. Only then can readiness for real customer booking be claimed.

## Rollback and remaining limits

This patch adds no migration or seed data changes. Reverting its code restores
the older, weaker verification behavior and should be reviewed, not automated.
Do not undo historical prepaid migrations or sold-right snapshots. Reverting a
merge into production also triggers deployment and needs owner approval.

Current status: BLOCKED for real-customer readiness until exact-SHA staging
acceptance, release-control review, backup/recovery evidence, explicit owner
production authorization, and live production verification are complete.

สรุป: แก้ seed gate ที่อาจผ่านผิดพลาดและการข้ามทดสอบ Admin booking แล้ว
เพิ่มหลักฐานจากฐานข้อมูลจริงโดยไม่เปิดแคมเปญที่หมดอายุ ไม่แก้ข้อมูลลูกค้าจริง
ยังต้องผ่าน staging และได้รับอนุมัติจากเจ้าของก่อนดำเนินการ production
