let catalogItems = [];
let editingItemId = null;
let isSaving = false;
let pendingImageFile = null;
let pendingImageRemoved = false;
let moreSheetItemId = null;
let galleryImages = [];
let galleryLoading = false;
let galleryUploading = false;
let deleteModalItemId = null;
const BOOKING_MODES = ["bookable", "contact_admin"];
// Must mirror the backend's MAX_CATALOG_IMAGES_PER_ITEM (server/routes/catalog/items.js)
const MAX_GALLERY_IMAGES = 4;

// Must mirror the Customer App's canonical lists exactly
// (customer-app/modules/services.js: acTypes/btuOptions/washVariants) and the
// backend's validateMarketplaceFields() allow-lists (server/routes/catalog/items.js)
// — a bookable item can never carry a value the booking flow can't handle.
const BOOKING_AC_TYPES = ["ผนัง", "สี่ทิศทาง", "แขวน", "เปลือยใต้ฝ้า"];
const BOOKING_BTU_OPTIONS = [9000, 12000, 18000, 24000, 30000];
const BOOKING_WASH_VARIANTS = ["ล้างธรรมดา", "ล้างพรีเมียม", "ล้างแขวนคอยล์", "ล้างแบบตัดล้าง"];
const BOOKING_WALL_AC_TYPE = "ผนัง";

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
          <div class="asc-field"><label>เลื่อนรูปภาพอัตโนมัติ (Autoplay) *</label>
            <select id="cm_is_autoplay_enabled">
              <option value="1">เลื่อนอัตโนมัติ</option>
              <option value="0">ไม่เลื่อนอัตโนมัติ</option>
            </select>
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

        <div class="asc-section">
          <div class="asc-section-title">6) ข้อมูลตลาด (Marketplace)</div>
          <div class="asc-field"><label>การจอง *</label>
            <select id="cm_booking_mode">
              <option value="contact_admin">ติดต่อแอดมิน (ไม่จองออนไลน์)</option>
              <option value="bookable">จองออนไลน์ได้</option>
            </select>
          </div>
          <div id="cm_booking_fields" style="display:none;">
            <div class="asc-grid2">
              <div class="asc-field"><label>Service Key (ข้อมูลอ้างอิง ไม่ใช่เงื่อนไขการจอง)</label><input id="cm_booking_service_key" placeholder="เช่น wash_wall"></div>
              <div class="asc-field"><label>ประเภทแอร์สำหรับจอง *</label>
                <select id="cm_booking_ac_type">
                  <option value="">— เลือกประเภทแอร์ —</option>
                  ${BOOKING_AC_TYPES.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="asc-grid2">
              <div class="asc-field"><label>BTU สำหรับจอง *</label>
                <select id="cm_booking_btu">
                  <option value="">— เลือก BTU —</option>
                  ${BOOKING_BTU_OPTIONS.map((v) => `<option value="${v}">${v.toLocaleString("th-TH")}</option>`).join("")}
                </select>
              </div>
              <div class="asc-field" id="cm_booking_wash_variant_field"><label>รูปแบบการล้างสำหรับจอง * (สำหรับแอร์ผนัง)</label>
                <select id="cm_booking_wash_variant">
                  <option value="">— เลือกรูปแบบการล้าง —</option>
                  ${BOOKING_WASH_VARIANTS.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
                </select>
              </div>
            </div>
          </div>
          <div class="asc-field"><label>รายการแนะนำ (Featured) *</label>
            <select id="cm_is_featured">
              <option value="0">ไม่แนะนำ</option>
              <option value="1">แนะนำ</option>
            </select>
          </div>
          <div class="asc-field"><label>คำอธิบายสั้น</label><textarea id="cm_short_description" rows="2" maxlength="300" placeholder="แสดงบนการ์ดร้านค้า"></textarea></div>
          <div class="asc-field"><label>คำอธิบายแบบเต็ม</label><textarea id="cm_long_description" rows="4" placeholder="แสดงในหน้ารายละเอียดสินค้า"></textarea></div>
          <div class="asc-field"><label>จุดเด่น (1 บรรทัดต่อ 1 รายการ)</label><textarea id="cm_highlights" rows="3" placeholder="เช่น&#10;ฟรีน้ำยา&#10;รับประกัน 30 วัน"></textarea></div>
          <div class="asc-field"><label>เงื่อนไขการให้บริการ</label><textarea id="cm_service_conditions" rows="3"></textarea></div>
        </div>

        <div class="asc-section" id="cm_gallery_section">
          <div class="asc-section-title">7) รูปภาพหลายรูป (แกลเลอรี)</div>
          <div id="cm_gallery_body"></div>
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
  el("cm_booking_mode").addEventListener("change", updateBookingFieldsVisibility);
  el("cm_booking_ac_type").addEventListener("change", updateBookingFieldsVisibility);
  bindGalleryActions();
}

