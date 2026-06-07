(function(){
  const VERSION = "ai-office-production-v7-bangkok-availability-20260607";
  const ASSET_ROOT = "/assets/ai-office-final";
  const CLEAN_CHARACTER_ROOT = `${ASSET_ROOT}/characters-clean`;
  const order = ["admin","sales","ops","ads","content","dev"];
  const switchOrder = ["office", ...order];
  const stateNames = ["base","idle","thinking","talking","working","walk-1","walk-2","walk-3","walk-4"];

  function characterAssets(role){
    const out = {};
    stateNames.forEach((state) => { out[state] = `${CLEAN_CHARACTER_ROOT}/${role}/${state}.png`; });
    return out;
  }

  const agents = {
    office: {
      name:"Office Chat", short:"Office", color:"#0d3d8d",
      role:"รวมทุกแผนก: วิเคราะห์คำถามแล้วให้ Admin, Sales, Ops, Ads, Content หรือ Dev AI ช่วยตอบร่วมกัน",
      bubble:"รวมทุกแผนกพร้อมช่วย", thinking:"กำลังแยกงานให้ทีม AI", talking:"รวมคำตอบให้แล้ว", working:"รวมงานทุกแผนก",
      home:{x:50,y:42}, mobile:{x:51,y:45}, center:{x:50,y:42}, size:{desktop:66,mobile:54}, assets:characterAssets("admin"),
    },
    admin: {
      name:"Admin AI", short:"Admin", color:"#1558d6",
      role:"ผู้ช่วยแอดมิน: สรุปงาน ร่างข้อความลูกค้า ร่างข้อความแจ้งช่าง แปลข้อความ และจัดข้อมูลให้พร้อมใช้",
      bubble:"พร้อมช่วยงานแอดมิน", thinking:"กำลังตรวจข้อมูลงานจริง", talking:"สรุปให้แล้ว", working:"จัดงานแอดมิน",
      home:{x:24,y:62}, mobile:{x:22,y:70}, center:{x:24,y:62}, size:{desktop:64,mobile:52}, assets:characterAssets("admin"),
    },
    sales: {
      name:"Sales AI", short:"Sales", color:"#f0b400",
      role:"ผู้ช่วยฝ่ายขาย: ตอบลูกค้าบอกว่าแพง ช่วยปิดการขาย อธิบายราคา แพ็กเกจ และร่าง follow-up",
      bubble:"พร้อมช่วยปิดงาน", thinking:"กำลังวิเคราะห์มุมขาย", talking:"ได้แนวตอบฝ่ายขายแล้ว", working:"ดูโอกาสขาย",
      home:{x:74,y:62}, mobile:{x:66,y:70}, center:{x:74,y:62}, size:{desktop:64,mobile:52}, assets:characterAssets("sales"),
    },
    ops: {
      name:"Ops AI", short:"Ops", color:"#13a46b",
      role:"ผู้ช่วยปฏิบัติการ: ดูคิว งานวันนี้ งานพรุ่งนี้ งานค้าง งานยังไม่จ่าย งานเสี่ยง และจุดที่ต้องตาม",
      bubble:"พร้อมดูคิวงาน", thinking:"กำลังตรวจคิวและความเสี่ยง", talking:"เจอประเด็นที่ต้องดูแล้ว", working:"ประสานคิวงาน",
      home:{x:50,y:42}, mobile:{x:51,y:45}, center:{x:50,y:42}, size:{desktop:66,mobile:54}, assets:characterAssets("ops"),
    },
    ads: {
      name:"Ads AI", short:"Ads", color:"#ef5aa3",
      role:"ผู้ช่วยโฆษณา: วิเคราะห์แอด คิด keyword พื้นที่ยิงแอด Hook ข้อความโฆษณา และโอกาสจากงานจริง",
      bubble:"พร้อมคิดแอด", thinking:"กำลังหาโอกาสโฆษณา", talking:"ได้มุมแคมเปญแล้ว", working:"ดูแผนโฆษณา",
      home:{x:19,y:36}, mobile:{x:34,y:61}, center:{x:19,y:36}, size:{desktop:60,mobile:50}, assets:characterAssets("ads"),
    },
    content: {
      name:"Content AI", short:"Content", color:"#8b5cf6",
      role:"ผู้ช่วยคอนเทนต์: เขียนโพสต์ แคปชัน รีวิว สคริปต์ Reels/TikTok และไอเดียภาพจากงานจริง",
      bubble:"พร้อมทำคอนเทนต์", thinking:"กำลังเรียบเรียงคอนเทนต์", talking:"ร่างคอนเทนต์ให้แล้ว", working:"จัดไอเดียโพสต์",
      home:{x:31,y:80}, mobile:{x:43,y:78}, center:{x:31,y:80}, size:{desktop:60,mobile:50}, assets:characterAssets("content"),
    },
    dev: {
      name:"Dev AI", short:"Dev", color:"#334155",
      role:"ผู้ช่วยระบบ: สรุปบั๊ก เขียน prompt ส่ง Codex ทำ checklist ก่อน deploy ตรวจความเสี่ยง และ rollback notes",
      bubble:"พร้อมช่วยระบบ", thinking:"กำลังตรวจมุมระบบ", talking:"สรุปทางแก้ให้แล้ว", working:"เช็กระบบ",
      home:{x:82,y:37}, mobile:{x:80,y:47}, center:{x:82,y:37}, size:{desktop:60,mobile:50}, assets:characterAssets("dev"),
    },
  };

  const app = {
    active:"admin", open:false, loading:false, conversations:{}, walkTimers:{}, bubbleTimers:{}, ambientTimer:null,
  };

  const quickCommands = [
    "รวมทุกแผนก",
    "ตอบลูกค้ายังไงดี",
    "ลูกค้าบอกว่าแพง",
    "อธิบายล้างปกติ/พรีเมียมแบบสั้น",
    "พรุ่งนี้บ่ายโมงมีคิวไหม",
    "พรุ่งนี้ 13:00 มีช่างว่างไหม",
    "วันนี้รับงานเพิ่มได้ไหม",
    "งานไหนชนคิว",
    "ร่างข้อความยืนยันนัด",
    "ร่างข้อความแจ้งช่างกำลังเดินทาง",
    "งานไหนยังไม่ปิด",
    "งานไหนยังไม่จ่าย",
  ];

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
  function isMobile(){ return window.matchMedia("(max-width: 860px)").matches; }
  function cfg(key){ return agents[key] || agents.admin; }
  function agentEl(key){ return qs(`.agent[data-agent="${key}"]`); }
  function cleanText(value){ return String(value || "").trim(); }
  function safeSlice(value, max){ return String(value || "").replace(/\s+/g," ").trim().slice(0,max); }
  function escapeHtml(value){ return String(value || "").replace(/[&<>"]/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }
  function showToast(text){ const el = qs("#toast"); if(!el) return; el.textContent = text; el.classList.add("show"); clearTimeout(showToast.t); showToast.t = setTimeout(() => el.classList.remove("show"), 2600); }
  function updateOfficeStatus(text){ const el = qs("#officeStatus"); if (el) el.textContent = text || "ทีม AI พร้อมช่วยงาน"; }
  function updateTeamStatus(text){ const el = qs("#teamStatus"); if (el) el.textContent = text || "พร้อมคุยต่อเนื่องด้วยข้อมูลงานจริง"; }
  function autoGrow(el){ if(!el) return; el.style.height="auto"; el.style.height = `${Math.min(el.scrollHeight, 158)}px`; }

  function loadSavedConversations(){
    try { app.conversations = JSON.parse(sessionStorage.getItem("cwf_ai_office_v6_conversations") || "{}"); }
    catch(_) { app.conversations = {}; }
  }
  function saveConversations(){
    try { sessionStorage.setItem("cwf_ai_office_v6_conversations", JSON.stringify(app.conversations)); } catch(_) {}
  }

  function setSprite(key, assetKey){
    const img = agentEl(key)?.querySelector(".sprite");
    const a = cfg(key);
    if (img) img.src = a.assets[assetKey] || a.assets.idle || a.assets.base;
  }
  function setChatAvatar(){
    const img = qs("#chatAvatar");
    if (img) img.src = cfg(app.active).assets.idle || cfg(app.active).assets.base;
  }
  function homeFor(key){ return isMobile() ? cfg(key).mobile : cfg(key).home; }
  function placeAgent(key, point){
    const el = agentEl(key); if (!el || !point) return;
    const a = cfg(key); const size = isMobile() ? a.size.mobile : a.size.desktop;
    el.style.setProperty("--x", `${point.x}%`);
    el.style.setProperty("--y", `${point.y}%`);
    el.style.setProperty("--depth", String(Math.round(point.y)));
    el.style.setProperty("--agent-size", `${size}px`);
    el.style.setProperty("--agent-size-mobile", `${size}px`);
  }
  function placeAllHome(){ order.forEach((key) => placeAgent(key, homeFor(key))); }

  function clearWalk(key){ if (app.walkTimers[key]) { clearInterval(app.walkTimers[key]); app.walkTimers[key] = null; } }
  function startWalk(key){
    clearWalk(key); let i = 1; setSprite(key, "walk-1");
    app.walkTimers[key] = setInterval(() => { i = i >= 4 ? 1 : i + 1; setSprite(key, `walk-${i}`); }, 165);
  }
  function setAgentMode(key, mode){
    const el = agentEl(key); if (!el) return;
    ["walking","thinking","talking","working"].forEach((m) => el.classList.toggle(m, mode === m));
    if (mode === "walking") startWalk(key);
    else { clearWalk(key); setSprite(key, mode === "idle" ? "idle" : mode); }
  }
  function hideBubbles(except){
    order.forEach((key) => {
      if (key === except) return;
      const el = agentEl(key); if (el) el.classList.remove("has-bubble");
      if (app.bubbleTimers[key]) clearTimeout(app.bubbleTimers[key]);
    });
  }
  function bubble(key, text, ms=2400){
    hideBubbles(key); const el = agentEl(key); const b = el?.querySelector(".bubble"); if (!el || !b) return;
    b.textContent = String(text || "").slice(0, 58); el.classList.add("has-bubble");
    if (app.bubbleTimers[key]) clearTimeout(app.bubbleTimers[key]);
    if (ms > 0) app.bubbleTimers[key] = setTimeout(() => el.classList.remove("has-bubble"), ms);
  }
  function moveAgent(key, point, mode="walking"){
    setAgentMode(key, mode); placeAgent(key, point);
    return new Promise((resolve) => setTimeout(() => { if (!app.loading) setAgentMode(key, "idle"); resolve(); }, 820));
  }

  function selectAgent(key, openChat=false){
    if (!agents[key]) key = "admin";
    app.active = key;
    qsa(".agent").forEach((el) => el.classList.toggle("selected", el.dataset.agent === key));
    qsa(".rolechip,.switch").forEach((el) => el.classList.toggle("active", el.dataset.agent === key));
    const a = cfg(key);
    const chatName = qs("#chatName"), chatRole = qs("#chatRole");
    if (chatName) chatName.textContent = a.name;
    if (chatRole) chatRole.textContent = a.role;
    setChatAvatar();
    bubble(key, a.bubble, 1900);
    updateOfficeStatus(`${a.name} พร้อมช่วยงาน แตะตัวละครเพื่อเปิดแชทเต็มจอ`);
    updateTeamStatus(`${a.name} พร้อมช่วยตอบจากข้อมูลงานจริง`);
    renderMessages();
    if (openChat) {
      setAgentMode(key, "talking");
      bubble(key, "พร้อมคุยแล้ว", 1200);
      setTimeout(openChatView, 120);
    } else {
      moveAgent(key, a.center).then(() => setTimeout(() => { if (!app.open && !app.loading) moveAgent(key, homeFor(key)); }, 650));
    }
  }

  function buildSelectors(){
    const rolebar = qs("#rolebar"), sw = qs("#chatSwitchers");
    if (rolebar) rolebar.innerHTML = ""; if (sw) sw.innerHTML = "";
    if (rolebar) {
      const office = cfg("office");
      const chip = document.createElement("button"); chip.type = "button"; chip.className = "rolechip"; chip.dataset.agent = "office";
      chip.innerHTML = `<img alt="" src="${office.assets.idle}"><span>${escapeHtml(office.short)}</span>`;
      chip.addEventListener("click", () => selectAgent("office", true)); rolebar.appendChild(chip);
    }
    switchOrder.forEach((key) => {
      const a = cfg(key);
      if (key !== "office") {
        const chip = document.createElement("button"); chip.type = "button"; chip.className = "rolechip"; chip.dataset.agent = key;
        chip.innerHTML = `<img alt="" src="${a.assets.idle}"><span>${escapeHtml(a.short)}</span>`;
        chip.addEventListener("click", () => selectAgent(key, true)); rolebar?.appendChild(chip);
      }
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "switch"; btn.dataset.agent = key; btn.textContent = a.short;
      btn.addEventListener("click", () => selectAgent(key, false)); sw?.appendChild(btn);
    });
  }

  function buildQuickCommands(){
    const bar = qs("#quickbar"); if (!bar) return;
    bar.innerHTML = quickCommands.map((text) => `<button type="button" class="quickcmd">${escapeHtml(text)}</button>`).join("");
    qsa(".quickcmd", bar).forEach((btn) => btn.addEventListener("click", () => {
      const text = btn.textContent || "";
      if (text === "รวมทุกแผนก") selectAgent("office", true);
      const input = qs("#askInput");
      if (input) { input.value = text === "รวมทุกแผนก" ? "" : text; autoGrow(input); input.focus(); }
    }));
  }

  function messagesFor(){ if (!app.conversations[app.active]) app.conversations[app.active] = []; return app.conversations[app.active]; }
  function historyForRequest(limit=12){
    return messagesFor()
      .filter((m) => m && (m.type === "user" || m.type === "ai") && m.text && m.text !== "กำลังอ่านข้อมูลจริง...")
      .slice(-limit)
      .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: safeSlice(m.text, 1600) }));
  }
  function renderMessages(){
    const box = qs("#messages"); if (!box) return;
    const list = messagesFor();
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>${escapeHtml(cfg(app.active).name)}</b><p>${escapeHtml(cfg(app.active).role)}<br>พิมพ์ถามได้เลย เช่น “วันนี้มีงานอะไรบ้าง”, “งานไหนเสี่ยงสุด”, “ค้นงานจากเบอร์ 098...”</p></div>`;
      return;
    }
    box.innerHTML = list.map((m, idx) => {
      const cls = m.type === "user" ? "user" : (m.type === "error" ? "error" : "ai");
      const copy = m.type === "ai" ? `<div class="copyWrap"><button class="copyBtn" type="button" data-copy-index="${idx}">คัดลอก</button></div>` : "";
      return `<div class="message ${cls}">${escapeHtml(m.text)}</div>${copy}`;
    }).join("");
    qsa("[data-copy-index]", box).forEach((btn) => btn.addEventListener("click", () => {
      const m = messagesFor()[Number(btn.dataset.copyIndex)];
      navigator.clipboard?.writeText(m?.text || "").then(() => showToast("คัดลอกแล้ว")).catch(() => showToast("คัดลอกไม่สำเร็จ"));
    }));
    requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
  }
  function addMessage(type, text){ messagesFor().push({type, text:String(text || "")}); saveConversations(); renderMessages(); }

  async function api(path, options={}){
    const res = await fetch(path, { credentials:"same-origin", headers:{"Content-Type":"application/json", ...(options.headers || {})}, ...options });
    let data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data;
  }

  function applySummary(summary){
    qs("#statToday").textContent = summary?.today_count ?? "-";
    qs("#statTomorrow").textContent = summary?.tomorrow_count ?? "-";
    qs("#statOpen").textContent = summary?.open_count ?? "-";
    qs("#statUnpaid").textContent = summary?.unpaid_count ?? "-";
  }
  async function loadSummary(){
    try {
      const data = await api("/admin/ai-office/summary");
      applySummary(data.summary || {});
      updateOfficeStatus("โหลดข้อมูลงานจริงแล้ว ทีม AI พร้อมช่วยงาน");
    } catch(e) {
      const msg = e.message === "AI_OFFICE_PIN_REQUIRED" ? "backend ยังบังคับ PIN ซ้ำ ต้อง apply v5 backend patch หรือเอา AI_OFFICE_ACCESS_PIN ออกจาก Render" : `โหลดสถานะไม่ได้: ${e.message}`;
      showToast(msg); updateOfficeStatus(msg);
    }
  }

  function setTeamWorking(key, text){
    const a = cfg(key); updateTeamStatus(text || `${a.name} กำลังช่วยตรวจข้อมูลจริง`);
    const helpers = order.filter((item) => item !== key).slice(0,2);
    helpers.forEach((helper, index) => {
      setTimeout(() => { if (!app.open) return; setAgentMode(helper, "working"); }, 120 + index * 90);
    });
  }

  async function ask(){
    if (app.loading) return;
    const input = qs("#askInput"); const question = cleanText(input?.value);
    if (!question) return;
    const conversation_history = historyForRequest();
    input.value = ""; autoGrow(input); addMessage("user", question);
    const key = app.active; const a = cfg(key); app.loading = true;
    qs("#btnAsk").disabled = true; setAgentMode(key, "thinking"); bubble(key, "กำลังอ่านข้อมูลจริง...", 0); setTeamWorking(key, a.thinking);
    addMessage("ai", "กำลังอ่านข้อมูลจริง...");
    const list = messagesFor(); const loadingIndex = list.length - 1;
    try {
      const data = await api("/admin/ai-office/ask", { method:"POST", body:JSON.stringify({ agent:key, question, conversation_history }) });
      list.splice(loadingIndex, 1);
      setAgentMode(key, "talking"); updateTeamStatus(`${a.name} ตอบแล้ว อ่านต่อได้เลย`); bubble(key, "ตอบในแชทแล้ว", 2200);
      addMessage("ai", data.answer || "ไม่มีคำตอบ");
      setTimeout(() => setAgentMode(key, "idle"), 1600);
    } catch(e) {
      list.splice(loadingIndex, 1);
      setAgentMode(key, "idle");
      const msg = e.message === "AI_OFFICE_PIN_REQUIRED" ? "AI Office ยังติด PIN ซ้ำหลัง admin login ต้อง apply v5 backend patch หรือเอา AI_OFFICE_ACCESS_PIN ออกจาก Render ก่อนใช้งาน" : e.message;
      addMessage("error", msg); updateTeamStatus("ระบบยังตอบไม่ได้ ต้องแก้ backend ก่อน"); bubble(key, "ระบบตอบไม่ได้", 1800);
    } finally {
      app.loading = false; qs("#btnAsk").disabled = false; order.forEach((item) => { if (item !== key) setAgentMode(item, "idle"); }); renderMessages();
    }
  }

  function openChatView(){
    app.open = true; const view = qs("#chatView"); if (view) { view.classList.add("open"); view.setAttribute("aria-hidden","false"); }
    document.body.style.overflow = "hidden"; setChatAvatar(); renderMessages(); updateTeamStatus(`${cfg(app.active).name} พร้อมคุยต่อเนื่อง`); setTimeout(() => qs("#askInput")?.focus(), 120);
  }
  function closeChatView(){
    app.open = false; const view = qs("#chatView"); if (view) { view.classList.remove("open"); view.setAttribute("aria-hidden","true"); }
    document.body.style.overflow = ""; placeAllHome(); order.forEach((key) => setAgentMode(key, "idle")); updateOfficeStatus("ทีม AI กลับเข้าประจำจุด พร้อมช่วยงานต่อ");
  }

  function initAgents(){
    order.forEach((key) => {
      const el = agentEl(key); const a = cfg(key); if (!el) return;
      const sprite = el.querySelector(".sprite"); if (sprite) sprite.src = a.assets.idle;
      el.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); selectAgent(key, true); });
    });
    placeAllHome(); selectAgent("admin", false);
  }
  function preload(){
    [`${ASSET_ROOT}/maps-clean/office-main-desktop.png`,`${ASSET_ROOT}/maps-clean/office-main-mobile.png`, ...order.flatMap(k => [cfg(k).assets.idle, cfg(k).assets["walk-1"], cfg(k).assets.working])].forEach((src) => { const img = new Image(); img.decoding = "async"; img.src = src; });
  }
  function bind(){
    qs("#btnRefresh")?.addEventListener("click", loadSummary);
    qs("#btnBack")?.addEventListener("click", closeChatView);
    qs("#chatForm")?.addEventListener("submit", (ev) => { ev.preventDefault(); ask(); });
    const input = qs("#askInput");
    input?.addEventListener("input", () => autoGrow(input));
    input?.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ask(); } });
    window.addEventListener("resize", () => { if (!app.open) placeAllHome(); });
  }

  function pointForDevice(point, mobilePoint){
    return isMobile() && mobilePoint ? mobilePoint : point;
  }
  function eventPoint(event, key){
    const p = isMobile() && event.mobilePoints && event.mobilePoints[key] ? event.mobilePoints[key] : event.points[key];
    return p || homeFor(key);
  }

  function ambientWorkCycle(){
    if (app.ambientTimer) clearInterval(app.ambientTimer);
    const events = [
      { lead:"ops", helpers:["admin","sales"], text:"Ops AI ประสาน Admin และ Sales เรื่องคิวงาน", points:{ops:{x:50,y:44},admin:{x:27,y:62},sales:{x:71,y:62}}, mobilePoints:{ops:{x:51,y:45},admin:{x:22,y:70},sales:{x:66,y:70}} },
      { lead:"ads", helpers:["content","sales"], text:"Ads AI คุยกับ Content และ Sales เรื่องงานขาย", points:{ads:{x:24,y:44},content:{x:34,y:76},sales:{x:73,y:62}}, mobilePoints:{ads:{x:34,y:61},content:{x:43,y:78},sales:{x:66,y:70}} },
      { lead:"dev", helpers:["ops","admin"], text:"Dev AI เช็กระบบกับ Ops และ Admin", points:{dev:{x:80,y:39},ops:{x:53,y:45},admin:{x:24,y:63}}, mobilePoints:{dev:{x:80,y:47},ops:{x:51,y:45},admin:{x:22,y:70}} },
      { lead:"content", helpers:["ads"], text:"Content AI เตรียมไอเดียจากงานจริง", points:{content:{x:34,y:78},ads:{x:25,y:45}}, mobilePoints:{content:{x:43,y:78},ads:{x:34,y:61}} },
    ];
    let idx = 0;
    app.ambientTimer = setInterval(() => {
      if (app.open || document.hidden || app.loading) return;
      const event = events[idx % events.length]; idx += 1;
      const movers = [event.lead, ...event.helpers]; updateOfficeStatus(event.text);
      movers.forEach((key, i) => setTimeout(() => {
        if (app.open || app.loading) return;
        moveAgent(key, eventPoint(event, key)).then(() => { setAgentMode(key, "working"); bubble(key, cfg(key).working, 1900); });
      }, i * 140));
      setTimeout(() => { if (!app.open && !app.loading) { movers.forEach((key) => moveAgent(key, homeFor(key))); updateOfficeStatus("ทีม AI กลับเข้าประจำจุด พร้อมช่วยงาน"); } }, 3600);
    }, 7400);
  }

  document.addEventListener("DOMContentLoaded", () => {
    console.info(`CWF AI Office ${VERSION}`);
    loadSavedConversations(); bind(); buildSelectors(); buildQuickCommands(); initAgents(); preload(); loadSummary(); ambientWorkCycle();
  });
})();
