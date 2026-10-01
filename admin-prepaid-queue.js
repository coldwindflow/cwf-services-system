(() => {
  "use strict";

  const list = document.getElementById("prepaidQueueList");
  const status = document.getElementById("prepaidQueueStatus");
  const refresh = document.getElementById("prepaidQueueRefresh");
  if (!list || !status || !refresh) return;

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const clean = (value) => String(value == null ? "" : value).trim();
  const money = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  let orders = [];

  async function api(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET", credentials: "include", cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.code || `HTTP ${response.status}`);
    return data;
  }

  function safeMapUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"].includes(url.hostname) ? url.href : "";
    } catch (_) { return ""; }
  }

  function snapshot(order) {
    try { return typeof order.service_entitlement_snapshot === "string"
      ? JSON.parse(order.service_entitlement_snapshot) : order.service_entitlement_snapshot || {}; }
    catch (_) { return {}; }
  }

  function card(order) {
    const right = snapshot(order);
    const groups = Array.isArray(right.service_package_groups) ? right.service_package_groups : [];
    const pending = ["pending_payment", "payment_failed"].includes(order.payment_order_status);
    const map = safeMapUrl(order.prepaid_maps_url);
    const details = `${groups.map((group) => `${esc(Number(group.btu).toLocaleString("th-TH"))} BTU ×${esc(group.quantity)}`).join(" · ")}`;
    const total = groups.reduce((sum, group) => sum + Number(group.quantity || 0), 0);
    const orderLink = `/admin-prepaid-v2.html?order=${encodeURIComponent(order.order_code)}`;
    return `<article style="background:#f8fafc;border:1px solid #dbe4f0;border-radius:16px;padding:14px" data-prepaid-order="${esc(order.order_code)}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(order.order_code)}</b><div style="color:#64748b;font-size:12px">${esc(new Date(order.created_at).toLocaleString("th-TH"))}</div></div><b style="color:${pending ? "#92400e" : "#166534"}">${pending ? "รอตรวจสอบการชำระเงิน" : "ชำระเงินแล้ว — พร้อมใช้สิทธิ์"}</b></div>
      <div style="margin-top:8px"><b>${esc(order.customer_name)}</b> · <a href="tel:${esc(order.customer_phone)}">${esc(order.customer_phone)}</a></div>
      <div>${esc(order.address || "ยังไม่มีที่อยู่")}${map ? ` · <a href="${esc(map)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}</div>
      <div style="margin-top:8px"><b>${esc(right.bundle_key || "โปรโมชั่น PREPAID")}</b> · ${details || "-"} · รวม ${esc(total)} เครื่อง</div>
      <div style="margin-top:6px;font-weight:800">ราคาที่ระบบยืนยัน ${money(order.subtotal)} บาท</div>
      <div style="color:#64748b;font-size:12px">ชำระ: ${esc(order.payment_status || order.payment_order_status)} · สิทธิ์: ${esc(order.entitlement_status || "ยังไม่ออกสิทธิ์")}${order.note ? ` · หมายเหตุ: ${esc(order.note)}` : ""}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><a href="${esc(orderLink)}" style="background:#e2e8f0;padding:9px 12px;border-radius:10px;color:#0f172a;font-weight:800;text-decoration:none">เปิดรายละเอียด</a>
      ${pending ? `<button type="button" data-prepaid-edit="${esc(order.order_code)}" style="background:#e2e8f0">แก้ไขข้อมูลติดต่อ/ที่อยู่</button><button type="button" data-prepaid-confirm="${esc(order.order_code)}" style="background:#facc15">ยืนยันรับชำระแล้ว</button>` : ""}
      ${order.entitlement_code && ["active", "unclaimed", "redeeming"].includes(order.entitlement_status) && !order.redeemed_job_id ? `<a href="${esc(orderLink)}" style="background:#2563eb;padding:9px 12px;border-radius:10px;color:#fff;font-weight:800;text-decoration:none">ลงงานจากสิทธิ์</a>` : ""}</div></article>`;
  }

  async function load() {
    status.textContent = "กำลังโหลดรายการจองสิทธิ์...";
    try {
      const data = await api("/admin/prepaid-orders");
      orders = (Array.isArray(data.orders) ? data.orders : []).filter((row) =>
        ["pending_payment", "payment_failed"].includes(row.payment_order_status)
        || (row.payment_order_status === "paid" && !row.redeemed_job_id));
      list.innerHTML = orders.map(card).join("") || `<div style="padding:12px;color:#64748b">ยังไม่มีรายการจองสิทธิ์ที่ต้องจัดการ</div>`;
      status.textContent = `รอชำระ ${orders.filter((row) => row.payment_order_status !== "paid").length} รายการ · ชำระแล้วรอลงงาน ${orders.filter((row) => row.payment_order_status === "paid").length} รายการ`;
    } catch (error) {
      console.warn("ADMIN_PREPAID_QUEUE_FAILED", error.message);
      status.textContent = "โหลดรายการจองสิทธิ์ไม่สำเร็จ กรุณารีเฟรช";
    }
  }

  async function confirmPayment(order) {
    const reference = clean(window.prompt(`รับเงินจริง ${money(order.subtotal)} บาทสำหรับ ${order.order_code} แล้วหรือไม่? กรอกเลขอ้างอิงสลิป/การรับเงิน`, ""));
    if (!reference || !window.confirm(`ยืนยันรับชำระ ${money(order.subtotal)} บาท สำหรับ ${order.order_code}`)) return;
    await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/confirm-payment`, {
      method: "POST", body: { reference, confirmed_amount: Number(order.subtotal) },
    });
    await load();
  }

  async function editReservation(order) {
    const fields = [
      ["customer_name", "ชื่อลูกค้า", order.customer_name], ["customer_phone", "เบอร์โทร", order.customer_phone],
      ["address_text", "ที่อยู่", order.address], ["maps_url", "ลิงก์แผนที่", order.prepaid_maps_url],
      ["note", "หมายเหตุ", order.note],
    ];
    const payload = {};
    for (const [key, label, value] of fields) {
      const answer = window.prompt(`${order.order_code} · ${label}`, clean(value));
      if (answer === null) return;
      payload[key] = clean(answer);
    }
    payload.gps_latitude = order.prepaid_gps_latitude;
    payload.gps_longitude = order.prepaid_gps_longitude;
    if (payload.maps_url !== clean(order.prepaid_maps_url)) {
      payload.gps_latitude = null;
      payload.gps_longitude = null;
    }
    await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/reservation`, { method: "PATCH", body: payload });
    await load();
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prepaid-confirm],[data-prepaid-edit]");
    if (!button) return;
    const code = button.dataset.prepaidConfirm || button.dataset.prepaidEdit;
    const order = orders.find((row) => row.order_code === code);
    if (!order) return;
    const action = button.dataset.prepaidConfirm ? confirmPayment : editReservation;
    button.disabled = true;
    action(order).catch((error) => {
      console.warn("ADMIN_PREPAID_ACTION_FAILED", error.message);
      status.textContent = `ดำเนินการ ${code} ไม่สำเร็จ กรุณาตรวจสอบรายการแล้วลองใหม่`;
    }).finally(() => { button.disabled = false; });
  });
  refresh.addEventListener("click", load);
  load();
})();
