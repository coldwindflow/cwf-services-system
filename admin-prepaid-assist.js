(() => {
  "use strict";

  const panel = document.getElementById("promotionAssistPanel");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const clean = (value) => String(value == null ? "" : value).trim();
  const esc = (value) => clean(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
  const money = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const key = () => `adminassist_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, "_")}`;
  const sections = [...document.querySelectorAll(".app > .card.section-card")].slice(2);
  const previousDisplays = new Map();
  let bundles = [];
  let selected = null;
  let quote = null;
  let quoteKey = "";
  let purchaseKey = "";
  let created = null;

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

  function groups() {
    return [...panel.querySelectorAll("[data-promo-variant]")].map((row) => ({
      package_key: row.dataset.promoVariant,
      btu: Number(row.querySelector("[data-promo-btu]")?.value),
      quantity: Number(row.querySelector("[data-promo-qty]")?.value),
    })).filter((group) => Number.isSafeInteger(group.btu) && group.btu > 0
      && Number.isSafeInteger(group.quantity) && group.quantity > 0);
  }

  function selectionKey() {
    return JSON.stringify({ catalog_item_id: Number(selected?.item_id || 0), service_package_groups: groups() });
  }

  function invalidate() {
    quote = null;
    quoteKey = "";
    purchaseKey = "";
    $("promotionAssistCreate").disabled = true;
    $("promotionAssistQuote").textContent = "เลือกจำนวนเครื่อง แล้วตรวจราคาจากระบบ";
  }

  function renderVariants() {
    $("promotionAssistVariants").innerHTML = (selected?.variants || []).filter((variant) => variant.is_active !== false).map((variant) => {
      const min = Number(variant.btu_min || 0);
      const max = Number(variant.btu_max || 0);
      const btu = max > 0 && (!min || max <= 12000) ? max : min > 0 ? min : 12000;
      const range = min && max ? `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} BTU`
        : max ? `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`
          : min ? `${min.toLocaleString("th-TH")} BTU ขึ้นไป` : "ระบุ BTU";
      return `<div data-promo-variant="${esc(variant.package_key)}" style="border:1px solid #dbe4f0;border-radius:12px;padding:10px;margin-top:8px"><b>${esc(variant.display_name)}</b><div class="muted2">${esc(range)}</div><div class="grid2"><label>BTU จริง<input data-promo-btu type="number" min="1" value="${btu}"></label><label>จำนวนเครื่อง<input data-promo-qty type="number" min="0" max="99" value="0"></label></div></div>`;
    }).join("");
    panel.querySelectorAll("[data-promo-variant] input").forEach((input) => input.addEventListener("input", invalidate));
    invalidate();
  }

  async function loadPromotions() {
    const data = await api("/admin/catalog/service-package-bundles");
    const now = Date.now();
    const active = (Array.isArray(data.bundles) ? data.bundles : []).filter((bundle) =>
      bundle.is_active && bundle.variants?.some((variant) => variant.is_active)
      && (!bundle.sell_start_at || new Date(bundle.sell_start_at).getTime() <= now)
      && (!bundle.sell_end_at || new Date(bundle.sell_end_at).getTime() >= now));
    const policies = await Promise.all(active.map((bundle) => api(`/admin/catalog/service-package-bundles/${encodeURIComponent(bundle.service_bundle_key)}/promotion-policy`)
      .then((policy) => ({ bundle, policy })).catch(() => null)));
    bundles = policies.filter((row) => row?.policy?.payment_mode === "prepaid_full").map((row) => row.bundle);
    $("promotionAssistBundle").innerHTML = `<option value="">เลือกโปรโมชั่น</option>${bundles.map((bundle) => `<option value="${esc(bundle.service_bundle_key)}">${esc(bundle.item_name)}</option>`).join("")}`;
  }

  async function quotePrice() {
    if (!selected || !groups().length) throw new Error("กรุณาเลือกโปรโมชั่นและจำนวนเครื่อง");
    $("promotionAssistQuote").textContent = "กำลังตรวจสอบราคาจากระบบ...";
    const current = selectionKey();
    const result = await api("/admin/prepaid-orders/quote", { method: "POST", body: {
      catalog_item_id: Number(selected.item_id), service_package_groups: groups(),
    } });
    if (current !== selectionKey()) return;
    quote = result.quote;
    quoteKey = current;
    $("promotionAssistQuote").textContent = `ราคาที่ระบบยืนยัน ${money(quote.fixed_total_price)} บาท · ${groups().reduce((sum, group) => sum + group.quantity, 0)} เครื่อง · รับประกัน ${quote.warranty_days} วัน`;
    $("promotionAssistCreate").disabled = false;
  }

  function customerFields() {
    return {
      customer_name: clean($("customer_name").value), customer_phone: clean($("customer_phone").value),
      address_text: clean($("address_text").value), maps_url: clean($("maps_url").value),
      gps_latitude: clean($("gps_latitude").value) || null,
      gps_longitude: clean($("gps_longitude").value) || null,
      note: clean($("customer_note").value),
    };
  }

  async function createOrder() {
    const fields = customerFields();
    if (!fields.customer_name || !fields.customer_phone || !fields.address_text) throw new Error("กรอกชื่อ เบอร์โทร และที่อยู่ในข้อมูลลูกค้าด้านบนก่อน");
    if (!quote || quoteKey !== selectionKey()) throw new Error("กรุณาตรวจราคาใหม่ก่อนจอง");
    $("promotionAssistCreate").disabled = true;
    purchaseKey ||= key();
    const result = await api("/admin/prepaid-orders", { method: "POST", body: {
      catalog_item_id: Number(selected.item_id), service_package_groups: groups(),
      ...fields, purchase_request_key: purchaseKey,
    } });
    created = result;
    const code = result.order.order_code;
    const claim = result.claim_token;
    $("promotionAssistResult").innerHTML = `<div style="padding:12px;border-radius:12px;background:#eff6ff"><b>สร้างรายการ ${esc(code)} — รอชำระเงิน</b><br>ยอดที่ระบบยืนยัน ${money(result.order.subtotal)} บาท<br>${claim ? `<span class="muted2">รหัสรับสิทธิ์สำหรับลูกค้า (แสดงครั้งเดียว): ${esc(claim)}</span><br>` : ""}<button type="button" data-promo-confirm>ยืนยันรับชำระแล้ว</button> <a href="/admin-prepaid-v2.html?order=${encodeURIComponent(code)}">เปิดรายละเอียด / ลงงานภายหลัง</a></div>`;
  }

  async function confirmPayment() {
    if (!created?.order) return;
    const order = created.order;
    const reference = clean(window.prompt(`รับเงินจริง ${money(order.subtotal)} บาทสำหรับ ${order.order_code} แล้วหรือไม่? กรอกเลขอ้างอิง`, ""));
    if (!reference || !window.confirm(`ยืนยันรับชำระ ${money(order.subtotal)} บาท`)) return;
    const result = await api(`/admin/prepaid-orders/${encodeURIComponent(order.order_code)}/confirm-payment`, {
      method: "POST", body: { reference, confirmed_amount: Number(order.subtotal) },
    });
    const entitlement = result.entitlement?.entitlement_code;
    $("promotionAssistResult").innerHTML = `<div style="padding:12px;border-radius:12px;background:#ecfdf5"><b>ชำระเงินแล้ว — พร้อมใช้สิทธิ์</b><br>Order ${esc(order.order_code)} · สิทธิ์ ${esc(entitlement || "-")}<br><a href="/admin-prepaid-v2.html?order=${encodeURIComponent(order.order_code)}">ลงงานตอนนี้</a> · <span>ให้ลูกค้าเลือกวันภายหลังได้</span></div>`;
  }

  document.querySelectorAll('input[name="jobFlowMode"]').forEach((radio) => radio.addEventListener("change", () => {
    const promotion = document.querySelector('input[name="jobFlowMode"]:checked')?.value === "promotion";
    panel.style.display = promotion ? "block" : "none";
    sections.forEach((section) => {
      if (promotion) { if (!previousDisplays.has(section)) previousDisplays.set(section, section.style.display); section.style.display = "none"; }
      else if (previousDisplays.has(section)) { section.style.display = previousDisplays.get(section); previousDisplays.delete(section); }
    });
    if (promotion && !bundles.length) loadPromotions().catch((error) => { $("promotionAssistResult").textContent = `โหลดโปรโมชั่นไม่สำเร็จ: ${error.message}`; });
  }));
  $("promotionAssistBundle").addEventListener("change", () => {
    selected = bundles.find((bundle) => bundle.service_bundle_key === $("promotionAssistBundle").value) || null;
    renderVariants();
  });
  $("promotionAssistPrice").addEventListener("click", () => quotePrice().catch((error) => { $("promotionAssistQuote").textContent = `ตรวจราคาไม่สำเร็จ: ${error.message}`; }));
  $("promotionAssistCreate").addEventListener("click", () => createOrder().catch((error) => {
    $("promotionAssistCreate").disabled = false;
    $("promotionAssistResult").textContent = `จองไม่สำเร็จ: ${error.message}`;
  }));
  $("promotionAssistResult").addEventListener("click", (event) => {
    if (event.target.closest("[data-promo-confirm]")) confirmPayment().catch((error) => {
      $("promotionAssistResult").textContent = `ยืนยันชำระไม่สำเร็จ: ${error.message}`;
    });
  });
})();
