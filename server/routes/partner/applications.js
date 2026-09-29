'use strict';

function registerPartnerApplicationRoutes(app, deps = {}) {
  const {
    pool, normalizePartnerPhone, normalizeJsonArrayInput, normalizePartnerInt,
    normalizePartnerBool, normalizePartnerNumber, ensurePartnerTechnicianAccount,
    generateUniquePartnerApplicationCode, logPartnerOnboardingEvent,
    notifyPartnerAdmins, partnerNotifyTextNewApplication, partnerApplicationPublicShape,
    equipmentChoices = [], workIntents = new Set(), travelMethods = new Set(),
  } = deps;
  if (!app || !pool) throw new Error('partner application route dependencies are required');

  app.post('/partner/apply', async (req, res) => {
    const body = req.body || {};
    const full_name = String(body.full_name || '').trim();
    const phone = normalizePartnerPhone(body.phone);
    const password = String(body.password || '').trim();
    const confirm_password = String(body.confirm_password || '').trim();
    const isTrue = v => v === true || v === 'true' || v === 1 || v === '1';
    const consent_pdpa = isTrue(body.consent_pdpa);
    const consent_terms = isTrue(body.consent_terms);
    const consent_contract_rate = isTrue(body.consent_contract_rate);
    const consent_deposit = isTrue(body.consent_deposit);
    const bank_account_number = String(body.bank_account_number || '').replace(/\D/g, '').slice(0, 15) || null;
    const bank_account_last4 = bank_account_number ? bank_account_number.slice(-4) : (String(body.bank_account_last4 || '').replace(/\D/g, '').slice(-4) || null);
    const tax_id = String(body.tax_id || '').replace(/\D/g, '').slice(0, 13) || null;
    const tax_address = String(body.tax_address || '').trim().slice(0, 1000) || null;
    const tax_branch = String(body.tax_branch || '').trim().slice(0, 100) || null;
    const wht_income_type = String(body.wht_income_type || 'ค่าบริการ/ค่าจ้างทำของ ตามมาตรา 40(8)').trim().slice(0, 255);
    const wht_default_rate = normalizePartnerNumber(body.wht_default_rate, 3);

    if (!full_name) return res.status(400).json({ error: 'กรุณากรอกชื่อ-นามสกุล' });
    if (!phone) return res.status(400).json({ error: 'กรุณากรอกเบอร์โทร' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    if (password !== confirm_password) return res.status(400).json({ error: 'ยืนยันรหัสผ่านไม่ตรงกัน' });
    if (!consent_pdpa || !consent_terms || !consent_contract_rate || !consent_deposit) return res.status(400).json({ error: 'กรุณายอมรับ PDPA เงื่อนไขการสมัคร สัญญาเรทเดียว และเงินประกันก่อนส่งใบสมัคร' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const application_code = await generateUniquePartnerApplicationCode(client);
      const service_zones = normalizeJsonArrayInput(body.service_zones);
      const preferred_job_types = normalizeJsonArrayInput(body.preferred_job_types);
      const equipment_json = normalizeJsonArrayInput(body.equipment_json).filter(x => equipmentChoices.includes(x));
      const preferred_work_days = normalizeJsonArrayInput(body.preferred_work_days);
      const experienceRaw = body.experience_years === '' || body.experience_years == null ? null : Number(body.experience_years);
      const experience_years = Number.isFinite(experienceRaw) ? Math.max(0, experienceRaw) : null;
      const has_vehicle = isTrue(body.has_vehicle);
      const work_intent = workIntents.has(String(body.work_intent || '')) ? String(body.work_intent) : null;
      const travel_method = travelMethods.has(String(body.travel_method || '')) ? String(body.travel_method) : null;
      const account = await ensurePartnerTechnicianAccount(client, { phone, password, fullName: full_name, lineId: body.line_id ? String(body.line_id).trim() : null, applicationCode: application_code });

      const r = await client.query(
        `INSERT INTO public.partner_applications
          (application_code, user_id, technician_username, full_name, phone, line_id, email, address_text,
           service_zones, preferred_job_types, experience_years, has_vehicle, vehicle_type, equipment_notes,
           bank_account_name, bank_name, bank_account_number, bank_account_last4, notes, consent_pdpa, consent_terms, status, submitted_at, updated_at,
           province, district, work_intent, available_days_per_week, preferred_work_days, max_jobs_per_day, max_units_per_day,
           can_accept_urgent_jobs, can_work_condo, can_issue_tax_invoice, has_helper_team, team_size, travel_method,
           service_radius_km, equipment_json, line_user_id, account_created_at, account_note,
           contract_version, contract_accepted_at, contract_accepted_ip, contract_user_agent, contract_acceptance_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'submitted',NOW(),NOW(),
           $22,$23,$24,$25,$26::jsonb,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb,$37,NOW(),$38,
           $39,NOW(),$40,$41,$42::jsonb)
         RETURNING *`,
        [application_code, body.user_id ? String(body.user_id).trim() : null, account.username, full_name, phone,
         body.line_id ? String(body.line_id).trim() : null, body.email ? String(body.email).trim() : null,
         body.address_text ? String(body.address_text).trim() : null, JSON.stringify(service_zones), JSON.stringify(preferred_job_types),
         experience_years, has_vehicle, body.vehicle_type ? String(body.vehicle_type).trim() : null,
         body.equipment_notes ? String(body.equipment_notes).trim() : null, body.bank_account_name ? String(body.bank_account_name).trim() : null,
         body.bank_name ? String(body.bank_name).trim() : null, bank_account_number, bank_account_last4, body.notes ? String(body.notes).trim() : null,
         consent_pdpa, consent_terms, body.province ? String(body.province).trim() : null, body.district ? String(body.district).trim() : null,
         work_intent, normalizePartnerInt(body.available_days_per_week), JSON.stringify(preferred_work_days), normalizePartnerInt(body.max_jobs_per_day),
         normalizePartnerInt(body.max_units_per_day), normalizePartnerBool(body.can_accept_urgent_jobs), normalizePartnerBool(body.can_work_condo),
         normalizePartnerBool(body.can_issue_tax_invoice), normalizePartnerBool(body.has_helper_team), normalizePartnerInt(body.team_size), travel_method,
         normalizePartnerNumber(body.service_radius_km), JSON.stringify(equipment_json), body.line_user_id ? String(body.line_user_id).trim() : null,
         account.created ? 'created_new_technician_account' : 'linked_existing_technician_account', 'partner_single_rate_2026_05',
         req.ip || null, String(req.headers['user-agent'] || '').slice(0, 500),
         JSON.stringify({ consent_terms, consent_contract_rate, consent_deposit, accepted_contract_pdf: '/docs/CWF_partner_contract_single_rate_2026.pdf', accepted_contract_version: 'partner_single_rate_2026_05', accepted_at: new Date().toISOString() })]
      );
      const appRow = r.rows[0];
      await client.query(`UPDATE public.partner_applications SET tax_id=$2, tax_address=$3, tax_branch=$4, wht_income_type=$5, wht_default_rate=$6, updated_at=NOW() WHERE id=$1`,
        [appRow.id, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate]);
      if (tax_id || tax_address) {
        await client.query(`UPDATE public.technician_profiles SET tax_id=COALESCE($2, tax_id), tax_address=COALESCE($3, tax_address), tax_branch=COALESCE($4, tax_branch),
          wht_income_type=COALESCE($5, wht_income_type), wht_default_rate=COALESCE($6, wht_default_rate),
          tax_profile_status=CASE WHEN COALESCE($2,'')<>'' AND COALESCE($3,'')<>'' THEN 'pending_review' ELSE COALESCE(tax_profile_status,'not_submitted') END, updated_at=NOW() WHERE username=$1`,
          [account.username, tax_id, tax_address, tax_branch, wht_income_type, wht_default_rate]);
      }
      await logPartnerOnboardingEvent(client, { application_id: appRow.id, actor_type: 'applicant', event_type: 'application_submitted', to_status: 'submitted',
        note: 'Partner application submitted with partner_single_rate_2026_05 acceptance', metadata: { application_code, technician_username: account.username, account_created: account.created } });
      await client.query('COMMIT');
      notifyPartnerAdmins('partner_application_submitted', partnerNotifyTextNewApplication(appRow), appRow.id).catch(()=>{});
      return res.json({ ok: true, application: partnerApplicationPublicShape(appRow) });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('POST /partner/apply error:', e);
      return res.status(500).json({ error: 'ส่งใบสมัครไม่สำเร็จ' });
    } finally { client.release(); }
  });
}
module.exports = { registerPartnerApplicationRoutes };
