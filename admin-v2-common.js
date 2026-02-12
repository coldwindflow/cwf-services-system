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
  // Admin-add-v2 has its own header/menu; do not touch it
  if (isAdminAddV2Page()) return;
  if (document.getElementById('cwfTopNav')) return;

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --cwf-blue:#0b4bb3;
      --cwf-yellow:#ffcc00;
      --cwf-ink:#0f172a;
    }
    body{padding-top:calc(60px + env(safe-area-inset-top)) !important;}
    #cwfTopNav{position:fixed;left:0;right:0;top:0;z-index:2600;
      padding-top:env(safe-area-inset-top);
      background:rgba(255,255,255,0.86);backdrop-filter: blur(14px);
      border-bottom:1px solid rgba(15,23,42,0.10);
      box-shadow:0 10px 30px rgba(2,6,23,0.10);}
    #cwfTopNav .in{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:10px 12px;}
    #cwfTopNav .ttl{min-width:0;display:flex;flex-direction:column;gap:2px}
    #cwfTopNav .ttl b{font-size:14px;line-height:1.1;color:var(--cwf-ink)}
    #cwfTopNav .ttl span{font-size:12px;font-weight:800;color:rgba(15,23,42,0.58);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #cwfTopNav .btns{display:flex;align-items:center;gap:8px}
    .cwf-icbtn{width:44px;height:44px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
      border:1px solid rgba(15,23,42,0.14);background:rgba(255,255,255,0.78);
      box-shadow:0 10px 26px rgba(0,0,0,0.12);cursor:pointer;user-select:none}
    .cwf-icbtn:active{transform: translateY(1px) scale(0.99)}
    .cwf-icbtn svg{width:22px;height:22px;fill:var(--cwf-ink)}
    #cwfDrawerBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:2599;display:none}
    #cwfDrawer{position:fixed;left:0;right:0;top:calc(60px + env(safe-area-inset-top));bottom:0;z-index:2700;
      display:none;padding:12px;overflow:auto;}
    #cwfDrawer .panel{max-width:560px;margin:0 auto;background:rgba(255,255,255,0.94);
      backdrop-filter: blur(16px);border:1px solid rgba(15,23,42,0.12);border-radius:22px;
      box-shadow:0 22px 70px rgba(0,0,0,0.22);overflow:hidden}
    #cwfDrawer .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px;
      border-bottom:1px solid rgba(15,23,42,0.10);background:#f8fafc}
    #cwfDrawer .h b{font-size:14px;color:var(--cwf-ink)}
    #cwfDrawer .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    .cwf-group{border:1px solid rgba(15,23,42,0.10);border-radius:18px;background:#fff;overflow:hidden}
    .cwf-group .t{padding:10px 12px;background:#f8fafc;font-weight:900;font-size:12px;color:var(--cwf-ink);
      border-bottom:1px solid rgba(15,23,42,0.08)}
    .cwf-group .i{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
    .cwf-link{display:flex;align-items:center;justify-content:space-between;gap:10px;
      border:1px solid rgba(15,23,42,0.10);border-radius:16px;padding:10px 12px;background:#fff;
      font-weight:900;color:var(--cwf-ink);cursor:pointer}
    .cwf-link small{font-weight:800;color:rgba(15,23,42,0.60)}
    .cwf-link.primary{background:var(--cwf-blue); color:#fff; border-color: transparent}
    .cwf-link.warning{background:var(--cwf-yellow); color:#111827; border-color: transparent}
    .cwf-link.danger{background:#ef4444; color:#fff; border-color: transparent}
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
            <div class="cwf-link" data-href="/admin-profile-v2.html">👤 Profile Admin <small>รูป + ชื่อ</small></div>
            <div class="cwf-link" data-href="/admin-technicians-v2.html">🧰 จัดการช่าง <small>ID/อนุมัติ</small></div>
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
            <div class="cwf-link danger" id="cwfLogoutBtn">ออกจากระบบ <small>Logout</small></div>
          </div>
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
        const actorRoleLabel = (d.actor && normalizeRole(d.actor.role) === 'super_admin') ? 'Super Admin' : (d.actor ? normalizeRole(d.actor.role) : normalizeRole(d.role));
        const actorLabel = d.actor ? `${d.actor.username} (${actorRoleLabel})` : `${d.username} (${normalizeRole(d.role)})`;
        who.textContent = d.impersonating ? `กำลังสวมสิทธิ: ${d.username} (${normalizeRole(d.role)}) • โดย ${actorLabel}` : `ผู้ใช้: ${actorLabel}`;
      }

      const superL = document.getElementById('cwfSuperAdminLink');
      if (superL) {
        const isSuper = (d.actor && normalizeRole(d.actor.role) === 'super_admin') || (normalizeRole(d.role) === 'super_admin');
        superL.style.display = isSuper ? 'flex' : 'none';
      }

      const stopBtn = document.getElementById('cwfStopImpBtn');
      if (stopBtn) stopBtn.style.display = d.impersonating ? 'flex' : 'none';
    }catch(_){ }
  })();
}


