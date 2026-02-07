function getJobId(){
  const u = new URL(location.href);
  const q = u.searchParams.get("job_id") || "";
  return Number(q || 0);
}

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

function buildSummary(job){
  const dt = job.appointment_datetime ? new Date(job.appointment_datetime) : null;
  const dateTxt = dt ? dt.toLocaleDateString('th-TH') : '-';
  const timeTxt = dt ? dt.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}) : '-';
  const code = job.booking_code || job.booking_token || job.job_id;
  const lines = [];
  lines.push("ยืนยันนัดหมายบริการแอร์");
  lines.push("");
  lines.push("Coldwindflow Air Services");
  lines.push("แอดมินฝ่ายบริการลูกค้า ขอเรียนยืนยันนัดหมายดังนี้ค่ะ");
  lines.push("");
  lines.push(`🔎 เลขงาน: ${code}`);
  if (job.booking_code) {
    lines.push(`🔗 ติดตามงาน: http://app.cwf-air.com/track.html?q=${encodeURIComponent(job.booking_code)}`);
  }
  lines.push(`📍 ชื่อลูกค้า: ${job.customer_name || '-'}`);
  if (job.customer_phone) lines.push(`📞 เบอร์: ${job.customer_phone}`);
  lines.push(`📅 วันที่นัด: ${dateTxt} เวลา ${timeTxt}`);
  lines.push(`🧾 ประเภทงาน: ${job.job_type || '-'}`);
  lines.push(`🏠 ที่อยู่: ${job.address_text || '-'}`);
  if (job.maps_url) lines.push(`🗺️ แผนที่: ${job.maps_url}`);
  if (job.technician_username) lines.push(`👷 ช่าง: ${job.technician_username}`);
  return lines.join("\n");
}

function render(job, items, promotion){
  const card = document.getElementById('jobCard');
  const dt = job.appointment_datetime ? new Date(job.appointment_datetime) : null;
  const dateTxt = dt ? dt.toLocaleString('th-TH') : '-';

  const itemRows = (items||[]).map(it=>`
    <tr>
      <td>${it.item_name}</td>
      <td style="text-align:right">${Number(it.qty||1)}</td>
      <td style="text-align:right">${fmtMoney(it.unit_price||0)}</td>
      <td style="text-align:right"><b>${fmtMoney(it.line_total||0)}</b></td>
    </tr>`).join('') || `<tr><td colspan="4" class="muted2">ไม่มีรายการ</td></tr>`;

  const promoHtml = promotion ? `<div class="muted2 mini">โปรโมชัน: <b>${promotion.promo_name}</b> (${promotion.promo_type} ${promotion.promo_value})</div>` : '';

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div class="muted2 mini">JOB ID</div>
        <div style="font-size:20px;font-weight:900;">#${job.job_id}</div>
        <div class="muted2">${job.job_status || '-'}</div>
      </div>
      <div style="text-align:right">
        <div class="muted2 mini">วันนัด</div>
        <div style="font-weight:800">${dateTxt}</div>
        <div class="muted2 mini">ช่าง</div>
        <div><b>${job.technician_username || '-'}</b></div>
      </div>
    </div>

    <div style="margin-top:12px" class="grid2">
      <div><div class="muted2 mini">ลูกค้า</div><b>${job.customer_name || '-'}</b><div class="muted2">${job.customer_phone || ''}</div></div>
      <div><div class="muted2 mini">โซน</div><b>${job.job_zone || '-'}</b></div>
    </div>

    <div style="margin-top:12px">
      <div class="muted2 mini">ที่อยู่</div>
      <div>${job.address_text || '-'}</div>
      ${job.maps_url ? `<div style="margin-top:6px"><a href="${job.maps_url}" target="_blank" rel="noopener">เปิดแผนที่</a></div>` : ''}
    </div>

    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <b>รายการในใบงาน</b>
        <div><b>รวม: ${fmtMoney(job.job_price||0)} บาท</b></div>
      </div>
      ${promoHtml}
      <div style="overflow:auto;margin-top:8px">
        <table class="table">
          <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา</th><th style="text-align:right">รวม</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>
  `;

  // summary
  const s = document.getElementById('summary_text');
  const sc = document.getElementById('summary_card');
  if (s && sc) {
    s.value = buildSummary(job);
    sc.style.display = 'block';
  }
}

async function init(){
  const id = getJobId();
  if(!id){
    document.getElementById('jobCard').textContent = "ไม่พบ job_id";
    return;
  }
  document.getElementById('btnLogout')?.addEventListener('click', logoutNow);
  document.getElementById('btnCopySummary')?.addEventListener('click', async ()=>{
    const txt = document.getElementById('summary_text')?.value || '';
    if(!txt) return;
    try{ await navigator.clipboard.writeText(txt); showToast("คัดลอกแล้ว", "success"); }
    catch{ document.getElementById('summary_text')?.select(); document.execCommand("copy"); showToast("คัดลอกแล้ว", "success"); }
  });

  try{
    const data = await apiFetch(`/admin/job_v2/${id}`);
    render(data.job, data.items, data.promotion);
  }catch(e){
    document.getElementById('jobCard').textContent = "โหลดใบงานไม่สำเร็จ: " + e.message;
  }
}
document.addEventListener('DOMContentLoaded', init);
