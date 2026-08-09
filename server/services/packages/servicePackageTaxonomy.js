"use strict";

const { normalizeServiceType, normalizeAcType, normalizeWashVariantLabel } = require("../../normalizers");
const { supportedServiceTaxonomy } = require("../../customerPricing");

// Store packages reuse the canonical customer price-book taxonomy. Campaigns
// therefore contain configuration only and cannot introduce private variants.
const canonical = supportedServiceTaxonomy();
const JOB_TYPES = Object.freeze(canonical.job_types.map(Object.freeze));
const AC_TYPES = Object.freeze(canonical.ac_types.map(Object.freeze));
const WASH_VARIANTS = Object.freeze(canonical.wash_variants.map(Object.freeze));

const JOB_TYPE_VALUES = new Set(JOB_TYPES.map((entry) => entry.value));
const AC_TYPE_VALUES = new Set(AC_TYPES.map((entry) => entry.value));
const WASH_VARIANT_VALUES = new Set(WASH_VARIANTS.map((entry) => entry.value));

function publicTaxonomy() {
  return {
    job_types: JOB_TYPES.map((entry) => ({ ...entry })),
    ac_types: AC_TYPES.map((entry) => ({ ...entry })),
    wash_variants: WASH_VARIANTS.map((entry) => ({ ...entry })),
  };
}

function canonicalServiceIdentity(input = {}) {
  const jobValue = normalizeServiceType(input.job_type);
  const acValue = normalizeAcType(input.ac_type);
  const washValue = input.wash_variant ? normalizeWashVariantLabel(input.wash_variant) : null;
  const job = JOB_TYPES.find((entry) => entry.value === jobValue);
  const ac = AC_TYPES.find((entry) => entry.value === acValue);
  const wash = washValue ? WASH_VARIANTS.find((entry) => entry.value === washValue) : null;
  if (!job || !ac || (washValue && !wash)) return null;
  return {
    job_type: job.value,
    ac_type: ac.value,
    wash_variant: wash?.value || null,
    service_key: [job.key, ac.key, wash?.key].filter(Boolean).join("-"),
    service_name: [job.label, ac.label, wash?.label].filter(Boolean).join(" • "),
  };
}

module.exports = {
  JOB_TYPES, AC_TYPES, WASH_VARIANTS, JOB_TYPE_VALUES, AC_TYPE_VALUES, WASH_VARIANT_VALUES,
  publicTaxonomy, canonicalServiceIdentity,
};
