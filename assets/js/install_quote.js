/* CWF Install Quote Calculator (customer-facing)
 * Keep this file framework-free and production-safe.
 */
(function (global) {
  "use strict";

  const STD_INCLUDED = {
    refrigerant_m: 4,
    power_m: 8,
    drain_m: 8,
    trunking_m: 4,
    breaker_set: 1,
  };

  // ท่อน้ำทิ้งส่วนเกิน: โดยทั่วไป 30–50 บาท/เมตร (ใช้ค่า STD เพื่อคำนวณจริง)
  const DRAIN_RATE_RANGE_LABEL = "30–50";
  const DRAIN_RATE_STD = 40;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const roundTo = (n, d) => {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  };

  function toNumber(v, { min = 0, max = 1_000_000, decimals = 2 } = {}) {
    if (v === null || v === undefined) return 0;
    const s = String(v).replace(/,/g, "").trim();
    if (!s) return 0;
    let n = Number(s);
    if (!Number.isFinite(n)) return 0;
    // normalize decimals
    const factor = Math.pow(10, decimals);
    n = Math.round(n * factor) / factor;
    n = clamp(n, min, max);
    return n;
  }

  function normalizeBtu(btu) {
    // round up to closest common BTU step: 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000, 72000, ...
    const n = toNumber(btu, { min: 0, max: 200_000, decimals: 0 });
    if (!n) return 0;
    const steps = [9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000, 72000, 90000, 100000, 120000, 160000, 200000];
    for (const s of steps) {
      if (n <= s) return s;
    }
    // beyond table, round up to next 10,000
    return Math.ceil(n / 10000) * 10000;
  }

  function calcBtuFromRoom(area_m2, room_factor) {
    const area = toNumber(area_m2, { min: 0, max: 1000, decimals: 2 });
    const factor = toNumber(room_factor, { min: 0, max: 5000, decimals: 0 });
    const raw = Math.ceil(area * factor);
    return { raw_btu: raw, normalized_btu: normalizeBtu(raw) };
  }

  function getBaseLaborStd(btu) {
    const n = toNumber(btu, { min: 0, max: 200_000, decimals: 0 });
    // Spec ranges have gaps (13,001-15,000 and 24,001-29,999). Decide professionally:
    // - <= 13,000 => band 1
    // - 13,001 .. 29,999 => band 2
    // - >= 30,000 => band 3
    if (!n) {
      return { range_label: "-", std: 0, min: 0, max: 0 };
    }
    if (n <= 13000) {
      return { range_label: "3,500 – 4,000", std: 3750, min: 3500, max: 4000 };
    }
    if (n < 30000) {
      return { range_label: "4,500 – 6,500", std: 5500, min: 4500, max: 6500 };
    }
    return { range_label: "7,000 – 8,000", std: 7500, min: 7000, max: 8000 };
  }

  function getRatesByBtu(btu) {
    const n = toNumber(btu, { min: 0, max: 200_000, decimals: 0 });
    // refrigerant per meter + power cable per meter
    if (n <= 16000) return { ref_per_m: 500, power_per_m: 50 };
    if (n <= 24000) return { ref_per_m: 600, power_per_m: 50 };
    if (n <= 40000) return { ref_per_m: 800, power_per_m: 50 };
    if (n <= 60000) return { ref_per_m: 1000, power_per_m: 100 };
    if (n <= 100000) return { ref_per_m: 1200, power_per_m: 200 };
    if (n <= 160000) return { ref_per_m: 1500, power_per_m: 200 };
    if (n <= 200000) return { ref_per_m: 1800, power_per_m: 200 };
    // beyond table: keep last known
    return { ref_per_m: 1800, power_per_m: 200 };
  }

  function calcQuote(input) {
    const machine_count = clamp(toNumber(input.machine_count, { min: 1, max: 50, decimals: 0 }) || 1, 1, 50);
    const ac_type = String(input.ac_type || "").trim();

    const btu_input = toNumber(input.btu, { min: 0, max: 200_000, decimals: 0 });
    // Always use normalized BTU for pricing to avoid spec range gaps and keep behavior predictable.
    const btu_used = btu_input ? (normalizeBtu(btu_input) || btu_input) : 0;
    const labor = getBaseLaborStd(btu_used);
    const rates = getRatesByBtu(btu_used);

    const len_ref = toNumber(input.len_ref, { min: 0, max: 200, decimals: 2 });
    const len_power = toNumber(input.len_power, { min: 0, max: 500, decimals: 2 });
    const len_drain = toNumber(input.len_drain, { min: 0, max: 500, decimals: 2 });
    const len_trunk = toNumber(input.len_trunk, { min: 0, max: 300, decimals: 2 });

    // Round meters to 2 decimals for stable UI + copy text
    const extra_ref_m = roundTo(Math.max(0, len_ref - STD_INCLUDED.refrigerant_m), 2);
    const extra_power_m = roundTo(Math.max(0, len_power - STD_INCLUDED.power_m), 2);
    const extra_drain_m = roundTo(Math.max(0, len_drain - STD_INCLUDED.drain_m), 2);
    const extra_trunk_m = roundTo(Math.max(0, len_trunk - STD_INCLUDED.trunking_m), 2);

    const extra_ref_cost = Math.round(extra_ref_m * rates.ref_per_m);
    const extra_power_cost = Math.round(extra_power_m * rates.power_per_m);
    const extra_trunk_cost = Math.round(extra_trunk_m * 300);
    const extra_drain_cost = Math.round(extra_drain_m * DRAIN_RATE_STD); // approx 30–50/m, STD used for exact calc

    const extras_lines = [];
    extras_lines.push({
      key: "ref",
      label: `ท่อน้ำยา (รวม ${STD_INCLUDED.refrigerant_m}m)` ,
      extra_m: extra_ref_m,
      rate: rates.ref_per_m,
      cost: extra_ref_cost,
    });
    extras_lines.push({
      key: "power",
      label: `สายไฟ (รวม ${STD_INCLUDED.power_m}m)` ,
      extra_m: extra_power_m,
      rate: rates.power_per_m,
      cost: extra_power_cost,
    });
    extras_lines.push({
      key: "drain",
      label: `ท่อน้ำทิ้ง (รวม ${STD_INCLUDED.drain_m}m)`,
      extra_m: extra_drain_m,
      rate: DRAIN_RATE_STD,
      cost: extra_drain_cost,
      note: `เรทโดยทั่วไป ${DRAIN_RATE_RANGE_LABEL} บาท/เมตร (คิดจริง ${DRAIN_RATE_STD}/เมตร)`,
    });
    extras_lines.push({
      key: "trunk",
      label: `รางครอบท่อ (รวม ${STD_INCLUDED.trunking_m}m)` ,
      extra_m: extra_trunk_m,
      rate: 300,
      cost: extra_trunk_cost,
    });

    const specials = {
      wall_chase_m: toNumber(input.wall_chase_m, { min: 0, max: 500, decimals: 2 }),
      ceiling_run_m: toNumber(input.ceiling_run_m, { min: 0, max: 500, decimals: 2 }),
      thick_insulation_m: toNumber(input.thick_insulation_m, { min: 0, max: 500, decimals: 2 }),
      misc_parts_qty: toNumber(input.misc_parts_qty, { min: 0, max: 9999, decimals: 0 }),
      wire_tray_m: toNumber(input.wire_tray_m, { min: 0, max: 500, decimals: 2 }),
      pvc_m: toNumber(input.pvc_m, { min: 0, max: 500, decimals: 2 }),
      scaffold: String(input.scaffold || "none"),
      grill: String(input.grill || "none"),
      siphon: String(input.siphon || "none"),
    };

    // business rule: thick insulation only applies if ceiling run is selected (>0)
    const use_thick_insulation_m = specials.ceiling_run_m > 0 ? specials.thick_insulation_m : 0;

    const specials_lines = [];

    const addLine = (key, label, qty, unit, rate, cost) => {
      if (!qty) return;
      // keep qty stable for display
      const stableQty = typeof qty === "number" ? roundTo(qty, unit === "m" ? 2 : 0) : qty;
      specials_lines.push({ key, label, qty: stableQty, unit, rate, cost });
    };

    addLine("wall_chase", "กรีดผนังฝังท่อ", specials.wall_chase_m, "m", 300, Math.round(specials.wall_chase_m * 300));
    addLine("ceiling_run", "เดินท่อขึ้นฝ้า", specials.ceiling_run_m, "m", 300, Math.round(specials.ceiling_run_m * 300));
    addLine("thick_insulation", "ฉนวนหนาพิเศษ (เฉพาะขึ้นฝ้า)", use_thick_insulation_m, "m", 200, Math.round(use_thick_insulation_m * 200));
    addLine("misc_parts", "ข้อต่อ/อุปกรณ์เสริม", specials.misc_parts_qty, "ชิ้น", 100, Math.round(specials.misc_parts_qty * 100));
    addLine("wire_tray", "รางครอบสายไฟ", specials.wire_tray_m, "m", 50, Math.round(specials.wire_tray_m * 50));
    addLine("pvc", "ท่อ PVC สีขาว", specials.pvc_m, "m", 70, Math.round(specials.pvc_m * 70));

    if (specials.scaffold === "3-5") {
      specials_lines.push({ key: "scaffold", label: "ตั้งนั่งร้าน (สูง 3–5m)", qty: 1, unit: "ครั้ง", rate: 1000, cost: 1000 });
    } else if (specials.scaffold === "6-8") {
      specials_lines.push({ key: "scaffold", label: "ตั้งนั่งร้าน (สูง 6–8m)", qty: 1, unit: "ครั้ง", rate: 2000, cost: 2000 });
    }

    if (specials.grill === "small") {
      specials_lines.push({ key: "grill", label: "กริวปรับทิศทางลม (เล็ก)", qty: 1, unit: "ชุด", rate: 1200, cost: 1200 });
    } else if (specials.grill === "medium") {
      specials_lines.push({ key: "grill", label: "กริวปรับทิศทางลม (กลาง)", qty: 1, unit: "ชุด", rate: 1500, cost: 1500 });
    } else if (specials.grill === "large1800") {
      specials_lines.push({ key: "grill", label: "กริวปรับทิศทางลม (ใหญ่)", qty: 1, unit: "ชุด", rate: 1800, cost: 1800 });
    } else if (specials.grill === "large2000") {
      specials_lines.push({ key: "grill", label: "กริวปรับทิศทางลม (ใหญ่)", qty: 1, unit: "ชุด", rate: 2000, cost: 2000 });
    }

    if (specials.siphon === "auto") {
      const siphon_cost = btu_used && btu_used <= 24000 ? 2500 : 4000;
      const label = siphon_cost === 2500 ? "กาลักน้ำ (9,000–24,000 BTU)" : "กาลักน้ำ (30,000–60,000 BTU+)";
      specials_lines.push({ key: "siphon", label, qty: 1, unit: "ชุด", rate: siphon_cost, cost: siphon_cost });
    }

    const extras_total = extra_ref_cost + extra_power_cost + extra_trunk_cost + extra_drain_cost;
    const specials_total = specials_lines.reduce((s, x) => s + (x.cost || 0), 0);
    const base_total = labor.std;

    const per_machine_total = Math.round(base_total + extras_total + specials_total);
    const grand_total = Math.round(per_machine_total * machine_count);

    return {
      meta: {
        ac_type,
        machine_count,
        btu_input,
        btu_used,
        rates,
        included: STD_INCLUDED,
      },
      base_labor: labor,
      extras: {
        input: { len_ref, len_power, len_drain, len_trunk },
        lines: extras_lines,
        total: extras_total,
      },
      specials: {
        input: specials,
        lines: specials_lines,
        total: specials_total,
      },
      totals: {
        per_machine: per_machine_total,
        grand: grand_total,
      },
    };
  }

  function formatMoney(n) {
    const v = toNumber(n, { min: 0, max: 1_000_000_000, decimals: 0 });
    return v.toLocaleString("th-TH");
  }

  function formatQty(qty, unit) {
    const n = toNumber(qty, { min: 0, max: 1_000_000, decimals: unit === "m" ? 2 : 0 });
    if (!n) return "0";
    const s = unit === "m" ? n.toFixed(2) : String(n);
    return s.replace(/\.00$/, "").replace(/(\.[1-9])0$/, "$1");
  }

  function formatQuoteForCopy(breakdown) {
    const b = breakdown;
    const lines = [];
    lines.push("🧊 CWF | สรุปราคาประมาณงานติดตั้งแอร์");
    lines.push("--------------------------------");
    if (b?.meta?.ac_type) lines.push(`ประเภทแอร์: ${b.meta.ac_type}`);
    if (b?.meta?.btu_used) {
      lines.push(`BTU (ใช้คำนวณ): ${formatMoney(b.meta.btu_used)}`);
      if (b?.meta?.btu_input && b.meta.btu_input !== b.meta.btu_used) {
        lines.push(`BTU ที่กรอก: ${formatMoney(b.meta.btu_input)} (ปัดขึ้นตามมาตรฐาน)`);
      }
    }
    lines.push(`จำนวนเครื่อง: ${formatMoney(b.meta.machine_count)}`);
    lines.push("");

    lines.push("1) ค่าแรงติดตั้งมาตรฐาน");
    lines.push(`- ช่วงราคา: ${b.base_labor.range_label} บาท (คิดจริง STD = ${formatMoney(b.base_labor.std)} บาท/เครื่อง)`);
    lines.push("");

    lines.push("2) อุปกรณ์มาตรฐานที่รวมแล้ว/เครื่อง");
    lines.push("- ท่อน้ำยา 4 เมตร");
    lines.push("- สายไฟ 8 เมตร");
    lines.push("- ท่อน้ำทิ้ง 8 เมตร");
    lines.push("- เบรกเกอร์ 1 ชุด");
    lines.push("- รางครอบท่อ 4 เมตร");
    lines.push("- ขายางรอง และขาเหล็กชุดมาตรฐาน");
    lines.push("");

    lines.push("3) ค่าส่วนเกินจากมาตรฐาน (คิดเฉพาะส่วนที่เกิน)");
    for (const x of b.extras.lines) {
      if (x.key === "drain") {
        const extraTxt = x.extra_m > 0 ? `เกิน ${formatQty(x.extra_m, "m")}m` : "ไม่เกิน";
        lines.push(`- ${x.label}: ${extraTxt} → ${x.note}`);
      } else {
        const extraTxt = x.extra_m > 0 ? `เกิน ${formatQty(x.extra_m, "m")}m x ${formatMoney(x.rate)}/m = ${formatMoney(x.cost)} บาท` : "ไม่เกิน (0 บาท)";
        lines.push(`- ${x.label}: ${extraTxt}`);
      }
    }
    lines.push("");

    lines.push("4) งานพิเศษ/อุปกรณ์เพิ่ม");
    if (b.specials.lines.length === 0) {
      lines.push("- ไม่มี");
    } else {
      for (const s of b.specials.lines) {
        lines.push(`- ${s.label}: ${formatQty(s.qty, s.unit)}${s.unit} x ${formatMoney(s.rate)} = ${formatMoney(s.cost)} บาท`);
      }
    }
    lines.push("");

    lines.push("5) รวมราคา");
    lines.push(`- รวมต่อเครื่อง: ${formatMoney(b.totals.per_machine)} บาท`);
    lines.push(`- รวมทั้งหมด (${formatMoney(b.meta.machine_count)} เครื่อง): ${formatMoney(b.totals.grand)} บาท`);
    lines.push("--------------------------------");
    lines.push("เงื่อนไขสำคัญ:");
    lines.push("- ช่างมีใบเซอร์งานติดตั้ง และใบรับรองผ่านการอบรมทดสอบมาตรฐานจากกรมพัฒนาฝีมือแรงงาน");
    lines.push("- อุปกรณ์ที่เหลือจากงานติดตั้ง ไม่สามารถเปลี่ยน ตัดทอน หรือขอคืนเป็นเงินสด สินค้า หรือส่วนลดได้");
    lines.push("- งานเดินสายไฟเป็นการเดินจากคอยล์ร้อนไปคอยล์เย็นเท่านั้น (ไม่รวมงานเดินไฟเมนจากตู้ไฟหลัก)");
    lines.push("- กรณีไม่สามารถเปลี่ยนท่อน้ำยาเดิมได้ และจำเป็นต้องล้างระบบด้วยน้ำยา ขอสงวนสิทธิ์ไม่ส่งมอบอุปกรณ์ที่ไม่ได้ใช้งานคืน");
    return lines.join("\n");
  }

  global.InstallQuote = {
    calcBtuFromRoom,
    normalizeBtu,
    getBaseLaborStd,
    getRatesByBtu,
    calcQuote,
    formatQuoteForCopy,
    _util: { toNumber },
    _fmt: { formatMoney, formatQty },
  };
})(window);
