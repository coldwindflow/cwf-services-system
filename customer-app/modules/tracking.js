(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  const ADMIN_PHONE = "098-877-7321";
  const LINE_URL = "https://lin.ee/fG1Oq7y";

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

  function statusCopy(data, mode) {
    const status = clean(data.job_status);
    const assigned = !!(data.technician || (Array.isArray(data.technician_team) && data.technician_team.length));
    const done = status.includes("เสร็จ") || clean(data.finished_at);
    const traveling = clean(data.travel_started_at);
    const started = clean(data.started_at) || clean(data.checkin_at);
    const noTech = status.includes("ไม่พบช่าง") || status.includes("ตีกลับ");

    if (mode === "urgent") {
      if (done) return "งานเสร็จแล้ว";
      if (started) return "กำลังให้บริการ";
      if (traveling) return "ช่างกำลังเดินทาง";
      if (assigned) return "ช่างรับงานแล้ว";
      if (noTech) return "แอดมินกำลังช่วยตรวจสอบคิวด่วน";
      return "ส่งคำขอคิวด่วนแล้ว กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงานจนกว่าจะมีช่างรับหรือแอดมินยืนยัน";
    }

    if (done) return "งานเสร็จแล้ว";
    if (started) return "กำลังให้บริการ";
    if (traveling) return "ช่างกำลังเดินทาง";
    if (assigned || status.includes("รอดำเนินการ")) return "ยืนยันคิวแล้ว";
    return "รับคำขอจองแล้ว รอแอดมินตรวจสอบคิว";
  }

  function renderTechnicianCard(data) {
    const list = [];
    if (data.technician) list.push(data.technician);
    if (Array.isArray(data.technician_team)) {
      data.technician_team.forEach((tech) => {
        if (tech && !list.some((x) => clean(x.username) === clean(tech.username))) list.push(tech);
      });
    }
    if (!list.length) {
      return `
        <div class="tracking-tech-card is-empty">
          <div>
            <strong>ยังไม่ได้มอบหมายช่าง</strong>
            <span class="muted">แอดมินกำลังตรวจสอบคิว หรือระบบกำลังรอช่างพาร์ทเนอร์รับงาน</span>
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
          <span class="muted">${esc(primary.grade || primary.rank_key || "ทีมบริการ CWF")}</span>
          ${primary.phone ? `<a class="mini-link" href="tel:${esc(primary.phone)}">โทรหาช่าง</a>` : ""}
          ${list.length > 1 ? `<div class="team-strip">${list.map((tech) => `<span>${esc(tech.full_name || tech.username || "ทีมช่าง")}</span>`).join("")}</div>` : ""}
        </div>
      </div>
    `;
  }

  function renderTrackingResult() {
    const state = root.state.tracking;
    if (state.status === "idle") return root.utils.stateBox("", "กรอกเลขงานหรือรหัสติดตามเพื่อดูสถานะจากระบบ");
    if (state.status === "loading") return root.utils.stateBox("loading", "กำลังค้นหาสถานะงาน...");
    if (state.status === "error") return root.utils.stateBox("error", state.error || "ไม่พบข้อมูลงาน");

    const data = state.data || {};
    const mode = modeFromData(data);
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const maps = clean(data.maps_url);
    const trackingKey = data.booking_token || data.booking_code || "";
    return `
      <div class="tracking-result-card">
        <div class="tracking-topline">
          <span class="mode-badge is-${mode}">${mode === "urgent" ? "คิวด่วน" : "จองล่วงหน้า"}</span>
          <div class="tracking-code-pill">${esc(data.booking_code || "ไม่พบเลขงาน")}</div>
        </div>
        <div class="status-hero is-${mode}">
          <strong>${esc(statusCopy(data, mode))}</strong>
          <span>${mode === "urgent" ? "คิวด่วนจะยืนยันเมื่อมีช่างรับงานหรือแอดมินยืนยันเท่านั้น" : "แอดมินจะตรวจสอบคิวและมอบหมายทีมก่อนถึงเวลานัด"}</span>
        </div>
        <div class="data-list">
          <div class="data-row"><strong>รหัสติดตาม</strong><span class="muted">${esc(trackingKey || "-")}</span></div>
          <div class="data-row"><strong>นัดหมาย</strong><span class="muted">${root.utils.formatDateTime(data.appointment_datetime)}</span></div>
          <div class="data-row"><strong>บริการ</strong><span class="muted">${esc(serviceSummary(data))}</span></div>
          <div class="data-row"><strong>ราคาโดยประมาณ</strong><span class="muted">${esc(money(data.job_price || data.base_total))}</span></div>
          <div class="data-row"><strong>ระยะเวลา</strong><span class="muted">${data.duration_min ? `${Number(data.duration_min)} นาที` : "-"}</span></div>
          <div class="data-row"><strong>ที่อยู่</strong><span class="muted">${esc(data.address_text || "-")}</span></div>
          ${data.job_zone ? `<div class="data-row"><strong>พื้นที่</strong><span class="muted">${esc(data.job_zone)}</span></div>` : ""}
          ${maps ? `<div class="data-row"><strong>แผนที่</strong><span><a class="mini-link" href="${esc(maps)}" target="_blank" rel="noopener">เปิดแผนที่</a></span></div>` : ""}
          <div class="data-row"><strong>หลังจบงาน</strong><span class="muted">รูปงาน ${photos.length} รายการ ${data.receipt_url ? "และมีเอกสารหลังบริการ" : ""}</span></div>
        </div>
        ${renderTechnicianCard(data)}
        <div class="support-strip">
          <button class="secondary-btn" type="button" data-action="track-refresh">รีเฟรช</button>
          <a class="secondary-btn" href="tel:${ADMIN_PHONE}">โทรหา CWF</a>
          <a class="secondary-btn" href="${LINE_URL}" target="_blank" rel="noopener">LINE หา CWF</a>
        </div>
        <p class="muted support-note">ต้องการแก้ไขเวลา เลื่อนนัด หรือยกเลิกงาน กรุณาติดต่อแอดมิน CWF</p>
      </div>
    `;
  }

  function renderTimeline() {
    const data = root.state.tracking.data || {};
    const mode = modeFromData(data);
    const urgent = mode === "urgent";
    return root.utils.timeline(urgent ? [
      { title: "ส่งคำขอคิวด่วนแล้ว", copy: "กำลังรอช่างพาร์ทเนอร์กดรับงาน ยังไม่ถือว่ายืนยันงาน", kind: "" },
      { title: "ช่างรับงานแล้ว", copy: "ยืนยันเมื่อมีช่างกดรับหรือแอดมินยืนยัน", kind: "muted" },
      { title: "แอดมินช่วยตรวจสอบคิวด่วน", copy: "ใช้เมื่อไม่มีช่างรับในเวลาที่กำหนด", kind: "muted" },
    ] : [
      { title: "รับคำขอจองแล้ว", copy: "รอแอดมินตรวจสอบคิว", kind: "" },
      { title: "ยืนยันคิวแล้ว", copy: "แอดมินมอบหมายทีมช่างแล้ว", kind: "muted" },
      { title: "ช่างกำลังเดินทาง", copy: "แสดงเมื่อช่างเริ่มเดินทาง", kind: "muted" },
      { title: "กำลังให้บริการ", copy: "แสดงเมื่อทีมเริ่มงาน", kind: "muted" },
      { title: "งานเสร็จแล้ว", copy: "ดูรูปงานและข้อมูลหลังบริการ", kind: "muted" },
    ]);
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
    const refresh = container.querySelector("[data-action='track-refresh']");
    if (refresh) refresh.addEventListener("click", () => lookup(container), { once: true });
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
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">Timeline</span>
              <h2>ขั้นตอนถัดไป</h2>
            </div>
            <div data-tracking-timeline>${root.state.tracking.data ? renderTimeline() : root.utils.stateBox("", "ระบบจะแสดงขั้นตอนตามประเภทงานหลังค้นหา")}</div>
          </section>
        </section>
      `;
      container.querySelector("[data-action='track-read']").addEventListener("click", () => lookup(container));
      container.querySelector("#tracking-code").addEventListener("change", (event) => {
        root.state.updateDraft("tracking", { trackingCode: event.target.value });
      });
      bindResultActions(container);
    },
  };
})();
