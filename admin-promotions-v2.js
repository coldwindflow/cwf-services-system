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

let editingRuleId = null;

function fmtMoney(v){
  const n = Number(v || 0);
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

const PRICE_RULE_RISK_LABELS = {
  MISSING_JOB_TYPE: 'missing job type',
  MISSING_AC_TYPE: 'missing AC type',
  UNSUPPORTED_JOB_TYPE: 'unsupported job type',
  UNSUPPORTED_AC_TYPE: 'unsupported AC type',
  INVALID_PRICE: 'invalid price',
  ACTIVE_PRICE_ABOVE_NORMAL: 'active price above normal',
  PRICE_OUTLIER: 'price outlier',
  INVALID_BTU_RANGE: 'invalid BTU range',
  INVALID_MACHINE_RANGE: 'invalid machine range',
  INVALID_DATE_RANGE: 'invalid date range',
  PRODUCT_RULE_LEAK: 'product-linked rule',
  CATALOG_SCOPE_MISMATCH: 'catalog scope mismatch',
  CATALOG_LINKAGE_UNVERIFIED: 'catalog linkage unverified',
  OVERLAPPING_ACTIVE_RULE: 'overlapping active rule',
  AUTO_PRICING_UNSUPPORTED: 'auto pricing unsupported',
  INVALID_PRIORITY: 'invalid priority',
  UNSUPPORTED_WASH_VARIANT: 'unsupported wash variant',
};

function riskText(codes){
  return (codes || []).map((c) => PRICE_RULE_RISK_LABELS[c] || c).join(', ');
}

function clientPriceRuleRisks(body){
  const risks = [];
  if(!body.job_type) risks.push('MISSING_JOB_TYPE');
  if(!body.ac_type) risks.push('MISSING_AC_TYPE');
  if(!Number.isFinite(Number(body.normal_price)) || Number(body.normal_price) <= 0 || !Number.isFinite(Number(body.active_price)) || Number(body.active_price) <= 0) risks.push('INVALID_PRICE');
  if(Number(body.active_price) > Number(body.normal_price)) risks.push('ACTIVE_PRICE_ABOVE_NORMAL');
  if(body.btu_min && (!Number.isFinite(Number(body.btu_min)) || Number(body.btu_min) <= 0)) risks.push('INVALID_BTU_RANGE');
  if(body.btu_max && (!Number.isFinite(Number(body.btu_max)) || Number(body.btu_max) <= 0)) risks.push('INVALID_BTU_RANGE');
  if(body.btu_min && body.btu_max && Number(body.btu_min) > Number(body.btu_max)) risks.push('INVALID_BTU_RANGE');
  if(body.effective_from && body.effective_to && Date.parse(body.effective_from) > Date.parse(body.effective_to)) risks.push('INVALID_DATE_RANGE');
  if(!Number.isInteger(Number(body.priority)) || Number(body.priority) < -1000 || Number(body.priority) > 1000) risks.push('INVALID_PRIORITY');
  return [...new Set(risks)];
}

function pricePayload(){
  const from = (el('price_effective_from')?.value || '').trim();
  const to = (el('price_effective_to')?.value || '').trim();
  return {
    job_type: (el('price_job_type').value || '').trim(),
    ac_type: (el('price_ac_type').value || '').trim(),
    wash_variant: (el('price_wash_variant').value || '').trim() || null,
    btu_min: (el('price_btu_min').value || '').trim() || null,
    btu_max: (el('price_btu_max').value || '').trim() || null,
    normal_price: Number(el('price_normal_price').value || 0),
    active_price: Number(el('price_active_price').value || 0),
    label: (el('price_label').value || '').trim() || null,
    campaign_name: (el('price_campaign_name').value || '').trim() || null,
    effective_from: from ? `${from}T00:00:00+07:00` : null,
    effective_to: to ? `${to}T23:59:59+07:00` : null,
    priority: Number(el('price_priority').value || 0),
    is_active: el('price_is_active')?.value !== '0',
  };
}

function resetPriceForm(){
  editingRuleId = null;
  el('price_job_type').value = 'ล้าง';
  el('price_ac_type').value = 'ผนัง';
  el('price_wash_variant').value = 'ล้างธรรมดา';
  el('price_btu_min').value = '';
  el('price_btu_max').value = '';
  el('price_normal_price').value = '';
  el('price_active_price').value = '';
  el('price_label').value = '';
  el('price_campaign_name').value = '';
  if(el('price_effective_from')) el('price_effective_from').value = '';
  if(el('price_effective_to')) el('price_effective_to').value = '';
  if(el('price_is_active')) el('price_is_active').value = '1';
  el('price_priority').value = '10';
  el('btnSavePriceRule').textContent = 'บันทึกราคา';
}

function dateInputValue(value){
  const s = String(value || '').trim();
  if(!s) return '';
  return s.slice(0, 10);
}

function priceRuleCard(r){
  const active = !!r.is_active;
  const risks = r.risk_codes || [];
  const unsafe = risks.length || r.is_safe_for_service_pricing === false;
  const range = `${r.btu_min || 0}${r.btu_max ? `-${r.btu_max}` : '+'} BTU`;
  const promo = r.campaign_name || r.label || '';
  const dates = [dateInputValue(r.effective_from), dateInputValue(r.effective_to)].filter(Boolean).join(' ถึง ');
  const linkedCount = Number(r.linked_catalog_item_count || 0);
  const linkMeta = linkedCount
    ? `Linked catalog: ${linkedCount}${r.linked_catalog_has_product ? ' • product-linked' : ''}${r.catalog_linkage_status && r.catalog_linkage_status !== 'verified' ? ` • ${r.catalog_linkage_status}` : ''}`
    : (r.catalog_linkage_status && r.catalog_linkage_status !== 'verified' ? `Catalog linkage: ${r.catalog_linkage_status}` : '');
  return `
  <div class="svc-row" style="align-items:flex-start">
    <div class="svc-main" style="flex:1">
      <div class="svc-title"><b>${r.job_type || '-'} / ${r.ac_type || '-'} ${r.wash_variant || ''}</b></div>
      <div class="muted2 mini">${range} • ปกติ ${fmtMoney(r.normal_price)} บาท • ใช้จริง ${fmtMoney(r.active_price)} บาท</div>
      <div class="muted2 mini">${promo ? `แคมเปญ: ${promo} • ` : ''}${dates ? `ช่วงเวลา: ${dates} • ` : ''}priority ${Number(r.priority || 0)} • สถานะ: <b>${active ? 'เปิดใช้' : 'ปิด'}</b></div>
      ${linkMeta ? `<div class="muted2 mini">${linkMeta}</div>` : ''}
      ${unsafe ? `<div class="muted2 mini" style="color:#991b1b">Risk: ${riskText(risks)}</div>` : ''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="secondary btn-small" data-price-act="edit" data-id="${r.rule_id}">แก้ไข</button>
      <button class="secondary btn-small" data-price-act="toggle" data-id="${r.rule_id}" data-active="${active ? '1' : '0'}">${active ? 'ปิด' : 'เปิด'}</button>
    </div>
  </div>`;
}

async function loadPriceRules(){
  const box = el('price_rule_list');
  if (!box) return;
  box.innerHTML = 'กำลังโหลดราคา...';
  try{
    const r = await apiFetch('/admin/customer-pricing/rules');
    const rules = r.rules || [];
    window.__priceRules = rules;
    box.innerHTML = rules.map(priceRuleCard).join('') || `<div class="muted2">ยังไม่มีราคาบริการ</div>`;
    const riskyCount = rules.filter((rule) => (rule.risk_codes || []).length || rule.is_safe_for_service_pricing === false).length;
    if (riskyCount) {
      box.innerHTML = `<div class="svc-row" style="border-color:#fecaca;background:#fff1f2;color:#991b1b">Risky service price rules: ${riskyCount}</div>` + box.innerHTML;
    }
  }catch(e){
    box.innerHTML = `<div class="muted2">โหลดราคาบริการไม่สำเร็จ: ${e.message}</div>`;
  }
}

async function savePriceRule(){
  const body = pricePayload();
  if(!body.job_type || !body.ac_type || !body.normal_price || !body.active_price){
    showToast('กรอกประเภทงาน ประเภทแอร์ ราคาปกติ และราคาที่ใช้จริง', 'error');
    return;
  }
  const risks = clientPriceRuleRisks(body);
  if(risks.length){
    showToast(`Rule เสี่ยง: ${riskText(risks)}`, 'error');
    return;
  }
  try{
    const url = editingRuleId ? `/admin/customer-pricing/rules/${editingRuleId}` : '/admin/customer-pricing/rules';
    await apiFetch(url, { method: editingRuleId ? 'PUT' : 'POST', body: JSON.stringify(body) });
    showToast('บันทึกราคาแล้ว', 'success');
    resetPriceForm();
    await loadPriceRules();
  }catch(e){
    showToast(e.message, 'error');
  }
}

function editPriceRule(id){
  const r = (window.__priceRules || []).find(x => Number(x.rule_id) === Number(id));
  if(!r) return;
  editingRuleId = Number(id);
  el('price_job_type').value = r.job_type || 'ล้าง';
  el('price_ac_type').value = r.ac_type || 'ผนัง';
  el('price_wash_variant').value = r.wash_variant || '';
  el('price_btu_min').value = r.btu_min || '';
  el('price_btu_max').value = r.btu_max || '';
  el('price_normal_price').value = Number(r.normal_price || 0);
  el('price_active_price').value = Number(r.active_price || 0);
  el('price_label').value = r.label || '';
  el('price_campaign_name').value = r.campaign_name || '';
  if(el('price_effective_from')) el('price_effective_from').value = dateInputValue(r.effective_from);
  if(el('price_effective_to')) el('price_effective_to').value = dateInputValue(r.effective_to);
  if(el('price_is_active')) el('price_is_active').value = r.is_active === false ? '0' : '1';
  el('price_priority').value = Number(r.priority || 0);
  el('btnSavePriceRule').textContent = 'บันทึกการแก้ไข';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function togglePriceRule(id, currentActive){
  if(currentActive === false){
    const rule = (window.__priceRules || []).find((r) => Number(r.rule_id) === Number(id));
    const risks = rule ? (rule.risk_codes || []) : [];
    if(risks.length || rule?.is_safe_for_service_pricing === false){
      showToast(`เปิดใช้ไม่ได้: ${riskText(risks)}`, 'error');
      return;
    }
  }
  try{
    await apiFetch(`/admin/customer-pricing/rules/${id}/toggle`, { method:'PATCH', body: JSON.stringify({ is_active: !currentActive }) });
    await loadPriceRules();
  }catch(e){
    showToast(e.message, 'error');
  }
}

async function seedRainySeason(){
  try{
    await apiFetch('/admin/customer-pricing/seed-rainy-season-promo', { method:'POST', body: JSON.stringify({}) });
    showToast('เพิ่มราคาโปรหน้าฝนแล้ว', 'success');
    await loadPriceRules();
  }catch(e){
    showToast(e.message, 'error');
  }
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
  document.getElementById('btnNewPriceCampaign')?.addEventListener('click', ()=>{
    resetPriceForm();
    document.getElementById('price_campaign_name')?.focus();
  });
  document.getElementById('btnSeedRainy')?.addEventListener('click', seedRainySeason);
  document.getElementById('btnSavePriceRule')?.addEventListener('click', savePriceRule);
  document.getElementById('btnResetPriceRule')?.addEventListener('click', resetPriceForm);
  document.getElementById('btnCreatePromo')?.addEventListener('click', createPromo);
  document.getElementById('btnReload')?.addEventListener('click', loadPromos);

  document.addEventListener('click', (e)=>{
    const priceBtn = e.target.closest('button[data-price-act]');
    if(priceBtn){
      const act = priceBtn.getAttribute('data-price-act');
      const id = Number(priceBtn.getAttribute('data-id'));
      if(act === 'edit') editPriceRule(id);
      if(act === 'toggle') togglePriceRule(id, priceBtn.getAttribute('data-active') === '1');
      return;
    }
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
  await loadPriceRules();
  await loadPromos();
});
