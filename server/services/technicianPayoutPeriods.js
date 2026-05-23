"use strict";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bkkNow(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.getTime() + BANGKOK_OFFSET_MS);
}

function bkkYmd(date = new Date()) {
  const d = bkkNow(date);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

function bangkokMidnightUTC(y, m, d) {
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0) - BANGKOK_OFFSET_MS);
}

function addMonths(y, m, delta) {
  const base = new Date(Date.UTC(Number(y), Number(m) - 1 + Number(delta || 0), 1));
  return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1 };
}

function periodBoundsForYm(type, y, m) {
  const t = String(type || "").trim();
  const yy = Number(y), mm = Number(m);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) {
    const err = new Error("INVALID_YM");
    err.code = "INVALID_YM";
    throw err;
  }
  if (t === "10") {
    const prev = addMonths(yy, mm, -1);
    const start = bangkokMidnightUTC(prev.y, prev.m, 16);
    const endEx = bangkokMidnightUTC(yy, mm, 1);
    return { period_type: "10", start, endEx, label_ym: `${yy}-${String(mm).padStart(2, "0")}` };
  }
  if (t === "25") {
    const start = bangkokMidnightUTC(yy, mm, 1);
    const endEx = bangkokMidnightUTC(yy, mm, 16);
    return { period_type: "25", start, endEx, label_ym: `${yy}-${String(mm).padStart(2, "0")}` };
  }
  const err = new Error("INVALID_PERIOD_TYPE");
  err.code = "INVALID_PERIOD_TYPE";
  throw err;
}

function parsePayoutId(payoutId) {
  const s = String(payoutId || "").trim();
  const m = /^payout_(\d{4})-(\d{2})_(10|25)$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), type: String(m[3]) };
}

function payoutIdFromBounds(bounds) {
  return `payout_${bounds.label_ym}_${bounds.period_type}`;
}

function dueDateUTCFromPeriodDef(def) {
  const end = def && (def.period_end || def.endEx);
  const type = String(def && def.period_type || "").trim();
  const d = end instanceof Date ? end : new Date(end);
  if (!end || Number.isNaN(d.getTime()) || !["10", "25"].includes(type)) return null;
  const bkk = bkkNow(d);
  return bangkokMidnightUTC(bkk.getUTCFullYear(), bkk.getUTCMonth() + 1, type === "25" ? 25 : 10);
}

function buildPayoutPeriodDef(type, y, m, extra = {}) {
  const b = periodBoundsForYm(type, y, m);
  const payout_id = payoutIdFromBounds(b);
  const due = dueDateUTCFromPeriodDef({ ...b, period_end: b.endEx });
  return {
    payout_id,
    period_type: b.period_type,
    period_start: b.start.toISOString(),
    period_end: b.endEx.toISOString(),
    start: b.start,
    endEx: b.endEx,
    label_ym: b.label_ym,
    due_date: due ? due.toISOString() : null,
    is_virtual: true,
    ...extra,
  };
}

function buildAccountingPayoutCalendar({ now = new Date(), pastMonths = 2, futureMonths = 2 } = {}) {
  const cur = bkkYmd(now);
  const out = [];
  for (let delta = -Math.max(0, Number(pastMonths || 0)); delta <= Math.max(0, Number(futureMonths || 0)); delta += 1) {
    const ym = addMonths(cur.y, cur.m, delta);
    out.push(buildPayoutPeriodDef("25", ym.y, ym.m));
    out.push(buildPayoutPeriodDef("10", ym.y, ym.m));
  }
  const seen = new Set();
  return out
    .filter((p) => {
      if (!p || seen.has(p.payout_id)) return false;
      seen.add(p.payout_id);
      return true;
    })
    .sort((a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime());
}

function isPeriodCutoffClosed(period, now = new Date()) {
  const end = period && (period.period_end || period.endEx);
  const d = end instanceof Date ? end : new Date(end);
  if (!end || Number.isNaN(d.getTime())) return false;
  return d.getTime() <= new Date(now).getTime();
}

module.exports = {
  BANGKOK_OFFSET_MS,
  bkkNow,
  bkkYmd,
  bangkokMidnightUTC,
  addMonths,
  periodBoundsForYm,
  parsePayoutId,
  payoutIdFromBounds,
  dueDateUTCFromPeriodDef,
  buildPayoutPeriodDef,
  buildAccountingPayoutCalendar,
  isPeriodCutoffClosed,
};
