"use strict";

const normalizerHelpers = require("./normalizers");
const pricingHelpers = require("./pricing");
const technicianIncomeHelpers = require("./technicianIncome");

function inferIsServiceLine(it) {
  try {
    const name = String(it?.item_name || "").trim();
    if (!name) return false;
    const n = name.toLowerCase();
    const qty = Number(it?.qty || 0);
    if (/\bBTU\b/i.test(name)) return true;
    if (/\d+\s*เครื่อง/.test(name)) return true;
    if (n.includes("ล้างแอร์") || n.includes("ซ่อมแอร์") || n.includes("ติดตั้งแอร์")) return true;
    if (name.includes("ล้าง") && (name.includes("ผนัง") || name.includes("สี่ทิศ") || name.includes("แขวน") || name.includes("เปลือย") || name.includes("คอย"))) return true;
    if (/(ธรรมดา|ปกติ|normal|พรีเมียม|premium|แขวนคอย|แขวนคอยน์|แขวนคอยล์|ตัดล้าง|ล้างใหญ่|overhaul|สี่ทิศทาง|เปลือยใต้ฝ้า)/i.test(name)) return true;
    if (/•\s*\d{3,}/.test(name) && /(ธรรมดา|ปกติ|พรีเมียม|แขวน|คอย|ตัดล้าง|ล้างใหญ่|สี่ทิศ|เปลือย)/.test(name)) return true;
    if (qty > 0 && /(ล้าง|ซ่อม|ติดตั้ง|แอร์|คอยล์|คอยน์)/.test(name)) return true;
    return false;
  } catch {
    return false;
  }
}

function boolish(value) {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}

function normalizeRepairVariant(value, itemName = "") {
  const s = String(value || "").trim();
  const name = String(itemName || "").trim();
  if (s.includes("อะไหล่") || name.includes("ซ่อมเปลี่ยนอะไหล่") || name.includes("ซ่อมตามจริง")) return "ซ่อมเปลี่ยนอะไหล่";
  if (s.includes("รั่ว") || name.includes("ตรวจเช็ครั่ว")) return "ตรวจเช็ครั่ว";
  return "";
}

function normalizeQtyAndUnit({ itemName, qty, unitPrice }) {
  let qtyN = Math.max(0, Number(qty || 0));
  let unitN = Math.max(0, Number(unitPrice || 0));
  try {
    const mm = String(itemName || "").match(/(\d+)\s*เครื่อง/);
    const mc = mm ? Number(mm[1]) : 0;
    if (Number.isFinite(mc) && mc > 1 && qtyN <= 1 && Number.isFinite(unitN) && unitN >= (mc * 100)) {
      const per = unitN / mc;
      if (Number.isFinite(per) && per > 0) {
        unitN = Number(per.toFixed(2));
        qtyN = mc;
      }
    }
  } catch (_) {}
  return { qtyN, unitN };
}

function normalizeAdminJobItemsForSave(items, options = {}) {
  const allowedAssignees = options.allowedAssignees instanceof Set
    ? options.allowedAssignees
    : new Set(Array.isArray(options.allowedAssignees) ? options.allowedAssignees.map((x) => String(x || "").trim()).filter(Boolean) : []);

  return (Array.isArray(items) ? items : [])
    .map((it) => {
      const rawAssignee = String(it.assigned_technician_username || "").trim();
      const assignee = rawAssignee && (allowedAssignees.size === 0 || allowedAssignees.has(rawAssignee)) ? rawAssignee : null;
      const explicitIsService = (typeof it.is_service === "boolean") ? it.is_service : null;
      const rawName = String(it.item_name || "").trim();
      const nameForNorm = normalizerHelpers.canonicalizeWashText(rawName);
      const serviceLike = (explicitIsService != null) ? explicitIsService : inferIsServiceLine({ item_name: nameForNorm, qty: it.qty });
      const { qtyN, unitN: rawUnitN } = normalizeQtyAndUnit({ itemName: nameForNorm, qty: it.qty, unitPrice: it.unit_price });
      let unitN = rawUnitN;
      const priceOverridden = boolish(it.price_overridden) || normalizeRepairVariant(it.repair_variant, nameForNorm) === "ซ่อมเปลี่ยนอะไหล่";

      try {
        const parsedSpec = serviceLike ? technicianIncomeHelpers._contractServiceKeyFromItem({ item_name: nameForNorm }) : null;
        const isWash = serviceLike && /ล้างแอร์|AC Cleaning/i.test(nameForNorm);
        const isRepair = serviceLike && /ซ่อมแอร์|AC Repair/i.test(nameForNorm);
        const isInstall = serviceLike && /ติดตั้งแอร์|AC Installation/i.test(nameForNorm);
        const repairVariant = normalizeRepairVariant(it.repair_variant, nameForNorm);

        // Admin repair-after-inspection lines are customer-price overrides.
        // Keep the admin-entered unit_price and NEVER recalculate them back to the 700/1000 inspection fee.
        const shouldRecalculateStandardPrice = !priceOverridden && !(isRepair && repairVariant === "ซ่อมเปลี่ยนอะไหล่");

        if (shouldRecalculateStandardPrice && (isWash || isRepair || isInstall) && parsedSpec) {
          const acType = parsedSpec.ac_key === "fourway" ? "สี่ทิศทาง"
            : (parsedSpec.ac_key === "hanging" ? "แขวน"
            : (parsedSpec.ac_key === "ceiling" ? "เปลือยใต้ฝ้า" : "ผนัง"));
          const payload = {
            job_type: isRepair ? "ซ่อม" : (isInstall ? "ติดตั้ง" : "ล้าง"),
            ac_type: acType,
            btu: Number(parsedSpec.btu || 0) || (parsedSpec.btu_tier === "large" ? 18000 : 12000),
            machine_count: Math.max(1, Math.round(Number(qtyN || 1))),
            wash_variant: parsedSpec.ac_key === "wall" ? (technicianIncomeHelpers._thaiLabelWash(parsedSpec.wash_key) || "ธรรมดา") : "",
            repair_variant: repairVariant,
          };
          const recalculated = pricingHelpers.computeStandardPrice(payload);
          if (Number.isFinite(recalculated) && recalculated > 0 && qtyN > 0) {
            unitN = Number((recalculated / qtyN).toFixed(2));
          }
        }
      } catch (_) {}

      return {
        item_id: it.item_id || null,
        item_name: nameForNorm,
        qty: qtyN,
        unit_price: unitN,
        assigned_technician_username: assignee,
        is_service: (explicitIsService != null) ? explicitIsService : serviceLike,
      };
    })
    .filter((it) => it.item_name);
}

module.exports = {
  normalizeAdminJobItemsForSave,
};
