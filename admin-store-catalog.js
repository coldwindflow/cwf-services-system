let catalogItems = [];
let editingItemId = null;
let isSaving = false;
let pendingImageFile = null;
let pendingImageRemoved = false;
let moreSheetItemId = null;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString("th-TH") : "0";
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

const PRICING_WARNING_TEXT = "ราคานี้ใช้ร่วมกับระบบจองลูกค้า การแก้ไขจะมีผลกับการประเมินราคาใหม่ แต่ไม่แก้ราคางานเก่าย้อนหลัง";

/* ---------- Modal ---------- */

function ensureCatalogModal() {
  if (el("catalog_modal_backdrop")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="catalog_modal_backdrop" class="cwf-modal-backdrop hidden">
    <div class="cwf-modal">
      <div class="cwf-modal-head">
        <div class="cwf-modal-title" id="catalog_modal_title">เพิ่มบริการ</div>
        <button id="catalog_modal_close" class="cwf-modal-close" type="button">×</button>
      </div>
      <div class="cwf-modal-body">

        <div class="asc-section">
          <div class="asc-section-title">1) ข้อมูลบริการ</div>
          <div class="asc-field"><label>ชื่อรายการ *</label><input id="cm_item_name" placeholder="เช่น ล้างแอร์ผนัง"></div>
          <div class="asc-grid2">
            <div class="asc-field"><label>หมวดหมู่ *</label><input id="cm_item_category" placeholder="เช่น ล้างแอร์"></div>
            <div class="asc-field"><label>หน่วย *</label><input id="cm_unit_label" placeholder="เช่น เครื่อง, งาน"></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>ประเภทงาน *</label><input id="cm_job_category" placeholder="เช่น ล้าง, ซ่อม"></div>
            <div class="asc-field"><label>ประเภทแอร์ *</label><input id="cm_ac_type" placeholder="เช่น ผนัง, แขวน"></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>ลักษณะการล้าง *</label><input id="cm_wash_variant" placeholder="เช่น ล้างน้ำ, ล้างน้ำยา"></div>
            <div></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>BTU ต่ำสุด *</label><input id="cm_btu_min" type="number" step="1" min="1" placeholder="ว่าง = ไม่จำกัด"></div>
            <div class="asc-field"><label>BTU สูงสุด *</label><input id="cm_btu_max" type="number" step="1" min="1" placeholder="ว่าง = ไม่จำกัด"></div>
          </div>
        </div>

        <div class="asc-section">
          <div class="asc-section-title">2) รูปบริการ</div>
          <div class="asc-image-preview-row">
            <img id="cm_image_preview" class="asc-image-preview" src="" alt="" style="display:none;">
            <div id="cm_image_placeholder" class="asc-item-thumb asc-placeholder">ไม่มีรูป</div>
            <div>
              <input id="cm_image_input" type="file" accept="image/jpeg,image/png,image/webp">
              <div class="muted2 mini">JPEG/PNG/WEBP ไม่เกิน 5MB</div>
              <button id="cm_image_delete" class="secondary btn-small" type="button" style="display:none;margin-top:6px;">ลบรูปภาพ</button>
            </div>
          </div>
        </div>

        <div class="asc-section">
          <div class="asc-section-title">3) ราคาและโปรโมชั่น</div>
          <div class="asc-warning">${escapeHtml(PRICING_WARNING_TEXT)}</div>
          <div class="asc-grid2">
            <div class="asc-field"><label>ราคาปกติ (บาท) *</label><input id="cm_normal_price" type="number" step="1" min="0"></div>
            <div class="asc-field"><label>ราคาขายจริง (บาท) *</label><input id="cm_active_price" type="number" step="1" min="0"></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>ป้ายราคา/Label *</label><input id="cm_label" placeholder="เช่น โปรโมชันหน้าฝน"></div>
            <div class="asc-field"><label>ชื่อแคมเปญ *</label><input id="cm_campaign_name" placeholder="เช่น โปรดูแลแอร์รับหน้าฝน"></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>เริ่มโปรโมชัน *</label><input id="cm_effective_from" type="date"></div>
            <div class="asc-field"><label>สิ้นสุดโปรโมชัน *</label><input id="cm_effective_to" type="date"></div>
          </div>
          <div class="asc-grid2">
            <div class="asc-field"><label>ลำดับความสำคัญ *</label><input id="cm_priority" type="number" step="1" min="1"></div>
            <div class="asc-field"><label>สถานะราคานี้ *</label>
              <select id="cm_pricing_is_active">
                <option value="1">ใช้งานราคานี้</option>
                <option value="0">ปิดใช้งานราคานี้</option>
              </select>
            </div>
          </div>
        </div>

        <div class="asc-section">
          <div class="asc-section-title">4) การแสดงผล</div>
          <div class="asc-grid2">
            <div class="asc-field"><label>สถานะการใช้งาน *</label>
              <select id="cm_is_active">
                <option value="1">เปิดใช้งาน</option>
                <option value="0">ปิดใช้งาน</option>
              </select>
            </div>
            <div class="asc-field"><label>แสดงให้ลูกค้าเห็น *</label>
              <select id="cm_is_customer_visible">
                <option value="0">ไม่แสดง</option>
                <option value="1">แสดง</option>
              </select>
            </div>
          </div>
        </div>

        <div class="asc-section">
          <div class="asc-section-title">5) ขั้นสูง</div>
          <div class="asc-field"><label>ราคาฐาน (Base Price) *</label><input id="cm_base_price" type="number" step="1" min="0" placeholder="ใช้เมื่อยังไม่มีราคาโปรโมชัน"></div>
        </div>

        <div id="catalog_modal_error" class="asc-modal-error"></div>
      </div>
      <div class="cwf-modal-foot">
        <button id="catalog_modal_cancel" class="secondary" type="button">ยกเลิก</button>
        <button id="catalog_modal_save" class="primary" type="button">บันทึก</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);

  el("catalog_modal_close").addEventListener("click", closeCatalogModal);
  el("catalog_modal_cancel").addEventListener("click", closeCatalogModal);
  el("catalog_modal_save").addEventListener("click", saveCatalogItem);
  el("cm_image_input").addEventListener("change", onCatalogImagePicked);
  el("cm_image_delete").addEventListener("click", onCatalogImageDeleteClick);
}

