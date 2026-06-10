(function(){
  "use strict";

  const STATE = { lastReadyCount: 0, lastFingerprint: "", pollingTimer: null, hasLoadedOnce: false };

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return (v == null ? "" : String(v)).replace(/\s+/g, " ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function money(v){ const n = Number(v || 0); return (Number.isFinite(n) && n > 0) ? `${n.toLocaleString("th-TH")} บาท` : "ให้หน้าเพิ่มงานคำนวณจากระบบจริง"; }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); else console.log(msg); } catch(_){} }
  function canNotify(){ return "Notification" in window; }

  function api(url, options){
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"}}, options || {})).then(async (res)=>{
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP_${res.status}`);
      return data || {};
    });
  }

  function statusLabel(status){
    return ({
      READY_TO_CREATE_JOB: "พร้อมเพิ่มงาน",
      NEED_INFO: "ต้องถามข้อมูลเพิ่ม",
      ADMIN_REQUIRED: "แอดมินตอบเอง",
      CUSTOMER_INTERESTED: "ลูกค้าสนใจ",
      JOB_CREATED: "สร้างงานแล้ว",
      CLOSED: "ปิดรายการ",
      WATCHING: "เฝ้าดู"
    })[status] || status || "-";
  }
  function statusClass(status){
    if (status === "READY_TO_CREATE_JOB") return "ready";
    if (status === "ADMIN_REQUIRED") return "admin";
    if (status === "NEED_INFO") return "need";
    return "watch";
  }
  function missingLine(item){
    const arr = Array.isArray(item?.missing_fields) ? item.missing_fields : [];
    return arr.length ? arr.join(" / ") : "ครบพอให้แอดมินตรวจ";
  }
  function buildCopyText(item){
    return [
      "ข้อมูลลูกค้าจาก LINE AI",
      `ชื่อลูกค้า: ${item.customer_name || "-"}`,
      `เบอร์โทร: ${item.customer_phone || "-"}`,
      `ประเภทงาน: ${item.service_type || "-"}`,
      `จำนวนเครื่อง: ${item.unit_count || "-"}`,
      `BTU: ${item.btu || "-"}`,
      `พื้นที่/ที่อยู่: ${[item.area_text, item.address_text].filter(Boolean).join(" ") || "-"}`,
      `โลเคชั่น: ${item.map_url || "-"}`,
      `วันเวลา: ${[item.preferred_date, item.preferred_time].filter(Boolean).join(" ") || "-"}`,
      `ราคาตามระบบ: ${money(item.quoted_price)}`,
      `ข้อมูลที่ยังขาด: ${missingLine(item)}`,
      `ข้อความล่าสุด: ${item.latest_customer_message || "-"}`
    ].join("\n");
  }

  function notificationLabel(){
    if (!canNotify()) return "🔕 แจ้งเตือนไม่รองรับ";
    if (Notification.permission === "granted") return "🔔 แจ้งเตือนเปิดแล้ว";
    if (Notification.permission === "denied") return "🔕 แจ้งเตือนถูกบล็อก";
    return "🔔 เปิดแจ้งเตือน";
  }

  function injectStyle(){
    if (byId("aiBookingIntakeStyle")) return;
    const style = document.createElement("style");
    style.id = "aiBookingIntakeStyle";
    style.textContent = `
      .ai-intake-wrap{display:grid;gap:10px;margin-top:12px}
      .ai-intake-head{padding:13px 14px;border-radius:20px;background:linear-gradient(135deg,#081c4b,#1558d6);color:#fff;box-shadow:0 16px 36px rgba(2,6,23,.18);border:1px solid rgba(255,204,0,.32)}
      .ai-intake-head .top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.ai-intake-head b{font-size:16px}.ai-intake-head small{display:block;color:rgba(255,255,255,.78);font-weight:800;margin-top:3px}
      .ai-intake-badge{display:inline-flex;align-items:center;gap:6px;background:#ffcc00;color:#081c4b;border-radius:999px;padding:7px 10px;font-weight:1000;white-space:nowrap}
      .ai-notify-btn{border:none;border-radius:999px;padding:8px 10px;background:#fff;color:#081c4b;font-weight:1000;min-height:38px}
      .ai-intake-empty,.ai-intake-error{border-radius:18px;padding:12px 13px;background:#fff;border:1px solid rgba(21,88,214,.18);box-shadow:0 10px 28px rgba(2,6,23,.08);color:#0f172a}.ai-intake-empty b,.ai-intake-error b{color:#081c4b}.ai-intake-error{border-color:rgba(239,68,68,.35);background:#fff7f7}
      .ai-intake-card{border-radius:20px;padding:13px;background:linear-gradient(180deg,#fff,#f8fbff);border:1px solid rgba(21,88,214,.22);box-shadow:0 16px 38px rgba(2,6,23,.10)}
      .ai-intake-card.ready{border-color:rgba(34,197,94,.45);box-shadow:0 16px 40px rgba(34,197,94,.14)}.ai-intake-card.admin{border-color:rgba(239,68,68,.42);box-shadow:0 16px 40px rgba(239,68,68,.12)}.ai-intake-card.need{border-color:rgba(245,158,11,.42)}
      .ai-intake-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ai-intake-title{font-size:16px;font-weight:1000;color:#081c4b;line-height:1.25}.ai-intake-sub{color:#64748b;font-size:13px;font-weight:800;margin-top:3px}
      .ai-status-pill{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-weight:1000;font-size:12px;background:#e2e8f0;color:#0f172a;white-space:nowrap}.ai-status-pill.ready{background:#bbf7d0;color:#052e16}.ai-status-pill.admin{background:#fecaca;color:#7f1d1d}.ai-status-pill.need{background:#fde68a;color:#78350f}
      .ai-intake-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.ai-info{border:1px solid rgba(15,23,42,.08);background:#fff;border-radius:14px;padding:9px}.ai-info span{display:block;color:#64748b;font-size:12px;font-weight:900}.ai-info b{display:block;margin-top:2px;color:#0f172a;font-size:14px;word-break:break-word}
      .ai-message{margin-top:10px;border-radius:14px;background:#f8fafc;border:1px solid rgba(15,23,42,.08);padding:10px;color:#0f172a;font-weight:750;line-height:1.4}.ai-message small{display:block;color:#64748b;font-weight:900;margin-bottom:3px}
      .ai-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.ai-actions .btn{min-height:42px}.ai-main-action{background:#22c55e!important;color:#052e16!important}.ai-blue-action{background:linear-gradient(135deg,#2563eb,#06b6d4)!important;color:#fff!important}.ai-warn-action{background:#fde68a!important;color:#78350f!important}.ai-danger-action{background:#fee2e2!important;color:#7f1d1d!important}
      @media(max-width:520px){.ai-intake-grid{grid-template-columns:1fr}.ai-actions{grid-template-columns:1fr}.ai-intake-top{flex-direction:column}.ai-status-pill{align-self:flex-start}}
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
    panel.className = "ai-intake-wrap";
    list.parentNode.insertBefore(panel, list);
    return panel;
  }

  function headerHtml(count){
    return `
      <section class="ai-intake-head">
        <div class="top">
          <div><b>🤖 งานจาก LINE AI รอแอดมิน</b><small>AI เก็บข้อมูลจากแชทจริง แอดมินเป็นคนตรวจและเพิ่มงานเอง</small></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="ai-notify-btn" type="button" id="btnAiNotifyEnable">${esc(notificationLabel())}</button>
            <span class="ai-intake-badge">${Number(count || 0)} รายการ</span>
          </div>
        </div>
      </section>`;
  }

  function bindNotifyButton(){
    const btn = byId("btnAiNotifyEnable");
    if (!btn || btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener("click", async ()=>{
      if (!canNotify()) return toast("เครื่องนี้ไม่รองรับการแจ้งเตือน", "error");
      if (Notification.permission === "granted") return toast("เปิดแจ้งเตือนอยู่แล้ว", "success");
      if (Notification.permission === "denied") return toast("Browser บล็อกแจ้งเตือนไว้ ต้องเปิดจาก Settings", "error");
      const result = await Notification.requestPermission();
      btn.textContent = notificationLabel();
      if (result === "granted") {
        try { new Notification("CWF AI", { body:"เปิดแจ้งเตือนงานจาก LINE AI แล้ว" }); } catch(_){}
        toast("เปิดแจ้งเตือนแล้ว", "success");
      }
    });
  }

  function render(items, errorMsg){
    injectStyle();
    const panel = ensurePanel();
    if (!panel) return;
    const actionable = (items || []).filter(x => ["READY_TO_CREATE_JOB", "NEED_INFO", "ADMIN_REQUIRED", "CUSTOMER_INTERESTED"].includes(x.status));
    if (errorMsg) {
      panel.innerHTML = headerHtml(0) + `<div class="ai-intake-error"><b>ยังโหลด LINE AI ไม่ได้</b><div class="muted" style="margin-top:4px">${esc(errorMsg)}</div><div class="muted" style="margin-top:4px">ให้เช็คว่า route /admin/ai-office/booking-intakes ถูก mount และ deploy บน Render แล้ว</div></div>`;
      bindNotifyButton();
      return;
    }
    if (!actionable.length) {
      panel.innerHTML = headerHtml(0) + `<div class="ai-intake-empty"><b>ยังไม่มีลูกค้าจาก LINE AI ที่รอเพิ่มงาน</b><div class="muted" style="margin-top:4px">ถ้าลูกค้าส่งข้อมูลจองครบ ระบบจะขึ้นการ์ดตรงนี้ทันที</div></div>`;
      bindNotifyButton();
      return;
    }
    const ready = actionable.filter(x => x.status === "READY_TO_CREATE_JOB").length;
    const need = actionable.filter(x => x.status === "NEED_INFO").length;
    const admin = actionable.filter(x => x.status === "ADMIN_REQUIRED").length;
    panel.innerHTML = headerHtml(actionable.length) + actionable.map(cardHtml).join("");
    bindNotifyButton();
    const alertBox = byId("approvalAlert");
    if (alertBox) {
      alertBox.style.display = "block";
      alertBox.innerHTML = `🤖 LINE AI: พร้อมเพิ่มงาน ${ready} • ต้องถามเพิ่ม ${need} • แอดมินตอบเอง ${admin}`;
    }
    const pill = byId("pillCount");
    if (pill && !pill.dataset.aiBase) pill.dataset.aiBase = pill.textContent || "0 งาน";
    if (pill) pill.textContent = `${pill.dataset.aiBase} • AI ${actionable.length}`;
    notifyAdmin(actionable);
  }

  function cardHtml(item){
    const cls = statusClass(item.status);
    const title = item.customer_name || item.customer_phone || "ลูกค้า LINE";
    const sub = [item.service_type, item.unit_count ? `${item.unit_count} เครื่อง` : "", item.area_text || item.address_text].filter(Boolean).join(" • ") || "รอแอดมินตรวจข้อมูล";
    const lineUrl = item.conversation_id ? `/admin-ai-office.html?conversation_id=${encodeURIComponent(item.conversation_id)}` : "/admin-ai-office.html";
    return `
      <article class="ai-intake-card ${cls}" data-ai-intake-id="${esc(item.id)}">
        <div class="ai-intake-top">
          <div><div class="ai-intake-title">${esc(title)}</div><div class="ai-intake-sub">${esc(sub)}</div></div>
          <span class="ai-status-pill ${cls}">${esc(statusLabel(item.status))}</span>
        </div>
        <div class="ai-intake-grid">
          <div class="ai-info"><span>เบอร์</span><b>${esc(item.customer_phone || "-")}</b></div>
          <div class="ai-info"><span>วันเวลา</span><b>${esc([item.preferred_date, item.preferred_time].filter(Boolean).join(" ") || "-")}</b></div>
          <div class="ai-info"><span>ราคา</span><b>${esc(money(item.quoted_price))}</b></div>
          <div class="ai-info"><span>ข้อมูลที่ยังขาด</span><b>${esc(missingLine(item))}</b></div>
        </div>
        <div class="ai-message"><small>ข้อความล่าสุด / คำแนะนำ AI</small>${esc(item.latest_customer_message || item.ai_summary || "-")}<br><span class="muted">${esc(item.ai_summary || "")}</span></div>
        <div class="ai-actions">
          <button class="btn ai-main-action" type="button" data-ai-copy-open="${esc(item.id)}">สร้างงานจากข้อมูลนี้</button>
          <button class="btn ai-blue-action" type="button" onclick="location.href='${esc(lineUrl)}'">ดูแชท LINE</button>
          <button class="btn ai-warn-action" type="button" data-ai-ask="${esc(item.id)}">ถามข้อมูลเพิ่ม</button>
          <button class="btn ai-danger-action" type="button" data-ai-admin="${esc(item.id)}">ให้แอดมินตอบเอง</button>
          <button class="btn btn-ghost" type="button" data-ai-copy="${esc(item.id)}">คัดลอกข้อมูล</button>
          <button class="btn btn-ghost" type="button" data-ai-close="${esc(item.id)}">ปิดรายการ</button>
        </div>
      </article>`;
  }

  function notifyAdmin(items){
    const ready = items.filter(x => x.status === "READY_TO_CREATE_JOB");
    const fingerprint = ready.map(x => `${x.id}:${x.updated_at}`).join("|");
    if (!ready.length || fingerprint === STATE.lastFingerprint) return;
    STATE.lastFingerprint = fingerprint;
    if (ready.length > STATE.lastReadyCount) {
      playSoftAlert();
      showBrowserNotice(ready[0]);
    }
    STATE.lastReadyCount = ready.length;
  }
  function playSoftAlert(){
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = 880; gain.gain.value = 0.035;
      osc.connect(gain); gain.connect(ctx.destination); osc.start();
      setTimeout(()=>{ try { osc.stop(); ctx.close(); } catch(_){} }, 180);
    } catch(_){}
  }
  function showBrowserNotice(item){
    try {
      if (!canNotify() || Notification.permission !== "granted") return;
      const n = new Notification("CWF AI: ลูกค้าพร้อมจองแล้ว", { body:`${item.service_type || "งานใหม่"} • ${item.unit_count || "-"} เครื่อง • ${item.area_text || item.address_text || "รอตรวจพื้นที่"}`, tag:`cwf-ai-intake-${item.id}` });
      n.onclick = ()=>{ window.focus(); n.close(); };
    } catch(_){}
  }

  async function loadAiIntakes(){
    try {
      const data = await api("/admin/ai-office/booking-intakes?status=open&limit=80");
      const items = Array.isArray(data.intakes) ? data.intakes : [];
      STATE.hasLoadedOnce = true;
      render(items, "");
      return items;
    } catch(e) {
      render([], e.message || "โหลดข้อมูลไม่สำเร็จ");
      return [];
    }
  }
  async function fetchIntake(id){ const data = await api(`/admin/ai-office/booking-intakes/${Number(id)}`); return data.intake || null; }
  async function copyText(value){
    const s = clean(value); if (!s) return;
    try { await navigator.clipboard.writeText(s); toast("คัดลอกข้อมูลแล้ว", "success"); }
    catch(_) { window.prompt("คัดลอกข้อมูลนี้", s); }
  }
  async function copyIntake(id, openAdd){
    const data = await api(`/admin/ai-office/booking-intakes/${Number(id)}`);
    const intake = data.intake || null;
    if (!intake) return toast("ไม่พบรายการ AI", "error");
    await copyText(data.copy_text || buildCopyText(intake));
    if (openAdd && confirm("คัดลอกข้อมูลแล้ว เปิดหน้าเพิ่มงานเพื่อให้แอดมินตรวจและบันทึกเอง?")) {
      location.href = `/admin-add-v2.html?source=line_ai&ai_intake_id=${encodeURIComponent(id)}`;
    }
  }
  async function copyAskMissing(id){
    const intake = await fetchIntake(id);
    if (!intake) return toast("ไม่พบรายการ AI", "error");
    const missing = Array.isArray(intake.missing_fields) ? intake.missing_fields : [];
    const msg = missing.length ? `ได้ค่ะ รบกวนขอ${missing.slice(0, 2).join(" และ ")}เพิ่มเติมนะคะ เดี๋ยวแอดมินตรวจคิวและยืนยันนัดให้อีกครั้งค่ะ` : "ได้ค่ะ แอดมินได้รับข้อมูลแล้วนะคะ เดี๋ยวขอตรวจคิวช่างและยืนยันนัดให้อีกครั้งค่ะ";
    await copyText(msg);
  }
  async function postAction(id, action, body){
    await api(`/admin/ai-office/booking-intakes/${Number(id)}/${action}`, { method:"POST", body:JSON.stringify(body || {}) });
    toast("อัปเดตรายการแล้ว", "success");
    await loadAiIntakes();
  }
  function bindActions(){
    document.addEventListener("click", async (e)=>{
      const copyOpen = e.target.closest("[data-ai-copy-open]");
      const copyOnly = e.target.closest("[data-ai-copy]");
      const ask = e.target.closest("[data-ai-ask]");
      const admin = e.target.closest("[data-ai-admin]");
      const close = e.target.closest("[data-ai-close]");
      try {
        if (copyOpen) return copyIntake(copyOpen.getAttribute("data-ai-copy-open"), true);
        if (copyOnly) return copyIntake(copyOnly.getAttribute("data-ai-copy"), false);
        if (ask) return copyAskMissing(ask.getAttribute("data-ai-ask"));
        if (admin) return postAction(admin.getAttribute("data-ai-admin"), "admin-required", { admin_note:"แอดมินรับช่วงตอบเองจากหน้างานจอง" });
        if (close) { if (!confirm("ปิดรายการ AI นี้?")) return; return postAction(close.getAttribute("data-ai-close"), "close", { admin_note:"ปิดจากหน้างานจอง" }); }
      } catch(err) { toast(err.message || "จัดการรายการ AI ไม่สำเร็จ", "error"); }
    });
  }
  function wrapLoadQueue(){
    const oldLoadQueue = window.loadQueue;
    if (typeof oldLoadQueue !== "function" || oldLoadQueue.__aiIntakeWrapped) return;
    const wrapped = async function(){
      if (byId("pillCount")) delete byId("pillCount").dataset.aiBase;
      const out = await oldLoadQueue.apply(this, arguments);
      await loadAiIntakes();
      return out;
    };
    wrapped.__aiIntakeWrapped = true;
    window.loadQueue = wrapped;
  }
  function startPolling(){
    if (STATE.pollingTimer) clearInterval(STATE.pollingTimer);
    STATE.pollingTimer = setInterval(loadAiIntakes, 25000);
  }
  function init(){
    injectStyle();
    ensurePanel();
    bindActions();
    wrapLoadQueue();
    setTimeout(loadAiIntakes, 400);
    startPolling();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
