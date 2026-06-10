(function(){
  "use strict";

  const STATE = {
    lastReadyCount: 0,
    lastFingerprint: "",
    pollingTimer: null,
    apiStatus: "checking",
    apiError: "",
    lastLoadedAt: "",
    health: null,
  };

  function byId(id){ return document.getElementById(id); }
  function clean(v){ return (v == null ? "" : String(v)).replace(/\s+/g, " ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function money(v){ const n = Number(v || 0); return (Number.isFinite(n) && n > 0) ? `${n.toLocaleString("th-TH")} บาท` : "ให้หน้าเพิ่มงานคำนวณจากระบบจริง"; }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); else console.log(msg); } catch(_){} }
  function canNotify(){ return "Notification" in window; }

  function api(url, options){
    const opts = Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"} }, options || {});
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, opts).then(async (res)=>{
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP_${res.status}`);
      return data || {};
    });
  }

  function statusLabel(status){
    return ({
      READY_TO_CREATE_JOB: "พร้อมเพิ่มงาน",
      NEED_INFO: "ต้องถามข้อมูลเพิ่ม",
      WAITING_CUSTOMER_REPLY: "รอลูกค้าตอบ",
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
    if (status === "NEED_INFO" || status === "WAITING_CUSTOMER_REPLY") return "need";
    return "watch";
  }

  function actionableStatus(status){
    return ["READY_TO_CREATE_JOB", "NEED_INFO", "WAITING_CUSTOMER_REPLY", "ADMIN_REQUIRED", "CUSTOMER_INTERESTED"].includes(status);
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
      `สถานะ: ${statusLabel(item.status)}`,
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
      .ai-intake-wrap{display:flex;flex-direction:column;gap:10px;margin-top:12px}
      .ai-intake-head{padding:13px 14px;border-radius:20px;background:linear-gradient(135deg,#081c4b,#1558d6);color:#fff;box-shadow:0 16px 36px rgba(2,6,23,.18);border:1px solid rgba(255,204,0,.32)}
      .ai-intake-head .top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.ai-intake-head b{font-size:16px}.ai-intake-head small{display:block;color:rgba(255,255,255,.78);font-weight:800;margin-top:3px}
      .ai-intake-badge{display:inline-flex;align-items:center;gap:6px;background:#ffcc00;color:#081c4b;border-radius:999px;padding:7px 10px;font-weight:1000;white-space:nowrap}.ai-notify-btn{border:none;border-radius:999px;padding:8px 10px;background:#fff;color:#081c4b;font-weight:1000;min-height:38px}
      .ai-health{font-size:12px;margin-top:8px;color:rgba(255,255,255,.76);font-weight:800}.ai-health-detail{margin-top:8px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.10);font-size:12px;color:rgba(255,255,255,.84);font-weight:850;line-height:1.35}.ai-health-detail b{font-size:12px;color:#ffcc00}
      .ai-intake-empty,.ai-intake-error{border-radius:18px;padding:12px 13px;background:#fff;border:1px solid rgba(21,88,214,.18);box-shadow:0 10px 28px rgba(2,6,23,.08);color:#0f172a}.ai-intake-empty b,.ai-intake-error b{color:#081c4b}.ai-intake-error{border-color:rgba(239,68,68,.35);background:#fff7f7}
      .ai-intake-card{border-radius:20px;padding:13px;background:linear-gradient(180deg,#fff,#f8fbff);border:1px solid rgba(21,88,214,.22);box-shadow:0 16px 38px rgba(2,6,23,.10)}.ai-intake-card.ready{border-color:rgba(34,197,94,.45);box-shadow:0 16px 40px rgba(34,197,94,.14)}.ai-intake-card.admin{border-color:rgba(239,68,68,.42);box-shadow:0 16px 40px rgba(239,68,68,.12)}.ai-intake-card.need{border-color:rgba(245,158,11,.42)}
      .ai-intake-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ai-intake-title{font-size:16px;font-weight:1000;color:#081c4b;line-height:1.25}.ai-intake-sub{color:#64748b;font-size:13px;font-weight:800;margin-top:3px}.ai-status-pill{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-weight:1000;font-size:12px;background:#e2e8f0;color:#0f172a;white-space:nowrap}.ai-status-pill.ready{background:#bbf7d0;color:#052e16}.ai-status-pill.admin{background:#fecaca;color:#7f1d1d}.ai-status-pill.need{background:#fde68a;color:#78350f}
      .ai-intake-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.ai-info{flex:1 1 180px;border:1px solid rgba(15,23,42,.08);background:#fff;border-radius:14px;padding:9px}.ai-info span{display:block;color:#64748b;font-size:12px;font-weight:900}.ai-info b{display:block;margin-top:2px;color:#0f172a;font-size:14px;word-break:break-word}.ai-message{margin-top:10px;border-radius:14px;background:#f8fafc;border:1px solid rgba(15,23,42,.08);padding:10px;color:#0f172a;font-weight:750;line-height:1.4}.ai-message small{display:block;color:#64748b;font-weight:900;margin-bottom:3px}
      .ai-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.ai-actions .btn{min-height:42px;flex:1 1 150px}.ai-main-action{background:#22c55e!important;color:#052e16!important}.ai-blue-action{background:linear-gradient(135deg,#2563eb,#06b6d4)!important;color:#fff!important}.ai-warn-action{background:#fde68a!important;color:#78350f!important}.ai-danger-action{background:#fee2e2!important;color:#7f1d1d!important}
      @media(max-width:520px){.ai-actions .btn{flex-basis:100%}.ai-intake-top{flex-direction:column}.ai-status-pill{align-self:flex-start}}
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

  function healthHtml(){
    const h = STATE.health;
    if (!h) return "";
    const c = h.counts || {};
    const lineReady = h.line_inbox_table_ready ? "LINE Inbox พร้อม" : "LINE Inbox ยังไม่พร้อม";
    const token = h.line_token_configured ? "token พร้อม" : "ไม่มี token";
    const latestLine = h.latest_line_message ? ` • LINE ล่าสุด ${new Date(h.latest_line_message.received_at || h.latest_line_message.created_at || Date.now()).toLocaleString("th-TH")}` : "";
    const latest = h.latest_intake ? ` • Intake ล่าสุด #${h.latest_intake.id || "-"} ${h.latest_intake.status || ""}` : "";
    return `<div class="ai-health-detail"><b>Health</b>: table ${h.table_ready ? "พร้อม" : "ยังไม่พร้อม"} • ${lineReady} • ${token} • ทั้งหมด ${c.total_count || 0} • พร้อม ${c.ready_count || 0} • ถามเพิ่ม ${c.need_info_count || 0} • รอลูกค้า ${c.waiting_customer_count || 0}${esc(latestLine + latest)}</div>`;
  }

  function headerHtml(count){
    const apiText = STATE.apiStatus === "ok" ? "API พร้อม" : (STATE.apiStatus === "error" ? "API ยังไม่พร้อม" : "กำลังตรวจ API");
    const loaded = STATE.lastLoadedAt ? ` • โหลดล่าสุด ${STATE.lastLoadedAt}` : "";
    return `
      <section class="ai-intake-head">
        <div class="top">
          <div><b>🤖 แผงควบคุม LINE AI</b><small>AI เก็บข้อมูลจากแชทจริง แอดมินเป็นคนตรวจและเพิ่มงานเอง</small></div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <button class="ai-notify-btn" type="button" data-ai-reload>โหลด LINE AI</button>
            <button class="ai-notify-btn" type="button" data-ai-health>ตรวจ API</button>
            <button class="ai-notify-btn" type="button" data-ai-create-from-text>สร้างจากข้อความลูกค้าจริง</button>
            <button class="ai-notify-btn" type="button" data-ai-open-inbox>เปิด Inbox</button>
            <button class="ai-notify-btn" type="button" id="btnAiNotifyEnable">${esc(notificationLabel())}</button>
            <span class="ai-intake-badge">${Number(count || 0)} รายการ</span>
          </div>
        </div>
        <div class="ai-health">Frontend พร้อม • ${esc(apiText)} • ${Number(count || 0)} รายการ${esc(loaded)}</div>
        ${healthHtml()}
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
    const actionable = (items || []).filter(x => actionableStatus(x.status));
    if (errorMsg) {
      STATE.apiStatus = "error";
      STATE.apiError = errorMsg;
      panel.innerHTML = headerHtml(0) + `<div class="ai-intake-error"><b>ยังโหลด LINE AI ไม่ได้</b><div class="muted" style="margin-top:4px">${esc(errorMsg)}</div><div class="muted" style="margin-top:4px">ให้เช็คว่า route /admin/ai-office/booking-intakes ถูก mount และ deploy บน Render แล้ว</div></div>`;
      bindNotifyButton();
      return;
    }
    STATE.apiStatus = "ok";
    STATE.apiError = "";
    STATE.lastLoadedAt = new Date().toLocaleTimeString("th-TH", { hour:"2-digit", minute:"2-digit" });
    if (!actionable.length) {
      panel.innerHTML = headerHtml(0) + `<div class="ai-intake-empty"><b>ยังไม่มีลูกค้าจาก LINE AI ที่รอเพิ่มงาน</b><div class="muted" style="margin-top:4px">ถ้าลูกค้าส่งข้อมูลจองครบ ระบบจะขึ้นการ์ดตรงนี้ทันที หรือกด “สร้างจากข้อความลูกค้าจริง” เพื่อบันทึกข้อความที่แอดมินมีอยู่แล้ว</div></div>`;
      bindNotifyButton();
      updateTopCounts(actionable);
      return;
    }
    panel.innerHTML = headerHtml(actionable.length) + actionable.map(cardHtml).join("");
    bindNotifyButton();
    updateTopCounts(actionable);
    notifyAdmin(actionable);
  }

  function updateTopCounts(actionable){
    const ready = actionable.filter(x => x.status === "READY_TO_CREATE_JOB").length;
    const need = actionable.filter(x => x.status === "NEED_INFO").length;
    const waiting = actionable.filter(x => x.status === "WAITING_CUSTOMER_REPLY").length;
    const admin = actionable.filter(x => x.status === "ADMIN_REQUIRED").length;
    const alertBox = byId("approvalAlert");
    if (alertBox) {
      alertBox.style.display = "block";
      alertBox.innerHTML = `🤖 LINE AI: พร้อมเพิ่มงาน ${ready} • ต้องถามเพิ่ม ${need} • รอลูกค้าตอบ ${waiting} • แอดมินตอบเอง ${admin}`;
    }
    const pill = byId("pillCount");
    if (pill && !pill.dataset.aiBase) pill.dataset.aiBase = pill.textContent || "0 งาน";
    if (pill) pill.textContent = `${pill.dataset.aiBase} • AI ${actionable.length}`;
  }

  function cardHtml(item){
    const cls = statusClass(item.status);
    const title = item.customer_name || item.customer_phone || "ลูกค้า LINE";
    const sub = [item.service_type, item.unit_count ? `${item.unit_count} เครื่อง` : "", item.area_text || item.address_text].filter(Boolean).join(" • ") || "รอแอดมินตรวจข้อมูล";
    const lineUrl = item.conversation_id ? `/admin-ai-office.html?conversation_id=${encodeURIComponent(item.conversation_id)}` : "/admin-ai-office.html";
    const threadCount = Number(item.metadata?.line_thread_message_count || 0) || "-";
    return `
      <article class="ai-intake-card ${cls}" data-ai-intake-id="${esc(item.id)}">
        <div class="ai-intake-top">
          <div><div class="ai-intake-title">${esc(title)}</div><div class="ai-intake-sub">${esc(sub)} • อ่าน thread ${esc(threadCount)} ข้อความ</div></div>
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
          <button class="btn ai-main-action" type="button" data-ai-open-add="${esc(item.id)}">สร้างงานจากข้อมูลนี้</button>
          <button class="btn ai-blue-action" type="button" onclick="location.href='${esc(lineUrl)}'">ดูแชท LINE</button>
          <button class="btn ai-warn-action" type="button" data-ai-ask="${esc(item.id)}">ถามข้อมูลเพิ่ม</button>
          <button class="btn ai-blue-action" type="button" data-ai-job-created="${esc(item.id)}">สร้างงานแล้ว</button>
          <button class="btn ai-danger-action" type="button" data-ai-admin="${esc(item.id)}">ให้แอดมินตอบเอง</button>
          <button class="btn btn-ghost" type="button" data-ai-copy="${esc(item.id)}">คัดลอกข้อมูล</button>
          <button class="btn btn-ghost" type="button" data-ai-close="${esc(item.id)}">ปิดรายการ</button>
        </div>
      </article>`;
  }

  function notifyAdmin(items){
    const ready = items.filter(x => x.status === "READY_TO_CREATE_JOB");
    const fp = ready.map(x => `${x.id}:${x.updated_at}`).join("|");
    if (!ready.length) { STATE.lastFingerprint = fp; STATE.lastReadyCount = 0; return; }
    const firstLoad = !STATE.lastFingerprint;
    const changed = fp && fp !== STATE.lastFingerprint;
    const increased = ready.length > STATE.lastReadyCount;
    if (!firstLoad && (changed || increased)) {
      playSoftAlert();
      showBrowserNotice(ready[0]);
    }
    STATE.lastFingerprint = fp;
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
      setTimeout(() => { try { osc.stop(); ctx.close(); } catch(_){} }, 180);
    } catch (_) {}
  }

  function showBrowserNotice(item){
    try {
      if (!canNotify() || Notification.permission !== "granted") return;
      const n = new Notification("CWF AI: ลูกค้าพร้อมจองแล้ว", {
        body: `${item.service_type || "งานใหม่"} • ${item.unit_count || "-"} เครื่อง • ${item.area_text || item.address_text || "รอตรวจพื้นที่"}`,
        tag: `cwf-ai-intake-${item.id}`,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (_) {}
  }

  async function checkAiHealth(showResult){
    try {
      const data = await api("/admin/ai-office/booking-intakes/health");
      STATE.apiStatus = "ok"; STATE.apiError = ""; STATE.health = data || null;
      if (showResult) toast("LINE AI API พร้อมใช้งาน", "success");
      return data;
    } catch (e) {
      STATE.apiStatus = "error"; STATE.apiError = e.message || "ตรวจ API ไม่สำเร็จ"; STATE.health = null;
      if (showResult) toast(STATE.apiError, "error");
      throw e;
    }
  }

  async function createFromRealLineText(){
    const text = window.prompt("วางข้อความลูกค้าจริงจาก LINE เพื่อสร้างรายการรอแอดมิน");
    if (!text || !clean(text)) return;
    const data = await api("/admin/ai-office/booking-intakes/from-line-text", { method: "POST", body: JSON.stringify({ text: clean(text) }) });
    toast("สร้างรายการจากข้อความลูกค้าจริงแล้ว", "success");
    await checkAiHealth(false).catch(()=>{});
    await loadAiIntakes();
    const id = data?.intake?.id;
    if (id) setTimeout(() => { const card = document.querySelector(`[data-ai-intake-id="${CSS.escape(String(id))}"]`); if (card) card.scrollIntoView({ behavior:"smooth", block:"center" }); }, 400);
  }

  async function loadAiIntakes(){
    try {
      await checkAiHealth(false).catch(()=>{});
      const data = await api("/admin/ai-office/booking-intakes?status=open&limit=80");
      const items = Array.isArray(data.intakes) ? data.intakes : [];
      render(items, "");
      return items;
    } catch (e) {
      render([], e.message || "โหลดข้อมูลไม่สำเร็จ");
      return [];
    }
  }

  async function fetchIntake(id){ const data = await api(`/admin/ai-office/booking-intakes/${Number(id)}`); return data.intake || null; }

  async function copyText(value){
    const s = clean(value);
    if (!s) return;
    try { await navigator.clipboard.writeText(s); toast("คัดลอกข้อมูลแล้ว", "success"); }
    catch (_) { window.prompt("คัดลอกข้อมูลนี้", s); }
  }

  function normalizeJobType(serviceType){ const s = clean(serviceType); if (/ติดตั้ง/.test(s)) return "ติดตั้ง"; if (/ซ่อม|ตรวจ/.test(s)) return "ซ่อม"; if (/ล้าง/.test(s)) return "ล้าง"; return "ล้าง"; }
  function normalizeBtu(value){ const n = Number((String(value || "").replace(/,/g, "").match(/\d+/) || [""])[0]); return Number.isFinite(n) && n > 0 ? String(n) : ""; }

  function buildExistingAddJobPrefill(item){
    const note = [`จาก LINE AI intake #${item.id}`, item.map_url ? `โลเคชั่น: ${item.map_url}` : "", item.preferred_date || item.preferred_time ? `วันเวลาที่ลูกค้าต้องการ: ${[item.preferred_date, item.preferred_time].filter(Boolean).join(" ")}` : "", item.latest_customer_message ? `ข้อความล่าสุด: ${item.latest_customer_message}` : "", item.ai_summary ? `AI note: ${item.ai_summary}` : ""].filter(Boolean).join("\n");
    return {
      source: "accounting_quotation",
      document_no: `LINE-AI-${item.id}`,
      customer_name: item.customer_name || "",
      customer_phone: item.customer_phone || "",
      address_text: item.address_text || item.area_text || "",
      customer_note: note,
      service_lines: [{ job_type: normalizeJobType(item.service_type), ac_type: "ผนัง", wash_variant: "", btu: normalizeBtu(item.btu), qty: Number(item.unit_count || 1) || 1, machine_count: Number(item.unit_count || 1) || 1, unit_price: 0, description: item.ai_summary || "LINE AI" }]
    };
  }

  async function openAddFromIntake(id){
    const item = await fetchIntake(id);
    if (!item) return toast("ไม่พบรายการ LINE AI", "error");
    try {
      localStorage.setItem("cwf_accounting_quote_prefill", JSON.stringify(buildExistingAddJobPrefill(item)));
      localStorage.setItem("cwf_line_ai_intake_pending_id", String(item.id));
      localStorage.setItem("cwf_line_ai_intake_pending_payload", JSON.stringify(item));
    } catch(e) { await copyText(buildCopyText(item)); return toast("บันทึกข้อมูลเตรียมเพิ่มงานไม่ได้ คัดลอกข้อมูลให้แล้ว", "error"); }
    location.href = `/admin-add-v2.html?source=line_ai&ai_intake_id=${encodeURIComponent(id)}&t=${Date.now()}`;
  }

  async function copyIntake(id){ const item = await fetchIntake(id); if (!item) return toast("ไม่พบรายการ LINE AI", "error"); await copyText(buildCopyText(item)); }

  async function copyAskMissing(id){
    const intake = await fetchIntake(id);
    if (!intake) return toast("ไม่พบรายการ LINE AI", "error");
    const missing = Array.isArray(intake.missing_fields) ? intake.missing_fields : [];
    const msg = missing.length ? `ได้ค่ะ รบกวนขอ${missing.slice(0, 2).join(" และ ")}เพิ่มเติมนะคะ เดี๋ยวแอดมินตรวจคิวและยืนยันนัดให้อีกครั้งค่ะ` : "ได้ค่ะ แอดมินได้รับข้อมูลแล้วนะคะ เดี๋ยวขอตรวจคิวช่างและยืนยันนัดให้อีกครั้งค่ะ";
    await copyText(msg);
    try { await postAction(id, "waiting-customer", { admin_note:"แอดมินคัดลอกข้อความถามข้อมูลเพิ่มแล้ว รอลูกค้าตอบกลับ" }); }
    catch(e){ toast("คัดลอกแล้ว แต่เปลี่ยนสถานะรอลูกค้าตอบไม่สำเร็จ", "error"); }
  }

  async function postAction(id, action, body){ await api(`/admin/ai-office/booking-intakes/${Number(id)}/${action}`, { method:"POST", body:JSON.stringify(body || {}) }); toast("อัปเดตรายการแล้ว", "success"); await loadAiIntakes(); }

  function bindActions(){
    document.addEventListener("click", async (e) => {
      const openAdd = e.target.closest("[data-ai-open-add]");
      const copyOnly = e.target.closest("[data-ai-copy]");
      const ask = e.target.closest("[data-ai-ask]");
      const admin = e.target.closest("[data-ai-admin]");
      const close = e.target.closest("[data-ai-close]");
      const created = e.target.closest("[data-ai-job-created]");
      const reload = e.target.closest("[data-ai-reload]");
      const health = e.target.closest("[data-ai-health]");
      const createFromText = e.target.closest("[data-ai-create-from-text]");
      const openInbox = e.target.closest("[data-ai-open-inbox]");
      try {
        if (reload) return loadAiIntakes();
        if (health) { await checkAiHealth(true); return loadAiIntakes(); }
        if (createFromText) return createFromRealLineText();
        if (openInbox) { location.href = "/admin-ai-office.html"; return; }
        if (openAdd) return openAddFromIntake(openAdd.getAttribute("data-ai-open-add"));
        if (copyOnly) return copyIntake(copyOnly.getAttribute("data-ai-copy"));
        if (ask) return copyAskMissing(ask.getAttribute("data-ai-ask"));
        if (admin) return postAction(admin.getAttribute("data-ai-admin"), "admin-required", { admin_note:"แอดมินรับช่วงตอบเองจากหน้างานจอง" });
        if (created) { if (!confirm("ทำเครื่องหมายว่ารายการนี้สร้างงานในระบบแล้ว?")) return; return postAction(created.getAttribute("data-ai-job-created"), "job-created", { admin_note:"แอดมินยืนยันจากหน้างานจองว่าสร้างงานแล้ว", source:"admin_review_queue" }); }
        if (close) { if (!confirm("ปิดรายการ LINE AI นี้?")) return; return postAction(close.getAttribute("data-ai-close"), "close", { admin_note:"ปิดจากหน้างานจอง" }); }
      } catch (err) { toast(err.message || "จัดการรายการ LINE AI ไม่สำเร็จ", "error"); }
    });
  }

  function wrapLoadQueue(){
    const oldLoadQueue = window.loadQueue;
    if (typeof oldLoadQueue !== "function" || oldLoadQueue.__aiIntakeWrapped) return;
    const wrapped = async function(){ const pill = byId("pillCount"); if (pill) delete pill.dataset.aiBase; const out = await oldLoadQueue.apply(this, arguments); await loadAiIntakes(); return out; };
    wrapped.__aiIntakeWrapped = true; window.loadQueue = wrapped;
  }
  function startPolling(){ if (STATE.pollingTimer) clearInterval(STATE.pollingTimer); STATE.pollingTimer = setInterval(loadAiIntakes, 25000); }
  function init(){ injectStyle(); render([], ""); bindActions(); wrapLoadQueue(); setTimeout(loadAiIntakes, 500); startPolling(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
