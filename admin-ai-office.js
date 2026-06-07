(function(){
  const VERSION = "ai-office-fullscreen-chat-v4-brain-20260607";
  const ASSET_ROOT = "/assets/ai-office-final";
  const CLEAN_CHARACTER_ROOT = `${ASSET_ROOT}/characters-clean`;
  const order = ["admin","sales","ops","ads","content","dev"];
  const stateNames = ["base","idle","thinking","talking","working","walk-1","walk-2","walk-3","walk-4"];
  const qs = (s, root=document) => root.querySelector(s);
  const qsa = (s, root=document) => Array.from(root.querySelectorAll(s));

  function assets(role){
    const out = {};
    stateNames.forEach((name) => out[name] = `${CLEAN_CHARACTER_ROOT}/${role}/${name}.png`);
    return out;
  }

  const agents = {
    admin: {
      name:"Admin AI", color:"#1558d6", short:"Admin",
      role:"ผู้ช่วยแอดมิน: สรุปงาน ร่างข้อความลูกค้า ร่างข้อความแจ้งช่าง แปลภาษา และจัดข้อมูลให้พร้อมคัดลอก",
      status:"พร้อมช่วยงานแอดมิน", bubble:"พร้อมช่วยงานแอดมิน",
      home:{x:24,y:62}, mobile:{x:24,y:61}, center:{x:44,y:58}, size:{desktop:64,mobile:54}, assets:assets("admin")
    },
    sales: {
      name:"Sales AI", color:"#f0b400", short:"Sales",
      role:"ผู้ช่วยฝ่ายขาย: ตอบลูกค้าบอกว่าแพง ช่วยปิดการขาย ร่าง follow-up และอธิบายราคาให้ลูกค้าเข้าใจ",
      status:"พร้อมช่วยฝ่ายขาย", bubble:"พร้อมช่วยปิดการขาย",
      home:{x:74,y:62}, mobile:{x:73,y:61}, center:{x:60,y:58}, size:{desktop:64,mobile:53}, assets:assets("sales")
    },
    ops: {
      name:"Ops AI", color:"#13a46b", short:"Ops",
      role:"ผู้ช่วยคุมคิว: งานวันนี้ งานพรุ่งนี้ งานยังไม่ปิด งานยังไม่จ่าย และงานเสี่ยงที่ต้องตาม",
      status:"พร้อมดูคิวงาน", bubble:"พร้อมคุมคิวงาน",
      home:{x:49,y:40}, mobile:{x:50,y:38}, center:{x:50,y:55}, size:{desktop:68,mobile:56}, assets:assets("ops")
    },
    ads: {
      name:"Ads AI", color:"#ef5aa3", short:"Ads",
      role:"ผู้ช่วยโฆษณา: Google Ads, Facebook Ads, TikTok Ads, keyword, พื้นที่ยิงแอด และมุมขายจากงานจริง",
      status:"พร้อมช่วยโฆษณา", bubble:"พร้อมคิดแคมเปญ",
      home:{x:18,y:35}, mobile:{x:20,y:36}, center:{x:39,y:50}, size:{desktop:60,mobile:52}, assets:assets("ads")
    },
    content: {
      name:"Content AI", color:"#8b5cf6", short:"Content",
      role:"ผู้ช่วยคอนเทนต์: โพสต์ แคปชัน รีวิว สคริปต์ Reels/TikTok และไอเดียภาพหรือวิดีโอ",
      status:"พร้อมทำคอนเทนต์", bubble:"พร้อมทำคอนเทนต์",
      home:{x:28,y:80}, mobile:{x:28,y:77}, center:{x:44,y:66}, size:{desktop:62,mobile:53}, assets:assets("content")
    },
    dev: {
      name:"Dev AI", color:"#334155", short:"Dev",
      role:"ผู้ช่วยระบบ: สรุปบั๊ก เขียน prompt ส่ง Codex ทำ checklist ก่อน deploy ทำ rollback notes และตรวจความเสี่ยง",
      status:"พร้อมช่วยระบบ", bubble:"พร้อมช่วยระบบ",
      home:{x:82,y:36}, mobile:{x:80,y:36}, center:{x:61,y:50}, size:{desktop:60,mobile:52}, assets:assets("dev")
    }
  };

  const STORAGE_KEY = "cwf_ai_office_chat_v4_session";
  const app = { active:"admin", conversations:{}, walkTimers:{}, bubbleTimers:{}, loading:false, open:false };
  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;
  const agentEl = (key) => qs(`.agent[data-agent="${key}"]`);
  const cfg = (key) => agents[key] || agents.admin;

  function cleanText(value){ return String(value || "").trim(); }
  function safeSlice(value, max=1600){ return String(value || "").replace(/\s+/g, " ").trim().slice(0, max); }
  function loadSavedConversations(){
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
      if (saved && typeof saved === "object") app.conversations = saved;
    } catch (_) {}
  }
  function saveConversations(){
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(app.conversations)); } catch (_) {}
  }
  function showToast(text){ const el = qs("#toast"); if (!el) return; el.textContent = text; el.classList.add("show"); setTimeout(() => el.classList.remove("show"), 2600); }
  function autoGrow(textarea){ if (!textarea) return; textarea.style.height = "auto"; textarea.style.height = Math.min(138, textarea.scrollHeight) + "px"; }
  function escapeHtml(value){ return String(value || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  function setSprite(key, mode="idle"){
    const a = cfg(key); const img = agentEl(key)?.querySelector(".sprite");
    if (img) img.src = a.assets[mode] || a.assets.idle || a.assets.base;
  }
  function setChatAvatar(){
    const a = cfg(app.active); const avatar = qs("#chatAvatar");
    if (avatar) avatar.src = a.assets.idle || a.assets.base;
  }
  function placeAgent(key, point){
    const el = agentEl(key); if (!el || !point) return;
    const a = cfg(key); const mobile = isMobile(); const size = mobile ? a.size.mobile : a.size.desktop;
    el.style.setProperty("--x", `${point.x}%`);
    el.style.setProperty("--y", `${point.y}%`);
    el.style.setProperty("--depth", String(Math.round(point.y)));
    el.style.setProperty("--agent-size", `${size}px`);
    el.style.setProperty("--agent-size-mobile", `${size}px`);
  }
  function homeFor(key){ return isMobile() ? cfg(key).mobile : cfg(key).home; }
  function placeAll(){ order.forEach((key) => placeAgent(key, homeFor(key))); }

  function clearWalk(key){ if (app.walkTimers[key]) { clearInterval(app.walkTimers[key]); app.walkTimers[key] = null; } }
  function startWalk(key){
    clearWalk(key); let i = 1; setSprite(key, "walk-1");
    app.walkTimers[key] = setInterval(() => { i = i >= 4 ? 1 : i + 1; setSprite(key, `walk-${i}`); }, 170);
  }
  function setAgentMode(key, mode){
    const el = agentEl(key); if (!el) return;
    ["walking","thinking","talking"].forEach((m) => el.classList.toggle(m, mode === m));
    if (mode === "walking") startWalk(key); else { clearWalk(key); setSprite(key, mode === "idle" ? "idle" : mode); }
  }
  function hideBubbles(except){
    order.forEach((key) => { if (key === except) return; const el = agentEl(key); if (el) el.classList.remove("has-bubble"); if (app.bubbleTimers[key]) clearTimeout(app.bubbleTimers[key]); });
  }
  function bubble(key, text, ms=2400){
    hideBubbles(key); const el = agentEl(key); const b = el?.querySelector(".bubble"); if (!el || !b) return;
    b.textContent = String(text || "").slice(0, 58); el.classList.add("has-bubble");
    if (app.bubbleTimers[key]) clearTimeout(app.bubbleTimers[key]);
    if (ms > 0) app.bubbleTimers[key] = setTimeout(() => el.classList.remove("has-bubble"), ms);
  }
  function moveAgent(key, point){
    setAgentMode(key, "walking"); placeAgent(key, point);
    return new Promise((resolve) => setTimeout(() => { setAgentMode(key, "idle"); resolve(); }, 760));
  }

  function selectAgent(key, openChat=false){
    if (!agents[key]) key = "admin"; app.active = key;
    qsa(".agent").forEach((el) => el.classList.toggle("selected", el.dataset.agent === key));
    qsa(".rolechip,.switch").forEach((el) => el.classList.toggle("active", el.dataset.agent === key));
    const a = cfg(key);
    const chatName = qs("#chatName"), chatRole = qs("#chatRole");
    if (chatName) chatName.textContent = a.name;
    if (chatRole) chatRole.textContent = a.role;
    setChatAvatar();
    bubble(key, a.bubble, 2200);
    moveAgent(key, a.center).then(() => setTimeout(() => { if (!app.open) moveAgent(key, homeFor(key)); }, 900));
    renderMessages();
    if (openChat) openChatView();
  }

  function buildSelectors(){
    const rolebar = qs("#rolebar"), sw = qs("#chatSwitchers");
    if (rolebar) rolebar.innerHTML = ""; if (sw) sw.innerHTML = "";
    order.forEach((key) => {
      const a = cfg(key);
      const chip = document.createElement("button"); chip.type = "button"; chip.className = "rolechip"; chip.dataset.agent = key;
      chip.innerHTML = `<img alt="" src="${a.assets.idle}"><span>${escapeHtml(a.short)}</span>`;
      chip.addEventListener("click", () => selectAgent(key, true)); rolebar?.appendChild(chip);
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "switch"; btn.dataset.agent = key; btn.textContent = a.short;
      btn.addEventListener("click", () => selectAgent(key, false)); sw?.appendChild(btn);
    });
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
      box.innerHTML = `<div class="empty"><b>${escapeHtml(cfg(app.active).name)} พร้อมคุยต่อเนื่อง</b><p>${escapeHtml(cfg(app.active).role)}<br>ถามได้เหมือนคุยกับผู้ช่วยจริง ระบบจะจำบริบทในแชทนี้ เช่น ถามต่อว่า “งานไหนเสี่ยงสุด” หรือ “ร่างข้อความให้ลูกค้าคนนั้น”</p></div>`;
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
    try { const data = await api("/admin/ai-office/summary"); applySummary(data.summary || {}); }
    catch(e){ showToast(e.message === "AI_OFFICE_PIN_REQUIRED" ? "ต้องปรับ backend ให้ใช้ admin login ครั้งเดียว" : `โหลดสถานะไม่ได้: ${e.message}`); }
  }

  async function ask(){
    if (app.loading) return;
    const input = qs("#askInput"); const question = cleanText(input?.value);
    if (!question) return;
    const conversation_history = historyForRequest();
    input.value = ""; autoGrow(input); addMessage("user", question);
    const key = app.active; const a = cfg(key); app.loading = true;
    qs("#btnAsk").disabled = true; setAgentMode(key, "thinking"); bubble(key, "กำลังอ่านข้อมูลจริง...", 0);
    addMessage("ai", "กำลังอ่านข้อมูลจริง...");
    const list = messagesFor(); const loadingIndex = list.length - 1;
    try {
      const data = await api("/admin/ai-office/ask", { method:"POST", body:JSON.stringify({ agent:key, question, conversation_history }) });
      list.splice(loadingIndex, 1);
      setAgentMode(key, "talking"); bubble(key, "ตอบในแชทแล้ว", 2200);
      addMessage("ai", data.answer || "ไม่มีคำตอบ");
      setTimeout(() => setAgentMode(key, "idle"), 1600);
    } catch(e) {
      list.splice(loadingIndex, 1);
      setAgentMode(key, "idle");
      const msg = e.message === "AI_OFFICE_PIN_REQUIRED" ? "AI Office ยังติด PIN ซ้ำหลัง admin login ต้อง patch backend route ก่อนใช้งาน" : e.message;
      addMessage("error", msg);
      bubble(key, "ระบบตอบไม่ได้", 1800);
    } finally {
      app.loading = false; qs("#btnAsk").disabled = false; renderMessages();
    }
  }

  function openChatView(){
    app.open = true; const view = qs("#chatView"); if (view) { view.classList.add("open"); view.setAttribute("aria-hidden","false"); }
    document.body.style.overflow = "hidden"; setChatAvatar(); renderMessages(); setTimeout(() => qs("#askInput")?.focus(), 120);
  }
  function closeChatView(){
    app.open = false; const view = qs("#chatView"); if (view) { view.classList.remove("open"); view.setAttribute("aria-hidden","true"); }
    document.body.style.overflow = ""; order.forEach((key) => moveAgent(key, homeFor(key)));
  }

  function initAgents(){
    order.forEach((key) => { const el = agentEl(key); const a = cfg(key); if (!el) return; el.querySelector(".sprite").src = a.assets.idle; el.addEventListener("click", () => selectAgent(key, true)); });
    placeAll(); selectAgent("admin", false);
  }
  function preload(){
    [`${ASSET_ROOT}/maps-clean/office-main-desktop.png`,`${ASSET_ROOT}/maps-clean/office-main-mobile.png`, ...order.map(k => cfg(k).assets.idle)].forEach((src) => { const img = new Image(); img.decoding = "async"; img.src = src; });
  }
  function bind(){
    qs("#btnRefresh")?.addEventListener("click", loadSummary);
    qs("#btnBack")?.addEventListener("click", closeChatView);
    qs("#btnAsk")?.addEventListener("click", ask);
    const input = qs("#askInput");
    input?.addEventListener("input", () => autoGrow(input));
    input?.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); ask(); } });
    window.addEventListener("resize", placeAll);
  }
  function nudgeIdle(){
    setInterval(() => {
      if (app.open || document.hidden) return;
      const choices = order.filter(k => k !== app.active);
      const key = choices[Math.floor(Math.random() * choices.length)]; if (!key) return;
      const p = homeFor(key); const next = { x:p.x + (Math.random() > .5 ? 2 : -2), y:p.y + (Math.random() > .5 ? 1 : -1) };
      moveAgent(key, next).then(() => setTimeout(() => moveAgent(key, p), 700));
    }, 19000);
  }
  document.addEventListener("DOMContentLoaded", () => {
    console.info(`CWF AI Office ${VERSION}`);
    loadSavedConversations(); bind(); buildSelectors(); initAgents(); preload(); loadSummary(); nudgeIdle();
  });
})();
