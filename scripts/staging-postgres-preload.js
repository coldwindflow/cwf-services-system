"use strict";

// Staging-only transport shim.
// The production migration runners force TLS because Render requires it, while
// the isolated PostgreSQL container on the home server intentionally uses the
// private Docker network without TLS. DB_SSL=false activates this shim before
// application modules import pg.
if (String(process.env.DB_SSL || "").trim().toLowerCase() === "false") {
  const pg = require("pg");
  const OriginalPool = pg.Pool;
  const OriginalClient = pg.Client;

  function withoutSsl(config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return config;
    }
    return { ...config, ssl: false };
  }

  class StagingPool extends OriginalPool {
    constructor(config = {}) {
      super(withoutSsl(config));
    }
  }

  class StagingClient extends OriginalClient {
    constructor(config = {}) {
      super(withoutSsl(config));
    }
  }

  pg.Pool = StagingPool;
  pg.Client = StagingClient;
}
