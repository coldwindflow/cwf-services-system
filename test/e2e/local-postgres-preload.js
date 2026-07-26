"use strict";

// Test-only transport shim for the isolated local PostgreSQL cluster. Production
// db.js intentionally forces TLS for Render; the disposable localhost cluster
// used by E2E has no server certificate. This changes no application source or
// deployment configuration.
if (process.env.CWF_E2E_TEST_MODE === "1") {
  const pg = require("pg");
  const OriginalPool = pg.Pool;
  class LocalTestPool extends OriginalPool {
    constructor(config = {}) {
      const local = ["127.0.0.1", "localhost", "::1"].includes(String(config.host || ""));
      super(local ? { ...config, ssl: false } : config);
    }
  }
  pg.Pool = LocalTestPool;
}
