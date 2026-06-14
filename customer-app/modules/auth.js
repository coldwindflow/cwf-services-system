(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function renderCustomerSummary() {
    const customer = root.state.customer;
    if (!customer) return root.utils.stateBox("loading", "กำลังตรวจสอบสถานะบัญชี...");
    if (!customer.logged_in) {
      return root.utils.stateBox("", "คุณกำลังใช้งานแบบ Guest สามารถดูข้อมูลและเริ่มจองได้โดยไม่ต้องเข้าสู่ระบบ");
    }
    const name = customer.user && customer.user.name ? customer.user.name : "ลูกค้า CWF";
    const profile = customer.profile || {};
    return `
      <div class="data-list">
        <div class="data-row">
          <strong>${root.utils.escapeHtml(name)}</strong>
          <span class="muted">เข้าสู่ระบบแล้ว</span>
        </div>
        <div class="data-row">
          <strong>ที่อยู่ที่บันทึกไว้</strong>
          <span class="muted">${root.utils.escapeHtml(profile.address || "ยังไม่มีที่อยู่ที่บันทึกไว้")}</span>
        </div>
      </div>
    `;
  }

  async function loadCustomer(container) {
    try {
      root.state.customer = null;
      if (container) container.querySelector("[data-customer-state]").innerHTML = renderCustomerSummary();
      const data = await root.api.getCurrentCustomer();
      root.state.customer = data;
      root.state.guestMode = !data.logged_in;
      if (container) container.querySelector("[data-customer-state]").innerHTML = renderCustomerSummary();
    } catch (error) {
      root.state.customer = { logged_in: false };
      if (container) {
        container.querySelector("[data-customer-state]").innerHTML =
          root.utils.stateBox("error", `ตรวจสอบบัญชีไม่สำเร็จ: ${error.message}`);
      }
    }
  }

  root.auth = {
    renderLoginPanel() {
      return `
        <section class="card">
          <h2>บัญชีลูกค้า</h2>
          <p class="muted">เริ่มจองแบบ Guest ได้ก่อน เข้าสู่บัญชีเมื่อพร้อมเพื่อบันทึกที่อยู่ ดูประวัติ และจองซ้ำได้เร็วขึ้น</p>
          <div data-customer-state>${renderCustomerSummary()}</div>
          <div class="button-row">
            <button class="secondary-btn" type="button" disabled>เข้าสู่ระบบด้วย LINE</button>
            <button class="secondary-btn" type="button" disabled>เข้าสู่ระบบด้วย Google</button>
          </div>
        </section>
      `;
    },
    loadCustomer,
  };
})();