function updateBookingFieldsVisibility() {
  const bookable = el("cm_booking_mode").value === "bookable";
  el("cm_booking_fields").style.display = bookable ? "block" : "none";
  const isWallAc = el("cm_booking_ac_type").value === BOOKING_WALL_AC_TYPE;
  el("cm_booking_wash_variant_field").style.display = isWallAc ? "block" : "none";
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
  el("cm_is_autoplay_enabled").value = "1";
  pendingImageFile = null;
  pendingImageRemoved = false;
  setCatalogImagePreview(null);
  el("cm_booking_mode").value = "contact_admin";
  el("cm_booking_service_key").value = "";
  el("cm_booking_ac_type").value = "";
  el("cm_booking_btu").value = "";
  el("cm_booking_wash_variant").value = "";
  el("cm_is_featured").value = "0";
  el("cm_short_description").value = "";
  el("cm_long_description").value = "";
  el("cm_highlights").value = "";
  el("cm_service_conditions").value = "";
  updateBookingFieldsVisibility();
  galleryImages = [];
  galleryUploading = false;
  renderGalleryManager();
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
  el("cm_wash_variant").value = item.pricing_wash_variant ?? item.wash_variant ?? "";
  el("cm_btu_min").value = item.btu_min || "";
  el("cm_btu_max").value = item.btu_max || "";
  const rawNormalPrice = item.pricing_normal_price ?? item.normal_price;
  const rawActivePrice = item.pricing_active_price ?? item.sale_price;
  const rawPriority = item.pricing_priority ?? item.priority;
  el("cm_normal_price").value = rawNormalPrice != null ? rawNormalPrice : "";
  el("cm_active_price").value = rawActivePrice != null ? rawActivePrice : "";
  el("cm_label").value = item.pricing_label ?? item.price_label ?? "";
  el("cm_campaign_name").value = item.pricing_campaign_name ?? item.campaign_name ?? "";
  el("cm_priority").value = rawPriority != null ? rawPriority : "1";
  el("cm_effective_from").value = toDateInputValue(item.pricing_effective_from ?? item.effective_from);
  el("cm_effective_to").value = toDateInputValue(item.pricing_effective_to ?? item.effective_to);
  const rawPricingIsActive = item.pricing_is_active != null ? item.pricing_is_active : true;
  el("cm_pricing_is_active").value = item.price_rule_id ? (rawPricingIsActive ? "1" : "0") : "1";
  el("cm_is_active").value = item.is_active ? "1" : "0";
  el("cm_is_customer_visible").value = item.is_customer_visible ? "1" : "0";
  el("cm_base_price").value = Number(item.base_price) > 0 ? Number(item.base_price) : "";
  el("cm_is_autoplay_enabled").value = item.is_autoplay_enabled === false ? "0" : "1";
  if (item.image_url) setCatalogImagePreview(item.image_url);
  el("cm_booking_mode").value = BOOKING_MODES.includes(item.booking_mode) ? item.booking_mode : "contact_admin";
  el("cm_booking_service_key").value = item.booking_service_key || "";
  el("cm_booking_ac_type").value = item.booking_ac_type || "";
  el("cm_booking_btu").value = item.booking_btu || "";
  el("cm_booking_wash_variant").value = item.booking_wash_variant || "";
  el("cm_is_featured").value = item.is_featured ? "1" : "0";
  el("cm_short_description").value = item.short_description || "";
  el("cm_long_description").value = item.long_description || "";
  el("cm_highlights").value = Array.isArray(item.highlights) ? item.highlights.join("\n") : "";
  el("cm_service_conditions").value = item.service_conditions || "";
  updateBookingFieldsVisibility();
  loadGalleryImages(itemId);
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
    is_autoplay_enabled: el("cm_is_autoplay_enabled").value === "1",
    is_active: el("cm_is_active").value === "1",
    is_customer_visible: el("cm_is_customer_visible").value === "1",
    booking_mode: el("cm_booking_mode").value,
    booking_service_key: trimmedOrEmpty("cm_booking_service_key"),
    booking_ac_type: trimmedOrEmpty("cm_booking_ac_type"),
    booking_btu: trimmedOrEmpty("cm_booking_btu"),
    booking_wash_variant: trimmedOrEmpty("cm_booking_wash_variant"),
    is_featured: el("cm_is_featured").value === "1",
    short_description: trimmedOrEmpty("cm_short_description"),
    long_description: trimmedOrEmpty("cm_long_description"),
    highlights: (el("cm_highlights").value || "").split("\n").map((line) => line.trim()).filter(Boolean),
    service_conditions: trimmedOrEmpty("cm_service_conditions"),
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
  if (payload.booking_mode === "bookable") {
    if (!BOOKING_AC_TYPES.includes(payload.booking_ac_type)) {
      return `รายการที่จองออนไลน์ได้ ต้องระบุประเภทแอร์สำหรับจองเป็นหนึ่งใน: ${BOOKING_AC_TYPES.join(", ")}`;
    }
    if (!BOOKING_BTU_OPTIONS.includes(Number(payload.booking_btu))) {
      return `รายการที่จองออนไลน์ได้ ต้องระบุ BTU สำหรับจองเป็นหนึ่งใน: ${BOOKING_BTU_OPTIONS.join(", ")}`;
    }
    if (payload.booking_ac_type === BOOKING_WALL_AC_TYPE && !BOOKING_WASH_VARIANTS.includes(payload.booking_wash_variant)) {
      return `รายการแอร์ผนังที่จองออนไลน์ได้ ต้องระบุรูปแบบการล้างสำหรับจองเป็นหนึ่งใน: ${BOOKING_WASH_VARIANTS.join(", ")}`;
    }
  }
  if (payload.short_description && payload.short_description.length > 300) {
    return "คำอธิบายสั้นต้องไม่เกิน 300 ตัวอักษร";
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

/* ---------- Gallery (multi-image) manager ---------- */

function galleryThumbHtml(image, index, total) {
  return `
  <div class="asc-gallery-thumb" data-image-id="${image.image_id}">
    <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.alt_text || "")}" loading="lazy">
    ${image.is_primary ? `<span class="asc-badge asc-badge-primary">หลัก</span>` : ""}
    <div class="asc-gallery-thumb-actions">
      <button class="secondary btn-small" type="button" data-gact="up" data-image-id="${image.image_id}" ${index === 0 ? "disabled" : ""}>↑</button>
      <button class="secondary btn-small" type="button" data-gact="down" data-image-id="${image.image_id}" ${index === total - 1 ? "disabled" : ""}>↓</button>
      ${!image.is_primary ? `<button class="secondary btn-small" type="button" data-gact="primary" data-image-id="${image.image_id}">ตั้งเป็นหลัก</button>` : ""}
      <button class="secondary btn-small" type="button" data-gact="delete" data-image-id="${image.image_id}">ลบ</button>
    </div>
  </div>`;
}

function renderGalleryManager() {
  const body = el("cm_gallery_body");
  if (!editingItemId) {
    body.innerHTML = `<div class="muted2 mini">บันทึกข้อมูลบริการก่อน จึงค่อยเพิ่มรูปภาพหลายรูปได้</div>`;
    return;
  }
  if (galleryLoading) {
    body.innerHTML = `<div class="asc-loading">กำลังโหลดรูปภาพ...</div>`;
    return;
  }
  const grid = galleryImages.length
    ? `<div class="asc-gallery-grid">${galleryImages.map((img, i) => galleryThumbHtml(img, i, galleryImages.length)).join("")}</div>`
    : `<div class="asc-empty">ยังไม่มีรูปภาพในแกลเลอรี</div>`;
  const remaining = Math.max(0, MAX_GALLERY_IMAGES - galleryImages.length);
  const inputArea = galleryUploading
    ? `<div class="asc-loading">กำลังอัปโหลดรูปภาพ...</div>`
    : remaining > 0
      ? `<div class="asc-field" style="margin-top:8px;">
          <input id="cm_gallery_input" type="file" accept="image/jpeg,image/png,image/webp" multiple>
          <div class="muted2 mini">JPEG/PNG/WEBP ไม่เกิน 5MB ต่อรูป (เพิ่มได้อีก ${remaining} จาก ${MAX_GALLERY_IMAGES} รูป)</div>
        </div>`
      : `<div class="muted2 mini" style="margin-top:8px;">มีรูปภาพครบ ${MAX_GALLERY_IMAGES} รูปแล้ว ลบรูปเดิมก่อนเพิ่มรูปใหม่</div>`;
  body.innerHTML = `${grid}${inputArea}`;
  const input = el("cm_gallery_input");
  if (input) input.addEventListener("change", onGalleryImagePicked);
}

async function loadGalleryImages(itemId) {
  galleryLoading = true;
  renderGalleryManager();
  try {
    galleryImages = await apiFetch(`/admin/catalog/items/${itemId}/images`);
  } catch (e) {
    galleryImages = [];
    showToast(e.message || "โหลดแกลเลอรีไม่สำเร็จ", "error");
  } finally {
    galleryLoading = false;
    renderGalleryManager();
  }
}

async function onGalleryImagePicked(event) {
  const files = event.target.files ? Array.from(event.target.files) : [];
  if (!files.length || !editingItemId) return;
  const remaining = Math.max(0, MAX_GALLERY_IMAGES - galleryImages.length);
  const toUpload = files.slice(0, remaining);
  if (files.length > toUpload.length) {
    showToast(`เลือกได้สูงสุด ${MAX_GALLERY_IMAGES} รูปต่อรายการ อัปโหลดเฉพาะ ${toUpload.length} รูปแรก`, "error");
  }
  if (!toUpload.length) return;

  galleryUploading = true;
  renderGalleryManager();
  const failures = [];
  for (const file of toUpload) {
    try {
      const formData = new FormData();
      formData.append("image", file);
      await apiFetch(`/admin/catalog/items/${editingItemId}/images`, { method: "POST", body: formData });
    } catch (e) {
      failures.push(file.name || "รูปภาพ");
    }
  }
  galleryUploading = false;
  await loadGalleryImages(editingItemId);
  if (failures.length) showToast(`อัปโหลดไม่สำเร็จ: ${failures.join(", ")}`, "error");
}

async function onGalleryDelete(imageId) {
  if (!editingItemId || galleryUploading) return;
  const confirmed = confirm("ต้องการลบรูปภาพนี้หรือไม่?");
  if (!confirmed) return;
  galleryUploading = true;
  renderGalleryManager();
  try {
    await apiFetch(`/admin/catalog/items/${editingItemId}/images/${imageId}`, { method: "DELETE" });
    await loadGalleryImages(editingItemId);
  } catch (e) {
    showToast(e.message || "ลบรูปภาพไม่สำเร็จ", "error");
  } finally {
    galleryUploading = false;
    renderGalleryManager();
  }
}

async function onGallerySetPrimary(imageId) {
  if (!editingItemId || galleryUploading) return;
  galleryUploading = true;
  renderGalleryManager();
  try {
    await apiFetch(`/admin/catalog/items/${editingItemId}/images/${imageId}/primary`, { method: "POST" });
    await loadGalleryImages(editingItemId);
  } catch (e) {
    showToast(e.message || "ตั้งรูปหลักไม่สำเร็จ", "error");
  } finally {
    galleryUploading = false;
    renderGalleryManager();
  }
}

async function onGalleryReorder(imageId, direction) {
  if (!editingItemId || galleryUploading) return;
  const index = galleryImages.findIndex((img) => Number(img.image_id) === Number(imageId));
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= galleryImages.length) return;
  const ids = galleryImages.map((img) => img.image_id);
  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
  galleryUploading = true;
  renderGalleryManager();
  try {
    await apiFetch(`/admin/catalog/items/${editingItemId}/images/reorder`, {
      method: "POST",
      body: JSON.stringify({ image_ids: ids }),
    });
    await loadGalleryImages(editingItemId);
  } catch (e) {
    showToast(e.message || "จัดเรียงรูปภาพไม่สำเร็จ", "error");
  } finally {
    galleryUploading = false;
    renderGalleryManager();
  }
}

function bindGalleryActions() {
  el("cm_gallery_body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-gact]");
    if (!button) return;
    const imageId = Number(button.getAttribute("data-image-id"));
    const act = button.getAttribute("data-gact");
    if (act === "delete") onGalleryDelete(imageId);
    else if (act === "primary") onGallerySetPrimary(imageId);
    else if (act === "up") onGalleryReorder(imageId, "up");
    else if (act === "down") onGalleryReorder(imageId, "down");
  });
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
      <button class="danger" data-act="delete" type="button">ลบรายการนี้</button>
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
    if (act === "delete") { closeMoreSheet(); openDeleteModal(item.item_id); return; }
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

