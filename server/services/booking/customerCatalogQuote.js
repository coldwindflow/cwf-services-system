"use strict";

const { resolvePackageBooking } = require("./servicePackageBooking");
const { resolveCatalogBookingPolicy, buildCatalogBookingPayload } = require("./catalogBookingPolicy");

function safeCompositeQuote(booking) {
  return {
    kind: "service_package",
    bundle_key: booking.bundleKey,
    fixed_total_price: booking.fixedTotal,
    duration_minutes: booking.durationMin,
    machine_count: booking.payload.machine_count,
    groups: booking.payload.service_package_groups,
    services: booking.payload.services || [],
    components: booking.items.map((item) => ({
      package_key: item.snapshot.package.key,
      tier_key: item.snapshot.tier.key,
      tier_name: item.snapshot.tier.name,
      quantity: item.snapshot.quantity,
      fixed_total_price: item.snapshot.fixed_total_price,
    })),
  };
}

function createCustomerCatalogQuoteService({ pool, createServicePackageResolver, computeDurationMinMulti }) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("pool is required");

  async function quote(input = {}) {
    const bookingMode = String(input.booking_mode || "scheduled").trim().toLowerCase();
    if (Array.isArray(input.service_package_groups)) {
      const booking = await resolvePackageBooking({
        body: { catalog_item_id: input.catalog_item_id, service_package_groups: input.service_package_groups },
        bookingMode,
        appointmentDatetime: input.appointment_datetime || new Date().toISOString(),
        resolver: createServicePackageResolver(pool),
        identity: "customer",
      });
      return safeCompositeQuote(booking);
    }

    const booking = await resolveCatalogBookingPolicy(pool, {
      catalogItemId: input.catalog_item_id,
      bookingMode,
      jobType: input.job_type,
      acType: input.ac_type,
      btu: input.btu,
      washVariant: input.wash_variant,
      machineCount: input.machine_count,
    }, { identity: "customer" });
    const payload = buildCatalogBookingPayload(booking);
    return {
      kind: "bookable",
      booking_flow_policy: booking.booking_flow_policy,
      fixed_total_price: booking.pricing.exact_total,
      unit_price: booking.pricing.unit_price,
      normal_unit_price: booking.pricing.normal_unit_price,
      duration_minutes: Number(computeDurationMinMulti(payload) || 0),
      machine_count: booking.machine_count,
      service: payload,
      price_label: booking.pricing.price_label,
      campaign_name: booking.pricing.campaign_name,
    };
  }

  async function handle(req, res) {
    try {
      res.set("Cache-Control", "no-store");
      return res.json(await quote(req.body || {}));
    } catch (error) {
      const status = Number(error?.statusCode || 503);
      const safeStatus = status >= 400 && status < 500 ? status : 503;
      const code = safeStatus === 503 ? "CATALOG_QUOTE_UNAVAILABLE" : String(error?.code || "CATALOG_QUOTE_REJECTED");
      return res.status(safeStatus).json({ error: code, code });
    }
  }

  return { quote, handle };
}

module.exports = { createCustomerCatalogQuoteService, safeCompositeQuote };
