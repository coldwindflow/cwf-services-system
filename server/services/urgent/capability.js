"use strict";

const CONFIG_KEY = "customer_homepage_v1";

async function resolveUrgentCapability(pool) {
  if (!pool || typeof pool.query !== "function") {
    return { enabled: false, degraded: true };
  }
  try {
    const result = await pool.query(
      `SELECT published_config
         FROM public.homepage_cms_configs
        WHERE config_key=$1
        LIMIT 1`,
      [CONFIG_KEY]
    );
    const config = result.rows?.[0]?.published_config;
    const raw = config && typeof config === "object" && !Array.isArray(config)
      ? config.page_availability
      : null;
    // Urgent is a transactional runtime lane, not a legacy page-only default.
    // It opens only for an explicitly published boolean true.
    const enabled = Boolean(
      raw
      && typeof raw === "object"
      && !Array.isArray(raw)
      && raw.urgent === true
    );
    return { enabled, degraded: false };
  } catch (_) {
    // Transactional public capability is fail-closed. Do not expose storage
    // details or require a process restart when the persisted switch changes.
    return { enabled: false, degraded: true };
  }
}

module.exports = {
  CONFIG_KEY,
  resolveUrgentCapability,
};
