-- READ-ONLY audit for booking CWFRXB5AYA / technician A2MKUNG
-- Usage:
--   psql "$PRODUCTION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-rework-case-CWFRXB5AYA.sql

\set booking_code 'CWFRXB5AYA'
\set tech 'A2MKUNG'

BEGIN TRANSACTION READ ONLY;

SELECT j.job_id, j.booking_code, j.job_status, j.technician_username,
       j.finished_at, j.returned_at, j.return_reason, j.warranty_end_at
  FROM public.jobs j
 WHERE j.booking_code = :'booking_code';

SELECT rc.rework_case_id, rc.case_code, rc.job_id, rc.technician_username,
       rc.reason_type, rc.status, rc.resolution, rc.revisit_result,
       rc.linked_deduction_case_id, rc.created_at, rc.resolved_at
  FROM public.technician_rework_cases rc
  JOIN public.jobs j ON j.job_id = rc.job_id
 WHERE j.booking_code = :'booking_code'
 ORDER BY rc.created_at, rc.rework_case_id;

SELECT h.*
  FROM public.technician_rework_income_holds h
  JOIN public.jobs j ON j.job_id = h.job_id
 WHERE j.booking_code = :'booking_code'
   AND h.technician_username = :'tech'
 ORDER BY h.created_at, h.hold_id;

SELECT l.payout_id, l.technician_username, l.job_id, l.earn_amount, l.line_id,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_lines l
  JOIN public.technician_payout_periods p ON p.payout_id = l.payout_id
  JOIN public.jobs j ON j.job_id::text = l.job_id::text
 WHERE j.booking_code = :'booking_code'
   AND l.technician_username = :'tech'
 ORDER BY p.period_start, l.line_id;

SELECT a.adj_id, a.payout_id, a.technician_username, a.job_id, a.adj_amount,
       a.reason, a.created_by, a.created_at,
       p.period_type, p.period_start, p.period_end, p.status AS period_status
  FROM public.technician_payout_adjustments a
  JOIN public.technician_payout_periods p ON p.payout_id = a.payout_id
 WHERE a.technician_username = :'tech'
   AND (
     a.job_id::text = (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.job_id::text LIKE 'rework_hold:%:' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.job_id::text LIKE 'rework_release:%:' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1)
     OR a.reason LIKE '%job_id=' || (SELECT job_id::text FROM public.jobs WHERE booking_code = :'booking_code' LIMIT 1) || '%'
   )
 ORDER BY a.created_at, a.adj_id;

SELECT h.rework_case_id, h.technician_username,
       COUNT(a.adj_id) AS release_adjustment_count,
       COALESCE(SUM(a.adj_amount),0) AS release_adjustment_total
  FROM public.technician_rework_income_holds h
  LEFT JOIN public.technician_payout_adjustments a
    ON a.adj_id = h.release_adjustment_id
  JOIN public.jobs j ON j.job_id = h.job_id
 WHERE j.booking_code = :'booking_code'
   AND h.technician_username = :'tech'
 GROUP BY h.rework_case_id, h.technician_username;

SELECT pay.payout_id, pay.technician_username, pay.paid_amount, pay.paid_status,
       pay.paid_at, p.period_type, p.period_start, p.period_end,
       p.status AS period_status
  FROM public.technician_payout_payments pay
  JOIN public.technician_payout_periods p ON p.payout_id = pay.payout_id
 WHERE pay.technician_username = :'tech'
 ORDER BY p.period_start;

SELECT l.job_id, l.actor_username, l.actor_role, l.action, l.message,
       l.payload, l.created_at
  FROM public.job_update_logs l
  JOIN public.jobs j ON j.job_id = l.job_id
 WHERE j.booking_code = :'booking_code'
 ORDER BY l.created_at;

COMMIT;
