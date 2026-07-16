"use strict";

const crypto = require("crypto");

const REF_VERSION = "v1";
const CLAIM_METHOD = "booking_code_phone";
const GENERIC_CLAIM_ERROR = "CLAIM_FAILED";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function b64url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(value) {
  const raw = clean(value).replace(/-/g, "+").replace(/_/g, "/");
  const pad = raw.length % 4 ? "=".repeat(4 - (raw.length % 4)) : "";
  return Buffer.from(raw + pad, "base64");
}

function hmacHex(secret, context, value) {
  return crypto.createHmac("sha256", String(secret || "")).update(`${context}\0${String(value || "")}`).digest("hex");
}

function keyFromSecret(secret) {
  return crypto.createHash("sha256").update(`customer-history-ref\0${String(secret || "")}`).digest();
}

function makeJobRef({ secret, customerSub, jobId }) {
  const sub = clean(customerSub);
  const id = clean(jobId);
  if (!secret || !sub || !id) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  cipher.setAAD(Buffer.from("cwf-customer-history-ref-v1"));
  const plaintext = Buffer.from(JSON.stringify({ sub, job_id: id }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${REF_VERSION}.${b64url(Buffer.concat([iv, tag, ciphertext]))}`;
}

function parseJobRef({ secret, customerSub, jobRef }) {
  const sub = clean(customerSub);
  const ref = clean(jobRef);
  if (!secret || !sub || !ref.startsWith(`${REF_VERSION}.`)) return null;
  try {
    const payload = b64urlDecode(ref.slice(REF_VERSION.length + 1));
    if (payload.length <= 28) return null;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(secret), iv);
    decipher.setAAD(Buffer.from("cwf-customer-history-ref-v1"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const data = JSON.parse(plaintext);
    if (clean(data.sub) !== sub) return null;
    const jobId = clean(data.job_id);
    return jobId ? { job_id: jobId } : null;
  } catch (_) {
    return null;
  }
}

function normalizeClaimPhone(value) {
  const raw = clean(value);
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  let local = "";
  if (/^0[0-9]{8,9}$/.test(digits)) {
    local = digits;
  } else if (/^66[1-9][0-9]{7,8}$/.test(digits)) {
    local = `0${digits.slice(2)}`;
  } else if (/^0066[1-9][0-9]{7,8}$/.test(digits)) {
    local = `0${digits.slice(4)}`;
  }
  if (!/^0[0-9]{8,9}$/.test(local)) return null;
  const e164Digits = `66${local.slice(1)}`;
  return {
    phone_norm: local,
    phone_last4: local.slice(-4),
    match_digits: [local, e164Digits, `00${e164Digits}`],
  };
}

function normalizeBookingCode(value) {
  const code = clean(value).toUpperCase();
  return /^[A-Z0-9_-]{3,40}$/.test(code) ? code : "";
}

function normalizeJobPhoneDigits(value) {
  const digits = clean(value).replace(/\D/g, "");
  const parsed = normalizeClaimPhone(digits);
  return parsed ? parsed.phone_norm : "";
}

function publicStatus(value) {
  const raw = clean(value);
  if (raw === "ตีกลับ" || raw === "งานแก้ไข") return "รอดำเนินการ";
  return raw;
}

function historyRow(row, { secret, customerSub }) {
  return {
    job_ref: makeJobRef({ secret, customerSub, jobId: row.job_id }),
    booking_code: row.booking_code || null,
    appointment_datetime: row.appointment_datetime || null,
    job_status: publicStatus(row.job_status),
    booking_mode: row.booking_mode || null,
    service_summary: row.job_type || null,
    job_price: row.job_price == null ? null : Number(row.job_price),
    address_text: row.address_text || null,
    maps_url: row.maps_url || null,
    job_zone: row.job_zone || null,
  };
}

function detailRow(row, { secret, customerSub }) {
  return {
    ...historyRow(row, { secret, customerSub }),
    duration_min: row.duration_min == null ? null : Number(row.duration_min),
    finished_at: row.finished_at || null,
    canceled_at: row.canceled_at || null,
    customer_phone_masked: row.customer_phone ? `•••• ${clean(row.customer_phone).replace(/\D/g, "").slice(-4)}` : null,
  };
}

function compactText(value) {
  return clean(value).replace(/\s+/g, " ");
}

function locationKey(row) {
  return [
    compactText(row.address_text).toLowerCase(),
    compactText(row.maps_url).toLowerCase(),
    compactText(row.job_zone).toLowerCase(),
    row.gps_latitude == null ? "" : String(row.gps_latitude),
    row.gps_longitude == null ? "" : String(row.gps_longitude),
  ].join("|");
}

function groupLocations(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const address = compactText(row.address_text);
    if (!address) continue;
    const key = locationKey(row);
    if (!byKey.has(key)) {
      byKey.set(key, {
        address_text: address,
        maps_url: compactText(row.maps_url) || null,
        job_zone: compactText(row.job_zone) || null,
        job_count: 0,
        last_seen_at: null,
        auto_select: false,
      });
    }
    const item = byKey.get(key);
    item.job_count += 1;
    const seen = row.last_seen_at || row.appointment_datetime || row.finished_at || null;
    if (seen && (!item.last_seen_at || String(seen) > String(item.last_seen_at))) {
      item.last_seen_at = seen;
    }
  }
  return [...byKey.values()].sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")));
}

async function schemaReady(db) {
  const r = await db.query(`
    SELECT
      to_regclass('public.customer_history_claims') IS NOT NULL AS has_claims,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='jobs' AND column_name='customer_sub'
      ) AS has_customer_sub
  `);
  const tableExists = !!r.rows?.[0]?.has_claims;
  const hasCustomerSub = !!r.rows?.[0]?.has_customer_sub;
  if (!tableExists) {
    return {
      has_claims: false,
      has_customer_sub: hasCustomerSub,
      claims_table_exists: false,
      diagnostic_code: "TABLE_MISSING",
    };
  }

  const columns = await db.query(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='customer_history_claims'
  `);
  const actual = new Map((columns.rows || []).map((row) => [row.column_name, row]));
  const expected = {
    claim_id: ["bigint", "NO"],
    customer_sub: ["text", "NO"],
    phone_norm: ["text", "NO"],
    phone_last4: ["text", "NO"],
    proof_job_id: ["bigint", "NO"],
    claim_method: ["text", "NO"],
    claimed_at: ["timestamp with time zone", "NO"],
    last_verified_at: ["timestamp with time zone", "NO"],
    revoked_at: ["timestamp with time zone", "YES"],
    revoke_reason: ["text", "YES"],
  };
  const columnsValid = Object.entries(expected).every(([name, [type, nullable]]) => {
    const row = actual.get(name);
    return row && row.data_type === type && row.is_nullable === nullable;
  });

  const shape = await db.query(`
    SELECT
      EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid=con.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
         WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
           AND con.contype='f'
           AND pg_get_constraintdef(con.oid) ILIKE '%FOREIGN KEY (customer_sub) REFERENCES customer_profiles(sub)%'
      ) AS has_customer_fk,
      EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid=con.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
         WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
           AND con.contype='f'
           AND pg_get_constraintdef(con.oid) ILIKE '%FOREIGN KEY (proof_job_id) REFERENCES jobs(job_id)%'
      ) AS has_job_fk,
      EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid=con.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
         WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
           AND con.contype='c' AND pg_get_constraintdef(con.oid) ILIKE '%booking_code_phone%'
      ) AS has_method_check,
      EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid=con.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
         WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
           AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%phone_norm%'
           AND pg_get_constraintdef(con.oid) LIKE '%^0[0-9]{8,9}$%'
      ) AS has_phone_norm_check,
      EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_class rel ON rel.oid=con.conrelid
          JOIN pg_namespace nsp ON nsp.oid=rel.relnamespace
         WHERE nsp.nspname='public' AND rel.relname='customer_history_claims'
           AND con.contype='c' AND pg_get_constraintdef(con.oid) LIKE '%phone_last4%'
           AND pg_get_constraintdef(con.oid) ILIKE '%right(phone_norm, 4)%'
      ) AS has_phone_last4_check,
      EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='customer_history_claims'
           AND indexname='ux_customer_history_claims_active_phone'
           AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%revoked_at IS NULL%'
      ) AS has_active_phone_index,
      EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='customer_history_claims'
           AND indexname='ux_customer_history_claims_active_proof_job'
           AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%revoked_at IS NULL%'
      ) AS has_active_proof_index,
      EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND tablename='customer_history_claims'
           AND indexname='idx_customer_history_claims_customer_sub'
           AND indexdef ILIKE '%customer_sub%' AND indexdef ILIKE '%revoked_at IS NULL%'
      ) AS has_active_sub_index
  `);
  const s = shape.rows?.[0] || {};
  const shapeValid = !!s.has_customer_fk && !!s.has_job_fk
    && !!s.has_method_check && !!s.has_phone_norm_check && !!s.has_phone_last4_check
    && !!s.has_active_phone_index && !!s.has_active_proof_index && !!s.has_active_sub_index;
  return {
    has_claims: columnsValid && shapeValid,
    has_customer_sub: hasCustomerSub,
    claims_table_exists: true,
    diagnostic_code: columnsValid && shapeValid ? "READY" : "SCHEMA_DRIFT",
  };
}

