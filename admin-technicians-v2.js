/* Admin Technicians v2 (Phase 3 minimal usable) */
(function(){
  const $ = (id)=>document.getElementById(id);
  let currentTech = null;
  let currentMatrix = {};

  function setCap(id, v){ const el = $(id); if(el) el.checked = !!v; }
  function getCap(id){ const el = $(id); return !!(el && el.checked); }

  function applyMatrixToUI(mx){
    mx = (mx && typeof mx === 'object') ? mx : {};
    currentMatrix = mx;
    const jt = mx.job_types || {};
    const at = mx.ac_types || {};
    const wv = mx.wash_wall_variants || {};
    setCap('cap_job_install', jt.install);
    setCap('cap_job_wash', jt.wash);
    setCap('cap_job_repair', jt.repair);
    setCap('cap_ac_wall', at.wall);
    setCap('cap_ac_fourway', at.fourway);
    setCap('cap_ac_hanging', at.hanging);
    setCap('cap_ac_ceiling', at.ceiling);
    setCap('cap_wash_normal', wv.normal);
    setCap('cap_wash_premium', wv.premium);
    setCap('cap_wash_coil', wv.coil);
    setCap('cap_wash_overhaul', wv.overhaul);
    updateMatrixSummary();
  }

  function summarize(mx){
    mx = (mx && typeof mx === 'object') ? mx : {};
    const jt = mx.job_types || {};
    const at = mx.ac_types || {};
    const wv = mx.wash_wall_variants || {};
    const pick = (obj, map) => Object.keys(map).filter(k=>obj && obj[k]).map(k=>map[k]);
    const jobs = pick(jt, {install:'ติดตั้ง', wash:'ล้าง', repair:'ซ่อม'});
    const acs = pick(at, {wall:'ผนัง', fourway:'สี่ทิศทาง', hanging:'แขวน', ceiling:'ใต้ฝ้า/เปลือย'});
    const wss = pick(wv, {normal:'ธรรมดา', premium:'พรีเมียม', coil:'แขวนคอยล์', overhaul:'ตัดล้าง'});
    const any = jobs.length || acs.length || wss.length;
    if (!any) return 'ยังไม่ได้เลือกงานที่รับได้ (จะไม่แสดงในสลอตลูกค้า)';
    const parts = [];
    if (jobs.length) parts.push(`งาน: ${jobs.join(', ')}`);
    if (acs.length) parts.push(`แอร์: ${acs.join(', ')}`);
    if (wss.length) parts.push(`ล้างผนัง: ${wss.join(', ')}`);
    return parts.join(' • ');
  }

  function updateMatrixSummary(){
    const el = $('matrixSummary');
    if (!el) return;
    el.textContent = summarize(collectMatrixFromUI());
  }

  function collectMatrixFromUI(){
    const jt = {
      install: getCap('cap_job_install'),
      wash: getCap('cap_job_wash'),
      repair: getCap('cap_job_repair'),
    };
    const at = {
      wall: getCap('cap_ac_wall'),
      fourway: getCap('cap_ac_fourway'),
      hanging: getCap('cap_ac_hanging'),
      ceiling: getCap('cap_ac_ceiling'),
    };
    const wv = {
      normal: getCap('cap_wash_normal'),
      premium: getCap('cap_wash_premium'),
      coil: getCap('cap_wash_coil'),
      overhaul: getCap('cap_wash_overhaul'),
    };

    // ✅ Spec: If not tick anything => DO NOT show in customer slots
    return { job_types: jt, ac_types: at, wash_wall_variants: wv };
  }

  function openMatrix(){
    if (!$('matrixModal')) return;
    $('matrixModal').style.display = 'flex';
    updateMatrixSummary();
  }
  function closeMatrix(){
    if ($('matrixModal')) $('matrixModal').style.display = 'none';
  }
  function clearMatrix(){
    ['cap_job_install','cap_job_wash','cap_job_repair','cap_ac_wall','cap_ac_fourway','cap_ac_hanging','cap_ac_ceiling','cap_wash_normal','cap_wash_premium','cap_wash_coil','cap_wash_overhaul']
      .forEach(id=>{ const el=$(id); if(el) el.checked=false; });
    updateMatrixSummary();
  }

  function setTab(name){
    document.querySelectorAll('.tab').forEach(b=>{
      b.classList.toggle('active', b.getAttribute('data-tab')===name);
    });
    $('tabList').style.display = (name==='list') ? '' : 'none';
    $('tabCreate').style.display = (name==='create') ? '' : 'none';
    $('tabApprovals').style.display = (name==='approvals') ? '' : 'none';
  }

  function techItemRow(t){
    const wrap = document.createElement('div');
    wrap.className = 'item';
    const full = t.full_name || t.username;
    wrap.innerHTML = `
      <div style="min-width:0">
        <b>${full}</b>
        <div class="muted">${t.username} • ${t.phone || '-'} • ${t.accept_status || '-'}</div>
      </div>
      <button class="btn gray" type="button">แก้ไข</button>
    `;
    wrap.querySelector('button').addEventListener('click', ()=> openEdit(t));
    return wrap;
  }

  function openEdit(t){
    currentTech = t;
    $('editTitle').textContent = `${t.full_name || t.username} (${t.username})`;
    $('editFullName').value = t.full_name || '';
    $('editTechCode').value = t.technician_code || '';
    $('editPhone').value = t.phone || '';
    $('editEmployment').value = (t.employment_type || 'company');
    $('editWorkStart').value = t.work_start || '09:00';
    $('editWorkEnd').value = t.work_end || '18:00';
    // slot visibility (default true)
    const sv = (t.customer_slot_visible === false) ? false : true;
    if ($('editCustomerSlotVisible')) $('editCustomerSlotVisible').checked = !!sv;
    $('editNewPass').value = '';
    $('editConfirmPass').value = '';
    $('photoStatus').textContent = '—';
    // load service matrix
    applyMatrixToUI({});
    apiFetch(`/admin/technicians/${encodeURIComponent(t.username)}/service-matrix`)
      .then(r=> applyMatrixToUI(r.matrix_json || r.matrix || {}))
      .catch(()=> applyMatrixToUI({}));
    $('editModal').style.display = 'flex';
  }

  function closeEdit(){
    $('editModal').style.display = 'none';
    currentTech = null;
  }

  async function loadTechs(){
    const q = String($('q').value||'').trim().toLowerCase();
    const rows = await apiFetch('/admin/technicians');
    const filtered = (rows||[]).filter(r=>{
      if (!q) return true;
      const s = `${r.username||''} ${r.full_name||''} ${r.phone||''}`.toLowerCase();
      return s.includes(q);
    });
    const list = $('techList');
    list.innerHTML = '';
    if (!filtered.length){
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `<div><b>ไม่พบรายการ</b><div class="muted">ลองค้นหาใหม่</div></div><div class="pill">—</div>`;
      list.appendChild(d);
      return;
    }
    for (const r of filtered) list.appendChild(techItemRow(r));
  }

  async function createTech(){
    const username = String($('newUsername').value||'').trim();
    const password = String($('newPassword').value||'').trim();
    const full_name = String($('newFullName').value||'').trim();
    const phone = String($('newPhone').value||'').trim();
    const technician_code = String($('newTechCode').value||'').trim();
    const employment_type = String($('newEmployment').value||'company').trim();
    $('createStatus').textContent = 'กำลังสร้าง...';
    const r = await apiFetch('/admin/technicians/create',{
      method:'POST',
      body: JSON.stringify({ username, password, full_name, phone, technician_code, employment_type })
    });
    $('createStatus').textContent = `สร้างแล้ว: ${r.username}`;
    $('newPassword').value = '';
    $('newUsername').value = '';
    showToast('สร้าง ID ช่างแล้ว','success');
  }

  function reqRow(title, sub, actions){
    const d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = `
      <div style="min-width:0">
        <b>${title}</b>
        <div class="muted">${sub}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end"></div>
    `;
    const box = d.querySelector('div:last-child');
    actions.forEach(a=>{
      const b = document.createElement('button');
      b.className = `btn ${a.kind}`;
      b.textContent = a.text;
      b.addEventListener('click', a.onClick);
      box.appendChild(b);
    });
    return d;
  }

  async function loadApprovals(){
    // pricing requests
    const me = (await apiFetch('/admin/profile_v2/me')).me;
    const decided_by = me.username || 'admin';

    const price = await apiFetch('/admin/pricing-requests').catch(()=>[]);
    const priceBox = $('priceReqList');
    priceBox.innerHTML = '';
    if (!price.length){
      priceBox.appendChild(reqRow('ไม่มีคำขอ', '—', [{text:'รีเฟรช',kind:'gray',onClick:loadApprovals}]));
    }else{
      for (const r of price){
        const code = r.booking_code || `#${r.job_id}`;
        priceBox.appendChild(reqRow(
          `${code} • ${r.requested_by}`,
          `ขอแก้ไขราคา • ${new Date(r.created_at).toLocaleString('th-TH')}`,
          [
            {text:'อนุมัติ',kind:'yellow',onClick: async ()=>{
              await apiFetch(`/admin/pricing-requests/${r.request_id}/approve`,{method:'POST',body:JSON.stringify({decided_by})});
              showToast('อนุมัติแล้ว','success'); loadApprovals();
            }},
            {text:'ปฏิเสธ',kind:'gray',onClick: async ()=>{
              const admin_note = prompt('เหตุผล (optional)','') || '';
              await apiFetch(`/admin/pricing-requests/${r.request_id}/decline`,{method:'POST',body:JSON.stringify({decided_by, admin_note})});
              showToast('ปฏิเสธแล้ว','success'); loadApprovals();
            }},
          ]
        ));
      }
    }

    const prof = await apiFetch('/admin/profile/requests').catch(()=>[]);
    const profBox = $('profileReqList');
    profBox.innerHTML = '';
    if (!prof.length){
      profBox.appendChild(reqRow('ไม่มีคำขอ', '—', [{text:'รีเฟรช',kind:'gray',onClick:loadApprovals}]));
    }else{
      for (const r of prof){
        profBox.appendChild(reqRow(
          `${r.username} • ขอแก้โปรไฟล์`,
          `${new Date(r.created_at).toLocaleString('th-TH')}`,
          [
            {text:'อนุมัติ',kind:'yellow',onClick: async ()=>{
              await apiFetch(`/admin/profile/requests/${r.request_id}/approve`,{method:'POST',body:JSON.stringify({reviewed_by:decided_by})});
              showToast('อนุมัติแล้ว','success'); loadApprovals();
            }},
            {text:'ปฏิเสธ',kind:'gray',onClick: async ()=>{
              const admin_note = prompt('เหตุผล (optional)','') || '';
              await apiFetch(`/admin/profile/requests/${r.request_id}/reject`,{method:'POST',body:JSON.stringify({reviewed_by:decided_by, admin_note})});
              showToast('ปฏิเสธแล้ว','success'); loadApprovals();
            }},
          ]
        ));
      }
    }
  }

  async function saveEdit(){
    if (!currentTech) return;
    const payload = {
      full_name: String($('editFullName').value||'').trim(),
      technician_code: String($('editTechCode').value||'').trim(),
      phone: String($('editPhone').value||'').trim(),
      employment_type: String($('editEmployment').value||'company').trim(),
      work_start: String($('editWorkStart').value||'').trim(),
      work_end: String($('editWorkEnd').value||'').trim(),
      new_password: String($('editNewPass').value||''),
      confirm_password: String($('editConfirmPass').value||''),
      customer_slot_visible: !!($('editCustomerSlotVisible') && $('editCustomerSlotVisible').checked),
    };

    await apiFetch(`/admin/technicians/${encodeURIComponent(currentTech.username)}`,{
      method:'PUT',
      body: JSON.stringify(payload)
    });

    // save service matrix (Option B - strict)
    const matrix_json = collectMatrixFromUI();
    await apiFetch(`/admin/technicians/${encodeURIComponent(currentTech.username)}/service-matrix`,{
      method:'PUT',
      body: JSON.stringify({ matrix_json })
    });
    showToast('บันทึกแล้ว','success');
    closeEdit();
    loadTechs();
  }

  async function uploadTechPhoto(){
    if (!currentTech) return;
    const f = $('editPhoto').files?.[0];
    if (!f) return showToast('เลือกรูปก่อน','error');
    $('photoStatus').textContent = 'กำลังอัปโหลด...';
    const fd = new FormData();
    fd.append('photo', f);
    const resp = await fetch(`/admin/technicians/${encodeURIComponent(currentTech.username)}/photo`,{
      method:'POST',
      body: fd,
      credentials: 'include'
    });
    const json = await resp.json().catch(()=>({}));
    if (!resp.ok) throw new Error(json?.error || 'อัปโหลดไม่สำเร็จ');
    $('photoStatus').textContent = 'อัปโหลดแล้ว';
    showToast('อัปโหลดรูปแล้ว','success');
    // refresh current list
    loadTechs().catch(()=>{});
  }

  document.querySelectorAll('.tab').forEach(b=>{
    b.addEventListener('click', ()=>{
      const tab = b.getAttribute('data-tab');
      setTab(tab);
      if (tab==='list') loadTechs().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
      if (tab==='approvals') loadApprovals().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
    });
  });

  $('btnReload').addEventListener('click', ()=> loadTechs().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')));
  $('q').addEventListener('input', ()=> loadTechs().catch(()=>{}));
  $('btnCreate').addEventListener('click', ()=> createTech().catch(e=>showToast(e.message||'สร้างไม่สำเร็จ','error')));

  // modal
  $('btnCloseEdit').addEventListener('click', closeEdit);
  $('editModal').addEventListener('click', (e)=>{ if (e.target && e.target.id==='editModal') closeEdit(); });
  $('btnSaveEdit').addEventListener('click', ()=> saveEdit().catch(e=>showToast(e.message||'บันทึกไม่สำเร็จ','error')));
  // matrix modal
  if ($('btnOpenMatrix')) $('btnOpenMatrix').addEventListener('click', openMatrix);
  if ($('btnCloseMatrix')) $('btnCloseMatrix').addEventListener('click', closeMatrix);
  if ($('matrixModal')) $('matrixModal').addEventListener('click', (e)=>{ if (e.target && e.target.id==='matrixModal') closeMatrix(); });
  if ($('btnApplyMatrix')) $('btnApplyMatrix').addEventListener('click', ()=>{ updateMatrixSummary(); closeMatrix(); });
  if ($('btnClearMatrix')) $('btnClearMatrix').addEventListener('click', clearMatrix);

  // update summary when toggling caps
  ['cap_job_install','cap_job_wash','cap_job_repair','cap_ac_wall','cap_ac_fourway','cap_ac_hanging','cap_ac_ceiling','cap_wash_normal','cap_wash_premium','cap_wash_coil','cap_wash_overhaul']
    .forEach(id=>{ const el=$(id); if(el) el.addEventListener('change', updateMatrixSummary); });
  $('btnUploadPhoto').addEventListener('click', ()=> uploadTechPhoto().catch(e=>showToast(e.message||'อัปโหลดไม่สำเร็จ','error')));
  $('btnOpenSpecial').addEventListener('click', ()=>{
    if (!currentTech) return;
    window.open(`/admin-queue-v2.html?tech=${encodeURIComponent(currentTech.username)}`,'_blank');
  });

  // initial
  loadTechs().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
})();