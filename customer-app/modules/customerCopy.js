(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const messages = Object.freeze({
    staleSlot: "ช่วงเวลานี้เพิ่งมีผู้จอง กรุณาเลือกเวลาใหม่",
    noSlots: "ยังไม่มีคิวว่างในวันที่เลือก กรุณาเลือกวันอื่น",
    disabled: "ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาติดต่อแอดมิน",
    network: "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
    unknown: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน",
    urgentPending: "แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง",
    urgentApproved: "แอดมินยืนยันคำขอแล้ว กรุณาติดตามสถานะงาน",
    urgentClosed: "คำขอนี้สิ้นสุดแล้ว กรุณาติดต่อแอดมินหากต้องการความช่วยเหลือ",
    otherServices: "งานซ่อม ติดตั้ง ย้ายแอร์ หรือตรวจอาการ กรุณาติดต่อแอดมินเพื่อประเมินรายละเอียด ราคา และจัดคิวให้เหมาะสม",
  });

  const DISABLED_CODES = new Set([
    "SCHEDULED_BOOKING_DISABLED",
    "URGENT_BOOKING_DISABLED",
    "CUSTOMER_BOOKING_DISABLED",
    "ONLINE_BOOKING_DISABLED",
  ]);
  const STALE_SLOT_CODES = new Set([
    "SLOT_IN_PAST",
    "SLOT_TAKEN",
    "SLOT_UNAVAILABLE",
    "SLOT_NO_LONGER_AVAILABLE",
    "BOOKING_SLOT_UNAVAILABLE",
    "CAPACITY_CONFLICT",
  ]);
  const NO_SLOT_CODES = new Set([
    "NO_SLOTS",
    "NO_OPEN_SLOTS",
    "NO_AVAILABLE_SLOTS",
    "AVAILABILITY_EMPTY",
  ]);
  const URGENT_ACTIONABLE_PHASES = new Set(["approved", "accepted", "assigned", "in_progress"]);
  const URGENT_TERMINAL_PHASES = new Set(["terminal", "rejected", "cancelled", "canceled", "closed"]);
  const urgentSubmittedViews = Object.freeze({
    pending: Object.freeze({
      state: "pending",
      mark: "✓",
      kicker: "ส่งคำขอแล้ว",
      title: "ส่งคำขอแล้ว",
      message: messages.urgentPending,
      detail: "ระบบรับคำขอของคุณแล้ว และจะแจ้งสถานะเมื่อแอดมินตรวจสอบเสร็จ",
      statusLabel: "รอแอดมินตรวจสอบ",
      railLabel: "รอแอดมิน",
      boxClass: "is-warning",
      cardClass: "success-card",
      showAdminContact: false,
    }),
    actionable: Object.freeze({
      state: "actionable",
      mark: "✓",
      kicker: "คำขอได้รับการยืนยันแล้ว",
      title: "คำขอได้รับการยืนยันแล้ว",
      message: messages.urgentApproved,
      detail: "ดูรายละเอียดล่าสุดและความคืบหน้าได้ที่หน้าติดตามงาน",
      statusLabel: "พร้อมติดตามงาน",
      railLabel: "ติดตามงาน",
      boxClass: "is-success",
      cardClass: "success-card",
      showAdminContact: false,
    }),
    terminal: Object.freeze({
      state: "terminal",
      mark: "!",
      kicker: "คำขอสิ้นสุดแล้ว",
      title: "คำขอสิ้นสุดแล้ว",
      message: messages.urgentClosed,
      detail: "หากต้องการจองใหม่หรือตรวจสอบรายละเอียด กรุณาติดต่อแอดมิน",
      statusLabel: "สิ้นสุดแล้ว",
      railLabel: "สิ้นสุด",
      boxClass: "is-warning",
      cardClass: "",
      showAdminContact: true,
    }),
  });

  function errorCode(error) {
    return String(error?.data?.code || error?.code || "").trim().toUpperCase();
  }

  function isNetworkError(error) {
    if (!error) return false;
    if (error.name === "AbortError" || error.name === "TypeError") return true;
    return false;
  }

  function bookingError(error, hint) {
    if (hint === "stale_slot") return messages.staleSlot;
    if (hint === "no_slots") return messages.noSlots;
    const code = errorCode(error);
    if (DISABLED_CODES.has(code)) return messages.disabled;
    if (STALE_SLOT_CODES.has(code)) return messages.staleSlot;
    if (NO_SLOT_CODES.has(code)) return messages.noSlots;
    if (hint === "slot" && Number(error?.status) === 409 && code !== "IDEMPOTENCY_KEY_REUSED") {
      return messages.staleSlot;
    }
    if (isNetworkError(error)) return messages.network;
    return messages.unknown;
  }

  function availabilityEmpty() {
    return messages.noSlots;
  }

  function urgentSubmittedView(status) {
    const phase = String(status?.phase || "").trim().toLowerCase();
    if (status?.terminal === true || URGENT_TERMINAL_PHASES.has(phase)) return urgentSubmittedViews.terminal;
    if (status?.confirmed === true || URGENT_ACTIONABLE_PHASES.has(phase)) return urgentSubmittedViews.actionable;
    return urgentSubmittedViews.pending;
  }

  function urgentStatus(status) {
    return urgentSubmittedView(status).message;
  }

  root.customerCopy = {
    messages,
    bookingError,
    availabilityEmpty,
    urgentStatus,
    urgentSubmittedView,
  };
})();
