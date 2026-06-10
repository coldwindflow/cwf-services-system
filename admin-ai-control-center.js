(function(){
  "use strict";

  const STATE = { settings: [], values: {}, drafts: [], approvals: [], decisions: [], decisionResult: null, examples: [], activeTab: "overview", open: false };
  const CATEGORY_LABELS = { main:"สถานะหลัก", line:"LINE OA", reply:"การตอบลูกค้า", safety:"ความปลอดภัย" };

  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }
  function clean(v){ return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); else alert(msg); } catch(_){} }
  function api(url, options){
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"}}, options || {})).then(async (res)=>{
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.message || data?.error || `HTTP_${res.status}`);
      return data || {};
    });
  }

  function injectStyle(){
    if ($("#aiControlCenterStyle")) return;
    const style = document.createElement("style");
    style.id = "aiControlCenterStyle";
    style.textContent = `
      .ai-control-open{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:89;border:0;border-radius:999px;background:#ffcc00;color:#06163d;font-weight:1000;min-height:46px;padding:0 15px;box-shadow:0 14px 30px rgba(2,6,23,.22)}
      .ai-control-overlay{position:fixed;inset:0;z-index:190;display:none;background:#f7fbff;color:#07152f;overflow:hidden}.ai-control-overlay.open{display:flex;flex-direction:column}
      .ai-control-top{flex:0 0 auto;background:linear-gradient(135deg,#06163d,#0d3d8d 70%,#1769ff);color:#fff;padding:calc(10px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left));box-shadow:0 12px 30px rgba(2,6,23,.26)}
      .ai-control-head{display:flex;align-items:center;gap:10px}.ai-control-title{min-width:0;flex:1}.ai-control-title b{display:block;font-size:20px;font-weight:1000;line-height:1.1}.ai-control-title span{display:block;margin-top:3px;font-size:12px;color:rgba(255,255,255,.75);font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ai-control-close{border:0;border-radius:15px;background:rgba(255,255,255,.14);color:#fff;width:44px;height:44px;font-size:22px;font-weight:1000}.ai-control-refresh{border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#ffcc00;color:#06163d;min-height:38px;padding:0 12px;font-size:12px;font-weight:1000}
      .ai-control-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));background:#06163d;scrollbar-width:none}.ai-control-tabs::-webkit-scrollbar{display:none}
      .ai-control-tab{flex:0 0 auto;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.10);color:#fff;min-height:38px;padding:0 12px;font-size:13px;font-weight:1000}.ai-control-tab.active{background:#ffcc00;color:#06163d;border-color:#ffcc00}
      .ai-control-body{flex:1 1 auto;overflow:auto;padding:12px max(12px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:12px;background:linear-gradient(180deg,#e7f0ff,#f8fbff)}
      .ai-panel-card{border-radius:22px;background:#fff;border:1px solid rgba(21,88,214,.14);box-shadow:0 12px 30px rgba(2,6,23,.08);padding:13px}.ai-panel-card h3{margin:0;color:#06163d;font-size:16px}.ai-panel-card .hint2{margin-top:5px;color:#64748b;font-size:12px;font-weight:800;line-height:1.35}
      .ai-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media(max-width:720px){.ai-grid{grid-template-columns:1fr}}
      .ai-metric{border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);border:1px solid rgba(15,23,42,.08);padding:12px}.ai-metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.ai-metric b{display:block;margin-top:5px;color:#06163d;font-size:23px;font-weight:1000;line-height:1}
      .ai-switch-row{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid rgba(15,23,42,.08)}.ai-switch-row:first-of-type{border-top:0}.ai-switch-main{flex:1;min-width:0}.ai-switch-main b{display:block;color:#07152f;font-size:14px}.ai-switch-main small{display:block;color:#64748b;font-size:12px;font-weight:800;margin-top:2px;line-height:1.28}.ai-lock{display:inline-flex;margin-left:6px;border-radius:999px;background:#e2e8f0;color:#334155;padding:2px 6px;font-size:10px;font-weight:1000}
      .ai-switch{position:relative;width:56px;height:32px;flex:0 0 auto}.ai-switch input{position:absolute;opacity:0;inset:0}.ai-slider{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}.ai-slider:after{content:"";position:absolute;width:26px;height:26px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(2,6,23,.22);transition:.16s}.ai-switch input:checked + .ai-slider{background:#22c55e}.ai-switch input:checked + .ai-slider:after{transform:translateX(24px)}.ai-switch input:disabled + .ai-slider{opacity:.55;background:#94a3b8}
      .ai-draft-card,.ai-brain-item{border-radius:18px;border:1px solid rgba(15,23,42,.08);background:#fff;padding:12px;margin-top:10px}.ai-draft-card b,.ai-brain-item b{display:block;color:#06163d}.ai-draft-card p,.ai-brain-item p{margin:7px 0 0;color:#334155;font-size:13px;font-weight:750;line-height:1.35;white-space:pre-wrap}.ai-actions-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.ai-actions-row button,.ai-control-form button{border:1px solid rgba(21,88,214,.16);border-radius:999px;background:#f8fbff;color:#0d3d8d;min-height:38px;padding:0 12px;font-weight:1000}.ai-actions-row button.primary,.ai-control-form button.primary{background:#ffcc00;color:#06163d;border-color:#ffcc00}.ai-actions-row button.danger{background:#fee2e2;color:#7f1d1d;border-color:#fecaca}.ai-actions-row button:disabled{opacity:.45;filter:grayscale(1);cursor:not-allowed}
      .ai-control-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.ai-control-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#64748b;font-weight:900}.ai-control-form input,.ai-control-form select,.ai-control-form textarea{width:100%;border:1px solid rgba(21,88,214,.16);border-radius:14px;padding:10px;color:#07152f;background:#fff}.ai-control-form textarea{min-height:92px;resize:vertical}.ai-control-form .wide{grid-column:1/-1}@media(max-width:680px){.ai-control-form{grid-template-columns:1fr}}
      .ai-empty{border-radius:18px;background:#fff;border:1px dashed rgba(21,88,214,.22);padding:18px;color:#64748b;font-weight:850;text-align:center}.ai-error{border-radius:18px;background:#fff7f7;border:1px solid rgba(239,68,68,.28);padding:12px;color:#7f1d1d;font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function ensureDom(){
    injectStyle();
    if (!$("#aiControlOpen")) {
      const btn = document.createElement("button");
      btn.id = "aiControlOpen";
      btn.className = "ai-control-open";
      btn.type = "button";
      btn.textContent = "⚙️ แผงควบคุม AI";
      document.body.appendChild(btn);
      btn.addEventListener("click", openPanel);
      const topActions = $(".topActions");
      if (topActions && !$("#aiControlTopButton")) {
        const top = document.createElement("button");
        top.id = "aiControlTopButton";
        top.className = "topBtn inbox";
        top.type = "button";
        top.textContent = "AI Control";
        top.addEventListener("click", openPanel);
        topActions.prepend(top);
      }
    }
    if ($("#aiControlOverlay")) return;
    const overlay = document.createElement("section");
    overlay.id = "aiControlOverlay";
    overlay.className = "ai-control-overlay";
    overlay.innerHTML = `
      <div class="ai-control-top">
        <div class="ai-control-head">
          <button class="ai-control-close" type="button" data-ai-control-close>‹</button>
          <div class="ai-control-title"><b>แผงควบคุม AI</b><span>เปิด/ปิดความสามารถของ AI และปรับคลังสมองคำตอบ</span></div>
          <button class="ai-control-refresh" type="button" data-ai-control-refresh>รีเฟรช</button>
        </div>
      </div>
      <nav class="ai-control-tabs">
        <button class="ai-control-tab" data-ai-tab="overview">ภาพรวม</button>
        <button class="ai-control-tab" data-ai-tab="switches">สวิตช์</button>
        <button class="ai-control-tab" data-ai-tab="drafts">ร่างตอบ</button>
        <button class="ai-control-tab" data-ai-tab="approvals">อนุมัติ</button>
        <button class="ai-control-tab" data-ai-tab="decision">ตรวจคำตอบ</button>
        <button class="ai-control-tab" data-ai-tab="brain">คลังสมอง</button>
      </nav>
      <main class="ai-control-body" id="aiControlBody"></main>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", handleClick);
    overlay.addEventListener("change", handleChange);
    overlay.addEventListener("submit", handleSubmit);
  }

  function openPanel(tab){
    ensureDom();
    STATE.open = true;
    const paramTab = new URLSearchParams(location.search).get("panel");
    if (typeof tab === "string") STATE.activeTab = tab;
    else if (paramTab === "line-ai") STATE.activeTab = "overview";
    $("#aiControlOverlay").classList.add("open");
    loadAll();
  }
  function closePanel(){ STATE.open = false; $("#aiControlOverlay")?.classList.remove("open"); }

  async function loadSettings(){
    const data = await api("/admin/ai-office/control/settings");
    STATE.settings = data.settings || [];
    STATE.values = data.values || {};
  }
  async function loadDrafts(){
    try { const data = await api("/admin/ai-office/control/pending-drafts"); STATE.drafts = data.drafts || []; } catch(_) { STATE.drafts = []; }
  }
  async function loadDecisionLogs(){
    try { const data = await api("/admin/ai-office/control/reply-decision/logs?limit=40"); STATE.decisions = data.decisions || []; } catch(_) { STATE.decisions = []; }
  }
  async function loadExamples(){
    try { const data = await api("/admin/ai-office/reply-examples?limit=100&active_only=false"); STATE.examples = data.examples || []; } catch(_) { STATE.examples = []; }
  }
  async function loadAll(){
    renderLoading();
    try {
      await loadSettings();
      if (["drafts","overview"].includes(STATE.activeTab)) await loadDrafts();
      if (["approvals","overview"].includes(STATE.activeTab)) await loadApprovals();
      if (["decision","overview"].includes(STATE.activeTab)) await loadDecisionLogs();
      if (STATE.activeTab === "brain") await loadExamples();
      render();
    } catch (err) {
      renderError(err.message || "โหลดแผงควบคุมไม่ได้");
    }
  }

  function modeText(){
    const v = STATE.values || {};
    if (v.kill_switch) return "หยุด AI";
    if (!v.ai_office_enabled) return "ปิด AI Office";
    if (v.draft_reply_enabled) return "DRAFT_ONLY";
    return "OFF";
  }
  function renderLoading(){ const body = $("#aiControlBody"); if (body) body.innerHTML = `<div class="ai-empty">กำลังโหลดแผงควบคุม AI...</div>`; }
  function renderError(msg){ const body = $("#aiControlBody"); if (body) body.innerHTML = `<div class="ai-error">${esc(msg)}</div>`; updateTabs(); }
  function updateTabs(){ $all(".ai-control-tab").forEach(b => b.classList.toggle("active", b.dataset.aiTab === STATE.activeTab)); }
  function render(){
    updateTabs();
    const body = $("#aiControlBody");
    if (!body) return;
    if (STATE.activeTab === "switches") body.innerHTML = renderSwitches();
    else if (STATE.activeTab === "drafts") body.innerHTML = renderDrafts();
    else if (STATE.activeTab === "approvals") body.innerHTML = renderApprovals();
    else if (STATE.activeTab === "decision") body.innerHTML = renderDecisionLab();
    else if (STATE.activeTab === "brain") body.innerHTML = renderBrain();
    else body.innerHTML = renderOverview();
  }

  function renderOverview(){
    const v = STATE.values || {};
    const openIntake = clean(new URLSearchParams(location.search).get("ai_intake_id"));
    return `
      <section class="ai-panel-card"><h3>สถานะ AI ตอนนี้</h3><div class="hint2">ระบบยังไม่ส่ง LINE เอง ค่า Auto Send ถูกล็อกปิดเพื่อความปลอดภัย</div>
        <div class="ai-grid" style="margin-top:10px">
          <div class="ai-metric"><span>โหมดทำงาน</span><b>${esc(modeText())}</b></div>
          <div class="ai-metric"><span>ร่างตอบรอแอดมิน</span><b>${STATE.drafts.length}</b></div>
          <div class="ai-metric"><span>รออนุมัติส่ง/ใช้</span><b>${STATE.approvals.length}</b></div>
          <div class="ai-metric"><span>ตรวจคำตอบ 7 วัน</span><b>${STATE.decisions.length}</b></div>
          <div class="ai-metric"><span>LINE Intake</span><b>${v.line_intake_enabled ? "เปิด" : "ปิด"}</b></div>
          <div class="ai-metric"><span>Auto Send LINE</span><b>ล็อกปิด</b></div>
        </div>
        ${openIntake ? `<div class="hint2" style="margin-top:10px">เปิดมาจากการ์ด LINE AI intake #${esc(openIntake)} — ใช้แท็บสวิตช์/ร่างตอบ/คลังสมองได้จากหน้านี้</div>` : ""}
      </section>
      <section class="ai-panel-card"><h3>ปุ่มลัด</h3><div class="ai-actions-row"><button class="primary" type="button" data-ai-tab-go="switches">ตั้งค่าสวิตช์</button><button type="button" data-ai-tab-go="drafts">ดูร่างตอบ</button><button type="button" data-ai-tab-go="approvals">คิวอนุมัติ</button><button type="button" data-ai-tab-go="decision">ตรวจคำตอบ</button><button type="button" data-ai-tab-go="brain">แก้คลังสมอง</button><button type="button" onclick="location.href='/admin-review-v2.html'">กลับหน้างานจอง</button></div></section>
      <section class="ai-panel-card"><h3>ความปลอดภัยที่ล็อกไว้</h3><div class="hint2">ร้องเรียน / ใบกำกับภาษี / ลดราคา / ยืนยันคิว จะไม่ให้ AI ตัดสินใจเอง</div></section>`;
  }

  function renderSwitches(){
    const grouped = STATE.settings.reduce((acc, item) => { (acc[item.category] ||= []).push(item); return acc; }, {});
    return Object.keys(CATEGORY_LABELS).map(cat => {
      const items = grouped[cat] || [];
      if (!items.length) return "";
      return `<section class="ai-panel-card"><h3>${esc(CATEGORY_LABELS[cat])}</h3>${items.map(renderSwitch).join("")}</section>`;
    }).join("");
  }
  function renderSwitch(item){
    const checked = item.value === true || item.value === "true";
    return `<div class="ai-switch-row">
      <div class="ai-switch-main"><b>${esc(item.label)}${item.locked ? '<span class="ai-lock">ล็อก</span>' : ''}</b><small>${esc(item.description)}</small></div>
      <label class="ai-switch"><input type="checkbox" data-ai-switch-key="${esc(item.key)}" ${checked ? "checked" : ""} ${item.locked ? "disabled" : ""}><span class="ai-slider"></span></label>
    </div>`;
  }

  function renderDrafts(){
    if (!STATE.drafts.length) return `<div class="ai-empty">ยังไม่มีร่างคำตอบที่รอแอดมิน</div>`;
    return `<section class="ai-panel-card"><h3>ร่างคำตอบจาก LINE</h3><div class="hint2">ยังไม่ส่ง LINE เอง แอดมินเป็นคนคัดลอก/แก้/อนุมัติการใช้งานเอง</div>${STATE.drafts.map(d => `
      <article class="ai-draft-card">
        <b>${esc(d.display_name || "ลูกค้า LINE")} · ${esc(d.action_status || "drafted")}</b>
        <p><strong>ลูกค้า:</strong> ${esc(d.selected_customer_message || d.last_message_text || "")}</p>
        <p><strong>AI ร่าง:</strong> ${esc(d.final_admin_reply || d.ai_draft || "")}</p>
        <div class="ai-actions-row"><button type="button" data-create-approval-from-draft="${esc(d.id || "")}">ส่งเข้าคิวอนุมัติ</button><button type="button" data-copy-text="${esc(d.final_admin_reply || d.ai_draft || "")}">คัดลอก</button><button type="button" data-open-line-conv="${esc(d.conversation_id || "")}">เปิดแชท</button></div>
      </article>`).join("")}</section>`;
  }

  function approvalStatusText(status){
    return ({ pending:"รออนุมัติ", edited:"แก้ไขแล้ว", approved:"อนุมัติแล้ว", sent:"ส่งแล้ว", rejected:"ปฏิเสธ", admin_only:"ให้แอดมินตอบเอง" })[status] || status || "-";
  }
  function renderApprovals(){
    const canSend = STATE.values?.admin_approved_line_send_enabled === true && STATE.values?.kill_switch !== true && STATE.values?.ai_office_enabled !== false;
    if (!STATE.approvals.length) return `<div class="ai-empty">ยังไม่มีข้อความรออนุมัติ</div>`;
    return `<section class="ai-panel-card"><h3>คิวอนุมัติข้อความตอบลูกค้า</h3><div class="hint2">AI ยังไม่ส่ง LINE เอง ข้อความในหน้านี้ต้องให้แอดมินอนุมัติ/แก้/ส่งเองเท่านั้น • ปุ่มส่ง LINE จะใช้ได้เมื่อเปิดสวิตช์ “แอดมินกดส่ง LINE จากคิวอนุมัติ”</div>${STATE.approvals.map(a => `
      <article class="ai-draft-card" data-approval-id="${esc(a.id)}">
        <b>${esc(a.line_display_name || "ลูกค้า LINE")} · ${esc(approvalStatusText(a.status))} · ${esc(a.risk_label || "LOW")}</b>
        <p><strong>ลูกค้า:</strong> ${esc(a.customer_message || "")}</p>
        <p><strong>เหตุผล:</strong> ${esc(a.decision_reason || "รอแอดมินตรวจ")}</p>
        <label style="display:block;margin-top:8px;color:#06163d;font-weight:900;font-size:13px">ข้อความที่จะใช้ตอบ</label>
        <textarea data-approval-reply="${esc(a.id)}" rows="5" style="width:100%;margin-top:6px;border-radius:14px;padding:10px;border:1px solid rgba(21,88,214,.18);resize:vertical">${esc(a.final_reply || a.ai_draft || "")}</textarea>
        <div class="ai-actions-row">
          <button type="button" data-save-approval="${esc(a.id)}">บันทึกแก้ไข</button>
          <button class="primary" type="button" data-approve-approval="${esc(a.id)}">อนุมัติใช้</button>
          <button type="button" data-copy-approval="${esc(a.id)}">คัดลอก</button>
          <button type="button" data-send-approval="${esc(a.id)}" ${canSend ? "" : "disabled"}>ส่ง LINE ตอนนี้</button>
          <button type="button" data-open-line-conv="${esc(a.conversation_id || "")}">เปิดแชท</button>
          <button type="button" data-admin-only-approval="${esc(a.id)}">แอดมินตอบเอง</button>
          <button class="danger" type="button" data-reject-approval="${esc(a.id)}">ปฏิเสธ</button>
        </div>
      </article>`).join("")}</section>`;
  }

  function decisionText(decision){
    return ({ SAFE_DRAFT:"ร่างได้ ปลอดภัย", APPROVAL_REQUIRED:"ต้องอนุมัติก่อนใช้", ADMIN_ONLY:"แอดมินตอบเอง", BLOCKED:"ถูกปิด/บล็อก" })[decision] || decision || "-";
  }
  function renderDecisionLab(){
    const result = STATE.decisionResult;
    return `<section class="ai-panel-card"><h3>ตรวจคำตอบก่อนใช้ V8</h3><div class="hint2">ใช้คัดกรองข้อความลูกค้าว่า AI ควรร่างได้ไหม ต้องอนุมัติไหม หรือให้แอดมินตอบเอง ระบบยังไม่ส่ง LINE เอง</div>
      <form class="ai-control-form" data-decision-form>
        <label class="wide">ข้อความลูกค้า<textarea name="customer_message" required placeholder="วางข้อความลูกค้าจริงจาก LINE"></textarea></label>
        <label>Conversation ID <input name="conversation_id" placeholder="ไม่ใส่ก็ได้"></label>
        <label>ชื่อ LINE <input name="line_display_name" placeholder="ไม่ใส่ก็ได้"></label>
        <div class="wide ai-actions-row"><button class="primary" type="submit">วิเคราะห์คำตอบ</button><button type="button" data-decision-create-approval ${result?.decision?.id ? "" : "disabled"}>ส่งผลนี้เข้าคิวอนุมัติ</button></div>
      </form>
      ${result ? renderDecisionResult(result) : ""}
    </section>
    <section class="ai-panel-card"><h3>ประวัติการตรวจคำตอบล่าสุด</h3>${STATE.decisions.length ? STATE.decisions.map(renderDecisionItem).join("") : '<div class="ai-empty">ยังไม่มีประวัติการตรวจคำตอบ</div>'}</section>`;
  }
  function renderDecisionResult(result){
    const d = result.decision || result;
    return `<article class="ai-draft-card"><b>${esc(decisionText(d.decision))} · ${esc(d.risk_label || "")} · มั่นใจ ${esc(d.confidence || 0)}%</b>
      <p><strong>เหตุผล:</strong> ${esc(d.decision_reason || "")}</p>
      <p><strong>ข้อความแนะนำ:</strong> ${esc(d.recommended_reply || "")}</p>
      <div class="ai-actions-row"><button type="button" data-copy-text="${esc(d.recommended_reply || "")}">คัดลอกข้อความแนะนำ</button>${result.approval ? `<button type="button" data-ai-tab-go="approvals">ดูในคิวอนุมัติ #${esc(result.approval.id)}</button>` : ""}</div>
    </article>`;
  }
  function renderDecisionItem(d){
    return `<article class="ai-draft-card"><b>#${esc(d.id)} · ${esc(decisionText(d.decision))} · ${esc(d.risk_label || "")}</b><p><strong>ลูกค้า:</strong> ${esc(d.customer_message || "")}</p><p><strong>เหตุผล:</strong> ${esc(d.decision_reason || "")}</p><p><strong>แนะนำ:</strong> ${esc(d.recommended_reply || "")}</p><div class="ai-actions-row"><button type="button" data-create-approval-from-decision="${esc(d.id)}" ${d.approval_id ? "disabled" : ""}>ส่งเข้าคิวอนุมัติ</button><button type="button" data-copy-text="${esc(d.recommended_reply || "")}">คัดลอก</button></div></article>`;
  }

  function renderBrain(){
    return `<section class="ai-panel-card"><h3>เพิ่ม/แก้คลังสมองคำตอบ</h3><div class="hint2">ใช้แก้แนวคำตอบที่ไม่ชอบ หรือเพิ่มตัวอย่างคำตอบแอดมินจริงให้ AI จำ</div>${brainForm()}</section>
      <section class="ai-panel-card"><h3>รายการในคลังสมอง</h3><div class="hint2">กดแก้เพื่อปรับคำตอบเดิม หรือปิดใช้งานคำตอบที่ไม่อยากให้ AI อ้างอิง</div>${STATE.examples.length ? STATE.examples.map(renderExample).join("") : '<div class="ai-empty">ยังไม่มีรายการในคลังสมอง</div>'}</section>`;
  }
  function brainForm(ex){
    const isEdit = !!ex?.id;
    return `<form class="ai-control-form" data-brain-form ${isEdit ? `data-edit-id="${esc(ex.id)}"` : ""}>
      <label>สถานการณ์<select name="situation_type"><option value="general">ทั่วไป</option><option value="price_question">ถามราคา</option><option value="expensive">ลูกค้าบอกแพง</option><option value="appointment">นัดคิว</option><option value="missing_info">ถามข้อมูลที่ขาด</option><option value="complaint">ร้องเรียน</option><option value="foreign_customer">ลูกค้าต่างชาติ</option></select></label>
      <label>ภาษา<select name="language"><option value="th">ไทย</option><option value="en">English</option><option value="ja">日本語</option><option value="unknown">ไม่ระบุ</option></select></label>
      <label class="wide">ข้อความลูกค้า<textarea name="customer_message" required>${esc(ex?.customer_message || "")}</textarea></label>
      <label class="wide">คำตอบที่ต้องการให้ AI เรียนรู้<textarea name="final_admin_reply" required>${esc(ex?.final_admin_reply || ex?.admin_reply || "")}</textarea></label>
      <label>หมวดบริการ<input name="service_type" value="${esc(ex?.service_type || "")}" placeholder="air_cleaning / repair"></label>
      <label>แท็ก<input name="tags" value="${esc(Array.isArray(ex?.tags) ? ex.tags.join(', ') : (ex?.tags || ""))}" placeholder="ราคา, แพง, พรีเมียม"></label>
      <div class="wide ai-actions-row"><button class="primary" type="submit">${isEdit ? "บันทึกการแก้ไข" : "เพิ่มเข้าคลังสมอง"}</button>${isEdit ? '<button type="button" data-cancel-edit>ยกเลิก</button>' : ''}</div>
    </form>`;
  }
  function renderExample(ex){
    return `<article class="ai-brain-item" data-example-id="${esc(ex.id)}"><b>${esc(ex.situation_type || "general")} · ${esc(ex.language || "th")} ${ex.is_active === false ? "· ปิดใช้งาน" : ""}</b><p><strong>ลูกค้า:</strong> ${esc(ex.customer_message || "")}</p><p><strong>คำตอบ:</strong> ${esc(ex.final_admin_reply || ex.admin_reply || "")}</p><div class="ai-actions-row"><button type="button" data-edit-example="${esc(ex.id)}">แก้ไข</button><button class="danger" type="button" data-disable-example="${esc(ex.id)}">ปิดใช้งาน</button></div></article>`;
  }

  function approvalReply(id){ const el = Array.from(document.querySelectorAll("[data-approval-reply]")).find(x => String(x.dataset.approvalReply) === String(id)); return el?.value || ""; }
  async function createApprovalFromDraft(id){
    if (!id) return toast("ไม่พบร่างคำตอบ", "error");
    await api(`/admin/ai-office/control/approvals/from-draft/${encodeURIComponent(id)}`, { method:"POST", body:"{}" });
    STATE.activeTab = "approvals";
    await loadAll();
    toast("ส่งเข้าคิวอนุมัติแล้ว", "success");
  }
  async function saveApproval(id){
    const final_reply = approvalReply(id);
    await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}`, { method:"PATCH", body:JSON.stringify({ final_reply, status:"edited", admin_note:"edited_from_control_center" }) });
    await loadApprovals(); render(); toast("บันทึกข้อความแล้ว", "success");
  }
  async function approveApproval(id){
    const final_reply = approvalReply(id);
    await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/approve`, { method:"POST", body:JSON.stringify({ final_reply, admin_note:"approved_from_control_center" }) });
    await loadApprovals(); render(); toast("อนุมัติข้อความแล้ว", "success");
  }
  async function rejectApproval(id){
    if (!confirm("ปฏิเสธร่างคำตอบนี้ใช่ไหม")) return;
    await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/reject`, { method:"POST", body:JSON.stringify({ admin_note:"rejected_from_control_center" }) });
    await loadApprovals(); render(); toast("ปฏิเสธแล้ว", "success");
  }
  async function adminOnlyApproval(id){
    await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/admin-only`, { method:"POST", body:JSON.stringify({ admin_note:"admin_only_from_control_center" }) });
    await loadApprovals(); render(); toast("ย้ายเป็นแอดมินตอบเองแล้ว", "success");
  }
  async function sendApproval(id){
    const final_reply = approvalReply(id);
    if (!confirm("ส่งข้อความนี้เข้า LINE ลูกค้าตอนนี้ใช่ไหม")) return;
    await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/send`, { method:"POST", body:JSON.stringify({ final_reply, admin_note:"sent_by_admin_from_control_center" }) });
    await loadApprovals(); render(); toast("ส่ง LINE แล้ว", "success");
  }
  function copyApproval(id){
    const text = approvalReply(id);
    navigator.clipboard?.writeText(text || "");
    toast("คัดลอกแล้ว", "success");
  }

  async function analyzeDecision(form){
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (!clean(payload.customer_message)) return toast("กรุณาวางข้อความลูกค้า", "error");
    const data = await api("/admin/ai-office/control/reply-decision", { method:"POST", body:JSON.stringify(payload) });
    STATE.decisionResult = data;
    await loadDecisionLogs();
    render();
    toast("วิเคราะห์คำตอบแล้ว", "success");
  }
  async function createApprovalFromCurrentDecision(){
    const id = STATE.decisionResult?.decision?.id;
    if (!id) return toast("ยังไม่มีผลวิเคราะห์", "error");
    const data = await api(`/admin/ai-office/control/reply-decision/${encodeURIComponent(id)}/approval`, { method:"POST", body:"{}" });
    STATE.decisionResult.approval = data.approval;
    STATE.activeTab = "approvals";
    await loadApprovals();
    render();
    toast("ส่งเข้าคิวอนุมัติแล้ว", "success");
  }
  async function createApprovalFromDecision(id){
    if (!id) return toast("ไม่พบผลวิเคราะห์", "error");
    await api(`/admin/ai-office/control/reply-decision/${encodeURIComponent(id)}/approval`, { method:"POST", body:"{}" });
    STATE.activeTab = "approvals";
    await loadApprovals();
    render();
    toast("ส่งเข้าคิวอนุมัติแล้ว", "success");
  }

  async function updateSetting(key, value){
    const data = await api("/admin/ai-office/control/settings", { method:"PATCH", body:JSON.stringify({ key, value, note:"updated_from_ai_control_center" }) });
    STATE.settings = data.settings || STATE.settings;
    STATE.values = data.values || STATE.values;
    render();
    toast("อัปเดตสวิตช์แล้ว", "success");
  }
  async function saveBrainForm(form){
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.tags = clean(payload.tags || "");
    const id = form.dataset.editId;
    if (!clean(payload.customer_message) || !clean(payload.final_admin_reply)) return toast("กรุณาใส่ข้อความลูกค้าและคำตอบ", "error");
    if (id) await api(`/admin/ai-office/reply-examples/${encodeURIComponent(id)}`, { method:"PATCH", body:JSON.stringify(payload) });
    else await api("/admin/ai-office/reply-examples", { method:"POST", body:JSON.stringify(payload) });
    await loadExamples();
    render();
    toast(id ? "แก้คลังสมองแล้ว" : "เพิ่มเข้าคลังสมองแล้ว", "success");
  }
  async function disableExample(id){
    if (!confirm("ปิดใช้งานคำตอบนี้ใช่ไหม")) return;
    await api(`/admin/ai-office/reply-examples/${encodeURIComponent(id)}/disable`, { method:"PATCH", body:"{}" });
    await loadExamples();
    render();
  }
  function editExample(id){
    const ex = STATE.examples.find(x => String(x.id) === String(id));
    if (!ex) return;
    const first = $("[data-brain-form]");
    if (first) {
      first.outerHTML = brainForm(ex);
      const form = $("[data-brain-form]");
      if (form) {
        if (ex.situation_type) form.elements.situation_type.value = ex.situation_type;
        if (ex.language) form.elements.language.value = ex.language;
        form.scrollIntoView({ behavior:"smooth", block:"start" });
      }
    }
  }

  function handleClick(e){
    if (e.target.closest("[data-ai-control-close]")) return closePanel();
    if (e.target.closest("[data-ai-control-refresh]")) return loadAll();
    const tab = e.target.closest("[data-ai-tab]");
    if (tab) { STATE.activeTab = tab.dataset.aiTab; return loadAll(); }
    const go = e.target.closest("[data-ai-tab-go]");
    if (go) { STATE.activeTab = go.dataset.aiTabGo; return loadAll(); }
    const copy = e.target.closest("[data-copy-text]");
    if (copy) { navigator.clipboard?.writeText(copy.dataset.copyText || ""); return toast("คัดลอกแล้ว", "success"); }
    const fromDraft = e.target.closest("[data-create-approval-from-draft]");
    if (fromDraft) return createApprovalFromDraft(fromDraft.dataset.createApprovalFromDraft).catch(err => toast(err.message, "error"));
    const saveApprovalBtn = e.target.closest("[data-save-approval]");
    if (saveApprovalBtn) return saveApproval(saveApprovalBtn.dataset.saveApproval).catch(err => toast(err.message, "error"));
    const approveBtn = e.target.closest("[data-approve-approval]");
    if (approveBtn) return approveApproval(approveBtn.dataset.approveApproval).catch(err => toast(err.message, "error"));
    const copyApprovalBtn = e.target.closest("[data-copy-approval]");
    if (copyApprovalBtn) return copyApproval(copyApprovalBtn.dataset.copyApproval);
    const sendBtn = e.target.closest("[data-send-approval]");
    if (sendBtn) return sendApproval(sendBtn.dataset.sendApproval).catch(err => toast(err.message, "error"));
    const rejectBtn = e.target.closest("[data-reject-approval]");
    if (rejectBtn) return rejectApproval(rejectBtn.dataset.rejectApproval).catch(err => toast(err.message, "error"));
    const adminOnlyBtn = e.target.closest("[data-admin-only-approval]");
    if (adminOnlyBtn) return adminOnlyApproval(adminOnlyBtn.dataset.adminOnlyApproval).catch(err => toast(err.message, "error"));
    const decisionApproval = e.target.closest("[data-decision-create-approval]");
    if (decisionApproval) return createApprovalFromCurrentDecision().catch(err => toast(err.message, "error"));
    const fromDecision = e.target.closest("[data-create-approval-from-decision]");
    if (fromDecision) return createApprovalFromDecision(fromDecision.dataset.createApprovalFromDecision).catch(err => toast(err.message, "error"));
    const conv = e.target.closest("[data-open-line-conv]");
    if (conv) { closePanel(); const btn = $("#lineInboxBtn"); if (btn) btn.click(); return; }
    const edit = e.target.closest("[data-edit-example]");
    if (edit) return editExample(edit.dataset.editExample);
    const dis = e.target.closest("[data-disable-example]");
    if (dis) return disableExample(dis.dataset.disableExample).catch(err => toast(err.message, "error"));
    if (e.target.closest("[data-cancel-edit]")) return loadAll();
  }
  function handleChange(e){
    const sw = e.target.closest("[data-ai-switch-key]");
    if (!sw) return;
    updateSetting(sw.dataset.aiSwitchKey, !!sw.checked).catch(err => { toast(err.message, "error"); loadAll(); });
  }
  function handleSubmit(e){
    const decisionForm = e.target.closest("[data-decision-form]");
    if (decisionForm) { e.preventDefault(); return analyzeDecision(decisionForm).catch(err => toast(err.message, "error")); }
    const form = e.target.closest("[data-brain-form]");
    if (!form) return;
    e.preventDefault();
    saveBrainForm(form).catch(err => toast(err.message, "error"));
  }

  function init(){
    ensureDom();
    const qs = new URLSearchParams(location.search);
    const panel = qs.get("panel");
    if (panel === "approvals" || panel === "approval") STATE.activeTab = "approvals";
    else if (panel === "drafts") STATE.activeTab = "drafts";
    else if (panel === "decision" || panel === "reply-decision") STATE.activeTab = "decision";
    else if (panel === "brain") STATE.activeTab = "brain";
    else if (panel === "switches") STATE.activeTab = "switches";
    if (["line-ai","ai-control","approvals","approval","drafts","decision","reply-decision","brain","switches"].includes(panel) || qs.get("ai_intake_id")) setTimeout(()=>openPanel(), 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
