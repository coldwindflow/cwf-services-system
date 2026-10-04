'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { evaluatePartnerJobEligibility } = require('../server/services/partner/jobEligibility');

test('admin override migration is additive and lets deployctl own the transaction', () => {
  const sql = fs.readFileSync('migrations/partner_onboarding_phase2f_admin_job_override.sql', 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS admin_job_override_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT|ROLLBACK)\s*;/i);
  assert.doesNotMatch(sql, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
});

test('admin override allows incomplete onboarding eligibility', () => {
  const r = evaluatePartnerJobEligibility({
    requiredCodes:['clean_wall_normal'],
    certifications:[],
    adminOverride:true,
    requirePreferences:true,
    preferenceOff:['clean_wall_normal'],
    paused:true,
    zoneMatch:false,
  });
  assert.equal(r.eligible, true);
  assert.deepEqual(r.missing, ['clean_wall_normal']);
});

test('suspended or revoked certification remains a safety block during override', () => {
  for (const status of ['suspended','revoked']) {
    const r = evaluatePartnerJobEligibility({
      requiredCodes:['clean_wall_normal'],
      certifications:[{code:'clean_wall_normal', status}],
      adminOverride:true,
      requirePreferences:true,
      paused:true,
      zoneMatch:false,
    });
    assert.equal(r.eligible, false);
    assert.deepEqual(r.blocked, ['clean_wall_normal']);
  }
});

test('normal non-overridden partner still needs ordinary eligibility gates', () => {
  const incomplete = evaluatePartnerJobEligibility({
    requiredCodes:['clean_wall_normal'],
    certifications:[{code:'clean_wall_normal',status:'approved'}],
    adminOverride:false,
    requirePreferences:true,
    preferenceOff:['clean_wall_normal'],
    paused:false,
    zoneMatch:true,
  });
  assert.equal(incomplete.eligible, false);

  const ready = evaluatePartnerJobEligibility({
    requiredCodes:['clean_wall_normal'],
    certifications:[{code:'clean_wall_normal',status:'approved'}],
    adminOverride:false,
    requirePreferences:true,
    preferenceOff:[],
    paused:false,
    zoneMatch:true,
  });
  assert.equal(ready.eligible, true);
});
