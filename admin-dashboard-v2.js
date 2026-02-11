/* Admin Dashboard v2 (Production) */
(function(){
  const $ = (id)=>document.getElementById(id);

  function ymd(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }

  function setActiveGroup(btn){
    document.querySelectorAll('[data-group]').forEach(b=>{
      b.classList.remove('blue'); b.classList.add('gray');
      if (b === btn){ b.classList.remove('gray'); b.classList.add('yellow'); }
    });
  }

  let lastData = null;
  let currentGroup = 'day';

  function renderList(container, rows, kind){
    const el = $(container);
    el.innerHTML = '';
    if (!rows || !rows.length){
      const d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = `<div><b>ไม่มีรายการ</b><div class="muted">—</div></div><div class="pill gray">ว่าง</div>`;
      el.appendChild(d);
      return;
    }
    for (const r of rows){
      const dt = r.appointment_datetime ? new Date(r.appointment_datetime) : null;
      const when = dt ? dt.toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) : '-';
      const code = r.booking_code || `#${r.job_id}`;
      const st = String(r.job_status||'').trim();
      const pillClass = (st==='รอตรวจสอบ'||st==='pending_review') ? 'yellow' : (st==='กำลังทำ' ? 'blue' : 'gray');
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div style="min-width:0">
          <b>${code} • ${r.customer_name || '-'}</b>
          <div class="muted">${when} • ${r.job_type || '-'} • ${fmtMoney(r.job_price||0)} ฿</div>
        </div>
        <div class="pill ${pillClass}">${st || '-'}</div>
      `;
      item.addEventListener('click', ()=>{
        // open job view page (existing) – allow admin to paste code
        location.href = `/admin-job-view-v2.html?job=${encodeURIComponent(code)}`;
      });
      el.appendChild(item);
    }
  }

  function drawChart(series){
    const canvas = $('chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const items = (series || []).slice(-18); // keep readable
    if (!items.length){
      ctx.font = '14px sans-serif';
      ctx.fillText('ไม่มีข้อมูลในช่วงที่เลือก', 10, 24);
      return;
    }

    const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1);
    const h = canvas.height = 160 * (window.devicePixelRatio || 1);
    ctx.scale((window.devicePixelRatio||1),(window.devicePixelRatio||1));

    const values = items.map(x=>Number(x.total||0));
    const max = Math.max(1, ...values);
    const padL = 8, padR = 8, padT = 12, padB = 28;
    const bw = (canvas.clientWidth - padL - padR) / items.length;

    // axis
    ctx.globalAlpha = 0.12;
    ctx.fillRect(padL, padT, canvas.clientWidth-padL-padR, 1);
    ctx.fillRect(padL, canvas.clientHeight-padB, canvas.clientWidth-padL-padR, 1);
    ctx.globalAlpha = 1;

    // bars (no fixed colors; use stroke only)
    for (let i=0;i<items.length;i++){
      const v = values[i];
      const bh = (canvas.clientHeight - padT - padB) * (v / max);
      const x = padL + i*bw + 6;
      const y = (canvas.clientHeight - padB) - bh;
      const ww = Math.max(6, bw - 12);

      ctx.globalAlpha = 0.18;
      ctx.fillRect(x, y, ww, bh);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, ww, bh);

      // labels (sparse)
      if (items.length <= 8 || i === 0 || i === items.length-1 || (i%4===0)){
        ctx.font = '11px sans-serif';
        ctx.globalAlpha = 0.65;
        ctx.fillText(items[i].label || '', x, canvas.clientHeight - 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  async function load(){
    const from = $('fromDate').value;
    const to = $('toDate').value;
    $('pendingHint').textContent = 'กำลังโหลด...';
    $('activeHint').textContent = 'กำลังโหลด...';
    $('seriesHint').textContent = 'กำลังโหลด...';

    const data = await apiFetch(`/admin/dashboard_v2?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    lastData = data;

    $('whoBox').textContent = `${data.me.full_name || data.me.username} • ${data.me.role==='super_admin' ? 'Super Admin' : 'Admin'}`;
    $('updatedAt').textContent = new Date().toLocaleString('th-TH');

    $('meRevenue').textContent = `${fmtMoney(data.personal.revenue_total)} ฿`;
    $('meRevenueHint').textContent = `${data.personal.job_count} งาน (created/approved โดยคุณ)`;

    $('meCommission').textContent = `${fmtMoney(data.personal.commission_total)} ฿`;
    $('meCommissionHint').textContent = `rate ${Number(data.me.commission_rate_percent||0).toFixed(2)}%`;

    $('coRevenue').textContent = `${fmtMoney(data.company.revenue_total)} ฿`;
    $('coRevenueHint').textContent = `${data.company.job_count} งาน ในช่วงที่เลือก`;

    $('counts').textContent = `${data.counts.today} / ${data.counts.month} / ${data.counts.year}`;

    $('pendingHint').textContent = `ทั้งหมด ${data.pending.count} งาน`;
    renderList('pendingList', data.pending.rows, 'pending');

    $('activeHint').textContent = `แสดง ${data.active.rows.length} งาน`;
    renderList('activeList', data.active.rows, 'active');

    currentGroup = currentGroup || 'day';
    const series = data.company.series[currentGroup] || [];
    $('seriesHint').textContent = `รวม ${series.length} จุดข้อมูล`;
    drawChart(series);
  }

  function setRange(days){
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days-1));
    $('fromDate').value = ymd(from);
    $('toDate').value = ymd(to);
  }

  function init(){
    // default 30 days
    setRange(30);

    $('quickToday').addEventListener('click', ()=>{ setRange(1); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick7').addEventListener('click', ()=>{ setRange(7); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick30').addEventListener('click', ()=>{ setRange(30); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('btnApply').addEventListener('click', ()=>{ load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });

    document.querySelectorAll('[data-group]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        currentGroup = btn.getAttribute('data-group');
        // button styles
        document.querySelectorAll('[data-group]').forEach(b=>{ b.classList.remove('yellow'); b.classList.add('gray'); });
        btn.classList.remove('gray'); btn.classList.add('yellow');
        if (lastData){
          const series = lastData.company.series[currentGroup] || [];
          $('seriesHint').textContent = `รวม ${series.length} จุดข้อมูล`;
          drawChart(series);
        }
      });
    });

    // highlight default group
    const first = document.querySelector('[data-group="day"]');
    if (first){ first.classList.remove('gray'); first.classList.add('yellow'); }

    load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
  }

  init();
})();