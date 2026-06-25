-- READ-ONLY audit for booking CWFRXB5AYA
--
-- Looked up via jobs.booking_code, NOT technician_rework_cases.case_code
-- (those are two different generated codes — case_code identifies the rework
-- case row itself, booking_code identifies the customer's job/booking). Using
-- case_code here would silently audit the wrong row (or nothing at all) if the
-- two codes ever differ.
--
-- Does not hardcode a single technician_username: a job can have a team, and
-- every team member's hold/release must be visible, not just whoever happens
-- to be on the job's technician_username column.
--
-- This script contains ONLY SELECT statements (wrapped in a READ ONLY
-- transaction as a belt-and-suspenders guard) and must never be edited to add
-- INSERT/UPDATE/DELETE.
--
-- Usage:
--   psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-rework-case-CWFRXB5AYA.sql

\set booking_code 'CWFRXB5AYA'

BEGIN TRANSACTION READ ONLY;

-- 1) The job itself: status, finished_at history, warranty, booking_code match.
SELECT j.job_id, j.booking_code, j.job_status, j.technician_username,
       j.finished_at, j.returned_at, j.return_reason, j.warranty_end_at
  FROM public.jobs j
 WHERE j.booking_code = :'booking_code';

-- 2) Every rework case ever opened against this job (there may be more than one
--    over the job's lifetime).
SELECT rc.rework_case_id, rc.case_code, rc.job_id, rc.technician_username,
       rc.reason_type, rc.status, rc.resolution, rc.revisit_result,
       rc.linked_deduction_case_id, rc.created_at, rc.resolved_at
  FROM public.technician_rework_cases rc
  JOIN public.jobs j ON j.job_id = rc.job_id
 WHERE j.booking_code = :'booking_code'
 ORDER BY rc.created_at, rc.rework_case_id;

-- 3) Every hold/release ledger row for every rework case + every technician on
--    this job (will be empty if this case predates the ledger migration — that
--    is itself an important finding, not an error).
SELECT h.*
  FROM public.technician_rework_income_holds h
  JOIN public.jobs j ON j.job_id = h.job_id
 WHERE j.booking_code = :'booking_code'
 ORDER BY h.rework_case_id, h.technician_username, h.hold_id;

-- 4) Every payout_lines row for this job, across every technician who ever
--    earned income on it and across ALL periods (the ledger-grade source of
--    "what they actually earned", never a UI preview value).
SELECT l.payout_id, l.technician_username, l.job_id, l.earn_amount, l.line_id,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_lines l
  JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
  JOIN public.jobs j ON j.job_id::text = l.job_id::text
 WHERE j.booking_code = :'booking_code'
 ORDER BY l.technician_username, p.period_start;

-- 5) Every adjustment row touching this job, across every technician and every
--    period (deductions, rework holds, rework releases, manual compensation —
--    anything that moved money via the adjustment ledger). job_id on the
--    adjustments table is a synthetic key for rework hold/release rows
--    (rework_hold:<case_id>:<job_id> / rework_release:<case_id>:<job_id>), so
--    match on the real job_id text as well as those synthetic forms.
SELECT a.adj_id, a.payout_id, a.technician_username, a.job_id, a.adj_amount,
       a.reason, a.created_by, a.created_at,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_adjustments a
  JOIN public.technician_payout_periods p ON p.payout_id = a.payout_id
 WHERE (
     a.job_id::text = (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.job_id::text LIKE 'rework_hold:%:' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.job_id::text LIKE 'rework_release:%:' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.reason LIKE '%job_id=' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1) || '%'
   )
 ORDER BY a.technician_username, a.created_at;

-- 6) Duplicate-release smoke test: more than one positive, non-release-tagged
--    adjustment for the same job+tech is a red flag (possible double-count of
--    a release as a gross line — see _loadApprovedReworkCompensationLines).
SELECT a.job_id, a.technician_username,
       COUNT(*) FILTER (WHERE a.adj_amount > 0) AS positive_adjustment_count,
       SUM(a.adj_amount) FILTER (WHERE a.adj_amount > 0) AS positive_adjustment_total,
       COUNT(*) FILTER (WHERE a.adj_amount > 0 AND a.reason LIKE '[REWORK_RELEASE]%') AS release_adjustment_count
  FROM public.technician_payout_adjustments a
  JOIN public.jobs j ON j.job_id::text = a.job_id::text
 WHERE j.booking_code = :'booking_code'
 GROUP BY a.job_id, a.technician_username
 ORDER BY a.technician_username;

-- 7) Payment status for every period touched by this job, per technician, so we
--    can see whether the period the original earning fell into has already
--    been paid (which is exactly the case the carried-forward hold handles).
SELECT pay.payout_id, pay.technician_username, pay.paid_amount, pay.paid_status,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_payments pay
  JOIN public.technician_payout_periods p ON p.payout_id = pay.payout_id
 WHERE pay.payout_id IN (
     SELECT DISTINCT l.payout_id
       FROM public.technician_payout_lines l
       JOIN public.jobs j ON j.job_id::text = l.job_id::text
      WHERE j.booking_code = :'booking_code'
     UNION
     SELECT DISTINCT a.payout_id
       FROM public.technician_payout_adjustments a
       JOIN public.jobs j ON j.job_id::text = a.job_id::text
      WHERE j.booking_code = :'booking_code'
   )
 ORDER BY p.period_start, pay.technician_username;

-- 8) job_update_logs trail for this job, for a human-readable timeline of
--    rework_case_created / revisit_result / rework_case_resolved events.
SELECT job_id, actor_username, actor_role, action, message, payload, created_at
  FROM public.job_update_logs
 WHERE job_id = (SELECT job_id FROM public.jobs WHERE booking_code = :'booking_code')
 ORDER BY created_at;

COMMIT;
