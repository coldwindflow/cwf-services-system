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

async function lookupCustomerByPhoneV2(db, phone) {
  const rawPhone = String(phone || "").trim();
  const candidates = buildPhoneLookupCandidates(rawPhone);
  if (!candidates.length || normalizePhone(rawPhone).length < 8) return { found: false };

  try {
    const profileR = await db.query(
      `
      SELECT
        sub AS customer_id,
        COALESCE(NULLIF(display_name, ''), NULLIF(phone, ''), 'ลูกค้าเดิม') AS customer_name,
        phone AS customer_phone,
        address AS address_text,
        maps_url
      FROM public.customer_profiles
      WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
      `,
      [candidates]
    );
    if (profileR.rows.length) {
      const row = profileR.rows[0];
      return {
        found: true,
        source: "customer_profiles",
        customer_id: row.customer_id || null,
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        address_text: row.address_text || null,
        maps_url: row.maps_url || null,
      };
    }
  } catch (e) {
    console.warn("[customer_lookup_by_phone_v2] customer_profiles lookup failed:", e.message);
  }

  try {
    const jobR = await db.query(
      `
      SELECT
        customer_name,
        customer_phone,
        address_text,
        maps_url,
        booking_code,
        job_id
      FROM public.jobs
      WHERE regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = ANY($1::text[])
      ORDER BY COALESCE(finished_at, appointment_datetime, created_at) DESC NULLS LAST, job_id DESC
      LIMIT 1
      `,
      [candidates]
    );
    if (jobR.rows.length) {
      const row = jobR.rows[0];
      return {
        found: true,
        source: "jobs",
        customer_id: null,
        customer_name: row.customer_name || null,
        customer_phone: row.customer_phone || null,
        address_text: row.address_text || null,
        maps_url: row.maps_url || null,
        booking_code: row.booking_code || null,
        job_id: row.job_id || null,
      };
    }
  } catch (e) {
    console.warn("[customer_lookup_by_phone_v2] jobs fallback lookup failed:", e.message);
  }

  return { found: false };
}

module.exports = {
  buildPhoneLookupCandidates,
  lookupCustomerByPhoneV2,
};
