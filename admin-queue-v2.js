/* Admin v2 - Calendar schedule (daily)
   Renders simple timeline per technician.
*/

function minFromHHMM(hhmm){
  const [h,m] = String(hhmm||'0:0').split(':').map(Number);
  return (h*60)+(m||0);
}

function hhmmFromDate(iso){
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function statusClass(job){
  const s = (job.job_status||'').toString();
  if (s.includes('รอช่างยืนยัน') || s.includes('urgent')) return 'status-urgent';
  if (s.includes('เสร็จ') || s.includes('done')) return 'status-done';
  return '';
}

async function loadCalendar(){
  const date = el('date').value;
  const tech_type = el('tech_type').value;
  if (!date) return showToast('กรุณาเลือกวันที่', 'error');

  try{
    el('btnLoad').disabled = true;
    el('btnReload').disabled = true;
    const data = await apiFetch(`/admin/schedule_v2?date=${encodeURIComponent(date)}&tech_type=${encodeURIComponent(tech_type)}`);
    renderCalendar(data);
    showToast('โหลดปฏิทินแล้ว', 'success');
  }catch(e){
    console.error(e);
    showToast(e.message || 'โหลดปฏิทินไม่สำเร็จ', 'error');
  }finally{
    el('btnLoad').disabled = false;
    el('btnReload').disabled = false;
  }
}

function renderCalendar(data){
  el('calendar').style.display = 'block';
  el('calTitle').textContent = `คิวช่าง: ${data.tech_type === 'partner' ? 'พาร์ทเนอร์' : 'บริษัท'} — ${data.date}`;
  el('calSub').textContent = `ช่าง ${data.technicians.length} คน • Travel Buffer ${data.travel_buffer_min} นาที`;

  // Calculate time range based on tech work_start/end (use first tech, fallback)
  const ws = (data.technicians[0]?.work_start || '09:00');
  const we = (data.technicians[0]?.work_end || '18:00');
  const startMin = minFromHHMM(ws);
  const endMin = minFromHHMM(we);
  const step = 30;
  const rows = Math.max(1, Math.ceil((endMin - startMin) / step));
  const rowH = 36;

  const body = el('calBody');
  body.innerHTML = '';

  // Time column
  const timeCol = document.createElement('div');
  timeCol.className = 'time-col';
  for (let i=0;i<=rows;i++){
    const t = startMin + i*step;
    const cell = document.createElement('div');
    cell.className = 'time-cell';
    if (i%2===0) cell.textContent = `${pad2(Math.floor(t/60))}:${pad2(t%60)}`;
    timeCol.appendChild(cell);
  }
  body.appendChild(timeCol);

  // Technician columns
  for (const tech of data.technicians){
    const col = document.createElement('div');
    col.className = 'tech-col';

    const title = document.createElement('div');
    title.className = 'tech-title';
    title.innerHTML = `<b>${tech.full_name || tech.username}</b><div class="muted">${tech.username} • ${tech.work_start}-${tech.work_end}</div>`;
    col.appendChild(title);

    const lane = document.createElement('div');
    lane.className = 'tech-lane';
    lane.style.height = `${(rows+1)*rowH}px`;
    for (let i=0;i<=rows;i++){
      const c = document.createElement('div');
      c.className = 'lane-cell';
      lane.appendChild(c);
    }

    const jobs = (data.jobs_by_tech?.[tech.username] || []);
    for (const j of jobs){
      const start = new Date(j.start_iso);
      const end = new Date(j.end_iso);
      const startT = start.getHours()*60 + start.getMinutes();
      const endT = end.getHours()*60 + end.getMinutes();
      const top = Math.max(0, (startT - startMin) / step) * rowH;
      const height = Math.max(rowH, ((endT - startT) / step) * rowH);

      const b = document.createElement('div');
      b.className = `job-block ${statusClass(j)}`;
      b.style.top = `${top + 4}px`;
      b.style.height = `${height - 8}px`;
      b.title = `${j.booking_code || ''}\n${j.customer_name || ''}\n${j.job_type || ''}\n${hhmmFromDate(j.start_iso)}-${hhmmFromDate(j.end_iso)}\n${j.job_zone || ''} ${j.address_text || ''}`;
      b.innerHTML = `
        <b>${j.booking_code || 'งาน'} • ${j.job_type || ''}</b>
        <div class="mini">${hhmmFromDate(j.start_iso)}-${hhmmFromDate(j.end_iso)} • ${j.customer_name || '-'}</div>
        <div class="mini">${(j.job_zone || '').trim() || '—'} • ${(j.job_status || '').trim() || ''}</div>
      `;
      // PATCH: กดดูใบงานเต็มหน้า
      b.style.cursor = 'pointer';
      b.addEventListener('click', ()=>{
        if (!j.job_id) return;
        window.location.href = `/admin-review-v2.html?open=${encodeURIComponent(String(j.job_id))}`;
      });
      lane.appendChild(b);
    }

    col.appendChild(lane);
    body.appendChild(col);
  }
}

function init(){
  el('date').value = todayYMD();
  el('btnLoad').addEventListener('click', loadCalendar);
  el('btnReload').addEventListener('click', loadCalendar);
}

init();
