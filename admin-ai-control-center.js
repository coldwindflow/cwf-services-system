(function(){
  "use strict";

  const BUILD = "phase35b5_chat_mirror_20260612";
  try { window.__CWF_AI_TRAINING_CENTER_BUILD__ = BUILD; } catch(_) {}

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
    trainingEnabled: false,
    trainingAutoAnswer: false,
    trainingResult: null,
    trainingBusy: false,
    trainingLastKey: "",
    selectedTrainingKey: "",
    trainingQuestions: [],
    trainingSkills: [],
    trainingCounts: {},
    tc5MobileStep: 1,
    tc5RightTab: "skills",
    tc5TeachOpen: false,
    health: null,
    autoSafeLogs: [],
    autoSafeQuality: null,
    autoSafePlaybooks: [],
    autoSafeAnalytics: null,
    autoSafeDashboard: null,
    activeTab: "line",
    open: false,
  };

  // ── In-flight guards — กัน loadAll / loadApprovals ยิงซ้ำพร้อมกัน ──
  let _loadAllBusy = false;
  let _loadApprovalsBusy = false;
  let _trainingDraftBusy = false;

  const TABS = [
    ["line",      "กล่องแชทลูกค้า"],
    ["training",  "ศูนย์ฝึก AI"],
    ["approvals", "คิวรออนุมัติ"],
    ["decision",  "AI ช่วยร่างคำตอบ"],
    ["reply",     "ตั้งค่าการตอบ AI"],
    ["advanced",  "ขั้นสูง"],
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
      .ai-control-open{position:fixed;right:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:89;border:0;border-radius:999px;background:#ffcc00;color:#06163d;font-weight:900;min-height:46px;padding:0 15px;box-shadow:0 14px 30px rgba(2,6,23,.22)}
      .ai-control-overlay{position:fixed;inset:0;z-index:190;display:none;background:linear-gradient(180deg,#eaf2ff 0,#f7fbff 100%);color:#07152f;overflow:hidden}
      .ai-control-overlay.open{display:flex;flex-direction:column}
      .ai-control-top{flex:0 0 auto;background:linear-gradient(135deg,#06163d,#0d3d8d 72%,#1769ff);color:#fff;padding:calc(10px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 12px max(12px,env(safe-area-inset-left));box-shadow:0 14px 34px rgba(2,6,23,.28)}
      .ai-control-head{display:flex;align-items:flex-start;gap:10px}
      .ai-control-title{min-width:0;flex:1}
      .ai-control-title b{display:block;font-size:21px;font-weight:900;line-height:1.08}
      .ai-control-title span{display:block;margin-top:3px;font-size:12px;color:rgba(255,255,255,.78);font-weight:850;line-height:1.4}
      .ai-control-close{border:0;border-radius:16px;background:rgba(255,255,255,.14);color:#fff;width:46px;height:46px;font-size:24px;font-weight:900;flex:0 0 auto}
      .ai-control-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .ai-head-btn{border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;min-height:38px;padding:0 12px;font-size:12px;font-weight:900}
      .ai-head-btn.primary{background:#ffcc00;color:#06163d;border-color:#ffcc00}
      .ai-status-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .ai-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap}
      .ai-chip.light{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.15)}
      .ai-chip.safe{background:rgba(34,197,94,.14);color:#d1fae5;border:1px solid rgba(74,222,128,.24)}
      .ai-chip.warn{background:rgba(255,204,0,.16);color:#fff7d1;border:1px solid rgba(255,204,0,.22)}
      .ai-chip.danger{background:rgba(239,68,68,.18);color:#fee2e2;border:1px solid rgba(248,113,113,.25)}
      .ai-control-tabs{display:flex;gap:8px;overflow-x:auto;padding:10px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));background:#072050;scrollbar-width:none}
      .ai-control-tabs::-webkit-scrollbar{display:none}
      .ai-control-tab{flex:0 0 auto;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.10);color:#fff;min-height:42px;padding:0 14px;font-size:12.5px;font-weight:800;white-space:nowrap;cursor:pointer}
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
      .cc-metric b{display:block;margin-top:6px;color:#06163d;font-size:22px;font-weight:900;line-height:1.05}
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
      .mode-badge{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:900}
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
      .mode-option button{margin-top:10px;border:0;border-radius:999px;min-height:40px;padding:0 14px;background:#0d3d8d;color:#fff;font-weight:900;width:100%}
      .mode-option.active button{background:#ffcc00;color:#06163d}
      .cc-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
      .cc-list{display:flex;flex-direction:column;gap:10px}
      .cc-item{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid rgba(15,23,42,.08)}
      .cc-item:first-child{border-top:0;padding-top:0}
      .cc-item-main{flex:1;min-width:0}
      .cc-item-main b{display:block;color:#07152f;font-size:15px;line-height:1.2}
      .cc-item-main small{display:block;color:#64748b;font-size:12px;font-weight:800;line-height:1.45;margin-top:4px}
      .cc-lock{display:inline-flex;align-items:center;gap:4px;margin-left:6px;border-radius:999px;background:#e2e8f0;color:#334155;padding:2px 8px;font-size:10px;font-weight:900}
      .cc-switch{position:relative;width:56px;height:32px;flex:0 0 auto}
      .cc-switch input{position:absolute;opacity:0;inset:0}
      .cc-slider{position:absolute;inset:0;border-radius:999px;background:#cbd5e1;box-shadow:inset 0 0 0 1px rgba(15,23,42,.08)}
      .cc-slider:after{content:"";position:absolute;width:26px;height:26px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(2,6,23,.22);transition:.16s}
      .cc-switch input:checked + .cc-slider{background:#22c55e}
      .cc-switch input:checked + .cc-slider:after{transform:translateX(24px)}
      .cc-switch input:disabled + .cc-slider{opacity:.55;background:#94a3b8}
      .cc-actions{display:flex;gap:8px;flex-wrap:wrap}
      .cc-btn{border:1px solid rgba(21,88,214,.12);border-radius:999px;background:#f8fbff;color:#0d3d8d;min-height:44px;padding:0 16px;font-size:13px;font-weight:900}
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
      .policy-badge{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900;background:#e2e8f0;color:#334155}
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
      .thread-msg small{display:block;margin-bottom:3px;color:#64748b;font-size:10px;font-weight:900}
      .draft-result{border:1px solid rgba(34,197,94,.22);background:#f0fdf4;border-radius:18px;padding:12px;margin-top:10px}.draft-result b{display:block;color:#166534}.draft-result p{margin:8px 0 0;color:#14532d;font-weight:800;line-height:1.45;white-space:pre-wrap}
      .line-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
      .status-pill{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900}
      .status-pill.ready{background:#dcfce7;color:#166534}
      .status-pill.need{background:#fef3c7;color:#92400e}
      .status-pill.wait{background:#dbeafe;color:#1d4ed8}
      .status-pill.admin{background:#fee2e2;color:#991b1b}
      .status-pill.done{background:#e2e8f0;color:#334155}

      .training-banner{border-radius:22px;background:linear-gradient(135deg,#06163d,#0d3d8d 58%,#22c55e);color:#fff;padding:14px;box-shadow:0 16px 34px rgba(2,6,23,.14)}
      .training-banner h3{color:#fff!important}.training-banner .sub{color:rgba(255,255,255,.78)!important}
      .training-switch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
      @media(max-width:860px){.training-switch-grid{grid-template-columns:1fr}}
      .training-switch-card{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.12);border-radius:18px;padding:12px;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .training-switch-card b{display:block;font-size:13px}.training-switch-card small{display:block;margin-top:3px;color:rgba(255,255,255,.75);font-size:11px;font-weight:800;line-height:1.35}
      .training-layout{display:grid;grid-template-columns:minmax(230px,.9fr) minmax(0,1.25fr) minmax(260px,1fr);gap:12px;margin-top:12px}
      @media(max-width:1080px){.training-layout{grid-template-columns:1fr}}
      .training-queue{display:flex;flex-direction:column;gap:8px;max-height:620px;overflow:auto;padding-right:2px}
      .training-qcard{border:1px solid rgba(15,23,42,.08);border-radius:18px;background:#fff;padding:11px;text-align:left;box-shadow:0 7px 18px rgba(2,6,23,.05);cursor:pointer}
      .training-qcard.active{border-color:#ffcc00;background:linear-gradient(180deg,#fffceb,#fff)}
      .training-qcard b{display:block;color:#06163d;font-size:14px}.training-qcard small{display:block;margin-top:4px;color:#64748b;font-size:11px;font-weight:850}.training-qcard p{margin:7px 0 0;color:#334155;font-size:12px;font-weight:750;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .training-answer{border:1px solid rgba(21,88,214,.12);background:#f8fbff;border-radius:18px;padding:12px;margin-top:10px}
      .training-answer h4{margin:0;color:#06163d;font-size:15px}.training-answer p{white-space:pre-wrap;color:#334155;font-size:13px;font-weight:750;line-height:1.45;margin:8px 0 0}
      .training-score-list{display:flex;flex-direction:column;gap:10px;margin-top:12px}
      .training-score-row{border:1px solid rgba(15,23,42,.07);border-radius:16px;background:#fff;padding:10px}.training-score-row header{display:flex;align-items:center;justify-content:space-between;gap:8px}.training-score-row b{color:#06163d;font-size:13px}.training-score-row span{color:#64748b;font-size:12px;font-weight:900}
      .training-note{border-radius:16px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:12px;font-weight:850;line-height:1.45;padding:10px;margin-top:10px}
      .ai-control-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
      .ai-control-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;color:#64748b;font-weight:900}
      .ai-control-form input,.ai-control-form select,.ai-control-form textarea{width:100%;border:1px solid rgba(21,88,214,.16);border-radius:14px;padding:10px;color:#07152f;background:#fff}
      .ai-control-form textarea{min-height:92px;resize:vertical}
      .ai-control-form .wide{grid-column:1/-1}
      @media(max-width:680px){.ai-control-form{grid-template-columns:1fr}}
      .ai-empty{border-radius:18px;background:#fff;border:1px dashed rgba(21,88,214,.22);padding:18px;color:#64748b;font-weight:850;text-align:center}
      .ai-error{border-radius:18px;background:#fff7f7;border:1px solid rgba(239,68,68,.28);padding:12px;color:#7f1d1d;font-weight:900}

      /* ===== Phase 35B-5: Chat Mirror ===== */
      .tc5-wrap{display:flex;flex-direction:column;gap:12px}
      .tc5-controls{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 16px;background:linear-gradient(135deg,#06163d 0%,#0d3d8d 55%,#16a34a 100%);border-radius:20px;color:#fff}
      @media(max-width:860px){.tc5-controls{grid-template-columns:1fr}}
      .tc5-ctrl-card{border:1px solid rgba(255,255,255,.18);border-radius:16px;background:rgba(255,255,255,.10);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
      .tc5-ctrl-card b{display:block;font-size:13px;font-weight:850;color:#fff}
      .tc5-ctrl-card small{display:block;margin-top:2px;font-size:11px;font-weight:700;color:rgba(255,255,255,.72);line-height:1.35}
      .tc5-shell{display:grid;grid-template-columns:260px 1fr 296px;height:690px;border-radius:20px;overflow:hidden;border:1px solid rgba(6,199,85,.18);box-shadow:0 16px 48px rgba(6,199,85,.10);background:#f0fdf4}
      @media(max-width:1140px){.tc5-shell{grid-template-columns:220px 1fr 260px;height:640px}}
      @media(max-width:900px){.tc5-shell{grid-template-columns:200px 1fr 240px;height:600px}}

      /* LEFT sidebar */
      .tc5-left{display:flex;flex-direction:column;border-right:1px solid rgba(6,199,85,.15);background:#fff;overflow:hidden}
      .tc5-left-head{flex:0 0 auto;padding:11px 12px;background:rgba(6,199,85,.06);border-bottom:1px solid rgba(6,199,85,.12);display:flex;align-items:center;justify-content:space-between;gap:6px}
      .tc5-left-head b{font-size:12.5px;font-weight:900;color:#0f2419}
      .tc5-left-badge{display:inline-flex;padding:2px 8px;border-radius:999px;background:rgba(6,199,85,.15);color:#166534;font-size:10px;font-weight:900}
      .tc5-left-scroll{flex:1;overflow-y:auto;padding:6px;scrollbar-width:thin;scrollbar-color:rgba(6,199,85,.2) transparent}
      .tc5-cust-card{width:100%;text-align:left;padding:9px 11px;border-radius:13px;border:1px solid transparent;background:transparent;cursor:pointer;transition:all .12s;margin-bottom:3px}
      .tc5-cust-card:hover{background:rgba(6,199,85,.07);border-color:rgba(6,199,85,.15)}
      .tc5-cust-card.active{background:linear-gradient(180deg,rgba(6,199,85,.14),rgba(6,199,85,.07));border-color:rgba(6,199,85,.32);box-shadow:0 3px 10px rgba(6,199,85,.12)}
      .tc5-cust-name{display:block;font-size:13px;font-weight:850;color:#0f2419;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tc5-cust-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
      .tc5-cust-sit{display:inline-block;font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:999px;background:rgba(6,199,85,.12);color:#1a6e3a}
      .tc5-cust-preview{display:block;margin-top:4px;font-size:11px;font-weight:700;color:#64748b;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .tc5-cust-foot{display:flex;align-items:center;justify-content:space-between;margin-top:5px}
      .tc5-cust-time{font-size:9.5px;font-weight:700;color:#94a3b8}
      .tc5-status-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
      .tc5-status-dot.pending{background:#f59e0b}.tc5-status-dot.passed{background:#22c55e}.tc5-status-dot.failed{background:#dc2626}.tc5-status-dot.unknown{background:#8b5cf6}

      /* CENTER chat */
      .tc5-center{display:flex;flex-direction:column;overflow:hidden}
      .tc5-center-head{flex:0 0 auto;padding:11px 14px;background:#fff;border-bottom:1px solid rgba(6,199,85,.12);display:flex;align-items:center;gap:10px;min-height:52px}
      .tc5-chead-info{flex:1;min-width:0}
      .tc5-chead-name{font-size:14px;font-weight:900;color:#0f2419;line-height:1.2}
      .tc5-chead-sub{font-size:10.5px;font-weight:700;color:#64748b;margin-top:1px}
      .tc5-per-controls{display:flex;gap:5px;flex-wrap:wrap}
      .tc5-per-btn{display:inline-flex;align-items:center;gap:3px;padding:5px 10px;border-radius:999px;font-size:10.5px;font-weight:900;border:1px solid;cursor:pointer;background:#fff;transition:all .12s}
      .tc5-per-btn.on{border-color:rgba(22,163,74,.3);color:#166534;background:rgba(22,163,74,.08)}
      .tc5-per-btn.off{border-color:rgba(220,38,38,.28);color:#7f1d1d;background:rgba(220,38,38,.07)}
      .tc5-per-btn.inherit{border-color:rgba(100,116,139,.2);color:#475569;background:rgba(100,116,139,.06)}
      .tc5-center-scroll{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(180deg,#f0fdf4 0%,#f8fffe 100%);scrollbar-width:thin;scrollbar-color:rgba(6,199,85,.2) transparent}
      .tc5-center-foot{flex:0 0 auto;padding:10px 14px;background:#fff;border-top:1px solid rgba(6,199,85,.12);display:flex;align-items:center;gap:8px}
      .tc5-center-empty{display:grid;place-items:center;flex:1;min-height:300px;color:#94a3b8;font-size:13px;font-weight:800;text-align:center;padding:24px}
      .tc5-center-empty span{display:block;font-size:32px;margin-bottom:8px}

      /* Chat bubbles */
      .tc5-bubble-row{display:flex;align-items:flex-end;gap:8px;animation:tc5BubbleFade .2s ease}
      @keyframes tc5BubbleFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
      .tc5-bubble-row.customer{justify-content:flex-start}
      .tc5-bubble-row.ai-row{justify-content:flex-end}
      .tc5-avatar{width:30px;height:30px;border-radius:50%;flex:0 0 auto;display:grid;place-items:center;font-size:10px;font-weight:900;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.12)}
      .tc5-avatar.cust-av{background:linear-gradient(135deg,#06c755,#22c55e)}
      .tc5-avatar.ai-av{background:linear-gradient(135deg,#0d3d8d,#1769ff)}
      .tc5-bubble{max-width:75%;border-radius:18px;position:relative;word-break:break-word}
      .tc5-bubble.customer-bubble{background:#dcfce7;border:1px solid rgba(6,199,85,.22);border-bottom-left-radius:4px;padding:10px 14px;color:#0f2419}
      .tc5-bubble.ai-bubble{background:#fff;border:1px solid rgba(59,130,246,.2);border-bottom-right-radius:4px;padding:10px 14px;color:#0f2419;box-shadow:0 4px 16px rgba(59,130,246,.08)}
      .tc5-bubble-text{font-size:13.5px;font-weight:700;line-height:1.58;white-space:pre-wrap}
      .tc5-bubble-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px;padding-top:6px;border-top:1px solid rgba(15,23,42,.06)}
      .tc5-time{font-size:10px;font-weight:700;color:#94a3b8}
      .tc5-internal-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.24);color:#b45309;font-size:9.5px;font-weight:900}
      .tc5-conf-bar{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:900;border:1px solid}
      .tc5-conf-bar.high{background:rgba(22,163,74,.1);border-color:rgba(22,163,74,.2);color:#166534}
      .tc5-conf-bar.mid{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.2);color:#92400e}
      .tc5-conf-bar.low{background:rgba(220,38,38,.09);border-color:rgba(220,38,38,.15);color:#7f1d1d}
      .tc5-decision{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:9.5px;font-weight:900;border:1px solid}
      .tc5-decision.ready{background:rgba(22,163,74,.1);color:#166534;border-color:rgba(22,163,74,.2)}
      .tc5-decision.check{background:rgba(245,158,11,.1);color:#92400e;border-color:rgba(245,158,11,.2)}
      .tc5-decision.block{background:rgba(220,38,38,.09);color:#7f1d1d;border-color:rgba(220,38,38,.15)}
      .tc5-decision.unknown{background:rgba(124,58,237,.09);color:#6d28d9;border-color:rgba(124,58,237,.18)}
      .tc5-bubble-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;padding-top:7px;border-top:1px solid rgba(15,23,42,.06)}
      .tc5-act-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:900;border:1px solid;cursor:pointer;transition:all .12s;background:#fff;line-height:1}
      .tc5-act-btn:hover{transform:scale(1.03)}
      .tc5-act-btn:active{transform:scale(.96)}
      .tc5-act-btn.good{border-color:rgba(22,163,74,.32);color:#166534;background:rgba(22,163,74,.07)}
      .tc5-act-btn.bad{border-color:rgba(220,38,38,.28);color:#7f1d1d;background:rgba(220,38,38,.07)}
      .tc5-act-btn.teach{border-color:rgba(59,130,246,.28);color:#1d4ed8;background:rgba(59,130,246,.07)}
      .tc5-act-btn.pause{border-color:rgba(245,158,11,.28);color:#92400e;background:rgba(245,158,11,.07)}
      .tc5-act-btn.block-ai{border-color:rgba(220,38,38,.4);color:#991b1b;background:rgba(220,38,38,.1)}
      .tc5-act-btn.save-lesson{border-color:rgba(13,148,136,.28);color:#0f766e;background:rgba(13,148,136,.07)}
      .tc5-ai-unknown-box{border-radius:16px;background:linear-gradient(135deg,#faf5ff,#f5f3ff);border:1px solid rgba(124,58,237,.2);padding:12px 14px;margin-top:6px}
      .tc5-ai-unknown-title{font-size:12.5px;font-weight:900;color:#6d28d9;margin:0 0 6px}
      .tc5-teach-inline{background:#eff6ff;border:1px solid rgba(59,130,246,.2);border-radius:16px;padding:12px;margin-top:8px}
      .tc5-teach-inline h5{margin:0 0 8px;font-size:12px;font-weight:900;color:#1d4ed8}
      .tc5-teach-inline textarea{width:100%;border:1px solid rgba(59,130,246,.25);border-radius:12px;padding:9px;font:inherit;font-size:12.5px;min-height:80px;resize:vertical;color:#07152f;background:#fff;box-sizing:border-box}
      .tc5-teach-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}

      /* RIGHT panel */
      .tc5-right{display:flex;flex-direction:column;border-left:1px solid rgba(6,199,85,.15);background:#fff;overflow:hidden}
      .tc5-right-tabs{flex:0 0 auto;display:flex;border-bottom:1px solid rgba(6,199,85,.12);background:rgba(6,199,85,.04)}
      .tc5-right-tab{flex:1;padding:10px 4px;font-size:11.5px;font-weight:900;border:0;background:transparent;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;transition:all .12s}
      .tc5-right-tab.active{color:#16a34a;border-bottom-color:#16a34a;background:rgba(6,199,85,.07)}
      .tc5-right-scroll{flex:1;overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:rgba(6,199,85,.2) transparent}

      /* Skill bars */
      .tc5-skill-item{margin-bottom:10px;padding:9px 10px;border-radius:14px;background:#f8fffe;border:1px solid rgba(6,199,85,.1)}
      .tc5-skill-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px}
      .tc5-skill-label{font-size:12px;font-weight:900;color:#0f2419;line-height:1.25}
      .tc5-skill-pct{font-size:12px;font-weight:900}
      .tc5-skill-bar-bg{height:7px;background:#e2e8f0;border-radius:999px;overflow:hidden}
      .tc5-skill-bar-fill{height:100%;border-radius:999px;transition:width .6s ease}
      .tc5-skill-foot{display:flex;align-items:center;justify-content:space-between;margin-top:5px}
      .tc5-skill-ready{display:inline-flex;padding:2px 7px;border-radius:999px;font-size:9.5px;font-weight:900}
      .tc5-skill-ready.r4{background:rgba(22,163,74,.12);color:#166534;border:1px solid rgba(22,163,74,.15)}
      .tc5-skill-ready.r3{background:rgba(34,197,94,.08);color:#15803d;border:1px solid rgba(34,197,94,.15)}
      .tc5-skill-ready.r2{background:rgba(245,158,11,.1);color:#92400e;border:1px solid rgba(245,158,11,.18)}
      .tc5-skill-ready.r1{background:rgba(220,38,38,.08);color:#7f1d1d;border:1px solid rgba(220,38,38,.13)}
      .tc5-skill-sub{font-size:9.5px;font-weight:800;color:#94a3b8}
      .tc5-brain-note{border-radius:14px;background:linear-gradient(135deg,rgba(6,199,85,.07),rgba(13,148,136,.07));border:1px solid rgba(6,199,85,.15);padding:10px 12px;margin-top:10px;font-size:11.5px;font-weight:800;color:#0f766e;line-height:1.5}

      /* Teacher form in right panel */
      .tc5-teach-form{display:flex;flex-direction:column;gap:10px}
      .tc5-teach-form label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:900;color:#64748b}
      .tc5-teach-form input,.tc5-teach-form select,.tc5-teach-form textarea{border:1px solid rgba(21,88,214,.16);border-radius:12px;padding:9px 10px;font:inherit;font-size:12.5px;color:#07152f;background:#fff;width:100%;box-sizing:border-box}
      .tc5-teach-form textarea{min-height:90px;resize:vertical}
      .tc5-teach-form .tc5-teach-actions{display:flex;gap:6px;flex-wrap:wrap}
      .tc5-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(6,199,85,.1)}
      .tc5-section-title h4{margin:0;font-size:13px;font-weight:900;color:#0f2419}

      /* Safety banner */
      .tc5-safety-note{border-radius:14px;background:rgba(220,38,38,.06);border:1px solid rgba(220,38,38,.18);padding:9px 12px;font-size:11px;font-weight:900;color:#7f1d1d;line-height:1.45;display:flex;align-items:flex-start;gap:6px}

      /* Mobile step nav */
      .tc5-mobile-steps{display:none;gap:0;border-radius:14px;overflow:hidden;border:1px solid rgba(6,199,85,.18);margin-bottom:10px}
      .tc5-mobile-step-btn{flex:1;padding:10px 4px;font-size:11.5px;font-weight:900;border:0;background:#fff;color:#64748b;cursor:pointer;border-right:1px solid rgba(6,199,85,.12);transition:all .12s}
      .tc5-mobile-step-btn:last-child{border-right:0}
      .tc5-mobile-step-btn.active{background:rgba(6,199,85,.1);color:#16a34a}

      @media(max-width:800px){
        .tc5-mobile-steps{display:flex}
        .tc5-shell{display:block;height:auto}
        .tc5-left{border-right:0;border-bottom:1px solid rgba(6,199,85,.12);max-height:280px}
        .tc5-center{min-height:400px}
        .tc5-center-scroll{min-height:320px}
        .tc5-right{border-left:0;border-top:1px solid rgba(6,199,85,.12);max-height:400px}
      }
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
    else if (["line","training","approvals","decision","reply","advanced"].includes(paramTab)) STATE.activeTab = paramTab;
    else if (["dashboard","brain","overview"].includes(paramTab)) STATE.activeTab = "advanced";
    else if (paramTab === "switches") STATE.activeTab = "reply";
    var _ov = $("#aiControlOverlay"); if (_ov) _ov.classList.add("open");
    loadAll();
  }
  function closePanel(){ if (EMBEDDED) return; STATE.open = false; $("#aiControlOverlay")?.classList.remove("open"); }

  async function loadSettings(){
    const data = await api("/admin/ai-office/control/settings");
    STATE.settings = data.settings || [];
    STATE.values = data.values || {};
    STATE.trainingEnabled = !!getValue("auto_internal_training_enabled", STATE.trainingEnabled);
    STATE.trainingAutoAnswer = !!getValue("auto_internal_training_auto_answer", STATE.trainingAutoAnswer);
  }
  async function loadDrafts(){ try { const data = await api("/admin/ai-office/control/pending-drafts"); STATE.drafts = data.drafts || []; } catch(_) { STATE.drafts = []; } }
  async function loadApprovals(){
    if (_loadApprovalsBusy) return;  // guard: กัน parallel call จาก action handlers
    _loadApprovalsBusy = true;
    try { const data = await api("/admin/ai-office/control/approvals?status=open&limit=80"); STATE.approvals = data.approvals || []; } catch(_) { STATE.approvals = []; } finally { _loadApprovalsBusy = false; }
  }
  async function loadDecisionLogs(){ try { const data = await api("/admin/ai-office/control/reply-decision/logs?limit=40"); STATE.decisions = data.decisions || []; } catch(_) { STATE.decisions = []; } }
  async function loadAutoSafeLogs(){ try { const data = await api("/admin/ai-office/control/auto-safe/logs?limit=30"); STATE.autoSafeLogs = data.logs || []; } catch(_) { STATE.autoSafeLogs = []; } }
  async function loadAutoSafeQuality(){ try { const data = await api("/admin/ai-office/control/auto-safe/quality"); STATE.autoSafeQuality = data.quality || null; } catch(_) { STATE.autoSafeQuality = null; } }
  async function loadAutoSafePlaybooks(){ try { const data = await api("/admin/ai-office/control/auto-safe/playbooks?limit=120"); STATE.autoSafePlaybooks = data.playbooks || []; } catch(_) { STATE.autoSafePlaybooks = []; } }
  async function loadAutoSafeAnalytics(){ try { const data = await api("/admin/ai-office/control/auto-safe/playbook-analytics"); STATE.autoSafeAnalytics = data.analytics || null; } catch(_) { STATE.autoSafeAnalytics = null; } }
  async function loadAutoSafeDashboard(){ try { const data = await api("/admin/ai-office/control/auto-safe/dashboard"); STATE.autoSafeDashboard = data.dashboard || null; } catch(_) { STATE.autoSafeDashboard = null; } }
  async function loadExamples(){ try { const data = await api("/admin/ai-office/reply-examples?limit=100&active_only=false"); STATE.examples = data.examples || []; } catch(_) { STATE.examples = []; } }
  function normalizeAutoTrainingAnswer(a){
    if (!a) return null;
    const autoId = a.id || a.auto_answer_id;
    const convId = a.conversation_id || a.conversationId;
    if (!autoId || !convId) return null;
    return {
      id: `auto_${autoId}`,
      training_key: `auto:${autoId}`,
      conversation_id: convId,
      line_user_id: a.line_user_id || '',
      display_name: a.display_name || 'ลูกค้า LINE',
      picture_url: a.picture_url || '',
      line_message_id: a.line_message_id || (a.line_message_pk ? String(a.line_message_pk) : ''),
      line_message_pk: a.line_message_pk || null,
      customer_message: a.customer_message || '',
      last_message_text: a.customer_message || '',
      last_message_at: a.created_at || a.last_message_at || '',
      situation_type: a.situation_type || a.intent || inferTrainingSituation(a.customer_message || ''),
      latest_training_status: a.status || 'pending_review',
      auto_answer_id: autoId,
      auto_ai_reply: a.ai_reply || '',
      auto_confidence: a.confidence == null ? null : Number(a.confidence || 0),
      auto_status: a.status || null,
      auto_metadata: a.metadata || {},
      auto_created_at: a.created_at || null,
      training_conversation_mode: a.conversation_mode || 'inherit',
    };
  }
  async function loadTrainingQuestions(){
    try {
      const [autoData, questionData] = await Promise.all([
        api("/admin/ai-office/training-center/auto-answers?limit=120").catch(()=>({ answers:[] })),
        api("/admin/ai-office/training-center/questions?limit=80").catch(()=>({ questions:[] })),
      ]);
      const autoRows = (autoData.answers || []).map(normalizeAutoTrainingAnswer).filter(Boolean);
      const baseRows = (questionData.questions || questionData.conversations || []).map((q) => Object.assign({ training_key:`conv:${q.conversation_id || q.id}:${q.line_message_id || ''}` }, q));
      const seen = new Set(autoRows.map((q) => `${q.conversation_id}:${q.line_message_id || q.customer_message}`));
      STATE.trainingQuestions = autoRows.concat(baseRows.filter((q) => !seen.has(`${q.conversation_id || q.id}:${q.line_message_id || q.customer_message || q.last_message_text || ''}`)));
    } catch(_) { STATE.trainingQuestions = []; }
  }
  async function loadTrainingSkills(){ try { const data = await api("/admin/ai-office/training-center/skills"); STATE.trainingSkills = data.skills || []; STATE.trainingCounts = data.counts || {}; } catch(_) { STATE.trainingSkills = []; STATE.trainingCounts = {}; } }
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
    if (_loadAllBusy) return;        // guard: กัน concurrent call ซ้อนกัน
    _loadAllBusy = true;
    renderLoading();
    try {
      await loadSettings();
      if (["overview","reply"].includes(STATE.activeTab)) await Promise.all([loadHealth(), loadDrafts(), loadApprovals(), loadLineIntakes(), loadLineConversations(), loadDecisionLogs(), loadAutoSafeLogs(), loadAutoSafeQuality(), loadAutoSafePlaybooks(), loadAutoSafeDashboard()]);
      else if (STATE.activeTab === "dashboard") await Promise.all([loadHealth(), loadAutoSafeLogs(), loadAutoSafeQuality(), loadAutoSafePlaybooks(), loadAutoSafeAnalytics(), loadAutoSafeDashboard()]);
      else if (STATE.activeTab === "line") await Promise.all([loadLineIntakes(), loadLineConversations()]);
      else if (STATE.activeTab === "training") await Promise.all([loadTrainingQuestions(), loadLineConversations(), loadExamples(), loadTrainingSkills(), loadApprovals()]);
      else if (STATE.activeTab === "approvals") await loadApprovals();
      else if (STATE.activeTab === "decision") await loadDecisionLogs();
      else if (STATE.activeTab === "brain") await loadExamples();
      render();
    } catch (err) {
      renderError(err.message || "โหลดแผงควบคุมไม่ได้");
    } finally {
      _loadAllBusy = false;          // release เสมอ แม้เกิด error
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
      `<span class="ai-chip ${STATE.trainingEnabled ? "safe" : "warn"}">ศูนย์ฝึก ${STATE.trainingEnabled ? "เปิด" : "ปิด"}</span>`,
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
    else if (STATE.activeTab === "training") { body.innerHTML = renderTrainingCenter(); requestAnimationFrame(()=>{ const sc = document.getElementById('tc5ChatScroll'); if (sc) sc.scrollTop = sc.scrollHeight; }); }
    else if (STATE.activeTab === "approvals") body.innerHTML = renderApprovals();
    else if (STATE.activeTab === "decision") body.innerHTML = renderDecisionLab();
    else if (STATE.activeTab === "brain") body.innerHTML = renderBrain();
    else if (STATE.activeTab === "advanced") body.innerHTML = renderAdvanced();
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
          <button class="cc-btn" type="button" data-ai-tab-go="training">ศูนย์ฝึก AI</button>
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
      <small>${conversation.open_intake_count ? `งานรอ ${conversation.open_intake_count} · ` : ''}${conversation.pending_approval_count ? `อนุมัติ ${conversation.pending_approval_count} · ` : ''}${esc(conversation.last_message_at || conversation.customer_message_at || '')}</small>
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


  function loadTrainingPrefs(){
    try {
      STATE.trainingEnabled = localStorage.getItem('cwf_ai_training_enabled') === '1';
      STATE.trainingAutoAnswer = localStorage.getItem('cwf_ai_training_auto_answer') === '1';
    } catch(_) {
      STATE.trainingEnabled = false;
      STATE.trainingAutoAnswer = false;
    }
  }
  function saveTrainingPref(key, value){
    try { localStorage.setItem(key, value ? '1' : '0'); } catch(_) {}
  }
  function latestInboundText(){
    const inbound = [...(STATE.lineThread || [])].reverse().find(m => m.direction === 'inbound' && clean(m.message_text));
    return inbound?.message_text || STATE.selectedConversation?.last_message_text || '';
  }
  function inferTrainingSituation(text){
    const t = String(text || '').toLowerCase();
    if (/ราคา|เท่าไหร่|กี่บาท|โปร|promotion|price/.test(t)) return 'price_question';
    if (/คิว|ว่าง|นัด|จอง|พรุ่งนี้|วันนี้|เวลา/.test(t)) return 'appointment';
    if (/ไม่เย็น|น้ำหยด|รั่ว|เสียงดัง|กลิ่น|เสีย|ซ่อม|error|e\d|h\d|f\d/.test(t)) return 'repair_symptom';
    if (/แพง|ลด|ถูกกว่า|ส่วนลด/.test(t)) return 'expensive';
    if (/โวย|ร้องเรียน|ไม่พอใจ|เสียหาย|แย่|ช้า/.test(t)) return 'complaint';
    if (/[a-z]{4,}/i.test(text || '') && !/[ก-๙]/.test(text || '')) return 'foreign_customer';
    return 'general';
  }
  function trainingSituationLabel(key){
    return ({ general:'ทั่วไป', price_question:'ราคา / โปรโมชัน', appointment:'นัดหมาย / คิวช่าง', repair_symptom:'อาการเสียแอร์', expensive:'ต่อรองราคา / แพง', complaint:'รับมือคำโวยวาย', foreign_customer:'ภาษาอังกฤษ / ลูกค้าต่างชาติ', safety:'ความปลอดภัย / ไม่มั่ว', closing:'ปิดการขาย' })[key] || key || 'ทั่วไป';
  }
  function trainingDecisionForScore(score){
    if (score >= 85) return 'พร้อมตอบจริง';
    if (score >= 70) return 'เกือบพร้อม';
    if (score >= 45) return 'ต้องฝึกเพิ่ม';
    return 'ห้าม auto reply';
  }
  function examplesForSituation(key){
    return (STATE.examples || []).filter((ex) => String(ex.situation_type || 'general') === key || (String(ex.tags || '').includes(key)));
  }
  function skillForSituation(key){
    return (STATE.trainingSkills || []).find((s) => String(s.key || '') === String(key || '')) || null;
  }
  function scoreFromExamples(key){
    const skill = skillForSituation(key);
    if (skill && Number.isFinite(Number(skill.score))) return Number(skill.score);
    const n = examplesForSituation(key).length;
    if (!n) return 0;
    return Math.min(95, Math.round(28 + Math.sqrt(n) * 22));
  }
  /* ---- TC5 helpers ---- */
  function tc5DecisionClass(decision){
    if (!decision) return 'check';
    const s = String(decision).toLowerCase();
    if (/ส่งได้|ready|safe/.test(s)) return 'ready';
    if (/ห้ามส่ง|block|unsafe/.test(s)) return 'block';
    if (/ยังไม่รู้|unknown/.test(s)) return 'unknown';
    return 'check';
  }
  function tc5ConfClass(conf){ const n = Number(conf||0); return n >= 75 ? 'high' : n >= 50 ? 'mid' : 'low'; }
  function tc5FormatTime(ts){
    if (!ts) return '';
    try { const d = new Date(ts); return d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}); } catch(_){ return ''; }
  }
  function tc5SkillReadinessClass(readiness){
    if (!readiness) return 'r2';
    if (readiness === 'พร้อมตอบจริง') return 'r4';
    if (readiness === 'เกือบพร้อม') return 'r3';
    if (readiness === 'ต้องฝึกเพิ่ม') return 'r2';
    return 'r1';
  }
  function tc5SkillBarColor(score){
    if (score >= 80) return 'linear-gradient(90deg,#16a34a,#22c55e)';
    if (score >= 60) return 'linear-gradient(90deg,#0d3d8d,#22c55e)';
    if (score >= 40) return 'linear-gradient(90deg,#d97706,#f59e0b)';
    return 'linear-gradient(90deg,#dc2626,#f87171)';
  }

  function renderTC5Controls(){
    const autoReplyOn = getValue('auto_safe_reply_send_enabled', false);
    return `<div class="tc5-controls">
      <div class="tc5-ctrl-card">
        <div><b>Auto Training ภายใน</b><small>เปิดให้ระบบเตรียมคำตอบจาก LINE จริง ยังไม่ส่งลูกค้า</small></div>
        <label class="cc-switch"><input type="checkbox" data-training-toggle="enabled" ${STATE.trainingEnabled ? 'checked' : ''}><span class="cc-slider"></span></label>
      </div>
      <div class="tc5-ctrl-card">
        <div><b>Auto ตอบภายในเมื่อ LINE เข้า</b><small>AI ร่างคำตอบรอไว้โดยไม่ต้องกดเอง</small></div>
        <label class="cc-switch"><input type="checkbox" data-training-toggle="auto" ${STATE.trainingAutoAnswer ? 'checked' : ''} ${STATE.trainingEnabled ? '' : 'disabled'}><span class="cc-slider"></span></label>
      </div>
      <div class="tc5-ctrl-card">
        <div><b>AI Auto Reply จริง</b><small>แยกชัดจากโหมดฝึก — ศูนย์ฝึกไม่เคยส่ง LINE จริง</small></div>
        <span class="mode-badge ${autoReplyOn ? 'approval' : 'off'}" style="flex:0 0 auto">${autoReplyOn ? '🟢 เปิด' : '🔒 ปิด'}</span>
      </div>
    </div>`;
  }

  function renderTC5Left(mobileStep){
    const qs = STATE.trainingQuestions || [];
    const hide = mobileStep !== 1 ? 'style="display:none"' : '';
    return `<div class="tc5-left" ${hide}>
      <div class="tc5-left-head">
        <b>ลูกค้า LINE</b>
        <span class="tc5-left-badge">${qs.length} แชท</span>
      </div>
      <div class="tc5-left-scroll">
        ${qs.length ? qs.map(renderTC5CustomerCard).join('') : `<div class="ai-empty" style="margin:8px;padding:14px;font-size:12px">ยังไม่พบลูกค้า LINE<br><small>หรือยังไม่ได้เปิด Training</small></div>`}
      </div>
    </div>`;
  }

  function renderTC5CustomerCard(q){
    const convId = q.conversation_id || q.id;
    const trainingKey = q.training_key || `conv:${convId}:${q.line_message_id || ''}`;
    const active = STATE.selectedTrainingKey ? String(STATE.selectedTrainingKey) === String(trainingKey) : (STATE.selectedConversation && Number(STATE.selectedConversation.id) === Number(convId));
    const msg = q.customer_message || q.last_message_text || '';
    const sit = q.situation_type || inferTrainingSituation(msg);
    const status = q.latest_training_status || q.auto_status || 'new_customer_question';
    const hasAiReply = !!(q.auto_ai_reply);
    const dotClass = hasAiReply ? (status === 'passed' || status === 'approved' ? 'passed' : status === 'failed' || status === 'rejected' ? 'failed' : status === 'ai_unknown' ? 'unknown' : 'pending') : '';
    return `<button class="tc5-cust-card ${active ? 'active' : ''}" type="button"
      data-training-select-conv="${esc(convId)}"
      data-training-select-key="${esc(trainingKey)}"
      data-training-line-message-id="${esc(q.line_message_id || '')}"
      data-tc5-step-go="2">
      <span class="tc5-cust-name">${esc(q.display_name || 'ลูกค้า LINE')}</span>
      <div class="tc5-cust-tags">
        <span class="tc5-cust-sit">${esc(trainingSituationLabel(sit))}</span>
        ${hasAiReply ? `<span class="tc5-cust-sit" style="background:rgba(59,130,246,.1);color:#1d4ed8">AI รอตรวจ</span>` : ''}
      </div>
      <span class="tc5-cust-preview">${esc(msg || 'ยังไม่มีข้อความ')}</span>
      <div class="tc5-cust-foot">
        <span class="tc5-cust-time">${esc(tc5FormatTime(q.last_message_at || q.customer_message_at || ''))}</span>
        ${dotClass ? `<span class="tc5-status-dot ${dotClass}"></span>` : ''}
      </div>
    </button>`;
  }

  function renderTC5Center(selectedQ, selectedText, situation, autoAnswerId, convMode, mobileStep){
    const hide = mobileStep !== 2 ? 'style="display:none"' : '';
    if (!STATE.selectedConversation) {
      return `<div class="tc5-center" ${hide}>
        <div class="tc5-center-empty">
          <span>💬</span>
          เลือกลูกค้าจากซ้ายเพื่อดูแชทภายใน<br>
          <small style="display:block;margin-top:4px;font-size:11px;color:#94a3b8">AI ฝึกภายใน — ไม่ส่ง LINE จริง</small>
        </div>
      </div>`;
    }
    const conv = STATE.selectedConversation;
    const result = currentTrainingResult();
    const threadHtml = renderTC5ChatThread(selectedQ, result);
    const footBtns = STATE.trainingEnabled
      ? `<button class="cc-btn primary" type="button" data-tc5-ask-ai style="min-height:38px;font-size:12.5px;flex:1" ${STATE.trainingBusy ? 'disabled' : ''}>${STATE.trainingBusy ? '⏳ AI กำลังคิด...' : '🤖 ให้ AI ลองตอบ'}</button>`
      : `<span style="font-size:12px;font-weight:800;color:#94a3b8">เปิด Auto Training ด้านบนเพื่อให้ AI ลองตอบ</span>`;
    return `<div class="tc5-center" ${hide}>
      <div class="tc5-center-head">
        <div class="tc5-chead-info">
          <div class="tc5-chead-name">${esc(conv.display_name || 'ลูกค้า LINE')}</div>
          <div class="tc5-chead-sub">${esc(trainingSituationLabel(situation))} · ${result ? `AI ตอบแล้ว (${Number(result?.draft?.confidence || result?.confidence || 0)}%)` : 'รอ AI ตอบ'}</div>
        </div>
        <div class="tc5-per-controls">
          <button class="tc5-per-btn ${convMode === 'on' ? 'on' : 'inherit'}" type="button" data-training-conv-mode="on" title="เปิด AI สำหรับแชทนี้">▶</button>
          <button class="tc5-per-btn ${convMode === 'off' ? 'off' : 'inherit'}" type="button" data-training-conv-mode="off" title="พัก AI สำหรับแชทนี้">⏸</button>
          <button class="tc5-per-btn inherit" type="button" data-training-conv-mode="inherit" title="ตามค่า Global">≡</button>
        </div>
      </div>
      <div class="tc5-center-scroll" id="tc5ChatScroll">
        ${threadHtml}
      </div>
      <div class="tc5-center-foot">
        ${footBtns}
        <button class="cc-btn" type="button" data-ai-control-refresh style="min-height:38px;font-size:12px">รีเฟรช</button>
      </div>
      <form data-training-draft-form style="display:none">
        <input type="hidden" name="conversation_id" value="${esc(conv.id)}">
        <input type="hidden" name="line_message_id" value="${esc(selectedQ?.line_message_id || '')}">
        <input type="hidden" name="auto_answer_id" value="${esc(autoAnswerId)}">
        <input type="hidden" name="training_mode_enabled" value="${STATE.trainingEnabled ? 'true' : 'false'}">
        <input type="hidden" name="situation_type" value="${esc(situation)}">
        <input type="hidden" name="selected_customer_question" value="${esc(selectedText)}">
        <input type="hidden" name="admin_question" value="ศูนย์ฝึก AI: ลองตอบภายในเท่านั้น ห้ามส่ง LINE จริง ใช้ CWF Core Brain เป็นสมองกลาง ตอบแบบแอดมิน CWF สุภาพ ตรงประเด็น ถ้าไม่มั่นใจให้บอกข้อมูลที่ขาด">
      </form>
    </div>`;
  }

  function renderTC5ChatThread(selectedQ, result){
    const messages = STATE.lineThread || [];
    const bubbles = [];
    messages.forEach((m) => {
      if (!m.message_text && m.message_type !== 'image') return;
      bubbles.push(m.direction === 'inbound'
        ? renderTC5CustomerBubble(m)
        : renderTC5OutboundBubble(m)
      );
    });
    if (!messages.length && selectedQ) {
      const msg = selectedQ.customer_message || selectedQ.last_message_text || '';
      if (msg) bubbles.push(renderTC5CustomerBubble({ message_text: msg, received_at: selectedQ.last_message_at || '' }));
    }
    if (result) {
      bubbles.push(renderTC5AiBubble(result, selectedQ));
    } else if (selectedQ?.auto_ai_reply) {
      const syntheticResult = { answer: selectedQ.auto_ai_reply, confidence: selectedQ.auto_confidence, decision: selectedQ.auto_status === 'passed' ? 'ส่งได้' : selectedQ.auto_status === 'failed' ? 'ห้ามส่ง' : 'ต้องตรวจ', draft: { confidence: selectedQ.auto_confidence, decision: selectedQ.auto_status === 'passed' ? 'ส่งได้' : 'ต้องตรวจ', decision_reason: '' }, auto_answer_id: selectedQ.auto_answer_id };
      bubbles.push(renderTC5AiBubble(syntheticResult, selectedQ));
    }
    if (!bubbles.length) {
      return `<div class="ai-empty" style="margin:auto;max-width:260px;text-align:center;padding:24px 16px">
        <div style="font-size:28px;margin-bottom:8px">🤖</div>
        <div style="font-weight:900;font-size:12.5px;color:#64748b">ยังไม่มีข้อความในแชทนี้</div>
        <small style="font-size:11px;color:#94a3b8">กด "ให้ AI ลองตอบ" ด้านล่างเพื่อเริ่มฝึก</small>
      </div>`;
    }
    return bubbles.join('');
  }

  function renderTC5CustomerBubble(msg){
    const text = msg.message_text || '[ไฟล์/รูปภาพ]';
    return `<div class="tc5-bubble-row customer">
      <div class="tc5-avatar cust-av">👤</div>
      <div class="tc5-bubble customer-bubble">
        <div class="tc5-bubble-text">${esc(text)}</div>
        <div class="tc5-bubble-meta">
          <span class="tc5-time">${esc(tc5FormatTime(msg.received_at || msg.created_at || ''))}</span>
        </div>
      </div>
    </div>`;
  }

  function renderTC5OutboundBubble(msg){
    const text = msg.message_text || '[ข้อความ]';
    return `<div class="tc5-bubble-row ai-row">
      <div class="tc5-bubble ai-bubble" style="background:#f0f9ff;border-color:rgba(14,165,233,.2)">
        <div class="tc5-bubble-text" style="color:#0c4a6e">${esc(text)}</div>
        <div class="tc5-bubble-meta">
          <span class="tc5-time">${esc(tc5FormatTime(msg.received_at || msg.created_at || ''))}</span>
          <span style="font-size:9.5px;font-weight:800;color:#0369a1">แอดมิน/ระบบ</span>
        </div>
      </div>
      <div class="tc5-avatar ai-av">📤</div>
    </div>`;
  }

  function renderTC5AiBubble(result, selectedQ){
    if (!result) return '';
    const draft = result.draft || {};
    const answer = result.answer || draft.customer_reply || '';
    const confidence = Number(draft.confidence || result.confidence || 0);
    const decision = draft.decision || result.decision || 'ต้องตรวจ';
    const decisionReason = draft.decision_reason || '';
    const missingInfo = Array.isArray(draft.missing_info) ? draft.missing_info : [];
    const source = result.auto_answer_id ? 'Auto Training' : 'Manual Training';
    const confClass = tc5ConfClass(confidence);
    const decClass = tc5DecisionClass(decision);
    const isUnknown = /ยังไม่รู้|unknown/i.test(decision);
    const aiReplyId = result.training_event?.id || result.auto_answer_id || '';
    const teachOpen = STATE.tc5TeachOpen;
    return `<div class="tc5-bubble-row ai-row" data-ai-bubble-result>
      <div class="tc5-bubble ai-bubble" style="max-width:82%">
        <div class="tc5-bubble-meta" style="padding-top:0;border-top:0;margin-top:0;margin-bottom:7px">
          <span class="tc5-internal-badge">🤖 AI ฝึกภายใน — ยังไม่ส่งลูกค้าจริง</span>
          <span class="tc5-conf-bar ${confClass}">🎯 ${confidence}%</span>
          <span class="tc5-decision ${decClass}">${esc(decision)}</span>
          <span style="font-size:9.5px;font-weight:800;color:#94a3b8">${esc(source)}</span>
        </div>
        ${isUnknown ? `<div class="tc5-ai-unknown-box">
            <p class="tc5-ai-unknown-title">❓ AI ยังไม่รู้คำตอบนี้ ควรตอบลูกค้าว่าอย่างไร?</p>
            ${decisionReason ? `<p style="font-size:12px;font-weight:800;color:#7c3aed;margin:0 0 6px">${esc(decisionReason)}</p>` : ''}
          </div>`
          : `<div class="tc5-bubble-text">${esc(answer || 'AI ยังไม่มีคำตอบ')}</div>`
        }
        ${missingInfo.length ? `<div style="margin-top:6px;font-size:11.5px;font-weight:800;color:#92400e">⚠️ ข้อมูลที่ขาด: ${esc(missingInfo.join(', '))}</div>` : ''}
        ${decisionReason && !isUnknown ? `<div style="margin-top:5px;font-size:11px;font-weight:800;color:#64748b">เหตุผล: ${esc(decisionReason)}</div>` : ''}
        <div class="tc5-bubble-actions">
          <button class="tc5-act-btn good" type="button" data-training-mark-good title="ถูก — บันทึกเป็นตัวอย่างดีเข้าสมองกลาง" ${answer ? '' : 'disabled'}>✓ ถูก</button>
          <button class="tc5-act-btn bad" type="button" data-training-mark-bad title="ไม่ถูก — บันทึก feedback ลบ">✗ ไม่ถูก</button>
          <button class="tc5-act-btn teach" type="button" data-tc5-teach-open title="สอนคำตอบที่ถูกต้อง">📝 สอนคำตอบ</button>
          <button class="tc5-act-btn save-lesson" type="button" data-tc5-save-from-bubble title="บันทึกเป็นบทเรียนตรงนี้" ${answer ? '' : 'disabled'}>💾 บันทึกบทเรียน</button>
          <button class="tc5-act-btn block-ai" type="button" data-training-conv-mode="off" title="ห้าม AI ตอบเองในแชทนี้">⏸ พัก AI แชทนี้</button>
        </div>
        ${teachOpen ? renderTC5TeachInline(answer, selectedQ) : ''}
      </div>
      <div class="tc5-avatar ai-av">🤖</div>
    </div>`;
  }

  function renderTC5TeachInline(aiAnswer, selectedQ){
    const text = selectedQ?.customer_message || latestInboundText() || '';
    return `<div class="tc5-teach-inline" data-tc5-teach-inline-form>
      <h5>📝 สอนคำตอบที่ถูกต้อง — บันทึกเข้าสมองกลาง</h5>
      <textarea data-tc5-teach-reply placeholder="กรอกคำตอบที่ถูกต้องที่ควรใช้จริง...">${esc(aiAnswer)}</textarea>
      <div class="tc5-teach-actions">
        <button class="tc5-act-btn good" type="button" data-tc5-teach-save>💾 บันทึกเป็นบทเรียน</button>
        <button class="tc5-act-btn bad" type="button" data-tc5-teach-close>✕ ปิด</button>
      </div>
    </div>`;
  }

  function renderTC5Right(selectedText, situation, answer, autoAnswerId, mobileStep){
    const hide = mobileStep !== 3 ? 'style="display:none"' : '';
    const rightTab = STATE.tc5RightTab || 'skills';
    return `<div class="tc5-right" ${hide}>
      <div class="tc5-right-tabs">
        <button class="tc5-right-tab ${rightTab === 'skills' ? 'active' : ''}" type="button" data-tc5-right-tab="skills">📊 คะแนน AI</button>
        <button class="tc5-right-tab ${rightTab === 'teach' ? 'active' : ''}" type="button" data-tc5-right-tab="teach">📝 สอน AI</button>
      </div>
      <div class="tc5-right-scroll">
        ${rightTab === 'skills' ? renderTC5SkillBars() : renderTC5TeachForm(selectedText, situation, answer, autoAnswerId)}
      </div>
    </div>`;
  }

  function renderTC5SkillBars(){
    const skills = STATE.trainingSkills || [];
    if (!skills.length) return `<div class="ai-empty" style="font-size:12px;padding:20px">ยังไม่มีข้อมูล skill<br><small>โหลดหลังเลือกแชทแล้ว</small></div>`;
    const counts = STATE.trainingCounts || {};
    return `<div>
      <div class="tc5-section-title">
        <h4>ความพร้อม AI รายหมวด</h4>
        <span style="font-size:10px;font-weight:800;color:#94a3b8">${counts.examples || 0} บทเรียน</span>
      </div>
      ${skills.map((s) => {
        const score = Number(s.score || 0);
        const rClass = tc5SkillReadinessClass(s.readiness);
        return `<div class="tc5-skill-item">
          <div class="tc5-skill-head">
            <span class="tc5-skill-label">${esc(s.label)}</span>
            <span class="tc5-skill-pct" style="color:${score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626'}">${score}%</span>
          </div>
          <div class="tc5-skill-bar-bg"><div class="tc5-skill-bar-fill" style="width:${score}%;background:${tc5SkillBarColor(score)}"></div></div>
          <div class="tc5-skill-foot">
            <span class="tc5-skill-ready ${rClass}">${esc(s.readiness || 'ต้องฝึกเพิ่ม')}</span>
            <span class="tc5-skill-sub">${s.passed || 0}✓ ${s.failed || 0}✗ ${s.unknowns || 0}?</span>
          </div>
        </div>`;
      }).join('')}
      <div class="tc5-brain-note">🧠 บทเรียนทุกชิ้นกลับเข้าสมองกลางเดียว ทุก AI ในองค์กรจะฉลาดขึ้นร่วมกัน</div>
      <button class="cc-btn" type="button" data-ai-tab-go="brain" style="width:100%;margin-top:8px;font-size:12px">เปิดคลังบทเรียน →</button>
    </div>`;
  }

  function renderTC5TeachForm(selectedText, situation, answer, autoAnswerId){
    return `<div>
      <div class="tc5-section-title"><h4>สอนคำตอบที่ถูก</h4></div>
      <div class="tc5-safety-note">🔒 ทุกสิ่งที่สอนในหน้านี้ไม่ส่ง LINE จริง บันทึกเข้าสมองกลางเท่านั้น</div>
      <form class="tc5-teach-form" data-training-lesson-form style="margin-top:10px">
        <input type="hidden" name="situation_type" value="${esc(situation)}">
        <input type="hidden" name="auto_answer_id" value="${esc(autoAnswerId)}">
        <label>ข้อความลูกค้า
          <textarea name="customer_message" required rows="3">${esc(selectedText)}</textarea>
        </label>
        <label>หมวด
          <select name="situation_type_select">
            <option value="${esc(situation)}">${esc(trainingSituationLabel(situation))}</option>
            <option value="price_question">ราคา / โปรโมชัน</option>
            <option value="appointment">นัดหมาย / คิวช่าง</option>
            <option value="repair_symptom">อาการเสียแอร์</option>
            <option value="cleaning_package">แพ็กเกจล้างแอร์</option>
            <option value="complaint">รับมือคำโวยวาย</option>
            <option value="foreign_customer">ภาษาอังกฤษ / ลูกค้าต่างชาติ</option>
            <option value="closing">ปิดการขาย</option>
            <option value="safety">ความปลอดภัย</option>
            <option value="general">ทั่วไป</option>
          </select>
        </label>
        <label>ภาษา
          <select name="language">
            <option value="th">ไทย</option>
            <option value="en">English</option>
            <option value="unknown">ไม่ระบุ</option>
          </select>
        </label>
        <label>ควรตอบลูกค้าว่าอะไร
          <textarea name="final_admin_reply" required placeholder="ถ้า AI ยังไม่รู้ ให้กรอกคำตอบที่ถูกต้องตรงนี้">${esc(answer)}</textarea>
        </label>
        <label>แท็ก
          <input name="tags" value="ศูนย์ฝึก AI, training_center, core_brain, ${esc(situation)}">
        </label>
        <div class="tc5-teach-actions">
          <button class="cc-btn primary" type="submit" style="flex:1">💾 บันทึกเป็นบทเรียน</button>
          <button class="cc-btn" type="button" data-training-copy-ai ${answer ? '' : 'disabled'}>ใช้คำตอบ AI</button>
        </div>
        <button class="cc-btn soft-danger" type="button" data-training-unknown style="width:100%;margin-top:4px;font-size:12px">❓ AI ยังไม่รู้ — ให้ผู้สอนกรอก</button>
      </form>
    </div>`;
  }

  function renderTrainingScoreBars(){
    const rows = [
      ['price_question','ราคา / โปรโมชัน'], ['appointment','นัดหมาย / คิวช่าง'], ['repair_symptom','อาการเสียแอร์'], ['general','ทั่วไป / ถามข้อมูล'], ['complaint','รับมือคำโวยวาย'], ['foreign_customer','ภาษาอังกฤษ / ลูกค้าต่างชาติ'], ['closing','ปิดการขาย'], ['safety','ความปลอดภัย / ไม่มั่ว']
    ];
    return `<div class="training-score-list">${rows.map(([key,label]) => { const skill = skillForSituation(key); const score = scoreFromExamples(key); const examples = skill ? Number(skill.examples || 0) : examplesForSituation(key).length; const trained = skill ? Number(skill.training_total || 0) : 0; return `<div class="training-score-row"><header><b>${esc(label)}</b><span>${score}% · ${esc(skill?.readiness || trainingDecisionForScore(score))}</span></header><div class="dash-progress"><i style="width:${score}%"></i></div><small style="display:block;margin-top:6px;color:#64748b;font-weight:850">บทเรียน: ${examples} · เคสฝึก: ${trained}</small></div>`; }).join('')}</div>`;
  }
  function selectedTrainingQuestion(){
    const selectedId = Number(STATE.selectedConversation?.id || 0);
    if (!selectedId) return null;
    if (STATE.selectedTrainingKey) {
      const byKey = (STATE.trainingQuestions || []).find((q) => String(q.training_key || q.id || '') === String(STATE.selectedTrainingKey));
      if (byKey) return byKey;
    }
    return (STATE.trainingQuestions || []).find((q) => Number(q.conversation_id || q.id || 0) === selectedId) || null;
  }
  function autoTrainingResultFromQuestion(q){
    if (!q || (!q.auto_answer_id && !q.auto_ai_reply)) return null;
    const answer = q.auto_ai_reply || '';
    return {
      auto_answer_id: q.auto_answer_id || null,
      answer,
      confidence: Number(q.auto_confidence || 0) || 0,
      decision: q.auto_status || 'pending_review',
      draft: {
        customer_reply: answer,
        confidence: Number(q.auto_confidence || 0) || 0,
        decision: q.auto_status || 'pending_review',
        selected_customer_question: q.customer_message || q.last_message_text || '',
        situation_type: q.situation_type || inferTrainingSituation(q.customer_message || q.last_message_text || ''),
        metadata: q.auto_metadata || {},
      }
    };
  }
  function currentTrainingResult(){
    return STATE.trainingResult || autoTrainingResultFromQuestion(selectedTrainingQuestion()) || null;
  }
  function currentTrainingAnswer(){
    const result = currentTrainingResult();
    return result?.answer || result?.draft?.customer_reply || '';
  }
  function renderTrainingQueueCard(conversation){
    const msg = conversation.customer_message || conversation.last_message_text || '';
    const sit = conversation.situation_type || inferTrainingSituation(msg);
    const hasAuto = !!conversation.auto_answer_id || !!conversation.auto_ai_reply;
    const autoLabel = hasAuto ? `AI ร่างแล้ว ${Number(conversation.auto_confidence || 0) || 0}%` : 'รอ AI ร่าง';
    const mode = conversation.training_conversation_mode ? ` · รายคน: ${conversation.training_conversation_mode}` : '';
    const preview = hasAuto ? `<small style="display:block;margin-top:6px;color:#0f766e">${esc(autoLabel)}${esc(mode)}</small><p style="opacity:.85">${esc(String(conversation.auto_ai_reply || '').slice(0,160))}</p>` : `<small style="display:block;margin-top:6px;color:#64748b">${esc(autoLabel)}${esc(mode)}</small>`;
    const convId = conversation.conversation_id || conversation.id;
    const trainingKey = conversation.training_key || `conv:${convId}:${conversation.line_message_id || ''}`;
    const active = STATE.selectedTrainingKey ? String(STATE.selectedTrainingKey) === String(trainingKey) : (STATE.selectedConversation && Number(STATE.selectedConversation.id) === Number(convId));
    return `<button class="training-qcard ${active ? 'active' : ''}" type="button" data-training-select-conv="${esc(convId)}" data-training-select-key="${esc(trainingKey)}" data-training-line-message-id="${esc(conversation.line_message_id || '')}"><b>${esc(conversation.display_name || 'ลูกค้า LINE')}</b><small>${esc(trainingSituationLabel(sit))} · ${esc(conversation.last_message_at || conversation.customer_message_at || '')}</small><p>${esc(msg || 'ยังไม่มีข้อความล่าสุด')}</p>${preview}</button>`;
  }
  function renderTrainingResult(){
    const result = currentTrainingResult();
    if (!result) return `<div class="training-answer"><h4>AI ยังไม่ได้ร่างคำตอบในเคสนี้</h4><p>ถ้าเปิด Auto ตอบภายในไว้ ข้อความ LINE ใหม่จะมีคำตอบรอให้ตรวจทันที โดยไม่ส่งหาลูกค้าจริง</p></div>`;
    const draft = result.draft || {};
    const answer = result.answer || draft.customer_reply || '';
    const confidence = Number(draft.confidence || result.confidence || 0) || (draft.missing_info && draft.missing_info.length ? 58 : 72);
    const decision = draft.decision || result.decision || (confidence >= 70 ? 'pending_review' : 'needs_teacher');
    const source = result.auto_answer_id ? 'Auto Internal Training' : 'Manual Internal Training';
    return `<div class="training-answer"><h4>${esc(source)} · ${confidence}% · ${esc(decision)}</h4><p>${esc(answer || 'AI ยังไม่รู้คำตอบนี้')}</p>${draft.decision_reason ? `<p><strong>เหตุผล:</strong> ${esc(draft.decision_reason)}</p>` : ''}${draft.missing_info && draft.missing_info.length ? `<p><strong>ข้อมูลที่ยังขาด:</strong> ${esc(draft.missing_info.join(', '))}</p>` : ''}<div class="cc-actions" style="margin-top:10px"><button class="cc-btn primary" type="button" data-training-mark-good ${answer ? '' : 'disabled'}>ถูก / ให้จำเข้าคลังสมอง</button><button class="cc-btn" type="button" data-training-copy-ai ${answer ? '' : 'disabled'}>คัดลอกไปช่องผู้สอน</button><button class="cc-btn" type="button" data-copy-text="${esc(answer)}" ${answer ? '' : 'disabled'}>คัดลอกคำตอบ</button><button class="cc-btn soft-danger" type="button" data-training-mark-bad>ไม่ถูก / ให้ครูแก้</button></div></div>`;
  }
  function renderTrainingCenter(){
    const selectedQ = selectedTrainingQuestion();
    const selectedText = selectedQ?.customer_message || latestInboundText();
    const situation = selectedQ?.situation_type || inferTrainingSituation(selectedText);
    const answer = currentTrainingAnswer();
    const autoAnswerId = selectedQ?.auto_answer_id || currentTrainingResult()?.auto_answer_id || '';
    const convMode = selectedQ?.training_conversation_mode || 'inherit';
    const mobileStep = STATE.tc5MobileStep || 1;
    return `<div class="tc5-wrap">
      ${renderTC5Controls()}
      <div class="tc5-mobile-steps">
        <button class="tc5-mobile-step-btn ${mobileStep===1?'active':''}" type="button" data-tc5-step="1">1 เลือกลูกค้า</button>
        <button class="tc5-mobile-step-btn ${mobileStep===2?'active':''}" type="button" data-tc5-step="2">2 แชทภายใน</button>
        <button class="tc5-mobile-step-btn ${mobileStep===3?'active':''}" type="button" data-tc5-step="3">3 สอน AI</button>
      </div>
      <div class="tc5-shell">
        ${renderTC5Left(mobileStep)}
        ${renderTC5Center(selectedQ, selectedText, situation, autoAnswerId, convMode, mobileStep)}
        ${renderTC5Right(selectedText, situation, answer, autoAnswerId, mobileStep)}
      </div>
    </div>`;
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

  function renderBrain(){    return `<section class="cc-card"><h3>เพิ่ม/แก้คลังสมองคำตอบ</h3><p class="sub">ใช้แก้แนวคำตอบที่ไม่ชอบ หรือเพิ่มตัวอย่างคำตอบแอดมินจริงให้ AI จำ</p>${brainForm()}</section>
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
  function renderAdvanced(){
    return `<section class="cc-card">
      <h3>ฟีเจอร์ขั้นสูง</h3>
      <p class="cc-desc">เครื่องมือเสริมสำหรับผู้ดูแลระบบ — ไม่จำเป็นต้องใช้ทุกวัน</p>
      <div class="cc-actions" style="flex-direction:column;gap:10px;margin-top:14px">
        <button class="cc-btn" type="button" data-ai-tab-go="overview" style="justify-content:flex-start;gap:10px;padding:12px 16px;font-size:13.5px">
          📊 ภาพรวมระบบ AI Reply
        </button>
        <button class="cc-btn" type="button" data-ai-tab-go="dashboard" style="justify-content:flex-start;gap:10px;padding:12px 16px;font-size:13.5px">
          📈 แดชบอร์ดผลลัพธ์ Auto Safe
        </button>
        <button class="cc-btn" type="button" data-ai-tab-go="training" style="justify-content:flex-start;gap:10px;padding:12px 16px;font-size:13.5px">
          🎓 ศูนย์ฝึก AI
        </button>
        <button class="cc-btn" type="button" data-ai-tab-go="brain" style="justify-content:flex-start;gap:10px;padding:12px 16px;font-size:13.5px">
          🧠 คลังสมอง / Playbook
        </button>
      </div>
    </section>`;
  }
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


  async function draftTrainingFromForm(form){
    if (_trainingDraftBusy || STATE.trainingBusy) return;
    if (!STATE.trainingEnabled) return toast('ต้องเปิดโหมดฝึก AI ภายในก่อน', 'error');
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    if (!clean(payload.conversation_id) || !clean(payload.selected_customer_question)) return toast('กรุณาเลือกคำถามจริงจากลูกค้า', 'error');
    _trainingDraftBusy = true;
    STATE.trainingBusy = true;
    render();
    try {
      payload.training_mode_enabled = STATE.trainingEnabled ? true : false;
      const data = await api('/admin/ai-office/training-center/internal-answer', { method:'POST', body:JSON.stringify(payload) });
      STATE.trainingResult = data;
      STATE.trainingLastKey = `${payload.conversation_id}:${clean(payload.selected_customer_question).slice(0,120)}`;
      await loadTrainingSkills();
      render();
      toast('AI ลองตอบภายในแล้ว ยังไม่ส่ง LINE จริง', 'success');
    } finally {
      _trainingDraftBusy = false;
      STATE.trainingBusy = false;
      render();
    }
  }
  async function runTrainingFromCurrentQuestion(){
    const form = $('[data-training-draft-form]');
    if (!form) return toast('ยังไม่ได้เลือกคำถามจริง', 'error');
    return draftTrainingFromForm(form);
  }
  async function maybeAutoRunTraining(){
    if (!STATE.trainingEnabled || !STATE.trainingAutoAnswer || _trainingDraftBusy) return;
    const q = latestInboundText();
    const id = STATE.selectedConversation?.id || '';
    const key = `${id}:${clean(q).slice(0,120)}`;
    if (!id || !clean(q) || STATE.trainingLastKey === key) return;
    await runTrainingFromCurrentQuestion();
  }
  function copyTrainingAiToTeacher(){
    const answer = currentTrainingAnswer();
    const area = $('[data-training-lesson-form] textarea[name="final_admin_reply"]');
    if (area && answer) { area.value = answer; toast('ใส่คำตอบ AI ลงช่องผู้สอนแล้ว', 'success'); }
  }
  async function markTrainingGood(){
    const q = selectedTrainingQuestion();
    const result = currentTrainingResult();
    const answer = currentTrainingAnswer();
    if (!STATE.selectedConversation || !clean(answer)) return toast('ยังไม่มีคำตอบ AI ให้บันทึก', 'error');
    const payload = {
      verdict:'approved',
      final_admin_reply:answer,
      conversation_id:STATE.selectedConversation.id,
      customer_message:q?.customer_message || latestInboundText(),
      ai_reply:answer,
      situation_type:q?.situation_type || inferTrainingSituation(q?.customer_message || latestInboundText()),
      reason:'approved_from_training_center',
    };
    if (result?.auto_answer_id || q?.auto_answer_id) {
      await api(`/admin/ai-office/training-center/auto-answers/${encodeURIComponent(result?.auto_answer_id || q?.auto_answer_id)}/feedback`, { method:'POST', body:JSON.stringify(payload) });
    } else {
      await api('/admin/ai-office/training-center/feedback', { method:'POST', body:JSON.stringify(payload) });
    }
    await Promise.all([loadExamples(), loadTrainingSkills(), loadTrainingQuestions()]);
    STATE.trainingResult = null;
    render();
    toast('บันทึกว่าถูก และจำเข้าคลังสมองกลางแล้ว', 'success');
  }
  async function markTrainingBad(){
    const q = selectedTrainingQuestion();
    const result = currentTrainingResult();
    const answer = currentTrainingAnswer();
    const area = $('[data-training-lesson-form] textarea[name="final_admin_reply"]');
    if (area) area.value = answer ? `AI ตอบไว้ว่า:\n${answer}\n\nควรแก้เป็น:\n` : 'ควรตอบลูกค้าว่า: ';
    const payload = { verdict:'rejected', conversation_id:STATE.selectedConversation?.id || '', customer_message:q?.customer_message || latestInboundText(), ai_reply:answer, situation_type:q?.situation_type || inferTrainingSituation(q?.customer_message || latestInboundText()), reason:'marked_bad_from_training_center' };
    if (result?.auto_answer_id || q?.auto_answer_id) {
      await api(`/admin/ai-office/training-center/auto-answers/${encodeURIComponent(result?.auto_answer_id || q?.auto_answer_id)}/feedback`, { method:'POST', body:JSON.stringify(payload) }).catch(()=>{});
    } else if (STATE.selectedConversation) {
      await api('/admin/ai-office/training-center/feedback', { method:'POST', body:JSON.stringify(payload) }).catch(()=>{});
    }
    await Promise.all([loadTrainingSkills(), loadTrainingQuestions()]).catch(()=>{});
    render();
    toast('ทำเครื่องหมายว่า AI ต้องให้ครูแก้คำตอบ', 'info');
  }
  async function saveTrainingLesson(form){
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const q = selectedTrainingQuestion();
    payload.situation_type = payload.situation_type_select || payload.situation_type || inferTrainingSituation(payload.customer_message);
    delete payload.situation_type_select;
    payload.tags = clean(payload.tags || `ศูนย์ฝึก AI, training_center, core_brain, ${payload.situation_type}`);
    payload.conversation_id = STATE.selectedConversation?.id || payload.conversation_id || '';
    payload.line_message_id = q?.line_message_id || payload.line_message_id || '';
    payload.auto_answer_id = payload.auto_answer_id || q?.auto_answer_id || currentTrainingResult()?.auto_answer_id || '';
    payload.ai_reply = currentTrainingAnswer();
    payload.teacher_verdict = 'lesson_saved';
    if (!clean(payload.customer_message) || !clean(payload.final_admin_reply)) return toast('กรุณาใส่คำถามลูกค้าและคำตอบที่ถูกต้อง', 'error');
    await api('/admin/ai-office/training-center/lessons', { method:'POST', body:JSON.stringify(payload) });
    await Promise.all([loadExamples(), loadTrainingSkills(), loadTrainingQuestions()]);
    STATE.trainingResult = null;
    render();
    toast('บันทึกเป็นบทเรียนเข้าคลังสมองกลางแล้ว', 'success');
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

  function openInbox(){ const btn = $('#lineInboxBtn'); if (btn) { closePanel(); btn.click(); } else window.location.href = '/admin-ai-office.html'; }
  function openBookingReview(intakeId){ const suffix = intakeId ? `?ai_intake_id=${encodeURIComponent(intakeId)}` : ''; window.location.href = `/admin-review-v2.html${suffix}`; }
  function openAddFromIntake(id){ window.location.href = `/admin-add-v2.html?source=line_ai&ai_intake_id=${encodeURIComponent(id)}&t=${Date.now()}`; }

  async function updateTrainingToggle(kind, checked){
    if (kind === 'enabled') {
      STATE.trainingEnabled = !!checked;
      if (!STATE.trainingEnabled) STATE.trainingAutoAnswer = false;
      saveTrainingPref('cwf_ai_training_enabled', STATE.trainingEnabled);
      saveTrainingPref('cwf_ai_training_auto_answer', STATE.trainingAutoAnswer);
      await bulkUpdate([
        { key:'auto_internal_training_enabled', value:STATE.trainingEnabled },
        { key:'auto_internal_training_auto_answer', value:STATE.trainingAutoAnswer },
      ], 'training_toggle_from_control_center');
    } else if (kind === 'auto') {
      STATE.trainingAutoAnswer = !!checked;
      if (STATE.trainingAutoAnswer) STATE.trainingEnabled = true;
      saveTrainingPref('cwf_ai_training_enabled', STATE.trainingEnabled);
      saveTrainingPref('cwf_ai_training_auto_answer', STATE.trainingAutoAnswer);
      await bulkUpdate([
        { key:'auto_internal_training_enabled', value:STATE.trainingEnabled },
        { key:'auto_internal_training_auto_answer', value:STATE.trainingAutoAnswer },
      ], 'training_auto_answer_toggle_from_control_center');
      if (STATE.trainingAutoAnswer) await maybeAutoRunTraining().catch((err)=>toast(err.message,'error'));
    }
    toast('อัปเดตโหมดฝึก AI แล้ว', 'success');
  }
  async function setTrainingConversationMode(mode){
    if (!STATE.selectedConversation?.id) return toast('ยังไม่ได้เลือกแชท', 'error');
    await api(`/admin/ai-office/training-center/conversations/${encodeURIComponent(STATE.selectedConversation.id)}/settings`, { method:'POST', body:JSON.stringify({ mode, auto_internal_answer_enabled: mode === 'on' ? true : mode === 'off' ? false : null, reason:'set_from_training_center' }) });
    await loadTrainingQuestions();
    render();
    toast(mode === 'off' ? 'พัก AI สำหรับแชทนี้แล้ว' : mode === 'on' ? 'เปิด AI รายคนแล้ว' : 'ตั้งเป็นตามค่า Global แล้ว', 'success');
  }

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
    const tc5Step = e.target.closest('[data-tc5-step]');
    if (tc5Step) { STATE.tc5MobileStep = Number(tc5Step.dataset.tc5Step) || 1; render(); return; }
    const tc5RightTabBtn = e.target.closest('[data-tc5-right-tab]');
    if (tc5RightTabBtn) { STATE.tc5RightTab = tc5RightTabBtn.dataset.tc5RightTab || 'skills'; render(); return; }
    if (e.target.closest('[data-tc5-ask-ai]')) { const form = $('[data-training-draft-form]'); if (form) return draftTrainingFromForm(form).catch((err)=>toast(err.message,'error')); return; }
    if (e.target.closest('[data-tc5-teach-open]')) { STATE.tc5TeachOpen = !STATE.tc5TeachOpen; if (!STATE.tc5TeachOpen) { STATE.tc5RightTab = 'teach'; } render(); return; }
    if (e.target.closest('[data-tc5-teach-close]')) { STATE.tc5TeachOpen = false; render(); return; }
    if (e.target.closest('[data-tc5-teach-save]')) {
      const textarea = $('[data-tc5-teach-reply]');
      const teachReply = textarea?.value?.trim();
      if (!teachReply) return toast('กรุณากรอกคำตอบที่ถูกต้อง', 'error');
      const lessonForm = $('[data-training-lesson-form]');
      if (lessonForm) {
        const area = lessonForm.querySelector('textarea[name="final_admin_reply"]');
        if (area) area.value = teachReply;
        return saveTrainingLesson(lessonForm).then(()=>{ STATE.tc5TeachOpen = false; }).catch((err)=>toast(err.message,'error'));
      }
      return;
    }
    if (e.target.closest('[data-tc5-save-from-bubble]')) {
      const answer = currentTrainingAnswer();
      if (!answer) return toast('ยังไม่มีคำตอบ AI ให้บันทึก', 'error');
      const q = selectedTrainingQuestion();
      const situation = q?.situation_type || inferTrainingSituation(q?.customer_message || latestInboundText());
      const payload = {
        customer_message: q?.customer_message || latestInboundText(),
        final_admin_reply: answer,
        situation_type: situation,
        conversation_id: STATE.selectedConversation?.id || '',
        line_message_id: q?.line_message_id || '',
        auto_answer_id: q?.auto_answer_id || currentTrainingResult()?.auto_answer_id || '',
        ai_reply: answer,
        teacher_verdict: 'lesson_saved_from_bubble',
        tags: `ศูนย์ฝึก AI, training_center, core_brain, ${situation}`,
        language: 'th',
      };
      if (!payload.customer_message || !payload.final_admin_reply) return toast('ไม่มีข้อมูลเพียงพอ', 'error');
      return api('/admin/ai-office/training-center/lessons', { method:'POST', body:JSON.stringify(payload) })
        .then(()=>{ STATE.trainingResult = null; return Promise.all([loadExamples(), loadTrainingSkills(), loadTrainingQuestions()]); })
        .then(()=>{ render(); toast('บันทึกเป็นบทเรียนเข้าสมองกลางแล้ว', 'success'); })
        .catch((err)=>toast(err.message,'error'));
    }
    const trainingSelect = e.target.closest('[data-training-select-conv]');
    if (trainingSelect) {
      STATE.lineDraftResult = null; STATE.trainingResult = null; STATE.tc5TeachOpen = false;
      STATE.selectedTrainingKey = trainingSelect.dataset.trainingSelectKey || '';
      const stepGo = trainingSelect.dataset.tc5StepGo;
      if (stepGo) STATE.tc5MobileStep = Number(stepGo);
      return loadLineThread(trainingSelect.dataset.trainingSelectConv).then(()=>{ STATE.trainingResult = autoTrainingResultFromQuestion(selectedTrainingQuestion()); render(); return maybeAutoRunTraining(); }).catch((err)=>toast(err.message,'error'));
    }
    if (e.target.closest('[data-training-copy-ai]')) return copyTrainingAiToTeacher();
    if (e.target.closest('[data-training-mark-good]')) return markTrainingGood().catch((err)=>toast(err.message,'error'));
    if (e.target.closest('[data-training-mark-bad]')) return markTrainingBad().catch((err)=>toast(err.message,'error'));
    const trainingConvMode = e.target.closest('[data-training-conv-mode]');
    if (trainingConvMode) return setTrainingConversationMode(trainingConvMode.dataset.trainingConvMode).catch((err)=>toast(err.message,'error'));
    if (e.target.closest('[data-training-unknown]')) { const area = $('[data-training-lesson-form] textarea[name="final_admin_reply"]'); if (area) { area.value = 'AI ยังไม่รู้คำตอบนี้ ควรตอบลูกค้าว่า: '; area.focus(); } return toast('กรอกคำตอบจริงเพื่อสอน AI', 'info'); }
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
  function handleChange(e){
    const trainingToggle = e.target.closest('[data-training-toggle]');
    if (trainingToggle) {
      updateTrainingToggle(trainingToggle.dataset.trainingToggle, !!trainingToggle.checked).catch((err) => { toast(err.message, 'error'); loadAll(); });
      render();
      return;
    }
    const sw = e.target.closest('[data-ai-switch-key]'); if (!sw) return; updateSetting(sw.dataset.aiSwitchKey, !!sw.checked).catch((err) => { toast(err.message, 'error'); loadAll(); });
  }
  function handleSubmit(e){ const autoSafeForm = e.target.closest('[data-auto-safe-config-form]'); if (autoSafeForm) { e.preventDefault(); return saveAutoSafeConfig(autoSafeForm).catch((err) => toast(err.message, 'error')); } const trainingDraftForm = e.target.closest('[data-training-draft-form]'); if (trainingDraftForm) { e.preventDefault(); return draftTrainingFromForm(trainingDraftForm).catch((err) => toast(err.message, 'error')); } const trainingLessonForm = e.target.closest('[data-training-lesson-form]'); if (trainingLessonForm) { e.preventDefault(); return saveTrainingLesson(trainingLessonForm).catch((err) => toast(err.message, 'error')); } const lineDraftForm = e.target.closest('[data-line-draft-form]'); if (lineDraftForm) { e.preventDefault(); return draftFromLineForm(lineDraftForm).catch((err) => toast(err.message, 'error')); } const decisionForm = e.target.closest('[data-decision-form]'); if (decisionForm) { e.preventDefault(); return analyzeDecision(decisionForm).catch((err) => toast(err.message, 'error')); } const playbookForm = e.target.closest('[data-playbook-form]'); if (playbookForm) { e.preventDefault(); return savePlaybookForm(playbookForm).catch((err) => toast(err.message, 'error')); } const form = e.target.closest('[data-brain-form]'); if (!form) return; e.preventDefault(); saveBrainForm(form).catch((err) => toast(err.message, 'error')); }

  function init(){
    loadTrainingPrefs();
    ensureDom();
    const qs = new URLSearchParams(location.search);
    const panel = qs.get('panel');
    if (["dashboard","overview","brain"].includes(panel)) STATE.activeTab = 'advanced';
    else if (["approvals","approval"].includes(panel)) STATE.activeTab = 'approvals';
    else if (panel === 'drafts') STATE.activeTab = 'approvals';
    else if (panel === 'decision' || panel === 'reply-decision') STATE.activeTab = 'decision';
    else if (panel === 'line' || panel === 'line-ai') STATE.activeTab = 'line';
    else if (panel === 'training' || panel === 'ai-training') STATE.activeTab = 'training';
    else if (panel === 'reply' || panel === 'switches') STATE.activeTab = 'reply';
    if (EMBEDDED) { openPanel(STATE.activeTab); return; }
    if (["line-ai","dashboard","reply","line","training","ai-training","approvals","approval","drafts","decision","reply-decision","brain","switches","advanced"].includes(panel) || qs.get('ai_intake_id')) setTimeout(()=>openPanel(), 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
