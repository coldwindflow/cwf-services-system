'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const migrationPath = path.join(root, 'migrations', '20260920_job_brand_foundation.sql');
const operatorPath = path.join(root, 'scripts', 'run-production-job-brand-migration.sh');
const workflowPath = path.join(root, '.github', 'workflows', 'cwf-production-job-brand-migration.yml');
const expectedSha = '99a280a2030aad01520d194f006bde469edd43dd70df417d1bb10b767a50a1c2';

test('approved job-brand migration bytes remain checksum pinned', () => {
  const bytes = fs.readFileSync(migrationPath);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectedSha);
});

test('production operator fails closed around target, checksum, backup and invariants', () => {
  const s = fs.readFileSync(operatorPath, 'utf8');
  assert.match(s, /CWF_ENVIRONMENT:-.*production/);
  assert.match(s, /EXPECTED_MIGRATION_SHA256=/);
  assert.match(s, /migration SHA256 mismatch/);
  assert.match(s, /cwf-deployctl production list-backups/);
  assert.match(s, /Production backup listing did not contain recognizable backup evidence/);
  assert.match(s, /brand_key.*data_type='text'.*is_nullable='NO'/s);
  assert.match(s, /brand_key IS NULL/);
  assert.match(s, /brand_key <> 'cwf'/);
  assert.match(s, /jobs count changed/);
});

test('workflow is manual, main-only and confirmation-gated', () => {
  const s = fs.readFileSync(workflowPath, 'utf8');
  assert.match(s, /workflow_dispatch:/);
  assert.match(s, /MIGRATE_JOB_BRAND_20260920/);
  assert.match(s, /refs\/heads\/main/);
  assert.match(s, /GIT_CONFIG_NOSYSTEM:\\s*["']1["']/);
  assert.match(s, /99a280a2030aad01520d194f006bde469edd43dd70df417d1bb10b767a50a1c2/);
  assert.match(s, /scripts\/run-production-job-brand-migration\.sh/);
  assert.doesNotMatch(s, /cwf-deployctl production deploy/);
  assert.doesNotMatch(s, /cwf-deployctl production restart/);
});
