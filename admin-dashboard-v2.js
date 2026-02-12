/* Admin Dashboard v2 (Production) */
(function(){
  const $ = (id)=>document.getElementById(id);

  function setAvatar(url){
    const img = $('meAvatar');
    if(!img) return;
    if (url) {
      img.src = url;
      return;
    }
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">
        <rect width="100%" height="100%" rx="18" fill="#ffffff" fill-opacity="0.10"/>
        <circle cx="44" cy="34" r="16" fill="#ffffff" fill-opacity="0.55"/>
        <rect x="18" y="52" width="52" height="26" rx="13" fill="#ffffff" fill-opacity="0.55"/>
      </svg>`
    );
  }

  function setQuickActive(activeId){
    ['quickToday','quick7','quick30'].forEach(id=>{
      const b = $(id);
      if(!b) return;
      b.classList.toggle('active', id===activeId);
    });
  }

  function ymd(d){
    const dt = (d instanceof Date) ? d : new Date(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth()+1).padStart(2,'0');
    const da = String(dt.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }

  function setActiveGroup(btn){
    document.querySelectorAll('[data-group]').forEach(b=>{
      // active = yellow, inactive = ghost (matches dashboard premium UI)
      b.classList.remove('yellow');
      b.classList.add('ghost');
      if (b === btn){
        b.classList.remove('ghost');
        b.classList.add('yellow');
      }
    });
  }

  let lastData = null;
  let currentGroup = 'day';

  function safeGet(obj, path, fallback){
    try{
      const parts = String(path).split('.');
      let cur = obj;
      for (const p of parts){
        if (cur == null) return fallback;
        cur = cur[p];
      }
      return (cur == null) ? fallback : cur;
    }catch(_){
      return fallback;
    }
  }

  function drawDonut(data){
    const canvas = $('donut');
    const hint = $('donutHint');
    const totalEl = $('jobTotal');
    const stPending = $('stPending');
    const stActive = $('stActive');
    const stDone = $('stDone');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const d = data || { pending:0, active:0, done:0, other:0, total:0 };
    const pendingV = Number(d.pending||0);
    const activeV = Number(d.active||0);
    const doneV = Number(d.done||0);
    const otherV = Number(d.other||0);

    if (stPending) stPending.textContent = String(pendingV);
    if (stActive) stActive.textContent = String(activeV);
    if (stDone) stDone.textContent = String(doneV);

    const parts = [
      { key:'pending', value: pendingV, color:'#ffcc00' },
      { key:'active', value: activeV, color:'#0b4bb3' },
      { key:'done', value: doneV, color:'#16a34a' },
      { key:'other', value: otherV, color:'#94a3b8' },
    ].filter(x=>x.value>0);

    const total = parts.reduce((s,x)=>s+x.value,0);
    if (hint) hint.textContent = total ? `ทั้งหมด ${total} งาน` : '—';
    if (totalEl) totalEl.textContent = total ? String(total) : '—';

    // size
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 260;
    const cssH = 170;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    const cx = cssW/2;
    const cy = cssH/2;
    const r = Math.min(cssW, cssH) * 0.36;
    const rInner = r * 0.62;

    // background ring
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = '#0b1b3a';
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (!total){
      ctx.font = '14px sans-serif';
      ctx.globalAlpha = 0.75;
      ctx.fillText('ไม่มีข้อมูล', cx-32, cy+4);
      ctx.globalAlpha = 1;
      return;
    }

    let a = -Math.PI/2;
    for (const p of parts){
      const ang = (p.value/total) * Math.PI*2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a+ang);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.stroke();
      a += ang;
    }

    // inner cutout
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI*2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#0b1b3a';
    ctx.font = '900 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(total), cx, cy+6);
    ctx.font = '12px sans-serif';
    ctx.globalAlpha = 0.7;
    ctx.fillText('งาน', cx, cy+26);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';

    // Legend is rendered in HTML (stPending/stActive/stDone)
  }

  function drawCandles(rows){
    const canvas = $('candles');
    const hint = $('candleHint');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const items = (rows || []).slice(-18);
    if (hint) hint.textContent = items.length ? `แสดง ${items.length} วัน` : '—';

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 420;
    const cssH = 190;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    if (!items.length){
      ctx.font = '14px sans-serif';
      ctx.globalAlpha = 0.75;
      ctx.fillText('ไม่มีข้อมูล', 10, 24);
      ctx.globalAlpha = 1;
      return;
    }

    const max = Math.max(1, ...items.map(x=>Number(x.high||0)));
    const padL = 10, padR = 10, padT = 10, padB = 30;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;
    const step = w / items.length;
    const bodyW = Math.max(6, step*0.46);

    // axis
    ctx.globalAlpha = 0.10;
    ctx.fillRect(padL, padT, w, 1);
    ctx.fillRect(padL, padT+h, w, 1);
    ctx.globalAlpha = 1;

    function y(v){
      return padT + h - (h * (Number(v||0)/max));
    }

    for (let i=0;i<items.length;i++){
      const it = items[i];
      const open = Number(it.open||0);
      const close = Number(it.close||0);
      const high = Number(it.high||0);
      const low = Number(it.low||0);

      const xCenter = padL + i*step + step/2;
      const yHigh = y(high);
      const yLow = y(low);
      const yOpen = y(open);
      const yClose = y(close);

      const up = close >= open;
      const stroke = up ? '#0b4bb3' : '#0b1b3a';
      const fill = up ? 'rgba(11,75,179,0.22)' : 'rgba(15,23,42,0.18)';

      // wick
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xCenter, yHigh);
      ctx.lineTo(xCenter, yLow);
      ctx.stroke();

      // body
      const yTop = Math.min(yOpen, yClose);
      const yBot = Math.max(yOpen, yClose);
      const bh = Math.max(4, yBot - yTop);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.fillRect(xCenter - bodyW/2, yTop, bodyW, bh);
      ctx.strokeRect(xCenter - bodyW/2, yTop, bodyW, bh);

      // label sparse
      if (items.length <= 8 || i===0 || i===items.length-1 || (i%4===0)){
        ctx.font = '11px sans-serif';
        ctx.globalAlpha = 0.65;
        ctx.fillText(it.label||'', xCenter - bodyW/2, cssH - 10);
        ctx.globalAlpha = 1;
      }
    }
  }

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

    // bars (premium palette)
    for (let i=0;i<items.length;i++){
      const v = values[i];
      const bh = (canvas.clientHeight - padT - padB) * (v / max);
      const x = padL + i*bw + 6;
      const y = (canvas.clientHeight - padB) - bh;
      const ww = Math.max(6, bw - 12);

      // fill + stroke
      ctx.fillStyle = 'rgba(11,75,179,0.22)';
      ctx.strokeStyle = 'rgba(11,75,179,0.90)';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, ww, bh);
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

    // If backend is old or partially failing, show a clear hint (avoid blank dashboard)
    if (!data || typeof data !== 'object' || !('company' in data)){
      showToast('Dashboard backend ยังไม่อัปเดต (ได้แค่ me) — โปรดอัปเดต backend แล้ว refresh ใหม่', 'error');
    }
    if (data && data.debug && data.debug.partial){
      showToast('Dashboard โหลดได้บางส่วน (บาง query ล้มเหลว) — ดูรายละเอียดใน debug', 'error');
    }

    const meObj = safeGet(data,'me',{});
    $('whoBox').textContent = `${meObj.full_name || meObj.username || '-'}`;
    const roleLabel = (meObj.role==='super_admin') ? 'Super Admin' : 'Admin';
    const rb = $('roleBox');
    if (rb) rb.textContent = roleLabel;
    setAvatar(meObj.photo_url || '');
    const ver = (data && data.api_version) ? `v${data.api_version}` : '';
    $('updatedAt').textContent = `${new Date().toLocaleString('th-TH')} ${ver}`;

    const personal = safeGet(data,'personal',{ job_count:0, revenue_total:0, commission_total:0 });
    const company = safeGet(data,'company',{ job_count:0, revenue_total:0, series:{day:[],week:[],month:[],year:[]}, donut:null, candles:[] });
    const counts = safeGet(data,'counts',{ today:0, month:0, year:0 });
    const pending = safeGet(data,'pending',{ count:0, rows:[] });
    const active = safeGet(data,'active',{ rows:[] });

    $('meRevenue').textContent = `${fmtMoney(Number(personal.revenue_total||0))} ฿`;
    $('meRevenueHint').textContent = `${Number(personal.job_count||0)} งาน (created/approved โดยคุณ)`;

    $('meCommission').textContent = `${fmtMoney(Number(personal.commission_total||0))} ฿`;
    $('meCommissionHint').textContent = `rate ${Number(meObj.commission_rate_percent||0).toFixed(2)}%`;

    $('coRevenue').textContent = `${fmtMoney(Number(company.revenue_total||0))} ฿`;
    $('coRevenueHint').textContent = `${Number(company.job_count||0)} งาน ในช่วงที่เลือก`;

    $('counts').textContent = `${Number(counts.today||0)} / ${Number(counts.month||0)} / ${Number(counts.year||0)}`;

    $('pendingHint').textContent = `ทั้งหมด ${Number(pending.count||0)} งาน`;
    renderList('pendingList', pending.rows, 'pending');

    $('activeHint').textContent = `แสดง ${Number((active.rows||[]).length||0)} งาน`;
    renderList('activeList', active.rows, 'active');

    drawDonut(company.donut || null);
    drawCandles(company.candles || []);

    currentGroup = currentGroup || 'day';
    const series = safeGet(company,`series.${currentGroup}`,[]) || [];
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

  function updateFilterSummary(){
    const from = $('fromDate')?.value || '';
    const to = $('toDate')?.value || '';
    const sum = $('filterSummary');
    if (!sum) return;
    if (from && to) sum.textContent = `${from} → ${to}`;
    else if (from) sum.textContent = `${from} → ...`;
    else sum.textContent = '—';
  }

  function setFiltersCollapsed(collapsed){
    const card = $('filtersCard');
    if (!card) return;
    card.classList.toggle('open', !collapsed);
    try{ localStorage.setItem('dash_filters_collapsed', collapsed ? '1' : '0'); }catch(_){ /* ignore */ }
  }

  function init(){
    // default 30 days
    setRange(30);
    setQuickActive('quick30');

    updateFilterSummary();

    // default: collapse filters to reduce clutter (user can expand)
    try{
      const v = localStorage.getItem('dash_filters_collapsed');
      setFiltersCollapsed(v === null ? true : (v === '1'));
    }catch(_){
      setFiltersCollapsed(true);
    }

    const toggle = $('filterToggle');
    if (toggle){
      toggle.addEventListener('click', (ev)=>{
        // allow clicking mini apply without toggling
        if (ev && ev.target && (ev.target.id === 'btnApplyMini')) return;
        const card = $('filtersCard');
        const isOpen = card ? card.classList.contains('open') : false;
        setFiltersCollapsed(isOpen); // if open -> collapse
      });
    }

    // shortcut cards
    const goDash = $('goDashboard');
    if (goDash) goDash.addEventListener('click', ()=>{ location.href = '/admin-dashboard-v2.html'; });
    const goProfile = $('goProfile');
    if (goProfile) goProfile.addEventListener('click', ()=>{ location.href = '/admin-profile-v2.html'; });

    $('quickToday').addEventListener('click', ()=>{ setRange(1); updateFilterSummary(); setQuickActive('quickToday'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick7').addEventListener('click', ()=>{ setRange(7); updateFilterSummary(); setQuickActive('quick7'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    $('quick30').addEventListener('click', ()=>{ setRange(30); updateFilterSummary(); setQuickActive('quick30'); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); });
    const apply = ()=>{ updateFilterSummary(); load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error')); };
    const btnApply = $('btnApply');
    if (btnApply) btnApply.addEventListener('click', apply);
    const btnApplyMini = $('btnApplyMini');
    if (btnApplyMini) btnApplyMini.addEventListener('click', (e)=>{ e.stopPropagation(); apply(); });

    const fromIn = $('fromDate');
    const toIn = $('toDate');
    if (fromIn) fromIn.addEventListener('change', updateFilterSummary);
    if (toIn) toIn.addEventListener('change', updateFilterSummary);

    document.querySelectorAll('[data-group]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        currentGroup = btn.getAttribute('data-group');
        // button styles (yellow active)
        document.querySelectorAll('[data-group]').forEach(b=>{ b.classList.remove('yellow'); b.classList.add('ghost'); });
        btn.classList.remove('ghost'); btn.classList.add('yellow');
        if (lastData){
          const series = safeGet(lastData, `company.series.${currentGroup}`, []) || [];
          $('seriesHint').textContent = `รวม ${series.length} จุดข้อมูล`;
          drawChart(series);
        }
      });
    });

    // highlight default group
    const first = document.querySelector('[data-group="day"]');
    if (first){ first.classList.remove('ghost'); first.classList.add('yellow'); }

    // Load profile (photo/name) quickly; dashboard endpoint will update again
    (async()=>{
      try{
        const p = await apiFetch('/admin/profile_v2/me');
        if (p && p.me){
          $('whoBox').textContent = `${p.me.full_name || p.me.username || '-'}`;
          const rb = $('roleBox');
          if (rb) rb.textContent = (p.me.role==='super_admin') ? 'Super Admin' : 'Admin';
          setAvatar(p.me.photo_url || '');
        }
      }catch(_){ /* ignore */ }
    })();

    load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
  }

  init();
})();