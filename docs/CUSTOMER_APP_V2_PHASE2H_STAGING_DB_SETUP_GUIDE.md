# Customer App V2 Phase 2H-2.1A Staging DB Setup Guide

Date: 2026-06-17
Repo: `coldwindflow/cwf-services-system`
Baseline main SHA inspected: `a516e81b3cc9dc3a02c4427cf5d32318f5574526`

## 1. Current Blocker

Phase 2H-2.1 staging migration testing cannot proceed yet because staging/preview database identity has not been verified and `psql` is unavailable in the current environment.

No migration has been run. No production database apply is approved.

Before any Phase 2H-2.1 migration test can continue, CWF needs a confirmed non-production database and a safe SQL runner that can connect to it.

## 2. Safe Options to Create Staging DB

Use one of these non-production options:

- Render staging or preview PostgreSQL database.
- Separate PostgreSQL database cloned from schema only.
- Local disposable PostgreSQL database through Docker.
- Any other safe non-production database created only for migration testing.

The database must be isolated from production. If there is any doubt about whether the database is production, stop immediately.

## 3. Required Credentials

Set credentials locally in the shell or through the hosting platform's secret manager. Do not commit these values and do not paste real secrets into chat.

PowerShell example with placeholders only:

```powershell
$env:DB_HOST="staging-host"
$env:DB_PORT="5432"
$env:DB_USER="staging-user"
$env:DB_PASSWORD="staging-password"
$env:DB_NAME="staging-db"
```

Bash example with placeholders only:

```bash
export DB_HOST="staging-host"
export DB_PORT="5432"
export DB_USER="staging-user"
export DB_PASSWORD="staging-password"
export DB_NAME="staging-db"
```

Required values:

- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

## 4. Install / Access `psql`

Use any one of these safe options:

- Install the PostgreSQL client locally.
- Use a Docker PostgreSQL client.
- Use Render shell if available and connected to the staging/preview database only.
- Use any machine that has `psql` and staging credentials.

Docker client example with placeholders only:

```bash
docker run --rm -it postgres:16 psql "postgresql://USER:PASSWORD@HOST:5432/DBNAME"
```

PowerShell local client example after setting environment variables:

```powershell
psql "postgresql://$env:DB_USER`:$env:DB_PASSWORD@$env:DB_HOST`:$env:DB_PORT/$env:DB_NAME"
```

Bash local client example after setting environment variables:

```bash
psql "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
```

Do not use a SQL runner that hides the target host/database/user. The tester must be able to verify the connected database identity before running migration SQL.

## 5. DB Identity Verification

Run this before any migration or schema check:

```sql
SELECT
  current_database() AS database_name,
  current_user AS connected_user,
  inet_server_addr() AS server_address,
  version() AS postgres_version;
```

Stop immediately if the database name, host, server address, or user looks like production.

Do not rely on memory or assumptions. The database identity must be verified from the active SQL connection.

## 6. Safe Test Flow

After staging/preview DB identity and `psql` access are confirmed:

1. Verify the connected DB identity.
2. Run `docs/CUSTOMER_APP_V2_PHASE2H_STAGING_MIGRATION_TEST_PLAN.md`.
3. Run `migrations/20260617_phase2h_customer_locations.sql` on staging/preview only.
4. Record start time, end time, duration, warnings, and errors.
5. Run the migration a second time if safe to verify idempotency.
6. Run schema verification queries from the Phase 2H-2.1 test plan.
7. Run the manual concurrent index test separately outside a transaction.
8. Optionally run FK validation on staging/preview only.
9. Smoke test current app behavior against the migrated staging/preview database.
10. Rehearse rollback on staging/preview.
11. Return the results to ChatGPT for review.

Do not run production migration during this flow.

## 7. Secret Handling Rules

- Never paste production DB credentials in chat.
- Never commit `.env`.
- Never commit DB URLs.
- Never commit host/user/password values.
- Use local shell environment variables or platform secrets.
- Redact host, user, and password when reporting back.
- If logs include a connection string, redact it before sharing.

Acceptable report style:

```text
DB host: redacted staging host
DB user: redacted staging user
DB password: redacted
```

Do not include real credential values in GitHub PRs, docs, screenshots, or chat.

## 8. Required Report Back Format

After preparing the environment or running the staging test, report results in this format:

```text
DB identity verified: yes/no
DB type: staging/preview/local disposable
psql available: yes/no
Migration applied: yes/no
Idempotency second run: passed/failed/not run
Schema checks: passed/failed/not run
Smoke tests: passed/failed/not run
Rollback rehearsal: passed/failed/not run
Production touched: no
Blockers:
```

If the staging test is still blocked, explain the exact missing item, such as missing `psql`, missing staging credentials, unclear database identity, or unavailable app smoke-test environment.

## 9. Go/No-go

- If staging DB identity cannot be verified, stop.
- If `psql` or another safe SQL runner is unavailable, stop.
- If the staging test fails, do not apply production.
- If the staging test passes, ChatGPT must review the results before production DB approval.
- Production DB apply requires explicit owner approval after staging results, lock/performance observations, rollback rehearsal, and app smoke tests are reviewed.

Phase 2H-3 backend APIs must not begin until the staging/preview migration test passes.
