/* Admin Technicians v2 (Phase 3 minimal usable) */
(function(){
  const $ = (id)=>document.getElementById(id);

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
    const full_name = prompt('ชื่อจริง', t.full_name || '') ?? null;
    if (full_name === null) return;
    const phone = prompt('เบอร์', t.phone || '') ?? null;
    if (phone === null) return;
    apiFetch(`/admin/technicians/${encodeURIComponent(t.username)}`,{
      method:'PUT',
      body: JSON.stringify({ full_name: String(full_name).trim(), phone: String(phone).trim() })
    }).then(()=>{
      showToast('บันทึกแล้ว','success');
      loadTechs();
    }).catch(e=>showToast(e.message||'บันทึกไม่สำเร็จ','error'));
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
    $('createStatus').textContent = 'กำลังสร้าง...';
    const r = await apiFetch('/admin/technicians/create',{
      method:'POST',
      body: JSON.stringify({ username, password, full_name, phone })
    });
    $('createStatus').textContent = `สร้างแล้ว: ${r.username}`;
    $('newPassword').value = '';
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
              await apiFetch(`/admin/profile/requests/${r.request_id}/decline`,{method:'POST',body:JSON.stringify({reviewed_by:decided_by, admin_note})});
              showToast('ปฏิเสธแล้ว','success'); loadApprovals();
            }},
          ]
        ));
      }
    }
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

  // initial
  loadTechs().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
})();