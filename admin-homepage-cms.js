(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    version: 1,
    sections: [
      { id: "hero", type: "hero", enabled: true, sort_order: 10, kicker: "Coldwindflow", title: "ดูแลแอร์ง่าย จองงานได้ในไม่กี่ขั้นตอน", body: "จองล้างแอร์ ติดตามงาน และรับประกาศสำคัญจาก CWF ได้ในหน้าเดียว", cta_primary: { label: "จองล้างแอร์", route: "scheduled" }, cta_secondary: { label: "ติดตามงาน", route: "tracking" }, focal_position: "center", items: [] },
      { id: "quick", type: "quick", enabled: true, sort_order: 20, title: "เมนูด่วน", body: "", items: [{ title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" }, { title: "แจ้งซ่อม", action: "contact", icon: "wrench" }, { title: "ติดตามงาน", route: "tracking", icon: "pin" }, { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "chat" }] },
      { id: "promo_banner", type: "promo_banner", enabled: true, sort_order: 25, title: "", body: "", items: [] },
      { id: "active_job", type: "active_job", enabled: true, sort_order: 30, title: "Active job", body: "", items: [] },
      { id: "announcements", type: "announcements", enabled: true, sort_order: 40, title: "ข่าวและประกาศ CWF", body: "", items: [{ title: "ติดต่อทีม CWF", action: "contact", body: "สอบถามบริการหรือแจ้งข้อมูลเพิ่มเติมกับแอดมิน" }] },
      { id: "featured_services", type: "featured_services", enabled: true, sort_order: 50, title: "บริการแนะนำ", body: "ราคาและรายละเอียดจาก Catalog", featured_mode: "auto", featured_limit: 8, show_price: true, show_badge: true, item_ids: [], items: [] },
      { id: "updates", type: "updates", enabled: true, sort_order: 60, title: "ภาพกิจกรรมและโพสต์", body: "", items: [] },
      { id: "articles", type: "articles", enabled: true, sort_order: 70, title: "บทความแนะนำ", body: "", items: [] },
      { id: "trust", type: "trust", enabled: true, sort_order: 80, title: "มาตรฐานที่ลูกค้าวางใจ", body: "", items: [{ title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" }, { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" }, { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" }, { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" }] },
    ],
  };
  let config = clone(DEFAULT_CONFIG);
  let selected = "hero";
  let catalogItems = null;
  let catalogLoadFailed = false;
  const ROUTE_OPTIONS = ["home", "store", "scheduled", "urgent", "tracking", "profile"];

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[s]));
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function standardSections() { return clone(DEFAULT_CONFIG).sections; }
  function normalizeAdminConfig(value) {
    const next = value && Array.isArray(value.sections) ? clone(value) : clone(DEFAULT_CONFIG);
    const standard = standardSections();
    const existingTypes = new Set(next.sections.map((section) => section.type));
    standard.forEach((section) => {
      if (!existingTypes.has(section.type)) next.sections.push(section);
    });
    next.sections = next.sections.filter((section) => standard.some((std) => std.type === section.type));
    return next;
  }
  function setStatus(text, kind) { $("status").textContent = text; $("status").className = `status ${kind || ""}`; }
  function sections() { return config.sections.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)); }
  function current() { return sections().find((section) => section.id === selected) || sections()[0]; }

  async function ensureCatalogItems() {
    if (catalogItems || catalogLoadFailed) return;
    try {
      const data = await requestJson("/admin/catalog/items");
      catalogItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    } catch (_) {
      catalogLoadFailed = true;
    }
    render();
  }

  function retryLoadCatalogItems() {
    catalogLoadFailed = false;
    catalogItems = null;
    render();
    ensureCatalogItems();
  }

  function catalogIsSelectable(item) {
    return Boolean(item) && item.is_active !== false && item.is_customer_visible !== false;
  }

  function resolveFeaturedPreviewItems(section) {
    const rows = catalogItems || [];
    const limitRaw = Number(section.featured_limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(12, Math.round(limitRaw))) : 8;
    if (section.featured_mode === "manual") {
      const byId = new Map(rows.map((item) => [String(item.item_id), item]));
      return (section.item_ids || []).map((id) => byId.get(String(id))).filter(catalogIsSelectable).slice(0, limit);
    }
    return rows.filter((item) => item && item.is_featured && catalogIsSelectable(item)).slice(0, limit);
  }

  async function requestJson(url, options) {
    const response = await fetch(url, { credentials: "include", headers: options?.body ? { "Content-Type": "application/json" } : undefined, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function load() {
    setStatus("กำลังโหลด...", "");
    const data = await requestJson("/admin/homepage-cms/config");
    config = normalizeAdminConfig(data.draft_config);
    selected = current()?.id || "hero";
    render();
    setStatus(`Draft v${data.version || 1}${data.published_at ? " · Published แล้ว" : ""}`, "ok");
    ensureCatalogItems();
  }

  async function saveDraft() {
    setStatus("กำลังบันทึก Draft...", "");
    const data = await requestJson("/admin/homepage-cms/draft", { method: "PUT", body: JSON.stringify({ config }) });
    setStatus(`บันทึก Draft แล้ว v${data.version}`, "ok");
  }

  async function publish() {
    setStatus("กำลัง Publish...", "");
    const data = await requestJson("/admin/homepage-cms/publish", { method: "POST", body: JSON.stringify({ config }) });
    setStatus(`Publish แล้ว v${data.version}`, "ok");
  }

  function move(id, dir) {
    const list = sections();
    const index = list.findIndex((section) => section.id === id);
    const next = index + dir;
    if (next < 0 || next >= list.length) return;
    [list[index].sort_order, list[next].sort_order] = [list[next].sort_order, list[index].sort_order];
    render();
  }

  function renderSectionList() {
    $("sectionList").innerHTML = sections().map((section, index, list) => `
      <div class="section-row">
        <div><button class="mini" data-move="${section.id}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button><button class="mini" data-move="${section.id}" data-dir="1" ${index === list.length - 1 ? "disabled" : ""}>↓</button></div>
        <div><b>${esc(section.title || section.type)}</b><small>${esc(section.type)}</small></div>
        <label class="switch"><input type="checkbox" data-toggle="${section.id}" ${section.enabled !== false ? "checked" : ""}> เปิด</label>
        <button class="mini" data-edit="${section.id}">แก้</button>
      </div>
    `).join("");
    $("sectionPicker").innerHTML = sections().map((section) => `<option value="${esc(section.id)}">${esc(section.title || section.type)}</option>`).join("");
    $("sectionPicker").value = selected;
  }

  function field(label, prop, type) {
    const section = current();
    const value = section[prop] || "";
    if (type === "textarea") return `<label>${label}<textarea data-field="${prop}">${esc(value)}</textarea></label>`;
    return `<label>${label}<input data-field="${prop}" value="${esc(value)}"></label>`;
  }

  function itemEditor(item, index, sectionType) {
    const external = sectionType === "updates" || sectionType === "articles";
    const trust = sectionType === "trust";
    const quick = sectionType === "quick";
    const promo = sectionType === "promo_banner";
    const targetEditable = quick || sectionType === "announcements" || promo;
    const targetMode = item.url ? "url" : item.action === "contact" ? "contact" : "route";
    const targetField = (() => {
      if (!targetEditable) return "";
      if (targetMode === "contact") return "";
      if (targetMode === "url") {
        return `<label>External URL<input data-item="${index}" data-prop="url" value="${esc(item.url || "")}" placeholder="https://..."></label>`;
      }
      return `<label>Internal route<select data-item="${index}" data-prop="route">
        ${ROUTE_OPTIONS.map((route) => `<option value="${route}" ${String(item.route || "home") === route ? "selected" : ""}>${route}</option>`).join("")}
      </select></label>`;
    })();
    return `
      <div class="item">
        <h3>รายการ ${index + 1}</h3>
        <label class="switch"><input type="checkbox" data-item-enabled="${index}" ${item.enabled !== false ? "checked" : ""}> เปิดใช้งานรายการนี้</label>
        <div class="two">
          <label>หัวข้อ${promo ? " (ไม่บังคับ)" : ""}<input data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
          <label>ป้าย/วันที่<input data-item="${index}" data-prop="tag" value="${esc(item.tag || item.date_label || "")}"></label>
        </div>
        <label>คำอธิบาย<textarea data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
        ${promo ? `
          <label>Alt text (คำอธิบายภาพ)<input data-item="${index}" data-prop="alt_text" value="${esc(item.alt_text || "")}"></label>
          <label>การแสดงภาพ<select data-item="${index}" data-prop="aspect_mode">
            <option value="contain" ${(item.aspect_mode || "contain") === "contain" ? "selected" : ""}>Contain (เห็นภาพเต็ม ไม่ครอป)</option>
            <option value="cover" ${item.aspect_mode === "cover" ? "selected" : ""}>Cover (เต็มกรอบ อาจครอป)</option>
          </select></label>
        ` : ""}
        ${targetEditable ? `
          <label>Target type<select data-item-target="${index}">
            <option value="route" ${targetMode === "route" ? "selected" : ""}>Internal route</option>
            <option value="contact" ${targetMode === "contact" ? "selected" : ""}>Contact admin</option>
            <option value="url" ${targetMode === "url" ? "selected" : ""}>External URL</option>
          </select></label>
        ` : ""}
        ${quick ? `<label>Icon<input data-item="${index}" data-prop="icon" value="${esc(item.icon || "")}" placeholder="sparkle, wrench, pin, chat"></label>` : ""}
        ${targetField}
        ${trust || targetEditable ? "" : `<label>${external ? "External URL" : "Route / URL"}<input data-item="${index}" data-prop="${external ? "url" : "route"}" value="${esc(external ? item.url || "" : item.route || item.url || "")}"></label>`}
        ${trust ? "" : `<label>Image URL<input data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}"></label>`}
        ${trust ? "" : `<div class="two">
          <label>Active from<input data-item="${index}" data-prop="active_from" value="${esc(item.active_from || "")}" placeholder="YYYY-MM-DD"></label>
          <label>Active to<input data-item="${index}" data-prop="active_to" value="${esc(item.active_to || "")}" placeholder="YYYY-MM-DD"></label>
        </div>
        <label>อัปโหลดรูป<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>`}
        <button class="btn danger" type="button" data-remove-item="${index}">ลบรายการ</button>
      </div>
    `;
  }

  function ctaEditor(cta, itemIndex, ctaName, label) {
    const value = cta || {};
    const mode = value.url ? "url" : "route";
    const targetField = mode === "url"
      ? `<label>${label} URL<input data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="url" value="${esc(value.url || "")}" placeholder="https://..."></label>`
      : `<label>${label} route<select data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="route">
          ${ROUTE_OPTIONS.map((route) => `<option value="${route}" ${String(value.route || "home") === route ? "selected" : ""}>${route}</option>`).join("")}
        </select></label>`;
    return `
      <div class="two">
        <label>${label}<input data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="label" value="${esc(value.label || "")}"></label>
        <label>${label} target<select data-hero-cta-target="${itemIndex}" data-cta-name="${ctaName}">
          <option value="route" ${mode === "route" ? "selected" : ""}>Internal route</option>
          <option value="url" ${mode === "url" ? "selected" : ""}>External URL</option>
        </select></label>
      </div>
      ${targetField}
    `;
  }

  function heroSlideEditor(item, index, total) {
    return `
      <div class="item">
        <h3>Hero slide ${index + 1}</h3>
        <label class="switch"><input type="checkbox" data-item-enabled="${index}" ${item.enabled !== false ? "checked" : ""}> เปิดใช้งานสไลด์นี้</label>
        <div>
          <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === total - 1 ? "disabled" : ""}>↓</button>
        </div>
        <label>Kicker<input data-item="${index}" data-prop="kicker" value="${esc(item.kicker || "")}"></label>
        <label>Title<input data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
        <label>Body<textarea data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
        <label>Image URL<input data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}" placeholder="https://..."></label>
        <label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
        <label>ตำแหน่งโฟกัสภาพ<select data-item="${index}" data-prop="focal_position">
          <option value="top" ${item.focal_position === "top" ? "selected" : ""}>บน</option>
          <option value="center" ${(item.focal_position || "center") === "center" ? "selected" : ""}>กลาง</option>
          <option value="bottom" ${item.focal_position === "bottom" ? "selected" : ""}>ล่าง</option>
        </select></label>
        ${ctaEditor(item.cta_primary, index, "cta_primary", "Primary CTA")}
        ${ctaEditor(item.cta_secondary, index, "cta_secondary", "Secondary CTA")}
        <button class="btn danger" type="button" data-remove-item="${index}">ลบรายการ</button>
      </div>
    `;
  }

  function renderEditor() {
    const section = current();
    if (!section) return;
    const itemTypes = ["announcements", "updates", "articles", "trust", "quick", "promo_banner"];
    $("editor").innerHTML = `
      ${field("ชื่อ Section", "title")}
      ${field("คำอธิบาย", "body", "textarea")}
      ${section.type === "hero" ? `
        ${field("Kicker", "kicker")}
        <label>Hero Image URL<input data-field="image_url" value="${esc(section.image_url || "")}"></label>
        <label>Hero Image Upload<input type="file" accept="image/jpeg,image/png,image/webp" data-upload-section="hero"></label>
        ${section.image_url ? `<button class="btn danger" type="button" data-clear-section-image="hero">Remove hero image</button>` : ""}
        <label>ตำแหน่งโฟกัสภาพ<select data-field="focal_position">
          <option value="top" ${section.focal_position === "top" ? "selected" : ""}>บน</option>
          <option value="center" ${(section.focal_position || "center") === "center" ? "selected" : ""}>กลาง</option>
          <option value="bottom" ${section.focal_position === "bottom" ? "selected" : ""}>ล่าง</option>
        </select></label>
        <div class="two">
          <label>ปุ่มหลัก<input data-cta="cta_primary" data-prop="label" value="${esc(section.cta_primary?.label || "")}"></label>
          <label>Route ปุ่มหลัก<input data-cta="cta_primary" data-prop="route" value="${esc(section.cta_primary?.route || "")}"></label>
        </div>
        <div class="two">
          <label>ปุ่มรอง<input data-cta="cta_secondary" data-prop="label" value="${esc(section.cta_secondary?.label || "")}"></label>
          <label>Route ปุ่มรอง<input data-cta="cta_secondary" data-prop="route" value="${esc(section.cta_secondary?.route || "")}"></label>
        </div>
        <div class="toolbar"><button class="btn" type="button" id="addHeroSlide">Add hero slide</button></div>
        ${(section.items || []).map((item, index) => heroSlideEditor(item, index, section.items.length)).join("")}
      ` : ""}
      ${itemTypes.includes(section.type) ? `
        <div class="toolbar"><button class="btn" type="button" id="addItem">เพิ่มรายการ</button></div>
        ${section.type === "promo_banner" ? (section.items || []).map((item, index) => `
          <div>
            <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === section.items.length - 1 ? "disabled" : ""}>↓</button>
          </div>
        ${itemEditor(item, index, section.type)}`).join("") : (section.items || []).map((item, index) => itemEditor(item, index, section.type)).join("")}
      ` : ""}
      ${section.type === "featured_services" ? featuredServicesEditor(section) : ""}
    `;
  }

  function featuredServicesEditor(section) {
    const mode = section.featured_mode === "manual" ? "manual" : "auto";
    const itemIds = (Array.isArray(section.item_ids) ? section.item_ids : []).map(String);
    if (mode === "manual") ensureCatalogItems();
    let manualBlock = "";
    if (mode === "manual") {
      if (catalogLoadFailed) {
        manualBlock = `<p>โหลดรายการ Catalog ไม่สำเร็จ</p><button class="btn" type="button" id="retryCatalog">ลองใหม่</button>`;
      } else if (!catalogItems) {
        manualBlock = `<p>กำลังโหลดรายการ Catalog...</p>`;
      } else {
        const byId = new Map(catalogItems.map((item) => [String(item.item_id), item]));
        const selectedRows = itemIds.map((id) => byId.get(id)).filter(Boolean);
        const unselectedRows = catalogItems.filter((item) => !itemIds.includes(String(item.item_id)));
        const inactiveNote = (item) => (catalogIsSelectable(item) ? "" : ` <small style="color:#b42318">(ปิดใช้งาน/ไม่แสดงลูกค้า — จะไม่แสดงจริง)</small>`);
        manualBlock = `
          <p style="margin:8px 0 4px;font-weight:600">รายการที่เลือก (ลำดับ = ลำดับที่แสดงจริง)</p>
          <div class="editor" style="max-height:240px;overflow:auto;border:1px solid #dce4ef;border-radius:11px;padding:8px">
            ${selectedRows.length ? selectedRows.map((item, index) => `
              <div class="section-row">
                <div>
                  <button class="mini" type="button" data-move-featured-item="${esc(item.item_id)}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
                  <button class="mini" type="button" data-move-featured-item="${esc(item.item_id)}" data-dir="1" ${index === selectedRows.length - 1 ? "disabled" : ""}>↓</button>
                </div>
                <div><b>${esc(item.item_name || item.item_id)}</b>${inactiveNote(item)}</div>
                <label class="switch"><input type="checkbox" data-featured-item="${esc(item.item_id)}" checked> แสดงผล</label>
              </div>
            `).join("") : "<p>ยังไม่ได้เลือกรายการ</p>"}
          </div>
          <p style="margin:10px 0 4px;font-weight:600">รายการที่ยังไม่เลือก</p>
          <div class="editor" style="max-height:240px;overflow:auto;border:1px solid #dce4ef;border-radius:11px;padding:8px">
            ${unselectedRows.length ? unselectedRows.map((item) => {
              const selectable = catalogIsSelectable(item);
              return `
                <label class="switch" style="justify-content:flex-start">
                  <input type="checkbox" data-featured-item="${esc(item.item_id)}" ${selectable ? "" : "disabled"}>
                  ${esc(item.item_name || item.item_id)}${inactiveNote(item)}
                </label>
              `;
            }).join("") : "<p>ไม่มีรายการเพิ่มเติม</p>"}
          </div>
        `;
      }
    }
    return `
      <label>แหล่งข้อมูลบริการแนะนำ<select data-featured-mode>
        <option value="auto" ${mode === "auto" ? "selected" : ""}>ดึงจาก Catalog อัตโนมัติ (is_featured)</option>
        <option value="manual" ${mode === "manual" ? "selected" : ""}>เลือกรายการเอง</option>
      </select></label>
      <label>จำนวนรายการสูงสุด<input type="number" min="1" max="12" data-featured-limit value="${esc(section.featured_limit || 8)}"></label>
      <label class="switch"><input type="checkbox" data-featured-bool="show_price" ${section.show_price !== false ? "checked" : ""}> แสดงราคา</label>
      <label class="switch"><input type="checkbox" data-featured-bool="show_badge" ${section.show_badge !== false ? "checked" : ""}> แสดง Badge สถานะจอง</label>
      ${mode === "manual" ? `<label>เลือกและจัดลำดับบริการที่ต้องการแสดง${manualBlock}</label>` : ""}
    `;
  }

  async function uploadImage(input, itemIndex) {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("image", file);
    setStatus("กำลังอัปโหลดรูป...", "");
    const response = await fetch("/admin/homepage-cms/images", { method: "POST", credentials: "include", body: fd });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");
    const section = current();
    if (itemIndex === "hero") {
      section.image_url = data.image_url;
      section.image_public_id = data.image_public_id;
    } else {
      section.items[itemIndex].image_url = data.image_url;
      section.items[itemIndex].image_public_id = data.image_public_id;
    }
    render();
    setStatus("อัปโหลดรูปแล้ว", "ok");
  }

  function renderPreview() {
    $("preview").innerHTML = sections().filter((section) => section.enabled !== false).map((section) => {
      if (section.type === "hero") {
        const enabledSlides = (section.items || []).filter((slide) => slide.enabled !== false);
        const slides = enabledSlides.length ? enabledSlides : [section];
        return `<section class="hero">${slides.map((slide) => `<div ${slide.image_url ? `style="background-image:linear-gradient(rgba(7,27,56,.62),rgba(7,27,56,.62)),url('${esc(slide.image_url)}');background-size:cover;background-position:center"` : ""}><small>${esc(slide.kicker || section.kicker || "Coldwindflow")}</small><h3>${esc(slide.title || section.title || "")}</h3><p>${esc(slide.body || section.body || "")}</p></div>`).join("")}</section>`;
      }
      if (section.type === "quick") return `<section class="quick">${(section.items || []).filter((item) => item.enabled !== false).slice(0, 4).map((item) => `<div>${esc(item.title || "")}</div>`).join("")}</section>`;
      if (section.type === "promo_banner") {
        const banners = (section.items || []).filter((item) => item.enabled !== false && item.image_url);
        if (!banners.length) return "";
        return `<section class="sec"><div style="aspect-ratio:1/1;border-radius:18px;overflow:hidden;background:#eef2f7"><img src="${esc(banners[0].image_url)}" alt="${esc(banners[0].alt_text || "")}" style="width:100%;height:100%;object-fit:${banners[0].aspect_mode === "cover" ? "cover" : "contain"}"></div>${banners.length > 1 ? `<p style="text-align:center;margin-top:6px;color:#7d899c;font-size:12px">${banners.length} banners</p>` : ""}</section>`;
      }
      if (section.type === "active_job") return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>Shown only when the logged-in customer has an active job</span></div></div></section>`;
      if (section.type === "featured_services") {
        const items = resolveFeaturedPreviewItems(section);
        const showPrice = section.show_price !== false;
        const showBadge = section.show_badge !== false;
        const priceText = (item) => {
          const value = Number(item.display_price ?? item.active_price ?? item.base_price);
          return Number.isFinite(value) && value > 0 ? `${value.toLocaleString("th-TH")} บาท` : "สอบถามราคา";
        };
        const cards = items.length
          ? items.map((item) => `
              <article class="card">
                <b>${esc(item.item_name || item.item_id)}</b>
                ${showBadge ? `<p><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#3346a6;font-size:11px">${item.booking_mode === "bookable" ? "จองได้" : "สอบถามแอดมิน"}</span></p>` : ""}
                ${showPrice ? `<p>${esc(priceText(item))}</p>` : ""}
              </article>
            `).join("")
          : catalogLoadFailed
            ? `<article class="card"><b>โหลด Catalog ไม่สำเร็จ</b><p>กดลองใหม่ในตัวแก้ไข</p></article>`
            : !catalogItems
              ? `<article class="card"><b>กำลังโหลด Catalog...</b></article>`
              : `<article class="card"><b>ไม่มีบริการแนะนำที่แสดงผลได้</b><p>Section นี้จะถูกซ่อนจากลูกค้าจริง</p></article>`;
        return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>${esc(section.body || "")}</span></div></div><div class="cards">${cards}</div></section>`;
      }
      return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>${esc(section.body || "")}</span></div><span>ดูทั้งหมด</span></div><div class="cards">${(section.items || []).filter((item) => item.enabled !== false).slice(0, 3).map((item) => `<article class="card"><b>${esc(item.title || "")}</b><p>${esc(item.body || "")}</p></article>`).join("") || `<article class="card"><b>ไม่มีรายการ</b><p>เพิ่มรายการใน editor</p></article>`}</div></section>`;
    }).join("");
  }

  function render() {
    renderSectionList();
    renderEditor();
    renderPreview();
  }

  document.addEventListener("click", (event) => {
    const moveBtn = event.target.closest("[data-move]");
    if (moveBtn) move(moveBtn.dataset.move, Number(moveBtn.dataset.dir));
    const edit = event.target.closest("[data-edit]");
    if (edit) { selected = edit.dataset.edit; render(); }
    const remove = event.target.closest("[data-remove-item]");
    if (remove) { current().items.splice(Number(remove.dataset.removeItem), 1); render(); }
    const moveItem = event.target.closest("[data-move-item]");
    if (moveItem) {
      const section = current();
      const index = Number(moveItem.dataset.moveItem);
      const next = index + Number(moveItem.dataset.dir);
      if (section.items && next >= 0 && next < section.items.length) {
        [section.items[index], section.items[next]] = [section.items[next], section.items[index]];
        section.items.forEach((item, itemIndex) => { item.sort_order = itemIndex + 1; });
        render();
      }
    }
    const clearImage = event.target.closest("[data-clear-section-image]");
    if (clearImage) { delete current().image_url; delete current().image_public_id; render(); }
    const moveFeatured = event.target.closest("[data-move-featured-item]");
    if (moveFeatured) {
      const section = current();
      const ids = (Array.isArray(section.item_ids) ? section.item_ids : []).map(String);
      const id = moveFeatured.dataset.moveFeaturedItem;
      const index = ids.indexOf(id);
      const next = index + Number(moveFeatured.dataset.dir);
      if (index >= 0 && next >= 0 && next < ids.length) {
        [ids[index], ids[next]] = [ids[next], ids[index]];
        section.item_ids = ids;
        render();
      }
    }
    if (event.target.id === "retryCatalog") retryLoadCatalogItems();
    if (event.target.id === "addItem") {
      current().items = current().items || [];
      if (current().type === "quick" && current().items.length >= 4) { setStatus("Quick จำกัด 4 รายการ", "bad"); return; }
      if (current().type === "promo_banner" && current().items.length >= 8) { setStatus("Promo banner จำกัด 8 รายการ", "bad"); return; }
      current().items.push(current().type === "promo_banner" ? { title: "", body: "", image_url: "", alt_text: "", aspect_mode: "contain" } : { title: "", body: "", url: "" });
      render();
    }
    if (event.target.id === "addHeroSlide") {
      current().items = current().items || [];
      if (current().items.length >= 5) { setStatus("Hero จำกัด 5 slides", "bad"); return; }
      current().items.push({
        kicker: current().kicker || "",
        title: current().title || "",
        body: current().body || "",
        focal_position: current().focal_position || "center",
        cta_primary: { ...(current().cta_primary || {}) },
        cta_secondary: { ...(current().cta_secondary || {}) },
      });
      render();
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    const section = current();
    if (target.matches("[data-field]")) section[target.dataset.field] = target.value;
    if (target.matches("[data-cta]")) { section[target.dataset.cta] = section[target.dataset.cta] || {}; section[target.dataset.cta][target.dataset.prop] = target.value; }
    if (target.matches("[data-hero-cta]")) {
      const item = section.items[Number(target.dataset.heroCta)];
      if (!item) return;
      const ctaName = target.dataset.ctaName;
      item[ctaName] = item[ctaName] || {};
      item[ctaName][target.dataset.prop] = target.value;
      if (target.dataset.prop === "route") { delete item[ctaName].url; delete item[ctaName].action; }
      if (target.dataset.prop === "url") { delete item[ctaName].route; delete item[ctaName].action; }
    }
    if (target.matches("[data-item]")) section.items[Number(target.dataset.item)][target.dataset.prop] = target.value;
    if (target.matches("[data-featured-limit]")) section.featured_limit = Math.max(1, Math.min(12, Number(target.value) || 8));
    renderPreview();
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("select[data-item]")) { current().items[Number(target.dataset.item)][target.dataset.prop] = target.value; renderPreview(); }
    if (target.matches("select[data-field]")) { current()[target.dataset.field] = target.value; renderPreview(); }
    if (target.matches("[data-toggle]")) {
      const section = sections().find((row) => row.id === target.dataset.toggle);
      if (section) section.enabled = target.checked;
      renderPreview();
    }
    if (target.id === "sectionPicker") { selected = target.value; render(); }
    if (target.matches("[data-upload]")) uploadImage(target, Number(target.dataset.upload)).catch((error) => setStatus(error.message, "bad"));
    if (target.matches("[data-upload-section]")) uploadImage(target, target.dataset.uploadSection).catch((error) => setStatus(error.message, "bad"));
    if (target.matches("[data-featured-mode]")) { current().featured_mode = target.value; render(); }
    if (target.matches("[data-featured-bool]")) { current()[target.dataset.featuredBool] = target.checked; renderPreview(); }
    if (target.matches("[data-featured-item]")) {
      const section = current();
      section.item_ids = Array.isArray(section.item_ids) ? section.item_ids : [];
      const id = target.dataset.featuredItem;
      if (target.checked) {
        if (!section.item_ids.includes(id)) section.item_ids.push(id);
      } else {
        section.item_ids = section.item_ids.filter((value) => value !== id);
      }
      render();
    }
    if (target.matches("[data-item-enabled]")) {
      const item = current().items[Number(target.dataset.itemEnabled)];
      if (!item) return;
      item.enabled = target.checked;
      renderPreview();
    }
    if (target.matches("[data-item-target]")) {
      const item = current().items[Number(target.dataset.itemTarget)];
      if (!item) return;
      delete item.route;
      delete item.url;
      delete item.action;
      if (target.value === "contact") item.action = "contact";
      if (target.value === "route") item.route = "home";
      if (target.value === "url") item.url = "";
      render();
    }
    if (target.matches("[data-hero-cta-target]")) {
      const item = current().items[Number(target.dataset.heroCtaTarget)];
      if (!item) return;
      const ctaName = target.dataset.ctaName;
      item[ctaName] = item[ctaName] || {};
      delete item[ctaName].route;
      delete item[ctaName].url;
      delete item[ctaName].action;
      if (target.value === "route") item[ctaName].route = "home";
      if (target.value === "url") item[ctaName].url = "";
      render();
    }
  });

  $("saveDraft").addEventListener("click", () => saveDraft().catch((error) => setStatus(error.message, "bad")));
  $("publish").addEventListener("click", () => publish().catch((error) => setStatus(error.message, "bad")));
  $("reload").addEventListener("click", () => load().catch((error) => setStatus(error.message, "bad")));
  load().catch((error) => { config = clone(DEFAULT_CONFIG); render(); setStatus(error.message, "bad"); });
})();
