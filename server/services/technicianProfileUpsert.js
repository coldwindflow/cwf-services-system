async function upsertTechnicianProfile(pool, payload) {
  const {
    username,
    technician_code,
    full_name,
    position,
    phone,
    employment_type,
    work_start,
    work_end,
    customer_slot_visible,
    compensation_mode,
    daily_wage_amount,
    monthly_salary_amount,
  } = payload;

  const r = await pool.query(
    `INSERT INTO public.technician_profiles
       (username, technician_code, full_name, position, phone, employment_type, work_start, work_end, customer_slot_visible, compensation_mode, daily_wage_amount, monthly_salary_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (username) DO UPDATE SET
       technician_code = EXCLUDED.technician_code,
       full_name = COALESCE(EXCLUDED.full_name, public.technician_profiles.full_name),
       position = COALESCE(EXCLUDED.position, public.technician_profiles.position),
       phone = COALESCE(EXCLUDED.phone, public.technician_profiles.phone),
       employment_type = COALESCE($6, public.technician_profiles.employment_type),
       work_start = COALESCE($7, public.technician_profiles.work_start),
       work_end = COALESCE($8, public.technician_profiles.work_end),
       customer_slot_visible = COALESCE($9, public.technician_profiles.customer_slot_visible),
       compensation_mode = COALESCE($10, public.technician_profiles.compensation_mode),
       daily_wage_amount = COALESCE($11, public.technician_profiles.daily_wage_amount),
       monthly_salary_amount = COALESCE($12, public.technician_profiles.monthly_salary_amount),
       updated_at = CURRENT_TIMESTAMP
     RETURNING username, employment_type, customer_slot_visible`,
    [
      username,
      technician_code,
      full_name || null,
      position,
      phone || null,
      employment_type ? String(employment_type).toLowerCase() : null,
      work_start,
      work_end,
      customer_slot_visible,
      compensation_mode,
      daily_wage_amount,
      monthly_salary_amount,
    ]
  );
  return r.rows[0];
}

module.exports = { upsertTechnicianProfile };
