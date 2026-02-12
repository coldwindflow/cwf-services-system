/* Admin Dashboard v2 (Production) */
(function(){
  const $ = (id)=>document.getElementById(id);

  function setAvatar(url){
    const img = $('meAvatar');
    if(!img) return;
    if (url) { img.src = url; return; }
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">
        <rect width="100%" height="100%" rx="18" fill="#ffffff" fill-opacity="0.12"/>
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

  function fmtMoney(v){
    const n = Number(v||0);
    return n.toLocaleString('th-TH');
  }

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

  function showToast(msg, kind){
    try{
      if (window.showToast) return window.showToast(msg, kind);
    }catch(_){/* ignore */}
    console[(kind==='error')?'error':'log']('[dashboard]', msg);
  }

  async function apiFetch(url){
    const res = await fetch(url, { headers: { 'Content-Type':'application/json' }});
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status} ${t}`);
    }
    return await res.json();
  }

  function renderList(elId, rows){
    const el = $(elId);
    if (!el) return;
    el.innerHTML = '';
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length){
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.style.padding = '6px 2px';
      empty.textContent = '— ไม่มีรายการ —';
      el.appendChild(empty);
      return;
    }

    for (const r of list.slice(0,10)){
      const dt = r.booking_time ? new Date(r.booking_time) : null;
      const when = dt ? dt.toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}) : '-';
      const code = r.booking_code || `#${r.job_id}`;
      const st = String(r.job_status||'').trim();
      const pillClass = (st==='รอตรวจสอบ'||st==='pending_review') ? 'yellow' : (st==='กำลังทำ' ? 'blue' : 'gray');
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div style="min-width:0">
          <b>${code} • ${r.customer_name || '-'}</b>
          <div class="s">${when} • ${r.job_type || '-'} • ${fmtMoney(r.job_price||0)} ฿</div>
        </div>
        <div class="pill ${pillClass}">${st || '-'}</div>
      `;
      item.addEventListener('click', ()=>{
        location.href = `/admin-job-view-v2.html?job=${encodeURIComponent(code)}`;
      });
      el.appendChild(item);
    }
  }

  function drawDonut(donut){
    const canvas = $('donut');
    const hint = $('donutHint');
    const totalEl = $('jobTotal');
    const stPending = $('stPending');
    const stActive = $('stActive');
    const stDone = $('stDone');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const d = donut || { pending:0, active:0, done:0, other:0, total:0 };
    const pendingV = Number(d.pending||0);
    const activeV = Number(d.active||0);
    const doneV = Number(d.done||0);
    const otherV = Number(d.other||0);

    if (stPending) stPending.textContent = String(pendingV);
    if (stActive) stActive.textContent = String(activeV);
    if (stDone) stDone.textContent = String(doneV);

    const parts = [
      { value: pendingV, color:'#ffcc00' },
      { value: activeV, color:'#0b4bb3' },
      { value: doneV, color:'#16a34a' },
      { value: otherV, color:'#94a3b8' },
    ].filter(x=>x.value>0);

    const total = parts.reduce((s,x)=>s+x.value,0);
    if (hint) hint.textContent = total ? `ทั้งหมด ${total} งาน` : '—';
    if (totalEl) totalEl.textContent = total ? String(total) : '—';

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
      ctx.fillStyle = '#0b1b3a';
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
      ctx.fillStyle = '#0b1b3a';
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

    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#0b1b3a';
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
      const stroke = up ? '#0b4bb3' : '#dc2626';
      const fill = up ? 'rgba(11,75,179,0.24)' : 'rgba(220,38,38,0.18)';

      // wick
      ctx.beginPath();
      ctx.moveTo(xCenter, yHigh);
      ctx.lineTo(xCenter, yLow);
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // body
      const top = Math.min(yOpen, yClose);
      const bot = Math.max(yOpen, yClose);
      const x = xCenter - bodyW/2;
      const bh = Math.max(3, bot - top);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.fillRect(x, top, bodyW, bh);
      ctx.strokeRect(x, top, bodyW, bh);

      // label sparse
      if (items.length <= 8 || i === 0 || i === items.length-1 || (i%4===0)){
        ctx.font = '11px sans-serif';
        ctx.fillStyle = 'rgba(15,23,42,0.62)';
        ctx.fillText(it.label || '', x, cssH - 10);
      }
    }
  }

  function setActiveGroup(btn){
    document.querySelectorAll('[data-group]').forEach(b=>{
      b.classList.remove('yellow');
      b.classList.add('ghost');
      if (b === btn){
        b.classList.remove('ghost');
        b.classList.add('yellow');
      }
    });
  }

  function drawChart(series){
    const canvas = $('chart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    const items = (series || []).slice(-18);

    // setup retina
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 420;
    const cssH = 160;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    if (!items.length){
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(15,23,42,0.70)';
      ctx.fillText('ไม่มีข้อมูลในช่วงที่เลือก', 10, 24);
      return;
    }

    const values = items.map(x=>Number(x.total||0));
    const max = Math.max(1, ...values);
    const padL = 8, padR = 8, padT = 12, padB = 28;
    const bw = (cssW - padL - padR) / items.length;

    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#0b1b3a';
    ctx.fillRect(padL, padT, cssW-padL-padR, 1);
    ctx.fillRect(padL, cssH-padB, cssW-padL-padR, 1);
    ctx.globalAlpha = 1;

    for (let i=0;i<items.length;i++){
      const v = values[i];
      const bh = (cssH - padT - padB) * (v / max);
      const x = padL + i*bw + 6;
      const y = (cssH - padB) - bh;
      const ww = Math.max(6, bw - 12);

      ctx.fillStyle = 'rgba(11,75,179,0.22)';
      ctx.strokeStyle = 'rgba(11,75,179,0.90)';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, ww, bh);
      ctx.strokeRect(x, y, ww, bh);

      if (items.length <= 8 || i === 0 || i === items.length-1 || (i%4===0)){
        ctx.font = '11px sans-serif';
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#0b1b3a';
        ctx.fillText(items[i].label || '', x, cssH - 10);
        ctx.globalAlpha = 1;
      }
    }
  }

  let lastData = null;
  let currentGroup = 'day';
  let techScope = 'all';

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
    try{ localStorage.setItem('dash_filters_collapsed', collapsed ? '1' : '0'); }catch(_){/* ignore */}
  }

  function renderTechStats(data){
    const hint = $('techHint');
    const openEl = $('techOpen');
    const closedEl = $('techClosed');
    const totalEl = $('techTotal');
    const rateEl = $('techOpenRate');

    const stats = safeGet(data,'tech_stats', null);
    const bucket = stats ? (stats[techScope] || stats.all || null) : null;

    if (!bucket){
      if (openEl) openEl.textContent = '—';
      if (closedEl) closedEl.textContent = '—';
      if (totalEl) totalEl.textContent = '—';
      if (rateEl) rateEl.textContent = '—';
      if (hint) hint.textContent = '—';
      return;
    }

    const open = Number(bucket.open||0);
    const closed = Number(bucket.closed||0);
    const total = Number(bucket.total|| (open+closed) || 0);
    const rate = total ? Math.round((open/total)*100) : 0;

    if (openEl) openEl.textContent = String(open);
    if (closedEl) closedEl.textContent = String(closed);
    if (totalEl) totalEl.textContent = String(total);
    if (rateEl) rateEl.textContent = total ? `${rate}%` : '—';
    if (hint) hint.textContent = techScope==='all' ? 'รวมทั้งหมด' : (techScope==='company' ? 'เฉพาะช่างบริษัท' : 'เฉพาะพาร์ทเนอร์');
  }

  async function load(){
    const from = $('fromDate').value;
    const to = $('toDate').value;

    $('pendingHint').textContent = 'กำลังโหลด...';
    $('activeHint').textContent = 'กำลังโหลด...';
    $('seriesHint').textContent = 'กำลังโหลด...';

    const data = await apiFetch(`/admin/dashboard_v2?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    lastData = data;

    if (!data || typeof data !== 'object'){
      showToast('Dashboard โหลดไม่สำเร็จ', 'error');
      return;
    }

    const meObj = safeGet(data,'me',{});
    $('whoBox').textContent = `${meObj.full_name || meObj.username || '-'}`;
    const roleLabel = (meObj.role==='super_admin') ? 'Super Admin' : 'Admin';
    const rb = $('roleBox');
    if (rb) rb.textContent = roleLabel;
    setAvatar(meObj.photo_url || '');

    const personal = safeGet(data,'personal',{ job_count:0, revenue_total:0, commission_total:0 });
    const company = safeGet(data,'company',{ job_count:0, revenue_total:0, series:{day:[],week:[],month:[],year:[]}, donut:null, candles:[] });
    const counts = safeGet(data,'counts',{ today:0, month:0, year:0 });
    const pending = safeGet(data,'pending',{ count:0, rows:[] });
    const active = safeGet(data,'active',{ rows:[] });

    // งานที่ขายได้ (ใช้ personal.job_count)
    const sold = Number(personal.job_count||0);
    $('meSoldJobs').textContent = `${sold.toLocaleString('th-TH')} งาน`;
    $('meSoldJobsHint').textContent = 'ในช่วงที่เลือก';

    // คอมมิชชั่นส่วนตัว (ยังมีประโยชน์)
    $('meCommission').textContent = `${fmtMoney(Number(personal.commission_total||0))} ฿`;
    $('meCommissionHint').textContent = `rate ${Number(meObj.commission_rate_percent||0).toFixed(2)}%`;

    $('coRevenue').textContent = `${fmtMoney(Number(company.revenue_total||0))} ฿`;
    $('coRevenueHint').textContent = `${Number(company.job_count||0).toLocaleString('th-TH')} งาน ในช่วงที่เลือก`;

    $('countToday').textContent = String(Number(counts.today||0));
    $('countMonth').textContent = String(Number(counts.month||0));
    $('countYear').textContent = String(Number(counts.year||0));

    $('pendingHint').textContent = `ทั้งหมด ${Number(pending.count||0)} งาน`;
    renderList('pendingList', pending.rows);

    $('activeHint').textContent = `แสดง ${Number((active.rows||[]).length||0)} งาน`;
    renderList('activeList', active.rows);

    drawDonut(company.donut || null);
    drawCandles(company.candles || []);

    const series = safeGet(company,`series.${currentGroup}`,[]) || [];
    $('seriesHint').textContent = `รวม ${series.length} จุดข้อมูล`;
    drawChart(series);

    renderTechStats(data);
  }

  function init(){
    // shortcuts
    const addBtn = $('goAddJob');
    if (addBtn) addBtn.addEventListener('click', ()=> location.href = '/admin-add-v2.html');
    const histBtn = $('goHistory');
    if (histBtn) histBtn.addEventListener('click', ()=> location.href = '/admin-history-v2.html');

    // quick ranges
    setRange(30);
    setQuickActive('quick30');
    updateFilterSummary();

    $('quickToday')?.addEventListener('click', ()=>{ setRange(1); setQuickActive('quickToday'); updateFilterSummary(); load().catch(e=>showToast(String(e), 'error')); });
    $('quick7')?.addEventListener('click', ()=>{ setRange(7); setQuickActive('quick7'); updateFilterSummary(); load().catch(e=>showToast(String(e), 'error')); });
    $('quick30')?.addEventListener('click', ()=>{ setRange(30); setQuickActive('quick30'); updateFilterSummary(); load().catch(e=>showToast(String(e), 'error')); });

    // filters collapse default
    try{
      const v = localStorage.getItem('dash_filters_collapsed');
      setFiltersCollapsed(v === null ? true : (v === '1'));
    }catch(_){ setFiltersCollapsed(true); }

    $('filterToggle')?.addEventListener('click', (ev)=>{
      if (ev && ev.target && (ev.target.id === 'btnApplyMini')) return;
      const card = $('filtersCard');
      const isOpen = card ? card.classList.contains('open') : false;
      setFiltersCollapsed(isOpen);
    });

    $('btnApplyMini')?.addEventListener('click', ()=>{ load().catch(e=>showToast(String(e), 'error')); });
    $('btnApply')?.addEventListener('click', ()=>{ updateFilterSummary(); load().catch(e=>showToast(String(e), 'error')); });
    $('fromDate')?.addEventListener('change', updateFilterSummary);
    $('toDate')?.addEventListener('change', updateFilterSummary);

    // series group
    document.querySelectorAll('[data-group]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        currentGroup = btn.getAttribute('data-group') || 'day';
        setActiveGroup(btn);
        const company = safeGet(lastData,'company',{});
        const series = safeGet(company,`series.${currentGroup}`,[]) || [];
        $('seriesHint').textContent = `รวม ${series.length} จุดข้อมูล`;
        drawChart(series);
      });
    });

    // tech scope tabs
    document.querySelectorAll('[data-techscope]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-techscope]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        techScope = btn.getAttribute('data-techscope') || 'all';
        renderTechStats(lastData || {});
      });
    });

    // initial load
    load().catch(e=>showToast(String(e), 'error'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
