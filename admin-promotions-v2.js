function logoutNow(){
  try{
    localStorage.removeItem('admin_token');
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
  }catch(e){}
  try{
    const secure = (location.protocol === 'https:') ? '; Secure' : '';
    document.cookie = `cwf_auth=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
    document.cookie = `cwf_auth=; Max-Age=0; Path=/;`;
  }catch(e){}
  location.replace('/login.html');
}

function rowCard(p){
  const active = !!p.is_active;
  const visible = !!p.is_customer_visible;
  const conds = [];
  if(p.job_type) conds.push(`งาน:${p.job_type}`);
  if(p.ac_type) conds.push(`แอร์:${p.ac_type}`);
  if(p.btu_min) conds.push(`BTU≥${p.btu_min}`);
  if(p.btu_max) conds.push(`BTU≤${p.btu_max}`);
  if(p.machine_min) conds.push(`เครื่อง≥${p.machine_min}`);
  if(p.machine_max) conds.push(`เครื่อง≤${p.machine_max}`);
  if(p.wash_variant) conds.push(`ล้าง:${p.wash_variant}`);
  if(Number(p.priority||0)) conds.push(`prio:${Number(p.priority||0)}`);
  return `
  <div class="svc-row" style="align-items:flex-start">
    <div class="svc-main" style="flex:1">
      <div class="svc-title"><b>${p.promo_name}</b></div>
      <div class="muted2 mini">#${p.promo_id} • ${p.promo_type} ${p.promo_value} • ลูกค้าเห็น: ${visible ? 'ใช่' : 'ไม่'}</div>
      <div class="muted2 mini">เงื่อนไข: ${conds.length ? conds.join(' • ') : 'ทั้งหมด'}</div>
      <div class="muted2 mini">สถานะ: <b>${active ? 'ใช้งาน' : 'ปิด'}</b></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="secondary btn-small" data-act="toggle" data-id="${p.promo_id}">${active ? 'ปิด' : 'เปิด'}</button>
      <button class="danger btn-small" data-act="delete" data-id="${p.promo_id}">ลบ</button>
    </div>
  </div>`;
}

async function loadPromos(){
  const box = document.getElementById('promo_list');
  box.innerHTML = "กำลังโหลด...";
  try{
    const r = await apiFetch('/admin/promotions_v2');
    const arr = (r.promotions||[]);
    box.innerHTML = arr.map(rowCard).join('') || `<div class="muted2">ไม่มีโปรโมชัน</div>`;
  }catch(e){
    box.innerHTML = `<div class="muted2">โหลดไม่สำเร็จ: ${e.message}</div>`;
  }
}

async function createPromo(){
  const promo_name = (el('promo_name').value||'').trim();
  const promo_type = (el('promo_type').value||'').trim();
  const promo_value = Number(el('promo_value').value||0);
  const is_customer_visible = el('is_customer_visible').value === '1';
  const job_type = (el('cond_job_type')?.value||'').trim();
  const ac_type = (el('cond_ac_type')?.value||'').trim();
  const wash_variant = (el('cond_wash_variant')?.value||'').trim();
  const btu_min = (el('cond_btu_min')?.value||'').trim();
  const btu_max = (el('cond_btu_max')?.value||'').trim();
  const machine_min = (el('cond_machine_min')?.value||'').trim();
  const machine_max = (el('cond_machine_max')?.value||'').trim();
  const priority = Number(el('cond_priority')?.value||0);
  if(!promo_name){ showToast('กรอกชื่อโปรโมชัน', 'error'); return; }
  try{
    await apiFetch('/admin/promotions_v2', { method:'POST', body: JSON.stringify({
      promo_name,
      promo_type,
      promo_value,
      is_customer_visible,
      is_active:true,
      job_type: job_type || null,
      ac_type: ac_type || null,
      wash_variant: wash_variant || null,
      btu_min: btu_min || null,
      btu_max: btu_max || null,
      machine_min: machine_min || null,
      machine_max: machine_max || null,
      priority: Number.isFinite(priority) ? priority : 0,
    })});
    showToast('บันทึกแล้ว', 'success');
    el('promo_name').value='';
    el('promo_value').value='0';
    if(el('cond_btu_min')) el('cond_btu_min').value='';
    if(el('cond_btu_max')) el('cond_btu_max').value='';
    if(el('cond_machine_min')) el('cond_machine_min').value='';
    if(el('cond_machine_max')) el('cond_machine_max').value='';
    if(el('cond_priority')) el('cond_priority').value='0';
    await loadPromos();
  }catch(e){
    showToast(e.message, 'error');
  }
}

async function togglePromo(id, nextActive){
  try{
    await apiFetch(`/admin/promotions_v2/${id}`, { method:'PUT', body: JSON.stringify({ is_active: nextActive })});
    await loadPromos();
  }catch(e){
    showToast(e.message, 'error');
  }
}

async function deletePromo(id){
  if(!confirm('ลบโปรโมชันนี้?')) return;
  try{
    await apiFetch(`/admin/promotions_v2/${id}`, { method:'DELETE' });
    await loadPromos();
  }catch(e){
    showToast(e.message, 'error');
  }
}

function wire(){
  document.getElementById('btnLogout')?.addEventListener('click', logoutNow);
  document.getElementById('btnCreatePromo')?.addEventListener('click', createPromo);
  document.getElementById('btnReload')?.addEventListener('click', loadPromos);

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const act = btn.getAttribute('data-act');
    const id = Number(btn.getAttribute('data-id'));
    if(act==='toggle'){
      const next = btn.textContent.includes('เปิด');
      togglePromo(id, next);
    }
    if(act==='delete'){
      deletePromo(id);
    }
  });
}

document.addEventListener('DOMContentLoaded', async ()=>{
  wire();
  await loadPromos();
});
