(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    version: 1,
    sections: [
      { id: "hero", type: "hero", enabled: true, sort_order: 10, kicker: "Coldwindflow", title: "ดูแลแอร์ง่าย จองงานได้ในไม่กี่ขั้นตอน", body: "จองล้างแอร์ ติดตามงาน และรับประกาศสำคัญจาก CWF ได้ในหน้าเดียว", cta_primary: { label: "จองล้างแอร์", route: "scheduled" }, cta_secondary: { label: "ติดตามงาน", route: "tracking" }, items: [] },
      { id: "quick", type: "quick", enabled: true, sort_order: 20, title: "เมนูด่วน", body: "", items: [{ title: "จองล้างแอร์", route: "scheduled", icon: "sparkle" }, { title: "แจ้งซ่อม", action: "contact", icon: "wrench" }, { title: "ติดตามงาน", route: "tracking", icon: "pin" }, { title: "LINE", url: "https://lin.ee/fG1Oq7y", icon: "chat" }] },
      { id: "announcements", type: "announcements", enabled: true, sort_order: 30, title: "ข่าวและประกาศ CWF", body: "", items: [] },
      { id: "featured_services", type: "featured_services", enabled: true, sort_order: 40, title: "บริการแนะนำ", body: "ราคาและรายละเอียดจาก Catalog", items: [] },
      { id: "updates", type: "updates", enabled: true, sort_order: 50, title: "ภาพกิจกรรมและโพสต์", body: "เชื่อมต่อไปยัง Facebook", items: [] },
      { id: "articles", type: "articles", enabled: true, sort_order: 60, title: "บทความแนะนำ", body: "อ่านต่อบน cwf-air.com", items: [] },
      { id: "trust", type: "trust", enabled: true, sort_order: 70, title: "มาตรฐานที่ลูกค้าวางใจ", body: "", items: [{ title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" }, { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" }, { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" }, { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" }] },
    ],
  };
  let config = clone(DEFAULT_CONFIG);
  let selected = "hero";

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[s]));
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
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
    config = data.draft_config || clone(DEFAULT_CONFIG);
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
    return `
      <div class="item">
        <h3>รายการ ${index + 1}</h3>
        <div class="two">
          <label>หัวข้อ<input data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
          <label>ป้าย/วันที่<input data-item="${index}" data-prop="tag" value="${esc(item.tag || item.date_label || "")}"></label>
        </div>
        <label>คำอธิบาย<textarea data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
        <label>${external ? "External URL" : "Route / URL"}<input data-item="${index}" data-prop="${external ? "url" : "route"}" value="${esc(external ? item.url || "" : item.route || item.url || "")}"></label>
        <label>Image URL<input data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}"></label>
        <div class="two">
          <label>Active from<input data-item="${index}" data-prop="active_from" value="${esc(item.active_from || "")}" placeholder="YYYY-MM-DD"></label>
          <label>Active to<input data-item="${index}" data-prop="active_to" value="${esc(item.active_to || "")}" placeholder="YYYY-MM-DD"></label>
        </div>
        <label>อัปโหลดรูป<input type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
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
        <div class="two">
          <label>ปุ่มหลัก<input data-cta="cta_primary" data-prop="label" value="${esc(section.cta_primary?.label || "")}"></label>
          <label>Route ปุ่มหลัก<input data-cta="cta_primary" data-prop="route" value="${esc(section.cta_primary?.route || "")}"></label>
        </div>
        <div class="two">
          <label>ปุ่มรอง<input data-cta="cta_secondary" data-prop="label" value="${esc(section.cta_secondary?.label || "")}"></label>
          <label>Route ปุ่มรอง<input data-cta="cta_secondary" data-prop="route" value="${esc(section.cta_secondary?.route || "")}"></label>
        </div>
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
    section.items[itemIndex].image_url = data.image_url;
    section.items[itemIndex].image_public_id = data.image_public_id;
    render();
    setStatus("อัปโหลดรูปแล้ว", "ok");
  }

  function renderPreview() {
    const hero = sections().find((section) => section.type === "hero");
    const quick = sections().find((section) => section.type === "quick");
    const manual = sections().filter((section) => section.enabled !== false && ["announcements", "updates", "articles", "trust"].includes(section.type));
    $("preview").innerHTML = `
      <section class="hero"><small>${esc(hero?.kicker || "Coldwindflow")}</small><h3>${esc(hero?.title || "")}</h3><p>${esc(hero?.body || "")}</p></section>
      <section class="quick">${(quick?.items || []).slice(0, 4).map((item) => `<div>${esc(item.title || "")}</div>`).join("")}</section>
      ${manual.map((section) => `<section class="sec"><div class="sec-head"><div><b>${esc(section.title || "")}</b><br><span>${esc(section.body || "")}</span></div><span>ดูทั้งหมด</span></div><div class="cards">${(section.items || []).slice(0, 3).map((item) => `<article class="card"><b>${esc(item.title || "")}</b><p>${esc(item.body || "")}</p></article>`).join("") || `<article class="card"><b>ไม่มีรายการ</b><p>เพิ่มรายการใน editor</p></article>`}</div></section>`).join("")}
    `;
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
    if (event.target.id === "addItem") { current().items = current().items || []; current().items.push({ title: "", body: "", url: "" }); render(); }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    const section = current();
    if (target.matches("[data-field]")) section[target.dataset.field] = target.value;
    if (target.matches("[data-cta]")) { section[target.dataset.cta] = section[target.dataset.cta] || {}; section[target.dataset.cta][target.dataset.prop] = target.value; }
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
  });

  $("saveDraft").addEventListener("click", () => saveDraft().catch((error) => setStatus(error.message, "bad")));
  $("publish").addEventListener("click", () => publish().catch((error) => setStatus(error.message, "bad")));
  $("reload").addEventListener("click", () => load().catch((error) => setStatus(error.message, "bad")));
  load().catch((error) => { config = clone(DEFAULT_CONFIG); render(); setStatus(error.message, "bad"); });
})();