function hideCatalogModalError() {
  const box = el("catalog_modal_error");
  box.style.display = "none";
  box.textContent = "";
}

function showCatalogModalError(message) {
  const box = el("catalog_modal_error");
  box.textContent = message;
  box.style.display = "block";
}

function setCatalogImagePreview(url) {
  const img = el("cm_image_preview");
  const placeholder = el("cm_image_placeholder");
  const deleteBtn = el("cm_image_delete");
  if (url) {
    img.src = url;
    img.style.display = "block";
    placeholder.style.display = "none";
    deleteBtn.style.display = "inline-block";
  } else {
    img.style.display = "none";
    img.src = "";
    placeholder.style.display = "flex";
    deleteBtn.style.display = "none";
  }
}

function onCatalogImagePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  pendingImageFile = file;
  pendingImageRemoved = false;
  const localUrl = URL.createObjectURL(file);
  setCatalogImagePreview(localUrl);
}

function onCatalogImageDeleteClick() {
  const confirmed = confirm("ต้องการลบรูปภาพนี้หรือไม่?");
  if (!confirmed) return;
  pendingImageFile = null;
  pendingImageRemoved = true;
  el("cm_image_input").value = "";
  setCatalogImagePreview(null);
}

function resetCatalogModalFields() {
  el("cm_item_name").value = "";
  el("cm_item_category").value = "";
  el("cm_unit_label").value = "";
  el("cm_job_category").value = "";
  el("cm_ac_type").value = "";
  el("cm_wash_variant").value = "";
  el("cm_btu_min").value = "";
  el("cm_btu_max").value = "";
  el("cm_normal_price").value = "";
  el("cm_active_price").value = "";
  el("cm_label").value = "";
  el("cm_campaign_name").value = "";
  el("cm_effective_from").value = "";
  el("cm_effective_to").value = "";
  el("cm_priority").value = "1";
  el("cm_pricing_is_active").value = "1";
  el("cm_is_active").value = "1";
  el("cm_is_customer_visible").value = "0";
  el("cm_base_price").value = "";
  el("cm_image_input").value = "";
  pendingImageFile = null;
  pendingImageRemoved = false;
  setCatalogImagePreview(null);
  hideCatalogModalError();
}

