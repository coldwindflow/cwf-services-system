(() => {
  "use strict";

  const state = {
    bundles: [],
    selectedBundle: null,
    selectedPolicy: null,
    quote: null,
    quoteFingerprint: "",
    bookingRequestKey: "",
    saleRequestKey: "",
    orders: [],
  };

  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value == null ? "" : value).trim();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const money = (value) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const requestKey = () => `adminui_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, "_")}`;
  const safeMapUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"].includes(url.hostname) ? url.href : "";
    } catch (_) { return ""; }
  };

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
    state.saleRequestKey = "";
    $("btnCreateOrder").disabled = true;
    $("saleQuote").style.display = "none";
    $("saleQuote").innerHTML = "";
  }

  async function loadBundles() {
    const data = await api("/admin/catalog/service-package-bundles");
    const now = Date.now();
    state.bundles = (Array.isArray(data?.bundles) ? data.bundles : []).filter((bundle) =>
      bundle.is_active !== false
      && (!bundle.sell_start_at || new Date(bundle.sell_start_at).getTime() <= now)
      && (!bundle.sell_end_at || new Date(bundle.sell_end_at).getTime() >= now));
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
    const bundleKey = clean(state.selectedBundle.service_bundle_key);
    const isAirCare = bundleKey === "coldwindflow-air-care-standard" || bundleKey === "coldwindflow-air-care-premium";
    $("saleVariants").innerHTML = variants.map((variant) => {
      const minBtu = Number(variant.btu_min || 0);
      const maxBtu = Number(variant.btu_max || 0);
      const airCareSmall = isAirCare && maxBtu > 0 && maxBtu <= 12000;
      const airCareLarge = isAirCare && minBtu >= 18000;
      const defaultBtu = airCareSmall ? 12000 : airCareLarge ? 18000 : Number(variant.btu_min || variant.btu_max || 12000);
      const range = airCareSmall ? "ไม่เกิน 12,000 BTU" : airCareLarge ? "18,000 BTU ขึ้นไป"
        : variant.btu_min || variant.btu_max
          ? `${variant.btu_min || "ต่ำสุด"}–${variant.btu_max || "ขึ้นไป"} BTU`
          : "BTU ไม่จำกัด";
      const btuControl = isAirCare
        ? `<div><label>กลุ่ม BTU</label><div class="muted" data-air-care-btu-label>${esc(range)}</div><input data-btu type="hidden" value="${esc(defaultBtu)}"></div>`
        : `<div><label>BTU จริง</label><input data-btu type="number" min="1" step="1" value="${esc(defaultBtu)}"></div>`;
      return `<div class="variant" data-prepaid-variant="${esc(variant.package_key)}">
        <div class="variant-title">${esc(variant.display_name)}</div>
        <div class="muted">${esc(range)}</div>
        <div class="variant-grid">
          ${btuControl}
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
    const address = clean($("saleAddress").value);
    if (!customerName || !customerPhone || !address) throw new Error("กรอกชื่อลูกค้า เบอร์โทร และที่อยู่ให้ครบ");
    if (!state.quote || state.quoteFingerprint !== saleFingerprint()) throw new Error("ข้อมูลโปรเปลี่ยน กรุณาคำนวณราคาใหม่");
    const payload = {
      catalog_item_id: Number(state.selectedBundle.item_id),
      service_package_groups: selectedGroups(),
      customer_name: customerName,
      customer_phone: customerPhone,
      address_text: address,
      maps_url: clean($("saleMapsUrl").value),
      gps_latitude: clean($("saleLatitude").value) || null,
      gps_longitude: clean($("saleLongitude").value) || null,
      note: clean($("saleNote").value),
      purchase_request_key: state.saleRequestKey ||= requestKey(),
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
    const label = status === "cancelled" ? "ยกเลิกแล้ว" : status;
    const cls = status === "paid" || status === "active" || status === "unclaimed" || status === "redeeming" ? "paid"
      : status === "redeemed" ? "redeemed" : "pending";
    return `<span class="badge ${cls}">${esc(label)}</span>`;
  }

  async function loadOrders() {
    setMessage("ordersMessage", "กำลังโหลด...");
    const data = await api("/admin/prepaid-orders");
    const orders = Array.isArray(data?.orders) ? data.orders : [];
    state.orders = orders;
    const term = clean($("ordersSearch")?.value).toLowerCase();
    const activeOrders = $("showCancelledOrders")?.checked ? orders : orders.filter((row) => row.payment_order_status !== "cancelled");
    const visible = term ? activeOrders.filter((row) => [
      row.order_code, row.customer_name, row.customer_phone, row.entitlement_code,
    ].some((value) => clean(value).toLowerCase().includes(term))) : activeOrders;
    $("ordersBody").innerHTML = visible.map((row) => {
      const pending = ["pending_payment", "payment_failed"].includes(row.payment_order_status);
      const canBook = Boolean(row.entitlement_code) && ["active", "unclaimed", "redeeming"].includes(String(row.entitlement_status || "")) && !row.redeemed_job_id;
      const snapshot = typeof row.service_entitlement_snapshot === "string" ? JSON.parse(row.service_entitlement_snapshot) : row.service_entitlement_snapshot || {};
      const groups = Array.isArray(snapshot.service_package_groups) ? snapshot.service_package_groups : [];
      return `<tr>
        <td><b>${esc(row.order_code)}</b><div class="muted">${esc(dateText(row.created_at))}</div></td>
        <td>${esc(row.customer_name)}<div class="muted">${esc(row.customer_phone)}<br>${esc(row.address || "-")}</div>${row.prepaid_maps_url ? `<a href="${esc(row.prepaid_maps_url)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}</td>
        <td><b>${esc(snapshot.bundle_key || "-")}</b><div class="muted">${groups.map((g) => `${esc(g.btu)} BTU ×${esc(g.quantity)}`).join("<br>")}</div></td>
        <td><b>${money(row.subtotal)}</b></td>
        <td>${statusBadge(row.payment_order_status)}${row.payment_status ? `<div class="muted">${esc(row.payment_status)}</div>` : ""}</td>
        <td>${row.entitlement_code ? `<b>${esc(row.entitlement_code)}</b><div>${statusBadge(row.entitlement_status)}</div>` : '<span class="muted">ยังไม่ออกสิทธิ์</span>'}</td>
        <td>${esc(dateText(row.redeem_until))}<div class="muted">ประกัน ${esc(row.warranty_days ?? "-")} วัน</div></td>
        <td>${row.redeemed_job_id ? `<b>#${esc(row.redeemed_job_id)}</b>` : "-"}</td>
        <td><div class="actions" style="margin-top:0">
          ${pending ? `<button class="btn-soft" type="button" data-edit-order="${esc(row.order_code)}">แก้ไขข้อมูลจอง</button><button class="btn-gold" type="button" data-confirm-order="${esc(row.order_code)}" data-amount="${esc(row.subtotal)}">ยืนยันรับเงิน</button><button class="btn-soft" type="button" data-cancel-order="${esc(row.order_code)}">ยกเลิกออเดอร์</button>` : ""}
          ${canBook ? `<button class="btn-primary" type="button" data-book-right="${esc(row.entitlement_code)}">ลงงาน</button>` : ""}
          ${row.payment_order_status === "paid" && !row.redeemed_job_id ? '<span class="muted">ชำระแล้ว: หากลูกค้าขอยกเลิก ต้องตรวจสอบการคืนเงินและสิทธิ์ก่อน ไม่สามารถลบออเดอร์</span>' : ""}
          ${row.redeemed_job_id ? `<a class="btn-soft" href="/admin-job-view-v2.html?job_id=${encodeURIComponent(row.redeemed_job_id)}">จัดการงาน / เลื่อนนัด</a><span class="muted">การยกเลิกงานไม่ใช่การคืนเงินออเดอร์</span>` : ""}
        </div></td>
      </tr>`;
    }).join("") || '<tr><td colspan="9" class="muted">ยังไม่มีรายการ PREPAID</td></tr>';
    setMessage("ordersMessage", term ? `พบ ${visible.length} จาก ${activeOrders.length} รายการ` : `แสดง ${activeOrders.length} รายการ${orders.length > activeOrders.length ? ` · ยกเลิกแล้ว ${orders.length - activeOrders.length} รายการ` : ""}`);
  }

  function confirmPayment(orderCode) {
    const order = state.orders.find((row) => row.order_code === orderCode);
    if (!order || !["pending_payment", "payment_failed"].includes(order.payment_order_status)) return;
    $("paymentConfirmDialog").dataset.orderCode = orderCode;
    $("paymentConfirmSummary").innerHTML = `Order <b>${esc(orderCode)}</b><br>${esc(order.customer_name)}<br>ยอดตามระบบ <b>${money(order.subtotal)} บาท</b>`;
    $("paymentConfirmReference").value = "";
    $("paymentConfirmMessage").textContent = "";
    $("btnSubmitPaymentConfirm").textContent = `ยืนยันรับชำระ ${money(order.subtotal)} บาท`;
    $("paymentConfirmDialog").showModal();
    $("paymentConfirmReference").focus();
  }

  async function submitPaymentConfirmation() {
    const orderCode = $("paymentConfirmDialog").dataset.orderCode;
    const order = state.orders.find((row) => row.order_code === orderCode);
    const reference = clean($("paymentConfirmReference").value);
    if (!order || !reference) { $("paymentConfirmMessage").textContent = "กรุณากรอกเลขอ้างอิงหรือหมายเหตุการรับเงินจริง"; return; }
    const button = $("btnSubmitPaymentConfirm");
    button.disabled = true;
    try {
      await api(`/admin/prepaid-orders/${encodeURIComponent(orderCode)}/confirm-payment`, {
        method: "POST", body: JSON.stringify({ reference, confirmed_amount: Number(order.subtotal) }),
      });
      $("paymentConfirmDialog").close();
      setMessage("ordersMessage", `ยืนยันการชำระ ${orderCode} สำเร็จ`, "success");
      await loadOrders();
    } catch (error) {
      $("paymentConfirmMessage").textContent = error.message || "ยืนยันการชำระไม่สำเร็จ กรุณาลองใหม่";
    } finally { button.disabled = false; }
  }

  function showCancelOrder(orderCode) {
    const order = state.orders.find((row) => row.order_code === orderCode);
    if (!order || !["pending_payment", "payment_failed"].includes(order.payment_order_status)) return;
    $("cancelOrderDialog").dataset.orderCode = orderCode;
    $("cancelOrderSummary").innerHTML = `Order <b>${esc(orderCode)}</b><br>${esc(order.customer_name)} · ${money(order.subtotal)} บาท`;
    $("cancelOrderReason").value = "";
    $("cancelOrderMessage").textContent = "";
    $("cancelOrderDialog").showModal();
    $("cancelOrderReason").focus();
  }

  async function submitCancelOrder() {
    const code = $("cancelOrderDialog").dataset.orderCode;
    const reason = clean($("cancelOrderReason").value);
    if (reason.length < 3) { $("cancelOrderMessage").textContent = "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร"; return; }
    const button = $("btnSubmitCancelOrder");
    button.disabled = true;
    try {
      await api(`/admin/prepaid-orders/${encodeURIComponent(code)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      $("cancelOrderDialog").close();
      await loadOrders();
      setMessage("ordersMessage", `ยกเลิก ${code} แล้ว (เก็บประวัติไว้)`, "success");
    } catch (error) {
      $("cancelOrderMessage").textContent = error.message || "ยกเลิกไม่สำเร็จ กรุณาตรวจสอบสถานะออเดอร์";
    } finally { button.disabled = false; }
  }

  function editReservation(orderCode) {
    const order = state.orders.find((row) => row.order_code === orderCode);
    if (!order || !["pending_payment", "payment_failed"].includes(order.payment_order_status)) return;
    $("editOrderCode").textContent = orderCode;
    $("editCustomerName").value = order.customer_name || "";
    $("editCustomerPhone").value = order.customer_phone || "";
    $("editAddress").value = order.address || "";
    $("editMapsUrl").value = order.prepaid_maps_url || "";
    $("editLatitude").value = order.prepaid_gps_latitude ?? "";
    $("editLongitude").value = order.prepaid_gps_longitude ?? "";
    $("editNote").value = order.note || "";
    setMessage("editMessage", "แก้ไขได้เฉพาะข้อมูลติดต่อและสถานที่ ยอดและรายการบริการคงเดิม");
    $("reservationDialog").showModal();
  }

  async function saveReservation() {
    const code = clean($("editOrderCode").textContent);
    $("btnSaveReservation").disabled = true;
    try {
      await api(`/admin/prepaid-orders/${encodeURIComponent(code)}/reservation`, {
        method: "PATCH", body: JSON.stringify({
          customer_name: clean($("editCustomerName").value),
          customer_phone: clean($("editCustomerPhone").value),
          address_text: clean($("editAddress").value),
          maps_url: clean($("editMapsUrl").value),
          gps_latitude: clean($("editLatitude").value) || null,
          gps_longitude: clean($("editLongitude").value) || null,
          note: clean($("editNote").value),
        }),
      });
      $("reservationDialog").close();
      await loadOrders();
    } catch (error) {
      setMessage("editMessage", `บันทึกไม่สำเร็จ: ${error.message}`, "error");
    } finally { $("btnSaveReservation").disabled = false; }
  }

  async function openBooking(entitlementCode) {
    const data = await api(`/admin/prepaid-entitlements/${encodeURIComponent(entitlementCode)}`);
    const right = data.entitlement;
    if (!right || right.order_status !== "paid") throw new Error("สิทธิ์นี้ยังไม่ได้ยืนยันการชำระ");
    if (right.redeemed_job_id) throw new Error(`สิทธิ์นี้ถูกใช้กับ Job #${right.redeemed_job_id} แล้ว`);
    $("bookingEntitlementCode").value = right.entitlement_code;
    $("bookingAddress").value = right.address_text || "";
    $("bookingMapsUrl").value = right.maps_url || "";
    const mapLink = $("bookingMapLink");
    const safeMap = safeMapUrl(right.maps_url);
    mapLink.hidden = !safeMap;
    if (safeMap) mapLink.href = safeMap;
    else mapLink.removeAttribute("href");
    $("bookingNote").value = right.note || "";
    $("bookingRightSummary").textContent = [
      `ลูกค้า: ${right.customer_name} • ${right.customer_phone}`,
      `สิทธิ์: ${right.entitlement_code} • ${money(right.fixed_total_price)} บาท`,
      `สถานะ: ${right.entitlement_status} • หมดสิทธิ์: ${dateText(right.redeem_until)}`,
      "ลูกค้าชำระเพิ่มเมื่อใช้สิทธิ์: 0 บาท",
      `รับประกันหลังปิดงาน: ${right.warranty_days} วัน`,
      `บริการ: ${(right.service_package_groups || []).map((g) => `${g.package_key} / ${g.btu} BTU × ${g.quantity}`).join(" | ")}`,
    ].join("\n");
    state.bookingRequestKey = requestKey();
    $("bookingCard").style.display = "block";
    setMessage("bookingMessage", "ที่อยู่ แผนที่ หมุด GPS และหมายเหตุจะส่งจากออเดอร์โดยอัตโนมัติ เลือกเพียงวันเวลาและช่าง");
    $("bookingCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function bookRight() {
    const code = clean($("bookingEntitlementCode").value);
    const appointment = bangkokIso($("bookingAppointment").value);
    if (!code || !appointment) throw new Error("กรอกวันเวลาให้ครบ");
    const assignMode = $("bookingAssignMode").value;
    const technician = clean($("bookingTechnician").value);
    if (assignMode === "single" && !technician) throw new Error("โหมดระบุช่าง ต้องกรอก Username ช่าง");
    const payload = {
      appointment_datetime: appointment,
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
    $("btnSubmitPaymentConfirm").addEventListener("click", submitPaymentConfirmation);
    $("btnCancelPaymentConfirm").addEventListener("click", () => $("paymentConfirmDialog").close());
    $("btnSubmitCancelOrder").addEventListener("click", submitCancelOrder);
    $("btnCloseCancelOrder").addEventListener("click", () => $("cancelOrderDialog").close());
    $("btnSaveReservation").addEventListener("click", saveReservation);
    $("btnCloseReservation").addEventListener("click", () => $("reservationDialog").close());
    $("saleBundle").addEventListener("change", () => chooseBundle().catch((error) => setMessage("saleMessage", error.message, "error")));
    $("btnQuote").addEventListener("click", () => quoteSale().catch((error) => setMessage("saleMessage", error.message, "error")));
    $("btnCreateOrder").addEventListener("click", () => createOrder().catch((error) => { $("btnCreateOrder").disabled = false; setMessage("saleMessage", error.message, "error"); }));
    $("btnRefreshOrders").addEventListener("click", () => loadOrders().catch((error) => setMessage("ordersMessage", error.message, "error")));
    $("ordersSearch")?.addEventListener("input", () => loadOrders().catch((error) => setMessage("ordersMessage", error.message, "error")));
    $("showCancelledOrders")?.addEventListener("change", () => loadOrders().catch((error) => setMessage("ordersMessage", error.message, "error")));
    $("bookingAssignMode").addEventListener("change", () => { $("singleTechBox").style.display = $("bookingAssignMode").value === "single" ? "block" : "none"; });
    $("btnBookRight").addEventListener("click", () => bookRight().catch((error) => setMessage("bookingMessage", error.message, "error")));
    $("btnCancelBookingPanel").addEventListener("click", () => { $("bookingCard").style.display = "none"; state.bookingRequestKey = ""; });
    $("ordersBody").addEventListener("click", (event) => {
      const cancelButton = event.target.closest("[data-cancel-order]");
      if (cancelButton) { showCancelOrder(cancelButton.getAttribute("data-cancel-order")); return; }
      const editButton = event.target.closest("[data-edit-order]");
      if (editButton) { editReservation(editButton.getAttribute("data-edit-order")); return; }
      const confirmButton = event.target.closest("[data-confirm-order]");
      if (confirmButton) {
        confirmPayment(confirmButton.getAttribute("data-confirm-order"));
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
    try {
      await Promise.all([loadBundles(), loadOrders()]);
      const code = new URLSearchParams(window.location.search).get("order");
      const order = state.orders.find((row) => row.order_code === code);
      if (order?.entitlement_code && order.payment_order_status === "paid" && !order.redeemed_job_id) {
        await openBooking(order.entitlement_code);
      } else if (order) {
        if (order.payment_order_status === "cancelled") $("showCancelledOrders").checked = true;
        $("ordersSearch").value = code;
        await loadOrders();
        $("ordersSearch").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    catch (error) { setMessage("ordersMessage", error.message || "โหลดข้อมูล PREPAID ไม่สำเร็จ", "error"); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
