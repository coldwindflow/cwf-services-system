(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const messages = Object.freeze({
    staleSlot: "ช่วงเวลานี้เพิ่งมีผู้จอง กรุณาเลือกเวลาใหม่",
    noSlots: "ยังไม่มีคิวว่างในวันที่เลือก กรุณาเลือกวันอื่น",
    disabled: "ขณะนี้ยังไม่เปิดรับจองออนไลน์ กรุณาติดต่อแอดมิน",
    network: "เชื่อมต่อระบบไม่สำเร็จ กรุณาลองอีกครั้ง",
    unknown: "ระบบขัดข้องชั่วคราว กรุณาลองใหม่หรือติดต่อแอดมิน",
    urgentPending: "กำลังค้นหาช่างที่พร้อมรับงาน",
    urgentApproved: "ช่างรับงานแล้ว",
    urgentFallback: "ขณะนี้ยังไม่มีช่างรับงาน คุณสามารถติดตามสถานะหรือติดต่อแอดมินได้",
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
  const ACTIONABLE_PHASES = new Set(["approved", "accepted", "assigned", "in_progress"]);
  const TERMINAL_PHASES = new Set(["terminal", "rejected", "cancelled", "canceled", "closed"]);
  const PENDING_STATUSES = new Set(["pending", "pending_review", "admin_review", "รอตรวจสอบ"]);
  const ACTIONABLE_STATUSES = new Set([
    "approved", "accepted", "assigned", "in_progress",
    "รอดำเนินการ", "กำลังทำ", "กำลังดำเนินการ",
  ]);
  const TERMINAL_STATUSES = new Set(["rejected", "cancelled", "canceled", "closed", "ยกเลิก", "ปฏิเสธ"]);
  const COMPLETED_STATUSES = new Set(["done", "completed", "เสร็จแล้ว", "ปิดงาน"]);
  const STARTED_STATUSES = new Set(["started", "in_progress", "กำลังทำ", "กำลังดำเนินการ", "กำลังให้บริการ"]);
  const ASSIGNED_STATUSES = new Set(["assigned", "accepted", "รอดำเนินการ"]);
  const URGENT_SEARCHING_STATUSES = new Set(["searching", "pending_accept", "รอช่างยืนยัน"]);
  const URGENT_FALLBACK_STATUSES = new Set(["fallback", "no_technician", "ไม่พบช่างรับงาน", "ตีกลับ"]);
  const urgentSubmittedViews = Object.freeze({
    pending: Object.freeze({
      state: "pending",
      mark: "✓",
      kicker: "ส่งคำขอแล้ว",
      title: "ส่งคำขอแล้ว",
      message: messages.urgentPending,
      detail: "รับคำขอแล้ว กำลังส่งงานให้ช่างที่พร้อมรับงาน",
      statusLabel: "กำลังค้นหาช่าง",
      railLabel: "กำลังค้นหาช่าง",
      boxClass: "is-warning",
      cardClass: "success-card",
      showAdminContact: false,
    }),
    fallback: Object.freeze({
      state: "fallback",
      mark: "!",
      kicker: "ยังไม่มีช่างรับงาน",
      title: "ยังไม่มีช่างรับงาน",
      message: messages.urgentFallback,
      detail: "รหัสการจองยังใช้ติดตามงานได้ตามปกติ",
      statusLabel: "รอแอดมินช่วยจัดงาน",
      railLabel: "ติดต่อแอดมิน",
      boxClass: "is-warning",
      cardClass: "",
      showAdminContact: true,
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
    if (hint === "disabled") return messages.disabled;
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

  function bookingApprovalView(status) {
    const source = status || {};
    const mode = String(source.booking_mode || source.mode || "urgent").trim().toLowerCase();
    const phase = String(source.phase || "").trim().toLowerCase();
    const jobStatus = String(source.job_status || source.status || "").trim().toLowerCase();
    const terminal = source.terminal === true
      || TERMINAL_PHASES.has(phase)
      || TERMINAL_STATUSES.has(jobStatus)
      || jobStatus.includes("ยกเลิก")
      || jobStatus.includes("ปฏิเสธ");
    if (terminal) return urgentSubmittedViews.terminal;
    if (mode === "urgent" && (
      URGENT_FALLBACK_STATUSES.has(phase)
      || URGENT_FALLBACK_STATUSES.has(jobStatus)
      || jobStatus.includes("ไม่พบช่าง")
      || jobStatus.includes("ตีกลับ")
    )) return urgentSubmittedViews.fallback;

    const explicitlyPending = PENDING_STATUSES.has(phase) || PENDING_STATUSES.has(jobStatus);
    const assignedEvidence = Boolean(
      source.assigned_at
      || source.accepted_at
      || source.technician
      || (Array.isArray(source.technician_team) && source.technician_team.length)
      || ["assigned", "accepted", "in_progress"].includes(phase)
      || ASSIGNED_STATUSES.has(jobStatus)
      || STARTED_STATUSES.has(jobStatus),
    );
    const actionable = !explicitlyPending && (mode === "urgent"
      ? assignedEvidence
      : (source.confirmed === true
        || ACTIONABLE_PHASES.has(phase)
        || ACTIONABLE_STATUSES.has(jobStatus)));
    if (actionable) return urgentSubmittedViews.actionable;
    if (mode === "scheduled") {
      return Object.freeze({
        ...urgentSubmittedViews.pending,
        message: "ระบบกันช่วงเวลานี้ไว้ให้ชั่วคราว แอดมินจะตรวจสอบรายละเอียดและยืนยันคิวให้คุณ",
        detail: "ส่งคำขอจองแล้ว และระบบกันช่วงเวลานี้ไว้ให้ชั่วคราว",
        statusLabel: "รอแอดมินยืนยัน",
        railLabel: "รอแอดมินยืนยัน",
      });
    }
    if (URGENT_SEARCHING_STATUSES.has(phase) || URGENT_SEARCHING_STATUSES.has(jobStatus)) {
      return urgentSubmittedViews.pending;
    }
    return urgentSubmittedViews.pending;
  }

  function customerLifecycleView(status) {
    const source = status || {};
    const approval = bookingApprovalView(source);
    const phase = String(source.phase || "").trim().toLowerCase();
    const jobStatus = String(source.job_status || source.status || "").trim().toLowerCase();
    const cancelled = Boolean(source.canceled_at || source.cancelled_at)
      || approval.state === "terminal"
      || TERMINAL_STATUSES.has(jobStatus)
      || jobStatus.includes("ยกเลิก")
      || jobStatus.includes("ปฏิเสธ");
    if (cancelled) {
      return Object.freeze({ ...approval, state: "cancelled", statusLabel: "สิ้นสุดแล้ว", railLabel: "สิ้นสุดแล้ว" });
    }
    if (Boolean(source.finished_at)
      || COMPLETED_STATUSES.has(jobStatus)
      || jobStatus.includes("เสร็จ")) {
      return Object.freeze({
        ...urgentSubmittedViews.actionable,
        state: "completed",
        statusLabel: "งานเสร็จแล้ว",
        railLabel: "งานเสร็จแล้ว",
      });
    }
    if (Boolean(source.started_at) || STARTED_STATUSES.has(jobStatus)) {
      return Object.freeze({
        ...urgentSubmittedViews.actionable,
        state: "started",
        statusLabel: "กำลังให้บริการ",
        railLabel: "กำลังให้บริการ",
      });
    }
    if (Boolean(source.checkin_at)) {
      return Object.freeze({
        ...urgentSubmittedViews.actionable,
        state: "checked_in",
        statusLabel: "ช่างถึงหน้างานแล้ว",
        railLabel: "ถึงหน้างานแล้ว",
      });
    }
    if (Boolean(source.travel_started_at)) {
      return Object.freeze({
        ...urgentSubmittedViews.actionable,
        state: "traveling",
        statusLabel: "ช่างกำลังเดินทาง",
        railLabel: "กำลังเดินทาง",
      });
    }
    const hasAssignedTechnician = Boolean(
      source.assigned_at
      || source.accepted_at
      || source.technician
      || (Array.isArray(source.technician_team) && source.technician_team.length),
    );
    const assigned = approval.state !== "pending" && (hasAssignedTechnician
      || ASSIGNED_STATUSES.has(phase)
      || ASSIGNED_STATUSES.has(jobStatus));
    if (assigned) {
      return Object.freeze({
        ...urgentSubmittedViews.actionable,
        state: "assigned",
        statusLabel: String(source.booking_mode || source.mode || "").trim().toLowerCase() === "urgent"
          ? "ช่างรับงานแล้ว"
          : "ยืนยันคิวแล้ว",
        railLabel: String(source.booking_mode || source.mode || "").trim().toLowerCase() === "urgent"
          ? "ช่างรับงานแล้ว"
          : "ยืนยันคิวแล้ว",
      });
    }
    return approval;
  }

  function urgentSubmittedView(status) {
    return bookingApprovalView({ ...(status || {}), booking_mode: "urgent" });
  }

  function urgentStatus(status) {
    return urgentSubmittedView(status).message;
  }

  root.customerCopy = {
    messages,
    bookingError,
    availabilityEmpty,
    bookingApprovalView,
    customerLifecycleView,
    urgentStatus,
    urgentSubmittedView,
  };
})();
