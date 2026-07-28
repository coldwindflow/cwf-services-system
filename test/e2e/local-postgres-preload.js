"use strict";

// Test-only transport shim for the isolated local PostgreSQL cluster. Production
// db.js intentionally forces TLS for Render; the disposable localhost cluster
// used by E2E has no server certificate. This changes no application source or
// deployment configuration.
if (process.env.CWF_E2E_TEST_MODE === "1") {
  const pg = require("pg");
  const path = require("node:path");
  const OriginalPool = pg.Pool;
  class LocalTestPool extends OriginalPool {
    constructor(config = {}) {
      const local = ["127.0.0.1", "localhost", "::1"].includes(String(config.host || ""));
      super(local ? { ...config, ssl: false } : config);
    }
  }
  pg.Pool = LocalTestPool;

  // Freeze only the booking business clock used by this disposable E2E app.
  // The incident happened at 07:55 Bangkok time; the test must remain
  // executable after that wall-clock time without adding a production hook.
  if (process.env.CWF_E2E_NOW_BANGKOK) {
    const value = String(process.env.CWF_E2E_NOW_BANGKOK);
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00\+07:00$/);
    if (!match) throw new Error("CWF_E2E_NOW_BANGKOK must be an explicit Bangkok timestamp");
    const jobTiming = require(path.join(process.cwd(), "server", "services", "jobTiming"));
    jobTiming.getBangkokNow = () => ({
      ymd: `${match[1]}-${match[2]}-${match[3]}`,
      dateStr: `${match[1]}-${match[2]}-${match[3]}`,
      Y: match[1],
      M: match[2],
      D: match[3],
      hour: Number(match[4]),
      minute: Number(match[5]),
      hh: Number(match[4]),
      mm: Number(match[5]),
      iso: value,
    });
  }
}
