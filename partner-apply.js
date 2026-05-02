(function(){
  const PROVINCES = ['กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','สมุทรสาคร','นครปฐม','ฉะเชิงเทรา'];
  const DISTRICTS_BY_PROVINCE = {
    'กรุงเทพมหานคร': ['พระโขนง','บางนา','วัฒนา','คลองเตย','สวนหลวง','ประเวศ','บางกะปิ','ห้วยขวาง','ดินแดง','ราชเทวี','ปทุมวัน','สาทร','บางรัก','ยานนาวา','ลาดพร้าว','จตุจักร','หลักสี่','ดอนเมือง','สายไหม','บางเขน','มีนบุรี','ลาดกระบัง','หนองจอก','คันนายาว','บึงกุ่ม','สะพานสูง','วังทองหลาง','จอมทอง','ธนบุรี','บางกอกใหญ่','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ภาษีเจริญ','บางแค','หนองแขม','บางบอน','บางขุนเทียน','ราษฎร์บูรณะ','ทุ่งครุ','บางซื่อ','ดุสิต','พญาไท','คลองสามวา','บางพลัด','สัมพันธวงศ์','ป้อมปราบศัตรูพ่าย'],
    'สมุทรปราการ': ['เมืองสมุทรปราการ','บางบ่อ','บางพลี','พระประแดง','พระสมุทรเจดีย์','บางเสาธง'],
    'นนทบุรี': ['เมืองนนทบุรี','บางกรวย','บางใหญ่','บางบัวทอง','ไทรน้อย','ปากเกร็ด'],
    'ปทุมธานี': ['เมืองปทุมธานี','คลองหลวง','ธัญบุรี','หนองเสือ','ลาดหลุมแก้ว','ลำลูกกา','สามโคก'],
    'สมุทรสาคร': ['เมืองสมุทรสาคร','กระทุ่มแบน','บ้านแพ้ว'],
    'นครปฐม': ['เมืองนครปฐม','กำแพงแสน','นครชัยศรี','ดอนตูม','บางเลน','สามพราน','พุทธมณฑล'],
    'ฉะเชิงเทรา': ['เมืองฉะเชิงเทรา','บางคล้า','บางน้ำเปรี้ยว','บางปะกง','บ้านโพธิ์','พนมสารคาม','ราชสาส์น','สนามชัยเขต','แปลงยาว','ท่าตะเกียบ','คลองเขื่อน']
  };
  const WORK_INTENTS = [
    ['full_time_with_cwf','ตั้งใจทำงานกับ CWF เป็นหลัก'],
    ['part_time_extra_income','พาร์ทไทม์ / รายได้เสริม'],
    ['has_regular_job_accept_extra','มีงานประจำและรับงานเพิ่มได้']
  ];
  const TRAVEL = [['motorcycle','มอเตอร์ไซค์'],['car','รถยนต์'],['pickup','รถกระบะ'],['van','รถตู้'],['public_transport','ขนส่งสาธารณะ']];
  const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์'];
  const JOBS = [
    ['clean_wall_normal','ล้างแอร์ผนังปกติ'],['clean_wall_premium','ล้างแอร์ผนังพรีเมียม'],['clean_wall_hanging_coil','ล้างแขวนคอยล์'],['clean_wall_overhaul','ตัดล้างใหญ่'],
    ['clean_ceiling_suspended','ล้างแอร์แขวน/เปลือยใต้ฝ้า'],['clean_cassette_4way','ล้างแอร์สี่ทิศทาง'],['clean_duct_type','ล้างแอร์ท่อลม'],
    ['repair_diagnosis_basic','ตรวจเช็กอาการ'],['repair_water_leak','แก้น้ำรั่ว'],['repair_electrical_basic','งานไฟฟ้าเบื้องต้น'],['repair_refrigerant_basic','เติมน้ำยา/ระบบน้ำยา'],['repair_parts_replacement','เปลี่ยนอะไหล่'],
    ['install_wall_standard','ติดตั้งแอร์ผนัง'],['install_condo','ติดตั้งคอนโด'],['install_relocation','ย้ายแอร์']
  ];
  const EQUIPMENT = [
    'มีเครื่องมือพื้นฐานครบพร้อมทำงาน','ปั๊มน้ำแรงดัน','เครื่องฉีดน้ำแรงดัน','ถุงล้างแอร์','ผ้าใบรองน้ำ','ถังรองน้ำ','น้ำยาล้างคอยล์','แปรงล้างแอร์','เครื่องเป่าลม',
    'เครื่องดูดฝุ่น/ดูดน้ำ','บันได','สว่าน','ไขควง/ชุดเครื่องมือช่าง','ประแจ/คีม/คัตเตอร์','มัลติมิเตอร์','แคลมป์มิเตอร์','เกจ์วัดน้ำยาแอร์','เครื่องชั่งน้ำยา',
    'แวคคั่มปั๊ม','ถังน้ำยา','เครื่องเชื่อม/ชุดเชื่อมท่อทองแดง','คัตเตอร์ตัดท่อ','บานแฟร์','ทอร์คประแจ','ปั๊มน้ำทิ้ง','อุปกรณ์ติดตั้งรางครอบท่อ','ชุด PPE / ถุงมือ / แว่นตา','ยูนิฟอร์มสุภาพพร้อมเข้าหน้างาน'
  ];

  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id)?.value || '').trim();
  const checked = (id) => !!$(id)?.checked;
  const checkedValues = (id) => Array.from($(id)?.querySelectorAll('input:checked') || []).map(el => el.value);

  function options(items, placeholder){
    return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${items.map(x => Array.isArray(x) ? `<option value="${x[0]}">${x[1]}</option>` : `<option value="${x}">${x}</option>`).join('')}`;
  }
  function renderChips(id, items){
    const root = $(id);
    if (!root) return;
    root.innerHTML = items.map(item => {
      const value = Array.isArray(item) ? item[0] : item;
      const label = Array.isArray(item) ? item[1] : item;
      return `<label class="chip"><input type="checkbox" value="${value}"><span>${label}</span></label>`;
    }).join('');
  }
  function bindChipState(rootId){
    const root = $(rootId);
    if (!root) return;
    const sync = () => root.querySelectorAll('.chip').forEach(chip => chip.classList.toggle('active', !!chip.querySelector('input')?.checked));
    root.addEventListener('change', sync);
    sync();
  }
  function bindSingleChipState(ids){
    ids.forEach(id => {
      const el = $(id);
      const chip = el?.closest('.chip');
      if (!el || !chip) return;
      el.addEventListener('change', () => {
        ids.forEach(otherId => $(otherId)?.closest('.chip')?.classList.remove('active'));
        chip.classList.toggle('active', !!el.checked);
      });
      chip.classList.toggle('active', !!el.checked);
    });
  }

  async function jsonFetch(url, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { ...opts, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(_) {}
    if (!res.ok) throw new Error(data?.error || text || 'Request failed');
    return data;
  }

  function updateDistricts(){
    const province = val('province');
    const list = DISTRICTS_BY_PROVINCE[province] || [];
    const districtEl = $('district');
    if (!districtEl) return;
    districtEl.innerHTML = options(list, province ? 'เลือกเขต / อำเภอ' : 'เลือกจังหวัดก่อน');
    districtEl.disabled = !province;
  }

  function toggleHelper(){
    const wrap = $('helperCountWrap');
    const hasHelpers = checked('crew_mode_helpers');
    if (wrap) wrap.style.display = hasHelpers ? 'block' : 'none';
    if (!hasHelpers && $('helper_count')) $('helper_count').value = '';
  }

  function buildPayload(){
    const bankAccountNumber = val('bank_account_number') || val('bank_account_last4');
    const province = val('province');
    const district = val('district');
    const helperCount = Number(val('helper_count') || 0);
    const travelMethodEl = $('travel_method');
    return {
      full_name: val('full_name'),
      phone: val('phone'),
      password: $('password')?.value || '',
      confirm_password: $('confirm_password')?.value || '',
      line_id: val('line_id'),
      email: val('email'),
      address_text: val('address_text'),
      province,
      district,
      service_zones: [province, district].filter(Boolean),
      work_intent: val('work_intent'),
      available_days_per_week: val('available_days_per_week'),
      preferred_work_days: checkedValues('workDays'),
      max_jobs_per_day: val('max_jobs_per_day'),
      max_units_per_day: val('max_units_per_day'),
      can_accept_urgent_jobs: checked('can_accept_urgent_jobs'),
      can_work_condo: checked('can_work_condo'),
      can_issue_tax_invoice: false,
      has_helper_team: helperCount > 0,
      helper_count: helperCount,
      team_size: helperCount,
      travel_method: val('travel_method'),
      service_radius_km: val('service_radius_km'),
      preferred_job_types: checkedValues('jobInterests'),
      equipment_json: checkedValues('equipmentList'),
      experience_years: val('experience_years'),
      has_vehicle: !!travelMethodEl?.value,
      vehicle_type: travelMethodEl?.selectedOptions?.[0]?.textContent || '',
      equipment_notes: val('equipment_notes'),
      bank_account_name: val('bank_account_name'),
      bank_name: val('bank_name'),
      bank_account_number: bankAccountNumber.replace(/\\D/g,''),
      bank_account_last4: bankAccountNumber.replace(/\\D/g,'').slice(-4),
      notes: val('notes'),
      tax_id: val('tax_id'),
      tax_address: val('tax_address') || val('address_text'),
      tax_branch: val('tax_branch'),
      wht_income_type: val('wht_income_type') || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)',
      wht_default_rate: val('wht_default_rate') || 3,
      consent_pdpa: checked('consent_pdpa'),
      consent_terms: checked('consent_terms')
    };
  }

  function validate(body){
    if (!body.full_name) throw new Error('กรุณากรอกชื่อ-นามสกุล');
    if (!body.phone || body.phone.replace(/\D/g,'').length < 9) throw new Error('กรุณากรอกเบอร์โทรให้ถูกต้อง');
    if (!body.password || body.password.length < 6) throw new Error('กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร');
    if (body.password !== body.confirm_password) throw new Error('ยืนยันรหัสผ่านไม่ตรงกัน');
    if (!body.province) throw new Error('กรุณาเลือกจังหวัด');
    if (!body.district) throw new Error('กรุณาเลือกเขต / อำเภอ');
    if (!body.work_intent) throw new Error('กรุณาเลือกลักษณะการทำงาน');
    if (!body.preferred_job_types.length) throw new Error('กรุณาเลือกประเภทงานที่สนใจอย่างน้อย 1 รายการ');
    if (!body.equipment_json.length) throw new Error('กรุณาเลือกเครื่องมือ / อุปกรณ์อย่างน้อย 1 รายการ');
    if (!body.bank_account_name || !body.bank_name || !body.bank_account_number) throw new Error('กรุณากรอกข้อมูลรับเงินให้ครบ');
    if (!/^\d{10,15}$/.test(body.bank_account_number)) throw new Error('กรุณากรอกเลขบัญชีเป็นตัวเลข 10-15 หลัก');
    if (!body.consent_pdpa || !body.consent_terms) throw new Error('กรุณายอมรับเงื่อนไขก่อนส่งใบสมัคร');
  }

  function showResult(app){
    const code = app.application_code || '-';
    $('applicationCode').textContent = code;
    $('loginGuidance').textContent = `ใช้เบอร์ ${app.phone || '-'} และรหัสผ่านที่ตั้งไว้ เพื่อเข้าสู่ระบบแอพช่างได้ทันที`;
    const qs = `?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(app.phone || '')}`;
    $('statusLink').href = `/partner-status${qs}`;
    $('agreementLink').href = `/partner-agreement?code=${encodeURIComponent(code)}`;
    $('academyLink').href = `/partner-academy?code=${encodeURIComponent(code)}`;
    $('resultBox').style.display = 'block';
    $('resultBox').scrollIntoView({ behavior:'smooth', block:'nearest' });
    try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code, phone: app.phone || '' })); } catch(_) {}
  }

  $('province').innerHTML = options(PROVINCES, 'เลือกจังหวัด');
  $('work_intent').innerHTML = options(WORK_INTENTS, 'เลือกลักษณะการทำงาน');
  $('travel_method').innerHTML = options(TRAVEL, 'เลือกการเดินทาง');
  renderChips('workDays', DAYS);
  renderChips('jobInterests', JOBS);
  renderChips('equipmentList', EQUIPMENT);
  bindChipState('workDays');
  bindChipState('jobInterests');
  bindChipState('equipmentList');
  bindSingleChipState(['crew_mode_solo','crew_mode_helpers']);
  updateDistricts();
  toggleHelper();

  $('province')?.addEventListener('change', updateDistricts);
  $('crew_mode_solo')?.addEventListener('change', toggleHelper);
  $('crew_mode_helpers')?.addEventListener('change', toggleHelper);

  $('btnReset')?.addEventListener('click', () => {
    $('applyForm')?.reset();
    updateDistricts();
    toggleHelper();
    ['workDays','jobInterests','equipmentList'].forEach(bindChipState);
    bindSingleChipState(['crew_mode_solo','crew_mode_helpers']);
    $('resultBox').style.display = 'none';
  });

  $('applyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = $('submitBtn');
    const submitText = $('submitBtnText');
    try {
      const body = buildPayload();
      validate(body);
      if (submitBtn) submitBtn.disabled = true;
      if (submitText) submitText.textContent = 'กำลังส่งใบสมัคร...';
      const data = await jsonFetch('/partner/apply', { method:'POST', body: JSON.stringify(body) });
      showResult(data.application || {});
    } catch(err) {
      alert(err.message || 'ส่งใบสมัครไม่สำเร็จ');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) submitText.textContent = 'ส่งใบสมัครและสร้างบัญชี';
    }
  });
})();
