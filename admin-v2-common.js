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
  // Keep below drawer/debug overlays to avoid covering menu items
  box.style.zIndex = "2000";
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
  if (document.getElementById('cwfMenuBtn')) return;

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --cwf-blue:#0b4bb3;
      --cwf-yellow:#ffcc00;
      --cwf-ink:#0f172a;
    }
    /* Sticky top bar to avoid covering page content */
    #cwfTopNav{position:sticky;left:0;right:0;top:0;z-index:2600;
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
    /* no spacer (sticky is in-flow) */
    #cwfDrawerBackdrop{position:fixed;inset:0;background:rgba(2,6,23,0.55);z-index:2690;display:none}
    #cwfDrawer{position:fixed;inset:0;z-index:2700;
      display:none;
      /* Extra bottom padding to prevent overlap with bottom nav on mobile */
      padding:12px 12px calc(12px + env(safe-area-inset-bottom) + 240px);
      overflow:auto;}
    #cwfDrawer .panel{max-width:560px;margin:0 auto;background:rgba(255,255,255,0.94);
      backdrop-filter: blur(16px);border:1px solid rgba(15,23,42,0.12);border-radius:22px;
      box-shadow:0 22px 70px rgba(0,0,0,0.22);overflow:hidden;
      max-height:calc(100vh - 24px - env(safe-area-inset-bottom) - env(safe-area-inset-top));
      display:flex;flex-direction:column}
    #cwfDrawer .h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px;
      border-bottom:1px solid rgba(15,23,42,0.10);background:#f8fafc}
    #cwfDrawer .h b{font-size:14px;color:var(--cwf-ink)}
    #cwfDrawer .b{padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto;
      -webkit-overflow-scrolling: touch; padding-bottom: 20px;}

    /* When drawer open: hide bottom nav to prevent visual overlap */
    body.cwf-menu-open .bottom-nav{visibility:hidden;pointer-events:none}
    .cwf-group{border:1px solid rgba(15,23,42,0.10);border-radius:18px;background:#fff;overflow:hidden}
    .cwf-group .t{padding:10px 12px;background:#f8fafc;font-weight:900;font-size:12px;color:var(--cwf-ink);
      border-bottom:1px solid rgba(15,23,42,0.08)}
    .cwf-group .i{display:flex;flex-direction:column;gap:8px;padding:10px 12px}
    .cwf-link{display:flex;align-items:center;justify-content:space-between;gap:12px;
      border:1px solid rgba(15,23,42,0.10);border-radius:16px;padding:12px 12px;background:#fff;
      font-weight:900;color:var(--cwf-ink);cursor:pointer;min-height:52px}
    .cwf-link .left{min-width:0;display:flex;align-items:center;gap:10px}
    .cwf-link .ic{width:28px;height:28px;border-radius:10px;display:flex;align-items:center;justify-content:center;
      background:rgba(15,23,42,0.06);flex:0 0 auto}
    .cwf-link.primary .ic{background:rgba(255,255,255,0.18)}
    .cwf-link.warning .ic{background:rgba(17,24,39,0.10)}
    .cwf-link.danger .ic{background:rgba(255,255,255,0.18)}
    .cwf-link .txt{min-width:0;display:flex;flex-direction:column;gap:2px}
    .cwf-link .txt b{font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cwf-link .txt span{font-size:12px;font-weight:800;color:rgba(15,23,42,0.62)}
    .cwf-link.primary .txt span, .cwf-link.danger .txt span{color:rgba(255,255,255,0.78)}
    .cwf-link .right{flex:0 0 auto;font-weight:900;color:rgba(15,23,42,0.55)}
    .cwf-link.primary .right{color:rgba(255,255,255,0.85)}
    .cwf-link.danger .right{color:rgba(255,255,255,0.85)}
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
  `;
  document.head.appendChild(css);

  const pageTitle = (()=>{
    const t = String(document.title || 'Admin').replace(/\s*-\s*CWF.*$/i,'').trim();
    return t || 'Admin';
  })();

  // Mount menu button on existing page topbar if present (prevents UI overlap)
  let menuBtn = document.createElement('div');
  menuBtn.id = 'cwfMenuBtn';
  menuBtn.className = 'cwf-icbtn';
  menuBtn.title = 'เมนู';
  menuBtn.setAttribute('aria-label','เมนู');
  menuBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5.5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z"/></svg>`;

  const existingTopbar = document.querySelector('.topbar');
  const actionsMount = document.getElementById('cwfTopbarActions');
  if (actionsMount){
    actionsMount.appendChild(menuBtn);
  } else if (existingTopbar){
    existingTopbar.appendChild(menuBtn);
  } else {
    const nav = document.createElement('div');
    nav.id = 'cwfTopNav';
    nav.innerHTML = `
      <div class="in">
        <div class="ttl">
          <b>CWF Admin</b>
          <span>${pageTitle}</span>
        </div>
        <div class="btns"></div>
      </div>
    `;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.querySelector('.btns').appendChild(menuBtn);
  }

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
            <div class="cwf-link primary" data-href="/admin-dashboard-v2.html">
              <div class="left"><div class="ic">📊</div><div class="txt"><b>Dashboard</b><span>ภาพรวมรายได้/งาน</span></div></div>
              <div class="right">Admin</div>
            </div>
            <div class="cwf-link" data-href="/admin-profile-v2.html">
              <div class="left"><div class="ic">👤</div><div class="txt"><b>Profile Admin</b><span>รูป + ชื่อ</span></div></div>
              <div class="right">โปรไฟล์</div>
            </div>
            <div class="cwf-link" data-href="/admin-technicians-v2.html">
              <div class="left"><div class="ic">🧰</div><div class="txt"><b>จัดการช่าง</b><span>สร้าง/แก้ไข + อนุมัติ</span></div></div>
              <div class="right">ID/อนุมัติ</div>
            </div>
            <div class="cwf-link" id="cwfSuperAdminLink" data-href="/admin-super-v2.html" style="display:none">
              <div class="left"><div class="ic">🛡️</div><div class="txt"><b>Super Admin</b><span>จัดการทั้งหมด</span></div></div>
              <div class="right">สิทธิ์สูงสุด</div>
            </div>
          </div>
        </div>

        <div class="cwf-group">
          <div class="t">หน้า Admin ทั้งหมด</div>
          <div class="i">
            <div class="cwf-link warning" data-href="/admin-add-v2.html">
              <div class="left"><div class="ic">➕</div><div class="txt"><b>เพิ่มงาน</b><span>Booking</span></div></div>
              <div class="right">สร้างงาน</div>
            </div>
            <div class="cwf-link" data-href="/admin-queue-v2.html">
              <div class="left"><div class="ic">🗓️</div><div class="txt"><b>คิวช่าง</b><span>Queue</span></div></div>
              <div class="right">ตาราง</div>
            </div>
            <div class="cwf-link" data-href="/admin-history-v2.html">
              <div class="left"><div class="ic">🧾</div><div class="txt"><b>ประวัติงาน</b><span>History</span></div></div>
              <div class="right">ย้อนหลัง</div>
            </div>
            <div class="cwf-link" data-href="/admin-review-v2.html">
              <div class="left"><div class="ic">✅</div><div class="txt"><b>อนุมัติงาน/รีวิว</b><span>Approvals</span></div></div>
              <div class="right">ตรวจ</div>
            </div>
            <div class="cwf-link" data-href="/admin-promotions-v2.html">
              <div class="left"><div class="ic">🏷️</div><div class="txt"><b>โปรโมชั่น/ราคา</b><span>Promotions</span></div></div>
              <div class="right">จัดการ</div>
            </div>
            <div class="cwf-link" data-href="/admin-job-view-v2.html">
              <div class="left"><div class="ic">🔎</div><div class="txt"><b>ดูงาน</b><span>Job View</span></div></div>
              <div class="right">ค้นหา</div>
            </div>
          </div>
        </div>

        <div class="cwf-group">
          <div class="t">ระบบ</div>
          <div class="i">
            <div class="cwf-link" id="cwfStopImpBtn" style="display:none" data-action="stop-impersonate">
              <div class="left"><div class="ic">🛑</div><div class="txt"><b>หยุดสวมสิทธิ</b><span>กลับบัญชีจริง</span></div></div>
              <div class="right">Stop</div>
            </div>
            <div class="cwf-link" id="cwfDebugLink" data-action="debug">
              <div class="left"><div class="ic">🐞</div><div class="txt"><b>Debug Panel</b><span>ใส่รหัสก่อนเปิด</span></div></div>
              <div class="right">Tools</div>
            </div>
            <div class="cwf-link danger" id="cwfLogoutBtn">
              <div class="left"><div class="ic">⎋</div><div class="txt"><b>ออกจากระบบ</b><span>Logout</span></div></div>
              <div class="right">ออก</div>
            </div>
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

  const open = ()=>{
    document.body.classList.add('cwf-menu-open');
    backdrop.style.display='block';
    drawer.style.display='block';
  };
  const close = ()=>{
    document.body.classList.remove('cwf-menu-open');
    backdrop.style.display='none';
    drawer.style.display='none';
  };

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
