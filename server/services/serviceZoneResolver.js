"use strict";

const SERVICE_ZONE_SEEDS = [
  { code: "A", name: "bangkok_east_core", label: "กรุงเทพตะวันออกแกนหลัก", group: "bangkok", color: "#0B4BB3", order: 10, districts: ["พระโขนง", "บางนา", "สวนหลวง", "ประเวศ", "บางกะปิ", "สะพานสูง", "ลาดกระบัง"] },
  { code: "B", name: "bangkok_north_east", label: "กรุงเทพเหนือ-ตะวันออก", group: "bangkok", color: "#2563EB", order: 20, districts: ["ดอนเมือง", "สายไหม", "บางเขน", "หลักสี่", "จตุจักร", "บางซื่อ", "ลาดพร้าว", "วังทองหลาง", "บึงกุ่ม", "คันนายาว", "คลองสามวา", "มีนบุรี", "หนองจอก"] },
  { code: "C", name: "bangkok_inner", label: "กรุงเทพชั้นใน", group: "bangkok", color: "#06B6D4", order: 30, districts: ["ปทุมวัน", "ราชเทวี", "พญาไท", "ดุสิต", "พระนคร", "ป้อมปราบศัตรูพ่าย", "สัมพันธวงศ์", "บางรัก", "สาทร", "ยานนาวา", "ห้วยขวาง", "ดินแดง", "วัฒนา", "คลองเตย", "บางคอแหลม"] },
  { code: "D", name: "thonburi_inner", label: "ธนบุรีตอนใน", group: "bangkok_west", color: "#10B981", order: 40, districts: ["คลองสาน", "ธนบุรี", "บางกอกใหญ่", "บางกอกน้อย", "บางพลัด", "ตลิ่งชัน"] },
  { code: "E", name: "west_southwest_river_side", label: "ฝั่งตะวันตกตอนล่าง / ข้ามฝั่งแม่น้ำ", group: "bangkok_west", color: "#F59E0B", order: 50, districts: ["ภาษีเจริญ", "บางแค", "หนองแขม", "ทวีวัฒนา", "จอมทอง", "ราษฎร์บูรณะ", "ทุ่งครุ", "บางขุนเทียน", "บางบอน", "พระประแดง", "พระสมุทรเจดีย์"] },
  { code: "F", name: "samut_prakan_east", label: "สมุทรปราการฝั่งตะวันออก", group: "samut_prakan", color: "#EF4444", order: 60, districts: ["เมืองสมุทรปราการ", "บางพลี", "บางเสาธง", "บางบ่อ"] },
  { code: "G", name: "nonthaburi", label: "นนทบุรี", group: "nonthaburi", color: "#8B5CF6", order: 70, districts: ["เมืองนนทบุรี", "ปากเกร็ด", "บางกรวย", "บางใหญ่", "บางบัวทอง", "ไทรน้อย"] },
  { code: "H", name: "pathum_thani", label: "ปทุมธานี", group: "pathum_thani", color: "#EC4899", order: 80, districts: ["เมืองปทุมธานี", "คลองหลวง", "ธัญบุรี", "ลำลูกกา", "หนองเสือ", "ลาดหลุมแก้ว", "สามโคก"] },
];

const SERVICE_ZONE_BY_CODE = new Map(SERVICE_ZONE_SEEDS.map((zone) => [zone.code, zone]));

const SERVICE_AREA_ALIAS_SEEDS = [
  { code: "A", aliases: ["อ่อนนุช", "อุดมสุข", "บางจาก", "ปุณณวิถี", "สุขุมวิท101", "สุขุมวิท 101", "สุขุมวิท103", "สุขุมวิท 103", "บางนา", "ศรีนครินทร์", "พัฒนาการ"] },
  { code: "F", aliases: ["แบริ่ง", "สำโรง", "เทพารักษ์", "ปากน้ำ", "เมืองสมุทรปราการ", "บางพลี"] },
  { code: "B", aliases: ["รามคำแหง", "ลาดพร้าว", "วังทองหลาง", "บางกะปิ", "หัวหมาก"] },
];

// These are compatibility envelopes, not political boundaries. More than one
// envelope can match; the deterministic overlap rules below choose the
// operational zone and return the complete match set to authenticated callers.
const COORDINATE_ENVELOPES = [
  { code: "A", minLat: 13.62, maxLat: 13.86, minLng: 100.58, maxLng: 100.86 },
  { code: "B", minLat: 13.76, maxLat: 14.02, minLng: 100.50, maxLng: 100.95 },
  { code: "C", minLat: 13.68, maxLat: 13.82, minLng: 100.48, maxLng: 100.62 },
  { code: "D", minLat: 13.70, maxLat: 13.90, minLng: 100.36, maxLng: 100.52 },
  { code: "E", minLat: 13.49, maxLat: 13.72, minLng: 100.34, maxLng: 100.58, maxLngExclusive: true },
  { code: "F", minLat: 13.50, maxLat: 13.77, minLng: 100.58, maxLng: 100.92 },
  { code: "G", minLat: 13.78, maxLat: 14.16, minLng: 100.15, maxLng: 100.78 },
  { code: "H", minLat: 13.88, maxLat: 14.25, minLng: 100.35, maxLng: 100.95 },
];

function normalizeThaiAreaText(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .replace(/^(เขต|อำเภอ|อําเภอ|อ\.)/u, "");
}

function safeDecodeText(value) {
  const raw = String(value || "");
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch (_) {
    return raw;
  }
}

function extractLatLngFromMapsText(value) {
  const raw = safeDecodeText(value);
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /(?:^|[^\d-])(-?\d{1,2}\.\d{4,})\s*,\s*(100\.\d{4,})(?:[^\d]|$)/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= 13.35 && lat <= 14.35 && lng >= 99.75 && lng <= 101.25) {
      return { lat, lng };
    }
  }
  return null;
}