async function activeClaims(db, customerSub) {
  const r = await db.query(
    `SELECT phone_norm, phone_last4
       FROM public.customer_history_claims
      WHERE customer_sub=$1 AND revoked_at IS NULL
      ORDER BY claimed_at ASC`,
    [customerSub]
  );
  return r.rows || [];
}

function phoneMatchDigitsForClaims(claims) {
  const set = new Set();
  for (const claim of claims || []) {
    const parsed = normalizeClaimPhone(claim.phone_norm);
    if (!parsed) continue;
    for (const value of parsed.match_digits) set.add(value);
  }
  return [...set];
}

function buildAuthorizedWhere({ customerSub, hasCustomerSub, phoneDigits, startParam = 1 }) {
  const parts = [];
  const params = [];
  if (hasCustomerSub) {
    parts.push(`j.customer_sub=$${startParam + params.length}`);
    params.push(customerSub);
  }
  if (phoneDigits.length) {
    parts.push(`regexp_replace(COALESCE(j.customer_phone,''), '[^0-9]', '', 'g') = ANY($${startParam + params.length}::text[])`);
    params.push(phoneDigits);
  }
  return { where: parts.length ? `(${parts.join(" OR ")})` : "(FALSE)", params };
}

module.exports = {
  CLAIM_METHOD,
  GENERIC_CLAIM_ERROR,
  buildAuthorizedWhere,
  clean,
  detailRow,
  groupLocations,
  hmacHex,
  historyRow,
  makeJobRef,
  normalizeBookingCode,
  normalizeClaimPhone,
  normalizeJobPhoneDigits,
  parseJobRef,
  phoneMatchDigitsForClaims,
  schemaReady,
  activeClaims,
};