/* ---------- Delete confirmation modal ---------- */

function ensureDeleteModal() {
  if (el("asc_delete_modal_backdrop")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="asc_delete_modal_backdrop" class="cwf-modal-backdrop hidden">
    <div class="cwf-modal">
      <div class="cwf-modal-head">
        <div class="cwf-modal-title">ลบรายการนี้</div>
        <button id="asc_delete_modal_close" class="cwf-modal-close" type="button">×</button>
      </div>
      <div class="cwf-modal-body">
        <div class="asc-warning">การลบจะลบรายการและรูปภาพทั้งหมดอย่างถาวร ไม่สามารถย้อนกลับได้ (งานเก่าและราคาที่เคยจองไว้จะไม่ถูกแก้ไข)</div>
        <div id="asc_delete_modal_visible_warning" class="asc-warning" style="display:none;">รายการนี้กำลังแสดงให้ลูกค้าเห็นอยู่ในขณะนี้</div>
        <div class="asc-field">
          <label>พิมพ์ชื่อรายการ "<span id="asc_delete_modal_item_name"></span>" เพื่อยืนยัน</label>
          <input id="asc_delete_modal_confirm_input" placeholder="พิมพ์ชื่อรายการให้ตรงกัน">
        </div>
        <div id="asc_delete_modal_error" class="asc-modal-error"></div>
      </div>
      <div class="cwf-modal-foot">
        <button id="asc_delete_modal_cancel" class="secondary" type="button">ยกเลิก</button>
        <button id="asc_delete_modal_confirm" class="danger" type="button" disabled>ลบรายการ</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);

  el("asc_delete_modal_close").addEventListener("click", closeDeleteModal);
  el("asc_delete_modal_cancel").addEventListener("click", closeDeleteModal);
  el("asc_delete_modal_confirm").addEventListener("click", confirmDeleteCatalogItem);
  el("asc_delete_modal_confirm_input").addEventListener("input", updateDeleteConfirmButtonState);
}

