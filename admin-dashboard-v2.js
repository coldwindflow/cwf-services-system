/* Admin Dashboard v2 (Production-safe UI refresh) */
(function(){
  const $ = (id)=>document.getElementById(id);
  let lastData = null;
  let currentGroup = 'day';
  let techScope = 'all';
  let _payoutCache = [];

  function setAvatar(url){
    const img = $('meAvatar');
    if(!img) return;
    if (url) { img.src = url; return; }
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">
        <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0d2f7a"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
        <rect width="100%" height="100%" rx="18" fill="url(#g)"/>
        <circle cx="44" cy="32" r="14" fill="#ffffff" fill-opacity="0.92"/>
        <rect x="20" y="50" width="48" height="22" rx="11" fill="#ffffff" fill-opacity="0.92"/>
      </svg>`
    );
  }

  function setQuickActive(activeId){
    ['quickToday','quick7','quick30','quickFilters'].forEach(id=>{
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
    try{ if (window.showToast) return window.showToast(msg, kind); }catch(_){ }
    console[(kind==='error')?'error':'log']('[dashboard]', msg);
  }

  async function apiFetch(url){
    if (window.apiFetch && window.apiFetch !== apiFetch) return window.apiFetch(url);
    const res = await fetch(url, { credentials:'include', headers: { 'Content-Type':'application/json', 'x-user-role':'admin' }});
    if(!res.ok){
      const t = await res.text().catch(()=> '');
      throw new Error(`HTTP ${res.status} ${t}`);
    }
    return await res.json();
  }

  function escapeHtml(v){
    return String(v == null ? '' : v)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function formatBangkokDateTime(value){
    if (!value) return '-';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '-';
    return dt.toLocaleString('th-TH',{
      timeZone:'Asia/Bangkok',
      hour:'2-digit', minute:'2-digit',
      day:'2-digit', month:'2-digit', year:'2-digit'
    });
  }

  function setText(id, value){
    const el = $(id);
    if (el) el.textContent = value;
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
      const when = formatBangkokDateTime(r.appointment_datetime || r.booking_time || r.created_at);
      const jobId = Number(r.job_id || 0);
      const code = r.booking_code || (jobId ? `#${jobId}` : '-');
      const customerName = r.customer_name || '-';
      const jobType = r.job_type || '-';
      const st = String(r.job_status||'').trim();
      const pillClass = (st==='รอตรวจสอบ'||st==='pending_review') ? 'yellow' : (st==='กำลังทำ' ? 'blue' : 'gray');
      const item = document.createElement('div');
      item.className = 'item';
      item.innerHTML = `
        <div class="l">
          <b>${escapeHtml(code)} • ${escapeHtml(customerName)}</b>
          <div class="s">${escapeHtml(when)} • ${escapeHtml(jobType)} • ${escapeHtml(fmtMoney(r.job_price||0))} ฿</div>
        </div>
        <div class="pill ${pillClass}">${escapeHtml(st || '-')}</div>
      `;
      if (jobId) {
        item.style.cursor = 'pointer';
        item.addEventListener('click', ()=>{
          location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(jobId)}`;
        });
      }
      el.appendChild(item);
    }
  }

  function syncHeroRange(){
    const from = $('fromDate')?.value || '';
    const to = $('toDate')?.value || '';
    const label = from && to ? `${from} → ${to}` : '—';
    setText('heroRangeLabel', label);
  }

  function updateFilterSummary(){
    const from = $('fromDate')?.value || '';
    const to = $('toDate')?.value || '';
    const sum = $('filterSummary');
    if (!sum) return;
    if (from && to) sum.textContent = `${from} → ${to}`;
    else if (from) sum.textContent = `${from} → ...`;
    else sum.textContent = '—';
    syncHeroRange();
  }

  function setFilterModalOpen(open){
    const modal = $('filterModal');
    if (!modal) return;
    modal.classList.toggle('open', !!open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.classList.toggle('modalOpen', !!open);
  }

  function setModalRangeActive(id){
    ['quickTodayModal','quick7Modal','quick30Modal','quickQuarter','quick6m','quick12m'].forEach(x=>{
      const b = $(x);
      if (b) b.classList.toggle('active', x === id);
    });
  }

  function setRange(days, label){
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days-1));
    $('fromDate').value = ymd(from);
    $('toDate').value = ymd(to);
    updateFilterSummary();
    setText('heroQuickLabel', label || (days === 1 ? 'วันนี้' : `${days} วัน`));
  }

  function setRangeMonths(months, label){
    const to = new Date();
    const from = new Date();
    const days = Number(months || 1) >= 12 ? 365 : Number(months || 1) * 30;
    from.setDate(from.getDate() - (days - 1));
    $('fromDate').value = ymd(from);
    $('toDate').value = ymd(to);
    updateFilterSummary();
    setText('heroQuickLabel', label || `${months} เดือน`);
  }

  function drawDonut(donut){
    const canvas = $('donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const d = donut || { pending:0, active:0, done:0, other:0 };
    const parts = [
      { key:'pending', label:'รอตรวจสอบ', value:Number(d.pending||0), color:'#ffcc00' },
      { key:'active', label:'กำลังทำ', value:Number(d.active||0), color:'#1558d6' },
      { key:'done', label:'เสร็จแล้ว', value:Number(d.done||0), color:'#16a34a' },
      { key:'other', label:'อื่นๆ', value:Number(d.other||0), color:'#94a3b8' },
    ];
    const total = parts.reduce((s,x)=>s+x.value,0);
    const done = Number(d.done||0);
    const followup = Number(d.pending||0) + Number(d.active||0) + Number(d.other||0);
    const completionRate = total ? Math.round((done/total)*100) : 0;

    setText('jobTotal', total ? String(total) : '—');
    setText('donutHint', total ? `ทั้งหมด ${total} งาน` : '—');
    setText('completionHint', total ? `ปิดงานแล้ว ${done} งาน` : '—');
    setText('completionRate', total ? `${completionRate}%` : '—');
    setText('followupCount', String(followup));
    setText('ovJobsTotal', total ? String(total) : '—');
    setText('ovDone', String(done));
    setText('ovActive', String(Number(d.active||0)));
    setText('ovPending', String(Number(d.pending||0)));
    setText('ovDoneHint', total ? `${completionRate}% ของงานทั้งหมด` : '—');

    const statusBreakdown = $('statusBreakdown');
    if (statusBreakdown){
      statusBreakdown.innerHTML = parts.filter(x=>x.value > 0 || x.key !== 'other').map(p=>{
        const pct = total ? Math.round((p.value / total) * 100) : 0;
        return `
          <div class="statusItem">
            <div class="statusMeta"><span class="dot" style="background:${p.color}"></span>${p.label}</div>
            <div class="statusCount">${p.value} งาน • ${pct}%</div>
            <div class="progressBar"><span style="width:${pct}%;background:${p.color}"></span></div>
          </div>
        `;
      }).join('');
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const attrW = Number(canvas.getAttribute('width') || 132);
    const attrH = Number(canvas.getAttribute('height') || 132);
    const cssW = Math.max(96, Math.round((rect && rect.width) || canvas.clientWidth || attrW));
    const cssH = Math.max(96, Math.round((rect && rect.height) || canvas.clientHeight || attrH));
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    const visible = parts.filter(x=>x.value > 0);
    const cx = cssW/2;
    const cy = cssH/2 - 4;
    const r = Math.min(cssW, cssH) * 0.36;
    const lineW = Math.max(14, Math.round(r * 0.20));

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(21, 88, 214, 0.08)';
    ctx.lineWidth = lineW;
    ctx.stroke();

    if (!total){
      ctx.fillStyle = '#64748b';
      ctx.font = '700 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ไม่มีข้อมูล', cx, cy + 5);
      ctx.textAlign = 'start';
      return;
    }

    let a = -Math.PI/2;
    for (const p of visible){
      const ang = (p.value/total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a+ang);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = lineW;
      ctx.lineCap = 'round';
      ctx.stroke();
      a += ang;
    }

    ctx.fillStyle = '#09152f';
    ctx.textAlign = 'center';
    ctx.font = '900 24px sans-serif';
    ctx.fillText(String(total), cx, cy + 5);
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('งานทั้งหมด', cx, cy + 24);
    ctx.textAlign = 'start';
  }

  function drawLineChart(canvasId, rows, options = {}){
    const canvas = $(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const items = Array.isArray(rows) ? rows.slice(-Math.min(options.maxPoints || 18, rows.length || 0)) : [];

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 420;
    const cssH = Number(options.height || canvas.getAttribute('height') || 220);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);

    if (!items.length){
      ctx.fillStyle = '#64748b';
      ctx.font = '700 14px sans-serif';
      ctx.fillText('ไม่มีข้อมูลในช่วงที่เลือก', 12, 24);
      return;
    }

    const values = items.map(x=>Number(options.getValue ? options.getValue(x) : (x.total||x.close||0)));
    const max = Math.max(1, ...values);
    const min = Math.min(0, ...values);
    const padL = 12, padR = 10, padT = 16, padB = 34;
    const w = cssW - padL - padR;
    const h = cssH - padT - padB;
    const step = items.length > 1 ? w / (items.length - 1) : 0;

    const y = (v)=> padT + h - ((v - min) / (max - min || 1)) * h;

    for (let i=0;i<4;i++){
      const yy = padT + (h/3) * i;
      ctx.strokeStyle = 'rgba(15,23,42,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, yy);
      ctx.lineTo(padL + w, yy);
      ctx.stroke();
    }

    const points = items.map((item, idx)=>({ x: padL + step * idx, y: y(values[idx]), label: item.label || '' }));

    const gradient = ctx.createLinearGradient(0, padT, 0, padT + h);
    gradient.addColorStop(0, options.fillTop || 'rgba(37,99,235,0.28)');
    gradient.addColorStop(1, options.fillBottom || 'rgba(37,99,235,0.02)');

    ctx.beginPath();
    points.forEach((p, i)=>{
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i-1];
        const cx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y)/2);
      }
    });
    const last = points[points.length-1];
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(padL + w, padT + h);
    ctx.lineTo(padL, padT + h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    points.forEach((p, i)=>{
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i-1];
        const cx = (prev.x + p.x) / 2;
        ctx.quadraticCurveTo(prev.x, prev.y, cx, (prev.y + p.y)/2);
      }
    });
    ctx.strokeStyle = options.lineColor || '#1558d6';
    ctx.lineWidth = 3;
    ctx.stroke();

    points.forEach((p, i)=>{
      const show = items.length <= 8 || i === 0 || i === points.length - 1 || i % Math.ceil(items.length / 5) === 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI*2);
      ctx.fillStyle = options.pointColor || '#1558d6';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (show){
        ctx.fillStyle = '#64748b';
        ctx.font = '700 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(items[i].label || '', p.x, cssH - 10);
      }
    });
    ctx.textAlign = 'start';
  }

  function drawTrend(rows){
    const list = (rows || []).slice(-18);
    setText('candleHint', list.length ? `แสดง ${list.length} วันล่าสุด` : '—');
    drawLineChart('candles', list, {
      maxPoints: 18,
      getValue: (x)=> Number(x.close || x.high || 0),
      lineColor: '#1558d6',
      pointColor: '#1558d6',
      fillTop: 'rgba(37,99,235,0.24)',
      fillBottom: 'rgba(37,99,235,0.02)',
      height: 220
    });
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

  function drawSeries(series){
    const items = (series || []).slice(-18);
    setText('seriesHint', items.length ? `รวม ${items.length} จุดข้อมูล` : '—');
    drawLineChart('chart', items, {
      maxPoints: 18,
      getValue: (x)=> Number(x.total || 0),
      lineColor: '#0d2f7a',
      pointColor: '#0d2f7a',
      fillTop: 'rgba(13,47,122,0.22)',
      fillBottom: 'rgba(13,47,122,0.02)',
      height: 220
    });
  }


  function renderPriority(data){
    const listEl = $('priorityList');
    if (!listEl) return;
    const company = safeGet(data,'company',{});
    const donut = company.donut || {};
    const pending = Number(donut.pending || safeGet(data,'pending.count',0) || 0);
    const active = Number(donut.active || 0);
    const done = Number(donut.done || 0);
    const total = pending + active + done + Number(donut.other || 0);
    const stats = safeGet(data,'tech_stats.all', null);
    const techOpen = stats ? Number(stats.open || 0) : 0;
    const techClosed = stats ? Number(stats.closed || 0) : 0;
    const completion = total ? Math.round((done/total)*100) : 0;

    let level = 'ปกติ';
    if (pending > 0 || active > 0) level = 'ต้องติดตาม';
    if (pending >= 5 || active >= 8 || techOpen <= 0) level = 'เร่งด่วน';
    setText('priorityLevel', level);
    setText('priorityHint', total ? `ปิดงานแล้ว ${completion}% • งานต้องติดตาม ${pending + active} งาน` : 'ยังไม่มีข้อมูลในช่วงนี้');

    const items = [
      { icon:'✅', title:'งานรอตรวจสอบ', desc:'ควรตรวจและยืนยันก่อนเพื่อไม่ให้ลูกค้ารอนาน', value:pending },
      { icon:'🛠️', title:'งานกำลังดำเนินการ', desc:'ติดตามสถานะหน้างานและการปิดงาน', value:active },
      { icon:'👷', title:'ช่างพร้อมรับงาน', desc:'กำลังคนที่เปิดรับงานอยู่ตอนนี้', value:techOpen },
      { icon:'🌙', title:'ช่างหยุด/ปิดรับงาน', desc:'ใช้ดูความพร้อมทีมและความเสี่ยงคิวเต็ม', value:techClosed },
    ];
    listEl.innerHTML = items.map(x=>`
      <div class="priorityItem">
        <div class="priorityIcon">${x.icon}</div>
        <div class="priorityText"><b>${escapeHtml(x.title)}</b><span>${escapeHtml(x.desc)}</span></div>
        <div class="priorityNum">${Number(x.value||0).toLocaleString('th-TH')}</div>
      </div>
    `).join('');
  }

  function renderTechStats(data){
    const stats = safeGet(data,'tech_stats', null);
    const bucket = stats ? (stats[techScope] || stats.all || null) : null;
    if (!bucket){
      ['techOpen','techClosed','techTotal','techOpenRate','ovTechOpen','ovTechClosed'].forEach(id=>setText(id,'—'));
      setText('techHint', '—');
      setText('operationsHint', '—');
      return;
    }
    const open = Number(bucket.open||0);
    const closed = Number(bucket.closed||0);
    const total = Number(bucket.total|| (open+closed) || 0);
    const rate = total ? Math.round((open/total)*100) : 0;
    setText('techOpen', String(open));
    setText('techClosed', String(closed));
    setText('techTotal', String(total));
    setText('techOpenRate', total ? `${rate}%` : '—');
    setText('ovTechOpen', String(open));
    setText('ovTechClosed', String(closed));
    setText('techHint', techScope==='all' ? 'รวมทุกทีม' : (techScope==='company' ? 'เฉพาะช่างบริษัท' : 'เฉพาะพาร์ทเนอร์'));
    setText('operationsHint', `ช่างพร้อม ${open} • หยุด/ปิดรับ ${closed}`);
  }

  async function loadPayoutsList(){
    const sel = $('payoutSelect');
    if (!sel) return;
    try{
      const r = await apiFetch('/admin/payouts');
      const rows = Array.isArray(r.payouts) ? r.payouts : [];
      _payoutCache = rows;
      sel.innerHTML = '';
      if (!rows.length){
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— ยังไม่มีงวด —';
        sel.appendChild(opt);
        return;
      }
      for (const p of rows.slice(0, 20)){
        const id = String(p.payout_id||'').trim();
        const st = String(p.status||'draft');
        const pt = String(p.period_type||'');
        const s = String(p.period_start||'').slice(0,10);
        const e = String(p.period_end||'').slice(0,10);
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = `${pt} | ${s} → ${e} | ${st}`;
        sel.appendChild(opt);
      }
    }catch(e){
      showToast('โหลดงวดช่างไม่สำเร็จ', 'error');
    }
  }

  function renderPayoutTechs(rows){
    const tb = $('payoutTechsTbody');
    if (!tb) return;
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length){
      tb.innerHTML = `<tr><td colspan="6" class="muted">— ยังไม่มีข้อมูล —</td></tr>`;
      return;
    }
    tb.innerHTML = list.map(r=>{
      const u = escapeHtml(String(r.technician_username||''));
      const dep = Number(r.deposit_deduction_amount||0);
      const net = Number(r.net_amount||0);
      const paid = Number(r.paid_amount||0);
      const rem = Number(r.remaining_amount||0);
      const st = String(r.paid_status||'unpaid');
      const pill = st==='paid' ? 'pill blue' : (st==='partial' ? 'pill yellow' : 'pill gray');
      const stLabel = st==='paid' ? 'paid' : (st==='partial' ? 'partial' : 'unpaid');
      return `<tr>
        <td><b>${u}</b></td>
        <td style="text-align:right">${fmtMoney(dep)}</td>
        <td style="text-align:right"><b>${fmtMoney(net)}</b></td>
        <td style="text-align:right">${fmtMoney(paid)}</td>
        <td style="text-align:right">${fmtMoney(rem)}</td>
        <td><span class="${pill}">${stLabel}</span></td>
      </tr>`;
    }).join('');
  }

  async function loadPayoutTechs(){
    const payout_id = String($('payoutSelect')?.value||'').trim();
    if (!payout_id) return renderPayoutTechs([]);
    try{
      const r = await apiFetch(`/admin/payouts/${encodeURIComponent(payout_id)}/techs`);
      renderPayoutTechs(r.techs || []);
    }catch(e){
      showToast('โหลดรายช่างไม่สำเร็จ', 'error');
      renderPayoutTechs([]);
    }
  }

  async function load(){
    const from = $('fromDate').value;
    const to = $('toDate').value;
    setText('pendingHint', 'กำลังโหลด...');
    setText('activeHint', 'กำลังโหลด...');
    setText('seriesHint', 'กำลังโหลด...');
    const data = await apiFetch(`/admin/dashboard_v2?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    lastData = data;

    if (!data || typeof data !== 'object'){
      showToast('Dashboard โหลดไม่สำเร็จ', 'error');
      return;
    }

    const meObj = safeGet(data,'me',{});
    setText('whoBox', `${meObj.full_name || meObj.username || '-'}`);
    setText('roleBox', (meObj.role==='super_admin') ? 'Super Admin • ผู้ดูแลระบบ' : 'Admin • ผู้ดูแลระบบ');
    setAvatar(meObj.photo_url || '');

    const personal = safeGet(data,'personal',{ job_count:0, revenue_total:0, commission_total:0 });
    const company = safeGet(data,'company',{ job_count:0, revenue_total:0, series:{day:[],week:[],month:[],year:[]}, donut:null, candles:[] });
    const counts = safeGet(data,'counts',{ today:0, month:0, year:0 });
    const pending = safeGet(data,'pending',{ count:0, rows:[] });
    const active = safeGet(data,'active',{ rows:[] });

    setText('meSoldJobs', `${Number(personal.job_count||0).toLocaleString('th-TH')} งาน`);
    setText('meSoldJobsHint', 'ในช่วงที่เลือก');
    setText('meCommission', `${fmtMoney(Number(personal.commission_total||0))} ฿`);
    setText('meCommissionHint', `rate ${Number(meObj.commission_rate_percent||0).toFixed(2)}%`);

    setText('coRevenue', `${fmtMoney(Number(company.revenue_total||0))} ฿`);
    setText('coRevenueHint', `${Number(company.job_count||0).toLocaleString('th-TH')} งาน ในช่วงที่เลือก`);
    const hasNetProfit = company.net_profit_total !== undefined && company.net_profit_total !== null;
    setText('coNetProfit', hasNetProfit ? `${fmtMoney(Number(company.net_profit_total||0))} ฿` : '—');
    setText('coNetProfitHint', hasNetProfit ? `หลังหักจ่ายช่างตามสัญญา ${fmtMoney(Number(company.technician_cost_total||0))} ฿ • ยังไม่รวม VAT` : 'รอข้อมูลค่าช่างจากระบบ');
    setText('countToday', String(Number(counts.today||0)));
    setText('countMonth', String(Number(counts.month||0)));
    setText('countYear', String(Number(counts.year||0)));

    setText('pendingHint', `ทั้งหมด ${Number(pending.count||0)} งาน`);
    renderList('pendingList', pending.rows);

    const activeCount = Number((active.rows||[]).length||0);
    setText('activeHint', `แสดง ${activeCount} งาน`);
    renderList('activeList', active.rows);

    drawDonut(company.donut || null);
    drawTrend(company.candles || []);
    drawSeries(safeGet(company,`series.${currentGroup}`,[]) || []);
    renderTechStats(data);
    renderPriority(data);
  }

  function init(){
    setAvatar('');
    setRange(30);
    setQuickActive('quick30');

    $('goAddJob')?.addEventListener('click', ()=> location.href = '/admin-add-v2.html');
    $('goQueue')?.addEventListener('click', ()=> location.href = '/admin-queue-v2.html');
    $('goHistory')?.addEventListener('click', ()=> location.href = '/admin-history-v2.html');
    $('goAccounting')?.addEventListener('click', ()=> location.href = '/admin-accounting-v2.html');
    $('goDeductions')?.addEventListener('click', ()=> location.href = '/admin-deductions-v2.html');
    $('goMediaRetention')?.addEventListener('click', ()=> location.href = '/admin-media-retention-v2.html');
    $('goReview')?.addEventListener('click', ()=> location.href = '/admin-review-v2.html');
    $('goTechs')?.addEventListener('click', ()=> location.href = '/admin-technicians-v2.html');
    $('goPromos')?.addEventListener('click', ()=> location.href = '/admin-promotions-v2.html');
    $('goTeamStatus')?.addEventListener('click', ()=> location.href = '/admin-team-status.html');

    $('quickToday')?.addEventListener('click', ()=>{ setRange(1, 'วันนี้'); setModalRangeActive('quickTodayModal'); setQuickActive('quickToday'); load().catch(e=>showToast(String(e), 'error')); });
    $('quick7')?.addEventListener('click', ()=>{ setRange(7, '7 วัน'); setModalRangeActive('quick7Modal'); setQuickActive('quick7'); load().catch(e=>showToast(String(e), 'error')); });
    $('quick30')?.addEventListener('click', ()=>{ setRange(30, '30 วัน'); setModalRangeActive('quick30Modal'); setQuickActive('quick30'); load().catch(e=>showToast(String(e), 'error')); });
    $('quickFilters')?.addEventListener('click', ()=> setFilterModalOpen(true));
    $('filterClose')?.addEventListener('click', ()=> setFilterModalOpen(false));
    $('filterCancel')?.addEventListener('click', ()=> setFilterModalOpen(false));
    $('filterModal')?.addEventListener('click', (ev)=>{ if (ev.target === $('filterModal')) setFilterModalOpen(false); });
    document.addEventListener('keydown', (ev)=>{ if (ev.key === 'Escape') setFilterModalOpen(false); });

    $('quickTodayModal')?.addEventListener('click', ()=>{ setRange(1, 'วันนี้'); setModalRangeActive('quickTodayModal'); setQuickActive('quickToday'); });
    $('quick7Modal')?.addEventListener('click', ()=>{ setRange(7, '7 วัน'); setModalRangeActive('quick7Modal'); setQuickActive('quick7'); });
    $('quick30Modal')?.addEventListener('click', ()=>{ setRange(30, '30 วัน'); setModalRangeActive('quick30Modal'); setQuickActive('quick30'); });
    $('quickQuarter')?.addEventListener('click', ()=>{ setRangeMonths(3, 'ไตรมาส'); setModalRangeActive('quickQuarter'); setQuickActive('quickFilters'); });
    $('quick6m')?.addEventListener('click', ()=>{ setRangeMonths(6, '6 เดือน'); setModalRangeActive('quick6m'); setQuickActive('quickFilters'); });
    $('quick12m')?.addEventListener('click', ()=>{ setRangeMonths(12, '12 เดือน'); setModalRangeActive('quick12m'); setQuickActive('quickFilters'); });

    $('btnApply')?.addEventListener('click', ()=>{ updateFilterSummary(); setFilterModalOpen(false); load().catch(e=>showToast(String(e), 'error')); });
    $('fromDate')?.addEventListener('change', ()=>{ updateFilterSummary(); setQuickActive('quickFilters'); });
    $('toDate')?.addEventListener('change', ()=>{ updateFilterSummary(); setQuickActive('quickFilters'); });

    document.querySelectorAll('[data-group]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        currentGroup = btn.getAttribute('data-group') || 'day';
        setActiveGroup(btn);
        const company = safeGet(lastData,'company',{});
        drawSeries(safeGet(company,`series.${currentGroup}`,[]) || []);
      });
    });

    document.querySelectorAll('[data-techscope]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('[data-techscope]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        techScope = btn.getAttribute('data-techscope') || 'all';
        renderTechStats(lastData || {});
      });
    });

    $('btnReloadPayouts')?.addEventListener('click', ()=>{ loadPayoutsList().then(()=>loadPayoutTechs()); });
    $('btnLoadPayoutTechs')?.addEventListener('click', ()=>{ loadPayoutTechs(); });

    load().catch(e=>showToast(String(e), 'error'));
    loadPayoutsList().then(()=>loadPayoutTechs());
    window.addEventListener('resize', ()=>{
      if (!lastData) return;
      const company = safeGet(lastData,'company',{});
      drawDonut(company.donut || null);
      drawTrend(company.candles || []);
      drawSeries(safeGet(company,`series.${currentGroup}`,[]) || []);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
