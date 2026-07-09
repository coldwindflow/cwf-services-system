"use strict";

const { orphanPayoutLinesAuditSql, positiveInteger } = require("../server/services/technicianPayoutIntegrity");

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const limitArg = argv.find((x) => /^--limit=/.test(x));
  return {
    run: args.has("--run"),
    json: args.has("--json"),
    apply: args.has("--apply"),
    limit: positiveInteger(limitArg ? limitArg.split("=")[1] : 200, 200, 10000),
  };
}

function shouldRefuseProductionExecution(env = process.env) {
  return String(env.NODE_ENV || "").toLowerCase() === "production";
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

  if (shouldRefuseProductionExecution()) {
    console.error("Refusing production execution. This read-only audit must run only against a non-production copy.");
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
  shouldRefuseProductionExecution,
  orphanPayoutLinesAuditSql,
};
