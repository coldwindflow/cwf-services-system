/* Super Admin v2
 * Scope:
 * - Whitelist-based Super Admin guard (server decides)
 * - Users list + impersonation
 * - Admin management
 * - Technician income settings (defaults + overrides) + job calc
 * - Duration rules
 * - Audit log
 */

(async function(){
  // Guard: must be super admin (whitelist)
  let me;
  try{
    me = await fetch('/api/auth/me', { credentials:'include' }).then(r=>r.json());
    if(!me || !me.ok) throw new Error('unauthorized');
    const isSuper = !!(me.actor && me.actor.is_super_admin) || !!me.is_super_admin;
    if(!isSuper){
      alert('หน้านี้สำหรับ Super Admin เท่านั้น');
      location.replace('/admin-dashboard-v2.html');
      return;
    }
  }catch(_){
    location.replace('/login.html');
    return;
  }

  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s||'').replace(/[&<> "]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',' ':' ' }[c]||c));

  function toast(msg){
    const d=document.createElement('div');
    d.textContent=msg;
    d.style.position='fixed';d.style.left='12px';d.style.right='12px';d.style.bottom='90px';
    d.style.zIndex='9999';d.style.padding='12px';d.style.borderRadius='14px';
    d.style.fontWeight='900';d.style.background='#e2e8f0';d.style.color='#0f172a';
    d.style.boxShadow='0 10px 30px rgba(0,0,0,0.18)';
    document.body.appendChild(d);
    setTimeout(()=>d.remove(),1800);
  }

  async function api(url, opts={}){
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type':'application/json' },
      credentials:'include'
    }, opts));
    const data = await res.json().catch(()=>null);
    if(!res.ok){
      const msg = (data && data.error) ? data.error : `HTTP_${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // Tabs
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const panels = Array.from(document.querySelectorAll('.panel'));
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      panels.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const k=t.getAttribute('data-tab');
      const p=document.querySelector(`.panel[data-panel="${k}"]`);
      if(p) p.classList.add('active');
    });
  });

  // Header
  try{
    const actorRoleLabel = (me.actor && me.actor.is_super_admin) ? 'super_admin' : (me.actor ? me.actor.role : me.role);
    const actorLabel = me.actor ? `${me.actor.username} (${actorRoleLabel})` : `${me.username} (${me.role})`;
    $('who').textContent = me.impersonating ? `กำลังสวมสิทธิ: ${me.username} (${me.role}) • โดย ${actorLabel}` : `ผู้ใช้: ${actorLabel}`;
    $('kpiActor').textContent = me.actor ? `${me.actor.username} (${actorRoleLabel})` : `${me.username} (${me.role})`;
    $('kpiEffective').textContent = `${me.username} (${me.role})`;
    $('impHint').textContent = me.impersonating ? 'กำลังสวมสิทธิอยู่ (กด “หยุดสวมสิทธิ” เพื่อกลับเป็น Super Admin)' : 'ยังไม่ได้สวมสิทธิ';
  }catch(_){ }

  // ===== Users list + impersonate =====
  async function loadUsers(){
    const role = $('filterRole').value;
    const data = await api(`/admin/super/users${role?`?role=${encodeURIComponent(role)}`:''}`);
    const rows = data.users || [];
    const box = $('usersBox');
    box.innerHTML = rows.map(u=>{
      const dr = (u.display_role || u.role);
      const pillClass = dr==='super_admin'?'blue':(dr==='admin'?'yellow':'gray');
      const nm = u.full_name ? ` — ${esc(u.full_name)}` : '';
      return `<div class="rowitem">
        <div>
          <b>${esc(u.username)}</b> <span class="pill ${pillClass}">${esc(dr==='super_admin'?'Super Admin':dr)}</span>
          <div class="muted">${esc(u.role)}${nm}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn blue" data-imp="${esc(u.username)}">สวมสิทธิ</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted">(ไม่มีข้อมูล)</div>';

    box.querySelectorAll('[data-imp]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const target = btn.getAttribute('data-imp');
        if(!target) return;
        if(!confirm(`สวมสิทธิเป็น ${target} ?\n(มีบันทึก audit log)`)) return;
        try{
          const r = await api('/admin/super/impersonate', { method:'POST', body: JSON.stringify({ target_username: target }) });
          // Keep localStorage consistent
          try{
            localStorage.setItem('cwf_impersonate_by', r.actor.username);
            localStorage.setItem('cwf_impersonate', r.impersonated.username);
            localStorage.setItem('cwf_impersonate_since', String(Date.now()));
            localStorage.setItem('username', r.impersonated.username);
            localStorage.setItem('role', r.impersonated.role);
          }catch(_){ }
          toast(`สวมสิทธิเป็น ${r.impersonated.username} แล้ว`);
          location.href = (r.impersonated.role === 'technician') ? '/tech.html' : '/admin-dashboard-v2.html';
        }catch(e){ alert(`สวมสิทธิไม่สำเร็จ: ${e.message}`); }
      });
    });
  }

  $('filterRole').addEventListener('change', ()=>loadUsers().catch(e=>alert(e.message)));
  $('btnReloadUsers').addEventListener('click', ()=>loadUsers().catch(e=>alert(e.message)));

  $('btnStopImp').addEventListener('click', async ()=>{
    if(!confirm('หยุดสวมสิทธิ และกลับเป็น Super Admin?')) return;
    try{
      await api('/admin/super/impersonate/stop', { method:'POST' });
      try{
        const a = me.actor || { username: me.username, role: me.role };
        localStorage.setItem('username', a.username);
        localStorage.setItem('role', a.role);
        ['cwf_impersonate','cwf_impersonate_by','cwf_impersonate_since'].forEach(k=>localStorage.removeItem(k));
      }catch(_){ }
      toast('หยุดสวมสิทธิแล้ว');
      location.href = '/admin-super-v2.html';
    }catch(e){ alert(`หยุดสวมสิทธิไม่สำเร็จ: ${e.message}`); }
  });

  // ===== Admin manage =====
  async function loadAdmins(){
    // Show both: admins + super_admin (whitelist)
    const dataA = await api('/admin/super/users?role=admin');
    const dataS = await api('/admin/super/users?role=super_admin');
    const rows = [...(dataS.users||[]), ...(dataA.users||[])];
    const box = $('adminsBox');
    box.innerHTML = rows.map(u=>{
      const dr = (u.display_role || u.role);
      const pillClass = dr==='super_admin'?'blue':'yellow';
      return `<div class="rowitem">
        <div>
          <b>${esc(u.username)}</b> <span class="pill ${pillClass}">${esc(dr==='super_admin'?'Super Admin':'Admin')}</span>
          <div class="muted">ชื่อ: ${esc(u.full_name||'-')} • คอมมิชชั่น: ${Number(u.commission_rate_percent||0)}%</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn yellow" data-edit="${esc(u.username)}">แก้ไข</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted">(ไม่มีข้อมูล)</div>';

    box.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const username = btn.getAttribute('data-edit');
        const row = rows.find(x=>x.username===username);
        if(!row) return;
        $('editUser').value = row.username;
        $('editName').value = row.full_name||'';
        $('editCommission').value = String(row.commission_rate_percent||0);
        $('editPass').value='';
        $('editModal').showModal();
      });
    });
  }

  $('btnReloadAdmins').addEventListener('click', ()=>loadAdmins().catch(e=>alert(e.message)));

  $('btnCreateAdmin').addEventListener('click', async ()=>{
    const username = $('newAdminUser').value.trim();
    const password = $('newAdminPass').value.trim();
    const full_name = $('newAdminName').value.trim();
    if(!username || !password){ alert('ต้องใส่ username และ password'); return; }
    try{
      await api('/admin/super/admins', { method:'POST', body: JSON.stringify({ username, password, role:'admin', full_name }) });
      toast('สร้างแอดมินแล้ว');
      $('newAdminUser').value=''; $('newAdminPass').value=''; $('newAdminName').value='';
      await loadAdmins();
      await loadAudit();
    }catch(e){ alert(`สร้างไม่สำเร็จ: ${e.message}`); }
  });

  $('btnSaveEdit').addEventListener('click', async ()=>{
    const username = $('editUser').value.trim();
    const payload = {
      role: 'admin',
      full_name: $('editName').value.trim(),
      commission_rate_percent: Number($('editCommission').value||0)
    };
    const pw = $('editPass').value.trim();
    if(pw) payload.password = pw;
    try{
      await api(`/admin/super/admins/${encodeURIComponent(username)}`, { method:'PUT', body: JSON.stringify(payload) });
      $('editModal').close();
      toast('บันทึกแล้ว');
      await loadAdmins();
      await loadAudit();
    }catch(e){ alert(`บันทึกไม่สำเร็จ: ${e.message}`); }
  });

  // ===== Duration rules =====
  async function loadDurations(){
    const data = await api('/admin/super/durations');
    const rows = data.rows || [];
    const box = $('durationsBox');
    box.innerHTML = rows.map(r=>{
      return `<div class="rowitem">
        <div>
          <b>${esc(r.service_key)}</b>
          <div class="muted">Duration: <b>${Number(r.duration_min||0)}</b> นาที • updated_by: ${esc(r.updated_by||'-')}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn yellow" data-dedit="${esc(r.service_key)}" data-dmin="${Number(r.duration_min||0)}">แก้ไข</button>
          <button class="btn" data-ddel="${esc(r.service_key)}">ลบ</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted">(ไม่มีข้อมูล)</div>';

    box.querySelectorAll('[data-dedit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        $('durKey').value = btn.getAttribute('data-dedit')||'';
        $('durMin').value = btn.getAttribute('data-dmin')||'';
      });
    });

    box.querySelectorAll('[data-ddel]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const key = btn.getAttribute('data-ddel');
        if(!key) return;
        if(!confirm(`ลบ duration: ${key} ?`)) return;
        try{
          await api(`/admin/super/durations/${encodeURIComponent(key)}`, { method:'DELETE' });
          toast('ลบแล้ว');
          await loadDurations();
          await loadAudit();
        }catch(e){ alert(`ลบไม่สำเร็จ: ${e.message}`); }
      });
    });
  }

  $('btnReloadDur').addEventListener('click', ()=>loadDurations().catch(e=>alert(e.message)));
  $('btnSaveDuration').addEventListener('click', async ()=>{
    const service_key = $('durKey').value.trim();
    const duration_min = Number($('durMin').value);
    if(!service_key || !duration_min || duration_min<=0){ alert('กรอก service_key และ duration_min'); return; }
    try{
      await api('/admin/super/durations', { method:'POST', body: JSON.stringify({ service_key, duration_min }) });
      toast('บันทึกแล้ว');
      $('durKey').value=''; $('durMin').value='';
      await loadDurations();
      await loadAudit();
    }catch(e){ alert(`บันทึกไม่สำเร็จ: ${e.message}`); }
  });

  // ===== Income settings =====
  function safeJsonParse(s){
    try{ return JSON.parse(String(s||'').trim() || '{}'); }catch(_){ return null; }
  }

  async function loadIncomeDefaults(){
    const data = await api('/admin/super/tech_income/defaults');
    const rows = data.rows || [];
    const map = {};
    rows.forEach(r=>{ map[String(r.income_type)] = r.config_json || {}; });
    const t = $('defType').value;
    $('defJson').value = JSON.stringify(map[t] || {}, null, 2);
    $('incomeDefaultsHint').textContent = `มี defaults: ${Object.keys(map).length ? Object.keys(map).join(', ') : '(ยังไม่มี)'}`;
  }

  $('btnReloadIncomeDefaults').addEventListener('click', ()=>loadIncomeDefaults().catch(e=>alert(e.message)));
  $('defType').addEventListener('change', ()=>loadIncomeDefaults().catch(e=>alert(e.message)));

  $('btnSaveIncomeDefault').addEventListener('click', async ()=>{
    const income_type = $('defType').value;
    const cfg = safeJsonParse($('defJson').value);
    if(!cfg){ alert('JSON ไม่ถูกต้อง'); return; }
    try{
      await api(`/admin/super/tech_income/defaults/${encodeURIComponent(income_type)}`, { method:'PUT', body: JSON.stringify({ config_json: cfg }) });
      toast('บันทึก defaults แล้ว');
      await loadIncomeDefaults();
      await loadAudit();
    }catch(e){ alert(`บันทึกไม่สำเร็จ: ${e.message}`); }
  });

  async function loadIncomeOverrides(){
    const data = await api('/admin/super/tech_income/overrides');
    const rows = data.rows || [];
    const box = $('incomeOverridesBox');
    box.innerHTML = rows.map(r=>{
      const cfg = r.config_json ? JSON.stringify(r.config_json) : '{}';
      return `<div class="rowitem">
        <div>
          <b>${esc(r.username)}</b> <span class="pill gray">${esc(r.income_type)}</span>
          <div class="muted">${esc(cfg)}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn yellow" data-ovedit="${esc(r.username)}" data-ovtype="${esc(r.income_type)}" data-ovjson="${esc(cfg)}">แก้ไข</button>
          <button class="btn" data-ovdel="${esc(r.username)}">ลบ</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted">(ยังไม่มี overrides)</div>';

    box.querySelectorAll('[data-ovedit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        $('ovUser').value = btn.getAttribute('data-ovedit')||'';
        $('ovType').value = btn.getAttribute('data-ovtype')||'company';
        const j = btn.getAttribute('data-ovjson')||'{}';
        // pretty
        const parsed = safeJsonParse(j);
        $('ovJson').value = parsed ? JSON.stringify(parsed, null, 2) : j;
      });
    });

    box.querySelectorAll('[data-ovdel]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const u = btn.getAttribute('data-ovdel');
        if(!u) return;
        if(!confirm(`ลบ override ของ ${u} ?`)) return;
        try{
          await api(`/admin/super/tech_income/overrides/${encodeURIComponent(u)}`, { method:'DELETE' });
          toast('ลบแล้ว');
          await loadIncomeOverrides();
          await loadAudit();
        }catch(e){ alert(`ลบไม่สำเร็จ: ${e.message}`); }
      });
    });
  }

  $('btnReloadIncomeOverrides').addEventListener('click', ()=>loadIncomeOverrides().catch(e=>alert(e.message)));

  $('btnSaveIncomeOverride').addEventListener('click', async ()=>{
    const username = $('ovUser').value.trim();
    const income_type = $('ovType').value;
    if(!username){ alert('ต้องใส่ username ช่าง'); return; }
    const cfg = safeJsonParse($('ovJson').value);
    if(!cfg){ alert('JSON ไม่ถูกต้อง'); return; }
    try{
      await api(`/admin/super/tech_income/overrides/${encodeURIComponent(username)}`, { method:'PUT', body: JSON.stringify({ income_type, config_json: cfg }) });
      toast('บันทึก override แล้ว');
      await loadIncomeOverrides();
      await loadAudit();
    }catch(e){ alert(`บันทึกไม่สำเร็จ: ${e.message}`); }
  });

  async function calcJobIncome(){
    const jobId = Number($('calcJobId').value);
    if(!jobId){ alert('ใส่ job_id'); return; }
    const box = $('incomeCalcBox');
    box.innerHTML = '<div class="muted">กำลังคำนวณ...</div>';
    try{
      const data = await api(`/admin/super/tech_income/calc/job/${encodeURIComponent(jobId)}`);
      const rows = data.rows || [];
      const meta = data.meta || {};
      const metaHtml = `<div class="rowitem">
        <div>
          <b>สรุป</b>
          <div class="muted">ทีมงาน: ${esc((meta.team||[]).join(', ') || '-') } • โหมดแบ่ง: <b>${esc(meta.mode||'-')}</b></div>
          <div class="muted">service_total (ก่อนส่วนลด): <b>${Number(meta.service_total||0).toFixed(2)}</b> • special_total: <b>${Number(meta.special_total||0).toFixed(2)}</b></div>
        </div>
      </div>`;
      const list = rows.map(r=>{
        return `<div class="rowitem">
          <div>
            <b>${esc(r.username)}</b> <span class="pill gray">${esc(r.income_type)}</span>
            <div class="muted">service_share: <b>${Number(r.service_share||0).toFixed(2)}</b> → service_income: <b>${Number(r.service_income||0).toFixed(2)}</b></div>
            <div class="muted">special_income: <b>${Number(r.special_income||0).toFixed(2)}</b> • total_income: <b>${Number(r.total_income||0).toFixed(2)}</b></div>
          </div>
          <div style="min-width:280px">
            <pre>${esc(JSON.stringify(r.detail||{}, null, 2))}</pre>
          </div>
        </div>`;
      }).join('') || '<div class="muted">(ไม่มีผลลัพธ์)</div>';
      box.innerHTML = metaHtml + list;
    }catch(e){
      box.innerHTML = `<div class="muted">คำนวณไม่สำเร็จ: ${esc(e.message)}</div>`;
    }
  }

  $('btnCalcIncome').addEventListener('click', ()=>calcJobIncome());

  // ===== Audit log =====
  async function loadAudit(){
    const data = await api('/admin/super/audit?limit=200');
    const rows = data.rows || [];
    const box = $('auditBox');
    box.innerHTML = rows.map(r=>{
      const ts = new Date(r.created_at).toLocaleString('th-TH');
      const meta = r.meta_json ? JSON.stringify(r.meta_json) : '';
      return `<div class="audititem">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
          <div>
            <b>${esc(r.action)}</b>
            <div class="muted">${esc(r.actor_username||'-')} • ${esc(r.actor_role||'-')} ${r.target_username?`→ ${esc(r.target_username)}`:''}</div>
          </div>
          <div class="muted" style="white-space:nowrap">${esc(ts)}</div>
        </div>
        ${meta?`<pre>${esc(meta)}</pre>`:''}
      </div>`;
    }).join('') || '<div class="muted">(ไม่มีข้อมูล)</div>';
  }

  $('btnReloadAudit').addEventListener('click', ()=>loadAudit().catch(e=>alert(e.message)));

  // Init
  try{
    await loadUsers();
    await loadAdmins();
    await loadIncomeDefaults();
    await loadIncomeOverrides();
    await loadDurations();
    await loadAudit();
  }catch(e){
    // if some endpoints are missing, show a clear message
    console.error(e);
  }
})();
