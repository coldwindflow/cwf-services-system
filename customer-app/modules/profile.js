(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  function renderSavedAddress() {
    const customer = root.state.customer;
    if (!customer) return root.utils.stateBox("loading", "กำลังโหลดข้อมูลบัญชี...");
    if (!customer.logged_in) return root.utils.stateBox("", "ใช้งานแบบ Guest ยังไม่มีที่อยู่ที่บันทึกไว้");
    const profile = customer.profile || {};
    return `
      <div class="data-list">
        <div class="data-row">
          <strong>ที่อยู่</strong>
          <span class="muted">${root.utils.escapeHtml(profile.address || "ยังไม่มีที่อยู่ที่บันทึกไว้")}</span>
        </div>
        <div class="data-row">
          <strong>แผนที่</strong>
          <span class="muted">${root.utils.escapeHtml(profile.maps_url || "ยังไม่มีลิงก์แผนที่")}</span>
        </div>
      </div>
    `;
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
      root.auth.loadCustomer(container).then(() => {
        const mount = container.querySelector("[data-profile-address]");
        if (mount) mount.innerHTML = renderSavedAddress();
      });
    },
  };
})();
