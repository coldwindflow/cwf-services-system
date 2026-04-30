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

  function fmtBaht(n){
    const x = Number(n||0);
    if (!Number.isFinite(x)) return '0 ฿';
    try{ return x.toLocaleString('th-TH',{ maximumFractionDigits:0 }) + ' ฿'; }catch{ return String(Math.round(x))+' ฿'; }
  }
  function _safeNum(n){ const x=Number(n||0); return Number.isFinite(x)?x:0; }

  function fmtDate(iso){
    try{ const d=new Date(iso); if (Number.isNaN(d.getTime())) return '-'; return d.toLocaleDateString('th-TH',{ year:'numeric', month:'short', day:'numeric' }); }catch{ return '-'; }
  }

  async function loadPayouts(){
    if (!$('payoutsTbody')) return;
    try{
      const r = await api('/admin/super/payouts');
      PAYOUTS = r.payouts || [];
      renderPayouts();
    }catch(e){
      $('payoutsTbody').innerHTML = `<tr class="tr"><td colspan="8" class="muted">โหลดไม่สำเร็จ</td></tr>`;
    }
  }

  function renderPayouts(){
    const tb = $('payoutsTbody');
    const cards = $('payoutsCards');
    if (!tb && !cards) return;
    if (!PAYOUTS.length) {
      if (tb) tb.innerHTML = `<tr class="tr"><td colspan="8" class="muted">ยังไม่มีงวด</td></tr>`;
      if (cards) cards.innerHTML = `<div class="muted">ยังไม่มีงวด</div>`;
      return;
    }

    const cardHtml = PAYOUTS.map(p=>{
      const range = `${fmtDate(p.period_start)} - ${fmtDate(p.period_end)}`;
      const st = String(p.status||'draft');
      const isActive = String(ACTIVE_PAYOUT||'') === String(p.payout_id||'');
      const statusClass = st === 'paid' ? 'blue' : (st === 'locked' ? 'yellow' : 'blue');
      return `
        <div class="payout-card-item ${isActive?'active':''}">
          <div class="topline">
            <div>
              <div class="row" style="gap:8px;align-items:center">
                <span class="pill ${statusClass}">${esc(st)}</span>
                <span class="pill" style="background:#eef6ff;color:#0b4bb3">${esc(p.period_type)}</span>
              </div>
              <div class="muted" style="margin-top:8px">${esc(range)}</div>
              <div class="muted mono" style="margin-top:4px">ID ${esc(p.payout_id)}</div>
            </div>
            <div style="text-align:right">
              <div class="amount">${fmtBaht(p.total_amount)}</div>
              <div class="muted" style="margin-top:4px">${Number(p.techs_count||0)} ช่าง • ${Number(p.lines_count||0)} รายการ</div>
            </div>
          </div>
          <div class="row" style="justify-content:space-between;align-items:center;margin-top:10px;gap:8px">
            <div class="muted">${Number(p.techs_count||0)} ?? ? ${Number(p.lines_count||0)} ??????</div>
            <button class="btn blue" data-act="view" data-id="${esc(p.payout_id)}">เลือกงวดนี้</button>
          </div>
        </div>
      `;
    }).join('');

    if (cards) cards.innerHTML = cardHtml;
    if (tb) {
      tb.innerHTML = PAYOUTS.map(p=>{
        const range = `${fmtDate(p.period_start)} - ${fmtDate(p.period_end)}`;
        return `
          <tr class="tr">
            <td class="mono">${esc(p.payout_id)}</td>
            <td><span class="pill blue">${esc(p.period_type)}</span></td>
            <td class="muted">${esc(range)}</td>
            <td><b>${fmtBaht(p.total_amount)}</b></td>
            <td>${Number(p.techs_count||0)}</td>
            <td>${Number(p.lines_count||0)}</td>
            <td>${esc(p.status||'draft')}</td>
            <td><button class="btn gray" data-act="view" data-id="${esc(p.payout_id)}">ดู</button></td>
          </tr>
        `;
      }).join('');
    }

    [tb, cards].filter(Boolean).forEach(rootEl=>{
      rootEl.querySelectorAll('button[data-act="view"]').forEach(btn=>{
        btn.addEventListener('click', ()=> openPayout(btn.getAttribute('data-id')));
      });
    });
  }

  async function generatePayout(type){
    const t = String(type||'').trim();
    $('payoutGenStatus').textContent = 'กำลังสร้างงวด...';
    try{
      const r = await api(`/admin/super/payouts/generate?type=${encodeURIComponent(t)}`, { method:'POST' });
      $('payoutGenStatus').textContent = r.already_generated ? `งวดนี้ถูกสร้างแล้ว (${r.payout_id})` : `สร้างสำเร็จ (${r.payout_id})`;
      toast('สำเร็จ');
      await loadPayouts();
      await loadAudit();
    }catch(e){
      $('payoutGenStatus').textContent = 'สร้างไม่สำเร็จ';
      alert(`สร้างไม่สำเร็จ: ${e.message}`);
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
        pill.textContent = `status: ${st}`;
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

    $('payoutDetailHint').textContent = `กำลังโหลดรายช่างของงวด: ${id}`;
    $('payoutTechsBox').innerHTML = `<div class="muted">กำลังโหลด...</div>`;
    $('payoutLinesBox').innerHTML = '';
    try{
      const r = await api(`/admin/super/payouts/${encodeURIComponent(id)}/techs`);
      renderPayoutTechs(r.techs||[]);
      $('payoutDetailHint').textContent = `รายช่างในงวด (${(r.techs||[]).length} คน)`;
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
        <div class="payroll-card"><div class="label">Gross payout</div><div class="value">${fmtBaht(totalGross)}</div></div>
        <div class="payroll-card" style="border-color:#f4c542;background:#fffdf3"><div class="label">Partner deposit</div><div class="value" style="color:#0b4bb3">${fmtBaht(totalDeposit)}</div></div>
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
          const st = esc(t.paid_status||'unpaid');
          const pillClass = (st==='paid') ? 'blue' : (st==='partial' ? 'yellow' : '');
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
                <div class="muted" style="margin-top:6px">Gross ${gross} • Deposit ${dep} • Net ${net}</div>
              </div>
              <div style="text-align:right">
                <div class="money">${rem}</div>
                <div class="muted" style="margin-top:4px">Paid ${paid} • Remaining ${rem}</div>
              </div>
            </div>
            <div class="pay-actions">
              <button class="btn gray" data-act="tech" data-u="${u}">ดูรายการงาน</button>
              <button class="btn blue" data-act="pay" data-u="${u}" data-net="${_safeNum(t.net_amount)}" ${canPay?'':'disabled'}>${canPay?'จ่าย':'จ่ายแล้ว'}</button>
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
            ยอดก่อนปรับ: <b>${fmtBaht(gross)}</b> • ปรับยอด: <b>${fmtBaht(adjTotal)}</b> • Deposit: <b style="color:#0b4bb3">${fmtBaht(dep)}</b> • ยอดสุทธิ: <b>${fmtBaht(net)}</b>
          </div>
          <div class="muted" style="margin-top:4px">
            Deposit target: <b>${fmtBaht(payload?.deposit_target_amount||0)}</b> • collected: <b>${fmtBaht(payload?.deposit_collected_total||0)}</b> • remaining: <b>${fmtBaht(payload?.deposit_remaining_amount||0)}</b>
          </div>
          <div class="muted" style="margin-top:4px">
            จ่ายแล้ว: <b>${fmtBaht(paid)}</b> • คงเหลือ: <b>${fmtBaht(rem)}</b> • สถานะ: <b>${esc(paidStatus)}</b>
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
        <b>Adjustment (Audit)</b>
        <div class="muted" style="margin-top:4px">ปรับยอดแบบมีเหตุผล • ลบได้เฉพาะ Super Admin</div>
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
  if ($('btnGenP10')) $('btnGenP10').addEventListener('click', ()=> generatePayout('10'));
  if ($('btnGenP25')) $('btnGenP25').addEventListener('click', ()=> generatePayout('25'));
  if ($('btnReloadPayouts')) $('btnReloadPayouts').addEventListener('click', loadPayouts);
  if ($('btnLegacySettle')) $('btnLegacySettle').addEventListener('click', legacySettleOldPayouts);

  // ===== Init =====
  await loadAdmins();
  await loadUsersForImpersonate();
  await refreshImpState();
  await loadDurations();
  await loadAudit();
  await loadPayouts();
})();
