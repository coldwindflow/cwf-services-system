// Admin orders & payment dashboard. Read-only view of customer_orders from the
// real /admin/orders endpoint, with client-side search + status/method filters.
// apiFetch(), el() and the shared admin menu come from admin-v2-common.js.

let allOrders = [];
let ordersSchemaReady = true;
let filterState = { search: "", status: "", method: "" };

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("th-TH") : "0";
}

function fmtDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("th-TH", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// The order's payment/fulfilment status drives the badge. We prefer the order
// status; payment_status is shown as raw detail.
const STATUS_META = {
  paid: { label: "จ่ายแล้ว", cls: "ao-badge-paid" },
  payment_processing: { label: "รอชำระ", cls: "ao-badge-processing" },
  pending_payment: { label: "ยังไม่ชำระ", cls: "ao-badge-pending" },
  payment_failed: { label: "ไม่สำเร็จ", cls: "ao-badge-failed" },
};

function statusMeta(status) {
  return STATUS_META[status] || { label: status || "-", cls: "ao-badge-pending" };
}

const METHOD_LABEL = { promptpay: "พร้อมเพย์", card: "บัตร" };
const DELIVERY_LABEL = { pickup: "รับที่ร้าน", ship: "จัดส่ง" };
const INSTALL_LABEL = { none: "ไม่ติดตั้ง", cwf: "ติดตั้งโดยช่าง CWF" };

function itemsSummary(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((it) => `${esc(it.name || it.item_name || "")} × ${Number(it.qty) || 1}`).join(", ");
}

function orderCardHtml(o) {
  const meta = statusMeta(o.status);
  const method = o.payment_method ? (METHOD_LABEL[o.payment_method] || o.payment_method) : "";
  const paidLine = o.paid_at ? `<span class="ao-muted">ชำระเมื่อ ${esc(fmtDateTime(o.paid_at))}</span>` : "";
  const chargeLine = o.payment_charge_id ? `<span class="ao-muted ao-charge">${esc(o.payment_charge_id)}</span>` : "";
  return `
    <div class="ao-card">
      <div class="ao-card-head">
        <div class="ao-code">${esc(o.order_code)}</div>
        <span class="ao-badge ${meta.cls}">${esc(meta.label)}</span>
      </div>
      <div class="ao-card-amount">฿${fmtMoney(o.subtotal)} ${method ? `<span class="ao-method">· ${esc(method)}</span>` : ""}</div>
      <div class="ao-card-items">${itemsSummary(o.items) || "<span class=\"ao-muted\">ไม่มีรายการสินค้า</span>"}</div>
      <div class="ao-card-row">
        <span>${esc(o.customer_name || "")}</span>
        <a class="ao-phone" href="tel:${esc(o.customer_phone || "")}">${esc(o.customer_phone || "")}</a>
      </div>
      <div class="ao-card-row ao-muted">
        <span>${esc(DELIVERY_LABEL[o.delivery_method] || o.delivery_method || "")} · ${esc(INSTALL_LABEL[o.install_option] || o.install_option || "")}</span>
        <span>${esc(fmtDateTime(o.created_at))}</span>
      </div>
      ${o.address ? `<div class="ao-card-address ao-muted">📍 ${esc(o.address)}</div>` : ""}
      ${(paidLine || chargeLine) ? `<div class="ao-card-row ao-pay-detail">${paidLine}${chargeLine}</div>` : ""}
      ${o.note ? `<div class="ao-card-note">📝 ${esc(o.note)}</div>` : ""}
    </div>`;
}

function applyFilters(orders) {
  const q = filterState.search.trim().toLowerCase();
  return orders.filter((o) => {
    if (filterState.status && o.status !== filterState.status) return false;
    if (filterState.method && o.payment_method !== filterState.method) return false;
    if (q) {
      const hay = `${o.order_code} ${o.customer_name} ${o.customer_phone}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderSummary(orders) {
  const by = (s) => orders.filter((o) => o.status === s).length;
  const revenue = orders.filter((o) => o.status === "paid").reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
  el("orders_summary").querySelector("[data-sum-total]").textContent = String(orders.length);
  el("orders_summary").querySelector("[data-sum-paid]").textContent = String(by("paid"));
  el("orders_summary").querySelector("[data-sum-processing]").textContent = String(by("payment_processing"));
  el("orders_summary").querySelector("[data-sum-failed]").textContent = String(by("payment_failed"));
  el("orders_summary").querySelector("[data-sum-revenue]").textContent = fmtMoney(revenue);
}

function renderList() {
  const box = el("orders_list");
  if (!ordersSchemaReady) {
    box.innerHTML = `<div class="ao-empty">ยังไม่ได้ติดตั้งฐานข้อมูลคำสั่งซื้อ (schema) — ระบบจะอัปเดตอัตโนมัติเมื่อเปิดใช้งานฟีเจอร์ร้านค้า</div>`;
    return;
  }
  const filtered = applyFilters(allOrders);
  if (!allOrders.length) { box.innerHTML = `<div class="ao-empty">ยังไม่มีคำสั่งซื้อ</div>`; return; }
  if (!filtered.length) { box.innerHTML = `<div class="ao-empty">ไม่พบคำสั่งซื้อที่ตรงกับตัวกรอง</div>`; return; }
  box.innerHTML = filtered.map(orderCardHtml).join("");
}

async function loadOrders() {
  const box = el("orders_list");
  box.innerHTML = `<div class="ao-loading">กำลังโหลดคำสั่งซื้อ...</div>`;
  try {
    const data = await apiFetch("/admin/orders");
    allOrders = Array.isArray(data && data.orders) ? data.orders : [];
    ordersSchemaReady = data && data.schema_ready === false ? false : true;
    renderSummary(allOrders);
    renderList();
  } catch (err) {
    box.innerHTML = `<div class="ao-error">โหลดคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  el("btnReloadOrders")?.addEventListener("click", loadOrders);
  el("orders_search")?.addEventListener("input", (e) => { filterState.search = e.target.value || ""; renderList(); });
  el("orders_filter_status")?.addEventListener("change", (e) => { filterState.status = e.target.value || ""; renderList(); });
  el("orders_filter_method")?.addEventListener("change", (e) => { filterState.method = e.target.value || ""; renderList(); });
  loadOrders();
});
