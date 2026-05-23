"use strict";

const {
  parsePayoutId,
  periodBoundsForYm,
  isPeriodCutoffClosed,
} = require("./technicianPayoutPeriods");

async function ensurePayoutPeriodAndSnapshotForPayment({
  pool,
  payout_id,
  actor_username,
  getPayoutPeriod,
  regenerateDraftPayoutContractLines,
  req,
  allowBeforeCutoff = false,
} = {}) {
  const pid = String(payout_id || "").trim();
  if (!pool || !pid || typeof getPayoutPeriod !== "function" || typeof regenerateDraftPayoutContractLines !== "function") {
    const err = new Error("INVALID_PREPAY_CONTEXT");
    err.code = "INVALID_PREPAY_CONTEXT";
    throw err;
  }

  const parsed = parsePayoutId(pid);
  let existing = await getPayoutPeriod(pid);
  if (!existing && !parsed) {
    const err = new Error("PAYOUT_NOT_FOUND");
    err.code = "PAYOUT_NOT_FOUND";
    throw err;
  }

  const bounds = parsed ? periodBoundsForYm(parsed.type, parsed.y, parsed.m) : null;
  const effectivePeriod = existing || {
    payout_id: pid,
    period_type: bounds.period_type,
    period_start: bounds.start.toISOString(),
    period_end: bounds.endEx.toISOString(),
    status: "draft",
  };

  if (!allowBeforeCutoff && !isPeriodCutoffClosed(effectivePeriod)) {
    const err = new Error("PAYOUT_PERIOD_NOT_CLOSED");
    err.code = "PAYOUT_PERIOD_NOT_CLOSED";
    err.period_end = effectivePeriod.period_end;
    throw err;
  }

  if (String(effectivePeriod.status || "draft") === "paid") {
    const err = new Error("PAYOUT_ALREADY_PAID");
    err.code = "PAYOUT_ALREADY_PAID";
    throw err;
  }

  if (String(effectivePeriod.status || "draft") !== "draft") {
    return { period: effectivePeriod, created: false, regenerated: false };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!existing) {
      await client.query(
        `INSERT INTO public.technician_payout_periods(payout_id, period_type, period_start, period_end, status, created_by)
         VALUES($1,$2,$3,$4,'draft',$5)
         ON CONFLICT (payout_id) DO NOTHING`,
        [pid, bounds.period_type, bounds.start.toISOString(), bounds.endEx.toISOString(), actor_username || "system:prepay"]
      );
    }
    const regen = await regenerateDraftPayoutContractLines({
      client,
      payout_id: pid,
      actor_username: actor_username || "system:prepay",
      req,
    });
    await client.query("COMMIT");
    const period = await getPayoutPeriod(pid);
    return { period: period || effectivePeriod, created: !existing, regenerated: true, regen };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  ensurePayoutPeriodAndSnapshotForPayment,
};
