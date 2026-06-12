(function(){
  "use strict";

  var BUILD="ai-line-control-v32-daylight";
  var EMBEDDED = !!(
    (typeof window !== 'undefined' && window.CWF_AI_CONTROL_EMBEDDED === true) ||
    (document.body && document.body.getAttribute('data-ai-control-embedded') === '1') ||
    document.getElementById('aiControlMount')
  );

  const STATE = {
    settings: [],
    values: {},
    drafts: [],
    approvals: [],
    decisions: [],
    decisionResult: null,
    examples: [],
    lineIntakes: [],
    lineCounts: {},
    lineConversations: [],
    selectedConversation: null,
    lineThread: [],
    lineDraftResult: null,
    health: null,
    autoSafeLogs: [],
    autoSafeQuality: null,
    autoSafePlaybooks: [],
    autoSafeAnalytics: null,
    autoSafeDashboard: null,
    activeTab: "overview",
    open: false,
  };

  const TABS = [
    ["overview", "ภาพรวม"],
    ["dashboard", "แดชบอร์ด"],
    ["reply", "ตอบลูกค้า"],
    ["line", "งาน LINE"],
    ["approvals", "คิวอนุมัติ"],
    ["decision", "ตรวจคำตอบ"],
    ["brain", "คลังสมอง"],
  ];

  const REPLY_TOGGLE_KEYS = [
    "draft_reply_enabled",
    "ask_missing_info_enabled",
    "price_reply_draft_enabled",
    "sales_objection_draft_enabled",
    "approval_queue_enabled",
    "approval_required_enabled",
    "safe_reply_decision_enabled",
    "safe_reply_preview_enabled",
    "admin_approved_line_send_enabled",
  ];

  const LINE_TOGGLE_KEYS = [
    "line_inbox_read_enabled",
    "line_intake_enabled",
    "booking_card_alert_enabled",
  ];

  const LOCKED_POLICY_KEYS = [
    "complaint_admin_only",
    "confirm_queue_locked",
    "price_discount_locked",
    "tax_invoice_admin_only",
  ];

  function $(sel, root){ return (root || document).querySelector(sel); }
  function $all(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }
  function clean(v){ return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); else alert(msg); } catch(_){} }
  function getValue(key, fallback = false){ return Object.prototype.hasOwnProperty.call(STATE.values || {}, key) ? STATE.values[key] : fallback; }
  function getSetting(key){ return (STATE.settings || []).find((item) => item.key === key) || null; }
  function getSettingsByKeys(keys){ return keys.map(getSetting).filter(Boolean); }

  function api(url, options){
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"} }, options || {})).then(async (res)=>{
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
      .ai-control-overlay{position:fixed;inset:0;z-index:190;display:none;background:linear-gradient(180deg,#eaf2ff 0,#f7fbff 100%);color:#07152f;overflow:hidden}
      .ai-control-overlay.open{display:flex;flex-direction:column}
      .ai-control-top{flex:0 0 auto;background:linear-gradient(135deg,#06163d,#0d3d8d 72%,#1769ff);color:#fff;padding:calc(10px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left));box-shadow:0 14px 34px rgba(2,6,23,.28)}
      .ai-control-head{display:flex;align-items:flex-start;gap:10px}
      .ai-control-title{min-width:0;flex:1}
      .ai-control-title b{display:block;font-size:21px;font-weight:1000;line-height:1.08}
      .ai-control-title span{display:block;margin-top:3px;font-size:12px;color:rgba(255,255,255,.78);font-weight:850;line-height:1.4}
      .ai-control-close{border:0;border-radius:16px;background:rgba(255,255,255,.14);color:#fff;width:46px;height:46px;font-size:24px;font-weight:1000;flex:0 0 auto}
      .ai-control-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .ai-head-btn{border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-height:38px;padding:0 12px;font-size:12px;font-weight:1000}
      .ai-head-btn.primary{background:#ffcc00;color:#06163d;border-color:#ffcc00}
      .ai-status-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .ai-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:1000;white-space:nowrap}
      .ai-chip.light{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.15)}
      .ai-chip.safe{background:rgba(34,197,94,.14);color:#d1fae5;border:1px solid rgba(74,222,128,.24)}
      .ai-chip.warn{background:rgba(255,204,0,.16);color:#fff7d1;border:1px solid rgba(255,204,0,.22)}
      .ai-chip.danger{background:rgba(239,68,68,.18);color:#fee2e2;border:1px solid rgba(248,113,113,.25)}
      .ai-control-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));background:#072050;scrollbar-width:none}
      .ai-control-tabs::-webkit-scrollbar{display:none}
      .ai-control-tab{flex:0 0 auto;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.10);color:#fff;min-height:38px;padding:0 12px;font-size:13px;font-weight:1000}
      .ai-control-tab.active{background:#ffcc00;color:#06163d;border-color:#ffcc00}
      .ai-control-body{flex:1 1 auto;overflow:auto;padding:12px max(12px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));display:flex;flex-direction:column;gap:12px}
      .cc-card{border-radius:24px;background:rgba(255,255,255,.98);border:1px solid rgba(15,23,42,.08);box-shadow:0 12px 34px rgba(2,6,23,.08);padding:14px}
      .cc-card h3{margin:0;color:#06163d;font-size:18px;line-height:1.15}
      .cc-card p.sub{margin:5px 0 0;color:#64748b;font-size:12px;font-weight:800;line-height:1.45}
      .cc-stack{display:flex;flex-direction:column;gap:12px}
      .cc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media(max-width:720px){.cc-grid{grid-template-columns:1fr}}
      .cc-metric{border-radius:18px;background:linear-gradient(180deg,#ffffff 0,#f8fbff 100%);border:1px solid rgba(15,23,42,.06);padding:12px}
      .cc-metric span{display:block;color:#64748b;font-size:12px;font-weight:900}
      .cc-metric b{display:block;margin-top:6px;color:#06163d;font-size:22px;font-weight:1000;line-height:1.05}
      .dash-progress{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-top:8px}
      .dash-progress i{display:block;height:100%;background:linear-gradient(90deg,#0d3d8d,#22c55e);border-radius:999px}
      .dash-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid rgba(15,23,42,.08)}
      .dash-row:first-child{border-top:0}
      .dash-row b{color:#06163d;font-size:13px}
      .dash-row span{color:#64748b;font-size:12px;font-weight:900;text-align:right}
      .dash-money{font-variant-numeric:tabular-nums}
      .mode-panel{background:linear-gradient(135deg,#f7fbff 0,#eef4ff 100%);border:1px solid rgba(21,88,214,.10)}
      .mode-current{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px;padding:12px 13px;border-radius:18px;background:#fff;border:1px solid rgba(15,23,42,.08)}
      .mode-current b{display:block;color:#06163d;font-size:16px}
      .mode-current small{display:block;margin-top:3px;color:#64748b;font-size:12px;font-weight:800}
      .mode-badge{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:1000}
      .mode-badge.off{background:#e2e8f0;color:#334155}
      .mode-badge.draft{background:#fef3c7;color:#92400e}
      .mode-badge.approval{background:#dbeafe;color:#1d4ed8}
      .mode-badge.blocked{background:#fee2e2;color:#991b1b}
      .mode-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
      @media(max-width:720px){.mode-options{grid-template-columns:1fr}}
      .mode-option{border:1px solid rgba(21,88,214,.12);border-radius:20px;background:#fff;padding:12px;text-align:left;box-shadow:0 8px 18px rgba(2,6,23,.05)}
      .mode-option.active{border-color:#ffcc00;box-shadow:0 10px 24px rgba(255,204,0,.18);background:linear-gradient(180deg,#fffceb,#fff)}
      .mode-option b{display:block;color:#06163d;font-size:15px}
      .mode-option span{display:block;margin-top:5px;color:#64748b;font-size:12px;font-weight:800;line-height:1.45}
      .mode-option button{margin-top:10px;border:0;border-radius:999px;min-height:40px;padding:0 14px;background:#0d3d8d;color:#fff;font-weight:1000;width:100%}
      .mode-option.active button{background:#ffcc00;color:#06163d}
      .cc-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .cc-list{display:flex;flex-direction:column;gap:10px}
      .cc-item{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid rgba(15,23,42,.08)}
      .cc-item:first-child{border-top:0;padding-top:0}
      .cc-item-main{flex:1;min-width:0}
      .cc-item-main b{display:block;color:#07152f;font-size:15px;line-height:1.2}
      .cc-item-main small{display:block;color:#64748b;font-size:12px;font-weight:800;line-height:1.45;margin-top:4px}
      .cc-lock{display:inline-flex;align-items:center;gap:4px;margin-left:6px;border-radius:999px;background:#e2e8f0;color:#334155;padding:2px 8px;font-size:10px;font-weight:1000}
      .cc-switch{position:relative;width:56px;height:32px;flex:0 0 auto}
      .cc-switch input{position:absolute;opacity:0;inset:0}
      .cc-slider{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}
      .cc-slider:after{content:"";position:absolute;width:26px;height:26px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(2,6,23,.22);transition:.16s}
      .cc-switch input:checked + .cc-slider{background:#22c55e}
      .cc-switch input:checked + .cc-slider:after{transform:translateX(24px)}
      .cc-switch input:disabled + .cc-slider{opacity:.55;background:#94a3b8}
      .cc-actions{display:flex;gap:8px;flex-wrap:wrap}
      .cc-btn{border:1px solid rgba(21,88,214,.12);border-radius:999px;background:#f8fbff;color:#0d3d8d;min-height:40px;padding:0 14px;font-size:13px;font-weight:1000}
      .cc-btn.primary{background:#ffcc00;color:#06163d;border-color:#ffcc00}
      .cc-btn.secondary{background:#0d3d8d;color:#fff;border-color:#0d3d8d}
      .cc-btn.danger{background:#dc2626;color:#fff;border-color:#dc2626}
      .cc-btn.soft-danger{background:#fee2e2;color:#7f1d1d;border-color:#fecaca}
      .cc-btn:disabled{opacity:.45;filter:grayscale(1);cursor:not-allowed}
      .auto-safe-config{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
      .auto-safe-config label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#64748b;font-weight:900}
      .auto-safe-config input{border:1px solid rgba(21,88,214,.16);border-radius:14px;padding:10px;background:#fff;color:#07152f}
      .auto-safe-config .wide{grid-column:1/-1}
      @media(max-width:680px){.auto-safe-config{grid-template-columns:1fr}}
      .policy-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}
      .policy-item{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px;border-radius:18px;background:#f8fbff;border:1px solid rgba(15,23,42,.06)}
      .policy-item b{display:block;color:#06163d;font-size:14px}
      .policy-item small{display:block;color:#64748b;font-size:12px;font-weight:800;line-height:1.45;margin-top:4px}
      .policy-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .policy-badge{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:1000;background:#e2e8f0;color:#334155}
      .line-card,.draft-card,.brain-item{border-radius:20px;border:1px solid rgba(15,23,42,.08);background:#fff;padding:12px;margin-top:10px;box-shadow:0 8px 20px rgba(2,6,23,.05)}
      .line-card h4,.draft-card h4,.brain-item h4{margin:0;color:#06163d;font-size:15px;line-height:1.25}
      .line-sub{margin-top:4px;color:#64748b;font-size:12px;font-weight:800}
      .line-message,.draft-card p,.brain-item p{margin:8px 0 0;color:#334155;font-size:13px;font-weight:750;line-height:1.45;white-space:pre-wrap}
      .copilot-layout{display:grid;grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr);gap:12px;margin-top:12px}
      @media(max-width:860px){.copilot-layout{grid-template-columns:1fr}}
      .conversation-list{display:flex;flex-direction:column;gap:8px;max-height:420px;overflow:auto;padding-right:2px}
      .conversation-card{border:1px solid rgba(15,23,42,.08);border-radius:18px;background:#fff;padding:11px;text-align:left;box-shadow:0 7px 18px rgba(2,6,23,.05)}
      .conversation-card.active{border-color:#ffcc00;background:linear-gradient(180deg,#fffceb,#fff)}
      .conversation-card b{display:block;color:#06163d;font-size:14px}.conversation-card small{display:block;margin-top:4px;color:#64748b;font-size:12px;font-weight:800;line-height:1.35}.conversation-card p{margin:6px 0 0;color:#334155;font-size:12px;font-weight:750;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .thread-box{border:1px solid rgba(15,23,42,.08);border-radius:18px;background:#f8fbff;padding:10px;max-height:340px;overflow:auto;margin-top:10px}
      .thread-msg{max-width:86%;margin:7px 0;padding:9px 10px;border-radius:16px;background:#fff;border:1px solid rgba(15,23,42,.07);font-size:13px;font-weight:750;line-height:1.38;color:#0f172a;white-space:pre-wrap}
      .thread-msg.outbound{margin-left:auto;background:#e0f2fe;border-color:#bae6fd}.thread-msg.inbound{margin-right:auto;background:#fff}
      .thread-msg small{display:block;margin-bottom:3px;color:#64748b;font-size:10px;font-weight:1000}
      .draft-result{border:1px solid rgba(34,197,94,.22);background:#f0fdf4;border-radius:18px;padding:12px;margin-top:10px}.draft-result b{display:block;color:#166534}.draft-result p{margin:8px 0 0;color:#14532d;font-weight:800;line-height:1.45;white-space:pre-wrap}
      .line-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      .status-pill{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:1000}
      .status-pill.ready{background:#dcfce7;color:#166534}
      .status-pill.need{background:#fef3c7;color:#92400e}
      .status-pill.wait{background:#dbeafe;color:#1d4ed8}
      .status-pill.admin{background:#fee2e2;color:#991b1b}
      .status-pill.done{background:#e2e8f0;color:#334155}
      .ai-control-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .ai-control-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#64748b;font-weight:900}
      .ai-control-form input,.ai-control-form select,.ai-control-form textarea{width:100%;border:1px solid rgba(21,88,214,.16);border-radius:14px;padding:10px;color:#07152f;background:#fff}
      .ai-control-form textarea{min-height:92px;resize:vertical}
      .ai-control-form .wide{grid-column:1/-1}
      @media(max-width:680px){.ai-control-form{grid-template-columns:1fr}}
      .ai-empty{border-radius:18px;background:#fff;border:1px dashed rgba(21,88,214,.22);padding:18px;color:#64748b;font-weight:850;text-align:center}
      .ai-error{border-radius:18px;background:#fff7f7;border:1px solid rgba(239,68,68,.28);padding:12px;color:#7f1d1d;font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function ensureDom(){
    injectStyle();
    if (EMBEDDED) {
      var mount = document.getElementById("aiControlMount");
      if (!mount || $("#aiControlOverlay")) return;
      var overlay = document.createElement("section");
      overlay.id = "aiControlOverlay";
      overlay.className = "ai-control-overlay embedded open";
      overlay.innerHTML =
        '<div class="ai-control-top">' +
          '<div class="ai-control-head">' +
            '<div class="ai-control-title">' +
              '<b>AI Reply Control</b>' +
              '<span>ควบคุม AI ตอบลูกค้าจาก LINE OA</span>' +
              '<div class="ai-control-actions">' +
                '<button class="ai-head-btn primary" type="button" data-ai-control-refresh>รีเฟรช</button>' +
                '<button class="ai-head-btn" type="button" data-quick-action="open-inbox">LINE Inbox</button>' +
                '<button class="ai-head-btn" type="button" data-quick-action="open-review">หน้างานจอง</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ai-status-strip" id="aiControlStatusStrip"></div>' +
        '</div>' +
        '<nav class="ai-control-tabs">' + TABS.map(function(t){ return '<button class="ai-control-tab" data-ai-tab="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</nav>' +
        '<main class="ai-control-body" id="aiControlBody"></main>';
      mount.appendChild(overlay);
      overlay.addEventListener("click", handleClick);
      overlay.addEventListener("change", handleChange);
      overlay.addEventListener("submit", handleSubmit);
      return;
    }
    if (!$("#aiControlOpen")) {
      const btn = document.createElement("button");
      btn.id = "aiControlOpen";
      btn.className = "ai-control-open";
      btn.type = "button";
      btn.textContent = "💬 AI ตอบลูกค้า";
      document.body.appendChild(btn);
      btn.addEventListener("click", () => openPanel());
      const topActions = $(".topActions");
      if (topActions && !$("#aiControlTopButton")) {
        const top = document.createElement("button");
        top.id = "aiControlTopButton";
        top.className = "topBtn inbox";
        top.type = "button";
        top.textContent = "AI Reply";
        top.addEventListener("click", () => openPanel());
        topActions.prepend(top);
      }
    }
    if ($("#aiControlOverlay")) return;
    const overlayEl = document.createElement("section");
    overlayEl.id = "aiControlOverlay";
    overlayEl.className = "ai-control-overlay";
    overlayEl.innerHTML = `
      <div class="ai-control-top">
        <div class="ai-control-head">
          <button class="ai-control-close" type="button" data-ai-control-close>‹</button>
          <div class="ai-control-title">
            <b>AI Reply Control</b>
            <span>ควบคุมเฉพาะ AI ตอบลูกค้าจาก LINE OA โดยไม่ปิดส่วนอื่นของ AI Office</span>
            <div class="ai-control-actions">
              <button class="ai-head-btn primary" type="button" data-ai-control-refresh>รีเฟรช</button>
              <button class="ai-head-btn" type="button" data-quick-action="open-inbox">LINE Inbox</button>
              <button class="ai-head-btn" type="button" data-quick-action="open-review">หน้างานจอง</button>
            </div>
          </div>
        </div>
        <div class="ai-status-strip" id="aiControlStatusStrip"></div>
      </div>
      <nav class="ai-control-tabs">${TABS.map(([key,label]) => `<button class="ai-control-tab" data-ai-tab="${key}">${label}</button>`).join("")}</nav>
      <main class="ai-control-body" id="aiControlBody"></main>`;
    document.body.appendChild(overlayEl);
    overlayEl.addEventListener("click", handleClick);
    overlayEl.addEventListener("change", handleChange);
    overlayEl.addEventListener("submit", handleSubmit);
  }

  function openPanel(tab){
    ensureDom();
    STATE.open = true;
    const paramTab = new URLSearchParams(location.search).get("panel");
    if (typeof tab === "string") STATE.activeTab = tab;
    else if (["dashboard","reply","line","approvals","decision","brain"].includes(paramTab)) STATE.activeTab = paramTab;
    else if (paramTab === "switches") STATE.activeTab = "reply";
    var _ov = $("#aiControlOverlay"); if (_ov) _ov.classList.add("open");
    loadAll();
  }
  function closePanel(){ if (EMBEDDED) return; STATE.open = false; $("#aiControlOverlay")?.classList.remove("open"); }

  async function loadSettings(){ const data = await api("/admin/ai-office/control/settings"); STATE.settings = data.settings || []; STATE.values = data.values || {}; }
  async function loadDrafts(){ try { const data = await api("/admin/ai-office/control/pending-drafts"); STATE.drafts = data.drafts || []; } catch(_) { STATE.drafts = []; } }
  async function loadApprovals(){ try { const data = await api("/admin/ai-office/control/approvals?status=open&limit=80"); STATE.approvals = data.approvals || []; } catch(_) { STATE.approvals = []; } }
  async function loadDecisionLogs(){ try { const data = await api("/admin/ai-office/control/reply-decision/logs?limit=40"); STATE.decisions = data.decisions || []; } catch(_) { STATE.decisions = []; } }
  async function loadAutoSafeLogs(){ try { const data = await api("/admin/ai-office/control/auto-safe/logs?limit=30"); STATE.autoSafeLogs = data.logs || []; } catch(_) { STATE.autoSafeLogs = []; } }
  async function loadAutoSafeQuality(){ try { const data = await api("/admin/ai-office/control/auto-safe/quality"); STATE.autoSafeQuality = data.quality || null; } catch(_) { STATE.autoSafeQuality = null; } }
  async function loadAutoSafePlaybooks(){ try { const data = await api("/admin/ai-office/control/auto-safe/playbooks?limit=120"); STATE.autoSafePlaybooks = data.playbooks || []; } catch(_) { STATE.autoSafePlaybooks = []; } }
  async function loadAutoSafeAnalytics(){ try { const data = await api("/admin/ai-office/control/auto-safe/playbook-analytics"); STATE.autoSafeAnalytics = data.analytics || null; } catch(_) { STATE.autoSafeAnalytics = null; } }
  async function loadAutoSafeDashboard(){ try { const data = await api("/admin/ai-office/control/auto-safe/dashboard"); STATE.autoSafeDashboard = data.dashboard || null; } catch(_) { STATE.autoSafeDashboard = null; } }
  async function loadExamples(){ try { const data = await api("/admin/ai-office/reply-examples?limit=100&active_only=false"); STATE.examples = data.examples || []; } catch(_) { STATE.examples = []; } }
  async function loadLineIntakes(){ try { const data = await api("/admin/ai-office/booking-intakes?status=open&limit=30"); STATE.lineIntakes = data.intakes || []; STATE.lineCounts = data.counts || {}; } catch(_) { STATE.lineIntakes = []; STATE.lineCounts = {}; } }
  async function loadHealth(){ try { const data = await api("/admin/ai-office/control/health"); STATE.health = data || null; } catch(_) { STATE.health = null; } }
  async function loadLineConversations(){ try { const data = await api("/admin/ai-office/control/line-conversations?limit=60"); STATE.lineConversations = data.conversations || []; } catch(_) { STATE.lineConversations = []; } }
  async function loadLineThread(conversationId){
    const id = Number(conversationId || 0);
    if (!id) { STATE.selectedConversation = null; STATE.lineThread = []; return; }
    const data = await api(`/admin/ai-office/control/line-conversations/${encodeURIComponent(id)}/thread?limit=50`);
    STATE.selectedConversation = data.conversation || null;
    STATE.lineThread = data.messages || [];
  }

  async function loadAll(){
    renderLoading();
    try {
      await loadSettings();
      if (["overview","reply"].includes(STATE.activeTab)) await Promise.all([loadHealth(), loadDrafts(), loadApprovals(), loadLineIntakes(), loadLineConversations(), loadDecisionLogs(), loadAutoSafeLogs(), loadAutoSafeQuality(), loadAutoSafePlaybooks(), loadAutoSafeDashboard()]);
      else if (STATE.activeTab === "dashboard") await Promise.all([loadHealth(), loadAutoSafeLogs(), loadAutoSafeQuality(), loadAutoSafePlaybooks(), loadAutoSafeAnalytics(), loadAutoSafeDashboard()]);
      else if (STATE.activeTab === "line") await Promise.all([loadLineIntakes(), loadLineConversations()]);
      else if (STATE.activeTab === "approvals") await loadApprovals();
      else if (STATE.activeTab === "decision") await loadDecisionLogs();
      else if (STATE.activeTab === "brain") await loadExamples();
      render();
    } catch (err) {
      renderError(err.message || "โหลดแผงควบคุมไม่ได้");
    }
  }

  function deriveReplyMode(){
    if (getValue("kill_switch", false)) return { key:"blocked", label:"หยุดตอบทันที", note:"Kill switch เปิดอยู่" };
    if (getValue("draft_reply_enabled", true) !== true) return { key:"off", label:"ปิดการตอบ", note:"AI ไม่ร่างตอบลูกค้า" };
    if (getValue("approval_queue_enabled", true) === true || getValue("approval_required_enabled", true) === true) return { key:"approval", label:"รออนุมัติ", note:"AI ร่างแล้วส่งเข้าคิวอนุมัติ" };
    return { key:"draft", label:"ร่างอย่างเดียว", note:"AI ร่างให้แอดมินใช้เอง" };
  }

  function renderStatusStrip(){
    const holder = $("#aiControlStatusStrip");
    if (!holder) return;
    const mode = deriveReplyMode();
    const chips = [
      `<span class="ai-chip light">โหมด: ${esc(mode.label)}</span>`,
      `<span class="ai-chip ${getValue("kill_switch", false) ? "danger" : "safe"}">${getValue("kill_switch", false) ? "Kill Switch ทำงาน" : "พร้อมใช้งาน"}</span>`,
      `<span class="ai-chip ${getValue("auto_safe_reply_send_enabled", false) ? "safe" : "warn"}">Auto Safe ${getValue("auto_safe_reply_send_enabled", false) ? "เปิด" : "ปิด"}</span>`,
      `<span class="ai-chip ${getValue("auto_safe_playbook_enabled", true) ? "safe" : "warn"}">Playbook ${getValue("auto_safe_playbook_enabled", true) ? "เปิด" : "ปิด"}</span>`,
      `<span class="ai-chip warn">Auto All ล็อกปิด</span>`,
      `<span class="ai-chip light">คิวอนุมัติ ${STATE.approvals.length}</span>`
    ];
    holder.innerHTML = chips.join("");
  }

  function renderLoading(){ const body = $("#aiControlBody"); if (body) body.innerHTML = `<div class="ai-empty">กำลังโหลด AI Reply Control...</div>`; }
  function renderError(msg){ const body = $("#aiControlBody"); if (body) body.innerHTML = `<div class="ai-error">${esc(msg)}</div>`; updateTabs(); renderStatusStrip(); }
  function updateTabs(){ $all(".ai-control-tab").forEach((b) => b.classList.toggle("active", b.dataset.aiTab === STATE.activeTab)); }

  function render(){
    updateTabs();
    renderStatusStrip();
    const body = $("#aiControlBody");
    if (!body) return;
    if (STATE.activeTab === "dashboard") body.innerHTML = renderAutoSafeDashboard();
    else if (STATE.activeTab === "reply") body.innerHTML = renderReplyControl();
    else if (STATE.activeTab === "line") body.innerHTML = renderLineWork();
    else if (STATE.activeTab === "approvals") body.innerHTML = renderApprovals();
    else if (STATE.activeTab === "decision") body.innerHTML = renderDecisionLab();
    else if (STATE.activeTab === "brain") body.innerHTML = renderBrain();
    else body.innerHTML = renderOverview();
  }

  function renderOverview(){
    const mode = deriveReplyMode();
    return `
      <section class="cc-card mode-panel">
        <h3>ภาพรวมการตอบลูกค้า</h3>
        <p class="sub">แผงนี้คุมเฉพาะการร่างและจัดการคำตอบลูกค้า ไม่ได้ใช้ปิดทั้ง AI Office</p>
        <div class="cc-grid" style="margin-top:12px">
          <div class="cc-metric"><span>โหมดตอนนี้</span><b>${esc(mode.label)}</b></div>
          <div class="cc-metric"><span>คิวอนุมัติ</span><b>${STATE.approvals.length}</b></div>
          <div class="cc-metric"><span>ร่างตอบรอแอดมิน</span><b>${STATE.drafts.length}</b></div>
          <div class="cc-metric"><span>งาน LINE เปิดอยู่</span><b>${STATE.lineIntakes.length}</b></div>
          <div class="cc-metric"><span>AI ตอบเองแบบปลอดภัย</span><b>${getValue("auto_safe_reply_send_enabled", false) ? 'เปิด' : 'ปิด'}</b></div>
          <div class="cc-metric"><span>OpenAI</span><b>${STATE.health?.openai?.configured ? 'พร้อม' : 'ยังไม่ตั้งค่า'}</b></div>
          <div class="cc-metric"><span>Playbook ใช้งานอยู่</span><b>${STATE.autoSafePlaybooks.filter(x=>x.is_active).length}</b></div>
          <div class="cc-metric"><span>ประหยัดเวลาประมาณ</span><b>${esc(STATE.autoSafeDashboard?.estimated?.minutes_saved_30d || 0)} นาที</b></div>
          <div class="cc-metric"><span>LINE ล่าสุด</span><b>${STATE.health?.line?.latest_message_at ? 'มีข้อความ' : 'ยังไม่พบ'}</b></div>
        </div>
        <div class="cc-actions" style="margin-top:12px">
          <button class="cc-btn primary" type="button" data-ai-tab-go="reply">เปิดหน้าควบคุม</button>
          <button class="cc-btn" type="button" data-ai-tab-go="dashboard">แดชบอร์ดผลลัพธ์</button>
          <button class="cc-btn" type="button" data-ai-tab-go="approvals">คิวอนุมัติ</button>
          <button class="cc-btn" type="button" data-ai-tab-go="line">งาน LINE</button>
          <button class="cc-btn" type="button" data-ai-tab-go="brain">แก้คลังสมอง</button>
          <button class="cc-btn" type="button" data-ai-tab-go="decision">ตรวจคำตอบ</button>
        </div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>งาน LINE ที่ต้องเห็นตอนนี้</h3><button class="cc-btn" type="button" data-ai-tab-go="line">ดูทั้งหมด</button></div>
        <p class="sub">เห็นเฉพาะการ์ดลูกค้าที่เกี่ยวกับงาน/การตอบ ไม่เอาแผงตั้งค่ามายัดในหน้างานจอง</p>
        ${STATE.lineIntakes.length ? STATE.lineIntakes.slice(0, 3).map(renderLineCard).join("") : '<div class="ai-empty">ยังไม่มีการ์ดลูกค้า LINE ที่เปิดอยู่</div>'}
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>คำสั่งด่วน</h3></div>
        <div class="cc-actions">
          <button class="cc-btn secondary" type="button" data-quick-action="open-inbox">เปิด LINE Inbox</button>
          <button class="cc-btn" type="button" data-quick-action="open-review">เปิดหน้างานจอง</button>
          <button class="cc-btn" type="button" data-quick-action="mode-draft">ตั้งเป็นร่างอย่างเดียว</button>
          <button class="cc-btn" type="button" data-quick-action="mode-approval">ตั้งเป็นรออนุมัติ</button>
          <button class="cc-btn danger" type="button" data-quick-action="kill-toggle">${getValue("kill_switch", false) ? 'เปิด AI ตอบกลับ' : 'หยุด AI ตอบทันที'}</button>
        </div>
      </section>`;
  }


  function pct(value){
    const n = Number(value || 0);
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  function money(v){
    const n = Number(v || 0);
    return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
  }
  function renderAutoSafeDashboard(){
    const d = STATE.autoSafeDashboard || {};
    const w = d.window || {};
    const e = d.estimated || {};
    const p = d.performance || {};
    const reasons = Array.isArray(d.skipped_reasons) ? d.skipped_reasons : [];
    const intents = Array.isArray(d.sent_by_intent) ? d.sent_by_intent : [];
    const playbooks = Array.isArray(d.playbook_usage) ? d.playbook_usage : [];
    const quality = d.quality || {};
    const safety = d.safety || {};
    const coverage = pct(p.playbook_coverage_percent || 0);
    const autoRate = pct(p.auto_reply_rate_percent || 0);
    return `
      <section class="cc-card mode-panel">
        <div class="cc-section-title"><div><h3>Auto Safe Dashboard V19</h3><p class="sub">ดูว่า AI ลดงานแอดมินได้จริงกี่ข้อความ ประหยัดเวลาเท่าไหร่ และกันเคสเสี่ยงไว้กี่ครั้ง</p></div><button class="cc-btn" type="button" data-ai-control-refresh>รีเฟรช</button></div>
        <div class="cc-grid" style="margin-top:12px">
          <div class="cc-metric"><span>AI ตอบเอง 24 ชม.</span><b>${esc(d.sent_24h || 0)}</b></div>
          <div class="cc-metric"><span>AI ตอบเอง 7 วัน</span><b>${esc(d.sent_7d || 0)}</b></div>
          <div class="cc-metric"><span>AI ตอบเอง ${esc(w.days || 30)} วัน</span><b>${esc(d.sent_window || 0)}</b></div>
          <div class="cc-metric"><span>กันไว้ให้แอดมิน ${esc(w.days || 30)} วัน</span><b>${esc(d.skipped_window || 0)}</b></div>
          <div class="cc-metric"><span>เวลาที่ประหยัด</span><b>${esc(e.minutes_saved_30d || 0)} นาที</b></div>
          <div class="cc-metric"><span>มูลค่าเวลาที่ประหยัด</span><b class="dash-money">${money(e.thb_saved_30d)} บาท</b></div>
          <div class="cc-metric"><span>เคสเสี่ยงที่กันไว้</span><b>${esc(safety.risk_blocked_window || 0)}</b></div>
          <div class="cc-metric"><span>คำถามที่ควรทำ Playbook เพิ่ม</span><b>${esc(d.pending_suggestions || 0)}</b></div>
        </div>
      </section>
      <section class="cc-card">
        <h3>ประสิทธิภาพการตอบเอง</h3>
        <p class="sub">ตัวเลขนี้ใช้วัดว่า Auto Safe ช่วยงานแอดมินได้มากแค่ไหน โดยยังกันเคสเสี่ยงออก</p>
        <div class="dash-row"><b>อัตราตอบเองจากข้อความที่เข้า Auto Safe</b><span>${autoRate}%</span></div>
        <div class="dash-progress"><i style="width:${autoRate}%"></i></div>
        <div class="dash-row"><b>สัดส่วนคำตอบที่มาจาก Playbook</b><span>${coverage}%</span></div>
        <div class="dash-progress"><i style="width:${coverage}%"></i></div>
        <div class="cc-actions" style="margin-top:12px"><button class="cc-btn" type="button" data-ai-tab-go="reply">ตั้งค่า Auto Safe</button><button class="cc-btn" type="button" data-generate-playbook-suggestions>วิเคราะห์ Playbook เพิ่ม</button></div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>เหตุผลที่ AI ไม่ส่งเองบ่อยสุด</h3></div>
        ${reasons.length ? reasons.slice(0,8).map(r=>`<div class="dash-row"><b>${esc(r.reason || '-')}</b><span>${esc(r.count || 0)} ครั้ง</span></div>`).join('') : '<div class="ai-empty">ยังไม่มีรายการถูกกันไว้</div>'}
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>Intent / Playbook ที่ช่วยลดงาน</h3></div>
        ${intents.length ? intents.slice(0,6).map(r=>`<div class="dash-row"><b>${esc(r.intent || '-')}</b><span>${esc(r.count || 0)} ข้อความ</span></div>`).join('') : '<div class="ai-empty">ยังไม่มีข้อมูล intent ที่ตอบเอง</div>'}
        ${playbooks.length ? `<div style="margin-top:12px"><b style="color:#06163d">Playbook ที่ใช้บ่อย</b>${playbooks.slice(0,6).map(r=>`<div class="dash-row"><b>${esc(r.playbook_title || 'ไม่ระบุ')}</b><span>${esc(r.sent_count || 0)} ครั้ง</span></div>`).join('')}</div>` : ''}
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>Quality & Safety</h3></div>
        <div class="cc-grid">
          <div class="cc-metric"><span>Feedback ดี</span><b>${esc(quality.good || 0)}</b></div>
          <div class="cc-metric"><span>Feedback ลบ</span><b>${esc(quality.bad || 0)}</b></div>
          <div class="cc-metric"><span>ราคาผิด</span><b>${esc(quality.wrong_price || 0)}</b></div>
          <div class="cc-metric"><span>กฎเรียนรู้ที่เปิด</span><b>${esc(quality.active_rules || 0)}</b></div>
        </div>
        <p class="sub">ถ้า feedback ลบหรือราคาผิดเริ่มเยอะ ให้ปิด Auto Safe ชั่วคราว หรือเพิ่ม/แก้ Playbook ก่อนเปิดต่อ</p>
      </section>`;
  }

  function renderReplyControl(){
    const mode = deriveReplyMode();
    return `
      <section class="cc-card mode-panel">
        <h3>โหมดการตอบลูกค้า</h3>
        <p class="sub">เลือกโหมดที่เหมาะกับการใช้งานจริงของแอดมิน โดยไม่กระทบส่วนอื่นของ AI Office</p>
        <div class="mode-current">
          <div><b>${esc(mode.label)}</b><small>${esc(mode.note)}</small></div>
          <span class="mode-badge ${esc(mode.key)}">${esc(mode.label)}</span>
        </div>
        <div class="mode-options">
          ${renderModeOption("off", "ปิดการตอบ", "หยุดให้ AI ร่าง/ช่วยตอบลูกค้า แต่ยังใช้ AI Office ส่วนอื่นได้")}
          ${renderModeOption("draft", "ร่างอย่างเดียว", "ให้ AI ร่างคำตอบเพื่อให้แอดมินคัดลอกหรือแก้เอง")}
          ${renderModeOption("approval", "รออนุมัติ", "ให้ AI ร่างและส่งเข้าคิวอนุมัติก่อนใช้กับลูกค้า")}
        </div>
      </section>
      ${renderAutoSafeControl()}
      <section class="cc-card">
        <div class="cc-section-title"><h3>คำสั่งฉุกเฉิน</h3></div>
        <p class="sub">ปุ่มนี้ใช้หยุดงานตอบลูกค้าทันที ไม่ใช่แค่สวิตช์ทั่วไป</p>
        <div class="cc-actions" style="margin-top:12px">
          <button class="cc-btn danger" type="button" data-quick-action="kill-toggle">${getValue("kill_switch", false) ? 'เปิด AI ตอบกลับอีกครั้ง' : 'หยุด AI ตอบลูกค้าทันที'}</button>
          <button class="cc-btn" type="button" data-quick-action="mode-approval">กลับสู่โหมดรออนุมัติ</button>
        </div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>ความสามารถที่เปิดใช้</h3></div>
        <p class="sub">ใช้สวิตช์เฉพาะสิ่งที่เป็นความสามารถเปิด/ปิดได้จริง</p>
        <div class="cc-list">${getSettingsByKeys(REPLY_TOGGLE_KEYS).map(renderSwitchRow).join("")}</div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>คำสั่งด่วน</h3></div>
        <div class="cc-actions">
          <button class="cc-btn" type="button" data-ai-tab-go="dashboard">ดูผลลัพธ์ Auto Safe</button>
          <button class="cc-btn" type="button" data-ai-tab-go="approvals">เปิดคิวอนุมัติ</button>
          <button class="cc-btn" type="button" data-ai-tab-go="line">เปิดงาน LINE</button>
          <button class="cc-btn" type="button" data-ai-tab-go="decision">ทดสอบคำตอบก่อนใช้</button>
          <button class="cc-btn" type="button" data-ai-tab-go="brain">เปิดคลังสมอง</button>
          <button class="cc-btn secondary" type="button" data-quick-action="open-inbox">LINE Inbox</button>
        </div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>นโยบายความปลอดภัยที่บังคับใช้</h3></div>
        <p class="sub">รายการด้านล่างเป็นกติกาถาวร ไม่ได้ออกแบบมาให้เปิด/ปิดด้วยสวิตช์</p>
        <div class="policy-list">${getSettingsByKeys(LOCKED_POLICY_KEYS).map(renderPolicyItem).join("")}</div>
      </section>`;
  }

  function renderAutoSafeControl(){
    const setting = getSetting("auto_safe_reply_send_enabled");
    const enabled = getValue("auto_safe_reply_send_enabled", false) === true;
    const cooldown = getValue("auto_safe_reply_cooldown_minutes", 15);
    const dailyLimit = getValue("auto_safe_reply_daily_limit", 5);
    const threshold = getValue("auto_safe_reply_confidence_threshold", 85);
    const takeover = getValue("auto_safe_human_takeover_minutes", 60);
    const quietEnabled = getValue("auto_safe_reply_quiet_hours_enabled", false);
    const quietStart = getValue("auto_safe_reply_quiet_start", "22:00");
    const quietEnd = getValue("auto_safe_reply_quiet_end", "08:00");
    const sent = STATE.autoSafeLogs.filter(x => x.status === "sent").length;
    const skipped = STATE.autoSafeLogs.filter(x => x.status === "skipped").length;
    return `<section class="cc-card" style="border-color:${enabled ? 'rgba(34,197,94,.35)' : 'rgba(255,204,0,.35)'}">
      <div class="cc-section-title"><h3>AI ส่ง LINE เองเฉพาะคำถามปลอดภัย</h3><span class="mode-badge ${enabled ? 'draft' : 'off'}">${enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span></div>
      <p class="sub">ลดงานแอดมินโดยให้ AI ตอบเองเฉพาะคำถามเสี่ยงต่ำ เช่น ราคา พื้นที่บริการ อธิบายประเภทล้าง และทักทายทั่วไป ส่วนจองคิว ซ่อม ต่อราคา ร้องเรียน ใบกำกับภาษี จะไม่ส่งเอง</p>
      ${setting ? renderSwitchRow(setting) : ''}
      <div class="cc-grid" style="margin-top:10px">
        <div class="cc-metric"><span>ส่งเองล่าสุด</span><b>${sent}</b></div>
        <div class="cc-metric"><span>ถูกกันไว้</span><b>${skipped}</b></div>
        <div class="cc-metric"><span>คะแนนมั่นใจขั้นต่ำ</span><b>${esc(threshold)}%</b></div>
        <div class="cc-metric"><span>แอดมินตอบเองแล้วพัก</span><b>${esc(takeover)} นาที</b></div>
      </div>
      <form class="auto-safe-config" data-auto-safe-config-form>
        <label>คะแนนมั่นใจขั้นต่ำ<input name="auto_safe_reply_confidence_threshold" type="number" min="50" max="99" value="${esc(threshold)}"></label>
        <label>พักก่อนตอบซ้ำ / นาที<input name="auto_safe_reply_cooldown_minutes" type="number" min="1" max="1440" value="${esc(cooldown)}"></label>
        <label>สูงสุดต่อแชทต่อวัน<input name="auto_safe_reply_daily_limit" type="number" min="1" max="50" value="${esc(dailyLimit)}"></label>
        <label>พักหลังแอดมินตอบเอง / นาที<input name="auto_safe_human_takeover_minutes" type="number" min="0" max="1440" value="${esc(takeover)}"></label>
        <label>เริ่มงดตอบเอง<input name="auto_safe_reply_quiet_start" type="time" value="${esc(quietStart)}"></label>
        <label>สิ้นสุดงดตอบเอง<input name="auto_safe_reply_quiet_end" type="time" value="${esc(quietEnd)}"></label>
        <label class="wide"><span><input name="auto_safe_reply_quiet_hours_enabled" type="checkbox" ${quietEnabled ? 'checked' : ''}> งด AI ส่งเองช่วงเวลาที่กำหนด</span></label>
        <label>Feedback ลบก่อนบล็อก<input name="auto_safe_negative_feedback_threshold" type="number" min="1" max="20" value="${esc(getValue('auto_safe_negative_feedback_threshold', 2))}"></label>
        <label>ดู feedback ย้อนหลัง / วัน<input name="auto_safe_negative_feedback_window_days" type="number" min="1" max="180" value="${esc(getValue('auto_safe_negative_feedback_window_days', 14))}"></label>
        <label>พักหลัง feedback ลบ / นาที<input name="auto_safe_auto_pause_minutes" type="number" min="5" max="43200" value="${esc(getValue('auto_safe_auto_pause_minutes', 1440))}"></label>
        <label class="wide"><span><input name="auto_safe_quality_guard_enabled" type="checkbox" ${getValue('auto_safe_quality_guard_enabled', true) ? 'checked' : ''}> ใช้ feedback กันไม่ให้ AI ส่งเองซ้ำแบบเดิม</span></label>
        <label class="wide"><span><input name="auto_safe_auto_pause_on_bad_feedback" type="checkbox" ${getValue('auto_safe_auto_pause_on_bad_feedback', true) ? 'checked' : ''}> พักแชทอัตโนมัติเมื่อแอดมินให้ feedback ลบ</span></label>
        <label class="wide"><span><input name="auto_safe_playbook_enabled" type="checkbox" ${getValue('auto_safe_playbook_enabled', true) ? 'checked' : ''}> ใช้ Playbook ที่อนุมัติแล้วก่อนส่งเอง</span></label>
        <label class="wide"><span><input name="auto_safe_playbook_required" type="checkbox" ${getValue('auto_safe_playbook_required', true) ? 'checked' : ''}> ส่งเองเฉพาะเมื่อมี Playbook ตรงเคส</span></label>
        <label class="wide"><span><input name="auto_safe_playbook_seed_enabled" type="checkbox" ${getValue('auto_safe_playbook_seed_enabled', true) ? 'checked' : ''}> เปิดชุด Playbook หลักของ CWF</span></label>
        <label class="wide"><span><input name="auto_safe_playbook_suggestions_enabled" type="checkbox" ${getValue('auto_safe_playbook_suggestions_enabled', true) ? 'checked' : ''}> แนะนำ Playbook จากคำถามที่พบบ่อย</span></label>
        <label>จำนวนคำถามซ้ำก่อนเสนอ<input name="auto_safe_playbook_suggestion_min_count" type="number" min="1" max="50" value="${esc(getValue('auto_safe_playbook_suggestion_min_count', 2))}"></label>
        <label>ดูคำถามย้อนหลัง / วัน<input name="auto_safe_playbook_suggestion_window_days" type="number" min="1" max="180" value="${esc(getValue('auto_safe_playbook_suggestion_window_days', 14))}"></label>
        <label class="wide"><span><input name="auto_safe_dashboard_enabled" type="checkbox" ${getValue('auto_safe_dashboard_enabled', true) ? 'checked' : ''}> เปิดแดชบอร์ดผลลัพธ์ Auto Safe</span></label>
        <label>คำนวณผลย้อนหลัง / วัน<input name="auto_safe_dashboard_window_days" type="number" min="1" max="180" value="${esc(getValue('auto_safe_dashboard_window_days', 30))}"></label>
        <label>แอดมินใช้เวลาตอบ / วินาที<input name="auto_safe_estimated_admin_seconds_per_reply" type="number" min="5" max="600" value="${esc(getValue('auto_safe_estimated_admin_seconds_per_reply', 45))}"></label>
        <label>ต้นทุนแอดมิน / ชั่วโมง<input name="auto_safe_admin_hourly_cost_thb" type="number" min="0" max="5000" value="${esc(getValue('auto_safe_admin_hourly_cost_thb', 120))}"></label>
        <div class="wide cc-actions"><button class="cc-btn primary" type="submit">บันทึกกติกา Auto Safe</button><button class="cc-btn" type="button" data-ai-tab-go="dashboard">ดูแดชบอร์ดผลลัพธ์</button><button class="cc-btn" type="button" data-ai-tab-go="decision">ทดสอบคำตอบก่อนเปิดจริง</button></div>
      </form>
      <div class="policy-list">
        <div class="policy-item"><div><b>ตอบเองได้</b><small>ถามราคา / ถามพื้นที่ / ถามความต่างบริการ / ทักทายทั่วไป</small></div><div class="policy-badges"><span class="policy-badge">LOW RISK</span></div></div>
        <div class="policy-item"><div><b>ไม่ส่งเอง</b><small>จองคิว ซ่อมแอร์ ต่อราคา ร้องเรียน ใบกำกับภาษี ลดราคา ยืนยันช่างว่าง หรือแอดมินเพิ่งตอบในแชทนั้น</small></div><div class="policy-badges"><span class="policy-badge">แอดมินตรวจ</span></div></div>
      </div>
      ${renderAutoSafePlaybookSummary()}
      ${renderAutoSafePlaybookAnalytics()}
      ${renderAutoSafeQualitySummary()}
      ${STATE.autoSafeLogs.length ? `<div style="margin-top:12px"><b style="color:#06163d">ประวัติล่าสุด</b>${STATE.autoSafeLogs.slice(0,8).map(renderAutoSafeLog).join('')}</div>` : ''}
    </section>`;
  }

  function renderAutoSafePlaybookSummary(){
    const active = STATE.autoSafePlaybooks.filter(x => x.is_active);
    const inactive = STATE.autoSafePlaybooks.filter(x => !x.is_active);
    const byIntent = active.reduce((acc,x)=>{ acc[x.intent] = (acc[x.intent] || 0) + 1; return acc; }, {});
    return `<div style="margin-top:12px" class="quality-box"><b style="color:#06163d">Safe Reply Playbook V16</b><p class="sub">ให้ Auto Safe ส่ง LINE จากคำตอบที่ผ่านการอนุมัติแล้วก่อน ไม่แต่งคำตอบเองถ้าไม่มี Playbook ตรงเคส</p><div class="cc-grid" style="margin-top:10px"><div class="cc-metric"><span>Playbook เปิดใช้งาน</span><b>${esc(active.length)}</b></div><div class="cc-metric"><span>ปิดใช้งาน</span><b>${esc(inactive.length)}</b></div></div>${Object.keys(byIntent).length ? `<div class="line-meta">${Object.keys(byIntent).map(k=>`<span class="status-pill done">${esc(k)}: ${esc(byIntent[k])}</span>`).join('')}</div>` : ''}<form class="ai-control-form" data-playbook-form style="margin-top:12px"><label>ชื่อ Playbook<input name="title" placeholder="เช่น ตอบราคาล้างแอร์ผนัง"></label><label>Intent<select name="intent"><option value="price_question">ถามราคา</option><option value="area_question">ถามพื้นที่บริการ</option><option value="service_explain">อธิบายบริการ</option><option value="general_greeting">ทักทายทั่วไป</option></select></label><label class="wide">คำ trigger คั่นด้วย comma<input name="trigger_phrases" placeholder="ราคา, กี่บาท, โปร"></label><label class="wide">ข้อความตอบที่อนุมัติแล้ว<textarea name="response_text" required placeholder="ข้อความที่อนุญาตให้ AI ส่งเอง"></textarea></label><label>Priority<input name="priority" type="number" min="1" max="999" value="100"></label><div class="wide cc-actions"><button class="cc-btn primary" type="submit">เพิ่ม Playbook</button></div></form>${active.length ? `<div style="margin-top:10px">${active.slice(0,6).map(renderPlaybookItem).join('')}</div>` : ''}</div>`;
  }

  function renderPlaybookItem(p){
    return `<article class="draft-card"><h4>${esc(p.title || '')} · ${esc(p.intent || '')}</h4><p><strong>Trigger:</strong> ${esc(Array.isArray(p.trigger_phrases) ? p.trigger_phrases.join(', ') : '')}</p><p><strong>ตอบ:</strong> ${esc(p.response_text || '')}</p><div class="cc-actions"><button class="cc-btn soft-danger" type="button" data-disable-playbook="${esc(p.id || '')}">ปิด Playbook</button></div></article>`;
  }

  function renderAutoSafePlaybookAnalytics(){
    const a = STATE.autoSafeAnalytics || {};
    const suggestions = Array.isArray(a.suggestions) ? a.suggestions : [];
    const coverage = Array.isArray(a.intent_coverage) ? a.intent_coverage : [];
    const skipped = Array.isArray(a.skipped_reasons) ? a.skipped_reasons : [];
    const usage = Array.isArray(a.playbook_usage) ? a.playbook_usage : [];
    const missing = coverage.reduce((sum,x)=>sum+Number(x.missing_playbook||0),0);
    const sent = coverage.reduce((sum,x)=>sum+Number(x.sent||0),0);
    const total = coverage.reduce((sum,x)=>sum+Number(x.total||0),0);
    return `<div style="margin-top:12px" class="quality-box"><div class="cc-section-title"><div><b style="color:#06163d">Playbook Review Center V18</b><p class="sub">ตรวจ แก้ และอนุมัติ Playbook ที่ระบบเสนอ ก่อนให้ Auto Safe ใช้ตอบลูกค้าเอง</p></div><button class="cc-btn" type="button" data-generate-playbook-suggestions>วิเคราะห์ใหม่</button></div><div class="cc-grid" style="margin-top:10px"><div class="cc-metric"><span>ข้อความ Auto Safe ทั้งหมด</span><b>${esc(total)}</b></div><div class="cc-metric"><span>ส่งเองจาก Playbook</span><b>${esc(sent)}</b></div><div class="cc-metric"><span>ขาด Playbook</span><b>${esc(missing)}</b></div><div class="cc-metric"><span>รอรีวิว Playbook</span><b>${esc(suggestions.length)}</b></div></div>${coverage.length ? `<div class="line-meta">${coverage.slice(0,8).map(x=>`<span class="status-pill done">${esc(x.intent)}: ${esc(x.sent||0)}/${esc(x.total||0)} ส่งเอง</span>`).join('')}</div>` : ''}${skipped.length ? `<div class="line-meta">${skipped.slice(0,5).map(x=>`<span class="status-pill need">${esc(x.reason)}: ${esc(x.count)}</span>`).join('')}</div>` : ''}${usage.length ? `<div class="line-meta">${usage.slice(0,5).map(x=>`<span class="status-pill ready">${esc(x.playbook_title)}: ${esc(x.sent_count)}</span>`).join('')}</div>` : ''}${suggestions.length ? `<div style="margin-top:10px"><b style="color:#06163d">รายการที่ต้องรีวิวก่อนสร้าง Playbook</b>${suggestions.slice(0,8).map(renderPlaybookSuggestion).join('')}</div>` : '<div class="ai-empty" style="margin-top:10px">ยังไม่มีคำถามซ้ำที่ควรสร้าง Playbook เพิ่ม</div>'}</div>`;
  }

  function renderPlaybookSuggestion(s){
    const samples = Array.isArray(s.sample_customer_messages) ? s.sample_customer_messages : [];
    const baseTriggers = Array.isArray(s.final_trigger_phrases) && s.final_trigger_phrases.length ? s.final_trigger_phrases : (Array.isArray(s.trigger_phrases) ? s.trigger_phrases : []);
    const title = s.final_title || s.reviewed_title || s.suggested_title || '';
    const intent = s.final_intent || s.reviewed_intent || s.intent || 'general_greeting';
    const reply = s.final_response_text || s.reviewed_response_text || s.suggested_response_text || '';
    const priority = s.final_priority || s.reviewed_priority || 90;
    return `<article class="draft-card" data-playbook-suggestion-card="${esc(s.id || '')}"><h4>${esc(title)} · ${esc(intent)} · เจอ ${esc(s.occurrences || 0)} ครั้ง${s.reviewed_at ? ' · ตรวจแล้ว' : ''}</h4>${samples.length ? `<p><strong>ตัวอย่างคำถาม:</strong> ${esc(samples.slice(0,3).join(' / '))}</p>` : ''}<form class="ai-control-form" data-playbook-suggestion-form="${esc(s.id || '')}"><label>ชื่อ Playbook<input name="title" value="${esc(title)}"></label><label>Intent<select name="intent"><option value="price_question" ${intent==='price_question'?'selected':''}>ถามราคา</option><option value="area_question" ${intent==='area_question'?'selected':''}>ถามพื้นที่บริการ</option><option value="service_explain" ${intent==='service_explain'?'selected':''}>อธิบายบริการ</option><option value="general_greeting" ${intent==='general_greeting'?'selected':''}>ทักทายทั่วไป</option></select></label><label class="wide">Trigger คั่นด้วย comma<input name="trigger_phrases" value="${esc(baseTriggers.join(', '))}"></label><label class="wide">ข้อความตอบที่จะอนุมัติ<textarea name="response_text" required>${esc(reply)}</textarea></label><label>Priority<input name="priority" type="number" min="1" max="999" value="${esc(priority)}"></label><label>หมายเหตุรีวิว<input name="review_note" value="${esc(s.review_note || '')}" placeholder="เช่น ปรับคำให้เป็นธรรมชาติแล้ว"></label><div class="wide cc-actions"><button class="cc-btn" type="button" data-save-playbook-suggestion="${esc(s.id || '')}">บันทึกฉบับแก้</button><button class="cc-btn primary" type="button" data-approve-playbook-suggestion="${esc(s.id || '')}">อนุมัติและสร้าง Playbook</button><button class="cc-btn soft-danger" type="button" data-dismiss-playbook-suggestion="${esc(s.id || '')}">ไม่ใช้รายการนี้</button></div></form></article>`;
  }

  function renderAutoSafeQualitySummary(){
    const q = STATE.autoSafeQuality || {};
    const counts = Array.isArray(q.feedback_counts) ? q.feedback_counts : [];
    const latest = Array.isArray(q.latest_feedback) ? q.latest_feedback : [];
    return `<div style="margin-top:12px" class="quality-box"><b style="color:#06163d">Quality Loop V15</b><p class="sub">แอดมินกดว่าคำตอบดี/ไม่ดีได้ ระบบจะใช้ feedback เพื่อกันไม่ให้ AI ส่งเองซ้ำในแนวที่เคยผิด</p><div class="cc-grid" style="margin-top:10px"><div class="cc-metric"><span>กฎเรียนรู้ที่เปิดอยู่</span><b>${esc(q.active_rules || 0)}</b></div><div class="cc-metric"><span>feedback 30 วัน</span><b>${esc(counts.reduce((sum,x)=>sum+Number(x.count||0),0))}</b></div></div>${counts.length ? `<div class="line-meta">${counts.map(x=>`<span class="status-pill done">${esc(x.feedback_type)}: ${esc(x.count)}</span>`).join('')}</div>` : ''}${latest.length ? `<div style="margin-top:10px">${latest.slice(0,3).map(x=>`<article class="draft-card"><h4>Feedback · ${esc(x.feedback_type || '')}</h4><p>${esc(x.reason || x.admin_note || '')}</p><p><strong>ลูกค้า:</strong> ${esc(x.customer_message || '')}</p></article>`).join('')}</div>` : ''}</div>`;
  }

  function renderAutoSafeLog(log){
    const ok = log.status === "sent";
    const cid = log.conversation_id || "";
    return `<article class="draft-card"><h4>${ok ? 'ส่งเองแล้ว' : 'กันไว้'} · ${esc(log.intent || '')} · ${esc(log.skipped_reason || log.decision || '')}${log.quality_status ? ' · ' + esc(log.quality_status) : ''}${log.playbook_title ? ' · Playbook: ' + esc(log.playbook_title) : ''}</h4><p><strong>ลูกค้า:</strong> ${esc(log.customer_message || '')}</p>${ok ? `<p><strong>ตอบ:</strong> ${esc(log.reply_text || '')}</p>` : ''}<div class="cc-actions">${ok ? `<button class="cc-btn" type="button" data-autosafe-feedback="good" data-autosafe-log="${esc(log.id || '')}">ตอบดี</button><button class="cc-btn soft-danger" type="button" data-autosafe-feedback="bad" data-autosafe-log="${esc(log.id || '')}">ตอบไม่ดี</button><button class="cc-btn soft-danger" type="button" data-autosafe-feedback="wrong_price" data-autosafe-log="${esc(log.id || '')}">ราคาผิด</button>` : ''}${cid ? `<button class="cc-btn" type="button" data-pause-auto-safe-conv="${esc(cid)}">พัก AI แชทนี้</button><button class="cc-btn" type="button" data-resume-auto-safe-conv="${esc(cid)}">เปิด AI แชทนี้</button>` : ''}</div></article>`;
  }

  function renderModeOption(modeKey, label, desc){
    const active = deriveReplyMode().key === modeKey;
    return `<div class="mode-option ${active ? 'active' : ''}"><b>${esc(label)}</b><span>${esc(desc)}</span><button type="button" data-reply-mode="${esc(modeKey)}">${active ? 'ใช้งานอยู่' : 'ใช้โหมดนี้'}</button></div>`;
  }

  function renderSwitchRow(item){
    const checked = item.value === true || item.value === "true";
    return `<div class="cc-item"><div class="cc-item-main"><b>${esc(item.label)}${item.locked ? '<span class="cc-lock">ล็อก</span>' : ''}</b><small>${esc(item.description || '')}</small></div><label class="cc-switch"><input type="checkbox" data-ai-switch-key="${esc(item.key)}" ${checked ? 'checked' : ''} ${item.locked ? 'disabled' : ''}><span class="cc-slider"></span></label></div>`;
  }

  function renderPolicyItem(item){
    return `<div class="policy-item"><div><b>${esc(item.label)}</b><small>${esc(item.description || '')}</small></div><div class="policy-badges"><span class="policy-badge">ล็อก</span><span class="policy-badge">บังคับใช้</span></div></div>`;
  }

  function statusMeta(status){
    const map = {
      READY_TO_CREATE_JOB: ["ข้อมูลครบพอให้แอดมินตรวจและเพิ่มงาน", "ready"],
      NEED_INFO: ["ควรถามข้อมูลเพิ่ม", "need"],
      WAITING_CUSTOMER_REPLY: ["ถามข้อมูลเพิ่มแล้ว กำลังรอลูกค้าตอบกลับ", "wait"],
      ADMIN_REQUIRED: ["เคสนี้ให้แอดมินตอบเอง", "admin"],
      JOB_CREATED: ["แอดมินสร้างงานแล้ว", "done"],
      CLOSED: ["ปิดรายการแล้ว", "done"],
    };
    return map[status] || [status || "-", "need"];
  }

  function renderLineCard(item){
    const [statusText, statusClass] = statusMeta(item.status);
    const name = item.line_display_name || item.customer_name || item.customer_phone || "ลูกค้า LINE";
    const bits = [item.service_type_text || item.service_type, item.unit_count ? `${item.unit_count} เครื่อง` : "", item.area_text || item.location_text || "", item.scheduled_time_text || item.scheduled_date_text || ""].filter(Boolean);
    return `<article class="line-card"><h4>${esc(name)}</h4><div class="line-sub">${esc(item.customer_phone || '')}</div><div class="line-meta"><span class="status-pill ${statusClass}">${esc(statusText)}</span>${bits.slice(0,3).map(x=>`<span class="status-pill done">${esc(x)}</span>`).join('')}</div><div class="line-message">${esc(item.latest_customer_message || item.thread_context || '')}</div><div class="cc-actions" style="margin-top:10px"><button class="cc-btn" type="button" data-open-booking-intake="${esc(item.id)}">เปิดงานนี้</button>${item.status === 'READY_TO_CREATE_JOB' ? `<button class="cc-btn primary" type="button" data-create-job-from-intake="${esc(item.id)}">เพิ่มงาน</button>` : ''}<button class="cc-btn" type="button" data-copy-text="${esc(item.latest_customer_message || item.thread_context || '')}">คัดลอกข้อความ</button></div></article>`;
  }

  function renderConversationCard(conversation){
    const active = STATE.selectedConversation && Number(STATE.selectedConversation.id) === Number(conversation.id);
    return `<button class="conversation-card ${active ? 'active' : ''}" type="button" data-select-line-conv="${esc(conversation.id)}">
      <b>${esc(conversation.display_name || 'ลูกค้า LINE')}</b>
      <small>${conversation.open_intake_count ? `งานรอ ${conversation.open_intake_count} · ` : ''}${conversation.pending_approval_count ? `อนุมัติ ${conversation.pending_approval_count} · ` : ''}${esc(conversation.last_message_at || '')}</small>
      <p>${esc(conversation.last_message_text || '')}</p>
    </button>`;
  }

  function renderThread(){
    if (!STATE.selectedConversation) return '<div class="ai-empty">เลือกลูกค้าจากรายการซ้าย เพื่อดูแชทและร่างคำตอบจาก thread จริง</div>';
    const inbound = [...STATE.lineThread].reverse().find(m => m.direction === 'inbound' && clean(m.message_text));
    const selectedText = inbound?.message_text || STATE.selectedConversation.last_message_text || '';
    return `<div class="cc-section-title"><h3>${esc(STATE.selectedConversation.display_name || 'ลูกค้า LINE')}</h3><div class="cc-actions"><button class="cc-btn" type="button" data-pause-auto-safe-conv="${esc(STATE.selectedConversation.id)}">พัก AI แชทนี้</button><button class="cc-btn" type="button" data-resume-auto-safe-conv="${esc(STATE.selectedConversation.id)}">เปิด AI แชทนี้</button><button class="cc-btn" type="button" data-refresh-thread="${esc(STATE.selectedConversation.id)}">รีเฟรชแชท</button></div></div>
      <p class="sub">อ่านข้อความ LINE จริง แล้วให้ AI ร่างคำตอบเข้าคิวอนุมัติได้</p>
      <div class="thread-box">${STATE.lineThread.length ? STATE.lineThread.map(m => `<div class="thread-msg ${esc(m.direction)}"><small>${m.direction === 'outbound' ? 'แอดมิน/ระบบ' : 'ลูกค้า'} · ${esc(m.received_at || m.created_at || '')}</small>${esc(m.message_text || `[${m.message_type || 'message'}]`)}</div>`).join('') : '<div class="ai-empty">ยังไม่มีข้อความใน thread นี้</div>'}</div>
      <form class="ai-control-form" data-line-draft-form style="margin-top:10px">
        <input type="hidden" name="conversation_id" value="${esc(STATE.selectedConversation.id)}">
        <label class="wide">ข้อความลูกค้าที่จะตอบ<textarea name="selected_customer_question" required>${esc(selectedText)}</textarea></label>
        <label class="wide">คำสั่งแอดมินเพิ่มเติม<textarea name="admin_question" placeholder="เช่น ตอบแบบสุภาพ สั้น พร้อมปิดการขาย หรือถามข้อมูลที่ขาด">ช่วยร่างคำตอบลูกค้าแบบแอดมิน CWF สุภาพ พร้อมคัดลอกใช้ได้ทันที</textarea></label>
        <div class="wide cc-actions"><button class="cc-btn primary" type="submit">ร่างคำตอบจากแชทนี้</button><button class="cc-btn" type="button" data-open-line-conv="${esc(STATE.selectedConversation.id)}">เปิด LINE Inbox</button></div>
      </form>
      ${STATE.lineDraftResult ? renderLineDraftResult() : ''}`;
  }

  function renderLineDraftResult(){
    const draft = STATE.lineDraftResult?.draft || {};
    const answer = STATE.lineDraftResult?.answer || draft.customer_reply || '';
    return `<div class="draft-result"><b>AI ร่างคำตอบจาก LINE thread แล้ว</b><p>${esc(answer)}</p><div class="cc-actions" style="margin-top:10px"><button class="cc-btn" type="button" data-copy-text="${esc(answer)}">คัดลอก</button>${draft.saved_draft_id ? `<button class="cc-btn primary" type="button" data-create-approval-from-draft="${esc(draft.saved_draft_id)}">ส่งเข้าคิวอนุมัติ</button><button class="cc-btn soft-danger" type="button" data-dislike-draft="${esc(draft.saved_draft_id)}" data-dislike-conv="${esc(draft.conversation_id || STATE.selectedConversation?.id || '')}" data-dislike-customer="${esc(draft.selected_customer_question || '')}" data-dislike-reply="${esc(answer)}">ไม่ชอบคำตอบนี้</button>` : ''}</div></div>`;
  }

  function renderLineWork(){
    return `
      <section class="cc-card">
        <div class="cc-section-title"><h3>LINE Sales Copilot</h3><button class="cc-btn" type="button" data-quick-action="open-review">หน้างานจอง</button></div>
        <p class="sub">V12 เพิ่มการอ่าน LINE thread จริง → ร่างคำตอบ → ส่งเข้าคิวอนุมัติ โดยไม่ส่ง LINE เอง</p>
        <div class="cc-list">${getSettingsByKeys(LINE_TOGGLE_KEYS).map(renderSwitchRow).join("")}</div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>แชทลูกค้าที่ต้องตอบ</h3><button class="cc-btn" type="button" data-ai-control-refresh>รีเฟรช</button></div>
        <div class="copilot-layout">
          <div><div class="conversation-list">${STATE.lineConversations.length ? STATE.lineConversations.map(renderConversationCard).join('') : '<div class="ai-empty">ยังไม่พบ LINE conversation</div>'}</div></div>
          <div>${renderThread()}</div>
        </div>
      </section>
      <section class="cc-card">
        <div class="cc-section-title"><h3>การ์ดงานจองจาก LINE</h3></div>
        <p class="sub">ส่วนนี้คือ booking intake สำหรับงานที่มีแนวโน้มพร้อมจองหรือรอข้อมูลเพิ่ม</p>
        ${STATE.lineIntakes.length ? STATE.lineIntakes.map(renderLineCard).join("") : '<div class="ai-empty">ยังไม่มีการ์ดลูกค้า LINE ที่เปิดอยู่</div>'}
      </section>`;
  }

  function approvalStatusText(status){
    return ({ pending:"รออนุมัติ", edited:"แก้ไขแล้ว", approved:"อนุมัติแล้ว", sent:"ส่งแล้ว", rejected:"ปฏิเสธ", admin_only:"ให้แอดมินตอบเอง" })[status] || status || "-";
  }

  function renderApprovals(){
    const canSend = getValue("admin_approved_line_send_enabled", false) === true && getValue("kill_switch", false) !== true;
    return `<section class="cc-card"><div class="cc-section-title"><h3>คิวอนุมัติข้อความตอบ</h3><span class="mode-badge ${canSend ? 'approval' : 'off'}">${canSend ? 'แอดมินกดส่ง LINE ได้' : 'ยังไม่เปิดส่งจากคิวอนุมัติ'}</span></div><p class="sub">AI ยังไม่ส่ง LINE เอง ข้อความในหน้านี้ต้องให้แอดมินตรวจ แก้ และตัดสินใจเอง</p>${STATE.approvals.length ? STATE.approvals.map((a) => `
      <article class="draft-card" data-approval-id="${esc(a.id)}">
        <h4>${esc(a.line_display_name || 'ลูกค้า LINE')} · ${esc(approvalStatusText(a.status))} · ${esc(a.risk_label || 'LOW')}</h4>
        <p><strong>ลูกค้า:</strong> ${esc(a.customer_message || '')}</p>
        <p><strong>เหตุผล:</strong> ${esc(a.decision_reason || 'รอแอดมินตรวจ')}</p>
        <label style="display:block;margin-top:8px;color:#06163d;font-weight:900;font-size:13px">ข้อความที่จะใช้ตอบ</label>
        <textarea data-approval-reply="${esc(a.id)}" rows="5" style="width:100%;margin-top:6px;border-radius:14px;padding:10px;border:1px solid rgba(21,88,214,.18);resize:vertical">${esc(a.final_reply || a.ai_draft || '')}</textarea>
        <div class="cc-actions" style="margin-top:10px">
          <button class="cc-btn" type="button" data-save-approval="${esc(a.id)}">บันทึกแก้ไข</button>
          <button class="cc-btn primary" type="button" data-approve-approval="${esc(a.id)}">อนุมัติใช้</button>
          <button class="cc-btn" type="button" data-copy-approval="${esc(a.id)}">คัดลอก</button>
          <button class="cc-btn secondary" type="button" data-send-approval="${esc(a.id)}" ${canSend ? '' : 'disabled'}>ส่ง LINE ตอนนี้</button>
          <button class="cc-btn" type="button" data-open-line-conv="${esc(a.conversation_id || '')}">เปิดแชท</button>
          <button class="cc-btn" type="button" data-admin-only-approval="${esc(a.id)}">แอดมินตอบเอง</button>
          <button class="cc-btn soft-danger" type="button" data-reject-approval="${esc(a.id)}">ปฏิเสธ</button>
        </div>
      </article>`).join("") : '<div class="ai-empty">ยังไม่มีข้อความรออนุมัติ</div>'}</section>`;
  }

  function decisionText(decision){ return ({ SAFE_DRAFT:"ร่างได้ ปลอดภัย", APPROVAL_REQUIRED:"ต้องอนุมัติก่อนใช้", ADMIN_ONLY:"แอดมินตอบเอง", BLOCKED:"ถูกปิด/บล็อก" })[decision] || decision || "-"; }
  function renderDecisionLab(){
    const result = STATE.decisionResult;
    return `<section class="cc-card"><h3>ตรวจคำตอบก่อนใช้</h3><p class="sub">ใช้วางข้อความลูกค้าแล้วให้ระบบช่วยจัดระดับความเสี่ยงก่อนนำไปใช้จริง</p>
      <form class="ai-control-form" data-decision-form>
        <label class="wide">ข้อความลูกค้า<textarea name="customer_message" required placeholder="วางข้อความลูกค้าจริงจาก LINE"></textarea></label>
        <label>Conversation ID <input name="conversation_id" placeholder="ไม่ใส่ก็ได้"></label>
        <label>ชื่อ LINE <input name="line_display_name" placeholder="ไม่ใส่ก็ได้"></label>
        <div class="wide cc-actions"><button class="cc-btn primary" type="submit">วิเคราะห์คำตอบ</button><button class="cc-btn" type="button" data-decision-create-approval ${result?.decision?.id ? '' : 'disabled'}>ส่งผลนี้เข้าคิวอนุมัติ</button></div>
      </form>
      ${result ? renderDecisionResult(result) : ''}
    </section>
    <section class="cc-card"><h3>ประวัติการตรวจคำตอบล่าสุด</h3>${STATE.decisions.length ? STATE.decisions.map(renderDecisionItem).join('') : '<div class="ai-empty">ยังไม่มีประวัติการตรวจคำตอบ</div>'}</section>`;
  }
  function renderDecisionResult(result){
    const d = result.decision || result;
    return `<article class="draft-card"><h4>${esc(decisionText(d.decision))} · ${esc(d.risk_label || '')} · มั่นใจ ${esc(d.confidence || 0)}%</h4><p><strong>เหตุผล:</strong> ${esc(d.decision_reason || '')}</p><p><strong>ข้อความแนะนำ:</strong> ${esc(d.recommended_reply || '')}</p><div class="cc-actions"><button class="cc-btn" type="button" data-copy-text="${esc(d.recommended_reply || '')}">คัดลอกข้อความแนะนำ</button>${result.approval ? `<button class="cc-btn" type="button" data-ai-tab-go="approvals">ดูในคิวอนุมัติ #${esc(result.approval.id)}</button>` : ''}</div></article>`;
  }
  function renderDecisionItem(d){
    return `<article class="draft-card"><h4>#${esc(d.id)} · ${esc(decisionText(d.decision))} · ${esc(d.risk_label || '')}</h4><p><strong>ลูกค้า:</strong> ${esc(d.customer_message || '')}</p><p><strong>เหตุผล:</strong> ${esc(d.decision_reason || '')}</p><p><strong>แนะนำ:</strong> ${esc(d.recommended_reply || '')}</p><div class="cc-actions"><button class="cc-btn" type="button" data-create-approval-from-decision="${esc(d.id)}" ${d.approval_id ? 'disabled' : ''}>ส่งเข้าคิวอนุมัติ</button><button class="cc-btn" type="button" data-copy-text="${esc(d.recommended_reply || '')}">คัดลอก</button></div></article>`;
  }

  function renderDrafts(){
    if (!STATE.drafts.length) return `<div class="ai-empty">ยังไม่มีร่างคำตอบที่รอแอดมิน</div>`;
    return `<section class="cc-card"><h3>ร่างคำตอบจาก LINE</h3><p class="sub">ยังไม่ส่ง LINE เอง แอดมินเป็นคนคัดลอก แก้ หรือส่งเข้าคิวอนุมัติ</p>${STATE.drafts.map((d) => `
      <article class="draft-card">
        <h4>${esc(d.display_name || 'ลูกค้า LINE')} · ${esc(d.action_status || 'drafted')}</h4>
        <p><strong>ลูกค้า:</strong> ${esc(d.selected_customer_message || d.last_message_text || '')}</p>
        <p><strong>AI ร่าง:</strong> ${esc(d.final_admin_reply || d.ai_draft || '')}</p>
        <div class="cc-actions"><button class="cc-btn primary" type="button" data-create-approval-from-draft="${esc(d.id || '')}">ส่งเข้าคิวอนุมัติ</button><button class="cc-btn" type="button" data-copy-text="${esc(d.final_admin_reply || d.ai_draft || '')}">คัดลอก</button><button class="cc-btn soft-danger" type="button" data-dislike-draft="${esc(d.id || '')}" data-dislike-conv="${esc(d.conversation_id || '')}" data-dislike-customer="${esc(d.selected_customer_message || d.last_message_text || '')}" data-dislike-reply="${esc(d.final_admin_reply || d.ai_draft || '')}">ไม่ชอบคำตอบนี้</button><button class="cc-btn" type="button" data-open-line-conv="${esc(d.conversation_id || '')}">เปิดแชท</button></div>
      </article>`).join('')}</section>`;
  }

  function renderBrain(){
    return `<section class="cc-card"><h3>เพิ่ม/แก้คลังสมองคำตอบ</h3><p class="sub">ใช้แก้แนวคำตอบที่ไม่ชอบ หรือเพิ่มตัวอย่างคำตอบแอดมินจริงให้ AI จำ</p>${brainForm()}</section>
      <section class="cc-card"><h3>รายการในคลังสมอง</h3><p class="sub">กดแก้เพื่อปรับคำตอบเดิม หรือปิดใช้งานคำตอบที่ไม่อยากให้ AI อ้างอิง</p>${STATE.examples.length ? STATE.examples.map(renderExample).join('') : '<div class="ai-empty">ยังไม่มีรายการในคลังสมอง</div>'}</section>`;
  }
  function brainForm(ex){
    const isEdit = !!ex?.id;
    return `<form class="ai-control-form" data-brain-form ${isEdit ? `data-edit-id="${esc(ex.id)}"` : ''}>
      <label>สถานการณ์<select name="situation_type"><option value="general">ทั่วไป</option><option value="price_question">ถามราคา</option><option value="expensive">ลูกค้าบอกแพง</option><option value="appointment">นัดคิว</option><option value="missing_info">ถามข้อมูลที่ขาด</option><option value="complaint">ร้องเรียน</option><option value="foreign_customer">ลูกค้าต่างชาติ</option></select></label>
      <label>ภาษา<select name="language"><option value="th">ไทย</option><option value="en">English</option><option value="ja">日本語</option><option value="unknown">ไม่ระบุ</option></select></label>
      <label class="wide">ข้อความลูกค้า<textarea name="customer_message" required>${esc(ex?.customer_message || '')}</textarea></label>
      <label class="wide">คำตอบที่ต้องการให้ AI เรียนรู้<textarea name="final_admin_reply" required>${esc(ex?.final_admin_reply || ex?.admin_reply || '')}</textarea></label>
      <label>หมวดบริการ<input name="service_type" value="${esc(ex?.service_type || '')}" placeholder="air_cleaning / repair"></label>
      <label>แท็ก<input name="tags" value="${esc(Array.isArray(ex?.tags) ? ex.tags.join(', ') : (ex?.tags || ''))}" placeholder="ราคา, แพง, พรีเมียม"></label>
      <div class="wide cc-actions"><button class="cc-btn primary" type="submit">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มเข้าคลังสมอง'}</button>${isEdit ? '<button class="cc-btn" type="button" data-cancel-edit>ยกเลิก</button>' : ''}</div>
    </form>`;
  }
  function renderExample(ex){
    return `<article class="brain-item" data-example-id="${esc(ex.id)}"><h4>${esc(ex.situation_type || 'general')} · ${esc(ex.language || 'th')} ${ex.is_active === false ? '· ปิดใช้งาน' : ''}</h4><p><strong>ลูกค้า:</strong> ${esc(ex.customer_message || '')}</p><p><strong>คำตอบ:</strong> ${esc(ex.final_admin_reply || ex.admin_reply || '')}</p><div class="cc-actions"><button class="cc-btn" type="button" data-edit-example="${esc(ex.id)}">แก้ไข</button><button class="cc-btn soft-danger" type="button" data-disable-example="${esc(ex.id)}">ปิดใช้งาน</button></div></article>`;
  }

  function approvalReply(id){ const el = Array.from(document.querySelectorAll('[data-approval-reply]')).find((x) => String(x.dataset.approvalReply) === String(id)); return el?.value || ''; }
  async function createApprovalFromDraft(id){ if (!id) return toast('ไม่พบร่างคำตอบ', 'error'); await api(`/admin/ai-office/control/approvals/from-draft/${encodeURIComponent(id)}`, { method:'POST', body:'{}' }); STATE.activeTab = 'approvals'; await loadAll(); toast('ส่งเข้าคิวอนุมัติแล้ว', 'success'); }
  async function saveApproval(id){ const final_reply = approvalReply(id); await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify({ final_reply, status:'edited', admin_note:'edited_from_control_center' }) }); await loadApprovals(); render(); toast('บันทึกข้อความแล้ว', 'success'); }
  async function approveApproval(id){ const final_reply = approvalReply(id); await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/approve`, { method:'POST', body:JSON.stringify({ final_reply, admin_note:'approved_from_control_center' }) }); await loadApprovals(); render(); toast('อนุมัติข้อความแล้ว', 'success'); }
  async function rejectApproval(id){ if (!confirm('ปฏิเสธร่างคำตอบนี้ใช่ไหม')) return; await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/reject`, { method:'POST', body:JSON.stringify({ admin_note:'rejected_from_control_center' }) }); await loadApprovals(); render(); toast('ปฏิเสธแล้ว', 'success'); }
  async function adminOnlyApproval(id){ await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/admin-only`, { method:'POST', body:JSON.stringify({ admin_note:'admin_only_from_control_center' }) }); await loadApprovals(); render(); toast('ย้ายเป็นแอดมินตอบเองแล้ว', 'success'); }
  async function sendApproval(id){ const final_reply = approvalReply(id); if (!confirm('ส่งข้อความนี้เข้า LINE ลูกค้าตอนนี้ใช่ไหม')) return; await api(`/admin/ai-office/control/approvals/${encodeURIComponent(id)}/send`, { method:'POST', body:JSON.stringify({ final_reply, admin_note:'sent_by_admin_from_control_center' }) }); await loadApprovals(); render(); toast('ส่ง LINE แล้ว', 'success'); }
  function copyApproval(id){ const text = approvalReply(id); navigator.clipboard?.writeText(text || ''); toast('คัดลอกแล้ว', 'success'); }

  async function analyzeDecision(form){ const fd = new FormData(form); const payload = Object.fromEntries(fd.entries()); if (!clean(payload.customer_message)) return toast('กรุณาวางข้อความลูกค้า', 'error'); const data = await api('/admin/ai-office/control/reply-decision', { method:'POST', body:JSON.stringify(payload) }); STATE.decisionResult = data; await loadDecisionLogs(); render(); toast('วิเคราะห์คำตอบแล้ว', 'success'); }
  async function createApprovalFromCurrentDecision(){ const id = STATE.decisionResult?.decision?.id; if (!id) return toast('ยังไม่มีผลวิเคราะห์', 'error'); const data = await api(`/admin/ai-office/control/reply-decision/${encodeURIComponent(id)}/approval`, { method:'POST', body:'{}' }); STATE.decisionResult.approval = data.approval; STATE.activeTab = 'approvals'; await loadApprovals(); render(); toast('ส่งเข้าคิวอนุมัติแล้ว', 'success'); }
  async function createApprovalFromDecision(id){ if (!id) return toast('ไม่พบผลวิเคราะห์', 'error'); await api(`/admin/ai-office/control/reply-decision/${encodeURIComponent(id)}/approval`, { method:'POST', body:'{}' }); STATE.activeTab = 'approvals'; await loadApprovals(); render(); toast('ส่งเข้าคิวอนุมัติแล้ว', 'success'); }

  async function draftFromLineForm(form){
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (!clean(payload.conversation_id) || !clean(payload.selected_customer_question)) return toast('กรุณาเลือกแชทและข้อความลูกค้า', 'error');
    const data = await api('/admin/ai-office/line-draft-reply', { method:'POST', body:JSON.stringify(payload) });
    STATE.lineDraftResult = data;
    await loadDrafts();
    render();
    toast('ร่างคำตอบจาก LINE แล้ว', 'success');
  }
  async function dislikeDraft(payload){
    const reason = prompt('ไม่ชอบคำตอบนี้เพราะอะไร เช่น แข็งไป / เสนอเกิน / ผิดราคา / ไม่เป็นธรรมชาติ') || 'ไม่ชอบคำตอบนี้';
    await api('/admin/ai-office/control/draft-feedback', { method:'POST', body:JSON.stringify(Object.assign({}, payload, { reason })) });
    await loadDrafts();
    render();
    toast('บันทึก feedback แล้ว', 'success');
  }

  async function saveAutoSafeConfig(form){
    const fd = new FormData(form);
    const updates = [
      { key:"auto_safe_reply_confidence_threshold", value:Number(fd.get("auto_safe_reply_confidence_threshold") || 85) },
      { key:"auto_safe_reply_cooldown_minutes", value:Number(fd.get("auto_safe_reply_cooldown_minutes") || 15) },
      { key:"auto_safe_reply_daily_limit", value:Number(fd.get("auto_safe_reply_daily_limit") || 5) },
      { key:"auto_safe_human_takeover_minutes", value:Number(fd.get("auto_safe_human_takeover_minutes") || 60) },
      { key:"auto_safe_reply_quiet_start", value:String(fd.get("auto_safe_reply_quiet_start") || "22:00") },
      { key:"auto_safe_reply_quiet_end", value:String(fd.get("auto_safe_reply_quiet_end") || "08:00") },
      { key:"auto_safe_reply_quiet_hours_enabled", value:fd.get("auto_safe_reply_quiet_hours_enabled") === "on" },
      { key:"auto_safe_quality_guard_enabled", value:fd.get("auto_safe_quality_guard_enabled") === "on" },
      { key:"auto_safe_negative_feedback_threshold", value:Number(fd.get("auto_safe_negative_feedback_threshold") || 2) },
      { key:"auto_safe_negative_feedback_window_days", value:Number(fd.get("auto_safe_negative_feedback_window_days") || 14) },
      { key:"auto_safe_auto_pause_on_bad_feedback", value:fd.get("auto_safe_auto_pause_on_bad_feedback") === "on" },
      { key:"auto_safe_auto_pause_minutes", value:Number(fd.get("auto_safe_auto_pause_minutes") || 1440) },
      { key:"auto_safe_playbook_enabled", value:fd.get("auto_safe_playbook_enabled") === "on" },
      { key:"auto_safe_playbook_required", value:fd.get("auto_safe_playbook_required") === "on" },
      { key:"auto_safe_playbook_seed_enabled", value:fd.get("auto_safe_playbook_seed_enabled") === "on" },
      { key:"auto_safe_playbook_suggestions_enabled", value:fd.get("auto_safe_playbook_suggestions_enabled") === "on" },
      { key:"auto_safe_playbook_suggestion_min_count", value:Number(fd.get("auto_safe_playbook_suggestion_min_count") || 2) },
      { key:"auto_safe_playbook_suggestion_window_days", value:Number(fd.get("auto_safe_playbook_suggestion_window_days") || 14) },
      { key:"auto_safe_dashboard_enabled", value:fd.get("auto_safe_dashboard_enabled") === "on" },
      { key:"auto_safe_dashboard_window_days", value:Number(fd.get("auto_safe_dashboard_window_days") || 30) },
      { key:"auto_safe_estimated_admin_seconds_per_reply", value:Number(fd.get("auto_safe_estimated_admin_seconds_per_reply") || 45) },
      { key:"auto_safe_admin_hourly_cost_thb", value:Number(fd.get("auto_safe_admin_hourly_cost_thb") || 120) },
    ];
    await bulkUpdate(updates, "auto_safe_config_from_v16");
    toast("บันทึกกติกา Auto Safe แล้ว", "success");
  }

  async function sendAutoSafeFeedback(logId, feedbackType){
    if (!logId) return toast('ไม่พบ log', 'error');
    let reason = '';
    if (feedbackType !== 'good') reason = prompt('บอกเหตุผลสั้น ๆ เพื่อให้ระบบจำและกันไม่ให้ตอบซ้ำแบบนี้', feedbackType === 'wrong_price' ? 'ราคาผิด / ใช้ราคาไม่ตรง' : 'คำตอบยังไม่ดี') || '';
    await api(`/admin/ai-office/control/auto-safe/logs/${encodeURIComponent(logId)}/feedback`, { method:'POST', body:JSON.stringify({ feedback_type: feedbackType, reason }) });
    await Promise.all([loadAutoSafeLogs(), loadAutoSafeQuality(), loadAutoSafePlaybooks(), loadAutoSafeAnalytics()]);
    render();
    toast(feedbackType === 'good' ? 'บันทึกว่าคำตอบนี้ใช้ได้' : 'บันทึก feedback และอัปเดตกฎเรียนรู้แล้ว', 'success');
  }

  async function pauseAutoSafeConversation(conversationId){
    if (!conversationId) return toast("ไม่พบแชทลูกค้า", "error");
    const minutes = prompt("พัก AI ตอบเองในแชทนี้กี่นาที", "1440");
    if (minutes == null) return;
    await api(`/admin/ai-office/control/auto-safe/conversation/${encodeURIComponent(conversationId)}/pause`, { method:"POST", body:JSON.stringify({ minutes:Number(minutes || 1440), reason:"paused_from_ai_reply_control_v14" }) });
    toast("พัก AI ตอบเองในแชทนี้แล้ว", "success");
    await loadAll();
  }

  async function resumeAutoSafeConversation(conversationId){
    if (!conversationId) return toast("ไม่พบแชทลูกค้า", "error");
    await api(`/admin/ai-office/control/auto-safe/conversation/${encodeURIComponent(conversationId)}/resume`, { method:"POST", body:"{}" });
    toast("เปิด AI ตอบเองในแชทนี้แล้ว", "success");
    await loadAll();
  }

  async function savePlaybookForm(form){
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (!clean(payload.title) || !clean(payload.response_text)) return toast('กรุณาใส่ชื่อและข้อความตอบ Playbook', 'error');
    await api('/admin/ai-office/control/auto-safe/playbooks', { method:'POST', body:JSON.stringify(payload) });
    await Promise.all([loadAutoSafePlaybooks(), loadAutoSafeAnalytics()]);
    render();
    toast('เพิ่ม Playbook แล้ว', 'success');
  }

  async function disablePlaybook(id){
    if (!id) return toast('ไม่พบ Playbook', 'error');
    if (!confirm('ปิด Playbook นี้ใช่ไหม')) return;
    await api(`/admin/ai-office/control/auto-safe/playbooks/${encodeURIComponent(id)}/disable`, { method:'POST', body:'{}' });
    await Promise.all([loadAutoSafePlaybooks(), loadAutoSafeAnalytics()]);
    render();
    toast('ปิด Playbook แล้ว', 'success');
  }

  async function generatePlaybookSuggestions(){
    await api('/admin/ai-office/control/auto-safe/playbook-suggestions/generate', { method:'POST', body:'{}' });
    await Promise.all([loadAutoSafeAnalytics(), loadAutoSafePlaybooks()]);
    render();
    toast('วิเคราะห์คำถามและอัปเดต Playbook แนะนำแล้ว', 'success');
  }

  function collectPlaybookSuggestionReview(id){
    const form = Array.from(document.querySelectorAll('[data-playbook-suggestion-form]')).find((el) => String(el.dataset.playbookSuggestionForm) === String(id));
    if (!form) return {};
    const fd = new FormData(form);
    return {
      title: clean(fd.get('title')),
      intent: clean(fd.get('intent')),
      trigger_phrases: clean(fd.get('trigger_phrases')),
      response_text: String(fd.get('response_text') || '').trim(),
      priority: Number(fd.get('priority') || 90),
      review_note: clean(fd.get('review_note')),
    };
  }

  async function savePlaybookSuggestionReview(id){
    if (!id) return toast('ไม่พบรายการแนะนำ', 'error');
    const payload = collectPlaybookSuggestionReview(id);
    if (!clean(payload.title) || !clean(payload.response_text)) return toast('กรุณาตรวจชื่อและข้อความตอบก่อนบันทึก', 'error');
    await api(`/admin/ai-office/control/auto-safe/playbook-suggestions/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify(payload) });
    await loadAutoSafeAnalytics();
    render();
    toast('บันทึกฉบับแก้ของ Playbook แนะนำแล้ว', 'success');
  }

  async function approvePlaybookSuggestion(id){
    if (!id) return toast('ไม่พบรายการแนะนำ', 'error');
    const payload = collectPlaybookSuggestionReview(id);
    if (!clean(payload.title) || !clean(payload.response_text)) return toast('กรุณาตรวจชื่อและข้อความตอบก่อนสร้าง Playbook', 'error');
    if (!confirm('อนุมัติและสร้าง Playbook จากฉบับที่แก้แล้วใช่ไหม')) return;
    await api(`/admin/ai-office/control/auto-safe/playbook-suggestions/${encodeURIComponent(id)}/approve`, { method:'POST', body:JSON.stringify(payload) });
    await Promise.all([loadAutoSafeAnalytics(), loadAutoSafePlaybooks()]);
    render();
    toast('สร้าง Playbook จากฉบับที่แอดมินตรวจแล้ว', 'success');
  }

  async function dismissPlaybookSuggestion(id){
    if (!id) return toast('ไม่พบรายการแนะนำ', 'error');
    await api(`/admin/ai-office/control/auto-safe/playbook-suggestions/${encodeURIComponent(id)}/dismiss`, { method:'POST', body:'{}' });
    await loadAutoSafeAnalytics();
    render();
    toast('ซ่อน Playbook แนะนำแล้ว', 'success');
  }

  async function updateSetting(key, value){ const data = await api('/admin/ai-office/control/settings', { method:'PATCH', body:JSON.stringify({ key, value, note:'updated_from_ai_reply_control_v12' }) }); STATE.settings = data.settings || STATE.settings; STATE.values = data.values || STATE.values; render(); toast('อัปเดตแล้ว', 'success'); }
  async function bulkUpdate(updates, note){ const data = await api('/admin/ai-office/control/settings/bulk', { method:'POST', body:JSON.stringify({ updates, note }) }); STATE.settings = data.settings || STATE.settings; STATE.values = data.values || STATE.values; render(); return data; }
  async function setReplyMode(mode){
    const note = `reply_mode_${mode}_from_v12`;
    let updates = [];
    if (mode === 'off') updates = [
      { key:'kill_switch', value:false },
      { key:'draft_reply_enabled', value:false },
      { key:'ask_missing_info_enabled', value:false },
      { key:'price_reply_draft_enabled', value:false },
      { key:'sales_objection_draft_enabled', value:false },
      { key:'approval_required_enabled', value:false },
      { key:'approval_queue_enabled', value:false },
    ];
    else if (mode === 'draft') updates = [
      { key:'kill_switch', value:false },
      { key:'draft_reply_enabled', value:true },
      { key:'ask_missing_info_enabled', value:true },
      { key:'price_reply_draft_enabled', value:true },
      { key:'sales_objection_draft_enabled', value:true },
      { key:'approval_required_enabled', value:false },
      { key:'approval_queue_enabled', value:false },
    ];
    else updates = [
      { key:'kill_switch', value:false },
      { key:'draft_reply_enabled', value:true },
      { key:'ask_missing_info_enabled', value:true },
      { key:'price_reply_draft_enabled', value:true },
      { key:'sales_objection_draft_enabled', value:true },
      { key:'approval_required_enabled', value:true },
      { key:'approval_queue_enabled', value:true },
    ];
    await bulkUpdate(updates, note);
    toast('เปลี่ยนโหมดการตอบแล้ว', 'success');
  }
  async function toggleKill(){ await updateSetting('kill_switch', !getValue('kill_switch', false)); }
  async function saveBrainForm(form){ const fd = new FormData(form); const payload = Object.fromEntries(fd.entries()); payload.tags = clean(payload.tags || ''); const id = form.dataset.editId; if (!clean(payload.customer_message) || !clean(payload.final_admin_reply)) return toast('กรุณาใส่ข้อความลูกค้าและคำตอบ', 'error'); if (id) await api(`/admin/ai-office/reply-examples/${encodeURIComponent(id)}`, { method:'PATCH', body:JSON.stringify(payload) }); else await api('/admin/ai-office/reply-examples', { method:'POST', body:JSON.stringify(payload) }); await loadExamples(); render(); toast(id ? 'แก้คลังสมองแล้ว' : 'เพิ่มเข้าคลังสมองแล้ว', 'success'); }
  async function disableExample(id){ if (!confirm('ปิดใช้งานคำตอบนี้ใช่ไหม')) return; await api(`/admin/ai-office/reply-examples/${encodeURIComponent(id)}/disable`, { method:'PATCH', body:'{}' }); await loadExamples(); render(); }
  function editExample(id){ const ex = STATE.examples.find((x) => String(x.id) === String(id)); if (!ex) return; const first = $('[data-brain-form]'); if (first) { first.outerHTML = brainForm(ex); const form = $('[data-brain-form]'); if (form) { if (ex.situation_type) form.elements.situation_type.value = ex.situation_type; if (ex.language) form.elements.language.value = ex.language; form.scrollIntoView({ behavior:'smooth', block:'start' }); } } }

  function openInbox(){ if (EMBEDDED) { STATE.activeTab = 'line'; loadAll(); return; } const btn = $('#lineInboxBtn'); if (btn) { closePanel(); btn.click(); } else window.location.href = '/admin-ai-line-control.html?panel=line'; }
  function openBookingReview(intakeId){ const suffix = intakeId ? `?ai_intake_id=${encodeURIComponent(intakeId)}` : ''; window.location.href = `/admin-review-v2.html${suffix}`; }
  function openAddFromIntake(id){ window.location.href = `/admin-add-v2.html?source=line_ai&ai_intake_id=${encodeURIComponent(id)}&t=${Date.now()}`; }

  function handleClick(e){
    if (e.target.closest('[data-ai-control-close]')) return closePanel();
    if (e.target.closest('[data-ai-control-refresh]')) return loadAll();
    const tab = e.target.closest('[data-ai-tab]');
    if (tab) { STATE.activeTab = tab.dataset.aiTab; return loadAll(); }
    const go = e.target.closest('[data-ai-tab-go]');
    if (go) { STATE.activeTab = go.dataset.aiTabGo; return loadAll(); }
    const quick = e.target.closest('[data-quick-action]');
    if (quick) {
      const act = quick.dataset.quickAction;
      if (act === 'open-inbox') return openInbox();
      if (act === 'open-review') return openBookingReview();
      if (act === 'mode-draft') return setReplyMode('draft').catch((err) => toast(err.message, 'error'));
      if (act === 'mode-approval') return setReplyMode('approval').catch((err) => toast(err.message, 'error'));
      if (act === 'kill-toggle') return toggleKill().catch((err) => toast(err.message, 'error'));
    }
    const mode = e.target.closest('[data-reply-mode]');
    if (mode) return setReplyMode(mode.dataset.replyMode).catch((err) => toast(err.message, 'error'));
    const selectConv = e.target.closest('[data-select-line-conv]');
    if (selectConv) { STATE.lineDraftResult = null; return loadLineThread(selectConv.dataset.selectLineConv).then(()=>render()).catch((err)=>toast(err.message,'error')); }
    const refreshThread = e.target.closest('[data-refresh-thread]');
    if (refreshThread) return loadLineThread(refreshThread.dataset.refreshThread).then(()=>render()).catch((err)=>toast(err.message,'error'));
    const copy = e.target.closest('[data-copy-text]');
    if (copy) { navigator.clipboard?.writeText(copy.dataset.copyText || ''); return toast('คัดลอกแล้ว', 'success'); }
    const dislike = e.target.closest('[data-dislike-draft]');
    if (dislike) return dislikeDraft({ draft_id: dislike.dataset.dislikeDraft, conversation_id: dislike.dataset.dislikeConv, customer_message: dislike.dataset.dislikeCustomer, ai_reply: dislike.dataset.dislikeReply }).catch((err)=>toast(err.message,'error'));
    const fromDraft = e.target.closest('[data-create-approval-from-draft]');
    if (fromDraft) return createApprovalFromDraft(fromDraft.dataset.createApprovalFromDraft).catch((err) => toast(err.message, 'error'));
    const saveApprovalBtn = e.target.closest('[data-save-approval]');
    if (saveApprovalBtn) return saveApproval(saveApprovalBtn.dataset.saveApproval).catch((err) => toast(err.message, 'error'));
    const approveBtn = e.target.closest('[data-approve-approval]');
    if (approveBtn) return approveApproval(approveBtn.dataset.approveApproval).catch((err) => toast(err.message, 'error'));
    const copyApprovalBtn = e.target.closest('[data-copy-approval]');
    if (copyApprovalBtn) return copyApproval(copyApprovalBtn.dataset.copyApproval);
    const sendBtn = e.target.closest('[data-send-approval]');
    if (sendBtn) return sendApproval(sendBtn.dataset.sendApproval).catch((err) => toast(err.message, 'error'));
    const rejectBtn = e.target.closest('[data-reject-approval]');
    if (rejectBtn) return rejectApproval(rejectBtn.dataset.rejectApproval).catch((err) => toast(err.message, 'error'));
    const adminOnlyBtn = e.target.closest('[data-admin-only-approval]');
    if (adminOnlyBtn) return adminOnlyApproval(adminOnlyBtn.dataset.adminOnlyApproval).catch((err) => toast(err.message, 'error'));
    const decisionApproval = e.target.closest('[data-decision-create-approval]');
    if (decisionApproval) return createApprovalFromCurrentDecision().catch((err) => toast(err.message, 'error'));
    const fromDecision = e.target.closest('[data-create-approval-from-decision]');
    if (fromDecision) return createApprovalFromDecision(fromDecision.dataset.createApprovalFromDecision).catch((err) => toast(err.message, 'error'));
    const conv = e.target.closest('[data-open-line-conv]');
    if (conv) return openInbox();
    const edit = e.target.closest('[data-edit-example]');
    if (edit) return editExample(edit.dataset.editExample);
    const dis = e.target.closest('[data-disable-example]');
    if (dis) return disableExample(dis.dataset.disableExample).catch((err) => toast(err.message, 'error'));
    const openIntake = e.target.closest('[data-open-booking-intake]');
    if (openIntake) return openBookingReview(openIntake.dataset.openBookingIntake);
    const createJob = e.target.closest('[data-create-job-from-intake]');
    if (createJob) return openAddFromIntake(createJob.dataset.createJobFromIntake);
    const autoFb = e.target.closest('[data-autosafe-feedback]');
    if (autoFb) return sendAutoSafeFeedback(autoFb.dataset.autosafeLog, autoFb.dataset.autosafeFeedback).catch((err) => toast(err.message, 'error'));
    const pauseConv = e.target.closest('[data-pause-auto-safe-conv]');
    if (pauseConv) return pauseAutoSafeConversation(pauseConv.dataset.pauseAutoSafeConv).catch((err) => toast(err.message, 'error'));
    const resumeConv = e.target.closest('[data-resume-auto-safe-conv]');
    if (resumeConv) return resumeAutoSafeConversation(resumeConv.dataset.resumeAutoSafeConv).catch((err) => toast(err.message, 'error'));
    const disablePb = e.target.closest('[data-disable-playbook]');
    if (disablePb) return disablePlaybook(disablePb.dataset.disablePlaybook).catch((err) => toast(err.message, 'error'));
    if (e.target.closest('[data-generate-playbook-suggestions]')) return generatePlaybookSuggestions().catch((err) => toast(err.message, 'error'));
    const saveSuggestion = e.target.closest('[data-save-playbook-suggestion]');
    if (saveSuggestion) return savePlaybookSuggestionReview(saveSuggestion.dataset.savePlaybookSuggestion).catch((err) => toast(err.message, 'error'));
    const approveSuggestion = e.target.closest('[data-approve-playbook-suggestion]');
    if (approveSuggestion) return approvePlaybookSuggestion(approveSuggestion.dataset.approvePlaybookSuggestion).catch((err) => toast(err.message, 'error'));
    const dismissSuggestion = e.target.closest('[data-dismiss-playbook-suggestion]');
    if (dismissSuggestion) return dismissPlaybookSuggestion(dismissSuggestion.dataset.dismissPlaybookSuggestion).catch((err) => toast(err.message, 'error'));
    if (e.target.closest('[data-cancel-edit]')) return loadAll();
  }
  function handleChange(e){ const sw = e.target.closest('[data-ai-switch-key]'); if (!sw) return; updateSetting(sw.dataset.aiSwitchKey, !!sw.checked).catch((err) => { toast(err.message, 'error'); loadAll(); }); }
  function handleSubmit(e){ const autoSafeForm = e.target.closest('[data-auto-safe-config-form]'); if (autoSafeForm) { e.preventDefault(); return saveAutoSafeConfig(autoSafeForm).catch((err) => toast(err.message, 'error')); } const lineDraftForm = e.target.closest('[data-line-draft-form]'); if (lineDraftForm) { e.preventDefault(); return draftFromLineForm(lineDraftForm).catch((err) => toast(err.message, 'error')); } const decisionForm = e.target.closest('[data-decision-form]'); if (decisionForm) { e.preventDefault(); return analyzeDecision(decisionForm).catch((err) => toast(err.message, 'error')); } const playbookForm = e.target.closest('[data-playbook-form]'); if (playbookForm) { e.preventDefault(); return savePlaybookForm(playbookForm).catch((err) => toast(err.message, 'error')); } const form = e.target.closest('[data-brain-form]'); if (!form) return; e.preventDefault(); saveBrainForm(form).catch((err) => toast(err.message, 'error')); }

  function init(){
    ensureDom();
    const qs = new URLSearchParams(location.search);
    const panel = qs.get('panel');
    if (panel === "dashboard") STATE.activeTab = 'dashboard';
    else if (["approvals","approval"].includes(panel)) STATE.activeTab = 'approvals';
    else if (panel === 'drafts') STATE.activeTab = 'approvals';
    else if (panel === 'decision' || panel === 'reply-decision') STATE.activeTab = 'decision';
    else if (panel === 'brain') STATE.activeTab = 'brain';
    else if (panel === 'line' || panel === 'line-ai') STATE.activeTab = 'line';
    else if (panel === 'reply' || panel === 'switches') STATE.activeTab = 'reply';
    if (EMBEDDED) { openPanel(STATE.activeTab); return; }
    if (["line-ai","dashboard","reply","line","approvals","approval","drafts","decision","reply-decision","brain","switches"].includes(panel) || qs.get('ai_intake_id')) setTimeout(()=>openPanel(), 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
