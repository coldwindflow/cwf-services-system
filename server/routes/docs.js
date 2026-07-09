module.exports = function createDocumentRoutes(deps = {}) {
  const express = require("express");
  const trackingPrivacy = require("../services/public/trackingPrivacy");
  const router = express.Router();
  const pool = deps.pool || require("../db/pool");
  const isAdminRequest = deps.isAdminRequest;
  const docsRateLimiter = deps.docsRateLimiter || null;
  const accountingOwnerSignaturePublicUrl = deps.accountingOwnerSignaturePublicUrl;
  const accountingSignaturePublicUrl = deps.accountingSignaturePublicUrl;
  const accountingOwnerSignerName = deps.accountingOwnerSignerName;
  const accountingOwnerSignerPosition = deps.accountingOwnerSignerPosition;

  function money(n) {
    return Number(n || 0).toFixed(2);
  }

  async function getJobDocData(job_id) {
    const jobR = await pool.query(
      `SELECT job_id, booking_code, booking_token, customer_name, customer_phone, job_type, appointment_datetime, address_text, job_price,
              paid_at, paid_by, payment_status,
              final_signature_path, final_signature_at
       FROM public.jobs WHERE job_id=$1`,
      [job_id]
    );
    if (jobR.rows.length === 0) return null;

    const itemsR = await pool.query(
      `SELECT item_name, qty, unit_price, line_total
       FROM public.job_items WHERE job_id=$1 ORDER BY job_item_id`,
      [job_id]
    );

    const promoR = await pool.query(
      `SELECT p.promo_name, p.promo_type, p.promo_value, jp.applied_discount
       FROM public.job_promotions jp
       JOIN public.promotions p ON p.promo_id=jp.promo_id
       WHERE jp.job_id=$1
       LIMIT 1`,
      [job_id]
    );

    const subtotal = itemsR.rows.reduce((s, it) => s + Number(it.line_total || 0), 0);
    const discount = promoR.rows[0]?.applied_discount ? Number(promoR.rows[0].applied_discount) : 0;
    const total = Math.max(
      0,
      subtotal > 0 ? subtotal - discount : Number(jobR.rows[0].job_price || 0)
    );

    return { job: jobR.rows[0], items: itemsR.rows, promo: promoR.rows[0] || null, subtotal, discount, total };
  }

  function docHtml(title, data) {
    const j = data.job;
    const COMPANY_NAME = process.env.COMPANY_NAME || "Coldwindflow air services";
    const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260";
    const COMPANY_PHONE = process.env.COMPANY_PHONE || "098-877-7321";
    const COMPANY_LINE = process.env.COMPANY_LINE || "@cwfair";
    const COMPANY_SIGNATURE_URL = process.env.COMPANY_SIGNATURE_URL || accountingOwnerSignaturePublicUrl() || accountingSignaturePublicUrl({ signature_url: "/assets/signatures/owner-signature-transparent.png" });
    const COMPANY_SIGNER_NAME = accountingOwnerSignerName();
    const COMPANY_SIGNER_POSITION = accountingOwnerSignerPosition();
    const BANK_NAME = process.env.COMPANY_BANK_NAME || "";
    const BANK_ACCOUNT = process.env.COMPANY_BANK_ACCOUNT || "";
    const BANK_QR_URL = process.env.COMPANY_BANK_QR_URL || "";
    const rows =
      data.items && data.items.length
        ? data.items
            .map(
              (it) => `
      <tr>
        <td>${it.item_name}</td>
        <td style="text-align:right;">${it.qty}</td>
        <td style="text-align:right;">${money(it.unit_price)}</td>
        <td style="text-align:right;">${money(it.line_total)}</td>
      </tr>`
            )
            .join("")
        : `<tr><td colspan="4">-</td></tr>`;
    const promoLine = data.promo
      ? `<div>โปรโมชั่น: <b>${data.promo.promo_name}</b> (ลด ${money(data.discount)})</div>`
      : "";
    return `<!doctype html>
  <html lang="th"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${title} - ${j.booking_code || "งาน #" + j.job_id}</title>
    <style>
      body{ font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; padding:24px; color:#0f172a;}
      .top{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start;}
      .box{ border:1px solid rgba(15,23,42,.15); border-radius:12px; padding:14px; }
      table{ width:100%; border-collapse:collapse; margin-top:12px;}
      th,td{ border:1px solid rgba(15,23,42,.15); padding:8px; font-size:14px;}
      th{ background: rgba(37,99,235,.08); text-align:left;}
      .muted{ color:#64748b;}
      @media print{ .noprint{ display:none; } }
    </style>
  </head><body>
    <div class="top">
      <div style="display:flex;gap:12px;align-items:center;">
        <img src="/logo.png" alt="CWF" style="width:54px;height:54px;border-radius:14px;object-fit:cover;"/>
        <div>
          <h2 style="margin:0;">${title}</h2>
          <div class="muted"><b>${COMPANY_NAME}</b></div>
          <div class="muted">${COMPANY_ADDRESS}</div>
          <div class="muted">โทร ${COMPANY_PHONE} | LINE ${COMPANY_LINE}</div>
        </div>
      </div>
      <div class="box">
        <div><b>${j.booking_code || "งาน #" + j.job_id}</b></div>
        <div class="muted">วันที่พิมพ์: ${new Date().toLocaleString("th-TH")}</div>
      </div>
    </div>

    <div class="box" style="margin-top:14px;">
      <div><b>ลูกค้า:</b> ${j.customer_name}</div>
      <div><b>โทร:</b> ${j.customer_phone || "-"}</div>
      <div><b>ประเภทงาน:</b> ${j.job_type}</div>
      <div><b>นัด:</b> ${j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-"}</div>
      <div><b>ที่อยู่:</b> ${j.address_text || "-"}</div>
    </div>

    <table>
      <thead><tr>
        <th>รายการ</th><th style="text-align:right;">จำนวน</th><th style="text-align:right;">ราคา/หน่วย</th><th style="text-align:right;">รวม</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="box" style="margin-top:12px;">
      ${promoLine}
      <div>รวมก่อนลด: <b>${money(data.subtotal)}</b> บาท</div>
      <div>ส่วนลด: <b>${money(data.discount)}</b> บาท</div>
      <div style="font-size:18px;margin-top:6px;">ยอดสุทธิ: <b>${money(data.total)}</b> บาท</div>
    </div>
    <div class="box" style="margin-top:12px;">
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:1;min-width:240px;">
          <div><b>ข้อมูลการชำระเงิน</b></div>
          ${BANK_NAME || BANK_ACCOUNT ? `
            <div class="muted" style="margin-top:6px;">โอนเข้าบัญชี: <b>${BANK_NAME}</b></div>
            <div class="muted">เลขบัญชี: <b>${BANK_ACCOUNT}</b></div>
          ` : `<div class="muted" style="margin-top:6px;">(ยังไม่ได้ตั้งค่าบัญชีใน .env)</div>`}
        </div>
        <div style="width:170px;">
          ${BANK_QR_URL ? `<img src="${BANK_QR_URL}" alt="QR" style="width:170px;height:auto;border:1px solid rgba(15,23,42,.15);border-radius:12px;">` : ``}
        </div>
      </div>
    </div>

    <div class="box" style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div class="muted">ลายเซ็นผู้รับเงิน / ผู้ให้บริการ</div>
          <div style="height:70px;border-bottom:1px dashed rgba(15,23,42,.35);margin-top:8px;text-align:center;">
            ${COMPANY_SIGNATURE_URL ? `<img src="${COMPANY_SIGNATURE_URL}" alt="authorized signature" style="max-width:180px;max-height:68px;object-fit:contain;">` : ``}
          </div>
          <div style="font-weight:800;margin-top:6px;">${COMPANY_SIGNER_NAME}</div>
          <div class="muted">${COMPANY_SIGNER_POSITION}</div>
          <div class="muted">(${COMPANY_NAME})</div>
        </div>
        <div style="width:220px;text-align:center;">
          ${j.final_signature_path ? `
            <div class="muted">ลายเซ็นช่าง</div>
            <img src="${j.final_signature_path}" alt="signature" style="width:220px;height:auto;border:1px solid rgba(15,23,42,.15);border-radius:12px;margin-top:6px;">
          ` : `<div class="muted">ลายเซ็นช่าง: -</div>`}
        </div>
      </div>
    </div>

    <div class="noprint" style="margin-top:12px;">
      <button onclick="window.print()">🖨️ พิมพ์/บันทึกเป็น PDF</button>
    </div>
  </body></html>`;
  }

  function eSlipHtml(data, slipUrl) {
    const j = data.job;
    const COMPANY_NAME = process.env.COMPANY_NAME || "Coldwindflow air services";
    const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || "23/61 ถ.พึ่งมี 50 แขวงบางจาก เขตพระโขนง กรุงเทพฯ 10260";
    const COMPANY_PHONE = process.env.COMPANY_PHONE || "098-877-7321";
    const COMPANY_LINE = process.env.COMPANY_LINE || "@cwfair";
    const BANK_QR_URL = process.env.COMPANY_BANK_QR_URL || "";
    const phoneDigits = String(COMPANY_PHONE || "").replace(/[^0-9]/g, "");
    const total = Number(data.total || 0);
    const qrUrl = BANK_QR_URL || (phoneDigits ? `https://promptpay.io/${phoneDigits}/${total.toFixed(2)}.png` : "");
    const rows =
      data.items && data.items.length
        ? data.items
            .map(
              (it) => `
      <tr>
        <td>${it.item_name}</td>
        <td style="text-align:right;">${it.qty}</td>
        <td style="text-align:right;">${money(it.unit_price)}</td>
        <td style="text-align:right;">${money(it.line_total)}</td>
      </tr>`
            )
            .join("")
        : `<tr><td colspan="4">-</td></tr>`;
    const paidAt = j.paid_at ? new Date(j.paid_at).toLocaleString("th-TH") : new Date().toLocaleString("th-TH");
    return `<!doctype html>
  <html lang="th"><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>e-slip - ${j.booking_code || "งาน #" + j.job_id}</title>
    <style>
      body{ font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; padding:18px; color:#0f172a; background:#f8fafc;}
      .card{ background:#fff;border:1px solid rgba(15,23,42,.12); border-radius:16px; padding:14px; box-shadow: 0 12px 25px rgba(2,6,23,.08); }
      .row{ display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:flex-start;}
      .muted{ color:#64748b; font-size:13px;}
      table{ width:100%; border-collapse:collapse; margin-top:12px;}
      th,td{ border:1px solid rgba(15,23,42,.12); padding:8px; font-size:13px;}
      th{ background: rgba(37,99,235,.08); text-align:left;}
      @media print{ .noprint{ display:none; } body{ background:#fff; } }
    </style>
  </head><body>
    <div class="card">
      <div class="row">
        <div style="display:flex;gap:10px;align-items:center;">
          <img src="/logo.png" alt="CWF" style="width:44px;height:44px;border-radius:14px;object-fit:cover;"/>
          <div>
            <div style="font-size:18px;font-weight:900;">e-slip</div>
            <div class="muted"><b>${COMPANY_NAME}</b></div>
            <div class="muted">${COMPANY_ADDRESS}</div>
            <div class="muted">โทร ${COMPANY_PHONE} | LINE ${COMPANY_LINE}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;">${j.booking_code || "งาน #" + j.job_id}</div>
          <div class="muted">ชำระเมื่อ: ${paidAt}</div>
        </div>
      </div>

      <div class="card" style="margin-top:12px;background:#fff;">
        <div><b>ลูกค้า:</b> ${j.customer_name}</div>
        <div><b>โทร:</b> ${j.customer_phone || "-"}</div>
        <div><b>ประเภทงาน:</b> ${j.job_type}</div>
        <div><b>ที่อยู่:</b> ${j.address_text || "-"}</div>
      </div>

      <table>
        <thead><tr>
          <th>รายการ</th><th style="text-align:right;">จำนวน</th><th style="text-align:right;">ราคา/หน่วย</th><th style="text-align:right;">รวม</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="card" style="margin-top:12px;background:#fff;">
        <div class="row" style="align-items:center;">
          <div>
            <div class="muted">ยอดสุทธิ</div>
            <div style="font-size:22px;font-weight:900;">${money(total)} บาท</div>
          </div>
          <div style="text-align:center;min-width:170px;">
            ${qrUrl ? `<img src="${qrUrl}" alt="QR" style="width:160px;height:auto;border:1px solid rgba(15,23,42,.12);border-radius:14px;background:#fff;">` : ``}
            <div class="muted" style="margin-top:6px;">QR Payment</div>
          </div>
        </div>
      </div>

      ${slipUrl ? `
        <div class="card" style="margin-top:12px;background:#fff;">
          <div style="font-weight:800;">สลิปที่แนบ</div>
          <img src="${slipUrl}" alt="slip" style="width:100%;max-width:520px;margin-top:8px;border-radius:14px;border:1px solid rgba(15,23,42,.12);">
        </div>
      ` : ``}

      <div class="noprint" style="margin-top:12px;">
        <button onclick="window.print()">🖨️ พิมพ์/บันทึกเป็น PDF</button>
      </div>
    </div>
  </body></html>`;
  }

  // Job documents (quote / receipt / e-slip) carry full customer PII (name,
  // phone, address, price). A bare sequential job_id must never be enough to
  // read one: the caller needs the job's booking_token (?key=..., which the
  // tracking page embeds) or an authenticated admin session. Denials answer 404
  // (not 403) so the route is not an existence oracle for job_ids.
  async function canViewJobDoc(req, data) {
    const key = String((req.query && req.query.key) || "").trim();
    // getJobDocData returns { job, items, ... } — the token lives on the job row.
    const token = data && data.job ? data.job.booking_token : null;
    if (key && token && trackingPrivacy.timingSafeEqualStr(key, String(token))) {
      return true;
    }
    if (typeof isAdminRequest === "function") {
      try {
        if (await isAdminRequest(req)) return true;
      } catch (_) { /* treated as not admin */ }
    }
    return false;
  }

  function docsRateLimited(req, res) {
    if (!docsRateLimiter) return false;
    const rate = docsRateLimiter.check(trackingPrivacy.clientIpKey(req));
    if (rate.allowed) return false;
    res.status(429).send("เรียกดูเอกสารถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
    return true;
  }

  // The token travels in the query string, so keep sensitive docs out of
  // caches, referrers, and search indexes.
  function setSensitiveDocHeaders(res) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
  }

  // One gate for every PII-bearing job document. Returns the doc data when the
  // caller is authorised, otherwise sends the appropriate 404/429 and null.
  async function loadAuthorizedJobDoc(req, res) {
    if (docsRateLimited(req, res)) return null;
    const job_id = Number(req.params.job_id);
    if (!job_id) { res.status(404).send("ไม่พบงาน"); return null; }
    const data = await getJobDocData(job_id);
    if (!data) { res.status(404).send("ไม่พบงาน"); return null; }
    if (!(await canViewJobDoc(req, data))) { res.status(404).send("ไม่พบงาน"); return null; }
    return data;
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
    setSensitiveDocHeaders(res);
    res.send(docHtml("ใบเสร็จรับเงิน", data));
  });

  router.get("/docs/eslip/:job_id", async (req, res) => {
    try {
      const data = await loadAuthorizedJobDoc(req, res);
      if (!data) return;
      const job_id = Number(req.params.job_id);
      const slipR = await pool.query(
        `SELECT public_url
         FROM public.job_photos
         WHERE job_id=$1 AND phase='payment_slip' AND public_url IS NOT NULL
         ORDER BY photo_id DESC
         LIMIT 1`,
        [job_id]
      );
      const slipUrl = slipR.rows?.[0]?.public_url || null;
      setSensitiveDocHeaders(res);
      res.send(eSlipHtml(data, slipUrl));
    } catch (e) {
      console.error(e);
      res.status(500).send("สร้าง e-slip ไม่สำเร็จ");
    }
  });

  return router;
};
