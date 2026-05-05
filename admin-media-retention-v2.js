function $(id){ return document.getElementById(id); }
function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(v){ if(!v) return '-'; try { return new Date(v).toLocaleDateString('th-TH'); } catch { return '-'; } }
function fmtBytes(n){
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x <= 0) return '0 MB';
  if (x >= 1024*1024*1024) return `${(x / 1024 / 1024 / 1024).toLocaleString('th-TH', { maximumFractionDigits: 2 })} GB`;
  return `${(x / 1024 / 1024).toLocaleString('th-TH', { maximumFractionDigits: 1 })} MB`;
}

async function api(url, opts){
  const options = Object.assign({}, opts || {});
  const isForm = (typeof FormData !== 'undefined') && options.body instanceof FormData;
  const headers = Object.assign(isForm ? {} : { 'Content-Type':'application/json' }, { 'x-user-role':'admin' }, options.headers || {});
  const r = await fetch(url, Object.assign({ credentials:'same-origin' }, options, { headers }));
  const raw = await r.text().catch(()=> '');
  let d = {};
  try { d = raw ? JSON.parse(raw) : {}; } catch { d = {}; }
  if (!r.ok) {
    let msg = d.error_th || d.message || d.error || 'ทำรายการไม่สำเร็จ';
    if (r.status === 502 || r.status === 503 || r.status === 504 || /<!doctype|<html|cloudflare|cf-error|cf-footer|bad gateway/i.test(raw)) {
      msg = 'เซิร์ฟเวอร์ไม่พร้อมใช้งานชั่วคราว กรุณารอสักครู่แล้วลองใหม่';
    }
    throw new Error(msg);
  }
  return d;
}

function selectedJobIds(){
  return Array.from(document.querySelectorAll('.media-job-check:checked')).map(x=>Number(x.value)).filter(Boolean);
}
function eligibleJobIds(){
  return (window.__mediaFiltered || []).filter(j=>j.eligibility?.eligible).map(j=>Number(j.job_id)).filter(Boolean);
}
function updateBulkBar(){
  const ids = selectedJobIds();
  const bar = $('bulkBar');
  if (bar) bar.innerHTML = `เลือกแล้ว <b>${ids.length}</b> ใบงาน`;
}
function setAllEligible(v){
  const ids = new Set(eligibleJobIds());
  document.querySelectorAll('.media-job-check').forEach(ch=>{ if(ids.has(Number(ch.value))) ch.checked = !!v; });
  updateBulkBar();
}

function renderSummary(s){
  const cards = [
    ['รูปทั้งหมด', s.total_photos || 0],
    ['รูปหลักฐานที่ลบได้แล้ว', s.eligible_photos == null ? 'ตรวจตามรายการ' : s.eligible_photos],
    ['งานที่ล้างข้อมูลได้แล้ว', s.eligible_jobs || 0],
    ['รูปสลิป', `${s.slip_photos || 0} รูป`],
    ['พื้นที่ที่ล้างได้โดยประมาณ', fmtBytes(s.bytes_estimated || 0)],
    ['พื้นที่ที่ระบบบันทึกไว้ทั้งหมด', fmtBytes(s.total_bytes_estimated || 0)],
  ];
  $('mediaSummary').innerHTML = cards.map(([t,v]) => `<div class="summary-card"><div class="muted2">${esc(t)}</div><b style="font-size:22px">${esc(v)}</b></div>`).join('') + `<div class="muted2" style="grid-column:1/-1;margin-top:6px">${esc(s.storage_free_note || 'พื้นที่ว่างจริงดูได้จาก Render/Cloudinary Dashboard')}</div>`;
}

function renderJobs(rows){
  const status = $('filterStatus').value || 'all';
  const filtered = rows.filter(j => status === 'all' || (status === 'eligible' ? j.eligibility?.eligible : !j.eligibility?.eligible));
  window.__mediaFiltered = filtered;
  updateBulkBar();
  $('mediaJobs').innerHTML = filtered.length ? filtered.map(j => {
    const ok = !!j.eligibility?.eligible;
    const hasEvidence = Number(j.photo_count || 0) > 0;
    const hasSlips = Number(j.slip_count || 0) > 0;
    return `<div class="item media-job-row ${ok ? 'is-eligible':''}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <label style="display:flex;gap:10px;align-items:flex-start;min-width:0">
          <input class="media-job-check" type="checkbox" value="${Number(j.job_id)}" ${ok ? 'checked' : ''} onchange="updateBulkBar()" style="width:22px;height:22px;margin-top:4px">
          <div>
            <b>${esc(j.booking_code || ('#' + j.job_id))} • ${esc(j.job_type || '-')}</b>
            <div class="mini">${esc(j.customer_name || '-')} • ${esc(j.customer_phone || '-')}</div>
          </div>
        </label>
        <span class="pill" style="${ok ? 'background:#dcfce7;color:#166534' : 'background:#fff7ed;color:#9a3412'}">${esc(j.eligibility?.reason || '-')}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <span class="pill">วันที่ปิดงาน: ${fmtDate(j.completion_date)}</span>
        <span class="pill">หมดประกัน: ${fmtDate(j.warranty_end_date)}</span>
        <span class="pill">ล้างได้ตั้งแต่: ${fmtDate(j.purge_eligible_date)}</span>
        <span class="pill">รูปหลักฐาน: ${Number(j.photo_count || 0)} รูป</span>
        <span class="pill">รูปสลิป: ${Number(j.slip_count || 0)} รูป</span>
        <span class="pill">พื้นที่: ${fmtBytes(j.bytes_estimated || 0)}</span>
        <span class="pill">เช็คลิส: ${Number(j.checklist_count || 0)}</span>
        <span class="pill">เครื่อง: ${Number(j.unit_count || 0)}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="secondary" type="button" style="width:auto" onclick="location.href='/admin-job-view-v2.html?job_id=${encodeURIComponent(j.job_id)}'">ดูรายละเอียด</button>
        <button class="secondary" type="button" style="width:auto" onclick="dryRunMany([${Number(j.job_id)}], false)">ตรวจสอบก่อนลบ</button>
        <button class="danger" type="button" style="width:auto" ${ok && hasEvidence ? '' : 'disabled'} onclick="purgeMany([${Number(j.job_id)}], false)">ล้างหลักฐานงาน</button>
        <button class="danger" type="button" style="width:auto;background:#7c2d12" ${hasSlips ? '' : 'disabled'} onclick="purgeMany([${Number(j.job_id)}], true)">ลบเฉพาะสลิป</button>
      </div>
    </div>`;
  }).join('') : '<div class="muted2">ไม่พบงานที่มีรูปตามเงื่อนไข</div>';
  updateBulkBar();
}

