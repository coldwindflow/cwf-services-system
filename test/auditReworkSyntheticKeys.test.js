const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SQL_PATH = path.join(__dirname, '..', 'scripts', 'audit-rework-case-CWFRXB5AYA.sql');

// The duplicate-release smoke test and the payment-periods query must use the
// exact same synthetic-key predicate as the main adjustment query, otherwise
// they silently miss rework hold/release rows (whose job_id is a synthetic
// string like rework_hold:<case_id>:<job_id>, not the literal job_id).
test('audit script applies the synthetic-key predicate consistently to every adjustment query', () => {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');

  const holdLikeCount = (sql.match(/a\.job_id::text LIKE 'rework_hold:%:'/g) || []).length;
  const releaseLikeCount = (sql.match(/a\.job_id::text LIKE 'rework_release:%:'/g) || []).length;

  // section 5 (main adjustment query), section 6 (duplicate-release smoke
  // test), section 7 (payment-periods UNION) must each carry one copy.
  assert.equal(holdLikeCount, 3);
  assert.equal(releaseLikeCount, 3);

  // No adjustments query should still use the plain jobs-join pattern that
  // can't match synthetic job_id values.
  assert.ok(!/JOIN public\.jobs j ON j\.job_id::text = a\.job_id::text/.test(sql));
});
