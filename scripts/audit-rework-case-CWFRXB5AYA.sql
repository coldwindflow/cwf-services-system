-- READ-ONLY AUDIT — case_code='CWFRXB5AYA', technician_username='A2MKUNG'
--
-- Purpose: determine the ACTUAL original earned amount, which payout
-- period/line it lives in, whether that period is already paid, and whether
-- any duplicate hold/release/adjustment rows exist for this case+technician.
--
-- This script contains ONLY SELECT statements. It must never be edited to add
-- INSERT/UPDATE/DELETE, and must never be run against production until the
-- resulting report has been reviewed and approved. No amount is hardcoded —
-- every figure below comes from a live query.
--
-- Usage: psql "$PRODUCTION_DATABASE_URL" -f scripts/audit-rework-case-CWFRXB5AYA.sql

\set case_code 'CWFRXB5AYA'
\set tech 'A2MKUNG'

-- 1) The rework case itself.
SELECT rework_case_id, case_code, job_id, technician_username, reason_type,
       status, resolution, revisit_result, linked_deduction_case_id,
       created_at, resolved_at
  FROM public.technician_rework_cases
 WHERE case_code = :'case_code';

-- 2) The underlying job: status, finished_at history, warranty.
SELECT j.job_id, j.booking_code, j.job_status, j.technician_username,
       j.finished_at, j.returned_at, j.return_reason, j.warranty_end_at
  FROM public.jobs j
  JOIN public.technician_rework_cases rc ON rc.job_id = j.job_id
 WHERE rc.case_code = :'case_code';

-- 3) Any existing row in the new hold/release ledger for this case+tech
--    (will be empty if this case predates the ledger migration — that is
--    itself an important finding, not an error).
SELECT *
  FROM public.technician_rework_income_holds
 WHERE rework_case_id = (SELECT rework_case_id FROM public.technician_rework_cases WHERE case_code = :'case_code')
   AND technician_username = :'tech';

-- 4) Every payout_lines row for this job+technician across ALL periods
--    (gross earnings the payout engine computed — the ledger-grade source
--    of "what they actually earned", never a UI preview value).
SELECT l.payout_id, l.technician_username, l.job_id, l.earn_amount, l.line_id,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_lines l
  JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
  JOIN public.technician_rework_cases rc ON rc.job_id::text = l.job_id
 WHERE rc.case_code = :'case_code'
   AND l.technician_username = :'tech'
 ORDER BY p.period_start;

-- 5) Every adjustment row touching this job+technician across ALL periods
--    (deductions, rework holds, rework releases — anything that moved money
--    via the adjustment ledger). Look for duplicate positive (release) rows.
SELECT a.adj_id, a.payout_id, a.technician_username, a.job_id, a.adj_amount,
       a.reason, a.created_by, a.created_at,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_adjustments a
  JOIN public.technician_payout_periods p ON p.payout_id = a.payout_id
  JOIN public.technician_rework_cases rc ON rc.job_id::text = a.job_id
 WHERE rc.case_code = :'case_code'
   AND a.technician_username = :'tech'
 ORDER BY a.created_at;

-- 6) Duplicate-release smoke test: more than one positive adjustment for this
--    job+tech combination is a red flag (possible double release).
SELECT a.job_id, a.technician_username, COUNT(*) AS positive_adjustment_count,
       SUM(a.adj_amount) AS positive_adjustment_total
  FROM public.technician_payout_adjustments a
  JOIN public.technician_rework_cases rc ON rc.job_id::text = a.job_id
 WHERE rc.case_code = :'case_code'
   AND a.technician_username = :'tech'
   AND a.adj_amount > 0
 GROUP BY a.job_id, a.technician_username;

-- 7) Payment status for every period touched by this job+tech, so we can see
--    whether the period the original earning fell into has already been paid
--    (which would mean invariant 6 — never touch a paid period — applies).
SELECT pay.payout_id, pay.technician_username, pay.paid_amount, pay.paid_status,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_payments pay
  JOIN public.technician_payout_periods p ON p.payout_id = pay.payout_id
 WHERE pay.technician_username = :'tech'
   AND pay.payout_id IN (
     SELECT DISTINCT l.payout_id
       FROM public.technician_payout_lines l
       JOIN public.technician_rework_cases rc ON rc.job_id::text = l.job_id
      WHERE rc.case_code = :'case_code'
     UNION
     SELECT DISTINCT a.payout_id
       FROM public.technician_payout_adjustments a
       JOIN public.technician_rework_cases rc ON rc.job_id::text = a.job_id
      WHERE rc.case_code = :'case_code'
   )
 ORDER BY p.period_start;

-- 8) job_update_logs trail for this job, for a human-readable timeline of
--    rework_case_created / revisit_result / rework_case_resolved events.
SELECT job_id, actor_username, actor_role, action, message, payload, created_at
  FROM public.job_update_logs
 WHERE job_id = (SELECT job_id FROM public.technician_rework_cases WHERE case_code = :'case_code')
 ORDER BY created_at;
