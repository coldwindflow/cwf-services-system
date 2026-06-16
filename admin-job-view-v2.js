/* Admin v2 - Job Detail
 * Requirements:
 * - Show full job info + items + pricing summary
 * - Show uploaded photos (downloadable)
 * - Show updates timeline (job_updates_v2)
 * - Return for fix (within warranty only, reason required)
 * - Extend warranty (audit via updates)
 * - Clone job (new job_id, copy customer/address/items, allow change job_type and drop items)
 * 
 * Note: Uses /admin/job_v2/:id and new endpoints:
 *  - /admin/jobs/:id/return_for_fix_v2
 *  - /admin/jobs/:id/extend_warranty_v2
 *  - /admin/jobs/:id/clone_v2
 */

console.info('[admin-job-view] rework UI v3 loaded');
console.info('[admin-job-edit] service builder v2 loaded');

function safe(t){ return (t||'').toString(); }
function fmtDT(iso){
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toLocalDatetimeInput(iso){
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p)=>[p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
  } catch {
    return '';
  }
}

function localDatetimeToBangkokISO(localValue){
  // localValue from <input type="datetime-local"> (no timezone)
  const s = String(localValue||'').trim();
  if (!s) return '';
  // ensure seconds
  const hasSeconds = /\d{2}:\d{2}:\d{2}$/.test(s);
  const base = hasSeconds ? s : `${s}:00`;
  // treat as Bangkok (+07:00) to avoid UTC shift
  return `${base}+07:00`;
}

function buildAdminEditItemsSnapshot(items){
  return (Array.isArray(items) ? items : [])
    .map(it=>({
      item_id: it.item_id ? Number(it.item_id) : null,
      item_name: String(it.item_name||'').trim(),
      qty: Number(it.qty||0),
      unit_price: Number(it.unit_price||0),
      assigned_technician_username: String(it.assigned_technician_username||'').trim() || null,
    }))
    .filter(it=>it.item_name);
}

function buildAdminEditTeamSnapshot(primaryUsername, members){
  const primary = String(primaryUsername||'').trim() || null;
  let list = (Array.isArray(members) ? members : []).map(x=>String(x||'').trim()).filter(Boolean);
  if (primary && !list.includes(primary)) list.unshift(primary);
  list = Array.from(new Set(list)).sort((a,b)=>a.localeCompare(b));
  return {
    primary_username: primary && list.includes(primary) ? primary : (list[0] || null),
    members: list,
  };
}

function statusPill(status){
  const s = String(status||'').trim();
  let st = 'background:#0f172a;color:#fff;border-color:transparent';
  if (s.includes('รอ')) st = 'background:#fbbf24;color:#000;border-color:transparent'; // yellow => black
  else if (s.includes('กำลัง') || s.includes('เริ่ม')) st = 'background:#2563eb;color:#fff;border-color:transparent'; // blue => white
  else if (s.includes('เสร็จ')) st = 'background:#16a34a;color:#fff;border-color:transparent';
  else if (s.includes('ยกเลิก')) st = 'background:#ef4444;color:#fff;border-color:transparent';
  else if (s.includes('แก้ไข') || s.includes('ตีกลับ')) st = 'background:#a855f7;color:#fff;border-color:transparent';
  return `<span class="pill" style="${st}">${escapeHtml(s)||'-'}</span>`;
}

