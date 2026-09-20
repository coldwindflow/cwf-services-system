"use strict";

const DEFAULT_JOB_BRAND_KEY = "cwf";

const JOB_BRANDS = Object.freeze({
  cwf: Object.freeze({
    key: "cwf",
    label: "CWF",
    name: "Cold Wind Flow",
  }),
  axs: Object.freeze({
    key: "axs",
    label: "AXS",
    name: "AXS Air Service",
  }),
});

class JobBrandError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = "JobBrandError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeJobBrandKey(value) {
  const key = String(value == null ? "" : value).trim().toLowerCase() || DEFAULT_JOB_BRAND_KEY;
  if (!Object.prototype.hasOwnProperty.call(JOB_BRANDS, key)) {
    throw new JobBrandError("UNKNOWN_JOB_BRAND", 400);
  }
  return key;
}

function getJobBrand(value) {
  const key = normalizeJobBrandKey(value);
  return { ...JOB_BRANDS[key] };
}

function resolveBookingJobBrand(value, options = {}) {
  const brand = getJobBrand(value);
  if (brand.key !== DEFAULT_JOB_BRAND_KEY && options.allowNonDefault !== true) {
    throw new JobBrandError("JOB_BRAND_NOT_ALLOWED", 403);
  }
  return brand;
}

function serializeJobBrand(row) {
  const source = row && typeof row === "object" ? row : {};
  const brand = getJobBrand(source.brand_key);
  return { ...source, brand_key: brand.key, brand };
}

function serializeJobBrands(rows) {
  return (Array.isArray(rows) ? rows : []).map(serializeJobBrand);
}

module.exports = {
  DEFAULT_JOB_BRAND_KEY,
  JOB_BRANDS,
  JobBrandError,
  getJobBrand,
  normalizeJobBrandKey,
  resolveBookingJobBrand,
  serializeJobBrand,
  serializeJobBrands,
};
