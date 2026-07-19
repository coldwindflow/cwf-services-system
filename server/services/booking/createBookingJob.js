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
  const ENABLE_CUSTOMER_URGENT_BOOKING = Boolean(dependencies.isCustomerUrgentBookingEnabled());
  const ENABLE_CUSTOMER_SCHEDULED_BOOKING = Boolean(dependencies.isCustomerScheduledBookingEnabled());
  const ENABLE_URGENT_FLOW = Boolean(dependencies.isUrgentFlowEnabled());
  const CWF_LINE_CONTACT_URL = dependencies.lineContactUrl;
  const TRAVEL_BUFFER_MIN = dependencies.travelBufferMin;
  const getInvalidJobSiteCoordinatesMessage = dependencies.getInvalidJobSiteCoordinatesMessage;
  const _refreshTechnicianIncomePreviewForJob = dependencies.refreshTechnicianIncomePreviewForJob;
  const _notifyUrgentOffer = dependencies.notifyUrgentOffer;
  const _notifyDirectJobAssigned = dependencies.notifyDirectJobAssigned;

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
        `มีงานใหม่จาก AI\n` +
        `เลขงาน: ${booking_code || '-'} / #${job_id || '-'}\n` +
        `ลูกค้า: ${customer_name || '-'}\n` +
        `โทร: ${customer_phone || '-'}\n` +
        `นัดหมาย: ${appointment_datetime || '-'}\n` +
        `ประเภทงาน: ${service_type || '-'}\n` +
        `จำนวนเครื่อง: ${machine_count}\n` +
        `ที่อยู่: ${address_text || '-'}\n` +
        `ช่างที่ได้งาน: ${technician_username || 'ยังไม่ระบุ'}`
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

    // ✅ assign_mode (auto|single|team)
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
      return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อ/ประเภทงาน/วันนัด/ที่อยู่)" });
    }

    // ✅ Timezone safety (Asia/Bangkok):
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
    // ✅ HOTFIX: allow_time_proposal may be omitted by older cached frontend/PWA.
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
    if (!['company','partner','all'].includes(ttype)) return res.status(400).json({ error: "tech_type ต้องเป็น company|partner|all" });
    if (!['normal','forced','offer'].includes(mode)) return res.status(400).json({ error: "dispatch_mode ต้องเป็น normal|forced|offer" });

    // ✅ Enforce assign_mode contract (R2)
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
        if (!techProvided) return res.status(400).json({ error: 'โหมด single ต้องระบุ technician_username' });
        if (tmAny) return res.status(400).json({ error: 'โหมด single ห้ามส่ง team_members' });
      } else if (assign_mode === 'auto') {
        if (tmAny) return res.status(400).json({ error: 'โหมด auto ห้ามส่ง team_members' });
      } else if (assign_mode === 'team') {
        if (!teamRepresentative) return res.status(400).json({ error: 'โหมดทีมต้องเลือกช่างอย่างน้อย 1 คน' });
      }
    }

    const payloadV2 = {
      job_type: String(job_type).trim(),
      ac_type: (ac_type || "").toString().trim(),
      btu: coerceNumber(btu, 0),
      machine_count: Math.max(1, coerceNumber(machine_count, 1)),
      wash_variant: (wash_variant || "").toString().trim(),
      repair_variant: (repair_variant || "").toString().trim(),
      // ✅ รองรับหลายรายการบริการในใบงานเดียว (admin-add-v2 ส่งมาเป็น services[])
      services: Array.isArray(body.services) ? body.services : (Array.isArray(body.service_lines) ? body.service_lines : null),
      admin_override_duration_min: Math.max(0, coerceNumber(override_duration_min, 0)),
    };

    // CWF Spec: Always use conservative duration for booking/collision (no parallel/team reduction)
    let duration_min = computeDurationMinMulti(payloadV2, { source: "admin_book_v2", conservative: true });
    if (duration_min <= 0) {
      return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration_min)" });
    }

    // override duration (admin)
    if (coerceNumber(override_duration_min, 0) > 0) {
      duration_min = Math.max(1, Math.floor(coerceNumber(override_duration_min, duration_min)));
    }

    const customerPrice = await customerPricingHelpers.resolveCustomerPricingMulti(payloadV2, pool);
    const standard_price = Number(customerPrice.active_price ?? customerPrice.standard_price ?? 0);


  // Blocker: explicit admin coordinates must be validated at the BACKEND, not just
  // the UI — a stale cached admin page or a direct API caller can send a partial or
  // invalid pair. One-field-only / invalid / out-of-range / 0,0 → HTTP 400 instead
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

  // ✅ Coordinate resolution order (never convert missing values to zero):
  //   1) explicit admin-supplied gps_latitude/gps_longitude
  //   2) coordinates parsed from maps_url / address_text
  //   3) best-effort resolution of a short Google Maps link
  //   4) null
  // EVERY candidate pair — explicit, parsed, or resolved — is passed through the
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


    // sanitize items
    const safeItemsIn = Array.isArray(items) ? items : [];
    const itemIdQty = safeItemsIn
      .map((x) => ({ item_id: Number(x.item_id), qty: Number(x.qty || 1) }))
      .filter((x) => Number.isFinite(x.item_id) && x.item_id > 0 && Number.isFinite(x.qty) && x.qty > 0);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Durable, cross-instance idempotency for customer-sourced urgent
      // requests: an advisory lock scoped to this transaction serializes any
      // concurrent/retried requests sharing the same urgent_request_key
      // (across all app-server instances connected to this Postgres), and
      // auto-releases on COMMIT/ROLLBACK so it can never be left held by a
      // crashed process. If a job for this exact key already committed
      // (found via the deterministic booking_token), short-circuit here and
      // return that prior result instead of creating a second job/offer set.
      if (urgentRequestKey && urgentDeterministicToken) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [urgentRequestKey]);
        const dupCheck = await client.query(
          `SELECT j.job_id, j.booking_code, j.booking_token, COALESCE(j.job_status,'') AS job_status,
                  COUNT(o.offer_id)::int AS offers_count
             FROM public.jobs j
             LEFT JOIN public.job_offers o ON o.job_id=j.job_id
            WHERE j.booking_token=$1
            GROUP BY j.job_id, j.booking_code, j.booking_token, j.job_status
            LIMIT 1`,
          [urgentDeterministicToken]
        );
        const dupRow = dupCheck.rows[0] || null;
        if (dupRow && dupRow.booking_code) {
          await client.query("COMMIT");
          const duplicatePayload = {
            success: true,
            booking_code: dupRow.booking_code,
            token: dupRow.booking_token,
            duplicate: true,
            offers_count: Number(dupRow.offers_count || 0),
          };
          if (dupRow.job_status === JOB_STATUS.URGENT_NO_TECHNICIAN) {
            duplicatePayload.phase = "admin_review";
            duplicatePayload.admin_review = true;
            duplicatePayload.message = "ส่งคำขอเข้าคิวแอดมินแล้ว";
          }
          return res.json(duplicatePayload);
        }
      }

      await expireTechnicianAcceptStatuses(client);

      // promo
      let promo = null;
      if (promotion_id) {
        const pr = await client.query(
          `SELECT promo_id, promo_name, promo_type, promo_value
           FROM public.promotions
           WHERE promo_id=$1 AND is_active=TRUE LIMIT 1`,
          [promotion_id]
        );
        promo = pr.rows[0] || null;
      }

      // resolve items
  const computedItems = [];

  const serviceLineItems = await customerPricingHelpers.buildCustomerServiceLineItemsFromPayload(
    (payloadV2.services && Array.isArray(payloadV2.services))
      ? payloadV2
      : { ...payloadV2, services: [{
          job_type: payloadV2.job_type,
          ac_type: payloadV2.ac_type,
          btu: payloadV2.btu,
          machine_count: payloadV2.machine_count,
          wash_variant: payloadV2.wash_variant,
          repair_variant: payloadV2.repair_variant,
          assigned_to: (isUrgentOffer ? null : (technician_username || null)),
        }] },
    client
  );

  if (coerceNumber(override_price, 0) > 0) {
    // Customer override price only. Payroll must never use this as technician income.
    computedItems.push({ item_id: null, item_name: `ค่าบริการ (override)`, qty: 1, unit_price: coerceNumber(override_price, 0), line_total: coerceNumber(override_price, 0), is_service: false, customer_price_source: 'manual_override' });
  } else if (serviceLineItems.length) {
    for (const it of serviceLineItems) computedItems.push(it);
  } else if (standard_price > 0) {
    computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: Number(standard_price), line_total: Number(standard_price), is_service: false });
  }

      if (itemIdQty.length) {
        const ids = itemIdQty.map((x) => x.item_id);
        const catR = await client.query(
          `SELECT item_id, item_name, base_price
           FROM public.catalog_items
           WHERE is_active=TRUE AND item_id = ANY($1::bigint[])`,
          [ids]
        );
        const map = new Map(catR.rows.map((r) => [Number(r.item_id), r]));
        for (const x of itemIdQty) {
          const it = map.get(Number(x.item_id));
          if (!it) continue;
          const qty = Number(x.qty);
          const unit_price = Number(it.base_price || 0);
          computedItems.push({
            item_id: Number(it.item_id),
            item_name: it.item_name,
            qty,
            unit_price,
            line_total: qty * unit_price,
          });
        }
      }

      // pricing via existing calcPricing
      const pricing = calcPricing(computedItems, promo);

      if (isUrgentOffer && ENABLE_SERVICE_ZONE_FILTER && !detectedZoneCode) {
        const err = new Error('ยิงงานด่วนไม่สำเร็จ: ระบบยังระบุโซนพื้นที่ไม่ได้ กรุณาเลือกโซนหรือกรอกย่าน/เขตให้ชัดเจนก่อนยิงงาน');
        err.statusCode = 409;
        err.code = 'NO_SERVICE_ZONE_FOR_URGENT_OFFER';
        err.debug = { service_zone_code: detectedZoneCode || null, service_zone_source: detectedZoneSource || null };
        throw err;
      }

      // choose technician
      // Urgent offer must NEVER auto-assign before a technician accepts the offer.
      let selectedTech = isUrgentOffer ? "" : (assign_mode === 'team' ? teamRepresentative : requestedTech);
      if (!isUrgentOffer && !selectedTech) {
        // list group techs (Admin assign ignores accept_status)
        const isAll = (ttype === 'all');
        const tr = await client.query(
          `
          SELECT u.username, p.home_service_zone_code, p.secondary_service_zone_code, COALESCE(p.allow_out_of_zone,FALSE) AS allow_out_of_zone
          FROM public.users u
          LEFT JOIN public.technician_profiles p ON p.username=u.username
          WHERE u.role='technician'
            AND ($2::boolean IS TRUE OR COALESCE(p.accept_status,'paused')='ready' AND p.accept_status_expires_at IS NOT NULL AND p.accept_status_expires_at > NOW())
            AND ($3::boolean IS TRUE OR (
                  ($1='company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
               OR ($1<>'company' AND COALESCE(p.employment_type,'company') = $1)
            ))
          ORDER BY u.username
          `,
          [ttype === 'all' ? 'company' : ttype, true, isAll]
        );
        const rankedRows = (ENABLE_SERVICE_ZONE_FILTER && detectedZoneCode) ? rankTechniciansForServiceZone(tr.rows || [], detectedZoneCode) : (tr.rows || []);
        const list = rankedRows.map((r) => r.username).slice(0, 60);
        selectedTech = await pickFirstAvailableTech(list, apptIso, duration_min);
      } else if (!isUrgentOffer && selectedTech) {
        // ✅ Forced lock: allow even if technician hasn't opened accept_status,
        // but still block lock on the technician's off-day.
        if (mode === 'forced') {
          try {
            const pr = await client.query(
              `SELECT username, weekly_off_days FROM public.technician_profiles WHERE username=$1 LIMIT 1`,
              [selectedTech]
            );
            const techRow = { username: selectedTech, weekly_off_days: pr.rows[0]?.weekly_off_days || '' };
            const apptDate = String(apptIso).slice(0,10);
            const offMap = await buildOffMapForDate(apptDate, [selectedTech]);
            if (isTechOffOnDate(techRow, apptDate, offMap)) {
              return res.status(409).json({ error: `ช่างวันหยุด: ${selectedTech} (ไม่สามารถล็อคงานได้)` });
            }
          } catch (e) {
            console.warn('[admin_book_v2] off-day check failed (fail-open)', e.message);
          }
        }
        const conflict = await checkTechCollision(selectedTech, apptIso, duration_min, null);
        if (conflict) {
          return http409Conflict(res, conflict);
        }
        if (detectedZoneCode) {
          const zoneMatch = await technicianMatchesServiceZone(selectedTech, detectedZoneCode);
          if (!zoneMatch.matches) {
            forced_assignment_zone_warning = {
              technician_username: selectedTech,
              job_zone: detectedZoneCode,
              technician_zone: zoneMatch.zone_code,
              allow_out_of_zone: zoneMatch.allow_out_of_zone,
            };
            console.warn("[admin_book_v2] forced out-of-zone assignment", forced_assignment_zone_warning);
          }
        }
      }

      if (!isUrgentOffer && !selectedTech) {
        return res.status(409).json({ error: "ไม่พบช่างว่างในช่วงเวลานี้" });
      }

      // ✅ Team members collision check (including buffer) - backward compatible
      const tmList = (!isUrgentOffer && assign_mode === 'team')
        ? [...new Set(tmSelectedList.filter(u => u && u !== selectedTech))].slice(0, 10)
        : [];
      for (const u of tmList) {
        const conflict = await checkTechCollision(u, apptIso, duration_min, null);
        if (conflict) {
          return http409Conflict(res, conflict);
        }
      }

      const jobStatus = bm === "urgent" ? JOB_STATUS.ADMIN_URGENT_WAITING : JOB_STATUS.ADMIN_SCHEDULED_PENDING;
      const jobInsert = await client.query(
        `
        INSERT INTO public.jobs
        (customer_name, customer_phone, job_type, appointment_datetime, job_price,
         address_text, technician_team, technician_username, job_status,
         booking_token, job_source, dispatch_mode, customer_note,
         maps_url, job_zone, duration_min, booking_mode, admin_override_duration_min,
         gps_latitude, gps_longitude, service_zone_code, service_zone_source, allow_time_proposal)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$22,$23,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING job_id
        `,
        [
          String(customer_name).trim(),
          (customer_phone || "").toString().trim(),
          String(job_type).trim(),
          apptIso,
          Number(pricing.total || 0),
          String(address_text).trim(),
          (!isUrgentOffer && mode === "forced") ? selectedTech : null,
          isUrgentOffer ? null : selectedTech,
          jobStatus,
          mode,
          (customer_note || "").toString(),
          (String(maps_url || "").trim() || null),
          (String(job_zone || "").trim() || null),
          duration_min,
          (isUrgentOffer ? "urgent" : "scheduled"),
          Math.max(0, coerceNumber(override_duration_min, 0)),
          final_lat,
          final_lng,
          detectedZoneCode,
          detectedZoneSource,
          allowTimeProposal,
          publicBookingToken,
          createdBySource,
        ]
      );

      const job_id = jobInsert.rows[0].job_id;
      const booking_code = await generateUniqueBookingCode(client);
      await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

      // ✅ Team members (primary + assistants) - backward compatible
      // Urgent jobs are intentionally unassigned until a technician accepts the offer.
      // NOTE: some production DBs may not have is_primary column yet.
      if (!isUrgentOffer) try {
        const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
        await client.query(`DELETE FROM public.job_team_members WHERE job_id=$1`, [job_id]);
        for (const u of tmAll) {
          try {
            await client.query(
              `INSERT INTO public.job_team_members (job_id, username, is_primary)
               VALUES ($1,$2,$3)`,
              [job_id, u, u === selectedTech]
            );
          } catch (insErr) {
            if (insErr && String(insErr.code) === '42703') {
              await client.query(
                `INSERT INTO public.job_team_members (job_id, username)
                 VALUES ($1,$2)
                 ON CONFLICT (job_id, username) DO NOTHING`,
                [job_id, u]
              );
            } else {
              throw insErr;
            }
          }
        }
      } catch (e) {
        console.warn("[admin_book_v2] save team members failed", e);
      }

      // ✅ job_assignments upsert (team status per technician)
      if (!isUrgentOffer) try {
        const tmAll = [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))].slice(0, 10);
        for (const u of tmAll) {
          await client.query(
            `
            INSERT INTO public.job_assignments (job_id, technician_username, status)
            VALUES ($1,$2,'${ASSIGNMENT_STATUS.IN_PROGRESS}')
            ON CONFLICT (job_id, technician_username) DO UPDATE SET status=EXCLUDED.status
            `,
            [job_id, u]
          );
        }
      } catch (e) {
        console.warn("[admin_book_v2] upsert job_assignments failed (fail-open)", e.message);
      }

      // job_items
      for (const it of computedItems) {
        await client.query(
          `INSERT INTO public.job_items
            (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service,
             customer_price_rule_id, normal_unit_price, customer_price_label, customer_campaign_name, customer_price_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            job_id,
            it.item_id || null,
            it.item_name,
            Number(it.qty || 0),
            Number(it.unit_price || 0),
            Number(it.line_total || 0),
            (it.assigned_technician_username || null),
            !!it.is_service,
            it.customer_price_rule_id || null,
            it.normal_unit_price || null,
            it.customer_price_label || null,
            it.customer_campaign_name || null,
            it.customer_price_source || null,
          ]
        );
      }

      if (promo) {
        await client.query(
          `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
           VALUES ($1,$2,$3)
           ON CONFLICT (job_id) DO UPDATE SET promo_id=EXCLUDED.promo_id, applied_discount=EXCLUDED.applied_discount`,
          [job_id, promo.promo_id, Number(pricing.discount || 0)]
        );
      }

      const directPushTargets = isUrgentOffer ? [] : [...new Set([selectedTech, ...tmList].map(x => (x||"").toString().trim()).filter(Boolean))];
      let urgentPushTargets = [];

      // urgent offers to partner (ถ้า bm=urgent และกลุ่ม partner)
      if (isUrgentOffer) {
        const partners = await client.query(
          `
          SELECT u.username, p.home_service_zone_code, p.secondary_service_zone_code, COALESCE(p.allow_out_of_zone,FALSE) AS allow_out_of_zone
          FROM public.users u
          LEFT JOIN public.technician_profiles p ON p.username=u.username
          WHERE u.role='technician'
            AND COALESCE(p.accept_status,'paused')='ready' AND p.accept_status_expires_at IS NOT NULL AND p.accept_status_expires_at > NOW()
            AND (
                  $1::text = 'all'
               OR ($1::text = 'company' AND COALESCE(p.employment_type,'company') IN ('company','custom','special_only'))
               OR ($1::text <> 'company' AND COALESCE(p.employment_type,'company') = $1::text)
            )
          ORDER BY u.username
          `
        , [ttype]);

        const partnerRows = partners.rows || [];
        let candidateRows = partnerRows;
        if (ENABLE_SERVICE_ZONE_FILTER && detectedZoneCode) {
          const primary = partnerRows.filter(r => String(r.home_service_zone_code || "").toUpperCase() === detectedZoneCode);
          const secondary = partnerRows.filter(r => String(r.home_service_zone_code || "").toUpperCase() !== detectedZoneCode && String(r.secondary_service_zone_code || "").toUpperCase() === detectedZoneCode);
          zone_filter_applied = true;
          zone_matched_technicians_count = primary.length + secondary.length;
          zone_fallback_used = false;
          candidateRows = [...primary, ...secondary];
        }
        const list = rankTechniciansForServiceZone(candidateRows, detectedZoneCode).map((r) => r.username);
        // จำกัด 30 ทีม
        const maxTeams = 30;
        const shuffled = list.slice(0, maxTeams);
        const available = [];
        for (const u of shuffled) {
          const ok = await isTechFree(u, apptIso, duration_min, null);
          if (ok) available.push(u);
        }

        if (!available.length) {
          if (createdBySource === "customer" && bm === "urgent" && mode === "offer") {
            await client.query(
              `UPDATE public.jobs
                  SET job_status='${JOB_STATUS.URGENT_NO_TECHNICIAN}',
                      technician_username=NULL,
                      technician_team=NULL,
                      dispatch_mode='offer'
                WHERE job_id=$1`,
              [job_id]
            );
            console.warn("[admin_book_v2] customer_urgent_no_offer_targets", {
              job_id,
              booking_code,
              service_zone_code: detectedZoneCode || null,
            });
          } else {
          const err = new Error('ยิงงานด่วนไม่สำเร็จ: ตอนนี้ไม่มีช่างที่เปิดรับงาน ว่างจริง และอยู่ในโซนนี้ ระบบจึงยังไม่ได้ส่งงานออกไปให้ช่างรับ');
          err.statusCode = 409;
          err.code = 'NO_URGENT_OFFER_TARGETS';
          err.debug = {
            partner_count: partnerRows.length,
            candidate_count: candidateRows.length,
            service_zone_code: detectedZoneCode || null,
            zone_filter_applied,
            zone_matched_technicians_count,
            zone_fallback_used,
          };
          throw err;
          }
        }

        for (const u of available) {
          await client.query(
            `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
             VALUES ($1,$2,'${OFFER_STATUS.PENDING}', NOW() + INTERVAL '10 minutes')`,
            [job_id, u]
          );
        }
        urgentPushTargets = available.slice();
        console.log("[admin_book_v2] urgent_offers", { job_id, booking_code, count: available.length });
      }

      await ensureCanonicalBookingJobUnits(job_id, client);
      await client.query(`UPDATE public.jobs SET per_unit_evidence_enabled=TRUE WHERE job_id=$1`, [job_id]);

      await client.query("COMMIT");

      // ✅ Prepare technician income preview/cache right after job creation.
      // Covers: normal/forced jobs + urgent offers shown on รับงานใหม่.
      // It calculates only this job per technician, so technician app can display income immediately.
      let incomeByUsernameForNotify = {};
      try {
        const previewTargets = [...new Set([selectedTech, ...tmList, ...urgentPushTargets].map(x => (x || '').toString().trim()).filter(Boolean))].slice(0, 60);
        incomeByUsernameForNotify = await _refreshTechnicianIncomePreviewForJob(job_id, previewTargets, { source: isUrgentOffer ? 'offer_preview' : 'job_preview' }) || {};
      } catch (e) {
        console.warn('[income_preview] admin_book_v2 preview failed', e.message);
      }

      // 🔔 best-effort push: ห้ามให้แจ้งเตือนพังจนการลงงาน fail
      // ใส่ยอด “ที่ช่างจะได้รับ” ลงในแจ้งเตือน โดยใช้ preview ที่คำนวณไว้หลังสร้างงานทันที
      try {
        if (urgentPushTargets.length) {
          _notifyUrgentOffer({ usernames: urgentPushTargets, job_id, booking_code, job_type, appointment_datetime: apptIso, job_zone, income_by_username: incomeByUsernameForNotify }).catch(()=>{});
        } else if (directPushTargets.length) {
          _notifyDirectJobAssigned({ usernames: directPushTargets, job_id, booking_code, job_type, appointment_datetime: apptIso, job_zone, income_by_username: incomeByUsernameForNotify }).catch(()=>{});
        }
      } catch (_) {}

      console.log("[admin_book_v2]", {
        job_id,
        booking_code,
        tech_type: ttype,
        technician_username: isUrgentOffer ? null : selectedTech,
        duration_min,
        effective_block_min: effectiveBlockMin(duration_min),
        standard_price,
        total: pricing.total,
        promo_id: promo?.promo_id || null,
      });

      return res.json({
        success: true,
        job_id,
        booking_code,
        token: publicBookingToken,
        technician_username: isUrgentOffer ? null : selectedTech,
        tech_type: ttype,
        duration_min,
        effective_block_min: effectiveBlockMin(duration_min),
        travel_buffer_min: TRAVEL_BUFFER_MIN,
        standard_price: Number(standard_price || 0),
        subtotal: Number(pricing.subtotal || 0),
        discount: Number(pricing.discount || 0),
        total: Number(pricing.total || 0),
        booking_mode: bm,
        dispatch_mode: mode,
        service_zone_code: detectedZoneCode,
        service_zone_label: detectedZoneLabel,
        service_zone_source: detectedZoneSource,
        zone_filter_applied,
        zone_matched_technicians_count,
        zone_fallback_used,
        forced_assignment_zone_warning,
        offers_count: urgentPushTargets.length,
        allow_time_proposal: allowTimeProposal,
        ...(createdBySource === "customer" && isUrgentOffer && urgentPushTargets.length === 0 ? {
          phase: "admin_review",
          admin_review: true,
          message: "ส่งคำขอเข้าคิวแอดมินแล้ว",
        } : {}),
      });
    } catch (e) {
      await client.query("ROLLBACK");
      const statusCode = Number(e?.statusCode || e?.status || 500);
      console.error("/admin/book_v2 error:", e);
      return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
        error: e.message || "admin book v2 failed",
        code: e?.code || undefined,
        debug: e?.debug || undefined,
      });
    } finally {
      client.release();
    }
  }

  async function handleInternalBookFromAi(req, res) {
    const missing = validateInternalBookingPayload(req.body);
    if (missing.length) {
      return res.status(400).json({
        error: 'MISSING_REQUIRED_FIELDS',
        missing_fields: missing,
      });
    }
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      if (payload && payload.success) {
        return originalJson({
          ...payload,
          admin_notification: buildAdminBookingNotificationPayload(req.body, payload),
        });
      }
      return originalJson(payload);
    };
    return handleAdminBookV2(req, res);
  }

  function deriveCustomerScheduledBookingToken(requestKey) {
    const key = String(requestKey || "").trim();
    if (!key) return null;
    return crypto.createHash("sha256").update(`scheduled_v1:${key}`).digest("hex").slice(0, 24);
  }

  // A scheduled request key is bound to the booking it first created. On replay we
  // only return the existing job when the FULL canonical material payload matches;
  // a key reused with any different material field is a key-reuse error, never a
  // silent return of the old job's data. "Material" = every persisted field that
  // defines the booking contract: appointment, contact, place, and the canonical
  // service composition (from job_items, which also carries price).
  function normalizedBookingScalar(value) {
    return String(value == null ? "" : value).trim();
  }

  // Canonical, order-independent signature of a set of line items. line_total
  // captures unit price × qty, so BTU/variant/qty/price changes all shift it.
  function bookingLineSignature(rows) {
    return (rows || [])
      .map((it) => `${normalizedBookingScalar(it.item_name)}#${Number(it.qty || 0)}#${Number(it.line_total || 0)}`)
      .sort()
      .join("|");
  }

  async function loadStoredBookingLineSignature(db, jobId) {
    const r = await db.query(
      `SELECT item_name, qty, line_total FROM public.job_items WHERE job_id=$1`,
      [jobId]
    );
    return bookingLineSignature(r.rows);
  }

  // Rebuild the incoming service + extra lines with the SAME normalizer used to
  // create a booking, so an identical service payload yields an identical
  // signature (and any material change yields a different one). Read-only.
  async function buildIncomingBookingLineSignature(db, payloadV2, itemIdQty, standardPrice) {
    let computed = [];
    let total = Number(standardPrice || 0);
    const serviceLines = await customerPricingHelpers.buildCustomerServiceLineItemsFromPayload(
      (payloadV2.services && Array.isArray(payloadV2.services))
        ? payloadV2
        : {
            ...payloadV2,
            services: [{
              job_type: payloadV2.job_type,
              ac_type: payloadV2.ac_type,
              btu: payloadV2.btu,
              machine_count: payloadV2.machine_count,
              wash_variant: payloadV2.wash_variant,
              repair_variant: payloadV2.repair_variant,
            }],
          },
      db
    );
    if (serviceLines.length) {
      computed = computed.concat(serviceLines);
    } else if (total > 0) {
      computed.push({ item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || "-"})`, qty: 1, line_total: total });
    }
    if (itemIdQty && itemIdQty.length) {
      const ids = itemIdQty.map((x) => x.item_id);
      const catR = await db.query(
        `SELECT item_id, item_name, base_price FROM public.catalog_items
          WHERE is_active=TRUE AND is_customer_visible=TRUE AND item_id = ANY($1::bigint[])`,
        [ids]
      );
      const map = new Map(catR.rows.map((row) => [Number(row.item_id), row]));
      for (const x of itemIdQty) {
        const it = map.get(Number(x.item_id));
        if (!it) continue;
        const qty = Number(x.qty);
        computed.push({ item_name: it.item_name, qty, line_total: qty * Number(it.base_price || 0) });
      }
    }
    return bookingLineSignature(computed);
  }

  // Scalar material fields persisted on the jobs row (everything but the service
  // lines, which are compared via the signature above).
  function scheduledScalarsMatch(jobRow, incoming, options = {}) {
    const apptTime = (v) => {
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : NaN;
    };
    if (options.serverAppointmentAuthoritative !== true) {
      const a = apptTime(jobRow.appointment_datetime);
      const b = apptTime(normalizeAppointmentDatetime(incoming.appointment_datetime));
      if (!(Number.isFinite(a) && Number.isFinite(b) && a === b)) return false;
    }
    if (normalizedBookingScalar(jobRow.customer_phone).replace(/\D/g, "") !== normalizedBookingScalar(incoming.customer_phone).replace(/\D/g, "")) return false;
    if (normalizedBookingScalar(jobRow.customer_name) !== normalizedBookingScalar(incoming.customer_name)) return false;
    if (normalizedBookingScalar(jobRow.address_text) !== normalizedBookingScalar(incoming.address_text)) return false;
    if (normalizedBookingScalar(jobRow.maps_url) !== normalizedBookingScalar(incoming.maps_url)) return false;
    if (normalizedBookingScalar(jobRow.job_zone) !== normalizedBookingScalar(incoming.job_zone)) return false;
    if (normalizedBookingScalar(jobRow.job_type) !== normalizedBookingScalar(incoming.job_type)) return false;
    if (normalizedBookingScalar(jobRow.customer_note) !== normalizedBookingScalar(incoming.customer_note)) return false;
    if (Boolean(jobRow.allow_time_proposal) !== Boolean(incoming.allow_time_proposal)) return false;
    if (Number(jobRow.duration_min || 0) !== Number(incoming.duration_min || 0)) return false;
    return true;
  }

  // Full canonical match = scalar fields + service-line signature. Used identically
  // by the pre-flight replay and the in-transaction race path.
  async function scheduledPayloadMatchesExisting(db, jobRow, incoming, options = {}) {
    if (!scheduledScalarsMatch(jobRow, incoming, options)) return false;
    const storedSig = await loadStoredBookingLineSignature(db, jobRow.job_id);
    const incomingSig = await buildIncomingBookingLineSignature(db, incoming.payloadV2, incoming.itemIdQty, incoming.standardPrice);
    return storedSig === incomingSig;
  }

  // Customer App V2 urgent requests are just another entry point into the
  // existing admin urgent offer engine (handleAdminBookV2): this adapter only
  // (a) strips the request down to a customer-safe allowlist and (b) computes
  // a rounded, business-hours-aware appointment time. Deduplication of
  // retried/duplicate submits sharing the same client-generated
  // urgent_request_key is handled durably inside handleAdminBookV2's existing
  // transaction (advisory lock + deterministic booking_token lookup), not
  // here, so it survives process restarts and works across instances.
  function handlePublicCustomerUrgentBook(req, res) {
    const incoming = urgentPublicAdapter.sanitizeCustomerUrgentBody(req.body || {});
    const requestKey = incoming.urgent_request_key;
    if (!requestKey || requestKey.length < 16) {
      return res.status(400).json({ error: "MISSING_REQUEST_KEY", code: "MISSING_REQUEST_KEY" });
    }
    if (!urgentPublicAdapter.isStrictUrgentCleaningPayload(incoming)) {
      return res.status(400).json({ error: "URGENT_CLEANING_ONLY", code: "URGENT_CLEANING_ONLY" });
    }

    req.cwfBookSource = "customer";
    req.cwfPublicUrgentPrepared = true;
    req.body = {
      ...incoming,
      appointment_datetime: urgentPublicAdapter.computeCustomerUrgentAppointmentIso(),
      booking_mode: "urgent",
      dispatch_mode: "offer",
      tech_type: "partner",
      assign_mode: "auto",
      technician_username: "",
      team_members: [],
      allow_time_proposal: true,
    };

    return handlePublicBook(req, res);
  }

  // ✅ Fail-safe capability check: jobs.catalog_item_id / jobs.customer_sub are
  // additive columns from a migration that may not have run yet. Never assume
  // they exist — insert NULL/omit them until the schema is confirmed ready.
  let jobsCatalogLinkSchemaReadyCache = false;
  async function isJobsCatalogLinkSchemaReady() {
    if (jobsCatalogLinkSchemaReadyCache) return true;
    try {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'jobs'
            AND column_name IN ('catalog_item_id', 'customer_sub')`
      );
      const ready = Number(r.rows?.[0]?.cnt || 0) === 2;
      if (ready) jobsCatalogLinkSchemaReadyCache = true;
      return ready;
    } catch (_) {
      return false;
    }
  }

  async function handlePublicBook(req, res) {
    // ✅ ลูกค้าจองคิว (ไม่บังคับกรอก lat/lng) + เลือกรายการบริการ/สินค้าได้
    // - โปรโมชั่น: ให้แอดมินเป็นคนใส่/ลบเท่านั้น (ฝั่งลูกค้าไม่รับ promo_id)
    const {
      customer_name,
      customer_phone,
      job_type,
      appointment_datetime,
      address_text,
      customer_note,
      maps_url,
      job_zone,
      items, // [{item_id, qty}] (extras)
      booking_mode,
      client_app,
      allow_admin_schedule_fallback,
      allow_time_proposal,
      ac_type,
      btu,
      machine_count,
      wash_variant,
      repair_variant,
      services,
      scheduled_request_key,
      urgent_request_key,
      catalog_item_id, // optional: links this booking to the Store catalog item it was booked for
    } = req.body || {};

    // 🔒 Kill switch (fail closed) — CANONICAL GATE. /public/book is entirely
    // unauthenticated, so the gate keys off the canonical booking_mode ONLY.
    // client_app is attacker-controlled and MUST NOT be a security boundary:
    // gating on it would let a request drop/forge client_app and slip past.
    // This runs before urgent routing, pricing, idempotency, insert, and offer
    // dispatch, so a closed lane can never create a job/offer. Admin bookings use
    // the session-authenticated /admin route, never this one. Unknown modes are
    // rejected outright (no fall-through).
    const canonicalBookingMode = String(booking_mode || "scheduled").trim().toLowerCase();
    if (canonicalBookingMode !== "scheduled" && canonicalBookingMode !== "urgent") {
      return res.status(400).json({ error: "ประเภทการจองไม่ถูกต้อง", code: "UNKNOWN_BOOKING_MODE" });
    }
    if (canonicalBookingMode === "urgent" && !ENABLE_CUSTOMER_URGENT_BOOKING) {
      return res.status(503).json({
        error: "ระบบจองด่วนออนไลน์ปิดให้บริการชั่วคราว กรุณาติดต่อแอดมินทาง LINE",
        code: "URGENT_BOOKING_DISABLED",
        line_url: CWF_LINE_CONTACT_URL,
      });
    }
    if (canonicalBookingMode === "scheduled" && !ENABLE_CUSTOMER_SCHEDULED_BOOKING) {
      return res.status(503).json({
        error: "ระบบจองคิวออนไลน์ปิดให้บริการชั่วคราว กรุณาติดต่อแอดมินทาง LINE",
        code: "SCHEDULED_BOOKING_DISABLED",
        line_url: CWF_LINE_CONTACT_URL,
      });
    }

    // Every unauthenticated urgent request is a customer request (admin books via
    // the session-authenticated route, never this one). Route it through the
    // customer-safe adapter on the CANONICAL booking_mode ALONE — never client_app,
    // which the caller can drop/forge to skip the sanitiser and reach the raw
    // urgent engine with attacker-chosen technician/assign fields.
    if (canonicalBookingMode === "urgent" && req.cwfPublicUrgentPrepared !== true) {
      return handlePublicCustomerUrgentBook(req, res);
    }

    if (!customer_name || !job_type || !appointment_datetime || !address_text) {
      return res.status(400).json({ error: "กรอกข้อมูลไม่ครบ (ชื่อ/ประเภทงาน/วันนัด/ที่อยู่)" });
    }

    // ✅ Soft customer identity: never required, never trusted blindly elsewhere —
    // this is only a best-effort linkage so a logged-in customer can later prove
    // ownership of *this* job for review eligibility. Booking proceeds for guests too.
    let customerSubForJob = null;
    try {
      const jwtSecretForBook = getJwtSecret();
      const cwfToken = parseCookieValue(req, "cwf_token");
      if (jwtSecretForBook && cwfToken) {
        const customerPayload = jwtVerify(cwfToken, jwtSecretForBook);
        if (customerPayload && customerPayload.sub) {
          customerSubForJob = String(customerPayload.sub);
        }
      }
    } catch (_) {
      customerSubForJob = null;
    }
    const catalogItemIdForJob = Number(catalog_item_id);
    const safeCatalogItemIdForJob = Number.isFinite(catalogItemIdForJob) && catalogItemIdForJob > 0 ? catalogItemIdForJob : null;

    // ✅ sanitize items (ไม่เชื่อราคา/ชื่อจากฝั่งลูกค้า)
    const safeItemsIn = Array.isArray(items) ? items : [];
    const itemIdQty = safeItemsIn
      .map((x) => ({ item_id: Number(x.item_id), qty: Number(x.qty || 1) }))
      .filter((x) => Number.isFinite(x.item_id) && x.item_id > 0 && Number.isFinite(x.qty) && x.qty > 0);

    let token = genToken(12);
    // DURATION_PRICE_V2_PUBLIC_BOOK
    let bm = canonicalBookingMode;
    const clientApp = (client_app || "").toString().trim().toLowerCase();
    // Idempotency is CANONICAL: every public scheduled booking must carry a valid
    // request key, keyed off the canonical booking_mode — never client_app. Gating
    // this on client_app let an unauthenticated caller drop/forge it to skip the
    // advisory-lock replay below and mint duplicate jobs. client_app stays only
    // for telemetry/UX defaults, never for a security/idempotency decision.
    const scheduledRequestKey = bm === "scheduled"
      ? String(scheduled_request_key || "").trim()
      : "";
    const urgentRequestKey = bm === "urgent"
      ? String(urgent_request_key || "").trim()
      : "";
    const validScheduledRequestKey = /^[A-Za-z0-9_-]{16,128}$/.test(scheduledRequestKey);
    const validUrgentRequestKey = /^[A-Za-z0-9_-]{16,128}$/.test(urgentRequestKey);
    if (bm === "scheduled" && !validScheduledRequestKey) {
      return res.status(400).json({ error: "MISSING_REQUEST_KEY", code: "MISSING_REQUEST_KEY" });
    }
    if (bm === "urgent" && !validUrgentRequestKey) {
      return res.status(400).json({ error: "MISSING_REQUEST_KEY", code: "MISSING_REQUEST_KEY" });
    }
    const scheduledDeterministicToken = scheduledRequestKey
      ? deriveCustomerScheduledBookingToken(scheduledRequestKey)
      : null;
    const urgentDeterministicToken = urgentRequestKey
      ? urgentPublicAdapter.deriveUrgentBookingToken(urgentRequestKey)
      : null;
    const bookingRequestKey = scheduledRequestKey || urgentRequestKey;
    const deterministicToken = scheduledDeterministicToken || urgentDeterministicToken;
    if (deterministicToken) token = deterministicToken;
    const allowAdminScheduleFallback = allow_admin_schedule_fallback === true || String(allow_admin_schedule_fallback || "").trim() === "true";
    const canUseAdminScheduleFallback = bm === "scheduled" && allowAdminScheduleFallback;
    // Customer urgent jobs wait for admin approval. The existing offer flow is
    // entered only by the authenticated approval route after commit.
    const urgentOfferEnabled = false;
    const allowTimeProposal = allow_time_proposal === true
      ? true
      : allow_time_proposal === false || allow_time_proposal == null
        ? false
        : null;
    if (clientApp === "customer_app_v2" && allowTimeProposal == null) {
      return res.status(400).json({ error: "กรุณาเลือกเงื่อนไขการเสนอเวลา" });
    }
    const payloadV2 = {
      job_type: String(job_type).trim(),
      ac_type: (ac_type || "").toString().trim(),
      btu: Number(btu || 0),
      machine_count: Number(machine_count || 1),
      wash_variant: (wash_variant || "").toString().trim(),
      repair_variant: (repair_variant || "").toString().trim(),
      admin_override_duration_min: 0, // ลูกค้าห้าม override
    };
    if (Array.isArray(services) && services.length) payloadV2.services = services;
    if (bm === "urgent") {
      if (!urgentPublicAdapter.isStrictUrgentCleaningPayload(payloadV2)) {
        return res.status(400).json({ error: "URGENT_CLEANING_ONLY", code: "URGENT_CLEANING_ONLY" });
      }
    }
    // CWF Spec: conservative duration for schedule/collision
    const duration_min_v2 = computeDurationMinMulti(payloadV2, { source: "public_book", conservative: true });
    if (duration_min_v2 <= 0) return res.status(400).json({ error: "งานประเภทนี้ต้องให้แอดมินกำหนดเวลา (duration)" });
    if (bm === "scheduled") {
      const startIsoForCutoff = normalizeAppointmentDatetime(appointment_datetime);
      const requestedDate = String(startIsoForCutoff || "").slice(0, 10);
      const requestedStart = String(startIsoForCutoff || "").slice(11, 16);
      const requestedStartMin = toMin(requestedStart);
      const nowParts = getNowBangkokParts();
      const minStart = jobTiming.minimumStartForDate(requestedDate, {
        ui_start_min: toMin("09:00"),
        ui_end_min: toMin("18:00"),
        slot_step_min: 30,
        now_parts: nowParts,
      });
      if (requestedDate < nowParts.ymd || (minStart.is_today && requestedStartMin < minStart.minimum_start_min)) {
        return res.status(409).json({
          error: "SLOT_IN_PAST",
          code: "SLOT_IN_PAST",
          server_now: minStart.server_now,
          timezone: minStart.timezone,
          minimum_start: minStart.minimum_start,
        });
      }
    }
    const customerPrice = await customerPricingHelpers.resolveCustomerPricingMulti(payloadV2, pool);
    const standard_price = Number(customerPrice.active_price ?? customerPrice.standard_price ?? 0);

  // ✅ Parse lat/lng from maps_url or address_text (fail-open)
  const parsedLL = parseLatLngFromText(maps_url) || parseLatLngFromText(address_text);
  const parsed_lat = parsedLL ? parsedLL.lat : null;
  const parsed_lng = parsedLL ? parsedLL.lng : null;
  console.log("[latlng_parse]", { ok: !!parsedLL });


    // ✅ Server-side validation: ต้องมีอย่างน้อย 1 ช่างว่างจริงในช่วงเวลานี้ (คิด buffer)
    // - urgent => partner
    // - scheduled (Customer App V2) => all employment types the admin opted in (customer_slot_visible)
    // - scheduled (legacy callers) => company (unchanged)
    // Defect 1: Customer App V2 scheduled booking must not be limited to company technicians;
    // it mirrors the public availability query (tech_type=all) and stays strict via the
    // customer_slot_visible + service matrix + monthly calendar gates below.
    // Canonical: every public scheduled booking mirrors the public slot list
    // (tech_type "all"), never a client_app-derived narrower set. Strictness comes
    // from the customer_slot_visible + service-matrix + monthly-calendar gates
    // inside customerAvailability, not from client_app.
    // Payload-bound idempotency (checked BEFORE the availability gate): a genuine
    // retry of the same request must replay its existing job even though that job
    // now occupies the slot — so the replay lookup cannot sit behind the "slot
    // full" check. Reusing the key with a materially different payload is rejected
    // with 409 (no mutation, no old-job data leaked).
    if (bookingRequestKey && deterministicToken) {
      const idem = await pool.connect();
      let prior = null;
      try {
        await idem.query("BEGIN");
        await idem.query("SELECT pg_advisory_xact_lock(hashtext($1))", [bookingRequestKey]);
        const r = await idem.query(
          `SELECT job_id, booking_code, booking_token, dispatch_mode, duration_min, job_price,
                  appointment_datetime, customer_phone, customer_name, address_text, maps_url,
                  job_zone, job_type, customer_note, allow_time_proposal
             FROM public.jobs
            WHERE booking_token=$1
              AND job_source='customer'
              AND booking_mode=$2
              AND canceled_at IS NULL
            LIMIT 1`,
          [deterministicToken, bm]
        );
        await idem.query("COMMIT");
        prior = r.rows[0] || null;
      } catch (e) {
        try { await idem.query("ROLLBACK"); } catch (_) {}
        throw e;
      } finally {
        idem.release();
      }
      if (prior) {
        const incomingBooking = {
          appointment_datetime, customer_phone, customer_name, address_text, maps_url,
          job_zone, job_type, customer_note, allow_time_proposal: allowTimeProposal,
          duration_min: duration_min_v2, payloadV2, itemIdQty, standardPrice: standard_price,
        };
        if (!(await scheduledPayloadMatchesExisting(pool, prior, incomingBooking, { serverAppointmentAuthoritative: bm === "urgent" }))) {
          // Same key, materially different booking. No mutation, no identifiers/PII.
          return res.status(409).json({
            error: "คำขอนี้ถูกใช้ไปแล้วกับการจองอื่น กรุณาเริ่มการจองใหม่",
            code: "IDEMPOTENCY_KEY_REUSED",
          });
        }
        return res.json({
          success: true,
          replayed: true,
          job_id: prior.job_id,
          booking_code: prior.booking_code,
          token: prior.booking_token,
          booking_mode: bm,
          dispatch_mode: prior.dispatch_mode || "normal",
          duration_min: Number(prior.duration_min || duration_min_v2 || 0),
          effective_block_min: effectiveBlockMin(Number(prior.duration_min || duration_min_v2 || 0)),
          travel_buffer_min: TRAVEL_BUFFER_MIN,
          base_total: Number(prior.job_price || 0),
        });
      }
    }

    const requestedTechType = bm === "urgent" ? "partner" : "all";
    try {
      if (bm === "scheduled") {
        const startIso = normalizeAppointmentDatetime(appointment_datetime);
        const start = String(startIso).slice(11, 16);
        const available = await customerAvailability.hasAvailableStart(
          publicCustomerAvailabilityDeps(),
          {
            ...payloadV2,
            date: String(startIso).slice(0, 10),
            start,
            tech_type: requestedTechType,
            duration_min: duration_min_v2,
          }
        );
        if (!available) {
          return res.status(409).json({ error: "ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น" });
        }
      }
    } catch (e) {
      console.warn("[public_book] availability_check_fail", { bm, clientApp, err: e.message });
      // Fail CLOSED for every public scheduled booking — a failed capacity check
      // must never silently let a booking through (this used to fall open for
      // non-customer_app_v2 callers, a client_app-dependent weakness).
      if (bm === "scheduled") {
        const status = Number(e.status || 503);
        const message = status === 400
          ? "ข้อมูลบริการไม่ครบสำหรับตรวจคิว กรุณาเลือกบริการใหม่"
          : "ระบบตรวจคิวช่างยังไม่พร้อม กรุณาลองใหม่อีกครั้ง";
        return res.status(status).json({ error: message });
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (bookingRequestKey && deterministicToken) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [bookingRequestKey]);
        const existing = await client.query(
          `SELECT job_id, booking_code, booking_token, booking_mode, dispatch_mode,
                  duration_min, job_price, appointment_datetime, customer_phone, customer_name,
                  address_text, maps_url, job_zone, job_type, customer_note, allow_time_proposal
             FROM public.jobs
            WHERE booking_token=$1
              AND job_source='customer'
              AND booking_mode=$2
              AND canceled_at IS NULL
            LIMIT 1`,
          [deterministicToken, bm]
        );
        if (existing.rows[0]) {
          // Race safety net: a concurrent request with the same key committed first.
          // Same canonical payload -> replay; any material difference -> key-reuse 409
          // (no mutation, no identifiers/PII). Same comparison as the pre-flight path.
          const row = existing.rows[0];
          await client.query("COMMIT");
          const incomingBooking = {
            appointment_datetime, customer_phone, customer_name, address_text, maps_url,
            job_zone, job_type, customer_note, allow_time_proposal: allowTimeProposal,
            duration_min: duration_min_v2, payloadV2, itemIdQty, standardPrice: standard_price,
          };
          if (!(await scheduledPayloadMatchesExisting(pool, row, incomingBooking, { serverAppointmentAuthoritative: bm === "urgent" }))) {
            return res.status(409).json({
              error: "คำขอนี้ถูกใช้ไปแล้วกับการจองอื่น กรุณาเริ่มการจองใหม่",
              code: "IDEMPOTENCY_KEY_REUSED",
            });
          }
          return res.json({
            success: true,
            replayed: true,
            job_id: row.job_id,
            booking_code: row.booking_code,
            token: row.booking_token,
            booking_mode: bm,
            dispatch_mode: row.dispatch_mode || "normal",
            duration_min: Number(row.duration_min || duration_min_v2 || 0),
            effective_block_min: effectiveBlockMin(Number(row.duration_min || duration_min_v2 || 0)),
            travel_buffer_min: TRAVEL_BUFFER_MIN,
            base_total: Number(row.job_price || 0),
          });
        }
      }

      let draftReservationTech = null;
      if (bm === "scheduled") {
        const startIso = normalizeAppointmentDatetime(appointment_datetime);
        draftReservationTech = await customerAvailability.reservePublicCustomerTechnician(
          publicCustomerAvailabilityDeps(client),
          {
            ...payloadV2,
            date: String(startIso).slice(0, 10),
            start: String(startIso).slice(11, 16),
            tech_type: requestedTechType,
            duration_min: duration_min_v2,
          }
        );
      }

      // 1) ดึงราคา base_price จาก DB
  const serviceLineItems = await customerPricingHelpers.buildCustomerServiceLineItemsFromPayload(
    (payloadV2.services && Array.isArray(payloadV2.services))
      ? payloadV2
      : { ...payloadV2, services: [{
          job_type: payloadV2.job_type,
          ac_type: payloadV2.ac_type,
          btu: payloadV2.btu,
          machine_count: payloadV2.machine_count,
          wash_variant: payloadV2.wash_variant,
          repair_variant: payloadV2.repair_variant,
        }] },
    client
  );

  // fallback (single service)
  let computedItems = [];
  let total = Number(standard_price || 0);

  if (serviceLineItems.length) {
    computedItems = computedItems.concat(serviceLineItems);
    total = serviceLineItems.reduce((s,it)=> s + Number(it.line_total||0), 0);
  } else if (total > 0) {
    // customer price fallback only; payroll will not treat this as technician income
    computedItems.push({ item_id: null, item_name: `ค่าบริการมาตรฐาน (${payloadV2.job_type || '-'})`, qty: 1, unit_price: total, line_total: total, is_service: false });
  }

  // extras (customer-visible only)
  if (itemIdQty.length) {
    const ids = itemIdQty.map((x) => x.item_id);
    const catR = await client.query(
      `SELECT item_id, item_name, base_price
       FROM public.catalog_items
       WHERE is_active=TRUE AND is_customer_visible=TRUE /* CUSTOMER_CATALOG_VISIBLE_ONLY */ AND item_id = ANY($1::bigint[])`,
      [ids]
    );

    const map = new Map(catR.rows.map((r) => [Number(r.item_id), r]));
    const extraLines = itemIdQty
      .map((x) => {
        const it = map.get(Number(x.item_id));
        if (!it) return null;
        const qty = Number(x.qty);
        const unit_price = Number(it.base_price || 0);
        const line_total = qty * unit_price;
        total += line_total;
        return {
          item_id: Number(it.item_id),
          item_name: it.item_name,
          qty,
          unit_price,
          line_total,
        };
      })
      .filter(Boolean);

    computedItems = computedItems.concat(extraLines);
  }

  // 2) สร้างงาน

      // ✅ โปรโมชั่นฝั่งลูกค้า: ระบบเลือกให้อัตโนมัติตามเงื่อนไข (super admin ตั้งค่า)
      // IMPORTANT: "ราคา" ของงานต้องเป็นราคาพื้นฐานเดิม (ห้ามเปลี่ยนราคา)
      // - jobs.job_price เก็บ base_total เท่านั้น
      // - ส่วนลดบันทึกแยกที่ job_promotions.applied_discount
      const base_total = Number(total || 0);
      const promoPick = await findBestCustomerPromotion(payloadV2, base_total, client);
      const appliedPromo = promoPick?.promo || null;
      const appliedDiscount = Math.min(Number(base_total || 0), Number(promoPick?.discount || 0));

      // ✅ dispatch_mode:
      // - scheduled (ลูกค้าจองปกติ) => normal (ให้เข้าแอดมิน/คิวตามปกติ)
      // - urgent (ยิงงานด่วน)      => offer  (ไป flow offer)
      const dispatchMode = (bm === 'urgent') ? 'offer' : 'normal';

      const catalogLinkReady = await isJobsCatalogLinkSchemaReady();
      const jobInsertColumns = [
        "customer_name", "customer_phone", "job_type", "appointment_datetime", "job_price",
        "address_text", "technician_team", "technician_username", "job_status",
        "booking_token", "job_source", "dispatch_mode", "customer_note",
        "maps_url", "job_zone", "duration_min", "booking_mode", "allow_time_proposal",
      ];
      const jobInsertValuesSql = ["$1", "$2", "$3", "$4", "$5", "$6", "NULL", "$16", "$11", "$7", "'customer'", "$14", "$8", "$9", "$10", "$12", "$13", "$15"];
      const jobInsertParams = [
        String(customer_name).trim(),
        (customer_phone || "").toString().trim(),
        String(job_type).trim(),
        appointment_datetime,
        Number(base_total || 0),
        String(address_text).trim(),
        token,
        (customer_note || "").toString(),
        (maps_url || "").toString(),
        (job_zone || "").toString(),
        JOB_STATUS.CUSTOMER_SCHEDULED_REVIEW,
        duration_min_v2,
        (bm === 'urgent' ? 'urgent' : 'scheduled'),
        dispatchMode,
        allowTimeProposal,
        draftReservationTech ? draftReservationTech.username : null,
      ];
      if (catalogLinkReady) {
        jobInsertColumns.push("catalog_item_id", "customer_sub");
        jobInsertParams.push(safeCatalogItemIdForJob, customerSubForJob);
        jobInsertValuesSql.push(`$${jobInsertParams.length - 1}`, `$${jobInsertParams.length}`);
      }

      const r = await client.query(
        `
        INSERT INTO public.jobs
        (${jobInsertColumns.join(", ")})
        VALUES (${jobInsertValuesSql.join(",")})
        RETURNING job_id, booking_token
        `,
        jobInsertParams
      );

      // attach promo to job (if any)
      if(appliedPromo && appliedDiscount > 0){
        try{
          await client.query(
            `INSERT INTO public.job_promotions (job_id, promo_id, applied_discount)
             VALUES ($1,$2,$3)
             ON CONFLICT (job_id) DO UPDATE SET promo_id=EXCLUDED.promo_id, applied_discount=EXCLUDED.applied_discount`,
            [r.rows[0].job_id, Number(appliedPromo.promo_id), Number(appliedDiscount)]
          );
        }catch(e){
          // fail-open: don't break booking
          console.warn('[public_book] promo attach failed', e.message);
        }
      }

      const job_id = r.rows[0].job_id;
      // ✅ booking_code (สุ่ม ไม่เรียง)
      const booking_code = await generateUniqueBookingCode(client);

      await client.query(`UPDATE public.jobs SET booking_code=$1 WHERE job_id=$2`, [booking_code, job_id]);

      // CREATE_URGENT_OFFERS_V2
      let urgentOffersCount = 0;
      if (bm === "urgent" && urgentOfferEnabled) {
        await expireTechnicianAcceptStatuses(client);
        const partners = await client.query(
          `
          SELECT u.username
          FROM public.users u
          LEFT JOIN public.technician_profiles p ON p.username=u.username
          WHERE u.role='technician'
            AND COALESCE(p.accept_status,'paused')='ready' AND p.accept_status_expires_at IS NOT NULL AND p.accept_status_expires_at > NOW()
            AND COALESCE(p.employment_type,'company') = 'partner'
          ORDER BY u.username
          `
        );

        const apptIso = appointment_datetime;
        const availablePartners = [];
        for (const row of partners.rows || []) {
          const ok = await isTechFree(row.username, apptIso, duration_min_v2, null);
          if (ok) availablePartners.push(row.username);
          if (availablePartners.length >= 30) break; // limit scan
        }

        if (!availablePartners.length) {
          await client.query(
            `UPDATE public.jobs
                SET job_status='${JOB_STATUS.URGENT_NO_TECHNICIAN}'
              WHERE job_id=$1`,
            [job_id]
          );
          console.warn("[public_book] urgent_no_offer_targets", { job_id, booking_code });
        } else {
          // ✅ safety: จำกัดไม่เกิน 30 ช่าง/ทีมที่ส่ง offer
          for (const u of availablePartners) {
            await client.query(
              `INSERT INTO public.job_offers (job_id, technician_username, status, expires_at)
               VALUES ($1,$2,'${OFFER_STATUS.PENDING}', NOW() + INTERVAL '10 minutes')`,
              [job_id, u]
            );
          }
          urgentOffersCount = availablePartners.length;
          console.log("[public_book] urgent_offers", { job_id, booking_code, count: availablePartners.length });
        }
      }


      // 3) บันทึกรายการ (ถ้ามี)
      for (const it of computedItems) {
        await client.query(
          `
          INSERT INTO public.job_items
            (job_id, item_id, item_name, qty, unit_price, line_total, assigned_technician_username, is_service,
             customer_price_rule_id, normal_unit_price, customer_price_label, customer_campaign_name, customer_price_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `,
          [
            job_id,
            it.item_id || null,
            it.item_name,
            Number(it.qty || 0),
            Number(it.unit_price || 0),
            Number(it.line_total || 0),
            it.assigned_technician_username || null,
            !!it.is_service,
            it.customer_price_rule_id || null,
            it.normal_unit_price || null,
            it.customer_price_label || null,
            it.customer_campaign_name || null,
            it.customer_price_source || null,
          ]
        );
      }

      await ensureCanonicalBookingJobUnits(job_id, client);
      await client.query(`UPDATE public.jobs SET per_unit_evidence_enabled=TRUE WHERE job_id=$1`, [job_id]);

      await client.query("COMMIT");

      console.log('[public_book]', { job_id, booking_code, booking_mode: bm, requested_tech_type: requestedTechType, duration_min: duration_min_v2, effective_block_min: effectiveBlockMin(duration_min_v2) });
      res.json({
        success: true,
        job_id,
        booking_code,
        token: r.rows[0].booking_token,
        booking_mode: bm,
        dispatch_mode: dispatchMode,
        offers_count: urgentOffersCount,
        urgent_offer_enabled: urgentOfferEnabled,
        duration_min: duration_min_v2,
        effective_block_min: effectiveBlockMin(duration_min_v2),
        travel_buffer_min: TRAVEL_BUFFER_MIN,
        applied_promo: (appliedPromo && appliedDiscount > 0) ? {
          promo_id: appliedPromo.promo_id,
          promo_name: appliedPromo.promo_name,
          promo_type: appliedPromo.promo_type,
          promo_value: appliedPromo.promo_value,
          discount: appliedDiscount,
        } : null,
        base_total: Number(base_total || 0),
      });
    } catch (e) {
      await client.query("ROLLBACK");
      const statusCode = Number(e?.statusCode || e?.status || 500);
      console.error(e);
      res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
        error: e.message || "จองงานไม่สำเร็จ",
        code: e?.code || undefined,
      });
    } finally {
      client.release();
    }
  }

  return {
    handleAdminBookV2,
    handleInternalBookFromAi,
    handlePublicCustomerUrgentBook,
    handlePublicBook,
  };
}

module.exports = {
  createBookingJobService,
};
