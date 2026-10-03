"use strict";

const crypto = require("node:crypto");

const LINE_USER_ID = /^U[0-9a-f]{32}$/i;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const CLAIM_LEASE_MS = 30 * 1000;

function tokenFrom(env) {
  return String(env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || env.LINE_CHANNEL_ACCESS_TOKEN
    || env.LINE_BOT_CHANNEL_ACCESS_TOKEN || "").trim();
}

function parseItems(value) {
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return []; }
}

function orderMessage(order) {
  const items = parseItems(order.items);
  const snapshot = typeof order.service_entitlement_snapshot === "string"
    ? JSON.parse(order.service_entitlement_snapshot) : order.service_entitlement_snapshot || {};
  const groups = Array.isArray(snapshot.service_package_groups) ? snapshot.service_package_groups : [];
  const title = Array.isArray(items) && items[0]?.item_name ? items[0].item_name
    : String(snapshot.bundle_key || "โปรโมชั่น COLDWINDFLOW").replace(/-/g, " ");
  const quantity = groups.reduce((sum, group) => sum + Number(group.quantity || 0), 0);
  return ["COLDWINDFLOW", `เลขคำสั่งซื้อ: ${order.order_code}`, `แพ็กเกจ: ${title}`,
    `จำนวน: ${quantity} เครื่อง`, `ยอด: ${Number(order.subtotal).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`,
    "สถานะ: รอชำระเงิน", "กรุณาแจ้งชำระเงินสำหรับคำสั่งซื้อนี้"].join("\n");
}

async function claimOrder(pool, orderCode, customerSub, now) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT order_id, order_code, customer_sub, status, items, service_entitlement_snapshot,
              subtotal, prepaid_line_notification_status, prepaid_line_notification_attempted_at,
              prepaid_line_notification_retry_key
         FROM public.customer_orders
        WHERE order_code=$1 AND customer_sub=$2 AND order_kind='service_prepaid'
        FOR UPDATE`, [orderCode, customerSub]);
    const order = result.rows?.[0];
    if (!order || order.status !== "pending_payment") { await client.query("COMMIT"); return null; }
    const status = String(order.prepaid_line_notification_status || "");
    const lastAttempt = order.prepaid_line_notification_attempted_at
      ? new Date(order.prepaid_line_notification_attempted_at).getTime() : 0;
    if (["sent", "failed_permanent", "unknown_after_window"].includes(status)
        || (lastAttempt && now - lastAttempt < CLAIM_LEASE_MS)) { await client.query("COMMIT"); return null; }
    if (lastAttempt && now - lastAttempt >= RETRY_WINDOW_MS) {
      await client.query(`UPDATE public.customer_orders SET prepaid_line_notification_status='unknown_after_window' WHERE order_id=$1`, [order.order_id]);
      await client.query("COMMIT");
      return null;
    }
    const retryKey = order.prepaid_line_notification_retry_key || crypto.randomUUID();
    await client.query(
      `UPDATE public.customer_orders SET prepaid_line_notification_status='sending',
              prepaid_line_notification_attempted_at=NOW(), prepaid_line_notification_retry_key=$2,
              prepaid_line_notification_error=NULL WHERE order_id=$1`, [order.order_id, retryKey]);
    await client.query("COMMIT");
    return { order, retryKey };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function notifyPrepaidOrder({ pool, env = process.env, fetchImpl = globalThis.fetch, orderCode, customerSub, now = Date.now() }) {
  const token = tokenFrom(env);
  if (!token || env.PREPAID_LINE_MESSAGING_PROVIDER_CONFIRMED !== "true" || !orderCode || !customerSub) {
    return { status: "fallback" };
  }
  const identity = await pool.query(
    `SELECT provider_subject FROM public.customer_identities
      WHERE customer_sub=$1 AND provider='line' ORDER BY last_login_at DESC LIMIT 1`, [customerSub]);
  const lineUserId = String(identity.rows?.[0]?.provider_subject || "").trim();
  if (!LINE_USER_ID.test(lineUserId)) return { status: "fallback" };
  const claimed = await claimOrder(pool, orderCode, customerSub, now);
  if (!claimed) return { status: "already_handled" };
  let status = "retryable";
  let errorText = null;
  try {
    const response = await fetchImpl("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "X-Line-Retry-Key": claimed.retryKey },
      body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: orderMessage(claimed.order) }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok || (response.status === 409 && response.headers?.get("x-line-accepted-request-id"))) status = "sent";
    else {
      status = response.status >= 500 || response.status === 429 ? "retryable" : "failed_permanent";
      errorText = `LINE_HTTP_${response.status}`;
    }
  } catch (error) { errorText = String(error?.code || error?.name || "LINE_REQUEST_FAILED"); }
  await pool.query(
    `UPDATE public.customer_orders SET prepaid_line_notification_status=$3,
            prepaid_line_notification_error=$4
      WHERE order_code=$1 AND customer_sub=$2 AND prepaid_line_notification_retry_key=$5`,
    [orderCode, customerSub, status, errorText, claimed.retryKey]);
  return { status };
}

module.exports = { notifyPrepaidOrder, orderMessage, LINE_USER_ID };
