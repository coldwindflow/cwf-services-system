"use strict";

const crypto = require("crypto");

const QA = Object.freeze({
  customerSub: "qa:staging:cwf-air-care",
  customerProvider: "qa_staging",
  customerProviderSubject: "cwf-air-care-customer",
  customerName: "CWF STAGING QA — AIR CARE CUSTOMER",
  customerPhone: "0800000382",
  customerAddress: "CWF STAGING QA ONLY — Bangkok",
  adminUsername: "qa_air_care_admin",
  adminName: "CWF STAGING QA — AIR CARE ADMIN",
  technicianUsername: "qa_air_care_tech",
  technicianName: "CWF STAGING QA — AIR CARE TECHNICIAN",
  marker: "CWF_STAGING_QA_AIR_CARE",
});

function qaError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertStagingOnly({ environment, containerName, secret }) {
  if (String(environment || "") !== "staging") {
    throw qaError("STAGING_QA_ENVIRONMENT_REJECTED");
  }
  if (String(containerName || "") !== "cwf-staging-app") {
    throw qaError("STAGING_QA_CONTAINER_REJECTED");
  }
  if (typeof secret !== "string" || secret.length < 32) {
    throw qaError("STAGING_QA_SECRET_REQUIRED");
  }
  return true;
}

function deriveAdminSessionToken(secret) {
  return crypto.createHmac("sha256", secret)
    .update("cwf/staging/qa/air-care/admin-session/v1")
    .digest("base64url");
}

function makeCustomerPayload(nowSeconds = Math.floor(Date.now() / 1000)) {
  return {
    sub: QA.customerSub,
    provider: QA.customerProvider,
    provider_sub: QA.customerProviderSubject,
    name: QA.customerName,
    picture: "",
    email: "",
    email_verified: false,
    linked_providers: [QA.customerProvider],
    iat: nowSeconds,
    exp: nowSeconds + (4 * 60 * 60),
  };
}

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function assertIdentityCollisionFree(db) {
  const profile = await db.query(
    `SELECT provider, display_name FROM public.customer_profiles WHERE sub=$1 LIMIT 1`,
    [QA.customerSub]
  );
  if (profile.rows?.[0] && (
    String(profile.rows[0].provider || "") !== QA.customerProvider
    || String(profile.rows[0].display_name || "") !== QA.customerName
  )) throw qaError("STAGING_QA_CUSTOMER_COLLISION");

  const identity = await db.query(
    `SELECT customer_sub FROM public.customer_identities
      WHERE provider=$1 AND provider_subject=$2 LIMIT 1`,
    [QA.customerProvider, QA.customerProviderSubject]
  );
  if (identity.rows?.[0] && String(identity.rows[0].customer_sub) !== QA.customerSub) {
    throw qaError("STAGING_QA_IDENTITY_COLLISION");
  }

  const users = await db.query(
    `SELECT username, role, full_name FROM public.users WHERE username=ANY($1::text[])`,
    [[QA.adminUsername, QA.technicianUsername]]
  );
  for (const row of users.rows || []) {
    const expected = row.username === QA.adminUsername
      ? { role: "admin", name: QA.adminName }
      : { role: "technician", name: QA.technicianName };
    if (String(row.role || "") !== expected.role || String(row.full_name || "") !== expected.name) {
      throw qaError("STAGING_QA_USER_COLLISION");
    }
  }
}

