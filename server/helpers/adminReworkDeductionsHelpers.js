module.exports = function createAdminReworkDeductionsHelpers(deps = {}) {
  const pool = deps.pool;
  const deductionTableMetaCache = new Map();

  async function getDeductionTableMeta(tableName) {
    const safe = String(tableName || '').trim();
    if (!/^[a-zA-Z0-9_]+$/.test(safe)) return { exists: false, cols: new Set() };
    const cached = deductionTableMetaCache.get(safe);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) return cached.value;
    try {
      const [existsR, colsR] = await Promise.all([
        pool.query(`SELECT to_regclass($1) AS reg`, [`public.${safe}`]),
        pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [safe]),
      ]);
      const value = {
        exists: !!(existsR.rows && existsR.rows[0] && existsR.rows[0].reg),
        cols: new Set((colsR.rows || []).map(r => String(r.column_name))),
      };
      deductionTableMetaCache.set(safe, { ts: Date.now(), value });
      return value;
    } catch (e) {
      console.error('getDeductionTableMeta failed', safe, e);
      return { exists: false, cols: new Set() };
    }
  }

  function dHas(meta, col) { return !!(meta && meta.cols && meta.cols.has(col)); }
  function dCol(alias, meta, col, fallbackSql) { return dHas(meta, col) ? `${alias}.${col}` : fallbackSql; }
  function dTextCol(alias, meta, col, fallbackSql="''::text") { return dHas(meta, col) ? `COALESCE(${alias}.${col}::text,'')` : fallbackSql; }
  function dSearchParts(alias, meta, cols, paramRef) {
    return cols.filter(c => dHas(meta, c)).map(c => `COALESCE(${alias}.${c}::text,'') ILIKE ${paramRef}`);
  }

  return {
    getDeductionTableMeta,
    dHas,
    dCol,
    dTextCol,
    dSearchParts,
  };
};
