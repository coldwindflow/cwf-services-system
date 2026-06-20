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

  function paintAddress(container) {
    const mount = container?.querySelector("[data-profile-address]");
    if (!mount) return;
    mount.innerHTML = renderServiceAddress();
    bindAddress(container);
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
    const accountSummary = typeof root.auth.renderCustomerSummary === "function"
      ? root.auth.renderCustomerSummary()
      : `<div class="customer-session-card">
          <div class="customer-session-main">
            <span class="account-avatar">${root.utils.escapeHtml(name.slice(0, 1))}</span>
            <div><strong>${root.utils.escapeHtml(name)}</strong><span>เข้าสู่ระบบแล้ว</span></div>
          </div>
          <button class="secondary-btn auth-logout-btn" type="button" data-auth-logout>ออกจากระบบ</button>
        </div>`;
    container.innerHTML = `
      <section class="screen profile-screen">
        <div class="hero profile-hero is-account">
          <div class="hero-badge">บัญชีของฉัน</div>
          <h2>${root.utils.escapeHtml(name)}</h2>
          <p>จัดการข้อมูลที่ใช้จองบริการและเข้าถึงงานของคุณได้จากหน้านี้</p>
        </div>

        <section class="card auth-card is-logged-in profile-account-summary">
          <div class="section-head">
            <h2>ข้อมูลบัญชี</h2>
          </div>
          ${accountSummary}
        </section>

        <section class="card">
          <div class="section-head">
            <h2>ที่อยู่สำหรับรับบริการ</h2>
            <p class="muted">บันทึกที่อยู่สำหรับรับบริการไว้ใช้เติมข้อมูลในหน้าจอง โดยยังแก้ไขที่อยู่เฉพาะงานได้ก่อนยืนยัน</p>
          </div>
          <div data-profile-address>${renderServiceAddress()}</div>
        </section>

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
    bindAddress(container);
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
})();
