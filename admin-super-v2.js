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

  // ===== Init =====
  await loadAdmins();
  await loadUsersForImpersonate();
  await refreshImpState();
  await loadDurations();
  await loadAudit();
  await loadIncomeDefaultsAndOverrides();
})();
