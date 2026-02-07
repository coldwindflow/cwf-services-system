/* Admin v2 - Jobs history with filters */

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
      const code = safe(j.booking_code||j.job_id);
      const dtTxt = fmtDT(j.appointment_datetime);
      const left = `${safe(j.customer_name)}\n${safe(j.customer_phone||"")}`;
      const mid = `${safe(j.job_type)} • ${safe(j.job_status)}`;
      const addr = safe(j.job_zone||"") || safe(j.address_text||"");
      tr.innerHTML = `
        <td><div class="code">${code}</div><div class="muted2">#${safe(j.job_id)}</div></td>
        <td>${dtTxt}</td>
        <td>
          <div><b>${left.replace(/\n/g,'</b><div class="muted2">')}${left.includes('\n')?'</div>':''}</div>
          <div class="pill" style="margin-top:6px">${mid}</div>
          <div class="muted2" style="margin-top:6px">${addr}</div>
        </td>
        <td><b>${safe(j.technician_username||"-")}</b></td>
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

function init(){
  const today = todayYMD();
  el("date_to").value = today;
  const d0 = new Date(); d0.setDate(d0.getDate()-30);
  const from = `${d0.getFullYear()}-${pad2(d0.getMonth()+1)}-${pad2(d0.getDate())}`;
  el("date_from").value = from;
  el("btnLoad").addEventListener("click", loadJobs);
  // auto load
  loadJobs();
}

init();
