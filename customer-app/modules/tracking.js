(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_PHONE = "098-877-7321";
  const LINE_URL = "https://lin.ee/fG1Oq7y";
  const WARRANTY_COPY = "รับประกันงานล้าง 30 วัน เฉพาะอาการที่เกี่ยวข้องกับการบริการ ไม่รวมอะไหล่เสีย ระบบรั่ว บอร์ด คอมเพรสเซอร์ ไฟตก หรือปัญหาจากตัวเครื่องเดิม";

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

  function mapUrl(data) {
    const rawLat = clean(data.gps_latitude);
    const rawLng = clean(data.gps_longitude);
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (rawLat && rawLng && Number.isFinite(lat) && Number.isFinite(lng)) {
      return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=driving`;
    }
    const direct = clean(data.maps_url || data.map_url);
    if (direct) return direct;
    const address = clean(data.address_text);
    return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
  }

  function receiptUrl(data) {
    const fallback = isDone(data) && data.job_id ? `/docs/receipt/${encodeURIComponent(data.job_id)}` : "";
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

  function serviceProfile(data) {
    const text = clean([data.job_type, data.service_summary, data.items_text].filter(Boolean).join(" ")).toLowerCase();
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

  function coilLabel(score) {
    if (score == null) return "รอข้อมูลงานเสร็จ";
    if (score >= 90) return "สะอาดมาก";
    if (score >= 70) return "ยังดี";
    if (score >= 45) return "เริ่มมีฝุ่นสะสม";
    if (score >= 20) return "ควรล้างเร็ว ๆ นี้";
    return "เกินรอบแนะนำ";
  }

  function drainLabel(score) {
    if (score == null) return "รอข้อมูลงานเสร็จ";
    if (score >= 85) return "ระบายดี";
    if (score >= 65) return "ยังปกติ";
    if (score >= 35) return "เริ่มควรตรวจ";
    return "เสี่ยงตัน / ควรล้าง";
  }

  function healthTone(score) {
    if (score == null) return "unknown";
    if (score >= 70) return "good";
    if (score >= 45) return "watch";
    return "alert";
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

  function measurementSummary(photos) {
    const pressure = phaseCount(photos, "pressure");
    const current = phaseCount(photos, "current");
    const temp = phaseCount(photos, "temp");
    const total = pressure + current + temp;
    if (!total) return "ยังไม่มีข้อมูลวัดจริง";
    return "มีรูปการตรวจวัด แต่ยังไม่มีค่าตัวเลขที่บันทึกเป็นข้อมูล";
  }

  function checklistCopy(summary) {
    const pre = summary && summary.pre_completed;
    const post = summary && summary.post_completed;
    const issues = Number(summary && summary.issue_count || 0);
    if (!pre && !post) return "ยังไม่มีสรุปเช็คลิสต์ที่แสดงได้";
    const parts = [];
    if (pre) parts.push("ก่อนทำบันทึกแล้ว");
    if (post) parts.push("หลังทำบันทึกแล้ว");
    parts.push(issues > 0 ? `มีรายการให้ตรวจ ${issues} จุด` : "ไม่พบรายการผิดปกติในสรุป");
    return parts.join(" · ");
  }

  function scoreTone(score) {
    if (score == null) return "unknown";
    if (score >= 80) return "good";
    if (score >= 60) return "watch";
    if (score >= 40) return "warning";
    return "critical";
  }

  function toneLabel(score) {
    const tone = scoreTone(score);
    if (tone === "good") return "ปกติ";
    if (tone === "watch") return "เฝ้าระวัง";
    if (tone === "warning") return "ควรตรวจ";
    if (tone === "critical") return "วิกฤต";
    return "รอข้อมูล";
  }

  function issueScore(issueCount) {
    if (issueCount >= 3) return 35;
    if (issueCount >= 1) return 58;
    return 92;
  }

  function metricBar(metric) {
    const tone = metric.tone || scoreTone(metric.score);
    return `
      <div class="unit-health-row is-${tone}">
        <div class="unit-health-top">
          <span class="unit-health-title"><i aria-hidden="true"></i>${esc(metric.label)}</span>
          <strong class="unit-health-value">${esc(metric.value)}</strong>
        </div>
        <p>${esc(metric.detail)}</p>
        ${metric.meta ? `<small class="unit-helper-text">${esc(metric.meta)}</small>` : ""}
      </div>
    `;
  }

  function overallParts(metric) {
    const value = clean(metric && metric.value);
    if (!value) return { score: "รอข้อมูล", label: toneLabel(metric && metric.score) };
    const parts = value.split(/\s*[—-]\s*/).map(clean).filter(Boolean);
    return {
      score: parts[0] || value,
      label: parts[1] || toneLabel(metric && metric.score),
    };
  }

  function unitMetrics(data, unit, context) {
    const summary = unit.checklist_summary || {};
    const issueCount = Number(summary.issue_count || 0);
    const hasChecklist = !!(summary.pre_completed || summary.post_completed);
    const normal = hasChecklist && issueCount <= 0;
    const issueBasedScore = hasChecklist ? issueScore(issueCount) : null;
    const photos = unit.photos || [];
    const hasPressurePhoto = phaseCount(photos, "pressure") > 0;
    const hasTempPhoto = phaseCount(photos, "temp") > 0;
    const coilScore = context.coilScore;
    const drainScore = context.drainScore == null ? null : Math.max(0, context.drainScore - (issueCount * 12) - (context.drainRisk ? 8 : 0));

    const psiMetric = hasPressurePhoto
      ? {
          label: "น้ำยาแอร์ / PSI",
          value: "มีรูปตรวจวัดน้ำยา",
          score: null,
          tone: "unknown",
          detail: "ยังไม่มีค่าตัวเลข PSI ที่บันทึกเป็นข้อมูล",
          meta: "จะแสดงค่าตัวเลขเมื่อมีฟิลด์ที่ช่างบันทึกเป็นข้อมูลจริง",
        }
      : hasChecklist
        ? {
            label: "น้ำยาแอร์ / PSI",
            value: normal ? "ปกติจากการประเมินหน้างาน" : "ควรตรวจ",
            score: issueBasedScore,
            tone: scoreTone(issueBasedScore),
            detail: normal ? "ไม่พบสัญญาณน้ำยาขาดจากอาการและผลการทำงาน" : "มีสัญญาณให้ตรวจระบบน้ำยาเพิ่มเติม",
            meta: normal ? "เป็นผลประเมินจากเช็คลิสต์ ไม่ใช่ค่าที่วัดด้วยเกจ" : "ประเมินจากเช็คลิสต์ ไม่ใช่ค่าที่วัดด้วยเกจ",
          }
        : {
            label: "น้ำยาแอร์ / PSI",
            value: "รอข้อมูลประเมิน",
            score: null,
            tone: "unknown",
            detail: "รอข้อมูลเช็คลิสต์หรือรูปตรวจวัดสำหรับประเมินระบบน้ำยา",
            meta: "จะแสดงค่าตัวเลขเมื่อมีฟิลด์ที่ช่างบันทึกเป็นข้อมูลจริง",
          };

    const tempMetric = hasTempPhoto
      ? {
          label: "อุณหภูมิ",
          value: "มีรูปตรวจวัดอุณหภูมิ",
          score: null,
          tone: "unknown",
          detail: "ยังไม่มีค่าลมส่ง / ลมกลับที่บันทึกเป็นข้อมูล",
          meta: "จะแสดงค่าตัวเลขเมื่อมีฟิลด์ที่ช่างบันทึกเป็นข้อมูลจริง",
        }
      : hasChecklist
        ? {
            label: "อุณหภูมิ",
            value: normal ? "เย็นปกติจากการทดสอบใช้งาน" : "ควรตรวจ",
            score: issueBasedScore,
            tone: scoreTone(issueBasedScore),
            detail: normal ? "ไม่พบสัญญาณแอร์ไม่เย็นจากเช็คลิสต์หลังงาน" : "มีสัญญาณให้ตรวจอุณหภูมิ/ระบบทำความเย็นเพิ่มเติม",
            meta: normal ? "เป็นผลประเมินจากหน้างาน ไม่ใช่ค่า Delta T แบบตัวเลข" : "ประเมินจากเช็คลิสต์ ไม่ใช่ค่า Delta T แบบตัวเลข",
          }
        : {
            label: "อุณหภูมิ",
            value: "รอข้อมูลประเมิน",
            score: null,
            tone: "unknown",
            detail: "รอข้อมูลเช็คลิสต์หรือรูปตรวจวัดสำหรับประเมินอุณหภูมิ",
            meta: "จะแสดงค่าตัวเลขเมื่อมีฟิลด์ที่ช่างบันทึกเป็นข้อมูลจริง",
          };

    const airflowMetric = !hasChecklist
      ? {
          label: "แรงลม",
          value: "รอข้อมูลประเมิน",
          score: null,
          tone: "unknown",
          detail: "รอข้อมูลเช็คลิสต์สำหรับประเมินแรงลม",
          meta: "จะแสดงค่าตัวเลขเมื่อมีฟิลด์ที่ช่างบันทึกเป็นข้อมูลจริง",
        }
      : {
          label: "แรงลม",
          value: normal ? "ปกติ" : "ควรตรวจ",
          score: issueBasedScore,
          tone: scoreTone(issueBasedScore),
          detail: normal ? "ประเมินจากเช็คลิสต์และการทดสอบหลังล้าง" : "ประเมินจากเช็คลิสต์: ควรตรวจแรงลมเพิ่มเติม",
          meta: "ประเมินจากเช็คลิสต์ ไม่ใช่ค่าที่วัดด้วยเครื่องมือ",
        };

    const coilMetric = {
      label: "ความสะอาดคอยล์",
      value: coilScore == null ? "รอข้อมูล" : `${coilScore}%`,
      score: coilScore,
      tone: scoreTone(coilScore),
      detail: coilLabel(coilScore),
      meta: context.healthEstimateText,
    };

    const drainMetric = {
      label: "ระบบน้ำทิ้ง",
      value: drainScore == null ? "รอข้อมูล" : `${drainScore}%`,
      score: drainScore,
      tone: scoreTone(drainScore),
      detail: drainLabel(drainScore),
      meta: context.drainRisk ? "พบสัญญาณเกี่ยวกับน้ำหยดหรือการระบาย จึงประเมินเข้มขึ้น" : context.drainEstimateText,
    };

    const photoEvidenceScore = (hasPressurePhoto || hasTempPhoto) ? 82 : 68;
    const checklistScore = hasChecklist ? issueBasedScore : null;
    const usableScores = [coilMetric.score, drainMetric.score, checklistScore, photoEvidenceScore]
      .filter((score) => score != null && Number.isFinite(score));
    const overallScore = usableScores.length
      ? Math.max(0, Math.min(100, Math.round(usableScores.reduce((sum, score) => sum + score, 0) / usableScores.length) - Math.min(issueCount * 4, 16)))
      : null;
    const overallMetric = {
      label: "ภาพรวมสุขภาพเครื่อง",
      value: overallScore == null ? "รอข้อมูล" : `${overallScore}% — ${toneLabel(overallScore)}`,
      score: overallScore,
      tone: scoreTone(overallScore),
      detail: overallScore == null
        ? "ยังไม่มีข้อมูลพอสำหรับสรุปสุขภาพเครื่องนี้"
        : (overallScore >= 80
            ? "เครื่องนี้ยังอยู่ในสภาพดี แนะนำล้างรอบถัดไปตามกำหนด"
            : (overallScore >= 60 ? "ควรติดตามอาการและวางแผนตรวจรอบถัดไป" : "ควรให้ช่างตรวจหน้างานเพิ่มเติม")),
      meta: "ไม่รวมค่าน้ำยาและอุณหภูมิ เพราะยังไม่มีค่าที่วัดจริง",
    };

    return {
      overall: overallMetric,
      rows: [psiMetric, tempMetric, airflowMetric, coilMetric, drainMetric],
      hasChecklist,
      issueCount,
    };
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
        <h3>แดชบอร์ดสุขภาพแยกรายเครื่อง</h3>
        <p>เลือกเครื่องเพื่อดูรายงานสุขภาพ รูปงาน และสรุปเช็คลิสต์ของเครื่องนั้น</p>
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
            const metrics = unitMetrics(data, unit, context);
            const preview = photos.slice(0, 4);
            const meta = [unit.service_type, unit.ac_type, unit.btu ? `${unit.btu} BTU` : ""].filter(Boolean).join(" · ") || "เครื่องปรับอากาศ";
            const overall = overallParts(metrics.overall);
            const checklistStatus = metrics.hasChecklist
              ? (metrics.issueCount > 0 ? "ประเมินจากเช็คลิสต์" : "ระบบปกติจากเช็คลิสต์")
              : "รอเช็คลิสต์";
            return `
              <section
                class="passport-unit-page is-${metrics.overall.tone} ${index === 0 ? "is-active" : ""}"
                data-unit-page="${index}"
                role="tabpanel">
                <div class="passport-unit-head">
                  <div class="unit-title-block">
                    <b>${esc(unit.label)}</b>
                    <span>${esc(meta)}</span>
                    ${unit.unit_code ? `<small>${esc(unit.unit_code)}</small>` : ""}
                  </div>
                  <div class="unit-score-block">
                    <strong class="unit-score-number">${esc(overall.score)}</strong>
                    <span class="unit-score-label">${esc(overall.label)}</span>
                  </div>
                </div>
                <div class="passport-unit-dashboard">
                  <div class="unit-overall-summary">
                    <span>${esc(checklistStatus)}</span>
                    ${metrics.issueCount > 0 ? `<strong>พบ ${metrics.issueCount} จุดที่ควรตรวจ</strong>` : ""}
                    <p>${esc(metrics.overall.detail)}</p>
                    ${metrics.overall.meta ? `<small>${esc(metrics.overall.meta)}</small>` : ""}
                  </div>
                  <div class="unit-health-grid">
                    ${metrics.rows.map(metricBar).join("")}
                  </div>
                  <div class="unit-evidence-grid">
                    <div class="unit-checklist-box">
                      <b>เช็คลิสต์</b>
                      <p>${esc(checklistCopy(unit.checklist_summary))}</p>
                      <small>ประเมินจากเช็คลิสต์ ยังไม่มีค่าที่ช่างวัดเป็นตัวเลข</small>
                    </div>
                    <div class="unit-photo-box">
                      <b>รูปก่อน / หลัง</b>
                      <div class="passport-unit-stats">
                        <span>ก่อนทำ <b>${before}</b></span>
                        <span>หลังทำ <b>${after}</b></span>
                        <span>รวม <b>${photos.length}</b></span>
                      </div>
                      <p>${esc(measurementSummary(photos))}</p>
                    </div>
                  </div>
                  ${preview.length ? `
                    <div class="passport-unit-photos">
                      ${preview.map((photo) => `
                        <a href="${esc(photo.url)}" target="_blank" rel="noopener" aria-label="เปิดรูปงานรายเครื่อง">
                          <img src="${esc(photo.url)}" alt="${esc(photo.phase || "รูปงาน")}" loading="lazy">
                        </a>
                      `).join("")}
                    </div>
                    <a class="unit-photo-link" href="${esc(preview[0].url)}" target="_blank" rel="noopener">ดูรูปเครื่องนี้</a>
                  ` : `<small>ยังไม่มีรูปที่แยกกับเครื่องนี้</small>`}
                </div>
              </section>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }

  function renderHealthBar(score) {
    const value = score == null ? 0 : score;
    return `
      <div class="passport-health-bar is-${healthTone(score)}" aria-hidden="true">
        <span style="width:${value}%"></span>
      </div>
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
    if (isDone(data)) return "completed";
    if (mode === "urgent" && noTech) return "urgent_no_tech";
    if (clean(data.started_at)) return "started";
    if (clean(data.checkin_at)) return "checked_in";
    if (clean(data.travel_started_at)) return "traveling";
    if (hasAssignedTech(data) || status.includes("รอดำเนินการ")) return "assigned";
    return mode === "urgent" ? "urgent_waiting" : "waiting";
  }

  function statusCopy(data, mode) {
    const phase = jobPhase(data, mode);
    if (phase === "completed") return "งานเสร็จแล้ว";
    if (phase === "started") return "กำลังให้บริการ";
    if (phase === "checked_in") return "ช่างถึงหน้างานแล้ว";
    if (phase === "traveling") return "ช่างกำลังเดินทาง";
    if (phase === "assigned") return mode === "urgent" ? "ช่างรับงานแล้ว" : "ยืนยันคิวแล้ว";
    if (phase === "urgent_no_tech") return "แอดมินกำลังช่วยตรวจสอบคิวด่วน";
    if (phase === "urgent_waiting") return "ส่งคำขอคิวด่วนแล้ว รอช่างรับงานหรือแอดมินยืนยัน";
    return "รับคำขอจองแล้ว รอแอดมินตรวจสอบคิว";
  }

  function statusDetailCopy(data, mode) {
    const phase = jobPhase(data, mode);
    const hasPhotos = hasPhotoContent(data);
    if (phase === "completed") {
      return hasPhotos
        ? "งานบริการเสร็จสิ้นแล้ว สามารถดูรูปงาน เอกสาร การรับประกัน และรีวิวได้"
        : "งานบริการเสร็จสิ้นแล้ว สามารถดูเอกสาร การรับประกัน และการให้คะแนนได้";
    }
    if (phase === "started") return "ทีมช่างกำลังให้บริการ";
    if (phase === "checked_in") return "ทีมช่างถึงหน้างานแล้ว";
    if (phase === "traveling") return "ช่างกำลังเดินทางไปยังสถานที่นัดหมาย";
    if (phase === "assigned") return "มีทีมช่างรับผิดชอบงานนี้แล้ว";
    if (phase === "urgent_no_tech") return "แอดมินกำลังช่วยตรวจสอบคิวด่วน คำขอยังไม่ถือว่ายืนยันงาน";
    if (phase === "urgent_waiting") return "กำลังรอช่างรับงานหรือแอดมินยืนยัน คำขอยังไม่ถือว่ายืนยันงาน";
    return "แอดมินจะตรวจสอบคิวและมอบหมายทีมก่อนถึงเวลานัด";
  }

  function nextActionCopy(data, mode) {
    const phase = jobPhase(data, mode);
    const hasPhotos = hasPhotoContent(data);
    if (phase === "completed") {
      return hasPhotos
        ? "ดูรูปงาน เอกสาร การรับประกัน และรีวิวงานนี้"
        : "ดูเอกสาร การรับประกัน และให้คะแนนงานนี้";
    }
    if (phase === "started") return "รอทีมช่างทำงานให้เสร็จ หลังจบงานจะเห็นเอกสารหลังบริการ";
    if (phase === "checked_in") return "เตรียมพื้นที่หน้างานให้พร้อมสำหรับเริ่มบริการ";
    if (phase === "traveling") return "รอรับทีมช่างที่กำลังเดินทางไปหน้างาน";
    if (phase === "assigned") return "รอถึงเวลานัด หรือเปิดแผนที่หากต้องการดูสถานที่งาน";
    if (phase === "urgent_no_tech") return "รอแอดมินช่วยตรวจสอบ หรือเปลี่ยนเป็นจองล่วงหน้าถ้าไม่รีบด่วน";
    if (phase === "urgent_waiting") return "รอช่างรับงาน หรือให้แอดมินช่วยยืนยันคิวด่วน";
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
    const warranty = warrantyInfo(data, completedAt);
    const units = unitList(data);
    const unitMeasurementPhotos = units.reduce((sum, unit) => sum + phaseCount(unit.photos || [], "pressure") + phaseCount(unit.photos || [], "current") + phaseCount(unit.photos || [], "temp"), 0);
    const next = recommendation(data, coilScore, drainScore, profile, done);
    const completionText = done ? "งานเสร็จสิ้นแล้ว" : "รอข้อมูลงานเสร็จสิ้น";
    const serviceDateText = date ? root.utils.formatDateTime(date.toISOString()) : "-";
    const warrantyStatus = warranty
      ? (warranty.active ? "อยู่ในประกันงานล้าง" : "หมดประกันงานล้างแล้ว")
      : "แสดงเงื่อนไขประกันงานล้างตามข้อมูลที่มี";
    const warrantyMeta = warranty
      ? `${warranty.active ? `เหลือ ${warranty.daysLeft} วัน` : "ครบ 30 วันแล้ว"} · สิ้นสุด ${root.utils.formatDateTime(warranty.end.toISOString())}`
      : "ยังไม่มีวันที่ปิดงานที่ชัดเจนสำหรับนับประกัน";
    const healthEstimateText = usesAppointmentEstimate
      ? "ประเมินจากวันนัดหมาย เนื่องจากยังไม่มีวันที่ปิดงาน"
      : "ประเมินจากวันที่ล้างล่าสุด";
    const drainEstimateText = usesAppointmentEstimate
      ? "ประเมินจากวันนัดหมาย เนื่องจากยังไม่มีวันที่ปิดงาน"
      : "ประเมินจากวันที่ล้างล่าสุดและประวัติงาน";

    return `
      <section class="passport-shell">
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
              <div><b>สถานะ</b><span>${esc(data.job_status || "-")}</span></div>
              <div><b>บริการ</b><span>${esc(serviceSummary(data))}</span></div>
              <div><b>วันที่บริการ</b><span>${esc(serviceDateText)}</span></div>
            </div>
            ${done && clean(data.technician_note) ? `<div class="passport-note"><b>หมายเหตุจากช่าง</b><p>${esc(data.technician_note)}</p></div>` : ""}
          </article>

          <article class="passport-card">
            <div class="passport-card-head">
              <span>Coil Cleanliness</span>
              <strong>${coilScore == null ? "-" : `${coilScore}%`}</strong>
            </div>
            ${renderHealthBar(coilScore)}
            <h3>${esc(coilLabel(coilScore))}</h3>
            <p>${esc(healthEstimateText)}</p>
            <small>รอบแนะนำสำหรับ ${esc(profile.label)}: ${esc(profile.nextText)}</small>
          </article>

          <article class="passport-card">
            <div class="passport-card-head">
              <span>Drain Health</span>
              <strong>${drainScore == null ? "-" : `${drainScore}%`}</strong>
            </div>
            ${renderHealthBar(drainScore)}
            <h3>${esc(drainLabel(drainScore))}</h3>
            <p>${esc(drainEstimateText)}</p>
            <small>${hasDrainRisk(data) ? "พบสัญญาณเกี่ยวกับระบบน้ำทิ้งในประวัติงาน จึงแนะนำตรวจเร็วขึ้น" : "ยังไม่พบสัญญาณเสี่ยงจากข้อมูลที่เปิดให้ลูกค้าเห็น"}</small>
          </article>

          <article class="passport-card passport-muted-card">
            <div class="passport-card-head">
              <span>Refrigerant / PSI</span>
              <strong>${unitMeasurementPhotos ? "มีรูปตรวจวัด" : "ไม่มีค่าวัด"}</strong>
            </div>
            <h3>สถานะน้ำยา: ${unitMeasurementPhotos ? "มีรูปการตรวจวัด แต่ยังไม่มีค่าตัวเลข" : "ยังไม่มีข้อมูลวัดจริง"}</h3>
            <p>ค่า PSI จะแสดงเมื่อช่างบันทึกค่าที่วัดจริง</p>
            <small>ค่าแรงดันต้องดูร่วมกับชนิดน้ำยา อุณหภูมิ กระแสไฟ รุ่นเครื่อง และสภาพหน้างาน</small>
          </article>

          <article class="passport-card passport-muted-card">
            <div class="passport-card-head">
              <span>Temperature</span>
              <strong>${unitMeasurementPhotos ? "มีรูปตรวจวัด" : "ไม่มีค่าวัด"}</strong>
            </div>
            <h3>สถานะอุณหภูมิ: ${unitMeasurementPhotos ? "มีรูปการตรวจวัด แต่ยังไม่มีค่าตัวเลข" : "ยังไม่มีข้อมูลวัดจริง"}</h3>
            <p>ระบบจะแสดงลมส่ง / ลมกลับ เมื่อมีการบันทึกค่าจากช่าง</p>
            <small>ยังไม่มี delta T เพราะระบบยังไม่ได้รับค่าที่วัดจริง</small>
          </article>

          <article class="passport-card passport-warranty-card">
            <div class="passport-card-head">
              <span>Warranty</span>
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

          <article class="passport-card passport-recommend-card">
            <div class="passport-card-head">
              <span>Next Service</span>
              <strong>คำแนะนำ</strong>
            </div>
            <h3>${esc(next.title)}</h3>
            <p>${esc(next.reason)}</p>
          </article>

          ${renderUnitPassportCards(data, units, { coilScore, drainScore, drainRisk: hasDrainRisk(data), healthEstimateText, drainEstimateText })}

        </div>
      </section>
    `;
  }

  function renderTechnicianCard(data) {
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
    const url = receiptUrl(data);
    if (!url) return "";
    return `
      <section class="tracking-extra-card receipt-card">
        <div>
          <strong>เอกสารหลังบริการ</strong>
          <p class="muted">เปิดใบรับเงินหรือ E-slip จากข้อมูลเดิมของระบบ</p>
        </div>
        <a class="secondary-btn" href="${esc(url)}" target="_blank" rel="noopener">เปิด E-slip</a>
      </section>
    `;
  }

  function renderReview(data) {
    if (!isDone(data)) return "";
    const review = data.review || {};
    if (review.already_reviewed) {
      return `
        <section class="tracking-extra-card review-summary-card">
          <div class="section-head compact">
            <span class="section-kicker">Review</span>
            <h2>รีวิวของคุณ</h2>
          </div>
          <p><strong>${esc(review.rating || "-")} / 5</strong></p>
          ${review.review_text ? `<p class="muted preserve-lines">${esc(review.review_text)}</p>` : ""}
        </section>
      `;
    }
    const key = data.booking_token || data.booking_code || "";
    if (!key) return "";
    return `
      <section class="tracking-extra-card review-form-card">
        <div class="section-head compact">
          <span class="section-kicker">Review</span>
          <h2>ให้คะแนนงานนี้</h2>
        </div>
        <form data-review-form>
          <input type="hidden" name="q" value="${esc(key)}">
          <label class="field">
            <span>คะแนน</span>
            <select class="input" name="rating">
              <option value="5">5 - ดีมาก</option>
              <option value="4">4 - ดี</option>
              <option value="3">3 - พอใช้</option>
              <option value="2">2 - ควรปรับปรุง</option>
              <option value="1">1 - ไม่พอใจ</option>
            </select>
          </label>
          <label class="field">
            <span>รีวิว</span>
            <textarea class="input" name="review_text" rows="3" placeholder="เขียนรีวิว (ถ้ามี)"></textarea>
          </label>
          <label class="field">
            <span>ข้อเสนอแนะ / ร้องเรียน</span>
            <textarea class="input" name="complaint_text" rows="2" placeholder="ส่งถึงทีม CWF (ถ้ามี)"></textarea>
          </label>
          <button class="primary-btn" type="submit">ส่งรีวิว</button>
          <p class="muted" data-review-status></p>
        </form>
      </section>
    `;
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
    const content = [
      renderReceipt(data),
      renderReview(data),
      renderWarranty(data),
    ].filter(Boolean).join("");
    return content || root.utils.stateBox("", "รายละเอียดหลังบริการจะแสดงหลังงานเสร็จ");
  }

  function renderJobDetails(data, photos, maps, trackingKey) {
    return `
      <div class="data-list tracking-summary-list">
        <div class="data-row"><strong>รหัสติดตาม</strong><span class="muted">${esc(trackingKey || "-")}</span></div>
        <div class="data-row"><strong>นัดหมาย</strong><span class="muted">${root.utils.formatDateTime(data.appointment_datetime)}</span></div>
        <div class="data-row"><strong>บริการ</strong><span class="muted">${esc(serviceSummary(data))}</span></div>
        <div class="data-row"><strong>ราคาโดยประมาณ</strong><span class="muted">${esc(money(data.job_price || data.base_total))}</span></div>
        <div class="data-row"><strong>ระยะเวลา</strong><span class="muted">${data.duration_min ? `${Number(data.duration_min)} นาที` : "-"}</span></div>
        <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${esc(data.address_text || "-")}</span></div>
        ${data.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${esc(data.job_zone)}</span></div>` : ""}
        ${maps ? `<div class="data-row"><strong>แผนที่</strong><span><a class="mini-link" href="${esc(maps)}" target="_blank" rel="noopener">นำทางไปหน้างาน</a></span></div>` : ""}
        <div class="data-row"><strong>หลังจบงาน</strong><span class="muted">รูปงาน ${photos.length} รายการ ${data.receipt_url ? "และมีเอกสารหลังบริการ" : ""}</span></div>
      </div>
    `;
  }

  function renderPhotoView(data) {
    const content = [renderPhotos(data), renderTechnicianNote(data)].filter(Boolean).join("");
    return content || root.utils.stateBox("", "รูปงานจะแสดงหลังช่างอัปโหลดและงานเสร็จ");
  }

  function renderTrackingResult() {
    const state = root.state.tracking;
    if (state.status === "idle") return root.utils.stateBox("", "กรอกเลขงานหรือรหัสติดตามเพื่อดูสถานะจากระบบ");
    if (state.status === "loading") return root.utils.stateBox("loading", "กำลังค้นหาสถานะงาน...");
    if (state.status === "error") return root.utils.stateBox("error", state.error || "ไม่พบข้อมูลงาน");

    const data = state.data || {};
    const mode = modeFromData(data);
    const photos = photoList(data);
    const maps = mapUrl(data);
    const trackingKey = data.booking_token || data.booking_code || "";
    const done = isDone(data);
    const units = unitList(data);
    const appointmentText = data.appointment_datetime ? root.utils.formatDateTime(data.appointment_datetime) : "-";
    const overview = `
      <div class="tracking-premium-overview">
        <div class="status-hero is-${mode}">
          <strong>${esc(statusCopy(data, mode))}</strong>
          <span>${esc(statusDetailCopy(data, mode))}</span>
        </div>
        <div class="tracking-quick-grid">
          <div>
            <span>นัดหมาย</span>
            <strong>${esc(appointmentText)}</strong>
          </div>
          <div>
            <span>ขั้นตอนถัดไป</span>
            <strong>${esc(nextActionCopy(data, mode))}</strong>
          </div>
        </div>
        ${renderTechnicianCard(data)}
        <div class="support-strip">
          ${maps ? `<a class="secondary-btn" href="${esc(maps)}" target="_blank" rel="noopener">เปิดแผนที่</a>` : ""}
          <button class="secondary-btn" type="button" data-action="track-refresh">รีเฟรช</button>
          <a class="secondary-btn" href="tel:${ADMIN_PHONE}">โทรหา CWF</a>
          <a class="secondary-btn" href="${LINE_URL}" target="_blank" rel="noopener">LINE หา CWF</a>
          ${mode === "urgent" && !hasAssignedTech(data) ? `<button class="secondary-btn" type="button" data-route="scheduled">เปลี่ยนเป็นจองล่วงหน้า</button>` : ""}
        </div>
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
        label: "เอกสาร",
        meta: "รีวิว/ประกัน",
        content: renderAftercare(data),
      });
    }

    const activeView = views[0].id;

    return `
      <div class="tracking-result-card">
        <div class="tracking-topline">
          <span class="mode-badge is-${mode}">${mode === "urgent" ? "คิวด่วน" : "จองล่วงหน้า"}</span>
          <div class="tracking-code-pill">${esc(data.booking_code || "ไม่พบเลขงาน")}</div>
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
    const assigned = hasAssignedTech(data);
    const travel = !!clean(data.travel_started_at);
    const checkin = !!clean(data.checkin_at);
    const started = !!clean(data.started_at);
    const done = isDone(data);
    const steps = [
      {
        title: mode === "urgent" ? "ส่งคำขอคิวด่วนแล้ว" : "รับคำขอจองแล้ว",
        copy: mode === "urgent" ? "ระบบรับคำขอแล้ว แต่ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน" : "รอแอดมินตรวจสอบคิวและรายละเอียด",
        ok: true,
      },
      {
        title: mode === "urgent" ? "ช่างรับงาน / แอดมินยืนยัน" : "ยืนยันคิวและมอบหมายทีม",
        copy: assigned ? "มีทีมดูแลงานนี้แล้ว" : "แอดมินกำลังช่วยจัดคิวให้",
        ok: assigned,
      },
      { title: "ช่างกำลังเดินทาง", copy: data.travel_started_at ? root.utils.formatDateTime(data.travel_started_at) : "จะแสดงเมื่อช่างเริ่มเดินทาง", ok: travel },
      { title: "ถึงหน้างาน", copy: data.checkin_at ? root.utils.formatDateTime(data.checkin_at) : "จะแสดงเมื่อทีมเช็กอิน", ok: checkin },
      { title: "เริ่มให้บริการ", copy: data.started_at ? root.utils.formatDateTime(data.started_at) : "จะแสดงเมื่อทีมเริ่มงาน", ok: started },
      { title: "งานเสร็จแล้ว", copy: data.finished_at ? root.utils.formatDateTime(data.finished_at) : "หลังจบงานจะแสดงรูป เอกสาร รีวิว และเงื่อนไขรับประกัน", ok: done },
    ];
    const firstPending = steps.findIndex((step) => !step.ok);
    return root.utils.timeline(steps.map((step, index) => ({
      title: step.title,
      copy: step.copy,
      kind: step.ok ? "" : timelineState(false, index === firstPending),
    })));
  }

  async function lookup(container) {
    const input = container.querySelector("#tracking-code");
    const q = String(input.value || "").trim();
    root.state.updateDraft("tracking", { trackingCode: q });
    if (!q) {
      root.state.setTracking({ status: "error", data: null, error: "กรุณากรอกเลขงานหรือรหัสติดตาม" });
      container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
      return;
    }
    root.state.setTracking({ status: "loading", data: null, error: "" });
    container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
    try {
      const data = await root.api.trackBooking(q);
      root.state.setTracking({ status: "success", data, error: "" });
    } catch (error) {
      root.state.setTracking({ status: "error", data: null, error: error.message });
    }
    container.querySelector("[data-tracking-result]").innerHTML = renderTrackingResult();
    const timeline = container.querySelector("[data-tracking-timeline]");
    if (timeline) timeline.innerHTML = renderTimeline();
    bindResultActions(container);
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

    const refresh = container.querySelector("[data-action='track-refresh']");
    if (refresh) refresh.addEventListener("click", () => lookup(container), { once: true });
    const form = container.querySelector("[data-review-form]");
    if (form) {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = form.querySelector("[data-review-status]");
        const submit = form.querySelector("button[type='submit']");
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.rating = Number(payload.rating || 5);
        if (status) status.textContent = "กำลังส่งรีวิว...";
        if (submit) submit.disabled = true;
        try {
          const response = await fetch(`${root.api.getApiBase()}/public/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "ส่งรีวิวไม่สำเร็จ");
          if (status) status.textContent = "ส่งรีวิวเรียบร้อย ขอบคุณครับ";
          setTimeout(() => lookup(container), 500);
        } catch (error) {
          if (status) status.textContent = error.message || "ส่งรีวิวไม่สำเร็จ";
          if (submit) submit.disabled = false;
        }
      });
    }
  }

  root.tracking = {
    render(container) {
      const code = root.state.draft.tracking.trackingCode || "";
      container.innerHTML = `
        <section class="screen">
          <div class="hero tracking-hero">
            <div class="hero-badge">Live job status</div>
            <h2>ติดตามงาน</h2>
            <p>ใส่เลขงานหรือรหัสติดตาม เพื่อดูสถานะสำคัญตั้งแต่รับคำขอจนจบงาน</p>
          </div>
          <section class="card lookup-card">
            <div class="section-head">
              <span class="section-kicker">Tracking</span>
              <h2>ค้นหางานของคุณ</h2>
            </div>
            <div class="field">
              <label for="tracking-code">เลขงาน / รหัสติดตาม</label>
              <input id="tracking-code" class="input" placeholder="เช่น CWFXXXXXXX" value="${esc(code)}">
            </div>
            <div class="button-row">
              <button class="primary-btn" type="button" data-action="track-read">ตรวจสอบสถานะงาน</button>
            </div>
          </section>
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">Result</span>
              <h2>ผลการติดตาม</h2>
            </div>
            <div data-tracking-result>${renderTrackingResult()}</div>
          </section>
        </section>
      `;
      container.querySelector("[data-action='track-read']").addEventListener("click", () => lookup(container));
      container.querySelector("#tracking-code").addEventListener("change", (event) => {
        root.state.updateDraft("tracking", { trackingCode: event.target.value });
      });
      bindResultActions(container);
      if (code && root.state.tracking.status === "idle") {
        setTimeout(() => lookup(container), 0);
      }
    },
  };
})();
