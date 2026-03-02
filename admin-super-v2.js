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
      GET  /admin/super/tech_income/defaults
      PUT  /admin/super/tech_income/defaults/:income_type
      GET  /admin/super/tech_income/overrides
      PUT  /admin/super/tech_income/overrides/:username
      DELETE /admin/super/tech_income/overrides/:username
      GET  /admin/super/tech_income/calc/job/:job_id
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

  // ===== Technician Income =====
  async function loadIncomeDefaultsAndOverrides() {
    try {
      const d = await api('/admin/super/tech_income/defaults');
      const def = d.defaults || {};
      $('defCompanyPct').value = String(def.company?.commission_percent ?? 0);
      $('defPartnerCut').value = String(def.partner?.company_cut_percent ?? 0);
      $('defCustomPct').value = String(def.custom?.percent ?? 0);
    } catch (_) {
      // endpoint might not exist yet in some deployments; keep page usable
      $('defCompanyPct').value = String($('defCompanyPct').value || 0);
      $('defPartnerCut').value = String($('defPartnerCut').value || 0);
      $('defCustomPct').value = String($('defCustomPct').value || 0);
    }

    try {
      const tech = await api('/admin/super/users?role=technician');
      const rows = tech.users || [];
      const sel = $('ovTech');
      const cur = sel.value;
      sel.innerHTML = rows.map(t => {
        const label = `${t.username}${t.full_name ? ` • ${t.full_name}` : ''}`;
        return `<option value="${esc(t.username)}">${esc(label)}</option>`;
      }).join('');
      if (cur) sel.value = cur;
    } catch (_) { }
  }

  $('btnReloadIncome').addEventListener('click', async () => {
    await loadIncomeDefaultsAndOverrides();
    toast('รีเฟรชแล้ว');
  });

  $('btnSaveIncomeDefaults').addEventListener('click', async () => {
    const companyPct = Number($('defCompanyPct').value || 0);
    const partnerCut = Number($('defPartnerCut').value || 0);
    const customPct = Number($('defCustomPct').value || 0);
    if (![companyPct, partnerCut, customPct].every(n => Number.isFinite(n) && n >= 0)) {
      alert('กรอกตัวเลขให้ถูกต้อง (ต้องเป็นเลข >= 0)');
      return;
    }
    try {
      await api('/admin/super/tech_income/defaults/company', { method: 'PUT', body: JSON.stringify({ commission_percent: companyPct }) });
      await api('/admin/super/tech_income/defaults/partner', { method: 'PUT', body: JSON.stringify({ company_cut_percent: partnerCut }) });
      await api('/admin/super/tech_income/defaults/custom', { method: 'PUT', body: JSON.stringify({ mode: 'percent', percent: customPct }) });
      await api('/admin/super/tech_income/defaults/special_only', { method: 'PUT', body: JSON.stringify({}) });
      toast('บันทึก Defaults แล้ว');
      await loadAudit();
    } catch (e) {
      alert(`บันทึก Defaults ไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnSaveOverride').addEventListener('click', async () => {
    const username = $('ovTech').value;
    const income_type = $('ovType').value;
    const v = Number($('ovValue').value || 0);
    if (!username) { alert('เลือกช่างก่อน'); return; }
    if (income_type !== 'special_only') {
      if (!Number.isFinite(v) || v < 0) { alert('กรอกตัวเลข >= 0'); return; }
    }
    const payload = { income_type };
    if (income_type === 'company') payload.config = { commission_percent: v };
    if (income_type === 'partner') payload.config = { company_cut_percent: v };
    if (income_type === 'custom') payload.config = { mode: 'percent', percent: v };
    if (income_type === 'special_only') payload.config = {};
    try {
      await api(`/admin/super/tech_income/overrides/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(payload) });
      toast('บันทึก Override แล้ว');
      await loadAudit();
    } catch (e) {
      alert(`บันทึก Override ไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnClearOverride').addEventListener('click', async () => {
    const username = $('ovTech').value;
    if (!username) { alert('เลือกช่างก่อน'); return; }
    if (!confirm(`ล้าง Override ของ ${username} ?`)) return;
    try {
      await api(`/admin/super/tech_income/overrides/${encodeURIComponent(username)}`, { method: 'DELETE' });
      toast('ล้างแล้ว');
      await loadAudit();
    } catch (e) {
      alert(`ล้างไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnCalcJob').addEventListener('click', async () => {
    const job_id = String($('calcJobId').value || '').trim();
    if (!job_id) { alert('กรอก job_id'); return; }
    $('calcOut').textContent = 'กำลังคำนวณ...';
    $('calcNote').textContent = 'รอสักครู่';
    try {
      const r = await api(`/admin/super/tech_income/calc/job/${encodeURIComponent(job_id)}`);
      $('calcNote').textContent = r.note || '-';
      $('calcOut').textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      $('calcNote').textContent = '-';
      $('calcOut').textContent = `ERROR: ${e.message}`;
    }
  });

  // =======================================
  // 🪜 Step Ladder Rules (Phase 1)
  // =======================================

  let STEP_RULES = [];
  function fmtPct(x){
    const n = Number(x||0);
    if (!Number.isFinite(n)) return '0';
    return (Math.round(n*100)/100).toString();
  }

  async function loadStepRules(){
    if (!$('stepRulesTbody')) return;
    try{
      const r = await api('/admin/super/income_step_rules');
      STEP_RULES = r.rules || [];
      renderStepRules();
    }catch(e){
      $('stepRulesTbody').innerHTML = `<tr class="tr"><td colspan="9" class="muted">โหลดไม่สำเร็จ</td></tr>`;
    }
  }

  function renderStepRules(){
    const tb = $('stepRulesTbody');
    if (!tb) return;
    if (!STEP_RULES.length) {
      tb.innerHTML = `<tr class="tr"><td colspan="9" class="muted">ยังไม่มี rule</td></tr>`;
      return;
    }
    tb.innerHTML = STEP_RULES.map(r=>{
      const match = [r.job_type?`job=${esc(r.job_type)}`:'', r.ac_type?`ac=${esc(r.ac_type)}`:'', r.wash_variant?`wash=${esc(r.wash_variant)}`:'']
        .filter(Boolean).join(' • ') || 'default';
      return `
        <tr class="tr">
          <td class="mono">${esc(r.rule_id)}</td>
          <td class="muted">${match}</td>
          <td>${fmtPct(r.step_1_percent)}</td>
          <td>${fmtPct(r.step_2_percent)}</td>
          <td>${fmtPct(r.step_3_percent)}</td>
          <td>${fmtPct(r.step_4p_percent)}</td>
          <td>${Number(r.priority||0)}</td>
          <td>${r.enabled ? '<span class="pill blue">on</span>' : '<span class="pill">off</span>'}</td>
          <td><button class="btn gray" data-act="edit" data-id="${esc(r.rule_id)}">แก้ไข</button></td>
        </tr>
      `;
    }).join('');

    tb.querySelectorAll('button[data-act="edit"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const id = btn.getAttribute('data-id');
        const it = STEP_RULES.find(x=>String(x.rule_id)===String(id));
        if (!it) return;
        $('sr_rule_id').value = it.rule_id || '';
        $('sr_priority').value = Number(it.priority||0);
        $('sr_enabled').value = it.enabled ? 'true' : 'false';
        $('sr_job_type').value = it.job_type || '';
        $('sr_ac_type').value = it.ac_type || '';
        $('sr_wash_variant').value = it.wash_variant || '';
        $('sr_s1').value = fmtPct(it.step_1_percent);
        $('sr_s2').value = fmtPct(it.step_2_percent);
        $('sr_s3').value = fmtPct(it.step_3_percent);
        $('sr_s4').value = fmtPct(it.step_4p_percent);
        toast('ดึงค่าเข้าแบบฟอร์มแล้ว');
      });
    });
  }

  if ($('btnReloadStepRules')) $('btnReloadStepRules').addEventListener('click', loadStepRules);
  if ($('btnUpsertStepRule')) $('btnUpsertStepRule').addEventListener('click', async ()=>{
    try{
      const payload = {
        rule_id: String($('sr_rule_id').value||'').trim(),
        priority: Number($('sr_priority').value||0),
        enabled: String($('sr_enabled').value||'true') !== 'false',
        job_type: String($('sr_job_type').value||'').trim() || null,
        ac_type: String($('sr_ac_type').value||'').trim() || null,
        wash_variant: String($('sr_wash_variant').value||'').trim() || null,
        step_1_percent: Number($('sr_s1').value||0),
        step_2_percent: Number($('sr_s2').value||0),
        step_3_percent: Number($('sr_s3').value||0),
        step_4p_percent: Number($('sr_s4').value||0),
        scope_type: 'combined'
      };
      if (!payload.rule_id) { alert('กรอก rule_id'); return; }
      $('stepRuleStatus').textContent = 'กำลังบันทึก...';
      await api('/admin/super/income_step_rules/upsert', { method:'POST', body: JSON.stringify(payload) });
      $('stepRuleStatus').textContent = 'บันทึกแล้ว';
      toast('บันทึกแล้ว');
      await loadStepRules();
  await loadOverrides();
      await loadAudit();
    }catch(e){
      $('stepRuleStatus').textContent = 'บันทึกไม่สำเร็จ';
      alert(`บันทึกไม่สำเร็จ: ${e.message}`);
    }
  });

  