function escapeHtml(str){
  return String(str||'')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DEDUCTION_CASE_TYPES = [
  'late_arrival','missing_status_update','missing_required_photos','poor_work_quality',
  'customer_complaint_valid','left_before_complete','no_show','same_day_cancel',
  'warranty_rework_minor','warranty_rework_major','rework_failed','replacement_technician_cost',
  'customer_property_damage','company_equipment_damage','off_platform_payment',
  'confidentiality_breach','fraud_or_false_report','deposit_installment',
  'deposit_damage_offset','manual_adjustment','overpayment_recovery',
];
const REWORK_CASE_REASON_TYPES = ['water_leak','not_clean','customer_complaint','missing_photos','same_issue_not_fixed','poor_work_standard','other'];
const REWORK_CASE_REASON_LABELS = {
  water_leak: 'น้ำหยด / น้ำรั่ว',
  not_clean: 'ล้างไม่สะอาด',
  customer_complaint: 'ลูกค้าร้องเรียน',
  missing_photos: 'รูปไม่ครบ',
  same_issue_not_fixed: 'อาการเดิมยังไม่หาย',
  poor_work_standard: 'งานไม่ได้มาตรฐาน',
  other: 'อื่น ๆ',
};
const DEDUCTION_WARNING_TEXT = 'ยอดนี้ยังไม่ถูกนำไปรวมในรอบจ่ายเงิน จนกว่าจะกดนำเข้ารอบจ่าย';

function ensureCaseModal(){
  if (!document.getElementById('caseModalStyle')) {
    const style = document.createElement('style');
    style.id = 'caseModalStyle';
    style.textContent = `
      .caseModalBackdrop{position:fixed;inset:0;z-index:4200;display:none;background:rgba(2,6,23,.58);padding:12px;overflow:auto}
      .caseModal{max-width:760px;margin:24px auto;background:#fff;border:1px solid rgba(21,88,214,.18);border-radius:12px;box-shadow:0 28px 86px rgba(2,6,23,.32);overflow:hidden}
      .caseModalHead{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#071947;color:#fff;padding:13px 14px}
      .caseModalHead b{font-size:17px}.caseModalBody{padding:14px}
      .caseGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
      .caseGrid .full{grid-column:1/-1}.caseGrid label{font-size:12px;font-weight:1000;color:#64748b;margin-bottom:5px;display:block}
      .caseGrid input,.caseGrid select,.caseGrid textarea{width:100%;min-height:42px;border:1px solid #d9e5ff;border-radius:8px;padding:10px 11px;background:#fff;color:#09152f;font:inherit}
      .caseActions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:12px}
      .caseBtn{border:0;border-radius:14px;padding:11px 14px;font-weight:1000;cursor:pointer;min-height:44px}
      .caseBtn.blue{background:linear-gradient(135deg,#071947,#1558d6);color:#fff}.caseBtn.yellow{background:linear-gradient(135deg,#ffe875,#ffcc00);color:#111827}
      .caseNotice{background:#fff7cc;border:1px solid #f4c430;color:#5c4300;border-radius:8px;padding:11px 12px;font-weight:900}
      .caseList{display:grid;gap:10px}.caseItem{border:1px solid #d9e5ff;border-radius:8px;padding:11px;background:#f8fbff}
      .caseMeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;color:#64748b;font-size:12px;font-weight:800}
      .reworkPanel{border:1px solid rgba(21,88,214,.14);border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);padding:14px;box-shadow:0 12px 30px rgba(2,6,23,.06)}
      .reworkHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
      .reworkTitle{display:flex;flex-direction:column;gap:4px}.reworkTitle b{font-size:18px;color:#071947}
      .reworkGrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(180px,.65fr);gap:12px;align-items:end}
      .reworkGrid label,.reworkMiniCard label{font-size:12px;font-weight:1000;color:#64748b;margin-bottom:5px;display:block}
      .reworkGrid textarea,.reworkGrid select,.reworkMiniCard input{width:100%;border:1px solid #d9e5ff;border-radius:12px;padding:10px 11px;background:#fff;color:#09152f;font:inherit}
      .reworkPrimary{border:0;border-radius:14px;background:linear-gradient(135deg,#071947,#1558d6);color:#fff;font-weight:1000;min-height:48px;padding:12px 16px;box-shadow:0 12px 26px rgba(21,88,214,.22)}
      .reworkSecondary{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.reworkSecondary button,.reworkMiniCard button{width:auto;border:1px solid rgba(21,88,214,.18);border-radius:12px;background:#fff;color:#1558d6;font-weight:1000;padding:9px 12px}
      .reworkMiniCard{margin-top:12px;border:1px solid rgba(15,23,42,.1);border-radius:14px;background:#fff;padding:12px}
      .reworkMiniRow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}
      .reworkDanger{margin-top:12px;border:1px solid rgba(239,68,68,.22);border-radius:14px;background:#fff7f7;padding:12px}
      .reworkDanger b{color:#991b1b}.reworkDanger button{margin-top:8px;width:auto;border:1px solid rgba(239,68,68,.28);background:#fff;color:#991b1b;border-radius:12px;padding:9px 12px;font-weight:1000}
      .editServiceBuilder{border:1px solid rgba(21,88,214,.16);border-radius:20px;background:linear-gradient(180deg,#ffffff,#f8fbff);padding:14px;box-shadow:0 14px 34px rgba(2,6,23,.06)}
      .editServiceBuilderHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .editBuilderBadge{border:1px solid rgba(21,88,214,.18);border-radius:999px;background:#fff;color:#1558d6;font-size:12px;font-weight:1000;padding:5px 9px}
      .editBuilderNotice{margin-top:10px;border:1px solid rgba(34,197,94,.22);background:#f0fdf4;color:#166534;border-radius:14px;padding:10px 12px;font-weight:900;font-size:13px}
      .editServiceList{display:grid;gap:12px}
      .editServiceCard{border:1px solid rgba(15,23,42,.10);border-radius:18px;background:#fff;padding:12px;box-shadow:0 8px 22px rgba(2,6,23,.045)}
      .editServiceCardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap}
      .editServiceTitle{font-weight:1000;color:#071947}.editServiceMeta{font-size:12px;color:#64748b;font-weight:800;margin-top:4px}
      .editServiceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .editServiceGrid label{font-size:12px;font-weight:1000;color:#64748b;margin-bottom:5px;display:block}
      .editServiceGrid select,.editServiceGrid input{width:100%;min-height:44px;border:1px solid #d9e5ff;border-radius:13px;padding:10px 11px;background:#fff;color:#09152f;font:inherit;font-weight:800}
      .editLinePreview{margin-top:10px;border:1px solid rgba(21,88,214,.12);background:#f8fbff;border-radius:14px;padding:10px 11px;color:#0f172a;font-weight:900}
      .editPriceBox{margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid rgba(255,204,0,.38);background:#fffbeb;border-radius:14px;padding:10px 11px}
      .editPriceBox b{font-size:18px;color:#0b1b3a}.editPriceStatus{font-size:12px;color:#64748b;font-weight:900}.editManualPrice{margin-top:8px;border:1px dashed rgba(180,83,9,.35);border-radius:13px;padding:9px;background:#fff7ed}
      .editServiceSummary{margin-top:12px;border-radius:16px;background:#071947;color:#fff;padding:12px 14px}.editTotalText{font-weight:1000;font-size:18px}.editServiceSummary .muted2{color:rgba(255,255,255,.82)}
      @media(max-width:720px){.caseModal{margin:8px auto}.caseGrid,.reworkGrid{grid-template-columns:1fr}.caseActions{justify-content:stretch}.caseBtn,.reworkPrimary,.reworkSecondary button,.reworkMiniCard button,.reworkDanger button{width:100%}}
    `;
    document.head.appendChild(style);
  }
  if (!document.getElementById('caseModalBackdrop')) {
    const wrap = document.createElement('div');
    wrap.id = 'caseModalBackdrop';
    wrap.className = 'caseModalBackdrop';
    wrap.innerHTML = `<div class="caseModal" role="dialog" aria-modal="true">
      <div class="caseModalHead"><b id="caseModalTitle">รายละเอียดเคส</b><button class="caseBtn yellow" id="caseModalClose" type="button">ปิด</button></div>
      <div class="caseModalBody" id="caseModalBody"></div>
    </div>`;
    document.body.appendChild(wrap);
    el('caseModalClose').onclick = closeCaseModal;
    wrap.addEventListener('click', (ev)=>{ if (ev.target === wrap) closeCaseModal(); });
  }
}

function openCaseModal(title, html){
  ensureCaseModal();
  el('caseModalTitle').textContent = title;
  el('caseModalBody').innerHTML = html;
  el('caseModalBackdrop').style.display = 'block';
}

function closeCaseModal(){
  const bd = el('caseModalBackdrop');
  if (bd) bd.style.display = 'none';
}

function optionList(values, selected){
  return values.map(v=>`<option value="${escapeHtml(v)}" ${String(selected||'')===v?'selected':''}>${escapeHtml(v)}</option>`).join('');
}

function labeledOptionList(values, selected, labels){
  return values.map(v=>`<option value="${escapeHtml(v)}" ${String(selected||'')===v?'selected':''}>${escapeHtml(labels?.[v] || v)}</option>`).join('');
}

function reworkReasonLabel(value){
  const v = String(value || '').trim();
  return REWORK_CASE_REASON_LABELS[v] || (v ? 'อื่น ๆ' : '-');
}

function normalizeEvidenceNote(note){
  const s = String(note || '').trim();
  return s ? [{ note: s }] : [];
}

// --- Team editor (minimal UI; backward compatible) ---
const teamEdit = {
  techs: [],
  techMap: {},
  loaded: false,
};

async function loadAllTechsOnce(){
  if (teamEdit.loaded) return;
  teamEdit.loaded = true;
  try {
    const data = await apiFetch('/admin/technicians');
    const rows = Array.isArray(data) ? data : (data.rows || data.technicians || []);
    teamEdit.techs = (rows || []).map(r=>({
      username: String(r.username||'').trim(),
      display: (String(r.full_name||'').trim() || String(r.username||'').trim() || '').trim(),
    })).filter(t=>t.username);
    teamEdit.techMap = {};
    for (const t of teamEdit.techs) teamEdit.techMap[t.username] = t;
  } catch (e) {
    console.warn('[admin-job-view] load techs failed', e);
    teamEdit.techs = [];
    teamEdit.techMap = {};
  }
}

function techDisplayName(u){
  const key = String(u||'').trim();
  if (!key) return '';
  return (teamEdit.techMap[key]?.display) || key;
}

function getPrimaryTechFromUI(fallback){
  const v = String(el('edit_primary_tech')?.value || '').trim();
  if (v) return v;
  return String(fallback||'').trim();
}

function renderTeamEditor(primaryUsername, currentTeamUsernames){
  const primary = String(primaryUsername||'').trim();
  const selected = new Set((Array.isArray(currentTeamUsernames)?currentTeamUsernames:[]).map(x=>String(x||'').trim()).filter(Boolean));
  if (primary) selected.add(primary);

  const sel = el('edit_team_members');
  const search = el('edit_team_search');
  const hint = el('edit_team_hint');
  if (!sel) return;

  const q = String(search?.value||'').trim().toLowerCase();

  // preserve selection from UI if already rendered
  const uiSelected = new Set(Array.from(sel.options||[]).filter(o=>o.selected).map(o=>o.value).filter(Boolean));
  if (uiSelected.size) {
    selected.clear();
    for (const u of uiSelected) selected.add(u);
    if (primary) selected.add(primary);
  }

  sel.innerHTML = '';
  const makeOpt = (u, isPrimary=false) => {
    const o = document.createElement('option');
    o.value = u;
    o.textContent = isPrimary ? `⭐ ${techDisplayName(u)} (${u})` : `${techDisplayName(u)} (${u})`;
    o.selected = selected.has(u);
    if (isPrimary) {
      o.disabled = true;
      o.selected = true;
    }
    return o;
  };

  // primary on top
  if (primary) sel.appendChild(makeOpt(primary, true));

  const list = (teamEdit.techs || [])
    .filter(t=>t.username && t.username !== primary)
    .filter(t=>{
      if (!q) return true;
      const hay = `${t.username} ${t.display}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b)=>a.username.localeCompare(b.username));

  for (const t of list) sel.appendChild(makeOpt(t.username, false));

  // update hint + hidden json
  const finalMembers = Array.from(new Set([primary, ...Array.from(selected)])).filter(Boolean);
  if (hint) {
    const extras = finalMembers.filter(u=>u && u !== primary);
    hint.innerHTML = extras.length
      ? `หัวหน้างาน: <b>${escapeHtml(techDisplayName(primary))}</b> • ช่างร่วม: <b>${escapeHtml(extras.map(u=>techDisplayName(u)).join(', '))}</b>`
      : `หัวหน้างาน: <b>${escapeHtml(primary ? techDisplayName(primary) : '-')}</b> • ยังไม่ได้เลือกช่างร่วม (ถ้าต้องเพิ่มทีม ให้เลือกในรายการด้านบน)`;
  }
  const hid = el('edit_team_members_json');
  if (hid) hid.value = JSON.stringify(finalMembers);
}

function actorName(){
  return localStorage.getItem('username') || localStorage.getItem('admin_username') || 'admin';
}

function inferMachineCountFromName(name){
  try{
    const s = String(name||'');
    const m = s.match(/(\d+)\s*เครื่อง/);
    const n = m ? Number(m[1]) : 0;
    return (Number.isFinite(n) && n > 1) ? n : 0;
  }catch(e){ return 0; }
}

function normalizeLegacyQtyUnit(it){
  // Backward-compatible: old jobs sometimes stored machine_count incorrectly in unit_price/qty.
  // If we can infer "X เครื่อง" from item_name, reconstruct qty + unit_price from line_total.
  try{
    const mc = inferMachineCountFromName(it?.item_name);
    const qty = Number(it?.qty||0);
    const unit = Number(it?.unit_price||0);
    const line = Number(it?.line_total|| (qty*unit));
    if (mc && (qty <= 1 || qty !== mc) && Number.isFinite(line) && line > 0) {
      // Heuristic trigger: very small unit_price (e.g., 35) or qty=1 while name says many machines.
      if (unit < 100 || qty <= 1) {
        it.qty = mc;
        it.unit_price = Number((line / mc).toFixed(2));
        it.line_total = Number((it.unit_price * mc).toFixed(2));
      }
    }
  }catch(e){/* fail-open */}
  return it;
}

function inWarranty(job){
  if (job?.is_in_warranty != null) return !!job.is_in_warranty;
  if (!job?.warranty_end_at) return false;
  return new Date(job.warranty_end_at).getTime() >= Date.now();
}


function renderCloseFlowSummary(job){
  const payMap = {
    customer_qr_company: 'ลูกค้าสแกนจ่ายบริษัท',
    cash_to_technician: 'ลูกค้าจ่ายเงินสดให้ช่าง',
    admin_handles_payment: 'ลูกค้าจ่ายกับแอดมิน / รอแอดมินจัดการ'
  };
  const statusMap = {
    pending_admin_update: 'รอแอดมินอัปเดตการชำระเงิน',
    pending_verification: 'ชำระแล้วรอตรวจสอบ',
    paid: 'จ่ายแล้ว',
    unpaid: 'ยังไม่ชำระ'
  };
  const pre = Array.isArray(job?.pre_cleaning_checklist) ? job.pre_cleaning_checklist : [];
  const post = Array.isArray(job?.post_cleaning_checklist) ? job.post_cleaning_checklist : [];
  const preIssues = pre.filter(x=>String(x.status||'')==='มีปัญหาอยู่ก่อน');
  const postIssues = post.filter(x=>String(x.status||'')==='พบปัญหาใหม่');
  const preText = pre.length ? (preIssues.length ? `ก่อนล้าง: มีปัญหาอยู่ก่อน ${preIssues.length} รายการ` : 'ก่อนล้าง: ปกติทั้งหมด') : 'ยังไม่มีข้อมูลตรวจสภาพ';
  const postText = post.length ? (postIssues.length ? `หลังล้าง: พบปัญหาใหม่ ${postIssues.length} รายการ` : 'หลังล้าง: ปกติทั้งหมด') : 'ยังไม่มีข้อมูลตรวจหลังล้าง';
  const sig = job?.close_signature_type === 'technician_signature' ? 'ปิดงานโดยช่างรับรอง' : (job?.close_signature_type === 'customer_signature' ? 'ปิดงานด้วยลายเซ็นลูกค้า' : 'ยังไม่มีข้อมูลชนิดลายเซ็น');
  const pay = payMap[job?.close_payment_method] || job?.payment_method || '-';
  const payStatus = statusMap[job?.close_payment_status] || statusMap[job?.payment_status] || job?.close_payment_status || job?.payment_status || '-';
  const ack = job?.photo_acknowledgement_accepted ? `<div class="pill" style="background:#fff7ed;border-color:rgba(234,88,12,.25);color:#9a3412">ปิดงานโดยไม่มีรูปหลักฐานครบถ้วน และช่างได้ยอมรับเงื่อนไขแล้ว</div>` : '';
  const issueDetails = [...preIssues, ...postIssues].map(x=>`<li><b>${escapeHtml(safe(x.label||'-'))}</b>: ${escapeHtml(safe(x.note||x.status||''))}</li>`).join('');
  return `<details class="cwf-details" style="margin-top:12px" open>
    <summary>✅ สรุปปิดงาน / หลักฐาน / การชำระเงิน</summary>
    <div class="cwf-details-body">
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <span class="pill">${escapeHtml(preText)}</span>
        <span class="pill">${escapeHtml(postText)}</span>
        <span class="pill">${escapeHtml(sig)}</span>
      </div>
      <div style="margin-top:8px"><b>วิธีชำระเงิน:</b> ${escapeHtml(safe(pay))}</div>
      <div style="margin-top:4px"><b>สถานะชำระเงิน:</b> ${escapeHtml(safe(payStatus))}</div>
      ${job?.close_cash_amount ? `<div style="margin-top:4px"><b>เงินสดที่ช่างรับ:</b> ${Number(job.close_cash_amount||0).toLocaleString()} บาท</div>` : ''}
      ${(job?.payment_status !== 'paid' && job?.close_payment_status !== 'paid') ? `<div style="margin-top:10px"><button id="btnConfirmPaymentV2" class="secondary" type="button" style="width:auto">✅ แอดมินยืนยันว่าจ่ายแล้ว</button></div>` : ''}
      ${ack ? `<div style="margin-top:8px">${ack}</div>` : ''}
      ${issueDetails ? `<details style="margin-top:8px"><summary>ดูรายการที่มีปัญหา</summary><ul>${issueDetails}</ul></details>` : ''}
    </div>
  </details>`;
}

function warrantyLabel(job){
  const end = job?.warranty_end_at ? fmtDT(job.warranty_end_at) : null;
  const kind = String(job?.warranty_kind||'').trim();
  if (!end) return `<span class="pill" style="background:#0f172a;color:#fff;border-color:transparent">ยังไม่ระบุประกัน</span>`;
  const ok = inWarranty(job);
  const base = ok ? 'background:#16a34a;color:#fff;border-color:transparent' : 'background:#ef4444;color:#fff;border-color:transparent';
  const title = ok ? 'อยู่ในประกัน' : 'หมดประกัน';
  const extra = kind === 'repair' && job?.warranty_months ? ` (${job.warranty_months} เดือน)` : '';
  return `<span class="pill" style="${base}">${title}</span> <span class="muted2" style="font-size:12px">หมด: ${end}${extra}</span>`;
}

function renderUnitEvidence(units, photos){
  const arr = Array.isArray(units) ? units : [];
  const allPhotos = Array.isArray(photos) ? photos : [];
  if (!arr.length) return '';
  const byUnit = new Map();
  allPhotos.forEach(p => {
    const id = p && p.unit_id != null ? String(p.unit_id) : '';
    if (!id) return;
    const cur = byUnit.get(id) || [];
    cur.push(p);
    byUnit.set(id, cur);
  });
  return `<details class="cwf-details" style="margin-top:10px" open>
    <summary>หลักฐานแยกตามเครื่องปรับอากาศ</summary>
    <div class="cwf-details-body">
      <div class="list">
        ${arr.map(u => {
          const ps = byUnit.get(String(u.unit_id)) || [];
          const before = ps.filter(p => String(p.phase||'') === 'before');
          const after = ps.filter(p => String(p.phase||'') === 'after');
          const pre = u.checklist && u.checklist.pre && u.checklist.pre.completed;
          const post = u.checklist && u.checklist.post && u.checklist.post.completed;
          const thumbs = (list, label) => list.length
            ? `<div class="mini" style="margin-top:8px"><b>${label}</b></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">${list.map(p => {
                const url = safe(p.public_url);
                return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(safe(p.uploaded_by||''))}"><img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" style="width:76px;height:76px;object-fit:cover;border-radius:10px;border:1px solid rgba(15,23,42,.12)"></a>` : '';
              }).join('')}</div>` : `<div class="muted2 mini">${label}: ยังไม่มีรูป</div>`;
          return `<div class="item">
            <b>เครื่องที่ ${escapeHtml(safe(u.unit_no||'-'))} • รหัสเครื่อง ${escapeHtml(safe(u.unit_code||'-'))}</b>
            <div class="mini" style="margin-top:4px">${escapeHtml(safe(u.item_name||'เครื่องปรับอากาศ'))}</div>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">
              <span class="pill">ผู้รับผิดชอบ: ${escapeHtml(safe(u.assigned_technician||'-'))}</span>
              <span class="pill">${pre ? 'เช็คลิสก่อนทำ: ครบ' : 'เช็คลิสก่อนทำ: ยังไม่ครบ'}</span>
              <span class="pill">${post ? 'เช็คลิสหลังทำ: ครบ' : 'เช็คลิสหลังทำ: ยังไม่ครบ'}</span>
            </div>
            ${thumbs(before, 'รูปก่อนทำ')}
            ${thumbs(after, 'รูปหลังทำ')}
            ${ps.filter(p => !['before','after'].includes(String(p.phase||''))).length ? `<div class="mini" style="margin-top:8px">รูปอื่น: ${ps.filter(p => !['before','after'].includes(String(p.phase||''))).length} รูป</div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>
  </details>`;
}

async function purgeThisJobMedia(jobId){
  const id = Number(jobId || 0);
  if (!id) return alert('ไม่พบเลขงาน');
  try {
    const dry = await apiFetch('/admin/media-retention/purge', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dry_run:true, job_ids:[id], confirm_text:'' })
    });
    const first = (dry.results || [])[0] || {};
    const ok = confirm(`ตรวจสอบก่อนลบเสร็จแล้ว ยังไม่มีการลบข้อมูลจริง\nรูปหลักฐานที่ล้างได้: ${first.photos_count || 0} รูป\nรูปสลิป: ${first.slips_count || 0} รูป ไม่ถูกลบอัตโนมัติ\n\nต้องการล้างข้อมูลหนักของงานนี้หรือไม่?`);
    if (!ok) return;
    const typed = prompt('พิมพ์ "ยืนยันลบ" เพื่อยืนยันการล้างข้อมูลหนัก');
    if (String(typed || '').trim() !== 'ยืนยันลบ') return alert('ยกเลิกการล้างข้อมูล');
    const r = await apiFetch('/admin/media-retention/purge', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ dry_run:false, job_ids:[id], confirm_text:'ยืนยันลบ' })
    });
    alert(r.message || 'ล้างรูปเก่าเรียบร้อย');
    loadJob();
  } catch (e) {
    alert(e.message || 'ล้างข้อมูลหนักไม่สำเร็จ');
  }
}
window.purgeThisJobMedia = purgeThisJobMedia;

