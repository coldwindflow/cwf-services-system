function toIsoDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,'0');
  const dd = String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function normWorkDayPayload(input = {}){
  // Advance calendar v3 intentionally has only 2 statuses:
  // advance_only = รับงานล่วงหน้า, unavailable = ไม่รับงานล่วงหน้า
  // Holiday/leave are treated as unavailable and can be explained in note.
  let raw = String(input.day_status || '').trim();
  if (input.can_accept_advance_job === true) raw = 'advance_only';
  else if (input.can_accept_advance_job === false) raw = 'unavailable';
  else if (['advance_only','available_advance','working','available','accept'].includes(raw)) raw = 'advance_only';
  else raw = 'unavailable';
  const day_status = raw;
  const canAdvance = day_status === 'advance_only';
  const start_time = canAdvance ? (/^\d{2}:\d{2}$/.test(String(input.start_time || '')) ? String(input.start_time) : '09:00') : null;
  const end_time = canAdvance ? (/^\d{2}:\d{2}$/.test(String(input.end_time || '')) ? String(input.end_time) : '18:00') : null;
  const max_jobs_per_day = canAdvance ? Math.max(1, Math.min(20, Number(input.max_jobs_per_day || 1))) : null;
  const max_units_per_day = canAdvance ? Math.max(1, Math.min(99, Number(input.max_units_per_day || 5))) : null;
  return {
    day_status,
    can_accept_advance_job: canAdvance,
    // This calendar is NOT for urgent jobs. Urgent jobs continue using accept_status flow only.
    can_accept_urgent_job: false,
    start_time,
    end_time,
    max_jobs_per_day,
    max_units_per_day,
    note: String(input.note || '').slice(0,500)
  };
}

async function countLockedAdvanceJobsForDate(clientOrPool, username, workDate){
  const q = await clientOrPool.query(`
    SELECT COUNT(DISTINCT j.job_id)::int AS job_count
    FROM public.jobs j
    LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id AND ja.technician_username=$1
    WHERE (j.technician_username=$1 OR ja.technician_username=$1)
      AND j.appointment_datetime IS NOT NULL
      AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date = $2::date
      AND COALESCE(j.job_status,'') NOT IN ('cancelled','canceled')
  `, [username, workDate]);
  return Number(q.rows?.[0]?.job_count || 0);
}

module.exports = { toIsoDate, normWorkDayPayload, countLockedAdvanceJobsForDate };
