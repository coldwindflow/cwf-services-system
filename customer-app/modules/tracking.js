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

  function timelineState(done, current) {
    if (done) return "done";
    return current ? "current" : "pending";
  }

  function statusCopy(data, mode) {
    const status = clean(data.job_status);
    const assigned = hasAssignedTech(data);
    const done = isDone(data);
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
          ${maps ? `<div class="data-row"><strong>แผนที่</strong><span><a class="mini-link" href="${esc(maps)}" target="_blank" rel="noopener">นำทางไปหน้างาน</a></span></div>` : ""}
          <div class="data-row"><strong>หลังจบงาน</strong><span class="muted">รูปงาน ${photos.length} รายการ ${data.receipt_url ? "และมีเอกสารหลังบริการ" : ""}</span></div>
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
        ${renderTechnicianNote(data)}
        ${renderPhotos(data)}
        ${renderReceipt(data)}
        ${renderReview(data)}
        ${renderWarranty(data)}
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
      if (code && root.state.tracking.status === "idle") {
        setTimeout(() => lookup(container), 0);
      }
    },
  };
})();
