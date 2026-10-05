(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const LINE_URL = "https://line.me/R/ti/p/@cwfair";
  let modal = null;
  let quoteSeq = 0;
  const policyCache = new Map();

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function baht(value) {
    const n = Number(value || 0);
    return `${new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(n)} บาท`;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${root.api.getApiBase()}${path}`, {
      method: options.method || "GET",
      credentials: "include",
      cache: options.cache || "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = data?.code || data?.error || "REQUEST_FAILED";
      error.data = data;
      throw error;
    }
    return data;
  }

  function ensureStyles() {
    if (document.getElementById("cwf-prepaid-live-styles")) return;
    const style = document.createElement("style");
    style.id = "cwf-prepaid-live-styles";
    style.textContent = `
      .cwf-prepaid-backdrop{position:fixed;inset:0;z-index:220;background:rgba(2,6,23,.62);display:flex;align-items:flex-end;justify-content:center;padding:0}
      .cwf-prepaid-sheet{width:min(680px,100%);max-height:calc(100dvh - 12px);overflow:auto;overscroll-behavior:contain;background:#f8fafc;border-radius:24px 24px 0 0;padding:18px;padding-bottom:calc(18px + env(safe-area-inset-bottom));box-shadow:0 -18px 50px rgba(2,6,23,.22)}
      .cwf-prepaid-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.cwf-prepaid-head h2{margin:0;font-size:21px}.cwf-prepaid-close{border:0;background:#e2e8f0;border-radius:999px;width:38px;height:38px;font-size:20px}
      .cwf-prepaid-card{background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:16px;padding:14px;margin-top:12px}.cwf-prepaid-muted{color:#64748b;font-size:13px}.cwf-prepaid-row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .cwf-prepaid-grid{display:grid;gap:9px}.cwf-prepaid-service{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-top:1px solid #e2e8f0;padding:10px 0}.cwf-prepaid-service:first-child{border-top:0}
      .cwf-prepaid-stepper{display:flex;align-items:center;gap:7px}.cwf-prepaid-stepper button{width:36px;height:36px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:22px;color:#0f172a}.cwf-prepaid-stepper output{min-width:26px;text-align:center;font-weight:800}.cwf-prepaid-field{display:block;margin-top:11px;font-weight:700}.cwf-prepaid-field .cwf-prepaid-input{margin-top:5px;font-weight:400}.cwf-prepaid-pin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}.cwf-prepaid-pin button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:9px 12px;font-weight:700}.cwf-prepaid-confirm-code{font-size:25px;font-weight:900;letter-spacing:.03em;overflow-wrap:anywhere}
      .cwf-prepaid-qty{width:88px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;text-align:center}.cwf-prepaid-input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:11px;font-size:16px;background:#fff}
      .cwf-prepaid-primary,.cwf-prepaid-secondary{width:100%;border:0;border-radius:12px;padding:12px 14px;font-weight:800;font-size:15px;margin-top:10px}.cwf-prepaid-primary{background:#0b5ed7;color:#fff}.cwf-prepaid-secondary{background:#e2e8f0;color:#0f172a}.cwf-prepaid-primary:disabled{opacity:.55}.cwf-prepaid-error{padding:10px;border-radius:12px;background:#fef2f2;color:#991b1b;margin-top:10px}.cwf-prepaid-success{padding:10px;border-radius:12px;background:#ecfdf5;color:#166534;margin-top:10px}
      .cwf-prepaid-total{font-size:24px;font-weight:900}.cwf-prepaid-qr{width:min(260px,80vw);display:block;margin:12px auto;border-radius:12px}.cwf-prepaid-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;background:#e2e8f0}.cwf-prepaid-status.active{background:#dcfce7;color:#166534}.cwf-prepaid-status.redeemed{background:#dbeafe;color:#1d4ed8}
      .cwf-prepaid-summary{border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:12px;margin-top:10px;line-height:1.55;overflow-wrap:anywhere}
      .cwf-prepaid-location-option{display:flex;align-items:flex-start;gap:9px;border:1px solid #dbe4f0;border-radius:11px;padding:10px;margin-top:8px;line-height:1.4}
      .cwf-prepaid-location-option input{margin-top:4px}.cwf-prepaid-location-option span{min-width:0;overflow-wrap:anywhere}
      .cwf-prepaid-hub{margin:14px 0}.cwf-prepaid-hub-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:5px}.cwf-prepaid-hub-tabs button{white-space:nowrap;border:1px solid #cbd5e1;background:#fff;color:#17356b;border-radius:999px;padding:9px 11px;font-weight:800}.cwf-prepaid-hub-tabs button[aria-selected="true"]{background:#1457c9;color:#fff;border-color:#1457c9}
      @media(min-width:720px){.cwf-prepaid-backdrop{align-items:center;padding:24px}.cwf-prepaid-sheet{border-radius:24px;max-height:88vh}}
    `;
    document.head.appendChild(style);
  }

  function closeModal() {
    if (modal) modal.remove();
    modal = null;
  }

  function openModal(title, body) {
    ensureStyles();
    closeModal();
    modal = document.createElement("div");
    modal.className = "cwf-prepaid-backdrop";
    modal.innerHTML = `<section class="cwf-prepaid-sheet" role="dialog" aria-modal="true"><div class="cwf-prepaid-head"><div><div class="cwf-prepaid-muted">COLDWINDFLOW PREPAID</div><h2>${esc(title)}</h2></div><button type="button" class="cwf-prepaid-close" data-prepaid-close aria-label="ปิด">×</button></div><div data-prepaid-body>${body || ""}</div></section>`;
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest?.("[data-prepaid-close]")) closeModal();
    });
    document.body.appendChild(modal);
    return modal.querySelector("[data-prepaid-body]");
  }

  function currentItemId(button) {
    const raw = button.getAttribute("data-store-book") || button.getAttribute("data-store-urgent")
      || button.getAttribute("data-store-detail-book") || button.getAttribute("data-store-detail-urgent");
    const direct = Number(raw);
    if (Number.isSafeInteger(direct) && direct > 0) return direct;
    const detail = Number(root.state.storeDetail?.data?.item_id || root.state.storeDetail?.itemId || 0);
    return Number.isSafeInteger(detail) && detail > 0 ? detail : 0;
  }

  async function policyFor(itemId) {
    if (policyCache.has(String(itemId))) return policyCache.get(String(itemId));
    const data = await request(`/public/prepaid-policy/${encodeURIComponent(itemId)}`);
    policyCache.set(String(itemId), data);
    return data;
  }

  function delegateOriginal(button) {
    button.dataset.prepaidBypass = "1";
    button.click();
  }

  function customerContact(orders = []) {
    const customer = root.state.customer || {};
    const profile = customer.profile || {};
    const user = customer.user || {};
    const latest = orders[0] || {};
    return {
      name: String(latest.customer_name || user.name || customer.display_name || profile.display_name || "").trim(),
      phone: String(profile.phone || latest.customer_phone || customer.phone || user.phone || "").trim(),
      address: String(profile.address || latest.address || "").trim(),
      maps_url: String(profile.address ? profile.maps_url || "" : latest.prepaid_maps_url || "").trim(),
    };
  }

  function locationChoices(profile, orders = [], history = []) {
    const locations = [];
    const seen = new Map();
    const add = (source) => {
      const address = String(source?.address_text || source?.address || "").trim();
      if (!address) return;
      const key = address.toLocaleLowerCase().replace(/\s+/g, " ");
      const candidate = {
        address_text: address,
        maps_url: String(source?.maps_url || source?.prepaid_maps_url || "").trim(),
        gps_latitude: source?.gps_latitude ?? source?.prepaid_gps_latitude ?? null,
        gps_longitude: source?.gps_longitude ?? source?.prepaid_gps_longitude ?? null,
        label: String(source?.job_zone || "สถานที่เข้าบริการ").trim(),
      };
      if (seen.has(key)) {
        const existing = locations[seen.get(key)];
        if (!existing.maps_url && candidate.maps_url) existing.maps_url = candidate.maps_url;
        if (existing.gps_latitude == null && candidate.gps_latitude != null) existing.gps_latitude = candidate.gps_latitude;
        if (existing.gps_longitude == null && candidate.gps_longitude != null) existing.gps_longitude = candidate.gps_longitude;
        return;
      }
      seen.set(key, locations.length);
      locations.push(candidate);
    };
    add(profile || {});
    orders.forEach(add);
    history.forEach(add);
    return locations;
  }

  function validMapUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"].includes(url.hostname);
    } catch (_) { return false; }
  }

  function requireLogin() {
    if (root.state.customer?.logged_in) return true;
    const body = openModal("เข้าสู่ระบบเพื่อเก็บสิทธิ์", `<div class="cwf-prepaid-card"><b>โปร PREPAID ต้องผูกสิทธิ์กับบัญชีลูกค้า</b><p class="cwf-prepaid-muted">เข้าสู่ระบบด้วย LINE หรือ Google ก่อนจองสิทธิ์ เพื่อให้รายการจองและสิทธิ์หลังแอดมินยืนยันการชำระผูกกับบัญชีนี้</p><button class="cwf-prepaid-primary" data-prepaid-login>เข้าสู่ระบบ</button></div>`);
    body.querySelector("[data-prepaid-login]")?.addEventListener("click", () => { closeModal(); root.utils.routeTo("profile"); });
    return false;
  }

  function packageRows(item) {
    const variants = Array.isArray(item.service_package_variants) ? item.service_package_variants : [];
    const bundleKey = String(item.service_bundle_key || "");
    const isAirCare = bundleKey === "coldwindflow-air-care-standard" || bundleKey === "coldwindflow-air-care-premium";
    const rows = [];
    if (isAirCare) {
      variants.forEach((variant) => {
        // Customer catalog DTOs intentionally keep service taxonomy under
        // `variant.service`; top-level bounds only exist in internal/legacy
        // shapes. Read the public contract first while preserving compatibility.
        const min = Number(variant.service?.btu_min ?? variant.btu_min ?? 0);
        const max = Number(variant.service?.btu_max ?? variant.btu_max ?? 0);
        const isSmall = max > 0 && max <= 12000;
        const isLarge = min >= 18000;
        if (!isSmall && !isLarge) return;
        rows.push({
          package_key: String(variant.package_key),
          label: isSmall ? "ไม่เกิน 12,000 BTU" : "18,000 BTU ขึ้นไป",
          btu: isSmall ? 12000 : 18000,
          quantity: 0,
        });
      });
    } else {
      const btuOptions = Array.isArray(root.services?.bookableBtuOptions) ? root.services.bookableBtuOptions : [];
      variants.forEach((variant) => {
        const min = Number(variant.service?.btu_min ?? variant.btu_min ?? 0);
        const max = Number(variant.service?.btu_max ?? variant.btu_max ?? Number.MAX_SAFE_INTEGER);
        btuOptions.filter((option) => Number(option.btu) >= min && Number(option.btu) <= max).forEach((option) => {
          rows.push({
            package_key: String(variant.package_key),
            label: `${variant.display_name || variant.service_name || item.item_name} · ${Number(option.btu).toLocaleString("th-TH")} BTU`,
            btu: Number(option.btu),
            quantity: 0,
          });
        });
      });
    }
    if (rows[0]) rows[0].quantity = 1;
    return rows;
  }

  function selectedGroups(rows) {
    return rows.filter((row) => Number(row.quantity) > 0).map((row) => ({
      package_key: row.package_key,
      btu: row.btu,
      quantity: Number(row.quantity),
    }));
  }

  function requireQuote(data) {
    const quote = data?.quote;
    if (!quote || !Number.isFinite(Number(quote.fixed_total_price))) {
      const error = new Error("INVALID_PREPAID_QUOTE_RESPONSE");
      error.code = "INVALID_PREPAID_QUOTE_RESPONSE";
      throw error;
    }
    return quote;
  }

  function quoteErrorMessage(error) {
    const code = String(error?.code || error?.message || "PREPAID_QUOTE_FAILED").trim() || "PREPAID_QUOTE_FAILED";
    console.warn("PREPAID_QUOTE_FAILED", code);
    return code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET"
      ? "จำนวนเครื่องยังไม่ถึงขั้นต่ำของโปรโมชั่น"
      : "ไม่สามารถคำนวณราคาได้ กรุณาลองใหม่ หรือติดต่อ LINE @cwfair";
  }

  async function openPurchase(itemId) {
    if (!requireLogin()) return;
    const body = openModal("กำลังโหลดโปรโมชั่น", `<div class="cwf-prepaid-card">กำลังโหลดราคาและตัวเลือก...</div>`);
    try {
      const item = await root.api.loadCatalogItem(itemId);
      const actual = item?.item || item;
      if (!actual || !Array.isArray(actual.service_package_variants) || !actual.service_package_variants.length) throw new Error("PACKAGE_NOT_AVAILABLE");
      const rows = packageRows(actual);
      if (!rows.length) throw new Error("PACKAGE_OPTIONS_NOT_AVAILABLE");
      const saved = await Promise.allSettled([
        request("/public/prepaid-orders"),
        root.api?.loadCustomerHistoryLocations?.() || Promise.resolve({ locations: [] }),
      ]);
      const previousOrders = saved[0].status === "fulfilled" && Array.isArray(saved[0].value?.items) ? saved[0].value.items : [];
      const historyLocations = saved[1].status === "fulfilled" && Array.isArray(saved[1].value?.locations) ? saved[1].value.locations : [];
      const contact = customerContact(previousOrders);
      const locations = locationChoices(root.state.customer?.profile, previousOrders, historyLocations);
      let selectedLocation = locations.length === 1 && validMapUrl(locations[0].maps_url) ? locations[0] : null;
      if (locations.length > 1) { contact.address = ""; contact.maps_url = ""; }
      else if (selectedLocation) { contact.address = selectedLocation.address_text; contact.maps_url = selectedLocation.maps_url; }
      const contactComplete = Boolean(contact.name && contact.phone);
      let quote = null;
      let quoteTimer = null;
      let pin = selectedLocation?.gps_latitude != null && selectedLocation?.gps_longitude != null
        ? { latitude: Number(selectedLocation.gps_latitude), longitude: Number(selectedLocation.gps_longitude) } : null;
      let purchaseKey = null;
      let busy = false;

      body.innerHTML = `
        <div class="cwf-prepaid-card"><b>${esc(actual.item_name || "โปรโมชั่น COLDWINDFLOW")}</b><p class="cwf-prepaid-muted">1. เลือกจำนวนเครื่อง</p><div class="cwf-prepaid-grid">${rows.map((row, index) => `<div class="cwf-prepaid-service"><span>${esc(row.label)}</span><div class="cwf-prepaid-stepper"><button type="button" data-prepaid-minus="${index}" aria-label="ลดจำนวน ${esc(row.label)}">−</button><output data-prepaid-count="${index}">${row.quantity}</output><button type="button" data-prepaid-plus="${index}" aria-label="เพิ่มจำนวน ${esc(row.label)}">+</button></div></div>`).join("")}</div></div>
        <div class="cwf-prepaid-card"><b>2. ราคาที่ระบบยืนยัน</b><div class="cwf-prepaid-muted" data-prepaid-count-total></div><div class="cwf-prepaid-total" data-prepaid-total>กำลังตรวจสอบราคาจากระบบ...</div><div class="cwf-prepaid-muted" data-prepaid-terms></div></div>
        <div class="cwf-prepaid-card"><b>3. ข้อมูลผู้จอง</b>
          <div class="cwf-prepaid-summary" data-prepaid-contact-summary ${contactComplete ? "" : "hidden"}><strong data-prepaid-summary-name>${esc(contact.name)}</strong><br><span data-prepaid-summary-phone>${esc(contact.phone)}</span><button class="cwf-prepaid-secondary" type="button" data-prepaid-edit-contact>แก้ไขข้อมูล</button></div>
          <div data-prepaid-contact-form ${contactComplete ? "hidden" : ""}><label class="cwf-prepaid-field">ชื่อ *<input class="cwf-prepaid-input" data-prepaid-name value="${esc(contact.name)}" maxlength="120" autocomplete="name"></label><label class="cwf-prepaid-field">เบอร์โทร *<input class="cwf-prepaid-input" data-prepaid-phone value="${esc(contact.phone)}" maxlength="40" inputmode="tel" autocomplete="tel"></label><button class="cwf-prepaid-secondary" type="button" data-prepaid-save-contact>ใช้ข้อมูลนี้</button></div>
          <h3>สถานที่เข้าบริการ</h3>
          ${locations.length > 1 ? `<div data-prepaid-location-options><p class="cwf-prepaid-muted">เลือกสถานที่ของคุณก่อนยืนยัน</p>${locations.map((loc, index) => `<label class="cwf-prepaid-location-option"><input type="radio" name="prepaid_saved_location" value="${index}"><span><b>${esc(loc.label)}</b><br>${esc(loc.address_text)}${loc.maps_url ? " · 📍 ปักหมุดแล้ว" : ""}</span></label>`).join("")}</div>` : ""}
          <div class="cwf-prepaid-summary" data-prepaid-location-summary ${selectedLocation ? "" : "hidden"}><span data-prepaid-summary-address>${esc(selectedLocation?.address_text || "")}</span><br><span data-prepaid-summary-pin>${selectedLocation?.maps_url ? "📍 ปักหมุดแล้ว" : "ยังไม่มีหมุด"}</span><div class="cwf-prepaid-row"><button class="cwf-prepaid-secondary" type="button" data-prepaid-change-location>เปลี่ยนสถานที่</button>${selectedLocation?.maps_url ? `<a href="${esc(selectedLocation.maps_url)}" target="_blank" rel="noopener" data-prepaid-summary-map>เปิดแผนที่</a>` : "<a data-prepaid-summary-map hidden>เปิดแผนที่</a>"}</div></div>
          <button class="cwf-prepaid-secondary" type="button" data-prepaid-add-location>+ เพิ่มสถานที่</button>
          <div data-prepaid-location-form ${locations.length ? "hidden" : ""}><label class="cwf-prepaid-field">ที่อยู่สำหรับเข้าบริการ *<textarea class="cwf-prepaid-input" data-prepaid-address rows="3" maxlength="1000" placeholder="บ้านเลขที่ อาคาร ห้อง ซอย ถนน และจุดนัดพบ">${esc(contact.address)}</textarea></label><div class="cwf-prepaid-pin"><button type="button" data-prepaid-pin>ปักหมุดตำแหน่งปัจจุบัน</button><span class="cwf-prepaid-muted" data-prepaid-pin-status>${pin ? "📍 ปักหมุดแล้ว" : "หรือวางลิงก์แผนที่ด้านล่าง"}</span></div><label class="cwf-prepaid-field">ลิงก์แผนที่ / จุดบริการ *<input class="cwf-prepaid-input" data-prepaid-maps type="url" value="${esc(contact.maps_url)}" placeholder="https://maps.app.goo.gl/..."></label><button class="cwf-prepaid-secondary" type="button" data-prepaid-save-location>ใช้สถานที่นี้</button></div>
          <label class="cwf-prepaid-field">หมายเหตุเพิ่มเติม<input class="cwf-prepaid-input" data-prepaid-note maxlength="500" placeholder="เช่น จุดจอดรถ หรือติดต่อก่อนถึง"></label></div>
        <div class="cwf-prepaid-card"><b>4. ตรวจสอบและยืนยัน</b><p>ยังไม่มีการตัดเงินในขั้นตอนนี้</p><p class="cwf-prepaid-muted">หลังส่งคำสั่งซื้อ กรุณาติดต่อ LINE @cwfair เพื่อชำระเงิน แอดมินจะตรวจสอบยอดและยืนยันการชำระให้</p><p class="cwf-prepaid-muted">สิทธิ์จะเริ่มใช้งานหลังแอดมินยืนยันรับชำระแล้ว</p><button class="cwf-prepaid-primary" data-prepaid-buy disabled>กำลังตรวจสอบราคา...</button><div data-prepaid-error></div></div>`;
      if (!selectedLocation && locations.length === 1) body.querySelector("[data-prepaid-location-form]").hidden = false;

      function currentContact() {
        return {
          customer_name: String(body.querySelector("[data-prepaid-name]")?.value || "").trim(),
          customer_phone: String(body.querySelector("[data-prepaid-phone]")?.value || "").trim(),
          address_text: String(body.querySelector("[data-prepaid-address]")?.value || "").trim(),
          maps_url: String(body.querySelector("[data-prepaid-maps]")?.value || "").trim(),
          note: String(body.querySelector("[data-prepaid-note]")?.value || "").trim(),
          ...(pin ? { gps_latitude: pin.latitude, gps_longitude: pin.longitude } : {}),
        };
      }

      function sync() {
        const total = rows.reduce((sum, row) => sum + row.quantity, 0);
        body.querySelector("[data-prepaid-count-total]").textContent = `${total} เครื่อง`;
        const fields = currentContact();
        const valid = quote && total > 0 && fields.customer_name && fields.customer_phone
          && fields.address_text && validMapUrl(fields.maps_url);
        const buy = body.querySelector("[data-prepaid-buy]");
        buy.disabled = !valid || busy;
        if (!busy) buy.textContent = quote ? `ยืนยันซื้อสิทธิ์ ${baht(quote.fixed_total_price)}` : "กำลังตรวจสอบราคา...";
      }

      const locationForm = body.querySelector("[data-prepaid-location-form]");
      const locationSummary = body.querySelector("[data-prepaid-location-summary]");
      const contactForm = body.querySelector("[data-prepaid-contact-form]");
      const contactSummary = body.querySelector("[data-prepaid-contact-summary]");

      function showLocationSummary() {
        const fields = currentContact();
        if (!fields.address_text || !validMapUrl(fields.maps_url)) return false;
        locationSummary.hidden = false;
        locationForm.hidden = true;
        const locationOptions = body.querySelector("[data-prepaid-location-options]");
        if (locationOptions) locationOptions.hidden = true;
        body.querySelector("[data-prepaid-summary-address]").textContent = fields.address_text;
        body.querySelector("[data-prepaid-summary-pin]").textContent = "📍 ปักหมุดแล้ว";
        const map = body.querySelector("[data-prepaid-summary-map]");
        map.href = fields.maps_url;
        map.hidden = false;
        sync();
        return true;
      }

      body.querySelector("[data-prepaid-edit-contact]").addEventListener("click", () => {
        contactSummary.hidden = true;
        contactForm.hidden = false;
        body.querySelector("[data-prepaid-name]").focus();
      });
      body.querySelector("[data-prepaid-save-contact]").addEventListener("click", () => {
        const fields = currentContact();
        if (!fields.customer_name || !fields.customer_phone) return;
        body.querySelector("[data-prepaid-summary-name]").textContent = fields.customer_name;
        body.querySelector("[data-prepaid-summary-phone]").textContent = fields.customer_phone;
        contactSummary.hidden = false;
        contactForm.hidden = true;
        sync();
      });
      body.querySelector("[data-prepaid-change-location]").addEventListener("click", () => {
        locationSummary.hidden = true;
        if (locations.length > 1) body.querySelector("[data-prepaid-location-options]").hidden = false;
        else locationForm.hidden = false;
      });
      body.querySelector("[data-prepaid-add-location]").addEventListener("click", () => {
        selectedLocation = null;
        pin = null;
        const locationOptions = body.querySelector("[data-prepaid-location-options]");
        if (locationOptions) locationOptions.hidden = true;
        body.querySelector("[data-prepaid-address]").value = "";
        body.querySelector("[data-prepaid-maps]").value = "";
        body.querySelector("[data-prepaid-pin-status]").textContent = "หรือวางลิงก์แผนที่ด้านล่าง";
        locationSummary.hidden = true;
        locationForm.hidden = false;
        purchaseKey = null;
        sync();
        body.querySelector("[data-prepaid-address]").focus();
      });
      body.querySelector("[data-prepaid-save-location]").addEventListener("click", () => {
        if (!showLocationSummary()) body.querySelector("[data-prepaid-pin-status]").textContent = "กรอกที่อยู่และปักหมุดหรือวางลิงก์แผนที่ก่อน";
      });
      body.querySelectorAll('[name="prepaid_saved_location"]').forEach((option) => option.addEventListener("change", () => {
        const choice = locations[Number(option.value)];
        if (!choice) return;
        selectedLocation = choice;
        pin = choice.gps_latitude != null && choice.gps_longitude != null
          ? { latitude: Number(choice.gps_latitude), longitude: Number(choice.gps_longitude) } : null;
        body.querySelector("[data-prepaid-address]").value = choice.address_text;
        body.querySelector("[data-prepaid-maps]").value = choice.maps_url;
        body.querySelector("[data-prepaid-pin-status]").textContent = choice.maps_url ? "📍 ปักหมุดแล้ว" : "กรุณาปักหมุดตำแหน่ง";
        purchaseKey = null;
        if (!showLocationSummary()) locationForm.hidden = false;
      }));

      body.querySelectorAll("[data-prepaid-minus],[data-prepaid-plus]").forEach((button) => button.addEventListener("click", () => {
        const index = Number(button.dataset.prepaidMinus ?? button.dataset.prepaidPlus);
        const delta = button.hasAttribute("data-prepaid-plus") ? 1 : -1;
        rows[index].quantity = Math.max(0, Math.min(99, rows[index].quantity + delta));
        body.querySelector(`[data-prepaid-count="${index}"]`).textContent = rows[index].quantity;
        quote = null;
        purchaseKey = null;
        scheduleQuote();
      }));
      body.querySelectorAll("[data-prepaid-name],[data-prepaid-phone],[data-prepaid-address],[data-prepaid-maps],[data-prepaid-note]").forEach((input) => input.addEventListener("input", () => {
        if (input.matches("[data-prepaid-maps]") && pin && input.value !== `https://www.google.com/maps?q=${pin.latitude},${pin.longitude}`) pin = null;
        purchaseKey = null;
        sync();
      }));
      body.querySelector("[data-prepaid-pin]").addEventListener("click", () => {
        const status = body.querySelector("[data-prepaid-pin-status]");
        if (!navigator.geolocation?.getCurrentPosition) { status.textContent = "อุปกรณ์นี้อ่านตำแหน่งไม่ได้ กรุณาวางลิงก์แผนที่"; return; }
        status.textContent = "กำลังอ่านตำแหน่งปัจจุบัน...";
        navigator.geolocation.getCurrentPosition((position) => {
          const latitude = Number(position.coords?.latitude);
          const longitude = Number(position.coords?.longitude);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
            status.textContent = "อ่านตำแหน่งไม่สำเร็จ กรุณาลองอีกครั้ง"; return;
          }
          pin = { latitude, longitude };
          body.querySelector("[data-prepaid-maps]").value = `https://www.google.com/maps?q=${latitude},${longitude}`;
          status.innerHTML = `ปักหมุดสำเร็จ · <a href="${esc(body.querySelector("[data-prepaid-maps]").value)}" target="_blank" rel="noopener">เปิดแผนที่</a>`;
          purchaseKey = null;
          sync();
        }, (error) => {
          status.textContent = Number(error?.code) === 1
            ? "ยังไม่ได้อนุญาตตำแหน่ง กรุณาอนุญาตหรือวางลิงก์แผนที่"
            : "อ่านตำแหน่งไม่สำเร็จ กรุณาลองอีกครั้งหรือวางลิงก์แผนที่";
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
      });
      body.querySelector("[data-prepaid-buy]").addEventListener("click", createAndPay);

      async function refreshQuote() {
        const groups = selectedGroups(rows);
        const seq = ++quoteSeq;
        if (!groups.length) { quote = null; body.querySelector("[data-prepaid-total]").textContent = "เลือกจำนวนเครื่อง"; sync(); return; }
        try {
          const data = await request("/public/prepaid-orders/quote", { method: "POST", body: { catalog_item_id: Number(actual.item_id), service_package_groups: groups } });
          if (seq !== quoteSeq) return;
          quote = requireQuote(data);
          body.querySelector("[data-prepaid-total]").textContent = baht(quote.fixed_total_price);
          body.querySelector("[data-prepaid-terms]").textContent = `ราคานี้ยืนยันจากระบบแล้ว · รับประกัน ${quote.warranty_days} วัน`;
          body.querySelector("[data-prepaid-error]").textContent = "";
          sync();
        } catch (error) {
          if (seq !== quoteSeq) return;
          quote = null;
          body.querySelector("[data-prepaid-total]").textContent = "ยังยืนยันราคาไม่ได้";
          sync();
          const box = body.querySelector("[data-prepaid-error]");
          if (box) box.innerHTML = `<div class="cwf-prepaid-error">${esc(quoteErrorMessage(error))}</div>`;
        }
      }

      function scheduleQuote() {
        clearTimeout(quoteTimer);
        quoteSeq += 1;
        const total = body.querySelector("[data-prepaid-total]");
        if (total) total.textContent = "กำลังตรวจสอบราคาจากระบบ...";
        sync();
        quoteTimer = setTimeout(refreshQuote, 180);
      }

      async function createAndPay() {
        const button = body.querySelector("[data-prepaid-buy]");
        const errorBox = body.querySelector("[data-prepaid-error]");
        const fields = currentContact();
        if (!quote || !fields.customer_name || !fields.customer_phone || !fields.address_text || !fields.maps_url) {
          if (errorBox) errorBox.innerHTML = `<div class="cwf-prepaid-error">กรอกชื่อ เบอร์โทร ที่อยู่ และตำแหน่งให้ครบ</div>`;
          return;
        }
        busy = true;
        sync();
        button.textContent = "กำลังจองสิทธิ์...";
        try {
          purchaseKey ||= root.utils?.randomKey?.() || `prepaid_${cryptoRandomKey()}`;
          const created = await request("/public/prepaid-orders", { method: "POST", body: {
            catalog_item_id: Number(actual.item_id),
            service_package_groups: selectedGroups(rows),
            ...fields,
            purchase_request_key: purchaseKey,
          } });
          try {
            await request("/public/register", { method: "POST", body: {
              phone: fields.customer_phone, address: fields.address_text, maps_url: fields.maps_url,
            } });
            root.state.updateCustomerProfile?.({ phone: fields.customer_phone, address: fields.address_text, maps_url: fields.maps_url });
          } catch (profileError) {
            // The order is committed and remains the authoritative location snapshot.
            // Never retry order creation merely because the optional profile write failed.
            console.warn("PREPAID_PROFILE_SAVE_FAILED", profileError.code || profileError.message);
          }
          renderReservation(created.order, actual.item_name, selectedGroups(rows));
        } catch (error) {
          console.warn("PREPAID_PURCHASE_FAILED", error.code || error.message);
          busy = false;
          sync();
          button.textContent = quote ? `ยืนยันซื้อสิทธิ์ ${baht(quote.fixed_total_price)}` : "ตรวจราคาอีกครั้ง";
          if (errorBox) errorBox.innerHTML = `<div class="cwf-prepaid-error">สร้างรายการไม่สำเร็จ กรุณาลองอีกครั้ง หรือติดต่อ LINE @cwfair</div>`;
        }
      }
      sync();
      await refreshQuote();
    } catch (error) {
      console.warn("PREPAID_OPEN_FAILED", error.code || error.message);
      body.innerHTML = `<div class="cwf-prepaid-error">โปรโมชั่นนี้ยังไม่พร้อมใช้งาน กรุณาลองอีกครั้ง หรือติดต่อ LINE @cwfair</div>`;
    }
  }

  function cryptoRandomKey() {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function copyOrderCode(code) {
    const value = String(code || "").trim();
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(value); return true; } catch (_) {}
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (_) {}
    field.remove();
    return copied;
  }

  function askCancelOrder(button, orderCode, reload) {
    const card = button.closest(".cwf-prepaid-card");
    if (!card || card.querySelector("[data-prepaid-cancel-confirmation]")) return;
    const prompt = document.createElement("div");
    prompt.className = "cwf-prepaid-summary";
    prompt.setAttribute("data-prepaid-cancel-confirmation", "");
    prompt.innerHTML = `<b>ยกเลิกออเดอร์นี้?</b><p class="cwf-prepaid-muted">ทำได้เฉพาะรายการที่ยังไม่ชำระเงิน ประวัติการยกเลิกจะยังอยู่</p><button class="cwf-prepaid-secondary" type="button" data-cancel-back>กลับ</button><button class="cwf-prepaid-secondary" type="button" data-cancel-confirm>ยืนยันยกเลิกออเดอร์</button><div role="alert" data-cancel-error></div>`;
    button.insertAdjacentElement("afterend", prompt);
    prompt.querySelector("[data-cancel-back]").addEventListener("click", () => prompt.remove());
    prompt.querySelector("[data-cancel-confirm]").addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        await request(`/public/prepaid-orders/${encodeURIComponent(orderCode)}/cancel`, { method: "POST", body: {} });
        await reload();
      } catch (error) {
        prompt.querySelector("[data-cancel-error]").textContent = error.status === 409
          ? "ยกเลิกอัตโนมัติไม่ได้ อาจมีการชำระเงินหรือสิทธิ์แล้ว กรุณาติดต่อ LINE @cwfair"
          : "ยกเลิกไม่สำเร็จ กรุณาลองใหม่";
        event.currentTarget.disabled = false;
      }
    });
  }

  function renderReservation(order, itemName, groups = []) {
    const body = modal?.querySelector("[data-prepaid-body]");
    if (!body) return;
    const snapshot = parseSnapshot(order.service_entitlement_snapshot) || {};
    const selected = snapshot.service_package_groups || groups;
    const location = order.prepaid_maps_url;
    body.innerHTML = `<div class="cwf-prepaid-success"><b>จองสิทธิ์เรียบร้อย — รอชำระเงิน</b><br>ยังไม่มีการตัดเงินหรือยืนยันชำระในขั้นตอนนี้</div>
      <div class="cwf-prepaid-card"><div class="cwf-prepaid-muted">เลขคำสั่งซื้อ</div><div class="cwf-prepaid-confirm-code">${esc(order.order_code)}</div><hr><b>${esc(itemName || snapshot.bundle_key || "สิทธิ์บริการ COLDWINDFLOW")}</b>
      <div class="cwf-prepaid-muted">${selected.map((group) => `${groupLabel(group, snapshot)} ×${Number(group.quantity)}`).map(esc).join("<br>")}</div><div class="cwf-prepaid-total">${baht(order.subtotal)}</div>
      <p><b>รอตรวจสอบการชำระเงิน</b></p><div class="cwf-prepaid-muted">${esc(order.customer_name)} · ${esc(order.customer_phone)}<br>${esc(order.address || "")}</div>
      ${location ? `<a href="${esc(location)}" target="_blank" rel="noopener">เปิดตำแหน่งบนแผนที่</a>` : ""}
      <p class="cwf-prepaid-muted">ติดต่อ LINE @cwfair เพื่อชำระเงิน แอดมินจะตรวจสอบยอดและเปิดสิทธิ์ให้ จากนั้นจึงเลือกวันเข้าบริการได้</p>
      <button class="cwf-prepaid-secondary" type="button" data-prepaid-copy>คัดลอกเลขคำสั่งซื้อ</button>
      <button class="cwf-prepaid-primary" type="button" data-prepaid-line>ติดต่อ LINE เพื่อชำระเงิน</button>
      <button class="cwf-prepaid-secondary" type="button" data-prepaid-cancel-order>ยกเลิกออเดอร์</button>
      <div class="cwf-prepaid-muted" role="status" data-prepaid-copy-status></div>
      <a href="${esc(LINE_URL)}" target="_blank" rel="noopener" data-prepaid-line-fallback>เปิด LINE @cwfair โดยตรง</a>
      <button class="cwf-prepaid-secondary" data-prepaid-rights>ดูบริการของฉัน</button></div>`;
    const status = body.querySelector("[data-prepaid-copy-status]");
    const lineMessage = `COLDWINDFLOW AIR CARE\nเลขคำสั่งซื้อ ${order.order_code}\nยอด ${baht(order.subtotal)}\nขอแจ้งชำระเงินสำหรับคำสั่งซื้อนี้ครับ/ค่ะ`;
    body.querySelector("[data-prepaid-copy]").addEventListener("click", async () => {
      status.textContent = await copyOrderCode(order.order_code)
        ? "คัดลอกเลขคำสั่งซื้อแล้ว" : "คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกเลขคำสั่งซื้อที่แสดงด้านบน";
    });
    body.querySelector("[data-prepaid-line]").addEventListener("click", async () => {
      const lineTab = window.open("", "_blank");
      const copied = await copyOrderCode(lineMessage);
      status.textContent = copied ? "คัดลอกข้อความแล้ว หากข้อความไม่ขึ้นอัตโนมัติ แตะค้างแล้ววางในช่องแชต LINE"
        : "คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกเลขคำสั่งซื้อและยอดที่แสดง แล้ววางในแชต LINE";
      if (lineTab) { lineTab.opener = null; lineTab.location.href = LINE_URL; }
      else window.open(LINE_URL, "_blank", "noopener");
    });
    body.querySelector("[data-prepaid-rights]")?.addEventListener("click", () => { closeModal(); root.utils.routeTo("tracking"); });
    body.querySelector("[data-prepaid-cancel-order]")?.addEventListener("click", (event) =>
      askCancelOrder(event.currentTarget, order.order_code, openRights));
  }

  function parseSnapshot(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function groupLabel(group, snapshot) {
    const saved = (snapshot?.snapshots || []).find((entry) =>
      String(entry?.service_package_snapshot?.package?.key) === String(group.package_key));
    const bounds = saved?.service_package_snapshot?.service_lines?.[0]?.service_constraints;
    const min = Number(bounds?.btu_min || 0);
    const max = Number(bounds?.btu_max || 0);
    if (!min && max) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
    if (min && !max) return `${min.toLocaleString("th-TH")} BTU ขึ้นไป`;
    return `${Number(group.btu).toLocaleString("th-TH")} BTU`;
  }

  async function openRights() {
    if (!requireLogin()) return;
    const body = openModal("รายการจองและสิทธิ์ของฉัน", `<div class="cwf-prepaid-card">กำลังโหลดรายการ...</div>`);
    try {
      const [ordersData, rightsData] = await Promise.all([
        request("/public/prepaid-orders"),
        request("/public/service-rights"),
      ]);
      const orders = Array.isArray(ordersData.items) ? ordersData.items : [];
      const rights = Array.isArray(rightsData.items) ? rightsData.items : [];
      const rightsByCode = new Map(rights.map((right) => [String(right.entitlement_code || ""), right]));
      const cards = orders.map((order) => {
        const right = rightsByCode.get(String(order.prepaid_entitlement_code || ""));
        if (right) {
          const snapshot = parseSnapshot(right.service_snapshot) || {};
          const title = snapshot.bundle_key || "สิทธิ์บริการ COLDWINDFLOW";
          const statusClass = right.status === "active" || right.status === "redeeming" ? "active" : right.status === "redeemed" ? "redeemed" : "";
          const statusLabel = right.status === "active" ? "ชำระแล้ว · รอเลือกวัน" : right.status === "redeeming" ? "กำลังเลือกวัน" : right.status === "redeemed" ? "จองวันแล้ว/ใช้สิทธิ์แล้ว" : right.status === "expired" ? "หมดอายุ" : right.status;
          return `<div class="cwf-prepaid-card"><div class="cwf-prepaid-row"><b>${esc(title)}</b><span class="cwf-prepaid-status ${statusClass}">${esc(statusLabel)}</span></div><div class="cwf-prepaid-muted">รายการ ${esc(order.order_code)} · ${esc(right.entitlement_code)} · มูลค่า ${baht(right.purchased_amount)}</div><div class="cwf-prepaid-muted">ใช้สิทธิ์ได้ถึง ${new Date(right.redeem_until).toLocaleDateString("th-TH")}</div>${right.booking_code ? `<div style="margin-top:6px">งาน: <b>${esc(right.booking_code)}</b></div>` : ""}${["active","redeeming"].includes(right.status) ? `<button class="cwf-prepaid-primary" data-use-right="${esc(right.entitlement_code)}">เลือกวันใช้สิทธิ์</button>` : ""}</div>`;
        }
        const pending = order.status === "pending_payment" || order.status === "payment_failed";
        const snapshot = parseSnapshot(order.service_entitlement_snapshot) || {};
        const groups = Array.isArray(snapshot.service_package_groups) ? snapshot.service_package_groups : [];
        return `<div class="cwf-prepaid-card"><div class="cwf-prepaid-row"><b>${esc(snapshot.bundle_key || "จองสิทธิ์ COLDWINDFLOW")}</b><span class="cwf-prepaid-status">${pending ? "รอตรวจสอบการชำระเงิน" : order.status === "cancelled" ? "ยกเลิกแล้ว" : esc(order.status)}</span></div><div class="cwf-prepaid-muted">รายการ ${esc(order.order_code)} · ${baht(order.subtotal)}</div><div class="cwf-prepaid-muted">${groups.map((g) => `${esc(g.btu)} BTU ×${esc(g.quantity)}`).join(" · ")}</div><div class="cwf-prepaid-muted">${esc(order.address || "")} · ${new Date(order.created_at).toLocaleString("th-TH")}</div>${pending ? `<button class="cwf-prepaid-secondary" data-copy-order="${esc(order.order_code)}">คัดลอกเลขคำสั่งซื้อ</button><a class="cwf-prepaid-primary" style="display:block;text-align:center;box-sizing:border-box;text-decoration:none" href="${esc(LINE_URL)}" target="_blank" rel="noopener">ติดต่อ LINE @cwfair</a><button class="cwf-prepaid-secondary" type="button" data-cancel-order="${esc(order.order_code)}">ยกเลิกออเดอร์</button>` : ""}</div>`;
      });
      rights.filter((right) => !orders.some((order) => String(order.prepaid_entitlement_code || "") === String(right.entitlement_code || ""))).forEach((right) => {
        cards.push(`<div class="cwf-prepaid-card"><b>สิทธิ์บริการ COLDWINDFLOW</b><div class="cwf-prepaid-muted">${esc(right.entitlement_code)} · ${baht(right.purchased_amount)}</div></div>`);
      });
      body.innerHTML = cards.length ? cards.join("") : `<div class="cwf-prepaid-card">ยังไม่มีรายการจองโปรโมชั่นในบัญชีนี้</div>`;
      body.querySelectorAll("[data-copy-order]").forEach((button) => button.addEventListener("click", async () => {
        button.textContent = await copyOrderCode(button.dataset.copyOrder) ? "คัดลอกเลขคำสั่งซื้อแล้ว" : "กรุณาคัดลอกเลขคำสั่งซื้อด้านบน";
      }));
      body.querySelectorAll("[data-use-right]").forEach((button) => button.addEventListener("click", () => useRight(button.dataset.useRight)));
      body.querySelectorAll("[data-cancel-order]").forEach((button) => button.addEventListener("click", () =>
        askCancelOrder(button, button.dataset.cancelOrder, openRights)));
    } catch (error) {
      console.warn("PREPAID_RIGHTS_LOAD_FAILED", error.code || error.message);
      body.innerHTML = `<div class="cwf-prepaid-error">โหลดรายการไม่สำเร็จ กรุณาลองใหม่</div>`;
    }
  }

  async function useRight(entitlementCode) {
    const body = modal?.querySelector("[data-prepaid-body]") || openModal("กำลังเตรียมใช้สิทธิ์", "");
    body.innerHTML = `<div class="cwf-prepaid-card">กำลังล็อกสิทธิ์และเปิดปฏิทินคิว...</div>`;
    try {
      const data = await request(`/public/service-rights/${encodeURIComponent(entitlementCode)}/begin-redemption`, { method: "POST", body: {} });
      const r = data.redemption;
      const preview = {
        package_name: "สิทธิ์ PREPAID",
        groups: r.service_package_groups,
        fixed_total_price: r.fixed_total_price,
        duration_min: r.duration_min,
        redeem_until: r.redeem_until,
        payload: { services: r.services },
        server_verified: true,
        prepaid: true,
      };
      root.state.updateDraft("scheduled", {
        catalog_item_id: Number(r.catalog_item_id),
        service_package_key: "",
        service_package_tier_key: "",
        service_package_btu: "",
        service_package_groups: r.service_package_groups,
        service_package_bundle_preview: preview,
        services: r.services,
        prepaid_redemption_token: r.prepaid_redemption_token,
        scheduled_request_key: r.scheduled_request_key,
        selectedSlot: null,
        date: "",
      });
      root.state.setScheduledPreview("package", { status: "success", data: preview, error: "", verified: true });
      root.state.setScheduledPreview("pricing", { status: "success", data: { duration_min: r.duration_min, fixed_total_price: r.fixed_total_price }, error: "", verified: true });
      root.state.setScheduledWizard({ step: 1, error: "" });
      closeModal();
      root.utils.routeTo("scheduled");
    } catch (error) {
      console.warn("PREPAID_REDEMPTION_FAILED", error.code || error.message);
      body.innerHTML = `<div class="cwf-prepaid-error">ใช้สิทธิ์ไม่ได้ กรุณาลองใหม่ หรือติดต่อ LINE @cwfair</div>`;
    }
  }

  // bookingScheduled intentionally builds a strict allowlisted payload. Inject the
  // one-time redemption capability here at the last API boundary so ordinary
  // bookings remain byte-for-byte unchanged.
  function installScheduledSubmitBridge() {
    if (!root.api?.submitScheduledBooking || root.api.submitScheduledBooking.__prepaidWrapped) return;
    const original = root.api.submitScheduledBooking.bind(root.api);
    const wrapped = (payload) => {
      const token = String(root.state.draft?.scheduled?.prepaid_redemption_token || "").trim();
      return original(token ? { ...(payload || {}), prepaid_redemption_token: token } : payload);
    };
    wrapped.__prepaidWrapped = true;
    root.api.submitScheduledBooking = wrapped;
  }

  async function interceptStoreClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest("[data-store-book],[data-store-detail-book],[data-store-urgent],[data-store-detail-urgent]")
      : null;
    if (!button || button.disabled) return;
    if (button.dataset.prepaidBypass === "1") { delete button.dataset.prepaidBypass; return; }
    const itemId = currentItemId(button);
    if (!itemId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const originalLabel = button.textContent;
    button.textContent = "กำลังเปิดโปรโมชั่น...";
    button.disabled = true;
    try {
      const policy = await policyFor(itemId);
      if (!policy.prepaid) {
        button.disabled = false;
        button.textContent = originalLabel;
        delegateOriginal(button);
        return;
      }
      if (!policy.prepaid_ready) {
        openModal("โปรโมชั่นยังไม่พร้อมรับชำระ", `<div class="cwf-prepaid-error">ระบบสิทธิ์ PREPAID ยังไม่พร้อม จึงยังไม่รับเงินเพื่อป้องกันสิทธิ์สูญหาย</div>`);
        return;
      }
      await openPurchase(itemId);
    } catch (error) {
      console.warn("PREPAID_POLICY_FAILED", error.code || error.message);
      openModal("ไม่สามารถเปิดโปรโมชั่นได้", `<div class="cwf-prepaid-error">กรุณาลองใหม่อีกครั้ง หรือติดต่อ LINE @cwfair</div>`);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function renderServiceHub(container) {
    ensureStyles();
    const screen = container?.querySelector(".screen");
    if (!screen) return;
    const hero = screen.querySelector(".tracking-hero");
    const mount = document.createElement("section");
    mount.className = "cwf-prepaid-hub card";
    mount.setAttribute("aria-label", "บริการของฉัน");
    hero?.insertAdjacentElement("afterend", mount);
    if (!root.state.customer?.logged_in) {
      mount.innerHTML = `<h2>บริการของฉัน</h2><p class="cwf-prepaid-muted">เข้าสู่ระบบเพื่อดูคำสั่งซื้อ สิทธิ์ และงานที่จองไว้</p><button type="button" class="cwf-prepaid-primary" data-route="profile">เข้าสู่ระบบ</button>`;
      return;
    }
    mount.innerHTML = `<h2>บริการของฉัน</h2><p class="cwf-prepaid-muted">ข้อมูลล่าสุดจากบัญชี CWF</p><div class="cwf-prepaid-card">กำลังโหลดรายการ...</div>`;

    async function loadHub() {
      const results = await Promise.allSettled([
        request("/public/prepaid-orders"), request("/public/service-rights"),
        root.api?.loadCustomerHistory?.() || Promise.resolve({ items: [] }),
      ]);
      if (!mount.isConnected) return;
      if (results[0].status !== "fulfilled" || results[1].status !== "fulfilled") {
        mount.innerHTML = `<h2>บริการของฉัน</h2><div class="cwf-prepaid-error">โหลดรายการไม่สำเร็จ กรุณาลองใหม่</div><button type="button" class="cwf-prepaid-secondary" data-hub-retry>ลองใหม่</button>`;
        mount.querySelector("[data-hub-retry]")?.addEventListener("click", loadHub);
        return;
      }
      const orders = Array.isArray(results[0].value?.items) ? results[0].value.items : [];
      const rights = Array.isArray(results[1].value?.items) ? results[1].value.items : [];
      const jobs = results[2].status === "fulfilled" && Array.isArray(results[2].value?.items) ? results[2].value.items : [];
      const pending = orders.filter((order) => ["pending_payment", "payment_failed"].includes(order.status));
      const cancelled = orders.filter((order) => order.status === "cancelled");
      const active = rights.filter((right) => ["active", "redeeming"].includes(right.status) && !right.booking_code);
      const scheduledRights = rights.filter((right) => !!right.booking_code && !right.finished_at && !right.canceled_at);
      const historyRights = rights.filter((right) => !!right.booking_code && (right.finished_at || right.canceled_at));
      const booked = new Set(rights.filter((right) => right.booking_code).map((right) => String(right.booking_code)));
      const scheduledJobs = jobs.filter((job) => !booked.has(String(job.booking_code)) && job.appointment_datetime && new Date(job.appointment_datetime).getTime() >= Date.now());
      const history = jobs.filter((job) => !booked.has(String(job.booking_code)) && !scheduledJobs.includes(job));
      const tabs = [
        ["pending", `รอชำระเงิน ${pending.length}`], ["active", `สิทธิ์พร้อมใช้ ${active.length}`],
        ["scheduled", `นัดหมาย/งานบริการ ${scheduledRights.length + scheduledJobs.length}`], ["history", `ประวัติ ${cancelled.length + historyRights.length + history.length}`],
      ];
      const rightByCode = new Map(rights.map((right) => [String(right.entitlement_code), right]));
      const orderByRight = new Map(orders.map((order) => [String(order.prepaid_entitlement_code), order]));
      const orderCard = (order) => {
        const right = rightByCode.get(String(order.prepaid_entitlement_code || ""));
        const snap = parseSnapshot(order.service_entitlement_snapshot) || {};
        const items = parseSnapshot(order.items);
        const title = Array.isArray(items) && items[0]?.item_name ? items[0].item_name : String(snap.bundle_key || "โปรโมชั่น COLDWINDFLOW").replace(/-/g, " ");
        const groups = Array.isArray(snap.service_package_groups) ? snap.service_package_groups : [];
        const wasCancelled = order.status === "cancelled";
        return `<article class="cwf-prepaid-card"><div class="cwf-prepaid-row"><b>${esc(title)}</b><span class="cwf-prepaid-status">${wasCancelled ? "ยกเลิกแล้ว" : right ? "ชำระแล้ว" : "รอตรวจสอบการชำระ"}</span></div><p>เลขคำสั่งซื้อ <b>${esc(order.order_code)}</b> · ${baht(order.subtotal)}</p><p class="cwf-prepaid-muted">${groups.map((group) => `${groupLabel(group, snap)} × ${Number(group.quantity)}`).map(esc).join(" · ")}</p><p class="cwf-prepaid-muted">${esc(order.address || "")}</p>${wasCancelled ? `<p class="cwf-prepaid-muted">เก็บประวัติการยกเลิกไว้ตรวจสอบ</p>` : `<button class="cwf-prepaid-secondary" type="button" data-copy-order="${esc(order.order_code)}">คัดลอกเลขคำสั่งซื้อ</button><button class="cwf-prepaid-primary" type="button" data-hub-line="${esc(order.order_code)}">ติดต่อ LINE เพื่อชำระเงิน</button><a href="${esc(LINE_URL)}" target="_blank" rel="noopener">เปิด LINE @cwfair โดยตรง</a><button class="cwf-prepaid-secondary" type="button" data-cancel-order="${esc(order.order_code)}">ยกเลิกออเดอร์</button>`}</article>`;
      };
      const rightCard = (right) => {
        const order = orderByRight.get(String(right.entitlement_code));
        return `<article class="cwf-prepaid-card"><b>สิทธิ์ ${esc(right.entitlement_code)}</b><p>ชำระแล้ว${order ? ` · เลขคำสั่งซื้อ ${esc(order.order_code)}` : ""}</p><p>${baht(right.purchased_amount)} · ใช้ได้ถึง ${esc(new Date(right.redeem_until).toLocaleDateString("th-TH"))}</p>${right.booking_code ? `<p>งาน ${esc(right.booking_code)} · ${esc(right.job_status || "")}</p><button class="cwf-prepaid-secondary" type="button" data-hub-track="${esc(right.booking_code)}">ติดตามงาน</button>` : `<button class="cwf-prepaid-primary" type="button" data-use-right="${esc(right.entitlement_code)}">เลือกวันใช้สิทธิ์</button>`}</article>`;
      };
      const jobCard = (job) => `<article class="cwf-prepaid-card"><b>${esc(job.booking_code || "งานบริการ")}</b><p>${esc(job.service_summary || "บริการ CWF")} · ${esc(job.job_status || "")}</p><p class="cwf-prepaid-muted">${esc(job.appointment_datetime || "")}</p><button class="cwf-prepaid-secondary" type="button" data-hub-track="${esc(job.booking_code)}">ติดตามงาน</button></article>`;
      const pages = {
        pending: pending.map(orderCard).join(""), active: active.map(rightCard).join(""),
        scheduled: scheduledRights.map(rightCard).join("") + scheduledJobs.map(jobCard).join(""),
        history: cancelled.map(orderCard).join("") + historyRights.map(rightCard).join("") + history.map(jobCard).join(""),
      };
      let selected = "pending";
      mount.innerHTML = `<div class="cwf-prepaid-row"><h2>บริการของฉัน</h2><button class="cwf-prepaid-secondary" type="button" data-hub-refresh>รีเฟรช</button></div><div class="cwf-prepaid-hub-tabs" role="tablist">${tabs.map(([key, label]) => `<button type="button" role="tab" data-hub-tab="${key}" aria-selected="${key === selected}">${esc(label)}</button>`).join("")}</div><div data-hub-content></div>`;
      const content = mount.querySelector("[data-hub-content]");
      const paint = () => { content.innerHTML = pages[selected] || `<div class="cwf-prepaid-card">ยังไม่มีรายการในหมวดนี้</div>`; };
      paint();
      mount.onclick = async (event) => {
        const tab = event.target.closest("[data-hub-tab]");
        if (tab) {
          selected = tab.dataset.hubTab;
          mount.querySelectorAll("[data-hub-tab]").forEach((button) => button.setAttribute("aria-selected", String(button === tab)));
          paint();
          return;
        }
        if (event.target.closest("[data-hub-refresh]")) { loadHub(); return; }
        const copy = event.target.closest("[data-copy-order]");
        if (copy) { copy.textContent = await copyOrderCode(copy.dataset.copyOrder) ? "คัดลอกแล้ว" : "กรุณาคัดลอกรหัสด้านบน"; return; }
        const cancel = event.target.closest("[data-cancel-order]");
        if (cancel) { askCancelOrder(cancel, cancel.dataset.cancelOrder, loadHub); return; }
        const line = event.target.closest("[data-hub-line]");
        if (line) {
          const order = orders.find((item) => item.order_code === line.dataset.hubLine);
          if (!order) return;
          const message = `COLDWINDFLOW AIR CARE\nเลขคำสั่งซื้อ ${order.order_code}\nยอด ${baht(order.subtotal)}\nขอแจ้งชำระเงินสำหรับคำสั่งซื้อนี้ครับ/ค่ะ`;
          const lineTab = window.open("", "_blank");
          const copied = await copyOrderCode(message);
          line.textContent = copied ? "คัดลอกข้อความแล้ว · วางในแชต LINE" : "คัดลอกไม่ได้ · กรุณาคัดลอกเลขคำสั่งซื้อ";
          if (lineTab) { lineTab.opener = null; lineTab.location.href = LINE_URL; }
          return;
        }
        const use = event.target.closest("[data-use-right]");
        if (use) { useRight(use.dataset.useRight); return; }
        const track = event.target.closest("[data-hub-track]");
        if (track) {
          const input = container.querySelector("#tracking-code");
          if (input) { input.value = track.dataset.hubTrack; input.dispatchEvent(new Event("input", { bubbles: true })); }
          container.querySelector('[data-action="track-read"]')?.click();
        }
      };
    }
    loadHub();
  }

  function init() {
    ensureStyles();
    installScheduledSubmitBridge();
    document.addEventListener("click", interceptStoreClick, true);
    document.querySelector("[data-cwf-rights-pill]")?.remove();
  }

  root.prepaid = { openRights, useRight, renderServiceHub, _test: { selectedGroups, packageRows, currentItemId, requireQuote, quoteErrorMessage, locationChoices, validMapUrl } };
  init();
})();
