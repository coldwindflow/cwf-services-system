let catalogItems = [];
let editingItemId = null;
let isSaving = false;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtCatalogPrice(item) {
  const price = Number(item.base_price);
  if (!Number.isFinite(price) || price <= 0) return "สอบถามราคา";
  return `ราคาเริ่มต้น ${price.toLocaleString("th-TH")} บาท`;
}

function fmtBtuRange(item) {
  const min = Number(item.btu_min);
  const max = Number(item.btu_max);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (hasMin && hasMax && min !== max) return `${min.toLocaleString("th-TH")}–${max.toLocaleString("th-TH")} BTU`;
  if (hasMin && hasMax) return `${min.toLocaleString("th-TH")} BTU`;
  if (hasMin) return `ตั้งแต่ ${min.toLocaleString("th-TH")} BTU`;
  if (hasMax) return `ไม่เกิน ${max.toLocaleString("th-TH")} BTU`;
  return "";
}

function resetCatalogForm() {
  editingItemId = null;
  el("item_name").value = "";
  el("item_category").value = "";
  el("base_price").value = "";
  el("unit_label").value = "";
  el("job_category").value = "";
  el("ac_type").value = "";
  el("btu_min").value = "";
  el("btu_max").value = "";
  el("is_active").value = "1";
  el("is_customer_visible").value = "0";
  el("catalog_form_title").textContent = "เพิ่มรายการบริการ";
  el("btnSaveItem").textContent = "บันทึกรายการ";
  el("btnCancelEdit").style.display = "none";
  hideCatalogFormError();
  updateCatalogVisibleHint();
}

function hideCatalogFormError() {
  const box = el("catalog_form_error");
  box.style.display = "none";
  box.textContent = "";
}

function showCatalogFormError(message) {
  const box = el("catalog_form_error");
  box.textContent = message;
  box.style.display = "block";
}

function updateCatalogVisibleHint() {
  const active = el("is_active").value === "1";
  const visible = el("is_customer_visible").value === "1";
  el("catalog_visible_hint").style.display = (active && visible) ? "block" : "none";
}

function catalogFormPayload() {
  const trimmedOrEmpty = (id) => (el(id).value || "").trim();
  return {
    item_name: trimmedOrEmpty("item_name"),
    item_category: trimmedOrEmpty("item_category"),
    base_price: trimmedOrEmpty("base_price"),
    unit_label: trimmedOrEmpty("unit_label"),
    job_category: trimmedOrEmpty("job_category"),
    ac_type: trimmedOrEmpty("ac_type"),
    btu_min: trimmedOrEmpty("btu_min"),
    btu_max: trimmedOrEmpty("btu_max"),
    is_active: el("is_active").value === "1",
    is_customer_visible: el("is_customer_visible").value === "1",
  };
}

function validateCatalogFormPayload(payload) {
  if (!payload.item_name) return "กรุณากรอกชื่อรายการ";
  if (payload.base_price !== "" && (!Number.isFinite(Number(payload.base_price)) || Number(payload.base_price) < 0)) {
    return "ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป";
  }
  if (payload.btu_min !== "" && (!Number.isFinite(Number(payload.btu_min)) || Number(payload.btu_min) <= 0)) {
    return "btu_min ต้องเป็นค่าว่างหรือจำนวนบวก";
  }
  if (payload.btu_max !== "" && (!Number.isFinite(Number(payload.btu_max)) || Number(payload.btu_max) <= 0)) {
    return "btu_max ต้องเป็นค่าว่างหรือจำนวนบวก";
  }
  if (payload.btu_min !== "" && payload.btu_max !== "" && Number(payload.btu_min) > Number(payload.btu_max)) {
    return "btu_min ต้องไม่มากกว่า btu_max";
  }
  return "";
}

