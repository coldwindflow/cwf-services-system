(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_PHONE = "098-877-7321";
  const LINE_URL = "https://lin.ee/fG1Oq7y";
  const WARRANTY_COPY = "รับประกันงานล้าง 30 วัน เฉพาะอาการที่เกี่ยวข้องกับการบริการ ไม่รวมอะไหล่เสีย ระบบรั่ว บอร์ด คอมเพรสเซอร์ ไฟตก หรือปัญหาจากตัวเครื่องเดิม";

  // Private, in-memory lookup credential for a long booking_token from a
  // ?q=/?token= deep link. Customer-typed phone/code lookups receive a separate
  // short-lived selection reference in tracking state.
  // It is NEVER written into the draft, the visible input, or rendered HTML.
  // Refresh and post-review reloads reuse THIS value so a token session is not
  // silently downgraded to code-only access. A manual "ตรวจสอบสถานะ" replaces it
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
    return `${n.toLocaleString("th-TH")} บาท`;
  }

  function serviceSummary(data) {
    return [data.job_type, data.service_summary, data.items_text].map(clean).filter(Boolean)[0] || "บริการ CWF";
  }

  function imageUrl(src) {
    const value = clean(src);
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return value.startsWith("/") ? value : `/${value}`;
  }

  function isDone(data) {
    const status = clean(data.job_status);
    return !!(clean(data.finished_at) || status.includes("เสร็จ"));
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
  // never be interpreted as "no technician assigned" — hidden identity is not
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
    return status.includes("ยกเลิก") || ["cancel", "canceled", "cancelled"].includes(status);
  }

  function paymentStatusLabel(value, paidAt) {
    const status = clean(value).toLowerCase();
    if (status === "paid" || (!status && clean(paidAt))) return "ชำระแล้ว";
    if (status === "unpaid") return "ยังไม่ชำระ";
    if (status === "partial") return "ชำระบางส่วน";
    if (["pending", "pending_payment", "payment_processing"].includes(status)) return "รอตรวจสอบการชำระ";
    if (["failed", "payment_failed"].includes(status)) return "การชำระไม่สำเร็จ";
    return status ? "กรุณาติดต่อ CWF เพื่อตรวจสอบการชำระ" : "ยังไม่มีข้อมูลการชำระ";
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
        <strong>โหมดจำกัดข้อมูล (ค้นด้วยรหัสการจอง)</strong>
        <p class="muted">เพื่อความปลอดภัย การค้นด้วยรหัสการจองจะแสดงเฉพาะสถานะและข้อมูลเบื้องต้น ข้อมูลทีมช่างจะแสดงเมื่อเปิดจากลิงก์ติดตามงานที่ได้รับในข้อความยืนยัน</p>
      </div>`;
  }

  // Code-only status copy is derived ONLY from reliable, allow-listed timestamps
  // (travel/checkin/started/finished) plus job_status "done" — never from
  // technician presence, so a redacted technician cannot flip these to a
  // "waiting for a technician" message.
  function limitedStatusCopy(data) {
    if (isDone(data)) return "งานเสร็จแล้ว";
    if (clean(data.started_at)) return "กำลังให้บริการ";
    if (clean(data.checkin_at)) return "ช่างถึงหน้างานแล้ว";
    if (clean(data.travel_started_at)) return "ช่างกำลังเดินทาง";
    return "กำลังติดตามสถานะงาน";
  }
  function limitedStatusDetail(data) {
    if (isDone(data)) return "งานบริการเสร็จสิ้นแล้ว";
    if (clean(data.started_at)) return "ทีมช่างกำลังให้บริการ";
    if (clean(data.checkin_at)) return "ทีมช่างถึงหน้างานแล้ว";
    if (clean(data.travel_started_at)) return "ช่างกำลังเดินทางไปยังสถานที่นัดหมาย";
    return "ข้อมูลทีมช่างและรายละเอียดเต็มจะแสดงเมื่อเปิดจากลิงก์ติดตามงานในข้อความยืนยัน";
  }
  function limitedNextAction(data) {
    if (isDone(data)) return "ดูเอกสารและการรับประกันได้จากลิงก์ติดตามงานในข้อความยืนยัน";
    return "เปิดจากลิงก์ติดตามงานในข้อความยืนยันเพื่อดูข้อมูลทีมช่างและรายละเอียดเต็ม";
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
    // (?key=...) — a bare job_id link would just 404. Only build the fallback
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
          if (typeof item === "string") return { url: imageUrl(item), label: "รูปงาน" };
          return { url: imageUrl(item.public_url || item.url || item.photo_url || item.path), label: item.phase || item.label || "รูปงาน" };
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
    if (days === 0) return "วันนี้";
    if (days < 30) return `${days} วัน`;
    const months = Math.max(1, Math.floor(days / 30));
    return `ประมาณ ${months} เดือน`;
  }

  function approximateFutureText(days) {
    if (!Number.isFinite(days) || days <= 0) return "ถึงรอบแนะนำแล้ว";
    if (days < 60) return `${Math.ceil(days)} วัน`;
    return `ประมาณ ${Math.max(1, Math.round(days / 30))} เดือน`;
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
    if (/full|heavy|disassembly|overhaul|ถอด|ตัดล้างใหญ่|ล้างใหญ่/.test(text)) {
      return { kind: "heavy", label: "ตัดล้างใหญ่", coilMonths: 10, nextText: "8-12 เดือน" };
    }
    if (/hang|deep|แขวนคอยล์|ล้างลึก|deep clean/.test(text)) {
      return { kind: "deep", label: "แขวนคอยล์ / ล้างลึก", coilMonths: 7, nextText: "6-8 เดือน" };
    }
    if (/premium|พรีเมียม/.test(text)) {
      return { kind: "premium", label: "ล้างพรีเมียม", coilMonths: 6, nextText: "5-6 เดือน" };
    }
    if (/ล้าง|clean|wash/.test(text)) {
      return { kind: "clean", label: "ล้างปกติ", coilMonths: 5, nextText: "4-6 เดือน" };
    }
    return { kind: "general", label: serviceSummary(data), coilMonths: 6, nextText: "ประมาณ 6 เดือน" };
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
    const cycleText = clean(profile && profile.nextText) || `ประมาณ ${Math.max(1, Math.round(cycleDays / 30.4375))} เดือน`;
    const elapsedDays = daysSince(date, nowMs);
    if (elapsedDays == null) {
      return {
        tone: "unknown",
        status: "ยังประเมินรอบล้างไม่ได้",
        score: null,
        cycleDays,
        excellentMaxDays,
        goodMaxDays,
        cycleText,
        elapsedDays: null,
        elapsedText: "ยังไม่มีวันที่จบงานนี้",
        serviceDateText: "-",
        recommendation: "ยังไม่มีวันที่จบงานนี้สำหรับคำนวณรอบถัดไป",
        nextText: "ติดตามสภาพการใช้งานและติดต่อ CWF หากต้องการตรวจสอบ",
      };
    }

    let result;
    if (elapsedDays <= excellentMaxDays) {
      result = {
        tone: "excellent",
        status: "สะอาดมาก",
        recommendation: "เพิ่งล้างไม่นาน ยังอยู่ในสภาพพร้อมใช้งาน",
        nextText: `รอบบริการนี้แนะนำประมาณ ${cycleText} · ติดตามสภาพอีกครั้งในอีก ${approximateFutureText(goodMaxDays - elapsedDays)}`,
      };
    } else if (elapsedDays <= goodMaxDays) {
      result = {
        tone: "good",
        status: "ยังอยู่ในสภาพดี",
        recommendation: "ยังใช้งานได้ดี แนะนำติดตามสภาพและล้างตามรอบ",
        nextText: `รอบบริการนี้แนะนำประมาณ ${cycleText} · วางแผนรอบล้างในอีก ${approximateFutureText(cycleDays - elapsedDays)}`,
      };
    } else if (elapsedDays <= cycleDays) {
      result = {
        tone: "watch",
        status: "ใกล้ถึงรอบล้าง",
        recommendation: "เริ่มเข้าใกล้รอบล้าง แนะนำวางแผนล้างครั้งถัดไป",
        nextText: elapsedDays === cycleDays
          ? `รอบบริการนี้แนะนำประมาณ ${cycleText} · ถึงรอบล้างที่แนะนำแล้ว`
          : `รอบบริการนี้แนะนำประมาณ ${cycleText} · เหลืออีก ${approximateFutureText(cycleDays - elapsedDays)} ถึงรอบล้างที่แนะนำ`,
      };
    } else {
      result = {
        tone: "due",
        status: "ควรล้าง",
        recommendation: "ผ่านมาค่อนข้างนาน แนะนำล้างเพื่อคงประสิทธิภาพและความสะอาด",
        nextText: `รอบบริการนี้แนะนำประมาณ ${cycleText} · เกินรอบแนะนำมาแล้ว ${elapsedCleaningText(elapsedDays - cycleDays)}`,
      };
    }

    // Time remains authoritative: a high score cannot hide an overdue service.
    // A low estimate can raise a pre-cycle result to watch, but only elapsed
    // time beyond the profile cycle can mark the service as due.
    if (score != null && elapsedDays <= excellentMaxDays && score < 45) {
      result = {
        tone: "watch",
        status: "ควรติดตามสภาพ",
        recommendation: "เพิ่งล้างไม่นาน แต่คะแนนประเมินต่ำกว่าปกติ",
        nextText: `รอบบริการนี้แนะนำประมาณ ${cycleText} · หากความเย็นหรือแรงลมลดลง ติดต่อ CWF เพื่อตรวจสอบ`,
      };
    } else if (score != null && elapsedDays <= cycleDays && score < 70 && (result.tone === "excellent" || result.tone === "good")) {
      result = {
        tone: "watch",
        status: "ใกล้ถึงรอบล้าง",
        recommendation: "สภาพโดยประมาณเริ่มลดลง แนะนำติดตามและวางแผนรอบล้าง",
        nextText: `รอบบริการนี้แนะนำประมาณ ${cycleText} · วางแผนรอบล้างในอีก ${approximateFutureText(cycleDays - elapsedDays)}`,
      };
    }

    return {
      ...result,
      score,
      cycleDays,
      excellentMaxDays,
      goodMaxDays,
      cycleText,
      elapsedDays,
      elapsedText: `ผ่านมาแล้ว ${elapsedCleaningText(elapsedDays)}`,
      serviceDateText: formatCleaningDate(date),
    };
  }

  function hasDrainRisk(data) {
    const text = clean([data.job_type, data.technician_note, data.customer_note, data.job_status].filter(Boolean).join(" "));
    return /น้ำหยด|ท่อตัน|ถาดตัน|น้ำทิ้ง|ระบายช้า/i.test(text);
  }

  function warrantyInfo(data, date) {
    const profile = serviceProfile(data);
    const isCleaning = profile.kind !== "general" || /ล้าง|clean|wash/i.test(clean(data.job_type));
    if (!isDone(data) || !date || !isCleaning) return null;
    const end = new Date(date.getTime());
    end.setDate(end.getDate() + 30);
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
    return {
      end,
      daysLeft: Math.max(0, days),
      active: days >= 0,
    };
  }

  function recommendation(data, coil, drain, profile, done) {
    if (!done) {
      return {
        title: "ครั้งต่อไปแนะนำ: จะแสดงคำแนะนำหลังงานเสร็จสิ้น",
        reason: "ระบบจะประเมินจากวันที่ปิดงาน ประเภทบริการ และหมายเหตุจากช่างเมื่อมีข้อมูลจริง",
      };
    }
    if (hasDrainRisk(data) || (drain != null && drain < 45)) {
      return {
        title: "ครั้งต่อไปแนะนำ: ตรวจเช็คระบบ",
        reason: "ควรตรวจระบบน้ำทิ้งเร็วกว่าปกติจากประวัติงานและรอบเวลาหลังบริการ",
      };
    }
    if (coil != null && coil < 30) {
      return {
        title: profile.kind === "heavy" ? "ครั้งต่อไปแนะนำ: ตัดล้างใหญ่" : "ครั้งต่อไปแนะนำ: แขวนคอยล์",
        reason: "คะแนนความสะอาดโดยประมาณต่ำกว่ารอบดูแลที่แนะนำ",
      };
    }
    if (profile.kind === "premium" || profile.kind === "deep" || profile.kind === "heavy") {
      return {
        title: `ครั้งต่อไปแนะนำ: ${profile.label} ใน ${profile.nextText}`,
        reason: "งานล่าสุดเป็นแพ็กเกจดูแลละเอียด จึงใช้รอบแนะนำที่ยาวกว่างานล้างปกติ",
      };
    }
    return {
      title: `ครั้งต่อไปแนะนำ: ${profile.kind === "clean" ? "ล้างปกติ" : "ล้างพรีเมียม"} ใน ${profile.nextText}`,
      reason: "ประเมินจากประเภทบริการล่าสุดและเวลาหลังจบงาน",
    };
  }

  function phaseCount(photos, phase) {
    return photos.filter((photo) => clean(photo.phase || photo.label).toLowerCase() === phase).length;
  }

  function unitList(data) {
    return Array.isArray(data.units)
      ? data.units.map((unit) => ({
          unit_id: unit.unit_id,
          unit_no: unit.unit_no,
          unit_code: clean(unit.unit_code),
          label: clean(unit.label) || `เครื่องที่ ${unit.unit_no || "-"}`,
          btu: clean(unit.btu),
          ac_type: clean(unit.ac_type),
          service_type: clean(unit.service_type),
          checklist_summary: unit.checklist_summary || {},
          measurements: unit.measurements && typeof unit.measurements === "object" ? unit.measurements : {},
          photos: Array.isArray(unit.photos)
            ? unit.photos.map((photo) => ({
                url: imageUrl(photo.public_url || photo.url || photo.photo_url || photo.path),
                phase: clean(photo.phase),
                photo_category: clean(photo.photo_category),
              })).filter((photo) => photo.url)
            : [],
        })).filter((unit) => unit.unit_id || unit.unit_no || unit.photos.length)
      : [];
  }

  const UNIT_METRIC_COPY = Object.freeze({
    refrigerant: { label: "ระบบน้ำยา", normal: "ตรวจสอบและทดสอบระบบแล้ว", issue: "พบรายการที่ควรตรวจระบบเพิ่มเติม" },
    cooling: { label: "ความเย็น", normal: "ทดสอบการทำความเย็นแล้ว", issue: "พบรายการที่ควรตรวจความเย็นเพิ่มเติม" },
    airflow: { label: "แรงลม", normal: "ทดสอบแรงลมหลังบริการแล้ว", issue: "พบรายการที่ควรตรวจแรงลมเพิ่มเติม" },
    drain: { label: "ระบบน้ำทิ้ง", normal: "ตรวจสอบการระบายน้ำแล้ว", issue: "พบรายการที่ควรตรวจการระบายน้ำเพิ่มเติม" },
  });

  function unitInspection(data, unit) {
    const summary = unit.checklist_summary || {};
    const rawStatuses = summary.metric_statuses && typeof summary.metric_statuses === "object" ? summary.metric_statuses : {};
    const metrics = Object.entries(UNIT_METRIC_COPY).map(([key, copy]) => {
      const status = rawStatuses[key] === "normal" || rawStatuses[key] === "issue" ? rawStatuses[key] : null;
      return status ? {
        key,
        status,
        tone: status === "normal" ? "good" : status === "issue" ? "issue" : "unknown",
        label: copy.label,
        detail: copy[status],
      } : null;
    }).filter(Boolean);
    const postIssueCount = Number(summary.post_issue_count || 0);
    const issues = metrics.filter((metric) => metric.status === "issue").length;
    const normal = metrics.filter((metric) => metric.status === "normal").length;
    const hasMetricData = issues + normal > 0;
    let overall = { tone: "unknown", label: isDone(data) ? "ไม่มีข้อมูลแสดง" : "กำลังตรวจสอบ", detail: isDone(data) ? "ไม่มีข้อมูลแสดงในรายงานส่วนนี้" : "ผลตรวจจะแสดงหลังบริการ" };
    if (issues) overall = { tone: "issue", label: "ควรตรวจเพิ่มเติม", detail: `พบ ${postIssueCount || issues} รายการที่ควรติดตาม` };
    else if (normal === Object.keys(UNIT_METRIC_COPY).length) overall = { tone: "good", label: "ปกติ", detail: "เครื่องอยู่ในสภาพพร้อมใช้งาน แนะนำล้างรอบถัดไปตามกำหนด" };
    else if (normal) overall = { tone: "watch", label: "มีผลตรวจบางส่วน", detail: "แสดงเฉพาะรายการที่มีข้อมูลยืนยัน" };
    return { metrics, overall, postIssueCount, summary, hasMetricData };
  }

  function metricStatusCard(metric) {
    return `
      <div class="unit-inspection-item is-${metric.tone}" data-metric="${esc(metric.key)}" data-health-reveal>
        <span class="unit-inspection-icon" aria-hidden="true"></span>
        <div>
          <b>${esc(metric.label)}</b>
          <strong>${metric.status === "normal" ? "ปกติ" : "ควรตรวจเพิ่มเติม"}</strong>
          <small>${esc(metric.detail)}</small>
        </div>
      </div>
    `;
  }

  function trackingAcType(unit) {
    const value = clean(unit && unit.ac_type).toLowerCase();
    if (/ผนัง|wall/.test(value)) return "wall";
    if (/สี่ทิศ|four.?way|cassette/.test(value)) return "fourway";
    if (/เปลือยใต้ฝ้า|ใต้ฝ้า|ceiling|concealed|duct/.test(value)) return "ceiling";
    if (/แขวน|hanging/.test(value)) return "hanging";
    return "unknown";
  }

  function nextServiceGuidance(data, unit, profile, cleanliness) {
    const inspection = unitInspection(data, unit || { checklist_summary: {} });
    const issueKeys = inspection.metrics.filter((metric) => metric.status === "issue").map((metric) => metric.key);
    if (issueKeys.includes("refrigerant") || issueKeys.includes("cooling")) {
      return {
        tone: "repair",
        label: "ครั้งถัดไปแนะนำ: ตรวจเช็คระบบก่อน",
        reason: "พบผลตรวจด้านความเย็นหรือระบบน้ำยา ควรตรวจหาสาเหตุก่อนเลือกวิธีล้าง",
      };
    }
    if (issueKeys.includes("drain")) {
      return {
        tone: "watch",
        label: "ครั้งถัดไปแนะนำ: ประเมินระบบน้ำทิ้ง",
        reason: "ควรตรวจการระบายน้ำและสภาพหน้างานก่อนเลือกรอบล้างครั้งถัดไป",
      };
    }
    if (issueKeys.includes("airflow")) {
      return {
        tone: "watch",
        label: "ครั้งถัดไปแนะนำ: ตรวจสภาพก่อนเลือกล้าง",
        reason: "ผลตรวจแรงลมควรใช้ร่วมกับสภาพคอยล์และอาการจริงก่อนเลือกระดับการล้าง",
      };
    }
    if (inspection.postIssueCount > 0) {
      return {
        tone: "neutral",
        label: "ครั้งถัดไปแนะนำ: ให้ทีมประเมินอาการ",
        reason: "มีรายการที่ควรติดตามแต่ยังระบุประเภทไม่ได้ จึงไม่ควรฟันธงรูปแบบบริการ",
      };
    }
    const elapsedDays = cleanliness && Number.isFinite(cleanliness.elapsedDays) ? cleanliness.elapsedDays : null;
    if (elapsedDays == null) {
      return {
        tone: "neutral",
        label: "ครั้งถัดไปแนะนำ: ยังประเมินรอบบริการไม่ได้",
        reason: "ยังไม่มีวันที่จบงานนี้สำหรับประเมินรอบบริการครั้งถัดไป",
      };
    }
    if (trackingAcType(unit) !== "wall") {
      let timing = "ยังไม่ถึงรอบล้าง";
      let tone = "good";
      if (elapsedDays >= 120 && elapsedDays <= 255) {
        timing = "เริ่มเข้าใกล้รอบบริการ";
        tone = "watch";
      } else if (elapsedDays > 255) {
        timing = "ควรตรวจสภาพเพื่อวางแผนบริการ";
        tone = "due";
      }
      return {
        tone,
        label: `ครั้งถัดไปแนะนำ: ${timing}`,
        reason: "แนะนำล้างให้ตรงชนิดเครื่องและให้ทีมประเมินรูปแบบหน้างาน",
      };
    }
    if (elapsedDays < 120) {
      return {
        tone: "good",
        label: "ครั้งถัดไปแนะนำ: ยังไม่ถึงรอบล้าง",
        reason: "แนะนำติดตามสภาพและวางแผนล้างธรรมดาเมื่อครบประมาณ 4–5 เดือน",
      };
    }
    if (elapsedDays <= 165) {
      return {
        tone: "good",
        label: "ครั้งถัดไปแนะนำ: ล้างธรรมดา",
        reason: "ระยะจากงานนี้อยู่ในรอบดูแลทั่วไปประมาณ 4–5 เดือน",
      };
    }
    if (elapsedDays <= 255) {
      return {
        tone: "watch",
        label: "ครั้งถัดไปแนะนำ: ล้างพรีเมียม",
        reason: "ระยะจากงานนี้ประมาณ 6–8 เดือน เหมาะกับการดูแลที่ละเอียดขึ้น",
      };
    }
    if (elapsedDays <= 365) {
      return {
        tone: "watch",
        label: "ครั้งถัดไปแนะนำ: ประเมินล้างแขวนคอยล์",
        reason: "ระยะจากงานนี้ประมาณ 9–12 เดือน ควรตรวจสภาพจริงก่อนเลือกรูปแบบล้าง",
      };
    }
    return {
      tone: "due",
      label: "ครั้งถัดไปแนะนำ: ประเมินล้างแขวนคอยล์หรือตัดล้าง",
      reason: "เกินหนึ่งปีจากงานนี้ ควรให้ทีมเลือกวิธีตามสภาพจริง ไม่ฟันธงจากเวลาเพียงอย่างเดียว",
    };
  }

  function renderNextServiceGuidance(guidance) {
    if (!guidance) return "";
    return `
      <div class="next-service-guidance tone-${esc(guidance.tone)}" data-next-service-guidance data-health-reveal>
        <span>คำแนะนำบริการครั้งถัดไป</span>
        <strong>${esc(guidance.label)}</strong>
        <p>${esc(guidance.reason)}</p>
        <small>คำแนะนำเบื้องต้น ควรพิจารณาอาการจริงร่วมด้วย</small>
      </div>
    `;
  }

  function renderCleanlinessHighlight(model, guidance) {
    if (!model) return "";
    const hasScore = Number.isFinite(model.score);
    const score = hasScore ? Math.max(0, Math.min(100, Math.round(model.score))) : 0;
    const ringLabel = hasScore ? `${score}%` : "--";
    const ringAria = hasScore
      ? `คะแนนสภาพความสะอาดโดยประมาณ ${score} เปอร์เซ็นต์`
      : "ยังไม่มีคะแนนสภาพความสะอาด";
    return `
      <section class="unit-cleanliness-card tone-${esc(model.tone)}" data-unit-cleanliness data-health-motion>
        <div class="unit-cleanliness-head">
          <div>
            <span>ความสะอาดและรอบล้าง</span>
            <strong>ประมาณการความสะอาดจากงานนี้</strong>
          </div>
          <span class="cleanliness-status-badge">${esc(model.status)}</span>
        </div>
        <div class="unit-cleanliness-main">
          <div class="cleanliness-ring" style="--clean-score:${score}" role="img" aria-label="${esc(ringAria)}">
            <div>
              <strong>${esc(ringLabel)}</strong>
              <span>คะแนนประเมิน</span>
            </div>
          </div>
          <div class="cleanliness-summary">
            <div class="cleanliness-date">
              <span>วันที่ล้างของงานนี้</span>
              <strong>${esc(model.serviceDateText)}</strong>
              <small>${esc(model.elapsedText)}</small>
            </div>
            <div class="cleanliness-recommendation">
              <strong>${esc(model.recommendation)}</strong>
              <p>${esc(model.nextText)}</p>
            </div>
          </div>
        </div>
        ${renderNextServiceGuidance(guidance)}
        ${model.elapsedDays == null ? "" : `<small class="cleanliness-basis">อ้างอิงจากวันที่จบงานนี้และประเภทบริการ</small>`}
      </section>
    `;
  }

  function structuredMeasurements(unit) {
    const source = unit.measurements && typeof unit.measurements === "object" ? unit.measurements : {};
    const definitions = [
      ["refrigerant_psi", "แรงดันน้ำยา", "PSI"],
      ["supply_air_c", "อุณหภูมิลมส่ง", "°C"],
      ["return_air_c", "อุณหภูมิลมกลับ", "°C"],
      ["delta_t_c", "Delta T", "°C"],
      ["airflow_cfm", "แรงลม", "CFM"],
    ];
    return definitions.flatMap(([key, label, unitLabel]) => {
      if (source[key] === "" || source[key] == null) return [];
      const value = Number(source[key]);
      return Number.isFinite(value) ? [{ key, label, value, unitLabel }] : [];
    });
  }

  function checklistEvidenceCopy(summary, done) {
    const issues = Number(summary && summary.post_issue_count || 0);
    if (summary && summary.post_completed) return issues > 0 ? `ตรวจครบแล้ว · พบ ${issues} รายการที่ควรติดตาม` : "ตรวจครบแล้ว · ไม่พบรายการผิดปกติ";
    if (summary && summary.pre_completed) return "บันทึกผลตรวจก่อนบริการแล้ว";
    return done ? "ไม่มีข้อมูลแสดงในรายงานส่วนนี้" : "กำลังตรวจสอบ";
  }

  function renderUnitPassportCards(data, units, context) {
    if (!units.length) return "";
    const unitTabLabel = (unit) => {
      const label = clean(unit.label);
      const room = label.includes("/") ? clean(label.split("/").slice(1).join("/")) : "";
      return room || `เครื่อง ${unit.unit_no || ""}`.trim() || "เครื่อง";
    };
    return `
      <article class="passport-units-card">
        <div class="passport-units-head">
          <span>สุขภาพแอร์รายเครื่อง</span>
          <strong>${units.length} เครื่อง</strong>
        </div>
        <h3>ผลตรวจและสภาพหลังบริการ</h3>
        <p>เลือกเครื่องเพื่อดูผลตรวจ เช็กลิสต์ และรูปงานของเครื่องนั้น</p>
        <div class="passport-unit-tabs" role="tablist" aria-label="เลือกเครื่องปรับอากาศ">
          ${units.map((unit, index) => `
            <button
              type="button"
              class="passport-unit-tab ${index === 0 ? "is-active" : ""}"
              role="tab"
              aria-selected="${index === 0 ? "true" : "false"}"
              data-unit-tab="${index}">
              ${esc(unitTabLabel(unit))}
            </button>
          `).join("")}
        </div>
        <div class="passport-unit-pages">
          ${units.map((unit, index) => {
            const photos = unit.photos || [];
            const before = phaseCount(photos, "before");
            const after = phaseCount(photos, "after");
            const inspection = unitInspection(data, unit);
            const preview = photos.slice(0, 4);
            const meta = [unit.service_type, unit.ac_type, unit.btu ? `${unit.btu} BTU` : ""].filter(Boolean).join(" · ") || "เครื่องปรับอากาศ";
            const measurements = structuredMeasurements(unit);
            const nextGuidance = nextServiceGuidance(data, unit, context.profile, context.cleanliness);
            const measurementPhotoCount = phaseCount(photos, "pressure") + phaseCount(photos, "current") + phaseCount(photos, "temp");
            return `
              <section
                class="passport-unit-page is-${inspection.overall.tone} ${index === 0 ? "is-active" : ""}"
                data-unit-page="${index}"
                role="tabpanel">
                <div class="passport-unit-head">
                  <div class="unit-title-block">
                    <b>${esc(unit.label)}</b>
                    <span>${esc(meta)}</span>
                    ${unit.unit_code ? `<small>${esc(unit.unit_code)}</small>` : ""}
                  </div>
                  <span class="unit-overall-pill is-${inspection.overall.tone}">${esc(inspection.overall.label)}</span>
                </div>
                <div class="passport-unit-dashboard">
                  <div class="unit-overall-summary">
                    <span>ผลตรวจหลังบริการ</span>
                    <p>${esc(inspection.overall.detail)}</p>
                  </div>
                  ${inspection.hasMetricData ? `<div class="unit-inspection-grid">${inspection.metrics.map(metricStatusCard).join("")}</div>` : ""}
                  ${renderCleanlinessHighlight(context.cleanliness, nextGuidance)}
                  ${measurements.length ? `
                    <section class="unit-measurements" data-unit-measurements>
                      <h4>ค่าตรวจวัดเพิ่มเติม</h4>
                      <div>${measurements.map((measurement) => `<span><b>${esc(measurement.label)}</b><strong>${esc(measurement.value)} ${esc(measurement.unitLabel)}</strong></span>`).join("")}</div>
                    </section>
                  ` : ""}
                  <details class="unit-evidence" data-unit-evidence>
                    <summary>
                      <span>เช็กลิสต์และรูปงาน</span>
                      <small>ก่อนทำ ${before} · หลังทำ ${after}${measurementPhotoCount ? ` · รูปตรวจเพิ่มเติม ${measurementPhotoCount}` : ""}</small>
                    </summary>
                    <div class="unit-evidence-body">
                      <p>${esc(checklistEvidenceCopy(unit.checklist_summary, isDone(data)))}</p>
                      ${preview.length ? `
                        <div class="passport-unit-photos">
                          ${preview.map((photo) => `
                            <a href="${esc(photo.url)}" target="_blank" rel="noopener" aria-label="เปิดรูปงานรายเครื่อง">
                              <img src="${esc(photo.url)}" alt="${esc(photo.phase || "รูปงาน")}" loading="lazy">
                            </a>
                          `).join("")}
                        </div>
                        <a class="unit-photo-link" href="${esc(preview[0].url)}" target="_blank" rel="noopener">ดูรูปเครื่องนี้</a>
                      ` : ""}
                    </div>
                  </details>
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }

  function timelineState(done, current) {
    if (done) return "done";
    return current ? "current" : "pending";
  }

  function hasPhotoContent(data) {
    return photoList(data).length > 0 || !!clean(data.technician_note);
  }

  function jobPhase(data, mode) {
    const status = clean(data.job_status);
    const noTech = status.includes("ไม่พบช่าง") || status.includes("ตีกลับ");
    const approval = root.customerCopy.bookingApprovalView({ ...data, booking_mode: mode });
    if (isCanceled(data)) return "canceled";
    if (isDone(data)) return "completed";
    if (approval.state === "pending") return mode === "urgent" ? "urgent_waiting" : "waiting";
    if (mode === "urgent" && noTech) return "urgent_no_tech";
    if (clean(data.started_at)) return "started";
    if (clean(data.checkin_at)) return "checked_in";
    if (clean(data.travel_started_at)) return "traveling";
    if (hasAssignedTech(data) || status.includes("รอดำเนินการ")) return "assigned";
    if (approval.state === "actionable") return "approved";
    return mode === "urgent" ? "urgent_waiting" : "waiting";
  }

  function statusCopy(data, mode) {
    const phase = jobPhase(data, mode);
    if (phase === "canceled") return "งานนี้ถูกยกเลิกแล้ว";
    if (phase === "completed") return "งานเสร็จแล้ว";
    if (phase === "started") return "กำลังให้บริการ";
    if (phase === "checked_in") return "ช่างถึงหน้างานแล้ว";
    if (phase === "traveling") return "ช่างกำลังเดินทาง";
    if (phase === "assigned") return mode === "urgent" ? "ช่างรับงานแล้ว" : "ยืนยันคิวแล้ว";
    if (phase === "approved") return "คำขอได้รับการยืนยันแล้ว";
    if (phase === "urgent_no_tech") return "แอดมินกำลังช่วยตรวจสอบคิวด่วน";
    if (phase === "urgent_waiting") return "แอดมินกำลังตรวจสอบรายละเอียดก่อนส่งต่อให้ช่างที่ว่าง";
    return "รับคำขอจองแล้ว รอแอดมินตรวจสอบคิว";
  }

  function statusDetailCopy(data, mode) {
    const phase = jobPhase(data, mode);
    const hasPhotos = hasPhotoContent(data);
    if (phase === "canceled") {
      return "คำขอนี้สิ้นสุดแล้ว หากต้องการตรวจสอบหรือจองใหม่ กรุณาติดต่อแอดมิน";
    }
    if (phase === "completed") {
      if (!canUseTokenActions(data)) {
        return hasPhotos
          ? "งานบริการเสร็จสิ้นแล้ว ดูรูปงาน สรุปงาน และรายละเอียดที่ลูกค้าควรทราบได้ในหน้านี้"
          : "งานบริการเสร็จสิ้นแล้ว ดูสรุปงานและรายละเอียดที่ลูกค้าควรทราบได้ในหน้านี้";
      }
      return hasPhotos
        ? "งานบริการเสร็จสิ้นแล้ว สามารถดูรูปงาน เอกสาร การรับประกัน และรีวิวได้"
        : "งานบริการเสร็จสิ้นแล้ว สามารถดูเอกสาร การรับประกัน และการให้คะแนนได้";
    }
    if (phase === "started") return "ทีมช่างกำลังให้บริการ";
    if (phase === "checked_in") return "ทีมช่างถึงหน้างานแล้ว";
    if (phase === "traveling") return "ช่างกำลังเดินทางไปยังสถานที่นัดหมาย";
    if (phase === "assigned") return "มีทีมช่างรับผิดชอบงานนี้แล้ว";
    if (phase === "approved") return "ดูรายละเอียดและความคืบหน้าได้ที่หน้าติดตามงาน";
    if (phase === "urgent_no_tech") return "แอดมินกำลังช่วยตรวจสอบคิวด่วน คำขอยังไม่ถือว่ายืนยันงาน";
    if (phase === "urgent_waiting") return "ส่งคำขอแล้ว และอยู่ระหว่างรอแอดมินตรวจสอบ";
    return "แอดมินจะตรวจสอบคิวและมอบหมายทีมก่อนถึงเวลานัด";
  }

  function nextActionCopy(data, mode) {
    const phase = jobPhase(data, mode);
    const hasPhotos = hasPhotoContent(data);
    if (phase === "canceled") return "ติดต่อ CWF หากต้องการตรวจสอบหรือจองบริการใหม่";
    if (phase === "completed") {
      if (!canUseTokenActions(data)) {
        return hasPhotos ? "ดูรูปงานและสรุปรายละเอียดบริการ" : "ดูสรุปรายละเอียดบริการ หรือติดต่อ CWF";
      }
      return hasPhotos
        ? "ดูรูปงาน เอกสาร การรับประกัน และรีวิวงานนี้"
        : "ดูเอกสาร การรับประกัน และให้คะแนนงานนี้";
    }
    if (phase === "started") return canUseTokenActions(data)
      ? "รอทีมช่างทำงานให้เสร็จ หลังจบงานจะเห็นเอกสารหลังบริการ"
      : "รอทีมช่างทำงานให้เสร็จ หลังจบงานจะเห็นรูปและสรุปบริการ";
    if (phase === "checked_in") return "เตรียมพื้นที่หน้างานให้พร้อมสำหรับเริ่มบริการ";
    if (phase === "traveling") return "รอรับทีมช่างที่กำลังเดินทางไปหน้างาน";
    if (phase === "assigned") return "รอถึงเวลานัด หรือเปิดแผนที่หากต้องการดูสถานที่งาน";
    if (phase === "approved") return "พร้อมติดตามงาน";
    if (phase === "urgent_no_tech") return "รอแอดมินช่วยตรวจสอบ หรือเปลี่ยนเป็นจองล่วงหน้าถ้าไม่รีบด่วน";
    if (phase === "urgent_waiting") return "รอแอดมินตรวจสอบ";
    return "รอแอดมินยืนยันคิว หรือติดต่อ CWF หากต้องการเลื่อนนัด";
  }

  function renderPassport(data) {
    const done = isDone(data);
    const date = serviceDate(data);
    const completedAt = completionDate(data);
    const usesAppointmentEstimate = done && !completedAt && !!date;
    const months = done ? monthsSince(date) : null;
    const profile = serviceProfile(data);
    const coilScore = done ? healthScore(months, profile.coilMonths) : null;
    const drainAlertMonths = hasDrainRisk(data) ? 4 : 6;
    const drainScore = done ? healthScore(months, drainAlertMonths) : null;
    const cleanliness = done && profile.kind !== "general"
      ? cleanlinessRecommendation(completedAt, coilScore, profile)
      : null;
    const warranty = warrantyInfo(data, completedAt);
    const units = unitList(data);
    const next = recommendation(data, coilScore, drainScore, profile, done);
    const completionText = done ? "งานเสร็จสิ้นแล้ว" : "อยู่ระหว่างให้บริการ";
    const serviceDateText = date ? root.utils.formatDateTime(date.toISOString()) : "-";
    const warrantyStatus = warranty
      ? (warranty.active ? "อยู่ในประกันงานล้าง" : "หมดประกันงานล้างแล้ว")
      : "แสดงเงื่อนไขประกันงานล้างตามข้อมูลที่มี";
    const warrantyMeta = warranty
      ? `${warranty.active ? `เหลือ ${warranty.daysLeft} วัน` : "ครบ 30 วันแล้ว"} · สิ้นสุด ${root.utils.formatDateTime(warranty.end.toISOString())}`
      : "ยังไม่มีวันที่ปิดงานที่ชัดเจนสำหรับนับประกัน";
    const estimateBasis = usesAppointmentEstimate ? "วันนัดหมาย" : "วันที่จบงานนี้";

    return `
      <section class="passport-shell has-health-motion">
        <div class="passport-hero">
          <span class="passport-kicker">สุขภาพแอร์</span>
          <h2>รายงานสุขภาพแอร์ CWF</h2>
          <p>สมุดสุขภาพแอร์จากงานบริการ Coldwindflow</p>
        </div>
        <div class="passport-grid">
          <article class="passport-card passport-summary-card">
            <div class="passport-card-head">
              <span>รายงานล่าสุด</span>
              <strong>${esc(completionText)}</strong>
            </div>
            <p class="passport-lead">รายงานสุขภาพแอร์จากงานบริการล่าสุด</p>
            <div class="passport-data">
              <div><b>ข้อมูลงาน</b><span>${esc(data.booking_code || "-")}</span></div>
              <div><b>สถานะ</b><span>${esc(root.customerCopy.bookingApprovalView(data).statusLabel)}</span></div>
              <div><b>บริการ</b><span>${esc(serviceSummary(data))}</span></div>
              <div><b>วันที่บริการ</b><span>${esc(serviceDateText)}</span></div>
            </div>
            ${done && clean(data.technician_note) ? `<div class="passport-note"><b>หมายเหตุจากช่าง</b><p>${esc(data.technician_note)}</p></div>` : ""}
          </article>

          ${renderUnitPassportCards(data, units, { cleanliness, profile })}

          <article class="passport-card passport-warranty-card">
            <div class="passport-card-head">
              <span>รับประกันงานล้าง</span>
              <strong>${esc(warrantyStatus)}</strong>
            </div>
            <p>${esc(warrantyMeta)}</p>
            <div class="passport-warranty-lists">
              <div>
                <b>ครอบคลุม</b>
                <span>อาการที่เกี่ยวข้องกับงานล้าง</span>
                <span>ประกอบไม่เรียบร้อย</span>
                <span>น้ำหยดจากจุดที่เกี่ยวข้องกับงานล้าง</span>
              </div>
              <div>
                <b>ไม่ครอบคลุม</b>
                <span>น้ำยารั่ว บอร์ดเสีย คอมเพรสเซอร์เสีย</span>
                <span>ท่อหรือระบบเดิมเสีย ไฟตก หนู แมลง</span>
                <span>งานจากช่างอื่น หรืออาการใหม่ที่ไม่เกี่ยวกับงานล้าง</span>
              </div>
            </div>
          </article>

          ${cleanliness ? "" : `
            <article class="passport-card passport-recommend-card">
              <div class="passport-card-head">
                <span>บริการครั้งถัดไป</span>
                <strong>คำแนะนำ</strong>
              </div>
              <h3>${esc(next.title)}</h3>
              <p>${esc(next.reason)}</p>
              <small>คะแนนประเมินอ้างอิงจาก${esc(estimateBasis)}และรอบบริการ ไม่ใช่ค่าจากเครื่องมือวัด</small>
            </article>
          `}
        </div>
      </section>
    `;
  }

  function renderTechnicianCard(data) {
    const approval = root.customerCopy.bookingApprovalView(data);
    if (approval.state === "pending") {
      return `
        <div class="tracking-tech-card is-empty" data-tech-pending>
          <div>
            <strong>แอดมินกำลังช่วยจัดคิวให้</strong>
            <span class="muted">ข้อมูลทีมช่างจะแสดงหลังแอดมินยืนยันคำขอแล้ว</span>
          </div>
        </div>
      `;
    }
    // Code-only access redacts technician identity. Never render the "no
    // technician yet" empty card here — that would misrepresent a possibly
    // assigned job as unassigned. Show a neutral limited-data note instead.
    if (isCodeOnly(data) && !canViewDetails(data)) {
      return `
        <div class="tracking-tech-card is-limited" data-tech-limited>
          <div>
            <strong>ข้อมูลทีมช่าง</strong>
            <span class="muted">ข้อมูลทีมช่างจะแสดงเมื่อเปิดจากลิงก์ติดตามงานที่ได้รับในข้อความยืนยัน</span>
          </div>
        </div>
      `;
    }
    const list = techList(data);
    if (!list.length) {
      return `
        <div class="tracking-tech-card is-empty">
          <div>
            <strong>แอดมินกำลังช่วยจัดคิวให้</strong>
            <span class="muted">ยังไม่มีช่างยืนยันงานนี้ หากเป็นคิวด่วน งานจะยืนยันเมื่อมีช่างรับหรือแอดมินยืนยันเท่านั้น</span>
          </div>
        </div>
      `;
    }
    const primary = list[0] || {};
    const photo = imageUrl(primary.photo || primary.photo_path || primary.avatar_url);
    return `
      <div class="tracking-tech-card">
        <div class="tech-avatar">${photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc(clean(primary.full_name || primary.username).slice(0, 1) || "C")}</span>`}</div>
        <div class="tech-main">
          <strong>${esc(primary.full_name || primary.username || "ช่าง CWF")}</strong>
          <span class="muted">${esc([primary.grade || primary.rank_key, primary.rating ? `คะแนน ${primary.rating}` : ""].filter(Boolean).join(" · ") || "ทีมบริการ CWF")}</span>
          ${primary.phone ? `<a class="mini-link" href="tel:${esc(primary.phone)}">โทรหาช่าง</a>` : ""}
          ${list.length > 1 ? `<div class="team-strip">${list.map((tech) => `<span>${esc(tech.full_name || tech.username || "ทีมช่าง")}</span>`).join("")}</div>` : ""}
        </div>
      </div>
    `;
  }

  function renderPhotos(data) {
    const photos = isDone(data) ? photoList(data) : [];
    if (!photos.length) return "";
    return `
      <section class="tracking-extra-card">
        <div class="section-head compact">
          <span class="section-kicker">Photos</span>
          <h2>รูปหลังจบงาน</h2>
        </div>
        <div class="tracking-photo-grid">
          ${photos.map((photo) => `
            <a href="${esc(photo.url)}" target="_blank" rel="noopener" aria-label="เปิดรูปงาน">
              <img src="${esc(photo.url)}" alt="${esc(photo.label)}" loading="lazy">
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderTechnicianNote(data) {
    if (!isDone(data) || !clean(data.technician_note)) return "";
    return `
      <section class="tracking-extra-card">
        <div class="section-head compact">
          <span class="section-kicker">Note</span>
          <h2>หมายเหตุจากช่าง</h2>
        </div>
        <p class="muted preserve-lines">${esc(data.technician_note)}</p>
      </section>
    `;
  }

  function renderReceipt(data) {
    // Only offer the button when a receipt URL can be built; the URL (which may
    // carry the booking_token as ?key=) is constructed at click time from state,
    // NOT embedded in the DOM, so the token never appears in rendered HTML.
    if (!receiptUrl(data)) return "";
    return `
      <section class="tracking-extra-card receipt-card">
        <div>
          <strong>เอกสารหลังบริการ</strong>
          <p class="muted">เปิดใบรับเงินหรือ E-slip จากข้อมูลเดิมของระบบ</p>
        </div>
        <button class="secondary-btn" type="button" data-action="open-eslip">เปิด E-slip</button>
      </section>
    `;
  }

  function renderExistingTechnicianReviewSummary(data) {
    const review = data.review || {};
    if (!isDone(data) || !review.already_reviewed) return "";
    return `
      <section class="tracking-extra-card review-summary-card">
        <div class="section-head compact">
          <span class="section-kicker">Technician Review</span>
          <h2>รีวิวทีมช่าง</h2>
        </div>
        <p><strong>${esc(review.rating || "-")} / 5</strong></p>
        ${review.review_text ? `<p class="muted preserve-lines">${esc(review.review_text)}</p>` : ""}
        ${review.complaint_text ? `<p class="muted preserve-lines"><strong>ข้อเสนอแนะ:</strong> ${esc(review.complaint_text)}</p>` : ""}
        ${review.reviewed_at ? `<p class="muted">ส่งเมื่อ ${esc(root.utils.formatDateTime(review.reviewed_at))}</p>` : ""}
      </section>
    `;
  }

  function renderTechnicianReviewForm(data) {
    if (!isDone(data) || data.review?.already_reviewed) return "";
    // Reviewing is authorised by the exact booking token or the short-lived,
    // job-bound selection reference returned by the server. Both credentials
    // stay in memory and are injected only when the request is submitted.
    const reviewToken = canUseTokenActions(data) ? (data.booking_token || "") : "";
    const selectionReference = data.capabilities?.can_submit_review === true
      ? clean(data.selection_ref)
      : "";
    if (!reviewToken && !selectionReference) return "";
    return `
      <section class="tracking-extra-card review-form-card">
        <div class="section-head compact">
          <span class="section-kicker">Review</span>
          <h2>ให้คะแนนงานนี้</h2>
        </div>
        <form data-review-form>
          ${renderStarRatingField("technician", "คะแนนทีมช่าง")}
          <label class="field">
            <span>รีวิว</span>
            <textarea class="input" name="review_text" rows="3" placeholder="เขียนรีวิว (ถ้ามี)"></textarea>
          </label>
          <label class="field">
            <span>ข้อเสนอแนะ / ร้องเรียน</span>
            <textarea class="input" name="complaint_text" rows="2" placeholder="ส่งถึงทีม CWF (ถ้ามี)"></textarea>
          </label>
          <button class="primary-btn" type="submit">ส่งรีวิว</button>
          <p class="muted review-submit-status" data-review-status role="status" aria-live="polite"></p>
        </form>
      </section>
    `;
  }

  function renderReview(data) {
    return renderExistingTechnicianReviewSummary(data) || renderTechnicianReviewForm(data);
  }

  function renderStarRatingField(prefix, label) {
    const choices = [1, 2, 3, 4, 5].map((rating) => {
      const id = `${prefix}-review-rating-${rating}`;
      return `
        <input class="review-star-radio" type="radio" name="rating" id="${id}" value="${rating}"${rating === 5 ? " checked" : ""} required>
        <label class="review-star-choice" for="${id}" aria-label="${rating} ดาว">
          <span aria-hidden="true">★</span><small>${rating}</small>
        </label>`;
    }).join("");
    return `
      <fieldset class="review-star-field">
        <legend>${esc(label)}</legend>
        <div class="review-star-options">${choices}</div>
      </fieldset>`;
  }

  // Separate, additional section from renderReview() above (which rates the
  // technician via jobs.customer_rating/technician_reviews). This one rates
  // the catalog item/service via public.catalog_item_reviews, authorized by
  // the same tracking token -- no Customer App login required. Server is the
  // sole source of truth for eligibility/target; this only reflects data.catalog_review.
  function catalogReviewStatusLabel(value) {
    const status = clean(value).toLowerCase();
    if (status === "approved") return "เผยแพร่แล้ว";
    if (status === "rejected") return "ไม่ผ่านการตรวจสอบ";
    if (["pending", "pending_review"].includes(status)) return "รอตรวจสอบ";
    if (status === "hidden") return "ซ่อนจากหน้าสาธารณะ";
    return "ส่งรีวิวแล้ว";
  }

  function renderExistingCatalogReviewSummary(data) {
    const catalogReview = data.catalog_review;
    if (!isDone(data) || !catalogReview?.already_reviewed) return "";
    const review = catalogReview.review || {};
    return `
      <section class="tracking-extra-card catalog-review-summary-card">
        <div class="section-head compact">
          <span class="section-kicker">Service Review</span>
          <h2>รีวิวบริการนี้</h2>
        </div>
        <p><strong>${esc(review.rating || "-")} / 5</strong> &middot; <span class="muted">${esc(catalogReviewStatusLabel(review.moderation_status))}</span></p>
        ${review.comment ? `<p class="muted preserve-lines">${esc(review.comment)}</p>` : ""}
        ${review.created_at ? `<p class="muted">ส่งเมื่อ ${esc(root.utils.formatDateTime(review.created_at))}</p>` : ""}
      </section>
    `;
  }

  function renderCatalogReviewForm(data) {
    if (!isDone(data)) return "";
    const catalogReview = data.catalog_review;
    if (!catalogReview || catalogReview.already_reviewed) return "";

    if (!catalogReview.eligible || !canUseTokenActions(data)) return "";
    // The private write credential is injected from state
    // at submit — never embedded in the DOM.
    if (!data.booking_token) return "";
    return `
      <section class="tracking-extra-card catalog-review-form-card">
        <div class="section-head compact">
          <span class="section-kicker">Service Review</span>
          <h2>รีวิวบริการนี้</h2>
        </div>
        <form data-catalog-review-form>
          ${renderStarRatingField("catalog", "คะแนนบริการ")}
          <label class="field">
            <span>ความเห็น</span>
            <textarea class="input" name="comment" rows="3" placeholder="เขียนรีวิวบริการ (ถ้ามี)"></textarea>
          </label>
          <button class="primary-btn" type="submit">ส่งรีวิว</button>
          <p class="muted review-submit-status" data-catalog-review-status role="status" aria-live="polite"></p>
        </form>
      </section>
    `;
  }

  function renderCatalogReview(data) {
    return renderExistingCatalogReviewSummary(data) || renderCatalogReviewForm(data);
  }

  function reviewFormKind(data) {
    if (!isDone(data)) return "";
    if (data.review?.already_reviewed || data.catalog_review?.already_reviewed) return "";

    const hasExactToken = canUseTokenActions(data) && !!clean(data.booking_token);
    if (hasExactToken && data.catalog_review?.eligible === true) return "catalog";
    const hasSelectionReference = data.capabilities?.can_submit_review === true
      && !!clean(data.selection_ref);
    if (hasExactToken || hasSelectionReference) return "technician";
    return "";
  }

  function renderReviewUnavailableNotice(data) {
    if (!isDone(data)
      || data.review?.already_reviewed
      || data.catalog_review?.already_reviewed
      || reviewFormKind(data)) return "";
    return `
      <section class="tracking-extra-card review-readonly-card" role="note">
        <div class="section-head compact">
          <span class="section-kicker">Review</span>
          <h2>การให้คะแนนเป็นแบบอ่านอย่างเดียว</h2>
        </div>
        <p class="muted">งานนี้ยังไม่อยู่ในสถานะที่ส่งรีวิวได้</p>
      </section>`;
  }

  function renderWarranty(data) {
    if (!isDone(data)) return "";
    return `
      <section class="tracking-extra-card warranty-card">
        <div class="section-head compact">
          <span class="section-kicker">Warranty</span>
          <h2>เงื่อนไขรับประกัน</h2>
        </div>
        <p class="muted">${esc(WARRANTY_COPY)}</p>
      </section>
    `;
  }

  function renderTrackingViewButton(id, label, meta, active) {
    return `
      <button
        class="tracking-view-tab ${active ? "is-active" : ""}"
        type="button"
        data-tracking-view="${esc(id)}"
        aria-selected="${active ? "true" : "false"}">
        <span>${esc(label)}</span>
        <small>${esc(meta)}</small>
      </button>
    `;
  }

  function renderTrackingPanel(id, content, active) {
    return `
      <section
        class="tracking-view-panel ${active ? "is-active" : ""}"
        data-tracking-panel="${esc(id)}"
        ${active ? "" : "hidden"}>
        ${content}
      </section>
    `;
  }

  function renderAftercare(data) {
    // Existing review summaries and warranty terms are read-only. Render both
    // summary types when they coexist, independently of token capabilities.
    const readOnlyContent = [
      renderExistingTechnicianReviewSummary(data),
      renderExistingCatalogReviewSummary(data),
      renderWarranty(data),
    ];

    // Choose exactly one write surface. Catalog is primary only when it is
    // genuinely eligible with an exact token. Ineligible/null Catalog data
    // falls back to Technician review. A legacy no-token job may use the
    // existing booking-code + full-phone proof contract.
    const formKind = reviewFormKind(data);
    const actionContent = [
      canUseTokenActions(data) ? renderReceipt(data) : "",
      formKind === "catalog" ? renderCatalogReviewForm(data) : "",
      formKind === "technician" ? renderTechnicianReviewForm(data) : "",
      renderReviewUnavailableNotice(data),
    ];
    const content = [...readOnlyContent, ...actionContent].filter(Boolean).join("");
    return content || root.utils.stateBox("", "รายละเอียดหลังบริการจะแสดงหลังงานเสร็จ");
  }

  function renderJobDetails(data, photos, maps, trackingKey) {
    // Access-level aware. Full (token) access — opened from the secure link in
    // the confirmation message — shows the customer-information section, address,
    // and map. A booking_code (limited) lookup must NOT render blank rows that
    // pretend data is missing: it shows only the fields the privacy response
    // actually returned, plus a clear notice explaining the secure link is
    // needed for full details. No hidden field is reconstructed on the client.
    const isFull = canViewDetails(data);
    const rows = [];
    rows.push(`<div class="data-row"><strong>รหัสติดตาม</strong><span class="muted">${esc(trackingKey || data.booking_code || "-")}</span></div>`);
    if (isFull && data.customer_name) {
      rows.push(`<div class="data-row"><strong>ชื่อลูกค้า</strong><span class="muted">${esc(data.customer_name)}</span></div>`);
    }
    // Masked phone may be present even in limited mode; the full number only in token mode.
    if (data.customer_phone) {
      rows.push(`<div class="data-row"><strong>เบอร์โทร</strong><span class="muted">${esc(data.customer_phone)}</span></div>`);
    }
    rows.push(`<div class="data-row"><strong>นัดหมาย</strong><span class="muted">${esc(root.utils.formatDateTime(data.appointment_datetime))}</span></div>`);
    if (isFull || serviceSummary(data)) {
      rows.push(`<div class="data-row"><strong>บริการ</strong><span class="muted">${esc(serviceSummary(data) || "-")}</span></div>`);
    }
    if (isFull && (data.job_price != null || data.base_total != null)) {
      rows.push(`<div class="data-row"><strong>ราคาโดยประมาณ</strong><span class="muted">${esc(money(data.job_price || data.base_total))}</span></div>`);
    }
    if (data.duration_min) {
      rows.push(`<div class="data-row"><strong>ระยะเวลา</strong><span class="muted">${Number(data.duration_min)} นาที</span></div>`);
    }
    if (isFull && data.address_text) {
      rows.push(`<div class="data-row"><strong>ที่อยู่</strong><span class="muted">${esc(data.address_text)}</span></div>`);
    }
    if (isFull && data.job_zone) {
      rows.push(`<div class="data-row"><strong>พื้นที่</strong><span class="muted">${esc(data.job_zone)}</span></div>`);
    }
    if (isFull && maps) {
      rows.push(`<div class="data-row"><strong>แผนที่</strong><span><a class="mini-link" href="${esc(maps)}" target="_blank" rel="noopener">นำทางไปหน้างาน</a></span></div>`);
    }
    rows.push(`<div class="data-row"><strong>หลังจบงาน</strong><span class="muted">รูปงาน ${photos.length} รายการ ${data.receipt_url ? "และมีเอกสารหลังบริการ" : ""}</span></div>`);
    const serviceItems = Array.isArray(data.service_items) ? data.service_items : [];
    if (serviceItems.length) {
      rows.push(`<div class="data-row tracking-service-lines"><strong>รายการบริการ</strong><span>${serviceItems.map((item) => `${esc(item.item_name || "บริการ")} × ${Number(item.qty) || 1}`).join("<br>")}</span></div>`);
    }
    if (data.payment_status || data.paid_at) {
      rows.push(`<div class="data-row"><strong>การชำระเงิน</strong><span class="muted">${esc(paymentStatusLabel(data.payment_status, data.paid_at))}</span></div>`);
    }
    return `<div class="data-list tracking-summary-list">${rows.join("")}</div>`;
  }

  function renderPhotoView(data) {
    const content = [renderPhotos(data), renderTechnicianNote(data)].filter(Boolean).join("");
    return content || root.utils.stateBox("", "รูปงานจะแสดงหลังช่างอัปโหลดและงานเสร็จ");
  }

  // ---- Store order tracking (codes like CWF-XXXX) --------------------------
  const ORDER_PAYMENT_COPY = {
    paid: { label: "ชำระเงินแล้ว", cls: "success" },
    payment_processing: { label: "รอการชำระเงิน", cls: "loading" },
    pending_payment: { label: "ยังไม่ได้ชำระเงิน", cls: "" },
    payment_failed: { label: "การชำระเงินไม่สำเร็จ", cls: "error" },
  };
  const ORDER_FULFILMENT_STEPS = [
    { key: "confirmed", label: "ยืนยันคำสั่งซื้อ" },
    { key: "preparing", label: "กำลังเตรียมสินค้า" },
    { key: "shipped", label: "จัดส่งแล้ว" },
    { key: "installing", label: "กำลังติดตั้ง" },
    { key: "completed", label: "เสร็จสิ้น" },
  ];
  const ORDER_FULFILMENT_LABEL = { cancelled: "ยกเลิกคำสั่งซื้อ", ...ORDER_FULFILMENT_STEPS.reduce((m, s) => { m[s.key] = s.label; return m; }, {}) };

  function renderOrderResult(order) {
    if (!order) return root.utils.stateBox("error", "ไม่พบคำสั่งซื้อนี้");
    const pay = ORDER_PAYMENT_COPY[order.status] || { label: order.status || "-", cls: "" };
    const fulfil = order.fulfillment_status || "";
    const items = Array.isArray(order.items) ? order.items : [];
    const itemsHtml = items.map((it) => `<div class="data-row"><span>${esc(it.name || it.item_name || "")} × ${Number(it.qty) || 1}</span><span class="muted">${root.utils.formatBaht((Number(it.unit_price) || 0) * (Number(it.qty) || 1))}</span></div>`).join("");
    const steps = ORDER_FULFILMENT_STEPS;
    const activeIndex = steps.findIndex((s) => s.key === fulfil);
    const cancelled = fulfil === "cancelled";
    const timeline = cancelled
      ? `<div class="status-hero is-error"><strong>ยกเลิกคำสั่งซื้อ</strong></div>`
      : `<ol class="order-steps">${steps.map((s, i) => `<li class="order-step ${activeIndex >= 0 && i <= activeIndex ? "is-done" : ""}">${esc(s.label)}</li>`).join("")}</ol>`;
    return `
      <div class="tracking-result-card order-result-card">
        <div class="status-hero is-${pay.cls}">
          <strong>${esc(pay.label)}</strong>
          <span>คำสั่งซื้อ ${esc(order.order_code || "")}</span>
        </div>
        <div class="order-status-line">สถานะการจัดส่ง/ติดตั้ง: <strong>${esc(fulfil ? (ORDER_FULFILMENT_LABEL[fulfil] || fulfil) : "รอแอดมินยืนยัน")}</strong></div>
        ${!cancelled ? timeline : timeline}
        <div class="order-items">${itemsHtml}</div>
        <div class="data-row order-total"><strong>ยอดชำระ</strong><strong>${root.utils.formatBaht(Number(order.subtotal) || 0)}</strong></div>
        ${order.admin_note ? `<div class="order-admin-note">📌 ${esc(order.admin_note)}</div>` : ""}
        <p class="muted mini">* ค่าจัดส่ง/ติดตั้งเพิ่มเติม (ถ้ามี) แอดมินจะแจ้งในโน้ตด้านบนหรือทาง LINE</p>
      </div>`;
  }

  async function lookupOrder(container, code) {
    const box = container.querySelector("[data-tracking-result]");
    box.innerHTML = root.utils.stateBox("loading", "กำลังค้นหาคำสั่งซื้อ...");
    try {
      const res = await root.api.getOrder(code);
      box.innerHTML = renderOrderResult(res && res.order);
    } catch (_error) {
      box.innerHTML = root.utils.stateBox("error", "ไม่พบคำสั่งซื้อนี้ กรุณาตรวจสอบเลขคำสั่งซื้ออีกครั้ง");
    }
  }

  function renderTrackingChoices(jobs) {
    const list = Array.isArray(jobs) ? jobs : [];
    if (!list.length) return "";
    return `
      <div class="tracking-choice-shell">
        <div class="section-head compact">
          <span class="section-kicker">Tracking</span>
          <h2>เลือกงานที่ต้องการติดตาม</h2>
        </div>
        <div class="tracking-choice-list">
          ${list.map((job, index) => `
            <button class="tracking-choice" type="button" data-tracking-choice="${index}">
              <strong>${esc(job.booking_code || "งาน CWF")}</strong>
              <span>${esc(job.appointment_datetime ? root.utils.formatDateTime(job.appointment_datetime) : "ไม่ระบุวันนัดหมาย")}</span>
              <span>${esc(job.service_summary || "บริการ CWF")} · ${esc(root.customerCopy.bookingApprovalView(job).statusLabel)}</span>
              ${job.location_summary ? `<small>${esc(job.location_summary)}</small>` : ""}
            </button>`).join("")}
        </div>
      </div>`;
  }

  function renderTrackingResult() {
    const state = root.state.tracking;
    if (state.status === "idle") return `<div class="tracking-empty-state"><strong>ค้นหางานของคุณ</strong><span>กรอกเบอร์โทรที่ใช้จอง หรือรหัสการจอง</span></div>`;
    if (state.status === "loading") return `
      <div class="tracking-skeleton" role="status" aria-live="polite" aria-label="กำลังค้นหางาน">
        <span class="skeleton-line is-title"></span>
        <span class="skeleton-line"></span>
        <span class="skeleton-line is-short"></span>
        <div class="skeleton-grid"><span></span><span></span></div>
      </div>`;
    if (state.status === "choices") return renderTrackingChoices(state.data?.jobs);
    if (state.status === "error") {
      const rateLimited = state.errorKind === "rate";
      const offline = state.errorKind === "network";
      const title = rateLimited ? "ค้นหาบ่อยเกินไป" : offline ? "เชื่อมต่อระบบไม่ได้" : "ไม่พบงานนี้";
      const detail = rateLimited
        ? `กรุณารอ ${Number(state.retryAfter || 60)} วินาที แล้วลองอีกครั้ง`
        : offline ? "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง" : "ตรวจสอบเลขติดตาม แล้วลองค้นหาใหม่";
      return `<div class="tracking-error-state is-${rateLimited ? "rate" : offline ? "offline" : "not-found"}" role="alert">
        <strong>${esc(title)}</strong><span>${esc(detail)}</span>
        <button class="secondary-btn" type="button" data-action="track-retry">ลองอีกครั้ง</button>
      </div>`;
    }

    const data = state.data || {};
    const mode = modeFromData(data);
    const photos = photoList(data);
    const maps = mapUrl(data);
    // The VISIBLE tracking number is always the short booking_code — never the
    // long secret booking_token. The token stays only in state as the request
    // credential (used for refresh/receipt/review requests), never rendered.
    const trackingKey = data.booking_code || "";
    const done = isDone(data);
    const units = unitList(data);
    const appointmentText = data.appointment_datetime ? root.utils.formatDateTime(data.appointment_datetime) : "-";
    // Read visibility and privileged actions are separate capabilities. A
    // รหัสการจองอาจแสดงรายละเอียดการมอบหมายที่เปิดเผยต่อลูกค้าได้ โดยไม่เพิ่ม
    // document, review, or mutation controls.
    const heroTitle = statusCopy(data, mode);
    const heroDetail = statusDetailCopy(data, mode);
    const nextAction = nextActionCopy(data, mode);
    const overview = `
      <div class="tracking-premium-overview">
        <div class="status-hero is-${mode}">
          <strong>${esc(heroTitle)}</strong>
          <span>${esc(heroDetail)}</span>
        </div>
        <div class="tracking-quick-grid">
          <div>
            <span>นัดหมาย</span>
            <strong>${esc(appointmentText)}</strong>
          </div>
          <div>
            <span>ขั้นตอนถัดไป</span>
            <strong>${esc(nextAction)}</strong>
          </div>
          <div>
            <span>บริการ</span>
            <strong>${esc(serviceSummary(data))}</strong>
          </div>
          <div>
            <span>ราคา</span>
            <strong>${esc(money(data.job_price))}</strong>
          </div>
        </div>
        ${renderTechnicianCard(data)}
        <div class="support-strip">
          ${maps ? `<a class="secondary-btn" href="${esc(maps)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}
          <button class="secondary-btn" type="button" data-action="track-refresh">รีเฟรช</button>
          <a class="secondary-btn" href="tel:${ADMIN_PHONE}">โทรหา CWF</a>
          <a class="secondary-btn" href="${LINE_URL}" target="_blank" rel="noopener">LINE หา CWF</a>
          ${canUseTokenActions(data) && mode === "urgent" && !hasAssignedTech(data) ? `<button class="secondary-btn" type="button" data-route="scheduled">เปลี่ยนเป็นจองล่วงหน้า</button>` : ""}
        </div>
        <p class="tracking-updated-at">อัปเดตล่าสุด <time>${esc(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }))}</time></p>
        <p class="muted support-note">ต้องการแก้ไขเวลา เลื่อนนัด หรือยกเลิกงาน กรุณาติดต่อแอดมิน CWF</p>
      </div>
    `;

    const views = [
      {
        id: "overview",
        label: "สถานะ",
        meta: mode === "urgent" ? "คิวด่วน" : "จองล่วงหน้า",
        content: overview,
      },
      {
        id: "details",
        label: "รายละเอียด",
        meta: "ข้อมูลงาน",
        content: renderJobDetails(data, photos, maps, trackingKey),
      },
      {
        id: "timeline",
        label: "ไทม์ไลน์",
        meta: done ? "เสร็จแล้ว" : "ขั้นตอนงาน",
        content: `<div class="tracking-timeline-panel">${renderTimeline()}</div>`,
      },
    ];

    if (done || units.length) {
      views.push({
        id: "passport",
        label: "สุขภาพแอร์",
        meta: units.length ? `${units.length} เครื่อง` : "สุขภาพแอร์",
        content: renderPassport(data),
      });
    }

    if (done && hasPhotoContent(data)) {
      views.push({
        id: "photos",
        label: "รูปงาน",
        meta: photos.length ? `${photos.length} รูป` : "หมายเหตุช่าง",
        content: renderPhotoView(data),
      });
    }

    if (done) {
      views.push({
        id: "aftercare",
        label: "หลังบริการ",
        meta: canUseTokenActions(data) ? "เอกสารและรีวิว" : "สรุปและรับประกัน",
        content: renderAftercare(data),
      });
    }

    const activeView = views[0].id;

    return `
      <div class="tracking-result-card">
        <div class="tracking-topline">
          <span class="mode-badge is-${mode}">${mode === "urgent" ? "คิวด่วน" : "จองล่วงหน้า"}</span>
          <div class="tracking-code-wrap">
            <div class="tracking-code-pill">${esc(data.booking_code || "ไม่พบรหัสการจอง")}</div>
            ${data.booking_code ? `<button class="tracking-copy-btn" type="button" data-action="copy-tracking-code" data-code="${esc(data.booking_code)}" aria-label="คัดลอกเลขติดตาม">คัดลอก</button>` : ""}
          </div>
        </div>
        <div class="tracking-view-tabs" role="tablist" aria-label="Tracking views">
          ${views.map((view) => renderTrackingViewButton(view.id, view.label, view.meta, view.id === activeView)).join("")}
        </div>
        <div class="tracking-view-stack">
          ${views.map((view) => renderTrackingPanel(view.id, view.content, view.id === activeView)).join("")}
        </div>
      </div>
    `;
  }

  function renderTimeline() {
    const data = root.state.tracking.data || {};
    const mode = modeFromData(data);
    const approval = root.customerCopy.bookingApprovalView({ ...data, booking_mode: mode });
    const canView = canViewDetails(data);
    const canUseActions = canUseTokenActions(data);
    const assigned = approval.state !== "pending" && hasAssignedTech(data);
    const travel = !!clean(data.travel_started_at);
    const checkin = !!clean(data.checkin_at);
    const started = !!clean(data.started_at);
    const done = isDone(data);
    const canceled = isCanceled(data);
    const steps = [
      {
        title: mode === "urgent" ? "ส่งคำขอคิวด่วนแล้ว" : "รับคำขอจองแล้ว",
        copy: canView
          ? "ระบบได้รับคำขอของคุณแล้ว"
          : (mode === "urgent" ? "ระบบรับคำขอแล้ว แต่ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน" : "รอแอดมินตรวจสอบคิวและรายละเอียด"),
        ok: true,
      },
    ];

    if (canceled) {
      steps.push({
        title: "งานถูกยกเลิก",
        copy: "คำขอนี้สิ้นสุดแล้ว หากต้องการตรวจสอบหรือจองใหม่ กรุณาติดต่อแอดมิน",
        ok: true,
      });
      return root.utils.timeline(steps.map((step) => ({ title: step.title, copy: step.copy, kind: "" })));
    }

    if (canView) {
      steps.push({
        title: mode === "urgent" ? "ช่างรับงาน / แอดมินยืนยัน" : "ยืนยันคิวและมอบหมายทีม",
        copy: assigned ? "มีทีมดูแลงานนี้แล้ว" : "แอดมินกำลังช่วยจัดคิวให้",
        ok: assigned,
      });
    }
    steps.push(
      { title: "ช่างกำลังเดินทาง", copy: data.travel_started_at ? root.utils.formatDateTime(data.travel_started_at) : "จะแสดงเมื่อช่างเริ่มเดินทาง", ok: travel },
      { title: "ถึงหน้างาน", copy: data.checkin_at ? root.utils.formatDateTime(data.checkin_at) : "จะแสดงเมื่อทีมเช็กอิน", ok: checkin },
      { title: "เริ่มให้บริการ", copy: data.started_at ? root.utils.formatDateTime(data.started_at) : "จะแสดงเมื่อทีมเริ่มงาน", ok: started },
      {
        title: "งานเสร็จแล้ว",
        copy: data.finished_at
          ? root.utils.formatDateTime(data.finished_at)
          : (canUseActions ? "หลังจบงานจะแสดงรูป เอกสาร รีวิว และเงื่อนไขรับประกัน" : "หลังจบงานจะแสดงรูปและสรุปรายละเอียดบริการ"),
        ok: done,
      },
    );
    const firstPending = steps.findIndex((step) => !step.ok);
    return root.utils.timeline(steps.map((step, index) => ({
      title: step.title,
      copy: step.copy,
      kind: step.ok ? "" : timelineState(false, index === firstPending),
    })));
  }

  function finishTrackingRender(container) {
    container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
    const timeline = container.querySelector("[data-tracking-timeline]");
    if (timeline) timeline.innerHTML = renderTimeline();
    bindResultActions(container);
    root.utils.decorateActionIcons?.(container);
  }

  async function openSelection(container, selectionReference) {
    const reference = clean(selectionReference);
    if (!reference) return;
    root.state.setTracking({ status: "loading", data: null, error: "", errorKind: "", retryAfter: 0 });
    finishTrackingRender(container);
    try {
      const data = await root.api.selectTracking(reference);
      root.state.setTracking({ status: "success", data, error: "", errorKind: "", retryAfter: 0 });
      const input = container.querySelector("#tracking-code");
      if (data && data.booking_code) {
        root.state.updateDraft("tracking", { trackingCode: String(data.booking_code) });
        if (input) input.value = String(data.booking_code);
      }
    } catch (error) {
      const status = Number(error && error.status);
      root.state.setTracking({
        status: "error",
        data: null,
        error: error && error.message,
        errorKind: status === 429 ? "rate" : status === 404 ? "not-found" : "network",
        retryAfter: Number(error?.data?.retry_after_s || 0),
      });
    }
    finishTrackingRender(container);
  }

  // Deep-link tokens retain the existing GET contract. Customer-typed phone
  // เบอร์โทรและรหัสการจองใช้ body-only lookup ก่อนเข้าสู่ signed selection
  // reference, so the typed identifier is never copied into a request URL.
  async function lookup(container, opts) {
    opts = opts || {};
    const input = container.querySelector("#tracking-code");
    const usingPrivate = opts.credential != null;
    const qRaw = usingPrivate
      ? String(opts.credential || "").trim()
      : String((input && input.value) || "").trim();
    const q = !usingPrivate && /^CWF[A-Z0-9]{7}$/i.test(qRaw) ? qRaw.toUpperCase() : qRaw;
    if (usingPrivate) setActiveCredential(q);
    else setActiveCredential("");
    if (!usingPrivate) {
      root.state.updateDraft("tracking", { trackingCode: q });
    }
    if (!q) {
      root.state.setTracking({ status: "error", data: null, error: "กรุณากรอกเบอร์โทรหรือรหัสการจอง" });
      finishTrackingRender(container);
      return;
    }
    // Store order codes look like "CWF-XXXX" — route them to the order lookup
    // instead of the job/booking tracker.
    if (/^CWF-/i.test(q)) { await lookupOrder(container, q); return; }
    root.state.setTracking({ status: "loading", data: null, error: "", errorKind: "", retryAfter: 0 });
    finishTrackingRender(container);
    try {
      if (usingPrivate) {
        const data = await root.api.trackBooking(q);
        root.state.setTracking({ status: "success", data, error: "", errorKind: "", retryAfter: 0 });
        if (data && data.booking_code) {
          root.state.updateDraft("tracking", { trackingCode: String(data.booking_code) });
          if (input) input.value = String(data.booking_code);
        }
      } else {
        const result = await root.api.lookupTracking(q);
        const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
        if (jobs.length === 1) return openSelection(container, jobs[0].selection_ref);
        root.state.setTracking({ status: "choices", data: { jobs }, error: "", errorKind: "", retryAfter: 0 });
      }
    } catch (error) {
      const status = Number(error && error.status);
      root.state.setTracking({
        status: "error",
        data: null,
        error: error && error.message,
        errorKind: status === 429 ? "rate" : status === 404 ? "not-found" : "network",
        retryAfter: Number(error?.data?.retry_after_s || 0),
      });
      // A failed private lookup must not leave the token anywhere visible — it
      // was never written to the input/draft, so nothing to clear here.
    }
    finishTrackingRender(container);
  }

  // Refresh / post-review reloads reuse the private active credential so a
  // token session keeps full access instead of silently downgrading to the
  // visible booking_code.
  function reloadCurrent(container) {
    const selectionReference = clean(root.state.tracking.data?.selection_ref);
    if (selectionReference) return openSelection(container, selectionReference);
    if (activeCredential) return lookup(container, { credential: activeCredential });
    return lookup(container);
  }

  function bindResultActions(container) {
    const result = container.querySelector("[data-tracking-result]");
    if (result && !result.dataset.unitTabsBound) {
      result.dataset.unitTabsBound = "1";
      result.addEventListener("click", (event) => {
        const viewTab = event.target.closest("[data-tracking-view]");
        if (viewTab) {
          const id = viewTab.getAttribute("data-tracking-view");
          const resultCard = viewTab.closest(".tracking-result-card");
          if (!resultCard) return;
          resultCard.querySelectorAll("[data-tracking-view]").forEach((btn) => {
            const active = btn.getAttribute("data-tracking-view") === id;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-selected", active ? "true" : "false");
          });
          resultCard.querySelectorAll("[data-tracking-panel]").forEach((panel) => {
            const active = panel.getAttribute("data-tracking-panel") === id;
            panel.classList.toggle("is-active", active);
            panel.hidden = !active;
          });
          return;
        }

        const tab = event.target.closest("[data-unit-tab]");
        if (!tab) return;
        const shell = tab.closest(".passport-units-card");
        if (!shell) return;
        const id = tab.getAttribute("data-unit-tab");
        shell.querySelectorAll("[data-unit-tab]").forEach((btn) => {
          const active = btn === tab;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-selected", active ? "true" : "false");
        });
        shell.querySelectorAll("[data-unit-page]").forEach((page) => {
          page.classList.toggle("is-active", page.getAttribute("data-unit-page") === id);
        });
      });
    }

    if (result && !result.dataset.trackingChoicesBound) {
      result.dataset.trackingChoicesBound = "1";
      result.addEventListener("click", (event) => {
        const choice = event.target.closest("[data-tracking-choice]");
        if (!choice) return;
        const index = Number(choice.getAttribute("data-tracking-choice"));
        const jobs = root.state.tracking.data?.jobs;
        const reference = Array.isArray(jobs) ? jobs[index]?.selection_ref : "";
        if (reference) openSelection(container, reference);
      });
    }

    const refresh = container.querySelector("[data-action='track-refresh']");
    if (refresh) refresh.addEventListener("click", () => reloadCurrent(container), { once: true });

    const retry = container.querySelector("[data-action='track-retry']");
    if (retry) retry.addEventListener("click", () => reloadCurrent(container), { once: true });

    const copyCode = container.querySelector("[data-action='copy-tracking-code']");
    if (copyCode) {
      copyCode.addEventListener("click", async () => {
        const code = copyCode.getAttribute("data-code") || "";
        try {
          await navigator.clipboard.writeText(code);
          copyCode.textContent = "คัดลอกแล้ว";
        } catch (_) {
          copyCode.textContent = code;
        }
      });
    }

    // E-slip opens with a URL built from state at click time (the token, if any,
    // travels only in that request URL — never rendered into the DOM).
    const eslipBtn = container.querySelector("[data-action='open-eslip']");
    if (eslipBtn) {
      eslipBtn.addEventListener("click", () => {
        const url = receiptUrl(root.state.tracking.data || {});
        if (url) window.open(url, "_blank", "noopener");
      });
    }

    const form = container.querySelector("[data-review-form]");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = form.querySelector("[data-review-status]");
        const submit = form.querySelector("button[type='submit']");
        const payload = Object.fromEntries(new FormData(form).entries());
        // The credential is injected from in-memory state, never read from or
        // rendered into the DOM.
        const trackingData = root.state.tracking.data || {};
        const token = canUseTokenActions(trackingData) ? clean(trackingData.booking_token) : "";
        const selectionReference = clean(trackingData.selection_ref);
        if (token) payload.booking_token = token;
        else if (selectionReference) payload.selection_ref = selectionReference;
        payload.rating = Number(payload.rating || 5);
        if (status) status.textContent = "กำลังส่งรีวิว...";
        if (submit) submit.disabled = true;
        form.setAttribute("aria-busy", "true");
        try {
          const response = await fetch(`${root.api.getApiBase()}/public/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            referrerPolicy: "no-referrer",
            body: JSON.stringify(payload),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            const requestError = new Error("review request failed");
            requestError.status = response.status;
            requestError.data = { code: data && data.code };
            throw requestError;
          }
          if (status) status.textContent = "ส่งรีวิวเรียบร้อย ขอบคุณครับ";
          setTimeout(() => reloadCurrent(container), 500);
        } catch (error) {
          if (status) status.textContent = root.customerCopy.bookingError(error);
          if (submit) submit.disabled = false;
          form.removeAttribute("aria-busy");
        }
      });
    }

    const catalogForm = container.querySelector("[data-catalog-review-form]");
    if (catalogForm) {
      catalogForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = catalogForm.querySelector("[data-catalog-review-status]");
        const submit = catalogForm.querySelector("button[type='submit']");
        const formData = Object.fromEntries(new FormData(catalogForm).entries());
        // Credential from state, not the DOM.
        const d = root.state.tracking.data || {};
        if (!canUseTokenActions(d) || !d.booking_token) {
          if (status) status.textContent = "สิทธิ์รีวิวหมดอายุ กรุณาเปิดลิงก์ติดตามงานอีกครั้ง";
          return;
        }
        const token = d.booking_token;
        if (status) status.textContent = "กำลังส่งรีวิว...";
        if (submit) submit.disabled = true;
        catalogForm.setAttribute("aria-busy", "true");
        try {
          await root.api.submitTrackingReview(token, {
            rating: Number(formData.rating || 5),
            comment: formData.comment || "",
          });
          if (status) status.textContent = "ส่งรีวิวแล้ว รอแอดมินตรวจสอบ";
          setTimeout(() => reloadCurrent(container), 500);
        } catch (error) {
          if (status) status.textContent = root.customerCopy.bookingError(error);
          if (submit) submit.disabled = false;
          catalogForm.removeAttribute("aria-busy");
        }
      });
    }
  }

  root.tracking = {
    render(container) {
      const code = root.state.draft.tracking.trackingCode || "";
      container.innerHTML = `
        <section class="screen">
          ${root.ui?.pageHeaderHtml ? root.ui.pageHeaderHtml("tracking") : ""}
          <div class="hero tracking-hero">
            <div class="hero-badge">CWF Tracking</div>
            <h1>ติดตามสถานะงาน</h1>
            <p>ดูสถานะ นัดหมาย และรายละเอียดงานล่าสุดได้จากเลขติดตามของคุณ</p>
          </div>
          <section class="card lookup-card" aria-labelledby="tracking-search-title">
            <h2 id="tracking-search-title" class="tracking-search-title">ค้นหางาน</h2>
            <div class="field">
              <label for="tracking-code">เบอร์โทร หรือรหัสการจอง</label>
              <input id="tracking-code" class="input tracking-code-input" placeholder="กรอกเบอร์โทรหรือรหัสการจอง" value="${esc(code)}"
                inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="32">
              <span class="field-help">ค้นหาด้วยเบอร์ที่ใช้จอง หรือรหัสการจองจาก CWF</span>
            </div>
            <div class="button-row">
              <button class="primary-btn tracking-search-btn" type="button" data-action="track-read">ค้นหางาน</button>
            </div>
          </section>
          <section class="card tracking-result-shell" aria-live="polite">
            <div data-tracking-result>${renderTrackingResult()}</div>
          </section>
        </section>
      `;
      root.ui?.bindPageHeader?.(container);
      container.querySelector("[data-action='track-read']").addEventListener("click", () => lookup(container));
      container.querySelector("#tracking-code").addEventListener("input", (event) => {
        const value = String(event.target.value || "").trimStart().toUpperCase();
        event.target.value = value;
        root.state.updateDraft("tracking", { trackingCode: value });
      });
      container.querySelector("#tracking-code").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          lookup(container);
        }
      });
      bindResultActions(container);
      if (pendingAutoLookup && activeCredential && root.state.tracking.status === "idle") {
        // Deep-link (?q=/?token=): run the first lookup with the PRIVATE
        // credential — it is never placed in the visible input above.
        pendingAutoLookup = false;
        setTimeout(() => lookup(container, { credential: activeCredential }), 0);
      } else if (code && root.state.tracking.status === "idle") {
        setTimeout(() => lookup(container), 0);
      }
    },
    // Called by the app bootstrap with a ?q=/?token= deep-link value. The
    // credential is held privately and consumed by the first render's
    // auto-lookup; it is NEVER written to the draft or the visible input.
    setInitialCredential(value) {
      const cred = String(value == null ? "" : value).trim();
      if (!cred) return;
      setActiveCredential(cred);
      pendingAutoLookup = true;
    },
    _test: {
      canViewDetails,
      canUseTokenActions,
      isCanceled,
      jobPhase,
      paymentStatusLabel,
      receiptUrl,
      renderReview,
      renderCatalogReview,
      reviewFormKind,
      renderAftercare,
      renderPassport,
      renderUnitPassportCards,
      renderTrackingResult,
      renderTimeline,
      bindResultActions,
      cleanlinessRecommendation,
      renderCleanlinessHighlight,
      nextServiceGuidance,
      renderNextServiceGuidance,
      serviceProfile,
      structuredMeasurements,
      unitInspection,
    },
  };
})();
