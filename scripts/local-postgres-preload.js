"use strict";

// Local/home-server PostgreSQL runs on a private Docker network without TLS.
// Some legacy migration modules force ssl=true because Render requires TLS.
// DB_SSL=false activates this compatibility shim before application imports pg.
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

  class LocalPool extends OriginalPool {
    constructor(config = {}) {
      super(withoutSsl(config));
    }
  }

  class LocalClient extends OriginalClient {
    constructor(config = {}) {
      super(withoutSsl(config));
    }
  }

  pg.Pool = LocalPool;
  pg.Client = LocalClient;
}
