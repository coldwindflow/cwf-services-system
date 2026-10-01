"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeReservation } = require("../server/services/prepaid/prepaidOrderServiceV2");

const valid = {
  customer_name: "ลูกค้าทดสอบ", customer_phone: "0812345678",
  address_text: "123 ถนนสุขุมวิท กรุงเทพฯ",
  maps_url: "https://maps.app.goo.gl/example",
};

test("prepaid reservation retains contact, address and canonical map pin without any appointment", () => {
  const normalized = normalizeReservation({ ...valid, gps_latitude: 13.7563,
    gps_longitude: 100.5018, note: "ติดต่อก่อนถึง" });
  assert.equal(normalized.address_text, valid.address_text);
  assert.equal(normalized.gps_latitude, 13.7563);
  assert.equal(normalized.gps_longitude, 100.5018);
  assert.equal(normalized.note, "ติดต่อก่อนถึง");
  assert.equal(Object.hasOwn(normalized, "appointment_datetime"), false);
});

test("a valid pin produces a map link without replacing the typed address", () => {
  const normalized = normalizeReservation({ ...valid, maps_url: "",
    gps_latitude: 13.7563, gps_longitude: 100.5018 });
  assert.equal(normalized.address_text, valid.address_text);
  assert.equal(normalized.maps_url, "https://www.google.com/maps?q=13.7563,100.5018");
});

test("prepaid reservation requires address and location and rejects malformed GPS pairs", () => {
  assert.throws(() => normalizeReservation({ ...valid, address_text: "" }), { code: "SERVICE_ADDRESS_REQUIRED" });
  assert.throws(() => normalizeReservation({ ...valid, maps_url: "" }), { code: "SERVICE_LOCATION_REQUIRED" });
  assert.throws(() => normalizeReservation({ ...valid, gps_latitude: 13.7 }), { code: "INVALID_LOCATION_PIN" });
  assert.throws(() => normalizeReservation({ ...valid, gps_latitude: 0, gps_longitude: 0 }), { code: "INVALID_LOCATION_PIN" });
  assert.throws(() => normalizeReservation({ ...valid, maps_url: "https://example.com/track" }), { code: "INVALID_MAPS_URL" });
});
