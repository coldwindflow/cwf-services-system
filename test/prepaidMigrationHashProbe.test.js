const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

test('print prepaid migration sha256 for deploy allowlist', () => {
  const bytes = fs.readFileSync('migrations/20260906_prepaid_service_entitlements.sql');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  console.log(`PREPAID_MIGRATION_SHA256=${hash}`);
  assert.equal(hash.length, 64);
});
