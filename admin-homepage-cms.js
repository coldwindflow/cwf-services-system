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
      { id: "featured_services", type: "featured_services", enabled: true, sort_order: 50, title: "บริการแนะนำ", body: "ราคาและรายละเอียดจาก Catalog", featured_mode: "auto", featured_limit: 6, show_price: true, show_badge: true, item_ids: [], items: [] },
      { id: "updates", type: "updates", enabled: true, sort_order: 60, title: "ภาพกิจกรรมและโพสต์", body: "", items: [] },
      { id: "articles", type: "articles", enabled: true, sort_order: 70, title: "บทความแนะนำ", body: "", items: [] },
      { id: "social", type: "social", enabled: true, sort_order: 75, title: "ติดตามเราบนโซเชียล", body: "อัปเดตล่าสุดจาก Facebook และ YouTube ของ Coldwindflow", items: [] },
      { id: "trust", type: "trust", enabled: true, sort_order: 80, title: "มาตรฐานที่ลูกค้าวางใจ", body: "", items: [{ title: "แจ้งราคาก่อนทำ", body: "ระบบคำนวณจากข้อมูลบริการจริง" }, { title: "ช่างผ่านมาตรฐาน", body: "ทีมงานได้รับการตรวจสอบก่อนรับงาน" }, { title: "ติดตามงานได้", body: "ดูสถานะสำคัญด้วย Booking Code" }, { title: "ติดต่อแอดมินง่าย", body: "รองรับ LINE และโทรศัพท์" }] },
    ],
    // Per-page rollout switches for Customer App V2. All-enabled by default; a
    // page turned off here is hidden + unreachable in the app. This is a UI
    // rollout control only — it never replaces the server booking kill switches.
    page_availability: { home: true, store: true, booking: true, scheduled: true, urgent: true, tracking: true, profile: true },
  };

  // Customer App pages that can be toggled, in display order. Labels/hints are
  // Thai. `scheduled`/`urgent` note the server kill-switch relationship.
  const PAGE_AVAILABILITY_KEYS = ["home", "store", "booking", "scheduled", "urgent", "tracking", "profile"];
  const PAGE_AVAILABILITY_META = {
    home: ["หน้าแรก", "หน้าแรกของแอป (แบนเนอร์ เมนูด่วน ทางลัด)"],
    store: ["ร้านค้า", "แคตตาล็อกสินค้า/บริการ และหน้ารายละเอียดสินค้า"],
    booking: ["เลือกประเภทการจอง", "หน้ารวมที่ให้ลูกค้าเลือกจองล่วงหน้าหรือคิวด่วน"],
    scheduled: ["จองล่วงหน้า", "ฟอร์มจองล้างแอร์ล่วงหน้า — ต้องเปิด kill switch ฝั่งเซิร์ฟเวอร์ด้วยจึงจะจองสำเร็จ"],
    urgent: ["คิวด่วน", "ส่งคำขอด่วนให้ช่างกดรับ — ต้องเปิด kill switch ฝั่งเซิร์ฟเวอร์ด้วยจึงจะส่งได้"],
    tracking: ["ติดตามงาน", "หน้าติดตามงาน และเป็นปลายทางของลิงก์ยืนยันนัดหมายที่ส่งให้ลูกค้า"],
    profile: ["บัญชีลูกค้า", "หน้าโปรไฟล์และประวัติงานของลูกค้า"],
  };

  // Legacy/missing → all enabled. Present keys coerced to booleans; a missing
  // key defaults to enabled (never silently disable a page).
  function normalizePageAvailability(raw) {
    const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const out = {};
    PAGE_AVAILABILITY_KEYS.forEach((key) => { out[key] = key in src ? src[key] === true : true; });
    return out;
  }

  // Pure decision for a page-availability toggle. Turning a page OFF is refused
  // when it is the LAST enabled page, so the UI can never reach an all-disabled
  // state (backend validation + publish guard remain as defense-in-depth).
  // Returns true when the toggle is allowed to apply.
  function pageAvailabilityToggleAllowed(pa, key, checked) {
    if (checked) return true;
    if (pa[key] !== true) return true; // already off — no-op, harmless
    const enabledCount = PAGE_AVAILABILITY_KEYS.filter((route) => pa[route] === true).length;
    return enabledCount > 1;
  }

  const TYPE_ICONS = {
    hero: "🏠", quick: "⚡", promo_banner: "🎨",
    active_job: "🔧", announcements: "📣", featured_services: "⭐",
    updates: "📸", articles: "📝", social: "📱", trust: "🛡️",
    testimonials: "💬", faq: "❓",
  };
  // Thai labels for the "add section" picker.
  const SECTION_TYPE_LABELS = {
    hero: "Hero แบนเนอร์หลัก", quick: "เมนูด่วน", promo_banner: "แบนเนอร์โปรโมชัน",
    active_job: "งานที่กำลังทำ", announcements: "ข่าว/ประกาศ", featured_services: "บริการแนะนำ",
    updates: "ภาพกิจกรรม/โพสต์", articles: "บทความ", social: "โซเชียล", trust: "จุดเด่น/ความน่าเชื่อถือ",
    testimonials: "รีวิวลูกค้า", faq: "คำถามที่พบบ่อย (FAQ)",
  };
  // Starter templates for section types not in the default homepage layout, so
  // "add section" seeds them with useful example content.
  const EXTRA_SECTION_TEMPLATES = {
    testimonials: { title: "ลูกค้าพูดถึงเรา", body: "", items: [
      { title: "คุณเอ", tag: "ลูกค้าคอนโด", rating: 5, body: "ช่างสุภาพ ทำงานสะอาด ประทับใจมากครับ" },
      { title: "คุณบี", tag: "ลูกค้าบ้าน", rating: 5, body: "จองง่าย ตรงเวลา ราคาชัดเจน แนะนำเลย" },
    ] },
    faq: { title: "คำถามที่พบบ่อย", body: "", items: [
      { title: "ล้างแอร์ใช้เวลานานไหม?", body: "โดยทั่วไปประมาณ 45–90 นาทีต่อเครื่อง ขึ้นกับชนิดและความสกปรก" },
      { title: "มีรับประกันงานหรือไม่?", body: "รับประกันงานบริการ 7 วันหลังให้บริการ" },
    ] },
  };

  let config = clone(DEFAULT_CONFIG);
  let selected = "hero";
  let activeTab = "sections";
  let catalogItems = null;
  let catalogLoadFailed = false;
  let articleSyncStatus = null;
  let articleSyncStatusLoading = false;
  const ROUTE_OPTIONS = ["home", "store", "scheduled", "urgent", "tracking", "profile"];
  // Per-page header banners: [key, nav label, icon]. Managed separately from
  // homepage sections but reuse the hero slide editor for their slides.
  const PAGE_HEADER_META = [["store", "Head: ร้านค้า", "🛍️"], ["booking", "Head: จองคิว", "📅"], ["tracking", "Head: ติดตามงาน", "📍"]];

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[s]));
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function standardSections() { return clone(DEFAULT_CONFIG).sections; }
  function normalizeAdminConfig(value) {
    const next = value && Array.isArray(value.sections) && value.sections.length ? clone(value) : clone(DEFAULT_CONFIG);
    const validTypes = new Set(standardSections().map((std) => std.type));
    // Respect exactly what was saved (so admin add/duplicate/delete stick) —
    // only drop sections of unknown types, and fall back to defaults if empty.
    next.sections = next.sections.filter((section) => section && validTypes.has(section.type));
    if (!next.sections.length) next.sections = standardSections();
    // Ensure ids are unique so per-id lookups (edit/move/duplicate/delete) are
    // unambiguous even if an imported config had collisions.
    const seen = new Set();
    next.sections.forEach((section) => {
      let id = section.id || section.type;
      let n = 2;
      while (seen.has(id)) id = `${section.type}-${n++}`;
      section.id = id;
      seen.add(id);
    });
    const rawHeaders = next.page_headers && typeof next.page_headers === "object" ? next.page_headers : {};
    next.page_headers = {};
    PAGE_HEADER_META.forEach(([key]) => {
      const header = rawHeaders[key] && typeof rawHeaders[key] === "object" ? rawHeaders[key] : {};
      next.page_headers[key] = {
        enabled: header.enabled !== false,
        kicker: header.kicker || "",
        title: header.title || "",
        body: header.body || "",
        focal_position: header.focal_position || "center",
        items: Array.isArray(header.items) ? header.items : [],
      };
    });
    next.theme = next.theme && typeof next.theme === "object" && !Array.isArray(next.theme) ? next.theme : {};
    next.page_availability = normalizePageAvailability(next.page_availability);
    return next;
  }
  function setStatus(text, kind) { $("status").textContent = text; $("status").className = `status-chip ${kind || ""}`; }
  function sections() { return config.sections.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)); }

  const MAX_SECTIONS = 24;
  // A fresh id for a new/duplicated section: the type itself when free, else
  // type-2, type-3, ... so per-id lookups stay unambiguous.
  function uniqueSectionId(type) {
    const ids = new Set(config.sections.map((s) => s.id));
    if (!ids.has(type)) return type;
    let n = 2;
    while (ids.has(`${type}-${n}`)) n += 1;
    return `${type}-${n}`;
  }
  // Re-space sort_order to clean multiples of 10 in current visual order, so
  // inserts/duplicates land predictably and the move buttons keep working.
  function renumberSections() {
    sections().forEach((section, index) => { section.sort_order = (index + 1) * 10; });
  }
  function addSection(type) {
    if (!SECTION_TYPE_LABELS[type]) return;
    if (config.sections.length >= MAX_SECTIONS) { setStatus(`จำกัดสูงสุด ${MAX_SECTIONS} Section`, "bad"); return; }
    const template = clone(
      DEFAULT_CONFIG.sections.find((s) => s.type === type)
      || EXTRA_SECTION_TEMPLATES[type]
      || { type, title: "", items: [] });
    template.type = type;
    template.id = uniqueSectionId(type);
    template.enabled = true;
    template.sort_order = Math.max(0, ...config.sections.map((s) => Number(s.sort_order || 0))) + 10;
    config.sections.push(template);
    renumberSections();
    selected = template.id;
    render();
    setStatus(`เพิ่ม Section: ${SECTION_TYPE_LABELS[type]}`, "ok");
  }
  function duplicateSection(id) {
    const src = config.sections.find((s) => s.id === id);
    if (!src) return;
    if (config.sections.length >= MAX_SECTIONS) { setStatus(`จำกัดสูงสุด ${MAX_SECTIONS} Section`, "bad"); return; }
    const copy = clone(src);
    copy.id = uniqueSectionId(src.type);
    if (src.title) copy.title = `${src.title} (สำเนา)`;
    copy.sort_order = Number(src.sort_order || 0) + 1;
    config.sections.push(copy);
    renumberSections();
    selected = copy.id;
    render();
    setStatus("ทำซ้ำ Section แล้ว", "ok");
  }
  function deleteSection(id) {
    if (config.sections.length <= 1) { setStatus("ต้องมีอย่างน้อย 1 Section", "bad"); return; }
    const idx = config.sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    config.sections.splice(idx, 1);
    if (selected === id) selected = config.sections[Math.max(0, idx - 1)].id;
    renumberSections();
    render();
    setStatus("ลบ Section แล้ว", "ok");
  }
  function populateSectionTypePicker() {
    const el = $("newSectionType");
    if (!el) return;
    el.innerHTML = Object.keys(SECTION_TYPE_LABELS).map((type) =>
      `<option value="${type}">${TYPE_ICONS[type] || "📄"} ${esc(SECTION_TYPE_LABELS[type])}</option>`).join("");
  }
  function headKey() { return typeof selected === "string" && selected.startsWith("head:") ? selected.slice(5) : null; }
  function currentHead() { const key = headKey(); return key && config.page_headers ? config.page_headers[key] || null : null; }
  // current() resolves to the selected page-header object when a "head:*" entry
  // is active, so the shared hero handlers (fields, slides, upload) operate on it.
  function current() {
    const head = currentHead();
    if (head) return head;
    return sections().find((section) => section.id === selected) || sections()[0];
  }

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
    if (!response.ok) {
      const detail = Array.isArray(data.details) && data.details.length ? data.details.slice(0, 3).join(" · ") : null;
      throw new Error(detail || data.error || `HTTP ${response.status}`);
    }
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
    config.page_availability = normalizePageAvailability(config.page_availability);
    const pa = config.page_availability;
    const enabledCount = PAGE_AVAILABILITY_KEYS.filter((k) => pa[k]).length;
    // Hard guard: refuse to publish an all-disabled app (matches the server,
    // which also rejects it). Steer the admin to the availability editor.
    if (enabledCount === 0) {
      selected = "page-availability";
      render();
      if (window.innerWidth <= 880) switchTab("editor");
      setStatus("ต้องเปิดอย่างน้อย 1 หน้าก่อน Publish", "bad");
      return;
    }
    // Tracking is the destination of the customer confirmation link — confirm
    // before publishing it in the off state.
    if (pa.tracking === false && !window.confirm(
      "คุณกำลังจะปิดหน้า “ติดตามงาน”\n\nลิงก์ยืนยันนัดหมายที่ส่งให้ลูกค้าชี้มาที่หน้านี้ ลูกค้าที่กดลิงก์จะเห็นหน้ากำลังปรับปรุงแทนสถานะงานจริง\n\nยืนยันที่จะ Publish หรือไม่?")) {
      setStatus("ยกเลิกการ Publish", "");
      return;
    }
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

  /* ── section list ── */
  function renderSectionList() {
    const list = sections();
    $("sectionList").innerHTML = list.map((section, index) => `
      <div class="sec-row ${section.id === selected ? "is-active" : ""} ${section.enabled !== false ? "" : "is-disabled"}">
        <div class="sec-row-body" data-edit="${section.id}">
          <div class="sec-icon">${TYPE_ICONS[section.type] || "📄"}</div>
          <div class="sec-info">
            <div class="sec-name">${esc(section.title || section.type)}</div>
            <div class="sec-type">${section.type}</div>
          </div>
        </div>
        <div class="sec-controls">
          <button class="mini" data-move="${section.id}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="mini" data-move="${section.id}" data-dir="1" ${index === list.length - 1 ? "disabled" : ""}>↓</button>
          <label class="tog"><input type="checkbox" data-toggle="${section.id}" ${section.enabled !== false ? "checked" : ""}><span></span></label>
        </div>
      </div>
    `).join("");
    const headers = config.page_headers || {};
    const headerRows = PAGE_HEADER_META.map(([key, label, icon]) => {
      const header = headers[key] || {};
      const rowId = `head:${key}`;
      return `
      <div class="sec-row ${rowId === selected ? "is-active" : ""} ${header.enabled !== false ? "" : "is-disabled"}">
        <div class="sec-row-body" data-edit="${rowId}">
          <div class="sec-icon">${icon}</div>
          <div class="sec-info">
            <div class="sec-name">${esc(label)}</div>
            <div class="sec-type">page header · ${(header.items || []).length} slide</div>
          </div>
        </div>
        <div class="sec-controls">
          <label class="tog"><input type="checkbox" data-head-toggle="${key}" ${header.enabled !== false ? "checked" : ""}><span></span></label>
        </div>
      </div>`;
    }).join("");
    const themeRow = `
      <div class="sec-row ${selected === "theme" ? "is-active" : ""}">
        <div class="sec-row-body" data-edit="theme">
          <div class="sec-icon">🎨</div>
          <div class="sec-info">
            <div class="sec-name">ธีม / สีแบรนด์</div>
            <div class="sec-type">สีทั้งแอป</div>
          </div>
        </div>
      </div>`;
    const availabilityRow = `
      <div class="sec-row ${selected === "page-availability" ? "is-active" : ""}">
        <div class="sec-row-body" data-edit="page-availability">
          <div class="sec-icon">🚦</div>
          <div class="sec-info">
            <div class="sec-name">สถานะหน้าแอปลูกค้า</div>
            <div class="sec-type">เปิด/ปิดหน้าแต่ละหน้า</div>
          </div>
        </div>
      </div>`;
    $("sectionList").innerHTML += `<div class="nav-hd" style="margin-top:8px">แบนเนอร์หัวหน้า (แยกแต่ละหน้า)</div>${headerRows}`
      + `<div class="nav-hd" style="margin-top:8px">การเผยแพร่หน้า</div>${availabilityRow}`
      + `<div class="nav-hd" style="margin-top:8px">รูปลักษณ์</div>${themeRow}`;
    $("sectionPicker").innerHTML = list.map((section) => `<option value="${esc(section.id)}">${esc(section.title || section.type)}</option>`).join("")
      + PAGE_HEADER_META.map(([key, label]) => `<option value="head:${key}">${esc(label)}</option>`).join("")
      + `<option value="page-availability">สถานะหน้าแอปลูกค้า</option>`
      + `<option value="theme">ธีม / สีแบรนด์</option>`;
    $("sectionPicker").value = selected;
  }

  /* ── editor header ── */
  function renderEditorHeader() {
    if (selected === "page-availability") {
      $("editorHeader").innerHTML = `
        <div class="editor-hd">
          <div class="editor-hd-icon">🚦</div>
          <div>
            <div class="editor-hd-title">สถานะหน้าแอปลูกค้า</div>
            <div class="editor-hd-sub">เปิด/ปิดหน้าแต่ละหน้าในแอปลูกค้า · มีผลหลังกด Publish</div>
          </div>
        </div>`;
      return;
    }
    if (selected === "theme") {
      $("editorHeader").innerHTML = `
        <div class="editor-hd">
          <div class="editor-hd-icon">🎨</div>
          <div>
            <div class="editor-hd-title">ธีม / สีแบรนด์</div>
            <div class="editor-hd-sub">เปลี่ยนสีของทั้งแอปลูกค้า</div>
          </div>
        </div>`;
      return;
    }
    const key = headKey();
    if (key) {
      const meta = PAGE_HEADER_META.find(([k]) => k === key) || [key, key, "📄"];
      const header = currentHead() || {};
      $("editorHeader").innerHTML = `
        <div class="editor-hd">
          <div class="editor-hd-icon">${meta[2]}</div>
          <div>
            <div class="editor-hd-title">${esc(meta[1])}</div>
            <div class="editor-hd-sub">page header · ${header.enabled !== false ? "เปิดใช้งานอยู่" : "ปิดอยู่"}</div>
          </div>
        </div>
      `;
      return;
    }
    const section = current();
    if (!section) { $("editorHeader").innerHTML = ""; return; }
    $("editorHeader").innerHTML = `
      <div class="editor-hd">
        <div class="editor-hd-icon">${TYPE_ICONS[section.type] || "📄"}</div>
        <div style="flex:1;min-width:0">
          <div class="editor-hd-title">${esc(section.title || section.type)}</div>
          <div class="editor-hd-sub">${section.type} · ${section.enabled !== false ? "เปิดใช้งานอยู่" : "ปิดอยู่"}</div>
        </div>
        <div class="toolbar">
          <button class="btn btn-ghost btn-sm" type="button" data-duplicate-section="${esc(section.id)}">⧉ ทำซ้ำ</button>
          <button class="btn btn-danger btn-sm" type="button" data-delete-section="${esc(section.id)}">🗑 ลบ Section</button>
        </div>
      </div>
    `;
  }

  /* ── field helpers ── */
  function field(lbl, prop, type) {
    const section = current();
    const value = section[prop] || "";
    if (type === "textarea") return `<label class="field">${lbl}<textarea class="fi" data-field="${prop}">${esc(value)}</textarea></label>`;
    return `<label class="field">${lbl}<input class="fi" data-field="${prop}" value="${esc(value)}"></label>`;
  }

  function selectField(lbl, prop, options) {
    const section = current();
    const value = section[prop] || "";
    const opts = options.map(([v, l]) => `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(l)}</option>`).join("");
    return `<label class="field">${lbl}<select class="fi" data-field="${prop}">${opts}</select></label>`;
  }

  function itemEditor(item, index, sectionType, total) {
    const social = sectionType === "social";
    const external = sectionType === "updates" || sectionType === "articles" || social;
    const trust = sectionType === "trust";
    const quick = sectionType === "quick";
    const promo = sectionType === "promo_banner";
    const targetEditable = quick || sectionType === "announcements" || promo;
    const targetMode = item.url ? "url" : item.action === "contact" ? "contact" : "route";
    const targetField = (() => {
      if (!targetEditable) return "";
      if (targetMode === "contact") return "";
      if (targetMode === "url") return `<label class="field">External URL<input class="fi" data-item="${index}" data-prop="url" value="${esc(item.url || "")}" placeholder="https://..."></label>`;
      return `<label class="field">Internal route<select class="fi" data-item="${index}" data-prop="route">${ROUTE_OPTIONS.map((r) => `<option value="${r}" ${String(item.route || "home") === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>`;
    })();
    // Shared card head (number, move, enable, delete) reused by the focused
    // testimonials / FAQ editors below.
    const itemHead = `
      <div class="item-card-head">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="item-num">${index + 1}</span>
          <span style="font-weight:900;font-size:13px">${sectionType === "faq" ? "คำถาม" : sectionType === "testimonials" ? "รีวิว" : "รายการ"} ${index + 1}</span>
          <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
          <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === total - 1 ? "disabled" : ""}>↓</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <label class="switch"><input type="checkbox" data-item-enabled="${index}" ${item.enabled !== false ? "checked" : ""}> เปิด</label>
          <button class="btn btn-danger btn-sm" type="button" data-remove-item="${index}">ลบ</button>
        </div>
      </div>`;
    if (sectionType === "faq") {
      return `<div class="item-card">${itemHead}<div class="item-card-body">
        <label class="field">คำถาม<input class="fi" data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
        <label class="field">คำตอบ<textarea class="fi" data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
      </div></div>`;
    }
    if (sectionType === "testimonials") {
      const rating = Number(item.rating || 5);
      return `<div class="item-card">${itemHead}<div class="item-card-body">
        <div class="two">
          <label class="field">ชื่อผู้รีวิว<input class="fi" data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
          <label class="field">บทบาท/สถานที่ (ไม่บังคับ)<input class="fi" data-item="${index}" data-prop="tag" value="${esc(item.tag || "")}"></label>
        </div>
        <label class="field">คะแนนดาว<select class="fi" data-item="${index}" data-prop="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${rating === n ? "selected" : ""}>${"★".repeat(n)} (${n})</option>`).join("")}</select></label>
        <label class="field">ข้อความรีวิว<textarea class="fi" data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
        <label class="field">รูปโปรไฟล์ (ไม่บังคับ)<input class="fi" data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}"></label>
        <label class="field">อัปโหลดรูป<input class="fi" type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
      </div></div>`;
    }
    return `
      <div class="item-card">
        <div class="item-card-head">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="item-num">${index + 1}</span>
            <span style="font-weight:900;font-size:13px">รายการ ${index + 1}</span>
            <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === total - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <label class="switch"><input type="checkbox" data-item-enabled="${index}" ${item.enabled !== false ? "checked" : ""}> เปิด</label>
            <button class="btn btn-danger btn-sm" type="button" data-remove-item="${index}">ลบ</button>
          </div>
        </div>
        <div class="item-card-body">
          <div class="two">
            <label class="field">หัวข้อ${promo ? " (ไม่บังคับ)" : ""}<input class="fi" data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
            <label class="field">ป้าย/วันที่<input class="fi" data-item="${index}" data-prop="tag" value="${esc(item.tag || item.date_label || "")}"></label>
          </div>
          <label class="field">คำอธิบาย<textarea class="fi" data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
          ${social ? `<label class="field">แพลตฟอร์ม<select class="fi" data-item="${index}" data-prop="platform"><option value="youtube" ${(item.platform || "youtube") === "youtube" ? "selected" : ""}>YouTube</option><option value="facebook" ${item.platform === "facebook" ? "selected" : ""}>Facebook</option></select></label>` : ""}
          ${promo ? `
            <label class="field">Alt text<input class="fi" data-item="${index}" data-prop="alt_text" value="${esc(item.alt_text || "")}"></label>
            <label class="field">การแสดงภาพ<select class="fi" data-item="${index}" data-prop="aspect_mode"><option value="contain" ${(item.aspect_mode || "contain") === "contain" ? "selected" : ""}>Contain (เห็นเต็ม)</option><option value="cover" ${item.aspect_mode === "cover" ? "selected" : ""}>Cover (เต็มกรอบ)</option></select></label>
          ` : ""}
          ${targetEditable ? `<label class="field">Target type<select class="fi" data-item-target="${index}"><option value="route" ${targetMode === "route" ? "selected" : ""}>Internal route</option><option value="contact" ${targetMode === "contact" ? "selected" : ""}>Contact admin</option><option value="url" ${targetMode === "url" ? "selected" : ""}>External URL</option></select></label>` : ""}
          ${quick ? `<label class="field">Icon<input class="fi" data-item="${index}" data-prop="icon" value="${esc(item.icon || "")}" placeholder="sparkle, wrench, pin, chat, bolt, shield, tag, clock, phone"></label>` : ""}
          ${targetField}
          ${trust || targetEditable ? "" : `<label class="field">${social ? ((item.platform || "youtube") === "facebook" ? "ลิงก์ Facebook (Page URL = Timeline, Post URL = เปิดใหม่)" : "ลิงก์วิดีโอ YouTube") : sectionType === "updates" ? "ลิงก์ (ไม่บังคับ — เว้นว่างได้ถ้าโพสต์แค่รูป)" : sectionType === "articles" ? "ลิงก์บทความ *" : external ? "External URL" : "Route / URL"}<input class="fi" data-item="${index}" data-prop="${external ? "url" : "route"}" value="${esc(external ? item.url || "" : item.route || item.url || "")}" placeholder="${social ? ((item.platform || "youtube") === "facebook" ? "https://www.facebook.com/your-page หรือ https://www.facebook.com/.../posts/..." : "https://www.youtube.com/watch?v=...") : sectionType === "updates" || sectionType === "articles" ? "https://..." : ""}"></label>`}
          ${trust ? "" : `<label class="field">${social ? "Thumbnail (ไม่บังคับ)" : "Image URL"}<input class="fi" data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}"></label>`}
          ${trust ? "" : `
            <div class="two">
              <label class="field">Active from<input class="fi" data-item="${index}" data-prop="active_from" value="${esc(item.active_from || "")}" placeholder="YYYY-MM-DD"></label>
              <label class="field">Active to<input class="fi" data-item="${index}" data-prop="active_to" value="${esc(item.active_to || "")}" placeholder="YYYY-MM-DD"></label>
            </div>
            <label class="field">อัปโหลดรูป<input class="fi" type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
          `}
        </div>
      </div>
    `;
  }

  function ctaEditor(cta, itemIndex, ctaName, label) {
    const value = cta || {};
    const mode = value.url ? "url" : "route";
    const targetField = mode === "url"
      ? `<label class="field">${label} URL<input class="fi" data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="url" value="${esc(value.url || "")}" placeholder="https://..."></label>`
      : `<label class="field">${label} route<select class="fi" data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="route">${ROUTE_OPTIONS.map((r) => `<option value="${r}" ${String(value.route || "home") === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>`;
    return `
      <div class="two">
        <label class="field">${label}<input class="fi" data-hero-cta="${itemIndex}" data-cta-name="${ctaName}" data-prop="label" value="${esc(value.label || "")}"></label>
        <label class="field">${label} target<select class="fi" data-hero-cta-target="${itemIndex}" data-cta-name="${ctaName}"><option value="route" ${mode === "route" ? "selected" : ""}>Internal route</option><option value="url" ${mode === "url" ? "selected" : ""}>External URL</option></select></label>
      </div>
      ${targetField}
    `;
  }

  function heroSlideEditor(item, index, total) {
    return `
      <div class="item-card">
        <div class="item-card-head">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="item-num">${index + 1}</span>
            <span style="font-weight:900;font-size:13px">Slide ${index + 1}</span>
            <button class="mini" type="button" data-move-item="${index}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
            <button class="mini" type="button" data-move-item="${index}" data-dir="1" ${index === total - 1 ? "disabled" : ""}>↓</button>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <label class="switch"><input type="checkbox" data-item-enabled="${index}" ${item.enabled !== false ? "checked" : ""}> เปิด</label>
            <button class="btn btn-danger btn-sm" type="button" data-remove-item="${index}">ลบ</button>
          </div>
        </div>
        <div class="item-card-body">
          <div class="two">
            <label class="field">Kicker<input class="fi" data-item="${index}" data-prop="kicker" value="${esc(item.kicker || "")}"></label>
            <label class="field">ตำแหน่งโฟกัส<select class="fi" data-item="${index}" data-prop="focal_position"><option value="top" ${item.focal_position === "top" ? "selected" : ""}>บน</option><option value="center" ${(item.focal_position || "center") === "center" ? "selected" : ""}>กลาง</option><option value="bottom" ${item.focal_position === "bottom" ? "selected" : ""}>ล่าง</option></select></label>
          </div>
          <label class="field">Title<input class="fi" data-item="${index}" data-prop="title" value="${esc(item.title || "")}"></label>
          <label class="field">Body<textarea class="fi" data-item="${index}" data-prop="body">${esc(item.body || "")}</textarea></label>
          <label class="field">Image URL<input class="fi" data-item="${index}" data-prop="image_url" value="${esc(item.image_url || "")}" placeholder="https://..."></label>
          <label class="field">Upload image<input class="fi" type="file" accept="image/jpeg,image/png,image/webp" data-upload="${index}"></label>
          ${ctaEditor(item.cta_primary, index, "cta_primary", "ปุ่มหลัก")}
          ${ctaEditor(item.cta_secondary, index, "cta_secondary", "ปุ่มรอง")}
        </div>
      </div>
    `;
  }

  async function ensureArticleSyncStatus(sourceUrl) {
    if (!sourceUrl) return;
    if (articleSyncStatusLoading) return;
    if (articleSyncStatus && articleSyncStatus.source_url === sourceUrl) return;
    articleSyncStatusLoading = true;
    try {
      const data = await requestJson(`/admin/homepage-cms/synced-articles?source_url=${encodeURIComponent(sourceUrl)}`);
      articleSyncStatus = { source_url: sourceUrl, count: (data.articles || []).length, last_synced_at: data.last_synced_at || null };
    } catch (_) {
      articleSyncStatus = { source_url: sourceUrl, count: 0, last_synced_at: null, error: true };
    }
    articleSyncStatusLoading = false;
    render();
  }

  async function syncArticlesNow() {
    const section = current();
    if (section.type !== "articles") return;
    if (!section.source_url) { setStatus("กรอก URL เว็บไซต์ต้นทางก่อนซิงค์", "bad"); return; }
    setStatus("กำลังซิงค์บทความ...", "");
    const data = await requestJson("/admin/homepage-cms/sync-articles", {
      method: "POST",
      body: JSON.stringify({ source_url: section.source_url, seed_urls: section.seed_urls || [] }),
    });
    articleSyncStatus = { source_url: section.source_url, count: (data.articles || []).length, last_synced_at: data.last_synced_at || null };
    setStatus(`ซิงค์สำเร็จ ดึงได้ ${data.synced_count} บทความ (พบทั้งหมด ${data.fetched_count})`, "ok");
    render();
  }

  function formatSyncedAt(value) {
    if (!value) return "ยังไม่เคยซิงค์";
    try { return new Date(value).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return "ยังไม่เคยซิงค์"; }
  }

  function articlesAutoSyncEditor(section) {
    const seedUrlsText = (Array.isArray(section.seed_urls) ? section.seed_urls : []).join("\n");
    if (section.source_url) ensureArticleSyncStatus(section.source_url);
    const status = articleSyncStatus && articleSyncStatus.source_url === section.source_url ? articleSyncStatus : null;
    const statusText = articleSyncStatusLoading
      ? "กำลังตรวจสอบสถานะ..."
      : status
        ? (status.error ? "⚠️ ตรวจสอบสถานะไม่สำเร็จ" : `✅ ซิงค์ล่าสุด: ${formatSyncedAt(status.last_synced_at)} · มีบทความ ${status.count} รายการ`)
        : "";
    const hasData = status && !status.error && status.count > 0;
    return `
      <div class="ep">
        <div class="ep-head">🔄 ดึงบทความอัตโนมัติจากเว็บไซต์</div>
        <div class="ep-body">
          <label class="switch"><input type="checkbox" data-auto-sync ${section.auto_sync ? "checked" : ""}> <span>เปิดดึงบทความอัตโนมัติ (sync เป็นระยะ)</span></label>
          <label class="field">URL เว็บไซต์ต้นทาง<input class="fi" data-field="source_url" value="${esc(section.source_url || "")}" placeholder="https://www.cwf-air.com"></label>
          <label class="field">Seed URL สำรอง (ใส่ลิงก์บทความทีละบรรทัด)<textarea class="fi" data-seed-urls>${esc(seedUrlsText)}</textarea></label>
          <div class="toolbar">
            <button class="btn btn-ghost" type="button" id="syncArticlesNow">🔄 ซิงค์ตอนนี้</button>
          </div>
          ${statusText ? `<div class="sync-info ${hasData ? "has-data" : ""}">${esc(statusText)}</div>` : ""}
          ${section.auto_sync ? `<p style="font-size:12px;color:var(--muted);line-height:1.55">เปิดใช้งานแล้ว — ระบบจะดึงบทความให้อัตโนมัติเป็นระยะ รายการที่เพิ่มด้วยมือด้านล่างจะไม่ถูกใช้แสดงผลจริงขณะเปิดโหมดนี้</p>` : ""}
        </div>
      </div>
    `;
  }

  function renderHeadEditor() {
    const header = currentHead();
    if (!header) { $("editor").innerHTML = ""; return; }
    const slides = header.items || [];
    $("editor").innerHTML = `
      <div class="ep">
        <div class="ep-head">ข้อมูลแบนเนอร์หัวหน้า</div>
        <div class="ep-body">
          <p style="font-size:12px;color:var(--muted);line-height:1.5">แบนเนอร์นี้จะแสดงบนหัวของหน้านี้เท่านั้น เพิ่มรูปได้หลายสไลด์ (เลื่อนอัตโนมัติ) และกำหนดปุ่ม/ลิงก์ให้แต่ละสไลด์ได้</p>
          ${field("Kicker (ป้ายเล็กบนสุด)", "kicker")}
          ${field("หัวข้อ", "title")}
          ${field("คำอธิบาย", "body", "textarea")}
          <label class="field">ตำแหน่งโฟกัสภาพ<select class="fi" data-field="focal_position"><option value="top" ${header.focal_position === "top" ? "selected" : ""}>บน</option><option value="center" ${(header.focal_position || "center") === "center" ? "selected" : ""}>กลาง</option><option value="bottom" ${header.focal_position === "bottom" ? "selected" : ""}>ล่าง</option></select></label>
        </div>
      </div>
      <div class="ep">
        <div class="ep-head">สไลด์รูปภาพ (${slides.length}/5)<div class="toolbar" style="display:inline-flex;margin-left:10px"><button class="btn btn-ghost btn-sm" type="button" id="addHeroSlide">+ เพิ่มสไลด์</button></div></div>
        <div class="ep-body">
          ${slides.length ? slides.map((item, index) => heroSlideEditor(item, index, slides.length)).join("") : `<p style="color:var(--muted);font-size:13px">ยังไม่มีสไลด์ — กด "เพิ่มสไลด์" แล้วอัปโหลดรูป</p>`}
        </div>
      </div>
    `;
  }

  const THEME_PRESETS = [
    { label: "CWF น้ำเงิน (ค่าเริ่มต้น)", primary: "#1659e0", accent: "#3d8bff", highlight: "#ffd23b" },
    { label: "เขียวมินต์", primary: "#0f9d76", accent: "#33c39a", highlight: "#ffd23b" },
    { label: "ม่วงพรีเมียม", primary: "#5b3bd4", accent: "#8a6cff", highlight: "#ffcf3b" },
    { label: "ส้มพลังงาน", primary: "#e0562a", accent: "#ff8a3d", highlight: "#ffd23b" },
    { label: "ชมพูสดใส", primary: "#d6296e", accent: "#ff5c9a", highlight: "#ffd23b" },
    { label: "เทาเข้มหรู", primary: "#2b3a55", accent: "#5a6b8c", highlight: "#f4b740" },
  ];
  function themeColorRow(key, label, hint) {
    const value = (config.theme || {})[key] || "";
    return `
      <label class="field">${esc(label)}
        <div style="display:flex;gap:10px;align-items:center">
          <input type="color" data-theme-color="${key}" value="${esc(value || "#1659e0")}" style="width:52px;height:40px;padding:2px;border-radius:10px;border:1.5px solid var(--line);background:#fff;cursor:pointer">
          <input class="fi" data-theme-hex="${key}" value="${esc(value)}" placeholder="ค่าเริ่มต้น (เว้นว่าง)" style="flex:1" maxlength="7">
        </div>
        <span style="font-size:11px;color:var(--muted)">${esc(hint)}</span>
      </label>`;
  }
  function renderThemeEditor() {
    const theme = config.theme || {};
    $("editor").innerHTML = `
      <div class="ep">
        <div class="ep-head">สีแบรนด์ (มีผลทั้งแอปลูกค้า)</div>
        <div class="ep-body">
          <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:0 0 6px">เว้นว่างทุกช่อง = ใช้สีเริ่มต้นของ CWF · ระบบจะสร้างเฉดอ่อนให้อัตโนมัติจากสีหลัก</p>
          ${themeColorRow("primary", "สีหลัก (ปุ่ม/ลิงก์/ไฮไลต์)", "ใช้กับปุ่มจอง ลิงก์ และองค์ประกอบหลัก")}
          ${themeColorRow("accent", "สีเสริม (ไล่เฉด/ไอคอน)", "ใช้ไล่โทนกับสีหลัก เว้นว่าง = สร้างจากสีหลัก")}
          ${themeColorRow("highlight", "สีเน้น (ปุ่มจองวงกลม/ป้าย)", "สีเหลืองปุ่มจองลอยและ kicker")}
          <div class="toolbar" style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" type="button" id="resetTheme">↺ กลับค่าเริ่มต้น</button>
          </div>
        </div>
      </div>
      <div class="ep">
        <div class="ep-head">ธีมสำเร็จรูป</div>
        <div class="ep-body">
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${THEME_PRESETS.map((p, i) => `
              <button class="btn btn-ghost btn-sm" type="button" data-theme-preset="${i}" style="display:flex;align-items:center;gap:8px">
                <span style="display:inline-flex;gap:2px">
                  <span style="width:14px;height:14px;border-radius:4px;background:${p.primary}"></span>
                  <span style="width:14px;height:14px;border-radius:4px;background:${p.accent}"></span>
                  <span style="width:14px;height:14px;border-radius:4px;background:${p.highlight}"></span>
                </span>${esc(p.label)}
              </button>`).join("")}
          </div>
        </div>
      </div>`;
  }

  // Non-blocking relationship warnings for the page-availability editor. These
  // never auto-toggle anything — they only advise the admin.
  function pageAvailabilityWarnings(pa) {
    const warns = [];
    if (pa.booking && !pa.scheduled && !pa.urgent) {
      warns.push("เปิดหน้า “เลือกประเภทการจอง” แต่ปิดทั้ง “จองล่วงหน้า” และ “คิวด่วน” — ลูกค้าจะเห็นหน้าจองที่ไม่มีตัวเลือกให้กด");
    }
    if (!pa.booking && (pa.scheduled || pa.urgent)) {
      warns.push("เปิดหน้าจอง (ล่วงหน้า/ด่วน) แต่ปิดหน้า “เลือกประเภทการจอง” — ลูกค้าจะเข้าหน้าจองจากเมนูปกติไม่ได้");
    }
    if (pa.store === false) {
      // storeItem detail inherits the store flag; note it so admins aren't
      // surprised that product-detail deep links also close.
      warns.push("ปิด “ร้านค้า” จะปิดหน้ารายละเอียดสินค้าทั้งหมดด้วย (ลิงก์สินค้าจะเข้าไม่ได้)");
    }
    return warns;
  }

  function renderPageAvailabilityEditor() {
    config.page_availability = normalizePageAvailability(config.page_availability);
    const pa = config.page_availability;
    const enabledCount = PAGE_AVAILABILITY_KEYS.filter((k) => pa[k]).length;
    const rows = PAGE_AVAILABILITY_KEYS.map((key) => {
      const [label, hint] = PAGE_AVAILABILITY_META[key];
      const isTracking = key === "tracking";
      return `
        <div class="pa-row ${pa[key] ? "" : "is-off"} ${isTracking ? "pa-row-tracking" : ""}">
          <div class="pa-info">
            <div class="pa-name">${esc(label)} ${pa[key] ? "" : '<span class="pa-badge-off">ปิดอยู่</span>'}</div>
            <div class="pa-hint">${esc(hint)}</div>
          </div>
          <label class="tog"><input type="checkbox" data-page-availability="${key}" ${pa[key] ? "checked" : ""}><span></span></label>
        </div>`;
    }).join("");

    const warnings = pageAvailabilityWarnings(pa);
    const warnHtml = warnings.length
      ? `<div class="pa-note pa-note-warn"><strong>ข้อควรระวัง</strong><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`
      : "";
    const allDisabledHtml = enabledCount === 0
      ? `<div class="pa-note pa-note-bad"><strong>ต้องเปิดอย่างน้อย 1 หน้า</strong><div>ตอนนี้ปิดทุกหน้า จะยังไม่สามารถ Publish ได้จนกว่าจะเปิดอย่างน้อยหนึ่งหน้า</div></div>`
      : "";
    const trackingOffHtml = pa.tracking === false
      ? `<div class="pa-note pa-note-bad"><strong>คำเตือน: ปิดหน้า “ติดตามงาน”</strong><div>ลิงก์ยืนยันนัดหมายที่ส่งให้ลูกค้าชี้มาที่หน้านี้ ถ้าปิด ลูกค้าที่กดลิงก์จะเห็นหน้ากำลังปรับปรุงแทนสถานะงานจริง</div></div>`
      : "";

    $("editor").innerHTML = `
      <div class="ep">
        <div class="ep-head">สถานะหน้าแอปลูกค้า</div>
        <div class="ep-body">
          <p style="font-size:13px;color:var(--muted);line-height:1.6;margin:0 0 10px">
            เปิด/ปิดแต่ละหน้าของแอปลูกค้า หน้าที่ปิดจะถูกซ่อนจากเมนู เข้าผ่านลิงก์ตรงไม่ได้ และจะแสดงหน้า “กำลังปรับปรุง”
            แทน · <strong>การเปลี่ยนแปลงมีผลหลังกด Publish เท่านั้น</strong>
          </p>
          <div class="pa-callout">หมายเหตุ: นี่คือปุ่มควบคุมการเผยแพร่ (UI) เท่านั้น ไม่ได้แทนที่ kill switch ฝั่งเซิร์ฟเวอร์ของการจอง — การเปิดหน้า “จองล่วงหน้า/คิวด่วน” ยังต้องเปิด kill switch ที่เซิร์ฟเวอร์ด้วย</div>
          ${allDisabledHtml}
          ${trackingOffHtml}
          <div class="pa-list">${rows}</div>
          ${warnHtml}
        </div>
      </div>`;
  }

  function renderEditor() {
    if (selected === "page-availability") { renderPageAvailabilityEditor(); return; }
    if (selected === "theme") { renderThemeEditor(); return; }
    if (headKey()) { renderHeadEditor(); return; }
    const section = current();
    if (!section) return;
    const itemTypes = ["announcements", "updates", "articles", "social", "trust", "quick", "promo_banner", "testimonials", "faq"];
    const hasViewAll = ["announcements", "updates", "articles", "social", "trust", "featured_services"].includes(section.type);

    let content = `
      <div class="ep">
        <div class="ep-head">ข้อมูลทั่วไป</div>
        <div class="ep-body">
          ${field("ชื่อ Section", "title")}
          ${field("คำอธิบาย", "body", "textarea")}
          ${hasViewAll ? `<div class="two">${field("ข้อความปุ่ม ดูทั้งหมด", "view_all_label")}${selectField("Route ปุ่ม ดูทั้งหมด", "view_all_route", [["", "ไม่แสดงปุ่ม"], ...ROUTE_OPTIONS.map((r) => [r, r])])}</div>` : ""}
          <div class="two">
            <label class="field">แสดงตั้งแต่วันที่ (ไม่บังคับ)<input class="fi" data-field="active_from" value="${esc(section.active_from || "")}" placeholder="YYYY-MM-DD"></label>
            <label class="field">แสดงถึงวันที่ (ไม่บังคับ)<input class="fi" data-field="active_to" value="${esc(section.active_to || "")}" placeholder="YYYY-MM-DD"></label>
          </div>
          <p style="font-size:12px;color:var(--muted);line-height:1.5">เว้นว่าง = แสดงตลอด · ตั้งช่วงวันเพื่อให้ทั้ง Section แสดงเฉพาะช่วงเวลานั้น (เช่น โปรเทศกาล)</p>
        </div>
      </div>
    `;

    if (section.type === "hero") {
      content += `
        <div class="ep">
          <div class="ep-head">Hero Image &amp; Focal</div>
          <div class="ep-body">
            <label class="field">Hero Image URL<input class="fi" data-field="image_url" value="${esc(section.image_url || "")}" placeholder="https://..."></label>
            <label class="field">อัปโหลดรูป Hero<input class="fi" type="file" accept="image/jpeg,image/png,image/webp" data-upload-section="hero"></label>
            ${section.image_url ? `<button class="btn btn-danger btn-sm" type="button" data-clear-section-image="hero">ลบรูป Hero</button>` : ""}
            <label class="field">Kicker<input class="fi" data-field="kicker" value="${esc(section.kicker || "")}"></label>
            <label class="field">ตำแหน่งโฟกัสภาพ<select class="fi" data-field="focal_position"><option value="top" ${section.focal_position === "top" ? "selected" : ""}>บน</option><option value="center" ${(section.focal_position || "center") === "center" ? "selected" : ""}>กลาง</option><option value="bottom" ${section.focal_position === "bottom" ? "selected" : ""}>ล่าง</option></select></label>
          </div>
        </div>
        <div class="ep">
          <div class="ep-head">CTA ปุ่มหลัก / ปุ่มรอง (ใช้เมื่อไม่มี Slides)</div>
          <div class="ep-body">
            <div class="two">
              <label class="field">ปุ่มหลัก<input class="fi" data-cta="cta_primary" data-prop="label" value="${esc(section.cta_primary?.label || "")}"></label>
              <label class="field">Route ปุ่มหลัก<input class="fi" data-cta="cta_primary" data-prop="route" value="${esc(section.cta_primary?.route || "")}"></label>
            </div>
            <div class="two">
              <label class="field">ปุ่มรอง<input class="fi" data-cta="cta_secondary" data-prop="label" value="${esc(section.cta_secondary?.label || "")}"></label>
              <label class="field">Route ปุ่มรอง<input class="fi" data-cta="cta_secondary" data-prop="route" value="${esc(section.cta_secondary?.route || "")}"></label>
            </div>
          </div>
        </div>
        <div class="ep">
          <div class="ep-head">Hero Slides <div class="toolbar" style="display:inline-flex;margin-left:10px"><button class="btn btn-ghost btn-sm" type="button" id="addHeroSlide">+ เพิ่ม Slide</button></div></div>
          <div class="ep-body">
            ${(section.items || []).map((item, index) => heroSlideEditor(item, index, section.items.length)).join("") || `<p style="color:var(--muted);font-size:13px">ยังไม่มี Slide — จะใช้ข้อมูล Section หลัก</p>`}
          </div>
        </div>
      `;
    }

    if (section.type === "articles") {
      content += articlesAutoSyncEditor(section);
    }

    if (section.type === "featured_services") {
      content += `<div class="ep"><div class="ep-head">บริการแนะนำ</div><div class="ep-body">${featuredServicesEditor(section)}</div></div>`;
    }

    if (itemTypes.includes(section.type) && !(section.type === "articles" && section.auto_sync)) {
      const items = (section.items || []);
      content += `
        <div class="ep">
          <div class="ep-head">
            รายการ (${items.length})
            <button class="btn btn-ghost btn-sm" type="button" id="addItem">+ เพิ่มรายการ</button>
          </div>
          <div class="ep-body">
            ${items.length ? items.map((item, index) => itemEditor(item, index, section.type, items.length)).join("") : `<p style="color:var(--muted);font-size:13px">ยังไม่มีรายการ</p>`}
          </div>
        </div>
      `;
    }

    $("editor").innerHTML = content;
  }

  function featuredServicesEditor(section) {
    const mode = section.featured_mode === "manual" ? "manual" : "auto";
    const itemIds = (Array.isArray(section.item_ids) ? section.item_ids : []).map(String);
    if (mode === "manual") ensureCatalogItems();
    let manualBlock = "";
    if (mode === "manual") {
      if (catalogLoadFailed) {
        manualBlock = `<p style="color:var(--muted)">โหลดรายการ Catalog ไม่สำเร็จ</p><button class="btn btn-ghost btn-sm" type="button" id="retryCatalog">ลองใหม่</button>`;
      } else if (!catalogItems) {
        manualBlock = `<p style="color:var(--muted)">กำลังโหลดรายการ Catalog...</p>`;
      } else {
        const byId = new Map(catalogItems.map((item) => [String(item.item_id), item]));
        const selectedRows = itemIds.map((id) => byId.get(id)).filter(Boolean);
        const unselectedRows = catalogItems.filter((item) => !itemIds.includes(String(item.item_id)));
        const inactiveNote = (item) => (catalogIsSelectable(item) ? "" : ` <small style="color:#b42318">(ปิดอยู่)</small>`);
        manualBlock = `
          <p style="font-size:12px;font-weight:900;color:var(--muted)">รายการที่เลือก (ลำดับ = ลำดับที่แสดงจริง)</p>
          <div style="max-height:220px;overflow:auto;border:1.5px solid var(--line);border-radius:10px;padding:8px;display:grid;gap:6px">
            ${selectedRows.length ? selectedRows.map((item, index) => `
              <div class="sec-row">
                <div style="display:flex;gap:4px">
                  <button class="mini" type="button" data-move-featured-item="${esc(item.item_id)}" data-dir="-1" ${index === 0 ? "disabled" : ""}>↑</button>
                  <button class="mini" type="button" data-move-featured-item="${esc(item.item_id)}" data-dir="1" ${index === selectedRows.length - 1 ? "disabled" : ""}>↓</button>
                </div>
                <div style="flex:1;font-weight:900;font-size:13px">${esc(item.item_name || item.item_id)}${inactiveNote(item)}</div>
                <label class="switch"><input type="checkbox" data-featured-item="${esc(item.item_id)}" checked> แสดง</label>
              </div>
            `).join("") : "<p style='color:var(--muted);font-size:13px'>ยังไม่ได้เลือก</p>"}
          </div>
          <p style="font-size:12px;font-weight:900;color:var(--muted);margin-top:6px">รายการที่ยังไม่เลือก</p>
          <div style="max-height:220px;overflow:auto;border:1.5px solid var(--line);border-radius:10px;padding:8px;display:grid;gap:6px">
            ${unselectedRows.length ? unselectedRows.map((item) => {
              const selectable = catalogIsSelectable(item);
              return `<label class="switch" style="justify-content:flex-start"><input type="checkbox" data-featured-item="${esc(item.item_id)}" ${selectable ? "" : "disabled"}> ${esc(item.item_name || item.item_id)}${inactiveNote(item)}</label>`;
            }).join("") : "<p style='color:var(--muted);font-size:13px'>ไม่มีรายการเพิ่มเติม</p>"}
          </div>
        `;
      }
    }
    return `
      <label class="field">แหล่งข้อมูล<select class="fi" data-featured-mode><option value="auto" ${mode === "auto" ? "selected" : ""}>ดึงจาก Catalog อัตโนมัติ (is_featured)</option><option value="manual" ${mode === "manual" ? "selected" : ""}>เลือกรายการเอง</option></select></label>
      <label class="field">จำนวนสูงสุด<input class="fi" type="number" min="1" max="12" data-featured-limit value="${esc(section.featured_limit || 6)}"></label>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <label class="switch"><input type="checkbox" data-featured-bool="show_price" ${section.show_price !== false ? "checked" : ""}> แสดงราคา</label>
        <label class="switch"><input type="checkbox" data-featured-bool="show_badge" ${section.show_badge !== false ? "checked" : ""}> แสดง Badge</label>
      </div>
      ${mode === "manual" ? manualBlock : ""}
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

  /* ── preview ── */
  function renderPreview() {
    $("preview").innerHTML = sections().filter((s) => s.enabled !== false).map((section) => {
      if (section.type === "hero") {
        const enabledSlides = (section.items || []).filter((slide) => slide.enabled !== false);
        const slides = enabledSlides.length ? enabledSlides : [section];
        return `<section class="p-hero">${slides.map((slide) => `<div ${slide.image_url ? `style="background-image:linear-gradient(rgba(7,27,56,.62),rgba(7,27,56,.62)),url('${esc(slide.image_url)}');background-size:cover;background-position:${slide.focal_position||"center"}"` : ""}><small>${esc(slide.kicker || section.kicker || "Coldwindflow")}</small><h3>${esc(slide.title || section.title || "")}</h3><p>${esc(slide.body || section.body || "")}</p></div>`).join("")}</section>`;
      }
      if (section.type === "quick") return `<section class="p-quick">${(section.items || []).filter((i) => i.enabled !== false).slice(0, 4).map((i) => `<div>${esc(i.title || "")}</div>`).join("")}</section>`;
      if (section.type === "promo_banner") {
        const banners = (section.items || []).filter((i) => i.enabled !== false && i.image_url);
        if (!banners.length) return "";
        return `<section class="p-sec"><div style="aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#eef2f7"><img src="${esc(banners[0].image_url)}" alt="${esc(banners[0].alt_text || "")}" style="width:100%;height:100%;object-fit:${banners[0].aspect_mode === "cover" ? "cover" : "contain"}"></div>${banners.length > 1 ? `<p style="text-align:center;margin-top:5px;color:var(--muted);font-size:11px">${banners.length} banners</p>` : ""}</section>`;
      }
      if (section.type === "active_job") return `<section class="p-sec"><div class="p-sec-head"><b>${esc(section.title || "")}</b><span style="color:var(--muted);font-size:10px">Shown only when logged-in customer has an active job</span></div></section>`;
      if (section.type === "featured_services") {
        const items = resolveFeaturedPreviewItems(section);
        const showPrice = section.show_price !== false;
        const showBadge = section.show_badge !== false;
        const priceText = (item) => { const v = Number(item.display_price ?? item.active_price ?? item.base_price); return Number.isFinite(v) && v > 0 ? `${v.toLocaleString("th-TH")} บาท` : "สอบถามราคา"; };
        const cards = items.length
          ? items.map((item) => `<article class="p-card"><b>${esc(item.item_name || item.item_id)}</b>${showBadge ? `<p><span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#eef2ff;color:#3346a6;font-size:10px">${item.booking_mode === "bookable" ? "จองได้" : "สอบถาม"}</span></p>` : ""}${showPrice ? `<p>${esc(priceText(item))}</p>` : ""}</article>`).join("")
          : catalogLoadFailed ? `<article class="p-card"><b>โหลด Catalog ไม่สำเร็จ</b></article>`
          : !catalogItems ? `<article class="p-card"><b>กำลังโหลด...</b></article>`
          : `<article class="p-card"><b>ไม่มีบริการแนะนำ</b><p>Section นี้จะถูกซ่อน</p></article>`;
        const fsViewAll = section.view_all_label || (section.view_all_route ? "ดูทั้งหมด" : "");
        return `<section class="p-sec"><div class="p-sec-head"><b>${esc(section.title || "")}</b>${fsViewAll ? `<span>${esc(fsViewAll)}</span>` : ""}</div><div class="p-cards">${cards}</div></section>`;
      }
      const viewAll = section.view_all_label || (section.view_all_route ? "ดูทั้งหมด" : "");
      return `<section class="p-sec"><div class="p-sec-head"><b>${esc(section.title || "")}</b>${viewAll ? `<span>${esc(viewAll)}</span>` : ""}</div><div class="p-cards">${(section.items || []).filter((i) => i.enabled !== false).slice(0, 3).map((i) => `<article class="p-card">${section.type === "social" ? `<span style="display:inline-block;padding:2px 7px;border-radius:999px;background:#eef2ff;color:#3346a6;font-size:10px;margin-bottom:3px">${esc((i.platform || "youtube") === "facebook" ? "Facebook" : "YouTube")}</span><br>` : ""}<b>${esc(i.title || "")}</b><p>${esc(i.body || "")}</p></article>`).join("") || `<article class="p-card"><b>ไม่มีรายการ</b><p>เพิ่มรายการใน editor</p></article>`}</div></section>`;
    }).join("");
  }

  function render() {
    populateSectionTypePicker();
    renderSectionList();
    renderEditorHeader();
    renderEditor();
    renderPreview();
  }

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll(".cms-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === name));
    document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("tab-active", panel.dataset.panel === name));
  }

  /* ── event handlers ── */
  document.addEventListener("click", (event) => {
    if (event.target.id === "addSectionBtn") { const el = $("newSectionType"); if (el) addSection(el.value); return; }
    const preset = event.target.closest("[data-theme-preset]");
    if (preset) {
      const p = THEME_PRESETS[Number(preset.dataset.themePreset)];
      if (p) { config.theme = { primary: p.primary, accent: p.accent, highlight: p.highlight }; render(); setStatus(`ใช้ธีม: ${p.label}`, "ok"); }
      return;
    }
    if (event.target.id === "resetTheme") { config.theme = {}; render(); setStatus("กลับไปใช้สีเริ่มต้น", "ok"); return; }
    const dupSection = event.target.closest("[data-duplicate-section]");
    if (dupSection) { duplicateSection(dupSection.dataset.duplicateSection); return; }
    const delSection = event.target.closest("[data-delete-section]");
    if (delSection) {
      const sec = config.sections.find((s) => s.id === delSection.dataset.deleteSection);
      if (sec && window.confirm(`ลบ Section "${sec.title || sec.type}" ?`)) deleteSection(sec.id);
      return;
    }
    const moveBtn = event.target.closest("[data-move]");
    if (moveBtn) move(moveBtn.dataset.move, Number(moveBtn.dataset.dir));
    const edit = event.target.closest("[data-edit]");
    if (edit) {
      selected = edit.dataset.edit;
      render();
      if (window.innerWidth <= 880) switchTab("editor");
    }
    const remove = event.target.closest("[data-remove-item]");
    if (remove) { current().items.splice(Number(remove.dataset.removeItem), 1); render(); }
    const moveItem = event.target.closest("[data-move-item]");
    if (moveItem) {
      const section = current();
      const index = Number(moveItem.dataset.moveItem);
      const next = index + Number(moveItem.dataset.dir);
      if (section.items && next >= 0 && next < section.items.length) {
        [section.items[index], section.items[next]] = [section.items[next], section.items[index]];
        section.items.forEach((item, i) => { item.sort_order = i + 1; });
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
      if (index >= 0 && next >= 0 && next < ids.length) { [ids[index], ids[next]] = [ids[next], ids[index]]; section.item_ids = ids; render(); }
    }
    if (event.target.id === "retryCatalog") retryLoadCatalogItems();
    if (event.target.id === "syncArticlesNow") syncArticlesNow().catch((error) => setStatus(error.message, "bad"));
    if (event.target.id === "addItem") {
      current().items = current().items || [];
      if (current().type === "quick" && current().items.length >= 4) { setStatus("Quick จำกัด 4 รายการ", "bad"); return; }
      if (current().type === "promo_banner" && current().items.length >= 8) { setStatus("Promo banner จำกัด 8 รายการ", "bad"); return; }
      if (current().type === "social" && current().items.length >= 8) { setStatus("Social จำกัด 8 รายการ", "bad"); return; }
      current().items.push(
        current().type === "promo_banner" ? { title: "", body: "", image_url: "", alt_text: "", aspect_mode: "contain" } :
        current().type === "social" ? { title: "", body: "", url: "", platform: "youtube" } :
        { title: "", body: "", url: "" }
      );
      render();
    }
    if (event.target.id === "addHeroSlide") {
      current().items = current().items || [];
      if (current().items.length >= 5) { setStatus("Hero จำกัด 5 slides", "bad"); return; }
      current().items.push({ kicker: current().kicker || "", title: current().title || "", body: current().body || "", focal_position: current().focal_position || "center", cta_primary: { ...(current().cta_primary || {}) }, cta_secondary: { ...(current().cta_secondary || {}) } });
      render();
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    // Theme color fields live outside any section — handle first and bail.
    if (target.matches("[data-theme-color]") || target.matches("[data-theme-hex]")) {
      const key = target.dataset.themeColor || target.dataset.themeHex;
      config.theme = config.theme || {};
      const raw = String(target.value || "").trim().toLowerCase();
      if (target.matches("[data-theme-color]")) {
        config.theme[key] = raw; // native color input is always #rrggbb
        const hex = document.querySelector(`[data-theme-hex="${key}"]`);
        if (hex) hex.value = raw;
      } else if (!raw) {
        delete config.theme[key];
      } else if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
        config.theme[key] = raw;
        const picker = document.querySelector(`[data-theme-color="${key}"]`);
        if (picker) picker.value = raw;
      }
      renderPreview();
      return;
    }
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
    if (target.matches("[data-featured-limit]")) section.featured_limit = Math.max(1, Math.min(12, Number(target.value) || 6));
    if (target.matches("[data-seed-urls]")) section.seed_urls = target.value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8);
    renderPreview();
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.matches("[data-page-availability]")) {
      config.page_availability = normalizePageAvailability(config.page_availability);
      const key = target.dataset.pageAvailability;
      // Never let the UI reach an all-disabled state: refuse to turn off the
      // last enabled page. Revert the checkbox, keep config unchanged, and show
      // the same message the publish guard uses.
      if (!pageAvailabilityToggleAllowed(config.page_availability, key, target.checked)) {
        target.checked = true;
        setStatus("ต้องเปิดอย่างน้อย 1 หน้า", "bad");
        return;
      }
      // Only ever change the one page the admin toggled — never auto-toggle a
      // related page. Re-render the editor so notes/warnings update live.
      config.page_availability[key] = target.checked;
      renderEditor();
      return;
    }
    if (target.matches("select[data-item]")) { current().items[Number(target.dataset.item)][target.dataset.prop] = target.value; if (target.dataset.prop === "platform") render(); else renderPreview(); }
    if (target.matches("select[data-field]")) { current()[target.dataset.field] = target.value; renderPreview(); }
    if (target.matches("[data-toggle]")) { const s = sections().find((row) => row.id === target.dataset.toggle); if (s) s.enabled = target.checked; renderPreview(); }
    if (target.matches("[data-head-toggle]")) { const h = (config.page_headers || {})[target.dataset.headToggle]; if (h) h.enabled = target.checked; renderSectionList(); }
    if (target.id === "sectionPicker") { selected = target.value; render(); }
    if (target.matches("[data-upload]")) uploadImage(target, Number(target.dataset.upload)).catch((error) => setStatus(error.message, "bad"));
    if (target.matches("[data-upload-section]")) uploadImage(target, target.dataset.uploadSection).catch((error) => setStatus(error.message, "bad"));
    if (target.matches("[data-featured-mode]")) { current().featured_mode = target.value; render(); }
    if (target.matches("[data-auto-sync]")) { current().auto_sync = target.checked; render(); }
    if (target.matches("[data-featured-bool]")) { current()[target.dataset.featuredBool] = target.checked; renderPreview(); }
    if (target.matches("[data-featured-item]")) {
      const section = current();
      section.item_ids = Array.isArray(section.item_ids) ? section.item_ids : [];
      const id = target.dataset.featuredItem;
      if (target.checked) { if (!section.item_ids.includes(id)) section.item_ids.push(id); }
      else { section.item_ids = section.item_ids.filter((v) => v !== id); }
      render();
    }
    if (target.matches("[data-item-enabled]")) { const item = current().items[Number(target.dataset.itemEnabled)]; if (item) { item.enabled = target.checked; renderPreview(); } }
    if (target.matches("[data-item-target]")) {
      const item = current().items[Number(target.dataset.itemTarget)];
      if (!item) return;
      delete item.route; delete item.url; delete item.action;
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
      delete item[ctaName].route; delete item[ctaName].url; delete item[ctaName].action;
      if (target.value === "route") item[ctaName].route = "home";
      if (target.value === "url") item[ctaName].url = "";
      render();
    }
  });

  $("saveDraft").addEventListener("click", () => saveDraft().catch((error) => setStatus(error.message, "bad")));
  $("publish").addEventListener("click", () => publish().catch((error) => setStatus(error.message, "bad")));
  $("reload").addEventListener("click", () => load().catch((error) => setStatus(error.message, "bad")));
  $("cmsTabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".cms-tab");
    if (tab) switchTab(tab.dataset.tab);
  });
  $("backToSections").addEventListener("click", () => switchTab("sections"));
  switchTab("sections");
  load().catch((error) => { config = clone(DEFAULT_CONFIG); render(); setStatus(error.message, "bad"); });
})();