function injectFloatingDebug(){
  // Debug must NOT be inside the menu. Provide a small floating bug icon + PIN gate.
  if (document.getElementById('cwfDebugPanel')) return;
  // If a page already has its own bug button/panel, skip
  if (document.getElementById('btnBug') || document.getElementById('debugFloat')) return;

  const css = document.createElement('style');
  css.textContent = `
    #cwfDbgBtn{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2750;
      width:46px;height:46px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
      border:1px solid rgba(15,23,42,0.14);background:rgba(255,255,255,0.78);backdrop-filter: blur(12px);
      box-shadow:0 12px 34px rgba(0,0,0,0.14);cursor:pointer;user-select:none}
    #cwfDbgBtn:active{transform: translateY(1px) scale(0.99)}
    #cwfDbgBtn svg{width:22px;height:22px;fill:#0f172a}

    #cwfDebugPanel{position:fixed;right:12px;bottom:calc(68px + env(safe-area-inset-bottom));z-index:2740;
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

  const btn = document.createElement('div');
  btn.id = 'cwfDbgBtn';
  btn.title = 'Debug Panel';
  btn.setAttribute('aria-label','Debug Panel');
  btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 7h-4V5h4v2Zm6 3h-2.07c-.2-.72-.5-1.39-.9-2H20V6h-2.8c-.54-.62-1.18-1.13-1.9-1.5L16 3h-2l-.5 1h-3L10 3H8l.7 1.5c-.72.37-1.36.88-1.9 1.5H4v2h2.97c-.4.61-.7 1.28-.9 2H4v2h2.07c.06.67.22 1.31.46 1.91L5 16.5 6.5 18l1.58-1.53c.58.46 1.24.82 1.97 1.05V20h4v-2.48c.73-.23 1.39-.59 1.97-1.05L17.5 18 19 16.5l-1.53-1.59c.24-.6.4-1.24.46-1.91H20v-2Zm-8 6a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>`;
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

  const unlocked = ()=>{
    try{
      const until = Number(localStorage.getItem('cwf_debug_unlock_until')||'0');
      const ok = (localStorage.getItem('cwf_debug_unlocked')==='1') && (until===0 || Date.now()<until);
      return ok;
    }catch(e){ return false; }
  };

  // small floating button toggles panel (PIN-gated)
  btn.addEventListener('click', ()=>{
    if (!unlocked()){
      if (!requirePin()) return;
    }
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
  });

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
  const localCheck = ()=>{
    try{
      const role = normalizeRole(localStorage.getItem('role'));
      const u = localStorage.getItem('username');
      if (!u || (role !== 'admin' && role !== 'super_admin')) {
        return false;
      }
      // keep normalized role in storage (prevents redirect loop)
      try{ localStorage.setItem('role', role); }catch(e){}
      // if explicitly logged out in this tab/session, block immediately
      if (sessionStorage.getItem('cwf_logged_out') === '1') return false;
      return true;
    }catch(e){ return false; }
  };

  const hardRedirect = ()=>{
    try{ location.replace('/login.html'); }catch(e){ location.href = '/login.html'; }
  };

  if (!localCheck()) {
    hardRedirect();
    return;
  }

  // Server-side check to prevent back-navigation into protected pages
  const serverCheck = async ()=>{
    try{
      const res = await fetch('/api/auth/me', { credentials:'include' });
      if (!res.ok) throw new Error('UNAUTHORIZED');
      const data = await res.json().catch(()=>null);
      if (!data || !data.ok) throw new Error('UNAUTHORIZED');
      if (data.role !== 'admin' && data.role !== 'super_admin') throw new Error('FORBIDDEN');
      // keep localStorage in sync with DB role
      try{ localStorage.setItem('role', String(data.role)); }catch(e){}
      return true;
    }catch(e){
      doLogout();
      return false;
    }
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
      injectFloatingDebug();
    });
  } else {
    basicAdminGuard();
    injectAdminMenu();
    injectFloatingDebug();
  }
}catch(e){}
