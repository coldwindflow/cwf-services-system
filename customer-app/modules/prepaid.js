(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const LINE_URL = "https://lin.ee/";
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
      .cwf-prepaid-grid{display:grid;gap:9px}.cwf-prepaid-service{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:10px;align-items:center;border-top:1px solid #e2e8f0;padding:10px 0}.cwf-prepaid-service:first-child{border-top:0}
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
    modal.innerHTML = `<section class="cwf-prepaid-sheet" role="dialog" aria-modal="true"><div class="cwf-prepaid-head"><div><div class="cwf-prepaid-muted">CWF PREPAID</div><h2>${esc(title)}</h2></div><button type="button" class="cwf-prepaid-close" data-prepaid-close aria-label="ปิด">×</button></div><div data-prepaid-body>${body || ""}</div></section>`;
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
    };
  }

  function requireLogin() {
    if (root.state.customer?.logged_in) return true;
    const body = openModal("เข้าสู่ระบบเพื่อเก็บสิทธิ์", `<div class="cwf-prepaid-card"><b>โปร PREPAID ต้องผูกสิทธิ์กับบัญชีลูกค้า</b><p class="cwf-prepaid-muted">เข้าสู่ระบบด้วย LINE หรือ Google ก่อนชำระ เพื่อให้สิทธิ์ไม่สูญหายและป้องกันผู้อื่นนำไปใช้</p><button class="cwf-prepaid-primary" data-prepaid-login>เข้าสู่ระบบ</button></div>`);
    body.querySelector("[data-prepaid-login]")?.addEventListener("click", () => { closeModal(); root.utils.routeTo("profile"); });
    return false;
  }

  function packageRows(item) {
    const variants = Array.isArray(item.service_package_variants) ? item.service_package_variants : [];
    const btuOptions = Array.isArray(root.services?.bookableBtuOptions) ? root.services.bookableBtuOptions : [];
    const rows = [];
    variants.forEach((variant) => {
      const min = Number(variant.btu_min || 0);
      const max = Number(variant.btu_max || Number.MAX_SAFE_INTEGER);
      btuOptions.filter((option) => Number(option.btu) >= min && Number(option.btu) <= max).forEach((option) => {
        rows.push({
          package_key: String(variant.package_key),
          label: `${variant.display_name || variant.service_name || item.item_name} · ${Number(option.btu).toLocaleString("th-TH")} BTU`,
          btu: Number(option.btu),
          quantity: 0,
        });
      });
    });
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

      function render() {
        body.innerHTML = `
          <div class="cwf-prepaid-card"><b>${esc(actual.item_name || "โปรโมชั่น CWF")}</b><div class="cwf-prepaid-muted">เลือกจำนวนเครื่องตาม BTU ระบบคำนวณราคาจาก Server จริง</div><div class="cwf-prepaid-grid" data-prepaid-rows>${rows.map((row, index) => `<label class="cwf-prepaid-service"><span>${esc(row.label)}</span><input class="cwf-prepaid-qty" type="number" min="0" max="99" step="1" value="${row.quantity}" data-prepaid-qty="${index}" aria-label="จำนวนเครื่อง ${esc(row.label)}"></label>`).join("")}</div></div>
          <div class="cwf-prepaid-card"><div class="cwf-prepaid-muted">ราคาที่ต้องชำระ</div><div class="cwf-prepaid-total" data-prepaid-total>${quote ? baht(quote.fixed_total_price) : "กำลังคำนวณ..."}</div><div class="cwf-prepaid-muted" data-prepaid-terms>${quote ? `ใช้สิทธิ์ได้ถึง ${new Date(quote.redeem_until).toLocaleDateString("th-TH")} · รับประกัน ${quote.warranty_days} วันหลังปิดงาน` : ""}</div></div>
          <div class="cwf-prepaid-card"><label>ชื่อผู้ใช้สิทธิ์<input class="cwf-prepaid-input" data-prepaid-name value="${esc(contact.name)}" maxlength="120"></label><label style="display:block;margin-top:10px">เบอร์โทร<input class="cwf-prepaid-input" data-prepaid-phone value="${esc(contact.phone)}" maxlength="40" inputmode="tel"></label><button class="cwf-prepaid-primary" data-prepaid-buy ${quote ? "" : "disabled"}>ชำระเงินและเก็บสิทธิ์</button><div data-prepaid-error></div></div>`;
        body.querySelectorAll("[data-prepaid-qty]").forEach((input) => input.addEventListener("input", () => {
          const index = Number(input.dataset.prepaidQty);
          rows[index].quantity = Math.max(0, Math.min(99, Math.floor(Number(input.value || 0))));
          quote = null;
          scheduleQuote();
        }));
        body.querySelector("[data-prepaid-buy]")?.addEventListener("click", createAndPay);
      }

      async function refreshQuote() {
        const groups = selectedGroups(rows);
        const seq = ++quoteSeq;
        if (!groups.length) { quote = null; render(); return; }
        try {
          const data = await request("/public/prepaid-orders/quote", { method: "POST", body: { catalog_item_id: Number(actual.item_id), service_package_groups: groups } });
          if (seq !== quoteSeq) return;
          quote = data.quote;
          render();
        } catch (error) {
          if (seq !== quoteSeq) return;
          quote = null;
          render();
          const box = body.querySelector("[data-prepaid-error]");
          if (box) box.innerHTML = `<div class="cwf-prepaid-error">${esc(error.code === "SERVICE_PACKAGE_MINIMUM_QUANTITY_NOT_MET" ? "จำนวนเครื่องยังไม่ถึงขั้นต่ำของโปรโมชั่น" : "ชุดบริการนี้ใช้โปรโมชั่นไม่ได้ กรุณาตรวจจำนวน/BTU")}</div>`;
        }
      }

      function scheduleQuote() {
        clearTimeout(quoteTimer);
        const total = body.querySelector("[data-prepaid-total]");
        if (total) total.textContent = "กำลังคำนวณ...";
        quoteTimer = setTimeout(refreshQuote, 180);
      }

      async function createAndPay() {
        const button = body.querySelector("[data-prepaid-buy]");
        const errorBox = body.querySelector("[data-prepaid-error]");
        const name = String(body.querySelector("[data-prepaid-name]")?.value || "").trim();
        const phone = String(body.querySelector("[data-prepaid-phone]")?.value || "").trim();
        if (!quote || !name || !phone) {
          if (errorBox) errorBox.innerHTML = `<div class="cwf-prepaid-error">กรอกชื่อ เบอร์โทร และเลือกจำนวนเครื่องให้ครบ</div>`;
          return;
        }
        button.disabled = true;
        button.textContent = "กำลังสร้างสิทธิ์...";
        try {
          const purchaseKey = root.utils?.randomKey?.() || `prepaid_${cryptoRandomKey()}`;
          const created = await request("/public/prepaid-orders", { method: "POST", body: {
            catalog_item_id: Number(actual.item_id),
            service_package_groups: selectedGroups(rows),
            customer_name: name,
            customer_phone: phone,
            purchase_request_key: purchaseKey,
          } });
          renderPayment(created.order, created.entitlement_code, actual.item_name);
        } catch (error) {
          button.disabled = false;
          button.textContent = "ชำระเงินและเก็บสิทธิ์";
          if (errorBox) errorBox.innerHTML = `<div class="cwf-prepaid-error">สร้างรายการไม่สำเร็จ (${esc(error.code || error.message)})</div>`;
        }
      }

      render();
      await refreshQuote();
    } catch (error) {
      body.innerHTML = `<div class="cwf-prepaid-error">โปรโมชั่นนี้ยังไม่พร้อมใช้งาน (${esc(error.code || error.message)})</div>`;
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

  async function renderPayment(order, entitlementCode, itemName) {
    const body = modal?.querySelector("[data-prepaid-body]");
    if (!body) return;
    let config;
    try { config = await root.api.getPaymentConfig(); } catch (_) { config = { enabled: false, methods: [] }; }
    const methods = Array.isArray(config.methods) ? config.methods : [];
    body.innerHTML = `<div class="cwf-prepaid-card"><b>${esc(itemName || "สิทธิ์บริการ CWF")}</b><div class="cwf-prepaid-muted">เลขรายการ ${esc(order.order_code)}</div><div class="cwf-prepaid-total">${baht(order.subtotal)}</div></div><div data-prepaid-payment></div>`;
    const mount = body.querySelector("[data-prepaid-payment]");
    if (!config.enabled || !methods.length) {
      mount.innerHTML = `<div class="cwf-prepaid-card"><b>รายการถูกสร้างแล้ว แต่ระบบชำระออนไลน์ยังไม่พร้อม</b><p class="cwf-prepaid-muted">แจ้งเลขรายการ ${esc(order.order_code)} ให้แอดมินตรวจยอดและยืนยันการชำระ สิทธิ์จะ ACTIVE หลังตรวจสอบเงินเท่านั้น</p><button class="cwf-prepaid-secondary" data-prepaid-rights>ดูสิทธิ์ของฉัน</button></div>`;
      mount.querySelector("[data-prepaid-rights]")?.addEventListener("click", openRights);
      return;
    }
    mount.innerHTML = `<div class="cwf-prepaid-card"><b>เลือกวิธีชำระ</b>${methods.includes("promptpay") ? `<button class="cwf-prepaid-primary" data-pay-prompt>PromptPay QR</button>` : ""}${methods.includes("card") ? `<button class="cwf-prepaid-secondary" data-pay-card>บัตรเครดิต/เดบิต</button>` : ""}<div data-pay-area></div></div>`;
    mount.querySelector("[data-pay-prompt]")?.addEventListener("click", () => payPromptPay(order.order_code, entitlementCode));
    mount.querySelector("[data-pay-card]")?.addEventListener("click", () => cardForm(order.order_code, entitlementCode, config.public_key));
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
    const body = openModal("สิทธิ์บริการของฉัน", `<div class="cwf-prepaid-card">กำลังโหลดสิทธิ์...</div>`);
    try {
      const data = await request("/public/service-rights");
      const items = Array.isArray(data.items) ? data.items : [];
      body.innerHTML = items.length ? items.map((right) => {
        const snapshot = parseSnapshot(right.service_snapshot) || {};
        const title = snapshot.bundle_key || "สิทธิ์บริการ CWF";
        const statusClass = right.status === "active" || right.status === "redeeming" ? "active" : right.status === "redeemed" ? "redeemed" : "";
        const statusLabel = right.status === "active" ? "พร้อมใช้" : right.status === "redeeming" ? "กำลังเลือกวัน" : right.status === "redeemed" ? "ใช้สิทธิ์แล้ว" : right.status === "expired" ? "หมดอายุ" : right.status;
        return `<div class="cwf-prepaid-card"><div class="cwf-prepaid-row"><b>${esc(title)}</b><span class="cwf-prepaid-status ${statusClass}">${esc(statusLabel)}</span></div><div class="cwf-prepaid-muted">${esc(right.entitlement_code)} · มูลค่า ${baht(right.purchased_amount)}</div><div class="cwf-prepaid-muted">ใช้สิทธิ์ได้ถึง ${new Date(right.redeem_until).toLocaleDateString("th-TH")}</div>${right.booking_code ? `<div style="margin-top:6px">งาน: <b>${esc(right.booking_code)}</b></div>` : ""}${right.warranty_until ? `<div class="cwf-prepaid-muted">รับประกันถึง ${new Date(right.warranty_until).toLocaleDateString("th-TH")}</div>` : ""}${["active","redeeming"].includes(right.status) ? `<button class="cwf-prepaid-primary" data-use-right="${esc(right.entitlement_code)}">เลือกวันใช้สิทธิ์</button>` : ""}</div>`;
      }).join("") : `<div class="cwf-prepaid-card">ยังไม่มีสิทธิ์บริการในบัญชีนี้</div>`;
      body.querySelectorAll("[data-use-right]").forEach((button) => button.addEventListener("click", () => useRight(button.dataset.useRight)));
    } catch (error) {
      body.innerHTML = `<div class="cwf-prepaid-error">โหลดสิทธิ์ไม่สำเร็จ (${esc(error.code || error.message)})</div>`;
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
      body.innerHTML = `<div class="cwf-prepaid-error">ใช้สิทธิ์ไม่ได้ (${esc(error.code || error.message)})</div>`;
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
      openModal("ไม่สามารถเปิดโปรโมชั่นได้", `<div class="cwf-prepaid-error">กรุณาลองใหม่อีกครั้ง (${esc(error.code || error.message)})</div>`);
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
    const observer = new MutationObserver(updateRightsPill);
    observer.observe(document.body, { childList: true, subtree: false });
    window.addEventListener("hashchange", updateRightsPill);
  }

  root.prepaid = { openRights, useRight, _test: { selectedGroups, packageRows, currentItemId } };
  init();
})();
