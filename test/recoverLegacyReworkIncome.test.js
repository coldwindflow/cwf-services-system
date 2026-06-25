const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, validateApply } = require('../scripts/recover-legacy-rework-income');

test('parseArgs accepts both --key value and --key=value forms', () => {
  const spaceForm = parseArgs(['node', 'script.js', '--booking-code', 'CWFRXB5AYA', '--technician', 'A2MKUNG', '--apply']);
  assert.equal(spaceForm.bookingCode, 'CWFRXB5AYA');
  assert.equal(spaceForm.technician, 'A2MKUNG');
  assert.equal(spaceForm.apply, true);

  const eqForm = parseArgs(['node', 'script.js', '--booking-code=CWFRXB5AYA', '--technician=A2MKUNG', '--apply']);
  assert.equal(eqForm.bookingCode, 'CWFRXB5AYA');
  assert.equal(eqForm.technician, 'A2MKUNG');
  assert.equal(eqForm.apply, true);

  const mixedForm = parseArgs(['node', 'script.js', '--booking-code=CWFRXB5AYA', '--technician', 'A2MKUNG']);
  assert.equal(mixedForm.bookingCode, 'CWFRXB5AYA');
  assert.equal(mixedForm.technician, 'A2MKUNG');
});

function baseReport(overrides = {}) {
  return {
    job: { finished_at: '2026-06-20T10:00:00+07:00' },
    reworkCase: { resolution: 'fixed', revisit_result: null },
    holds: [],
    adjustments: [],
    proposedAmount: 325,
    sourcePayoutId: 'payout_2026-06_25',
    sourcePeriodStatus: 'draft',
    ...overrides,
  };
}

function baseArgs(overrides = {}) {
  return {
    confirm: 'APPLY_LEGACY_REWORK_RECOVERY',
    expectedAmount: '325',
    technician: 'A2MKUNG',
    ...overrides,
  };
}

test('validateApply rejects a preview-only source, it is not an authoritative payout line', () => {
  const report = baseReport({ sourcePeriodStatus: 'preview_only' });
  assert.throws(() => validateApply(report, baseArgs()), /SOURCE_IS_PREVIEW_ONLY/);
});

test('validateApply accepts a real payout-line-backed draft source', () => {
  const report = baseReport();
  assert.equal(validateApply(report, baseArgs()), 325);
});

test('validateApply still rejects when there is no proposed amount at all', () => {
  const report = baseReport({ proposedAmount: null, sourcePeriodStatus: null });
  assert.throws(() => validateApply(report, baseArgs()), /SOURCE_AMOUNT_AMBIGUOUS/);
});
