"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const scheduled = fs.readFileSync("customer-app/modules/bookingScheduled.js", "utf8");
const urgent = fs.readFileSync("customer-app/modules/bookingUrgent.js", "utf8");
const css = fs.readFileSync("customer-app/assets/customer-app.css", "utf8");

test("scheduled and urgent success screens use only server ticket DTO and explicit LINE handoff", () => {
  for (const source of [scheduled, urgent]) {
    assert.match(source, /result(?:\?|\.)?\.booking_ticket|result\.booking_ticket/);
    assert.match(source, /คัดลอก Ticket ส่งให้แอดมิน/);
    assert.match(source, /Ticket มีชื่อและเบอร์โทร/);
    assert.match(source, /https:\/\/lin\.ee\/fG1Oq7y/);
    assert.match(source, /navigator\.clipboard\?\.writeText/);
    assert.match(source, /readonly/);
    assert.match(source, /aria-live="polite"/);
    assert.doesNotMatch(source, /ticket[^\n]*(?:job_id|booking_token|address_text|maps_url|snapshot)/i);
  }
  assert.match(css, /\.booking-ticket-handoff[\s\S]*min-height:\s*44px/);
});