function openCatalogModalForNew() {
  ensureCatalogModal();
  editingItemId = null;
  resetCatalogModalFields();
  el("catalog_modal_title").textContent = "เพิ่มบริการ";
  el("catalog_modal_backdrop").classList.remove("hidden");
}

function toDateInputValue(value) {
  if (!value) return "";
  const str = String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function openCatalogModalForEdit(itemId) {
  const item = catalogItems.find((x) => Number(x.item_id) === Number(itemId));
  if (!item) return;
  ensureCatalogModal();
  editingItemId = Number(itemId);
  resetCatalogModalFields();
  el("catalog_modal_title").textContent = `แก้ไขบริการ #${item.item_id}`;
  el("cm_item_name").value = item.item_name || "";
  el("cm_item_category").value = item.item_category || "";
  el("cm_unit_label").value = item.unit_label || "";
  el("cm_job_category").value = item.job_category || "";
  el("cm_ac_type").value = item.ac_type || "";
  el("cm_wash_variant").value = item.wash_variant || "";
  el("cm_btu_min").value = item.btu_min || "";
  el("cm_btu_max").value = item.btu_max || "";
  el("cm_normal_price").value = item.normal_price != null ? item.normal_price : "";
  el("cm_active_price").value = item.sale_price != null ? item.sale_price : "";
  el("cm_label").value = item.price_label || "";
  el("cm_campaign_name").value = item.campaign_name || "";
  el("cm_priority").value = item.priority != null ? item.priority : "1";
  el("cm_effective_from").value = toDateInputValue(item.effective_from);
  el("cm_effective_to").value = toDateInputValue(item.effective_to);
  el("cm_pricing_is_active").value = item.price_rule_id ? (item.pricing_is_active ? "1" : "0") : "1";
  el("cm_is_active").value = item.is_active ? "1" : "0";
  el("cm_is_customer_visible").value = item.is_customer_visible ? "1" : "0";
  el("cm_base_price").value = Number(item.base_price) > 0 ? Number(item.base_price) : "";
  if (item.image_url) setCatalogImagePreview(item.image_url);
  el("catalog_modal_backdrop").classList.remove("hidden");
}

function closeCatalogModal() {
  const backdrop = el("catalog_modal_backdrop");
  if (backdrop) backdrop.classList.add("hidden");
}

function catalogModalPayload() {
  const trimmedOrEmpty = (id) => (el(id).value || "").trim();
  const hasAnyPricingInput = trimmedOrEmpty("cm_normal_price") !== "" || trimmedOrEmpty("cm_active_price") !== "";
  const payload = {
    item_name: trimmedOrEmpty("cm_item_name"),
    item_category: trimmedOrEmpty("cm_item_category"),
    unit_label: trimmedOrEmpty("cm_unit_label"),
    job_category: trimmedOrEmpty("cm_job_category"),
    ac_type: trimmedOrEmpty("cm_ac_type"),
    btu_min: trimmedOrEmpty("cm_btu_min"),
    btu_max: trimmedOrEmpty("cm_btu_max"),
    base_price: trimmedOrEmpty("cm_base_price"),
    is_active: el("cm_is_active").value === "1",
    is_customer_visible: el("cm_is_customer_visible").value === "1",
  };
  if (hasAnyPricingInput) {
    payload.pricing = {
      normal_price: trimmedOrEmpty("cm_normal_price"),
      active_price: trimmedOrEmpty("cm_active_price"),
      label: trimmedOrEmpty("cm_label"),
      campaign_name: trimmedOrEmpty("cm_campaign_name"),
      effective_from: trimmedOrEmpty("cm_effective_from"),
      effective_to: trimmedOrEmpty("cm_effective_to"),
      wash_variant: trimmedOrEmpty("cm_wash_variant"),
      priority: trimmedOrEmpty("cm_priority"),
      pricing_is_active: el("cm_pricing_is_active").value === "1",
    };
  }
  return payload;
}

function validateCatalogModalPayload(payload) {
  if (!payload.item_name) return "กรุณากรอกชื่อรายการ";
  if (payload.base_price !== "" && (!Number.isFinite(Number(payload.base_price)) || Number(payload.base_price) < 0)) {
    return "ราคาฐานต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป";
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
  if (payload.pricing) {
    if (payload.pricing.normal_price === "" || !Number.isFinite(Number(payload.pricing.normal_price)) || Number(payload.pricing.normal_price) < 0) {
      return "ราคาปกติต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป";
    }
    if (payload.pricing.active_price === "" || !Number.isFinite(Number(payload.pricing.active_price)) || Number(payload.pricing.active_price) < 0) {
      return "ราคาขายจริงต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป";
    }
  }
  return "";
}

async function saveCatalogItem() {
  if (isSaving) return;
  hideCatalogModalError();

  const payload = catalogModalPayload();
  const validationError = validateCatalogModalPayload(payload);
  if (validationError) {
    showCatalogModalError(validationError);
    return;
  }

  isSaving = true;
  el("catalog_modal_save").disabled = true;
  try {
    let savedItem;
    if (editingItemId) {
      savedItem = await apiFetch(`/admin/catalog/items/${editingItemId}`, { method: "PATCH", body: JSON.stringify(payload) });
    } else {
      savedItem = await apiFetch("/admin/catalog/items", { method: "POST", body: JSON.stringify(payload) });
    }
    const itemId = savedItem.item_id;
    let imageWarning = "";

    if (pendingImageRemoved && !pendingImageFile) {
      try {
        await apiFetch(`/admin/catalog/items/${itemId}/image`, { method: "DELETE" });
      } catch (imgErr) {
        imageWarning = `บันทึกข้อมูลบริการสำเร็จ แต่ลบรูปภาพไม่สำเร็จ: ${imgErr.message || ""}`;
      }
    } else if (pendingImageFile) {
      try {
        const formData = new FormData();
        formData.append("image", pendingImageFile);
        await apiFetch(`/admin/catalog/items/${itemId}/image`, { method: "POST", body: formData });
      } catch (imgErr) {
        imageWarning = `บันทึกข้อมูลบริการสำเร็จ แต่อัปโหลดรูปภาพไม่สำเร็จ: ${imgErr.message || ""}`;
      }
    }

    closeCatalogModal();
    await loadCatalogItems();
    if (imageWarning) showToast(imageWarning, "error");
    else showToast(editingItemId ? "บันทึกการแก้ไขแล้ว" : "เพิ่มบริการแล้ว", "success");
  } catch (e) {
    showCatalogModalError(e.message || "บันทึกรายการไม่สำเร็จ");
  } finally {
    isSaving = false;
    el("catalog_modal_save").disabled = false;
  }
}

/* ---------- "เพิ่มเติม" action sheet ---------- */

function ensureMoreSheet() {
  if (el("asc_more_sheet_backdrop")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="asc_more_sheet_backdrop" class="asc-more-sheet-backdrop hidden">
    <div class="asc-more-sheet">
      <button class="secondary" data-act="toggle-active" type="button">เปิด/ปิดใช้งาน</button>
      <button class="secondary" data-act="toggle-visible" type="button">แสดง/ซ่อนจากลูกค้า</button>
      <button class="secondary" data-act="close" type="button">ปิด</button>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  el("asc_more_sheet_backdrop").addEventListener("click", (event) => {
    if (event.target.id === "asc_more_sheet_backdrop") closeMoreSheet();
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const act = button.getAttribute("data-act");
    const item = catalogItems.find((x) => Number(x.item_id) === Number(moreSheetItemId));
    if (act === "close" || !item) { closeMoreSheet(); return; }
    if (act === "toggle-active") toggleCatalogField(item.item_id, "is_active", !item.is_active, item);
    if (act === "toggle-visible") toggleCatalogField(item.item_id, "is_customer_visible", !item.is_customer_visible, item);
    closeMoreSheet();
  });
}

function openMoreSheet(itemId) {
  ensureMoreSheet();
  moreSheetItemId = itemId;
  el("asc_more_sheet_backdrop").classList.remove("hidden");
}

function closeMoreSheet() {
  const backdrop = el("asc_more_sheet_backdrop");
  if (backdrop) backdrop.classList.add("hidden");
}

/* ---------- List / cards ---------- */

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

function catalogItemCard(item) {
  const active = !!item.is_active;
  const visible = !!item.is_customer_visible;
  const btu = fmtBtuRange(item);
  const meta = [item.item_category, item.job_category, item.ac_type, btu].filter(Boolean).join(" • ");
  const hasPromo = !!item.has_promo;
  const salePrice = item.display_price != null ? item.display_price : item.base_price;
  const showAsk = !(Number(salePrice) > 0);

  const thumb = item.image_url
    ? `<img class="asc-item-thumb" src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.item_name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;asc-item-thumb asc-placeholder&quot;>ไม่มีรูป</div>';">`
    : `<div class="asc-item-thumb asc-placeholder">ไม่มีรูป</div>`;

  const priceRow = showAsk
    ? `<div class="asc-item-price-row"><span class="asc-price-sale">สอบถามราคา</span></div>`
    : `<div class="asc-item-price-row">
        <span class="asc-price-sale">${fmtMoney(salePrice)} บาท</span>
        ${hasPromo ? `<span class="asc-price-normal">${fmtMoney(item.normal_price)} บาท</span>` : ""}
      </div>`;

  return `
  <div class="asc-item-card" data-id="${item.item_id}">
    ${thumb}
    <div class="asc-item-main">
      <div class="asc-item-title">${escapeHtml(item.item_name)}</div>
      <div class="asc-item-meta">${escapeHtml(meta || "-")}</div>
      ${priceRow}
      <div class="asc-badges">
        <span class="asc-badge ${active ? "asc-badge-active" : "asc-badge-inactive"}">${active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
        ${visible ? `<span class="asc-badge asc-badge-visible">แสดงลูกค้า</span>` : ""}
        ${hasPromo ? `<span class="asc-badge asc-badge-promo">${escapeHtml(item.campaign_name || "โปรโมชัน")}</span>` : ""}
      </div>
    </div>
    <div class="asc-item-actions">
      <button class="secondary btn-small" data-act="edit" data-id="${item.item_id}">แก้ไข</button>
      <button class="secondary btn-small" data-act="more" data-id="${item.item_id}">เพิ่มเติม</button>
    </div>
  </div>`;
}

function renderCatalogList() {
  const box = el("catalog_list");
  const filtered = catalogItems.filter(catalogItemMatchesFilters);
  if (!catalogItems.length) {
    box.innerHTML = `<div class="asc-empty">ยังไม่มีบริการ กด "+ เพิ่มบริการ" เพื่อเริ่มต้น</div>`;
    return;
  }
  box.innerHTML = filtered.length
    ? filtered.map(catalogItemCard).join("")
    : `<div class="asc-empty">ไม่พบรายการที่ตรงกับการค้นหา/ตัวกรอง</div>`;
}

function renderCatalogPreview() {
  const box = el("catalog_preview");
  const visibleItems = catalogItems.filter((item) => item.is_active && item.is_customer_visible);
  if (!visibleItems.length) {
    box.innerHTML = `<div class="muted2">ยังไม่มีรายการที่จะแสดงในร้านค้าลูกค้าในขณะนี้</div>`;
    return;
  }
  box.innerHTML = visibleItems.map(catalogItemCard).join("");
}

async function loadCatalogItems() {
  const box = el("catalog_list");
  box.innerHTML = `<div class="asc-loading">กำลังโหลดรายการ...</div>`;
  try {
    const items = await apiFetch("/admin/catalog/items");
    catalogItems = Array.isArray(items) ? items : [];
    renderCatalogList();
    renderCatalogPreview();
  } catch (e) {
    box.innerHTML = `<div class="asc-error">โหลดรายการไม่สำเร็จ: ${escapeHtml(e.message || "")}</div>`;
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
    if (act === "edit") openCatalogModalForEdit(id);
    else if (act === "more") openMoreSheet(id);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindCatalogListActions();
  el("btnNewItem").addEventListener("click", openCatalogModalForNew);
  el("btnReloadCatalog").addEventListener("click", loadCatalogItems);
  el("catalog_search").addEventListener("input", renderCatalogList);
  el("catalog_filter_active").addEventListener("change", renderCatalogList);
  el("catalog_filter_visible").addEventListener("change", renderCatalogList);
  loadCatalogItems();
});
