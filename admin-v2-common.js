// Shared helpers for Admin v2 pages (no framework, safe for production)

// ============================================================
// Admin v2 Shell (Top Fixed Menu Bar + Drawer Menu + Debug in Menu + Auth Guard)
// - ใช้เมนูแบบเดียวกันทุกหน้า (รวมหน้าเพิ่มงาน)
// - Debug Panel อยู่ในเมนู (กันพลาดด้วยรหัส)
// ============================================================

function isAdminAddV2Page(){
  try{
    return (location.pathname || '').includes('admin-add-v2');
  }catch(e){ return false; }
}

function getAdminRoleHeader() {
  return { "x-user-role": "admin" };
}

function getToken() {
  // โปรเจคนี้เคยใช้ token หลายชื่อ เพื่อกัน regression ให้ลองทั้งคู่
  return (
    localStorage.getItem("admin_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

// Normalize role strings from DB/legacy UI to stable internal values
// (fixes login bounce when DB has "Super Admin"/"super admin" etc.)
function normalizeRole(role){
  const r = String(role || '').trim().toLowerCase();
  if (!r) return '';
  if (r === 'super_admin' || r === 'super-admin' || r === 'super admin' || r === 'superadmin') return 'super_admin';
  if (r === 'admin' || r === 'administrator') return 'admin';
  if (r === 'technician' || r === 'tech' || r === 'ช่าง') return 'technician';
  return r;
}

function clearCookie(name){
  try{
    const secure = (location.protocol === 'https:') ? '; Secure' : '';
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }catch(e){}
}

function clearAuthStorage(){
  try{
    const keys = [
      'admin_token','token',
      'username','role',
      'cwf_auth','cwf_debug','cwf_debug_unlocked','cwf_debug_unlock_until',
      // future keys (safe to remove if absent)
      'cwf_impersonate','cwf_impersonate_by','cwf_impersonate_since'
    ];
    keys.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  }catch(e){}
  clearCookie('cwf_auth');
}

function doLogout(){
  // Best effort: clear server cookie as well
  try{
    fetch('/api/logout', { method:'POST', headers:{'Content-Type':'application/json'} }).catch(()=>{});
  }catch(e){}
  clearAuthStorage();
  // prevent back to cached admin pages
  try{ sessionStorage.setItem('cwf_logged_out','1'); }catch(e){}
  try{ location.replace('/login.html'); }catch(e){ location.href = '/login.html'; }
}

async function apiFetch(url, options = {}) {
  const isForm = (typeof FormData !== 'undefined') && (options.body instanceof FormData);
  const headers = Object.assign(
    (isForm ? {} : { "Content-Type": "application/json" }),
    getAdminRoleHeader(),
    options.headers || {}
  );
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const dbg = window.__CWF_DBG || (window.__CWF_DBG = {});
  const wantDbg = (()=>{
    try{
      const ls = window.localStorage;
      const want = (ls.getItem('cwf_debug') === '1');
      const until = Number(ls.getItem('cwf_debug_unlock_until') || '0');
      const unlocked = (ls.getItem('cwf_debug_unlocked') === '1') && (until === 0 || Date.now() < until);
      return want && unlocked;
    }catch(e){ return false; }
  })();

  // Debug panel (avoid race condition between concurrent requests)
  // - ensure lastRes always corresponds to lastReq (same id)
  const __dbgId = (()=>{
    if (!wantDbg) return null;
    try {
      dbg.__seq = (Number(dbg.__seq || 0) + 1);
      return dbg.__seq;
    } catch(e) { return null; }
  })();

  if (wantDbg) {
    try {
      dbg.lastReq = {
        id: __dbgId,
        ts: new Date().toISOString(),
        url,
        method: (options.method || 'GET').toUpperCase(),
        headers: Object.assign({}, headers),
        body: options.body || null,
      };
    } catch(e) {}
  }

  const res = await fetch(url, Object.assign({}, options, {
    headers,
    credentials: 'include'
  }));
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data = null;
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }
  if (!res.ok) {
    const raw = typeof data === "string" ? data : "";
    const apiMsg = data && typeof data === "object" ? (data.error_th || data.message || data.error || data.code) : "";
    let msg = apiMsg || raw || "ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง";
    if (res.status === 502 || res.status === 503 || res.status === 504 || /<!doctype|<html|cloudflare|cf-error|cf-footer|bad gateway/i.test(raw)) {
      msg = "เซิร์ฟเวอร์ไม่พร้อมใช้งานชั่วคราว กรุณารอสักครู่แล้วลองใหม่";
    } else if (/NO_URGENT_OFFER_TARGETS/i.test(String(msg))) {
      msg = "ไม่พบช่างที่เปิดรับงานและอยู่ในพื้นที่นี้";
    } else if (/NO_SERVICE_ZONE_FOR_URGENT_OFFER/i.test(String(msg))) {
      msg = "ยังไม่พบพื้นที่บริการ กรุณาระบุย่าน/เขตให้ชัดเจน";
    } else if (/undefined|null|NaN|ReferenceError|column .* does not exist|relation .* does not exist/i.test(String(msg))) {
      msg = "ระบบขัดข้องชั่วคราว กรุณาแจ้งผู้ดูแลระบบ";
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (wantDbg) {
    try {
      // Only attach response if it belongs to the latest request.
      if (dbg.lastReq && dbg.lastReq.id === __dbgId) {
        dbg.lastRes = {
          id: __dbgId,
          ts: new Date().toISOString(),
          status: res.status,
          data,
        };
      }
    } catch(e) {}
  }
  return data;
}

function el(id) { return document.getElementById(id); }

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function pad2(x){ return String(x).padStart(2,'0'); }

function toLocalInputDatetime(isoOrDate) {
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  // YYYY-MM-DDTHH:mm
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function showToast(msg, type = "info") {
  const box = document.createElement("div");
  box.textContent = msg;
  box.style.position = "fixed";
  box.style.left = "12px";
  box.style.right = "12px";
  box.style.bottom = "90px";
  box.style.zIndex = "9999";
  box.style.padding = "12px";
  box.style.borderRadius = "14px";
  box.style.fontWeight = "700";
  box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.18)";
  box.style.background = type === "error" ? "#fecaca" : (type === "success" ? "#bbf7d0" : "#e2e8f0");
  box.style.color = "#0f172a";
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

// ----------------------
// UI Injection
// ----------------------
function injectAdminMenu(){
  if (document.getElementById('cwfTopNav')) return;
  try{ document.body.classList.add('cwf-admin-v2-shell'); }catch(_e){}

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --cwf-blue:#1558d6;
      --cwf-blue-dark:#081c4b;
      --cwf-yellow:#ffcc00;
      --cwf-ink:#09152f;
    }
    #cwfTopNav{position:fixed;left:0;right:0;top:0;z-index:2600;
      padding-top:env(safe-area-inset-top);
      background:
        radial-gradient(360px 130px at 88% -36px, rgba(255,204,0,.32), transparent 66%),
        radial-gradient(520px 170px at 12% -44px, rgba(59,130,246,.28), transparent 70%),
        linear-gradient(180deg, rgba(3,10,28,.99) 0%, rgba(7,25,66,.985) 50%, rgba(9,45,116,.98) 100%);
      backdrop-filter:blur(22px) saturate(1.18);
      -webkit-backdrop-filter:blur(22px) saturate(1.18);
      border-bottom:1px solid rgba(255,204,0,0.22);
      box-shadow:0 12px 32px rgba(2,6,23,0.34);} 
    #cwfTopNav:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,rgba(255,204,0,.72),rgba(71,139,255,.55),transparent);pointer-events:none}
    #cwfTopNav .in{max-width:1220px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;
      gap:12px;padding:8px 18px 9px;}
    #cwfTopNav .ttl{min-width:0;display:flex;flex-direction:column;gap:2px;padding-left:2px}
    #cwfTopNav .ttl b{font-size:16px;line-height:1.05;color:#fff;font-weight:1050;letter-spacing:.15px;text-shadow:0 8px 18px rgba(0,0,0,.28)}
    #cwfTopNav .ttl span{font-size:11px;font-weight:850;color:rgba(255,255,255,0.76);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #cwfTopNav .btns{display:flex;align-items:center;gap:8px}
    .cwf-icbtn{width:48px;height:48px;border-radius:20px;display:inline-flex;align-items:center;justify-content:center;
      border:1px solid rgba(255,255,255,0.22);background:linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08));
      box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 16px 34px rgba(0,0,0,0.24);cursor:pointer;user-select:none}
    .cwf-icbtn:active{transform: translateY(1px) scale(0.99)}
    .cwf-icbtn svg{width:22px;height:22px;fill:#ffffff}
    #cwfTopNavSpacer{height:62px}
    @media (max-width:420px){#cwfTopNavSpacer{height:60px}#cwfTopNav .in{padding:8px 16px 9px}.cwf-icbtn{width:46px;height:46px;border-radius:19px}}


    /* ===== CWF Admin v2 Shared Premium Visual Layer =====
       ใช้กับทุกหน้า Admin ที่โหลด admin-v2-common.js เท่านั้น
       ไม่แตะ logic / endpoint / form value */
    body.cwf-admin-v2-shell{
      min-height:100vh;
      background:
        radial-gradient(680px 320px at 50% -90px, rgba(58,135,255,.42), transparent 72%),
        linear-gradient(135deg, rgba(8,28,76,.96) 0 18%, rgba(14,72,175,.88) 18% 33%, #f4f8ff 33% 100%) !important;
      color:#08152f;
      text-rendering:optimizeLegibility;
    }
    body.cwf-admin-v2-shell:before{
      content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;
      background:
        linear-gradient(135deg, rgba(255,255,255,.055) 0 10px, transparent 10px 22px),
        radial-gradient(circle at 20% 8%, rgba(255,204,0,.12), transparent 20%),
        radial-gradient(circle at 92% 16%, rgba(59,130,246,.18), transparent 24%);
      background-size:32px 32px, auto, auto;
      opacity:.9;
    }
    body.cwf-admin-v2-shell .app,
    body.cwf-admin-v2-shell .wrap,
    body.cwf-admin-v2-shell .container,
    body.cwf-admin-v2-shell main{
      box-sizing:border-box;
    }
    body.cwf-admin-v2-shell .app,
    body.cwf-admin-v2-shell .wrap,
    body.cwf-admin-v2-shell .container{
      max-width:min(1120px, 100%);
    }
    body.cwf-admin-v2-shell .card,
    body.cwf-admin-v2-shell .panel,
    body.cwf-admin-v2-shell details,
    body.cwf-admin-v2-shell .box,
    body.cwf-admin-v2-shell .job-card,
    body.cwf-admin-v2-shell .tech-card,
    body.cwf-admin-v2-shell .summary-card{
      border-radius:24px;
      border:1px solid rgba(11,75,179,.12);
      box-shadow:0 18px 42px rgba(2,6,23,.10);
    }
    body.cwf-admin-v2-shell .card:not(.surfaceDark):not(.darkCard),
    body.cwf-admin-v2-shell details,
    body.cwf-admin-v2-shell .box{
      background:linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.96));
    }
    body.cwf-admin-v2-shell h1,
    body.cwf-admin-v2-shell h2,
    body.cwf-admin-v2-shell h3,
    body.cwf-admin-v2-shell .title{
      letter-spacing:-.02em;
    }
    body.cwf-admin-v2-shell button,
    body.cwf-admin-v2-shell .btn,
    body.cwf-admin-v2-shell .nav-btn,
    body.cwf-admin-v2-shell input,
    body.cwf-admin-v2-shell select,
    body.cwf-admin-v2-shell textarea{
      -webkit-tap-highlight-color:transparent;
    }
    body.cwf-admin-v2-shell input,
    body.cwf-admin-v2-shell select,
    body.cwf-admin-v2-shell textarea{
      border-radius:16px;
      border:1px solid rgba(11,75,179,.16);
      background:rgba(255,255,255,.96);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.8), 0 8px 20px rgba(2,6,23,.04);
    }
    body.cwf-admin-v2-shell .btn,
    body.cwf-admin-v2-shell button:not(.cwf-icbtn):not(.nav-btn):not(.pillbtn):not(.secondary){
      border-radius:16px;
      font-weight:1000;
    }
    body.cwf-admin-v2-shell .btn.blue,
    body.cwf-admin-v2-shell button.primary,
    body.cwf-admin-v2-shell .primary.btn{
      background:linear-gradient(135deg,#06245c,#1558d6 68%,#1e7bff) !important;
      color:#fff !important;
      border-color:rgba(255,255,255,.12) !important;
      box-shadow:0 16px 32px rgba(21,88,214,.24);
    }
    body.cwf-admin-v2-shell .btn.yellow,
    body.cwf-admin-v2-shell button.yellow,
    body.cwf-admin-v2-shell .warning.btn{
      background:linear-gradient(135deg,#ffe875,#ffcc00 70%,#f6b900) !important;
      color:#09152f !important;
      border-color:rgba(120,83,0,.16) !important;
      box-shadow:0 14px 28px rgba(255,204,0,.22);
    }
    body.cwf-admin-v2-shell .bottom-nav{
      left:10px !important;right:10px !important;bottom:10px !important;
      width:auto !important;max-width:720px;margin:0 auto;
      background:rgba(4,18,52,.88) !important;
      backdrop-filter:blur(18px) saturate(1.12);
      -webkit-backdrop-filter:blur(18px) saturate(1.12);
      border:1px solid rgba(255,255,255,.16) !important;
      border-radius:24px !important;
      box-shadow:0 20px 48px rgba(2,6,23,.30) !important;
      padding:8px !important;
      padding-bottom:calc(8px + env(safe-area-inset-bottom)) !important;
      gap:7px !important;
    }
    body.cwf-admin-v2-shell .nav-btn{
      min-height:44px !important;
      border-radius:18px !important;
      border:1px solid rgba(255,255,255,.13) !important;
      background:rgba(255,255,255,.08) !important;
      color:#fff !important;
      font-weight:1000 !important;
      font-size:12px !important;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
    }
    body.cwf-admin-v2-shell .nav-btn.active{
      background:linear-gradient(135deg,#ffe875,#ffcc00) !important;
      color:#08152f !important;
      border-color:rgba(255,255,255,.3) !important;
    }
    @media(max-width:520px){
      body.cwf-admin-v2-shell .app,
      body.cwf-admin-v2-shell .wrap,
      body.cwf-admin-v2-shell .container{padding-left:14px;padding-right:14px;}
      body.cwf-admin-v2-shell .bottom-nav{left:8px !important;right:8px !important;bottom:8px !important;border-radius:22px !important;}
      body.cwf-admin-v2-shell .nav-btn{font-size:11.5px !important;padding-left:6px !important;padding-right:6px !important;}
    }

        #cwfDrawerBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:2690;display:none}
    #cwfDrawer{position:fixed;inset:0;z-index:2700;
      display:none;padding:12px 12px calc(12px + env(safe-area-inset-bottom));
      overflow:auto;}
    #cwfDrawer .panel{max-width:560px;margin:0 auto;background:rgba(255,255,255,0.96);
      backdrop-filter: blur(16px);border:1px solid rgba(15,23,42,0.10);border-radius:24px;
      box-shadow:0 24px 70px rgba(0,0,0,0.22);overflow:hidden}
    #cwfDrawer .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px;
      border-bottom:1px solid rgba(15,23,42,0.08);background:#f8fbff}
    #cwfDrawer .h b{font-size:14px;color:var(--cwf-ink)}
    #cwfDrawer .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    .cwf-group{border:1px solid rgba(15,23,42,0.08);border-radius:18px;background:#fff;overflow:hidden}
    .cwf-group .t{padding:10px 12px;background:#f8fbff;font-weight:900;font-size:12px;color:var(--cwf-ink);
      border-bottom:1px solid rgba(15,23,42,0.06)}
    .cwf-group .i{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
    .cwf-link{display:flex;align-items:center;justify-content:space-between;gap:10px;
      border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:11px 12px;background:#fff;
      font-weight:900;color:var(--cwf-ink);cursor:pointer}
    .cwf-link small{font-weight:800;color:rgba(15,23,42,0.58)}
    .cwf-link.primary{background:linear-gradient(135deg, var(--cwf-blue-dark), var(--cwf-blue)); color:#fff; border-color: transparent}
    .cwf-link.warning{background:var(--cwf-yellow); color:#111827; border-color: transparent}
    .cwf-link.danger{background:#ef4444; color:#fff; border-color: transparent}

    #cwfDebugModalBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.62);z-index:2990;display:none}
    #cwfDebugModal{position:fixed;inset:0;z-index:3000;display:none;overflow:auto;
      padding:12px 12px calc(12px + env(safe-area-inset-bottom));}
    #cwfDebugModal .panel{max-width:980px;margin:0 auto;background:rgba(255,255,255,0.96);
      border:1px solid rgba(15,23,42,0.12);border-radius:22px;box-shadow:0 22px 70px rgba(0,0,0,0.24);overflow:hidden}
    #cwfDebugModal .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;
      background:#1558d6;color:#fff}
    #cwfDebugModal .h b{font-size:14px}
    #cwfDebugModal .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    #cwfDebugModal .row{display:flex;flex-wrap:wrap;gap:8px}
    #cwfDebugModal .pillbtn{border-radius:14px;border:1px solid rgba(15,23,42,0.12);padding:10px 12px;font-weight:900;cursor:pointer;background:#fff;color:#0b1b3a}
    #cwfDebugModal .pillbtn.yellow{background:var(--cwf-yellow);border-color:var(--cwf-yellow);color:#111827}
    #cwfDebugModal .pillbtn.blue{background:var(--cwf-blue);border-color:var(--cwf-blue);color:#fff}
    #cwfDebugModal pre{margin:0;border-radius:16px;border:1px solid rgba(15,23,42,0.10);background:#0b1020;color:#e5e7eb;
      padding:10px;overflow:auto;max-height:240px;font-size:12px;line-height:1.35}
  `;
  document.head.appendChild(css);

  const pageTitle = (()=>{
    const t = String(document.title || 'Admin').replace(/\s*-\s*CWF.*$/i,'').trim();
    return t || 'Admin';
  })();

  const nav = document.createElement('div');
  nav.id = 'cwfTopNav';
  nav.innerHTML = `
    <div class="in">
      <div class="ttl">
        <b>CWF Admin</b>
        <span>${pageTitle}</span>
      </div>
      <div class="btns">
        <div id="cwfMenuBtn" class="cwf-icbtn" title="เมนู" aria-label="เมนู">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z"/></svg>
        </div>
      </div>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  // Spacer to prevent the fixed bar from covering page content
  const sp = document.createElement('div');
  sp.id = 'cwfTopNavSpacer';
  document.body.insertBefore(sp, nav.nextSibling);

  const backdrop = document.createElement('div');
  backdrop.id = 'cwfDrawerBackdrop';
  document.body.appendChild(backdrop);

  const drawer = document.createElement('div');
  drawer.id = 'cwfDrawer';
  drawer.innerHTML = `
    <div class="panel">
      <div class="h">
        <div>
          <b>เมนู</b>
          <div class="muted" id="cwfWhoLine" style="margin-top:4px">—</div>
        </div>
        <button class="secondary btn-mini" type="button" id="cwfCloseMenu" style="width:auto">ปิด</button>
      </div>
      <div class="b">
        <div class="cwf-group">
          <div class="t">ศูนย์กลาง</div>
          <div class="i">
            <div class="cwf-link primary" data-href="/admin-dashboard-v2.html">📊 Dashboard <small>Admin</small></div>
            <div class="cwf-link" data-href="/admin-accounting-v2.html">📘 งานบัญชี <small>รายรับ/เอกสาร/รายจ่าย</small></div>
            <div class="cwf-link" data-href="/admin-deductions-v2.html">หักเงินและงานแก้ไข <small>Deduction/Rework</small></div>
            <div class="cwf-link" data-href="/admin-profile-v2.html">👤 Profile Admin <small>รูป + ชื่อ</small></div>
            <div class="cwf-link" data-href="/admin-technicians-v2.html">🧰 จัดการช่าง <small>ID/อนุมัติ</small></div>
            <div class="cwf-link" data-href="/admin-partner-onboarding.html">🤝 Partner Onboarding <small>สมัคร/เอกสาร</small></div>
            <div class="cwf-link" data-href="/admin-team-status.html">🧬 Team Status <small>Base Status</small></div>
            <div class="cwf-link" data-href="/admin-media-retention-v2.html">🖼️ ตัวจัดการรูปและพื้นที่จัดเก็บ <small>ล้างข้อมูลหนัก</small></div>
            <div class="cwf-link" id="cwfSuperAdminLink" data-href="/admin-super-v2.html" style="display:none">🛡️ Super Admin <small>จัดการทั้งหมด</small></div>
          </div>
        </div>

        <div class="cwf-group">
          <div class="t">หน้า Admin ทั้งหมด</div>
          <div class="i">
            <div class="cwf-link warning" data-href="/admin-add-v2.html">➕ เพิ่มงาน <small>Booking</small></div>
            <div class="cwf-link" data-href="/admin-queue-v2.html">🗓️ คิวช่าง <small>Queue</small></div>
            <div class="cwf-link" data-href="/admin-history-v2.html">🧾 ประวัติงาน <small>History</small></div>
            <div class="cwf-link" data-href="/admin-review-v2.html">✅ อนุมัติงาน/รีวิว <small>Approvals</small></div>
            <div class="cwf-link" data-href="/admin-promotions-v2.html">🏷️ โปรโมชั่น/ราคา <small>Promotions</small></div>
            <div class="cwf-link" data-href="/admin-job-view-v2.html">🔎 ดูงาน <small>Job View</small></div>
          </div>
        </div>

        <div class="cwf-group">
          <div class="t">ระบบ</div>
          <div class="i">
            <div class="cwf-link" id="cwfStopImpBtn" style="display:none" data-action="stop-impersonate">หยุดสวมสิทธิ <small>Stop</small></div>
            <div class="cwf-link" id="cwfDebugLink" data-action="debug">🐞 Debug Panel <small>ใส่รหัสก่อนเปิด</small></div>
            <div class="cwf-link danger" id="cwfLogoutBtn">ออกจากระบบ <small>Logout</small></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  // Debug modal overlay
  const dbgBackdrop = document.createElement('div');
  dbgBackdrop.id = 'cwfDebugModalBackdrop';
  document.body.appendChild(dbgBackdrop);

  const dbgModal = document.createElement('div');
  dbgModal.id = 'cwfDebugModal';
  dbgModal.innerHTML = `
    <div class="panel">
      <div class="h">
        <b>🐞 Debug Panel</b>
        <button class="pillbtn yellow" type="button" id="cwfDbgClose">ปิด</button>
      </div>
      <div class="b">
        <div class="row">
          <button class="pillbtn blue" type="button" id="cwfDbgCopyAll">คัดลอกทั้งหมด</button>
          <button class="pillbtn" type="button" id="cwfDbgClear">ล้าง</button>
          <button class="pillbtn" type="button" id="cwfDbgRefresh">รีเฟรช</button>
          <button class="pillbtn" type="button" id="cwfDbgResetJobs">Reset Jobs (เทส)</button>
        </div>
        <div class="muted" id="cwfDbgHint">—</div>
        <div>
          <div style="font-weight:1000;color:#0b1b3a;margin:4px 0">Last Request</div>
          <pre id="cwfDbgReq">—</pre>
        </div>
        <div>
          <div style="font-weight:1000;color:#0b1b3a;margin:4px 0">Last Response</div>
          <pre id="cwfDbgRes">—</pre>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(dbgModal);

  const isDebugUnlocked = ()=>{
    try{
      const until = Number(localStorage.getItem('cwf_debug_unlock_until') || '0');
      const unlocked = (localStorage.getItem('cwf_debug_unlocked') === '1');
      return unlocked && (until === 0 || Date.now() < until);
    }catch(e){ return false; }
  };

  const ensureDebugUnlocked = ()=>{
    if (isDebugUnlocked()) return true;
    const pin = (prompt('ใส่รหัสเพื่อเปิด Debug Panel')||'').trim();
    if (pin !== '1549') return false;
    try{
      localStorage.setItem('cwf_debug','1');
      localStorage.setItem('cwf_debug_unlocked','1');
      localStorage.setItem('cwf_debug_unlock_until', String(Date.now() + 8*60*60*1000));
    }catch(_){ }
    return true;
  };

  const renderDebug = ()=>{
    const dbg = window.__CWF_DBG || {};
    const req = document.getElementById('cwfDbgReq');
    const res = document.getElementById('cwfDbgRes');
    const hint = document.getElementById('cwfDbgHint');
    if (hint) hint.textContent = `อัปเดต: ${new Date().toLocaleString('th-TH')} • Debug ${isDebugUnlocked() ? 'ON' : 'OFF'}`;
    if (req) req.textContent = dbg.lastReq ? JSON.stringify(dbg.lastReq, null, 2) : '—';
    if (res) res.textContent = dbg.lastRes ? JSON.stringify(dbg.lastRes, null, 2) : '—';
  };

  const openDebugModal = ()=>{
    if (!ensureDebugUnlocked()) { showToast('รหัสไม่ถูกต้อง','error'); return; }
    dbgBackdrop.style.display = 'block';
    dbgModal.style.display = 'block';
    renderDebug();
  };

  const closeDebugModal = ()=>{
    dbgBackdrop.style.display = 'none';
    dbgModal.style.display = 'none';
  };

  // bind debug modal actions
  document.getElementById('cwfDbgClose').addEventListener('click', closeDebugModal);
  dbgBackdrop.addEventListener('click', closeDebugModal);
  document.getElementById('cwfDbgRefresh').addEventListener('click', renderDebug);
  document.getElementById('cwfDbgClear').addEventListener('click', ()=>{
    const dbg = window.__CWF_DBG || (window.__CWF_DBG = {});
    dbg.lastReq = null; dbg.lastRes = null;
    renderDebug();
  });
  document.getElementById('cwfDbgCopyAll').addEventListener('click', async ()=>{
    try{
      const dbg = window.__CWF_DBG || {};
      const payload = { ts: new Date().toISOString(), lastReq: dbg.lastReq||null, lastRes: dbg.lastRes||null };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      showToast('คัดลอกแล้ว','success');
    }catch(e){ showToast('คัดลอกไม่สำเร็จ','error'); }
  });
  document.getElementById('cwfDbgResetJobs').addEventListener('click', async ()=>{
    try{
      const ok = confirm('ลบงานทดสอบทั้งหมด? (ใช้กับงานเทสเท่านั้น)');
      if(!ok) return;
      const pin = (prompt('พิมพ์ 1549 เพื่อยืนยัน')||'').trim();
      if (pin !== '1549') return showToast('ยกเลิก','error');
      const r = await apiFetch('/admin/reset_jobs_v2', { method:'POST', body: JSON.stringify({ confirm:true }) });
      if(r && r.ok) showToast('ล้างงานเรียบร้อย','success');
      else showToast('ล้างงานไม่สำเร็จ','error');
    }catch(e){ showToast('ล้างงานไม่สำเร็จ','error'); }
  });

  const open = ()=>{ backdrop.style.display='block'; drawer.style.display='block'; };
  const close = ()=>{ backdrop.style.display='none'; drawer.style.display='none'; };

  document.getElementById('cwfMenuBtn').addEventListener('click', open);
  document.getElementById('cwfCloseMenu').addEventListener('click', close);
  backdrop.addEventListener('click', close);

  drawer.addEventListener('click', (e)=>{
    const t = e.target.closest('.cwf-link');
    if(!t) return;
    if(t.id === 'cwfDebugLink' || t.getAttribute('data-action')==='debug'){
      e.preventDefault();
      close();
      openDebugModal();
      return;
    }
    if(t.id === 'cwfLogoutBtn'){ close(); doLogout(); return; }
    if(t.id === 'cwfStopImpBtn' || t.getAttribute('data-action')==='stop-impersonate'){
      close();
      (async()=>{
        try{
          await fetch('/admin/super/impersonate/stop', { method:'POST', credentials:'include' });
          const d = window.__CWF_AUTH_ME;
          const a = (d && d.actor) ? d.actor : { username: localStorage.getItem('username'), role: localStorage.getItem('role') };
          try{
            if (a && a.username) localStorage.setItem('username', String(a.username));
            if (a && a.role) localStorage.setItem('role', normalizeRole(a.role));
            ['cwf_impersonate','cwf_impersonate_by','cwf_impersonate_since'].forEach(k=>localStorage.removeItem(k));
          }catch(e){}
          try{ location.replace('/admin-super-v2.html'); }catch(e){ location.href = '/admin-super-v2.html'; }
        }catch(e){ showToast('หยุดสวมสิทธิไม่สำเร็จ','error'); }
      })();
      return;
    }
    const href = t.getAttribute('data-href');
    if(href){ close(); location.href = href; }
  });

  (async function syncAuthMe(){
    try{
      const r = await fetch('/api/auth/me', { credentials:'include' });
      if(!r.ok) throw new Error('unauth');
      const d = await r.json().catch(()=>null);
      if(!d || !d.ok) throw new Error('unauth');
      window.__CWF_AUTH_ME = d;

      const who = document.getElementById('cwfWhoLine');
      if (who) {
        const actorRoleLabel = (d.actor && d.actor.is_super_admin) ? 'Super Admin' : (d.actor ? normalizeRole(d.actor.role) : normalizeRole(d.role));
        const actorLabel = d.actor ? `${d.actor.username} (${actorRoleLabel})` : `${d.username} (${normalizeRole(d.role)})`;
        who.textContent = d.impersonating ? `กำลังสวมสิทธิ: ${d.username} (${normalizeRole(d.role)}) • โดย ${actorLabel}` : `ผู้ใช้: ${actorLabel}`;
      }

      const superL = document.getElementById('cwfSuperAdminLink');
      if (superL) {
        const isSuper = !!(d.actor && d.actor.is_super_admin) || !!d.is_super_admin;
        superL.style.display = isSuper ? 'flex' : 'none';
      }

      const stopBtn = document.getElementById('cwfStopImpBtn');
      if (stopBtn) stopBtn.style.display = d.impersonating ? 'flex' : 'none';

      const dbgL = document.getElementById('cwfDebugLink');
      if (dbgL) dbgL.style.display = 'flex';
    }catch(_){ }
  })();
}


function basicAdminGuard(){
  const hardRedirect = ()=>{
    try{ location.replace('/login.html'); }catch(e){ location.href = '/login.html'; }
  };

  try{
    if (sessionStorage.getItem('cwf_logged_out') === '1') { hardRedirect(); return; }
  }catch(_){ }

  // Server-side check to prevent back-navigation into protected pages
  const serverCheck = async ()=>{
    // prevent concurrent checks causing "logout bounce" (race)
    if (window.__CWF_GUARD_INFLIGHT) return window.__CWF_GUARD_INFLIGHT;

    const run = async ()=>{
    try{
      const res = await fetch('/api/auth/me', { credentials:'include' });
      // Only hard logout on auth errors.
      // If it's a transient/network/5xx, don't force logout (prevents login/admin flicker).
      if (!res.ok) {
        const st = res.status || 0;
        if (st === 401 || st === 403) throw Object.assign(new Error('UNAUTHORIZED'), { __auth: true, status: st });
        throw Object.assign(new Error('SERVER_ERROR'), { __transient: true, status: st });
      }
      const data = await res.json().catch(()=>null);
      if (!data || !data.ok) throw new Error('UNAUTHORIZED');
      const roleN = normalizeRole(data.role);
      if (roleN !== 'admin' && roleN !== 'super_admin') throw Object.assign(new Error('FORBIDDEN'), { __auth: true, status: 403 });
      // keep localStorage in sync with DB (prevents login bounce)
      try{
        if (data.username) localStorage.setItem('username', String(data.username));
        if (data.role) localStorage.setItem('role', roleN);
      }catch(e){}
      return true;
    }catch(e){
      // Only logout on real auth problems (401/403 or forbidden)
      if (e && (e.__auth || e.status === 401 || e.status === 403 || String(e.message||'').includes('UNAUTHORIZED') || String(e.message||'').includes('FORBIDDEN'))) {
        doLogout();
        return false;
      }
      // transient: keep user on page, and re-check later
      try {
        if (Date.now() - Number(window.__CWF_GUARD_LAST_TOAST||0) > 15000) {
          window.__CWF_GUARD_LAST_TOAST = Date.now();
          showToast('เชื่อมต่อช้า/หลุดชั่วคราว กำลังลองใหม่…', 'info');
        }
      } catch(_e) {}
      return true;
    }
    };

    window.__CWF_GUARD_INFLIGHT = run().finally(()=>{ window.__CWF_GUARD_INFLIGHT = null; });
    return window.__CWF_GUARD_INFLIGHT;
  };

  // run once on load (async)
  serverCheck();

  // bfcache / back-button: re-check when page is shown again
  window.addEventListener('pageshow', ()=>{ serverCheck(); });
  // re-check when tab becomes visible again
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible') serverCheck();
  });
}

// Auto-init on Admin v2 pages
try{
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>{
      basicAdminGuard();
      injectAdminMenu();
    });
  } else {
    basicAdminGuard();
    injectAdminMenu();
  }
}catch(e){}
