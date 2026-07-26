(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_PHONE = "098-877-7321";
  const LINE_URL = "https://lin.ee/fG1Oq7y";
  const WARRANTY_COPY = "à¸£à¸±à¸šà¸›à¸£à¸°à¸à¸±à¸™à¸‡à¸²à¸™à¸¥à¹‰à¸²à¸‡ 30 à¸§à¸±à¸™ à¹€à¸‰à¸à¸²à¸°à¸­à¸²à¸à¸²à¸£à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¸à¸±à¸šà¸à¸²à¸£à¸šà¸£à¸´à¸à¸²à¸£ à¹„à¸¡à¹ˆà¸£à¸§à¸¡à¸­à¸°à¹„à¸«à¸¥à¹ˆà¹€à¸ªà¸µà¸¢ à¸£à¸°à¸šà¸šà¸£à¸±à¹ˆà¸§ à¸šà¸­à¸£à¹Œà¸” à¸„à¸­à¸¡à¹€à¸à¸£à¸ªà¹€à¸‹à¸­à¸£à¹Œ à¹„à¸Ÿà¸•à¸ à¸«à¸£à¸·à¸­à¸›à¸±à¸à¸«à¸²à¸ˆà¸²à¸à¸•à¸±à¸§à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡à¹€à¸”à¸´à¸¡";

  // Private, in-memory lookup credential for a long booking_token from a
  // ?q=/?token= deep link. Customer-typed phone/code lookups receive a separate
  // short-lived selection reference in tracking state.
  // It is NEVER written into the draft, the visible input, or rendered HTML.
  // Refresh and post-review reloads reuse THIS value so a token session is not
  // silently downgraded to code-only access. A manual "à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸ªà¸–à¸²à¸™à¸°" replaces it
  // with whatever the customer explicitly typed.
  let activeCredential = "";
  // Set when a deep-link credential is waiting for the first auto-lookup.
  let pendingAutoLookup = false;

  function setActiveCredential(value) {
    activeCredential = String(value == null ? "" : value).trim();
  }

  function esc(value) {
    return root.utils.escapeHtml(value == null ? "" : String(value));
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function modeFromData(data) {
    const explicit = clean(data.booking_mode || data.mode || data.request_mode).toLowerCase();
    if (explicit === "urgent") return "urgent";
    if (explicit === "scheduled") return "scheduled";
    const dispatch = clean(data.dispatch_mode).toLowerCase();
    if (dispatch === "offer") return "urgent";
    return "scheduled";
  }

  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return `${n.toLocaleString("th-TH")} à¸šà¸²à¸—`;
  }

  function serviceSummary(data) {
    return [data.job_type, data.service_summary, data.items_text].map(clean).filter(Boolean)[0] || "à¸šà¸£à¸´à¸à¸²à¸£ CWF";
  }

  function imageUrl(src) {
    const value = clean(src);
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith("/") ? value : `/${value}`;
  }

  function isDone(data) {
    const status = clean(data.job_status);
    return !!(clean(data.finished_at) || status.includes("à¹€à¸ªà¸£à¹‡à¸ˆ"));
  }

  function techList(data) {
    const list = [];
    if (data.technician) list.push(data.technician);
    if (Array.isArray(data.technician_team)) {
      data.technician_team.forEach((tech) => {
        const key = clean(tech && (tech.id || tech.username || tech.full_name || tech.phone));
        if (tech && !list.some((x) => clean(x.id || x.username || x.full_name || x.phone) === key)) list.push(tech);
      });
    }
    return list;
  }

  function hasAssignedTech(data) {
    return techList(data).length > 0 || !!clean(data.assigned_at || data.accepted_at);
  }

  // Access-level awareness. A booking_code lookup returns access_level "code"
  // with technician identity redacted. Redacted (absent) technician fields must
  // never be interpreted as "no technician assigned" â€” hidden identity is not
  // the same as an unassigned job.
  function isTokenAccess(data) { return data && data.access_level === "token"; }
  function canViewDetails(data) {
    return !!(data && (data.can_view_full_tracking === true
      || data.capabilities?.can_view_full_tracking === true
      || isTokenAccess(data)));
  }

  function isCanceled(data) {
    if (clean(data && data.canceled_at)) return true;
    const status = clean(data && data.job_status).toLowerCase();
    return status.includes("à¸¢à¸à¹€à¸¥à¸´à¸") || ["cancel", "canceled", "cancelled"].includes(status);
  }

  function paymentStatusLabel(value, paidAt) {
    const status = clean(value).toLowerCase();
    if (status === "paid" || (!status && clean(paidAt))) return "à¸Šà¸³à¸£à¸°à¹à¸¥à¹‰à¸§";
    if (status === "unpaid") return "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸Šà¸³à¸£à¸°";
    if (status === "partial") return "à¸Šà¸³à¸£à¸°à¸šà¸²à¸‡à¸ªà¹ˆà¸§à¸™";
    if (["pending", "pending_payment", "payment_processing"].includes(status)) return "à¸£à¸­à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸à¸²à¸£à¸Šà¸³à¸£à¸°";
    if (["failed", "payment_failed"].includes(status)) return "à¸à¸²à¸£à¸Šà¸³à¸£à¸°à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ";
    return status ? "à¸à¸£à¸¸à¸“à¸²à¸•à¸´à¸”à¸•à¹ˆà¸­ CWF à¹€à¸à¸·à¹ˆà¸­à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸à¸²à¸£à¸Šà¸³à¸£à¸°" : "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸à¸²à¸£à¸Šà¸³à¸£à¸°";
  }
  function canUseTokenActions(data) {
    return !!(data && (data.can_use_token_actions === true
      || data.capabilities?.can_use_token_actions === true
      || isTokenAccess(data)));
  }
  function isCodeOnly(data) { return !!(data && !canUseTokenActions(data)); }

  function limitedAccessNoticeHtml() {
    return `
      <div class="tracking-limited-note" data-limited-access role="note">
        <strong>à¹‚à¸«à¸¡à¸”à¸ˆà¸³à¸à¸±à¸”à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ (à¸„à¹‰à¸™à¸”à¹‰à¸§à¸¢à¸£à¸«à¸±à¸ªà¸à¸²à¸£à¸ˆà¸­à¸‡)</strong>
        <p class="muted">à¹€à¸à¸·à¹ˆà¸­à¸„à¸§à¸²à¸¡à¸›à¸¥à¸­à¸”à¸ à¸±à¸¢ à¸à¸²à¸£à¸„à¹‰à¸™à¸”à¹‰à¸§à¸¢à¸£à¸«à¸±à¸ªà¸à¸²à¸£à¸ˆà¸­à¸‡à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹€à¸‰à¸à¸²à¸°à¸ªà¸–à¸²à¸™à¸°à¹à¸¥à¸°à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹€à¸šà¸·à¹‰à¸­à¸‡à¸•à¹‰à¸™ à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹€à¸¡à¸·à¹ˆà¸­à¹€à¸›à¸´à¸”à¸ˆà¸²à¸à¸¥à¸´à¸‡à¸à¹Œà¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™à¸—à¸µà¹ˆà¹„à¸”à¹‰à¸£à¸±à¸šà¹ƒà¸™à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¢à¸·à¸™à¸¢à¸±à¸™</p>
      </div>`;
  }

  // Code-only status copy is derived ONLY from reliable, allow-listed timestamps
  // (travel/checkin/started/finished) plus job_status "done" â€” never from
  // technician presence, so a redacted technician cannot flip these to a
  // "waiting for a technician" message.
  function limitedStatusCopy(data) {
    if (isDone(data)) return "à¸‡à¸²à¸™à¹€à¸ªà¸£à¹‡à¸ˆà¹à¸¥à¹‰à¸§";
    if (clean(data.started_at)) return "à¸à¸³à¸¥à¸±à¸‡à¹ƒà¸«à¹‰à¸šà¸£à¸´à¸à¸²à¸£";
    if (clean(data.checkin_at)) return "à¸Šà¹ˆà¸²à¸‡à¸–à¸¶à¸‡à¸«à¸™à¹‰à¸²à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§";
    if (clean(data.travel_started_at)) return "à¸Šà¹ˆà¸²à¸‡à¸à¸³à¸¥à¸±à¸‡à¹€à¸”à¸´à¸™à¸—à¸²à¸‡";
    return "à¸à¸³à¸¥à¸±à¸‡à¸•à¸´à¸”à¸•à¸²à¸¡à¸ªà¸–à¸²à¸™à¸°à¸‡à¸²à¸™";
  }
  function limitedStatusDetail(data) {
    if (isDone(data)) return "à¸‡à¸²à¸™à¸šà¸£à¸´à¸à¸²à¸£à¹€à¸ªà¸£à¹‡à¸ˆà¸ªà¸´à¹‰à¸™à¹à¸¥à¹‰à¸§";
    if (clean(data.started_at)) return "à¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡à¸à¸³à¸¥à¸±à¸‡à¹ƒà¸«à¹‰à¸šà¸£à¸´à¸à¸²à¸£";
    if (clean(data.checkin_at)) return "à¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡à¸–à¸¶à¸‡à¸«à¸™à¹‰à¸²à¸‡à¸²à¸™à¹à¸¥à¹‰à¸§";
    if (clean(data.travel_started_at)) return "à¸Šà¹ˆà¸²à¸‡à¸à¸³à¸¥à¸±à¸‡à¹€à¸”à¸´à¸™à¸—à¸²à¸‡à¹„à¸›à¸¢à¸±à¸‡à¸ªà¸–à¸²à¸™à¸—à¸µà¹ˆà¸™à¸±à¸”à¸«à¸¡à¸²à¸¢";
    return "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡à¹à¸¥à¸°à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¹€à¸•à¹‡à¸¡à¸ˆà¸°à¹à¸ªà¸”à¸‡à¹€à¸¡à¸·à¹ˆà¸­à¹€à¸›à¸´à¸”à¸ˆà¸²à¸à¸¥à¸´à¸‡à¸à¹Œà¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™à¹ƒà¸™à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¢à¸·à¸™à¸¢à¸±à¸™";
  }
  function limitedNextAction(data) {
    if (isDone(data)) return "à¸”à¸¹à¹€à¸­à¸à¸ªà¸²à¸£à¹à¸¥à¸°à¸à¸²à¸£à¸£à¸±à¸šà¸›à¸£à¸°à¸à¸±à¸™à¹„à¸”à¹‰à¸ˆà¸²à¸à¸¥à¸´à¸‡à¸à¹Œà¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™à¹ƒà¸™à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¢à¸·à¸™à¸¢à¸±à¸™";
    return "à¹€à¸›à¸´à¸”à¸ˆà¸²à¸à¸¥à¸´à¸‡à¸à¹Œà¸•à¸´à¸”à¸•à¸²à¸¡à¸‡à¸²à¸™à¹ƒà¸™à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸à¸·à¹ˆà¸­à¸”à¸¹à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¸¡à¸Šà¹ˆà¸²à¸‡à¹à¸¥à¸°à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¹€à¸•à¹‡à¸¡";
  }

  function mapUrl(data) {
    const rawLat = clean(data.gps_latitude);
    const rawLng = clean(data.gps_longitude);
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (rawLat && rawLng && Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;
    }
    const direct = clean(data.maps_url || data.map_url);
    if (direct) {
      try {
        const parsed = new URL(direct);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
      } catch (_) { /* fall through to address search */ }
    }
    const address = clean(data.address_text);
    return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
  }

  function receiptUrl(data) {
    if (!canUseTokenActions(data)) return "";
    // The receipt document now requires the booking_token as an access key
    // (?key=...) â€” a bare job_id link would just 404. Only build the fallback
    // when we actually hold the token (token-based lookups).
    const fallback = isDone(data) && data.job_id && data.booking_token
      ? `/docs/receipt/${encodeURIComponent(data.job_id)}?key=${encodeURIComponent(data.booking_token)}`
      : "";
    const raw = clean(data.receipt_url);
    if (!raw) return fallback;

    const apiBase = clean(root.api.getApiBase()) || window.location.origin;
    try {
      const url = new URL(raw, apiBase);
      const current = new URL(apiBase || window.location.origin, window.location.href);
      const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0";
      if (isLocalHost || url.origin !== current.origin) {
        return `${current.origin}${url.pathname}${url.search}`;
      }
      return `${url.pathname}${url.search}`;
    } catch (_) {
      return fallback || imageUrl(raw);
    }
  }

  function photoList(data) {
    return Array.isArray(data.photos)
      ? data.photos.map((item) => {
          if (typeof item === "string") return { url: imageUrl(item), label: "à¸£à¸¹à¸›à¸‡à¸²à¸™" };
          return { url: imageUrl(item.public_url || item.url || item.photo_url || item.path), label: item.phase || item.label || "à¸£à¸¹à¸›à¸‡à¸²à¸™" };
        }).filter((item) => item.url)
      : [];
  }

  function parseDate(value) {
    const raw = clean(value);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function serviceDate(data) {
    return completionDate(data) || parseDate(data.appointment_datetime);
  }

  function completionDate(data) {
    return parseDate(data.finished_at || data.completed_at || data.closed_at);
  }

  function monthsSince(date) {
    if (!date) return null;
    const days = Math.max(0, (Date.now() - date.getTime()) / 86400000);
    return days / 30.4375;
  }

  function daysSince(date, nowMs = Date.now()) {
    if (!date || !Number.isFinite(date.getTime())) return null;
    return Math.max(0, Math.floor((Number(nowMs) - date.getTime()) / 86400000));
  }

  function elapsedCleaningText(days) {
    if (!Number.isFinite(days)) return "";
    if (days === 0) return "à¸§à¸±à¸™à¸™à¸µà¹‰";
    if (days < 30) return `${days} à¸§à¸±à¸™`;
    const months = Math.max(1, Math.floor(days / 30));
    return `à¸›à¸£à¸°à¸¡à¸²à¸“ ${months} à¹€à¸”à¸·à¸­à¸™`;
  }

  function approximateFutureText(days) {
    if (!Number.isFinite(days) || days <= 0) return "à¸–à¸¶à¸‡à¸£à¸­à¸šà¹à¸™à¸°à¸™à¸³à¹à¸¥à¹‰à¸§";
    if (days < 60) return `${Math.ceil(days)} à¸§à¸±à¸™`;
    return `à¸›à¸£à¸°à¸¡à¸²à¸“ ${Math.max(1, Math.round(days / 30))} à¹€à¸”à¸·à¸­à¸™`;
  }

  function formatCleaningDate(date) {
    if (!date || !Number.isFinite(date.getTime())) return "-";
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function serviceProfile(data) {
    const itemText = Array.isArray(data.service_items)
      ? data.service_items.map((item) => clean(item && item.item_name)).filter(Boolean).join(" ")
      : "";
    const text = clean([data.job_type, data.service_summary, data.items_text, itemText].filter(Boolean).join(" ")).toLowerCase();
    if (/full|heavy|disassembly|overhaul|à¸–à¸­à¸”|à¸•à¸±à¸”à¸¥à¹‰à¸²à¸‡à¹ƒà¸«à¸à¹ˆ|à¸¥à¹‰à¸²à¸‡à¹ƒà¸«à¸à¹ˆ/.test(text)) {
      return { kind: "heavy", label: "à¸•à¸±à¸”à¸¥à¹‰à¸²à¸‡à¹ƒà¸«à¸à¹ˆ", coilMonths: 10, nextText: "8-12 à¹€à¸”à¸·à¸­à¸™" };
    }
    if (/hang|deep|à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œ|à¸¥à¹‰à¸²à¸‡à¸¥à¸¶à¸|deep clean/.test(text)) {
      return { kind: "deep", label: "à¹à¸‚à¸§à¸™à¸„à¸­à¸¢à¸¥à¹Œ / à¸¥à¹‰à¸²à¸‡à¸¥à¸¶à¸", coilMonths: 7, nextText: "6-8 à¹€à¸”à¸·à¸­à¸™" };
    }
    if (/premium|à¸à¸£à¸µà¹€à¸¡à¸µà¸¢à¸¡/.test(text)) {
      return { kind: "premium", label: "à¸¥à¹‰à¸²à¸‡à¸à¸£à¸µà¹€à¸¡à¸µà¸¢à¸¡", coilMonths: 6, nextText: "5-6 à¹€à¸”à¸·à¸­à¸™" };
    }
    if (/à¸¥à¹‰à¸²à¸‡|clean|wash/.test(text)) {
      return { kind: "clean", label: "à¸¥à¹‰à¸²à¸‡à¸›à¸à¸•à¸´", coilMonths: 5, nextText: "4-6 à¹€à¸”à¸·à¸­à¸™" };
    }
    return { kind: "general", label: serviceSummary(data), coilMonths: 6, nextText: "à¸›à¸£à¸°à¸¡à¸²à¸“ 6 à¹€à¸”à¸·à¸­à¸™" };
  }

  function healthScore(months, alertMonths) {
    if (months == null || !Number.isFinite(months)) return null;
    const score = 100 - (months / Math.max(1, alertMonths)) * 80;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function cleanlinessRecommendation(serviceCompletedAt, rawScore, profile, nowMs = Date.now()) {
    const date = serviceCompletedAt instanceof Date ? serviceCompletedAt : parseDate(serviceCompletedAt);
    const numericScore = Number(rawScore);
    const score = Number.isFinite(numericScore) ? Math.max(0, Math.min(100, Math.round(numericScore))) : null;
    const profileMonths = Number(profile && profile.coilMonths);
    const cycleDays = Math.max(1, Math.round((Number.isFinite(profileMonths) && profileMonths > 0 ? profileMonths : 5) * 30.4375));
    const excellentMaxDays = Math.floor(cycleDays * 0.3);
    const goodMaxDays = Math.floor(cycleDays * 0.6);
    const cycleText = clean(profile && profile.nextText) || `à¸›à¸£à¸°à¸¡à¸²à¸“ ${Math.max(1, Math.round(cycleDays / 30.4375))} à¹€à¸”à¸·à¸­à¸™`;
    const elapsedDays = daysSince(date, nowMs);
    if (elapsedDays == null) {
      return {
        tone: "unknown",
        status: "à¸¢à¸±à¸‡à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸£à¸­à¸šà¸¥à¹‰à¸²à¸‡à¹„à¸¡à¹ˆà¹„à¸”à¹‰",
        score: null,
        cycleDays,
        excellentMaxDays,
        goodMaxDays,
        cycleText,
        elapsedDays: null,
        elapsedText: "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸§à¸±à¸™à¸—à¸µà¹ˆà¸ˆà¸šà¸‡à¸²à¸™à¸™à¸µà¹‰",
        serviceDateText: "-",
        recommendation: "à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¸¡à¸µà¸§à¸±à¸™à¸—à¸µà¹ˆà¸ˆà¸šà¸‡à¸²à¸™à¸™à¸µà¹‰à¸ªà¸³à¸«à¸£à¸±à¸šà¸„à¸³à¸™à¸§à¸“à¸£à¸­à¸šà¸–à¸±à¸”à¹„à¸›",
        nextText: "à¸•à¸´à¸”à¸•à¸²à¸¡Û¯=êÚ$z{-®éÜj×'•ögFW%÷2ÇÂ’ÀĞ¢Ò“°Ğ¢ĞĞ¢f–æ—6…G&6¶–æu&VæFW"†6öçF–æW"“°Ğ¢ĞĞ Ğ¢òòFVWÖÆ–æ²Fö¶Vç2&WF–âF†RW†—7F–ærtUB6öçG&7Bâ7W7FöÖW"×G—VB†öæPĞ¢òò˜‰®ŠŞŠ>˜Î˜.‰~Š>˜Š^‹Š>Š¾‹Š®ˆ‹.Š>ˆŠŞˆ~˜>ˆ®˜’&öG’ÖöæÇ’Æöö·Wˆ˜ŠŞ‰˜ˆ.˜‹.Š®‹˜‚6–væVB6VÆV7F–öàĞ¢òò&VfW&Væ6RÂ6òF†RG—VB–FVçF–f–W"—2æWfW"6÷–VB–çFò&WVW7BU$ÂàĞ¢7–æ2gVæ7F–öâÆöö·W†6öçF–æW"Â÷G2’°Ğ¢÷G2Ò÷G2ÇÂ·Ó°Ğ¢6öç7B–çWBÒ6öçF–æW"çVW'•6VÆV7F÷"‚"7G&6¶–ærÖ6öFR"“°Ğ¢6öç7BW6–æu&—fFRÒ÷G2æ7&VFVçF–ÂÒçVÆÃ°Ğ¢6öç7B&rÒW6–æu&—fFPĞ¢ò7G&–ær†÷G2æ7&VFVçF–ÂÇÂ""’çG&–Ò‚Ğ¢¢7G&–ær‚†–çWBbb–çWBçfÇVR’ÇÂ""’çG&–Ò‚“°Ğ¢6öç7BÒW6–æu&—fFRbbõä5te´Õ£Ó•×³wÒBö’çFW7B‡&r’ò&rçFõWW$66R‚’¢&s°Ğ¢–b‡W6–æu&—fFR’6WD7F—fT7&VFVçF–Â‡“°Ğ¢VÇ6R6WD7F—fT7&VFVçF–Â‚""“°Ğ¢–b‚W6–æu&—fFR’°Ğ¢&ö÷Bç7FFRçWFFTG&gB‚'G&6¶–ær"Â²G&6¶–æt6öFS¢Ò“°Ğ¢ĞĞ¢–b‚’°Ğ¢&ö÷Bç7FFRç6WEG&6¶–ær‡²7FGW3¢&W'&÷""ÂFF¢çVÆÂÂW'&÷#¢.ˆŠ>‹‰>‹.ˆŠ>ŠŞˆ˜‰®ŠŞŠ>˜Î˜.‰~Š>Š¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆr"Ò“°Ğ¢f–æ—6…G&6¶–æu&VæFW"†6öçF–æW"“°Ğ¢&WGW&ã°Ğ¢ĞĞ¢òò7F÷&R÷&FW"6öFW2Æöö²Æ–¶R$5tbÕ………‚"(	B&÷WFRF†VÒFòF†R÷&FW"Æöö·W Ğ¢òò–ç7FVBöbF†R¦ö"ö&öö¶–ærG&6¶W"àĞ¢–b‚õä5tbÒö’çFW7B‡’’²v—BÆöö·W÷&FW"†6öçF–æW"Â“²&WGW&ã²ĞĞ¢&ö÷Bç7FFRç6WEG&6¶–ær‡²7FGW3¢&ÆöF–ær"ÂFF¢çVÆÂÂW'&÷#¢""ÂW'&÷$¶–æC¢""Â&WG'”gFW#¢Ò“°Ğ¢f–æ—6…G&6¶–æu&VæFW"†6öçF–æW"“°Ğ¢G'’°Ğ¢–b‡W6–æu&—fFR’°Ğ¢6öç7BFFÒv—B&ö÷Bæ’çG&6´&öö¶–ær‡“°Ğ¢&ö÷Bç7FFRç6WEG&6¶–ær‡²7FGW3¢'7V66W72"ÂFFÂW'&÷#¢""ÂW'&÷$¶–æC¢""Â&WG'”gFW#¢Ò“°Ğ¢–b†FFbbFFæ&öö¶–æuö6öFR’°Ğ¢&ö÷Bç7FFRçWFFTG&gB‚'G&6¶–ær"Â²G&6¶–æt6öFS¢7G&–ær†FFæ&öö¶–æuö6öFR’Ò“°Ğ¢–b†–çWB’–çWBçfÇVRÒ7G&–ær†FFæ&öö¶–æuö6öFR“°Ğ¢ĞĞ¢ÒVÇ6R°Ğ¢6öç7B&W7VÇBÒv—B&ö÷Bæ’æÆöö·WG&6¶–ær‡“°Ğ¢6öç7B¦ö'2Ò'&’æ—4'&’‡&W7VÇCòæ¦ö'2’ò&W7VÇBæ¦ö'2¢µÓ°Ğ¢–b†¦ö'2æÆVæwF‚ÓÓÒ’&WGW&â÷Vå6VÆV7F–öâ†6öçF–æW"Â¦ö'5³Òç6VÆV7F–öå÷&Vb“°Ğ¢&ö÷Bç7FFRç6WEG&6¶–ær‡²7FGW3¢&6†ö–6W2"ÂFF¢²¦ö'2ÒÂW'&÷#¢""ÂW'&÷$¶–æC¢""Â&WG'”gFW#¢Ò“°Ğ¢ĞĞ¢Ò6F6‚†W'&÷"’°Ğ¢6öç7B7FGW2ÒçVÖ&W"†W'&÷"bbW'&÷"ç7FGW2“°Ğ¢&ö÷Bç7FFRç6WEG&6¶–ær‡°Ğ¢7FGW3¢&W'&÷""ÀĞ¢FF¢çVÆÂÀĞ¢W'&÷#¢W'&÷"bbW'&÷"æÖW76vRÀĞ¢W'&÷$¶–æC¢7FGW2ÓÓÒC#’ò'&FR"¢7FGW2ÓÓÒCBò&æ÷BÖf÷VæB"¢&æWGv÷&²"ÀĞ¢&WG'”gFW#¢çVÖ&W"†W'&÷#òæFFòç&WG'•ögFW%÷2ÇÂ’ÀĞ¢Ò“°Ğ¢òòf–ÆVB&—fFRÆöö·W×W7Bæ÷BÆVfRF†RFö¶Vâç—v†W&Rf—6–&ÆR(	B—@Ğ¢òòv2æWfW"w&—GFVâFòF†R–çWBöG&gBÂ6òæ÷F†–ærFò6ÆV"†W&RàĞ¢ĞĞ¢f–æ—6…G&6¶–æu&VæFW"†6öçF–æW"“°Ğ¢ĞĞ Ğ¢òò&Vg&W6‚ò÷7B×&Wf–Wr&VÆöG2&WW6RF†R&—fFR7F—fR7&VFVçF–Â6òĞ¢òòFö¶Vâ6W76–öâ¶VW2gVÆÂ66W72–ç7FVBöb6–ÆVçFÇ’F÷væw&F–ærFòF†PĞ¢òòf—6–&ÆR&öö¶–æuö6öFRàĞ¢gVæ7F–öâ&VÆöD7W'&VçB†6öçF–æW"’°Ğ¢6öç7B6VÆV7F–öå&VfW&Væ6RÒ6ÆVâ‡&ö÷Bç7FFRçG&6¶–æræFFòç6VÆV7F–öå÷&Vb“°Ğ¢–b‡6VÆV7F–öå&VfW&Væ6R’&WGW&â÷Vå6VÆV7F–öâ†6öçF–æW"Â6VÆV7F–öå&VfW&Væ6R“°Ğ¢–b†7F—fT7&VFVçF–Â’&WGW&âÆöö·W†6öçF–æW"Â²7&VFVçF–Ã¢7F—fT7&VFVçF–ÂÒ“°Ğ¢&WGW&âÆöö·W†6öçF–æW"“°Ğ¢ĞĞ Ğ¢gVæ7F–öâ&–æE&W7VÇD7F–öç2†6öçF–æW"’°Ğ¢6öç7B&W7VÇBÒ6öçF–æW"çVW'•6VÆV7F÷"‚%¶FF×G&6¶–ær×&W7VÇEÒ"“°Ğ¢–b‡&W7VÇBbb&W7VÇBæFF6WBçVæ—EF'4&÷VæB’°Ğ¢&W7VÇBæFF6WBçVæ—EF'4&÷VæBÒ##°Ğ¢&W7VÇBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ğ¢6öç7Bf–WuF"ÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FF×G&6¶–ær×f–WuÒ"“°Ğ¢–b‡f–WuF"’°Ğ¢6öç7B–BÒf–WuF"ævWDGG&–'WFR‚&FF×G&6¶–ær×f–Wr"“°Ğ¢6öç7B&W7VÇD6&BÒf–WuF"æ6Æ÷6W7B‚"çG&6¶–ær×&W7VÇBÖ6&B"“°Ğ¢–b‚&W7VÇD6&B’&WGW&ã°Ğ¢&W7VÇD6&BçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&6¶–ær×f–WuÒ"’æf÷$V6‚‚†'Fâ’Óâ°Ğ¢6öç7B7F—fRÒ'FâævWDGG&–'WFR‚&FF×G&6¶–ær×f–Wr"’ÓÓÒ–C°Ğ¢'Fâæ6Æ74Æ—7BçFövvÆR‚&—2Ö7F—fR"Â7F—fR“°Ğ¢'Fâç6WDGG&–'WFR‚&&–×6VÆV7FVB"Â7F—fRò'G'VR"¢&fÇ6R"“°Ğ¢Ò“°Ğ¢&W7VÇD6&BçVW'•6VÆV7F÷$ÆÂ‚%¶FF×G&6¶–ær×æVÅÒ"’æf÷$V6‚‚‡æVÂ’Óâ°Ğ¢6öç7B7F—fRÒæVÂævWDGG&–'WFR‚&FF×G&6¶–ær×æVÂ"’ÓÓÒ–C°Ğ¢æVÂæ6Æ74Æ—7BçFövvÆR‚&—2Ö7F—fR"Â7F—fR“°Ğ¢æVÂæ†–FFVâÒ7F—fS°Ğ¢Ò“°Ğ¢&WGW&ã°Ğ¢ĞĞ Ğ¢6öç7BF"ÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FF×Væ—B×F%Ò"“°Ğ¢–b‚F"’&WGW&ã°Ğ¢6öç7B6†VÆÂÒF"æ6Æ÷6W7B‚"ç77÷'B×Væ—G2Ö6&B"“°Ğ¢–b‚6†VÆÂ’&WGW&ã°Ğ¢6öç7B–BÒF"ævWDGG&–'WFR‚&FF×Væ—B×F""“°Ğ¢6†VÆÂçVW'•6VÆV7F÷$ÆÂ‚%¶FF×Væ—B×F%Ò"’æf÷$V6‚‚†'Fâ’Óâ°Ğ¢6öç7B7F—fRÒ'FâÓÓÒF#°Ğ¢'Fâæ6Æ74Æ—7BçFövvÆR‚&—2Ö7F—fR"Â7F—fR“°Ğ¢'Fâç6WDGG&–'WFR‚&&–×6VÆV7FVB"Â7F—fRò'G'VR"¢&fÇ6R"“°Ğ¢Ò“°Ğ¢6†VÆÂçVW'•6VÆV7F÷$ÆÂ‚%¶FF×Væ—B×vUÒ"’æf÷$V6‚‚‡vR’Óâ°Ğ¢vRæ6Æ74Æ—7BçFövvÆR‚&—2Ö7F—fR"ÂvRævWDGG&–'WFR‚&FF×Væ—B×vR"’ÓÓÒ–B“°Ğ¢Ò“°Ğ¢Ò“°Ğ¢ĞĞ Ğ¢–b‡&W7VÇBbb&W7VÇBæFF6WBçG&6¶–æt6†ö–6W4&÷VæB’°Ğ¢&W7VÇBæFF6WBçG&6¶–æt6†ö–6W4&÷VæBÒ##°Ğ¢&W7VÇBæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â†WfVçB’Óâ°Ğ¢6öç7B6†ö–6RÒWfVçBçF&vWBæ6Æ÷6W7B‚%¶FF×G&6¶–ærÖ6†ö–6UÒ"“°Ğ¢–b‚6†ö–6R’&WGW&ã°Ğ¢6öç7B–æFW‚ÒçVÖ&W"†6†ö–6RævWDGG&–'WFR‚&FF×G&6¶–ærÖ6†ö–6R"’“°Ğ¢6öç7B¦ö'2Ò&ö÷Bç7FFRçG&6¶–æræFFòæ¦ö'3°Ğ¢6öç7B&VfW&Væ6RÒ'&’æ—4'&’†¦ö'2’ò¦ö'5¶–æFW…Óòç6VÆV7F–öå÷&Vb¢"#°Ğ¢–b‡&VfW&Væ6R’÷Vå6VÆV7F–öâ†6öçF–æW"Â&VfW&Væ6R“°Ğ¢Ò“°Ğ¢ĞĞ Ğ¢6öç7B&Vg&W6‚Ò6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ7F–öãÒwG&6²×&Vg&W6‚uÒ"“°Ğ¢–b‡&Vg&W6‚’&Vg&W6‚æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ&VÆöD7W'&VçB†6öçF–æW"’Â²öæ6S¢G'VRÒ“°Ğ Ğ¢6öç7B&WG'’Ò6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ7F–öãÒwG&6²×&WG'’uÒ"“°Ğ¢–b‡&WG'’’&WG'’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ&VÆöD7W'&VçB†6öçF–æW"’Â²öæ6S¢G'VRÒ“°Ğ Ğ¢6öç7B6÷”6öFRÒ6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ7F–öãÒv6÷’×G&6¶–ærÖ6öFRuÒ"“°Ğ¢–b†6÷”6öFR’°Ğ¢6÷”6öFRæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â7–æ2‚’Óâ°Ğ¢6öç7B6öFRÒ6÷”6öFRævWDGG&–'WFR‚&FFÖ6öFR"’ÇÂ"#°Ğ¢G'’°Ğ¢v—Bæf–vF÷"æ6Æ—&ö&Bçw&—FUFW‡B†6öFR“°Ğ¢6÷”6öFRçFW‡D6öçFVçBÒ.ˆN‹‰NŠ^ŠŞˆ˜Š^˜Šr#°Ğ¢Ò6F6‚…ò’°Ğ¢6÷”6öFRçFW‡D6öçFVçBÒ6öFS°Ğ¢ĞĞ¢Ò“°Ğ¢ĞĞ Ğ¢òòR×6Æ—÷Vç2v—F‚U$Â'V–ÇBg&öÒ7FFRB6Æ–6²F–ÖR‡F†RFö¶VâÂ–bç’ÀĞ¢òòG&fVÇ2öæÇ’–âF†B&WVW7BU$Â(	BæWfW"&VæFW&VB–çFòF†RDôÒ’àĞ¢6öç7BW6Æ—'FâÒ6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ7F–öãÒv÷VâÖW6Æ—uÒ"“°Ğ¢–b†W6Æ—'Fâ’°Ğ¢W6Æ—'FâæFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’Óâ°Ğ¢6öç7BW&ÂÒ&V6V—EW&Â‡&ö÷Bç7FFRçG&6¶–æræFFÇÂ·Ò“°Ğ¢–b‡W&Â’v–æF÷ræ÷Vâ‡W&ÂÂ%ö&Ææ²"Â&æö÷VæW""“°Ğ¢Ò“°Ğ¢ĞĞ Ğ¢6öç7Bf÷&ÒÒ6öçF–æW"çVW'•6VÆV7F÷"‚%¶FF×&Wf–WrÖf÷&ÕÒ"“°Ğ¢–b†f÷&Ò’°Ğ¢f÷&ÒæFDWfVçDÆ—7FVæW"‚'7V&Ö—B"Â7–æ2†WfVçB’Óâ°Ğ¢WfVçBç&WfVçDFVfVÇB‚“°Ğ¢6öç7B7FGW2Òf÷&ÒçVW'•6VÆV7F÷"‚%¶FF×&Wf–Wr×7FGW5Ò"“°Ğ¢6öç7B7V&Ö—BÒf÷&ÒçVW'•6VÆV7F÷"‚&'WGFöå·G—SÒw7V&Ö—BuÒ"“°Ğ¢6öç7B–ÆöBÒö&¦V7Bæg&öÔVçG&–W2†æWrf÷&ÔFF†f÷&Ò’æVçG&–W2‚’“°Ğ¢òòF†R7&VFVçF–Â—2–æ¦V7FVBg&öÒ–âÖÖVÖ÷'’7FFRÂæWfW"&VBg&öÒ÷ Ğ¢òò&VæFW&VB–çFòF†RDôÒàĞ¢6öç7BG&6¶–ætFFÒ&ö÷Bç7FFRçG&6¶–æræFFÇÂ·Ó°Ğ¢6öç7BFö¶VâÒ6åW6UFö¶Vä7F–öç2‡G&6¶–ætFF’ò6ÆVâ‡G&6¶–ætFFæ&öö¶–æu÷Fö¶Vâ’¢"#°Ğ¢6öç7B6VÆV7F–öå&VfW&Væ6RÒ6ÆVâ‡G&6¶–ætFFç6VÆV7F–öå÷&Vb“°Ğ¢–b‡Fö¶Vâ’–ÆöBæ&öö¶–æu÷Fö¶VâÒFö¶Vã°Ğ¢VÇ6R–b‡6VÆV7F–öå&VfW&Væ6R’–ÆöBç6VÆV7F–öå÷&VbÒ6VÆV7F–öå&VfW&Væ6S°Ğ¢–ÆöBç&F–ærÒçVÖ&W"‡–ÆöBç&F–ærÇÂR“°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ.ˆ‹>Š^‹ˆ~Š®˜ˆ~Š>‹^Š~‹NŠrâââ#°Ğ¢–b‡7V&Ö—B’7V&Ö—BæF—6&ÆVBÒG'VS°Ğ¢f÷&Òç6WDGG&–'WFR‚&&–Ö'W7’"Â'G'VR"“°Ğ¢G'’°Ğ¢6öç7B&W7öç6RÒv—BfWF6‚†G·&ö÷Bæ’ævWD”&6R‚—Ò÷V&Æ–2÷&Wf–WvÂ°Ğ¢ÖWF†öC¢%õ5B"ÀĞ¢†VFW'3¢²$6öçFVçBÕG—R#¢&Æ–6F–öâö§6öâ"ÒÀĞ¢66†S¢&æò×7F÷&R"ÀĞ¢&VfW'&W%öÆ–7“¢&æò×&VfW'&W""ÀĞ¢&öG“¢¥4ôâç7G&–æv–g’‡–ÆöB’ÀĞ¢Ò“°Ğ¢6öç7BFFÒv—B&W7öç6Ræ§6öâ‚’æ6F6‚‚‚’Óâ‡·Ò’“°Ğ¢–b‚&W7öç6Ræö²’°Ğ¢6öç7B&WVW7DW'&÷"ÒæWrW'&÷"‚'&Wf–Wr&WVW7Bf–ÆVB"“°Ğ¢&WVW7DW'&÷"ç7FGW2Ò&W7öç6Rç7FGW3°Ğ¢&WVW7DW'&÷"æFFÒ²6öFS¢FFbbFFæ6öFRÓ°Ğ¢F‡&÷r&WVW7DW'&÷#°Ğ¢ĞĞ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ.Š®˜ˆ~Š>‹^Š~‹NŠ~˜Š>‹^Š.‰®Š>˜ŠŞŠ"ˆ.ŠŞ‰®ˆN‹‰>ˆNŠ>‹‰¢#°Ğ¢6WEF–ÖV÷WB‚‚’Óâ&VÆöD7W'&VçB†6öçF–æW"’ÂS“°Ğ¢Ò6F6‚†W'&÷"’°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ&ö÷Bæ7W7FöÖW$6÷’æ&öö¶–ætW'&÷"†W'&÷"“°Ğ¢–b‡7V&Ö—B’7V&Ö—BæF—6&ÆVBÒfÇ6S°Ğ¢f÷&Òç&VÖ÷fTGG&–'WFR‚&&–Ö'W7’"“°Ğ¢ĞĞ¢Ò“°Ğ¢ĞĞ Ğ¢6öç7B6FÆötf÷&ÒÒ6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ6FÆör×&Wf–WrÖf÷&ÕÒ"“°Ğ¢–b†6FÆötf÷&Ò’°Ğ¢6FÆötf÷&ÒæFDWfVçDÆ—7FVæW"‚'7V&Ö—B"Â7–æ2†WfVçB’Óâ°Ğ¢WfVçBç&WfVçDFVfVÇB‚“°Ğ¢6öç7B7FGW2Ò6FÆötf÷&ÒçVW'•6VÆV7F÷"‚%¶FFÖ6FÆör×&Wf–Wr×7FGW5Ò"“°Ğ¢6öç7B7V&Ö—BÒ6FÆötf÷&ÒçVW'•6VÆV7F÷"‚&'WGFöå·G—SÒw7V&Ö—BuÒ"“°Ğ¢6öç7Bf÷&ÔFFÒö&¦V7Bæg&öÔVçG&–W2†æWrf÷&ÔFF†6FÆötf÷&Ò’æVçG&–W2‚’“°Ğ¢òò7&VFVçF–Âg&öÒ7FFRÂæ÷BF†RDôÒàĞ¢6öç7BBÒ&ö÷Bç7FFRçG&6¶–æræFFÇÂ·Ó°Ğ¢–b‚6åW6UFö¶Vä7F–öç2†B’ÇÂBæ&öö¶–æu÷Fö¶Vâ’°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ.Š®‹N‰~‰‹N˜ÎŠ>‹^Š~‹NŠ~Š¾Š‰NŠŞ‹.Š.‹‚ˆŠ>‹‰>‹.˜‰¾‹N‰NŠ^‹Nˆ~ˆ˜Î‰^‹N‰N‰^‹.Šˆ~‹.‰ŠŞ‹^ˆˆNŠ>‹˜ˆr#°Ğ¢&WGW&ã°Ğ¢ĞĞ¢6öç7BFö¶VâÒBæ&öö¶–æu÷Fö¶Vã°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ.ˆ‹>Š^‹ˆ~Š®˜ˆ~Š>‹^Š~‹NŠrâââ#°Ğ¢–b‡7V&Ö—B’7V&Ö—BæF—6&ÆVBÒG'VS°Ğ¢6FÆötf÷&Òç6WDGG&–'WFR‚&&–Ö'W7’"Â'G'VR"“°Ğ¢G'’°Ğ¢v—B&ö÷Bæ’ç7V&Ö—EG&6¶–æu&Wf–Wr‡Fö¶VâÂ°Ğ¢&F–æs¢çVÖ&W"†f÷&ÔFFç&F–ærÇÂR’ÀĞ¢6öÖÖVçC¢f÷&ÔFFæ6öÖÖVçBÇÂ""ÀĞ¢Ò“°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ.Š®˜ˆ~Š>‹^Š~‹NŠ~˜Š^˜ŠrŠ>ŠŞ˜ŠŞ‰NŠ‹N‰‰^Š>Š~ˆŠ®ŠŞ‰¢#°Ğ¢6WEF–ÖV÷WB‚‚’Óâ&VÆöD7W'&VçB†6öçF–æW"’ÂS“°Ğ¢Ò6F6‚†W'&÷"’°Ğ¢–b‡7FGW2’7FGW2çFW‡D6öçFVçBÒ&ö÷Bæ7W7FöÖW$6÷’æ&öö¶–ætW'&÷"†W'&÷"“°Ğ¢–b‡7V&Ö—B’7V&Ö—BæF—6&ÆVBÒfÇ6S°Ğ¢6FÆötf÷&Òç&VÖ÷fTGG&–'WFR‚&&–Ö'W7’"“°Ğ¢ĞĞ¢Ò“°Ğ¢ĞĞ¢ĞĞ Ğ¢&ö÷BçG&6¶–ærÒ°Ğ¢&VæFW"†6öçF–æW"’°Ğ¢6öç7B6öFRÒ&ö÷Bç7FFRæG&gBçG&6¶–ærçG&6¶–æt6öFRÇÂ"#°Ğ¢6öçF–æW"æ–ææW$…DÔÂÒ Ğ¢Ç6V7F–öâ6Æ73Ò'67&VVâ#àĞ¢G·&ö÷BçV“òçvT†VFW$‡FÖÂò&ö÷BçV’çvT†VFW$‡FÖÂ‚'G&6¶–ær"’¢"'ĞĞ¢ÆF—b6Æ73Ò&†W&òG&6¶–ærÖ†W&ò#àĞ¢ÆF—b6Æ73Ò&†W&òÖ&FvR#î‰^‹N‰N‰^‹.Šˆ~‹.‰’5tcÂöF—càĞ¢Æƒî‰^‹N‰N‰^‹.ŠŠ®‰n‹.‰‹ˆ~‹.‰“ÂöƒàĞ¢Çî‰N‹Š®‰n‹.‰‹‰‹‰NŠ¾Š‹.Š"˜Š^‹Š>‹.Š.Š^‹˜ŠŞ‹^Š.‰Nˆ~‹.‰Š^˜‹.Š®‹‰N˜N‰N˜ˆ‹.ˆ˜Š^ˆ.‰^‹N‰N‰^‹.Šˆ.ŠŞˆ~ˆN‹‰3Â÷àĞ¢ÂöF—càĞ¢Ç6V7F–öâ6Æ73Ò&6&BÆöö·WÖ6&B"&–ÖÆ&VÆÆVF'“Ò'G&6¶–ær×6V&6‚×F—FÆR#àĞ¢Æƒ"–CÒ'G&6¶–ær×6V&6‚×F—FÆR"6Æ73Ò'G&6¶–ær×6V&6‚×F—FÆR#îˆN˜‰Š¾‹.ˆ~‹.‰“Âöƒ#àĞ¢ÆF—b6Æ73Ò&f–VÆB#àĞ¢ÆÆ&VÂf÷#Ò'G&6¶–ærÖ6öFR#î˜‰®ŠŞŠ>˜Î˜.‰~Š2Š¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆsÂöÆ&VÃàĞ¢Æ–çWB–CÒ'G&6¶–ærÖ6öFR"6Æ73Ò&–çWBG&6¶–ærÖ6öFRÖ–çWB"Æ6V†öÆFW#Ò.ˆŠ>ŠŞˆ˜‰®ŠŞŠ>˜Î˜.‰~Š>Š¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆr"fÇVSÒ"G¶W62†6öFR—Ò Ğ¢–çWFÖöFSÒ'FW‡B"WFö6ö×ÆWFSÒ&öfb"WFö6—FÆ—¦SÒ&6†&7FW'2"7VÆÆ6†V6³Ò&fÇ6R"Ö†ÆVæwFƒÒ#3"#àĞ¢Ç7â6Æ73Ò&f–VÆBÖ†VÇ#îˆN˜‰Š¾‹.‰N˜Š~Š.˜‰®ŠŞŠ>˜Î‰~‹^˜˜>ˆ®˜ˆŠŞˆrŠ¾Š>‹~ŠŞŠ>Š¾‹Š®ˆ‹.Š>ˆŠŞˆ~ˆ‹.ˆ5tcÂ÷7ãàĞ¢ÂöF—càĞ¢ÆF—b6Æ73Ò&'WGFöâ×&÷r#àĞ¢Æ'WGFöâ6Æ73Ò'&–Ö'’Ö'FâG&6¶–ær×6V&6‚Ö'Fâ"G—SÒ&'WGFöâ"FFÖ7F–öãÒ'G&6²×&VB#îˆN˜‰Š¾‹.ˆ~‹.‰“Âö'WGFöãàĞ¢ÂöF—càĞ¢Â÷6V7F–öãàĞ¢Ç6V7F–öâ6Æ73Ò&6&BG&6¶–ær×&W7VÇB×6†VÆÂ"&–ÖÆ—fSÒ'öÆ—FR#àĞ¢ÆF—bFF×G&6¶–ær×&W7VÇCâG·&VæFW%G&6¶–æu&W7VÇB‚—ÓÂöF—càĞ¢Â÷6V7F–öãàĞ¢Â÷6V7F–öãàĞ¢°Ğ¢&ö÷BçV“òæ&–æEvT†VFW#òâ†6öçF–æW"“°Ğ¢6öçF–æW"çVW'•6VÆV7F÷"‚%¶FFÖ7F–öãÒwG&6²×&VBuÒ"’æFDWfVçDÆ—7FVæW"‚&6Æ–6²"Â‚’ÓâÆöö·W†6öçF–æW"’“°Ğ¢6öçF–æW"çVW'•6VÆV7F÷"‚"7G&6¶–ærÖ6öFR"’æFDWfVçDÆ—7FVæW"‚&–çWB"Â†WfVçB’Óâ°Ğ¢6öç7BfÇVRÒ7G&–ær†WfVçBçF&vWBçfÇVRÇÂ""’çG&–Õ7F'B‚’çFõWW$66R‚“°Ğ¢WfVçBçF&vWBçfÇVRÒfÇVS°Ğ¢&ö÷Bç7FFRçWFFTG&gB‚'G&6¶–ær"Â²G&6¶–æt6öFS¢fÇVRÒ“°Ğ¢Ò“°Ğ¢6öçF–æW"çVW'•6VÆV7F÷"‚"7G&6¶–ærÖ6öFR"’æFDWfVçDÆ—7FVæW"‚&¶W–F÷vâ"Â†WfVçB’Óâ°Ğ¢–b†WfVçBæ¶W’ÓÓÒ$VçFW""’°Ğ¢WfVçBç&WfVçDFVfVÇB‚“°Ğ¢Æöö·W†6öçF–æW"“°Ğ¢ĞĞ¢Ò“°Ğ¢&–æE&W7VÇD7F–öç2†6öçF–æW"“°Ğ¢–b‡VæF–ætWFôÆöö·Wbb7F—fT7&VFVçF–Âbb&ö÷Bç7FFRçG&6¶–ærç7FGW2ÓÓÒ&–FÆR"’°Ğ¢òòFVWÖÆ–æ²ƒ÷Òó÷Fö¶VãÒ“¢'VâF†Rf—'7BÆöö·Wv—F‚F†R$•dDPĞ¢òò7&VFVçF–Â(	B—B—2æWfW"Æ6VB–âF†Rf—6–&ÆR–çWB&÷fRàĞ¢VæF–ætWFôÆöö·WÒfÇ6S°Ğ¢6WEF–ÖV÷WB‚‚’ÓâÆöö·W†6öçF–æW"Â²7&VFVçF–Ã¢7F—fT7&VFVçF–ÂÒ’Â“°Ğ¢ÒVÇ6R–b†6öFRbb&ö÷Bç7FFRçG&6¶–ærç7FGW2ÓÓÒ&–FÆR"’°Ğ¢6WEF–ÖV÷WB‚‚’ÓâÆöö·W†6öçF–æW"’Â“°Ğ¢ĞĞ¢ÒÀĞ¢òò6ÆÆVB'’F†R&ö÷G7G&v—F‚÷Òó÷Fö¶VãÒFVWÖÆ–æ²fÇVRâF†PĞ¢òò7&VFVçF–Â—2†VÆB&—fFVÇ’æB6öç7VÖVB'’F†Rf—'7B&VæFW"w0Ğ¢òòWFòÖÆöö·W²—B—2äUdU"w&—GFVâFòF†RG&gB÷"F†Rf—6–&ÆR–çWBàĞ¢6WD–æ—F–Ä7&VFVçF–Â‡fÇVR’°Ğ¢6öç7B7&VBÒ7G&–ær‡fÇVRÓÒçVÆÂò""¢fÇVR’çG&–Ò‚“°Ğ¢–b‚7&VB’&WGW&ã°Ğ¢6WD7F—fT7&VFVçF–Â†7&VB“°Ğ¢VæF–ætWFôÆöö·WÒG'VS°Ğ¢ÒÀĞ¢÷FW7C¢°Ğ¢6åf–WtFWF–Ç2ÀĞ¢6åW6UFö¶Vä7F–öç2ÀĞ¢—46æ6VÆVBÀĞ¢¦ö%†6RÀĞ¢–ÖVçE7FGW4Æ&VÂÀĞ¢&V6V—EW&ÂÀĞ¢&VæFW%&Wf–WrÀĞ¢&VæFW$6FÆöu&Wf–WrÀĞ¢&Wf–Wtf÷&Ô¶–æBÀĞ¢&VæFW$gFW&6&RÀĞ¢&VæFW%77÷'BÀĞ¢&VæFW%Væ—E77÷'D6&G2ÀĞ¢&VæFW%G&6¶–æu&W7VÇBÀĞ¢&VæFW%F–ÖVÆ–æRÀĞ¢&–æE&W7VÇD7F–öç2ÀĞ¢6ÆVæÆ–æW75&V6öÖÖVæFF–öâÀĞ¢&VæFW$6ÆVæÆ–æW74†–v†Æ–v‡BÀĞ¢æW‡E6W'f–6TwV–Fæ6RÀĞ¢&VæFW$æW‡E6W'f–6TwV–Fæ6RÀĞ¢6W'f–6U&öf–ÆRÀĞ¢7G'V7GW&VDÖV7W&VÖVçG2ÀĞ¢Væ—D–ç7V7F–öâÀĞ¢ÒÀĞ¢Ó°Ğ§Ò’‚“°Ğ