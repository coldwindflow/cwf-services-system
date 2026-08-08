(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const LINE_OA_URL = "https://lin.ee/fG1Oq7y";
  const HEADING = "CWF BOOKING TICKET";
  const MANUAL_COPY_ERROR = "เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ กรุณาคัดลอกข้อความด้านล่าง";

  function safeText(value, maxLength) {
    return String(value == null ? "" : value)
      .replace(/[\r\n\u2028\u2029]+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function formatText(ticket) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) return "";
    const bookingCode = safeText(ticket.booking_code, 40);
    const components = Array.isArray(ticket.components)
      ? ticket.components.map((item) => ({
          label: safeText(item?.label, 200),
          quantity: Number(item?.quantity),
        })).filter((item) => item.label && Number.isInteger(item.quantity) && item.quantity > 0)
      : [];
    if (!bookingCode || !components.length) return "";

    const lines = [
      HEADING,
      `รหัสการจอง: ${bookingCode}`,
      `ชื่อผู้ติดต่อ: ${safeText(ticket.customer_name, 120) || "-"}`,
      `เบอร์โทร: ${safeText(ticket.customer_phone, 30) || "-"}`,
      "รายการบริการ:",
    ];
    components.forEach((item) => lines.push(`- ${item.label} x ${item.quantity}`));
    lines.push(
      `จำนวนรวม: ${Number.isInteger(Number(ticket.total_machine_count)) ? Number(ticket.total_machine_count) : 0} เครื่อง`,
      `วันเวลานัด: ${safeText(ticket.appointment_datetime, 80) || "-"}`,
      `ยอดยืนยันจากระบบ: ${safeText(ticket.exact_total, 40) || "0.00"} บาท`,
      `สถานะ: ${safeText(ticket.public_status, 80) || "รอแอดมินยืนยัน"}`,
      "ผู้ส่งยืนยันว่า LINE บัญชีนี้เป็นผู้ติดต่อสำหรับรายการจองนี้",
    );
    return lines.join("\n");
  }

  async function copyText(value) {
    const ticketText = String(value || "");
    if (!ticketText) return { status: "manual", error: "ไม่พบข้อมูล Ticket ที่ยืนยันจากระบบ" };
    try {
      if (!navigator.clipboard?.writeText || window.isSecureContext === false) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(ticketText);
      return { status: "copied", error: "" };
    } catch (_) {
      return { status: "manual", error: MANUAL_COPY_ERROR };
    }
  }

  root.bookingTicket = Object.freeze({
    lineUrl: LINE_OA_URL,
    formatText,
    copyText,
  });
})();
