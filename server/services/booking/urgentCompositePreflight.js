"use strict";

const { resolvePackageBooking } = require("./servicePackageBooking");

async function resolveUrgentCompositePreflight({ input, appointmentDatetime, resolver }) {
  if (!Array.isArray(input?.service_package_groups)) return null;
  const booking = await resolvePackageBooking({
    body: {
      catalog_item_id: input.catalog_item_id,
      service_package_groups: input.service_package_groups,
    },
    bookingMode: "urgent",
    appointmentDatetime,
    resolver,
    identity: "customer",
  });
  if (!booking || !Number.isSafeInteger(Number(booking.durationMin)) || Number(booking.durationMin) <= 0) {
    const error = new Error("INVALID_SERVICE_DURATION");
    error.code = "INVALID_SERVICE_DURATION";
    error.statusCode = 400;
    throw error;
  }
  return {
    payload: booking.payload,
    durationMin: Number(booking.durationMin),
    machineCount: Number(booking.payload?.machine_count || 0),
  };
}

module.exports = { resolveUrgentCompositePreflight };
