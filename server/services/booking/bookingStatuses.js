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

module.exports = {
  JOB_STATUS,
  ASSIGNMENT_STATUS,
  OFFER_STATUS,
};
