"use strict";

// PR2 is extraction-only. These names centralize the values already persisted
// by the legacy handlers; changing any value is reserved for PR3.
const JOB_STATUS = Object.freeze({
  ADMIN_SCHEDULED_PENDING: "รอดำเนินการ",
  ADMIN_URGENT_WAITING: "รอช่างยืนยัน",
  CUSTOMER_SCHEDULED_REVIEW: "รอตรวจสอบ",
  URGENT_NO_TECHNICIAN: "ไม่พบช่างรับงาน",
});

const ASSIGNMENT_STATUS = Object.freeze({
  IN_PROGRESS: "in_progress",
});

const OFFER_STATUS = Object.freeze({
  PENDING: "pending",
});

function isPendingCustomerScheduledReservation(job = {}) {
  return String(job.job_source || "") === "customer"
    && String(job.booking_mode || "") === "scheduled"
    && String(job.job_status || "") === JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW;
}

function pendingCustomerScheduledReservationSql(alias = "j") {
  const safeAlias = /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(alias || "")) ? String(alias) : "j";
  return `(${safeAlias}.job_source='customer' AND ${safeAlias}.booking_mode='scheduled' AND ${safeAlias}.job_status='${JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW}')`;
}

module.exports = {
  JOB_STATUS,
  ASSIGNMENT_STATUS,
  OFFER_STATUS,
  isPendingCustomerScheduledReservation,
  pendingCustomerScheduledReservationSql,
};
