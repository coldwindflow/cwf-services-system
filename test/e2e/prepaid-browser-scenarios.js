"use strict";

// Only called by run-booking-e2e inside its newly created disposable database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { jwtSign } = require("../../server/customerAuth");

module.exports = async function prepaidBrowser({ pool, browser, base, adminSession, tomorrow,
  customerContext, fillContactStep, pickDateAndSlot, nextStep, submitAndWaitSuccess }) {
  const database = (await pool.query("SELECT current_database() AS name")).rows[0].name;
  assert.match(database, /^cwf_e2e_\d+$/);
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const root = path.resolve(__dirname, "../..");
  for (const file of ["scripts/sql/20260906_prepaid_service_entitlements.sql", "data-seeds/20260930_cwf_air_care.sql"]) {
    await pool.query(fs.readFileSync(path.join(root, file), "utf8"));
  }
  const catalog = (await pool.query("SELECT item_id FROM public.catalog_items WHERE service_bundle_key='coldwindflow-air-care-standard'")).rows[0];
  assert.ok(catalog);
  const customerSub = "qa:e2e:prepaid-browser";
  const tokenFor = (sub) => jwtSign({ sub, name: "QA PREPAID", provider: "qa_staging", provider_sub: sub,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }, "e2e-test-secret");
  const token = tokenFor(customerSub);
  const cookie = `cwf_token=${token}`;
  async function request(url, { method = "GET", body, auth = cookie, expected = [200] } = {}) {
    const response = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", cookie: auth },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.ok(expected.includes(response.status), `${method} ${url}: ${response.status}/${data.code || data.error}`);
    return data;
  }
  let purchase = { catalog_item_id: Number(catalog.item_id),
    service_package_groups: [{ package_key: "coldwindflow-air-care-standard-small", btu: 12000, quantity: 2 }],
    customer_name: "QA PREPAID", customer_phone: "0800000382", address_text: "QA ONLY Bangkok",
    maps_url: "https://www.google.com/maps?q=13.7563,100.5018", gps_latitude: 13.7563, gps_longitude: 100.5018,
    purchase_request_key: "qa_browser_purchase_20261121" };
  const closed = await request("/public/prepaid-orders/quote", { method: "POST", body: purchase, expected: [404] });
  assert.equal(closed.code, "SERVICE_PACKAGE_NOT_AVAILABLE");
  // Synthetic dates in this newly created DB only. The real seed stays closed.
  await pool.query(`UPDATE public.catalog_items SET service_package_sell_start_at=NOW()-INTERVAL '1 day',
    service_package_sell_end_at=NOW()+INTERVAL '1 day', service_package_redeem_until=NOW()+INTERVAL '90 days'
    WHERE item_id=$1`, [catalog.item_id]);
  const purchaseContext = await customerContext(360);
  await purchaseContext.addCookies([{ name: "cwf_token", value: token, url: base, httpOnly: true }]);
  const purchasePage = await purchaseContext.newPage();
  let created;
  try {
    await purchasePage.goto(`${base}/customer-app/index.html#storeItem-${catalog.item_id}`);
    await purchasePage.locator("[data-store-detail-book]").click();
    await purchasePage.locator('[data-prepaid-plus="0"]').click();
    await purchasePage.locator("[data-prepaid-name]").fill(purchase.customer_name);
    await purchasePage.locator("[data-prepaid-phone]").fill(purchase.customer_phone);
    await purchasePage.locator("[data-prepaid-address]").fill(purchase.address_text);
    await purchasePage.locator("[data-prepaid-maps]").fill(purchase.maps_url);
    await purchasePage.waitForFunction(() => document.querySelector("[data-prepaid-buy]")?.disabled === false);
    const submitted = purchasePage.waitForRequest((req) => req.url() === `${base}/public/prepaid-orders` && req.method() === "POST");
    const response = purchasePage.waitForResponse((res) => res.url() === `${base}/public/prepaid-orders` && res.request().method() === "POST");
    await purchasePage.locator("[data-prepaid-buy]").click();
    purchase = (await submitted).postDataJSON();
    const result = await response;
    assert.equal(result.status(), 201);
    created = await result.json();
    await purchasePage.waitForFunction((code) => document.body.textContent.includes(code), created.order.order_code);
    assert.equal(Number(created.order.subtotal), 899);
    assert.equal((await request("/public/service-rights")).items.length, 0, "pending payment must not activate a right");
  } catch (error) {
    await purchasePage.screenshot({ path: path.join(__dirname, "prepaid-purchase-failure.png"), fullPage: true });
    throw error;
  } finally { await purchaseContext.close(); }
  const replayed = await request("/public/prepaid-orders", { method: "POST", body: purchase, expected: [200, 201] });
  assert.equal(replayed.order.order_code, created.order.order_code);
  const code = created.order.order_code;
  const pay = { reference: "QA-BROWSER-NO-REAL-PAYMENT", confirmed_amount: Number(created.order.subtotal) };
  const adminAuth = `cwf_session=${adminSession}`;
  const paid = await request(`/admin/prepaid-orders/${code}/confirm-payment`, { method: "POST", body: pay, auth: adminAuth });
  const payAgain = await request(`/admin/prepaid-orders/${code}/confirm-payment`, { method: "POST", body: pay, auth: adminAuth });
  assert.equal(payAgain.replayed, true);
  const rightCode = paid.entitlement.entitlement_code;
  await pool.query("UPDATE public.catalog_items SET service_package_sell_end_at=NOW()-INTERVAL '1 day' WHERE item_id=$1", [catalog.item_id]);
  const other = await request("/public/service-rights", { auth: `cwf_token=${tokenFor("qa:e2e:other")}` });
  assert.equal(other.items.some((right) => right.entitlement_code === rightCode), false);
  await request(`/public/service-rights/${rightCode}/begin-redemption`, {
    method: "POST", body: {}, auth: `cwf_token=${tokenFor("qa:e2e:other")}`, expected: [404] });
  const context = await customerContext(360);
  await context.addCookies([{ name: "cwf_token", value: token, url: base, httpOnly: true }]);
  let page = await context.newPage();
  try {
    await page.goto(`${base}/customer-app/index.html#tracking`);
    await page.locator('[data-hub-tab="active"]').click();
    assert.ok(await page.locator('[data-hub-tab="active"]').evaluate((button) => button.scrollWidth <= button.clientWidth + 1), "mobile tab label must fit its tap target");
    await page.screenshot({ path: path.join(__dirname, "prepaid-hub-360.png"), fullPage: true });
    await page.waitForSelector(`[data-use-right="${rightCode}"]`, { timeout: 20000 });
    await page.locator(`[data-use-right="${rightCode}"]`).first().click();
    await page.waitForFunction(() => window.CWFCustomerAppV2.state.scheduledPreview.calendar.status === "success");
    const key = await page.evaluate(() => window.CWFCustomerAppV2.state.draft.scheduled.scheduled_request_key);
    await page.reload();
    await page.waitForFunction(() => window.CWFCustomerAppV2.state.scheduledPreview.calendar.status === "success");
    assert.equal(await page.evaluate(() => window.CWFCustomerAppV2.state.draft.scheduled.scheduled_request_key), key);
    assert.equal(await page.evaluate(() => window.CWFCustomerAppV2.state.scheduledPreview.pricing.data.fixed_total_price), Number(created.order.subtotal));
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}`);
      await page.screenshot({ path: path.join(__dirname, `prepaid-recovery-${width}.png`), fullPage: true });
    }
    await fillContactStep(page, { name: purchase.customer_name, phone: purchase.customer_phone, address: purchase.address_text });
    await pickDateAndSlot(page, tomorrow);
    await page.locator('[data-time-proposal="false"]').first().dispatchEvent("click");
    await nextStep(page);
    // The paid booking commits but the phone loses its response. Recovery must
    // return the existing confirmation, preserving the original paid capability.
    await page.route("**/public/book", async (route) => {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("connectionreset");
    });
    await page.locator('[data-action="submit-scheduled"]').dispatchEvent("click");
    await page.waitForFunction(() => window.CWFCustomerAppV2.state.scheduledSubmit.status === "error");
    await page.unroute("**/public/book");
    await page.reload();
    await page.waitForSelector('[data-action="submit-scheduled"]');
    const bookingCode = await submitAndWaitSuccess(page);
    const jobs = (await pool.query(`SELECT j.* FROM public.jobs j JOIN public.customer_service_entitlements e
      ON e.entitlement_id=j.prepaid_entitlement_id WHERE e.entitlement_code=$1`, [rightCode])).rows;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].booking_code, bookingCode);
    assert.equal(jobs[0].payment_source, "prepaid_entitlement");
    assert.equal(Number(jobs[0].customer_due), 0);
    assert.ok(jobs[0].technician_username);
    const counts = (await pool.query(`SELECT COUNT(*)::int AS n FROM public.customer_service_entitlements
      WHERE order_id=(SELECT order_id FROM public.customer_orders WHERE order_code=$1)`, [code])).rows[0];
    assert.equal(counts.n, 1);
    // Close/reopen, retaining only the authenticated browser cookie, not sessionStorage.
    await page.close();
    page = await context.newPage();
    await page.goto(`${base}/customer-app/index.html#tracking`);
    await page.locator('[data-hub-tab="scheduled"]').click();
    await page.waitForFunction((booking) => document.body.textContent.includes(booking), bookingCode, { timeout: 20000 });
    const reopened = await request("/public/service-rights");
    assert.equal(reopened.items.find((right) => right.entitlement_code === rightCode).booking_code, bookingCode);
    const adminOrders = await request("/admin/prepaid-orders", { auth: adminAuth });
    const adminOrder = adminOrders.orders.find((order) => order.order_code === code);
    assert.ok(adminOrder);
    assert.equal(Number(adminOrder.subtotal), Number(created.order.subtotal));
    const approved = await request(`/admin/customer-bookings/${jobs[0].job_id}/approve`, {
      method: "POST", body: {}, auth: adminAuth });
    assert.equal(approved.success, true);
    const assigned = (await pool.query("SELECT technician_username FROM public.jobs WHERE job_id=$1", [jobs[0].job_id])).rows[0];
    const techSession = "qa-prepaid-browser-technician-session";
    await pool.query(`INSERT INTO public.auth_sessions(session_token, username, role, expires_at)
      VALUES ($1,$2,'technician',NOW()+INTERVAL '1 hour')`, [techSession, assigned.technician_username]);
    const techJobs = await request("/jobs/tech/me", { auth: `cwf_session=${techSession}` });
    const techJob = (Array.isArray(techJobs) ? techJobs : techJobs.items || techJobs.jobs || []).find((job) => String(job.job_id) === String(jobs[0].job_id));
    assert.ok(techJob, "assigned technician must receive the actual prepaid job");
    assert.equal(Number(techJob.customer_due), 0);
    await request(`/jobs/${jobs[0].job_id}/admin-edit`, { method: "PUT", auth: adminAuth,
      body: { appointment_datetime: `${tomorrow}T13:00:00+07:00` } });
    const moved = (await pool.query("SELECT customer_due, prepaid_entitlement_id FROM public.jobs WHERE job_id=$1", [jobs[0].job_id])).rows[0];
    assert.equal(Number(moved.customer_due), 0);
    assert.equal(String(moved.prepaid_entitlement_id), String(jobs[0].prepaid_entitlement_id));
    await request(`/jobs/${jobs[0].job_id}/admin-cancel`, { method: "POST", auth: adminAuth,
      body: { reason: "QA disposable browser acceptance" } });
    const cancelled = (await pool.query("SELECT status, redeemed_job_id FROM public.customer_service_entitlements WHERE entitlement_code=$1", [rightCode])).rows[0];
    assert.equal(cancelled.status, "active");
    assert.equal(cancelled.redeemed_job_id, null);
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM public.jobs WHERE job_id=$1", [jobs[0].job_id])).rows[0].n), 1);
    console.log(`  PREPAID_EVIDENCE order=${code} job=${bookingCode} due=0 rights=1 reload=preserved mobile=360,390 reopen=server-history admin=approved technician=visible reschedule=preserved cancel=right-restored`);
  } catch (error) {
    console.error(error.message);
    if (!page.isClosed()) await page.screenshot({ path: path.join(__dirname, "prepaid-failure.png"), fullPage: true });
    throw error;
  } finally { await context.close(); }
};