// =======================================
// 👤 Technician Step Overrides
// =======================================

let OVERRIDES = [];
let TECH_OPTIONS = [];

function _slug(s){
  return String(s||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function _buildOverrideId(){
  const tech = String($('or_tech')?.value||'').trim();
  const job = String($('or_job_type')?.value||'').trim() || 'any';
  const ac  = String($('or_ac_type')?.value||'').trim() || 'any';
  let wash  = String($('or_wash_variant')?.value||'').trim() || 'any';
  // wash_variant is only meaningful for wash+wall
  if (!(job==='wash' && ac==='wall')) wash = 'any';
  if (!tech) return '';
  return `ov_${_slug(tech)}__${_slug(job)}__${_slug(ac)}__${_slug(wash)}`;
}

function _updateOverrideIdPreview(){
  const id = _buildOverrideId();
  if ($('or_override_id')) $('or_override_id').value = id;
}

function _updateWashVariantEnabled(){
  const job = String($('or_job_type')?.value||'').trim();
  const ac  = String($('or_ac_type')?.value||'').trim();
  const el = $('or_wash_variant');
  if (!el) return;
  const enabled = (job==='wash' && ac==='wall');
  el.disabled = !enabled;
  if (!enabled) el.value = '';
}

async function loadTechnicianOptions(){
  const sel = $('or_tech');
  if (!sel) return;
  try{
    // use existing admin technicians endpoint (works for super too)
    const r = await api('/admin/technicians');
    const list = (r.technicians || r.items || r.rows || []).map(t=>({
      username: t.username || t.tech_username || t.technician_username || t.id || '',
      name: t.name || t.full_name || t.display_name || ''
    })).filter(x=>x.username);
    TECH_OPTIONS = list;
  }catch(e){
    TECH_OPTIONS = [];
  }
  // render dropdown
  sel.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '— เลือกช่าง —';
  sel.appendChild(opt0);
  TECH_OPTIONS.forEach(t=>{
    const o = document.createElement('option');
    o.value = t.username;
    o.textContent = t.name ? `${t.username} (${t.name})` : t.username;
    sel.appendChild(o);
  });
}

async function loadOverrides(){
  if (!$('overridesTbody')) return;
  try{
    // populate dropdown once
    if ($('or_tech') && (!$('or_tech').options || $('or_tech').options.length<=1)) {
      await loadTechnicianOptions();
      if ($('or_priority') && !$('or_priority').value) $('or_priority').value = '100';
      _updateWashVariantEnabled();
      _updateOverrideIdPreview();
    }
    const r = await api('/admin/super/income_step_overrides');
    OVERRIDES = r.overrides || [];
    renderOverrides();
  }catch(e){
    $('overridesTbody').innerHTML = `<tr class="tr"><td colspan="10" class="muted">โหลดไม่สำเร็จ</td></tr>`;
  }
}

function renderOverrides(){
  const tb = $('overridesTbody');
  if (!tb) return;
  if (!OVERRIDES.length) {
    tb.innerHTML = `<tr class="tr"><td colspan="10" class="muted">ยังไม่มี override</td></tr>`;
    return;
  }
  tb.innerHTML = OVERRIDES.map(r=>{
    const match = [r.job_type?`job=${esc(r.job_type)}`:'', r.ac_type?`ac=${esc(r.ac_type)}`:'', r.wash_variant?`wash=${esc(r.wash_variant)}`:'']
      .filter(Boolean).join(' • ') || 'any';
    return `
      <tr class="tr">
        <td class="mono">${esc(r.override_id)}</td>
        <td class="mono">${esc(r.technician_username)}</td>
        <td class="muted">${match}</td>
        <td>${fmtPct(r.step_1_percent)}</td>
        <td>${fmtPct(r.step_2_percent)}</td>
        <td>${fmtPct(r.step_3_percent)}</td>
        <td>${fmtPct(r.step_4p_percent)}</td>
        <td>${Number(r.priority||0)}</td>
        <td>${r.enabled ? '<span class="pill blue">on</span>' : '<span class="pill">off</span>'}</td>
        <td><button class="btn gray" data-act="edit_ov" data-id="${esc(r.override_id)}">แก้ไข</button></td>
      </tr>
    `;
  }).join('');

  tb.querySelectorAll('button[data-act="edit_ov"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.getAttribute('data-id');
      const it = OVERRIDES.find(x=>String(x.override_id)===String(id));
      if (!it) return;
      // ensure dropdown is loaded
      if ($('or_tech') && (!$('or_tech').options || $('or_tech').options.length<=1)) {
        loadTechnicianOptions().then(()=>{ $('or_tech').value = it.technician_username || ''; _updateOverrideIdPreview(); });
      } else {
        $('or_tech').value = it.technician_username || '';
      }
      $('or_priority').value = String(Number(it.priority||100));
      $('or_enabled').value = it.enabled ? 'true' : 'false';
      $('or_job_type').value = it.job_type || '';
      $('or_ac_type').value = it.ac_type || '';
      _updateWashVariantEnabled();
      $('or_wash_variant').value = it.wash_variant || '';
      $('or_s1').value = fmtPct(it.step_1_percent);
      $('or_s2').value = fmtPct(it.step_2_percent);
      $('or_s3').value = fmtPct(it.step_3_percent);
      $('or_s4').value = fmtPct(it.step_4p_percent);
      // show system-generated id preview (should match stored)
      $('or_override_id').value = it.override_id || _buildOverrideId();
      toast('ดึงค่า override เข้าแบบฟอร์มแล้ว');
    });
  });
}

