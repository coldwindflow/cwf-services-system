"use strict";

const { JOB_STATUS, ASSIGNMENT_STATUS, OFFER_STATUS } = require("./bookingStatuses");

function createBookingApprovalService(dependencies = {}) {
  const {
    pool,
    availabilityEngine,
    getAvailabilityDependencies,
    refreshTechnicianIncomePreviewForJob,
    notifyDirectJobAssigned,
    notifyUrgentOffer,
    isTechReady,
    checkTechCollision,
    logJobUpdate,
  } = dependencies;

  function httpError(status, code) {
    const error = new Error(code);
    error.status = status;
    error.code = code;
    return error;
  }

  function adminUsername(req) {
    return String(req?.auth?.username || req?.actor?.username || "").trim() || null;
  }

  async function loadReservation(client, jobId) {
    const result = await client.query(
      `SELECT j.job_id, j.booking_code, j.job_source, j.booking_mode, j.job_status,
              j.technician_username, j.job_type, j.appointment_datetime,
              COALESCE(j.duration_min,60)::int AS duration_min, j.job_zone,
              to_char(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS booking_date,
              to_char(j.appointment_datetime AT TIME ZONE 'Asia/Bangkok','HH24:MI') AS booking_start
         FROM public.jobs j
        WHERE j.job_id=$1
        FOR UPDATE`,
      [jobId]
    );
    return result.rows[0] || null;
  }

  async function loadServiceCriteria(client, job) {
    const units = await client.query(
      `SELECT item_name, ac_type, wash_type, btu
         FROM public.job_units
        WHERE job_id=$1
        ORDER BY unit_no`,
      [job.job_id]
    );
    if (units.rows.length) {
      return units.rows.map((unit) => ({
        job_type: String(unit.item_name || job.job_type || ""),
        ac_type: String(unit.ac_type || ""),
        wash_variant: String(unit.wash_type || ""),
        btu: Number(unit.btu || 0),
        machine_count: 1,
      }));
    }
    const items = await client.query(
      `SELECT COALESCE(SUM(GREATEST(COALESCE(qty,0),0)),0)::int AS units
         FROM public.job_items
        WHERE job_id=$1`,
      [job.job_id]
    );
    return [{ job_type: job.job_type, machine_count: Math.max(1, Number(items.rows[0]?.units || 1)) }];
  }

  async function reserveScheduledTechnician(client, job) {
    const services = await loadServiceCriteria(client, job);
    const options = {
      date: job.booking_date,
      start: job.booking_start,
      duration_min: job.duration_min,
      tech_type: "all",
      services,
      ignore_job_id: job.job_id,
    };
    const deps = getAvailabilityDependencies(client);
    const reserved = String(job.technician_username || "").trim();
    if (reserved) {
      try {
        return await availabilityEngine.reservePublicCustomerTechnician(deps, {
          ...options,
          preferred_username: reserved,
        });
      } catch (error) {
        if (![409, 400].includes(Number(error.status || 0))) throw error;
      }
    }
    return availabilityEngine.reservePublicCustomerTechnician(deps, options);
  }

  async function assertPendingReservationShape(client, jobId) {
    const state = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM public.job_assignments WHERE job_id=$1) AS assignments,
         (SELECT COUNT(*)::int FROM public.job_team_members WHERE job_id=$1) AS team_members,
         (SELECT COUNT(*)::int FROM public.job_offers WHERE job_id=$1) AS offers`,
      [jobId]
    );
    const row = state.rows[0] || {};
    if (Number(row.assignments || 0) !== 0 || Number(row.team_members || 0) !== 0 || Number(row.offers || 0) !== 0) {
      throw httpError(409, "PENDING_RESERVATION_STATE_DRIFT");
    }
  }

  async function approve(req, res) {
    const jobId = Number(req.params?.job_id || 0);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "INVALID_JOB_ID" });
    const client = await pool.connect();
    let afterCommit = null;
    try {
      await client.query("BEGIN");
      const job = await loadReservation(client, jobId);
      if (!job) throw httpError(404, "BOOKING_NOT_FOUND");

      if (job.job_source !== "customer") throw httpError(409, "BOOKING_NOT_PENDING_APPROVAL");
      if (job.job_status !== JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW) {
        if (job.booking_mode === "scheduled") {
          const assignment = await client.query(
            `SELECT technician_username FROM public.job_assignments
              WHERE job_id=$1 AND status=$2 ORDER BY technician_username LIMIT 1`,
            [jobId, ASSIGNMENT_STATUS.IN_PROGRESS]
          );
          if (assignment.rows[0]) {
            await client.query("COMMIT");
            return res.json({ success: true, replayed: true, job_id: jobId, mode: "scheduled" });
          }
        }
        if (job.booking_mode === "urgent" && job.job_status === JOB_STATUS.ADMIN_URGENT_WAITING) {
          const offer = await client.query(`SELECT 1 FROM public.job_offers WHERE job_id=$1 LIMIT 1`, [jobId]);
          if (offer.rows[0]) {
            await client.query("COMMIT");
            return res.json({ success: true, replayed: true, job_id: jobId, mode: "urgent" });
          }
        }
        throw httpError(409, "BOOKING_NOT_PENDING_APPROVAL");
      }
      await assertPendingReservationShape(client, jobId);

      if (job.booking_mode === "scheduled") {
        const selected = await reserveScheduledTechnician(client, job);
        await client.query(
          `UPDATE public.jobs
              SET technician_username=$2, technician_team=$2,
                  job_status=$3, dispatch_mode='forced',
                  approved_by_admin=COALESCE(approved_by_admin,$4),
                  approved_at=COALESCE(approved_at,NOW())
            WHERE job_id=$1`,
          [jobId, selected.username, JOB_STATUS.ADMIN_SCHEDULED_PENDING, adminUsername(req)]
        );
        await client.query(
          `INSERT INTO public.job_assignments (job_id, technician_username, status)
           VALUES ($1,$2,$3)
           ON CONFLICT (job_id, technician_username)
           DO UPDATE SET status=EXCLUDED.status`,
          [jobId, selected.username, ASSIGNMENT_STATUS.IN_PROGRESS]
        );
        await logJobUpdate(jobId, {
          actor_username: adminUsername(req),
          actor_role: "admin",
          action: "customer_booking_approved",
          message: "Pending customer scheduled booking approved",
          payload: { reserved_technician: job.technician_username || null, assigned_technician: selected.username },
        }, client);
        await client.query("COMMIT");
        afterCommit = { mode: "scheduled", usernames: [selected.username], job };
      } else if (job.booking_mode === "urgent") {
        const username = String(req.body?.technician_username || "").trim();
        if (!username) throw httpError(400, "TECHNICIAN_REQUIRED");
        if (!(await isTechReady(username))) throw httpError(409, "TECHNICIAN_NOT_READY");
        const conflict = await checkTechCollision(username, job.appointment_datetime, job.duration_min, jobId);
        if (conflict) throw httpError(409, "TECHNICIAN_SLOT_CONFLICT");
        await client.query(
          `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
           VALUES ($1,$2,$3,NOW() + INTERVAL '10 minutes')`,
          [jobId, username, OFFER_STATUS.PENDING]
        );
        await client.query(
          `UPDATE public.jobs
              SET technician_username=NULL, technician_team=NULL,
                  job_status=$2, dispatch_mode='offer',
                  approved_by_admin=COALESCE(approved_by_admin,$3),
                  approved_at=COALESCE(approved_at,NOW())
            WHERE job_id=$1`,
          [jobId, JOB_STATUS.ADMIN_URGENT_WAITING, adminUsername(req)]
        );
        await logJobUpdate(jobId, {
          actor_username: adminUsername(req),
          actor_role: "admin",
          action: "customer_urgent_approved",
          message: "Pending customer urgent booking approved for offer",
          payload: { offer_technician: username },
        }, client);
        await client.query("COMMIT");
        afterCommit = { mode: "urgent", usernames: [username], job };
      } else {
        throw httpError(409, "BOOKING_MODE_NOT_APPROVABLE");
      }

      if (afterCommit.mode === "scheduled") {
        let income = {};
        try {
          income = await refreshTechnicianIncomePreviewForJob(jobId, afterCommit.usernames, { source: "job_preview" }) || {};
        } catch (error) {
          console.warn("[booking_approval] scheduled income preview failed", { job_id: jobId, code: "POST_COMMIT_INCOME_FAILED" });
        }
        try {
          await notifyDirectJobAssigned({
            usernames: afterCommit.usernames,
            job_id: jobId,
            booking_code: job.booking_code,
            job_type: job.job_type,
            appointment_datetime: job.appointment_datetime,
            job_zone: job.job_zone,
            income_by_username: income,
          });
        } catch (error) {
          console.warn("[booking_approval] scheduled notification failed", { job_id: jobId, code: "POST_COMMIT_NOTIFICATION_FAILED" });
        }
      } else {
        try {
          await notifyUrgentOffer({
            usernames: afterCommit.usernames,
            job_id: jobId,
            booking_code: job.booking_code,
            job_type: job.job_type,
            appointment_datetime: job.appointment_datetime,
            job_zone: job.job_zone,
          });
        } catch (error) {
          console.warn("[booking_approval] urgent post_commit action failed", { job_id: jobId, code: "POST_COMMIT_ACTION_FAILED" });
        }
      }
      return res.json({ success: true, replayed: false, job_id: jobId, mode: afterCommit.mode });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      const status = Number(error.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error.code || "BOOKING_APPROVAL_FAILED",
        code: error.code || "BOOKING_APPROVAL_FAILED",
      });
    } finally {
      client.release();
    }
  }

  async function reject(req, res) {
    const jobId = Number(req.params?.job_id || 0);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: "INVALID_JOB_ID" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = await loadReservation(client, jobId);
      if (!job) throw httpError(404, "BOOKING_NOT_FOUND");
      if (job.job_source !== "customer" || job.job_status !== JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW) {
        throw httpError(409, "BOOKING_NOT_PENDING_APPROVAL");
      }
      const reason = String(req.body?.reason || "admin_rejected_pending_booking").trim().slice(0, 500);
      await client.query(
        `UPDATE public.jobs
            SET job_status='ยกเลิก', canceled_at=COALESCE(canceled_at,NOW()),
                cancel_reason=$2, technician_username=NULL, technician_team=NULL
          WHERE job_id=$1`,
        [jobId, reason]
      );
      await logJobUpdate(jobId, {
        actor_username: adminUsername(req),
        actor_role: "admin",
        action: "customer_booking_rejected",
        message: reason,
        payload: {
          booking_mode: job.booking_mode,
          reserved_technician: job.technician_username || null,
        },
      }, client);
      await client.query("COMMIT");
      return res.json({ success: true, job_id: jobId, status: "rejected" });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      const status = Number(error.status || 500);
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: error.code || "BOOKING_REJECTION_FAILED",
        code: error.code || "BOOKING_REJECTION_FAILED",
      });
    } finally {
      client.release();
    }
  }

  return { approve, reject };
}

module.exports = { createBookingApprovalService };
