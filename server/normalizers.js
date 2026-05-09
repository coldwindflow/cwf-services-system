"use strict";

const CANONICAL_WASH_COIL = "ล้างแขวนคอยล์";
const LEGACY_WASH_COIL_TYPO = "ล้างแขวนคอยน์";

function normalizeWashVariantLabel(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();

  if (s.includes("แขวนคอย") || lower.includes("coil")) return CANONICAL_WASH_COIL;
  if (s.includes("พรีเมียม") || s.includes("พรีเมี่ยม") || lower.includes("premium")) return "ล้างพรีเมียม";
  if (s.includes("ตัดล้าง") || s.includes("ล้างใหญ่") || lower.includes("overhaul")) return "ล้างแบบตัดล้าง";
  if (s.includes("ธรรมดา") || s.includes("ปกติ") || lower.includes("normal")) return "ล้างธรรมดา";

  return s;
}

function normalizeWashKey(value) {
  const label = normalizeWashVariantLabel(value);
  const lower = String(value || "").toLowerCase();

  if (label.includes("แขวนคอย") || lower.includes("coil")) return "coil";
  if (label.includes("พรีเมียม") || label.includes("พรีเมี่ยม") || lower.includes("premium")) return "premium";
  if (label.includes("ตัดล้าง") || label.includes("ล้างใหญ่") || lower.includes("overhaul")) return "overhaul";
  if (label.includes("ธรรมดา") || label.includes("ปกติ") || lower.includes("normal")) return "normal";

  return "";
}

function normalizeServiceType(value) {
  const s = String(value || "").trim();
  const lower = s.toLowerCase();
  if (s.includes("ติดตั้ง") || lower.includes("install")) return "ติดตั้ง";
  if (s.includes("ซ่อม") || lower.includes("repair")) return "ซ่อม";
  if (s.includes("ล้าง") || lower.includes("wash") || lower.includes("clean")) return "ล้าง";
  return s;
}

function normalizeAcType(value) {
  const s = String(value || "").trim();
  const lower = s.toLowerCase();
  if (!s) return "";
  if (s === "ใต้ฝ้า") return "เปลือยใต้ฝ้า";
  if (s.includes("ผนัง") || lower.includes("wall")) return "ผนัง";
  if (s.includes("สี่ทิศ") || lower.includes("cassette") || lower.includes("fourway") || lower.includes("four-way")) return "สี่ทิศทาง";
  if ((s.includes("แขวน") || s.includes("ตั้งพื้น") || lower.includes("floor") || lower.includes("hanging")) && !s.includes("แขวนคอย")) return "แขวน";
  if (s.includes("เปลือย") || s.includes("ใต้ฝ้า") || s.includes("ฝังฝ้า") || lower.includes("ceiling") || lower.includes("concealed")) return "เปลือยใต้ฝ้า";
  return s;
}

function normalizeBtuBucket(value) {
  const btu = Number(String(value || "").replace(/[,]/g, "")) || 0;
  return btu >= 18000 ? "large" : "small";
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function canonicalizeWashText(value) {
  return String(value || "").replace(new RegExp(LEGACY_WASH_COIL_TYPO, "g"), CANONICAL_WASH_COIL);
}

module.exports = {
  CANONICAL_WASH_COIL,
  LEGACY_WASH_COIL_TYPO,
  normalizeWashVariantLabel,
  normalizeWashKey,
  normalizeServiceType,
  normalizeAcType,
  normalizeBtuBucket,
  normalizePhone,
  canonicalizeWashText,
};