if ($('btnReloadOverrides')) $('btnReloadOverrides').addEventListener('click', loadOverrides);
if ($('btnUpsertOverride')) $('btnUpsertOverride').addEventListener('click', async ()=>{
  try{
    _updateWashVariantEnabled();
    _updateOverrideIdPreview();
    const payload = {
      override_id: String($('or_override_id').value||'').trim(),
      technician_username: String($('or_tech').value||'').trim(),
      priority: Number($('or_priority').value||100),
      enabled: String($('or_enabled').value||'true') !== 'false',
      job_type: String($('or_job_type').value||'').trim() || null,
      ac_type: String($('or_ac_type').value||'').trim() || null,
      wash_variant: String($('or_wash_variant').value||'').trim() || null,
      step_1_percent: Number($('or_s1').value||0),
      step_2_percent: Number($('or_s2').value||0),
      step_3_percent: Number($('or_s3').value||0),
      step_4p_percent: Number($('or_s4').value||0),
      scope_type: 'combined'
    };
    if (!payload.technician_username) { alert('เลือกช่าง'); return; }
    if (!payload.override_id) {
      payload.override_id = _buildOverrideId();
      $('or_override_id').value = payload.override_id;
    }
    // wash_variant only for wash+wall
    if (!(payload.job_type==='wash' && payload.ac_type==='wall')) payload.wash_variant = null;
    $('overrideStatus').textContent = 'กำลังบันทึก...';
    await api('/admin/super/income_step_overrides/upsert', { method:'POST', body: JSON.stringify(payload) });
    $('overrideStatus').textContent = 'บันทึกแล้ว';
    toast('บันทึกแล้ว');
    await loadOverrides();
    await loadAudit();
  }catch(e){
    $('overrideStatus').textContent = 'บันทึกไม่สำเร็จ';
    alert(`บันทึกไม่สำเร็จ: ${e.message}`);
  }
});

