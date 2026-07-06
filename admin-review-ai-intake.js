(function(){
  "use strict";

  const STATE = { lastReadyFingerprint:"", timer:null, controlValues:null };
  const OPEN_STATUSES = ["READY_TO_CREATE_JOB", "NEED_INFO", "WAITING_CUSTOMER_REPLY", "ADMIN_REQUIRED", "CUSTOMER_INTERESTED"];

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function api(url, options){
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"}}, options || {})).then(async (res)=>{
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP_${res.status}`);
      return data || {};
    });
  }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); } catch(_){} }

  async function loadControlValues(){
    if (STATE.controlValues) return STATE.controlValues;
    try {
      const data = await api("/admin/ai-office/control/settings");
      STATE.controlValues = data.values || {};
    } catch (_) {
      STATE.controlValues = {};
    }
    return STATE.controlValues;
  }
  function aiCardsEnabled(values){
    if (!values) return true;
    if (values.ai_office_enabled === false) return false;
    if (values.booking_card_alert_enabled === false) return false;
    return true;
  }
  function sharedAdminAlertGate(){
    window.__CWF_ADMIN_ALERT_GATE__ = window.__CWF_ADMIN_ALERT_GATE__ || {
      lastPlayedAt: 0,
      minGapMs: 1500,
    };
    return window.__CWF_ADMIN_ALERT_GATE__;
  }
  function claimSharedAdminAlertSound(){
    const gate = sharedAdminAlertGate();
    const now = Date.now();
    if (now - Number(gate.lastPlayedAt || 0) < Number(gate.minGapMs || 1500)) return false;
    gate.lastPlayedAt = now;
    return true;
  }

  function stageLabel(status){
    return ({
      READY_TO_CREATE_JOB:"พร้อมเพิ่มงาน",
      NEED_INFO:"ต้องถามข้อมูลเพิ่ม",
      WAITING_CUSTOMER_REPLY:"รอลูกค้าตอบ",
      ADMIN_REQUIRED:"แอดมินตอบเอง",
      CUSTOMER_INTERESTED:"ลูกค้าสนใจ",
      WATCHING:"กำลังดูข้อมูล",
      JOB_CREATED:"สร้างงานแล้ว",
      CLOSED:"ปิดรายการ"
    })[status] || status || "รอตรวจ";
  }
  function stageText(item){
    const missing = Array.isArray(item?.missing_fields) ? item.missing_fields.filter(Boolean) : [];
    if (item.status === "READY_TO_CREATE_JOB") return "ข้อมูลครบพอให้แอดมินตรวจและเพิ่มงาน";
    if (item.status === "NEED_INFO") return missing.length ? `ควรถามเพิ่ม: ${missing.slice(0,2).join(" / ")}` : "ยังต้องถามข้อมูลเพิ่ม";
    if (item.status === "WAITING_CUSTOMER_REPLY") return "ถามข้อมูลเพิ่มแล้ว กำลังรอลูกค้าตอบกลับ";
    if (item.status === "ADMIN_REQUIRED") return "เคสนี้ให้แอดมินตอบเอง ไม่ให้ AI ตอบแทน";
    if (item.status === "CUSTOMER_INTERESTED") return "ลูกค้าสนใจ / มีโอกาสปิดงาน ต้องให้แอดมินตรวจ";
    return item.ai_summary || "รอแอดมินตรวจ";
  }
  function stageClass(status){
    if (status === "READY_TO_CREATE_JOB") return "ready";
    if (status === "ADMIN_REQUIRED") return "danger";
    if (status === "WAITING_CUSTOMER_REPLY") return "waiting";
    if (status === "NEED_INFO") return "need";
    return "watch";
  }
  function displayName(item){
    return clean(item.line_display_name) || clean(item.customer_name) || clean(item.customer_phone) || "ลูกค้า LINE";
  }
  function initials(name){ const s = clean(name || "LINE"); return (s || "L").slice(0,2).toUpperCase(); }
  function jobMeta(item){
    return [item.service_type, item.unit_count ? `${item.unit_count} เครื่อง` : "", item.area_text || item.address_text, [item.preferred_date, item.preferred_time].filter(Boolean).join(" ")].filter(Boolean).join(" • ") || "รอข้อมูลจากลูกค้า";
  }
  function latestText(item){ return clean(item.latest_customer_message || item.ai_summary || ""); }

  function injectStyle(){
    if (byId("aiCustomerCardStyle")) return;
    const style = document.createElement("style");
    style.id = "aiCustomerCardStyle";
    style.textContent = `
      .ai-customer-alerts{display:flex;flex-direction:column;gap:9px;margin:10px 0 12px}
      .ai-customer-card{display:grid;grid-template-columns:46px 1fr auto;gap:10px;align-items:center;border-radius:18px;padding:11px 12px;background:#fff;border:1px solid rgba(21,88,214,.18);box-shadow:0 8px 22px rgba(2,6,23,.08)}
      .ai-customer-card.ready{border-color:rgba(34,197,94,.46);background:linear-gradient(180deg,#fff,#f2fff6)}
      .ai-customer-card.need{border-color:rgba(245,158,11,.42);background:linear-gradient(180deg,#fff,#fffbeb)}
      .ai-customer-card.waiting{border-color:rgba(59,130,246,.36);background:linear-gradient(180deg,#fff,#eff6ff)}
      .ai-customer-card.danger{border-color:rgba(239,68,68,.38);background:linear-gradient(180deg,#fff,#fff1f2)}
      .ai-line-avatar{width:46px;height:46px;border-radius:16px;background:linear-gradient(135deg,#06c755,#16a34a);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:1000;overflow:hidden;box-shadow:0 8px 16px rgba(6,199,85,.22)}
      .ai-line-avatar img{width:100%;height:100%;object-fit:cover}
      .ai-card-main{min-width:0}.ai-card-name{font-size:15px;font-weight:1000;color:#081c4b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-card-stage{margin-top:2px;font-size:13px;font-weight:950;color:#0f172a;line-height:1.25}.ai-card-meta{margin-top:2px;color:#64748b;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ai-card-msg{margin-top:4px;color:#334155;font-size:12px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .ai-stage-pill{align-self:start;border-radius:999px;padding:7px 9px;font-size:12px;font-weight:1000;background:#e2e8f0;color:#0f172a;white-space:nowrap}.ai-stage-pill.ready{background:#bbf7d0;color:#052e16}.ai-stage-pill.need{background:#fde68a;color:#78350f}.ai-stage-pill.waiting{background:#dbeafe;color:#1e3a8a}.ai-stage-pill.danger{background:#fecaca;color:#7f1d1d}
      .ai-card-actions{grid-column:2/4;display:flex;gap:8px;flex-wrap:wrap;margin-top:1px}.ai-card-actions button{min-height:36px;border-radius:999px;border:1px solid rgba(21,88,214,.16);background:#f8fbff;color:#0d3d8d;font-weight:1000;padding:0 12px}.ai-card-actions .primary{background:#ffcc00;color:#081c4b;border-color:rgba(255,204,0,.85)}
      .ai-customer-card.ai-error{border-color:rgba(239,68,68,.38);background:#fff7f7}.ai-customer-card.ai-error .ai-line-avatar{background:#ef4444}
      @media(max-width:520px){.ai-customer-card{grid-template-columns:42px 1fr}.ai-stage-pill{grid-column:2/3;justify-self:start}.ai-card-actions{grid-column:1/3}.ai-card-actions button{flex:1 1 130px}.ai-card-msg,.ai-card-meta{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
    `;
    document.head.appendChild(style);
  }
  function ensurePanel(){
    let panel = byId("aiIntakePanel");
    if (panel) return panel;
    const list = byId("list");
    if (!list || !list.parentNode) return null;
    panel = document.createElement("div");
    panel.id = "aiIntakePanel";
    panel.className = "ai-customer-alerts";
    list.parentNode.insertBefore(panel, list);
    return panel;
  }
  function cardHtml(item){
    const cls = stageClass(item.status);
    const name = displayName(item);
    const picture = clean(item.line_picture_url);
    const ready = item.status === "READY_TO_CREATE_JOB";
    return `
      <article class="ai-customer-card ${cls}" data-ai-intake-id="${esc(item.id)}" data-ai-open-office="${esc(item.id)}">
        <div class="ai-line-avatar">${picture ? `<img src="${esc(picture)}" alt="">` : esc(initials(name))}</div>
        <div class="ai-card-main">
          <div class="ai-card-name">${esc(name)}</div>
          <div class="ai-card-stage">${esc(stageText(item))}</div>
          <div class="ai-card-meta">${esc(jobMeta(item))}</div>
          ${latestText(item) ? `<div class="ai-card-msg">${esc(latestText(item))}</div>` : ""}
        </div>
        <span class="ai-stage-pill ${cls}">${esc(stageLabel(item.status))}</span>
        <div class="ai-card-actions">
          ${ready ? `<button class="primary" type="button" data-ai-open-add="${esc(item.id)}">เพิ่มงาน</button>` : ""}
          <button type="button" data-ai-office="${esc(item.id)}">เปิดใน AI Office</button>
        </div>
      </article>`;
  }
  function errorHtml(message){
    return `<article class="ai-customer-card ai-error"><div class="ai-line-avatar">!</div><div class="ai-card-main"><div class="ai-card-name">LINE AI ยังไม่พร้อม</div><div class="ai-card-stage">${esc(message || "โหลดข้อมูลจาก AI ไม่สำเร็จ")}</div><div class="ai-card-meta">กดเข้า AI Office เพื่อตรวจระบบ</div></div><span class="ai-stage-pill danger">ตรวจระบบ</span><div class="ai-card-actions"><button type="button" onclick="location.href='/admin-ai-office.html?panel=line-ai'">เปิด AI Office</button></div></article>`;
  }
  function render(items, error){
    injectStyle();
    const panel = ensurePanel();
    if (!panel) return;
    if (error) { panel.style.display = "flex"; panel.innerHTML = errorHtml(error); return; }
    const actionable = (items || []).filter(x => OPEN_STATUSES.includes(x.status));
    if (!actionable.length) { panel.style.display = "none"; panel.innerHTML = ""; return; }
    panel.style.display = "flex";
    panel.innerHTML = actionable.slice(0, 6).map(cardHtml).join("");
    notifyAdmin(actionable);
  }
  function normalizeJobType(serviceType){ const s = clean(serviceType); if (/ติดตั้ง/.test(s)) return "ติดตั้ง"; if (/ซ่อม|ตรวจ/.test(s)) return "ซ่อม"; if (/ล้าง/.test(s)) return "ล้าง"; return "ล้าง"; }
  function normalizeBtu(value){ const n = Number((String(value || "").replace(/,/g, "").match(/\d+/) || [""])[0]); return Number.isFinite(n) && n > 0 ? String(n) : ""; }
  function buildExistingAddJobPrefill(item){
    const note = [`จาก LINE AI intake #${item.id}`, `ชื่อ LINE: ${displayName(item)}`, item.map_url ? `โลเคชั่น: ${item.map_url}` : "", item.preferred_date || item.preferred_time ? `วันเวลาที่ลูกค้าต้องการ: ${[item.preferred_date, item.preferred_time].filter(Boolean).join(" ")}` : "", latestText(item) ? `ข้อความล่าสุด: ${latestText(item)}` : "", item.ai_summary ? `AI note: ${item.ai_summary}` : ""].filter(Boolean).join("\n");
    return { source:"accounting_quotation", document_no:`LINE-AI-${item.id}`, customer_name:item.customer_name || displayName(item) || "", customer_phone:item.customer_phone || "", address_text:item.address_text || item.area_text || "", customer_note:note, service_lines:[{ job_type:normalizeJobType(item.service_type), ac_type:"ผนัง", wash_variant:"", btu:normalizeBtu(item.btu), qty:Number(item.unit_count || 1) || 1, machine_count:Number(item.unit_count || 1) || 1, unit_price:0, description:item.ai_summary || "LINE AI" }] };
  }
  async function fetchIntake(id){ const data = await api(`/admin/ai-office/booking-intakes/${Number(id)}`); return data.intake || null; }
  async function openAddFromIntake(id){
    const item = await fetchIntake(id);
    if (!item) return toast("ไม่พบรายการ LINE AI", "error");
    try {
      localStorage.setItem("cwf_accounting_quote_prefill", JSON.stringify(buildExistingAddJobPrefill(item)));
      localStorage.setItem("cwf_line_ai_intake_pending_id", String(item.id));
      localStorage.setItem("cwf_line_ai_intake_pending_payload", JSON.stringify(item));
      location.href = `/admin-add-v2.html?source=line_ai&ai_intake_id=${encodeURIComponent(id)}&t=${Date.now()}`;
    } catch(e) { toast("เปิดเพิ่มงานไม่ได้", "error"); }
  }
  function openOfficeFor(id){ location.href = `/admin-ai-office.html?panel=line-ai&ai_intake_id=${encodeURIComponent(id)}`; }
  async function loadAiIntakes(){
    try {
      const values = await loadControlValues();
      if (!aiCardsEnabled(values)) {
        const panel = ensurePanel();
        if (panel) { panel.style.display = "none"; panel.innerHTML = ""; }
        return;
      }
      const data = await api("/admin/ai-office/booking-intakes?status=open&limit=20");
      render(Array.isArray(data.intakes) ? data.intakes : [], "");
    }
    catch(e) { render([], e.message || "โหลด LINE AI ไม่สำเร็จ"); }
  }
  function notifyAdmin(items){
    const ready = items.filter(x => x.status === "READY_TO_CREATE_JOB");
    const fp = ready.map(x => `${x.id}:${x.updated_at}`).join("|");
    if (!ready.length || fp === STATE.lastReadyFingerprint) { STATE.lastReadyFingerprint = fp; return; }
    if (STATE.lastReadyFingerprint) playSoftAlert();
    STATE.lastReadyFingerprint = fp;
  }
  function playSoftAlert(){
    try { if (!claimSharedAdminAlertSound()) return; const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = 880; gain.gain.value = 0.035; osc.connect(gain); gain.connect(ctx.destination); osc.start(); setTimeout(()=>{ try { osc.stop(); ctx.close(); } catch(_){} }, 170); } catch(_) {}
  }
  document.addEventListener("click", (e)=>{
    const add = e.target.closest("[data-ai-open-add]");
    if (add) { e.preventDefault(); e.stopPropagation(); return openAddFromIntake(add.getAttribute("data-ai-open-add")); }
    const office = e.target.closest("[data-ai-office]");
    if (office) { e.preventDefault(); e.stopPropagation(); return openOfficeFor(office.getAttribute("data-ai-office")); }
    const card = e.target.closest("[data-ai-open-office]");
    if (card) return openOfficeFor(card.getAttribute("data-ai-open-office"));
  });
  window.__CWF_AI_INTAKE_TEST__ = {
    STATE,
    render,
    notifyAdmin,
    playSoftAlert,
    claimSharedAdminAlertSound,
    sharedAdminAlertGate,
  };
  function init(){ loadAiIntakes(); STATE.timer = setInterval(loadAiIntakes, 15000); }
  if (!window.__CWF_AI_INTAKE_DISABLE_AUTO_INIT__) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }
})();
