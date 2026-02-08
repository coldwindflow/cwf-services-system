/* Admin v2 - Jobs history with filters */

let __TECH_MAP__ = new Map(); // username -> { full_name, employment_type }

function statusPillStyle(status){
  const s = String(status||'').trim();
  // premium, high-contrast (yellow => black text, blue => white text)
  if (s.includes('รอ') || s.includes('pending')) return 'background:#fbbf24;color:#000;border-color:transparent'; // yellow/black
  if (s.includes('กำลัง') || s.includes('เริ่ม') || s.includes('working')) return 'background:#2563eb;color:#fff;border-color:transparent'; // blue/white
  if (s.includes('เสร็จ') || s.includes('done')) return 'background:#16a34a;color:#fff;border-color:transparent';
  if (s.includes('ยกเลิก') || s.includes('cancel')) return 'background:#ef4444;color:#fff;border-color:transparent';
  if (s.includes('ตีกลับ') || s.includes('แก้ไข') || s.includes('return')) return 'background:#a855f7;color:#fff;border-color:transparent';
  return 'background:#0f172a;color:#fff;border-color:transparent';
}

function fmtDT(iso){
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function safe(t){
  return (t || "").toString();
}

async function loadJobs(){
  try{
    const df = (el("date_from").value||"").trim();
    const dt = (el("date_to").value||"").trim();
    const tech = (el("technician").value||"").trim();
    const q = (el("q").value||"").trim();
    const limit = Number(el("limit").value||200);
    const params = new URLSearchParams();
    if (df) params.set("date_from", df);
    if (dt) params.set("date_to", dt);
    if (tech) params.set("technician", tech);
    if (q) params.set("q", q);
    params.set("limit", String(limit));

    const r = await apiFetch(`/admin/jobs_v2?${params.toString()}`);
    const rows = Array.isArray(r.rows) ? r.rows : (Array.isArray(r.jobs) ? r.jobs : []);

    const tb = el("tbody");
    tb.innerHTML = "";
    for (const j of rows){
      const tr = document.createElement("tr");
      // PATCH: กดดูใบงานเต็มหน้า
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', ()=>{
        if (!j.job_id) return;
        window.location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(j.job_id))}`;
      });
      const code = safe(j.booking_code||j.job_id);
      const dtTxt = fmtDT(j.appointment_datetime);
      const left = `${safe(j.customer_name)}\n${safe(j.customer_phone||"")}`;
      const mid = `${safe(j.job_type)} • ${safe(j.job_status)}`;
      const addr = safe(j.job_zone||"") || safe(j.address_text||"");
      const techU = safe(j.technician_username||"-");
      const techName = (__TECH_MAP__.get(techU)?.full_name) || techU;
      tr.innerHTML = `
        <td><div class="code">${code}</div><div class="muted2">#${safe(j.job_id)}</div></td>
        <td>${dtTxt}</td>
        <td>
          <div class="job-main"><b title="${safe(j.customer_name||'')}">${safe(j.customer_name||'-')}</b><span class="muted2">${safe(j.customer_phone||'')}</span></div>
          <div class="pill" style="margin-top:6px;${statusPillStyle(j.job_status)}" title="${safe(j.job_status||'')}">${mid}</div>
          <div class="muted2" style="margin-top:6px" title="${addr}">${addr}</div>
        </td>
        <td><b class="tech-name" title="${techName}">${techName}</b><div class="muted2 mini">${techU}</div></td>
      `;
      tb.appendChild(tr);
    }

    el("wrap").style.display = "block";
    showToast(`โหลด ${rows.length} รายการ`, "success");
  }catch(e){
    console.error(e);
    showToast(e.message || "โหลดประวัติไม่สำเร็จ", "error");
  }
}

async function loadTechniciansForFilter(){
  try{
    const rows = await apiFetch('/admin/technicians');
    __TECH_MAP__.clear();
    const dl = el('techList');
    if (dl) dl.innerHTML = '';
    for (const t of (rows||[])){
      const u = String(t.username||'').trim();
      if (!u) continue;
      const full = String(t.full_name||u).trim();
      __TECH_MAP__.set(u, { full_name: full, employment_type: t.employment_type });
      if (dl){
        const opt = document.createElement('option');
        opt.value = u;
        opt.label = `${full} (${u})`;
        // For browsers showing value only, include display in value as well (still parse username from start)
        opt.textContent = `${full} (${u})`;
        dl.appendChild(opt);
      }
    }
  }catch(e){
    console.warn('loadTechniciansForFilter failed', e.message);
  }
}

function init(){
  const today = todayYMD();
  el("date_to").value = today;
  const d0 = new Date(); d0.setDate(d0.getDate()-30);
  const from = `${d0.getFullYear()}-${pad2(d0.getMonth()+1)}-${pad2(d0.getDate())}`;
  el("date_from").value = from;
  el("btnLoad").addEventListener("click", loadJobs);
  // auto load
  loadTechniciansForFilter().finally(loadJobs);
}

init();
