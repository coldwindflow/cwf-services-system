"use strict";

const crypto = require("crypto");
const { JOB_STATUS, ASSIGNMENT_STATUS, OFFER_STATUS } = require("./bookingStatuses");
const { ensureBookingJobUnits } = require("./bookingJobUnits");

function createBookingJobService(dependencies = {}) {
  const ensureCanonicalBookingJobUnits = dependencies.ensureBookingJobUnits || ensureBookingJobUnits;
  const {
    pool,
    urgentPublicAdapter,
    normalizeAppointmentDatetime,
    genToken,
    detectServiceZoneFromText,
    computeDurationMinMulti,
    customerPricingHelpers,
    coordFieldProvided,
    strictLatLngPairOrNull,
    parseLatLngFromText,
    resolveMapsUrlToLatLng,
    expireTechnicianAcceptStatuses,
    calcPricing,
    rankTechniciansForServiceZone,
    buildOffMapForDate,
    isTechOffOnDate,
    checkTechCollision,
    technicianMatchesServiceZone,
    http409Conflict,
    generateUniqueBookingCode,
    effectiveBlockMin,
    isTechFree,
    getJwtSecret,
    parseCookieValue,
    jwtVerify,
    toMin,
    getNowBangkokParts,
    jobTiming,
    customerAvailability,
    publicCustomerAvailabilityDeps,
    findBestCustomerPromotion,
  } = dependencies;

  const ENABLE_SERVICE_ZONE_FILTER = Boolean(dependencies.isServiceZoneFilterEnabled());
  const ENABLE_CUSTOMER_SCHEDULED_BOOKING = Boolean(dependencies.isCustomerScheduledBookingEnabled());
  const CWF_LINE_CONTACT_URL = dependencies.lineContactUrl;
  const TRAVEL_BUFFER_MIN = dependencies.travelBufferMin;
  const getInvalidJobSiteCoordinatesMessage = dependencies.getInvalidJobSiteCoordinatesMessage;
  const _refreshTechnicianIncomePreviewForJob = dependencies.refreshTechnicianIncomePreviewForJob;
  const _notifyUrgentOffer = dependencies.notifyUrgentOffer;
  const _notifyDirectJobAssigned = dependencies.notifyDirectJobAssigned;
  const resolveCustomerUrgentCapability = dependencies.resolveCustomerUrgentCapability;
  const urgentDispatchService = dependencies.urgentDispatchService;
  const logJobUpdate = dependencies.logJobUpdate;

  async function pickFirstAvailableTech(usernames, apptIso, durationMin) {
    for (const u of usernames) {
      const ok = await isTechFree(u, apptIso, durationMin, null);
      if (ok) return u;
    }
    return null;
  }

  function coerceNumber(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }

  function validateInternalBookingPayload(body) {
    const b = body || {};
    const missing = [];
    if (!String(b.customer_name || '').trim()) missing.push('customer_name');
    if (!String(b.job_type || '').trim()) missing.push('job_type');
    if (!String(b.appointment_datetime || '').trim()) missing.push('appointment_datetime');
    if (!String(b.address_text || '').trim()) missing.push('address_text');
    return missing;
  }

  function buildAdminBookingNotificationPayload(body, bookingResult) {
    const b = body || {};
    const r = bookingResult || {};
    const services = Array.isArray(b.services) ? b.services : (Array.isArray(b.service_lines) ? b.service_lines : []);
    const machineCountFromServices = services.reduce((sum, s) => sum + Math.max(0, Number(s?.machine_count || 0)), 0);
    const machine_count = Math.max(
      1,
      Number(b.machine_count || 0) || Number(machineCountFromServices || 0) || 1
    );
    const customer_name = String(b.customer_name || '').trim();
    const customer_phone = String(b.customer_phone || '').trim() || null;
    const appointment_datetime = String(b.appointment_datetime || '').trim();
    const service_type = String(b.job_type || '').trim();
    const address_text = String(b.address_text || '').trim();
    const technician_username = String(r.technician_username || '').trim() || null;
    const booking_code = String(r.booking_code || '').trim() || null;
    const job_id = Number(r.job_id || 0) || null;

    return {
      channel: 'admin_group',
      event: 'new_booking_created_from_ai',
      message_fields: {
        booking_code,
        job_id,
        customer_name,
        customer_phone,
        appointment_datetime,
        service_type,
        machine_count,
        address_text,
        technician_username,
      },
      message_text:
        `à¸¡à¸µà¸‡à¸²à¸™à¹ƒà¸«à¸¡à¹ˆà¸ˆà¸²à¸ AI\n` +
        `à¹€à¸¥à¸‚à¸‡à¸²à¸™: ${booking_code || '-'} / #${job_id || '-'}\n` +
        `à¸¥à¸¹à¸à¸„à¹‰à¸²: ${customer_name || '-'}\n` +
        `à¹‚à¸—à¸£: ${customer_phone || '-'}\n` +
        `à¸™à¸±à¸”à¸«à¸¡à¸²à¸¢: ${appointment_datetime || '-'}\n` +
        `à¸›à¸£à¸°à¹€à¸ à¸—à¸‡à¸²à¸™: ${service_type || '-'}\n` +
        `à¸ˆà¸³à¸™à¸§à¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡: ${machine_count}\n` +
        `à¸—à¸µà¹ˆà¸­à¸¢à¸¹à¹ˆ: ${address_text || '-'}\n` +
        `à¸Šà¹ˆà¸²à¸‡à¸—à¸µà¹ˆà¹„à¸”à¹‰à¸‡à¸²à¸™: ${technician_username || 'à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸£à¸°à¸šà¸¸'}`
    };
  }

  async function handleAdminBookV2(req, res) {
    const body = req.body || {};
    const {
      customer_name,
      customer_phone,
      job_type,
      appointment_datetime,
      address_text,
      customer_note,
      maps_url,
      job_zone,
      service_zone_code,
      booking_mode,
      tech_type,
      technician_username,
      team_members: team_members_raw,
      assign_mode: assign_mode_raw,
      dispatch_mode,
      // v2 payload
      ac_type,
      btu,
      machine_count,
      wash_variant,
      repair_variant,
      // pricing
      items, // [{item_id, qty}]
      promotion_id,
      override_price,
      override_duration_min,
    } = body;

    // âœ… assign_mode (auto|single|team)
    // Backward compatible: infer if missing.
    const assign_mode = (() => {
      const v = (assign_mode_raw || '').toString().trim().toLowerCase();
      if (v === 'auto' || v === 'single' || v === 'team') return v;
      const hasTeam = Array.isArray(team_members_raw) && team_members_raw.some(Boolean);
      if (hasTeam) return 'team';
      const hasTech = (technician_username || '').toString().trim().length > 0;
      return hasTech ? 'single' : 'auto';
    })();

    if (!customer_name || !job_type || !appointment_datetime || !address_text) {
      return res.status(400).json({ error: "à¸à¸£à¸­à¸à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸„à¸£à¸š (à¸Šà¸·à¹ˆà¸­/à¸›à¸£à¸°à¹€à¸ à¸—à¸‡à¸²à¸™/à¸§à¸±à¸™à¸™à¸±à¸”/à¸—à¸µà¹ˆà¸­à¸¢à¸¹à¹ˆ)" });
    }

    // âœ… Timezone safety (Asia/Bangkok):
    // Frontend often sends `YYYY-MM-DDTHH:mm:ss` (no tz). In Node.js that is treated as UTC,
    // causing +7h drift in technician view (e.g., 09:00 -> 16:00).
    // Normalize ONCE and use the normalized value everywhere in this handler.
    const apptIso = normalizeAppointmentDatetime(appointment_datetime);

    const rawBm = (booking_mode || "scheduled").toString().trim().toLowerCase();
    const rawMode = (dispatch_mode || "normal").toString().trim().toLowerCase();
    const isUrgentOffer = rawBm === "urgent" || rawMode === "offer";
    const bm = isUrgentOffer ? "urgent" : rawBm;
    const ttype = (tech_type || (bm === "urgent" ? "partner" : "company")).toString().trim().toLowerCase();
    const mode = isUrgentOffer ? "offer" : rawMode;
    // âœ… HOTFIX: allow_time_proposal may be omitted by older cached frontend/PWA.
    // Do not reference an undeclared destructured variable here; otherwise /admin/book_v2
    // crashes the whole Node process and Cloudflare shows 502. Missing value = false.
    const allowTimeProposalRaw = body.allow_time_proposal;
    const allowTimeProposal = isUrgentOffer && (
      allowTimeProposalRaw === true ||
      String(allowTimeProposalRaw || "").trim().toLowerCase() === "true" ||
      String(allowTimeProposalRaw || "").trim() === "1"
    );
    const createdBySource = req.cwfBookSource === "customer" ? "customer" : "admin";
    // Customer-sourced urgent requests carry a client-generated
    // urgent_request_key; deriving booking_token from it deterministically
    // (instead of a random genToken) lets the dedup check below find a
    // prior committed row for the exact same key, across restarts/instances.
    const urgentRequestKey = (isUrgentOffer && createdBySource === "customer")
      ? String(body.urgent_request_key || "").trim()
      : "";
    const urgentDeterministicToken = urgentRequestKey
      ? urgentPublicAdapter.deriveUrgentBookingToken(urgentRequestKey)
      : null;
    const publicBookingToken = createdBySource === "customer"
      ? (urgentDeterministicToken || genToken(12))
      : null;
    const zoneDetected = await detectServiceZoneFromText({ address_text, job_zone, service_zone_code, maps_url });
    const detectedZoneCode = zoneDetected?.service_zone_code || null;
    const detectedZoneLabel = zoneDetected?.service_zone_label || null;
    const detectedZoneSource = zoneDetected?.service_zone_source || (detectedZoneCode ? "auto_detect" : null);
    let zone_filter_applied = false;
    let zone_matched_technicians_count = 0;
    let zone_fallback_used = false;
    let forced_assignment_zone_warning = null;
    if (!['company','partner','all'].includes(ttype)) return res.status(400).json({ error: "tech_type à¸•à¹‰à¸­à¸‡à¹€à¸›à¹‡à¸™ company|partner|all" });
    if (!['normal','forced','offer'].includes(mode)) return res.status(400).json({ error: "dispatch_mode à¸•à¹‰à¸­à¸‡à¹€à¸›à¹‡à¸™ normal|forced|offer" });

    // âœ… Enforce assign_mode contract (R2)
    // - single: technician_username required, team_members must be empty
    // - auto: technician_username optional, team_members must be empty
    // - team: selected team members are enough; no manual primary technician is required.
    //   For legacy columns, the backend will use technician_username or the first selected
    //   team member as an internal representative only.
    const tmRawArr = Array.isArray(team_members_raw) ? team_members_raw : [];
    const tmSelectedList = [...new Set(tmRawArr.map(x => (x||'').toString().trim()).filter(Boolean))].slice(0, 10);
    const tmAny = tmSelectedList.length > 0;
    const requestedTech = (technician_username || '').toString().trim();
    const techProvided = requestedTech.length > 0;
    const teamRepresentative = assign_mode === 'team'
      ? (requestedTech || tmSelectedList[0] || '')
      : requestedTech;
    if (!isUrgentOffer) {
      if (assign_mode === 'single') {
        if (!techProvided) return res.status(400).json({ error: 'à¹‚à¸«à¸¡à¸” single à¸•à¹‰à¸­à¸‡à¸£à¸°à¸šà¸¸ technician_username' });
        if (tmAny) return res.status(400).json({ error: 'à¹‚à¸«à¸¡à¸” single à¸«à¹‰à¸²à¸¡à¸ªà¹ˆà¸‡ team_members' });
      } else if (assign_mode === 'auto') {
        if (tmAny) return res.status(400).json({ error: 'à¹‚à¸«à¸¡à¸” auto à¸«à¹‰à¸²à¸¡à¸ªà¹ˆà¸‡ team_members' });
      } else if (assign_mode === 'team') {
        if (!teamRepresentative) return res.status(400).json({ error: 'à¹‚à¸«à¸¡à¸”à¸—à¸µà¸¡à¸•à¹‰à¸­à¸‡à¹€à¸¥à¸·à¸­à¸à¸Šà¹ˆà¸²à¸‡à¸­à¸¢à¹ˆà¸²à¸‡à¸™à¹‰à¸­à¸¢ 1 à¸„à¸™' });
      }
    }

    const payloadV2 = {
      job_type: String(job_type).trim(),
      ac_type: (ac_type || "").toString().trim(),
      btu: coerceNumber(btu, 0),
      machine_count: Math.max(1, coerceNumber(machine_count, 1)),
      wash_variant: (wash_variant || "").toString().trim(),
      repair_variant: (repair_variant || "").toString().trim(),
      // âœ… à¸£à¸­à¸‡à¸£à¸±à¸šà¸«à¸¥à¸²à¸¢à¸£à¸²à¸¢à¸à¸²à¸£à¸šà¸£à¸´à¸à¸²à¸£à¹ƒà¸™à¹ƒà¸šà¸‡à¸²à¸™à¹€à¸”à¸µà¸¢à¸§ (admin-add-v2 à¸ªà¹ˆà¸‡à¸¡à¸²à¹€à¸›à¹‡à¸™ services[])
      services: Array.isArray(body.services) ? body.services : (Array.isArray(body.service_lines) ? body.service_lines : null),
      admin_override_duration_min: Math.max(0, coerceNumber(override_duration_min, 0)),
    };

    // CWF Spec: Always use conservative duration for booking/collision (no parallel/team reduction)
    let duration_min = computeDurationMinMulti(payloadV2, { source: "admin_book_v2", conservative: true });
    if (duration_min <= 0) {
      return res.status(400).json({ error: "à¸‡à¸²à¸™à¸›à¸£à¸°à¹€à¸ à¸—à¸™à¸µà¹‰à¸•à¹‰à¸­à¸‡à¹ƒà¸«à¹‰à¹à¸­à¸”à¸¡à¸´à¸™à¸à¸³à¸«à¸™à¸”à¹€à¸§à¸¥à¸² (duration_min)" });
    }

    // override duration (admin)
    if (coerceNumber(override_duration_min, 0) > 0) {
      duration_min = Math.max(1, Math.floor(coerceNumber(override_duration_min, duration_min)));
    }

    const customerPrice = await customerPricingHelpers.resolveCustomerPricingMulti(payloadV2, pool);
    const standard_price = Number(customerPrice.active_price ?? customerPrice.standard_price ?? 0);


  // Blocker: explicit admin coordinates must be validated at the BACKEND, not just
  // the UI â€” a stale cached admin page or a direct API caller can send a partial or
  // invalid pair. One-field-only / invalid / out-of-range / 0,0 â†’ HTTP 400 instead
  // of silently falling back to maps/address derivation. Both blank = no explicit GPS.
  {
    const latProvided = coordFieldProvided(body.gps_latitude);
    const lngProvided = coordFieldProvided(body.gps_longitude);
    if (latProvided || lngProvided) {
      if (!(latProvided && lngProvided) || !strictLatLngPairOrNull(body.gps_latitude, body.gps_longitude)) {
          return res.status(400).json({ code: 'INVALID_JOB_SITE_COORDINATES', error: getInvalidJobSiteCoordinatesMessage() });
      }
    }
  }

  // âœ… Coordinate resolution order (never convert missing values to zero):
  //   1) explicit admin-supplied gps_latitude/gps_longitude
  //   2) coordinates parsed from maps_url / address_text
  //   3) best-effort resolution of a short Google Maps link
  //   4) null
  // EVERY candidate pair â€” explicit, parsed, or resolved â€” is passed through the
  // SAME strict validator, so 0,0 / out-of-range / partial / NaN / non-numeric
  // derived coordinates are never persisted.
  const explicitAdminLL = strictLatLngPairOrNull(body.gps_latitude, body.gps_longitude);
  let derivedAdminLL = null;
  if (!explicitAdminLL) {
    const p = parseLatLngFromText(maps_url) || parseLatLngFromText(address_text);
    derivedAdminLL = p ? strictLatLngPairOrNull(p.lat, p.lng) : null;
    // The maps_url itself is always persisted below regardless of resolution, so a
    // short Google Maps link stays saved even when coordinate resolution fails.
    const m = String(maps_url || '').trim();
    if (!derivedAdminLL && m && /maps\.app\.goo\.gl|goo\.gl/i.test(m)) {
      try {
        const rr = await resolveMapsUrlToLatLng(m);
        if (rr) derivedAdminLL = strictLatLngPairOrNull(rr.lat, rr.lng);
      } catch (e) { /* fail-open */ }
    }
  }
  const chosenAdminLL = explicitAdminLL || derivedAdminLL;
  console.log("[latlng_parse]", { explicit: !!explicitAdminLL, derived: !!derivedAdminLL });

    let final_lat = chosenAdminLL ? chosenAdminLL.lat : null;
    let final_lng = chosenAdminLL ? chosenAdminLL.lng : null;


    // saniti×¯}òÚ$z{-®éÜj×ÀĞ¢¶FWFW&Ö–æ—7F–5Fö¶VâÂ&ÕĞĞ¢“°Ğ¢–b†W†—7F–ærç&÷w5³Ò’°Ğ¢òò&6R6fWG’æWC¢6öæ7W'&VçB&WVW7Bv—F‚F†R6ÖR¶W’6öÖÖ—GFVBf—'7BàĞ¢òò6ÖR6æöæ–6Â–ÆöBÓâ&WÆ“²ç’ÖFW&–ÂF–ffW&Væ6RÓâ¶W’×&WW6RCĞ¢òò†æò×WFF–öâÂæò–FVçF–f–W'2õ”’’â6ÖR6ö×&—6öâ2F†R&RÖfÆ–v‡BF‚àĞ¢6öç7B&÷rÒW†—7F–ærç&÷w5³Ó°Ğ¢v—B6Æ–VçBçVW'’‚$4ôÔÔ•B"“°Ğ¢6öç7B–æ6öÖ–æt&öö¶–ærÒ°Ğ¢ö–çFÖVçEöFFWF–ÖRÂ7W7FöÖW%÷†öæRÂ7W7FöÖW%öæÖRÂFG&W75÷FW‡BÂÖ5÷W&ÂÀ¢¦ö%÷¦öæRÂ¦ö%÷G—RÂ7W7FöÖW%öæ÷FRÂÆÆ÷u÷F–ÖU÷&÷÷6Ã¢ÆÆ÷uF–ÖU&÷÷6ÂÀ¢w5öÆF—GVFS¢W'6—7FVDw4ÆF—GVFRÂw5öÆöæv—GVFS¢W'6—7FVDw4Æöæv—GVFRÀ¢GW&F–öåöÖ–ã¢GW&F–öåöÖ–å÷c"Â–ÆöEc"Â—FVÔ–EG’Â7FæF&E&–6S¢7FæF&E÷&–6RÀ¢Ó°¢–b‚†v—B66†VGVÆVE–ÆöDÖF6†W4W†—7F–ær‡ööÂÂ&÷rÂ–æ6öÖ–æt&öö¶–ær’’’°¢&WGW&â&W2ç7FGW2ƒC’’æ§6öâ‡°Ğ¢W'&÷#¢.ˆN‹>ˆ.ŠŞ‰‹^˜‰n‹ˆ˜>ˆ®˜˜N‰¾˜Š^˜Š~ˆ‹‰®ˆ‹.Š>ˆŠŞˆ~ŠŞ‹~˜‰’ˆŠ>‹‰>‹.˜Š>‹N˜Šˆ‹.Š>ˆŠŞˆ~˜>Š¾Š˜‚"ÀĞ¢6öFS¢$”DTÕõDTä5•ô´U•õ$UU4TB"ÀĞ¢Ò“°Ğ¢ĞĞ¢&WGW&â&W2æ§6öâ‡°Ğ¢7V66W73¢G'VRÀĞ¢&WÆ–VC¢G'VRÀĞ¢¦ö%ö–C¢&÷ræ¦ö%ö–BÀĞ¢&öö¶–æuö6öFS¢&÷ræ&öö¶–æuö6öFRÀĞ¢Fö¶Vã¢&÷ræ&öö¶–æu÷Fö¶VâÀĞ¢&öö¶–æuöÖöFS¢&ÒÀĞ¢F—7F6…öÖöFS¢&÷ræF—7F6…öÖöFRÇÂ&æ÷&ÖÂ"ÀĞ¢GW&F–öåöÖ–ã¢çVÖ&W"‡&÷ræGW&F–öåöÖ–âÇÂGW&F–öåöÖ–å÷c"ÇÂ’ÀĞ¢VffV7F—fUö&Æö6µöÖ–ã¢VffV7F—fT&Æö6´Ö–â„çVÖ&W"‡&÷ræGW&F–öåöÖ–âÇÂGW&F–öåöÖ–å÷c"ÇÂ’’ÀĞ¢G&fVÅö'VffW%öÖ–ã¢E$dTÅô%TddU%ôÔ”âÀĞ¢&6U÷F÷FÃ¢çVÖ&W"‡&÷ræ¦ö%÷&–6RÇÂ’ÀĞ¢Ò“°Ğ¢ĞĞ¢ĞĞ Ğ¢ÆWBG&gE&W6W'fF–öåFV6‚ÒçVÆÃ°Ğ¢–b†&ÒÓÓÒ'66†VGVÆVB"’°Ğ¢6öç7B7F'D—6òÒæ÷&ÖÆ—¦Tö–çFÖVçDFFWF–ÖR†ö–çFÖVçEöFFWF–ÖR“°Ğ¢G&gE&W6W'fF–öåFV6‚Òv—B7W7FöÖW$f–Æ&–Æ—G’ç&W6W'fUV&Æ–47W7FöÖW%FV6†æ–6–â€Ğ¢V&Æ–47W7FöÖW$f–Æ&–Æ—G”FW2†6Æ–VçB’ÀĞ¢°Ğ¢ââç–ÆöEc"ÀĞ¢FFS¢7G&–ær‡7F'D—6ò’ç6Æ–6RƒÂ’ÀĞ¢7F'C¢7G&–ær‡7F'D—6ò’ç6Æ–6RƒÂb’ÀĞ¢FV6…÷G—S¢&WVW7FVEFV6…G—RÀĞ¢GW&F–öåöÖ–ã¢GW&F–öåöÖ–å÷c"ÀĞ¢ĞĞ¢“°Ğ¢ĞĞ Ğ¢òò’‰N‹nˆ~Š>‹.ˆN‹"&6U÷&–6Rˆ‹.ˆD Ğ¢6öç7B6W'f–6TÆ–æT—FV×2Òv—B7W7FöÖW%&–6–æt†VÇW'2æ'V–ÆD7W7FöÖW%6W'f–6TÆ–æT—FV×4g&öÕ–ÆöB€Ğ¢‡–ÆöEc"ç6W'f–6W2bb'&’æ—4'&’‡–ÆöEc"ç6W'f–6W2’Ğ¢ò–ÆöEc Ğ¢¢²ââç–ÆöEc"Â6W'f–6W3¢·°Ğ¢¦ö%÷G—S¢–ÆöEc"æ¦ö%÷G—RÀĞ¢5÷G—S¢–ÆöEc"æ5÷G—RÀĞ¢'GS¢–ÆöEc"æ'GRÀĞ¢Ö6†–æUö6÷VçC¢–ÆöEc"æÖ6†–æUö6÷VçBÀĞ¢v6…÷f&–çC¢–ÆöEc"çv6…÷f&–çBÀĞ¢&W—%÷f&–çC¢–ÆöEc"ç&W—%÷f&–çBÀĞ¢ÕÒÒÀĞ¢6Æ–Vç@Ğ¢“°Ğ Ğ¢òòfÆÆ&6²‡6–ævÆR6W'f–6RĞ¢ÆWB6ö×WFVD—FV×2ÒµÓ°Ğ¢ÆWBF÷FÂÒçVÖ&W"‡7FæF&E÷&–6RÇÂ“°Ğ Ğ¢–b‡6W'f–6TÆ–æT—FV×2æÆVæwF‚’°Ğ¢6ö×WFVD—FV×2Ò6ö×WFVD—FV×2æ6öæ6B‡6W'f–6TÆ–æT—FV×2“°Ğ¢F÷FÂÒ6W'f–6TÆ–æT—FV×2ç&VGV6R‚‡2Æ—B“Óâ2²çVÖ&W"†—BæÆ–æU÷F÷FÇÇÃ’Â“°Ğ¢ÒVÇ6R–b‡F÷FÂâ’°Ğ¢òò7W7FöÖW"&–6RfÆÆ&6²öæÇ“²—&öÆÂv–ÆÂæ÷BG&VBF†—22FV6†æ–6–â–æ6öÖPĞ¢6ö×WFVD—FV×2çW6‚‡²—FVÕö–C¢çVÆÂÂ—FVÕöæÖS¢ˆN˜‹.‰®Š>‹Nˆ‹.Š>Š‹.‰^Š>‰‹.‰’‚G·–ÆöEc"æ¦ö%÷G—RÇÂrÒwÒ–ÂG“¢ÂVæ—E÷&–6S¢F÷FÂÂÆ–æU÷F÷FÃ¢F÷FÂÂ—5÷6W'f–6S¢fÇ6RÒ“°Ğ¢ĞĞ Ğ¢òòW‡G&2†7W7FöÖW"×f—6–&ÆRöæÇ’Ğ¢–b†—FVÔ–EG’æÆVæwF‚’°Ğ¢6öç7B–G2Ò—FVÔ–EG’æÖ‚‡‚’Óâ‚æ—FVÕö–B“°Ğ¢6öç7B6E"Òv—B6Æ–VçBçVW'’€Ğ¢4TÄT5B—FVÕö–BÂ—FVÕöæÖRÂ&6U÷&–6PĞ¢e$ôÒV&Æ–2æ6FÆöuö—FV×0Ğ¢t„U$R—5ö7F—fSÕE%TRäB—5ö7W7FöÖW%÷f—6–&ÆSÕE%TRò¢5U5DôÔU%ô4DÄôuõd•4”$ÄUôôäÅ’¢òäB—FVÕö–BÒå’‚C£¦&–v–çEµÒ–ÀĞ¢¶–G5ĞĞ¢“°Ğ Ğ¢6öç7BÖÒæWrÖ†6E"ç&÷w2æÖ‚‡"’Óâ´çVÖ&W"‡"æ—FVÕö–B’Â%Ò’“°Ğ¢6öç7BW‡G&Æ–æW2Ò—FVÔ–EGĞ¢æÖ‚‡‚’Óâ°Ğ¢6öç7B—BÒÖævWB„çVÖ&W"‡‚æ—FVÕö–B’“°Ğ¢–b‚—B’&WGW&âçVÆÃ°Ğ¢6öç7BG’ÒçVÖ&W"‡‚çG’“°Ğ¢6öç7BVæ—E÷&–6RÒçVÖ&W"†—Bæ&6U÷&–6RÇÂ“°Ğ¢6öç7BÆ–æU÷F÷FÂÒG’¢Væ—E÷&–6S°Ğ¢F÷FÂ³ÒÆ–æU÷F÷FÃ°Ğ¢&WGW&â°Ğ¢—FVÕö–C¢çVÖ&W"†—Bæ—FVÕö–B’ÀĞ¢—FVÕöæÖS¢—Bæ—FVÕöæÖRÀĞ¢G’ÀĞ¢Væ—E÷&–6RÀĞ¢Æ–æU÷F÷FÂÀĞ¢Ó°Ğ¢ÒĞ¢æf–ÇFW"„&ööÆVâ“°Ğ Ğ¢6ö×WFVD—FV×2Ò6ö×WFVD—FV×2æ6öæ6B†W‡G&Æ–æW2“°Ğ¢ĞĞ Ğ¢òò"’Š®Š>˜‹.ˆ~ˆ~‹.‰Ğ Ğ¢òò)ÈR˜.‰¾Š>˜.Šˆ®‹˜‰‰Ş‹˜ˆ~Š^‹ˆˆN˜‹#¢Š>‹‰®‰®˜Š^‹~ŠŞˆ˜>Š¾˜ŠŞ‹‰^˜.‰Š‹‰^‹N‰^‹.Š˜ˆ~‹~˜ŠŞ‰˜Nˆ"‡7WW"FÖ–â‰^‹˜ˆ~ˆN˜‹"Ğ¢òò”Õõ%DåC¢.Š>‹.ˆN‹""ˆ.ŠŞˆ~ˆ~‹.‰‰^˜ŠŞˆ~˜‰¾˜~‰Š>‹.ˆN‹.‰î‹~˜‰‰‹.‰˜‰N‹NŠŠ¾˜‹.Š˜‰¾Š^‹^˜Š.‰Š>‹.ˆN‹"Ğ¢òòÒ¦ö'2æ¦ö%÷&–6R˜ˆ˜~‰¢&6U÷F÷FÂ˜‰~˜‹.‰‹˜‰Ğ¢òòÒŠ®˜Š~‰Š^‰N‰®‹‰‰~‹nˆ˜Š.ˆ‰~‹^˜‚¦ö%÷&öÖ÷F–öç2æÆ–VEöF—66÷Vç@Ğ¢6öç7B&6U÷F÷FÂÒçVÖ&W"‡F÷FÂÇÂ“°Ğ¢6öç7B&öÖõ–6²Òv—Bf–æD&W7D7W7FöÖW%&öÖ÷F–öâ‡–ÆöEc"Â&6U÷F÷FÂÂ6Æ–VçB“°Ğ¢6öç7BÆ–VE&öÖòÒ&öÖõ–6³òç&öÖòÇÂçVÆÃ°Ğ¢6öç7BÆ–VDF—66÷VçBÒÖF‚æÖ–â„çVÖ&W"†&6U÷F÷FÂÇÂ’ÂçVÖ&W"‡&öÖõ–6³òæF—66÷VçBÇÂ’“°Ğ Ğ¢òò)ÈRF—7F6…öÖöFS Ğ¢òòÒ66†VGVÆVBŠ^‹ˆˆN˜‹.ˆŠŞˆ~‰¾ˆ‰^‹B’Óâæ÷&ÖÂ˜>Š¾˜˜ˆ.˜‹.˜ŠŞ‰NŠ‹N‰’şˆN‹NŠ~‰^‹.Š‰¾ˆ‰^‹BĞ¢òòÒW&vVçBŠ.‹Nˆ~ˆ~‹.‰‰N˜Š~‰’’ÓâöffW"˜N‰²fÆ÷röffW"Ğ¢6öç7BF—7F6„ÖöFRÒ†&ÒÓÓÒwW&vVçBr’òvöffW"r¢væ÷&ÖÂs°Ğ Ğ¢6öç7B6FÆötÆ–æµ&VG’Òv—B—4¦ö'46FÆötÆ–æµ66†VÖ&VG’‚“°Ğ¢6öç7B¦ö$–ç6W'D6öÇVÖç2Ò°Ğ¢&7W7FöÖW%öæÖR"Â&7W7FöÖW%÷†öæR"Â&¦ö%÷G—R"Â&ö–çFÖVçEöFFWF–ÖR"Â&¦ö%÷&–6R"ÀĞ¢&FG&W75÷FW‡B"Â'FV6†æ–6–å÷FVÒ"Â'FV6†æ–6–å÷W6W&æÖR"Â&¦ö%÷7FGW2"ÀĞ¢&&öö¶–æu÷Fö¶Vâ"Â&¦ö%÷6÷W&6R"Â&F—7F6…öÖöFR"Â&7W7FöÖW%öæ÷FR"À¢&Ö5÷W&Â"Â&¦ö%÷¦öæR"Â&GW&F–öåöÖ–â"Â&&öö¶–æuöÖöFR"Â&ÆÆ÷u÷F–ÖU÷&÷÷6Â"À¢&w5öÆF—GVFR"Â&w5öÆöæv—GVFR"À¢Ó°¢6öç7B¦ö$–ç6W'EfÇVW57ÂÒ²"C"Â"C""Â"C2"Â"CB"Â"CR"Â"Cb"Â$åTÄÂ"Â"Cb"Â"C"Â"Cr"Â"v7W7FöÖW"r"Â"CB"Â"C‚"Â"C’"Â"C"Â"C""Â"C2"Â"CR"Â"Cr"Â"C‚%Ó°¢6öç7B¦ö$–ç6W'E&×2Ò°Ğ¢7G&–ær†7W7FöÖW%öæÖR’çG&–Ò‚’ÀĞ¢†7W7FöÖW%÷†öæRÇÂ""’çFõ7G&–ær‚’çG&–Ò‚’ÀĞ¢7G&–ær†¦ö%÷G—R’çG&–Ò‚’ÀĞ¢ö–çFÖVçEöFFWF–ÖRÀĞ¢çVÖ&W"†&6U÷F÷FÂÇÂ’ÀĞ¢7G&–ær†FG&W75÷FW‡B’çG&–Ò‚’ÀĞ¢Fö¶VâÀĞ¢†7W7FöÖW%öæ÷FRÇÂ""’çFõ7G&–ær‚’ÀĞ¢†Ö5÷W&ÂÇÂ""’çFõ7G&–ær‚’ÀĞ¢†¦ö%÷¦öæRÇÂ""’çFõ7G&–ær‚’ÀĞ¢&ÒÓÓÒ'W&vVçB"ò¤ô%õ5DEU2äDÔ”åõU$tTåEõt•D”är¢¤ô%õ5DEU2ä5U5DôÔU%õ44„TETÄTEõ$Ud”UrÀ¢GW&F–öåöÖ–å÷c"ÀĞ¢†&ÒÓÓÒwW&vVçBròwW&vVçBr¢w66†VGVÆVBr’ÀĞ¢F—7F6„ÖöFRÀĞ¢ÆÆ÷uF–ÖU&÷÷6ÂÀ¢G&gE&W6W'fF–öåFV6‚òG&gE&W6W'fF–öåFV6‚çW6W&æÖR¢çVÆÂÀ¢W'6—7FVDw4ÆF—GVFRÀ¢W'6—7FVDw4Æöæv—GVFRÀ¢Ó°¢–b†6FÆötÆ–æµ&VG’’°Ğ¢¦ö$–ç6W'D6öÇVÖç2çW6‚‚&6FÆöuö—FVÕö–B"Â&7W7FöÖW%÷7V""“°Ğ¢¦ö$–ç6W'E&×2çW6‚‡6fT6FÆöt—FVÔ–Df÷$¦ö"Â7W7FöÖW%7V$f÷$¦ö"“°Ğ¢¦ö$–ç6W'EfÇVW57ÂçW6‚†BG¶¦ö$–ç6W'E&×2æÆVæwF‚ÒÖÂBG¶¦ö$–ç6W'E&×2æÆVæwF‡Ö“°Ğ¢ĞĞ Ğ¢6öç7B"Òv—B6Æ–VçBçVW'’€Ğ¢ Ğ¢”å4U%B”åDòV&Æ–2æ¦ö'0Ğ¢‚G¶¦ö$–ç6W'D6öÇVÖç2æ¦ö–â‚"Â"—ÒĞ¢dÅTU2‚G¶¦ö$–ç6W'EfÇVW57Âæ¦ö–â‚"Â"—ÒĞ¢$UEU$ä”är¦ö%ö–BÂ&öö¶–æu÷Fö¶VàĞ¢ÀĞ¢¦ö$–ç6W'E&×0Ğ¢“°Ğ Ğ¢òòGF6‚&öÖòFò¦ö"†–bç’Ğ¢–b†Æ–VE&öÖòbbÆ–VDF—66÷VçBâ—°Ğ¢G'—°Ğ¢v—B6Æ–VçBçVW'’€Ğ¢”å4U%B”åDòV&Æ–2æ¦ö%÷&öÖ÷F–öç2†¦ö%ö–BÂ&öÖõö–BÂÆ–VEöF—66÷VçBĞ¢dÅTU2‚CÂC"ÂC2Ğ¢ôâ4ôädÄ”5B†¦ö%ö–B’DòUDDR4UB&öÖõö–CÔU„4ÅTDTBç&öÖõö–BÂÆ–VEöF—66÷VçCÔU„4ÅTDTBæÆ–VEöF—66÷VçFÀĞ¢·"ç&÷w5³Òæ¦ö%ö–BÂçVÖ&W"†Æ–VE&öÖòç&öÖõö–B’ÂçVÖ&W"†Æ–VDF—66÷VçB•ĞĞ¢“°Ğ¢Ö6F6‚†R—°Ğ¢òòf–ÂÖ÷Vã¢FöâwB'&V²&öö¶–æpĞ¢6öç6öÆRçv&â‚u·V&Æ–5ö&ööµÒ&öÖòGF6‚f–ÆVBrÂRæÖW76vR“°Ğ¢ĞĞ¢ĞĞ Ğ¢6öç7B¦ö%ö–BÒ"ç&÷w5³Òæ¦ö%ö–C°Ğ¢òò)ÈR&öö¶–æuö6öFRŠ®‹˜Š˜NŠ˜˜Š>‹^Š.ˆrĞ¢6öç7B&öö¶–æuö6öFRÒv—BvVæW&FUVæ—VT&öö¶–æt6öFR†6Æ–VçB“°Ğ Ğ¢v—B6Æ–VçBçVW'’†UDDRV&Æ–2æ¦ö'24UB&öö¶–æuö6öFSÒCt„U$R¦ö%ö–CÒC&Â¶&öö¶–æuö6öFRÂ¦ö%ö–EÒ“°Ğ Ğ¢òò5$TDUõU$tTåEôôddU%5õc ¢ÆWBW&vVçDöffW'46÷VçBÒ°¢ÆWBW&vVçEW6…F&vWG2ÒµÓ°¢–b†&ÒÓÓÒ'W&vVçB"bbW&vVçDöffW$Væ&ÆVB’°¢v—BW‡—&UFV6†æ–6–ä66WE7FGW6W2†6Æ–VçB“°¢6öç7B7&—FW&–Æ—7BÒFWVæFVæ6–W2æf–Æ&–Æ—G”Væv–æRæ'V–ÆD7&—FW&–Æ—7B‡–ÆöEc"“°¢6öç7BF—7F6‚Òv—BW&vVçDF—7F6…6W'f–6Ræf–æDVÆ–v–&ÆUFV6†æ–6–ç2‡°¢ââç–ÆöEc"À¢¦ö%ö–BÀ¢ö–çFÖVçEöFFWF–ÖRÀ¢GW&F–öåöÖ–ã¢GW&F–öåöÖ–å÷c"À¢FG&W75÷FW‡BÀ¢Ö5÷W&ÂÀ¢¦ö%÷¦öæRÀ¢ÒÂ²F#¢6Æ–VçBÂ7&—FW&–Æ—7BÒ“°¢6öç7Bf–Æ&ÆU'FæW'2ÒF—7F6‚æf–Æ&ÆS° Ğ¢–b‚f–Æ&ÆU'FæW'2æÆVæwF‚’°Ğ¢v—B6Æ–VçBçVW'’€Ğ¢UDDRV&Æ–2æ¦ö'0Ğ¢4UB¦ö%÷7FGW3ÒrG´¤ô%õ5DEU2åU$tTåEôäõõDT4„ä”4”çÒpĞ¢t„U$R¦ö%ö–CÒCÀĞ¢¶¦ö%ö–EĞĞ¢“°Ğ¢6öç6öÆRçv&â‚%·V&Æ–5ö&ööµÒW&vVçEöæõööffW%÷F&vWG2"Â²¦ö%ö–BÂ&öö¶–æuö6öFRÒ“°Ğ¢ÒVÇ6R°Ğ¢òò)ÈR6fWG“¢ˆ‹>ˆ‹‰N˜NŠ˜˜ˆ‹N‰’3ˆ®˜‹.ˆrş‰~‹^Š‰~‹^˜Š®˜ˆröffW Ğ¢f÷"†6öç7BRöbf–Æ&ÆU'FæW'2’°Ğ¢v—B6Æ–VçBçVW'’€Ğ¢”å4U%B”åDòV&Æ–2æ¦ö%ööffW'2†¦ö%ö–BÂFV6†æ–6–å÷W6W&æÖRÂ7FGW2ÂW‡—&W5öBĞ¢dÅTU2‚CÂC"ÂrG´ôddU%õ5DEU2åTäD”äwÒrÂäõr‚’²”åDU%dÂsÖ–çWFW2r–ÀĞ¢¶¦ö%ö–BÂUĞĞ¢“°Ğ¢Ğ¢W&vVçDöffW'46÷VçBÒf–Æ&ÆU'FæW'2æÆVæwFƒ°¢W&vVçEW6…F&vWG2Òf–Æ&ÆU'FæW'3°¢6öç6öÆRæÆör‚%·V&Æ–5ö&ööµÒW&vVçEööffW'2"Â²¦ö%ö–BÂ&öö¶–æuö6öFRÂ6÷VçC¢f–Æ&ÆU'FæW'2æÆVæwF‚Ò“°¢Ğ¢Ğ Ğ Ğ¢òò2’‰®‹‰‰~‹nˆŠ>‹.Š.ˆ‹.Š2‰n˜‹.Š‹RĞ¢f÷"†6öç7B—Böb6ö×WFVD—FV×2’°Ğ¢v—B6Æ–VçBçVW'’€Ğ¢ Ğ¢”å4U%B”åDòV&Æ–2æ¦ö%ö—FV×0Ğ¢†¦ö%ö–BÂ—FVÕö–BÂ—FVÕöæÖRÂG’ÂVæ—E÷&–6RÂÆ–æU÷F÷FÂÂ76–væVE÷FV6†æ–6–å÷W6W&æÖRÂ—5÷6W'f–6RÀĞ¢7W7FöÖW%÷&–6U÷'VÆUö–BÂæ÷&ÖÅ÷Væ—E÷&–6RÂ7W7FöÖW%÷&–6UöÆ&VÂÂ7W7FöÖW%ö6×–våöæÖRÂ7W7FöÖW%÷&–6U÷6÷W&6RĞ¢dÅTU2‚CÂC"ÂC2ÂCBÂCRÂCbÂCrÂC‚ÂC’ÂCÂCÂC"ÂC2Ğ¢ÀĞ¢°Ğ¢¦ö%ö–BÀĞ¢—Bæ—FVÕö–BÇÂçVÆÂÀĞ¢—Bæ—FVÕöæÖRÀĞ¢çVÖ&W"†—BçG’ÇÂ’ÀĞ¢çVÖ&W"†—BçVæ—E÷&–6RÇÂ’ÀĞ¢çVÖ&W"†—BæÆ–æU÷F÷FÂÇÂ’ÀĞ¢—Bæ76–væVE÷FV6†æ–6–å÷W6W&æÖRÇÂçVÆÂÀĞ¢—Bæ—5÷6W'f–6RÀĞ¢—Bæ7W7FöÖW%÷&–6U÷'VÆUö–BÇÂçVÆÂÀĞ¢—Bææ÷&ÖÅ÷Væ—E÷&–6RÇÂçVÆÂÀĞ¢—Bæ7W7FöÖW%÷&–6UöÆ&VÂÇÂçVÆÂÀĞ¢—Bæ7W7FöÖW%ö6×–våöæÖRÇÂçVÆÂÀĞ¢—Bæ7W7FöÖW%÷&–6U÷6÷W&6RÇÂçVÆÂÀĞ¢ĞĞ¢“°Ğ¢ĞĞ Ğ¢v—BVç7W&T6æöæ–6Ä&öö¶–æt¦ö%Væ—G2†¦ö%ö–BÂ6Æ–VçB“°¢v—B6Æ–VçBçVW'’†UDDRV&Æ–2æ¦ö'24UBW%÷Væ—EöWf–FVæ6UöVæ&ÆVCÕE%TRt„U$R¦ö%ö–CÒCÂ¶¦ö%ö–EÒ“° ¢–b†&ÒÓÓÒ'W&vVçB"bbG—VöbÆöt¦ö%WFFRÓÓÒ&gVæ7F–öâ"’°¢v—BÆöt¦ö%WFFR†¦ö%ö–BÂ°¢7F÷%÷W6W&æÖS¢&7W7FöÖW""À¢7F÷%÷&öÆS¢&7W7FöÖW""À¢7F–öã¢&7W7FöÖW%÷W&vVçEö7&VFVB"À¢ÖW76vS¢W&vVçEW6…F&vWG2æÆVæwF€¢ò.Š>‹‰®ˆN‹>ˆ.ŠŞ˜Š^˜Šrˆ‹>Š^‹ˆ~Š®˜ˆ~ˆ~‹.‰˜>Š¾˜ˆ®˜‹.ˆ~‰~‹^˜‰îŠ>˜ŠŞŠŠ>‹‰®ˆ~‹.‰’ ¢¢.ˆ.‰>‹‰‹^˜Š.‹ˆ~˜NŠ˜Š‹^ˆ®˜‹.ˆ~Š>‹‰®ˆ~‹.‰’"À¢–ÆöC¢²F—7F6…öÖöFS¢&öffW""ÒÀ¢ÒÂ6Æ–VçB“°¢Ğ¢v—B6Æ–VçBçVW'’‚$4ôÔÔ•B"“° ¢–b†&ÒÓÓÒ'W&vVçB"bbW&vVçEW6…F&vWG2æÆVæwF‚bbG—Vöböæ÷F–g•W&vVçDöffW"ÓÓÒ&gVæ7F–öâ"’°¢G'’°¢v—Böæ÷F–g•W&vVçDöffW"‡°¢W6W&æÖW3¢W&vVçEW6…F&vWG2À¢¦ö%ö–BÀ¢&öö¶–æuö6öFRÀ¢¦ö%÷G—RÀ¢ö–çFÖVçEöFFWF–ÖRÀ¢¦ö%÷¦öæRÀ¢Ò“°¢Ò6F6‚†æ÷F–g”W'&÷"’°¢6öç6öÆRæW'&÷"‚%·V&Æ–5ö&ööµÒW&vVçBæ÷F–f–6F–öâf–ÆVBgFW"6öÖÖ—B"Â°¢¦ö%ö–BÀ¢ÖW76vS¢æ÷F–g”W'&÷"bbæ÷F–g”W'&÷"æÖW76vRÀ¢Ò“°¢Ğ¢Ğ¢6öç6öÆRæÆör‚u·V&Æ–5ö&ööµÒrÂ²¦ö%ö–BÂ&öö¶–æuö6öFRÂ&öö¶–æuöÖöFS¢&ÒÂ&WVW7FVE÷FV6…÷G—S¢&WVW7FVEFV6…G—RÂGW&F–öåöÖ–ã¢GW&F–öåöÖ–å÷c"ÂVffV7F—fUö&Æö6µöÖ–ã¢VffV7F—fT&Æö6´Ö–â†GW&F–öåöÖ–å÷c"’Ò“°¢6öç7BW&vVçEV&Æ–57FGW2Ò&ÒÓÓÒ'W&vVçB ¢ò°¢†6S¢W&vVçDöffW'46÷VçBâò'6V&6†–ær"¢&fÆÆ&6²"À¢ÖW76vS¢W&vVçDöffW'46÷VçBâ ¢ò.Š>‹‰®ˆN‹>ˆ.ŠŞ˜Š^˜Šrˆ‹>Š^‹ˆ~Š®˜ˆ~ˆ~‹.‰˜>Š¾˜ˆ®˜‹.ˆ~‰~‹^˜‰îŠ>˜ŠŞŠŠ>‹‰®ˆ~‹.‰’ ¢¢.ˆ.‰>‹‰‹^˜Š.‹ˆ~˜NŠ˜Š‹^ˆ®˜‹.ˆ~Š>‹‰®ˆ~‹.‰’ˆN‹‰>Š®‹.Š‹.Š>‰n‰^‹N‰N‰^‹.ŠŠ®‰n‹.‰‹Š¾Š>‹~ŠŞ‰^‹N‰N‰^˜ŠŞ˜ŠŞ‰NŠ‹N‰˜N‰N˜’"À¢Ğ¢¢·Ó°¢&W2æ§6öâ‡°¢7V66W73¢G'VRÀĞ¢¦ö%ö–BÀĞ¢&öö¶–æuö6öFRÀĞ¢Fö¶Vã¢"ç&÷w5³Òæ&öö¶–æu÷Fö¶VâÀĞ¢&öö¶–æuöÖöFS¢&ÒÀĞ¢F—7F6…öÖöFS¢F—7F6„ÖöFRÀĞ¢âââ†&ÒÓÓÒ'66†VGVÆVB ¢ò²öffW'5ö6÷VçC¢ÂW&vVçEööffW%öVæ&ÆVC¢fÇ6RĞ¢¢W&vVçEV&Æ–57FGW2’À¢GW&F–öåöÖ–ã¢GW&F–öåöÖ–å÷c"ÀĞ¢VffV7F—fUö&Æö6µöÖ–ã¢VffV7F—fT&Æö6´Ö–â†GW&F–öåöÖ–å÷c"’ÀĞ¢G&fVÅö'VffW%öÖ–ã¢E$dTÅô%TddU%ôÔ”âÀĞ¢Æ–VE÷&öÖó¢†Æ–VE&öÖòbbÆ–VDF—66÷VçBâ’ò°Ğ¢&öÖõö–C¢Æ–VE&öÖòç&öÖõö–BÀĞ¢&öÖõöæÖS¢Æ–VE&öÖòç&öÖõöæÖRÀĞ¢&öÖõ÷G—S¢Æ–VE&öÖòç&öÖõ÷G—RÀĞ¢&öÖõ÷fÇVS¢Æ–VE&öÖòç&öÖõ÷fÇVRÀĞ¢F—66÷VçC¢Æ–VDF—66÷VçBÀĞ¢Ò¢çVÆÂÀĞ¢&6U÷F÷FÃ¢çVÖ&W"†&6U÷F÷FÂÇÂ’ÀĞ¢Ò“°Ğ¢Ò6F6‚†R’°Ğ¢v—B6Æ–VçBçVW'’‚%$ôÄÄ$4²"“°Ğ¢6öç7B7FGW46öFRÒçVÖ&W"†Sòç7FGW46öFRÇÂSòç7FGW2ÇÂS“°Ğ¢6öç6öÆRæW'&÷"†R“°Ğ¢&W2ç7FGW2‡7FGW46öFRãÒCbb7FGW46öFRÂcò7FGW46öFR¢S’æ§6öâ‡°Ğ¢W'&÷#¢RæÖW76vRÇÂ.ˆŠŞˆ~ˆ~‹.‰˜NŠ˜Š®‹>˜Š>˜~ˆ‚"ÀĞ¢6öFS¢Sòæ6öFRÇÂVæFVf–æVBÀĞ¢Ò“°Ğ¢Òf–æÆÇ’°Ğ¢6Æ–VçBç&VÆV6R‚“°Ğ¢ĞĞ¢ĞĞ Ğ¢&WGW&â°Ğ¢†æFÆTFÖ–ä&ööµc"ÀĞ¢†æFÆT–çFW&æÄ&öö´g&öÔ’ÀĞ¢†æFÆUV&Æ–47W7FöÖW%W&vVçD&öö²ÀĞ¢†æFÆUV&Æ–4&öö²ÀĞ¢Ó°Ğ§ĞĞ Ğ¦ÖöGVÆRæW‡÷'G2Ò°Ğ¢7&VFT&öö¶–æt¦ö%6W'f–6RÀĞ§Ó°Ğ