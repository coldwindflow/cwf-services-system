(() => {
  "use strict";

  const state = {
    bundles: [],
    selectedBundle: null,
    selectedPolicy: null,
    quote: null,
    quoteFingerprint: "",
    bookingRequestKey: "",
  };

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value == null ? "" : value).trim();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const money = (value) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const requestKey = () => `adminui_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, "_")}`;

  async function api(path, options = {}) {
    if (typeof apiFetch === "function") return apiFetch(path, options);
    const response = await fetch(path, {
      method: options.method || "GET",
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || data?.code || `HTTP_${response.status}`);
      error.code = data?.code || data?.error || "REQUEST_FAILED";
      throw error;
    }
    return data;
  }

  function setMessage(id, text, kind = "muted") {
    const node = $(id);
    if (!node) return;
    node.className = kind;
    node.textContent = text || "";
  }

  function dateText(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    try { return date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }); }
    catch (_) { return String(value); }
  }

  function bangkokIso(localValue) {
    const value = clean(localValue);
    if (!value) return "";
    return `${value.length === 16 ? `${value}:00` : value}+07:00`;
  }

  function selectedGroups() {
    return [...document.querySelectorAll("[data-prepaid-variant]")].map((row) => ({
      package_key: row.getAttribute("data-prepaid-variant"),
      btu: Number(row.querySelector("[data-btu]")?.value || 0),
      quantity: Number(row.querySelector("[data-qty]")?.value || 0),
    })).filter((group) => Number.isSafeInteger(group.btu) && group.btu > 0 && Number.isSafeInteger(group.quantity) && group.quantity > 0);
  }

  function saleFingerprint() {
    return JSON.stringify({
      catalog_item_id: Number(state.selectedBundle?.item_id || 0),
      service_package_groups: selectedGroups(),
    });
  }

  function invalidateQuote() {
    state.quote = null;
    state.quoteFingerprint = "";
    $("btnCreateOrder").disabled = true;
    $("saleQuote").style.display = "none";
    $("saleQuote").innerHTML = "";
  }

  async function loadBundles() {
    const data = await api("/admin/catalog/service-package-bundles");
    state.bundles = Array.isArray(data?.bundles) ? data.bundles : [];
    const select = $("saleBundle");
    select.innerHTML = '<option value="">เลือกโปรโมชั่น</option>' + state.bundles.map((bundle) => (
      `<option value="${esc(bundle.service_bundle_key)}">${esc(bundle.item_name)}${bundle.is_active ? "" : " (ปิดอยู่)"}</option>`
    )).join("");
  }

  async function chooseBundle() {
    invalidateQuote();
    const key = clean($("saleBundle").value);
    state.selectedBundle = state.bundles.find((bundle) => bundle.service_bundle_key === key) || null;
    state.selectedPolicy = null;
    $("saleVariants").innerHTML = "";
    $("salePolicy").textContent = "";
    if (!state.selectedBundle) return;

    try {
      const policy = await api(`/admin/catalog/service-package-bundles/${encodeURIComponent(key)}/promotion-policy`);
      state.selectedPolicy = policy || {};
      const isPrepaid = policy?.payment_mode === "prepaid_full";
      $("salePolicy").innerHTML = isPrepaid
        ? `<span class="success">PREPAID</span> • รับประกัน ${esc(policy.warranty_days || "-")} วัน • หมดสิทธิ์ ${esc(dateText(state.selectedBundle.redeem_until))}`
        : `<span class="error">โปรนี้ยังไม่ใช่ PREPAID</span> • ไปที่ “แก้ไขโปรโมชั่น” แล้วตั้งรูปแบบชำระเงินเป็น Prepaid ก่อน`;
      $("btnQuote").disabled = !isPrepaid;
    } catch (error) {
      $("salePolicy").innerHTML = `<span class="error">โหลดนโยบายไม่สำเร็จ: ${esc(error.message)}</span>`;
      $("btnQuote").disabled = true;
    }

    const variants = Array.isArray(state.selectedBundle.variants) ? state.selectedBundle.variants.filter((item) => item.is_active !== false) : [];
    $("saleVariants").innerHTML = variants.map((variant) => {
      const defaultBtu = Number(variant.btu_min || variant.btu_max || 12000);
      const range = variant.btu_min || variant.btu_max
        ? `${variant.btu_min || "ต่ำสุด"}–${variant.btu_max || "ขึ้นไป"} BTU`
        : "BTU ไม่จำกัด";
      return `<div class="variant" data-prepaid-variant="${esc(variant.package_key)}">
        <div class="variant-title">${esc(variant.display_name)}</div>
        <div class="muted">${esc(range)}</div>
        <div class="variant-grid">
          <div><label>BTU จริง</label><input data-btu type="number" min="1" step="1" value="${esc(defaultBtu)}"></div>
          <div><label>จำนวนเครื่อง</label><input data-qty type="number" min="0" max="99" step="1" value="0"></div>
        </div>
      </div>`;
    }).join("");
    $("saleVariants").querySelectorAll("input").forEach((input) => input.addEventListener("input", invalidateQuote));
  }

  async function quoteSale() {
    const bundle = state.selectedBundle;
    const groups = selectedGroups();
    if (!bundle || !groups.length) throw new Error("กรุณาเลือกโปรและจำนวนเครื่อง");
    setMessage("saleMessage", "กำลังตรวจราคา...");
    const data = await api("/admin/prepaid-orders/quote", {
      method: "POST",
      body: JSON.stringify({ catalog_item_id: Number(bundle.item_id), service_package_groups: groups }),
    });
    state.quote = data.quote;
    state.quoteFingerprint = saleFingerprint();
    $("saleQuote").style.display = "block";
    $("saleQuote").innerHTML = `<div class="muted">ราคาที่ Server ยืนยัน</div><div class="price">${money(data.quote.fixed_total_price)} บาท</div>
      <div class="muted">${groups.reduce((sum, group) => sum + group.quantity, 0)} เครื่อง • รับประกัน ${esc(data.quote.warranty_days)} วัน • ใช้สิทธิ์ได้ถึง ${esc(dateText(data.quote.redeem_until))}</div>`;
    $("btnCreateOrder").disabled = false;
    setMessage("saleMessage", "ตรวจราคาแล้ว สามารถสร้างรายการ PREPAID ได้", "success");
  }

  async function createOrder() {
    const customerName = clean($("saleCustomerName").value);
    const customerPhone = clean($("saleCustomerPhone").value);
    if (!customerName || !customerPhone) throw new Error("กรอกชื่อลูกค้าและเบอร์โทรให้ครบ");
    if (!state.quote || state.quoteFingerprint !== saleFingerprint()) throw new Error("ข้อมูลโปรเปลี่ยน กรุณาคำนวณราคาใหม่");
    const payload = {
      catalog_item_id: Number(state.selectedBundle.item_id),
      service_package_groups: selectedGroups(),
      customer_name: customerName,
      customer_phone: customerPhone,
      note: clean($("saleNote").value),
      purchase_request_key: requestKey(),
    };
    $("btnCreateOrder").disabled = true;
    const data = await api("/admin/prepaid-orders", { method: "POST", body: JSON.stringify(payload) });
    const code = data?.order?.order_code || "-";
    const right = data?.entitlement_code || data?.order?.prepaid_entitlement_code || "-";
    const claim = clean(data?.claim_token);
    const message = [
      `สร้างรายการแล้ว: ${code}`,
      `ยอด: ${money(data?.order?.subtotal || state.quote.fixed_total_price)} บาท`,
      `รหัสสิทธิ์: ${right}`,
      claim ? `Claim token (แสดงครั้งเดียว): ${claim}` : "",
    ].filter(Boolean).join("\n");
    setMessage("saleMessage", message, "success");
    if (claim && navigator.clipboard) {
      try { await navigator.clipboard.writeText(`Order: ${code}\nสิทธิ์: ${right}\nClaim token: ${claim}`); } catch (_) {}
    }
    invalidateQuote();
    await loadOrders();
  }

  function statusBadge(value) {
    const status = clean(value) || "-";
    const cls = status === "paid" || status === "active" || status === "unclaimed" || status === "redeeming" ? "paid"
      : status === "redeemed" ? "redeemed" : "pending";
    return `<span class="badge ${cls}">${esc(status)}</span>`;
  }

  async function loadOrders() {
    setMessage("ordersMessage", "กำลังโหลด...");
    const data = await api("/admin/prepaid-orders");
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    $("ordersBody").innerHTML = orders.map((row) => {
      const paid = row.payment_order_status === "paid";
      const canBook = Boolean(row.entitlement_code) && ["active", "unclaimed", "redeeming"].includes(String(row.entitlement_status || "")) && !row.redeemed_job_id;
      return `<tr>
        <td><b>${esc(row.order_code)}</b><div class="muted">${esc(dateText(row.created_at))}</div></td>
        <td>${esc(row.customer_name)}<div class="muted">${esc(row.customer_phone)}</div></td>
        <td><b>${money(row.subtotal)}</b></td>
        <td>${statusBadge(row.payment_order_status)}${row.payment_status ? `<div class="muted">${esc(row.payment_status)}</div>` : ""}</td>
        <td>${row.entitlement_code ? `<b>${esc(row.entitlement_code)}</b><div>${statusBadge(row.entitlement_status)}</div>` : '<span class="muted">ยังไม่ออกสิทธิ์</span>'}</td>
        <td>${esc(dateText(row.redeem_until))}<div class="muted">ประกัน ${esc(row.warranty_days ?? "-")} วัน</div></td>
        <td>${row.redeemed_job_id ? `<b>#${esc(row.redeemed_job_id)}</b>` : "-"}</td>
        <td><div class="actions" style="margin-top:0">
          ${!paid ? `<button class="btn-gold" type="button" data-confirm-order="${esc(row.order_code)}" data-amount="${esc(row.subtotal)}">ยืนยันรับเงิน</button>` : ""}
          ${canBook ? `<button class="btn-primary" type="button" data-book-right="${esc(row.entitlement_code)}">ลงงาน</button>` : ""}
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="8" class="muted">ยังไม่มีรายการ PREPAID</td></tr>';
    setMessage("ordersMessage", `ทั้งหมด ${orders.length} รายการ`);
  }

  async function confirmPayment(orderCode, amount) {
    const reference = clean(window.prompt(`ยืนยันยอด ${money(amount)} บาท\nกรอกเลขอ้างอิงการรับเงิน/สลิป`, ""));
    if (!reference) return;
    if (!window.confirm(`ยืนยันว่ารับเงินจริง ${money(amount)} บาท สำหรับ Order ${orderCode} ?`)) return;
    await api(`/admin/prepaid-orders/${encodeURIComponent(orderCode)}/confirm-payment`, {
      method: "POST",
      body: JSON.stringify({ reference, confirmed_amount: Number(amount) }),
    });
    setMessage("ordersMessage", `ยืนยันการชำระ ${orderCode} สำเร็จ`, "success");
    await loadOrders();
  }

  async function openBooking(entitlementCode) {
    const data = await api(`/admin/prepaid-entitlements/${encodeURIComponent(entitlementCode)}`);
    const right = data.entitlement;
    if (!right || right.order_status !== "paid") throw new Error("สิทธิ์นี้ยังไม่ได้ยืนยันการชำระ");
    if (right.redeemed_job_id) throw new Error(`สิทธิ์นี้ถูกใช้กับ Job #${right.redeemed_job_id} แล้ว`);
    $("bookingEntitlementCode").value = right.entitlement_code;
    $("bookingRightSummary").textContent = [
      `ลูกค้า: ${right.customer_name} • ${right.customer_phone}`,
      `สิทธิ์: ${right.entitlement_code} • ${money(right.fixed_total_price)} บาท`,
      `สถานะ: ${right.entitlement_status} • หมดสิทธิ์: ${dateText(right.redeem_until)}`,
      `รับประกันหลังปิดงาน: ${right.warranty_days} วัน`,
      `บริการ: ${(right.service_package_groups || []).map((g) => `${g.package_key} / ${g.btu} BTU × ${g.quantity}`).join(" | ")}`,
    ].join("\n");
    state.bookingRequestKey = requestKey();
    $("bookingCard").style.display = "block";
    setMessage("bookingMessage", "เลือกวัน/เวลาและกรอกที่อยู่ จากนั้นลงงานได้ทันที");
    $("bookingCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function bookRight() {
    const code = clean($("bookingEntitlementCode").value);
    const appointment = bangkokIso($("bookingAppointment").value);
    const address = clean($("bookingAddress").value);
    if (!code || !appointment || !address) throw new Error("กรอกวันเวลาและที่อยู่ให้ครบ");
    const assignMode = $("bookingAssignMode").value;
    const technician = clean($("bookingTechnician").value);
    if (assignMode === "single" && !technician) throw new Error("โหมดระบุช่าง ต้องกรอก Username ช่าง");
    const payload = {
      appointment_datetime: appointment,
      address_text: address,
      maps_url: clean($("bookingMapsUrl").value),
      customer_note: clean($("bookingNote").value),
      booking_mode: "scheduled",
      dispatch_mode: assignMode === "single" ? "forced" : "normal",
      assign_mode: assignMode,
      tech_type: "company",
      admin_request_key: state.bookingRequestKey || requestKey(),
    };
    if (assignMode === "single") payload.technician_username = technician;
    $("btnBookRight").disabled = true;
    setMessage("bookingMessage", "กำลังสร้างงานจากสิทธิ์...");
    try {
      const result = await api(`/admin/prepaid-entitlements/${encodeURIComponent(code)}/book`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const jobId = result?.job_id || result?.id || result?.job?.job_id || "-";
      const bookingCode = result?.booking_code || result?.job?.booking_code || "-";
      setMessage("bookingMessage", `ลงงานสำเร็จ • Job #${jobId} • ${bookingCode}`, "success");
      state.bookingRequestKey = "";
      await loadOrders();
    } finally {
      $("btnBookRight").disabled = false;
    }
  }

  function wire() {
    $("saleBundle").addEventListener("change", () => chooseBundle().catch((error) => setMessage("saleMessage", error.message, "error")));
    $("btnQuote").addEventListener("click", () => quoteSale().catch((error) => setMessage("saleMessage", error.message, "error")));
    $("btnCreateOrder").addEventListener("click", () => createOrder().catch((error) => { $("btnCreateOrder").disabled = false; setMessage("saleMessage", error.message, "error"); }));
    $("btnRefreshOrders").addEventListener("click", () => loadOrders().catch((error) => setMessage("ordersMessage", error.message, "error")));
    $("bookingAssignMode").addEventListener("change", () => { $("singleTechBox").style.display = $("bookingAssignMode").value === "single" ? "block" : "none"; });
    $("btnBookRight").addEventListener("click", () => bookRight().catch((error) => setMessage("bookingMessage", error.message, "error")));
    $("btnCancelBookingPanel").addEventListener("click", () => { $("bookingCard").style.display = "none"; state.bookingRequestKey = ""; });
    $("ordersBody").addEventListener("click", (event) => {
      const confirmButton = event.target.closest("[data-confirm-order]");
      if (confirmButton) {
        confirmPayment(confirmButton.getAttribute("data-confirm-order"), confirmButton.getAttribute("data-amount"))
          .catch((error) => setMessage("ordersMessage", error.message, "error"));
        return;
      }
      const bookButton = event.target.closest("[data-book-right]");
      if (bookButton) {
        openBooking(bookButton.getAttribute("data-book-right"))
          .catch((error) => setMessage("ordersMessage", error.message, "error"));
      }
    });
  }

  async function init() {
    wire();
    try { await Promise.all([loadBundles(), loadOrders()]); }
    catch (error) { setMessage("ordersMessage", error.message || "โหลดข้อมูล PREPAID ไม่สำเร็จ", "error"); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