async function loadAll(){
  $('mediaSummary').innerHTML = '<div class="muted2">กำลังโหลด...</div>';
  $('mediaJobs').innerHTML = '<div class="muted2">กำลังโหลดรายการ...</div>';
  const qs = new URLSearchParams();
  qs.set('job_type', $('filterType').value || 'all');
  qs.set('q', $('filterSearch').value || '');
  let jobs = { jobs: [] };
  try {
    jobs = await api('/admin/media-retention/jobs?' + qs.toString());
    window.__mediaJobs = jobs.jobs || [];
    renderJobs(window.__mediaJobs);
  } catch(e) {
    $('mediaJobs').innerHTML = `<div class="muted2">${esc(e.message || 'โหลดรายการรูปไม่สำเร็จ')}</div>`;
  }
  try {
    const summary = await api('/admin/media-retention/summary');
    renderSummary(summary);
  } catch(e) {
    const rows = window.__mediaJobs || [];
    const elig = rows.filter(j=>j.eligibility?.eligible);
    renderSummary({
      total_photos: rows.reduce((s,j)=>s+Number(j.photo_count||0)+Number(j.slip_count||0),0),
      eligible_photos: elig.reduce((s,j)=>s+Number(j.photo_count||0),0),
      eligible_jobs: elig.length,
      slip_photos: rows.reduce((s,j)=>s+Number(j.slip_count||0),0),
      bytes_estimated: elig.reduce((s,j)=>s+Number(j.bytes_estimated||0),0),
      total_bytes_estimated: rows.reduce((s,j)=>s+Number(j.bytes_estimated||0)+Number(j.slip_bytes_estimated||0),0),
    });
  }
}

async function dryRunMany(ids, slipOnly){
  const r = await api('/admin/media-retention/purge', { method:'POST', body: JSON.stringify({ dry_run:true, job_ids:ids, slip_only:!!slipOnly, purge_type: slipOnly ? 'slips' : 'job_evidence', confirm_text:'' }) });
  const total = (r.results || []).reduce((a,x)=>({ photos:a.photos+Number(x.photos_count||0), slips:a.slips+Number(x.slips_count||0), bytes:a.bytes+Number(x.bytes_estimated||0) }), {photos:0, slips:0, bytes:0});
  alert(`ตรวจสอบก่อนลบเสร็จแล้ว ยังไม่มีการลบข้อมูลจริง\n${slipOnly ? 'รูปสลิป' : 'รูปหลักฐาน'}: ${slipOnly ? total.slips : total.photos} รูป\nพื้นที่โดยประมาณ: ${fmtBytes(total.bytes)}`);
  return r;
}
async function purgeMany(ids, slipOnly){
  if (!ids.length) return alert('กรุณาเลือกงานก่อน');
  await dryRunMany(ids, slipOnly);
  const need = slipOnly ? 'ยืนยันลบสลิป' : 'ยืนยันลบ';
  const text = prompt(`พิมพ์ "${need}" เพื่อยืนยัน${slipOnly ? 'การลบเฉพาะรูปสลิป' : 'การล้างรูปหลักฐานและข้อมูลหนัก'}`);
  if (String(text || '').trim() !== need) return alert('ยกเลิกการลบ');
  const r = await api('/admin/media-retention/purge', { method:'POST', body: JSON.stringify({ dry_run:false, job_ids:ids, slip_only:!!slipOnly, purge_type: slipOnly ? 'slips' : 'job_evidence', confirm_text:need }) });
  alert(r.message || 'ทำรายการเรียบร้อย');
  loadAll();
}
function dryRun(jobId){ return dryRunMany([Number(jobId)], false); }
function purgeJob(jobId){ return purgeMany([Number(jobId)], false); }
function purgeSelected(slipOnly){ return purgeMany(selectedJobIds(), !!slipOnly); }
function dryRunSelected(){ return dryRunMany(selectedJobIds(), false); }

window.dryRun = dryRun; window.purgeJob = purgeJob; window.updateBulkBar = updateBulkBar; window.setAllEligible = setAllEligible; window.purgeSelected = purgeSelected; window.dryRunSelected = dryRunSelected;
$('btnReload')?.addEventListener('click', loadAll);
$('filterStatus')?.addEventListener('change', () => renderJobs(window.__mediaJobs || []));
$('filterType')?.addEventListener('change', loadAll);
$('filterSearch')?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') loadAll(); });
loadAll().catch(e => { $('mediaJobs').innerHTML = `<div class="muted2">${esc(e.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`; });
