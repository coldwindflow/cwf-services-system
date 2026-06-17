"use strict";

const { normalizePhone } = require("./normalizers");

function buildPhoneLookupCandidates(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return [];
  const set = new Set([digits]);
  if (digits.startsWith("66") && digits.length >= 9) set.add(`0${digits.slice(2)}`);
  if (digits.startsWith("0066") && digits.length >= 11) set.add(`0${digits.slice(4)}`);
  if (digits.startsWith("0") && digits.length >= 9) set.add(`66${digits.slice(1)}`);
  return [...set].filter(Boolean);
}

function compactText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeLocationKey(addressText, mapsUrl) {
  const address = compactText(addressText).toLowerCase();
  const maps = compactText(mapsUrl).toLowerCase();
  if (!address && !maps) return "";
  return `${address}|${maps}`;
}

function buildProfileLocationCandidate(row) {
  const addressText = compactText(row?.address_text);
  const mapsUrl = compactText(row?.maps_url);
  if (!addressText && !mapsUrl) return null;
  return {
    source: "customer_profiles",
    label: "ที่อยู่ในโปรไฟล์",
    customer_id: row.customer_id || null,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    address_text: addressText || null,
    maps_url: mapsUrl || null,
    job_zone: null,
    booking_code: null,
    job_id: null,
    job_count: 1,
    last_seen_at: row.updated_at || null,
    last_job_status: null,
  };
}

function buildJobLocationCandidate(row) {
  const addressText = compactText(row?.address_text);
  const mapsUrl = compactText(row?.maps_url);
  if (!addressText) return null;
  const source = row.lookup_source || "jobs_phone_exact";
  const labelBySource = {
    jobs_phone_exact: "ประวัติงานเดิมจากเบอร์ตรงกัน",
    jobs_phone_last9: "ประวัติงานเดิมจากเลขท้ายเบอร์ 9 หลัก",
    jobs_note_phone: "ประวัติงานเดิมจากเบอร์ในหมายเหตุ",
    jobs_address_phone: "ประวัติงานเดิมจากเบอร์ในที่อยู่",
  };
  return {
    source,
    label: labelBySource[source] || "เลือกสถานที่จากประวัติงานเดิม",
    customer_id: null,
    customer_name: row.customer_name || null,
    customer_phone: row.customer_phone || null,
    address_text: addressText,
    maps_url: mapsUrl || null,
    job_zone: row.job_zone || null,
    booking_code: row.booking_code || null,
    job_id: row.job_id || null,
    job_count: Number(row.job_count || 0) || 1,
    last_seen_at: row.last_seen_at || null,
    last_job_status: row.last_job_status || null,
  };
}

function addLocationCandidate(list, candidate, max = 8) {
  if (!candidate || !candidate.address_text) return;
  const key = normalizeLocationKey(candidate.address_text, candidate.maps_url);
  if (!key) return;
  const existingIndex = list.findIndex((item) => normalizeLocationKey(item.address_text, item.maps_url) === key);
  if (existingIndex >= 0) {
    const existing = list[existingIndex];
    list[existingIndex] = {
      ...existing,
      customer_name: candidate.customer_name || existing.customer_name || null,
      customer_phone: candidate.customer_phone || existing.customer_phone || null,
      maps_url: candidate.maps_url || existing.maps_url || null,
      job_zone: candidate.job_zone || existing.job_zone || null,
      booking_code: candidate.booking_code || existing.booking_code || null,
      job_id: candidate.job_id || existing.job_id || null,
      job_count: Math.max(Number(existing.job_count || 0), Number(candidate.job_count || 0)) || null,
      last_seen_at: candidate.last_seen_at || existing.last_seen_at || null,
      last_job_status: candidate.last_job_status || existing.last_job_status || null,
    };
    return;
  }
  if (list.length < max) list.push(candidate);
}

function buildLookupResultFromDefault(defaultCandidate) {
  if (!defaultCandidate) return { found: false, location_candidates: [] };
  return {
    found: true,
    source: defaultCandidate.source || null,
    customer_id: defaultCandidate.customer_id || null,
    customer_name: defaultCandidate.customer_name || null,
    customer_phone: defaultCandidate.customer_phone || null,
    address_text: defaultCandidate.address_text || null,
    maps_url: defaultCandidate.maps_url || null,
    booking_code: defaultCandidate.booking_code || null,
    job_id: defaultCandidate.job_id || null,
  };
}

