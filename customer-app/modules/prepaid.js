(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const LINE_URL = "https://line.me/R/ti/p/@cwfair";
  let modal = null;
  let omiseJsPromise = null;
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
      .cwf-rights-pill{position:fixed;right:14px;bottom:92px;z-index:85;border:0;border-radius:999px;padding:11px 15px;background:#071b38;color:#fff;font-weight:800;box-shadow:0 10px 26px rgba(2,6,23,.24)}
      .cwf-prepaid-backdrop{position:fixed;inset:0;z-index:220;background:rgba(2,6,23,.62);display:flex;align-items:flex-end;justify-content:center;padding:0}
      .cwf-prepaid-sheet{width:min(680px,100%);max-height:92vh;overflow:auto;background:#f8fafc;border-radius:24px 24px 0 0;padding:18px;box-shadow:0 -18px 50px rgba(2,6,23,.22)}
      .cwf-prepaid-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.cwf-prepaid-head h2{margin:0;font-size:21px}.cwf-prepaid-close{border:0;background:#e2e8f0;border-radius:999px;width:38px;height:38px;font-size:20px}
      .cwf-prepaid-card{background:#fff;border:1px solid rgba(15,23,42,.12);border-radius:16px;padding:14px;margin-top:12px}.cwf-prepaid-muted{color:#64748b;font-size:13px}.cwf-prepaid-row{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
      .cwf-prepaid-grid{display:grid;gap:9px}.cwf-prepaid-service{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-top:1px solid #e2e8f0;padding:10px 0}.cwf-prepaid-service:first-child{border-top:0}
      .cwf-prepaid-stepper{display:flex;align-items:center;gap:7px}.cwf-prepaid-stepper button{width:36px;height:36px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc;font-size:22px;color:#0f172a}.cwf-prepaid-stepper output{min-width:26px;text-align:center;font-weight:800}.cwf-prepaid-field{display:block;margin-top:11px;font-weight:700}.cwf-prepaid-field .cwf-prepaid-input{margin-top:5px;font-weight:400}.cwf-prepaid-pin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}.cwf-prepaid-pin button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:10px;padding:9px 12px;font-weight:700}.cwf-prepaid-confirm-code{font-size:25px;font-weight:900;letter-spacing:.03em;overflow-wrap:anywhere}
      .cwf-prepaid-qty{width:88px;padding:9px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;text-align:center}.cwf-prepaid-input{width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:11px;font-size:16px;background:#fff}
      .cwf-prepaid-primary,.cwf-prepaid-secondary{width:100%;border:0;border-radius:12px;padding:12px 14px;font-weight:800;font-size:15px;margin-top:10px}.cwf-prepaid-primary{background:#0b5ed7;color:#fff}.cwf-prepaid-secondary{background:#e2e8f0;color:#0f172a}.cwf-prepaid-primary:disabled{opacity:.55}.cwf-prepaid-error{padding:10px;border-radius:12px;background:#fef2f2;color:#991b1b;margin-top:10px}.cwf-prepaid-success{padding:10px;border-radius:12px;background:#ecfdf5;color:#166534;margin-top:10px}
      .cwf-prepaid-total{font-size:24px;font-weight:900}.cwf-prepaid-qr{width:min(260px,80vw);display:block;margin:12px auto;border-radius:12px}.cwf-prepaid-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;background:#e2e8f0}.cwf-prepaid-status.active{background:#dcfce7;color:#166534}.cwf-prepaid-status.redeemed{background:#dbeafe;color:#1d4ed8}
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
    const raw = button.getAttribute("data-store-book") || button.getAttribute("data-store-urgent");
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

  function customerContact() {
    const customer = root.state.customer || {};
    const profile = customer.profile || {};
    const user = customer.user || {};
    return {
      name: String(user.name || customer.display_name || profile.display_name || "").trim(),
      phone: String(profile.phone || customer.phone || user.phone || "").trim(),
      address: String(profile.address || "").trim(),
      maps_url: String(profile.maps_url || "").trim(),
    };
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
      const contact = customerContact();
      let quote = null;
      let quoteTimer = null;
      let pin = null;
      let purchaseKey = null;
      let busy = false;

      body.innerHTML = `
        <div class="cwf-prepaid-card"><b>${esc(actual.item_name || "โปรโมชั่น COLDWINDFLOW")}</b><p class="cwf-prepaid-muted">1. เลือกจำนวนเครื่อง</p><div class="cwf-prepaid-grid">${rows.map((row, index) => `<div class="cwf-prepaid-service"><span>${esc(row.label)}</span><div class="cwf-prepaid-stepper"><button type="button" data-prepaid-minus="${index}" aria-label="ลดจำนวน ${esc(row.label)}">−</button><output data-prepaid-count="${index}">${row.quantity}</output><button type="button" data-prepaid-plus="${index}" aria-label="เพิ่มจำนวน ${esc(row.label)}">+</button></div></div>`).join("")}</div></div>
        <div class="cwf-prepaid-card"><b>2. ราคาที่ระบบยืนยัน</b><div class="cwf-prepaid-muted" data-prepaid-count-total></div><div class="cwf-prepaid-total" data-prepaid-total>กำลังตรวจสอบราคาจากระบบ...</div><div class="cwf-prepaid-muted" data-prepaid-terms></div></div>
        <div class="cwf-prepaid-card"><b>3. ข้อมูลผู้จอง</b><label class="cwf-prepaid-field">ชื่อ *<input class="cwf-prepaid-input" data-prepaid-name value="${esc(contact.name)}" maxlength="120" autocomplete="name"></label><label class="cwf-prepaid-field">เบอร์โทร *<input class="cwf-prepaid-input" data-prepaid-phone value="${esc(contact.phone)}" maxlength="40" inputmode="tel" autocomplete="tel"></label><label class="cwf-prepaid-field">ที่อยู่สำหรับเข้าบริการ *<textarea class="cwf-prepaid-input" data-prepaid-address rows="3" maxlength="1000" placeholder="บ้านเลขที่ อาคาร ห้อง ซอย ถนน และจุดนัดพบ">${esc(contact.address)}</textarea></label><div class="cwf-prepaid-pin"><button type="button" data-prepaid-pin>ปักหมุดตำแหน่ง</button><span class="cwf-prepaid-muted" data-prepaid-pin-status>หรือวางลิงก์แผนที่ด้านล่าง</span></div><label class="cwf-prepaid-field">ลิงก์แผนที่ / จุดบริการ *<input class="cwf-prepaid-input" data-prepaid-maps type="url" value="${esc(contact.maps_url)}" placeholder="https://maps.app.goo.gl/..."></label><label class="cwf-prepaid-field">หมายเหตุเพิ่มเติม<input class="cwf-prepaid-input" data-prepaid-note maxlength="500" placeholder="เช่น จุดจอดรถ หรือติดต่อก่อนถึง"></label></div>
        <div class="cwf-prepaid-card"><b>4. การชำระเงิน</b><p>ยังไม่ตัดเงินในขั้นตอนนี้</p><p class="cwf-prepaid-muted">หลังส่งคำสั่งซื้อ กรุณาติดต่อ LINE @cwfair เพื่อชำระเงิน แอดมินจะตรวจสอบยอดและยืนยันการชำระให้</p><p class="cwf-prepaid-muted">สิทธิ์จะเริ่มใช้งานหลังแอดมินยืนยันรับชำระแล้ว</p><button class="cwf-prepaid-primary" data-prepaid-buy disabled>ซื้อสิทธิ์ราคาพิเศษ</button><div data-prepaid-error></div></div>`;

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
          && fields.address_text && fields.maps_url && /^https:\/\//i.test(fields.maps_url);
        body.querySelector("[data-prepaid-buy]").disabled = !valid || busy;
      }

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
          renderReservation(created.order, actual.item_name, selectedGroups(rows));
        } catch (error) {
          console.warn("PREPAID_PURCHASE_FAILED", error.code || error.message);
          busy = false;
          sync();
          button.textContent = "ซื้อสิทธิ์ราคาพิเศษ";
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

  async function ensureOmiseJs(publicKey) {
    if (window.Omise) { window.Omise.setPublicKey(publicKey); return window.Omise; }
    if (!omiseJsPromise) {
      omiseJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.omise.co/omise.js";
        script.async = true;
        script.onload = () => resolve(window.Omise);
        script.onerror = () => reject(new Error("OMISE_JS_LOAD_FAILED"));
        document.head.appendChild(script);
      });
    }
    const omise = await omiseJsPromise;
    if (!omise) throw new Error("OMISE_JS_LOAD_FAILED");
    omise.setPublicKey(publicKey);
    return omise;
  }

  function omiseCardToken(omise, card) {
    return new Promise((resolve, reject) => {
      omise.createToken("card", card, (statusCode, response) => {
        if (statusCode === 200 && response?.id) resolve(response.id);
        else reject(new Error(response?.message || "CARD_TOKEN_FAILED"));
      });
    });
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

  function renderReservation(order, itemName, groups = []) {
    const body = modal?.querySelector("[data-prepaid-body]");
    if (!body) return;
    const snapshot = parseSnapshot(order.service_entitlement_snapshot) || {};
    const selected = snapshot.service_package_groups || groups;
    const location = order.prepaid_maps_url;
    body.innerHTML = `<div class="cwf-prepaid-success"><b>จองสิทธิ์เรียบร้อย — รอชำระเงิน</b><br>ยังไม่มีการตัดเงินหรือยืนยันชำระในขั้นตอนนี้</div>
      <div class="cwf-prepaid-card"><div class="cwf-prepaid-muted">เลขคำสั่งซื้อ</div><div class="cwf-prepaid-confirm-code">${esc(order.order_code)}</div><hr><b>${esc(itemName || snapshot.bundle_key || "สิทธิ์บริการ COLDWINDFLOW")}</b>
      <div class="cwf-prepaid-muted">${selected.map((group) => `${Number(group.btu).toLocaleString("th-TH")} BTU ×${Number(group.quantity)}`).map(esc).join("<br>")}</div><div class="cwf-prepaid-total">${baht(order.subtotal)}</div>
      <p><b>รอตรวจสอบการชำระเงิน</b></p><div class="cwf-prepaid-muted">${esc(order.customer_name)} · ${esc(order.customer_phone)}<br>${esc(order.address || "")}</div>
      ${location ? `<a href="${esc(location)}" target="_blank" rel="noopener">เปิดตำแหน่งบนแผนที่</a>` : ""}
      <p class="cwf-prepaid-muted">คัดลอกเลขคำสั่งซื้อแล้วส่งให้ LINE @cwfair เพื่อชำระเงิน แอดมินจะตรวจสอบยอดและเปิดสิทธิ์ให้ จากนั้นจึงเลือกวันเข้าบริการได้</p>
      <button class="cwf-prepaid-secondary" type="button" data-prepaid-copy>คัดลอกเลขคำสั่งซื้อ</button>
      <button class="cwf-prepaid-primary" type="button" data-prepaid-line>ส่ง LINE เพื่อชำระเงิน</button>
      <div class="cwf-prepaid-muted" role="status" data-prepaid-copy-status></div>
      <a href="${esc(LINE_URL)}" target="_blank" rel="noopener" data-prepaid-line-fallback>เปิด LINE @cwfair โดยตรง</a>
      <button class="cwf-prepaid-secondary" data-prepaid-rights>ดูรายการของฉัน</button></div>`;
    const status = body.querySelector("[data-prepaid-copy-status]");
    body.querySelector("[data-prepaid-copy]").addEventListener("click", async () => {
      status.textContent = await copyOrderCode(order.order_code)
        ? "คัดลอกเลขคำสั่งซื้อแล้ว" : "คัดลอกอัตโนมัติไม่ได้ กรุณาคัดลอกเลขคำสั่งซื้อที่แสดงด้านบน";
    });
    body.querySelector("[data-prepaid-line]").addEventListener("click", async () => {
      const copied = await copyOrderCode(order.order_code);
      status.textContent = copied ? "คัดลอกเลขคำสั่งซื้อแล้ว กรุณาวางในแชต LINE"
        : "กรุณาคัดลอกเลขคำสั่งซื้อที่แสดงด้านบน แล้ววางในแชต LINE";
      window.open(LINE_URL, "_blank", "noopener");
    });
    body.querySelector("[data-prepaid-rights]")?.addEventListener("click", openRights);
  }

  async function payPromptPay(orderCode, entitlementCode) {
    const area = modal?.querySelector("[data-pay-area]");
    if (!area) return;
    area.innerHTML = `<div class="cwf-prepaid-muted" style="margin-top:10px">กำลังสร้าง QR...</div>`;
    try {
      const result = await root.api.payOrder(orderCode, { method: "promptpay" });
      if (result.order?.status === "paid" || result.payment?.status === "paid") return paymentSuccess(entitlementCode);
      const qr = result.payment?.qr_uri;
      area.innerHTML = `${qr ? `<img class="cwf-prepaid-qr" src="${esc(qr)}" alt="PromptPay QR">` : ""}<div class="cwf-prepaid-muted">สแกน QR แล้วระบบจะตรวจสอบการชำระอัตโนมัติ</div><div data-pay-poll></div>`;
      pollPaid(orderCode, entitlementCode, area.querySelector("[data-pay-poll]"));
    } catch (error) {
      area.innerHTML = `<div class="cwf-prepaid-error">เริ่มชำระไม่สำเร็จ (${esc(error?.data?.error || error.message)})</div>`;
    }
  }

  async function pollPaid(orderCode, entitlementCode, mount) {
    for (let attempt = 0; attempt < 80 && modal?.isConnected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const data = await root.api.getOrder(orderCode);
        if (data.order?.status === "paid") { paymentSuccess(entitlementCode); return; }
        if (mount) mount.textContent = "กำลังตรวจสอบการชำระเงิน...";
      } catch (_) {}
    }
    if (mount) mount.innerHTML = `<div class="cwf-prepaid-error">ยังไม่พบผลชำระ กรุณาเปิด “สิทธิ์บริการ” เพื่อตรวจสอบอีกครั้ง</div>`;
  }

  function cardForm(orderCode, entitlementCode, publicKey) {
    const area = modal?.querySelector("[data-pay-area]");
    if (!area) return;
    area.innerHTML = `<div style="margin-top:12px"><input class="cwf-prepaid-input" data-card-name placeholder="ชื่อบนบัตร"><input class="cwf-prepaid-input" data-card-number inputmode="numeric" autocomplete="cc-number" placeholder="เลขบัตร" style="margin-top:8px"><div class="cwf-prepaid-row" style="margin-top:8px"><input class="cwf-prepaid-input" style="flex:1" data-card-month inputmode="numeric" placeholder="MM"><input class="cwf-prepaid-input" style="flex:1" data-card-year inputmode="numeric" placeholder="YYYY"><input class="cwf-prepaid-input" style="flex:1" data-card-cvv inputmode="numeric" autocomplete="cc-csc" placeholder="CVV"></div><button class="cwf-prepaid-primary" data-card-submit>ชำระด้วยบัตร</button><div data-card-error></div></div>`;
    area.querySelector("[data-card-submit]")?.addEventListener("click", async () => {
      const button = area.querySelector("[data-card-submit]");
      const errorBox = area.querySelector("[data-card-error]");
      button.disabled = true;
      try {
        const omise = await ensureOmiseJs(publicKey);
        const token = await omiseCardToken(omise, {
          name: area.querySelector("[data-card-name]").value.trim(),
          number: area.querySelector("[data-card-number]").value.replace(/\s+/g, ""),
          expiration_month: Number(area.querySelector("[data-card-month]").value),
          expiration_year: Number(area.querySelector("[data-card-year]").value),
          security_code: area.querySelector("[data-card-cvv]").value.trim(),
        });
        const result = await root.api.payOrder(orderCode, { method: "card", token });
        if (result.order?.status === "paid" || result.payment?.status === "paid") paymentSuccess(entitlementCode);
        else pollPaid(orderCode, entitlementCode, errorBox);
      } catch (error) {
        errorBox.innerHTML = `<div class="cwf-prepaid-error">ชำระด้วยบัตรไม่สำเร็จ (${esc(error?.data?.error || error.message)})</div>`;
        button.disabled = false;
      }
    });
  }

  function paymentSuccess(entitlementCode) {
    const body = modal?.querySelector("[data-prepaid-body]");
    if (!body) return;
    body.innerHTML = `<div class="cwf-prepaid-success"><b>ชำระสำเร็จ</b><br>สิทธิ์บริการถูกเปิดใช้งานแล้ว</div><div class="cwf-prepaid-card"><div class="cwf-prepaid-muted">รหัสสิทธิ์</div><b>${esc(entitlementCode)}</b><button class="cwf-prepaid-primary" data-use-right="${esc(entitlementCode)}">เลือกวันใช้สิทธิ์</button><button class="cwf-prepaid-secondary" data-prepaid-rights>ดูสิทธิ์ทั้งหมด</button></div>`;
    body.querySelector("[data-use-right]")?.addEventListener("click", () => useRight(entitlementCode));
    body.querySelector("[data-prepaid-rights]")?.addEventListener("click", openRights);
  }

  function parseSnapshot(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch (_) { return null; }
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
        return `<div class="cwf-prepaid-card"><div class="cwf-prepaid-row"><b>${esc(snapshot.bundle_key || "จองสิทธิ์ COLDWINDFLOW")}</b><span class="cwf-prepaid-status">${pending ? "รอตรวจสอบการชำระเงิน" : esc(order.status)}</span></div><div class="cwf-prepaid-muted">รายการ ${esc(order.order_code)} · ${baht(order.subtotal)}</div><div class="cwf-prepaid-muted">${groups.map((g) => `${esc(g.btu)} BTU ×${esc(g.quantity)}`).join(" · ")}</div><div class="cwf-prepaid-muted">${esc(order.address || "")} · ${new Date(order.created_at).toLocaleString("th-TH")}</div>${pending ? `<button class="cwf-prepaid-secondary" data-copy-order="${esc(order.order_code)}">คัดลอกเลขคำสั่งซื้อ</button><a class="cwf-prepaid-primary" style="display:block;text-align:center;box-sizing:border-box;text-decoration:none" href="${esc(LINE_URL)}" target="_blank" rel="noopener">ติดต่อ LINE @cwfair</a>` : ""}</div>`;
      });
      rights.filter((right) => !orders.some((order) => String(order.prepaid_entitlement_code || "") === String(right.entitlement_code || ""))).forEach((right) => {
        cards.push(`<div class="cwf-prepaid-card"><b>สิทธิ์บริการ COLDWINDFLOW</b><div class="cwf-prepaid-muted">${esc(right.entitlement_code)} · ${baht(right.purchased_amount)}</div></div>`);
      });
      body.innerHTML = cards.length ? cards.join("") : `<div class="cwf-prepaid-card">ยังไม่มีรายการจองโปรโมชั่นในบัญชีนี้</div>`;
      body.querySelectorAll("[data-copy-order]").forEach((button) => button.addEventListener("click", async () => {
        button.textContent = await copyOrderCode(button.dataset.copyOrder) ? "คัดลอกเลขคำสั่งซื้อแล้ว" : "กรุณาคัดลอกเลขคำสั่งซื้อด้านบน";
      }));
      body.querySelectorAll("[data-use-right]").forEach((button) => button.addEventListener("click", () => useRight(button.dataset.useRight)));
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
    button.disabled = true;
    try {
      const policy = await policyFor(itemId);
      if (!policy.prepaid) {
        button.disabled = false;
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
    }
  }

  function updateRightsPill() {
    ensureStyles();
    let pill = document.querySelector("[data-cwf-rights-pill]");
    if (!root.state.customer?.logged_in) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = document.createElement("button");
      pill.type = "button";
      pill.className = "cwf-rights-pill";
      pill.dataset.cwfRightsPill = "1";
      pill.textContent = "สิทธิ์บริการ";
      pill.addEventListener("click", openRights);
      document.body.appendChild(pill);
    }
  }

  function init() {
    ensureStyles();
    installScheduledSubmitBridge();
    document.addEventListener("click", interceptStoreClick, true);
    updateRightsPill();
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(updateRightsPill);
      observer.observe(document.body, { childList: true, subtree: false });
    }
    window.addEventListener("hashchange", updateRightsPill);
  }

  root.prepaid = { openRights, useRight, _test: { selectedGroups, packageRows, currentItemId, requireQuote, quoteErrorMessage } };
  init();
})();
