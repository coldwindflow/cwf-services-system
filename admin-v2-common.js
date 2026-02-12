// Shared helpers for Admin v2 pages (no framework, safe for production)

// ============================================================
// Admin v2 Shell (Top Fixed Menu Bar + Drawer Menu + Floating Debug + Auth Guard)
// - ใช้เมนูแบบเดียวกันทุกหน้า (รวมหน้าเพิ่มงาน)
// - Debug Panel เป็นไอคอนเล็กแบบลอย/พับได้ (กันพลาดด้วยรหัส) — ห้ามอยู่ในเมนู
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
  if (document.getElementById('cwfTopNav')) return;

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --cwf-blue:#0b4bb3;
      --cwf-yellow:#ffcc00;
      --cwf-ink:#0f172a;
      --cwf-top-h:74px;
    }
    #cwfTopNav{position:fixed;left:0;right:0;top:0;z-index:2600;
      padding-top:env(safe-area-inset-top);
      background:linear-gradient(180deg, rgba(11,27,58,0.98) 0%, rgba(11,75,179,0.98) 100%);
      border-bottom:1px solid rgba(255,255,255,0.10);
      box-shadow:0 14px 40px rgba(2,6,23,0.22);} 
    #cwfTopNav .in{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;
      gap:10px;padding:10px 12px;}
    #cwfTopNav .ttl{min-width:0;display:flex;flex-direction:column;gap:2px}
    #cwfTopNav .ttl b{font-size:14px;line-height:1.1;color:#fff}
    #cwfTopNav .ttl span{font-size:12px;font-weight:900;color:rgba(255,255,255,0.80);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #cwfTopNav .btns{display:flex;align-items:center;gap:8px}
    .cwf-icbtn{width:44px;height:44px;border-radius:16px;display:inline-flex;align-items:center;justify-content:center;
      border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.12);
      box-shadow:0 10px 26px rgba(0,0,0,0.18);cursor:pointer;user-select:none}
    .cwf-icbtn:active{transform: translateY(1px) scale(0.99)}
    .cwf-icbtn svg{width:22px;height:22px;fill:#ffffff}
    #cwfTopNavSpacer{height:var(--cwf-top-h)}
    @media (max-width:420px){:root{--cwf-top-h:72px}}

    /* Optional subbar (avatar + name) — used by Dashboard */
    #cwfTopSubbar{display:none;border-top:1px solid rgba(255,255,255,0.10);
      background:linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%);
    }
    #cwfTopSubbar .subin{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:flex-start;
      gap:10px;padding:10px 12px;}
    #cwfTopSubbar img{width:40px;height:40px;border-radius:16px;object-fit:cover;flex:0 0 auto;
      border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.10);box-shadow:0 10px 26px rgba(0,0,0,0.18)}
    #cwfTopSubbar .name{min-width:0;display:flex;flex-direction:column;gap:2px}
    #cwfTopSubbar .name b{font-size:13px;line-height:1.1;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70vw}
    #cwfTopSubbar .name span{font-size:12px;font-weight:900;color:rgba(255,255,255,0.76);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70vw}
    #cwfDrawerBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:2690;display:none}
    #cwfDrawer{position:fixed;inset:0;z-index:2700;
      display:none;padding:12px 12px calc(12px + env(safe-area-inset-bottom));
      overflow:auto;}
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

    /* Debug modal (inside menu flow, but renders as overlay for readability) */
    #cwfDebugModalBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.62);z-index:2990;display:none}
    #cwfDebugModal{position:fixed;inset:0;z-index:3000;display:none;overflow:auto;
      padding:12px 12px calc(12px + env(safe-area-inset-bottom));}
    #cwfDebugModal .panel{max-width:980px;margin:0 auto;background:rgba(255,255,255,0.96);
      border:1px solid rgba(15,23,42,0.12);border-radius:22px;box-shadow:0 22px 70px rgba(0,0,0,0.24);overflow:hidden}
    #cwfDebugModal .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;
      background:#0b4bb3;color:#fff}
    #cwfDebugModal .h b{font-size:14px}
    #cwfDebugModal .b{padding:12px;display:flex;flex-direction:column;gap:10px}
    #cwfDebugModal .row{display:flex;flex-wrap:wrap;gap:8px}
    #cwfDebugModal .pillbtn{border-radius:14px;border:1px solid rgba(15,23,42,0.12);padding:10px 12px;font-weight:900;cursor:pointer;background:#fff;color:#0b1b3a}
    #cwfDebugModal .pillbtn.yellow{background:var(--cwf-yellow);border-color:var(--cwf-yellow);color:#111827}
    #cwfDebugModal .pillbtn.blue{background:var(--cwf-blue);border-color:var(--cwf-blue);color:#fff}
    #cwfDebugModal pre{margin:0;border-radius:16px;border:1px solid rgba(15,23,42,0.10);background:#0b1020;color:#e5e7eb;
      padding:10px;overflow:auto;max-height:240px;font-size:12px;line-height:1.35}


    /* Floating Debug (NOT in menu) */
    #cwfDebugFloat{position:fixed;right:12px;bottom:12px;z-index:2980;display:none;
      padding:8px;border-radius:999px;background:rgba(255,255,255,0.14);
      border:1px solid rgba(255,255,255,0.16);backdrop-filter: blur(10px);-webkit-backdrop-filter: blur(10px);
      box-shadow:0 18px 46px rgba(0,0,0,0.22)}
    #cwfDebugFloat .fab{width:46px;height:46px;border-radius:18px;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.18);cursor:pointer;user-select:none}
    #cwfDebugFloat .fab svg{width:22px;height:22px;fill:#ffffff}
    #cwfDebugFloat .tog{margin-left:8px;width:40px;height:46px;border-radius:18px;display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.14);cursor:pointer;user-select:none}
    #cwfDebugFloat .tog svg{width:18px;height:18px;fill:#ffffff;opacity:.92}
    #cwfDebugFloat.collapsed{padding:8px}
    #cwfDebugFloat.collapsed .tog{display:none}
    @media (max-width:420px){#cwfDebugFloat{right:10px;bottom:10px}}
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

    <div id="cwfTopSubbar" aria-label="Admin identity bar">
      <div class="subin">
        <img id="cwfNavAvatar" alt="Admin" />
        <div class="name">
          <b id="cwfNavName">—</b>
          <span id="cwfNavRole">—</span>
        </div>
      </div>
    </div>
  `;
  document.body.insertBefore(nav, document.body.firstChild);

  // Spacer to prevent the fixed bar from covering page content
  const sp = document.createElement('div');
  sp.id = 'cwfTopNavSpacer';
  document.body.insertBefore(sp, nav.nextSibling);

  function updateTopSpacer(){
    try{
      const h = Math.ceil(nav.getBoundingClientRect().height || 74);
      document.documentElement.style.setProperty('--cwf-top-h', `${h}px`);
    }catch(_){/* ignore */}
  }
  updateTopSpacer();
  window.addEventListener('resize', ()=>{ try{ updateTopSpacer(); }catch(_){ } });

  // Public helper: allow pages to place admin identity into the blue subbar
  window.setTopSubbarIdentity = function(opts){
    try{
      const o = opts || {};
      const sub = document.getElementById('cwfTopSubbar');
      if (!sub) return;
      const nameEl = document.getElementById('cwfNavName');
      const roleEl = document.getElementById('cwfNavRole');
      const avEl = document.getElementById('cwfNavAvatar');
      if (nameEl) nameEl.textContent = String(o.name || '—');
      if (roleEl) roleEl.textContent = String(o.role || '');
      if (avEl){
        if (o.avatarUrl) avEl.src = o.avatarUrl;
        else avEl.removeAttribute('src');
      }
      sub.style.display = 'block';
      updateTopSpacer();
    }catch(_){/* ignore */}
  };

  // NOTE: window.setTopSubbarIdentity is defined above (uses measured height for spacer)

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

  // Floating debug button (visible when ?debug=1 or debug already enabled)
  const dbgFloat = document.createElement('div');
  dbgFloat.id = 'cwfDebugFloat';
  dbgFloat.innerHTML = `
    <div style="display:flex;align-items:center;">
      <div class="fab" id="cwfDbgFab" title="Debug Panel" aria-label="Debug Panel">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 7h-4V5h4v2Zm-1 12h-2v-2h2v2Zm6.5-7.5h-2.05a5.99 5.99 0 0 0-.8-2l1.45-1.45-1.4-1.4L15.3 8.1c-.6-.34-1.26-.6-1.96-.76V5.5A1.5 1.5 0 0 0 11.84 4h.32A1.5 1.5 0 0 0 10.66 5.5v1.84c-.7.16-1.36.42-1.96.76L7.3 6.65l-1.4 1.4L7.35 9.5c-.34.6-.62 1.26-.8 2H4.5v2h2.05c.18.74.46 1.4.8 2l-1.45 1.45 1.4 1.4L8.7 16.9c.6.34 1.26.6 1.96.76v1.84A1.5 1.5 0 0 0 12.16 21h-.32A1.5 1.5 0 0 0 13.34 19.5v-1.84c.7-.16 1.36-.42 1.96-.76l1.4 1.45 1.4-1.4-1.45-1.45c.34-.6.62-1.26.8-2H19.5v-2ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/></svg>
      </div>
      <div class="tog" id="cwfDbgFold" title="พับ/แสดง" aria-label="พับ/แสดง">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5H7z"/></svg>
      </div>
    </div>
  `;
  document.body.appendChild(dbgFloat);

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


  // floating toggle
  const shouldShowDbgFloat = ()=>{
    try{
      const qs = new URLSearchParams(location.search||'');
      if (qs.get('debug') === '1') return true;
      return (localStorage.getItem('cwf_debug') === '1');
    }catch(e){ return false; }
  };

  const loadDbgFloatState = ()=>{
    try{
      const c = localStorage.getItem('cwf_debug_float_collapsed') === '1';
      dbgFloat.classList.toggle('collapsed', c);
    }catch(_){ }
  };
  const showDbgFloat = ()=>{
    dbgFloat.style.display = shouldShowDbgFloat() ? 'block' : 'none';
    loadDbgFloatState();
  };
  showDbgFloat();

  document.getElementById('cwfDbgFab').addEventListener('click', ()=>{
    openDebugModal();
  });
  document.getElementById('cwfDbgFold').addEventListener('click', ()=>{
    const next = !dbgFloat.classList.contains('collapsed');
    dbgFloat.classList.toggle('collapsed', next);
    try{ localStorage.setItem('cwf_debug_float_collapsed', next ? '1' : '0'); }catch(_){ }
  });

  // when debug gets unlocked, ensure float is visible
  const _origEnsure = ensureDebugUnlocked;
  // keep behavior but show float if debug enabled by PIN
  ensureDebugUnlocked = ()=>{
    const ok = _origEnsure();
    if (ok) { try{ localStorage.setItem('cwf_debug','1'); }catch(_){ } showDbgFloat(); }
    return ok;
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


function basicAdminGuard(){
  const hardRedirect = ()=>{
    try{ location.replace('/login.html'); }catch(e){ location.href = '/login.html'; }
  };

  try{
    if (sessionStorage.getItem('cwf_logged_out') === '1') { hardRedirect(); return; }
  }catch(_){ }

  // Server-side check to prevent back-navigation into protected pages
  const serverCheck = async ()=>{
    try{
      const res = await fetch('/api/auth/me', { credentials:'include' });
      if (!res.ok) throw new Error('UNAUTHORIZED');
      const data = await res.json().catch(()=>null);
      if (!data || !data.ok) throw new Error('UNAUTHORIZED');
      if (data.role !== 'admin' && data.role !== 'super_admin') throw new Error('FORBIDDEN');
      // keep localStorage in sync with DB (prevents login bounce)
      try{
        if (data.username) localStorage.setItem('username', String(data.username));
        if (data.role) localStorage.setItem('role', normalizeRole(data.role));
      }catch(e){}
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
    });
  } else {
    basicAdminGuard();
    injectAdminMenu();
  }
}catch(e){}
