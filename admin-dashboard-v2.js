/* Admin Dashboard v2 – Premium Mobile Layout + Donut (Production) */
(function(){
  const $ = (id)=>document.getElementById(id);

  function ymd(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }

  function setPresetActive(activeId){
    ['quickToday','quick7','quick30'].forEach(id=>{
      const b = $(id);
      if(!b) return;
      b.classList.toggle('primary', id===activeId);
    });
  }

  function setAvatar(url){
    const img = $('meAvatar');
    if(!img) return;
    img.src = url || '/logo.png';
  }

  function pillClassFromStatus(st){
    const s = String(st||'').trim().toLowerCase();
    if (!s) return 'gray';
    if (s.includes('รอตรวจสอบ') || s.includes('pending')) return 'yellow';
    if (s.includes('กำลังทำ') || s.includes('active')) return 'blue';
    if (s.includes('เสร็จ')) return 'green';
    if (s.includes('ยกเลิก') || s.includes('cancel')) return 'red';
    if (s.includes('ตีกลับ') || s.includes('reject')) return 'yellow';
    return 'gray';
  }

  function renderList(containerId, rows){
    const host = $(containerId);
    if(!host) return;
    host.innerHTML = '';

    if (!rows || !rows.length){
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `<div><b>ไม่มีงานในตอนนี้</b><div class="muted2">—</div></div><div class="pill gray">ว่าง</div>`;
      host.appendChild(d);
      return;
    }

    rows.slice(0, 10).forEach(r=>{
      const dt = r.appointment_datetime ? new Date(r.appointment_datetime) : null;
      const when = dt ? dt.toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) : '-';
      const code = r.booking_code || `#${r.job_id}`;
      const st = String(r.job_status||'').trim();
      const cls = pillClassFromStatus(st);

      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div style="min-width:0">
          <b>${code} • ${r.customer_name || '-'}</b>
          <div class="muted2">${when} • ${r.job_type || '-'} • ${fmtMoney(r.job_price||0)} ฿</div>
        </div>
        <div class="pill ${cls}">${st || '-'}</div>
      `;
      item.addEventListener('click', ()=>{
        location.href = `/admin-job-view-v2.html?job=${encodeURIComponent(code)}`;
      });
      host.appendChild(item);
    });
  }

  // -------------------------
  // Donut (SVG, no library)
  // -------------------------
  function donutColorForKey(key){
    // Use CSS colors consistent with app rules
    const k = String(key||'').toLowerCase();
    if (k.includes('รอตรวจสอบ') || k.includes('pending')) return '#ffcc00';
    if (k.includes('กำลังทำ') || k.includes('active')) return '#0b4bb3';
    if (k.includes('เสร็จ')) return '#16a34a';
    if (k.includes('ยกเลิก') || k.includes('cancel')) return '#ef4444';
    if (k.includes('ตีกลับ') || k.includes('reject')) return '#f59e0b';
    return '#94a3b8';
  }

  function renderDonut(breakdown){
    const svg = $('donutSvg');
    const legend = $('donutLegend');
    const totalEl = $('donutTotal');
    const hint = $('donutHint');
    if(!svg || !legend || !totalEl) return;

    // cleanup old segments
    [...svg.querySelectorAll('circle[data-seg="1"]')].forEach(n=>n.remove());
    legend.innerHTML = '';

    const rows = Array.isArray(breakdown) ? breakdown.filter(x=>Number(x.count||0) > 0) : [];
    const total = rows.reduce((a,x)=>a+Number(x.count||0),0);

    totalEl.textContent = (total ? String(total) : '—');
    if (hint) hint.textContent = total ? `รวม ${total} งาน • ช่วงที่เลือก` : 'ไม่มีข้อมูลในช่วงที่เลือก';

    if (!total){
      return;
    }

    const r = 44;
    const C = 2 * Math.PI * r;
    let offset = 0;

    rows.forEach(row=>{
      const count = Number(row.count||0);
      const label = String(row.label||row.status||'อื่นๆ');
      const frac = count / total;
      const len = Math.max(0, C * frac);
      const color = donutColorForKey(label);

      const seg = document.createElementNS('http://www.w3.org/2000/svg','circle');
      seg.setAttribute('cx','60');
      seg.setAttribute('cy','60');
      seg.setAttribute('r', String(r));
      seg.setAttribute('fill','none');
      seg.setAttribute('stroke', color);
      seg.setAttribute('stroke-width','14');
      seg.setAttribute('stroke-linecap','round');
      seg.setAttribute('stroke-dasharray', `${len} ${C-len}`);
      // rotate to start at top (-90deg) and apply offset
      const dashOffset = C * (1 - (offset / C));
      seg.setAttribute('stroke-dashoffset', String(dashOffset));
      seg.setAttribute('transform','rotate(-90 60 60)');
      seg.setAttribute('data-seg','1');
      svg.appendChild(seg);
      offset += len;

      const leg = document.createElement('div');
      leg.className = 'legRow';
      leg.innerHTML = `
        <div class="legLeft"><span class="dot" style="background:${color}"></span>${label}</div>
        <div class="legVal">${count}</div>
      `;
      legend.appendChild(leg);
    });
  }

  function normalizeBreakdownFromLists(pendingRows, activeRows){
    const map = new Map();
    const push = (st)=>{
      const key = String(st||'อื่นๆ').trim() || 'อื่นๆ';
      map.set(key, (map.get(key)||0) + 1);
    };
    (pendingRows||[]).forEach(r=>push(r.job_status));
    (activeRows||[]).forEach(r=>push(r.job_status));
    return [...map.entries()].map(([label,count])=>({ label, count }));
  }

  // -------------------------
  // Load
  // -------------------------
  let lastData = null;

  async function load(){
    const from = $('fromDate').value;
    const to = $('toDate').value;

    $('pendingCount').textContent = 'กำลังโหลด...';
    $('activeCount').textContent = 'กำลังโหลด...';
    $('donutHint').textContent = 'กำลังโหลด...';

    const data = await apiFetch(`/admin/dashboard_v2?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    lastData = data;

    // header
    $('whoBox').textContent = (data.me && (data.me.full_name || data.me.username)) ? (data.me.full_name || data.me.username) : '—';
    setAvatar((data.me && data.me.photo_url) ? data.me.photo_url : '');
    const updated = new Date().toLocaleString('th-TH');
    $('updatedAt').textContent = `อัปเดต ${updated}`;

    // KPIs
    $('meRevenue').textContent = `${fmtMoney(data.personal && data.personal.revenue_total)} ฿`;
    $('meCommission').textContent = `${fmtMoney(data.personal && data.personal.commission_total)} ฿`;
    $('coRevenue').textContent = `${fmtMoney(data.company && data.company.revenue_total)} ฿`;
    $('counts').innerHTML = `${(data.counts?data.counts.today:0)} / ${(data.counts?data.counts.month:0)} / ${(data.counts?data.counts.year:0)} <small>Asia/Bangkok</small>`;

    // lists
    const pendingRows = (data.pending && data.pending.rows) ? data.pending.rows : [];
    const activeRows = (data.active && data.active.rows) ? data.active.rows : [];
    $('pendingCount').textContent = `${pendingRows.length} งาน`;
    $('activeCount').textContent = `${activeRows.length} งาน`;
    renderList('pendingList', pendingRows);
    renderList('activeList', activeRows);

    // donut
    const bd = (data.status_breakdown && Array.isArray(data.status_breakdown))
      ? data.status_breakdown
      : normalizeBreakdownFromLists(pendingRows, activeRows);
    renderDonut(bd);
  }

  function setRange(days){
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days-1));
    $('fromDate').value = ymd(from);
    $('toDate').value = ymd(to);
  }

  function init(){
    // default 30
    setRange(30);
    setPresetActive('quick30');

    $('quickToday').addEventListener('click', ()=>{ setRange(1); setPresetActive('quickToday'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick7').addEventListener('click', ()=>{ setRange(7); setPresetActive('quick7'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick30').addEventListener('click', ()=>{ setRange(30); setPresetActive('quick30'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('btnApply').addEventListener('click', ()=>{ load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });

    // quick profile
    (async()=>{
      try{
        const p = await apiFetch('/admin/profile_v2/me');
        if (p && p.me){
          $('whoBox').textContent = p.me.full_name || p.me.username || '—';
          setAvatar(p.me.photo_url || '');
        }
      }catch(_){ }
    })();

    load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
  }

  init();
})();
