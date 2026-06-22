(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function hhmmToMinutes(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return (hour * 60) + minute;
  }

  function minutesToHhmm(value) {
    const total = Number(value);
    if (!Number.isFinite(total)) return "";
    const safe = Math.max(0, Math.min((24 * 60) - 1, Math.round(total)));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  }

  function bangkokTodayYmd() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${value.year}-${value.month}-${value.day}`;
    } catch (_) {
      return new Date(Date.now() + (7 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    }
  }

  function bangkokNowParts() {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return {
        ymd: `${value.year}-${value.month}-${value.day}`,
        hour: Number(value.hour || 0),
        minute: Number(value.minute || 0),
      };
    } catch (_) {
      const d = new Date(Date.now() + (7 * 60 * 60 * 1000));
      return {
        ymd: d.toISOString().slice(0, 10),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
      };
    }
  }

  function ceilToStep(minute, stepMin) {
    const step = Math.max(1, Number(stepMin || 30));
    return Math.ceil(Number(minute || 0) / step) * step;
  }

  function currentSameDayBucket() {
    const now = bangkokNowParts();
    const minuteOfDay = (now.hour * 60) + now.minute;
    return `${now.ymd}-${Math.floor(minuteOfDay / 5)}`;
  }

  function minimumStartForDate(date, responseMinimumStart, stepMin) {
    const explicit = hhmmToMinutes(responseMinimumStart);
    if (explicit != null && String(date || "").slice(0, 10) === bangkokTodayYmd()) return explicit;
    const now = bangkokNowParts();
    if (String(date || "").slice(0, 10) !== now.ymd) return null;
    return ceilToStep((now.hour * 60) + now.minute, stepMin || 30);
  }

  function publicAvailabilityQuery(draft, servicePayload, pricingData) {
    const d = draft || {};
    const payload = servicePayload || {};
    const durationMin = Math.max(15, Number(pricingData && pricingData.duration_min || 0));
    const query = {
      date: String(d.date || "").trim(),
      // Defect 1: scheduled customer availability must consider every employment type the
      // admin has explicitly opted in via customer_slot_visible=true (company OR partner).
      // Hardcoding company silently hid admin-enabled partner technicians. The backend still
      // filters strictly by customer_slot_visible + service matrix + monthly calendar.
      tech_type: "all",
      duration_min: durationMin,
      mode: "start",
      job_type: payload.job_type || "",
      ac_type: payload.ac_type || "",
      btu: payload.btu || "",
      machine_count: payload.machine_count || "",
      wash_variant: payload.wash_variant || "",
      repair_variant: payload.repair_variant || "",
    };
    if (Array.isArray(payload.services) && payload.services.length) {
      query.services = JSON.stringify(payload.services);
    }
    if (query.date && query.date === bangkokTodayYmd()) {
      query._slot_bucket = currentSameDayBucket();
    }
    return query;
  }

  function publicCalendarQuery(draft, servicePayload, pricingData) {
    const d = draft || {};
    const payload = servicePayload || {};
    const durationMin = Math.max(15, Number(pricingData && pricingData.duration_min || 0));
    const query = {
      month: String(d.calendar_month || d.date?.slice(0, 7) || "").trim(),
      // Defect 1: see publicAvailabilityQuery — calendar must use the same all-types query.
      tech_type: "all",
      duration_min: durationMin,
      job_type: payload.job_type || "",
      ac_type: payload.ac_type || "",
      btu: payload.btu || "",
      machine_count: payload.machine_count || "",
      wash_variant: payload.wash_variant || "",
      repair_variant: payload.repair_variant || "",
    };
    if (Array.isArray(payload.services) && payload.services.length) {
      query.services = JSON.stringify(payload.services);
    }
    if (query.month && query.month === bangkokTodayYmd().slice(0, 7)) {
      query._slot_bucket = currentSameDayBucket();
    }
    return query;
  }

  function queryKey(query) {
    const q = query || {};
    return [
      q.date,
      q.tech_type,
      q.duration_min,
      q.job_type,
      q.ac_type,
      q.btu,
      q.machine_count,
      q.wash_variant,
      q.repair_variant,
      q.services,
      q._slot_bucket,
    ].map((value) => String(value == null ? "" : value)).join("|");
  }

  function calendarQueryKey(query) {
    const q = query || {};
    return [
      q.month,
      q.tech_type,
      q.duration_min,
      q.job_type,
      q.ac_type,
      q.btu,
      q.machine_count,
      q.wash_variant,
      q.repair_variant,
      q.services,
      q._slot_bucket,
    ].map((value) => String(value == null ? "" : value)).join("|");
  }

  function normalizeCalendarDays(response) {
    const data = response || {};
    const days = Array.isArray(data.days) ? data.days : [];
    const map = new Map();
    days.forEach((day) => {
      const date = String(day && day.date || "").slice(0, 10);
      if (!date) return;
      map.set(date, {
        date,
        available: day.available === true,
        status: String(day.status || (day.available === true ? "available" : "no_open_slots")).trim(),
        reason_code: String(day.reason_code || "").trim(),
        first_available: day.first_available || null,
      });
    });
    return map;
  }

  function normalizePublicSlots(response, fallbackDurationMin) {
    const data = response || {};
    const rawSlots = Array.isArray(data.slots) ? data.slots : [];
    const durationMin = Math.max(15, Number(data.duration_min || fallbackDurationMin || 60));
    const stepMin = Math.max(5, Number(data.slot_step_min || 30));
    const date = String(data.date || "").trim();
    const minimumStartMin = data.minimum_start ? minimumStartForDate(date, data.minimum_start, stepMin) : null;
    const unique = new Map();

    rawSlots.forEach((slot) => {
      if (!slot || slot.available !== true) return;
      const startMin = hhmmToMinutes(slot.start);
      const rawEndMin = hhmmToMinutes(slot.end);
      if (startMin == null) return;

      const looksLikeStartStep = String(slot.slot_kind || "") === "start_step"
        || rawEndMin == null
        || (rawEndMin - startMin) <= (stepMin + 1);
      const starts = [];

      if (looksLikeStartStep) {
        starts.push(startMin);
      } else {
        for (let minute = startMin; minute + durationMin <= rawEndMin; minute += stepMin) starts.push(minute);
      }

      starts.forEach((minute) => {
        if (minimumStartMin != null && minute < minimumStartMin) return;
        const start = minutesToHhmm(minute);
        const end = minutesToHhmm(minute + durationMin);
        if (!start || !end) return;
        const key = `${date}|${start}|${durationMin}`;
        if (unique.has(key)) return;
        unique.set(key, {
          key,
          date,
          start,
          end,
          raw_end: String(slot.end || ""),
          duration_min: durationMin,
          available: true,
        });
      });
    });

    return Array.from(unique.values()).sort((a, b) => {
      return (hhmmToMinutes(a.start) || 0) - (hhmmToMinutes(b.start) || 0);
    });
  }

  function selectedSlotIsCurrent(selectedSlot, response, expectedQueryKey) {
    if (!selectedSlot || !expectedQueryKey || selectedSlot.query_key !== expectedQueryKey) return false;
    return normalizePublicSlots(response, selectedSlot.duration_min).some((slot) => (
      slot.key === selectedSlot.key
      && slot.date === selectedSlot.date
      && slot.start === selectedSlot.start
    ));
  }

  root.availability = {
    hhmmToMinutes,
    minutesToHhmm,
    bangkokTodayYmd,
    bangkokNowParts,
    minimumStartForDate,
    publicAvailabilityQuery,
    publicCalendarQuery,
    queryKey,
    calendarQueryKey,
    normalizeCalendarDays,
    normalizePublicSlots,
    selectedSlotIsCurrent,
  };
})();
