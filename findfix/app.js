(() => {
  const STORE_KEY = "findfix.v1.workspaces";
  const SESSION_KEY = "findfix.v1.session";
  const ROUTES = ["dashboard", "workspaces", "jobs", "technicians", "customers", "finance", "accounting", "settings"];

  const seedWorkspaces = () => ([
    {
      id: "tenant_cwf_001",
      slug: "coldwindflow",
      name: "Coldwindflow Air Services",
      plan: "Business",
      color: "#8eff2f",
      owner: "สุทธิพงษ์ ศรีวารินทร์",
      phone: "098-877-7321",
      line: "@cwfair",
      domain: "www.cwf-air.com",
      address: "พระโขนง กรุงเทพฯ",
      createdAt: "2026-05-04",
      usageLimit: 900,
      jobs: [
        { id: "FF-25001", customer: "คุณเมย์", phone: "089-111-2244", service: "ล้างแอร์พรีเมียม", tech: "ช่างบาส", price: 1800, status: "scheduled", date: "2026-05-05", zone: "อ่อนนุช" },
        { id: "FF-25002", customer: "คุณนนท์", phone: "082-441-9900", service: "ซ่อมแอร์ไม่เย็น", tech: "ช่างต้น", price: 700, status: "in_progress", date: "2026-05-05", zone: "บางนา" },
        { id: "FF-25003", customer: "บริษัท A-One", phone: "02-555-1200", service: "ล้างแขวนคอยล์", tech: "ทีมพาร์ทเนอร์", price: 3400, status: "completed", date: "2026-05-04", zone: "สุขุมวิท" }
      ],
      techs: [
        { name: "ช่างบาส", role: "ช่างประจำ", phone: "080-111-1111", zone: "A", active: true, income: 12600 },
        { name: "ช่างต้น", role: "พาร์ทเนอร์", phone: "080-222-2222", zone: "F", active: true, income: 18400 },
        { name: "ทีมพาร์ทเนอร์", role: "ทีมงาน", phone: "080-333-3333", zone: "A/F", active: false, income: 9200 }
      ],
      customers: ["คุณเมย์", "คุณนนท์", "บริษัท A-One", "คุณปอ"],
      audit: ["สร้าง Workspace", "เปิดใช้แพ็กเกจ Business", "เพิ่มงาน FF-25001"]
    },
    {
      id: "tenant_bangna_002",
      slug: "bangna-air-care",
      name: "Bangna Air Care",
      plan: "Pro",
      color: "#1aa7ff",
      owner: "Demo Owner",
      phone: "090-222-3333",
      line: "@bangnaair",
      domain: "bangna.findfix.app",
      address: "บางนา สมุทรปราการ",
      createdAt: "2026-05-04",
      usageLimit: 350,
      jobs: [
        { id: "FF-26001", customer: "คุณฝน", phone: "091-882-1122", service: "ล้างแอร์ปกติ", tech: "ช่างเอ", price: 1200, status: "scheduled", date: "2026-05-06", zone: "บางนา" },
        { id: "FF-26002", customer: "คุณชัย", phone: "094-556-1100", service: "ติดตั้งแอร์", tech: "ช่างเอ", price: 3500, status: "completed", date: "2026-05-03", zone: "บางพลี" }
      ],
      techs: [
        { name: "ช่างเอ", role: "ช่างประจำ", phone: "081-000-8888", zone: "F", active: true, income: 7800 },
        { name: "ช่างเค", role: "พาร์ทเนอร์", phone: "081-000-9999", zone: "F", active: true, income: 5200 }
      ],
      customers: ["คุณฝน", "คุณชัย"],
      audit: ["สร้าง Workspace", "เพิ่มช่าง 2 คน"]
    },
    {
      id: "tenant_homefix_003",
      slug: "homefix-thailand",
      name: "HomeFix Thailand",
      plan: "Starter",
      color: "#16f09f",
      owner: "Demo HomeFix",
      phone: "092-444-0000",
      line: "@homefix",
      domain: "homefix.findfix.app",
      address: "กรุงเทพฯ",
      createdAt: "2026-05-04",
      usageLimit: 120,
      jobs: [
        { id: "FF-27001", customer: "คุณบี", phone: "088-010-0101", service: "ตรวจเช็คระบบไฟ", tech: "ช่างบอล", price: 900, status: "scheduled", date: "2026-05-07", zone: "ลาดพร้าว" }
      ],
      techs: [{ name: "ช่างบอล", role: "ช่างประจำ", phone: "080-778-1111", zone: "B", active: true, income: 2600 }],
      customers: ["คุณบี"],
      audit: ["สร้าง Workspace"]
    }
  ]);

  const statusText = { scheduled: "นัดหมายแล้ว", in_progress: "กำลังทำงาน", completed: "ปิดงานแล้ว", warranty: "งานแก้ไข" };
  const statusOrder = ["scheduled", "in_progress", "completed", "warranty"];

  const app = document.getElementById("app");
  const money = (n) => Number(n || 0).toLocaleString("th-TH");
  const escapeHtml = (v) => String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

  function loadWorkspaces() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    const seeded = seedWorkspaces();
    localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  function saveWorkspaces(items) { localStorage.setItem(STORE_KEY, JSON.stringify(items)); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
  }
  function setSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }
  function activeRoute() {
    const hash = location.hash.replace("#/", "").trim();
    return ROUTES.includes(hash) ? hash : "dashboard";
  }
  function getActiveWorkspace() {
    const items = loadWorkspaces();
    const session = getSession();
    return items.find((x) => x.id === session?.tenantId) || items[0];
  }
  function updateWorkspace(next) {
    const items = loadWorkspaces().map((x) => x.id === next.id ? next : x);
    saveWorkspaces(items);
  }
  function toast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function renderLogin() {
    app.innerHTML = document.getElementById("login-template").innerHTML;
    const tenantSelect = document.getElementById("tenantSelect");
    const items = loadWorkspaces();
    tenantSelect.innerHTML = items.map((t) => `<option value="${t.id}">${escapeHtml(t.name)} — ${escapeHtml(t.plan)}</option>`).join("");
    app.querySelector("[data-form='login']").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      setSession({ tenantId: fd.get("tenant"), role: fd.get("role"), displayName: fd.get("displayName") || "Demo User", loginAt: new Date().toISOString() });
      location.hash = "#/dashboard";
      renderApp();
    });
    app.querySelector("[data-action='quick-login']").addEventListener("click", () => {
      setSession({ tenantId: items[0].id, role: "owner", displayName: "Demo Owner", loginAt: new Date().toISOString() });
      location.hash = "#/dashboard";
      renderApp();
    });
    app.querySelector("[data-action='seed-reset']").addEventListener("click", () => {
      localStorage.removeItem(STORE_KEY); clearSession(); renderLogin(); toast("รีเซ็ตข้อมูล Demo แล้ว");
    });
  }

  function renderApp() {
    if (!getSession()) return renderLogin();
    app.innerHTML = document.getElementById("app-template").innerHTML;
    bindShell();
    renderPage();
  }

  function bindShell() {
    const items = loadWorkspaces();
    const active = getActiveWorkspace();
    const session = getSession();
    document.getElementById("sideTenantName").textContent = active.name;
    document.getElementById("sideTenantCode").textContent = active.id;
    const switcher = document.getElementById("workspaceSwitcher");
    switcher.innerHTML = items.map((t) => `<option value="${t.id}" ${t.id === active.id ? "selected" : ""}>${escapeHtml(t.name)} · ${escapeHtml(t.plan)}</option>`).join("");
    switcher.addEventListener("change", (e) => {
      setSession({ ...session, tenantId: e.target.value });
      renderApp();
    });
    app.querySelectorAll("[data-route]").forEach((btn) => {
      const route = btn.dataset.route;
      btn.classList.toggle("active", route === activeRoute());
      btn.addEventListener("click", () => { location.hash = `#/${route}`; closeMenu(); renderPage(); });
    });
    app.querySelector("[data-action='logout']").addEventListener("click", () => { clearSession(); location.hash = ""; renderLogin(); });
    app.querySelector("[data-action='toggle-menu']").addEventListener("click", () => app.querySelector(".sidebar").classList.toggle("open"));
    app.querySelector("[data-action='copy-link']").addEventListener("click", async () => {
      const link = `${location.origin}${location.pathname}?shop=${active.slug}`;
      try { await navigator.clipboard.writeText(link); toast("คัดลอกลิงก์ร้านแล้ว"); } catch (_) { toast(link); }
    });
  }
  function closeMenu() { app.querySelector(".sidebar")?.classList.remove("open"); }

  function stats(t) {
    const completedJobs = t.jobs.filter((j) => j.status === "completed");
    const revenue = completedJobs.reduce((s, j) => s + Number(j.price || 0), 0);
    const activeJobs = t.jobs.filter((j) => j.status !== "completed").length;
    const techPay = Math.round(revenue * 0.38);
    const expenses = Math.round(revenue * 0.12);
    const vat = Math.round(revenue * 0.07);
    const withholding = Math.round(revenue * 0.03);
    const netProfit = Math.max(0, revenue - techPay - expenses);
    const receivable = t.jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress").reduce((sum, j) => sum + Number(j.price || 0), 0);
    return { revenue, activeJobs, jobCount: t.jobs.length, techCount: t.techs.length, customerCount: t.customers.length, completedCount: completedJobs.length, techPay, expenses, vat, withholding, netProfit, receivable };
  }
  function pageHeader(t, desc, actionHtml = "") {
    return `<div class="hero-panel"><div><p class="eyebrow">${escapeHtml(t.plan)} Workspace</p><h2 class="workspace-title">${escapeHtml(t.name)} <span>Console</span></h2><p class="subtitle">${escapeHtml(desc)}</p></div><div>${actionHtml}</div></div>`;
  }
  function renderStats(t) {
    const s = stats(t);
    return `<div class="stats-grid premium-stats">
      <div class="stat stat-blue"><small>งานทั้งหมด</small><strong>${s.jobCount}</strong><em>${s.activeJobs} งานยังไม่ปิด</em></div>
      <div class="stat stat-green"><small>รายได้ปิดงาน</small><strong>฿${money(s.revenue)}</strong><em>จาก ${s.completedCount} งานสำเร็จ</em></div>
      <div class="stat stat-lime"><small>กำไรสุทธิตัวอย่าง</small><strong>฿${money(s.netProfit)}</strong><em>หักค่าช่าง/ค่าใช้จ่าย demo</em></div>
      <div class="stat stat-cyan"><small>ช่างในร้าน</small><strong>${s.techCount}</strong><em>${s.customerCount} ลูกค้าในระบบ</em></div>
    </div>`;
  }

  function renderPage() {
    const route = activeRoute();
    const page = document.getElementById("page");
    const t = getActiveWorkspace();
    app.querySelectorAll("[data-route]").forEach((btn) => btn.classList.toggle("active", btn.dataset.route === route));
    const views = { dashboard, workspaces, jobs, technicians, customers, finance, accounting, settings };
    page.innerHTML = views[route](t);
    bindPage(route, t);
  }

  function dashboard(t) {
    const s = stats(t);
    const grouped = Object.fromEntries(statusOrder.map((status) => [status, t.jobs.filter((j) => j.status === status)]));
    const aiScore = Math.min(98, 72 + Math.round((s.completedCount / Math.max(1, s.jobCount)) * 20));
    return `${pageHeader(t, "ภาพรวมร้านสไตล์ CWF แต่แยก Workspace ชัดเจน เห็นงาน รายได้ บัญชี ความเสี่ยง และ insight สำคัญในหน้าเดียว", `<button class="primary" data-action="open-job-modal">+ เพิ่มงาน</button>`)}
      <section class="command-hero glass-card">
        <div class="command-left">
          <div class="command-logo"><img src="./assets/logo-findfix.png" alt="FindFix"></div>
          <div>
            <p class="eyebrow">FindFix Command Center</p>
            <h3>${escapeHtml(t.name)}</h3>
            <p>ศูนย์ควบคุมร้านแบบเดียวกับ CWF: งานวันนี้, รายได้, บัญชี, เอกสาร, แจ้งเตือน และการแยกร้านในระบบเดียว</p>
          </div>
        </div>
        <div class="command-actions">
          <button class="ghost small" data-route="accounting">เปิดงานบัญชี</button>
          <button class="ghost small" data-route="jobs">ดูงานบริการ</button>
        </div>
      </section>
      ${renderStats(t)}
      <div class="wow-grid">
        <section class="glass-card wow-card ai-card">
          <div class="section-head"><h3>AI Operation Insight</h3><span class="pill">Score ${aiScore}%</span></div>
          <p class="big-insight">วันนี้ควรโฟกัส: ปิดงานค้าง ${s.activeJobs} งาน และตรวจยอดค้างรับ ฿${money(s.receivable)}</p>
          <div class="signal-list">
            <div><b>⚡ Smart Alert</b><span>ถ้างานค้างเกินกำหนด ระบบควรแจ้งแอดมิน/ช่างอัตโนมัติ</span></div>
            <div><b>💲 Money Guard</b><span>แยกยอดรับจริง ค่าช่าง ค่าใช้จ่าย และกำไรต่อร้าน</span></div>
            <div><b>🧾 Document Ready</b><span>ต่อยอดใบเสนอราคา ใบรับเงิน ใบกำกับภาษี และ ทวิ50 ได้</span></div>
          </div>
        </section>
        <section class="glass-card accounting-preview">
          <div class="section-head"><h3>ภาพรวมบัญชี</h3><button class="ghost small" data-route="accounting">ไปงานบัญชี</button></div>
          <div class="money-stack">
            <div><span>รายได้รวม</span><strong>฿${money(s.revenue)}</strong></div>
            <div><span>ค่าช่างโดยประมาณ</span><strong>฿${money(s.techPay)}</strong></div>
            <div><span>กำไรสุทธิ demo</span><strong>฿${money(s.netProfit)}</strong></div>
          </div>
        </section>
      </div>
      <div class="dashboard-grid">
        <section class="glass-card"><div class="section-head"><h3>กระดานงานบริการ</h3><span class="pill">${escapeHtml(t.id)}</span></div><div class="kanban">
          ${statusOrder.map((status) => `<div class="lane"><h4>${statusText[status]}</h4>${grouped[status].length ? grouped[status].map(jobCard).join("") : `<div class="empty">ยังไม่มีงาน</div>`}</div>`).join("")}
        </div></section>
        <section class="glass-card"><div class="section-head"><h3>Audit / Activity</h3><button class="ghost small" data-route="settings">ตั้งค่า</button></div><div class="timeline-list">${t.audit.slice(-7).reverse().map((x, idx) => `<div class="timeline-item"><i>${idx + 1}</i><div><strong>${escapeHtml(x)}</strong><small>${new Date().toLocaleDateString("th-TH")}</small></div></div>`).join("")}</div></section>
      </div>`;
  }
  function jobCard(j) { return `<article class="job-card"><b>${escapeHtml(j.id)} · ${escapeHtml(j.customer)}</b><small>${escapeHtml(j.service)} / ${escapeHtml(j.tech)} / ฿${money(j.price)}</small></article>`; }

  function workspaces(t) {
    const items = loadWorkspaces();
    return `${pageHeader(t, "หน้าร้าน/สาขา แสดงแนวคิด Multi-tenant: แต่ละร้านมีข้อมูล งาน ช่าง ลูกค้า และตั้งค่าของตัวเอง", `<button class="primary" data-action="open-workspace-modal">+ สร้างร้านใหม่</button>`)}
      <div class="table-card"><div class="table-wrap"><table class="ff-table"><thead><tr><th>ร้าน</th><th>Tenant ID</th><th>แพ็กเกจ</th><th>งาน</th><th>ช่าง</th><th>ลิงก์</th></tr></thead><tbody>
      ${items.map((x) => `<tr><td><span class="color-dot" style="background:${escapeHtml(x.color)}"></span><strong>${escapeHtml(x.name)}</strong><br><small class="muted">${escapeHtml(x.owner)}</small></td><td>${escapeHtml(x.id)}</td><td><span class="pill">${escapeHtml(x.plan)}</span></td><td>${x.jobs.length}</td><td>${x.techs.length}</td><td>/findfix/?shop=${escapeHtml(x.slug)}</td></tr>`).join("")}
      </tbody></table></div></div>`;
  }

  function jobs(t) {
    return `${pageHeader(t, "รายการงานของ Workspace นี้เท่านั้น เปลี่ยนร้านด้านบนแล้วข้อมูลจะเปลี่ยนทันที", `<button class="primary" data-action="open-job-modal">+ เพิ่มงาน</button>`)}
      <div class="toolbar"><input data-filter="jobs" placeholder="ค้นหางาน ลูกค้า ช่าง โซน"><select data-filter-status><option value="">ทุกสถานะ</option>${statusOrder.map((s) => `<option value="${s}">${statusText[s]}</option>`).join("")}</select></div>
      <div class="table-card"><div class="table-wrap"><table class="ff-table" id="jobsTable"><thead><tr><th>เลขงาน</th><th>ลูกค้า</th><th>บริการ</th><th>ช่าง</th><th>โซน</th><th>ราคา</th><th>สถานะ</th></tr></thead><tbody>${jobRows(t.jobs)}</tbody></table></div></div>`;
  }
  function jobRows(items) { return items.map((j) => `<tr data-search="${escapeHtml(Object.values(j).join(" ").toLowerCase())}" data-status="${escapeHtml(j.status)}"><td>${escapeHtml(j.id)}</td><td><strong>${escapeHtml(j.customer)}</strong><br><small class="muted">${escapeHtml(j.phone)}</small></td><td>${escapeHtml(j.service)}<br><small class="muted">${escapeHtml(j.date)}</small></td><td>${escapeHtml(j.tech)}</td><td>${escapeHtml(j.zone)}</td><td>฿${money(j.price)}</td><td><span class="pill">${statusText[j.status] || j.status}</span></td></tr>`).join(""); }

  function technicians(t) {
    return `${pageHeader(t, "จัดการทีมช่างของร้านนี้ แยกจากร้านอื่น เพื่อรองรับสูตรรายได้และพื้นที่รับงานในอนาคต", `<button class="primary" data-action="open-tech-modal">+ เพิ่มช่าง</button>`)}
      <div class="split">${t.techs.map((tech) => `<section class="glass-card"><div class="section-head"><h3>${escapeHtml(tech.name)}</h3><span class="pill">${tech.active ? "พร้อมรับงาน" : "พักรับงาน"}</span></div><p class="muted">${escapeHtml(tech.role)} · โซน ${escapeHtml(tech.zone)} · ${escapeHtml(tech.phone)}</p><div class="progress"><i style="width:${Math.min(100, Math.round((tech.income || 0) / 200))}%"></i></div><p>ที่ช่างจะได้รับตัวอย่าง: <strong>฿${money(tech.income)}</strong></p></section>`).join("")}</div>`;
  }

  function customers(t) {
    return `${pageHeader(t, "ฐานลูกค้าเบื้องต้นของ Workspace นี้ ใช้ต่อยอดเป็น CRM / ประวัติซ่อม / แจ้งเตือนรับประกัน", "")}
      <div class="glass-card"><div class="list">${t.customers.map((c, i) => `<div class="row"><div><strong>${escapeHtml(c)}</strong><small>Customer ID: CUS-${String(i + 1).padStart(4, "0")}</small></div><span class="pill">${t.jobs.filter((j) => j.customer === c).length} งาน</span></div>`).join("")}</div></div>`;
  }

  function finance(t) {
    const s = stats(t);
    const planUsage = Math.min(100, Math.round((t.jobs.length / t.usageLimit) * 100));
    const completed = t.jobs.filter((j) => j.status === "completed");
    return `${pageHeader(t, "หน้ารายได้ระดับร้าน แยกตาม Workspace เพื่อให้เจ้าของร้านเห็นยอดตัวเอง ไม่เห็นร้านอื่น", "")}${renderStats(t)}
      <div class="split"><section class="glass-card"><div class="section-head"><h3>Usage ของแพ็กเกจ</h3><span class="pill">${planUsage}%</span></div><p class="muted">ใช้ ${t.jobs.length} / ${t.usageLimit} งานต่อรอบบิล</p><div class="progress"><i style="width:${planUsage}%"></i></div></section>
      <section class="glass-card"><div class="section-head"><h3>งานที่ปิดแล้ว</h3><span class="pill">฿${money(s.revenue)}</span></div><div class="list">${completed.length ? completed.map((j) => `<div class="row"><div><strong>${escapeHtml(j.id)} · ${escapeHtml(j.customer)}</strong><small>${escapeHtml(j.service)}</small></div><b>฿${money(j.price)}</b></div>`).join("") : `<div class="empty">ยังไม่มีงานปิด</div>`}</div></section></div>`;
  }

  function accounting(t) {
    const s = stats(t);
    const completed = t.jobs.filter((j) => j.status === "completed");
    const docs = [
      { title: "ใบเสนอราคา", count: Math.max(1, Math.ceil(t.jobs.length / 2)), status: "พร้อมสร้าง" },
      { title: "ใบรับเงิน / E-Receipt", count: completed.length, status: "จากงานปิดแล้ว" },
      { title: "ใบกำกับภาษี", count: Math.max(0, completed.length - 1), status: "รอข้อมูลภาษี" },
      { title: "ทวิ50 ช่าง", count: t.techs.length, status: "สร้างรายเดือน" }
    ];
    const ledger = [
      { label: "รายได้จากงานปิด", amount: s.revenue, type: "income" },
      { label: "ยอดค้างรับจากงานยังไม่ปิด", amount: s.receivable, type: "receivable" },
      { label: "ค่าช่างโดยประมาณ", amount: s.techPay, type: "expense" },
      { label: "ค่าใช้จ่ายหน้างาน demo", amount: s.expenses, type: "expense" },
      { label: "VAT 7% ตัวอย่าง", amount: s.vat, type: "tax" },
      { label: "หัก ณ ที่จ่าย 3% ตัวอย่าง", amount: s.withholding, type: "tax" }
    ];
    return `${pageHeader(t, "งานบัญชีของร้านนี้ แยกจาก Workspace อื่น เห็นรายได้ เอกสาร ภาษี ค่าช่าง และรายการที่ต้องจัดการในหน้าเดียว", `<button class="primary" data-action="open-doc-modal">+ สร้างเอกสาร</button>`)}
      <div class="accounting-hero glass-card">
        <div>
          <p class="eyebrow">Accounting Control Room</p>
          <h3>งานบัญชี</h3>
          <p>โครงนี้ออกแบบให้ต่อยอดเป็นระบบบัญชีจริงของ FindFix: ใบเสนอราคา, ใบรับเงิน, ใบกำกับภาษี, ค่าใช้จ่าย, ค่าช่าง, ทวิ50 และรายงานสรรพากร</p>
        </div>
        <div class="accounting-score"><span>Net Demo</span><strong>฿${money(s.netProfit)}</strong><small>หลังหักค่าช่าง/ค่าใช้จ่ายตัวอย่าง</small></div>
      </div>
      <div class="accounting-grid">
        <section class="glass-card"><div class="section-head"><h3>สรุปการเงิน</h3><span class="pill">${escapeHtml(t.plan)}</span></div><div class="ledger-list">
          ${ledger.map((x) => `<div class="ledger-row ${x.type}"><div><strong>${escapeHtml(x.label)}</strong><small>${escapeHtml(x.type)}</small></div><b>฿${money(x.amount)}</b></div>`).join("")}
        </div></section>
        <section class="glass-card"><div class="section-head"><h3>เอกสารบัญชี</h3><span class="pill">Document Center</span></div><div class="doc-grid">
          ${docs.map((d) => `<article class="doc-card"><span>🧾</span><strong>${escapeHtml(d.title)}</strong><em>${d.count} รายการ</em><small>${escapeHtml(d.status)}</small></article>`).join("")}
        </div></section>
      </div>
      <div class="accounting-grid lower">
        <section class="glass-card"><div class="section-head"><h3>รายการงานพร้อมออกเอกสาร</h3><button class="ghost small" data-route="jobs">ดูงานทั้งหมด</button></div><div class="table-wrap"><table class="ff-table"><thead><tr><th>เลขงาน</th><th>ลูกค้า</th><th>บริการ</th><th>ยอด</th><th>เอกสาร</th></tr></thead><tbody>
          ${completed.length ? completed.map((j) => `<tr><td>${escapeHtml(j.id)}</td><td>${escapeHtml(j.customer)}</td><td>${escapeHtml(j.service)}</td><td>฿${money(j.price)}</td><td><span class="pill">พร้อมออกใบรับเงิน</span></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty">ยังไม่มีงานปิดสำหรับออกเอกสาร</div></td></tr>`}
        </tbody></table></div></section>
        <section class="glass-card"><div class="section-head"><h3>สิ่งที่ว้าวสำหรับต่อยอด</h3><span class="pill">WOW</span></div><div class="signal-list">
          <div><b>📌 Auto Tax Checklist</b><span>เตือนเอกสารที่ยังไม่มีเลขภาษี/ที่อยู่/ลายเซ็น</span></div>
          <div><b>📄 One-click PDF</b><span>สร้างใบเสนอราคา ใบรับเงิน ใบกำกับภาษี จากงานเดียว</span></div>
          <div><b>🔐 Audit by Role</b><span>รู้ว่าใครสร้าง/แก้/อนุมัติ/จ่ายเงิน เมื่อไหร่</span></div>
          <div><b>📊 Owner Report</b><span>รายงานกำไร รายจ่าย ค่าช่าง แยกเดือน/ไตรมาส</span></div>
        </div></section>
      </div>`;
  }

  function settings(t) {
    return `${pageHeader(t, "ตั้งค่าร้าน โลโก้ สีหลัก แพ็กเกจ เบอร์ LINE และข้อมูลเอกสาร เพื่อให้แต่ละร้านมี Branding ของตัวเอง", "")}
      <form class="glass-card" data-form="settings"><div class="form-grid">
        <div class="field"><label>ชื่อร้าน</label><input name="name" value="${escapeHtml(t.name)}"></div>
        <div class="field"><label>แพ็กเกจ</label><select name="plan"><option ${t.plan === "Starter" ? "selected" : ""}>Starter</option><option ${t.plan === "Pro" ? "selected" : ""}>Pro</option><option ${t.plan === "Business" ? "selected" : ""}>Business</option><option ${t.plan === "Enterprise" ? "selected" : ""}>Enterprise</option></select></div>
        <div class="field"><label>เจ้าของร้าน</label><input name="owner" value="${escapeHtml(t.owner)}"></div>
        <div class="field"><label>เบอร์โทร</label><input name="phone" value="${escapeHtml(t.phone)}"></div>
        <div class="field"><label>LINE OA</label><input name="line" value="${escapeHtml(t.line)}"></div>
        <div class="field"><label>สีหลัก</label><input name="color" value="${escapeHtml(t.color)}"></div>
        <div class="field full"><label>ที่อยู่ร้าน</label><textarea name="address" rows="3">${escapeHtml(t.address)}</textarea></div>
      </div><div class="modal-actions"><button class="primary" type="submit">บันทึกตั้งค่า</button></div></form>`;
  }

  function bindPage(route, t) {
    app.querySelectorAll("[data-action='open-job-modal']").forEach((b) => b.addEventListener("click", () => openJobModal(t)));
    app.querySelectorAll("[data-action='open-tech-modal']").forEach((b) => b.addEventListener("click", () => openTechModal(t)));
    app.querySelectorAll("[data-action='open-workspace-modal']").forEach((b) => b.addEventListener("click", openWorkspaceModal));
    app.querySelectorAll("[data-action='open-doc-modal']").forEach((b) => b.addEventListener("click", () => openDocModal(t)));
    app.querySelectorAll("[data-route]").forEach((b) => b.addEventListener("click", () => { location.hash = `#/${b.dataset.route}`; renderPage(); }));
    const jobFilter = app.querySelector("[data-filter='jobs']");
    const statusFilter = app.querySelector("[data-filter-status]");
    const runFilter = () => {
      const q = (jobFilter?.value || "").trim().toLowerCase();
      const st = statusFilter?.value || "";
      app.querySelectorAll("#jobsTable tbody tr").forEach((tr) => {
        tr.style.display = (!q || tr.dataset.search.includes(q)) && (!st || tr.dataset.status === st) ? "" : "none";
      });
    };
    jobFilter?.addEventListener("input", runFilter);
    statusFilter?.addEventListener("change", runFilter);
    app.querySelector("[data-form='settings']")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const next = { ...t, name: fd.get("name"), plan: fd.get("plan"), owner: fd.get("owner"), phone: fd.get("phone"), line: fd.get("line"), color: fd.get("color"), address: fd.get("address"), audit: [...t.audit, "แก้ไขตั้งค่าร้าน"] };
      updateWorkspace(next); toast("บันทึกตั้งค่า FindFix แล้ว"); renderApp();
    });
  }

  function modal(content) {
    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.innerHTML = `<div class="modal-card">${content}</div>`;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }
  function openJobModal(t) {
    const wrap = modal(`<div class="section-head"><h2>เพิ่มงานใหม่</h2><button class="ghost small" data-close>ปิด</button></div><form data-form="job"><div class="form-grid">
      <div class="field"><label>ชื่อลูกค้า</label><input name="customer" required></div><div class="field"><label>เบอร์โทร</label><input name="phone"></div>
      <div class="field"><label>บริการ</label><input name="service" value="ล้างแอร์ปกติ" required></div><div class="field"><label>ช่าง</label><select name="tech">${t.techs.map((x) => `<option>${escapeHtml(x.name)}</option>`).join("")}</select></div>
      <div class="field"><label>โซน</label><input name="zone" value="อ่อนนุช"></div><div class="field"><label>ราคา</label><input name="price" type="number" value="700"></div>
      <div class="field"><label>วันที่</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>สถานะ</label><select name="status">${statusOrder.map((s) => `<option value="${s}">${statusText[s]}</option>`).join("")}</select></div>
    </div><div class="modal-actions"><button class="ghost" type="button" data-close>ยกเลิก</button><button class="primary" type="submit">เพิ่มงาน</button></div></form>`);
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
    wrap.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const nextNo = String(t.jobs.length + 25001).padStart(5, "0");
      const job = { id: `FF-${nextNo}`, customer: fd.get("customer"), phone: fd.get("phone"), service: fd.get("service"), tech: fd.get("tech"), price: Number(fd.get("price") || 0), status: fd.get("status"), date: fd.get("date"), zone: fd.get("zone") };
      const next = { ...t, jobs: [job, ...t.jobs], customers: Array.from(new Set([fd.get("customer"), ...t.customers].filter(Boolean))), audit: [...t.audit, `เพิ่มงาน ${job.id}`] };
      updateWorkspace(next); wrap.remove(); toast("เพิ่มงานใน Workspace นี้แล้ว"); renderApp();
    });
  }
  function openTechModal(t) {
    const wrap = modal(`<div class="section-head"><h2>เพิ่มช่าง</h2><button class="ghost small" data-close>ปิด</button></div><form data-form="tech"><div class="form-grid">
      <div class="field"><label>ชื่อช่าง</label><input name="name" required></div><div class="field"><label>บทบาท</label><select name="role"><option>ช่างประจำ</option><option>พาร์ทเนอร์</option><option>ทีมงาน</option></select></div>
      <div class="field"><label>เบอร์โทร</label><input name="phone"></div><div class="field"><label>โซน</label><input name="zone" value="A"></div>
    </div><div class="modal-actions"><button class="ghost" type="button" data-close>ยกเลิก</button><button class="primary" type="submit">เพิ่มช่าง</button></div></form>`);
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
    wrap.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const tech = { name: fd.get("name"), role: fd.get("role"), phone: fd.get("phone"), zone: fd.get("zone"), active: true, income: 0 };
      updateWorkspace({ ...t, techs: [...t.techs, tech], audit: [...t.audit, `เพิ่มช่าง ${tech.name}`] });
      wrap.remove(); toast("เพิ่มช่างแล้ว"); renderApp();
    });
  }
  function openWorkspaceModal() {
    const wrap = modal(`<div class="section-head"><h2>สร้างร้านใหม่</h2><button class="ghost small" data-close>ปิด</button></div><form data-form="workspace"><div class="form-grid">
      <div class="field"><label>ชื่อร้าน</label><input name="name" required></div><div class="field"><label>Slug</label><input name="slug" placeholder="my-air-shop" required></div>
      <div class="field"><label>แพ็กเกจ</label><select name="plan"><option>Starter</option><option>Pro</option><option>Business</option></select></div><div class="field"><label>เจ้าของ</label><input name="owner" value="Demo Owner"></div>
    </div><div class="modal-actions"><button class="ghost" type="button" data-close>ยกเลิก</button><button class="primary" type="submit">สร้างร้าน</button></div></form>`);
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
    wrap.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const slug = String(fd.get("slug")).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      const item = { id: `tenant_${slug}_${Date.now()}`, slug, name: fd.get("name"), plan: fd.get("plan"), color: "#8eff2f", owner: fd.get("owner"), phone: "", line: "", domain: `${slug}.findfix.app`, address: "", createdAt: new Date().toISOString().slice(0,10), usageLimit: 120, jobs: [], techs: [], customers: [], audit: ["สร้าง Workspace"] };
      const items = [item, ...loadWorkspaces()]; saveWorkspaces(items); setSession({ ...getSession(), tenantId: item.id });
      wrap.remove(); toast("สร้างร้านใหม่แล้ว"); renderApp();
    });
  }

  function openDocModal(t) {
    const wrap = modal(`<div class="section-head"><h2>สร้างเอกสารบัญชี</h2><button class="ghost small" data-close>ปิด</button></div><form data-form="doc"><div class="form-grid">
      <div class="field"><label>ประเภทเอกสาร</label><select name="docType"><option>ใบเสนอราคา</option><option>ใบรับเงิน / E-Receipt</option><option>ใบกำกับภาษี</option><option>ทวิ50 ช่าง</option></select></div>
      <div class="field"><label>อ้างอิงงาน</label><select name="jobId">${t.jobs.map((j) => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.id)} · ${escapeHtml(j.customer)}</option>`).join("")}</select></div>
      <div class="field"><label>ผู้สร้าง</label><input name="createdBy" value="Demo Accountant"></div>
      <div class="field"><label>สถานะ</label><select name="status"><option>ร่างเอกสาร</option><option>รออนุมัติ</option><option>พร้อมส่งลูกค้า</option></select></div>
      <div class="field full"><label>หมายเหตุ</label><textarea name="note" rows="3" placeholder="เช่น ต้องตรวจเลขภาษี / แนบลายเซ็น / ส่ง LINE OA"></textarea></div>
    </div><div class="modal-actions"><button class="ghost" type="button" data-close>ยกเลิก</button><button class="primary" type="submit">บันทึก Demo</button></div></form>`);
    wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => wrap.remove()));
    wrap.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      updateWorkspace({ ...t, audit: [...t.audit, `สร้างเอกสาร ${fd.get("docType")} สำหรับ ${fd.get("jobId")}`] });
      wrap.remove(); toast("สร้างเอกสาร Demo แล้ว"); renderApp();
    });
  }

  window.addEventListener("hashchange", () => getSession() ? renderPage() : renderLogin());
  const queryShop = new URLSearchParams(location.search).get("shop");
  if (queryShop && !getSession()) {
    const target = loadWorkspaces().find((x) => x.slug === queryShop);
    if (target) setSession({ tenantId: target.id, role: "owner", displayName: "Demo Link User", loginAt: new Date().toISOString() });
  }
  if (getSession()) renderApp(); else renderLogin();
})();
