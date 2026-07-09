"use strict";

const { orphanPayoutLinesAuditSql } = require("../server/services/technicianPayoutIntegrity");

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const limitArg = argv.find((x) => /^--limit=/.test(x));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 200;
  return {
    run: args.has("--run"),
    json: args.has("--json"),
    allowProductionRead: args.has("--allow-production-read"),
    apply: args.has("--apply"),
    limit: Number.isFinite(limit) ? limit : 200,
  };
}

async function main() {
  const opts = parseArgs();
  const sql = orphanPayoutLinesAuditSql({ limit: opts.limit });

  if (opts.apply) {
    console.error("REPAIR_NOT_IMPLEMENTED: this audit script is read-only and has no repair mode.");
    process.exitCode = 2;
    return;
  }

  if (!opts.run) {
    console.log("Dry run only. Review this read-only SQL; re-run with --run to execute the SELECT.");
    console.log(sql.trim() + ";");
    return;
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "production" && !opts.allowProductionRead) {
    console.error("Refusing production read without --allow-production-read.");
    process.exitCode = 2;
    return;
  }

  const pool = require("../db");
  try {
    const result = await pool.query(sql);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, rows: result.rows || [] }, null, 2));
    } else {
      console.table(result.rows || []);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack || err);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  orphanPayoutLinesAuditSql,
};
