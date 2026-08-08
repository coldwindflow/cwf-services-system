"use strict";

const { JOB_STATUS } = require("./bookingStatuses");

function text(value, max = 300) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .trim()
    .slice(0, max);
}
function exactMoney(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text(value, 40));
  if (!match) return "0.00";
  return `${match[1]}.${String(match[2] || "").padEnd(2, "0")}`;
}

const PUBLIC_STATUS = Object.freeze({
  scheduled: "รอแอดมินยืนยัน",
  urgent: "กำลังค้นหาช่าง",
  urgent_fallback: "รอแอดมินช่วยจัดงาน",
});

function normalizedPhone(value) {
  return text(value, 40).replace(/\D/g, "").slice(0, 30);
}

function appointmentIso(value) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function publicStatusForJob(job = {}) {
  if (text(job.public_status, 80)) return text(job.public_status, 80);
  if (String(job.booking_mode || "").trim().toLowerCase() !== "urgent") return PUBLIC_STATUS.scheduled;
  return String(job.job_status || "") === JOB_STATUS.URGENT_NO_TECHNICIAN
    ? PUBLIC_STATUS.urgent_fallback
    : PUBLIC_STATUS.urgent;
}

function buildBookingTicket({ job = {}, items = [] } = {}) {
  const allItems = Array.isArray(items) ? items : [];
  const serviceItems = allItems.filter((item) => item.is_service === true);
  const ticketItems = serviceItems.length ? serviceItems : allItems;
  const components = ticketItems.map((item) => {
    const quantity = Number(item.qty || 0);
    return {
      label: text(item.item_name, 200),
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 0,
    };
  }).filter((item) => item.label && item.quantity > 0);
  return {
    heading: "CWF BOOKING TICKET",
    booking_code: text(job.booking_code, 40),
    customer_name: text(job.customer_name, 120),
    customer_phone: normalizedPhone(job.customer_phone),
    components,
    total_machine_count: components.reduce((sum, item) => sum + item.quantity, 0),
    appointment_datetime: appointmentIso(job.appointment_datetime),
    exact_total: exactMoney(job.job_price),
    public_status: publicStatusForJob(job),
  };
}

async function loadBookingTicket(db, jobId) {
  const jobResult = await db.query(
    `SELECT booking_code, customer_name, customer_phone, appointment_datetime, job_price,
            booking_mode, job_status
       FROM public.jobs WHERE job_id=$1 LIMIT 1`, [jobId]
  );
  const job = jobResult.rows[0];
  if (!job) return null;
  const itemResult = await db.query(
    `SELECT item_name, qty, is_service FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id`, [jobId]
  );
  return buildBookingTicket({ job, items: itemResult.rows });
}

function formatBookingTicket(ticket) {
  const lines = [ticket.heading, `รหัสการจอง: ${ticket.booking_code}`, `ชื่อผู้ติดต่อ: ${ticket.customer_name}`,
    `เบอร์โทร: ${ticket.customer_phone}`, "รายการบริการ:"];
  ticket.components.forEach((item) => lines.push(`- ${item.label} x ${item.quantity}`));
  lines.push(`จำนวนรวม: ${ticket.total_machine_count} เครื่อง`, `วันเวลานัด: ${ticket.appointment_datetime}`,
    `ยอดยืนยันจากระบบ: ${ticket.exact_total} บาท`, `สถานะ: ${ticket.public_status}`,
    "ผู้ส่งยืนยันว่า LINE บัญชีนี้เป็นผู้ติดต่อสำหรับรายการจองนี้");
  return lines.join("\n");
}

module.exports = {
  buildBookingTicket,
  loadBookingTicket,
  formatBookingTicket,
  exactMoney,
  normalizedPhone,
  publicStatusForJob,
};
