(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function profile() {
    const customer = root.state.customer || {};
    return customer.profile || {};
  }

  function renderSavedAddress() {
    const customer = root.state.customer;
    const form = root.state.profileAddressForm || {};
    if (!customer) return root.utils.stateBox("loading", "กำลังโหลดข้อมูลบัญชี...");
    if (!customer.logged_in) return root.utils.stateBox("", "ใช้งานแบบ Guest ยังไม่มีที่อยู่ที่บันทึกไว้");
    const p = profile();
    const address = String(p.address || "").trim();
    const mapsUrl = String(p.maps_url || "").trim();
    if (form.editing) {
      return `
        <form class="profile-address-form" data-profile-address-form>
          <div class="field field-wide">
            <label for="profile-address">ที่อยู่หลัก</label>
            <textarea id="profile-address" class="input textarea" name="address" rows="4" minlength="5" required placeholder="บ้าน/คอนโด อาคาร ชั้น ห้อง เขต/อำเภอ">${root.utils.escapeHtml(address)}</textarea>
          </div>
          <div class="field field-wide">
            <label for="profile-maps">ลิงก์ Google Maps (ถ้ามี)</label>
            <input id="profile-maps" class="input" name="maps_url" value="${root.utils.escapeHtml(mapsUrl)}" inputmode="url" placeholder="วางลิงก์ Google Maps">
          </div>
          ${form.error ? `<div class="state-box is-error">${root.utils.escapeHtml(form.error)}</div>` : ""}
          ${form.success ? `<div class="state-box is-success">${root.utils.escapeHtml(form.success)}</div>` : ""}
          <div class="button-row">
            <button class="primary-btn" type="submit" ${form.status === "saving" ? "disabled" : ""}>${form.status === "saving" ? "กำลังบันทึก..." : "บันทึกที่อยู่"}</button>
            <button class="secondary-btn" type="button" data-profile-address-cancel ${form.status === "saving" ? "disabled" : ""}>ยกเลิก</button>
          </div>
        </form>
      `;
    }
    return `
      <div class="profile-address-summary">
        <div class="data-list">
          <div class="data-row">
            <strong>ที่อยู่</strong>
            <span class="muted">${root.utils.escapeHtml(address || "ยังไม่มีที่อยู่ที่บันทึกไว้")}</span>
          </div>
          <div class="data-row">
            <strong>แผนที่</strong>
            <span class="muted">${mapsUrl ? `<a href="${root.utils.escapeHtml(mapsUrl)}" target="_blank" rel="noopener">เปิด Google Maps</a>` : "ยังไม่มีลิงก์แผนที่"}</span>
          </div>
        </div>
        ${form.success ? `<div class="state-box is-success">${root.utils.escapeHtml(form.success)}</div>` : ""}
        <button class="secondary-btn" type="button" data-profile-address-edit>${address || mapsUrl ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่"}</button>
      </div>
    `;
  }

  function paintAddress(container) {
    const mount = container.querySelector("[data-profile-address]");
    if (!mount) return;
    mount.innerHTML = renderSavedAddress();
    bindAddress(container);
  }

  function bindAddress(container) {
    const edit = container.querySelector("[data-profile-address-edit]");
    if (edit) {
      edit.addEventListener("click", () => {
        root.state.setProfileAddressForm({ editing: true, status: "idle", error: "", success: "" });
        paintAddress(container);
      }, { once: true });
    }
    const cancel = container.querySelector("[data-profile-address-cancel]");
    if (cancel) {
      cancel.addEventListener("click", () => {
        root.state.setProfileAddressForm({ editing: false, status: "idle", error: "", success: "" });
        paintAddress(container);
      }, { once: true });
    }
    const form = container.querySelector("[data-profile-address-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const address = String(form.elements.address.value || "").trim();
      const mapsUrl = String(form.elements.maps_url.value || "").trim();
      if (address.length < 5) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: "กรุณากรอกที่อยู่อย่างน้อย 5 ตัวอักษร", success: "" });
        paintAddress(container);
        return;
      }
      if (mapsUrl.length > 600) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: "ลิงก์แผนที่ยาวเกินไป", success: "" });
        paintAddress(container);
        return;
      }
      root.state.setProfileAddressForm({ editing: true, status: "saving", error: "", success: "" });
      paintAddress(container);
      try {
        const result = await root.api.updateProfileAddress({ address, maps_url: mapsUrl });
        root.state.updateCustomerProfile((result && result.profile) || { address, maps_url: mapsUrl });
        root.state.setProfileAddressForm({ editing: false, status: "success", error: "", success: "บันทึกที่อยู่แล้ว" });
      } catch (error) {
        root.state.setProfileAddressForm({ editing: true, status: "error", error: error.message || "บันทึกที่อยู่ไม่สำเร็จ", success: "" });
      }
      paintAddress(container);
    }, { once: true });
  }

  root.profile = {
    render(container) {
      container.innerHTML = `
        <section class="screen">
          <div class="hero profile-hero">
            <div class="hero-badge">Guest-friendly account</div>
            <h2>บัญชีลูกค้า</h2>
            <p>ใช้งานแบบ Guest ได้ก่อน เมื่อล็อกอินแล้วจะช่วยจำที่อยู่ ดูประวัติ และจองซ้ำได้สะดวกขึ้น</p>
          </div>
          ${root.auth.renderLoginPanel()}
          <section class="card guest-card">
            <div class="section-head">
              <span class="section-kicker">Guest mode</span>
              <h2>เริ่มใช้งานได้ทันที</h2>
            </div>
            <p class="muted">ลูกค้าสามารถเริ่มจองและติดตามงานได้ โดยไม่ต้องเข้าสู่ระบบตั้งแต่หน้าแรก</p>
          </section>
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">Saved address</span>
              <h2>ที่อยู่ที่บันทึกไว้</h2>
              <p class="muted">ระบบจะเติมที่อยู่นี้ให้ในหน้าจองเมื่อช่องที่อยู่ยังว่าง และจะไม่ทับข้อมูลที่คุณพิมพ์ไว้</p>
            </div>
            <div data-profile-address>${renderSavedAddress()}</div>
          </section>
          <section class="card">
            <div class="section-head">
              <span class="section-kicker">History</span>
              <h2>ประวัติและจองซ้ำ</h2>
            </div>
            <div class="tag-row">
              <span class="tag">งานล่าสุด</span>
              <span class="tag">จองซ้ำ</span>
              <span class="tag">บริการที่ใช้บ่อย</span>
            </div>
          </section>
          ${root.ui.supportButtons()}
        </section>
      `;
      bindAddress(container);
      root.auth.loadCustomer(container).then(() => {
        root.state.setProfileAddressForm({ editing: false, status: "idle", error: "", success: "" });
        paintAddress(container);
      });
    },
  };
})();