function updateDeleteConfirmButtonState() {
  const item = catalogItems.find((x) => Number(x.item_id) === Number(deleteModalItemId));
  const typed = (el("asc_delete_modal_confirm_input").value || "").trim();
  el("asc_delete_modal_confirm").disabled = !item || typed !== item.item_name;
}

function openDeleteModal(itemId) {
  const item = catalogItems.find((x) => Number(x.item_id) === Number(itemId));
  if (!item) return;
  ensureDeleteModal();
  deleteModalItemId = item.item_id;
  el("asc_delete_modal_item_name").textContent = item.item_name || "";
  el("asc_delete_modal_confirm_input").value = "";
  el("asc_delete_modal_error").textContent = "";
  el("asc_delete_modal_error").style.display = "none";
  el("asc_delete_modal_visible_warning").style.display = item.is_active && item.is_customer_visible ? "block" : "none";
  updateDeleteConfirmButtonState();
  el("asc_delete_modal_backdrop").classList.remove("hidden");
}

function closeDeleteModal() {
  const backdrop = el("asc_delete_modal_backdrop");
  if (backdrop) backdrop.classList.add("hidden");
  deleteModalItemId = null;
}

async function confirmDeleteCatalogItem() {
  if (!deleteModalItemId) return;
  const itemId = deleteModalItemId;
  const confirmButton = el("asc_delete_modal_confirm");
  confirmButton.disabled = true;
  try {
    const result = await apiFetch(`/admin/catalog/items/${itemId}`, { method: "DELETE" });
    closeDeleteModal();
    await loadCatalogItems();
    if (result && result.warning) showToast(result.warning, "error");
    else showToast("ลบรายการแล้ว", "success");
  } catch (e) {
    const box = el("asc_delete_modal_error");
    box.textContent = e.message || "ลบรายการไม่สำเร็จ";
    box.style.display = "block";
    updateDeleteConfirmButtonState();
  }
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

function catalogItemThumbUrl(item) {
  const images = Array.isArray(item.images) ? item.images : [];
  const primary = images.find((img) => img.is_primary) || images[0];
  return (primary && primary.image_url) || item.image_url || "";
}

function catalogItemCard(item) {
  const active = !!item.is_active;
  const visible = !!item.is_customer_visible;
  const btu = fmtBtuRange(item);
  const meta = [item.item_category, item.job_category, item.ac_type, btu].filter(Boolean).join(" • ");
  const hasPromo = !!item.has_promo;
  const salePrice = item.display_price != null ? item.display_price : item.base_price;
  const showAsk = !(Number(salePrice) > 0);

  const thumbUrl = catalogItemThumbUrl(item);
  const thumb = thumbUrl
    ? `<img class="asc-item-thumb" src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(item.item_name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;asc-item-thumb asc-placeholder&quot;>ไม่มีรูป</div>';">`
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
        ${item.booking_mode === "bookable" ? `<span class="asc-badge asc-badge-bookable">จองออนไลน์ได้</span>` : `<span class="asc-badge asc-badge-contact">ติดต่อแอดมิน</span>`}
        ${item.is_featured ? `<span class="asc-badge asc-badge-featured">แนะนำ</span>` : ""}
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
