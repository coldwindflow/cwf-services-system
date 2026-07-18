"use strict";

const CANCELLED_STATUSES = ["ยกเลิก", "cancelled", "canceled"];

function stableHash(text) {
  const s = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rankCustomerScheduledCandidates(candidates = [], context = {}) {
  const durationMin = Math.max(1, Number(context.duration_min || 0));
  const key = [
    "customer_scheduled_rotation",
    context.date || "",
    context.start || "",
    context.tech_type || "",
    JSON.stringify(context.criteria || []),
    context.requested_units || 0,
  ].join("|");
  return (candidates || []).map((c) => {
    const scheduled = Number(c.scheduled_minutes || 0);
    return {
      ...c,
      projected_scheduled_minutes: scheduled + durationMin,
      rotation_score: stableHash(`${key}|${c.username || ""}`),
    };
  }).sort((a, b) => (
    Number(a.projected_scheduled_minutes || 0) - Number(b.projected_scheduled_minutes || 0) ||
    Number(a.jobs_count || 0) - Number(b.jobs_count || 0) ||
    Number(a.units_count || 0) - Number(b.units_count || 0) ||
    Number(a.previous_job_end_min ?? -1) - Number(b.previous_job_end_min ?? -1) ||
    Number(a.last_auto_assign_ms ?? 0) - Number(b.last_auto_assign_ms ?? 0) ||
    Number(a.rotation_score || 0) - Number(b.rotation_score || 0)
  ));
}

async function loadCustomerScheduledLoadMap(db, date, usernames = [], options = {}) {
  const names = (Array.isArray(usernames) ? usernames : []).map((u) => String(u || "").trim()).filter(Boolean);
  if (!names.length || !db || typeof db.query !== "function") return new Map();
  const startMin = Number(options.start_min);
  const ignoreJobId = Number(options.ignore_job_id || 0);
  const params = [names, date, CANCELLED_STATUSES, ignoreJobId > 0 ? ignoreJobId : null];
  const result = await db.query(
    `WITH assigned AS (
       SELECT DISTINCT COALESCE(ja.technician_username, j.technician_username) AS technician_username,
              j.job_id,
              j.appointment_datetime,
              GREATEST(1, COALESCE(j.duration_min,60))::int AS duration_min,
              j.created_at,
              j.job_source,
              j.booking_mode
         FROM public.jobs j
         LEFT JOIN public.job_assignments ja ON ja.job_id=j.job_id
        WHERE COALESCE(ja.technician_username, j.technician_username) = ANY($1::text[])
          AND j.appointment_datetime IS NOT NULL
          AND (j.appointment_datetime AT TIME ZONE 'Asia/Bangkok')::date=$2::date
          AND COALESCE(j.job_status,'') <> ALL($3::text[])
          AND ($4::bigint IS NULL OR j.job_id <> $4::bigint)
     ),
     item_units AS (
       SELECT a.technician_username, a.job_id, COALESCE(SUM(NULLIF(ji.qty,0)),0)::int AS units
         FROM assigned a
         LEFT JOIN public.job_items ji ON ji.job_id=a.job_id
        GROUP BY a.technician_username, a.job_id
     )
     SELECT a.technician_username,
            a.job_id,
            a.duration_min,
            a.created_at,
            a.job_source,
            a.booking_mode,
            ((EXTRACT(HOUR FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int * 60)
              + EXTRACT(MINUTE FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int) AS start_min,
            (((EXTRACT(HOUR FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int * 60)
              + EXTRACT(MINUTE FROM (a.appointment_datetime AT TIME ZONE 'Asia/Bangkok'))::int)
              + a.duration_min) AS end_min,
            GREATEST(COALESCE(i.units,0),1)::int AS units
       FROM assigned a
       LEFT JOIN item_units i ON i.job_id=a.job_id`,
    params
  );
  const map = new Map(names.map((name) => [name, {
    scheduled_minutes: 0,
    jobs_count: 0,
    units_count: 0,
    previous_job_end_min: -1,
    last_auto_assign_ms: 0,
  }]));
  for (const row of result.rows || []) {
    const username = String(row.technician_username || "");
    const cur = map.get(username);
    if (!cur) continue;
    const start = Number(row.start_min);
    const end = Number(row.end_min);
    cur.jobs_count += 1;
    cur.units_count += Math.max(1, Number(row.units || 0));
    cur.scheduled_minutes += Math.max(1, Number(row.duration_min || 0));
    if (Number.isFinite(startMin) && Number.isFinite(end) && end <= startMin) {
      cur.previous_job_end_min = Math.max(cur.previous_job_end_min, end);
    }
    if (String(row.job_source || "").toLowerCase() === "customer" && String(row.booking_mode || "").toLowerCase() === "scheduled") {
      const ms = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (Number.isFinite(ms)) cur.last_auto_assign_ms = Math.max(cur.last_auto_assign_ms || 0, ms);
    }
  }
  return map;
}

module.exports = {
  stableHash,
  rankCustomerScheduledCandidates,
  loadCustomerScheduledLoadMap,
};
