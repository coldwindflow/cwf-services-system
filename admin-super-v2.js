/*
  Super Admin Page (usable & simple)
  - All inputs are direct numbers/text (no JSON)
  - Works with admin-super-v2.html (table-based UI)
  - Requires: /api/auth/me provides is_super_admin
  - APIs (Super Admin guarded):
      GET  /admin/super/users
      POST /admin/super/admins
      PUT  /admin/super/admins/:username
      POST /admin/super/impersonate
      POST /admin/super/impersonate/stop
      GET  /admin/super/durations
      POST /admin/super/durations
      DELETE /admin/super/durations/:service_key
      GET  /admin/super/audit
*/

(async function () {
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.position = 'fixed';
    d.style.left = '12px';
    d.style.right = '12px';
    d.style.bottom = '86px';
    d.style.zIndex = '9999';
    d.style.padding = '12px 14px';
    d.style.borderRadius = '14px';
    d.style.fontWeight = '900';
    d.style.background = '#ffcc00';
    d.style.color = '#0b1b3a';
    d.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18)';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }, opts));
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || 'REQUEST_FAILED');
    return data;
  }
  function cleanPayoutError(e){
    const msg = String(e?.message || e || '');
    if (msg.includes('PAYOUT_ALREADY_PAID')) return 'งวดนี้จ่ายครบแล้ว';
    if (msg.includes('PAYOUT_NOT_FOUND')) return 'ไม่พบงวดจ่ายนี้';
    if (msg.includes('NO_TECH_SELECTED')) return 'กรุณาเลือกช่างก่อนบันทึกจ่าย';
    if (msg.includes('PAY_BULK_FAILED') || msg.includes('PAY_FAILED')) return 'บันทึกการจ่ายไม่สำเร็จ กรุณาลองใหม่';
    return 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่';
  }

  // ===== Guard =====
  let ME = null;
  try {
    ME = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json());
    if (!ME || !ME.ok) throw new Error('UNAUTHORIZED');
    const isSuper = !!(ME.actor && ME.actor.is_super_admin) || !!ME.is_super_admin;
    if (!isSuper) {
      alert('หน้านี้สำหรับ Super Admin เท่านั้น');
      location.replace('/admin-dashboard-v2.html');
      return;
    }
  } catch (e) {
    location.replace('/login.html');
    return;
  }

  // Header
  try {
    const actor = ME.actor || { username: ME.username, role: ME.role };
    $('meBox').textContent = `ผู้ใช้: ${actor.username} (${actor.role}) • Super Admin ✅`;
  } catch (_) { }

  // ===== Admin list =====
  async function loadAdmins() {
    const a1 = await api('/admin/super/users?role=super_admin');
    const a2 = await api('/admin/super/users?role=admin');
    const rows = [...(a1.users || []), ...(a2.users || [])];
    const tb = $('adminsTbody');
    tb.innerHTML = rows.map((u) => {
      const dr = u.display_role || u.role;
      return `
        <tr class="tr" data-u="${esc(u.username)}">
          <td class="mono"><b>${esc(u.username)}</b></td>
          <td><span class="pill ${dr === 'super_admin' ? 'blue' : 'yellow'}">${esc(dr === 'super_admin' ? 'Super Admin' : 'Admin')}</span></td>
          <td><input class="in_name" value="${esc(u.full_name || '')}" placeholder="ชื่อ" style="width:180px" /></td>
          <td>
            <input class="in_comm" type="number" value="${Number(u.commission_rate_percent || 0)}" style="width:110px" />
          </td>
          <td>
            <div class="row">
              <input class="in_pass" placeholder="ตั้งรหัสใหม่ (ถ้าจะเปลี่ยน)" style="width:180px" />
              <button class="btn blue btn_save">บันทึก</button>
            </div>
            <div class="muted" style="margin-top:6px">หมายเหตุ: สิทธิ์ Super Admin ยึด whitelist (ENV) ไม่ใช่ role ใน DB</div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;

    tb.querySelectorAll('.btn_save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const username = tr.getAttribute('data-u');
        const full_name = tr.querySelector('.in_name').value.trim();
        const commission_rate_percent = Number(tr.querySelector('.in_comm').value || 0);
        const password = tr.querySelector('.in_pass').value.trim();
        const payload = { full_name, commission_rate_percent };
        if (password) payload.password = password;
        try {
          await api(`/admin/super/admins/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(payload) });
          tr.querySelector('.in_pass').value = '';
          toast('บันทึกแล้ว');
          await loadAudit();
        } catch (e) {
          alert(`บันทึกไม่สำเร็จ: ${e.message}`);
        }
      });
    });
  }

  $('btnReloadAdmins').addEventListener('click', loadAdmins);

  $('btnCreateAdmin').addEventListener('click', async () => {
    const username = $('a_username').value.trim();
    const password = $('a_password').value.trim();
    const full_name = $('a_fullname').value.trim();
    if (!username || !password) { alert('ต้องใส่ username และ password'); return; }
    try {
      // role is locked to admin in backend (DB constraint). UI keeps dropdown for display only.
      await api('/admin/super/admins', { method: 'POST', body: JSON.stringify({ username, password, full_name }) });
      $('a_username').value = '';
      $('a_password').value = '';
      $('a_fullname').value = '';
      toast('สร้างแล้ว');
      await loadAdmins();
      await loadUsersForImpersonate();
      await loadAudit();
    } catch (e) {
      alert(`สร้างไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Impersonation =====
  async function loadUsersForImpersonate() {
    const data = await api('/admin/super/users');
    const users = data.users || [];
    const sel = $('impTarget');
    const cur = sel.value;
    sel.innerHTML = users.map(u => {
      const dr = u.display_role || u.role;
      const label = `${u.username} • ${dr}${u.full_name ? ` • ${u.full_name}` : ''}`;
      return `<option value="${esc(u.username)}">${esc(label)}</option>`;
    }).join('');
    if (cur) sel.value = cur;
  }

  async function refreshImpState() {
    try {
      const me = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json());
      if (!me || !me.ok) return;
      if (me.impersonating && me.actor) {
        $('impState').textContent = `กำลังสวมสิทธิ: ${me.username} (${me.role}) • โดย ${me.actor.username}`;
      } else {
        $('impState').textContent = 'ยังไม่ได้สวมสิทธิ';
      }
    } catch (_) { }
  }

  $('btnReloadUsers').addEventListener('click', async () => {
    await loadUsersForImpersonate();
    toast('รีเฟรชแล้ว');
  });

  $('btnImp').addEventListener('click', async () => {
    const target = $('impTarget').value;
    if (!target) { alert('เลือกรายชื่อก่อน'); return; }
    if (!confirm(`สวมสิทธิเป็น ${target} ?\n(มีบันทึก Audit Log)`)) return;
    try {
      const r = await api('/admin/super/impersonate', { method: 'POST', body: JSON.stringify({ target_username: target }) });
      toast(`สวมสิทธิเป็น ${r.impersonated.username} แล้ว`);
      await loadAudit();
      if (r.impersonated.role === 'technician') location.href = '/tech.html';
      else location.href = '/admin-dashboard-v2.html';
    } catch (e) {
      alert(`สวมสิทธิไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnStopImp').addEventListener('click', async () => {
    if (!confirm('หยุดสวมสิทธิ และกลับเป็น Super Admin?')) return;
    try {
      await api('/admin/super/impersonate/stop', { method: 'POST' });
      toast('หยุดสวมสิทธิแล้ว');
      await loadAudit();
      location.href = '/admin-super-v2.html';
    } catch (e) {
      alert(`หยุดสวมสิทธิไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Duration rules =====
  async function loadDurations() {
    const data = await api('/admin/super/durations');
    const rows = data.rows || [];
    const tb = $('durTbody');
    tb.innerHTML = rows.map(r => {
      const ts = r.updated_at ? new Date(r.updated_at).toLocaleString('th-TH') : '-';
      return `
        <tr class="tr" data-k="${esc(r.service_key)}" data-m="${Number(r.duration_min || 0)}">
          <td class="mono"><b>${esc(r.service_key)}</b></td>
          <td><b>${Number(r.duration_min || 0)}</b> นาที</td>
          <td>${esc(r.updated_by || '-')}</td>
          <td>${esc(ts)}</td>
          <td>
            <div class="row">
              <button class="btn gray btn_edit">แก้ไข</button>
              <button class="btn btn_del">ลบ</button>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;

    tb.querySelectorAll('.btn_edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        $('d_key').value = tr.getAttribute('data-k');
        $('d_min').value = tr.getAttribute('data-m');
      });
    });
    tb.querySelectorAll('.btn_del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const k = tr.getAttribute('data-k');
        if (!confirm(`ลบ duration: ${k} ?`)) return;
        try {
          await api(`/admin/super/durations/${encodeURIComponent(k)}`, { method: 'DELETE' });
          toast('ลบแล้ว');
          await loadDurations();
          await loadAudit();
        } catch (e) {
          alert(`ลบไม่สำเร็จ: ${e.message}`);
        }
      });
    });
  }

  $('btnReloadDur').addEventListener('click', loadDurations);
  $('btnUpsertDur').addEventListener('click', async () => {
    const service_key = $('d_key').value.trim();
    const duration_min = Number($('d_min').value || 0);
    if (!service_key || !Number.isFinite(duration_min) || duration_min <= 0) {
      alert('กรอก service_key และ duration_min (ตัวเลขมากกว่า 0)');
      return;
    }
    try {
      await api('/admin/super/durations', { method: 'POST', body: JSON.stringify({ service_key, duration_min }) });
      toast('บันทึกแล้ว');
      $('d_key').value = '';
      $('d_min').value = '';
      await loadDurations();
      await loadAudit();
    } catch (e) {
      alert(`บันทึกไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Audit log =====
  async function loadAudit() {
    const data = await api('/admin/super/audit?limit=200');
    const rows = data.rows || [];
    const tb = $('auditTbody');
    tb.innerHTML = rows.map(r => {
      const ts = r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-';
      const meta = r.meta_json ? JSON.stringify(r.meta_json) : '';
      return `
        <tr class="tr">
          <td>${esc(ts)}</td>
          <td class="mono">${esc(r.actor_username || '-')} (${esc(r.actor_role || '-')})</td>
          <td><b>${esc(r.action || '-')}</b></td>
          <td class="mono">${esc(r.target_username || '-')}</td>
          <td style="max-width:360px;white-space:pre-wrap;word-break:break-word">${esc(meta)}</td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;
  }

  $('btnReloadAudit').addEventListener('click', loadAudit);

  let PAYOUTS = [];
  let ACTIVE_PAYOUT = '';
  let ACTIVE_TECH = '';
  let BULK_SELECTED_TECHS = new Set();
  let SHOW_ALL_PAYOUT_HISTORY = false;

  function fmtBaht(n){
    const x = Number(n||0);
    if (!Number.isFinite(x)) return '0 ฿';
    try{ return x.toLocaleString('th-TH',{ maximumFractionDigits:0 }) + ' ฿'; }catch{ return String(Math.round(x))+' ฿'; }
  }
  function _safeNum(n){ const x=Number(n||0); return Number.isFinite(x)?x:0; }

  function fmtDate(iso){
    try{ const d=new Date(iso); if (Number.isNaN(d.getTime())) return '-'; return d.toLocaleDateString('th-TH',{ year:'numeric', month:'short', day:'numeric' }); }catch{ return '-'; }
  }
  function statusThai(st){
    const m={draft:'กำลังตรวจยอด',locked:'พร้อมจ่าย',paid:'จ่ายแล้ว',partial:'จ่ายบางส่วน',unpaid:'รอจ่าย',cancelled:'ยกเลิก'};
    return m[String(st||'draft')] || String(st||'draft');
  }
  function paidStatusThai(st){ return statusThai(st || 'unpaid'); }
  function statusClass(st){
    const s=String(st||'draft');
    if (s==='paid') return 'green';
    if (s==='locked') return 'yellow';
    if (s==='cancelled') return 'red';
    return 'blue';
  }
  function parsePayoutId(pid){
    const m=/^payout_(\d{4})-(\d{2})_(10|25)$/.exec(String(pid||''));
    if(!m) return null;
    return { y:Number(m[1]), m:Number(m[2]), type:m[3] };
  }
  function payoutDueDate(p){
    const parsed=parsePayoutId(p?.payout_id);
    if(!parsed) return null;
    return new Date(parsed.y, parsed.m-1, Number(parsed.type));
  }
  function payoutLabel(p){
    const t=String(p?.period_type||parsePayoutId(p?.payout_id)?.type||'');
    return t ? `งวดวันที่ ${t}` : 'งวดจ่าย';
  }
  function currentPayoutType(){
    const now=new Date();
    const bkk=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
    const day=bkk.getDate();
    if(day>=25) return '25';
    if(day>=10) return '10';
    return '10';
  }
  function isPaid(p){ return String(p?.status||'draft') === 'paid'; }
  function isActionable(p){
    const st=String(p?.status||'draft');
    if(st==='paid' || st==='cancelled') return false;
    return true;
  }
  function daysDiff(a,b){
    const A=new Date(a.getFullYear(),a.getMonth(),a.getDate()).getTime();
    const B=new Date(b.getFullYear(),b.getMonth(),b.getDate()).getTime();
    return Math.floor((A-B)/(24*60*60*1000));
  }

  async function loadPayouts(){
    if (!$('payoutsTbody')) return;
    try{
      const r = await api('/admin/super/payouts');
      PAYOUTS = r.payouts || [];
      renderPayouts();
    }catch(e){
      if ($('payoutsTbody')) $('payoutsTbody').innerHTML = `<tr class="tr"><td colspan="8" class="muted">โหลดไม่สำเร็จ</td></tr>`;
      if ($('payoutDueAlert')) $('payoutDueAlert').textContent = 'โหลดงวดจ่ายไม่สำเร็จ';
    }
  }

  function renderPayoutDueAlert(activeItems){
    const el=$('payoutDueAlert');
    if(!el) return;
    const now=new Date();
    const todayBkk=new Date(now.toLocaleString('en-US',{timeZone:'Asia/Bangkok'}));
    const unpaid=(activeItems||[]).filter(p=>!isPaid(p));
    const withDue=unpaid.map(p=>({p,due:payoutDueDate(p)})).filter(x=>x.due);
    const overdue=withDue.filter(x=>daysDiff(todayBkk,x.due)>0).sort((a,b)=>a.due-b.due)[0];
    const dueToday=withDue.filter(x=>daysDiff(todayBkk,x.due)===0).sort((a,b)=>_safeNum(b.p.total_amount)-_safeNum(a.p.total_amount))[0];
    let target=overdue || dueToday;
    el.className='payout-due-alert';
    if(target){
      const p=target.p;
      const dd=daysDiff(todayBkk,target.due);
      const title=dd>0 ? `⚠️ มีงวดค้างจ่าย เลยกำหนด ${dd} วัน` : '🔔 วันนี้ถึงรอบจ่ายเงินช่าง';
      el.className += dd>0 ? ' danger' : '';
      el.innerHTML=`<div class="row" style="justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><div><b>${title}</b><div class="muted" style="margin-top:4px">${esc(payoutLabel(p))} • วันที่ต้องจ่าย ${fmtDate(target.due)} • ยอดสุทธิต้องจ่าย ${fmtBaht(p.total_amount)} • ${Number(p.techs_count||0)} ช่าง</div></div><button class="btn blue" data-due-payout="${esc(p.payout_id)}">ตรวจยอดและจ่ายเงิน</button></div>`;
      el.querySelector('[data-due-payout]')?.addEventListener('click',()=>openPayout(p.payout_id));
      return;
    }
    const day=todayBkk.getDate();
    const nextDay=day<10?10:(day<25?25:10);
    const next=new Date(todayBkk.getFullYear(), todayBkk.getMonth()+(day>=25?1:0), nextDay);
    el.className += ' ok';
    el.innerHTML=`<b>รอบจ่ายถัดไป: ${fmtDate(next)}</b><div class="muted" style="margin-top:4px">ระบบจะเตรียมงวดให้อัตโนมัติเมื่อถึงรอบ แอดมินยังต้องโอนเงินจริงและกดบันทึกจ่ายแล้วเอง</div>`;
  }

  function renderPayouts(){
    const tb = $('payoutsTbody');
    const cards = $('payoutsCards');
    const historyBox = $('payoutHistoryCards');
    if (!tb && !cards && !historyBox) return;
    if (!PAYOUTS.length) {
      if (tb) tb.innerHTML = `<tr class="tr"><td colspan="8" class="muted">ยังไม่มีงวด</td></tr>`;
      if (cards) cards.innerHTML = `<div class="muted">ยังไม่มีงวด</div>`;
      if (historyBox) historyBox.innerHTML = `<div class="muted">ยังไม่มีประวัติ</div>`;
      renderPayoutDueAlert([]);
      return;
    }

    const active = PAYOUTS.filter(isActionable).slice(0,6);
    const paid = PAYOUTS.filter(isPaid);
    renderPayoutDueAlert(active.length?active:PAYOUTS.slice(0,4));

    const cardHtml = active.map(p=>{
      const range = `${fmtDate(p.period_start)} - ${fmtDate(p.period_end)}`;
      const st = String(p.status||'draft');
      const isActive = String(ACTIVE_PAYOUT||'') === String(p.payout_id||'');
      const due=payoutDueDate(p);
      return `
        <div class="payout-card-item ${isActive?'active':''}">
          <div class="topline">
            <div>
              <div class="row" style="gap:8px;align-items:center">
                <span class="pill ${statusClass(st)}">${esc(statusThai(st))}</span>
                <span class="pill" style="background:#eef6ff;color:#0b4bb3">${esc(payoutLabel(p))}</span>
              </div>
              <div class="muted" style="margin-top:8px">รอบงาน ${esc(range)}</div>
              <div class="muted" style="margin-top:4px">วันที่ต้องจ่าย ${esc(fmtDate(due))}</div>
            </div>
            <div style="text-align:right">
              <div class="amount">${fmtBaht(p.total_amount)}</div>
              <div class="muted" style="margin-top:4px">ยอดสุทธิต้องจ่าย</div>
            </div>
          </div>
          <div class="row" style="justify-content:space-between;align-items:center;margin-top:10px;gap:8px">
            <div class="muted">${Number(p.techs_count||0)} ช่าง • ${Number(p.lines_count||0)} รายการ</div>
            <button class="btn blue" data-act="view" data-id="${esc(p.payout_id)}">ตรวจยอดและจ่ายเงิน</button>
          </div>
        </div>
      `;
    }).join('') || `<div class="muted">ตอนนี้ไม่มีงวดที่ต้องจัดการ</div>`;

    if (cards) cards.innerHTML = cardHtml;
    renderPayoutHistory(paid.length?paid:PAYOUTS);

    if (tb) {
      tb.innerHTML = PAYOUTS.map(p=>{
        const range = `${fmtDate(p.period_start)} - ${fmtDate(p.period_end)}`;
        return `
          <tr class="tr">
            <td class="mono">${esc(p.payout_id)}</td>
            <td><span class="pill blue">${esc(payoutLabel(p))}</span></td>
            <td class="muted">${esc(range)}</td>
            <td><b>${fmtBaht(p.total_amount)}</b></td>
            <td>${Number(p.techs_count||0)}</td>
            <td>${Number(p.lines_count||0)}</td>
            <td>${esc(statusThai(p.status||'draft'))}</td>
            <td><button class="btn gray" data-act="view" data-id="${esc(p.payout_id)}">ดู</button></td>
          </tr>
        `;
      }).join('');
    }

    [tb, cards, historyBox].filter(Boolean).forEach(rootEl=>{
      rootEl.querySelectorAll('button[data-act="view"]').forEach(btn=>{
        btn.addEventListener('click', ()=> openPayout(btn.getAttribute('data-id')));
      });
    });
  }


  function initPayoutMonthDropdown(){
    const el=$('payoutFilterMonth');
    if(!el || el.dataset.ready==='1') return;
    const now=new Date();
    const opts=['<option value="">ทุกเดือน</option>'];
    for(let i=0;i<18;i++){
      const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
      const ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label=d.toLocaleDateString('th-TH',{year:'numeric',month:'long'});
      opts.push(`<option value="${ym}">${label}</option>`);
    }
    el.innerHTML=opts.join('');
    el.dataset.ready='1';
  }

  function renderPayoutHistory(rows){
    const box=$('payoutHistoryCards');
    if(!box) return;
    const m=String($('payoutFilterMonth')?.value||'').trim();
    const type=String($('payoutFilterType')?.value||'all');
    const st=String($('payoutFilterStatus')?.value||'all');
    const q=String($('payoutFilterSearch')?.value||'').trim().toLowerCase();
    let arr=(rows||[]).filter(p=>{
      const pid=String(p.payout_id||'');
      if(m && !pid.includes(`payout_${m}_`)) return false;
      if(type!=='all' && String(p.period_type)!==type) return false;
      if(st!=='all' && String(p.status||'draft')!==st) return false;
      if(q && !pid.toLowerCase().includes(q)) return false;
      return true;
    });
    if(!SHOW_ALL_PAYOUT_HISTORY) arr=arr.slice(0,3);
    box.innerHTML = arr.map(p=>{
      const due=payoutDueDate(p);
      return `<div class="payout-history-row">
        <div class="row" style="justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
          <div><b>${esc(payoutLabel(p))} • ${fmtDate(due)}</b><div class="muted" style="margin-top:4px">สถานะ ${esc(statusThai(p.status))} • ${Number(p.techs_count||0)} ช่าง • ${Number(p.lines_count||0)} รายการ</div><details style="margin-top:6px"><summary class="muted" style="cursor:pointer">รายละเอียดระบบ</summary><div class="muted mono">${esc(p.payout_id)}</div></details></div>
          <div style="text-align:right"><b>${fmtBaht(p.total_amount)}</b><div style="margin-top:6px"><button class="btn gray" data-act="view" data-id="${esc(p.payout_id)}">ดูรายละเอียด</button></div></div>
        </div>
      </div>`;
    }).join('') || `<div class="muted">ไม่พบประวัติตามตัวกรอง</div>`;
  }

  async function generatePayout(type){
    const t = String(type||'').trim();
    $('payoutGenStatus').textContent = 'กำลังเตรียมงวด...';
    try{
      const r = await api(`/admin/super/payouts/generate?type=${encodeURIComponent(t)}`, { method:'POST' });
      $('payoutGenStatus').textContent = r.already_generated ? `งวดนี้ถูกเตรียมไว้แล้ว` : `เตรียมงวดสำเร็จ`;
      toast('เตรียมงวดสำเร็จ');
      await loadPayouts();
      await loadAudit();
    }catch(e){
      $('payoutGenStatus').textContent = 'เตรียมงวดไม่สำเร็จ';
      alert(`เตรียมงวดไม่สำเร็จ: ${e.message}`);
    }
  }

  async function openPayout(payout_id){
    const id = String(payout_id||'').trim();
    if (!id) return;
    ACTIVE_PAYOUT = id;
    ACTIVE_TECH = '';

    // Phase 2 header actions
    try{
      const meta = (Array.isArray(PAYOUTS)?PAYOUTS:[]).find(x=>String(x.payout_id)===String(id)) || {};
      const st = String(meta.status||'draft');
      const pill = $('payoutStatusPill');
      if (pill){
        pill.style.display = 'inline-flex';
        pill.className = 'pill ' + (st==='paid' ? 'green' : (st==='locked' ? 'yellow' : 'blue'));
        pill.textContent = statusThai(st);
      }
      const lockBtn = $('btnLockPayout');
      if (lockBtn){
        lockBtn.disabled = (st !== 'draft');
        lockBtn.onclick = async ()=>{
          if (!confirm(`ล็อกงวด ${id} ?
หลังล็อกจะกันความผิดพลาดที่ทำให้ยอดเปลี่ยน`)) return;
          try{
            await api(`/admin/super/payouts/${encodeURIComponent(id)}/lock`, { method:'POST' });
            toast('ล็อกงวดแล้ว');
            await loadPayouts();
            await openPayout(id);
            await loadAudit();
          }catch(e){
            alert(`ล็อกไม่สำเร็จ: ${e.message}`);
          }
        };
      }

    }catch(e){}

    $('payoutDetailHint').textContent = `กำลังโหลดรายละเอียดงวด...`;
    $('payoutTechsBox').innerHTML = `<div class="muted">กำลังโหลด...</div>`;
    $('payoutLinesBox').innerHTML = '';
    try{
      const r = await api(`/admin/super/payouts/${encodeURIComponent(id)}/techs`);
      renderPayoutTechs(r.techs||[]);
      $('payoutDetailHint').textContent = `รายช่างในงวด (${(r.techs||[]).length} คน) • ${statusThai(r.status||'draft')}`;
    }catch(e){
      $('payoutDetailHint').textContent = 'โหลดไม่สำเร็จ';
      $('payoutTechsBox').innerHTML = `<div class="muted">โหลดไม่สำเร็จ</div>`;
    }
  }

  function renderPayoutTechs(techs){
    const box = $('payoutTechsBox');
    if (!box) return;
    const arr = Array.isArray(techs)?techs:[];
    if (!arr.length) { box.innerHTML = `<div class="muted">ยังไม่มีรายช่างในงวดนี้</div>`; return; }

    const totalNet = arr.reduce((a,t)=>a+_safeNum(t.net_amount||t.total_amount||0),0);
    const totalGross = arr.reduce((a,t)=>a+_safeNum(t.gross_amount||0),0);
    const totalDeposit = arr.reduce((a,t)=>a+_safeNum(t.deposit_deduction_amount||0),0);
    const totalPaid = arr.reduce((a,t)=>a+_safeNum(t.paid_amount||0),0);
    const totalRem = arr.reduce((a,t)=>a+_safeNum(t.remaining_amount||0),0);
    const isPayableTech = (t)=> String(t?.paid_status||'unpaid') !== 'paid' && _safeNum(t?.remaining_amount||0) > 0.0001;
    const allUsers = arr.map(t=>String(t.technician_username||'').trim()).filter(Boolean);
    const payableUsers = arr.filter(isPayableTech).map(t=>String(t.technician_username||'').trim()).filter(Boolean);
    const allSet = new Set(payableUsers);
    BULK_SELECTED_TECHS = new Set(Array.from(BULK_SELECTED_TECHS).filter(u=>allSet.has(u)));
    const isAllSelected = payableUsers.length>0 && payableUsers.every(u=>BULK_SELECTED_TECHS.has(u));

    box.innerHTML = `
      <div class="payroll-cards">
        <div class="payroll-card"><div class="label">รายได้ก่อนหัก</div><div class="value">${fmtBaht(totalGross)}</div></div>
        <div class="payroll-card" style="border-color:#f4c542;background:#fffdf3"><div class="label">หักเงินประกัน</div><div class="value" style="color:#0b4bb3">${fmtBaht(totalDeposit)}</div></div>
        <div class="payroll-card"><div class="label">ยอดสุทธิรวม</div><div class="value">${fmtBaht(totalNet)}</div></div>
        <div class="payroll-card"><div class="label">จ่ายแล้ว</div><div class="value">${fmtBaht(totalPaid)}</div></div>
        <div class="payroll-card"><div class="label">คงเหลือ</div><div class="value">${fmtBaht(totalRem)}</div></div>
      </div>

      <div class="bulk-pay-box" style="margin-top:12px">
        <b>จ่ายหลายคน</b>
        <div class="row" style="margin-top:10px;gap:8px;align-items:center">
          <label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="chkSelectAllTech" ${isAllSelected?'checked':''} ${payableUsers.length?'':'disabled'} /><span class="muted">เลือกทั้งหมด</span></label>
        </div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center">
          <input id="bulkSlipUrl" placeholder="ลิงก์สลิป (ใช้ร่วมกันได้ / ว่างได้)" style="flex:1;min-width:220px" />
          <input id="bulkNote" placeholder="โน้ต (ว่างได้)" style="flex:1;min-width:180px" />
          <button class="btn blue" id="btnPaySelectedFull">จ่ายครบที่เลือก</button>
          <button class="btn red" id="btnPayAllFull" ${payableUsers.length?'':'disabled'}>จ่ายครบทั้งหมด</button>
        </div>
      </div>

      <div style="margin-top:10px">
        ${arr.map(t=>{
          const u = esc(t.technician_username);
          const gross = fmtBaht(t.gross_amount||0);
          const adj = fmtBaht(t.adj_total||0);
          const dep = fmtBaht(t.deposit_deduction_amount||0);
          const net = fmtBaht(t.net_amount||t.total_amount||0);
          const paid = fmtBaht(t.paid_amount||0);
          const rem = fmtBaht(t.remaining_amount||0);
          const rawSt = String(t.paid_status||'unpaid');
          const st = esc(paidStatusThai(rawSt));
          const pillClass = (rawSt==='paid') ? 'green' : (rawSt==='partial' ? 'yellow' : 'blue');
          const canPay = isPayableTech(t);
          const checked = BULK_SELECTED_TECHS.has(String(t.technician_username||'')) ? 'checked' : '';
          return `<div class="tech-pay-card">
            <div class="head">
              <div>
                <label class="row" style="gap:8px;align-items:center">
                  <input type="checkbox" data-act="sel" data-u="${u}" ${checked} ${canPay?'':'disabled'} />
                  <b class="mono">${u}</b>
                </label>
                <div class="muted" style="margin-top:6px">สถานะ <span class="pill ${pillClass}">${st}</span></div>
                <div class="muted" style="margin-top:6px">รายได้ก่อนหัก ${gross} • หักเงินประกัน ${dep} • ยอดสุทธิ ${net}</div>
              </div>
              <div style="text-align:right">
                <div class="money">${rem}</div>
                <div class="muted" style="margin-top:4px">จ่ายแล้ว ${paid} • คงเหลือ ${rem}</div>
              </div>
            </div>
            <div class="pay-actions">
              <button class="btn gray" data-act="tech" data-u="${u}">ดูรายละเอียด</button>
              <button class="btn blue" data-act="pay" data-u="${u}" data-net="${_safeNum(t.net_amount)}" ${canPay?'':'disabled'}>${canPay?'บันทึกจ่ายแล้ว':'จ่ายแล้ว'}</button>
              <button class="btn yellow" data-act="adj" data-u="${u}">ปรับยอด</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    const selAll = $('chkSelectAllTech');
    if (selAll){
      selAll.onchange = ()=>{
        if (selAll.checked) payableUsers.forEach(u=>BULK_SELECTED_TECHS.add(u));
        else BULK_SELECTED_TECHS = new Set();
        renderPayoutTechs(arr);
      };
    }
    box.querySelectorAll('input[data-act="sel"]').forEach(chk=>{
      chk.addEventListener('change', ()=>{
        const u = String(chk.getAttribute('data-u')||'').trim();
        if (!u) return;
        if (chk.checked) BULK_SELECTED_TECHS.add(u);
        else BULK_SELECTED_TECHS.delete(u);
      });
    });

    const btnSel = $('btnPaySelectedFull');
    if (btnSel){
      btnSel.onclick = async ()=>{
        if (!ACTIVE_PAYOUT) return;
        const targets = Array.from(BULK_SELECTED_TECHS);
        if (!targets.length) return alert('ยังไม่ได้เลือกช่าง');
        if (!confirm(`จ่ายครบให้ช่างที่เลือก ${targets.length} คน ในงวด ${ACTIVE_PAYOUT} ?\n\nระบบจะตั้งยอดจ่าย = ยอดสุทธิอัตโนมัติ`)) return;
        const slip_url = String(($('bulkSlipUrl')?.value||'')).trim();
        const note = String(($('bulkNote')?.value||'')).trim();
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/pay_bulk`, { method:'POST', body: JSON.stringify({ mode:'selected', technicians: targets, slip_url, note }) });
          toast('บันทึกการจ่ายแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH) await openPayoutTech(ACTIVE_TECH);
          await loadAudit();
        }catch(e){
          alert(cleanPayoutError(e));
        }
      };
    }
    const btnAll = $('btnPayAllFull');
    if (btnAll){
      btnAll.onclick = async ()=>{
        if (!ACTIVE_PAYOUT) return;
        if (!payableUsers.length) return alert('ไม่มีรายการค้างจ่ายในงวดนี้');
        if (!confirm(`จ่ายครบทั้งหมดในงวด ${ACTIVE_PAYOUT} ?\n\nระบบจะบันทึกเฉพาะรายการที่ยังค้างจ่าย ${payableUsers.length} คน`)) return;
        const slip_url = String(($('bulkSlipUrl')?.value||'')).trim();
        const note = String(($('bulkNote')?.value||'')).trim();
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/pay_bulk`, { method:'POST', body: JSON.stringify({ mode:'selected', technicians: payableUsers, slip_url, note }) });
          toast('บันทึกการจ่ายแล้ว');
          BULK_SELECTED_TECHS = new Set(payableUsers);
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH) await openPayoutTech(ACTIVE_TECH);
          await loadAudit();
        }catch(e){ alert(cleanPayoutError(e)); }
      };
    }

    box.querySelectorAll('button[data-act="tech"]').forEach(btn=> btn.addEventListener('click', ()=> openPayoutTech(btn.getAttribute('data-u'))));
    box.querySelectorAll('button[data-act="pay"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const u = String(btn.getAttribute('data-u')||'').trim();
        if (!ACTIVE_PAYOUT || !u) return;
        const amtStr = prompt(`ใส่ยอด "จ่ายแล้ว" (บาท) สำหรับ ${u}\n(ใส่ยอดรวมที่จ่ายแล้วทั้งหมด ไม่ใช่เพิ่มทีละงวด)`, '');
        if (amtStr==null) return;
        const paid_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(paid_amount) || paid_amount < 0) { alert('ยอดไม่ถูกต้อง'); return; }
        const slip_url = prompt('แนบลิงก์สลิป (ว่างได้)', '') || '';
        const note = prompt('โน้ต (ว่างได้)', '') || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/pay`, { method:'POST', body: JSON.stringify({ technician_username: u, paid_amount, slip_url, note }) });
          toast('บันทึกการจ่ายแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH === u) await openPayoutTech(u);
          await loadAudit();
        }catch(e){
          alert(cleanPayoutError(e));
        }
      });
    });
    box.querySelectorAll('button[data-act="adj"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const u = String(btn.getAttribute('data-u')||'').trim();
        if (!ACTIVE_PAYOUT || !u) return;
        const amtStr = prompt(`ปรับยอดสำหรับ ${u} (ใส่ + หรือ - ได้)\nตัวอย่าง: -200 หรือ 150`, '');
        if (amtStr==null) return;
        const adj_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(adj_amount) || adj_amount === 0) { alert('จำนวนไม่ถูกต้อง'); return; }
        const reason = prompt('เหตุผล (ต้องกรอก)', '');
        if (!reason || !String(reason).trim()) { alert('ต้องกรอกเหตุผล'); return; }
        const job_id = prompt('ผูกกับงาน #job_id (ว่างได้)', '') || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/adjust`, { method:'POST', body: JSON.stringify({ technician_username: u, adj_amount, reason, job_id }) });
          toast('บันทึกปรับยอดแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH === u) await openPayoutTech(u);
          await loadAudit();
        }catch(e){ alert(`ปรับยอดไม่สำเร็จ: ${e.message}`); }
      });
    });
  }

  async function openPayoutTech(username){
    const u = String(username||'').trim();
    if (!ACTIVE_PAYOUT || !u) return;
    ACTIVE_TECH = u;
    $('payoutLinesBox').innerHTML = `<div class="muted">กำลังโหลดรายการงานของ ${esc(u)}...</div>`;
    try{
      const r = await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/tech/${encodeURIComponent(u)}`);
      renderPayoutLines(r, u);
    }catch(e){
      $('payoutLinesBox').innerHTML = `<div class="muted">โหลดไม่สำเร็จ</div>`;
    }
  }

  function renderPayoutLines(payload, username){
    const box = $('payoutLinesBox');
    if (!box) return;

    const arr = Array.isArray(payload?.lines)?payload.lines:[];
    const gross = Number(payload?.gross_amount||0);
    const adjTotal = Number(payload?.adj_total||0);
    const dep = Number(payload?.deposit_deduction_amount||0);
    const net = Number(payload?.net_amount||payload?.total_amount||0);
    const paid = Number(payload?.paid_amount||0);
    const rem = Number(payload?.remaining_amount||0);
    const paidStatus = String(payload?.paid_status||payload?.payment?.paid_status||'unpaid');
    const adjustments = Array.isArray(payload?.adjustments)?payload.adjustments:[];
    const canPayDetail = paidStatus !== 'paid' && rem > 0.0001;

    const head = `
      <div class="row" style="justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px">
        <div>
          <b>รายการงานของ ${esc(username)}</b>
          <div class="muted" style="margin-top:4px">
            ยอดก่อนปรับ: <b>${fmtBaht(gross)}</b> • ปรับยอด: <b>${fmtBaht(adjTotal)}</b> • หักเงินประกัน: <b style="color:#0b4bb3">${fmtBaht(dep)}</b> • ยอดสุทธิ: <b>${fmtBaht(net)}</b>
          </div>
          <div class="muted" style="margin-top:4px">
            เงินประกันเป้าหมาย: <b>${fmtBaht(payload?.deposit_target_amount||0)}</b> • สะสมแล้ว: <b>${fmtBaht(payload?.deposit_collected_total||0)}</b> • คงเหลือ: <b>${fmtBaht(payload?.deposit_remaining_amount||0)}</b>
          </div>
          <div class="muted" style="margin-top:4px">
            จ่ายแล้ว: <b>${fmtBaht(paid)}</b> • คงเหลือ: <b>${fmtBaht(rem)}</b> • สถานะ: <b>${esc(paidStatusThai(paidStatus))}</b>
          </div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn blue" id="btnPayThisTech" ${canPayDetail?'':'disabled'}>${canPayDetail?'จ่าย/แก้ยอดจ่าย':'จ่ายแล้ว'}</button>
          <button class="btn yellow" id="btnAdjThisTech">ปรับยอด</button>
          <button class="btn gray" id="btnOpenSlipAdmin">เปิดสลิป (ช่าง)</button>
        </div>
      </div>
    `;

    const adjBox = `
      <div class="card" style="margin-top:10px">
        <b>รายการหัก/บวก (Audit)</b>
        <div class="muted" style="margin-top:4px">เพิ่ม/ลดยอดแบบมีเหตุผล • ลบได้เฉพาะ Super Admin</div>
        <div style="overflow:auto;margin-top:8px">
          <table>
            <thead><tr class="muted"><td>เวลา</td><td>ผูกงาน</td><td>เหตุผล</td><td>จำนวน</td><td>ลบ</td></tr></thead>
            <tbody>
              ${adjustments.length ? adjustments.map(a=>`
                <tr class="tr">
                  <td class="muted">${fmtDate(a.created_at)}</td>
                  <td class="mono">${a.job_id?('#'+esc(a.job_id)):'-'}</td>
                  <td>${esc(a.reason||'')}</td>
                  <td><b>${fmtBaht(a.adj_amount||0)}</b></td>
                  <td><button class="btn red" data-act="delAdj" data-id="${Number(a.adj_id||0)}">ลบ</button></td>
                </tr>
              `).join('') : `<tr class="tr"><td colspan="5" class="muted">-</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const rows = arr.map(ln=>{
      const d = ln.detail_json || {};
      const jt = esc(d.job_type||'-');
      const ac = esc(d.ac_type||'-');
      const wash = esc(d.wash_variant||'-');
      const mc = Number(ln.machine_count_for_tech||0);
      const pct = (ln.percent_final==null||ln.percent_final===undefined) ? 'เรทสัญญา' : (Number(ln.percent_final)||0).toFixed(2)+'%';
      const fin = fmtDate(ln.finished_at);
      const earn = fmtBaht(ln.earn_amount);
      const mode = esc(d.mode||'-');
      return `
        <details class="tr" style="margin-bottom:8px">
          <summary style="cursor:pointer">
            <div class="row" style="justify-content:space-between;gap:10px">
              <div>
                <b>งาน #${esc(ln.job_id)}</b> <span class="muted">(${esc(fin)})</span>
                <div class="muted" style="margin-top:4px">${jt} • ${ac}${wash && wash!=='-' ? ` • ${wash}`:''} • โหมด: ${mode}</div>
              </div>
              <div style="text-align:right">
                <b>${earn}</b>
                <div class="muted" style="margin-top:4px">เครื่อง: ${mc} • วิธีคิด: ${pct}</div>
              </div>
            </div>
          </summary>
          <div style="margin-top:8px">
            <div class="muted"><b>สูตร</b>: ${esc(d.how_percent_selected||'-')}</div>
            <div class="muted"><b>นับเครื่อง</b>: ${esc(d.how_machine_count_for_tech||'-')}</div>
            <div class="muted" style="margin-top:6px"><b>รายการ</b>:</div>
            ${(Array.isArray(d.items)?d.items:[]).slice(0,8).map(it=>{
              const a = it.assigned_technician_username ? ` • assign: ${esc(it.assigned_technician_username)}` : '';
              return `<div class="muted">- ${esc(it.item_name)} × ${Number(it.qty||0)}${a}</div>`;
            }).join('') || '<div class="muted">-</div>'}
          </div>
        </details>
      `;
    }).join('');

    box.innerHTML = head + adjBox + `<div style="margin-top:10px">${rows || '<div class="muted">ไม่มีรายการ</div>'}</div>`;

    const slipBtn = document.getElementById('btnOpenSlipAdmin');
    if (slipBtn){
      slipBtn.onclick = ()=>{
        if (!ACTIVE_PAYOUT || !ACTIVE_TECH) return;
        window.open(`/tech/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/slip`, '_blank');
      };
    }

    const payBtn = document.getElementById('btnPayThisTech');
    if (payBtn){
      payBtn.onclick = async ()=>{
        const u = ACTIVE_TECH;
        const amtStr = prompt(`ใส่ยอด "จ่ายแล้ว" (บาท) สำหรับ ${u}
(ใส่ยอดรวมที่จ่ายแล้วทั้งหมด)`, String(Math.round(paid||0)));
        if (amtStr==null) return;
        const paid_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(paid_amount) || paid_amount < 0) { alert('ยอดไม่ถูกต้อง'); return; }
        const slip_url = prompt('แนบลิงก์สลิป (ว่างได้)', String(payload?.payment?.slip_url||'')) || '';
        const note = prompt('โน้ต (ว่างได้)', String(payload?.payment?.note||'')) || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/pay`, { method:'POST', body: JSON.stringify({ technician_username:u, paid_amount, slip_url, note }) });
          toast('บันทึกการจ่ายแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          await openPayoutTech(u);
          await loadAudit();
        }catch(e){
          alert(cleanPayoutError(e));
        }
      };
    }

    const adjBtn = document.getElementById('btnAdjThisTech');
    if (adjBtn){
      adjBtn.onclick = async ()=>{
        const u = ACTIVE_TECH;
        const amtStr = prompt(`ปรับยอดสำหรับ ${u} (ใส่ + หรือ - ได้)`, '');
        if (amtStr==null) return;
        const adj_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(adj_amount) || adj_amount === 0) { alert('จำนวนไม่ถูกต้อง'); return; }
        const reason = prompt('เหตุผล (ต้องกรอก)', '');
        if (!reason || !String(reason).trim()) { alert('ต้องกรอกเหตุผล'); return; }
        const job_id = prompt('ผูกกับงาน #job_id (ว่างได้)', '') || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/adjust`, { method:'POST', body: JSON.stringify({ technician_username:u, adj_amount, reason, job_id }) });
          toast('บันทึกปรับยอดแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          await openPayoutTech(u);
          await loadAudit();
        }catch(e){
          alert(`ปรับยอดไม่สำเร็จ: ${e.message}`);
        }
      };
    }

    box.querySelectorAll('button[data-act="delAdj"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const adj_id = Number(btn.getAttribute('data-id')||0);
        if (!ACTIVE_PAYOUT || !ACTIVE_TECH || !Number.isFinite(adj_id) || adj_id<=0) return;
        if (!confirm(`ลบ adjustment #${adj_id}?`)) return;
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/adjust`, { method:'POST', body: JSON.stringify({ technician_username: ACTIVE_TECH, action:'delete', adj_id }) });
          toast('ลบแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          await openPayoutTech(ACTIVE_TECH);
          await loadAudit();
        }catch(e){
          alert(`ลบไม่สำเร็จ: ${e.message}`);
        }
      });
    });
  }


  async function legacySettleOldPayouts(){
    const cutoffEl = $('legacySettleCutoff');
    const techEl = $('legacySettleTech');
    const noteEl = $('legacySettleNote');
    const outEl = $('legacySettleResult');
    const cutoff_date = String(cutoffEl?.value || '').trim();
    const technician_username = String(techEl?.value || '').trim();
    const note = String(noteEl?.value || '').trim();

    if (!cutoff_date) return alert('กรุณาเลือกวันที่สิ้นสุดงวดเก่าที่จ่ายไปแล้ว');
    const who = technician_username || 'ทุกช่าง';
    if (!confirm(`ยืนยันเคลียร์ยอดค้างเก่าถึงวันที่ ${cutoff_date} สำหรับ ${who}?\n\nใช้เฉพาะงวดที่จ่ายเงินจริงไปแล้วนอกระบบเท่านั้น\nระบบจะบันทึกเป็นจ่ายแล้วในแอพ ไม่ลบข้อมูลเดิม`)) return;

    if (outEl) outEl.textContent = 'กำลังบันทึกยอดเก่าเป็นจ่ายแล้ว...';
    try {
      const r = await api('/admin/super/payouts/legacy_settle', {
        method: 'POST',
        body: JSON.stringify({ cutoff_date, technician_username, note })
      });
      const updated = Number(r.updated_payments||0);
      const touched = Number(r.touched_periods||0);
      const createdPeriods = Number(r.created_periods||0);
      const createdLines = Number(r.created_lines||0);
      const checkedJobs = Number(r.checked_jobs||0);
      const candidateLines = Number(r.candidate_lines||0);
      const msg = updated > 0
        ? `สำเร็จ: บันทึกจ่ายแล้ว ${updated} รายการ • แตะ ${touched} งวด • สร้างงวดที่ขาด ${createdPeriods} งวด • สร้างรายการรายได้ ${createdLines} รายการ`
        : `ไม่พบยอดค้างที่ต้องเคลียร์ • ตรวจงาน ${checkedJobs} งาน • พบรายการตรงเงื่อนไข ${candidateLines} รายการ • สร้างงวด ${createdPeriods} งวด • สร้างรายการ ${createdLines} รายการ`;
      if (outEl) outEl.textContent = msg;
      alert(msg);
      toast(updated > 0 ? 'เคลียร์ยอดเก่าแล้ว' : 'ไม่พบยอดค้างที่ต้องเคลียร์');
      await loadPayouts();
      if (ACTIVE_PAYOUT) await openPayout(ACTIVE_PAYOUT);
      await loadAudit();
    } catch (e) {
      const msg = cleanPayoutError(e) || 'เคลียร์ยอดเก่าไม่สำเร็จ';
      if (outEl) outEl.textContent = msg;
      alert(msg);
    }
  }

  window.cwfLegacySettleOldPayouts = legacySettleOldPayouts;

  // ===== Technician income rate sets =====
  const RATE_LABELS = {
    ac: { wall:'แอร์ผนัง', fourway:'แอร์สี่ทิศทาง', hanging:'แอร์แขวน/ตั้งพื้น', ceiling:'แอร์เปลือย/ใต้ฝ้า' },
    wash: { normal:'ล้างปกติ', premium:'ล้างพรีเมียม', coil:'ล้างแบบแขวนคอยล์', overhaul:'ตัดล้างใหญ่', none:'-' },
    tier: { small:'ไม่เกิน 12,000 BTU', large:'18,000 BTU ขึ้นไป', all:'ทุก BTU' }
  };
  let TECH_RATE_STATE = { active:null, drafts:[], editing:null };
  const rateAmount = (items, ac, wash, tier, from) => {
    const r = (items || []).find(x => x.ac_type_key===ac && x.wash_type_key===wash && x.btu_tier===tier && Number(x.step_from)===from);
    return Number(r?.amount || 0);
  };
  const setRateAmount = (items, ac, wash, tier, from, amount) => {
    const r = (items || []).find(x => x.ac_type_key===ac && x.wash_type_key===wash && x.btu_tier===tier && Number(x.step_from)===from);
    if (r) r.amount = Number(amount || 0);
  };
  function renderTechRateTables() {
    const box = $('techRateTables');
    if (!box) return;
    const full = TECH_RATE_STATE.editing || TECH_RATE_STATE.active;
    const editable = !!(full?.rate_set && String(full.rate_set.status) === 'draft');
    const items = full?.items || [];
    if (!full) {
      box.innerHTML = '<div class="muted">ยังไม่มี rate set ในฐานข้อมูล ระบบ backend จะใช้ fallback v4 ชั่วคราว</div>';
      return;
    }
    if ($('techRateEditorTitle')) $('techRateEditorTitle').textContent = editable ? `Draft: ${full.rate_set.version}` : `Active: ${full.rate_set.version}`;
    if ($('btnSaveTechRateDraft')) $('btnSaveTechRateDraft').disabled = !editable;
    if ($('btnActivateTechRateDraft')) $('btnActivateTechRateDraft').disabled = !editable;
    const wallRows = [
      ['normal','small'],['normal','large'],['premium','small'],['premium','large'],['coil','small'],['coil','large'],['overhaul','small'],['overhaul','large']
    ].map(([wash,tier]) => `
      <tr data-ac="wall" data-wash="${wash}" data-tier="${tier}">
        <td>${esc(RATE_LABELS.wash[wash])}</td><td>${esc(RATE_LABELS.tier[tier])}</td>
        <td><input class="rate-input" data-from="1" type="number" min="0" step="1" ${editable?'':'disabled'} value="${rateAmount(items,'wall',wash,tier,1)}"></td>
        <td><input class="rate-input" data-from="2" type="number" min="0" step="1" ${editable?'':'disabled'} value="${rateAmount(items,'wall',wash,tier,2)}"></td>
        <td><input class="rate-input" data-from="4" type="number" min="0" step="1" ${editable?'':'disabled'} value="${rateAmount(items,'wall',wash,tier,4)}"></td>
      </tr>`).join('');
    const fixedRows = ['fourway','hanging','ceiling'].map(ac => `
      <tr data-ac="${ac}" data-wash="none" data-tier="all">
        <td>${esc(RATE_LABELS.ac[ac])}</td><td>${esc(RATE_LABELS.tier.all)}</td>
        <td><input class="rate-input" data-from="1" type="number" min="0" step="1" ${editable?'':'disabled'} value="${rateAmount(items,ac,'none','all',1)}"></td>
      </tr>`).join('');
    box.innerHTML = `
      <h3 style="margin:0 0 8px;color:#061b49">แอร์ผนัง</h3>
      <div class="rate-table-wrap"><table><thead><tr><th>ประเภทการล้าง</th><th>BTU tier</th><th>จำนวนรวม 1 เครื่อง</th><th>จำนวนรวม 2-3 เครื่อง</th><th>จำนวนรวม 4 เครื่องขึ้นไป</th></tr></thead><tbody>${wallRows}</tbody></table></div>
      <h3 style="margin:14px 0 8px;color:#061b49">แอร์ประเภทอื่น — เรทคงที่ต่อเครื่อง</h3>
      <div class="rate-table-wrap"><table><thead><tr><th>AC type</th><th>BTU</th><th>เรทต่อเครื่อง</th></tr></thead><tbody>${fixedRows}</tbody></table></div>`;
    box.querySelectorAll('.rate-input').forEach(input => {
      input.addEventListener('input', () => {
        const tr = input.closest('tr');
        setRateAmount(items, tr.dataset.ac, tr.dataset.wash, tr.dataset.tier, Number(input.dataset.from), Number(input.value || 0));
      });
    });
  }
  async function loadTechRates() {
    if (!$('techRateTables')) return;
    try {
      const r = await api('/api/super/technician-income-rates');
      TECH_RATE_STATE.active = r.active || null;
      TECH_RATE_STATE.drafts = r.drafts || [];
      TECH_RATE_STATE.editing = TECH_RATE_STATE.drafts[0] || TECH_RATE_STATE.active;
      if ($('techRateStatus')) $('techRateStatus').textContent = r.active?.rate_set ? `Active ${r.active.rate_set.version} • ${r.active.items.length} รายการ • ใช้เรทเดียวตามจำนวนรวม` : (r.warning || 'ใช้ fallback single-rate v4');
      renderTechRateTables();
    } catch(e) {
      if ($('techRateStatus')) $('techRateStatus').textContent = `โหลดเรทไม่สำเร็จ: ${e.message}`;
    }
  }
  async function loadTechRateAudit() {
    if (!$('techRateAudit')) return;
    try {
      const r = await api('/api/super/technician-income-rates/audit');
      const rows = r.rows || [];
      $('techRateAudit').innerHTML = rows.length ? rows.map(x => `<div class="rate-audit-row"><b>${esc(x.action)}</b> <span class="muted">${esc(x.version || '')}</span><div class="muted">${new Date(x.created_at).toLocaleString('th-TH')} • ${esc(x.actor_username || '-')} • ${esc(x.field_name || '')}: ${esc(x.old_value || '-')} → ${esc(x.new_value || '-')}</div></div>`).join('') : '<div class="muted">ยังไม่มี audit</div>';
    } catch(e) {
      $('techRateAudit').innerHTML = `<div class="muted">โหลด audit ไม่สำเร็จ: ${esc(e.message)}</div>`;
    }
  }
  async function createTechRateDraft() {
    const version = prompt('ตั้งชื่อ version สำหรับ draft', `partner_single_rate_2026_05_draft_${Date.now()}`);
    if (!version) return;
    await api('/api/super/technician-income-rates/draft', { method:'POST', body: JSON.stringify({ version }) });
    toast('สร้าง draft แล้ว');
    await loadTechRates();
    await loadTechRateAudit();
  }
  async function saveTechRateDraft() {
    const full = TECH_RATE_STATE.editing;
    if (!full?.rate_set || String(full.rate_set.status) !== 'draft') return;
    await api(`/api/super/technician-income-rates/${encodeURIComponent(full.rate_set.id)}/items`, { method:'PUT', body: JSON.stringify({ items: full.items }) });
    toast('บันทึก draft แล้ว');
    await loadTechRates();
    await loadTechRateAudit();
  }
  async function activateTechRateDraft() {
    const full = TECH_RATE_STATE.editing;
    if (!full?.rate_set || String(full.rate_set.status) !== 'draft') return;
    if (!confirm('ยืนยัน activate draft นี้? งานที่ล็อก/จ่ายแล้วจะไม่ถูกแก้ย้อนหลัง')) return;
    await api(`/api/super/technician-income-rates/${encodeURIComponent(full.rate_set.id)}/activate`, { method:'POST', body: JSON.stringify({ confirm:true }) });
    toast('Activate เรทใหม่แล้ว');
    await loadTechRates();
    await loadTechRateAudit();
  }



  // ===== Customer confirmation message template =====
  const CUSTOMER_MSG_DEFAULTS_LOCAL = {
    th: `ยืนยันนัดหมายบริการแอร์

Coldwindflow Air Services
แอดมินขออนุญาตยืนยันรายละเอียดนัดหมายดังนี้ค่ะ

🔎 เลขงาน: {{booking_code}}
🔗 ติดตามสถานะงาน: {{tracking_url}}
👤 ชื่อลูกค้า: {{customer_name}}
📞 เบอร์โทร: {{customer_phone}}
📅 วันและเวลานัด: {{appointment_th}}
🧾 ประเภทงาน: {{job_type}}
🏠 สถานที่บริการ: {{address_text}}

🧾 รายการบริการ:
{{items_text}}

💲 ยอดชำระสุทธิ: {{job_price_th}} บาท

หมายเหตุ: ก่อนช่างเข้าหน้างาน จะมีช่างติดต่อโทรยืนยันนัดหมายอีกครั้ง รบกวนลูกค้ารับสายตามเบอร์ที่แจ้งไว้ เพื่อให้ทีมงานเข้าบริการได้ตรงเวลาและไม่ตกหล่นนะคะ

ขอบคุณค่ะ
Coldwindflow Air Services
LINE OA: @cwfair
โทร: 098-877-7321`,
    en: `Service Appointment Confirmation

Coldwindflow Air Services
Our admin team would like to confirm your appointment details:

🔎 Job No.: {{booking_code}}
🔗 Track: {{tracking_url}}
📍 Customer: {{customer_name}}
📞 Phone: {{customer_phone}}
📅 Appointment: {{appointment_en}}
🧾 Job Type: {{job_type_en}}
🏠 Address: {{address_text}}

🧾 Items:
{{items_text_en}}

💲 Net Total: {{job_price_en}} THB

Note: Before arriving at the job site, our technician will call to reconfirm the appointment. Please kindly answer the call so our team can provide service on time.

Thank you.
Coldwindflow Air Services
LINE OA: @cwfair
Call: 098-877-7321`
  };
  const CUSTOMER_MSG_REQUIRED = {
    th: ['booking_code','tracking_url','customer_name','customer_phone','appointment_th','job_type','address_text','items_text','job_price_th'],
    en: ['booking_code','tracking_url','customer_name','customer_phone','appointment_en','job_type_en','address_text','items_text_en','job_price_en']
  };
  const CUSTOMER_MSG_STATE = { templates:null, placeholders:['booking_code','tracking_url','customer_name','customer_phone','appointment_th','appointment_en','job_type','job_type_en','address_text','items_text','items_text_en','job_price_th','job_price_en'], defaults:CUSTOMER_MSG_DEFAULTS_LOCAL };
  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    textarea.focus();
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
  }
  function requiredMissingCustomerMsg(text, lang=currentCustomerMsgLang()) {
    const required = CUSTOMER_MSG_REQUIRED[lang] || CUSTOMER_MSG_REQUIRED.th;
    return required.filter(k => !String(text || '').includes(`{{${k}}}`));
  }
  function updateCustomerMsgStatus() {
    const el = $('customerMsgStatus');
    const ta = $('customerMsgTemplate');
    if (!el || !ta) return;
    const missing = requiredMissingCustomerMsg(ta.value);
    if (missing.length) {
      el.textContent = `⚠️ ขาดตัวแปรจำเป็น: ${missing.map(k => `{{${k}}}`).join(', ')} — ระบบยังไม่ให้บันทึก เพื่อกันข้อมูลเลขงาน/วันนัด/รายการ/ยอดเงินหาย`;
      el.className = 'template-status warn';
    } else {
      el.textContent = '✅ พร้อมใช้งาน: ตัวแปรจำเป็นครบ แอดมินแก้เฉพาะคำพูดรอบ ๆ ได้อย่างปลอดภัย';
      el.className = 'template-status ok';
    }
  }
  function renderCustomerMsgPlaceholders() {
    const box = $('customerMsgPlaceholders');
    if (!box) return;
    const list = CUSTOMER_MSG_STATE.placeholders || [];
    const required = new Set(CUSTOMER_MSG_REQUIRED[currentCustomerMsgLang()] || []);
    box.innerHTML = list.map(k => `<button type="button" class="placeholder-chip ${required.has(k) ? 'required' : ''}" data-k="${esc(k)}" title="กดเพื่อแทรกตัวแปร">{{${esc(k)}}}</button>`).join('');
    box.querySelectorAll('.placeholder-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        insertAtCursor($('customerMsgTemplate'), `{{${btn.dataset.k}}}`);
        updateCustomerMsgStatus();
      });
    });
  }
  function currentCustomerMsgLang() {
    return String($('customerMsgLang')?.value || 'th').toLowerCase() === 'en' ? 'en' : 'th';
  }
  function setCustomerMsgEditorFromState() {
    const lang = currentCustomerMsgLang();
    const row = CUSTOMER_MSG_STATE.templates?.[lang];
    const text = String(row?.template_text || CUSTOMER_MSG_STATE.defaults?.[lang] || CUSTOMER_MSG_DEFAULTS_LOCAL[lang] || '').trim();
    const ta = $('customerMsgTemplate');
    if (ta) {
      ta.value = text;
      ta.placeholder = 'แก้ไขข้อความยืนยันนัดหมายลูกค้าได้ที่นี่';
      ta.removeAttribute('disabled');
    }
    if ($('customerMsgPreview')) $('customerMsgPreview').textContent = 'กด “ดูตัวอย่าง” เพื่อดูผลลัพธ์';
    if ($('customerMsgLoadState')) $('customerMsgLoadState').textContent = row?.updated_at ? `โหลดข้อความปัจจุบันแล้ว • แก้ไขล่าสุด: ${row.updated_at}` : 'แสดงค่าเริ่มต้นพร้อมใช้งาน หากเคยบันทึกไว้ระบบจะโหลดมาแทนให้อัตโนมัติ';
    renderCustomerMsgPlaceholders();
    updateCustomerMsgStatus();
  }
  async function loadCustomerMsgTemplate() {
    if (!$('customerMsgTemplate')) return;
    // แสดงค่าเริ่มต้นทันที เพื่อไม่ให้ Super Admin เห็นช่องว่าง/ค้างโหลด
    if (!String($('customerMsgTemplate').value || '').trim()) setCustomerMsgEditorFromState();
    if ($('customerMsgLoadState')) $('customerMsgLoadState').textContent = 'กำลังโหลดข้อความปัจจุบันจากระบบ...';
    try {
      const r = await api('/admin/super/customer_confirmation_template');
      CUSTOMER_MSG_STATE.templates = r.templates || {};
      CUSTOMER_MSG_STATE.placeholders = r.placeholders || CUSTOMER_MSG_STATE.placeholders || [];
      CUSTOMER_MSG_STATE.defaults = Object.assign({}, CUSTOMER_MSG_DEFAULTS_LOCAL, r.defaults || {});
      setCustomerMsgEditorFromState();
      toast('โหลดข้อความยืนยันนัดแล้ว');
    } catch(e) {
      CUSTOMER_MSG_STATE.defaults = CUSTOMER_MSG_DEFAULTS_LOCAL;
      setCustomerMsgEditorFromState();
      if ($('customerMsgLoadState')) $('customerMsgLoadState').textContent = `⚠️ โหลดจากฐานข้อมูลไม่สำเร็จ จึงแสดงค่าเริ่มต้นให้แก้ไขได้ก่อน: ${e.message}`;
      console.warn('[customer message template] fallback defaults:', e);
    }
  }
  async function previewCustomerMsgTemplate() {
    if (!$('customerMsgTemplate')) return;
    try {
      const r = await api('/admin/super/customer_confirmation_template/preview', {
        method:'POST',
        body: JSON.stringify({ lang: currentCustomerMsgLang(), template_text: $('customerMsgTemplate').value })
      });
      $('customerMsgPreview').textContent = r.text || '';
    } catch(e) {
      alert(`preview ไม่สำเร็จ: ${e.message}`);
    }
  }
  async function saveCustomerMsgTemplate() {
    const text = String($('customerMsgTemplate')?.value || '').trim();
    if (!text) return alert('กรุณาใส่ข้อความก่อนบันทึก');
    const missing = requiredMissingCustomerMsg(text);
    if (missing.length) {
      updateCustomerMsgStatus();
      return alert(`ยังบันทึกไม่ได้ เพราะขาดตัวแปรจำเป็น:\n${missing.map(k => `{{${k}}}`).join('\n')}\n\nให้กดป้ายตัวแปรด้านล่างเพื่อแทรกกลับเข้าไปก่อน`);
    }
    if (!confirm('บันทึกข้อความยืนยันนัดหมายลูกค้า? ข้อความนี้จะใช้หลังแอดมินเพิ่มงานทันที')) return;
    try {
      await api('/admin/super/customer_confirmation_template', {
        method:'POST',
        body: JSON.stringify({ lang: currentCustomerMsgLang(), template_text: text })
      });
      toast('บันทึกข้อความยืนยันนัดแล้ว');
      await loadCustomerMsgTemplate();
      await previewCustomerMsgTemplate();
      await loadAudit();
    } catch(e) {
      alert(`บันทึกไม่สำเร็จ: ${e.message}`);
    }
  }
  async function resetCustomerMsgTemplate() {
    const lang = currentCustomerMsgLang();
    if (!confirm(`คืนค่าข้อความ${lang === 'en' ? 'ภาษาอังกฤษ' : 'ภาษาไทย'}เป็นค่าเริ่มต้น?`)) return;
    try {
      await api('/admin/super/customer_confirmation_template', {
        method:'POST',
        body: JSON.stringify({ lang, reset:true })
      });
      toast('คืนค่าเริ่มต้นแล้ว');
      await loadCustomerMsgTemplate();
      await previewCustomerMsgTemplate();
      await loadAudit();
    } catch(e) {
      alert(`คืนค่าไม่สำเร็จ: ${e.message}`);
    }
  }

  initPayoutMonthDropdown();
  if ($('btnGenCurrentPayout')) $('btnGenCurrentPayout').addEventListener('click', ()=> generatePayout(currentPayoutType()));
  if ($('btnGenP10')) $('btnGenP10').addEventListener('click', ()=> generatePayout('10'));
  if ($('btnGenP25')) $('btnGenP25').addEventListener('click', ()=> generatePayout('25'));
  if ($('btnReloadPayouts')) $('btnReloadPayouts').addEventListener('click', loadPayouts);
  if ($('btnLegacySettle')) $('btnLegacySettle').addEventListener('click', legacySettleOldPayouts);
  if ($('btnApplyPayoutHistoryFilter')) $('btnApplyPayoutHistoryFilter').addEventListener('click', ()=> renderPayouts());
  if ($('payoutFilterMonth')) $('payoutFilterMonth').addEventListener('change', ()=> renderPayouts());
  if ($('btnShowMorePayoutHistory')) $('btnShowMorePayoutHistory').addEventListener('click', ()=> { SHOW_ALL_PAYOUT_HISTORY = true; renderPayouts(); });
  if ($('btnReloadTechRates')) $('btnReloadTechRates').addEventListener('click', loadTechRates);
  if ($('btnCreateTechRateDraft')) $('btnCreateTechRateDraft').addEventListener('click', createTechRateDraft);
  if ($('btnSaveTechRateDraft')) $('btnSaveTechRateDraft').addEventListener('click', saveTechRateDraft);
  if ($('btnActivateTechRateDraft')) $('btnActivateTechRateDraft').addEventListener('click', activateTechRateDraft);
  if ($('btnReloadTechRateAudit')) $('btnReloadTechRateAudit').addEventListener('click', loadTechRateAudit);
  if ($('customerMsgLang')) $('customerMsgLang').addEventListener('change', () => { setCustomerMsgEditorFromState(); });
  if ($('customerMsgTemplate')) $('customerMsgTemplate').addEventListener('input', updateCustomerMsgStatus);
  if ($('btnLoadCustomerMsg')) $('btnLoadCustomerMsg').addEventListener('click', loadCustomerMsgTemplate);
  if ($('btnPreviewCustomerMsg')) $('btnPreviewCustomerMsg').addEventListener('click', previewCustomerMsgTemplate);
  if ($('btnSaveCustomerMsg')) $('btnSaveCustomerMsg').addEventListener('click', saveCustomerMsgTemplate);
  if ($('btnResetCustomerMsg')) $('btnResetCustomerMsg').addEventListener('click', resetCustomerMsgTemplate);

  // ===== Init =====
  await loadAdmins();
  await loadUsersForImpersonate();
  await refreshImpState();
  await loadDurations();
  await loadAudit();
  await loadTechRates();
  await loadTechRateAudit();
  await loadCustomerMsgTemplate();
  await loadPayouts();
})();