function editCatalogItem(itemId) {
  const item = catalogItems.find((x) => Number(x.item_id) === Number(itemId));
  if (!item) return;
  editingItemId = Number(itemId);
  el("item_name").value = item.item_name || "";
  el("item_category").value = item.item_category || "";
  el("base_price").value = Number(item.base_price) > 0 ? Number(item.base_price) : "";
  el("unit_label").value = item.unit_label || "";
  el("job_category").value = item.job_category || "";
  el("ac_type").value = item.ac_type || "";
  el("btu_min").value = item.btu_min || "";
  el("btu_max").value = item.btu_max || "";
  el("is_active").value = item.is_active ? "1" : "0";
  el("is_customer_visible").value = item.is_customer_visible ? "1" : "0";
  el("catalog_form_title").textContent = `แก้ไขรายการ #${item.item_id}`;
  el("btnSaveItem").textContent = "บันทึกการแก้ไข";
  el("btnCancelEdit").style.display = "block";
  hideCatalogFormError();
  updateCatalogVisibleHint();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveCatalogItem() {
  if (isSaving) return;
  hideCatalogFormError();

  const payload = catalogFormPayload();
  const validationError = validateCatalogFormPayload(payload);
  if (validationError) {
    showCatalogFormError(validationError);
    return;
  }

  isSaving = true;
  el("btnSaveItem").disabled = true;
  try {
    if (editingItemId) {
      await apiFetch(`/admin/catalog/items/${editingItemId}`, { method: "PATCH", body: JSON.stringify(payload) });
      showToast("บันทึกการแก้ไขแล้ว", "success");
    } else {
      await apiFetch("/admin/catalog/items", { method: "POST", body: JSON.stringify(payload) });
      showToast("เพิ่มรายการแล้ว", "success");
    }
    resetCatalogForm();
    await loadCatalogItems();
  } catch (e) {
    showCatalogFormError(e.message || "บันทึกรายการไม่สำเร็จ");
  } finally {
    isSaving = false;
    el("btnSaveItem").disabled = false;
  }
}

async function toggleCatalogField(itemId, field, nextValue, item) {
  if (field === "is_active" && nextValue === false && item.is_active && item.is_customer_visible) {
    const confirmed = confirm("รายการนี้กำลังแสดงให้ลูกค้าเห็นอยู่ ต้องการปิดใช้งานหรือไม่?");
    if (!confirmed) return;
  }
  try {
    await apiFetch(`/admin/catalog/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ [field]: nextValue }) });
    await loadCatalogItems();
  } catch (e) {
    showToast(e.message || "อัปเดตรายการไม่สำเร็จ", "error");
  }
}

function catalogItemMatchesFilters(item) {
  const search = (el("catalog_search").value || "").trim().toLowerCase();
  const activeFilter = el("catalog_filter_active").value;
  const visibleFilter = el("catalog_filter_visible").value;

  if (search && !String(item.item_name || "").toLowerCase().includes(search)) return false;
  if (activeFilter !== "" && Boolean(item.is_active) !== (activeFilter === "1")) return false;
  if (visibleFilter !== "" && Boolean(item.is_customer_visible) !== (visibleFilter === "1")) return false;
  return true;
}

function catalogItemRow(item) {
  const active = !!item.is_active;
  const visible = !!item.is_customer_visible;
  const btu = fmtBtuRange(item);
  const meta = [item.job_category, item.ac_type, btu].filter(Boolean).join(" • ");
  return `
  <div class="svc-row" style="align-items:flex-start">
    <div class="svc-main" style="flex:1">
      <div class="svc-title"><b>${escapeHtml(item.item_name)}</b> <span class="muted2 mini">#${escapeHtml(item.item_id)}</span></div>
      <div class="muted2 mini">${escapeHtml(item.item_category || "-")} • ${escapeHtml(fmtCatalogPrice(item))}${item.unit_label ? ` / ${escapeHtml(item.unit_label)}` : ""}</div>
      ${meta ? `<div class="muted2 mini">${escapeHtml(meta)}</div>` : ""}
      <div class="muted2 mini">สถานะ: <b>${active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</b> • แสดงลูกค้า: <b>${visible ? "แสดง" : "ไม่แสดง"}</b></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="secondary btn-small" data-act="edit" data-id="${item.item_id}">แก้ไข</button>
      <button class="secondary btn-small" data-act="toggle-active" data-id="${item.item_id}">${active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
      <button class="secondary btn-small" data-act="toggle-visible" data-id="${item.item_id}">${visible ? "ซ่อนจากลูกค้า" : "แสดงให้ลูกค้า"}</button>
    </div>
  </div>`;
}

function renderCatalogList() {
  const box = el("catalog_list");
  const filtered = catalogItems.filter(catalogItemMatchesFilters);
  box.innerHTML = filtered.length
    ? filtered.map(catalogItemRow).join("")
    : `<div class="muted2">ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง</div>`;
}

function renderCatalogPreview() {
  const box = el("catalog_preview");
  const visibleItems = catalogItems.filter((item) => item.is_active && item.is_customer_visible);
  if (!visibleItems.length) {
    box.innerHTML = `<div class="muted2">ยังไม่มีรายการที่จะแสดงในร้านค้าลูกค้าในขณะนี้</div>`;
    return;
  }
  box.innerHTML = visibleItems.map((item) => {
    const btu = fmtBtuRange(item);
    return `
    <div class="svc-row" style="align-items:flex-start">
      <div class="svc-main" style="flex:1">
        <div class="svc-title"><b>${escapeHtml(item.item_name)}</b></div>
        <div class="muted2 mini">${escapeHtml(item.item_category || "-")} • ${escapeHtml(fmtCatalogPrice(item))}${item.unit_label ? ` / ${escapeHtml(item.unit_label)}` : ""}</div>
        ${btu || item.ac_type ? `<div class="muted2 mini">${escapeHtml([item.ac_type, btu].filter(Boolean).join(" • "))}</div>` : ""}
        <div class="muted2 mini">จะแสดงใน Store: <b style="color:#15803d">ใช่</b></div>
      </div>
    </div>`;
  }).join("");
}

async function loadCatalogItems() {
  const box = el("catalog_list");
  box.innerHTML = "กำลังโหลดรายการ...";
  try {
    const items = await apiFetch("/admin/catalog/items");
    catalogItems = Array.isArray(items) ? items : [];
    renderCatalogList();
    renderCatalogPreview();
  } catch (e) {
    box.innerHTML = `<div class="muted2">โหลดรายการไม่สำเร็จ: ${escapeHtml(e.message || "")}</div>`;
  }
}

function bindCatalogListActions() {
  el("catalog_list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const id = Number(button.getAttribute("data-id"));
    const item = catalogItems.find((x) => Number(x.item_id) === id);
    if (!item) return;
    const act = button.getAttribute("data-act");
    if (act === "edit") editCatalogItem(id);
    else if (act === "toggle-active") toggleCatalogField(id, "is_active", !item.is_active, item);
    else if (act === "toggle-visible") toggleCatalogField(id, "is_customer_visible", !item.is_customer_visible, item);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  resetCatalogForm();
  bindCatalogListActions();
  el("btnSaveItem").addEventListener("click", saveCatalogItem);
  el("btnCancelEdit").addEventListener("click", resetCatalogForm);
  el("btnNewItem").addEventListener("click", resetCatalogForm);
  el("btnReloadCatalog").addEventListener("click", loadCatalogItems);
  el("is_active").addEventListener("change", updateCatalogVisibleHint);
  el("is_customer_visible").addEventListener("change", updateCatalogVisibleHint);
  el("catalog_search").addEventListener("input", renderCatalogList);
  el("catalog_filter_active").addEventListener("change", renderCatalogList);
  el("catalog_filter_visible").addEventListener("change", renderCatalogList);
  loadCatalogItems();
});
