(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};

  const LINE_ICON = `
    <svg viewBox="0 0 40 40" width="22" height="22" role="img" aria-hidden="true" focusable="false">
      <path fill="#fff" d="M20 5C11.16 5 4 10.74 4 17.82c0 6.35 5.68 11.66 13.35 12.66.52.11 1.23.34 1.41.78.16.4.1 1.03.05 1.43l-.22 1.36c-.07.4-.32 1.58 1.39.86 1.71-.72 9.2-5.42 12.55-9.28C35.21 24.2 36 21.13 36 17.82 36 10.74 28.84 5 20 5z"/>
      <text x="20" y="21.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.6" fill="#06C755" letter-spacing="-0.3">LINE</text>
    </svg>`;

  const GOOGLE_ICON = `
    <svg viewBox="0 0 48 48" width="20" height="20" role="img" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>`;

  function esc(value) {
    return root.utils.escapeHtml(value == null ? "" : String(value));
  }

  function currentReturnTo() {
    return `${window.location.pathname || "/customer-app/"}${window.location.search || ""}${window.location.hash || ""}`;
  }

  function authNotice() {
    const params = new URLSearchParams(window.location.search || "");
    const status = params.get("auth");
    if (!status) return "";
    const provider = params.get("provider") || "";
    const reason = params.get("reason") || "";
    if (status === "success") return root.utils.stateBox("success", `เข้าสู่ระบบด้วย ${provider.toUpperCase()} สำเร็จ`);
    if (status === "linked") return root.utils.stateBox("success", `เชื่อมบัญชี ${provider.toUpperCase()} เรียบร้อย`);
    if (reason === "access_denied" || reason === "cancel") return root.utils.stateBox("", "ยกเลิกการเข้าสู่ระบบแล้ว คุณยังใช้งานแบบ Guest ได้");
    if (reason === "provider_unavailable") return root.utils.stateBox("error", "ผู้ให้บริการนี้ยังไม่ได้ตั้งค่าในระบบ Production");
    if (reason === "invalid_state" || reason === "missing_state") return root.utils.stateBox("error", "เซสชันเข้าสู่ระบบหมดอายุ กรุณาลองใหม่อีกครั้ง");
    if (reason === "account_already_linked") return root.utils.stateBox("error", "บัญชีผู้ให้บริการนี้ถูกเชื่อมกับลูกค้าอื่นแล้ว");
    return root.utils.stateBox("error", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่หรือติดต่อแอดมิน CWF");
  }

  function providerButton(provider, config) {
    const isLine = provider === "line";
    const item = config && config.providers && config.providers[provider] ? config.providers[provider] : {};
    const available = !!item.available;
    const label = isLine ? "เข้าสู่ระบบด้วย LINE" : "เข้าสู่ระบบด้วย Google";
    const icon = isLine ? LINE_ICON : GOOGLE_ICON;
    const cls = isLine ? "line-btn" : "google-btn";
    const href = available ? item.start_url : "";
    return `
      <button class="provider-btn ${cls}" type="button" data-auth-provider="${provider}" ${available ? "" : "disabled aria-disabled=\"true\""} data-auth-url="${esc(href)}">
        <span class="prov-ico">${icon}</span>
        <span class="prov-label">${label}</span>
        <span class="prov-soon">${available ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}</span>
      </button>
    `;
  }

  function renderProviderButtons() {
    const config = root.state.authConfig;
    if (!config) return root.utils.stateBox("loading", "กำลังตรวจสอบช่องทางเข้าสู่ระบบ...");
    return `
      <div class="auth-providers" role="group" aria-label="ตัวเลือกเข้าสู่ระบบ">
        ${providerButton("line", config)}
        ${providerButton("google", config)}
      </div>
    `;
  }

  function renderCustomerSummary() {
    const customer = root.state.customer;
    if (!customer) return root.utils.stateBox("loading", "กำลังตรวจสอบสถานะบัญชี...");
    if (!customer.logged_in) {
      return root.utils.stateBox("", "คุณกำลังใช้งานแบบ Guest สามารถดูข้อมูลและเริ่มจองได้โดยไม่ต้องเข้าสู่ระบบ");
    }
    const user = customer.user || {};
    const profile = customer.profile || {};
    const providers = customer.linked_providers || user.linked_providers || [user.provider || customer.provider].filter(Boolean);
    return `
      <div class="customer-session-card">
        <div class="customer-session-main">
          ${user.picture ? `<img src="${esc(user.picture)}" alt="" loading="lazy">` : ""}
          <div>
            <strong>${esc(user.name || "ลูกค้า CWF")}</strong>
            <span>${providers.length ? `เชื่อมแล้ว: ${providers.map((p) => p.toUpperCase()).join(", ")}` : "เข้าสู่ระบบแล้ว"}</span>
          </div>
        </div>
        <div class="data-list">
          <div class="data-row">
            <strong>อีเมล</strong>
            <span class="muted">${esc(user.email || profile.email || "ยังไม่มีอีเมลในบัญชี")}</span>
          </div>
          <div class="data-row">
            <strong>ที่อยู่ที่บันทึกไว้</strong>
            <span class="muted">${esc(profile.address || "ยังไม่มีที่อยู่ที่บันทึกไว้")}</span>
          </div>
        </div>
        <button class="secondary-btn auth-logout-btn" type="button" data-auth-logout>ออกจากระบบ</button>
      </div>
    `;
  }

  async function loadCustomer(container) {
    const stateMount = container ? container.querySelector("[data-customer-state]") : null;
    const providerMount = container ? container.querySelector("[data-auth-providers]") : null;
    try {
      root.state.customer = null;
      root.state.authConfig = null;
      if (stateMount) stateMount.innerHTML = renderCustomerSummary();
      if (providerMount) providerMount.innerHTML = renderProviderButtons();
      const returnTo = currentReturnTo();
      const results = await Promise.all([
        root.api.getCurrentCustomer(),
        root.api.getAuthConfig(returnTo),
      ]);
      root.state.customer = results[0];
      root.state.authConfig = results[1];
      root.state.guestMode = !results[0].logged_in;
      if (stateMount) stateMount.innerHTML = renderCustomerSummary();
      if (providerMount) providerMount.innerHTML = renderProviderButtons();
      bindAuthActions(container);
    } catch (error) {
      root.state.customer = { logged_in: false };
      if (stateMount) stateMount.innerHTML = root.utils.stateBox("error", `ตรวจสอบบัญชีไม่สำเร็จ: ${error.message}`);
      if (providerMount) providerMount.innerHTML = renderProviderButtons();
    }
  }

  function bindAuthActions(container) {
    if (!container) return;
    container.querySelectorAll("[data-auth-provider]").forEach((button) => {
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-auth-url");
        if (!url || button.disabled) return;
        button.disabled = true;
        button.querySelector(".prov-soon").textContent = "กำลังพาไป...";
        window.location.href = url;
      }, { once: true });
    });
    const logout = container.querySelector("[data-auth-logout]");
    if (logout) {
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        logout.textContent = "กำลังออกจากระบบ...";
        try {
          await root.api.logoutCustomer();
          await loadCustomer(container);
        } catch (error) {
          logout.disabled = false;
          logout.textContent = "ออกจากระบบ";
        }
      });
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
          ${authNotice()}
          <div data-customer-state>${renderCustomerSummary()}</div>
          <div class="auth-divider"><span>เข้าสู่ระบบเพื่อสิทธิ์เพิ่มเติม</span></div>
          <div data-auth-providers>${renderProviderButtons()}</div>
          <p class="auth-note">ระบบจะพาคุณไปยัง LINE หรือ Google อย่างปลอดภัย แล้วกลับมาที่ Customer App V2 หน้าเดิม</p>
        </section>
      `;
    },
    loadCustomer,
  };
})();