// wire up live preview for override
['or_tech','or_job_type','or_ac_type','or_wash_variant'].forEach(id=>{
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', ()=>{
    _updateWashVariantEnabled();
    _updateOverrideIdPreview();
  });
});

// =======================================
  // 🗓️ Payout Periods (Phase 1)
  // =======================================

  let PAYOUTS = [];
  let ACTIVE_PAYOUT = '';
  let ACTIVE_TECH = '';

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
    if (!tb) return;
    if (!PAYOUTS.length) {
      tb.innerHTML = `<tr class="tr"><td colspan="8" class="muted">ยังไม่มีงวด</td></tr>`;
      return;
    }
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
    tb.querySelectorAll('button[data-act="view"]').forEach(btn=>{
      btn.addEventListener('click', ()=> openPayout(btn.getAttribute('data-id')));
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
      if ($('payoutReconcileBox')) $('payoutReconcileBox').innerHTML = '';
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

      // ✅ ลบงวด (เฉพาะ draft และต้องไม่มี payment/adjustment)
      const delBtn = $('btnDeletePayout');
      if (delBtn){
        delBtn.disabled = (st !== 'draft');
        delBtn.onclick = async ()=>{
          if (!confirm(`ลบงวด ${id} ?\n\nเงื่อนไข: ต้องเป็น draft และยังไม่มีการจ่าย/ปรับยอด`)) return;
          try{
            await api(`/admin/super/payouts/${encodeURIComponent(id)}`, { method:'DELETE' });
            toast('ลบงวดแล้ว');
            ACTIVE_PAYOUT = '';
            ACTIVE_TECH = '';
            $('payoutDetailHint').textContent = 'เลือกงวดจากตาราง';
            $('payoutTechsBox').innerHTML = '';
            $('payoutLinesBox').innerHTML = '';
            await loadPayouts();
            await loadAudit();
          }catch(e){
            alert(`ลบไม่สำเร็จ: ${e.message}`);
          }
        };
      }

      // ✅ Phase 5: ตรวจสอบงวด (reconcile)
      const recBtn = $('btnReconcilePayout');
      if (recBtn){
        recBtn.disabled = false;
        recBtn.onclick = async ()=>{
          if ($('payoutReconcileBox')) $('payoutReconcileBox').innerHTML = '<div class="muted">กำลังตรวจสอบงวด...</div>';
          try{
            const rr = await api(`/admin/super/payouts/${encodeURIComponent(id)}/reconcile`);
            renderPayoutReconcile(rr);
          }catch(e){
            if ($('payoutReconcileBox')) $('payoutReconcileBox').innerHTML = `<div class="muted">ตรวจสอบไม่สำเร็จ: ${esc(e.message||'error')}</div>`;
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
    if (!arr.length) { box.innerHTML = `<div class="muted">ไม่มีบรรทัดในงวดนี้</div>`; return; }

    box.innerHTML = `
      <div style="overflow:auto">
        <table>
          <thead>
            <tr class="muted">
              <td>ช่าง</td>
              <td>ยอดสุทธิ</td>
              <td>จ่ายแล้ว</td>
              <td>คงเหลือ</td>
              <td>สถานะ</td>
              <td>จำนวนงาน</td>
              <td>จัดการ</td>
            </tr>
          </thead>
          <tbody>
            ${arr.map(t=>{
              const u = esc(t.technician_username);
              const net = fmtBaht(t.net_amount||t.total_amount||0);
              const paid = fmtBaht(t.paid_amount||0);
              const rem = fmtBaht(t.remaining_amount||0);
              const st = esc(t.paid_status||'unpaid');
              const pillClass = (st==='paid') ? 'green' : (st==='partial' ? 'yellow' : 'gray');
              return `<tr class="tr">
                <td class="mono">${u}</td>
                <td><b>${net}</b></td>
                <td>${paid}</td>
                <td><b>${rem}</b></td>
                <td><span class="pill ${pillClass}">${st}</span></td>
                <td>${Number(t.jobs_count||0)}</td>
                <td class="row" style="gap:8px;flex-wrap:wrap">
                  <button class="btn gray" data-act="tech" data-u="${u}">ดูงาน</button>
                  <button class="btn blue" data-act="pay" data-u="${u}" data-net="${_safeNum(t.net_amount)}">จ่าย</button>
                  <button class="btn yellow" data-act="adj" data-u="${u}">ปรับยอด</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="muted" style="margin-top:8px">หมายเหตุ: “ปรับยอด” จะถูกเก็บเป็น audit trail และจะไปอยู่ในสลิปงวด</div>
    `;

    box.querySelectorAll('button[data-act="tech"]').forEach(btn=>{
      btn.addEventListener('click', ()=> openPayoutTech(btn.getAttribute('data-u')));
    });
    box.querySelectorAll('button[data-act="pay"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const u = String(btn.getAttribute('data-u')||'').trim();
        if (!ACTIVE_PAYOUT || !u) return;
        const amtStr = prompt(`ใส่ยอด "จ่ายแล้ว" (บาท) สำหรับ ${u}
(ใส่ยอดรวมที่จ่ายแล้วทั้งหมด ไม่ใช่เพิ่มทีละงวด)`, '');
        if (amtStr==null) return;
        const paid_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(paid_amount) || paid_amount < 0) { alert('ยอดไม่ถูกต้อง'); return; }
        const slip_url = prompt('แนบลิงก์สลิป (ว่างได้)', '') || '';
        const note = prompt('โน้ต (ว่างได้)', '') || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/pay`, {
            method:'POST',
            body: JSON.stringify({ technician_username: u, paid_amount, slip_url, note })
          });
          toast('บันทึกการจ่ายแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH === u) await openPayoutTech(u);
          await loadAudit();
        }catch(e){
          alert(`บันทึกไม่สำเร็จ: ${e.message}`);
        }
      });
    });
    box.querySelectorAll('button[data-act="adj"]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const u = String(btn.getAttribute('data-u')||'').trim();
        if (!ACTIVE_PAYOUT || !u) return;
        const amtStr = prompt(`ปรับยอดสำหรับ ${u} (ใส่ + หรือ - ได้)
ตัวอย่าง: -200 หรือ 150`, '');
        if (amtStr==null) return;
        const adj_amount = Number(String(amtStr).replace(/[, ]/g,''));
        if (!Number.isFinite(adj_amount) || adj_amount === 0) { alert('จำนวนไม่ถูกต้อง'); return; }
        const reason = prompt('เหตุผล (ต้องกรอก)', '');
        if (!reason || !String(reason).trim()) { alert('ต้องกรอกเหตุผล'); return; }
        const job_id = prompt('ผูกกับงาน #job_id (ว่างได้)', '') || '';
        try{
          await api(`/admin/super/payouts/${encodeURIComponent(ACTIVE_PAYOUT)}/adjust`, {
            method:'POST',
            body: JSON.stringify({ technician_username: u, adj_amount, reason, job_id })
          });
          toast('บันทึกปรับยอดแล้ว');
          await openPayout(ACTIVE_PAYOUT);
          if (ACTIVE_TECH === u) await openPayoutTech(u);
          await loadAudit();
        }catch(e){
          alert(`ปรับยอดไม่สำเร็จ: ${e.message}`);
        }
      });
    });
  }

  function renderPayoutReconcile(rr){
    const box = $('payoutReconcileBox');
    if (!box) return;
    const mism = Array.isArray(rr?.mismatches) ? rr.mismatches : [];
    const miss = Array.isArray(rr?.missing_now) ? rr.missing_now : [];
    const news = Array.isArray(rr?.new_expected) ? rr.new_expected : [];

    const badge = (txt)=>`<span class="pill blue" style="margin-left:6px">${esc(txt)}</span>`;
    let html = `<div class="card" style="padding:10px">
      <div class="row" style="justify-content:space-between;align-items:center">
        <div><b>ตรวจสอบงวด</b>${badge(`mismatch ${mism.length}`)}${badge(`missing ${miss.length}`)}${badge(`new ${news.length}`)}</div>
        <div class="muted mono">${esc(rr?.payout_id||'')}</div>
      </div>
      <div class="muted" style="margin-top:6px">ถ้ามี mismatch แปลว่า job/รายการ/การมอบหมาย ถูกแก้หลัง generate หรือ rule เปลี่ยน (งวด locked/paid ให้ใช้ Adjustment เท่านั้น)</div>
    `;

    const rows = [];
    for (const m of mism.slice(0, 50)) {
      rows.push(`<tr>
        <td class="mono">${esc(m.job_id)}</td>
        <td class="mono">${esc(m.technician_username||'-')}</td>
        <td class="mono">${esc((m.stored_earn??'-'))}</td>
        <td class="mono">${esc((m.expected_earn??'-'))}</td>
        <td class="mono">${esc((m.delta??'-'))}</td>
        <td class="muted">${m.changed_after_generate ? 'แก้หลังสร้างงวด' : ''}</td>
      </tr>`);
    }
    if (rows.length) {
      html += `<div style="overflow:auto;margin-top:10px">
        <table>
          <thead><tr class="muted"><td>job</td><td>tech</td><td>stored</td><td>expected</td><td>delta</td><td>hint</td></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
    } else {
      html += `<div class="muted" style="margin-top:10px">ไม่พบ mismatch</div>`;
    }

    if (miss.length) {
      html += `<div class="muted" style="margin-top:10px">มีบรรทัดที่เคยอยู่ในงวด แต่คำนวณปัจจุบันไม่เจอ (มักเกิดจากการแก้ assign/ลบรายการ): ${esc(miss.length)} รายการ</div>`;
    }
    if (news.length) {
      html += `<div class="muted" style="margin-top:6px">มีบรรทัดใหม่ที่คำนวณปัจจุบันควรมี แต่ใน DB ไม่มี: ${esc(news.length)} รายการ</div>`;
    }

    html += `</div>`;
    box.innerHTML = html;
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
    const net = Number(payload?.net_amount||payload?.total_amount||0);
    const paid = Number(payload?.paid_amount||0);
    const rem = Number(payload?.remaining_amount||0);
    const paidStatus = String(payload?.paid_status||payload?.payment?.paid_status||'unpaid');
    const adjustments = Array.isArray(payload?.adjustments)?payload.adjustments:[];

    const head = `
      <div class="row" style="justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px">
        <div>
          <b>รายการงานของ ${esc(username)}</b>
          <div class="muted" style="margin-top:4px">
            ยอดก่อนปรับ: <b>${fmtBaht(gross)}</b> • ปรับยอด: <b>${fmtBaht(adjTotal)}</b> • ยอดสุทธิ: <b>${fmtBaht(net)}</b>
          </div>
          <div class="muted" style="margin-top:4px">
            จ่ายแล้ว: <b>${fmtBaht(paid)}</b> • คงเหลือ: <b>${fmtBaht(rem)}</b> • สถานะ: <b>${esc(paidStatus)}</b>
          </div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn blue" id="btnPayThisTech">จ่าย/แก้ยอดจ่าย</button>
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
      const pct = (ln.percent_final==null||ln.percent_final===undefined) ? '-' : (Number(ln.percent_final)||0).toFixed(2)+'%';
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
                <div class="muted" style="margin-top:4px">เครื่อง: ${mc} • %: ${pct}</div>
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
          alert(`บันทึกไม่สำเร็จ: ${e.message}`);
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

  if ($('btnGenP10')) $('btnGenP10').addEventListener('click', ()=> generatePayout('10'));
  if ($('btnGenP25')) $('btnGenP25').addEventListener('click', ()=> generatePayout('25'));
  if ($('btnReloadPayouts')) $('btnReloadPayouts').addEventListener('click', loadPayouts);

  // ===== Init =====
  await loadAdmins();
  await loadUsersForImpersonate();
  await refreshImpState();
  await loadDurations();
  await loadAudit();
  await loadIncomeDefaultsAndOverrides();
  await loadPayouts();
  await loadStepRules();
})();
