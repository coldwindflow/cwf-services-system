#!/usr/bin/env node
"use strict";

// One-time, fail-closed Staging cleanup for Owner decision B. This file and
// its workflow step must be removed after the corrected revision is deployed.
const assert = require("node:assert/strict");
const pool = require("../db");

const FILENAME = "partner_onboarding_phase2f_admin_job_override.sql";
const SHA256 = "858498c136357884d1f043249d1b282941b493536a29fbd71928ddd107573669";
const COLUMNS = [
  "admin_job_override_enabled", "admin_job_override_by",
  "admin_job_override_at", "admin_job_override_note",
];

async function run() {
  assert.equal(process.env.CWF_ENVIRONMENT, "staging", "Staging environment required");
  assert.equal(process.env.CWF_STAGING_QA_CONTAINER, "cwf-staging-app", "Staging app container required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE public.partner_applications IN ACCESS EXCLUSIVE MODE");
    await client.query("LOCK TABLE public.partner_onboarding_events IN SHARE ROW EXCLUSIVE MODE");
    const ledger = await client.query(
      "SELECT filename, sha256, applied_commit FROM public.findfix_schema_migrations WHERE filename=$1 FOR UPDATE",
      [FILENAME]
    );
    const schema = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='partner_applications'
          AND column_name=ANY($1::text[])`, [COLUMNS]
    );
    const present = schema.rows.map(row => row.column_name).sort();
    if (!ledger.rows.length && !present.length) {
      await client.query("COMMIT");
      console.log("[PARTNER_RETIRE] already_retired=true");
      return;
    }
    assert.equal(ledger.rows.length, 1, "Expected exactly one applied migration record");
    assert.equal(ledger.rows[0].sha256, SHA256, "Applied migration checksum changed");
    assert.deepEqual(present, [...COLUMNS].sort(), "Partner override schema is incomplete");
    const data = await client.query(
      `SELECT count(*)::int AS touched FROM public.partner_applications
        WHERE admin_job_override_enabled OR admin_job_override_by IS NOT NULL
           OR admin_job_override_at IS NOT NULL OR admin_job_override_note IS NOT NULL`
    );
    const events = await client.query(
      "SELECT count(*)::int AS touched FROM public.partner_onboarding_events WHERE event_type LIKE $1",
      ["admin_job_override_%"]
    );
    assert.equal(data.rows[0].touched, 0, "Partner override contains data; refusing retirement");
    assert.equal(events.rows[0].touched, 0, "Partner override has audit events; refusing retirement");
    await client.query(
      `ALTER TABLE public.partner_applications
         DROP COLUMN admin_job_override_enabled,
         DROP COLUMN admin_job_override_by,
         DROP COLUMN admin_job_override_at,
         DROP COLUMN admin_job_override_note`
    );
    const retired = await client.query(
      "DELETE FROM public.findfix_schema_migrations WHERE filename=$1 AND sha256=$2 RETURNING filename",
      [FILENAME, SHA256]
    );
    assert.equal(retired.rowCount, 1, "Migration ledger retirement was not unique");
    await client.query("COMMIT");
    console.log("[PARTNER_RETIRE] columns_removed=4 ledger_rows_removed=1 touched_applications=0 override_events=0");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

run().catch(error => { console.error("[PARTNER_RETIRE] " + error.message); process.exitCode = 1; })
  .finally(() => pool.end());
