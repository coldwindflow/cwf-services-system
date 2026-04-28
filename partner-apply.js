(function(){
  const PROVINCES = ['กรุงเทพมหานคร','สมุทรปราการ','นนทบุรี','ปทุมธานี','สมุทรสาคร','นครปฐม','ฉะเชิงเทรา'];
  const DISTRICTS_BY_PROVINCE = {
    'กรุงเทพมหานคร':['พระโขนง','บางนา','วัฒนา','คลองเตย','สวนหลวง','ประเวศ','บางกะปิ','ห้วยขวาง','ดินแดง','ราชเทวี','ปทุมวัน','สาทร','บางรัก','ยานนาวา','ลาดพร้าว','จตุจักร','หลักสี่','ดอนเมือง','สายไหม','บางเขน','มีนบุรี','ลาดกระบัง','หนองจอก','คันนายาว','บึงกุ่ม','สะพานสูง','วังทองหลาง','จอมทอง','ธนบุรี','บางกอกใหญ่','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ภาษีเจริญ','บางแค','หนองแขม','บางบอน','บางขุนเทียน','ราษฎร์บูรณะ','ทุ่งครุ','บางซื่อ','ดุสิต','พญาไท'],
    'สมุทรปราการ':['เมืองสมุทรปราการ','บางบ่อ','บางพลี','พระประแดง','พระสมุทรเจดีย์','บางเสาธง'],
    'นนทบุรี':['เมืองนนทบุรี','บางกรวย','บางใหญ่','บางบัวทอง','ไทรน้อย','ปากเกร็ด'],
    'ปทุมธานี':['เมืองปทุมธานี','คลองหลวง','ธัญบุรี','หนองเสือ','ลาดหลุมแก้ว','ลำลูกกา','สามโคก'],
    'สมุทรสาคร':['เมืองสมุทรสาคร','กระทุ่มแบน','บ้านแพ้ว'],
    'นครปฐม':['เมืองนครปฐม','กำแพงแสน','นครชัยศรี','ดอนตูม','บางเลน','สามพราน','พุทธมณฑล'],
    'ฉะเชิงเทรา':['เมืองฉะเชิงเทรา','บางคล้า','บางน้ำเปรี้ยว','บางปะกง','บ้านโพธิ์','พนมสารคาม','ราชสาส์น','สนามชัยเขต','แปลงยาว','ท่าตะเกียบ','คลองเขื่อน']
  };
  const WORK_INTENTS = [['full_time_with_cwf','ตั้งใจทำงานกับ CWF เป็นหลัก'],['part_time_extra_income','รับเสริม/หารายได้เพิ่ม'],['has_regular_job_accept_extra','มีงานประจำ รับงานนอกเวลา']];
  const TRAVEL = [['motorcycle','มอเตอร์ไซค์'],['car','รถยนต์'],['pickup','รถกระบะ'],['van','รถตู้'],['public_transport','ขนส่งสาธารณะ']];
  const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์'];
  const JOBS = [['clean_wall_normal','ล้างแอร์ผนังปกติ'],['clean_wall_premium','ล้างแอร์ผนังพรีเมียม'],['clean_wall_hanging_coil','ล้างแขวนคอยล์'],['clean_wall_overhaul','ตัดล้างใหญ่'],['clean_ceiling_suspended','ล้างแอร์แขวน/เปลือยใต้ฝ้า'],['clean_cassette_4way','ล้างแอร์สี่ทิศทาง'],['clean_duct_type','ล้างแอร์ท่อลม'],['repair_diagnosis_basic','ตรวจเช็กอาการ'],['repair_water_leak','แก้น้ำรั่ว'],['repair_electrical_basic','งานไฟฟ้าเบื้องต้น'],['repair_refrigerant_basic','เติมน้ำยา/ระบบน้ำยา'],['repair_parts_replacement','เปลี่ยนอะไหล่'],['install_wall_standard','ติดตั้งแอร์ผนัง'],['install_condo','ติดตั้งคอนโด'],['install_relocation','ย้ายแอร์']];
  const EQUIPMENT = ['มีครบพร้อมทำงาน','ปั๊มน้ำแรงดัน','เครื่องฉีดน้ำแรงดัน','ผ้าใบรองน้ำ','ถังรองน้ำ','กระบอกฉีดน้ำยา','น้ำยาล้างคอยล์','แปรงล้างแอร์','ถุงล้างแอร์','เครื่องเป่าลม','เครื่องดูดฝุ่น/ดูดน้ำ','บันได','สว่าน','ไขควง/ชุดเครื่องมือช่าง','ประแจ/คีม/คัตเตอร์','มัลติมิเตอร์','แคลมป์มิเตอร์','เกจ์วัดน้ำยาแอร์','เครื่องชั่งน้ำยา','แวคคั่มปั๊ม','ถังน้ำยา','เครื่องเชื่อม/ชุดเชื่อมท่อทองแดง','คัตเตอร์ตัดท่อ','บานแฟร์','ทอร์คประแจ','ปั๊มน้ำทิ้ง','อุปกรณ์ติดตั้งรางครอบท่อ','ชุด PPE / ถุงมือ / แว่นตา','ยูนิฟอร์มสุภาพพร้อมเข้าหน้างาน'];
  const $ = id => document.getElementById(id);

  function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function options(items, placeholder){ return `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${items.map(x => Array.isArray(x) ? `<option value="${esc(x[0])}">${esc(x[1])}</option>` : `<option value="${esc(x)}">${esc(x)}</option>`).join('')}`; }
  function chips(id, items){ $(id).innerHTML = items.map(x => { const value = Array.isArray(x) ? x[0] : x; const label = Array.isArray(x) ? x[1] : x; return `<label class="chip"><input type="checkbox" value="${esc(value)}"><span>${esc(label)}</span></label>`; }).join(''); }
  function checked(id){ return Array.from($(id).querySelectorAll('input:checked')).map(x => x.value); }
  function showMessage(text, type){ const el=$('formMessage'); if(!text){ el.className='msg'; el.textContent=''; return; } el.className=`msg ${type === 'ok' ? 'ok' : 'err'}`; el.textContent=text; el.scrollIntoView({behavior:'smooth', block:'center'}); }
  async function jsonFetch(url, opts = {}) { const res = await fetch(url, { ...opts, headers:{'Content-Type':'application/json', ...(opts.headers || {})} }); const data = await res.json().catch(()=>null); if (!res.ok) throw new Error(data?.error || data?.message || 'Request failed'); return data; }
  function payload(){
    const province = $('province').value;
    const district = $('district').value;
    const hasHelper = $('work_mode').value === 'has_helper';
    return {
      full_name:$('full_name').value.trim(), phone:$('phone').value.trim(), password:$('password').value, confirm_password:$('confirm_password').value,
      line_id:$('line_id').value.trim(), email:$('email').value.trim(), address_text:$('address_text').value.trim(), province, district,
      service_zones:[province, district].filter(Boolean), work_intent:$('work_intent').value,
      available_days_per_week:$('available_days_per_week').value, preferred_work_days:checked('workDays'),
      max_jobs_per_day:$('max_jobs_per_day').value, max_units_per_day:$('max_units_per_day').value,
      can_accept_urgent_jobs:$('can_accept_urgent_jobs').checked, can_work_condo:$('can_work_condo').checked, can_issue_tax_invoice:$('can_issue_tax_invoice').checked,
      has_helper_team:hasHelper, team_size:hasHelper ? $('team_size').value : '', travel_method:$('travel_method').value,
      service_radius_km:$('service_radius_km').value, preferred_job_types:checked('jobInterests'), equipment_json:checked('equipmentList'),
      experience_years:$('experience_years').value, has_vehicle:!!$('travel_method').value, vehicle_type:$('travel_method').selectedOptions[0]?.textContent || '',
      equipment_notes:$('equipment_notes').value.trim(), bank_account_name:$('bank_account_name').value.trim(), bank_name:$('bank_name').value.trim(),
      bank_account_last4:$('bank_account_last4').value.trim(), notes:$('notes').value.trim(), consent_pdpa:$('consent_pdpa').checked, consent_terms:$('consent_terms').checked
    };
  }
  function updateDistricts(){ const province = $('province').value; const items = DISTRICTS_BY_PROVINCE[province] || []; $('district').innerHTML = options(items, 'เลือกเขต/อำเภอ'); }
  function updateHelperPanel(){ $('helperPanel').classList.toggle('show', $('work_mode').value === 'has_helper'); }
  function showResult(app){ const code = app.application_code; $('applicationCode').textContent = code; $('loginGuidance').textContent = `บัญชีช่าง: ใช้เบอร์ ${app.phone} หรือ username ${app.technician_username || '-'} เข้าสู่ระบบ`; const qs = `?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(app.phone || '')}`; $('statusLink').href = `/partner-status${qs}`; $('agreementLink').href = `/partner-agreement?code=${encodeURIComponent(code)}`; $('academyLink').href = `/partner-academy?code=${encodeURIComponent(code)}`; $('resultBox').style.display = 'block'; try { sessionStorage.setItem('cwf_partner_ref', JSON.stringify({ code, phone: app.phone || '' })); } catch(e) {} $('resultBox').scrollIntoView({behavior:'smooth', block:'center'}); }
  $('province').innerHTML = options(PROVINCES, 'เลือกจังหวัด'); $('work_intent').innerHTML = options(WORK_INTENTS, 'เลือกเป้าหมาย'); $('travel_method').innerHTML = options(TRAVEL, 'เลือกวิธีเดินทาง'); chips('workDays', DAYS); chips('jobInterests', JOBS); chips('equipmentList', EQUIPMENT);
  $('province').addEventListener('change', updateDistricts); updateDistricts(); $('work_mode').addEventListener('change', updateHelperPanel); updateHelperPanel();
  $('btnReset').addEventListener('click', () => { $('applyForm').reset(); updateDistricts(); updateHelperPanel(); showMessage('', ''); $('resultBox').style.display='none'; });
  $('applyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('submitBtn');
    try {
      showMessage('', ''); btn.disabled = true; btn.textContent = 'กำลังส่งใบสมัคร...';
      const body = payload();
      if (!body.full_name || !body.phone) throw new Error('กรุณากรอกชื่อและเบอร์โทร');
      if (!body.password || body.password.length < 6) throw new Error('กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร');
      if (body.password !== body.confirm_password) throw new Error('ยืนยันรหัสผ่านไม่ตรงกัน');
      if (!body.province || !body.district) throw new Error('กรุณาเลือกจังหวัดและเขต/อำเภอ');
      if (!body.consent_pdpa || !body.consent_terms) throw new Error('กรุณายอมรับ PDPA และเงื่อนไข');
      const data = await jsonFetch('/partner/apply', { method:'POST', body:JSON.stringify(body) });
      showMessage('ส่งใบสมัครสำเร็จ สร้างบัญชีช่างเรียบร้อย', 'ok'); showResult(data.application);
    } catch(err) { showMessage(err.message || 'ส่งใบสมัครไม่สำเร็จ', 'err'); }
    finally { btn.disabled = false; btn.textContent = 'ส่งใบสมัครและสร้างบัญชี'; }
  });
})();