async function loadJob(){
  const qs = new URLSearchParams(location.search);
  const raw = qs.get('job_id') || '';
  const jobId = raw.trim();
  if (!jobId) {
    el('jobCard').innerHTML = '❌ ไม่พบ job_id';
    return;
  }

  const r = await apiFetch(`/admin/job_v2/${encodeURIComponent(jobId)}`);
  const job = r.job || {};
  const items = Array.isArray(r.items) ? r.items.map(x=>normalizeLegacyQtyUnit(Object.assign({}, x))) : [];
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const units = Array.isArray(r.units) ? r.units : [];
  const updates = Array.isArray(r.updates) ? r.updates : [];
  const team = Array.isArray(r.team_members) ? r.team_members : [];
  const promotion = r.promotion || null;

  const itemRows = items.length
    ? items.map(it=>{
        const qty = Number(it.qty||0);
        const unit = Number(it.unit_price||0);
        const line = Number(it.line_total|| (qty*unit));
        return `<tr>
          <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(safe(it.item_name))}">${escapeHtml(safe(it.item_name))}</td>
          <td style="width:70px;text-align:right">${qty}</td>
          <td style="width:90px;text-align:right">${unit.toLocaleString()}</td>
          <td style="width:110px;text-align:right"><b>${line.toLocaleString()}</b></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" class="muted2">ไม่มีรายการ</td></tr>`;

  const photoRows = photos.length
    ? photos.map(p=>{
        const url = safe(p.public_url);
        const phase = safe(p.phase||'-');
        const created = fmtDT(p.created_at);
        return `<div class="item">
          <b title="${escapeHtml(phase)}">📷 ${escapeHtml(phase)}</b>
          <div class="mini" title="${escapeHtml(url)}">${escapeHtml(created)}</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${url ? `<a class="secondary btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener">เปิด/โหลดรูป</a>` : `<span class="pill">ยังไม่มีลิงก์รูป</span>`}
          </div>
        </div>`;
      }).join('')
    : `<div class="muted2">ยังไม่มีรูปที่ช่างอัปโหลด</div>`;

  const updRows = updates.length
    ? `<div class="list">${updates.map(u=>{
        const when = fmtDT(u.created_at);
        const act = safe(u.action);
        const msg = safe(u.message);
        const by = safe(u.actor_username || u.actor_role || '-');
        return `<div class="item">
          <b title="${escapeHtml(act)}">${escapeHtml(act || 'update')}</b>
          <div class="mini">${escapeHtml(when)} • ${escapeHtml(by)}</div>
          ${msg ? `<div class="muted2" style="margin-top:6px;white-space:pre-wrap">${escapeHtml(msg)}</div>` : ''}
        </div>`;
      }).join('')}</div>`
    : `<div class="muted2">ยังไม่มีประวัติอัปเดต</div>`;

  const teamText = team.length
    ? team.map(m=>`${safe(m.full_name||m.username)}${m.phone ? ` (${safe(m.phone)})` : ''}`).join(', ')
    : '-';

  const teamUsernames = team.map(m=>String(m.username||'').trim()).filter(Boolean);
  const teamInitMembers = Array.from(new Set([String(job.technician_username||'').trim(), ...teamUsernames])).filter(Boolean);
  const baseItemsSnapshot = buildAdminEditItemsSnapshot(items);
  const baseTeamSnapshot = buildAdminEditTeamSnapshot(String(job.technician_username||'').trim(), teamInitMembers);

  const wOk = inWarranty(job);
  const unitEvidenceHtml = renderUnitEvidence(units, photos);
  ensureCaseModal();

  el('jobCard').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
      <div style="min-width:220px">
        <b style="font-size:16px">เลขงาน: ${escapeHtml(safe(job.booking_code||job.job_id))}</b>
        <div class="muted2" style="margin-top:4px">#${escapeHtml(safe(job.job_id))}</div>
      </div>
      <div>${statusPill(job.job_status)}</div>
    </div>

    <div style="margin-top:10px" class="row">
      <div class="pill" style="background:#fff;border-color:rgba(15,23,42,0.12)"><b>นัด:</b> ${escapeHtml(fmtDT(job.appointment_datetime))}</div>
      <div class="pill" style="background:#fff;border-color:rgba(15,23,42,0.12)"><b>ประเภท:</b> ${escapeHtml(safe(job.job_type||'-'))}</div>
    </div>

    <div style="margin-top:10px">
      <div><b>ลูกค้า:</b> ${escapeHtml(safe(job.customer_name||'-'))}</div>
      <div><b>โทร:</b> ${escapeHtml(safe(job.customer_phone||'-'))}</div>
      <div style="margin-top:6px"><b>ที่อยู่:</b> <span title="${escapeHtml(safe(job.address_text||''))}">${escapeHtml(safe(job.address_text||'-'))}</span></div>
      <div style="margin-top:6px"><b>โซน:</b> ${escapeHtml(safe(job.job_zone||'-'))}</div>
      <div style="margin-top:6px"><b>ช่างหลัก:</b> ${escapeHtml(safe(job.technician_username||'-'))}</div>
      <div style="margin-top:6px"><b>ทีมช่าง:</b> <span title="${escapeHtml(teamText)}">${escapeHtml(teamText)}</span></div>
    </div>

    ${renderCloseFlowSummary(job)}

    <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
      <button id="btnDocQuote" class="secondary" type="button" style="width:auto">🧾 ใบเสนอราคา (เต็ม)</button>
      <button id="btnDocReceipt" class="secondary" type="button" style="width:auto">🧾 บิล/ใบเสร็จ (เต็ม)</button>
    </div>

    <hr style="margin:12px 0;" />

    <details class="cwf-details" style="margin-top:0" open>
      <summary>✏️ แก้ไขใบงาน (Admin)</summary>
      <div class="cwf-details-body">
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:220px">
            <label>ชื่อลูกค้า</label>
            <input id="edit_customer_name" value="${escapeHtml(safe(job.customer_name||''))}" />
          </div>
          <div style="width:220px">
            <label>เบอร์โทร</label>
            <input id="edit_customer_phone" value="${escapeHtml(safe(job.customer_phone||''))}" />
          </div>
          <div style="width:220px">
            <label>ประเภทงาน</label>
            <select id="edit_job_type">
              <option value="">-</option>
              <option value="ล้าง" ${String(job.job_type||'')==='ล้าง'?'selected':''}>ล้าง</option>
              <option value="ซ่อม" ${String(job.job_type||'')==='ซ่อม'?'selected':''}>ซ่อม</option>
              <option value="ติดตั้ง" ${String(job.job_type||'')==='ติดตั้ง'?'selected':''}>ติดตั้ง</option>
            </select>
          </div>
          <div style="width:240px">
            <label>วัน/เวลานัด</label>
            <input id="edit_appt" type="datetime-local" />
          </div>
        </div>

        <div style="margin-top:10px">
          <label>ที่อยู่</label>
          <textarea id="edit_address" rows="2" placeholder="ที่อยู่ลูกค้า">${escapeHtml(safe(job.address_text||''))}</textarea>
        </div>

        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:220px">
            <label>โซน</label>
            <input id="edit_zone" value="${escapeHtml(safe(job.job_zone||''))}" />
          </div>
          <div style="flex:1;min-width:220px">
            <label>Maps URL</label>
            <input id="edit_maps_url" value="${escapeHtml(safe(job.maps_url||''))}" />
          </div>
          <div style="width:160px">
            <label>Lat</label>
            <input id="edit_lat" value="${escapeHtml(safe(job.latitude||''))}" />
          </div>
          <div style="width:160px">
            <label>Lng</label>
            <input id="edit_lng" value="${escapeHtml(safe(job.longitude||''))}" />
          </div>
        </div>

        <div style="margin-top:12px">
          <b>👥 ทีมช่าง</b>
          <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="width:220px">
              <label>รูปแบบการทำงาน</label>
              <select id="edit_team_mode">
                <option value="single">เดี่ยว (ช่างคนเดียว)</option>
                <option value="team">ทีม (หลายคน)</option>
              </select>
            </div>
          </div>
          <div class="muted2 mini" style="margin-top:6px">เลือกหัวหน้างาน (ช่างหลัก) และเลือกช่างร่วมได้หลายคน • สามารถเปลี่ยนหัวหน้างานและเอาคนเดิมออกจากทีมได้</div>
          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:260px">
              <label>หัวหน้างาน / ช่างหลัก</label>
              <select id="edit_primary_tech" style="width:100%"></select>
            </div>
          </div>
          <div id="edit_team_multi_wrap">
          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:220px">
              <label>ค้นหาช่าง (ชื่อ/username)</label>
              <input id="edit_team_search" placeholder="พิมพ์เพื่อค้นหา" />
            </div>
            <div style="flex:1;min-width:260px">
              <label>เลือกช่างร่วม (กด Ctrl/Command เพื่อเลือกหลายคน)</label>
              <select id="edit_team_members" multiple size="6" style="width:100%"></select>
            </div>
          </div>
          </div>
          <div id="edit_team_hint" class="muted2" style="margin-top:8px"></div>
          <input id="edit_team_members_json" type="hidden" value="${escapeHtml(JSON.stringify(teamInitMembers))}" />
        </div>

        <div class="editServiceBuilder" style="margin-top:14px">
          <div class="editServiceBuilderHead">
            <div>
              <b>🧾 แก้ไข/เพิ่มรายการบริการ</b>
              <div class="muted2 mini" style="margin-top:6px">เลือกบริการเหมือนหน้าเพิ่มงาน • เพิ่มหลายรายการได้ • ราคาและเวลาคำนวณอัตโนมัติ</div>
            </div>
            <span class="editBuilderBadge">Service Builder v2</span>
          </div>
          <div class="editBuilderNotice">ระบบจะใช้รายการที่เลือกเป็นหลัก ไม่ต้องกรอกราคาเอง ยกเว้นกด “แก้ราคาเอง” เท่านั้น</div>
          <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px">
            <select id="edit_split_mode" style="width:260px;max-width:100%">
              <option value="mixed">มอบหมายแยกตามรายการ</option>
              <option value="coop_equal">ทำร่วมกันทั้งหมด</option>
            </select>
            <button id="btnApplySplitMode" class="secondary" type="button" style="width:auto">ใช้โหมดนี้กับทุกรายการ</button>
            <button id="btnNormalizeItems" class="secondary" type="button" style="width:auto">แปลงจำนวนเครื่องอัตโนมัติ</button>
          </div>
          <div id="items_editor" class="editServiceList" style="margin-top:12px"></div>
          <div class="editServiceSummary">
            <div id="edit_items_total" class="editTotalText">รวมรายการบริการ 0 บาท</div>
            <div id="edit_duration_total" class="muted2 mini"></div>
          </div>
          <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
            <button id="btnAddItem" class="secondary" type="button" style="width:auto">➕ เพิ่มรายการ</button>
            <button id="btnSaveEdit" type="button" style="width:auto">💾 บันทึกใบงาน</button>
          </div>
          <div id="edit_msg" class="muted2" style="margin-top:8px"></div>
        </div>
      </div>
    </details>


    <hr style="margin:12px 0;" />

    <div>
      <b>🧯 ปิดงานแทนช่าง (Force Close)</b>
      <div class="muted2 mini" style="margin-top:6px">ใช้เมื่อช่างกดปิดงานไม่ได้ ระบบจะปิดงานให้ทันที (ไม่สนเงื่อนไขอื่น ยกเว้น job_id ต้องถูกต้อง)</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px">
          <label>เหตุผล (ไม่บังคับ)</label>
          <textarea id="force_finish_reason" rows="2" placeholder="เช่น ช่างกดปิดงานไม่ได้ / ระบบค้าง / รูปค้าง"></textarea>
        </div>
        <button id="btnForceFinish" class="danger" type="button" style="width:auto"
          ${(['เสร็จแล้ว','ยกเลิก'].includes(safe(job.job_status||'')) ? 'disabled' : '')}
          title="${(['เสร็จแล้ว','ยกเลิก'].includes(safe(job.job_status||'')) ? 'งานปิดแล้ว' : 'ปิดงานแทนช่าง')}">
          ✅ ปิดงานแทนช่าง
        </button>
      </div>
    </div>



    
    <hr style="margin:12px 0;" />

    <div>
      <b>🗑️ ลบงานถาวร (ลบจากฐานข้อมูลจริง)</b>
      <div class="muted2 mini" style="margin-top:6px">ระวัง: ลบแล้วกู้คืนไม่ได้ • ต้องยืนยัน 2 ชั้น</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <button id="btn_delete_job" class="danger" type="button" style="width:auto">🗑️ ลบงานนี้</button>
      </div>
    </div>

<hr style="margin:12px 0;" />

    <section class="reworkPanel">
      <div class="reworkHead">
        <div class="reworkTitle">
          <b>🛡️ งานแก้ไข / ประกัน</b>
          <span class="muted2 mini">ใช้เมื่อต้องส่งงานเดิมกลับให้ช่างแก้ไข พร้อมเก็บประวัติและหลักฐานสำหรับตรวจสอบภายหลัง</span>
          <span class="muted2 mini" style="display:inline-flex;width:max-content;max-width:100%;border:1px solid rgba(21,88,214,.14);border-radius:999px;padding:3px 8px;background:#fff">UI งานแก้ไข v3</span>
        </div>
        <div>${warrantyLabel(job)}</div>
      </div>
      <div class="reworkGrid">
        <div>
          <label>เหตุผล/ปัญหา</label>
          <textarea id="return_reason" rows="3" placeholder="สรุปปัญหาที่ต้องให้ช่างกลับไปแก้ เช่น น้ำหยดหลังล้าง หรืออาการเดิมยังไม่หาย"></textarea>
        </div>
        <div>
          <label>ประเภทงานแก้ไข</label>
          <select id="rework_reason_type">${labeledOptionList(REWORK_CASE_REASON_TYPES, 'other', REWORK_CASE_REASON_LABELS)}</select>
          <button id="btnCreateReworkCase" class="reworkPrimary" type="button" style="margin-top:10px">ส่งงานกลับแก้</button>
        </div>
      </div>
      <div class="reworkSecondary">
        <button id="btnViewCaseHistory" type="button">ดูประวัติเคส</button>
        <button id="btnCreateDeductionCase" type="button">เปิดเคสหักเงิน</button>
      </div>
      <div class="reworkMiniCard">
        <div class="reworkMiniRow">
          <div style="width:220px;max-width:100%">
            <label>ขยายวันประกัน</label>
            <input id="extend_days" type="number" min="1" step="1" placeholder="เช่น 7" />
          </div>
          <button id="btnExtend" type="button">ขยายวันประกัน</button>
        </div>
      </div>
      <div class="reworkDanger">
        <b>ล้างรูปและข้อมูลหนักของงานนี้</b>
        <div class="muted2 mini" style="margin-top:4px">ใช้เฉพาะกรณีตรวจสอบแล้วว่าล้างข้อมูลสื่อเก่าได้</div>
        <button type="button" onclick="purgeThisJobMedia(${Number(job.job_id||0)})">ล้างรูปและข้อมูลหนักของงานนี้</button>
      </div>
    </section>

    <hr style="margin:12px 0;" />

    <div>
      <b>🧾 รายการบริการ</b>
      <div class="table-wrap" style="margin-top:10px;overflow:auto">
        <table>
          <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:12px">
      <b>♻️ สร้างงานใหม่จากใบงานเดิม (Clone)</b>
      <div class="muted2 mini" style="margin-top:6px">สร้าง job ใหม่คนละ jobId และไม่กระทบงานเดิม</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="width:220px">
          <label>วัน/เวลาใหม่</label>
          <input id="clone_appt" type="datetime-local" />
        </div>
        <div style="flex:1;min-width:220px">
          <label>ช่างใหม่ (username) (เว้นว่าง = ไม่กำหนด)</label>
          <input id="clone_tech" placeholder="เช่น A2MKUNG" />
        </div>
        <div style="width:220px">
          <label>เปลี่ยนประเภทงาน (ถ้าต้องการ)</label>
          <input id="clone_type" placeholder="เช่น ล้าง / ซ่อม / ติดตั้ง" />
        </div>
        <button id="btnClone" class="secondary" type="button" style="width:auto">สร้างงานใหม่</button>
      </div>
      <details class="cwf-details" style="margin-top:10px">
        <summary>เลือก “ลดรายการล้าง” (ตัดบางรายการออก)</summary>
        <div class="cwf-details-body" id="clone_items"></div>
      </details>
    </div>

    <hr style="margin:12px 0;" />

    <details class="cwf-details" style="margin-top:0" open>
      <summary>📷 รูปถ่าย (ดาวน์โหลดได้)</summary>
      <div class="cwf-details-body">
        <div class="list">${photoRows}</div>
      </div>
    </details>

    ${unitEvidenceHtml}

    <details class="cwf-details" style="margin-top:10px" open>
      <summary>🕒 Updates / Timeline</summary>
      <div class="cwf-details-body">${updRows}</div>
    </details>
  `;

  // --- Full docs (Quote / Receipt) ---
  try {
    const btnQ = el('btnDocQuote');
    if (btnQ) {
      btnQ.onclick = () => {
        const url = `${location.origin}/docs/quote/${encodeURIComponent(String(job.job_id))}`;
        window.open(url, '_blank', 'noopener');
      };
    }
    const btnR = el('btnDocReceipt');
    if (btnR) {
      btnR.onclick = () => {
        const url = `${location.origin}/docs/receipt/${encodeURIComponent(String(job.job_id))}`;
        window.open(url, '_blank', 'noopener');
      };
    }
  } catch (e) {
    console.warn('doc buttons init failed', e);
  }

  // clone item selector
  const cloneItems = el('clone_items');
  if (cloneItems) {
    if (!items.length) cloneItems.innerHTML = `<div class="muted2">ไม่มีรายการให้เลือก</div>`;
    else {
      cloneItems.innerHTML = items.map(it=>{
        const id = Number(it.item_id);
        const nm = safe(it.item_name);
        return `<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;">
          <input type="checkbox" class="clone-item" value="${id}" checked>
          <div style="flex:1;min-width:0">
            <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(nm)}">${escapeHtml(nm)}</b>
            <div class="muted2 mini">qty ${escapeHtml(String(it.qty||''))}</div>
          </div>
        </label>`;
      }).join('');
    }
  }

  // wire actions
  // --- Admin Edit (Job + Items) ---
  try {
    const apptInput = el('edit_appt');
    if (apptInput) apptInput.value = toLocalDatetimeInput(job.appointment_datetime);

    const inferAssigneeFromItemName = (name) => {
      const s = String(name || '').trim();
      if (!s) return null;
      // Legacy pattern: "... (USERNAME)" at end
      const m = s.match(/\(([A-Za-z0-9_\-]{2,64})\)\s*$/);
      if (m && m[1]) return String(m[1]).trim();
      return null;
    };

    // Auto-normalize legacy service rows:
    // - บางงานเก่าถูกเก็บเป็น qty=1 แต่ชื่อมี "... 5 เครื่อง" และ unit_price=ยอดรวม
    // - ทำให้แอดมินเห็น "จำนวน 1 ราคา 2500" (งง) ทั้งที่ควรเป็น qty=5 unit=500
    const parseMachineCountFromName = (name) => {
      const s = String(name || '');
      const m = s.match(/(\d+)\s*เครื่อง/);
      if (!m) return 0;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : 0;
    };
    const normalizeLegacyServiceRow = (row) => {
      try {
        const nm = String(row.item_name || '');
        const mc = parseMachineCountFromName(nm);
        const q = Number(row.qty || 0);
        const u = Number(row.unit_price || 0);
        const total = (Number.isFinite(q) ? q : 0) * (Number.isFinite(u) ? u : 0);
        if (mc >= 2 && q === 1 && total > 0) {
          row.qty = mc;
          row.unit_price = Number((total / mc).toFixed(2));
        }
      } catch(_e) {}
      return row;
    };
    const EDIT_JOB_TYPES = { wash:'ล้าง', repair:'ซ่อม', install:'ติดตั้ง' };
    const EDIT_REPAIR_TYPES = { standard:'ตรวจเช็ค/ซ่อมทั่วไป', leak:'ตรวจเช็ครั่ว', parts:'ซ่อมเปลี่ยนอะไหล่' };
    const EDIT_REPAIR_PAYLOAD = { standard:'', leak:'ตรวจเช็ครั่ว', parts:'ซ่อมเปลี่ยนอะไหล่' };
    const isPartsRepairRow = (row) => normalizeEditJobTypeKey(row?.job_type_key || row?.job_type || 'wash') === 'repair' && String(row?.repair_type_key || 'standard') === 'parts';
    const cleanRepairDetail = (value) => String(value || '').replace(/[•\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parseRepairDetailFromName = (name) => {
      const parts = String(name || '').split('•').map(x => x.trim()).filter(Boolean);
      const idx = parts.findIndex(x => x.includes('ซ่อมเปลี่ยนอะไหล่') || x.includes('ซ่อมตามจริง'));
      if (idx < 0) return '';
      const detail = parts.slice(idx + 1).find(x => x && !/BTU/i.test(x) && !/\d+\s*เครื่อง/.test(x));
      return cleanRepairDetail(detail || '');
    };
    const STD_AC_TYPES = {
      wall: 'แอร์ผนัง',
      fourway: 'แอร์สี่ทิศทาง',
      hanging: 'แอร์แขวน/ตั้งพื้น',
      ceiling: 'แอร์เปลือย/ใต้ฝ้า',
    };
    const STD_AC_PAYLOAD = {
      wall: 'ผนัง',
      fourway: 'สี่ทิศทาง',
      hanging: 'แขวน',
      ceiling: 'เปลือยใต้ฝ้า',
    };
    const STD_WASH_TYPES = {
      normal: 'ล้างธรรมดา',
      premium: 'ล้างพรีเมียม',
      coil: 'ล้างแขวนคอยล์',
      overhaul: 'ล้างแบบตัดล้าง',
    };
    const STD_WASH_PAYLOAD = {
      normal: 'ล้างธรรมดา',
      premium: 'ล้างพรีเมียม',
      coil: 'ล้างแขวนคอยล์',
      overhaul: 'ล้างแบบตัดล้าง',
    };
    const STD_BTU = {
      small: 'ไม่เกิน 12,000 BTU',
      large: '18,000 BTU ขึ้นไป',
      all: 'ทุก BTU',
    };
    const STD_BTU_VALUE = { small: 12000, large: 18000, all: 12000 };
    const normalizeEditWashVariant = (value) => {
      const s = String(value || '').trim();
      if (!s) return '';
      if (s.includes('แขวนคอย')) return 'ล้างแขวนคอยล์';
      if (s.includes('พรีเมียม') || s.includes('พรีเมี่ยม')) return 'ล้างพรีเมียม';
      if (s.includes('ตัดล้าง')) return 'ล้างแบบตัดล้าง';
      if (s.includes('ธรรมดา') || s.includes('ปกติ')) return 'ล้างธรรมดา';
      return s;
    };
    const normalizeEditJobTypeKey = (value) => {
      const s = String(value || '').trim();
      if (s === 'ซ่อม' || s === 'repair') return 'repair';
      if (s === 'ติดตั้ง' || s === 'install') return 'install';
      return 'wash';
    };
    const jobTypePayload = (key) => EDIT_JOB_TYPES[normalizeEditJobTypeKey(key)] || 'ล้าง';
    const parseBtuKeyFromNumber = (n) => Number(n || 0) >= 18000 ? 'large' : 'small';
    const standardItemName = (it) => {
      const jobKey = normalizeEditJobTypeKey(it.job_type_key || it.job_type || 'wash');
      const ac = String(it.ac_type_key || 'wall');
      const qty = Math.max(1, Math.round(Number(it.qty || it.machine_count || 1)));
      const tier = ac === 'wall' ? String(it.btu_tier || 'small') : (String(it.btu_tier || 'all'));
      const btuText = tier === 'large' ? '18000 BTU' : (tier === 'all' ? '12000 BTU' : '12000 BTU');
      if (jobKey === 'repair') {
        const rv = String(it.repair_type_key || 'standard');
        const rvText = EDIT_REPAIR_TYPES[rv] || EDIT_REPAIR_TYPES.standard;
        const detail = rv === 'parts' ? cleanRepairDetail(it.repair_detail || '') : '';
        const detailPart = detail ? ` • ${detail}` : '';
        return `ซ่อมแอร์${STD_AC_PAYLOAD[ac] || 'ผนัง'} • ${rvText}${detailPart} • ${btuText} • ${qty} เครื่อง`;
      }
      if (jobKey === 'install') {
        return `ติดตั้งแอร์${STD_AC_PAYLOAD[ac] || 'ผนัง'} • ${btuText} • ${qty} เครื่อง`;
      }
      if (ac === 'wall') {
        const wash = String(it.wash_type_key || 'normal');
        return `ล้างแอร์ผนัง • ${STD_WASH_TYPES[wash] || STD_WASH_TYPES.normal} • ${btuText} • ${qty} เครื่อง`;
      }
      return `ล้างแอร์${STD_AC_PAYLOAD[ac] || 'สี่ทิศทาง'} • ${btuText} • ${qty} เครื่อง`;
    };
    const parseStandardItemName = (name) => {
      const raw = String(name || '');
      const s = raw.toLowerCase();
      if (!s.trim()) return null;
      const job_type_key = s.includes('ติดตั้ง') ? 'install' : (s.includes('ซ่อม') ? 'repair' : 'wash');
      const hasWallCoil = s.includes('แขวนคอย') || s.includes('coil');
      const ac = s.includes('สี่ทิศ') || s.includes('cassette') || s.includes('four') ? 'fourway'
        : (s.includes('ผนัง') || s.includes('wall') || hasWallCoil || s.includes('ล้างแอร์') ? 'wall'
        : ((s.includes('แขวน') || s.includes('ตั้งพื้น') || s.includes('floor')) && !hasWallCoil ? 'hanging'
        : (s.includes('เปลือย') || s.includes('ใต้ฝ้า') || s.includes('ceiling') || s.includes('concealed') ? 'ceiling' : 'wall')));
      const wash = ac !== 'wall' ? 'none'
        : (s.includes('พรีเมียม') || s.includes('พรีเมี่ยม') || s.includes('premium') ? 'premium'
        : (s.includes('แขวนคอย') || s.includes('coil') ? 'coil'
        : (s.includes('ตัดล้าง') || s.includes('overhaul') || s.includes('ใหญ่') ? 'overhaul' : 'normal')));
      const repair_type_key = s.includes('รั่ว') ? 'leak' : (s.includes('อะไหล่') ? 'parts' : 'standard');
      const tier = (s.includes('18000') || s.includes('18,000') || s.includes('18 000')) ? 'large' : 'small';
      return { job_type_key, job_type: jobTypePayload(job_type_key), ac_type_key: ac, wash_type_key: wash, repair_type_key, repair_detail: repair_type_key === 'parts' ? parseRepairDetailFromName(raw) : '', btu_tier: tier, is_standard: true, price_overridden: repair_type_key === 'parts' ? true : undefined };
    };

    const getEditStandardPayload = (row) => {
      const acKey = String(row?.ac_type_key || 'wall');
      const qty = Math.max(1, Math.round(Number(row?.qty || 1)));
      const jobKey = normalizeEditJobTypeKey(row?.job_type_key || row?.job_type || el('edit_job_type')?.value || job.job_type || 'wash');
      const tier = String(row?.btu_tier || (acKey === 'wall' ? 'small' : 'all'));
      return {
        job_type: jobTypePayload(jobKey),
        ac_type: STD_AC_PAYLOAD[acKey] || 'ผนัง',
        btu: Number(STD_BTU_VALUE[tier] || 12000),
        machine_count: qty,
        wash_variant: (jobKey === 'wash' && acKey === 'wall') ? normalizeEditWashVariant(STD_WASH_PAYLOAD[String(row?.wash_type_key || 'normal')] || 'ล้างธรรมดา') : '',
        repair_variant: jobKey === 'repair' ? (EDIT_REPAIR_PAYLOAD[String(row?.repair_type_key || 'standard')] || '') : '',
        admin_override_duration_min: 0,
      };
    };

    const localEditStandardPrice = (payload) => {
      const jobType = String(payload.job_type || '').trim();
      const acType = String(payload.ac_type || '').trim();
      const wash = normalizeEditWashVariant(payload.wash_variant || '');
      const qty = Math.max(1, Number(payload.machine_count || 1));
      const btu = Number(payload.btu || 0);
      if (jobType === 'ติดตั้ง') return 0;
      if (jobType === 'ซ่อม') {
        if (String(payload.repair_variant||'') === 'ซ่อมเปลี่ยนอะไหล่') return 0;
        return (String(payload.repair_variant||'') === 'ตรวจเช็ครั่ว') ? 1000 : 700;
      }
      if (jobType !== 'ล้าง') return 0;
      if (acType === 'ผนัง' || !acType) {
        const large = Number.isFinite(btu) && btu >= 18000;
        if (!large) {
          if (wash === 'ล้างพรีเมียม') return 900 * qty;
          if (wash === 'ล้างแขวนคอยล์') return 1400 * qty;
          if (wash === 'ล้างแบบตัดล้าง') return 2000 * qty;
          return 600 * qty;
        }
        if (wash === 'ล้างพรีเมียม') return 1100 * qty;
        if (wash === 'ล้างแขวนคอยล์') return 1700 * qty;
        if (wash === 'ล้างแบบตัดล้าง') return 2300 * qty;
        return 750 * qty;
      }
      if (acType === 'สี่ทิศทาง') return 1500 * qty;
      if (acType === 'แขวน') return 1200 * qty;
      if (acType === 'เปลือยใต้ฝ้า') return 1200 * qty;
      return 0;
    };

    let editorItems = (Array.isArray(items) ? items : []).map(it=>({
      item_id: Number(it.item_id||0) || null,
      item_name: safe(it.item_name||''),
      qty: Number(it.qty||1) || 1,
      unit_price: Number(it.unit_price||0) || 0,
      assigned_technician_username: (String(it.assigned_technician_username||'').trim() || inferAssigneeFromItemName(it.item_name) || null),
    })).map(normalizeLegacyServiceRow).map(row => {
      const parsed = parseStandardItemName(row.item_name) || { is_standard:false };
      const merged = Object.assign(row, parsed);
      if (isPartsRepairRow(merged)) merged.price_overridden = true;
      return merged;
    });

    const tbody = el('items_editor');
    const editPriceCache = new Map();

    const updateEditorTotal = () => {
      const total = editorItems.reduce((sum, it) => sum + (Math.max(0, Number(it.qty || 0)) * Math.max(0, Number(it.unit_price || 0))), 0);
      const box = el('edit_items_total');
      if (box) box.textContent = `รวมรายการบริการ ${total.toLocaleString('th-TH')} บาท`;
      const dBox = el('edit_duration_total');
      if (dBox) {
        const d = computeEditDurationMin();
        dBox.textContent = d ? `เวลางานประมาณ ${Number(d).toLocaleString('th-TH')} นาที (ยังไม่รวมเงื่อนไขหน้างานพิเศษ)` : 'เวลางานจะคำนวณหลังระบบดึงราคามาตรฐานสำเร็จ';
      }
      return total;
    };

    const updatePriceStatusForRow = (idx) => {
      const tr = tbody?.querySelector(`[data-idx="${idx}"]`);
      if (!tr) return;
      const row = editorItems[idx];
      const status = tr.querySelector('.it_price_status');
      if (status) {
        status.textContent = row?.price_overridden
          ? 'แก้ราคาเอง'
          : 'ระบบคำนวณราคาให้อัตโนมัติจากรายการที่เลือก';
        status.style.color = row?.price_overridden ? '#b45309' : '#64748b';
      }
      const lineEl = tr.querySelector('.it_line');
      if (lineEl) {
        const line = Math.max(0, Number(row?.qty || 0)) * Math.max(0, Number(row?.unit_price || 0));
        lineEl.textContent = Number(line || 0).toLocaleString('th-TH');
      }
      updateEditorTotal();
    };

    const getEditPricingPreview = async (row) => {
      const payload = getEditStandardPayload(row);
      const key = JSON.stringify(payload);
      if (editPriceCache.has(key)) return editPriceCache.get(key);
      try {
        const r = await apiFetch('/public/pricing_preview', { method:'POST', body: JSON.stringify(payload) });
        const out = {
          standard_price: Number(r.standard_price || 0),
          duration_min: Number(r.duration_min || 0),
          source: 'public/pricing_preview',
          payload,
        };
        editPriceCache.set(key, out);
        return out;
      } catch (e) {
        const out = {
          standard_price: localEditStandardPrice(payload),
          duration_min: 0,
          source: 'frontend_fallback',
          payload,
        };
        editPriceCache.set(key, out);
        return out;
      }
    };

    const updateEditItemPriceFromSelection = async (idx, opts = {}) => {
      const row = editorItems[idx];
      if (!row || !row.is_standard) return null;
      if (isPartsRepairRow(row)) {
        row.price_overridden = true;
        row.item_name = standardItemName(row);
        row.duration_min = 0;
        updatePriceStatusForRow(idx);
        return { standard_price: 0, duration_min: 0, source: 'manual_parts_repair', payload: getEditStandardPayload(row) };
      }
      row.item_name = standardItemName(row);
      const q = Math.max(1, Math.round(Number(row.qty || 1)));
      row.qty = q;
      const preview = await getEditPricingPreview(row);
      const standardPrice = Math.max(0, Number(preview.standard_price || 0));
      const unitPrice = q > 0 ? Number((standardPrice / q).toFixed(2)) : standardPrice;
      row.auto_unit_price = unitPrice;
      row.auto_line_total = standardPrice;
      row.duration_min = Number(preview.duration_min || 0);
      row.pricing_payload = preview.payload;
      if (opts.force || !row.price_overridden) {
        row.unit_price = unitPrice;
        row.price_overridden = false;
        const tr = tbody?.querySelector(`[data-idx="${idx}"]`);
        const unit = tr?.querySelector('.it_unit');
        if (unit) unit.value = String(unitPrice);
      }
      console.info('[admin-job-edit] price recalculated', {
        job_type: preview.payload.job_type,
        ac_type: preview.payload.ac_type,
        wash_variant: preview.payload.wash_variant,
        btu: preview.payload.btu,
        qty: q,
        unit_price: row.unit_price,
        line_total: Number(row.unit_price || 0) * q,
        source: preview.source,
      });
      updatePriceStatusForRow(idx);
      return preview;
    };

    const computeEditDurationMin = () => {
      const durations = editorItems.map(it => Number(it.duration_min || 0)).filter(n => Number.isFinite(n) && n > 0);
      if (!durations.length) return null;
      return Math.round(durations.reduce((a, n) => a + n, 0));
    };

    const verifyAdminEditSave = async (jobId, expectedItems) => {
      const detail = await apiFetch(`/admin/job_v2/${encodeURIComponent(String(jobId))}`);
      const savedItems = Array.isArray(detail?.items) ? detail.items : [];
      const mismatches = [];
      expectedItems.forEach((it, idx) => {
        const saved = savedItems[idx];
        if (!saved) {
          mismatches.push({ index: idx, field: 'item', expected: it.item_name, actual: null });
          return;
        }
        if (String(saved.item_name || '').trim() !== String(it.item_name || '').trim()) {
          mismatches.push({ index: idx, field: 'item_name', expected: it.item_name, actual: saved.item_name });
        }
        if (!it.price_overridden && Math.abs(Number(saved.unit_price || 0) - Number(it.unit_price || 0)) > 0.01) {
          mismatches.push({ index: idx, field: 'unit_price', expected: it.unit_price, actual: saved.unit_price });
        }
        if (String(it.item_name || '').includes('ล้างแอร์ผนัง') && String(it.item_name || '').includes('ล้างแขวนคอยล์')) {
          const name = String(saved.item_name || '');
          if (!name.includes('ล้างแอร์ผนัง') || !name.includes('ล้างแขวนคอยล์') || name.includes('แอร์แขวน/ตั้งพื้น')) {
            mismatches.push({ index: idx, field: 'wall_coil_mapping', expected: it.item_name, actual: saved.item_name });
          }
        }
      });
      if (mismatches.length) {
        console.warn('[admin-job-edit] post-save verification mismatch', { job_id: jobId, mismatches, expectedItems, savedItems });
        return { ok:false, mismatches };
      }
      return { ok:true };
    };

    const getCurrentTeamMembers = () => {
      // Prefer current UI selection (hidden json). Fallback to initial team members.
      const primaryU = getPrimaryTechFromUI(String(job.technician_username||'').trim());
      let members = [];
      try {
        const hid = el('edit_team_members_json');
        if (hid && hid.value) members = JSON.parse(hid.value);
      } catch {}
      if (!Array.isArray(members)) members = [];
      members = members.map(x=>String(x||'').trim()).filter(Boolean);
      if (primaryU && !members.includes(primaryU)) members.unshift(primaryU);
      return Array.from(new Set(members));
    };

    const renderEditor = () => {
      if (!tbody) return;
      if (!editorItems.length) {
        tbody.innerHTML = `<div class="editServiceCard muted2">ยังไม่มีรายการ (กด “เพิ่มรายการ” เพื่อเพิ่มบริการเหมือนหน้าเพิ่มงาน)</div>`;
        updateEditorTotal();
        return;
      }
      const teamMembers = getCurrentTeamMembers();
      tbody.innerHTML = editorItems.map((it, idx)=>{
        const q = Math.max(1, Number(it.qty||1));
        const unitPrice = Math.max(0, Number(it.unit_price||0));
        const line = q * unitPrice;
        const curAssignee = String(it.assigned_technician_username||'').trim();
        const jobKey = normalizeEditJobTypeKey(it.job_type_key || it.job_type || 'wash');
        const acKey = String(it.ac_type_key || 'wall');
        const washKey = acKey === 'wall' ? String(it.wash_type_key || 'normal') : 'none';
        const repairKey = String(it.repair_type_key || 'standard');
        const btuKey = String(it.btu_tier || (acKey === 'wall' ? 'small' : 'all'));
        const isStd = !!it.is_standard || !!it.ac_type_key || !!it.job_type_key;
        const members = teamMembers.slice();
        if (curAssignee && !members.includes(curAssignee)) members.push(curAssignee);
        const assigneeOpts = [''].concat(members).map(u=>{
          const val = String(u||'').trim();
          if (!val) return `<option value="">ใช้ช่างหลัก/ไม่ระบุ</option>`;
          const label = `${techDisplayName(val)} (${val})`;
          const sel = curAssignee && curAssignee === val ? 'selected' : '';
          return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
        const jobOpts = Object.entries(EDIT_JOB_TYPES).map(([k,v])=>`<option value="${k}" ${jobKey===k?'selected':''}>${escapeHtml(v)}</option>`).join('');
        const acOpts = Object.entries(STD_AC_TYPES).map(([k,v])=>`<option value="${k}" ${acKey===k?'selected':''}>${escapeHtml(v)}</option>`).join('');
        const washOpts = Object.entries(STD_WASH_TYPES).map(([k,v])=>`<option value="${k}" ${washKey===k?'selected':''}>${escapeHtml(v)}</option>`).join('');
        const repairOpts = Object.entries(EDIT_REPAIR_TYPES).map(([k,v])=>`<option value="${k}" ${repairKey===k?'selected':''}>${escapeHtml(v)}</option>`).join('');
        const btuOpts = Object.entries(STD_BTU).filter(([k])=>acKey === 'wall' ? k !== 'all' : k === 'all').map(([k,v])=>`<option value="${k}" ${btuKey===k?'selected':''}>${escapeHtml(v)}</option>`).join('');
        const previewName = isStd ? standardItemName({ ...it, job_type_key: jobKey, ac_type_key: acKey, wash_type_key: washKey, repair_type_key: repairKey, btu_tier: btuKey, qty:q }) : (it.item_name || 'รายการกำหนดเอง');
        return `<div class="editServiceCard" data-idx="${idx}">
          <div class="editServiceCardHead">
            <div>
              <div class="editServiceTitle">รายการที่ ${idx+1}</div>
              <div class="editServiceMeta">เลือกบริการเหมือนหน้าเพิ่มงาน แล้วระบบคำนวณราคาให้</div>
            </div>
            <button type="button" class="danger btn-small it_del" style="width:auto">ลบ</button>
          </div>
          <div class="editServiceGrid">
            <div><label>ประเภทงาน</label><select class="it_job_type">${jobOpts}</select></div>
            <div><label>ประเภทแอร์</label><select class="it_ac_type">${acOpts}</select></div>
            <div style="${jobKey==='wash' && acKey==='wall'?'':'display:none'}"><label>วิธีล้าง</label><select class="it_wash_type">${washOpts}</select></div>
            <div style="${jobKey==='repair'?'':'display:none'}"><label>ประเภทงานซ่อม</label><select class="it_repair_type">${repairOpts}</select></div>
            <div style="${jobKey==='repair' && repairKey==='parts'?'':'display:none'}"><label>เปลี่ยน/ซ่อมอะไร</label><input class="it_repair_detail" value="${escapeHtml(cleanRepairDetail(it.repair_detail || parseRepairDetailFromName(it.item_name) || ''))}" placeholder="เช่น เปลี่ยนแคปรัน 35uF" /></div>
            <div><label>BTU</label><select class="it_btu_tier">${btuOpts}</select></div>
            <div><label>จำนวนเครื่อง</label><input class="it_qty" type="number" min="1" step="1" value="${escapeHtml(String(q))}" /></div>
            <div><label>มอบหมายให้</label><select class="it_assignee">${assigneeOpts}</select></div>
          </div>
          <div class="editLinePreview">${escapeHtml(previewName)}</div>
          <div class="editPriceBox">
            <div>
              <div class="editPriceStatus it_price_status">${it.price_overridden ? 'แก้ราคาเอง' : 'ระบบคำนวณราคาให้อัตโนมัติจากรายการที่เลือก'}</div>
              <b><span class="it_line">${Number.isFinite(line) ? line.toLocaleString('th-TH') : '0'}</span> บาท</b>
            </div>
            <button type="button" class="secondary btn-small it_use_standard" style="width:auto">ใช้ราคามาตรฐาน</button>
          </div>
          <details class="editManualPrice" ${it.price_overridden ? 'open' : ''}>
            <summary style="font-weight:1000;color:#92400e;cursor:pointer">แก้ราคาเอง / ราคาซ่อมตามจริง</summary>
            <label class="mini" style="display:block;margin-top:8px;font-weight:900;color:#92400e">ราคา/หน่วย</label>
            <input class="it_unit" type="number" min="0" step="1" value="${escapeHtml(String(unitPrice))}" />
          </details>
          <div class="legacy_editor" style="${isStd?'display:none':'margin-top:10px'}">
            <label class="mini" style="font-weight:900">รายการกำหนดเอง/งานเก่า</label>
            <input class="it_name" value="${escapeHtml(it.item_name||'')}" placeholder="ชื่อรายการ" />
            <button type="button" class="secondary btn-small it_convert" style="width:auto;margin-top:6px">แปลงเป็นรายการมาตรฐาน</button>
          </div>
        </div>`;
      }).join('');

      Array.from(tbody.querySelectorAll('.editServiceCard')).forEach(card=>{
        const idx = Number(card.getAttribute('data-idx'));
        const jobSel = card.querySelector('.it_job_type');
        const acSel = card.querySelector('.it_ac_type');
        const washSel = card.querySelector('.it_wash_type');
        const repairSel = card.querySelector('.it_repair_type');
        const repairDetail = card.querySelector('.it_repair_detail');
        const btuSel = card.querySelector('.it_btu_tier');
        const convert = card.querySelector('.it_convert');
        const assignee = card.querySelector('.it_assignee');
        const splitMode = String(el('edit_split_mode')?.value || 'mixed');
        const qty = card.querySelector('.it_qty');
        const unit = card.querySelector('.it_unit');
        const useStandard = card.querySelector('.it_use_standard');
        const del = card.querySelector('.it_del');
        const name = card.querySelector('.it_name');

        const syncStandard = () => {
          const row = editorItems[idx];
          if (!row) return;
          row.is_standard = true;
          row.job_type_key = normalizeEditJobTypeKey(jobSel?.value || row.job_type_key || 'wash');
          row.job_type = jobTypePayload(row.job_type_key);
          row.ac_type_key = String(acSel?.value || row.ac_type_key || 'wall');
          if (row.ac_type_key !== 'wall') row.btu_tier = 'all';
          else row.btu_tier = String(btuSel?.value || row.btu_tier || 'small');
          if (row.job_type_key === 'wash' && row.ac_type_key === 'wall') row.wash_type_key = String(washSel?.value || row.wash_type_key || 'normal');
          else row.wash_type_key = row.ac_type_key === 'wall' ? String(row.wash_type_key || 'normal') : 'none';
          row.repair_type_key = String(repairSel?.value || row.repair_type_key || 'standard');
          row.repair_detail = cleanRepairDetail(repairDetail?.value || row.repair_detail || '');
          row.qty = Math.max(1, Math.round(Number(qty?.value || row.qty || 1)));
          row.price_overridden = isPartsRepairRow(row);
          row.item_name = standardItemName(row);
          renderEditor();
          if (!isPartsRepairRow(row)) setTimeout(()=>updateEditItemPriceFromSelection(idx, { force:true }), 0);
        };
        if (jobSel) jobSel.onchange = syncStandard;
        if (acSel) acSel.onchange = syncStandard;
        if (washSel) washSel.onchange = syncStandard;
        if (repairSel) repairSel.onchange = syncStandard;
        if (repairDetail) repairDetail.oninput = ()=>{
          const row = editorItems[idx];
          if (!row) return;
          row.repair_detail = cleanRepairDetail(repairDetail.value || '');
          row.price_overridden = isPartsRepairRow(row) ? true : !!row.price_overridden;
          row.item_name = standardItemName(row);
          updatePriceStatusForRow(idx);
        };
        if (btuSel) btuSel.onchange = syncStandard;
        if (assignee) {
          if (splitMode === 'coop_equal') { assignee.value = ''; assignee.disabled = true; }
          assignee.onchange = ()=>{ editorItems[idx].assigned_technician_username = String(assignee.value||'').trim() || null; };
        }
        if (qty) qty.oninput = ()=>{
          const row = editorItems[idx];
          row.qty = Math.max(1, Math.round(Number(qty.value||1)));
          if (row.is_standard) {
            row.item_name = standardItemName(row);
            if (!row.price_overridden) updateEditItemPriceFromSelection(idx);
            else updatePriceStatusForRow(idx);
          } else updatePriceStatusForRow(idx);
        };
        if (unit) unit.oninput = ()=>{
          editorItems[idx].unit_price = Number(unit.value||0);
          editorItems[idx].price_overridden = true;
          updatePriceStatusForRow(idx);
        };
        if (useStandard) useStandard.onclick = async ()=>{
          if (isPartsRepairRow(editorItems[idx])) {
            editorItems[idx].repair_type_key = 'standard';
            editorItems[idx].repair_detail = '';
          }
          editorItems[idx].price_overridden = false;
          await updateEditItemPriceFromSelection(idx, { force:true });
          renderEditor();
        };
        if (convert) convert.onclick = () => {
          const parsed = parseStandardItemName(editorItems[idx].item_name) || { job_type_key:'wash', job_type:'ล้าง', ac_type_key:'wall', wash_type_key:'normal', repair_type_key:'standard', btu_tier:'small', is_standard:true };
          Object.assign(editorItems[idx], parsed);
          editorItems[idx].price_overridden = false;
          editorItems[idx].item_name = standardItemName(editorItems[idx]);
          renderEditor();
          setTimeout(()=>updateEditItemPriceFromSelection(idx, { force:true }), 0);
        };
        if (name) name.oninput = ()=>{ editorItems[idx].item_name = name.value; };
        if (del) del.onclick = ()=>{ editorItems.splice(idx,1); renderEditor(); };
        updatePriceStatusForRow(idx);
      });
      updateEditorTotal();
    };

    renderEditor();
    const editJobTypeEl = el('edit_job_type');
    if (editJobTypeEl) {
      editJobTypeEl.onchange = () => {
        editorItems.forEach((row, idx) => {
          if (row?.is_standard) {
            row.job_type_key = normalizeEditJobTypeKey(editJobTypeEl.value || row.job_type_key || 'wash');
            row.job_type = jobTypePayload(row.job_type_key);
            row.price_overridden = false;
            updateEditItemPriceFromSelection(idx, { force:true });
          }
        });
      };
    }

    const btnAddItem = el('btnAddItem');
    if (btnAddItem) {
      btnAddItem.onclick = ()=>{
        const idx = editorItems.length;
        editorItems.push({ item_id: null, item_name: 'ล้างแอร์ผนัง • ล้างธรรมดา • 12000 BTU • 1 เครื่อง', qty: 1, unit_price: 0, job_type_key:'wash', job_type:'ล้าง', ac_type_key:'wall', wash_type_key:'normal', repair_type_key:'standard', btu_tier:'small', is_standard:true, price_overridden:false });
        renderEditor();
        setTimeout(()=>updateEditItemPriceFromSelection(idx, { force:true }), 0);
      };
    }

    // --- Team editor init ---
    try {
      await loadAllTechsOnce();
      const primaryU = String(job.technician_username||'').trim();
      const curTeamUsers = teamUsernames; // from loadJob scope

      // primary dropdown (allow change lead)
      const primarySel = el('edit_primary_tech');
      if (primarySel) {
        const all = (teamEdit.techs || []).slice().sort((a,b)=>a.username.localeCompare(b.username));
        primarySel.innerHTML = `<option value="">- ไม่ระบุ -</option>` + all.map(t=>{
          const u = String(t.username||'').trim();
          const label = `${techDisplayName(u)} (${u})`;
          const sel = (u && u === primaryU) ? 'selected' : '';
          return `<option value="${escapeHtml(u)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
        // if job has primary not in list (legacy), still show it
        if (primaryU && !all.some(t=>t.username===primaryU)) {
          const opt = document.createElement('option');
          opt.value = primaryU;
          opt.textContent = `${techDisplayName(primaryU)} (${primaryU})`;
          opt.selected = true;
          primarySel.insertBefore(opt, primarySel.children[1] || null);
        }
      }

      // initial render
      renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers);
      const searchEl = el('edit_team_search');
      const selEl = el('edit_team_members');
      if (searchEl) searchEl.oninput = ()=>renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers);
      if (selEl) selEl.onchange = ()=>{ renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers); renderEditor(); };
      if (primarySel) primarySel.onchange = ()=>{ renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers); renderEditor(); };
    } catch (e) {
      console.warn('team editor init failed', e);
    }

    const btnSave = el('btnSaveEdit');
    const msg = el('edit_msg');
    if (btnSave) {
      btnSave.onclick = async ()=>{
        try{
          btnSave.disabled = true;
          if (msg) msg.textContent = 'กำลังบันทึกข้อมูลใบงาน รายการบริการ และทีมช่าง...';

          const apptRaw = String(el('edit_appt')?.value||'').trim();
          const primaryU = getPrimaryTechFromUI(String(job.technician_username||'').trim()) || null;
          const payload = {
            customer_name: String(el('edit_customer_name')?.value||'').trim(),
            customer_phone: String(el('edit_customer_phone')?.value||'').trim(),
            job_type: String(el('edit_job_type')?.value||'').trim(),
            address_text: String(el('edit_address')?.value||'').trim(),
            job_zone: String(el('edit_zone')?.value||'').trim(),
            maps_url: String(el('edit_maps_url')?.value||'').trim(),
            latitude: String(el('edit_lat')?.value||'').trim(),
            longitude: String(el('edit_lng')?.value||'').trim(),
            // IMPORTANT (Timezone): <input type="datetime-local"> has no timezone.
            // Using Date(...).toISOString() will convert to UTC ("Z") and cause 09:00 -> 16:00/18:00 shifts.
            // Treat the picked wall-clock time as Bangkok (+07:00).
            appointment_datetime: apptRaw ? localDatetimeToBangkokISO(apptRaw) : null,
            // allow change lead / primary technician (backward-compatible)
            technician_username: primaryU,
          };
          for (let i = 0; i < editorItems.length; i++) {
            if (editorItems[i]?.is_standard && !editorItems[i]?.price_overridden) {
              await updateEditItemPriceFromSelection(i);
            }
          }
          const cleanItems = editorItems
            .map(it=>({
              item_id: it.item_id ? Number(it.item_id) : null,
              item_name: String(it.is_standard ? standardItemName(it) : (it.item_name||'')).trim(),
              qty: Number(it.qty||0),
              unit_price: Number(it.unit_price||0),
              line_total: Number(it.qty||0) * Number(it.unit_price||0),
              assigned_technician_username: String(it.assigned_technician_username||'').trim() || null,
              is_service: true,
              price_overridden: !!it.price_overridden || isPartsRepairRow(it),
              job_type: it.is_standard ? jobTypePayload(it.job_type_key || it.job_type || 'wash') : (String(it.job_type || payload.job_type || 'ล้าง').trim() || 'ล้าง'),
              ac_type: it.is_standard ? (STD_AC_PAYLOAD[String(it.ac_type_key || 'wall')] || 'ผนัง') : null,
              wash_variant: it.is_standard && normalizeEditJobTypeKey(it.job_type_key || it.job_type || 'wash') === 'wash' && String(it.ac_type_key || 'wall') === 'wall' ? normalizeEditWashVariant(STD_WASH_PAYLOAD[String(it.wash_type_key || 'normal')] || 'ล้างธรรมดา') : null,
              repair_variant: it.is_standard && normalizeEditJobTypeKey(it.job_type_key || it.job_type || 'wash') === 'repair' ? (EDIT_REPAIR_PAYLOAD[String(it.repair_type_key || 'standard')] || '') : null,
              repair_detail: it.is_standard && isPartsRepairRow(it) ? cleanRepairDetail(it.repair_detail || parseRepairDetailFromName(it.item_name) || '') : null,
              btu: it.is_standard ? Number(STD_BTU_VALUE[String(it.btu_tier || ((String(it.ac_type_key||'wall')==='wall')?'small':'all'))] || 12000) : null,
              machine_count: Number(it.qty || 0),
            }))
            .filter(it=>it.item_name);
          const nextDurationMin = computeEditDurationMin();
          if (nextDurationMin && nextDurationMin > 0) payload.duration_min = nextDurationMin;

          const hid = el('edit_team_members_json');
          let desired = [];
          if (hid && hid.value) {
            try { desired = JSON.parse(hid.value); } catch {}
          }
          if (!Array.isArray(desired)) desired = [];
          desired = desired.map(x=>String(x||'').trim()).filter(Boolean);
          if (primaryU && !desired.includes(primaryU)) desired.unshift(primaryU);
          desired = buildAdminEditTeamSnapshot(primaryU, desired).members;

          // Save everything through one orchestrated backend call.
          // Rationale: avoid the old 3-step save flow that could leave header/items/team out of sync.
          // Snapshot fields let backend reject stale editor data with 409 instead of overwriting newer changes.
          const result = await apiFetch(`/jobs/${encodeURIComponent(String(job.job_id))}/admin-edit`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              ...payload,
              items: cleanItems,
              team_members: desired,
              primary_username: primaryU,
              base_items_snapshot: baseItemsSnapshot,
              base_team_snapshot: baseTeamSnapshot,
            })
          });

          const done = [];
          if (result?.steps?.header) done.push('ข้อมูลหลัก');
          if (result?.steps?.items) done.push('รายการบริการ');
          if (result?.steps?.team) done.push('ทีมช่าง');

          const verify = await verifyAdminEditSave(job.job_id, cleanItems).catch((e)=>{
            console.warn('[admin-job-edit] post-save verification failed', e);
            return { ok:true, skipped:true };
          });
          if (!verify.ok) {
            showToast('บันทึกแล้วแต่รายการ/ราคาไม่ตรงกับที่เลือก กรุณาตรวจสอบก่อนส่งลูกค้า', 'error');
            if (msg) msg.textContent = '⚠️ บันทึกแล้วแต่รายการ/ราคาไม่ตรงกับที่เลือก กรุณาตรวจสอบก่อนส่งลูกค้า';
            return;
          }

          showToast('บันทึกใบงานครบแล้ว', 'success');
          if (msg) msg.textContent = `✅ บันทึกใบงานครบแล้ว${done.length ? `: ${done.join(' / ')}` : ''}`;
          await loadJob();
        }catch(e){
          console.error(e);
          let text = e?.message || 'บันทึกไม่สำเร็จ';
          if (Number(e?.status || 0) === 409) {
            const code = String(e?.data?.code || '').trim();
            if (code === 'STALE_ITEMS' || code === 'STALE_TEAM') {
              text = `${text}\n\nคำแนะนำ: กดรีโหลดหน้าใบงานนี้ก่อน แล้วตรวจสอบข้อมูลล่าสุดอีกครั้ง`;
            }
          }
          alert(text);
          if (msg) msg.textContent = `❌ ${text.replace(/\n+/g, ' ')} • รอบนี้ยังไม่มีการบันทึกข้อมูลเพิ่ม`;
        }finally{
          btnSave.disabled = false;
        }
      };
    }
  } catch (e) {
    console.warn('admin edit init failed', e);
  }

  const btnCreateReworkCase = el('btnCreateReworkCase');
  if (btnCreateReworkCase) {
    btnCreateReworkCase.onclick = async ()=>{
      const prefillReason = (el('return_reason')?.value||'').trim();
      const prefillType = String(el('rework_reason_type')?.value || 'other').trim();
      openCaseModal('ส่งงานกลับแก้', `
        <div class="caseGrid">
          <div><label>ประเภทงานแก้ไข</label><select id="caseReworkType">${labeledOptionList(REWORK_CASE_REASON_TYPES, prefillType, REWORK_CASE_REASON_LABELS)}</select></div>
          <div><label>สถานะประกัน</label><input value="${inWarranty(job) ? 'อยู่ในประกัน' : 'นอกประกัน/ไม่พบข้อมูล'}" disabled></div>
          <div class="full"><label>รายละเอียดปัญหา</label><textarea id="caseReworkReason" rows="4" placeholder="ระบุปัญหาที่ต้องให้ช่างแก้ไข">${escapeHtml(prefillReason)}</textarea></div>
          <div class="full caseNotice">ระบบจะสร้างเคสงานแก้ไข และเปลี่ยนสถานะงานเป็น “งานแก้ไข” เพื่อส่งกลับไปยังช่าง</div>
          <div class="full"><label style="display:flex;gap:8px;align-items:center;color:#09152f"><input id="caseWarrantyChecked" type="checkbox" ${inWarranty(job) ? 'checked' : ''} style="width:auto;min-height:auto"> ตรวจสอบสถานะประกันแล้ว</label></div>
          <div class="full caseActions"><button class="caseBtn yellow" type="button" id="caseCancel">ยกเลิก</button><button class="caseBtn blue" type="button" id="caseSubmitRework">ส่งงานกลับแก้</button></div>
        </div>
      `);
      el('caseCancel').onclick = closeCaseModal;
      el('caseSubmitRework').onclick = async ()=>{
        const reason_note = String(el('caseReworkReason')?.value || '').trim();
        const reason_type = String(el('caseReworkType')?.value || '').trim();
        if (!reason_note) return alert('ต้องระบุปัญหา/เหตุผลก่อนส่งงานกลับแก้');
        await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/rework_case`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason_type, reason_note, warranty_checked: !!el('caseWarrantyChecked')?.checked })
        });
        closeCaseModal();
        showToast('ส่งงานกลับแก้เรียบร้อยแล้ว', 'success');
        await loadJob();
      };
    };
  }

  const btnCreateDeductionCase = el('btnCreateDeductionCase');
  if (btnCreateDeductionCase) {
    btnCreateDeductionCase.onclick = async ()=>{
      openCaseModal('เปิดเคสหักเงิน', `
        <div class="caseGrid">
          <div><label>ช่าง</label><input id="caseDeductTech" value="${escapeHtml(String(job.technician_username || '').trim())}" placeholder="username"></div>
          <div><label>งาน</label><input id="caseDeductJob" value="${escapeHtml(String(job.job_id || ''))}" disabled></div>
          <div><label>ประเภทหักเงิน</label><select id="caseDeductType">${optionList(DEDUCTION_CASE_TYPES, 'manual_adjustment')}</select></div>
          <div><label>จำนวนเงิน</label><input id="caseDeductAmount" type="number" min="0" step="0.01" placeholder="0.00"></div>
          <div><label>ความรุนแรง</label><select id="caseDeductSeverity">${optionList(['low','medium','high','critical'], 'medium')}</select></div>
          <div class="full"><label>เหตุผล</label><textarea id="caseDeductReason" rows="3" placeholder="ระบุเหตุผลการเปิดเคสหักเงิน"></textarea></div>
          <div class="full"><label>หลักฐาน/หมายเหตุหลักฐาน</label><textarea id="caseDeductEvidence" rows="2" placeholder="เช่น รูปก่อน/หลัง, ข้อความลูกค้า, หมายเหตุ"></textarea></div>
          <div class="full caseNotice">${DEDUCTION_WARNING_TEXT}</div>
          <div class="full caseActions"><button class="caseBtn yellow" type="button" id="caseCancel">ยกเลิก</button><button class="caseBtn blue" type="button" id="caseSubmitDeduction">สร้างเคสหักเงิน</button></div>
        </div>
      `);
      el('caseCancel').onclick = closeCaseModal;
      el('caseSubmitDeduction').onclick = async ()=>{
        const technician_username = String(el('caseDeductTech')?.value || '').trim();
        const amount = Number(el('caseDeductAmount')?.value || 0);
        const reason = String(el('caseDeductReason')?.value || '').trim();
        if (!technician_username) return alert('ต้องระบุช่าง');
        if (!Number.isFinite(amount) || amount <= 0) return alert('จำนวนเงินต้องมากกว่า 0');
        if (!reason) return alert('ต้องระบุเหตุผล');
        await apiFetch('/admin/deductions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            technician_username,
            job_id: job.job_id,
            deduction_type: el('caseDeductType')?.value,
            amount,
            reason,
            severity: el('caseDeductSeverity')?.value || 'medium',
            evidence_json: normalizeEvidenceNote(el('caseDeductEvidence')?.value),
          })
        });
        closeCaseModal();
        showToast('เปิดเคสหักเงินแล้ว', 'success');
      };
    };
  }

  const btnViewCaseHistory = el('btnViewCaseHistory');
  if (btnViewCaseHistory) {
    btnViewCaseHistory.onclick = async ()=>{
      const d = await apiFetch(`/admin/deductions?job_id=${encodeURIComponent(String(job.job_id))}`);
      const r = await apiFetch(`/admin/rework_cases?job_id=${encodeURIComponent(String(job.job_id))}`);
      const deductions = d.rows || [];
      const reworks = r.rows || [];
      const deductionHtml = deductions.length ? deductions.map(x=>`
        <div class="caseItem">
          <b>${escapeHtml(x.case_code || '-')}</b>
          <div>${escapeHtml(x.deduction_type || '-')} · ${Number(x.amount||0).toLocaleString()} บาท</div>
          <div class="caseMeta"><span>สถานะ: ${escapeHtml(x.status || '-')}</span><span>รุนแรง: ${escapeHtml(x.severity || '-')}</span><span>${fmtDT(x.created_at)}</span></div>
          <div style="margin-top:6px">${escapeHtml(x.reason || '')}</div>
        </div>`).join('') : '<div class="muted2">ยังไม่มีเคสหักเงิน</div>';
      const reworkHtml = reworks.length ? reworks.map(x=>`
        <div class="caseItem">
          <b>${escapeHtml(x.case_code || '-')}</b>
          <div>${escapeHtml(reworkReasonLabel(x.reason_type))}</div>
          <div class="caseMeta"><span>สถานะ: ${escapeHtml(x.status || '-')}</span><span>ผล: ${escapeHtml(x.resolution || '-')}</span><span>${fmtDT(x.created_at)}</span></div>
          <div style="margin-top:6px">${escapeHtml(x.reason_note || '')}</div>
        </div>`).join('') : '<div class="muted2">ยังไม่มีเคสงานแก้ไข</div>';
      openCaseModal('ประวัติเคสของงานนี้', `
        <div class="caseList">
          <div class="caseNotice">${DEDUCTION_WARNING_TEXT}</div>
          <h3 style="margin:0;color:#071947">เคสหักเงิน</h3>
          ${deductionHtml}
          <h3 style="margin:4px 0 0;color:#071947">งานแก้ไข</h3>
          ${reworkHtml}
          <div class="caseActions"><button class="caseBtn yellow" type="button" id="caseCancel">ปิด</button></div>
        </div>
      `);
      el('caseCancel').onclick = closeCaseModal;
    };
  }

  const btnExtend = el('btnExtend');
  if (btnExtend) {
    btnExtend.onclick = async ()=>{
      const days = Number(el('extend_days')?.value||0);
      if (!Number.isFinite(days) || days <= 0) return alert('กรอกจำนวนวันให้ถูกต้อง');
      if (!confirm(`ยืนยันขยายวันประกัน +${days} วัน?`)) return;
      await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/extend_warranty_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, actor_username: actorName() })
      });
      showToast('ขยายวันประกันแล้ว', 'success');
      await loadJob();
    };
  }

  
  const btnForce = el('btnForceFinish');
  if (btnForce) {
    btnForce.onclick = async ()=> {
      if (!confirm('ยืนยันปิดงานแทนช่าง? (งานจะถูกตั้งเป็น “เสร็จแล้ว” ทันที)')) return;
      const reason = (el('force_finish_reason')?.value || '').trim();
      const payload = { role:'admin', actor_username: (localStorage.getItem('admin_username')||'').trim() || null, reason };
      const r = await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/force_finish_v2`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (r && r.success) {
        alert('✅ ปิดงานแทนช่างเรียบร้อย');
        // reload page state
        location.reload();
      } else {
        alert('❌ ปิดงานไม่สำเร็จ');
      }
    };
  }

  const btnDel = el('btn_delete_job');
  if (btnDel) {
    btnDel.onclick = async ()=> {
      const code = String(job.booking_code||'').trim();
      const t1 = `ยืนยันลบงานนี้?\n\njob_id: ${job.job_id}\nbooking_code: ${code}\nช่าง: ${job.technician_username||'-'}\nวันเวลา: ${job.appointment_datetime||job.appointment_datetime_th||'-'}`;
      if (!confirm(t1)) return;
      const t2 = prompt(`พิมพ์ DELETE หรือ ${code} เพื่อยืนยันการลบถาวร`, '');
      if (!t2) return;
      const v = String(t2).trim();
      if (!(v === 'DELETE' || (code && v === code))) {
        alert('คำยืนยันไม่ถูกต้อง ยกเลิกการลบ');
        return;
      }
      try {
        btnDel.disabled = true;
        await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}`, { method: 'DELETE' });
        showToast('ลบงานเรียบร้อย', 'success');
        // go back to queue/history page (fail-open)
        setTimeout(()=>{ location.href = '/admin-queue-v2.html'; }, 600);
      } catch (e) {
        btnDel.disabled = false;
        alert(`ลบงานไม่สำเร็จ: ${e?.data?.error || e.message || 'error'}`);
      }
    };
  }



const btnClone = el('btnClone');
  if (btnClone) {
    btnClone.onclick = async ()=>{
      const appt = String(el('clone_appt')?.value||'').trim();
      if (!appt) return alert('ต้องเลือกวัน/เวลาใหม่');
      const tech = String(el('clone_tech')?.value||'').trim();
      const type = String(el('clone_type')?.value||'').trim();
      const keep = Array.from(document.querySelectorAll('.clone-item')).filter(c=>c.checked).map(c=>Number(c.value)).filter(n=>Number.isFinite(n));
      const payload = {
        actor_username: actorName(),
        appointment_datetime: localDatetimeToBangkokISO(appt),
        technician_username: tech || null,
        job_type: type || null,
        keep_item_ids: keep
      };
      const rr = await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/clone_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(`สร้างงานใหม่แล้ว #${rr.new_job_id}`, 'success');
      // jump to new job
      location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(rr.new_job_id))}`;
    };
  }

  // summary copy (existing feature)
  try {
    let text = '';
    try {
      const r = await apiFetch(`/jobs/${encodeURIComponent(String(job.job_id))}/summary`);
      text = String(r?.text || '').trim();
    } catch (_) {
      text = buildSummaryText(job, items, promotion);
    }
    if (text) {
      el('summary_card').style.display = 'block';
      el('summary_text').value = text;
    }
  } catch (e) {}
}

function buildSummaryText(job, items, promotion){
  // Minimal, safe summary (no regression to existing flows)
  const appt = fmtDT(job.appointment_datetime);
  const addr = safe(job.address_text||'');
  const lines = [];
  lines.push(`ยืนยันนัดหมายบริการแอร์`);
  lines.push(`Coldwindflow Air Services`);
  lines.push('');
  lines.push(`แอดมินขออนุญาตยืนยันรายละเอียดนัดหมายดังนี้ค่ะ`);
  lines.push('');
  lines.push(`🔎 เลขงาน: ${safe(job.booking_code||job.job_id)}`);
  lines.push(`👤 ชื่อลูกค้า: ${safe(job.customer_name||'-')}`);
  lines.push(`📞 เบอร์โทร: ${safe(job.customer_phone||'-')}`);
  lines.push(`📅 วันและเวลานัด: ${appt}`);
  lines.push(`🧾 ประเภทงาน: ${safe(job.job_type||'-')}`);
  if (addr) lines.push(`🏠 สถานที่บริการ: ${addr}`);
  if (items?.length){
    lines.push('');
    lines.push('🧾 รายการบริการ:');
    for (const it of items){
      lines.push(`- ${safe(it.item_name)} x${safe(it.qty)}`);
    }
  }
  if (promotion?.promo_name){
    lines.push('');
    lines.push(`🎁 โปรโมชั่น: ${safe(promotion.promo_name)}`);
  }
  lines.push('');
  lines.push('หมายเหตุ: ก่อนช่างเข้าหน้างาน จะมีช่างติดต่อโทรยืนยันนัดหมายอีกครั้ง รบกวนลูกค้ารับสายตามเบอร์ที่แจ้งไว้ เพื่อให้ทีมงานเข้าบริการได้ตรงเวลาและไม่ตกหล่นนะคะ');
  lines.push('');
  lines.push('ขอบคุณค่ะ');
  lines.push('Coldwindflow Air Services');
  lines.push('LINE OA: @cwfair');
  lines.push('โทร: 098-877-7321');
  return lines.join('\n');
}

function init(){
  const btnLogout = el('btnLogout');
  if (btnLogout) btnLogout.onclick = ()=>{ location.href='/logout'; };
  const btnCopy = el('btnCopySummary');
  if (btnCopy) {
    btnCopy.onclick = async ()=>{
      const t = el('summary_text')?.value || '';
      try {
        await navigator.clipboard.writeText(t);
        showToast('คัดลอกแล้ว', 'success');
      } catch (e) {
        alert('คัดลอกไม่สำเร็จ');
      }
    };
  }
  loadJob().catch(e=>{
    console.error(e);
    el('jobCard').innerHTML = `❌ ${escapeHtml(e.message||'โหลดใบงานไม่สำเร็จ')}`;
  });
}

init();
