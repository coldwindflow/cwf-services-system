module.exports = function createDocumentRoutes(deps = {}) {
  const express = require("express");
  const trackingPrivacy = require("../services/public/trackingPrivacy");
  const router = express.Router();
  const pool = deps.pool || require("../db/pool");
  const isAdminRequest = deps.isAdminRequest;
  const docsRateLimiter = deps.docsRateLimiter || null;
  const accountingOwnerSignaturePublicUrl = deps.accountingOwnerSignaturePublicUrl || (() => "");
  const accountingSignaturePublicUrl = deps.accountingSignaturePublicUrl || (() => "");
  const accountingOwnerSignerName = deps.accountingOwnerSignerName || (() => "");
  const accountingOwnerSignerPosition = deps.accountingOwnerSignerPosition || (() => "");

  function money(n) { return Number(n || 0).toFixed(2); }
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function getJobDocData(job_id) {
    const jobR = await pool.query(
      `SELECT job_id, booking_code, booking_token, customer_name, customer_phone, job_type,
              appointment_datetime, address_text, job_price, paid_at, paid_by, payment_status,
              final_signature_path, final_signature_at, finished_at, canceled_at
         FROM public.jobs WHERE job_id=$1`, [job_id]
    );
    if (jobR.rows.length === 0) return null;
    const job = jobR.rows[0];
    try {
      const settlement = await pool.query(
        `SELECT payment_source, customer_due FROM public.jobs WHERE job_id=$1`, [job_id]
      );
      if (settlement.rows?.[0]) Object.assign(job, settlement.rows[0]);
    } catch (error) {
      if (error?.code !== "42703") throw error;
    }

    const itemsR = await pool.query(
      `SELECT item_name, qty, unit_price, line_total
         FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id`, [job_id]
    );
    const promoR = await pool.query(
      `SELECT p.promo_name, p.promo_type, p.promo_value, jp.applied_discount
         FROM public.job_promotions jp
         JOIN public.promotions p ON p.promo_id=jp.promo_id
        WHERE jp.job_id=$1 LIMIT 1`, [job_id]
    );
    const subtotal = itemsR.rows.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const discount = promoR.rows[0]?.applied_discount ? Number(promoR.rows[0].applied_discount) : 0;
    const total = Math.max(0, subtotal > 0 ? subtotal - discount : Number(job.job_price || 0));
    return { job, items: itemsR.rows, promo: promoR.rows[0] || null, subtotal, discount, total };
  }

  function itemRows(data) {
    return data.items?.length
      ? data.items.map((item) => `<tr><td>${esc(item.item_name)}</td><td class="num">${esc(item.qty)}</td><td class="num">${money(item.unit_price)}</td><td class="num">${money(item.line_total)}</td></tr>`).join("")
      : `<tr><td colspan="4">-</td></tr>`;
  }

  function company() {
    return {
      name: process.env.COMPANY_NAME || "Coldwindflow air services",
      address: process.env.COMPANY_ADDRESS || "23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260",
      phone: process.env.COMPANY_PHONE || "098-877-7321",
      line: process.env.COMPANY_LINE || "@cwfair",
      bankName: process.env.COMPANY_BANK_NAME || "",
      bankAccount: process.env.COMPANY_BANK_ACCOUNT || "",
      bankQr: process.env.COMPANY_BANK_QR_URL || "",
      signature: process.env.COMPANY_SIGNATURE_URL || accountingOwnerSignaturePublicUrl() || accountingSignaturePublicUrl({ signature_url: "/assets/signatures/owner-signature-transparent.png" }),
      signer: accountingOwnerSignerName(),
      position: accountingOwnerSignerPosition(),
    };
  }

  function baseCss() {
    return `body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:20px;color:#0f172a;background:#f8fafc}.card,.box{background:#fff;border:1px solid rgba(15,23,42,.13);border-radius:14px;padding:14px}.top,.row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}.muted{color:#64748b;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:12px;background:#fff}th,td{border:1px solid rgba(15,23,42,.13);padding:8px;font-size:13px}th{background:rgba(37,99,235,.08);text-align:left}.num{text-align:right}.paid{font-weight:800;color:#166534}@media print{.noprint{display:none}body{background:#fff}}`;
  }

  function paymentSummary(data, c) {
    const j = data.job;
    if (j.payment_source === "prepaid_entitlement") {
      return `<div class="box" style="margin-top:12px"><b>สถานะการชำระเงิน</b><div class="paid" style="margin-top:6px">ชำระล่วงหน้าแล้ว · ไม่มีค่าใช้จ่ายซ้ำสำหรับสิทธิ์นี้</div></div>`;
    }
    if (c.bankName || c.bankAccount) {
      return `<div class="box" style="margin-top:12px"><b>ข้อมูลการชำระเงิน</b>${c.bankName ? `<div class="muted" style="margin-top:6px">ธนาคาร: <b>${esc(c.bankName)}</b></div>` : ""}${c.bankAccount ? `<div class="muted">เลขบัญชี: <b>${esc(c.bankAccount)}</b></div>` : ""}${c.bankQr ? `<img src="${esc(c.bankQr)}" alt="QR" style="width:170px;max-width:100%;margin-top:8px;border-radius:12px">` : ""}</div>`;
    }
    return "";
  }

  function docHtml(title, data) {
    const j = data.job;
    const c = company();
    const promoLine = data.promo ? `<div>โปรโมชั่น: <b>${esc(data.promo.promo_name)}</b> (ลด ${money(data.discount)})</div>` : "";
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - ${esc(j.booking_code || `งาน #${j.job_id}`)}</title><style>${baseCss()}</style></head><body>
      <div class="top"><div><h2 style="margin:0">${esc(title)}</h2><div class="muted"><b>${esc(c.name)}</b></div><div class="muted">${esc(c.address)}</div><div class="muted">โทร ${esc(c.phone)} | LINE ${esc(c.line)}</div></div><div class="box"><b>${esc(j.booking_code || `งาน #${j.job_id}`)}</b><div class="muted">วันที่พิมพ์: ${esc(new Date().toLocaleString("th-TH"))}</div></div></div>
      <div class="box" style="margin-top:14px"><div><b>ลูกค้า:</b> ${esc(j.customer_name)}</div><div><b>โทร:</b> ${esc(j.customer_phone || "-")}</div><div><b>ประเภทงาน:</b> ${esc(j.job_type)}</div><div><b>นัด:</b> ${j.appointment_datetime ? esc(new Date(j.appointment_datetime).toLocaleString("th-TH")) : "-"}</div><div><b>ที่อยู่:</b> ${esc(j.address_text || "-")}</div></div>
      <table><thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr></thead><tbody>${itemRows(data)}</tbody></table>
      <div class="box" style="margin-top:12px">${promoLine}<div>รวมก่อนลด: <b>${money(data.subtotal)}</b> บาท</div><div>ส่วนลด: <b>${money(data.discount)}</b> บาท</div><div style="font-size:18px;margin-top:6px">ยอดสุทธิ: <b>${money(data.total)}</b> บาท</div></div>
      ${paymentSummary(data, c)}
      <div class="box" style="margin-top:12px"><div class="row"><div><div class="muted">ลายเซ็นผู้รับเงิน / ผู้ให้บริการ</div>${c.signature ? `<img src="${esc(c.signature)}" alt="authorized signature" style="max-width:180px;max-height:68px;margin-top:8px">` : ""}<div style="font-weight:800">${esc(c.signer)}</div><div class="muted">${esc(c.position)}</div></div><div style="text-align:center">${j.final_signature_path ? `<div class="muted">ลายเซ็นช่าง</div><img src="${esc(j.final_signature_path)}" alt="signature" style="width:220px;max-width:100%;border-radius:12px;margin-top:6px">` : ""}</div></div></div>
      <div class="noprint" style="margin-top:12px"><button onclick="window.print()">พิมพ์/บันทึกเป็น PDF</button></div>
    </body></html>`;
  }

  function eSlipHtml(data, slipUrl) {
    const j = data.job;
    const c = company();
    const prepaid = j.payment_source === "prepaid_entitlement";
    const paid = prepaid || ["paid", "verified"].includes(String(j.payment_status || "").toLowerCase()) || Boolean(j.paid_at);
    const phoneDigits = String(c.phone || "").replace(/[^0-9]/g, "");
    const qrUrl = !paid ? (c.bankQr || (phoneDigits ? `https://promptpay.io/${phoneDigits}/${Number(data.total || 0).toFixed(2)}.png` : "")) : "";
    const paidAt = j.paid_at ? new Date(j.paid_at).toLocaleString("th-TH") : (prepaid ? "ชำระล่วงหน้า" : "-");
    return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>e-slip - ${esc(j.booking_code || `งาน #${j.job_id}`)}</title><style>${baseCss()}</style></head><body>
      <div class="card"><div class="row"><div><div style="font-size:20px;font-weight:900">e-slip</div><div class="muted"><b>${esc(c.name)}</b></div><div class="muted">${esc(c.address)}</div><div class="muted">โทร ${esc(c.phone)} | LINE ${esc(c.line)}</div></div><div><b>${esc(j.booking_code || `งาน #${j.job_id}`)}</b><div class="muted">ชำระเมื่อ: ${esc(paidAt)}</div></div></div>
      <div class="card" style="margin-top:12px"><div><b>ลูกค้า:</b> ${esc(j.customer_name)}</div><div><b>โทร:</b> ${esc(j.customer_phone || "-")}</div><div><b>ประเภทงาน:</b> ${esc(j.job_type)}</div><div><b>ที่อยู่:</b> ${esc(j.address_text || "-")}</div></div>
      <table><thead><tr><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคา/หน่วย</th><th class="num">รวม</th></tr></thead><tbody>${itemRows(data)}</tbody></table>
      <div class="card" style="margin-top:12px"><div class="row" style="align-items:center"><div><div class="muted">ยอดสุทธิ</div><div style="font-size:24px;font-weight:900">${money(data.total)} บาท</div>${prepaid ? `<div class="paid">ชำระล่วงหน้าแล้ว</div>` : paid ? `<div class="paid">ชำระแล้ว</div>` : ""}</div>${qrUrl ? `<img src="${esc(qrUrl)}" alt="QR" style="width:170px;max-width:100%;border-radius:12px">` : ""}</div></div>
      ${slipUrl ? `<div class="card" style="margin-top:12px"><b>สลิปที่แนบ</b><img src="${esc(slipUrl)}" alt="slip" style="width:100%;max-width:520px;margin-top:8px;border-radius:14px"></div>` : ""}
      <div class="noprint" style="margin-top:12px"><button onclick="window.print()">พิมพ์/บันทึกเป็น PDF</button></div></div>
    </body></html>`;
  }

  async function canViewJobDoc(req, data) {
    const key = String(req.query?.key || "").trim();
    const token = data?.job?.booking_token || null;
    if (key && token && trackingPrivacy.timingSafeEqualStr(key, String(token))) return true;
    if (typeof isAdminRequest === "function") {
      try { if (await isAdminRequest(req)) return true; } catch (_) {}
    }
    return false;
  }

  async function isAdmin(req) {
    if (typeof isAdminRequest !== "function") return false;
    try { return Boolean(await isAdminRequest(req)); } catch (_) { return false; }
  }

  function docsRateLimited(req, res) {
    if (!docsRateLimiter) return false;
    const rate = docsRateLimiter.check(trackingPrivacy.clientIpKey(req));
    if (rate.allowed) return false;
    res.status(429).send("เรียกดูเอกสารถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
    return true;
  }

  function setSensitiveDocHeaders(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
  }

  async function loadAuthorizedJobDoc(req, res) {
    if (docsRateLimited(req, res)) return null;
    const job_id = Number(req.params.job_id);
    if (!job_id) { res.status(404).send("ไม่พบงาน"); return null; }
    const data = await getJobDocData(job_id);
    if (!data) { res.status(404).send("ไม่พบงาน"); return null; }
    if (!(await canViewJobDoc(req, data))) { res.status(404).send("ไม่พบงาน"); return null; }
    return data;
  }

  async function requireFinishedForCustomer(req, res, data) {
    if (data?.job?.finished_at) return true;
    if (await isAdmin(req)) return true;
    res.status(404).send("ไม่พบงาน");
    return false;
  }

  router.get("/docs/quote/:job_id", async (req, res) => {
    const data = await loadAuthorizedJobDoc(req, res);
    if (!data) return;
    setSensitiveDocHeaders(res);
    res.send(docHtml("ใบเสนอราคา", data));
  });

  router.get("/docs/receipt/:job_id", async (req, res) => {
    const data = await loadAuthorizedJobDoc(req, res);
    if (!data) return;
    if (!(await requireFinishedForCustomer(req, res, data))) return;
    setSensitiveDocHeaders(res);
    res.send(docHtml("ใบเสร็จรับเงิน", data));
  });

  router.get("/docs/eslip/:job_id", async (req, res) => {
    try {
      const data = await loadAuthorizedJobDoc(req, res);
      if (!data) return;
      if (!(await requireFinishedForCustomer(req, res, data))) return;
      const job_id = Number(req.params.job_id);
      const slipR = await pool.query(
        `SELECT public_url FROM public.job_photos
          WHERE job_id=$1 AND phase='payment_slip' AND public_url IS NOT NULL
          ORDER BY photo_id DESC LIMIT 1`, [job_id]
      );
      setSensitiveDocHeaders(res);
      res.send(eSlipHtml(data, slipR.rows?.[0]?.public_url || null));
    } catch (error) {
      console.error("[docs/eslip] failed", { code: String(error?.code || "ESLIP_FAILED") });
      res.status(500).send("สร้าง e-slip ไม่สำเร็จ");
    }
  });

  return router;
};
