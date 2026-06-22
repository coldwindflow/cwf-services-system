"use strict";

const FINALIZER_LOCK_KEY = "cwf_urgent_offer_finalizer_v1";
const ADMIN_REVIEW_STATUS = "ไม่พบช่างรับงาน";
const TIME_PROPOSAL_STATUS = "รอพิจารณาเวลาใหม่";

async function autoFinalizeUrgentJobs(poolOrClient, options = {}) {
  const externalClient = options.client || null;
  const db = externalClient || poolOrClient;
  if (!db || typeof db.query !== "function") {
    throw new Error("urgent finalizer requires a pg pool or client");
  }

  const client = externalClient || (typeof db.connect === "function" ? await db.connect() : db);
  let began = false;
  try {
    if (!externalClient) {
      await client.query("BEGIN");
      began = true;
    }

    const lockR = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked",
      [FINALIZER_LOCK_KEY]
    );
    if (!lockR.rows?.[0]?.locked) {
      if (began) await client.query("COMMIT");
      return { success: true, skipped: true, reason: "locked", expired_offers: 0, finalized_jobs: 0 };
    }

    const expiredOffers = await client.query(
      `
      UPDATE public.job_offers
         SET status='expired',
             responded_at=COALESCE(responded_at,NOW())
       WHERE status='pending'
         AND expires_at < NOW()
      `
    );

    const finalizedJobs = await client.query(
      `
      UPDATE public.jobs j
         SET job_status=$1,
             technician_username=NULL,
             technician_team=NULL,
             dispatch_mode='offer'
       WHERE COALESCE(j.booking_mode,'')='urgent'
         AND COALESCE(j.dispatch_mode,'')='offer'
         AND NULLIF(TRIM(COALESCE(j.technician_username,'')),'') IS NULL
         AND NULLIF(TRIM(COALESCE(j.technician_team,'')),'') IS NULL
         AND j.canceled_at IS NULL
         AND COALESCE(j.job_status,'') <> $1
         AND COALESCE(j.job_status,'') <> $2
         AND LOWER(COALESCE(j.job_status,'')) NOT IN ('cancel','canceled','cancelled','done','completed','closed','paid')
         AND COALESCE(j.job_status,'') NOT IN ('ยกเลิก','เสร็จแล้ว','เสร็จสิ้น','ปิดงาน')
         AND NOT EXISTS (
           SELECT 1 FROM public.job_offers accepted_offer
            WHERE accepted_offer.job_id=j.job_id
              AND accepted_offer.status='accepted'
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.job_offers live_offer
            WHERE live_offer.job_id=j.job_id
              AND live_offer.status='pending'
              AND live_offer.expires_at >= NOW()
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.job_offer_time_proposals proposal
            WHERE proposal.job_id=j.job_id
              AND proposal.status='pending'
         )
      `,
      [ADMIN_REVIEW_STATUS, TIME_PROPOSAL_STATUS]
    );

    if (began) await client.query("COMMIT");
    return {
      success: true,
      skipped: false,
      expired_offers: expiredOffers.rowCount || 0,
      finalized_jobs: finalizedJobs.rowCount || 0,
    };
  } catch (error) {
    if (began) {
      try { await client.query("ROLLBACK"); } catch (_) {}
    }
    throw error;
  } finally {
    if (!externalClient && typeof client.release === "function") client.release();
  }
}

module.exports = {
  ADMIN_REVIEW_STATUS,
  FINALIZER_LOCK_KEY,
  TIME_PROPOSAL_STATUS,
  autoFinalizeUrgentJobs,
};
