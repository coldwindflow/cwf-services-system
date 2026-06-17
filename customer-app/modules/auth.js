(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  // Brand login marks (presentation only — no auth backend is touched).
  // LINE: official LINE green bubble with the LINE wordmark.
  const LINE_ICON = `
    <svg viewBox="0 0 40 40" width="22" height="22" role="img" aria-hidden="true" focusable="false">
      <path fill="#fff" d="M20 5C11.16 5 4 10.74 4 17.82c0 6.35 5.68 11.66 13.35 12.66.52.11 1.23.34 1.41.78.16.4.1 1.03.05 1.43l-.22 1.36c-.07.4-.32 1.58 1.39.86 1.71-.72 9.2-5.42 12.55-9.28C35.21 24.2 36 21.13 36 17.82 36 10.74 28.84 5 20 5z"/>
      <text x="20" y="21.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.6" fill="#06C755" letter-spacing="-0.3">LINE</text>
    </svg>`;

  // Google: official 4-colour "G" mark.
  const GOOGLE_ICON = `
    <svg viewBox="0 0 48 48" width="20" height="20" role="img" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`;

  // Both providers stay disabled / "coming soon" in Customer App V2.
  // Legacy /auth/line exists but currently redirects to customer.html, not this V2 shell;
  // Google OAuth is out of scope for this phase. No auth backend is touched.
  function renderProviderButtons() {
    return `
      <div class="auth-providers" role="group" aria-label="ตัวเลือกเข้าสู่ระบบ">
        <button class="provider-btn line-btn" type="button" disabled aria-disabled="true" title="เข้าสู่ระบบด้วย LINE — เร็ว ๆ นี้">
          <span class="prov-ico">${LINE_ICON}</span>
          <span class="prov-label">เข้าสู่ระบบด้วย LINE</span>
          <span class="prov-soon">เร็ว ๆ นี้</span>
        </button>
        <button class="provider-btn google-btn" type="button" disabled aria-disabled="true" title="เข้าสู่ระบบด้วย Google — เร็ว ๆ นี้">
          <span class="prov-ico">${GOOGLE_ICON}</span>
          <span class="prov-label">เข้าสู่ระบบด้วย Google</span>
          <span class="prov-soon">เร็ว ๆ นี้</span>
        </button>
      </div>
    `;
  }

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
        <section class="card auth-card">
          <div class="section-head">
            <span class="section-kicker">Account</span>
            <h2>บัญชีลูกค้า</h2>
          </div>
          <p class="muted">เริ่มจองแบบ Guest ได้ก่อน เข้าสู่บัญชีเมื่อพร้อมเพื่อบันทึกที่อยู่ ดูประวัติ และจองซ้ำได้เร็วขึ้น</p>
          <div data-customer-state>${renderCustomerSummary()}</div>
          <div class="auth-divider"><span>เข้าสู่ระบบเพื่อสิทธิ์เพิ่มเติม</span></div>
          ${renderProviderButtons()}
          <p class="auth-note">ระบบเข้าสู่ระบบกำลังจะเปิดให้ใช้งานเร็ว ๆ นี้ ระหว่างนี้ใช้งานแบบ Guest ได้เต็มรูปแบบ</p>
        </section>
      `;
    },
    loadCustomer,
  };
})();