async function provisionQaIdentity({ pool, environment, containerName, secret }) {
  assertStagingOnly({ environment, containerName, secret });
  const adminSession = deriveAdminSessionToken(secret);
  const result = await withTransaction(pool, async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [QA.marker]);
    await assertIdentityCollisionFree(db);

    await db.query(
      `INSERT INTO public.customer_profiles
        (sub, provider, display_name, picture_url, phone, address, maps_url, email, email_verified, updated_at)
       VALUES ($1,$2,$3,NULL,$4,$5,NULL,NULL,FALSE,NOW())
       ON CONFLICT (sub) DO UPDATE SET
         phone=EXCLUDED.phone, address=EXCLUDED.address, updated_at=NOW()`,
      [QA.customerSub, QA.customerProvider, QA.customerName, QA.customerPhone, QA.customerAddress]
    );
    await db.query(
      `INSERT INTO public.customer_identities
        (customer_sub, provider, provider_subject, display_name, email_verified, linked_at, last_login_at, updated_at)
       VALUES ($1,$2,$3,$4,FALSE,NOW(),NOW(),NOW())
       ON CONFLICT (provider, provider_subject) DO UPDATE SET
         last_login_at=NOW(), updated_at=NOW()`,
      [QA.customerSub, QA.customerProvider, QA.customerProviderSubject, QA.customerName]
    );

    await db.query(
      `INSERT INTO public.users (username, role, full_name)
       VALUES ($1,'admin',$2)
       ON CONFLICT (username) DO UPDATE SET role='admin', full_name=EXCLUDED.full_name`,
      [QA.adminUsername, QA.adminName]
    );
    await db.query(
      `INSERT INTO public.users (username, role, full_name)
       VALUES ($1,'technician',$2)
       ON CONFLICT (username) DO UPDATE SET role='technician', full_name=EXCLUDED.full_name`,
      [QA.technicianUsername, QA.technicianName]
    );
    await db.query(
      `INSERT INTO public.technician_profiles
        (username, full_name, employment_type, accept_status, accept_status_expires_at,
         customer_slot_visible, work_start, work_end, weekly_off_days, updated_at)
       VALUES ($1,$2,'company','ready',NOW() + INTERVAL '70 days',FALSE,'08:00','20:00','',NOW())
       ON CONFLICT (username) DO UPDATE SET
         full_name=EXCLUDED.full_name, employment_type='company', accept_status='ready',
         accept_status_expires_at=EXCLUDED.accept_status_expires_at,
         customer_slot_visible=FALSE, work_start='08:00', work_end='20:00',
         weekly_off_days='', updated_at=NOW()`,
      [QA.technicianUsername, QA.technicianName]
    );
    await db.query(
      `INSERT INTO public.technician_service_matrix (username, matrix_json)
       VALUES ($1,$2::jsonb)
       ON CONFLICT (username) DO UPDATE SET matrix_json=EXCLUDED.matrix_json`,
      [QA.technicianUsername, JSON.stringify({
        job_types: ["ล้าง", "ล้างแอร์"],
        ac_types: ["ผนัง", "wall"],
        wash_wall_variants: { normal: true, standard: true, premium: true },
        repair_variants: {},
      })]
    );
    await db.query(
      `INSERT INTO public.technician_monthly_work_calendar
        (technician_username, work_date, day_status, can_accept_advance_job,
         can_accept_urgent_job, start_time, end_time, max_jobs_per_day, max_units_per_day, source)
       SELECT $1, d::date, 'working', TRUE, FALSE, '08:00', '20:00', 10, 50, $2
         FROM generate_series(CURRENT_DATE + 1, CURRENT_DATE + 60, INTERVAL '1 day') d
       ON CONFLICT (technician_username, work_date) DO UPDATE SET
         day_status='working', can_accept_advance_job=TRUE, can_accept_urgent_job=FALSE,
         start_time='08:00', end_time='20:00', max_jobs_per_day=10,
         max_units_per_day=50, source=EXCLUDED.source`,
      [QA.technicianUsername, QA.marker]
    );

    await db.query(`DELETE FROM public.auth_sessions WHERE username=$1`, [QA.adminUsername]);
    await db.query(
      `INSERT INTO public.auth_sessions (session_token, username, role, expires_at)
       VALUES ($1,$2,'admin',NOW() + INTERVAL '4 hours')`,
      [adminSession, QA.adminUsername]
    );

    const verified = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.customer_profiles WHERE sub=$1 AND provider=$2) AS customer_count,
         (SELECT COUNT(*)::int FROM public.customer_identities WHERE customer_sub=$1 AND provider=$2) AS identity_count,
         (SELECT COUNT(*)::int FROM public.users WHERE username=$3 AND role='admin') AS admin_count,
         (SELECT COUNT(*)::int FROM public.auth_sessions WHERE username=$3 AND role='admin' AND expires_at>NOW()) AS session_count,
         (SELECT COUNT(*)::int FROM public.users WHERE username=$4 AND role='technician') AS technician_count`,
      [QA.customerSub, QA.customerProvider, QA.adminUsername, QA.technicianUsername]
    );
    return verified.rows[0];
  });

  for (const key of ["customer_count", "identity_count", "admin_count", "session_count", "technician_count"]) {
    if (Number(result[key]) !== 1) throw qaError("STAGING_QA_PROVISION_VERIFY_FAILED");
  }
  return { ...result, adminSession };
}

async function findQaTransactionalRows(pool) {
  const result = await pool.query(
    `SELECT o.order_id, o.order_code, e.entitlement_id, e.entitlement_code,
            j.job_id, j.booking_code, j.canceled_at
       FROM public.customer_orders o
       LEFT JOIN public.customer_service_entitlements e ON e.order_id=o.order_id
       LEFT JOIN public.jobs j ON j.prepaid_entitlement_id=e.entitlement_id
      WHERE o.order_kind='service_prepaid' AND o.customer_sub=$1
      ORDER BY o.order_id, j.job_id`,
    [QA.customerSub]
  );
  return result.rows || [];
}

async function deleteQaOrders({ pool, environment, containerName, secret }) {
  assertStagingOnly({ environment, containerName, secret });
  return withTransaction(pool, async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [QA.marker]);
    const jobs = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM public.jobs j
         JOIN public.customer_service_entitlements e ON e.entitlement_id=j.prepaid_entitlement_id
         JOIN public.customer_orders o ON o.order_id=e.order_id
        WHERE o.customer_sub=$1`,
      [QA.customerSub]
    );
    if (Number(jobs.rows[0]?.count || 0) !== 0) throw qaError("STAGING_QA_JOBS_MUST_BE_REMOVED_FIRST");
    const entitlements = await db.query(
      `DELETE FROM public.customer_service_entitlements e
        USING public.customer_orders o
        WHERE e.order_id=o.order_id AND o.order_kind='service_prepaid' AND o.customer_sub=$1
        RETURNING e.entitlement_id`,
      [QA.customerSub]
    );
    const orders = await db.query(
      `DELETE FROM public.customer_orders
        WHERE order_kind='service_prepaid' AND customer_sub=$1
        RETURNING order_id`,
      [QA.customerSub]
    );
    return { entitlements: entitlements.rowCount || 0, orders: orders.rowCount || 0 };
  });
}

module.exports = {
  QA,
  assertStagingOnly,
  deriveAdminSessionToken,
  makeCustomerPayload,
  provisionQaIdentity,
  findQaTransactionalRows,
  deleteQaOrders,
};
