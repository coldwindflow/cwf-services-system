(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function customerProfile() {
    return root.state.customer?.profile || {};
  }

  function normalizeMapsUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:") return "";
      const host = url.hostname.toLowerCase();
      const allowed = host === "goo.gl"
        || host.endsWith(".goo.gl")
        || host === "google.com"
        || host.endsWith(".google.com")
        || host === "google.co.th"
        || host.endsWith(".google.co.th");
      return allowed ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function renderServiceAddress() {
    const customer = root.state.customer;
    const form = root.state.profileAddressForm || {};
    if (!customer?.logged_in) return "";

    const profile = customerProfile();
    const address = String(profile.address || "").trim();
    const storedMaps = String(profile.maps_url || "").trim();
    const safeMapsUrl = normalizeMapsUrl(storedMaps);

    if (form.editing) {
      return `
        <form class="profile-address-form" data-profile-address-form>
          <div class="field field-wide">
            <label for="profile-address">ที่อยู่สำหรับรับบริการ</label>
            <textarea id="profile-address" class="input textarea" name="address" rows="4" minlength="5" required
              placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง เขต/อำเภอ">${root.utils.escapeHtml(address)}</textarea>
          </div>
          <div class="field field-wide">
            <label for="profile-maps">ลิงก์ Google Maps (ถ้ามี)</label>
            <input id="profile-maps" class="input" name="maps_url" value="${root.utils.escapeHtml(storedMaps)}"
              inputmode="url" autocomplete="url" placeholder="https://maps.app.goo.gl/...">
          </div>
          <p class="field-help">รองรับลิงก์ Google Maps แบบ HTTPS เท่านั้น</p>
          ${form.error ? `<div class="state-box is-error">${root.utils.escapeHtml(form.error)}</div>` : ""}
          <div class="button-row">
            <button class="primary-btn" type="submit" ${form.status === "saving" ? "disabled" : ""}>
              ${form.status === "saving" ? "กำลังบันทึก..." : "บันทึกที่อยู่"}
            </button>
            <button class="secondary-btn" type="button" data-profile-address-cancel ${form.status === "saving" ? "disabled" : ""}>ยกเลิก</button>
          </div>
        </form>
      `;
    }

    return `
      <div class="profile-address-summary">
        <div class="address-status-card ${address ? "has-address" : ""}">
          <span class="address-status-icon">${root.utils.icon("pin", 22)}</span>
          <div>
            <strong>${address ? "ที่อยู่พร้อมใช้งาน" : "ยังไม่มีที่อยู่สำหรับรับบริการ"}</strong>
            <p>${root.utils.escapeHtml(address || "เพิ่มที่อยู่ครั้งเดียว ระบบจะช่วยเติมให้ตอนจองโดยไม่ทับข้อมูลที่พิมพ์เอง")}</p>
          </div>
        </div>
        ${safeMapsUrl ? `<a class="secondary-btn" href="${root.utils.escapeHtml(safeMapsUrl)}" target="_blank" rel="noopener noreferrer">เปิด Google Maps</a>` : ""}
        ${form.success ? `<div class="state-box is-success">${root.utils.escapeHtml(form.success)}</div>` : ""}
        <button class="primary-btn" type="button" data-profile-address-edit>${address ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่"}</button>
      </div>
    `;
  }

  function historyState() {
    return root.state.customerHistory || {};
  }

  function renderHistoryClaimPanel() {
    const h = historyState();
    const items = Array.isArray(h.items) ? h.items : [];
    const locations = Array.isArray(h.locations) ? h.locations : [];
    const claimed = h.claimed === true;
    const loading = h.status === "loading" || h.locationsStatus === "loading";
    return `
      <section class="card profile-history-card">
        <div class="section-head">
          <h2>เชื่อมประวัติลูกค้าเก่า</h2>
          <p class="muted">ไม่มี OTP ระบบใช้เบอร์โทรเต็มและ Booking Code จากงานเดิมเพื่อยืนยันประวัติ</p>
        </div>
        <form class="profile-history-claim-form" data-history-claim-form>
          <div class="form-grid">
            <div class="field">
              <label for="history-phone">เบอร์โทรเดิม</label>
              <input id="history-phone" class="input" name="phone" inputmode="tel" autocomplete="tel"
                value="${root.utils.escapeHtml(h.claimPhone || "")}" placeholder="081-234-5678">
            </div>
            <div class="field">
              <label for="history-booking-code">Booking Code</label>
              <input id="history-booking-code" class="input" name="booking_code" autocapitalize="characters"
                value="${root.utils.escapeHtml(h.claimBookingCode || "")}" placeholder="CWF...">
            </div>
          </div>
          ${h.claimError ? `<div class="state-box is-error">${root.utils.escapeHtml(h.claimError)}</div>` : ""}
          ${h.claimSuccess ? `<div class="state-box is-success">${root.utils.escapeHtml(h.claimSuccess)}</div>` : ""}
          <div class="button-row">
            <button class="primary-btn" type="submit" ${h.claimStatus === "saving" ? "disabled" : ""}>
              ${h.claimStatus === "saving" ? "กำลังตรวจสอบ..." : "เชื่อมประวัติ"}
            </button>
            <button class="secondary-btn" type="button" data-history-refresh ${loading ? "disabled" : ""}>${h.schemaUnavailable ? "ลองใหม่" : "โหลดประวัติ"}</button>
            ${h.schemaUnavailable ? `<a class="secondary-btn" href="https://lin.ee/fG1Oq7y" target="_blank" rel="noopener noreferrer">ติดต่อแอดมิน</a>` : ""}
          </div>
        </form>
        ${renderHistorySummary({ claimed, items, locations, loading, error: h.error || h.locationsError, detail: h.detail, detailStatus: h.detailStatus, detailError: h.detailError })}
      </section>
    `;
  }

  function renderHistorySummary({ claimed, items, locations, loading, error, detail, detailStatus, detailError }) {
    if (loading) return `<div class="state-box">กำลังโหลดประวัติ...</div>`;
    if (error) return `<div class="state-box is-error">${root.utils.escapeHtml(error)}</div>`;
    if (!claimed) return `<p class="muted">เชื่อมประวัติก่อนเพื่อดูงานเดิมและเลือกสถานที่ที่เคยใช้บริการ</p>`;
    const locationHtml = locations.length
      ? locations.map((loc, index) => `
          <div class="address-status-card has-address">
            <span class="address-status-icon">${root.utils.icon("pin", 20)}</span>
            <div>
              <strong>${root.utils.escapeHtml(loc.job_zone || "สถานที่เดิม")}</strong>
              <p>${root.utils.escapeHtml(loc.address_text || "-")}</p>
              <p class="muted">${root.utils.escapeHtml(`${loc.job_count || 1} งาน • ล่าสุด ${loc.last_seen_at || "-"}`)}</p>
              <div class="button-row">
                <button class="secondary-btn" type="button" data-history-location-index="${index}" data-history-location-target="scheduled">ใช้จองล่วงหน้า</button>
                <button class="secondary-btn" type="button" data-history-location-index="${index}" data-history-location-target="urgent">ใช้จองด่วน</button>
              </div>
            </div>
          </div>
        `).join("")
      : `<p class="muted">ยังไม่พบสถานที่จากประวัติงานที่เชื่อมแล้ว</p>`;
    const historyHtml = items.length
      ? items.slice(0, 8).map((item, index) => `
          <div class="data-row">
            <div>
              <strong>${root.utils.escapeHtml(item.booking_code || "งานเดิม")}</strong>
              <span>${root.utils.escapeHtml(`${item.appointment_datetime || "-"} • ${item.job_status || "-"}`)}</span>
            </div>
            <button class="secondary-btn" type="button" data-history-detail-index="${index}">ดูรายละเอียด</button>
          </div>
        `).join("")
      : `<p class="muted">ยังไม่พบประวัติงานที่แสดงได้</p>`;
    const detailHtml = detailStatus === "loading"
      ? `<div class="state-box">กำลังโหลดรายละเอียด...</div>`
      : detailError
        ? `<div class="state-box is-error">${root.utils.escapeHtml(detailError)}</div>`
        : detail
          ? `
            <div class="address-status-card has-address">
              <span class="address-status-icon">${root.utils.icon("pin", 20)}</span>
              <div>
                <strong>${root.utils.escapeHtml(detail.booking_code || "รายละเอียดงาน")}</strong>
                <p>${root.utils.escapeHtml(`${detail.appointment_datetime || "-"} • ${detail.job_status || "-"}`)}</p>
                <p>${root.utils.escapeHtml(detail.service_summary || "-")}</p>
                <p>${root.utils.escapeHtml(detail.address_text || "-")}</p>
                <p class="muted">${root.utils.escapeHtml(`ราคา ${detail.job_price == null ? "-" : detail.job_price} • ${detail.customer_phone_masked || ""}`)}</p>
              </div>
            </div>
          `
          : "";
    return `
      <div class="profile-history-summary">
        <div class="section-head section-head-compact"><h2>สถานที่ที่เคยใช้บริการ</h2></div>
        <div class="profile-location-list">${locationHtml}</div>
        <div class="section-head section-head-compact"><h2>ประวัติบริการ</h2></div>
        <div>${historyHtml}</div>
        ${detailHtml ? `<div class="section-head section-head-compact"><h2>รายละเอียดงาน</h2></div><div>${detailHtml}</div>` : ""}
      </div>
    `;
  }

  async function loadHistoryData(container) {
    if (!root.state.customer?.logged_in || !root.api?.loadCustomerHistory) return;
    root.state.setCustomerHistory({ status: "loading", locationsStatus: "loading", error: "", locationsError: "" });
    paintHistory(container);
    try {
      const [historyData, locationsData] = await Promise.all([
        root.api.loadCustomerHistory(),
        root.api.loadCustomerHistoryLocations(),
      ]);
      root.state.setCustomerHistory({
        status: "success",
        locationsStatus: "success",
        claimed: !!(historyData?.claimed || locationsData?.claimed),
        items: Array.isArray(historyData?.items) ? historyData.items : [],
        locations: Array.isArray(locationsData?.locations) ? locationsData.locations : [],
        error: "",
        locationsError: "",
        schemaUnavailable: false,
      });
    } catch (error) {
      const message = error?.status === 503
        ? "ระบบเชื่อมประวัติอยู่ระหว่างเตรียมความพร้อม กรุณาลองใหม่หรือติดต่อแอดมิน"
        : (error?.message || "โหลดประวัติไม่สำเร็จ");
      root.state.setCustomerHistory({
        status: "error",
        locationsStatus: "error",
        error: message,
        locationsError: message,
        schemaUnavailable: error?.status === 503,
      });
    }
    paintHistory(container);
  }

  function paintHistory(container) {
    const mount = container?.querySelector("[data-profile-history]");
    if (!mount) return;
    mount.innerHTML = renderHistoryClaimPanel();
    bindHistory(container);
  }

  function paintAddress(container) {
    const mount = container?.querySelector("[data-profile-address]");
    if (!mount) return;
    mount.innerHTML = renderServiceAddress();
    bindAddress(container);
  }

  function bindHistory(container) {
    const form = container?.querySelector("[data-history-claim-form]");
    if (form && form.dataset.bound !== "1") {
      form.dataset.bound = "1";
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const phone = String(form.elements.phone.value || "").trim();
        const bookingCode = String(form.elements.booking_code.value || "").trim();
        root.state.setCustomerHistory({
          claimStatus: "saving",
          claimError: "",
          claimSuccess: "",
          claimPhone: phone,
          claimBookingCode: bookingCode,
        });
        paintHistory(container);
        try {
          await root.api.claimCustomerHistory({ phone, booking_code: bookingCode });
          root.state.setCustomerHistory({
            claimStatus: "success",
            claimError: "",
            claimSuccess: "เชื่อมประวัติสำเร็จ",
            claimBookingCode: "",
            claimed: true,
            schemaUnavailable: false,
          });
          await loadHistoryData(container);
        } catch (error) {
          const schemaUnavailable = error?.status === 503;
          root.state.setCustomerHistory({
            claimStatus: "error",
            claimError: schemaUnavailable
              ? "ระบบเชื่อมประวัติอยู่ระหว่างเตรียมความพร้อม กรุณาลองใหม่หรือติดต่อแอดมิน"
              : "ไม่สามารถยืนยันประวัติงานได้ กรุณาตรวจสอบข้อมูลอีกครั้ง",
            claimSuccess: "",
            schemaUnavailable,
          });
          paintHistory(container);
        }
      });
    }

    const refresh = container?.querySelector("[data-history-refresh]");
    if (refresh && refresh.dataset.bound !== "1") {
      refresh.dataset.bound = "1";
      refresh.addEventListener("click", () => loadHistoryData(container));
    }

    const locationButtons = typeof container?.querySelectorAll === "function"
      ? container.querySelectorAll("[data-history-location-index]")
      : [];
    locationButtons.forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-history-location-index"));
        const target = button.getAttribute("data-history-location-target") === "urgent" ? "urgent" : "scheduled";
        const loc = (root.state.customerHistory?.locations || [])[index];
        if (!root.state.applyHistoryLocation(target, loc)) return;
        root.utils.routeTo(target === "urgent" ? "urgent" : "scheduled");
      });
    });

    const detailButtons = typeof container?.querySelectorAll === "function"
      ? container.querySelectorAll("[data-history-detail-index]")
      : [];
    detailButtons.forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", async () => {
        const index = Number(button.getAttribute("data-history-detail-index"));
        const item = (root.state.customerHistory?.items || [])[index];
        const jobRef = item && item.job_ref;
        if (!jobRef || !root.api?.loadCustomerHistoryDetail) return;
        root.state.setCustomerHistory({ detailStatus: "loading", detailError: "", detail: null });
        paintHistory(container);
        try {
          const detailData = await root.api.loadCustomerHistoryDetail(jobRef);
          root.state.setCustomerHistory({ detailStatus: "success", detailError: "", detail: detailData?.item || null });
        } catch (_) {
          root.state.setCustomerHistory({ detailStatus: "error", detailError: "โหลดรายละเอียดงานไม่สำเร็จ", detail: null });
        }
        paintHistory(container);
      });
    });
  }

  function bindProfile(container) {
    bindAddress(container);
    bindHistory(container);
  }

  function bindAddress(container) {
    const edit = container?.querySelector("[data-profile-address-edit]");
    if (edit && edit.dataset.bound !== "1") {
      edit.dataset.bound = "1";
      edit.addEventListener("click", () => {
        root.state.setProfileAddressForm({ editing: true, status: "idle", error: "", success: "" });
        paintAddress(container);
      });
    }

    const cancel = container?.querySelector("[data-profile-address-cancel]");
    if (cancel && cancel.dataset.bound !== "1") {
      cancel.dataset.bound = "1";
      cancel.addEventListener("click", () => {
        root.state.setProfileAddressForm({ editing: false, status: "idle", error: "", success: "" });
        paintAddress(container);
      });
    }

    const form = container?.querySelector("[data-profile-address-form]");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const address = String(form.elements.address.value || "").trim();
      const mapsRaw = String(form.elements.maps_url.value || "").trim();
      const mapsUrl = normalizeMapsUrl(mapsRaw);

      if (address.length < 5) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: "กรุณากรอกที่อยู่ให้ครบถ้วน", success: "" });
        paintAddress(container);
        return;
      }
      if (mapsRaw && !mapsUrl) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: "กรุณาใช้ลิงก์ Google Maps แบบ HTTPS เท่านั้น", success: "" });
        paintAddress(container);
        return;
      }

      root.state.setProfileAddressForm({ editing: true, status: "saving", error: "", success: "" });
      paintAddress(container);
      try {
        const result = await root.api.updateProfileAddress({ address, maps_url: mapsUrl });
        root.state.updateCustomerProfile(result?.profile || { address, maps_url: mapsUrl });
        root.state.addressPrefill.scopes = {};
        root.state.setProfileAddressForm({ editing: false, status: "success", error: "", success: "บันทึกที่อยู่แล้ว" });
        root.ui?.updateAccountChrome?.();
      } catch (error) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: error?.message || "บันทึกที่อยู่ไม่สำเร็จ", success: "" });
      }
      paintAddress(container);
    });
  }

  function renderLoggedOut(container) {
    container.innerHTML = `
      <section class="screen profile-screen">
        <div class="hero profile-hero">
          <div class="hero-badge">บัญชีลูกค้า CWF</div>
          <h2>เข้าสู่ระบบเพื่อใช้ข้อมูลของคุณ</h2>
          <p>บันทึกที่อยู่ ดูสถานะงาน และกลับมาจองครั้งถัดไปได้สะดวกขึ้น</p>
        </div>
        <div data-auth-panel>${root.auth.renderLoginPanel()}</div>
        <section class="card profile-action-card">
          <h2>ยังไม่เข้าสู่ระบบก็ใช้งานได้</h2>
          <p class="muted">เลือกบริการ จองคิว และติดตามงานแบบ Guest ได้ตามปกติ</p>
          <div class="button-row">
            <button class="primary-btn" type="button" data-route="home">เลือกบริการ</button>
            <button class="secondary-btn" type="button" data-route="tracking">ติดตามงาน</button>
          </div>
        </section>
        ${root.ui.supportButtons()}
      </section>
    `;
    root.auth.loadCustomer(container).then(() => {
      if (root.state.customer?.logged_in && root.state.currentRoute === "profile") root.router.refresh();
    });
  }

  function renderLoggedIn(container) {
    const name = root.auth.displayName(root.state.customer);
    container.innerHTML = `
      <section class="screen profile-screen">
        <div class="hero profile-hero is-account">
          <div class="hero-badge">บัญชีของฉัน</div>
          <h2>${root.utils.escapeHtml(name)}</h2>
          <p>จัดการข้อมูลที่ใช้จองบริการและเข้าถึงงานของคุณได้จากหน้านี้</p>
        </div>

        <div data-auth-panel>${root.auth.renderLoginPanel()}</div>

        <section class="card">
          <div class="section-head">
            <h2>ที่อยู่สำหรับรับบริการ</h2>
            <p class="muted">บัญชีนี้บันทึกที่อยู่ประจำได้ 1 แห่ง และยังเปลี่ยนที่อยู่เฉพาะงานในหน้าจองได้</p>
          </div>
          <div data-profile-address>${renderServiceAddress()}</div>
        </section>

        <div data-profile-history>${renderHistoryClaimPanel()}</div>

        <section class="card profile-action-card">
          <div class="section-head"><h2>เมนูใช้งาน</h2></div>
          <div class="profile-action-grid">
            <button class="secondary-btn" type="button" data-route="tracking">ติดตามงาน</button>
            <button class="secondary-btn" type="button" data-route="booking">จองบริการใหม่</button>
          </div>
        </section>

        ${root.ui.supportButtons()}
      </section>
    `;
    root.auth.loadCustomer(container);
    bindProfile(container);
    loadHistoryData(container);
    root.auth.bindAvatarFallbacks?.(container);
  }

  root.profile = {
    normalizeMapsUrl,
    render(container) {
      if (root.state.authStatus === "idle" || root.state.authStatus === "loading") {
        container.innerHTML = `
          <section class="screen profile-screen">
            <div class="hero profile-hero"><div class="hero-badge">บัญชีลูกค้า CWF</div><h2>กำลังโหลดบัญชี</h2></div>
            <section class="card"><div class="account-skeleton"><span></span><span></span><span></span></div></section>
          </section>
        `;
        root.auth.loadCustomer(container).then(() => {
          if (root.state.currentRoute === "profile") root.router.refresh();
        });
        return;
      }
      if (root.state.customer?.logged_in) renderLoggedIn(container);
      else renderLoggedOut(container);
    },
  };
  console.info("[customer-profile] customer history production ready v1 loaded");
})();
