"use strict";

const { normalizeServiceType, normalizeAcType, normalizeWashVariantLabel } = require("../../normalizers");

// This is the existing booking taxonomy expressed once as a shared server
// contract. Store package configuration consumes these values; individual
// campaigns never define or hard-code their own service taxonomy.
const JOB_TYPES = Object.freeze([
  Object.freeze({ key: "wash", value: normalizeServiceType("wash"), label: "ล้าง" }),
  Object.freeze({ key: "repair", value: normalizeServiceType("repair"), label: "ซ่อม" }),
  Object.freeze({ key: "install", value: normalizeServiceType("install"), label: "ติดตั้ง" }),
]);

const AC_TYPES = Object.freeze([
  Object.freeze({ key: "wall", value: normalizeAcType("wall"), label: "แอร์ผนัง" }),
  Object.freeze({ key: "cassette", value: normalizeAcType("cassette"), label: "แอร์สี่ทิศทาง" }),
  Object.freeze({ key: "floor", value: normalizeAcType("floor"), label: "แอร์แขวน" }),
  Object.freeze({ key: "ceiling", value: normalizeAcType("ceiling"), label: "แอร์เปลือยใต้ฝ้า" }),
]);

const WASH_VARIANTS = Object.freeze([
  Object.freeze({ key: "normal", value: normalizeWashVariantLabel("normal"), label: "ล้างปกติ" }),
  Object.freeze({ key: "premium", value: normalizeWashVariantLabel("premium"), label: "ล้างพรีเมียม" }),
  Object.freeze({ key: "coil", value: normalizeWashVariantLabel("coil"), label: "ล้างแบบแขวนคอยล์" }),
  Object.freeze({ key: "overhaul", value: normalizeWashVariantLabel("overhaul"), label: "ตัดล้างใหญ่" }),
]);

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
