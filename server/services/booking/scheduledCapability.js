"use strict";

const CONFIG_KEY = "customer_homepage_v1";

async function resolveScheduledCapability(pool) {
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
    const enabled = Boolean(
      raw
      && typeof raw === "object"
      && !Array.isArray(raw)
      && raw.scheduled === true
    );
    return { enabled, degraded: false };
  } catch (_) {
    // Public booking is transactional. If the published runtime switch cannot
    // be read, fail closed without exposing storage details or needing a restart.
    return { enabled: false, degraded: true };
  }
}

module.exports = {
  CONFIG_KEY,
  resolveScheduledCapability,
};
