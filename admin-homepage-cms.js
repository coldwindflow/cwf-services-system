(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    version: 1,
    sections: [
      { id: "hero", type: "hero", enabled: true, sort_order: 10, kicker: "Coldwindflow", title: "ดูแลแอร์ง่าย จองงานได้ในไม่กี่ขั้นตอน", body: "จองล้างแอร์ ติดตามงาน และรับประกาศสำคัญจาก CWF ได้ในหน้าเดียว", cta_primary: { label: "จองล้างแอร์", route: "scheduled" }, cta_secondary: { label: "ติดตามงาน", route: "tracking" }, items: [] },
      { id: "quick", type: "quick", enabled: true, sort_order: 20, title: "เมนูด่วน", body: "", items: [{ title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" }, { title: "แจ้งซ่อม", action: "contact", icon: "wrench" }, { title: "ติดตามงาน", route: "tracking", icon: "pin" }, { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "chat" }] },
      { id: "active_job", type: "active_job", enabled: true, sort_order: 30, title: "Active job", body: "", items: [] },
      { id: "announcements", type: "announcements", enabled: true, sort_order: 40, title: "ข่าวและประกาศ CWF", body: "", items: [{ title: "ติดต่อทีม CWF", action: "contact", body: "สอบถามบริการหรือแจ้งข้อมูลเพิ่มเติมกับแอดมิน" }] },
      { id: "featured_services", type: "featured_services", enabled: true, sort_order: 50, title: "บริการแนะนำ", body: "ราคาและรายละเอียดจาก Catalog", items: [] },
      { id: "updates", type: "updates", enabled: true, sort_order: 60, title: "ภาพกิจกรรมและโพสต์", body: "", items: [] },
      { id: "articles", type: "articles", enabled: true, sort_order: 70, title: "บทความแนะนำ", body: "", items: [] },
      { id: "trust", type: "trust", enabled: true, sort_order: 80, title: "มาตรฐานที่ลูกค้าวางใจ", body: "", items: [{ title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" }, { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" }, { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" }, { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" }] },
    ],
  };
  let config = clone(DEFAULT_CONFIG);
  let selected = "hero";
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
    const targetEditable = quick || sectionType === "announcements";
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
        <div class="two">
          <label>หัวข้อ<input data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
          <label>ป้าย/วันที่<input data-item="${index}" data-prop="tag" value="${esc(item.tag || item.date_label || "")}"></label>
        </div>
        <label>คำอธิบาย<textarea data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
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
        <div>
          <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === total - 1 ? "disabled" : ""}>↓</button>
        </div>
        <label>Kicker<input data-item="${index}" data-prop="kicker" value="${esc(item.kicker || "")}"></label>
        <label>Title<input data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
        <label>Body<textarea data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
        <label>Image URL<input data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}" placeholder="https://..."></label>
        <label>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
        ${ctaEditor(item.cta_primary, index, "cta_primary", "Primary CTA")}
        ${ctaEditor(item.cta_secondary, index, "cta_secondary", "Secondary CTA")}
        <button class="btn danger" type="button" data-remove-item="${index}">ลบรายการ</button>
      </div>
    `;
  }

  function renderEditor() {
    const section = current();
    if (!section) return;
    const itemTypes = ["announcements", "updates", "articles", "trust", "quick"];
    $("editor").innerHTML = `
      ${field("ชื่อ Section", "title")}
      ${field("คำอธิบาย", "body", "textarea")}
      ${section.type === "hero" ? `
        ${field("Kicker", "kicker")}
        <label>Hero Image URL<input data-field="image_url" value="${esc(section.image_url || "")}"></label>
        <label>Hero Image Upload<input type="file" accept="image/jpeg,image/png,image/webp" data-upload-section="hero"></label>
        ${section.image_url ? `<button class="btn danger" type="button" data-clear-section-image="hero">Remove hero image</button>` : ""}
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
        ${(section.items || []).map((item, index) => itemEditor(item, index, section.type)).join("")}
      ` : ""}
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
        const slides = Array.isArray(section.items) && section.items.length ? section.items : [section];
        return `<section class="hero">${slides.map((slide) => `<div ${slide.image_url ? `style="background-image:linear-gradient(rgba(7,27,56,.62),rgba(7,27,56,.62)),url('${esc(slide.image_url)}');background-size:cover;background-position:center"` : ""}><small>${esc(slide.kicker || section.kicker || "Coldwindflow")}</small><h3>${esc(slide.title || section.title || "")}</h3><p>${esc(slide.body || section.body || "")}</p></div>`).join("")}</section>`;
      }
      if (section.type === "quick") return `<section class="quick">${(section.items || []).slice(0, 4).map((item) => `<div>${esc(item.title || "")}</div>`).join("")}</section>`;
      if (section.type === "active_job") return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>Shown only when the logged-in customer has an active job</span></div></div></section>`;
      if (section.type === "featured_services") return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>${esc(section.body || "")}</span></div></div><div class="cards"><article class="card"><b>Featured services</b><p>Catalog cards render here in the Customer App</p></article></div></section>`;
      return `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>${esc(section.body || "")}</span></div><span>ดูทั้งหมด</span></div><div class="cards">${(section.items || []).slice(0, 3).map((item) => `<article class="card"><b>${esc(item.title || "")}</b><p>${esc(item.body || "")}</p></article>`).join("") || `<article class="card"><b>ไม่มีรายการ</b><p>เพิ่มรายการใน editor</p></article>`}</div></section>`;
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
    if (event.target.id === "addItem") {
      current().items = current().items || [];
      if (current().type === "quick" && current().items.length >= 4) { setStatus("Quick จำกัด 4 รายการ", "bad"); return; }
      current().items.push({ title: "", body: "", url: "" });
      render();
    }
    if (event.target.id === "addHeroSlide") {
      current().items = current().items || [];
      if (current().items.length >= 5) { setStatus("Hero จำกัด 5 slides", "bad"); return; }
      current().items.push({
        kicker: current().kicker || "",
        title: current().title || "",
        body: current().body || "",
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
    renderPreview();
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-toggle]")) {
      const section = sections().find((row) => row.id === target.dataset.toggle);
      if (section) section.enabled = target.checked;
      renderPreview();
    }
    if (target.id === "sectionPicker") { selected = target.value; render(); }
    if (target.matches("[data-upload]")) uploadImage(target, Number(target.dataset.upload)).catch((error) => setStatus(error.message, "bad"));
    if (target.matches("[data-upload-section]")) uploadImage(target, target.dataset.uploadSection).catch((error) => setStatus(error.message, "bad"));
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
