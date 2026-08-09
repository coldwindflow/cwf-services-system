"use strict";

async function findAdminReplay(db, requestKey) {
  const result = await db.query(
    `SELECT job_id, booking_code, booking_mode, dispatch_mode, admin_request_fingerprint
       FROM public.jobs WHERE admin_request_key=$1 LIMIT 1`, [requestKey]
  );
  return result.rows[0] || null;
}

async function findPublicReplay(pool, { requestKey, bookingToken, bookingMode }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [requestKey]);
    const result = await client.query(
      `SELECT job_id, booking_code, booking_token, booking_mode, dispatch_mode, duration_min, job_price,
              booking_request_fingerprint
         FROM public.jobs
        WHERE booking_token=$1 AND job_source='customer' AND booking_mode=$2 AND canceled_at IS NULL
        LIMIT 1`, [bookingToken, bookingMode]
    );
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { findAdminReplay, findPublicReplay };