async function queryJobLocationRows(db, matchClause, params, lookupSource) {
  const sourceParam = params.length + 1;
  const jobR = await db.query(
    `
    WITH recent_jobs AS (
      SELECT
        customer_name,
        customer_phone,
        address_text,
        maps_url,
        job_zone,
        booking_code,
        job_id,
        status,
        COALESCE(finished_at, appointment_datetime, created_at) AS seen_at
      FROM public.jobs
      WHERE ${matchClause}
        AND COALESCE(NULLIF(btrim(address_text), ''), '') <> ''
      ORDER BY COALESCE(finished_at, appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
      LIMIT 80
    ),
    grouped AS (
      SELECT
        lower(regexp_replace(btrim(address_text), '\\s+', ' ', 'g')) AS address_key,
        lower(regexp_replace(COALESCE(btrim(maps_url), ''), '\\s+', ' ', 'g')) AS maps_key,
        COUNT(*) AS job_count,
        MAX(seen_at) AS last_seen_at
      FROM recent_jobs
      GROUP BY 1, 2
    ),
    ranked AS (
      SELECT
        r.customer_name,
        r.customer_phone,
        r.address_text,
        r.maps_url,
        r.job_zone,
        r.booking_code,
        r.job_id,
        g.job_count,
        g.last_seen_at,
        r.status AS last_job_status,
        ROW_NUMBER() OVER (
          PARTITION BY g.address_key, g.maps_key
          ORDER BY r.seen_at DESC NULLS LAST, r.job_id DESC
        ) AS rn
      FROM grouped g
      JOIN recent_jobs r
        ON lower(regexp_replace(btrim(r.address_text), '\\s+', ' ', 'g')) = g.address_key
       AND lower(regexp_replace(COALESCE(btrim(r.maps_url), ''), '\\s+', ' ', 'g')) = g.maps_key
       AND r.seen_at IS NOT DISTINCT FROM g.last_seen_at
    )
    SELECT
      customer_name,
      customer_phone,
      address_text,
      maps_url,
      job_zone,
      booking_code,
      job_id,
      job_count,
      last_seen_at,
      last_job_status,
      $${sourceParam}::text AS lookup_source
    FROM ranked
    WHERE rn = 1
    ORDER BY last_seen_at DESC NULLS LAST, job_id DESC
    LIMIT 8
    `,
    [...params, lookupSource]
  );
  return jobR.rows || [];
}

function addJobRows(locationCandidates, rows) {
  let usableCount = 0;
  for (const row of rows || []) {
    const candidate = buildJobLocationCandidate(row);
    if (!candidate) continue;
    usableCount += 1;
    addLocationCandidate(locationCandidates, candidate);
  }
  return usableCount;
}

async function lookupCustomerByPhoneV2(db, phone) {
  const rawPhone = String(phone || "").trim();
  const digits = normalizePhone(rawPhone);
  const candidates = buildPhoneLookupCandidates(rawPhone);
  if (!candidates.length || digits.length < 8) {
    return { found: false, location_candidates: [] };
  }

  let profileRow = null;
  const locationCandidates = [];
  let jobCandidateCount = 0;

  try {
    const profileR = await db.query(
      `
      SELECT
        sub AS customer_id,
        COALESCE(NULLIF(display_name, ''), NULLIF(phone, ''), 'ลูกค้าเดิม') AS customer_name,
        phone AS customer_phone,
        address AS address_text,
        maps_url,
        updated_at
      FROM public.customer_profiles
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
      `,
      [candidates]
    );
    if (profileR.rows.length) {
      profileRow = profileR.rows[0];
      addLocationCandidate(locationCandidates, buildProfileLocationCandidate(profileRow));
    }
  } catch (e) {
    console.warn("[customer_lookup_by_phone_v2] customer_profiles lookup failed:", e.message);
  }

  try {
    const rows = await queryJobLocationRows(
      db,
      "regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])",
      [candidates],
      "jobs_phone_exact"
    );
    jobCandidateCount += addJobRows(locationCandidates, rows);
  } catch (e) {
    console.warn("[customer_lookup_by_phone_v2] jobs location candidates lookup failed:", e.message);
  }

  if (jobCandidateCount === 0 && digits.length >= 9) {
    try {
      const rows = await queryJobLocationRows(
        db,
        "right(regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g'), 9) = $1",
        [digits.slice(-9)],
        "jobs_phone_last9"
      );
      jobCandidateCount += addJobRows(locationCandidates, rows);
    } catch (e) {
      console.warn("[customer_lookup_by_phone_v2] jobs last9 fallback lookup failed:", e.message);
    }
  }

  if (jobCandidateCount === 0 && digits.length >= 9 && digits.length <= 10) {
    try {
      const rows = await queryJobLocationRows(
        db,
        "regexp_replace(COALESCE(customer_note, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'",
        [digits],
        "jobs_note_phone"
      );
      jobCandidateCount += addJobRows(locationCandidates, rows);
    } catch (e) {
      console.warn("[customer_lookup_by_phone_v2] jobs note phone fallback lookup failed:", e.message);
    }
  }

  if (jobCandidateCount === 0 && digits.length >= 9 && digits.length <= 10) {
    try {
      const rows = await queryJobLocationRows(
        db,
        "regexp_replace(COALESCE(address_text, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'",
        [digits],
        "jobs_address_phone"
      );
      jobCandidateCount += addJobRows(locationCandidates, rows);
    } catch (e) {
      console.warn("[customer_lookup_by_phone_v2] jobs address phone fallback lookup failed:", e.message);
    }
  }

  const defaultCandidate = locationCandidates[0] || (profileRow ? {
    source: "customer_profiles",
    customer_id: profileRow.customer_id || null,
    customer_name: profileRow.customer_name || null,
    customer_phone: profileRow.customer_phone || null,
    address_text: profileRow.address_text || null,
    maps_url: profileRow.maps_url || null,
  } : null);

  const result = buildLookupResultFromDefault(defaultCandidate);
  if (!result.found) return result;
  if (profileRow) {
    result.customer_id = result.customer_id || profileRow.customer_id || null;
    result.customer_name = result.customer_name || profileRow.customer_name || null;
    result.customer_phone = result.customer_phone || profileRow.customer_phone || null;
  }
  return {
    ...result,
    location_candidates: locationCandidates,
  };
}

module.exports = {
  buildPhoneLookupCandidates,
  lookupCustomerByPhoneV2,
};