function coordinateEnvelopeMatches(lat, lng) {
  return COORDINATE_ENVELOPES
    .filter((box) =>
      lat >= box.minLat
      && lat <= box.maxLat
      && lng >= box.minLng
      && (box.maxLngExclusive ? lng < box.maxLng : lng <= box.maxLng)
    )
    .map((box) => box.code);
}

function resolveCoordinateOverlap(lat, lng, matches) {
  const set = new Set(matches);
  if (set.has("A") && set.has("F")) {
    // Bangkok East / Samut Prakan operational boundary. It deliberately keeps
    // Bang Na north of Bearing in A, while Bearing/Samrong/Thepharak and the
    // province to the south remain F. This rule is independent of array order.
    return {
      code: lat >= 13.665 && lng < 100.74 ? "A" : "F",
      rule: "bangkok_east_samut_prakan_boundary_v1",
    };
  }
  const priority = ["C", "D", "A", "B", "E", "F", "G", "H"];
  return {
    code: priority.find((code) => set.has(code)) || null,
    rule: matches.length > 1 ? "explicit_operational_priority_v1" : "single_envelope",
  };
}

function detectServiceZoneFromLatLng(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  const matches = coordinateEnvelopeMatches(parsedLat, parsedLng);
  const resolved = resolveCoordinateOverlap(parsedLat, parsedLng, matches);
  if (!resolved.code) return null;
  const zone = SERVICE_ZONE_BY_CODE.get(resolved.code);
  return zone ? {
    service_zone_code: zone.code,
    service_zone_label: zone.label,
    service_zone_source: "maps_coordinate",
    matched_district: null,
    matched_lat: parsedLat,
    matched_lng: parsedLng,
    coordinate_matches: matches,
    resolution_rule: resolved.rule,
  } : null;
}

function detectServiceZoneFromAreaAlias(haystack) {
  const matches = [];
  const normalizedHaystack = normalizeThaiAreaText(haystack);
  if (!normalizedHaystack) return null;
  for (const seed of SERVICE_AREA_ALIAS_SEEDS) {
    const zone = SERVICE_ZONE_BY_CODE.get(seed.code);
    if (!zone) continue;
    for (const alias of seed.aliases || []) {
      const normalizedAlias = normalizeThaiAreaText(alias);
      if (normalizedAlias && normalizedHaystack.includes(normalizedAlias)) {
        matches.push({ zone, alias, length: normalizedAlias.length });
      }
    }
  }
  matches.sort((left, right) => right.length - left.length || left.zone.order - right.zone.order);
  const best = matches[0];
  return best ? {
    service_zone_code: best.zone.code,
    service_zone_label: best.zone.label,
    service_zone_source: "area_alias_detect",
    matched_district: null,
    matched_area: best.alias,
  } : null;
}

async function detectServiceZoneFromText(input = {}, options = {}) {
  const explicit = String(input.service_zone_code || "").trim().toUpperCase();
  if ((options.allowAdminOverride === true || options.trustedPersistedZone === true) && SERVICE_ZONE_BY_CODE.has(explicit)) {
    const zone = SERVICE_ZONE_BY_CODE.get(explicit);
    return {
      service_zone_code: zone.code,
      service_zone_label: zone.label,
      service_zone_source: options.allowAdminOverride === true ? "admin_override" : String(input.service_zone_source || "persisted_job"),
      matched_district: null,
    };
  }

  const decodedMapText = safeDecodeText(input.maps_url);
  const haystack = normalizeThaiAreaText([
    input.home_district,
    input.job_zone,
    input.address_text,
    input.home_province,
    decodedMapText,
  ].filter(Boolean).join(" "));
  const districtMatches = [];
  if (haystack) {
    for (const zone of SERVICE_ZONE_SEEDS) {
      for (const district of zone.districts) {
        const normalizedDistrict = normalizeThaiAreaText(district);
        if (normalizedDistrict && haystack.includes(normalizedDistrict)) {
          districtMatches.push({ zone, district, length: normalizedDistrict.length });
        }
      }
    }
  }
  districtMatches.sort((left, right) => right.length - left.length || left.zone.order - right.zone.order);
  const district = districtMatches[0];
  if (district) {
    return {
      service_zone_code: district.zone.code,
      service_zone_label: district.zone.label,
      service_zone_source: "auto_detect",
      matched_district: district.district,
    };
  }

  const alias = detectServiceZoneFromAreaAlias(haystack);
  if (alias) return alias;

  const directLat = input.gps_latitude;
  const directLng = input.gps_longitude;
  const hasPair = directLat !== null && directLat !== undefined && String(directLat).trim() !== ""
    && directLng !== null && directLng !== undefined && String(directLng).trim() !== "";
  const coordinates = hasPair
    ? { lat: Number(directLat), lng: Number(directLng) }
    : extractLatLngFromMapsText(input.maps_url || input.address_text || input.job_zone || "");
  if (coordinates) return detectServiceZoneFromLatLng(coordinates.lat, coordinates.lng);
  return null;
}

function publicServiceZoneView(detected) {
  if (!detected) return null;
  return {
    service_zone_code: detected.service_zone_code || null,
    service_zone_label: detected.service_zone_label || null,
    service_zone_source: detected.service_zone_source || null,
    matched_area: detected.matched_area || detected.matched_district || null,
  };
}

module.exports = {
  SERVICE_ZONE_SEEDS,
  SERVICE_ZONE_BY_CODE,
  normalizeThaiAreaText,
  extractLatLngFromMapsText,
  detectServiceZoneFromLatLng,
  detectServiceZoneFromText,
  publicServiceZoneView,
};
