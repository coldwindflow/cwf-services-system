// Shared helpers for Admin v2 pages (no framework, safe for production)

// ============================================================
// Admin v2 Shell (Menu Icon + Floating Debug + Basic Auth Guard)
// - DO NOT affect admin-add-v2 page (it has its own header/debug)
// - Keep UI consistent with "เพิ่มงาน" (premium, clean)
// - Phase 1 scope: UI only (Menu + Debug). Logout will be fully hardened in Phase 2.
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
  clearAuthStorage();
  try{ location.replace('/login.html'); }catch(e){ location.href = '/login.html'; }
}

async function apiFetch(url, options = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json" },
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

  if (wantDbg) {
    try {
      dbg.lastReq = {
        ts: new Date().toISOString(),
        url,
        method: (options.method || 'GET').toUpperCase(),
        headers: Object.assign({}, headers),
        body: options.body || null,
      };
    } catch(e) {}
  }

  const res = await fetch(url, Object.assign({}, options, { headers }));
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let data = null;
  if (ct.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : "Request failed");
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (wantDbg) {
    try {
      dbg.lastRes = {
        ts: new Date().toISOString(),
        status: res.status,
        data,
      };
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
  if (isAdminAddV2Page()) return;
  if (document.getElementById('cwfMenuBtn')) return;

  const style = document.createElement('style');
  style.textContent = `
    .cwf-fab{position:fixed;top:12px;right:12px;z-index:2500;display:flex;gap:8px;align-items:center}
    .cwf-iconbtn{width:46px;height:46px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
      border:1px solid rgba(15,23,42,0.14);background:rgba(255,255,255,0.72);backdrop-filter: blur(10px);
      box-shadow: 0 12px 34px rgba(0,0,0,0.14);cursor:pointer;user-select:none}
    .cwf-iconbtn:active{transform: translateY(1px) scale(0.99)}
    .cwf-iconbtn svg{width:22px;height:22px;fill:#0f172a}

    .cwf-drawer-backdrop{position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:2499;display:none}
    .cwf-drawer{position:fixed;top:12px;right:12px;left:12px;z-index:2600;display:none;
      max-width:520px;margin-left:auto;background:rgba(255,255,255,0.92);backdrop-filter: blur(14px);
      border:1px solid rgba(15,23,42,0.12);border-radius:20px;box-shadow: 0 22px 70px rgba(0,0,0,0.22);
      overflow:hidden}
    .cwf-drawer .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px;
      border-bottom:1px solid rgba(15,23,42,0.10);background:#f8fafc}
    .cwf-drawer .h b{font-size:14px}
    .cwf-drawer .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    .cwf-group{border:1px solid rgba(15,23,42,0.10);border-radius:18px;background:#fff;overflow:hidden}
    .cwf-group .t{padding:10px 12px;background:#f8fafc;font-weight:900;font-size:12px;color:#0f172a;
      border-bottom:1px solid rgba(15,23,42,0.08)}
    .cwf-group .i{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
    .cwf-link{display:flex;align-items:center;justify-content:space-between;gap:10px;
      border:1px solid rgba(15,23,42,0.10);border-radius:16px;padding:10px 12px;background:#fff;
      font-weight:900;color:#0f172a;cursor:pointer}
    .cwf-link small{font-weight:800;color:rgba(15,23,42,0.60)}
    .cwf-link:hover{filter:brightness(1.02)}
    .cwf-link.primary{background: linear-gradient(135deg, var(--primary), var(--primary-2)); color:#fff; border-color: transparent}
    .cwf-link.warning{background: linear-gradient(135deg, var(--accent), #f59e0b); color:#111827; border-color: transparent}
    .cwf-link.danger{background: linear-gradient(135deg, #fb7185, var(--danger)); color:#fff; border-color: transparent}
  `;
  document.head.appendChild(style);

  const fab = document.createElement('div');
  fab.className = 'cwf-fab';
  fab.innerHTML = `
    <div id="cwfMenuBtn" class="cwf-iconbtn" title="เมนู" aria-label="เมนู">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z"/></svg>
    </div>
  `;
  document.body.appendChild(fab);

  const backdrop = document.createElement('div');
  backdrop.id = 'cwfDrawerBackdrop';
  backdrop.className = 'cwf-drawer-backdrop';
  document.body.appendChild(backdrop);

  const drawer = document.createElement('div');
  drawer.id = 'cwfDrawer';
  drawer.className = 'cwf-drawer';
  drawer.innerHTML = `
    <div class="h">
      <div>
        <b>เมนู Admin</b>
        <div class="muted" style="margin-top:2px">รวมปุ่มด้านบนทั้งหมดไว้ที่นี่</div>
      </div>
      <button class="secondary btn-mini" type="button" id="cwfCloseMenu" style="width:auto">ปิด</button>
    </div>
    <div class="b">
      <div class="cwf-group">
        <div class="t">ทางลัด</div>
        <div class="i">
          <div class="cwf-link primary" data-href="/admin-review-v2.html">📥 งานลูกค้าจอง <small>Review</small></div>
          <div class="cwf-link" data-href="/admin-queue-v2.html">🗓️ เช็คคิวช่าง <small>Calendar</small></div>
          <div class="cwf-link warning" data-href="/admin-add-v2.html">➕ เพิ่มงาน <small>New job</small></div>
          <div class="cwf-link" data-href="/admin-history-v2.html">📚 ประวัติงาน <small>History</small></div>
        </div>
      </div>

      <div class="cwf-group">
        <div class="t">หน้า Admin ทั้งหมด</div>
        <div class="i">
          <div class="cwf-link" data-href="/admin-promotions-v2.html">🏷️ โปรโมชั่น/ราคา <small>Promotions</small></div>
          <div class="cwf-link" data-href="/admin-job-view-v2.html">🔎 ดูงาน (เปิดจากรายการ) <small>Job View</small></div>
        </div>
      </div>

      <div class="cwf-group">
        <div class="t">หน้าใหม่ (จะเสร็จในเฟสถัดไป)</div>
        <div class="i">
          <div class="cwf-link" data-href="/admin-dashboard.html">📊 Dashboard <small>Admin</small></div>
          <div class="cwf-link" data-href="/admin-profile.html">👤 Profile Admin <small>รูป + ชื่อ</small></div>
          <div class="cwf-link" data-href="/admin-technicians.html">🧰 จัดการช่าง <small>ID/อนุมัติ</small></div>
        </div>
      </div>

      <div class="cwf-group">
        <div class="t">ระบบ</div>
        <div class="i">
          <div class="cwf-link danger" id="cwfLogoutBtn">ออกจากระบบ <small>Logout</small></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  const open = ()=>{ backdrop.style.display='block'; drawer.style.display='block'; };
  const close = ()=>{ backdrop.style.display='none'; drawer.style.display='none'; };

  document.getElementById('cwfMenuBtn').addEventListener('click', open);
  document.getElementById('cwfCloseMenu').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  drawer.addEventListener('click', (e)=>{
    const t = e.target.closest('.cwf-link');
    if(!t) return;
    if(t.id === 'cwfLogoutBtn'){
      close();
      doLogout();
      return;
    }
    const href = t.getAttribute('data-href');
    if(href){
      close();
      location.href = href;
    }
  });
}

function injectFloatingDebug(){
  if (isAdminAddV2Page()) return;
  if (document.getElementById('cwfBugBtn')) return;
  // If a page already has its own bug button/panel, skip
  if (document.getElementById('btnBug') || document.getElementById('debugFloat')) return;

  const css = document.createElement('style');
  css.textContent = `
    #cwfBugBtn{position:fixed;right:12px;bottom:calc(90px + env(safe-area-inset-bottom));z-index:2500;
      width:44px;height:44px;border-radius:16px;border:1px solid rgba(15,23,42,0.14);
      background:rgba(255,255,255,0.72);backdrop-filter: blur(10px);
      box-shadow: 0 12px 34px rgba(0,0,0,0.14);display:flex;align-items:center;justify-content:center;
      font-size:20px;cursor:pointer}
    #cwfDebugPanel{position:fixed;right:12px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:2600;
      width:min(520px,calc(100vw - 24px));max-height:65vh;overflow:auto;
      border:1px solid rgba(15,23,42,0.12);border-radius:18px;background:rgba(255,255,255,0.94);
      backdrop-filter: blur(14px);box-shadow: 0 22px 70px rgba(0,0,0,0.22);display:none}
    #cwfDebugPanel .h{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
      padding:10px 12px;border-bottom:1px solid rgba(15,23,42,0.10);background:#f8fafc}
    #cwfDebugPanel .b{padding:12px}
    #cwfDebugPanel pre{white-space:pre-wrap;word-break:break-word;background:#0b1220;color:#e2e8f0;
      border-radius:14px;padding:10px;font-size:12px;overflow:auto}
  `;
  document.head.appendChild(css);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'cwfBugBtn';
  btn.setAttribute('aria-label','Debug');
  btn.title = 'Debug';
  btn.textContent = '🐞';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'cwfDebugPanel';
  panel.innerHTML = `
    <div class="h">
      <div>
        <b>🐞 Debug Panel</b>
        <div class="muted" id="cwfDbgState" style="margin-top:2px">off</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="secondary btn-mini" type="button" id="cwfDbgRefresh" style="width:auto">รีเฟรช</button>
        <button class="secondary btn-mini" type="button" id="cwfDbgClose" style="width:auto">พับ</button>
      </div>
    </div>
    <div class="b">
      <div class="row" style="margin-bottom:10px">
        <button class="warning" type="button" id="cwfDbgToggle" style="min-width:180px">เปิด/ปิด Debug</button>
        <button class="secondary" type="button" id="cwfDbgCopy" style="min-width:180px">คัดลอก Log ล่าสุด</button>
      </div>
      <div class="muted" style="margin-bottom:8px">* ต้องใส่รหัส 1549 ก่อนเปิดเพื่อกันพลาด</div>
      <pre id="cwfDbgBox">(ยังไม่มี log)</pre>
    </div>
  `;
  document.body.appendChild(panel);

  const requirePin = ()=>{
    const pin = (prompt('ใส่รหัสเพื่อเปิด Debug Panel') || '').trim();
    if(pin !== '1549'){
      showToast('รหัสไม่ถูกต้อง', 'error');
      return false;
    }
    try{
      localStorage.setItem('cwf_debug_unlocked','1');
      // unlock window: 8 hours
      localStorage.setItem('cwf_debug_unlock_until', String(Date.now() + 8*60*60*1000));
    }catch(e){}
    return true;
  };

  const isDbgOn = ()=>{
    try{
      const want = (localStorage.getItem('cwf_debug') === '1');
      const until = Number(localStorage.getItem('cwf_debug_unlock_until')||'0');
      const unlocked = (localStorage.getItem('cwf_debug_unlocked')==='1') && (until===0 || Date.now()<until);
      return want && unlocked;
    }catch(e){ return false; }
  };

  const refresh = ()=>{
    const on = isDbgOn();
    const state = document.getElementById('cwfDbgState');
    if(state) state.textContent = on ? 'on' : 'off';
    const dbg = window.__CWF_DBG || {};
    const box = document.getElementById('cwfDbgBox');
    if(!box) return;
    const payload = {
      page: location.pathname,
      ts: new Date().toISOString(),
      debug: on,
      lastReq: dbg.lastReq || null,
      lastRes: dbg.lastRes || null,
    };
    box.textContent = JSON.stringify(payload, null, 2);
  };

  btn.addEventListener('click', ()=>{
    if(panel.style.display === 'block'){
      panel.style.display = 'none';
      return;
    }
    // panel can be opened only if already unlocked or correct pin
    if(!isDbgOn()){
      if(!requirePin()) return;
      try{ localStorage.setItem('cwf_debug','1'); }catch(e){}
    }
    panel.style.display = 'block';
    refresh();
  });

  document.getElementById('cwfDbgClose').addEventListener('click', ()=>{ panel.style.display='none'; });
  document.getElementById('cwfDbgRefresh').addEventListener('click', refresh);
  document.getElementById('cwfDbgToggle').addEventListener('click', ()=>{
    if(!requirePin()) return;
    try{
      const now = (localStorage.getItem('cwf_debug') === '1');
      localStorage.setItem('cwf_debug', now ? '0' : '1');
    }catch(e){}
    refresh();
    showToast('อัปเดต Debug แล้ว', 'success');
  });
  document.getElementById('cwfDbgCopy').addEventListener('click', async ()=>{
    try{
      const text = document.getElementById('cwfDbgBox').textContent || '';
      await navigator.clipboard.writeText(text);
      showToast('คัดลอกแล้ว', 'success');
    }catch(e){ showToast('คัดลอกไม่สำเร็จ', 'error'); }
  });
}

function basicAdminGuard(){
  if (isAdminAddV2Page()) return;
  try{
    const role = localStorage.getItem('role');
    if (role !== 'admin') {
      location.replace('/login.html');
    }
  }catch(e){}
}

// Auto-init on Admin v2 pages
try{
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>{
      basicAdminGuard();
      injectAdminMenu();
      injectFloatingDebug();
    });
  } else {
    basicAdminGuard();
    injectAdminMenu();
    injectFloatingDebug();
  }
}catch(e){}
