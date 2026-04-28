(function(){
  const PROVINCES = ['กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','สมุทรสาคร','นครปฐม','ฉะเชิงเทรา'];
  const BANGKOK_DISTRICTS = ['พระโขนง','บางนา','วัฒนา','คลองเตย','สวนหลวง','ประเวศ','บางกะปิ','ห้วยขวาง','ดินแดง','ราชเทวี','ปทุมวัน','สาทร','บางรัก','ยานนาวา','ลาดพร้าว','จตุจักร','หลักสี่','ดอนเมือง','สายไหม','บางเขน','มีนบุรี','ลาดกระบัง','หนองจอก','คันนายาว','บึงกุ่ม','สะพานสูง','วังทองหลาง','จอมทอง','ธนบุรี','บางกอกใหญ่','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ภาษีเจริญ','บางแค','หนองแขม','บางบอน','บางขุนเทียน','ราษฎร์บูรณะ','ทุ่งครุ','บางซื่อ','ดุสิต','พญาไท'];
  const WORK_INTENTS = [['full_time_with_cwf','ทำงานเต็มเวลากับ CWF'],['part_time_extra_income','พาร์ทไทม์/รายได้เสริม'],['has_regular_job_accept_extra','มีงานประจำ รับงานเพิ่ม'],['team_partner','ทีมช่างพาร์ทเนอร์'],['company_subcontractor','บริษัท/ผู้รับเหมาช่วง']];
  const TRAVEL = [['motorcycle','มอเตอร์ไซค์'],['car','รถยนต์'],['pickup','รถกระบะ'],['van','รถตู้'],['public_transport','ขนส่งสาธารณะ']];
  const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์'];
  const JOBS = [['clean_wall_normal','ล้างแอร์ผนังปกติ'],['clean_wall_premium','ล้างแอร์ผนังพรีเมียม'],['clean_wall_hanging_coil','ล้างแขวนคอยล์'],['clean_wall_overhaul','ตัดล้างใหญ่'],['clean_ceiling_suspended','ล้างแอร์แขวน/เปลือยใต้ฝ้า'],['clean_cassette_4way','ล้างแอร์สี่ทิศทาง'],['clean_duct_type','ล้างแอร์ท่อลม'],['repair_diagnosis_basic','ตรวจเช็กอาการ'],['repair_water_leak','แก้น้ำรั่ว'],['repair_electrical_basic','งานไฟฟ้าเบื้องต้น'],['repair_refrigerant_basic','เติมน้ำยา/ระบบน้ำยา'],['repair_parts_replacement','เปลี่ยนอะไหล่'],['install_wall_standard','ติดตั้งแอร์ผนัง'],['install_condo','ติดตั้งคอนโด'],['install_relocation','ย้ายแอร์']];
  const EQUIPMENT = ['มีครบพร้อมทำงาน','ปั๊มน้ำแรงดัน','เครื่องฉีดน้ำแรงดัน','ผ้าใบรองน้ำ','ถังรองน้ำ','กระบอกฉีดน้ำยา','น้ำยาล้างคอยล์','แปรงล้างแอร์','ถุงล้างแอร์','เครื่องเป่าลม','เครื่องดูดฝุ่น/ดูดน้ำ','บันได','สว่าน','ไขควง/ชุดเครื่องมือช่าง','ประแจ/คีม/คัตเตอร์','มัลติมิเตอร์','แคลมป์มิเตอร์','เกจ์วัดน้ำยาแอร์','เครื่องชั่งน้ำยา','แวคคั่มปั๊ม','ถังน้ำยา','เครื่องเชื่อม/ชุดเชื่อมท่อทองแดง','คัตเตอร์ตัดท่อ','บานแฟร์','ทอร์คประแจ','ปั๊มน้ำทิ้ง','อุปกรณ์ติดตั้งรางครอบท่อ','ชุด PPE / ถุงมือ / แว่นตา','ยูนิฟอร์มสุภาพพร้อมเข้าหน้างาน'];
  const $ = id => document.getElementById(id);

  function options(items, placeholder){
    return `${placeholder ? `<option value="">${placeholder}</option>` : ''}${items.map(x => Array.isArray(x) ? `<option value="${x[0]}">${x[1]}</option>` : `<option value="${x}">${x}</option>`).join('')}`;
  }
  function chips(id, items){
    $(id).innerHTML = items.map(x => {
      const value = Array.isArray(x) ? x[0] : x;
      const label = Array.isArray(x) ? x[1] : x;
      return `<label class="chip"><input type="checkbox" value="${value}"><span>${label}</span></label>`;
    }).join('');
  }
  function checked(id){ return Array.from($(id).querySelectorAll('input:checked')).map(x => x.value); }
  async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers:{'Content-Type':'application/json', ...(opts.headers || {})} });
    const data = await res.json().catch(()=>null);
    if (!res.ok) throw new Error(data?.error || 'Request failed');
    return data;
  }
  function payload(){
    const province = $('province').value;
    const district = $('district').value;
    return {
      full_name:$('full_name').value.trim(),
      phone:$('phone').value.trim(),
      password:$('password').value,
      confirm_password:$('confirm_password').value,
      line_id:$('line_id').value.trim(),
      email:$('email').value.trim(),
      address_text:$('address_text').value.trim(),
      province,
      district,
      service_zones:[province, district].filter(Boolean),
      work_intent:$('work_intent').value,
      available_days_per_week:$('available_days_per_week').value,
      preferred_work_days:checked('workDays'),
      max_jobs_per_day:$('max_jobs_per_day').value,
      max_units_per_day:$('max_units_per_day').value,
      can_accept_urgent_jobs:$('can_accept_urgent_jobs').checked,
      can_work_condo:$('can_work_condo').checked,
      can_issue_tax_invoice:$('can_issue_tax_invoice').checked,
      has_helper_team:$('has_helper_team').checked,
      team_size:$('team_size').value,
      travel_method:$('travel_method').value,
      service_radius_km:$('service_radius_km').value,
      preferred_job_types:checked('jobInterests'),
      equipment_json:checked('equipmentList'),
      experience_years:$('experience_years').value,
      has_vehicle:!!$('travel_method').value,
      vehicle_type:$('travel_method').selectedOptions[0]?.textContent || '',
      equipment_notes:$('equipment_notes').value.trim(),
      bank_account_name:$('bank_account_name').value.trim(),
      bank_name:$('bank_name').value.trim(),
      bank_account_last4:$('bank_account_last4').value.trim(),
      notes:$('notes').value.trim(),
      consent_pdpa:$('consent_pdpa').checked,
      consent_terms:$('consent_terms').checked
    };
  }
  function updateDistricts(){
    const province = $('province').value;
    const items = province === 'กรุงเทพมหานคร' ? BANGKOK_DISTRICTS : ['เมือง','พื้นที่ใกล้เคียง','หลายอำเภอ'];
    $('district').innerHTML = options(items, 'เลือกเขต/อำเภอ');
  }
  function showResult(app){
    const code = app.application_code;
    $('applicationCode').textContent = code;
    $('loginGuidance').textContent = `บัญชีช่าง: ใช้เบอร์ ${app.phone} หรือ username ${app.technician_username || '-'} เข้าสู่ระบบ`;
    const qs = `?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(app.phone || '')}`;
    $('statusLink').href = `/partner-status${qs}`;
    $('agreementLink').href = `/partner-agreement?code=${encodeURIComponent(code)}`;
    $('academyLink').href = `/partner-academy?code=${encodeURIComponent(code)}`;
    $('resultBox').style.display = 'block';
    try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code, phone: app.phone || '' })); } catch(e) {}
  }
  $('province').innerHTML = options(PROVINCES, 'เลือกจังหวัด');
  $('work_intent').innerHTML = options(WORK_INTENTS, 'เลือกเป้าหมาย');
  $('travel_method').innerHTML = options(TRAVEL, 'เลือกวิธีเดินทาง');
  chips('workDays', DAYS); chips('jobInterests', JOBS); chips('equipmentList', EQUIPMENT);
  $('province').addEventListener('change', updateDistricts); updateDistricts();
  $('btnReset').addEventListener('click', () => $('applyForm').reset());
  $('applyForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const body = payload();
      if (!body.full_name || !body.phone) throw new Error('กรุณากรอกชื่อและเบอร์โทร');
      if (!body.consent_pdpa || !body.consent_terms) throw new Error('กรุณายอมรับ PDPA และเงื่อนไข');
      const data = await jsonFetch('/partner/apply', { method:'POST', body:JSON.stringify(body) });
      showResult(data.application);
    } catch(err) {
      alert(err.message || 'ส่งใบสมัครไม่สำเร็จ');
    }
  });
})();
