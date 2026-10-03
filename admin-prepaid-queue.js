(() => {
  "use strict";

  const list = document.getElementById("prepaidQueueList");
  const status = document.getElementById("prepaidQueueStatus");
  const refresh = document.getElementById("prepaidQueueRefresh");
  const search = document.getElementById("prepaidQueueSearch");
  const filters = document.getElementById("prepaidQueueFilters");
  if (!list || !status || !refresh || !search || !filters) return;

  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const clean = (value) => String(value == null ? "" : value).trim();
  const money = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  let orders = [];
  let jobs = [];
  let filter = "all";
  let modal = null;
  let jobRequest = 0;
  const focusedOrder = new URLSearchParams(location.search).get("order") || "";

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

  function promotionTitle(order) {
    try {
      const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
      if (Array.isArray(items) && items[0]?.item_name) return String(items[0].item_name);
    } catch (_) {}
    return String(snapshot(order).bundle_key || "โปรโมชั่น PREPAID").replace(/-/g, " ");
  }

  function groupLabel(group, right) {
    const saved = (right.snapshots || []).find((entry) =>
      String(entry?.service_package_snapshot?.package?.key) === String(group.package_key));
    const bounds = saved?.service_package_snapshot?.service_lines?.[0]?.service_constraints;
    const min = Number(bounds?.btu_min || 0);
    const max = Number(bounds?.btu_max || 0);
    if (!min && max) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
    if (min && !max) return `${min.toLocaleString("th-TH")} BTU ขึ้นไป`;
    return `${Number(group.btu).toLocaleString("th-TH")} BTU`;
  }

  const pendingOrder = (order) => ["pending_payment", "payment_failed"].includes(order.payment_order_status);
  const readyOrder = (order) => order.payment_order_status === "paid" && !order.redeemed_job_id
    && ["active", "unclaimed", "redeeming"].includes(order.entitlement_status);

  function card(order) {
    const right = snapshot(order);
    const groups = Array.isArray(right.service_package_groups) ? right.service_package_groups : [];
    const pending = pendingOrder(order);
    const map = safeMapUrl(order.prepaid_maps_url);
    const details = groups.map((group) => `${esc(groupLabel(group, right))} ×${esc(group.quantity)}`).join(" · ");
    const total = groups.reduce((sum, group) => sum + Number(group.quantity || 0), 0);
    const orderLink = `/admin-prepaid-v2.html?order=${encodeURIComponent(order.order_code)}`;
    return `<article class="prepaid-ops-card${order.order_code === focusedOrder ? " is-focused" : ""}" data-prepaid-order="${esc(order.order_code)}" tabindex="-1">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>${esc(order.order_code)}</b><div style="color:#64748b;font-size:12px">${esc(new Date(order.created_at).toLocaleString("th-TH"))}</div></div><b style="color:${pending ? "#92400e" : "#166534"}">${pending ? "รอตรวจสอบการชำระเงิน" : "ชำระเงินแล้ว — พร้อมใช้สิทธิ์"}</b></div>
      <div style="margin-top:8px"><b>${esc(order.customer_name)}</b> · <a href="tel:${esc(order.customer_phone)}">${esc(order.customer_phone)}</a></div>
      <div>${esc(order.address || "ยังไม่มีที่อยู่")}${map ? ` · <a href="${esc(map)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}</div>
      <div style="margin-top:8px"><b>${esc(promotionTitle(order))}</b> · ${details || "-"} · รวม ${esc(total)} เครื่อง</div>
      <div style="margin-top:6px;font-weight:800">ราคาที่ระบบยืนยัน ${money(order.subtotal)} บาท</div>
      <div style="color:#64748b;font-size:12px">ชำระ: ${esc(order.payment_status || order.payment_order_status)} · สิทธิ์: ${esc(order.entitlement_status || "ยังไม่ออกสิทธิ์")}${order.note ? ` · หมายเหตุ: ${esc(order.note)}` : ""}</div>
      <div class="prepaid-ops-actions">
      ${pending ? `<button type="button" class="prepaid-ops-payment" data-prepaid-confirm="${esc(order.order_code)}">ยืนยันรับชำระแล้ว</button><a class="prepaid-ops-secondary" href="tel:${esc(order.customer_phone)}">โทร</a>${map ? `<a class="prepaid-ops-secondary" href="${esc(map)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}<button type="button" class="prepaid-ops-secondary" data-prepaid-edit="${esc(order.order_code)}">แก้ไขข้อมูล</button><button type="button" class="prepaid-ops-secondary" data-prepaid-cancel="${esc(order.order_code)}">ยกเลิกออเดอร์</button>` : ""}
      ${readyOrder(order) ? `<a class="prepaid-ops-primary" href="${esc(orderLink)}">ลงงานจากสิทธิ์</a>` : ""}
      ${order.payment_order_status === "paid" && !order.redeemed_job_id ? '<span class="prepaid-ops-secondary">ชำระแล้ว: ต้องตรวจสอบคืนเงิน/สิทธิ์ก่อน ไม่สามารถลบออเดอร์</span>' : ""}
      ${order.redeemed_job_id ? `<a class="prepaid-ops-secondary" href="/admin-job-view-v2.html?job_id=${encodeURIComponent(order.redeemed_job_id)}">จัดการงาน / เลื่อนนัด</a>` : ""}
      <a class="prepaid-ops-secondary" href="${esc(orderLink)}">ดูรายละเอียด</a></div></article>`;
  }

  function jobCard(job) {
    return `<article class="prepaid-ops-card"><div class="prepaid-ops-card-header"><b>${esc(job.booking_code || `#${job.job_id}`)}</b><span class="prepaid-ops-badge is-paid">งานจอง</span></div><p><b>${esc(job.customer_name || "-")}</b> · ${esc(job.customer_phone || "-")}</p><p>${esc(job.job_type || "งานบริการ")} · ${esc(job.job_status || "รอดำเนินการ")}</p><p>${esc(job.address_text || "-")}</p><div class="prepaid-ops-actions"><a class="prepaid-ops-primary" href="/admin-job-view-v2.html?job_id=${encodeURIComponent(job.job_id)}">เปิดงาน</a></div></article>`;
  }

  function render() {
    const query = clean(search.value).toLocaleLowerCase();
    filters.querySelectorAll("[data-prepaid-filter]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.prepaidFilter === filter)));
    const visibleOrders = orders.filter((order) => {
      if (order.payment_order_status === "cancelled") return false;
      if (filter === "jobs") return false;
      if (filter === "pending" && !pendingOrder(order)) return false;
      if (filter === "paid" && !readyOrder(order)) return false;
      return [order.order_code, order.customer_name, order.customer_phone, promotionTitle(order), order.address]
        .some((value) => clean(value).toLocaleLowerCase().includes(query));
    });
    const visibleJobs = ["all", "jobs"].includes(filter) ? jobs.filter((job) =>
      [job.booking_code, job.customer_name, job.customer_phone].some((value) => clean(value).toLocaleLowerCase().includes(query))) : [];
    list.innerHTML = `${visibleOrders.map(card).join("")}${visibleJobs.map(jobCard).join("")}`
      || `<div class="empty-state">ไม่พบรายการในสถานะนี้</div>`;
    const pending = orders.filter(pendingOrder).length;
    const ready = orders.filter(readyOrder).length;
    document.getElementById("prepaidPendingCount").textContent = String(pending);
    document.getElementById("prepaidReadyCount").textContent = String(ready);
    status.textContent = `รอตรวจสอบชำระ ${pending} · ชำระแล้วรอลงงาน ${ready} · งานจองที่แสดง ${visibleJobs.length}`;
    if (focusedOrder) list.querySelector(`[data-prepaid-order="${CSS.escape(focusedOrder)}"]`)?.focus({ preventScroll: true });
  }

  async function loadJobs() {
    const seq = ++jobRequest;
    const query = clean(search.value);
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const dateFields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${dateFields.year}-${dateFields.month}-${dateFields.day}`;
    const path = query || filter === "jobs"
      ? `/admin/jobs_v2?limit=100${query ? `&q=${encodeURIComponent(query)}` : ""}`
      : `/admin/jobs_v2?date_from=${date}&date_to=${date}&limit=500`;
    try {
      const data = await api(path);
      if (seq !== jobRequest) return;
      jobs = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.jobs) ? data.jobs : []);
      if (!query && filter !== "jobs") document.getElementById("prepaidTodayJobsCount").textContent = String(Number(data.total ?? jobs.length));
      render();
    } catch (error) {
      if (seq !== jobRequest) return;
      console.warn("ADMIN_OPERATIONS_JOBS_FAILED", error.message);
      document.getElementById("prepaidTodayJobsCount").textContent = "–";
      if (filter === "jobs") status.textContent = "โหลดงานจองไม่สำเร็จ กรุณารีเฟรช";
    }
  }

  async function load() {
    status.textContent = "กำลังโหลดงานที่ต้องจัดการ...";
    try {
      const data = await api("/admin/prepaid-orders");
      orders = (Array.isArray(data.orders) ? data.orders : []).filter((row) => pendingOrder(row) || readyOrder(row));
      render();
    } catch (error) {
      console.warn("ADMIN_PREPAID_QUEUE_FAILED", error.message);
      status.textContent = "โหลดรายการจองสิทธิ์ไม่สำเร็จ กรุณารีเฟรช";
    }
    await loadJobs();
  }

  function closeModal() { modal?.remove(); modal = null; }

  function openModal(title, content, submitLabel, submit) {
    closeModal();
    modal = document.createElement("div");
    modal.className = "prepaid-ops-dialog-backdrop";
    modal.innerHTML = `<section class="prepaid-ops-dialog" role="dialog" aria-modal="true" aria-labelledby="prepaidOpsDialogTitle"><h2 id="prepaidOpsDialogTitle">${esc(title)}</h2><form data-prepaid-ops-form>${content}<div role="alert" data-prepaid-ops-error></div><div class="prepaid-ops-actions"><button type="button" class="prepaid-ops-secondary" data-prepaid-ops-cancel>ยกเลิก</button><button type="submit" class="prepaid-ops-payment" data-prepaid-ops-submit>${esc(submitLabel)}</button></div></form></section>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-prepaid-ops-cancel]").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = modal.querySelector("[data-prepaid-ops-submit]");
      button.disabled = true;
      try { await submit(new FormData(event.currentTarget)); closeModal(); }
      catch (error) {
        console.warn("ADMIN_PREPAID_ACTION_FAILED", error.message);
        modal.querySelector("[data-prepaid-ops-error]").textContent = "ดำเนินการไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองใหม่";
        button.disabled = false;
      }
    });
    modal.querySelector("input,textarea")?.focus();
  }

  function confirmPayment(order) {
    openModal("ยืนยันรับชำระเงิน", `<p>Order <b>${esc(order.order_code)}</b><br>${esc(order.customer_name)} · ${esc(promotionTitle(order))}</p><p><b>ยอดตามระบบ ${money(order.subtotal)} บาท</b></p><label>เลขอ้างอิง / หมายเหตุ<input name="reference" maxlength="200" required autocomplete="off" placeholder="เลขอ้างอิงสลิปหรือการรับเงินจริง"></label>`, `ยืนยันรับชำระ ${money(order.subtotal)} บาท`, async (form) => {
      const reference = clean(form.get("reference"));
      if (!reference) throw new Error("PAYMENT_REFERENCE_REQUIRED");
      const result = await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/confirm-payment`, {
        method: "POST", body: { reference, confirmed_amount: Number(order.subtotal) },
      });
      order.payment_order_status = "paid";
      order.payment_status = "verified";
      order.entitlement_code = result.entitlement?.entitlement_code || order.entitlement_code;
      order.entitlement_status = result.entitlement?.status || "active";
      render();
      await load();
    });
  }

  function editReservation(order) {
    openModal("แก้ไขข้อมูลก่อนชำระ", `<p>Order <b>${esc(order.order_code)}</b> · ราคาและแพ็กเกจแก้จากหน้านี้ไม่ได้</p><label>ชื่อลูกค้า<input name="customer_name" value="${esc(order.customer_name)}" required maxlength="120"></label><label>เบอร์โทร<input name="customer_phone" value="${esc(order.customer_phone)}" required maxlength="40"></label><label>ที่อยู่<textarea name="address_text" required maxlength="1000">${esc(order.address)}</textarea></label><label>ลิงก์แผนที่<input name="maps_url" value="${esc(order.prepaid_maps_url || "")}" type="url"></label><label>หมายเหตุ<input name="note" value="${esc(order.note || "")}" maxlength="500"></label>`, "บันทึกข้อมูล", async (form) => {
      const payload = Object.fromEntries(["customer_name", "customer_phone", "address_text", "maps_url", "note"].map((key) => [key, clean(form.get(key))]));
      payload.gps_latitude = payload.maps_url === clean(order.prepaid_maps_url) ? order.prepaid_gps_latitude : null;
      payload.gps_longitude = payload.maps_url === clean(order.prepaid_maps_url) ? order.prepaid_gps_longitude : null;
      await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/reservation`, { method: "PATCH", body: payload });
      await load();
    });
  }

  function cancelOrder(order) {
    openModal("ยกเลิกออเดอร์ที่ยังไม่ชำระ", `<p>Order <b>${esc(order.order_code)}</b><br>${esc(order.customer_name)} · ${esc(promotionTitle(order))}</p><p>รายการนี้จะออกจากคิวรอชำระ แต่ยังเก็บประวัติไว้ตรวจสอบ และไม่ใช่การคืนเงิน</p><label>เหตุผลที่ยกเลิก<input name="reason" maxlength="500" required minlength="3" placeholder="เช่น ลูกค้าไม่ต้องการแพ็กเกจนี้แล้ว"></label>`, "ยืนยันยกเลิกออเดอร์", async (form) => {
      const reason = clean(form.get("reason"));
      if (reason.length < 3) throw new Error("CANCEL_REASON_REQUIRED");
      await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/cancel`, {
        method: "POST", body: { reason },
      });
      await load();
    });
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prepaid-confirm],[data-prepaid-edit],[data-prepaid-cancel]");
    if (!button) return;
    const code = button.dataset.prepaidConfirm || button.dataset.prepaidEdit || button.dataset.prepaidCancel;
    const order = orders.find((row) => row.order_code === code);
    if (!order) return;
    if (button.dataset.prepaidConfirm) confirmPayment(order);
    else if (button.dataset.prepaidEdit) editReservation(order);
    else cancelOrder(order);
  });
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-prepaid-filter]");
    if (!button) return;
    filter = button.dataset.prepaidFilter;
    render();
    loadJobs();
  });
  let searchTimer;
  search.addEventListener("input", () => {
    render();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadJobs, 200);
  });
  refresh.addEventListener("click", load);
  load();
})();
