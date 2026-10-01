'use strict';

function evaluatePartnerJobEligibility({
  requiredCodes = [],
  certifications = [],
  adminOverride = false,
  requirePreferences = false,
  preferenceOff = [],
  paused = false,
  zoneMatch = true,
} = {}) {
  const codes = (requiredCodes || []).filter(Boolean);
  const statusMap = new Map((certifications || []).map(c => [String(c.code || c.certification_code), String(c.status || '')]));
  const missing = codes.filter(code => statusMap.get(code) !== 'approved');
  const blocked = codes.filter(code => ['suspended', 'revoked'].includes(statusMap.get(code)));
  const normalReady = missing.length === 0
    && (!requirePreferences || (preferenceOff || []).length === 0)
    && (!requirePreferences || paused !== true)
    && (!requirePreferences || zoneMatch === true);
  return {
    eligible: blocked.length === 0 && (adminOverride === true || normalReady),
    missing,
    blocked,
    admin_override: adminOverride === true,
  };
}

module.exports = { evaluatePartnerJobEligibility };
