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
        <div>${kv('จังหวัด/พื้นที่', [a.province, a.district].filter(Boolean).join(' / '))}${kv('เป้าหมายงาน', a.work_intent)}${kv('การเดินทาง', a.travel_method || a.vehicle_type)}${kv('ธนาคาร', a.bank_name)}${kv('เลขบัญชี 4 ตัวท้าย', a.bank_account_last4)}${kv('ยอมรับสัญญา', a.contract_accepted_at ? `${a.contract_version || 'partner_single_rate_2026_05'} • ${fmtDate(a.contract_accepted_at)}` : 'ยังไม่ยอมรับในใบสมัคร')}</div>
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
            <div style="grid-column:span 2">
              <label>หมายเหตุ / เหตุผลถ้าไม่ผ่าน</label>
              <input data-doc-note value="${esc(d.admin_note || '')}" placeholder="เช่น รูปไม่ชัด / ชื่อบัญชีไม่ตรง / ขอเอกสารใหม่">
              <div class="quickReasons">
                <button class="reasonChip" type="button" data-reason="รูปไม่ชัด กรุณาถ่ายใหม่ให้เห็นข้อมูลครบ">รูปไม่ชัด</button>
                <button class="reasonChip" type="button" data-reason="ข้อมูลไม่ครบ กรุณาอัปโหลดเอกสารใหม่">ข้อมูลไม่ครบ</button>
                <button class="reasonChip" type="button" data-reason="ชื่อบัญชีไม่ตรงกับชื่อผู้สมัคร กรุณาตรวจสอบ">ชื่อไม่ตรง</button>
              </div>
            </div>
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
      const [agreement, academy, exams, certifications, trials, interview] = await Promise.all([
        api(`/admin/partners/applications/${id}/agreement`),
        api(`/admin/partners/applications/${id}/academy`),
        api(`/admin/partners/applications/${id}/exams`),
        api(`/admin/partners/applications/${id}/certifications`),
        api(`/admin/partners/applications/${id}/trial-jobs`),
        api(`/admin/partners/applications/${id}/interview`)
      ]);
      activeExtra = { agreement, academy, exams, certifications, trials, interview };
      renderInterview(interview.interview || null);
      renderOnboardingSummary();
      renderCertifications(certifications.certifications || []);
      renderTrials(trials.trial_jobs || []);
    } catch (e) {
      $('onboardingSummary').innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    }
  }


  function checklistItem(label, ok, detail){
    return `<div class="reviewCheck ${ok ? 'ok' : 'warn'}"><div>${ok ? '✓' : '•'} ${esc(label)}</div><small>${esc(detail || '')}</small></div>`;
  }


  function renderInterview(row){
    const statusOptions = [
      ['not_called','ยังไม่ได้โทร'],
      ['no_answer','โทรไม่ติด'],
      ['contacted','คุยแล้ว'],
      ['follow_up','นัดติดตามอีกครั้ง'],
      ['passed','ผ่านสัมภาษณ์'],
      ['failed','ไม่ผ่านสัมภาษณ์']
    ];
    const resultOptions = [
      ['follow_up','รอดูเพิ่มเติม'],
      ['passed','ผ่าน'],
      ['failed','ไม่ผ่าน']
    ];
    const optionHtml = (items, value) => items.map(([v,l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('');
    $('interviewPanel').innerHTML = `
      ${row ? `<div class="muted">สัมภาษณ์ล่าสุดโดย ${esc(row.interviewer_username || '-')} • ${fmtDate(row.interviewed_at)}</div>` : `<div class="muted">ยังไม่มีบันทึกสัมภาษณ์</div>`}
      <div class="interviewResult">
        <div><label>สถานะการโทร</label><select id="interviewCallStatus">${optionHtml(statusOptions, row?.call_status || 'contacted')}</select></div>
        <div><label>ผลสัมภาษณ์</label><select id="interviewResult">${optionHtml(resultOptions, row?.result || 'follow_up')}</select></div>
        <div><label>นัดติดตาม</label><input id="interviewFollowUp" type="datetime-local" value=""></div>
      </div>
      <div class="interviewScores">
        <div><label>ทัศนคติ</label><input id="interviewAttitude" type="number" min="0" max="5" step="1" value="${esc(row?.attitude_score ?? '')}" placeholder="0-5"></div>
        <div><label>ประสบการณ์</label><input id="interviewExperience" type="number" min="0" max="5" step="1" value="${esc(row?.experience_score ?? '')}" placeholder="0-5"></div>
        <div><label>สื่อสาร</label><input id="interviewCommunication" type="number" min="0" max="5" step="1" value="${esc(row?.communication_score ?? '')}" placeholder="0-5"></div>
        <div><label>เครื่องมือพร้อม</label><input id="interviewTools" type="number" min="0" max="5" step="1" value="${esc(row?.tool_readiness_score ?? '')}" placeholder="0-5"></div>
        <div><label>เวลารับงาน</label><input id="interviewAvailability" type="number" min="0" max="5" step="1" value="${esc(row?.availability_score ?? '')}" placeholder="0-5"></div>
      </div>
      <label style="margin-top:10px">หมายเหตุสัมภาษณ์</label>
      <textarea id="interviewNote" placeholder="สรุปการคุยจริง เช่น ประสบการณ์ พื้นที่รับงาน เครื่องมือ ทัศนคติ ข้อกังวล">${esc(row?.admin_note || '')}</textarea>
      <button class="secondary" id="btnSaveInterview" type="button" style="margin-top:10px">บันทึกสัมภาษณ์</button>
    `;
  }

  async function saveInterview(){
    if (!activeId) return;
    const payload = {
      call_status: $('interviewCallStatus').value,
      result: $('interviewResult').value,
      attitude_score: Number($('interviewAttitude').value || 0),
      experience_score: Number($('interviewExperience').value || 0),
      communication_score: Number($('interviewCommunication').value || 0),
      tool_readiness_score: Number($('interviewTools').value || 0),
      availability_score: Number($('interviewAvailability').value || 0),
      admin_note: $('interviewNote').value.trim(),
      next_follow_up_at: $('interviewFollowUp').value || null
    };
    const scores = ['attitude_score','experience_score','communication_score','tool_readiness_score','availability_score'].map(k => Number(payload[k] || 0));
    if (scores.some(s => !Number.isFinite(s) || s < 0 || s > 5)) throw new Error('คะแนนสัมภาษณ์ต้องอยู่ระหว่าง 0-5');
    if (!payload.admin_note || payload.admin_note.length < 8) throw new Error('กรุณาใส่หมายเหตุสัมภาษณ์อย่างน้อย 8 ตัวอักษร');
    await api(`/admin/partners/applications/${activeId}/interview`, { method:'PUT', body:JSON.stringify(payload) });
    await loadExtra(activeId);
  }

  function renderAdminReviewChecklist(){
    const docs = activeDetail?.documents || [];
    const sigs = activeExtra.agreement?.signatures || [];
    const academy = activeExtra.academy?.academy || null;
    const attempts = activeExtra.exams?.attempts || [];
    const certs = activeExtra.certifications?.certifications || [];
    const requiredDocs = ['id_card','profile_photo','bank_book'];
    const docsUploaded = requiredDocs.every(t => docs.some(d => d.document_type === t));
    const docsApproved = requiredDocs.every(t => docs.some(d => d.document_type === t && d.status === 'approved'));
    const trainingDone = academy && Number(academy.lesson_count || 0) > 0 && Number(academy.completed_count || 0) >= Number(academy.lesson_count || 0);
    const examPassed = attempts.some(a => a.passed === true || a.passed === 'true');
    const hasApprovedCert = certs.some(c => c.status === 'approved');
    const interview = activeExtra.interview?.interview || null;
    const interviewPassed = interview?.result === 'passed';
    return `
      <h3 style="margin:0 0 8px">Checklist อนุมัติพาร์ทเนอร์</h3>
      <div class="reviewChecklist">
        ${checklistItem('เอกสารหลักอัปโหลดครบ', docsUploaded, 'บัตรประชาชน / รูปโปรไฟล์ / สมุดบัญชี')}
        ${checklistItem('เอกสารหลักผ่านตรวจ', docsApproved, 'ถ้าไม่ผ่าน ให้ระบุเหตุผลและขออัปโหลดใหม่')}
        ${checklistItem('ยอมรับสัญญาเรทเดียวในใบสมัคร', !!activeDetail?.application?.contract_accepted_at, activeDetail?.application?.contract_accepted_at ? `${activeDetail.application.contract_version || 'partner_single_rate_2026_05'} • ${fmtDate(activeDetail.application.contract_accepted_at)}` : 'ยังไม่กดยอมรับ')}
        ${checklistItem('เซ็นสัญญาแล้ว', sigs.length > 0, sigs[0]?.signed_at ? fmtDate(sigs[0].signed_at) : 'ยังไม่เซ็น')}
        ${checklistItem('สัมภาษณ์แล้ว', !!interview, interview ? `${interview.result || '-'} • ${fmtDate(interview.interviewed_at)}` : 'ยังไม่มีบันทึก')}
        ${checklistItem('อบรม Basic ครบ', !!trainingDone, academy ? `${academy.completed_count || 0}/${academy.lesson_count || 0} บทเรียน` : 'ยังไม่มีข้อมูล')}
        ${checklistItem('สอบผ่าน 80%', !!examPassed, attempts[0] ? `คะแนนล่าสุด ${attempts[0].score_percent || 0}%` : 'ยังไม่มีผลสอบ')}
        ${checklistItem('เปิดสิทธิ์งานแล้ว', !!hasApprovedCert, hasApprovedCert ? 'มี certification approved' : 'ยังไม่มีสิทธิ์รับงานจริง')}
      </div>
    `;
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
      ${renderAdminReviewChecklist()}
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
    const evals = activeExtra.trials?.evaluations || [];
    const latestEval = new Map(evals.map(e => [String(e.trial_job_id), e]));
    $('trialJobs').innerHTML = rows.length ? rows.map(t=>{
      const existing = latestEval.get(String(t.id));
      const isPassed = t.status === 'passed' || existing?.result === 'passed';
      const scoreAvg = existing ? Math.round(((Number(existing.punctuality_score||0)+Number(existing.uniform_score||0)+Number(existing.communication_score||0)+Number(existing.photo_quality_score||0)+Number(existing.job_quality_score||0))/5)*10)/10 : null;
      return `
      <div class="trialEvalCard" data-trial-id="${esc(t.id)}">
        <div class="trialHeader">
          <div>
            <b style="font-size:18px">${esc(CERT_LABELS[t.certification_code] || t.certification_code)}</b>
            <div class="muted">Trial #${esc(t.id)} • ${fmtDate(t.created_at)} ${t.job_id ? `• Job ${esc(t.job_id)}` : ''}</div>
            ${t.admin_note ? `<div class="muted">โน้ตตอนปลด Trial: ${esc(t.admin_note)}</div>` : ''}
          </div>
          <div>${badge(t.status || 'trial_unlocked')}${scoreAvg !== null ? `<span class="badge" style="margin-left:6px">เฉลี่ย ${scoreAvg}/5</span>` : ''}</div>
        </div>
        ${existing ? `<div class="doc" style="margin-top:10px;background:#f8fbff">
          <b>ผลประเมินล่าสุด: ${esc(existing.result)}</b>
          <div class="muted">ตรงเวลา ${esc(existing.punctuality_score)} • แต่งกาย ${esc(existing.uniform_score)} • สื่อสาร ${esc(existing.communication_score)} • รูปถ่าย ${esc(existing.photo_quality_score)} • คุณภาพงาน ${esc(existing.job_quality_score)}</div>
          ${existing.admin_note ? `<div style="margin-top:6px">${esc(existing.admin_note)}</div>` : ''}
        </div>` : ''}
        <div class="scoreGrid">
          <div class="scoreBox"><label>ตรงเวลา</label><input type="number" min="0" max="5" step="1" data-eval="punctuality_score" value="${esc(existing?.punctuality_score ?? '')}" placeholder="0-5"></div>
          <div class="scoreBox"><label>แต่งกาย</label><input type="number" min="0" max="5" step="1" data-eval="uniform_score" value="${esc(existing?.uniform_score ?? '')}" placeholder="0-5"></div>
          <div class="scoreBox"><label>สื่อสาร</label><input type="number" min="0" max="5" step="1" data-eval="communication_score" value="${esc(existing?.communication_score ?? '')}" placeholder="0-5"></div>
          <div class="scoreBox"><label>รูปก่อน-หลัง</label><input type="number" min="0" max="5" step="1" data-eval="photo_quality_score" value="${esc(existing?.photo_quality_score ?? '')}" placeholder="0-5"></div>
          <div class="scoreBox"><label>คุณภาพงาน</label><input type="number" min="0" max="5" step="1" data-eval="job_quality_score" value="${esc(existing?.job_quality_score ?? '')}" placeholder="0-5"></div>
        </div>
        <div class="trialDecision">
          <div><label>ผลประเมิน</label><select data-eval="result">
            <option value="passed" ${existing?.result === 'passed' ? 'selected' : ''}>ผ่าน Trial</option>
            <option value="needs_more_trial" ${existing?.result === 'needs_more_trial' ? 'selected' : ''}>ต้องทดลองเพิ่ม</option>
            <option value="failed" ${existing?.result === 'failed' ? 'selected' : ''}>ไม่ผ่าน</option>
          </select></div>
          <label class="checkline"><input data-eval="customer_issue" type="checkbox" ${existing?.customer_issue ? 'checked' : ''}> มีปัญหา/ร้องเรียนจากลูกค้า</label>
        </div>
        <label style="margin-top:10px">หมายเหตุประเมิน</label>
        <textarea data-eval="admin_note" placeholder="สรุปพฤติกรรม จุดแข็ง จุดที่ต้องแก้ เช่น ตรงเวลา สื่อสารดี รูปครบ ไม่เปลี่ยนราคาเอง">${esc(existing?.admin_note || '')}</textarea>
        <label class="checkline" style="display:block;margin-top:10px"><input data-eval="approve_certification" type="checkbox" ${isPassed ? 'checked' : ''}> ถ้าผ่าน Trial ให้เปิดสิทธิ์ certification นี้ทันที</label>
        <div class="scoreHint">เกณฑ์แนะนำ: ถ้าจะให้ผ่าน ควรได้คะแนนเฉลี่ย 4/5 ขึ้นไป ไม่มีปัญหาลูกค้ารุนแรง และใช้ระบบครบ</div>
        <button class="secondary" data-save-eval type="button" style="margin-top:10px">บันทึกผล Trial Evaluation</button>
      </div>
    `}).join('') : '<div class="muted">ยังไม่มี Trial job — เลือก certification แล้วกด “สร้าง Trial” ก่อน</div>';
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
      if (el.type === 'checkbox') payload[key] = !!el.checked;
      else payload[key] = key.endsWith('_score') ? Number(el.value || 0) : el.value;
    });
    const scores = ['punctuality_score','uniform_score','communication_score','photo_quality_score','job_quality_score'].map(k => Number(payload[k] || 0));
    if (scores.some(s => !Number.isFinite(s) || s < 0 || s > 5)) {
      throw new Error('คะแนน Trial ต้องอยู่ระหว่าง 0-5');
    }
    if (!payload.admin_note || String(payload.admin_note).trim().length < 8) {
      throw new Error('กรุณาใส่หมายเหตุประเมินอย่างน้อย 8 ตัวอักษร');
    }
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
  $('interviewPanel').addEventListener('click', e=>{
    const btn = e.target.closest('#btnSaveInterview');
    if (btn) saveInterview().catch(err=>alert(err.message));
  });
  $('documents').addEventListener('click', e=>{
    const reason = e.target.closest('[data-reason]');
    if (reason) {
      const card = reason.closest('[data-doc-id]');
      const input = card && card.querySelector('[data-doc-note]');
      if (input) input.value = reason.dataset.reason || '';
      return;
    }
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
