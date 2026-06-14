(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function payloadFromDraft() {
    const draft = root.state.draft.scheduled || {};
    return {
      job_type: draft.job_type || "ล้าง",
      ac_type: draft.ac_type || "ผนัง",
      wash_variant: draft.wash_variant || "ล้างธรรมดา",
      btu: Number(draft.btu || 12000),
      machine_count: Number(draft.machine_count || 1),
    };
  }

  function renderPricing() {
    const pricing = root.state.scheduledPreview.pricing;
    if (pricing.status === "loading") return root.utils.stateBox("loading", "กำลังประเมินราคา...");
    if (pricing.status === "error") return root.utils.stateBox("error", `ประเมินราคาไม่สำเร็จ: ${pricing.error}`);
    if (!pricing.data) return root.utils.stateBox("", "กดปุ่มประเมินราคาเพื่อดูราคาประมาณการจากระบบ");
    const data = pricing.data;
    const finalPrice = data.promo && data.promo.total_after_discount != null
      ? data.promo.total_after_discount
      : (data.active_price || data.standard_price);
    return `
      <div class="preview-grid">
        <div class="preview-card">
          <span class="muted">ราคาประมาณการ</span>
          <strong>${root.utils.formatBaht(finalPrice)}</strong>
        </div>
        <div class="preview-card">
          <span class="muted">เวลาทำงานโดยประมาณ</span>
          <strong>${root.utils.escapeHtml(data.duration_min || "-")} นาที</strong>
        </div>
        ${data.promo ? `
          <div class="state-box is-success">ใช้โปรโมชัน: ${root.utils.escapeHtml(data.promo.promo_name || "-")}</div>
        ` : root.utils.stateBox("", "ยังไม่มีโปรโมชันที่ใช้กับรายการนี้")}
      </div>
    `;
  }

  function renderAvailability() {
    const availability = root.state.scheduledPreview.availability;
    if (availability.status === "loading") return root.utils.stateBox("loading", "กำลังโหลดเวลาว่าง...");
    if (availability.status === "error") return root.utils.stateBox("error", `โหลดเวลาว่างไม่สำเร็จ: ${availability.error}`);
    if (!availability.data) return root.utils.stateBox("", "เลือกวันแล้วกดโหลดเวลาว่างเพื่อดูช่วงเวลาจากระบบ");
    const slots = Array.isArray(availability.data.slots) ? availability.data.slots : [];
    const available = slots.filter((slot) => slot && slot.available);
    if (!slots.length) return root.utils.stateBox("", "ยังไม่พบช่วงเวลาในวันที่เลือก");
    if (!available.length) return root.utils.stateBox("", "วันที่เลือกยังไม่มีช่วงเวลาว่าง");
    return `
      <div class="slot-list">
        ${available.slice(0, 18).map((slot) => `
          <span class="slot-chip">${root.utils.escapeHtml(slot.start)}-${root.utils.escapeHtml(slot.end)}</span>
        `).join("")}
      </div>
      <p class="muted">แสดง ${available.length} ช่วงเวลาว่างจาก ${slots.length} ช่วงเวลา</p>
    `;
  }

  async function refreshPricing(container) {
    root.state.setScheduledPreview("pricing", { status: "loading", data: null, error: "" });
    container.querySelector("[data-pricing-preview]").innerHTML = renderPricing();
    try {
      const data = await root.api.previewPricing(payloadFromDraft());
      root.state.setScheduledPreview("pricing", { status: "success", data, error: "" });
    } catch (error) {
      root.state.setScheduledPreview("pricing", { status: "error", data: null, error: error.message });
    }
    container.querySelector("[data-pricing-preview]").innerHTML = renderPricing();
  }

  async function refreshAvailability(container) {
    root.state.setScheduledPreview("availability", { status: "loading", data: null, error: "" });
    container.querySelector("[data-availability-preview]").innerHTML = renderAvailability();
    const draft = root.state.draft.scheduled || {};
    const duration = root.state.scheduledPreview.pricing.data
      ? Number(root.state.scheduledPreview.pricing.data.duration_min || 60)
      : 60;
    try {
      const data = await root.api.loadAvailability({
        date: draft.date,
        tech_type: draft.tech_type || "company",
        duration_min: duration,
        ...payloadFromDraft(),
      });
      root.state.setScheduledPreview("availability", { status: "success", data, error: "" });
    } catch (error) {
      root.state.setScheduledPreview("availability", { status: "error", data: null, error: error.message });
    }
    container.querySelector("[data-availability-preview]").innerHTML = renderAvailability();
  }

  function bind(container) {
    container.querySelectorAll("[data-scheduled-field]").forEach((field) => {
      field.addEventListener("change", () => {
        const patch = {};
        patch[field.getAttribute("data-scheduled-field")] = field.value;
        root.state.updateDraft("scheduled", patch);
      });
    });
    container.querySelector("[data-action='preview-price']").addEventListener("click", () => refreshPricing(container));
    container.querySelector("[data-action='load-slots']").addEventListener("click", () => refreshAvailability(container));
  }

  root.bookingScheduled = {
    // Scheduled booking rule:
    // Customer selects date/time from real technician availability in Phase 2A.
    // Phase 2A must not call /public/book or mutate production booking data.
    render(container) {
      const draft = root.state.draft.scheduled || {};
      container.innerHTML = `
        <section class="screen">
          <div class="hero">
            <h2>จองล่วงหน้า</h2>
            <p>ดูราคาประมาณการและเวลาว่างจากระบบ ก่อนรอบถัดไปที่เปิดส่งคำขอจองจริง</p>
          </div>
          <section class="card">
            <h2>ข้อมูลสำหรับประเมิน</h2>
            <div class="form-grid">
              <div class="field">
                <label for="scheduled-job-type">ประเภทงาน</label>
                <select id="scheduled-job-type" class="select" data-scheduled-field="job_type">
                  <option value="ล้าง" ${draft.job_type === "ล้าง" ? "selected" : ""}>ล้างแอร์</option>
                  <option value="ซ่อม" ${draft.job_type === "ซ่อม" ? "selected" : ""}>ซ่อมแอร์</option>
                  <option value="ติดตั้ง" ${draft.job_type === "ติดตั้ง" ? "selected" : ""}>ติดตั้งแอร์</option>
                </select>
              </div>
              <div class="field">
                <label for="scheduled-ac-type">ประเภทแอร์</label>
                <select id="scheduled-ac-type" class="select" data-scheduled-field="ac_type">
                  <option value="ผนัง" ${draft.ac_type === "ผนัง" ? "selected" : ""}>ติดผนัง</option>
                  <option value="สี่ทิศ" ${draft.ac_type === "สี่ทิศ" ? "selected" : ""}>สี่ทิศ</option>
                  <option value="แขวน" ${draft.ac_type === "แขวน" ? "selected" : ""}>แขวน</option>
                </select>
              </div>
              <div class="field">
                <label for="scheduled-btu">BTU</label>
                <select id="scheduled-btu" class="select" data-scheduled-field="btu">
                  <option value="9000" ${Number(draft.btu) === 9000 ? "selected" : ""}>9,000 BTU</option>
                  <option value="12000" ${Number(draft.btu) === 12000 ? "selected" : ""}>12,000 BTU</option>
                  <option value="18000" ${Number(draft.btu) === 18000 ? "selected" : ""}>18,000 BTU</option>
                  <option value="24000" ${Number(draft.btu) === 24000 ? "selected" : ""}>24,000 BTU</option>
                </select>
              </div>
              <div class="field">
                <label for="scheduled-count">จำนวนเครื่อง</label>
                <select id="scheduled-count" class="select" data-scheduled-field="machine_count">
                  ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${Number(draft.machine_count) === n ? "selected" : ""}>${n} เครื่อง</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="scheduled-date">วันที่ต้องการ</label>
                <input id="scheduled-date" class="input" type="date" value="${root.utils.escapeHtml(draft.date)}" data-scheduled-field="date">
              </div>
            </div>
          </section>
          <section class="card">
            <h2>ประเมินราคา</h2>
            <div data-pricing-preview>${renderPricing()}</div>
            <div class="button-row">
              <button class="secondary-btn" type="button" data-action="preview-price">ประเมินราคา</button>
            </div>
          </section>
          <section class="card">
            <h2>เวลาว่างของช่าง</h2>
            <div data-availability-preview>${renderAvailability()}</div>
            <div class="button-row">
              <button class="secondary-btn" type="button" data-action="load-slots">โหลดเวลาว่าง</button>
            </div>
          </section>
          <section class="card">
            <h2>ขั้นตอนการจอง</h2>
            ${root.utils.stepCards(root.services.scheduledSteps)}
          </section>
          <div class="sticky-action">
            <button class="disabled-btn" type="button" disabled>ยังไม่เปิดส่งคำขอจองจริงในรอบนี้</button>
            <p class="muted">หน้านี้อ่านราคาประมาณการและเวลาว่างเท่านั้น ยังไม่สร้างงานในระบบ</p>
          </div>
        </section>
      `;
      bind(container);
    },
  };
})();
