module.exports = function createTechnicianBaseStatusDataHelpers(deps = {}) {
  const pool = deps.pool;

  async function getTechnicianForStatus(username) {
    const r = await pool.query(
      `SELECT u.username, u.role, COALESCE(p.full_name, u.full_name, u.username) AS full_name,
              p.technician_code, p.position, p.photo_path, p.phone,
              COALESCE(p.employment_type,'company') AS employment_type,
              p.rating, p.grade, p.done_count
       FROM public.users u
       LEFT JOIN public.technician_profiles p ON p.username=u.username
       WHERE u.username=$1 AND u.role='technician'
       LIMIT 1`,
      [username]
    );
    return (r.rows || [])[0] || null;
  }

  async function getLatestBaseStatus(username, opts = {}) {
    const values = [username];
    let where = `technician_username=$1`;
    if (opts.review_status) {
      values.push(String(opts.review_status));
      where += ` AND COALESCE(review_status,'verified')=$${values.length}`;
    }
    const r = await pool.query(
      `SELECT * FROM public.technician_base_status_assessments
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT 1`,
      values
    );
    return (r.rows || [])[0] || null;
  }

  return {
    getTechnicianForStatus,
    getLatestBaseStatus,
  };
};
