(function () {
  "use strict";

  const root = window.CWFCustomerAppV2 = window.CWFCustomerAppV2 || {};
  let authLoadPromise = null;

  const LINE_ICON = `
    <svg viewBox="0 0 40 40" width="22" height="22" role="img" aria-hidden="true" focusable="false">
      <path fill="#fff" d="M20 5C11.16 5 4 10.74 4 17.82c0 6.35 5.68 11.66 13.35 12.66.52.11 1.23.34 1.41.78.16.4.1 1.03.05 1.43l-.22 1.36c-.07.4-.32 1.58 1.39.86 1.71-.72 9.2-5.42 12.55-9.28C35.21 24.2 36 21.13 36 17.82 36 10.74 28.84 5 20 5z"/>
      <text x="20" y="21.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="8.6" fill="#06C755">LINE</text>
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
    return `${window.location.pathname || "/customer-app/"}${window.location.hash || ""}`;
  }

  function authNotice() {
    const params = new URLSearchParams(window.location.search || "");
    const status = params.get("auth");
    if (!status) return "";
    const provider = String(params.get("provider") || "").toUpperCase();
    const reason = params.get("reason") || "";
    if (status === "success") return root.utils.stateBox("success", `เข้าสู่ระบบด้วย ${provider || "บัญชี"} สำเร็จ`);
    if (status === "linked") return root.utils.stateBox("success", `เชื่อมบัญชี ${provider || ""} เรียบร้อย`);
    if (reason === "access_denied" || reason === "cancel") return root.utils.stateBox("", "ยกเลิกการเข้าสู่ระบบแล้ว");
    if (reason === "provider_unavailable") return root.utils.stateBox("error", "ช่องทางเข้าสู่ระบบนี้ยังไม่พร้อมใช้งาน");
    if (reason === "invalid_state" || reason === "missing_state") return root.utils.stateBox("error", "เซสชันเข้าสู่ระบบหมดอายุ กรุณาลองใหม่");
    if (reason === "account_already_linked") return root.utils.stateBox("error", "บัญชีนี้ถูกเชื่อมกับลูกค้ารายอื่นแล้ว");
    return root.utils.stateBox("error", "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่");
  }

  function providerButton(provider, config) {
    const isLine = provider === "line";
    const item = config?.providers?.[provider] || {};
    const available = !!item.available;
    const label = isLine ? "เข้าสู่ระบบด้วย LINE" : "เข้าสู่ระบบด้วย Google";
    return `
      <button class="provider-btn ${isLine ? "line-btn" : "google-btn"}" type="button"
        data-auth-provider="${provider}" ${available ? "" : "disabled aria-disabled=\"true\""}
        data-auth-url="${esc(available ? item.start_url : "")}">
        <span class="prov-ico">${isLine ? LINE_ICON : GOOGLE_ICON}</span>
        <span class="prov-label">${label}</span>
        <span class="prov-soon">${available ? "พร้อมใช้งาน" : "ยังไม่พร้อม"}</span>
      </button>
    `;
  }

  function linkedProviders(customer) {
    const user = customer?.user || {};
    return customer?.linked_providers || user.linked_providers || [user.provider || customer?.provider].filter(Boolean);
  }

  function displayName(customer) {
    const user = customer?.user || {};
    const profile = customer?.profile || {};
    return user.name || customer?.display_name || profile.display_name || "ลูกค้า CWF";
  }

  function pictureUrl(customer) {
    const user = customer?.user || {};
    const profile = customer?.profile || {};
    return String(user.picture || user.picture_url || customer?.picture || customer?.picture_url || profile.picture_url || "").trim();
  }

  function avatarHtml(customer, className) {
    const name = displayName(customer);
    const picture = pictureUrl(customer);
    const safeClass = className || "account-avatar";
    const initial = name.slice(0, 1);
    if (picture) {
      return `<img class="${safeClass}" src="${esc(picture)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-avatar-initial="${esc(initial)}">`;
    }
    return `<span class="${safeClass}" data-avatar-fallback>${esc(initial)}</span>`;
  }

  function replaceBrokenAvatar(img) {
    if (!img || img.dataset.avatarBroken === "1") return;
    img.dataset.avatarBroken = "1";
    const fallback = document.createElement("span");
    fallback.className = img.className || "account-avatar";
    fallback.dataset.avatarFallback = "1";
    fallback.textContent = String(img.dataset.avatarInitial || "").slice(0, 1);
    img.replaceWith(fallback);
  }

  function bindAvatarFallbacks(container) {
    const scope = container || document;
    if (!scope.querySelectorAll) return;
    scope.querySelectorAll("img[data-avatar-initial]").forEach((img) => {
      if (img.dataset.avatarBound === "1") return;
      img.dataset.avatarBound = "1";
      img.addEventListener("error", () => replaceBrokenAvatar(img), { once: true });
      if (img.complete && img.naturalWidth === 0) replaceBrokenAvatar(img);
    });
  }

  function renderCustomerSummary() {
    const customer = root.state.customer;
    if (root.state.authStatus === "loading" && !customer) {
      return `<div class="account-skeleton" aria-label="กำลังโหลดบัญชี"><span></span><span></span><span></span></div>`;
    }
    if (!customer?.logged_in) return "";
    const user = customer.user || {};
    const profile = customer.profile || {};
    const providers = linkedProviders(customer);
    return `
        <div class="customer-session-card">
          <div class="customer-session-main">
          ${avatarHtml(customer, "account-avatar")}
          <div>
            <strong>${esc(displayName(customer))}</strong>
            <span>เข้าสู่ระบบแล้ว${providers.length ? ` · ${providers.map((p) => String(p).toUpperCase()).join(" + ")}` : ""}</span>
          </div>
        </div>
        <div class="data-list">
          <div class="data-row">
            <strong>อีเมล</strong>
            <span class="muted">${esc(user.email || profile.email || "ยังไม่มีอีเมล")}</span>
          </div>
        </div>
        <button class="secondary-btn auth-logout-btn" type="button" data-auth-logout>ออกจากระบบ</button>
      </div>
    `;
  }

  function renderLoginPanel() {
    const customer = root.state.customer;
    if (customer?.logged_in) {
      return `
        <section class="card auth-card is-logged-in">
          <div class="section-head">
            <h2>บัญชีของฉัน</h2>
          </div>
          ${renderCustomerSummary()}
        </section>
      `;
    }
    if (root.state.authStatus === "loading" || root.state.authStatus === "idle") {
      return `
        <section class="card auth-card">
          <div class="section-head"><h2>กำลังตรวจสอบบัญชี</h2></div>
          <div class="account-skeleton"><span></span><span></span><span></span></div>
        </section>
      `;
    }
    const config = root.state.authConfig || {};
    return `
      <section class="card auth-card">
        <div class="section-head"><h2>เข้าสู่ระบบ</h2></div>
        <p class="muted">บันทึกที่อยู่ ดูสถานะงาน และจองครั้งถัดไปได้สะดวกขึ้น</p>
        ${authNotice()}
        <div class="auth-providers" role="group" aria-label="ตัวเลือกเข้าสู่ระบบ">
          ${providerButton("line", config)}
          ${providerButton("google", config)}
        </div>
        <p class="auth-note">ยังไม่เข้าสู่ระบบก็เลือกบริการและจองแบบ Guest ได้</p>
      </section>
    `;
  }

  function paint(container) {
    if (!container) return;
    const mount = container.querySelector("[data-auth-panel]");
    if (mount) mount.innerHTML = renderLoginPanel();
    bindAuthActions(container);
    bindAvatarFallbacks(container);
  }

  async function fetchAuthState() {
    const returnTo = currentReturnTo();
    const [customer, config] = await Promise.all([
      root.api.getCurrentCustomer(),
      root.api.getAuthConfig(returnTo),
    ]);
    root.state.customer = customer || { logged_in: false };
    root.state.authConfig = config || { logged_in: false, providers: {} };
    root.state.guestMode = !root.state.customer.logged_in;
    root.state.authStatus = "success";
    root.state.authError = "";
    root.ui?.updateAccountChrome?.();
    return root.state.customer;
  }

  async function loadCustomer(container, options = {}) {
    const force = options.force === true;
    if (!force && root.state.authStatus === "success" && root.state.customer) {
      paint(container);
      root.ui?.updateAccountChrome?.();
      return root.state.customer;
    }
    if (!force && authLoadPromise) {
      await authLoadPromise;
      paint(container);
      return root.state.customer;
    }

    root.state.authStatus = "loading";
    root.state.authError = "";
    paint(container);

    authLoadPromise = fetchAuthState().catch((error) => {
      root.state.customer = { logged_in: false };
      root.state.authConfig = { logged_in: false, providers: {} };
      root.state.guestMode = true;
      root.state.authStatus = "error";
      root.state.authError = error?.message || "ตรวจสอบบัญชีไม่สำเร็จ";
      root.ui?.updateAccountChrome?.();
      return root.state.customer;
    }).finally(() => {
      authLoadPromise = null;
    });

    await authLoadPromise;
    paint(container);
    return root.state.customer;
  }

  function bindAuthActions(container) {
    if (!container) return;
    container.querySelectorAll("[data-auth-provider]").forEach((button) => {
      if (button.dataset.bound === "1") return;
      button.dataset.bound = "1";
      button.addEventListener("click", () => {
        const url = button.getAttribute("data-auth-url");
        if (!url || button.disabled) return;
        button.disabled = true;
        const badge = button.querySelector(".prov-soon");
        if (badge) badge.textContent = "กำลังพาไป...";
        window.location.href = url;
      });
    });

    const logout = container.querySelector("[data-auth-logout]");
    if (logout && logout.dataset.bound !== "1") {
      logout.dataset.bound = "1";
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        logout.textContent = "กำลังออกจากระบบ...";
        try {
          await root.api.logoutCustomer();
          root.state.customer = { logged_in: false };
          root.state.authConfig = null;
          root.state.authStatus = "idle";
          await loadCustomer(container, { force: true });
          root.router?.refresh?.();
        } catch (_) {
          logout.disabled = false;
          logout.textContent = "ออกจากระบบ";
        }
      });
    }
  }

  root.auth = {
    bootstrap() {
      return loadCustomer(null);
    },
    renderLoginPanel,
    renderCustomerSummary,
    loadCustomer,
    displayName,
    pictureUrl,
    avatarHtml,
    bindAvatarFallbacks,
  };
})();
