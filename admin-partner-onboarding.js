(function(){
  const STATUS_LABELS = {
    draft:'ร่าง', submitted:'ส่งใบสมัครแล้ว', under_review:'กำลังตรวจสอบ', need_more_documents:'ขอเอกสารเพิ่ม',
    rejected:'ไม่ผ่าน', approved_for_training:'อนุมัติเข้าอบรม',
    uploaded:'อัปโหลดแล้ว', approved:'อนุมัติ', need_reupload:'ขออัปโหลดใหม่',
    not_started:'ยังไม่เริ่ม', in_training:'กำลังอบรม', exam_ready:'พร้อมสอบ', exam_failed:'สอบไม่ผ่าน',
    exam_passed:'สอบผ่าน', trial_unlocked:'Trial', suspended:'ระงับ', revoked:'ยกเลิก'
  };
  const DOC_LABELS = {
    id_card:'บัตรประชาชน', profile_photo:'รูปโปรไฟล์', bank_book:'หน้าสมุดบัญชี', tools_photo:'รูปเครื่องมือ',
    vehicle_photo:'รูปยานพาหนะ', certificate_or_portfolio:'ใบรับรอง/ผลงาน', other:'เอกสารอื่น'
  };
  const CERT_LABELS = {
    cwf_basic_partner:'Basic Partner', clean_wall_normal:'ล้างผนังปกติ', clean_wall_premium:'ล้างผนังพรีเมียม',
    clean_wall_hanging_coil:'ล้างแขวนคอยล์', clean_wall_overhaul:'ตัดล้างใหญ่',
    clean_ceiling_suspended:'ล้างแขวน/เปลือยใต้ฝ้า', clean_cassette_4way:'ล้างแอร์สี่ทิศทาง',
    clean_duct_type:'ล้างแอร์ท่อลม', repair_diagnosis_basic:'ตรวจเช็กอาการ', repair_water_leak:'แก้น้ำรั่ว',
    repair_electrical_basic:'งานไฟฟ้าเบื้องต้น', repair_refrigerant_basic:'เติมน้ำยา/ระบบน้ำยา',
    repair_parts_replacement:'เปลี่ยนอะไหล่', install_wall_standard:'ติดตั้งแอร์ผนัง',
    install_condo:'ติดตั้งคอนโด', install_relocation:'ย้ายแอร์'
  };
  const DOC_STATUSES = ['uploaded','approved','rejected','need_reupload'];
  const CERT_STATUSES = ['not_started','in_training','exam_ready','exam_failed','exam_passed','trial_unlocked','approved','suspended','revoked'];
  const CERT_CODES = Object.keys(CERT_LABELS);

  let activeId = null;
  let activeDetail = null;
  let activeExtra = {};

  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s ?? '').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmtDate = (v)=>v ? new Date(v).toLocaleString('th-TH', { dateStyle:'medium', timeStyle:'short' }) : '-';
  const badge = (s)=>`<span class="status ${esc(s)}">${esc(STATUS_LABELS[s] || s || '-')}</span>`;
  const asList = (v)=>Array.isArray(v) ? v : [];

  async function api(url, opts){
    if (window.apiFetch) return window.apiFetch(url, opts);
    const res = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(opts||{}) });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }

  function kv(label, value){
    return `<div style="margin:0 0 8px"><div class="muted">${esc(label)}</div><b>${esc(value || '-')}</b></div>`;
  }

  function renderList(rows){
    const box = $('applicationList');
    if (!rows.length) {
      box.innerHTML = '<div class="muted">ไม่พบใบสมัคร</div>';
      return;
    }
    box.innerHTML = rows.map(r=>`
      <div class="item" data-id="${esc(r.id)}">
        <div class="itemTop">
          <div>
            <b>${esc(r.full_name)}</b>
            <div class="muted">${esc(r.application_code)} • ${esc(r.phone || '-')}</div>
          </div>
          ${badge(r.status)}
        </div>
        <div class="chips">
          <span class="chip">เอกสาร ${Number(r.document_count || 0)}</span>
          <span class="chip">ผ่าน ${Number(r.approved_document_count || 0)}</span>
          ${Number(r.problem_document_count || 0) ? `<span class="chip">ต้องดู ${Number(r.problem_document_count || 0)}</span>` : ''}
        </div>
        <div class="muted" style="margin-top:8px">ส่งเมื่อ ${fmtDate(r.submitted_at || r.created_at)}</div>
      </div>
    `).join('');
  }

  async function loadList(){
    const params = new URLSearchParams();
    const status = $('statusFilter').value;
    const q = $('searchInput').value.trim();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    const data = await api(`/admin/partners/applications?${params.toString()}`);
    renderList(data.applications || []);
  }

  function renderDetail(data){
    activeDetail = data;
    const a = data.application;
    activeId = a.id;
    $('detailCode').textContent = a.application_code || '-';
    $('detailName').textContent = a.full_name || '-';
    $('applicationStatus').value = a.status || 'submitted';
    $('applicationNote').value = a.admin_note || '';
    $('detailInfo').innerHTML = `
      <div class="grid2">
        <div>${kv('เบอร์โทร', a.phone)}${kv('บัญชีช่าง', a.technician_username)}${kv('LINE ID', a.line_id)}${kv('อีเมล', a.email)}${kv('ประสบการณ์', a.experience_years == null ? '-' : `${a.experience_years} ปี`)}</div>
        <div>${kv('จังหวัด/พื้นที่', [a.province, a.district].filter(Boolean).join(' / '))}${kv('เป้าหมายงาน', a.work_intent)}${kv('การเดินทาง', a.travel_method || a.vehicle_type)}${kv('ธนาคาร', a.bank_name)}${kv('เลขบัญชี 4 ตัวท้าย', a.bank_account_last4)}</div>
      </div>
      ${kv('ที่อยู่', a.address_text)}
      <div class="chips">
        <span class="chip">วัน/สัปดาห์ ${esc(a.available_days_per_week ?? '-')}</span>
        <span class="chip">งาน/วัน ${esc(a.max_jobs_per_day ?? '-')}</span>
        <span class="chip">เครื่อง/วัน ${esc(a.max_units_per_day ?? '-')}</span>
        <span class="chip">รัศมี ${esc(a.service_radius_km ?? '-')} กม.</span>
        ${a.can_accept_urgent_jobs ? '<span class="chip">รับงานด่วน</span>' : ''}
        ${a.can_work_condo ? '<span class="chip">ทำคอนโด</span>' : ''}
        ${a.has_helper_team ? `<span class="chip">มีทีม ${esc(a.team_size ?? '')}</span>` : ''}
      </div>
      <div class="chips">${asList(a.service_zones).map(x=>`<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">ไม่ระบุโซน</span>'}</div>
      <div class="chips">${asList(a.preferred_job_types).map(x=>`<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">ไม่ระบุประเภทงาน</span>'}</div>
      <div class="chips">${asList(a.equipment_json).map(x=>`<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">ไม่ระบุ checklist อุปกรณ์</span>'}</div>
      ${a.equipment_notes ? kv('อุปกรณ์', a.equipment_notes) : ''}
      ${a.notes ? kv('หมายเหตุผู้สมัคร', a.notes) : ''}
    `;
    renderDocuments(data.documents || []);
    renderEvents(data.events || []);
    renderExtraPlaceholders();
    $('detailDrawer').classList.add('open');
    loadExtra(a.id);
  }

  function renderDocuments(docs){
    $('documents').innerHTML = docs.length ? docs.map(d=>{
      const options = DOC_STATUSES.map(s=>`<option value="${s}" ${s === d.status ? 'selected' : ''}>${esc(STATUS_LABELS[s] || s)}</option>`).join('');
      return `
        <div class="doc" data-doc-id="${esc(d.id)}">
          <div class="docTop">
            <div>
              <b>${esc(DOC_LABELS[d.document_type] || d.document_type)}</b>
              <div class="muted">${esc(d.original_filename || '-')} • ${fmtDate(d.uploaded_at || d.created_at)}</div>
              ${d.public_url ? `<a href="${esc(d.public_url)}" target="_blank" rel="noopener">เปิดไฟล์</a>` : ''}
            </div>
            ${badge(d.status)}
          </div>
          <div class="grid3" style="margin-top:8px">
            <div><label>สถานะเอกสาร</label><select data-doc-status>${options}</select></div>
            <div style="grid-column:span 2"><label>หมายเหตุ</label><input data-doc-note value="${esc(d.admin_note || '')}"></div>
          </div>
          <button class="ghost" data-save-doc type="button" style="margin-top:8px">บันทึกเอกสาร</button>
        </div>
      `;
    }).join('') : '<div class="muted">ยังไม่มีเอกสาร</div>';
  }

  function renderEvents(events){
    $('events').innerHTML = events.length ? events.map(e=>`
      <div class="event">
        <b>${esc(e.event_type)}</b> ${e.from_status || e.to_status ? `<span class="muted">${esc(e.from_status || '-')} → ${esc(e.to_status || '-')}</span>` : ''}
        <div>${esc(e.note || '')}</div>
        <div class="muted">${esc(e.actor_type || '-')} ${esc(e.actor_username || '')} • ${fmtDate(e.created_at)}</div>
      </div>
    `).join('') : '<div class="muted">ยังไม่มี timeline</div>';
  }

  function renderExtraPlaceholders(){
    $('onboardingSummary').innerHTML = '<div class="muted">กำลังโหลดข้อมูล onboarding...</div>';
    $('certifications').innerHTML = '<div class="muted">กำลังโหลด certifications...</div>';
    $('trialJobs').innerHTML = '<div class="muted">กำลังโหลด trial jobs...</div>';
  }

  async function loadExtra(id){
    try {
      const [agreement, academy, exams, certifications, trials] = await Promise.all([
        api(`/admin/partners/applications/${id}/agreement`),
        api(`/admin/partners/applications/${id}/academy`),
        api(`/admin/partners/applications/${id}/exams`),
        api(`/admin/partners/applications/${id}/certifications`),
        api(`/admin/partners/applications/${id}/trial-jobs`)
      ]);
      activeExtra = { agreement, academy, exams, certifications, trials };
      renderOnboardingSummary();
      renderCertifications(certifications.certifications || []);
      renderTrials(trials.trial_jobs || []);
    } catch (e) {
      $('onboardingSummary').innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    }
  }

  function renderOnboardingSummary(){
    const sigs = activeExtra.agreement?.signatures || [];
    const contractReady = activeExtra.agreement?.contract_ready !== false;
    const contractWarning = activeExtra.agreement?.contract_ready_message || 'ต้องนำเข้าสัญญาฉบับจริงก่อนเปิดให้เซ็น';
    const lessons = activeExtra.academy?.lessons || [];
    const attempts = activeExtra.exams?.attempts || [];
    const trials = activeExtra.trials?.trial_jobs || [];
    const doneLessons = lessons.filter(l=>l.completed).length;
    const bestExam = attempts[0];
    $('onboardingSummary').innerHTML = `
      <div class="miniCard"><b>Agreement</b>${!contractReady ? '<span class="badge warn">ยังไม่พร้อม</span>' : (sigs.length ? badge('approved') : badge('not_started'))}<div class="muted">${!contractReady ? esc(contractWarning) : (sigs[0] ? fmtDate(sigs[0].signed_at) : 'ยังไม่เซ็น')}</div></div>
      <div class="miniCard"><b>Academy</b><span class="badge">${doneLessons}/${lessons.length || 0}</span><div class="muted">บทเรียนที่ทำแล้ว</div></div>
      <div class="miniCard"><b>Exam</b>${bestExam ? badge(bestExam.passed ? 'exam_passed' : 'exam_failed') : badge('not_started')}<div class="muted">${bestExam ? `${Number(bestExam.score_percent)}% • ${fmtDate(bestExam.submitted_at)}` : 'ยังไม่สอบ'}</div></div>
      <div class="miniCard"><b>Trial</b><span class="badge">${trials.length}</span><div class="muted">งานทดลอง</div></div>
    `;
  }

  function certStatus(code, rows){
    return rows.find(r=>r.certification_code === code) || { certification_code: code, status: 'not_started' };
  }

  function renderCertifications(rows){
    $('trialCertification').innerHTML = CERT_CODES.map(code=>`<option value="${esc(code)}">${esc(CERT_LABELS[code])}</option>`).join('');
    $('certifications').innerHTML = CERT_CODES.map(code=>{
      const row = certStatus(code, rows);
      const options = CERT_STATUSES.map(s=>`<option value="${s}" ${row.status === s ? 'selected' : ''}>${esc(STATUS_LABELS[s] || s)}</option>`).join('');
      return `
        <div class="doc" data-cert-code="${esc(code)}">
          <div class="docTop">
            <div><b>${esc(CERT_LABELS[code])}</b><div class="muted">${esc(code)} • partner toggle: ${row.preference_enabled ? 'รับงานนี้' : 'ไม่รับ/ล็อก'}</div></div>
            ${badge(row.status)}
          </div>
          <div class="grid2" style="margin-top:8px">
            <div><label>สถานะ</label><select data-cert-status>${options}</select></div>
            <div><label>หมายเหตุ</label><input data-cert-note value="${esc(row.admin_note || '')}"></div>
          </div>
          <div class="actions">
            <button class="ghost" data-quick-cert="in_training" type="button">approve training</button>
            <button class="ghost" data-quick-cert="trial_unlocked" type="button">unlock trial</button>
            <button class="primary" data-quick-cert="approved" type="button">approve full</button>
            <button class="ghost" data-quick-cert="exam_ready" type="button">require retake</button>
            <button class="ghost" data-quick-cert="suspended" type="button">suspend</button>
            <button class="ghost" data-quick-cert="revoked" type="button">revoke</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderTrials(rows){
    $('trialJobs').innerHTML = rows.length ? rows.map(t=>`
      <div class="doc" data-trial-id="${esc(t.id)}">
        <div class="docTop">
          <div>
            <b>${esc(CERT_LABELS[t.certification_code] || t.certification_code)}</b>
            <div class="muted">Trial #${esc(t.id)} • ${fmtDate(t.created_at)} ${t.job_id ? `• Job ${esc(t.job_id)}` : ''}</div>
          </div>
          ${badge(t.status || 'trial_unlocked')}
        </div>
        <div class="grid3" style="margin-top:8px">
          <div><label>ตรงเวลา</label><input type="number" min="0" max="5" data-eval="punctuality_score"></div>
          <div><label>เครื่องแบบ</label><input type="number" min="0" max="5" data-eval="uniform_score"></div>
          <div><label>สื่อสาร</label><input type="number" min="0" max="5" data-eval="communication_score"></div>
          <div><label>รูปถ่าย</label><input type="number" min="0" max="5" data-eval="photo_quality_score"></div>
          <div><label>คุณภาพงาน</label><input type="number" min="0" max="5" data-eval="job_quality_score"></div>
          <div><label>ผล</label><select data-eval="result"><option value="passed">passed</option><option value="failed">failed</option><option value="needs_more_trial">needs_more_trial</option></select></div>
        </div>
        <label style="margin-top:8px">ปัญหาลูกค้า</label><input data-eval="customer_issue">
        <label style="margin-top:8px">หมายเหตุ</label><input data-eval="admin_note">
        <button class="secondary" data-save-eval type="button" style="margin-top:8px">บันทึกประเมิน</button>
      </div>
    `).join('') : '<div class="muted">ยังไม่มี trial job</div>';
  }

  async function openDetail(id){
    const data = await api(`/admin/partners/applications/${encodeURIComponent(id)}`);
    renderDetail(data);
  }

  async function saveApplicationStatus(){
    if (!activeId) return;
    const data = await api(`/admin/partners/applications/${activeId}/status`, {
      method:'PUT',
      body: JSON.stringify({ status:$('applicationStatus').value, admin_note:$('applicationNote').value.trim() })
    });
    await openDetail(data.application.id);
    await loadList();
  }

  async function saveDocument(card){
    const docId = card.dataset.docId;
    await api(`/admin/partners/applications/${activeId}/documents/${docId}/status`, {
      method:'PUT',
      body: JSON.stringify({ status:card.querySelector('[data-doc-status]').value, admin_note:card.querySelector('[data-doc-note]').value.trim() })
    });
    await openDetail(activeId);
  }

  async function updateCertification(card, statusOverride){
    const code = card.dataset.certCode;
    const status = statusOverride || card.querySelector('[data-cert-status]').value;
    const noteEl = card.querySelector('[data-cert-note]');
    await api(`/admin/partners/applications/${activeId}/certifications/${encodeURIComponent(code)}/status`, {
      method:'PUT',
      body: JSON.stringify({ status, admin_note: noteEl ? noteEl.value.trim() : '' })
    });
    await loadExtra(activeId);
  }

  async function createTrial(){
    const certification_code = $('trialCertification').value;
    await api(`/admin/partners/applications/${activeId}/trial-jobs`, {
      method:'POST',
      body: JSON.stringify({ certification_code, job_id:$('trialJobId').value.trim() || null, admin_note:$('trialNote').value.trim() })
    });
    $('trialJobId').value = '';
    $('trialNote').value = '';
    await loadExtra(activeId);
  }

  async function saveEvaluation(card){
    const payload = {};
    card.querySelectorAll('[data-eval]').forEach(el => {
      const key = el.dataset.eval;
      payload[key] = key.endsWith('_score') ? Number(el.value || 0) : el.value;
    });
    await api(`/admin/partners/trial-jobs/${card.dataset.trialId}/evaluate`, { method:'POST', body:JSON.stringify(payload) });
    await loadExtra(activeId);
  }

  async function runEligibleDryRun(){
    const payload = {
      job_type:$('dryRunJobType').value.trim(),
      wash_variant:$('dryRunVariant').value.trim(),
      repair_variant:$('dryRunVariant').value.trim(),
      install_variant:$('dryRunVariant').value.trim(),
      ac_type:$('dryRunVariant').value.trim(),
      zone:$('dryRunZone').value.trim()
    };
    const data = await api('/admin/partners/eligible-dry-run', { method:'POST', body:JSON.stringify(payload) });
    const partners = data.partners || [];
    $('eligibleDryRun').innerHTML = partners.slice(0, 20).map(p => `
      <div class="doc">
        <div class="docTop"><div><b>${esc(p.full_name)}</b><div class="muted">${esc(p.technician_username || '-')} • ${esc(p.province || '')} ${esc(p.district || '')}</div></div>${p.eligible ? badge('approved') : badge('need_more_documents')}</div>
        <div class="chips">
          <span class="chip">cert ${p.checks.certification_approved ? 'ผ่าน' : 'ขาด ' + esc((p.missing_certifications || []).join(','))}</span>
          <span class="chip">toggle ${p.checks.preference_on ? 'เปิด' : 'ปิด'}</span>
          <span class="chip">availability ${p.checks.availability_on ? 'เปิด' : 'paused'}</span>
          <span class="chip">zone ${p.checks.zone_match ? 'ตรง' : 'ไม่ตรง'}</span>
        </div>
      </div>
    `).join('') || '<div class="muted">ไม่พบพาร์ทเนอร์</div>';
  }

  $('btnReload').addEventListener('click', loadList);
  $('statusFilter').addEventListener('change', loadList);
  $('searchInput').addEventListener('keydown', e=>{ if(e.key === 'Enter') loadList(); });
  $('applicationList').addEventListener('click', e=>{
    const item = e.target.closest('[data-id]');
    if (item) openDetail(item.dataset.id).catch(err=>alert(err.message));
  });
  $('btnClose').addEventListener('click', ()=>$('detailDrawer').classList.remove('open'));
  $('btnSaveStatus').addEventListener('click', () => saveApplicationStatus().catch(err=>alert(err.message)));
  $('documents').addEventListener('click', e=>{
    const btn = e.target.closest('[data-save-doc]');
    if (btn) saveDocument(btn.closest('[data-doc-id]')).catch(err=>alert(err.message));
  });
  $('certifications').addEventListener('click', e=>{
    const quick = e.target.closest('[data-quick-cert]');
    if (quick) updateCertification(quick.closest('[data-cert-code]'), quick.dataset.quickCert).catch(err=>alert(err.message));
  });
  $('certifications').addEventListener('change', e=>{
    if (e.target.matches('[data-cert-status]')) updateCertification(e.target.closest('[data-cert-code]')).catch(err=>alert(err.message));
  });
  $('btnCreateTrial').addEventListener('click', () => createTrial().catch(err=>alert(err.message)));
  $('btnDryRun').addEventListener('click', () => runEligibleDryRun().catch(err=>alert(err.message)));
  $('trialJobs').addEventListener('click', e=>{
    const btn = e.target.closest('[data-save-eval]');
    if (btn) saveEvaluation(btn.closest('[data-trial-id]')).catch(err=>alert(err.message));
  });

  loadList().catch(err=>{ $('applicationList').innerHTML = `<div class="muted">${esc(err.message)}</div>`; });
})();
