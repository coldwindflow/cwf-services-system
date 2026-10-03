#!/usr/bin/env node
"use strict";

// Runs only inside the deployed Staging app container against its private QA
// loopback process. The branch carrying this file is never merged to release.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pool = require("../db");
const { chromium } = require("/tmp/cwf-air-care-visual-tools/node_modules/playwright-core");
const { baseProviderConfig, jwtSign } = require("../server/customerAuth");
const { QA, assertStagingOnly, makeCustomerPayload, provisionQaIdentity, deleteQaOrders } = require("./stagingQaIdentity");

const CONTEXT = {
  environment: process.env.CWF_ENVIRONMENT,
  containerName: process.env.CWF_STAGING_QA_CONTAINER,
  secret: process.env.CWF_STAGING_QA_SECRET,
};
const BASE = "http://127.0.0.1:3901";
const OUT = "/tmp/cwf-air-care-visual-evidence";
const WIDTHS = [320, 360, 390, 412, 768];
let browser;
let adminAssistedOrder = null;
const evidence = [];

function record(name, data = {}) {
  const entry = { name, ...data };
  evidence.push(entry);
  console.log(`[VISUAL_QA] ${JSON.stringify(entry)}`);
}

async function capture(page, name, { checkDocument = true, checkDialog = false } = {}) {
  const metrics = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog?.getBoundingClientRect();
    const buy = dialog?.querySelector('[data-prepaid-buy]');
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      dialog: box ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom } : null,
      buyCount: buy ? dialog.querySelectorAll('[data-prepaid-buy]').length : 0,
      rawError: /\b(?:PREPAID_SCHEMA_NOT_READY|ORDER_NOT_PAYABLE|STORE_SERVICE_PACKAGE_CATALOG_UNAVAILABLE|HTTP_\d{3})\b/.test(document.body.innerText),
    };
  });
  if (checkDocument) assert.ok(metrics.documentWidth <= metrics.viewport + 2, `${name}: horizontal overflow ${metrics.documentWidth}/${metrics.viewport}`);
  if (checkDialog) {
    assert.ok(metrics.dialog, `${name}: dialog missing`);
    assert.ok(metrics.dialog.left >= -2 && metrics.dialog.right <= metrics.viewport + 2, `${name}: dialog clipped horizontally`);
    assert.equal(metrics.buyCount, 1, `${name}: duplicate purchase CTA`);
  }
  assert.equal(metrics.rawError, false, `${name}: raw internal error visible`);
  const filename = `${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: true, animations: "disabled", timeout: 90000 });
  record(name, { screenshot: filename, ...metrics });
}

async function responsive(page, prefix, options = {}) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 768 ? 900 : 800 });
    if (prefix === "01-store") await page.getByRole("button", { name: /ดูรายละเอียด COLDWINDFLOW AIR CARE — STANDARD/ }).first().waitFor({ state: "visible" });
    await capture(page, `${prefix}-${width}`, options);
  }
  await page.setViewportSize({ width: 390, height: 800 });
}

async function openStoreItem(page, level) {
  await page.getByRole("button", { name: "ร้านค้า" }).click();
  await page.getByRole("button", { name: new RegExp(`ดูรายละเอียด COLDWINDFLOW AIR CARE — ${level}`) }).first().click();
  await page.getByRole("heading", { name: `COLDWINDFLOW AIR CARE — ${level}` }).waitFor();
  await page.getByRole("button", { name: "เลือกแพ็กเกจ", exact: true }).click();
  await page.locator("[data-prepaid-buy]").waitFor();
  await page.locator("[data-prepaid-total]").filter({ hasNotText: "กำลังตรวจสอบ" }).waitFor();
}

async function ensureLocation(page) {
  const summary = page.locator("[data-prepaid-location-summary]");
  if (await summary.isVisible()) return;
  const form = page.locator("[data-prepaid-location-form]");
  if (!(await form.isVisible())) await page.locator("[data-prepaid-add-location]").click();
  await page.locator("[data-prepaid-address]").fill(QA.customerAddress);
  await page.locator("[data-prepaid-pin]").click();
  await page.locator("[data-prepaid-pin-status]").filter({ hasText: "ปักหมุดสำเร็จ" }).waitFor({ timeout: 15000 });
  await page.locator("[data-prepaid-save-location]").click();
  await summary.waitFor({ state: "visible" });
}

async function buy(page) {
  const button = page.locator("[data-prepaid-buy]");
  await button.waitFor({ state: "visible" });
  assert.equal(await button.isEnabled(), true, "purchase CTA should be enabled after valid quote and location");
  await button.click();
  await page.locator(".cwf-prepaid-confirm-code").waitFor({ timeout: 20000 });
  return (await page.locator(".cwf-prepaid-confirm-code").textContent()).trim();
}

async function main() {
  assertStagingOnly(CONTEXT);
  assert.equal(process.env.PORT, "3901", "private QA loopback port required");
  assert.equal(baseProviderConfig(process.env).jwtSecret, CONTEXT.secret, "QA app JWT secret mismatch");
  fs.mkdirSync(OUT, { recursive: true });
  const qa = await provisionQaIdentity({ pool, ...CONTEXT });
  await deleteQaOrders({ pool, ...CONTEXT });
  browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const customer = await browser.newContext({ viewport: { width: 390, height: 800 }, geolocation: { latitude: 13.7563, longitude: 100.5018 }, permissions: ["geolocation"], acceptDownloads: false });
  const token = jwtSign(makeCustomerPayload(), CONTEXT.secret);
  await customer.addCookies([{ name: "cwf_token", value: token, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  const page = await customer.newPage();
  await page.goto(`${BASE}/customer-app/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.CWFCustomerAppV2?.state?.customer?.logged_in === true, null, { timeout: 20000 });
  await page.getByRole("button", { name: "ร้านค้า" }).click();
  await page.getByRole("button", { name: /ดูรายละเอียด COLDWINDFLOW AIR CARE — STANDARD/ }).waitFor();
  await responsive(page, "01-store");

  await page.getByRole("button", { name: /ดูรายละเอียด COLDWINDFLOW AIR CARE — STANDARD/ }).first().click();
  await page.getByRole("heading", { name: "COLDWINDFLOW AIR CARE — STANDARD" }).waitFor();
  await capture(page, "02-standard-detail");
  await page.getByRole("button", { name: "เลือกแพ็กเกจ", exact: true }).click();
  await page.locator("[data-prepaid-buy]").waitFor();
  await page.locator("[data-prepaid-total]").filter({ hasNotText: "กำลังตรวจสอบ" }).waitFor();
  assert.ok((await page.locator("[data-prepaid-contact-summary]").textContent()).includes(QA.customerName), "saved customer not shown");
  await ensureLocation(page);
  for (let n = 0; n < 4; n += 1) await page.locator('[data-prepaid-plus="0"]').click();
  await page.locator("[data-prepaid-total]").filter({ hasText: "2,198" }).waitFor();
  await responsive(page, "03-standard-checkout-q5", { checkDialog: true });
  const cancelledCode = await buy(page);
  assert.match(cancelledCode, /^CWF-/);
  assert.equal(await page.locator("[data-prepaid-line]").count(), 1);
  assert.match(await page.locator("[data-prepaid-line-fallback]").getAttribute("href"), /^https:\/\/line\.me\//);
  await capture(page, "04-order-confirmation");
  await page.locator("[data-prepaid-rights]").click();
  await page.locator('[data-hub-tab="pending"]').waitFor();
  await page.locator(`[data-cancel-order="${cancelledCode}"]`).waitFor();
  await capture(page, "05-service-hub-pending");
  await page.locator(`[data-cancel-order="${cancelledCode}"]`).click();
  await page.locator("[data-prepaid-cancel-confirmation]").waitFor();
  await page.locator("[data-cancel-confirm]").click();
  await page.locator(`[data-cancel-order="${cancelledCode}"]`).waitFor({ state: "detached", timeout: 20000 });
  await page.locator('[data-hub-tab="history"]').click();
  await page.locator("[data-hub-content]").getByText("ยกเลิกแล้ว").first().waitFor();
  await capture(page, "06-unpaid-cancelled");

  await openStoreItem(page, "PREMIUM");
  await page.locator('[data-prepaid-plus="1"]').click({ clickCount: 2 });
  await page.locator("[data-prepaid-total]").filter({ hasText: "2,498" }).waitFor();
  await ensureLocation(page);
  await responsive(page, "07-premium-mixed-checkout", { checkDialog: true });
  await page.locator("[data-prepaid-close]").click();

  // Create one genuine UI-originated pending QA order for Admin visual review.
  await openStoreItem(page, "STANDARD");
  await ensureLocation(page);
  const paidCode = await buy(page);
  await page.locator("[data-prepaid-close]").click();
  record("customer-orders", { cancelled: cancelledCode, pending: paidCode });

  const admin = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await admin.addCookies([{ name: "cwf_session", value: qa.adminSession, url: BASE, httpOnly: true, sameSite: "Lax" }]);
  const adminPage = await admin.newPage();
  await adminPage.goto(`${BASE}/admin-review-v2.html?order=${encodeURIComponent(paidCode)}`, { waitUntil: "domcontentloaded" });
  const card = adminPage.locator(`[data-prepaid-order="${paidCode}"]`);
  await card.waitFor({ timeout: 20000 });
  const pendingText = await card.innerText();
  for (const part of [QA.customerName, QA.customerPhone, QA.customerAddress, "STANDARD", "499", "รอตรวจสอบการชำระเงิน"]) assert.ok(pendingText.includes(part), `Admin pending card missing ${part}`);
  assert.equal(await card.locator("[data-prepaid-confirm]").count(), 1);
  await capture(adminPage, "08-admin-booking-pending");
  adminPage.on("dialog", dialog => { throw new Error(`Native dialog not allowed: ${dialog.type()}`); });
  await card.locator("[data-prepaid-confirm]").click();
  await adminPage.getByRole("dialog").waitFor();
  await capture(adminPage, "09-admin-payment-modal");
  await adminPage.locator('input[name="reference"]').fill("CWF STAGING QA VISUAL ONLY");
  await adminPage.locator("[data-prepaid-ops-submit]").click();
  await card.locator(".prepaid-ops-primary").filter({ hasText: "ลงงานจากสิทธิ์" }).waitFor({ timeout: 20000 });
  assert.ok((await card.innerText()).includes("active"), "active entitlement not visible on card");
  await capture(adminPage, "10-admin-paid-active");
  await card.getByRole("link", { name: "ลงงานจากสิทธิ์" }).click();
  const paidRow = adminPage.locator("tr").filter({ hasText: paidCode });
  await paidRow.locator(`[data-book-right]`).waitFor({ timeout: 20000 });
  await paidRow.locator(`[data-book-right]`).click();
  await adminPage.locator("#bookingCard").waitFor({ state: "visible" });
  for (const field of ["#bookingAppointment", "#bookingAssignMode", "#bookingAddress", "#bookingMapsUrl"]) assert.equal(await adminPage.locator(field).isVisible(), true, `Scheduling field missing: ${field}`);
  await capture(adminPage, "11-admin-entitlement-scheduling");

  await adminPage.goto(`${BASE}/admin-add-v2.html`, { waitUntil: "domcontentloaded" });
  await adminPage.locator('input[name="jobFlowMode"][value="normal"]').waitFor();
  await capture(adminPage, "12-admin-add-normal");
  await adminPage.locator('input[name="jobFlowMode"][value="promotion"]').check();
  await adminPage.locator("#promotionAssistPanel").waitFor({ state: "visible" });
  await adminPage.locator("#promotionAssistBundle option").filter({ hasText: "STANDARD" }).waitFor({ timeout: 20000 });
  await adminPage.locator("#promotionAssistBundle").selectOption("coldwindflow-air-care-standard");
  await adminPage.locator("#customer_name").fill(QA.customerName);
  await adminPage.locator("#customer_phone").fill(QA.customerPhone);
  await adminPage.locator("#address_text").fill(QA.customerAddress);
  await adminPage.locator('[data-promo-qty]').first().fill("1");
  await adminPage.locator("#promotionAssistPrice").click();
  await adminPage.locator("#promotionAssistQuote").filter({ hasText: "499" }).waitFor({ timeout: 20000 });
  await capture(adminPage, "13-admin-add-promotion");

  // This Admin assisted order deliberately uses the QA customer identity.
  // The UI need not submit it here: the pending creation path is already
  // proven by the Staging acceptance runner, and visual mode tests its form.
  record("visual-complete", { result: "PASS", screenshots: evidence.filter(row => row.screenshot).length });
}

(async () => {
  let failed;
  try { await main(); }
  catch (error) { failed = error; console.error(`[VISUAL_QA_FAIL] ${error.stack || error}`); }
  finally {
    try { await browser?.close(); } catch (_) {}
    try {
      const deleted = await deleteQaOrders({ pool, ...CONTEXT });
      record("cleanup", { ...deleted });
    } catch (cleanupError) {
      console.error(`[VISUAL_QA_CLEANUP_FAIL] ${cleanupError.stack || cleanupError}`);
      failed ||= cleanupError;
    }
    fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(evidence, null, 2));
    await pool.end();
  }
  if (failed) process.exitCode = 1;
})();
