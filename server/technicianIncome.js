"use strict";

const { normalizeWashKey } = require("./normalizers");

function normalizeJobKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("ติดตั้ง") || v.includes("install")) return "install";
  if (v.includes("ซ่อม") || v.includes("repair")) return "repair";
  if (v.includes("ล้าง") || v.includes("wash") || v.includes("clean")) return "wash";
  return null;
}

function normalizeAcKey(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return null;
  if (v.includes("ผนัง") || v.includes("wall")) return "wall";
  if (v.includes("สี่ทิศ") || v.includes("ฝังฝ้า") || v.includes("cassette") || v.includes("four") || v.includes("4")) return "fourway";
  if ((v.includes("แขวน") || v.includes("ตั้งพื้น") || v.includes("floor")) && !v.includes("แขวนคอย")) return "hanging";
  if (v.includes("ใต้ฝ้า") || v.includes("เปลือย") || v.includes("ceiling") || v.includes("concealed")) return "ceiling";
  return null;
}

function contractBtuTierFromText(text) {
  const v = String(text || "");
  const m = v.match(/([0-9][0-9,\.]{2,})\s*BTU/i);
  const btu = m ? Number(String(m[1]).replace(/[,]/g, "")) : 0;
  return { btu: Number.isFinite(btu) ? btu : 0, btu_tier: (Number.isFinite(btu) && btu >= 18000) ? "large" : "small" };
}

function thaiLabelWash(key) {
  if (key === "normal") return "ธรรมดา";
  if (key === "premium") return "พรีเมียม";
  if (key === "coil") return "แขวนคอยล์";
  if (key === "overhaul") return "ตัดล้าง";
  return "";
}

function contractServiceKeyFromItem(it) {
  const nm = String(it?.item_name || "");
  const ac_key = normalizeAcKey(nm) || "wall";
  let wash_key = normalizeWashKey(nm);
  if (ac_key !== "wall") wash_key = "none";
  else if (!wash_key) wash_key = "normal";
  if (ac_key === "wall" && !["normal", "premium", "coil", "overhaul"].includes(wash_key)) wash_key = "normal";
  const { btu, btu_tier } = contractBtuTierFromText(nm);
  const tier = ac_key === "wall" ? btu_tier : "all";
  return { ac_key, wash_key, btu, btu_tier: tier, group_key: `${ac_key}|${wash_key}|${tier}` };
}

function contractSingleRateBracketIndex(groupQty) {
  const n = Math.max(0, Math.round(Number(groupQty || 0)));
  if (n >= 4) return 4;
  if (n >= 2) return 2;
  return 1;
}

module.exports = {
  _normJobKey: normalizeJobKey,
  _normAcKey: normalizeAcKey,
  _normWashKey: (value) => normalizeWashKey(value) || null,
  _thaiLabelWash: thaiLabelWash,
  _contractBtuTierFromText: contractBtuTierFromText,
  _contractServiceKeyFromItem: contractServiceKeyFromItem,
  _contractSingleRateBracketIndex: contractSingleRateBracketIndex,
};
