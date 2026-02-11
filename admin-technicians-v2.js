/* Admin Technicians v2 (Phase 3 minimal usable) */
(function(){
  const $ = (id)=>document.getElementById(id);
  let currentTech = null;

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
    $('editNewPass').value = '';
    $('editConfirmPass').value = '';
    $('photoStatus').textContent = '—';
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
    };

    await apiFetch(`/admin/technicians/${encodeURIComponent(currentTech.username)}`,{
      method:'PUT',
      body: JSON.stringify(payload)
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
  $('btnUploadPhoto').addEventListener('click', ()=> uploadTechPhoto().catch(e=>showToast(e.message||'อัปโหลดไม่สำเร็จ','error')));
  $('btnOpenSpecial').addEventListener('click', ()=>{
    if (!currentTech) return;
    window.open(`/admin-queue-v2.html?tech=${encodeURIComponent(currentTech.username)}`,'_blank');
  });

  // initial
  loadTechs().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
})();