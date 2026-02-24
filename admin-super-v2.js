/* Super Admin v2 (Whitelist) [ISSUE-1/2/3]
 * - Super Admin = ENV SUPER_ADMIN_USERNAMES whitelist (backend enforces)
 * - Manage admins, impersonate, audit log, durations
 * - Technician income settings (defaults + override) + per-job calc
 */

(async function () {
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function toast(msg) {
    try {
      const d = document.createElement('div');
      d.textContent = msg;
      d.style.position = 'fixed';
      d.style.left = '12px';
      d.style.right = '12px';
      d.style.bottom = '90px';
      d.style.zIndex = '9999';
      d.style.padding = '12px';
      d.style.borderRadius = '14px';
      d.style.fontWeight = '900';
      d.style.background = '#e2e8f0';
      d.style.color = '#0f172a';
      d.style.boxShadow = '0 10px 30px rgba(0,0,0,0.18)';
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1800);
    } catch (_) { }
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    }, opts));
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data;
  }

  // ===== Guard =====
  let me = null;
  try {
    me = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json());
    const isSuper = !!(me && me.ok && me.actor && me.actor.is_super_admin);
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
    const actor = me.actor || { username: me.username, role: me.role };
    const imp = me.impersonating ? ` • สวมสิทธิ: ${me.username} (${me.role})` : '';
    $('meBox').textContent = `ผู้ใช้: ${actor.username} (Super Admin)${imp}`;
  } catch (_) { }

  // ===== Admins =====
  async function loadAdmins() {
    const a = await api('/admin/super/users?role=admin');
    const s = await api('/admin/super/users?role=super_admin');
    const map = new Map();
    (s.users || []).forEach(u => map.set(u.username, u));
    (a.users || []).forEach(u => map.set(u.username, u));
    const rows = [...map.values()].sort((x, y) => String(x.username).localeCompare(String(y.username)));

    const tbody = $('adminsTbody');
    tbody.innerHTML = rows.map(u => {
      const roleLabel = (u.is_super_admin || u.display_role === 'super_admin') ? 'Super Admin' : 'Admin';
      const pillCls = (u.is_super_admin || u.display_role === 'super_admin') ? 'blue' : 'yellow';
      return `<tr class="tr">
        <td class="mono">${esc(u.username)}</td>
        <td><span class="pill ${pillCls}">${esc(roleLabel)}</span></td>
        <td>${esc(u.full_name || '')}</td>
        <td>${Number(u.commission_rate_percent || 0)}</td>
        <td>
          <div class="row">
            <button class="btn gray" data-edit="${esc(u.username)}">แก้ไข</button>
          </div>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const username = btn.getAttribute('data-edit');
        const row = rows.find(x => x.username === username);
        if (!row) return;

        const full_name = prompt(`แก้ชื่อแอดมิน (${username})`, row.full_name || '') ?? null;
        if (full_name === null) return;

        const commission_rate_percent = prompt(`คอมมิชชั่น % (${username})`, String(row.commission_rate_percent || 0)) ?? null;
        if (commission_rate_percent === null) return;

        const password = prompt(`ถ้าจะเปลี่ยนรหัส (${username}) ให้พิมพ์ใหม่ (ถ้าไม่เปลี่ยนกด Cancel/เว้นว่าง)`, '') ?? '';
        const payload = {
          role: 'admin',
          full_name: String(full_name || '').trim(),
          commission_rate_percent: Number(commission_rate_percent || 0)
        };
        if (password && String(password).trim()) payload.password = String(password).trim();

        try {
          await api(`/admin/super/admins/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify(payload) });
          toast('บันทึกแล้ว');
          await loadAdmins();
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
    if (!username || !password) return alert('ต้องใส่ username และ password');

    try {
      // role is forced to 'admin' by backend (Super Admin is whitelist-only)
      await api('/admin/super/admins', { method: 'POST', body: JSON.stringify({ username, password, role: 'admin', full_name }) });
      $('a_username').value = '';
      $('a_password').value = '';
      $('a_fullname').value = '';
      toast('สร้างแอดมินแล้ว');
      await loadAdmins();
      await loadAudit();
    } catch (e) {
      alert(`สร้างไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Impersonate =====
  async function loadUsersForImpersonate() {
    const data = await api('/admin/super/users');
    const users = data.users || [];
    const sel = $('impTarget');
    sel.innerHTML = users.map(u => {
      const roleLabel = (u.is_super_admin || u.display_role === 'super_admin') ? 'Super Admin' : (u.role || u.display_role || '');
      const nm = u.full_name ? ` • ${u.full_name}` : '';
      return `<option value="${esc(u.username)}">${esc(u.username)} (${esc(roleLabel)})${esc(nm)}</option>`;
    }).join('');
  }

  $('btnReloadUsers').addEventListener('click', loadUsersForImpersonate);

  $('btnImp').addEventListener('click', async () => {
    const target_username = $('impTarget').value;
    if (!target_username) return;
    if (!confirm(`สวมสิทธิเป็น ${target_username} ?\n(มีบันทึก audit log)`)) return;
    try {
      const r = await api('/admin/super/impersonate', { method: 'POST', body: JSON.stringify({ target_username }) });
      // sync localStorage for older pages
      try {
        localStorage.setItem('cwf_impersonate_by', r.actor.username);
        localStorage.setItem('cwf_impersonate', r.impersonated.username);
        localStorage.setItem('cwf_impersonate_since', String(Date.now()));
        localStorage.setItem('username', r.impersonated.username);
        localStorage.setItem('role', r.impersonated.role);
      } catch (_) { }
      toast(`สวมสิทธิเป็น ${r.impersonated.username} แล้ว`);
      location.href = (r.impersonated.role === 'technician') ? '/tech.html' : '/admin-dashboard-v2.html';
    } catch (e) {
      alert(`สวมสิทธิไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnStopImp').addEventListener('click', async () => {
    if (!confirm('หยุดสวมสิทธิ และกลับเป็น Super Admin?')) return;
    try {
      await api('/admin/super/impersonate/stop', { method: 'POST' });
      try {
        ['cwf_impersonate', 'cwf_impersonate_by', 'cwf_impersonate_since'].forEach(k => localStorage.removeItem(k));
      } catch (_) { }
      toast('หยุดสวมสิทธิแล้ว');
      location.href = '/admin-super-v2.html';
    } catch (e) {
      alert(`หยุดสวมสิทธิไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Durations =====
  async function loadDurations() {
    const data = await api('/admin/super/durations');
    const rows = data.rows || [];
    const tbody = $('durTbody');
    tbody.innerHTML = rows.map(r => {
      const ts = r.updated_at ? new Date(r.updated_at).toLocaleString('th-TH') : '-';
      return `<tr class="tr">
        <td class="mono">${esc(r.service_key)}</td>
        <td>${Number(r.duration_min || 0)} นาที</td>
        <td class="mono">${esc(r.updated_by || '-')}</td>
        <td>${esc(ts)}</td>
        <td>
          <button class="btn gray" data-ddel="${esc(r.service_key)}">ลบ</button>
        </td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;

    tbody.querySelectorAll('[data-ddel]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const k = btn.getAttribute('data-ddel');
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
    if (!service_key || duration_min <= 0) return alert('กรอก service_key และ duration_min');
    try {
      await api('/admin/super/durations', { method: 'POST', body: JSON.stringify({ service_key, duration_min }) });
      $('d_key').value = '';
      $('d_min').value = '';
      toast('บันทึกแล้ว');
      await loadDurations();
      await loadAudit();
    } catch (e) {
      alert(`บันทึกไม่สำเร็จ: ${e.message}`);
    }
  });

  // ===== Audit =====
  async function loadAudit() {
    const data = await api('/admin/super/audit?limit=200');
    const rows = data.rows || [];
    const tbody = $('auditTbody');
    tbody.innerHTML = rows.map(r => {
      const ts = r.created_at ? new Date(r.created_at).toLocaleString('th-TH') : '-';
      const actor = r.actor_username ? `${r.actor_username} (${r.actor_role || ''})` : '-';
      const target = r.target_username || r.target_role || '-';
      const meta = r.meta_json ? JSON.stringify(r.meta_json) : '';
      return `<tr class="tr">
        <td>${esc(ts)}</td>
        <td class="mono">${esc(actor)}</td>
        <td>${esc(r.action || '')}</td>
        <td class="mono">${esc(target)}</td>
        <td class="mono">${esc(meta)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="5" class="muted">(ไม่มีข้อมูล)</td></tr>`;
  }

  $('btnReloadAudit').addEventListener('click', loadAudit);

  // ===== Income settings [ISSUE-2/3] =====
  async function loadIncomeUI() {
    try {
      const d = await api('/admin/super/tech_income/defaults');
      const def = d.defaults || {};
      $('defCompanyPct').value = String(def.company ? (def.company.commission_percent ?? 0) : 0);
      $('defPartnerCut').value = String(def.partner ? (def.partner.company_cut_percent ?? 0) : 0);
      $('defCustomPct').value = String(def.custom ? (def.custom.percent ?? 0) : 0);
    } catch (e) {
      // ignore (in case table not yet migrated)
    }

    // load technicians list
    try {
      const u = await api('/admin/super/users');
      const techs = (u.users || []).filter(x => (x.role || x.display_role) === 'technician');
      const sel = $('ovTech');
      sel.innerHTML = techs.map(t => `<option value="${esc(t.username)}">${esc(t.username)}${t.full_name ? ' • ' + esc(t.full_name) : ''}</option>`).join('');
    } catch (_) { }
  }

  $('btnReloadIncome')?.addEventListener('click', loadIncomeUI);

  $('btnSaveIncomeDefaults')?.addEventListener('click', async () => {
    try {
      const companyPct = Number($('defCompanyPct').value || 0);
      const partnerCut = Number($('defPartnerCut').value || 0);
      const customPct = Number($('defCustomPct').value || 0);

      await api('/admin/super/tech_income/defaults/company', { method: 'PUT', body: JSON.stringify({ config_json: { commission_percent: companyPct } }) });
      await api('/admin/super/tech_income/defaults/partner', { method: 'PUT', body: JSON.stringify({ config_json: { company_cut_percent: partnerCut } }) });
      await api('/admin/super/tech_income/defaults/custom', { method: 'PUT', body: JSON.stringify({ config_json: { mode: 'percent', percent: customPct } }) });

      toast('บันทึก Defaults แล้ว');
      await loadAudit();
    } catch (e) {
      alert(`บันทึก Defaults ไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnSaveOverride')?.addEventListener('click', async () => {
    const username = $('ovTech').value;
    const income_type = $('ovType').value;
    const v = Number($('ovValue').value || 0);

    let config_json = {};
    if (income_type === 'company') config_json = { commission_percent: v };
    else if (income_type === 'partner') config_json = { company_cut_percent: v };
    else if (income_type === 'custom') config_json = { mode: 'percent', percent: v };
    else if (income_type === 'special_only') config_json = {};

    try {
      await api(`/admin/super/tech_income/overrides/${encodeURIComponent(username)}`, { method: 'PUT', body: JSON.stringify({ income_type, config_json }) });
      toast('บันทึก Override แล้ว');
      await loadAudit();
    } catch (e) {
      alert(`บันทึก Override ไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnClearOverride')?.addEventListener('click', async () => {
    const username = $('ovTech').value;
    if (!username) return;
    if (!confirm(`ล้าง Override ของ ${username} ?`)) return;
    try {
      await api(`/admin/super/tech_income/overrides/${encodeURIComponent(username)}`, { method: 'DELETE' });
      toast('ล้าง Override แล้ว');
      await loadAudit();
    } catch (e) {
      alert(`ล้าง Override ไม่สำเร็จ: ${e.message}`);
    }
  });

  $('btnCalcJob')?.addEventListener('click', async () => {
    const job_id = $('calcJobId').value;
    if (!job_id) return alert('ใส่ job_id');
    $('calcNote').textContent = 'กำลังคำนวณ...';
    $('calcOut').textContent = '-';
    try {
      const r = await api(`/admin/super/tech_income/calc/job/${encodeURIComponent(job_id)}`);
      $('calcNote').textContent = `mode: ${r.mode}`;
      $('calcOut').textContent = JSON.stringify(r, null, 2);
    } catch (e) {
      $('calcNote').textContent = 'error';
      $('calcOut').textContent = e.message;
    }
  });

  // ===== Initial load =====
  await Promise.allSettled([
    loadAdmins(),
    loadUsersForImpersonate(),
    loadDurations(),
    loadAudit(),
    loadIncomeUI()
  ]);
})();
