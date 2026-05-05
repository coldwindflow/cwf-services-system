function $(id){ return document.getElementById(id); }
function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(v){ if(!v) return '-'; try { return new Date(v).toLocaleDateString('th-TH'); } catch { return '-'; } }
function fmtBytes(n){
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x <= 0) return '0 MB';
  return `${(x / 1024 / 1024).toLocaleString('th-TH', { maximumFractionDigits: 1 })} MB`;
}

async function api(url, opts){
  const r = await fetch(url, Object.assign({ credentials:'same-origin' }, opts || {}));
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d.error || 'ทำรายการไม่สำเร็จ');
  return d;
}

function renderSummary(s){
  const cards = [
    ['รูปทั้งหมด', s.total_photos || 0],
    ['รูปหลักฐานที่ลบได้แล้ว', s.eligible_photos == null ? 'ตรวจตามรายการ' : s.eligible_photos],
    ['งานที่ล้างข้อมูลได้แล้ว', s.eligible_jobs || 0],
    ['รูปสลิปที่ไม่ลบอัตโนมัติ', s.slip_photos || 0],
    ['พื้นที่โดยประมาณที่ล้างได้', fmtBytes(s.bytes_estimated || 0)],
  ];
  $('mediaSummary').innerHTML = cards.map(([t,v]) => `<div class="summary-card"><div class="muted2">${esc(t)}</div><b style="font-size:22px">${esc(v)}</b></div>`).join('');
}

function renderJobs(rows){
  const status = $('filterStatus').value || 'all';
  const filtered = rows.filter(j => status === 'all' || (status === 'eligible' ? j.eligibility?.eligible : !j.eligibility?.eligible));
  $('mediaJobs').innerHTML = filtered.length ? filtered.map(j => {
    const ok = !!j.eligibility?.eligible;
    return `<div class="item">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <b>${esc(j.booking_code || ('#' + j.job_id))} • ${esc(j.job_type || '-')}</b>
          <div class="mini">${esc(j.customer_name || '-')} • ${esc(j.customer_phone || '-')}</div>
        </div>
        <span class="pill" style="${ok ? 'background:#dcfce7;color:#166534' : 'background:#fff7ed;color:#9a3412'}">${esc(j.eligibility?.reason || '-')}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <span class="pill">วันที่ปิดงาน: ${fmtDate(j.completion_date)}</span>
        <span class="pill">หมดประกัน: ${fmtDate(j.warranty_end_date)}</span>
        <span class="pill">ล้างได้ตั้งแต่: ${fmtDate(j.purge_eligible_date)}</span>
        <span class="pill">รูปหลักฐาน: ${Number(j.photo_count || 0)} รูป</span>
        <span class="pill">รูปสลิป: ${Number(j.slip_count || 0)} รูป ไม่ถูกลบอัตโนมัติ</span>
        <span class="pill">เช็คลิส: ${Number(j.checklist_count || 0)}</span>
        <span class="pill">เครื่อง: ${Number(j.unit_count || 0)}</span>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="secondary" type="button" style="width:auto" onclick="location.href='/admin-job-view-v2.html?job_id=${encodeURIComponent(j.job_id)}'">ดูรายละเอียด</button>
        <button class="secondary" type="button" style="width:auto" onclick="dryRun(${Number(j.job_id)})">ตรวจสอบก่อนลบ</button>
        <button class="danger" type="button" style="width:auto" ${ok ? '' : 'disabled'} onclick="purgeJob(${Number(j.job_id)})">ล้างข้อมูลหนัก</button>
      </div>
    </div>`;
  }).join('') : '<div class="muted2">ไม่พบงานตามเงื่อนไข</div>';
}

async function loadAll(){
  $('mediaSummary').innerHTML = '<div class="muted2">กำลังโหลด...</div>';
  $('mediaJobs').innerHTML = '<div class="muted2">กำลังโหลดรายการ...</div>';
  const qs = new URLSearchParams();
  qs.set('job_type', $('filterType').value || 'all');
  qs.set('q', $('filterSearch').value || '');
  const [summary, jobs] = await Promise.all([
    api('/admin/media-retention/summary'),
    api('/admin/media-retention/jobs?' + qs.toString()),
  ]);
  renderSummary(summary);
  renderJobs(jobs.jobs || []);
  window.__mediaJobs = jobs.jobs || [];
}

async function dryRun(jobId){
  const r = await api('/admin/media-retention/purge', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dry_run:true, job_ids:[jobId], confirm_text:'' })
  });
  const one = (r.results || [])[0] || {};
  alert(`ตรวจสอบก่อนลบเสร็จแล้ว ยังไม่มีการลบข้อมูลจริง\nรูปหลักฐาน: ${one.photos_count || 0} รูป\nเช็คลิส: ${one.checklist_count || 0}\nรูปสลิป: ${one.slips_count || 0} รูป ไม่ถูกลบอัตโนมัติ`);
}

async function purgeJob(jobId){
  await dryRun(jobId);
  const text = prompt('พิมพ์ "ยืนยันลบ" เพื่อยืนยันการล้างข้อมูลหนัก');
  if (String(text || '').trim() !== 'ยืนยันลบ') return alert('ยกเลิกการล้างข้อมูล');
  const r = await api('/admin/media-retention/purge', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ dry_run:false, job_ids:[jobId], confirm_text:'ยืนยันลบ' })
  });
  alert(r.message || 'ล้างรูปเก่าเรียบร้อย');
  loadAll();
}

window.dryRun = dryRun;
window.purgeJob = purgeJob;
$('btnReload')?.addEventListener('click', loadAll);
$('filterStatus')?.addEventListener('change', () => renderJobs(window.__mediaJobs || []));
loadAll().catch(e => { $('mediaJobs').innerHTML = `<div class="muted2">${esc(e.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`; });
