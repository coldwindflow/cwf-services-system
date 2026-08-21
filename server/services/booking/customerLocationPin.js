"use strict";

// Customer location pin (Issue 316).
//
// A technician navigates to a job with job.gps_latitude/gps_longitude first and
// only falls back to maps_url and then the free-text address (see openMaps in
// app.js). Urgent bookings have always been able to send a pin; scheduled
// bookings could not, and handlePublicBook additionally discarded any pin that
// did arrive on a non-urgent booking:
//
//     const persistedGpsLatitude = bm === "urgent" && gps_latitude != null ? ... : null;
//
// So a scheduled job reached the technician with no coordinate at all. This
// module makes the pin a property of the booking, not of the booking mode,
// while keeping one single set of validation rules for every customer flow.

const { validateCustomerUrgentGps } = require("../urgentPublicAdapter");

// Modes a customer can pin. Anything else (admin-authored rows, legacy imports)
// keeps its existing behaviour and is not given a pin by this module.
const PIN_ELIGIBLE_BOOKING_MODES = new Set(["scheduled", "urgent"]);

/**
 * Validate a customer-supplied pin.
 *
 * Deliberately delegates to the urgent validator rather than restating the
 * rules, so scheduled can never drift into being more permissive than urgent:
 * both-or-neither, finite, lat -90..90, lng -180..180, and never (0,0).
 *
 * @returns {{ok: boolean, latitude: number|null, longitude: number|null}}
 */
function validateCustomerLocationPin(latitude, longitude) {
  return validateCustomerUrgentGps(latitude, longitude);
}

/**
 * The coordinate pair to persist for this booking, or nulls.
 * Never throws: an invalid pair resolves to nulls so a caller that has already
 * rejected the request cannot accidentally write a half pair.
 */
function persistableLocationPin(bookingMode, latitude, longitude) {
  if (!PIN_ELIGIBLE_BOOKING_MODES.has(String(bookingMode || "").trim())) {
    return { latitude: null, longitude: null };
  }
  const pin = validateCustomerLocationPin(latitude, longitude);
  if (!pin.ok) return { latitude: null, longitude: null };
  return { latitude: pin.latitude, longitude: pin.longitude };
}

module.exports = {
  PIN_ELIGIBLE_BOOKING_MODES,
  validateCustomerLocationPin,
  persistableLocationPin,
};
