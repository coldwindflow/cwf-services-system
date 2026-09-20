"use strict";

const AXS_CONFIRMATION_TEMPLATES = Object.freeze({
  th: `ยืนยันนัดหมายบริการแอร์

AXS Air Service
แอดมินขออนุญาตยืนยันรายละเอียดนัดหมายดังนี้ค่ะ

🔎 เลขงาน: {{booking_code}}
👤 ชื่อลูกค้า: {{customer_name}}
📞 เบอร์โทร: {{customer_phone}}
📅 วันและเวลานัด: {{appointment_th}}
🧾 ประเภทงาน: {{job_type}}
🏠 สถานที่บริการ: {{address_text}}

🧾 รายการบริการ:
{{items_text}}

💲 ยอดชำระสุทธิ: {{job_price_th}} บาท

รับประกันงานล้าง 60 วัน
ก่อนช่างเข้าหน้างาน ช่างจะติดต่อยืนยันนัดหมายอีกครั้ง กรุณารับสายตามเบอร์ที่แจ้งไว้

ขอบคุณค่ะ
AXS Air Service`,
  en: `Service Appointment Confirmation

AXS Air Service
Our admin team would like to confirm your appointment details:

🔎 Job No.: {{booking_code}}
📍 Customer: {{customer_name}}
📞 Phone: {{customer_phone}}
📅 Appointment: {{appointment_en}}
🧾 Job Type: {{job_type_en}}
🏠 Address: {{address_text}}

🧾 Items:
{{items_text_en}}

💲 Net Total: {{job_price_en}} THB

AC cleaning service warranty: 60 days.
Our technician will call to reconfirm before arriving.

Thank you.
AXS Air Service`,
});

function confirmationTemplateForJob(job, lang, cwfTemplate) {
  const key = String(job?.brand_key || "cwf").trim().toLowerCase();
  if (key !== "axs") return cwfTemplate;
  return AXS_CONFIRMATION_TEMPLATES[String(lang || "th").toLowerCase() === "en" ? "en" : "th"];
}

module.exports = { AXS_CONFIRMATION_TEMPLATES, confirmationTemplateForJob };
