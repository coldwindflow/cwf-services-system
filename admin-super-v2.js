/* Super Admin v2 (Phase 5)
 * - Manage admins (create/update)
 * - Impersonate admin/technician (with audit log)
 * - Manage Duration rules
 * - View audit log
 */

(async function(){
  // Basic guard: must be super_admin
  try{
    const me = await fetch('/api/auth/me', { credentials:'include' }).then(r=>r.json());
    if(!me || !me.ok) throw new Error('unauthorized');
    const actorRole = (me.actor && me.actor.role) ? me.actor.role : me.role;
    if(actorRole !== 'super_admin') {
      alert('หน้านี้สำหรับ Super Admin เท่านั้น');
      location.replace('/admin-dashboard-v2.html');
      return;
    }
    window.__CWF_ME = me;
  }catch(e){
    location.replace('/login.html');
    return;
  }

  const $ = (id)=>document.getElementById(id);

  function esc(s){
    return String(s||'').replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

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
    if(!res.ok) throw new Error((data&&data.error)||'request failed');
    return data;
  }

  // Tabs
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(t=>{
    t.addEventListener('click', ()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      panels.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      const k=t.getAttribute('data-tab');
      document.querySelector(`.panel[data-panel="${k}"]`).classList.add('active');
    });
  });

  // Header info
  const me = window.__CWF_ME;
  const actorLabel = me.actor ? `${me.actor.username} (${me.actor.role})` : `${me.username} (${me.role})`;
  $('who').textContent = actorLabel;

  // ===== Users list (for impersonation) =====
  async function loadUsers(){
    const role = $('filterRole').value;
    const data = await api(`/admin/super/users${role?`?role=${encodeURIComponent(role)}`:''}`);
    const rows = data.users || [];
    const box = $('usersBox');
    box.innerHTML = rows.map(u=>{
      const nm = u.full_name ? ` — ${esc(u.full_name)}` : '';
      return `<div class="rowitem">
        <div>
          <b>${esc(u.username)}</b> <span class="pill ${u.role==='super_admin'?'blue':(u.role==='admin'?'yellow':'gray')}">${esc(u.role==='super_admin'?'Super Admin':u.role)}</span>
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
          // Keep localStorage in sync so front pages behave like that user
          try{
            localStorage.setItem('cwf_impersonate_by', r.actor.username);
            localStorage.setItem('cwf_impersonate', r.impersonated.username);
            localStorage.setItem('cwf_impersonate_since', String(Date.now()));
            localStorage.setItem('username', r.impersonated.username);
            localStorage.setItem('role', r.impersonated.role);
          }catch(e){}

          toast(`สวมสิทธิเป็น ${r.impersonated.username} แล้ว`);
          if (r.impersonated.role === 'technician') {
            location.href = '/tech.html';
          } else {
            location.href = '/admin-dashboard-v2.html';
          }
        }catch(e){ alert(`สวมสิทธิไม่สำเร็จ: ${e.message}`); }
      });
    });
  }

  $('filterRole').addEventListener('change', loadUsers);
  $('btnReloadUsers').addEventListener('click', loadUsers);

  // Stop impersonation
  $('btnStopImp').addEventListener('click', async ()=>{
    if(!confirm('หยุดสวมสิทธิ และกลับเป็น Super Admin?')) return;
    try{
      await api('/admin/super/impersonate/stop', { method:'POST' });
      try{
        const a = me.actor || { username: me.username, role: me.role };
        localStorage.setItem('username', a.username);
        localStorage.setItem('role', a.role);
        ['cwf_impersonate','cwf_impersonate_by','cwf_impersonate_since'].forEach(k=>localStorage.removeItem(k));
      }catch(e){}
      toast('หยุดสวมสิทธิแล้ว');
      location.href = '/admin-super-v2.html';
    }catch(e){ alert(`หยุดสวมสิทธิไม่สำเร็จ: ${e.message}`); }
  });

  // ===== Admins manage =====
  async function loadAdmins(){
    const data = await api('/admin/super/users?role=admin');
    const data2 = await api('/admin/super/users?role=super_admin');
    const rows = [...(data2.users||[]), ...(data.users||[])];
    const box = $('adminsBox');
    box.innerHTML = rows.map(u=>{
      return `<div class="rowitem">
        <div>
          <b>${esc(u.username)}</b> <span class="pill ${u.role==='super_admin'?'blue':'yellow'}">${esc(u.role==='super_admin'?'Super Admin':'admin')}</span>
          <div class="muted">ชื่อ: ${esc(u.full_name||'-')} • คอมมิชชั่น: ${Number(u.commission_rate_percent||0)}%</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn yellow" data-edit="${esc(u.username)}">แก้ไข</button>
        </div>
      </div>`;
    }).join('') || '<div class="muted">(ไม่มีข้อมูล)</div>';

    box.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const u = btn.getAttribute('data-edit');
        const row = rows.find(x=>x.username===u);
        if(!row) return;
        $('editUser').value = row.username;
        $('editRole').value = row.role;
        $('editName').value = row.full_name||'';
        $('editCommission').value = String(row.commission_rate_percent||0);
        $('editPass').value = '';
        $('editModal').showModal();
      });
    });
  }

  $('btnCreateAdmin').addEventListener('click', async ()=>{
    const username=$('newAdminUser').value.trim();
    const password=$('newAdminPass').value.trim();
    const role=$('newAdminRole').value;
    const full_name=$('newAdminName').value.trim();
    if(!username||!password){ alert('ต้องใส่ username และ password'); return; }
    try{
      await api('/admin/super/admins', { method:'POST', body: JSON.stringify({ username, password, role, full_name })});
      toast('สร้างแอดมินแล้ว');
      $('newAdminUser').value='';$('newAdminPass').value='';$('newAdminName').value='';
      await loadAdmins();
      await loadAudit();
    }catch(e){ alert(`สร้างไม่สำเร็จ: ${e.message}`); }
  });

  $('btnSaveEdit').addEventListener('click', async ()=>{
    const username=$('editUser').value.trim();
    const payload={
      role: $('editRole').value,
      full_name: $('editName').value.trim(),
      commission_rate_percent: Number($('editCommission').value||0)
    };
    const pw=$('editPass').value.trim();
    if(pw) payload.password=pw;
    try{
      await api(`/admin/super/admins/${encodeURIComponent(username)}`, { method:'PUT', body: JSON.stringify(payload)});
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
        $('durKey').value = btn.getAttribute('data-dedit');
        $('durMin').value = btn.getAttribute('data-dmin');
      });
    });
    box.querySelectorAll('[data-ddel]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const key = btn.getAttribute('data-ddel');
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

  $('btnReloadAudit').addEventListener('click', loadAudit);

  // Init
  await loadUsers();
  await loadAdmins();
  await loadDurations();
  await loadAudit();
})();
