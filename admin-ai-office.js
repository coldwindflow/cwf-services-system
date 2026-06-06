(function(){
  const VERSION = "ai-office-final-aicwf-20260607";
  const ASSET_ROOT = "/assets/ai-office-final";
  const roleOrder = ["admin","sales","ops","ads","content","dev"];
  const states = ["base","idle","thinking","talking","working","walk-1","walk-2","walk-3","walk-4"];

  function characterAssets(role){
    const out = {};
    states.forEach((state) => { out[state] = `${ASSET_ROOT}/characters/${role}/${state}.png`; });
    return out;
  }

  const agents = {
    admin: {
      name: "Admin AI", color: "#1558d6", workstation: "adminDesk", home: { x: 24, y: 62 }, mobileHome: { x: 24, y: 61 },
      role: "สรุปงาน ร่างข้อความลูกค้า แจ้งช่าง แปลภาษา",
      status: "พร้อมช่วยงานแอดมิน",
      greeting: "พร้อมสรุปงานจริง ร่างข้อความลูกค้า และประสานช่าง",
      thinking: "กำลังตรวจข้อมูลงานจริง",
      talking: "สรุปให้แล้วครับ",
      assets: characterAssets("admin"),
      commands: ["วันนี้มีงานอะไรบ้าง", "ร่างข้อความยืนยันนัดลูกค้า", "ร่างข้อความแจ้งช่าง", "แปลข้อความลูกค้าให้สุภาพ"],
    },
    sales: {
      name: "Sales AI", color: "#f0b400", workstation: "salesDesk", home: { x: 74, y: 62 }, mobileHome: { x: 73, y: 61 },
      role: "ปิดการขาย ตอบลูกค้าบอกว่าแพง แนะนำแพ็กเกจ",
      status: "พร้อมช่วยปิดการขาย",
      greeting: "พร้อมช่วยตอบเรื่องราคาและเพิ่มโอกาสปิดงาน",
      thinking: "กำลังดูมุมปิดการขาย",
      talking: "ได้แนวตอบฝ่ายขายแล้วครับ",
      assets: characterAssets("sales"),
      commands: ["ลูกค้าบอกว่าแพง ตอบยังไงดี", "ช่วยเขียนข้อความปิดการขาย", "แนะนำแพ็กเกจจากงานที่มี", "วิเคราะห์ทำไมปิดการขายได้น้อย"],
    },
    ops: {
      name: "Ops AI", color: "#13a46b", workstation: "opsBoard", home: { x: 49, y: 40 }, mobileHome: { x: 50, y: 38 },
      role: "ดูคิว งานวันนี้ งานพรุ่งนี้ งานยังไม่ปิด งานยังไม่จ่าย",
      status: "พร้อมคุมคิวงาน",
      greeting: "พร้อมดูคิว งานค้าง และจุดที่ต้องระวัง",
      thinking: "กำลังตรวจคิวและความเสี่ยง",
      talking: "เจอประเด็นที่ต้องดูแล้วครับ",
      assets: characterAssets("ops"),
      commands: ["พรุ่งนี้มีงานอะไรบ้าง", "งานไหนยังไม่ปิด", "งานไหนยังไม่จ่าย", "วันนี้มีอะไรต้องระวังไหม"],
    },
    ads: {
      name: "Ads AI", color: "#ef5aa3", workstation: "adsDesk", home: { x: 18, y: 35 }, mobileHome: { x: 20, y: 36 },
      role: "Google Ads, Facebook Ads, TikTok Ads, keyword, พื้นที่ยิงแอด",
      status: "พร้อมคิดแคมเปญ",
      greeting: "พร้อมเปลี่ยนงานจริงให้เป็นไอเดียโฆษณา",
      thinking: "กำลังหาโอกาสการตลาด",
      talking: "ได้ไอเดียแคมเปญแล้วครับ",
      assets: characterAssets("ads"),
      commands: ["ช่วยคิด keyword จากงานจริง", "พื้นที่ไหนควรยิงแอด", "เขียนข้อความโฆษณาล้างแอร์", "ไอเดีย TikTok Ads จากงานช่วงนี้"],
    },
    content: {
      name: "Content AI", color: "#8b5cf6", workstation: "contentDesk", home: { x: 27, y: 80 }, mobileHome: { x: 28, y: 80 },
      role: "โพสต์ แคปชัน รีวิว สคริปต์ Reels/TikTok",
      status: "พร้อมสร้างคอนเทนต์",
      greeting: "พร้อมทำโพสต์ แคปชัน และสคริปต์จากงานจริง",
      thinking: "กำลังเรียบเรียงคอนเทนต์",
      talking: "ร่างคอนเทนต์ให้แล้วครับ",
      assets: characterAssets("content"),
      commands: ["เขียนแคปชันจากงานวันนี้", "ทำสคริปต์ Reels 30 วินาที", "ไอเดียโพสต์จากงานจริง", "ร่างโพสต์รีวิวจากงานจริง"],
    },
    dev: {
      name: "Dev AI", color: "#334155", workstation: "devDesk", home: { x: 82, y: 36 }, mobileHome: { x: 80, y: 36 },
      role: "prompt Codex, bug summary, deploy checklist, risk review",
      status: "พร้อมตรวจระบบ",
      greeting: "พร้อมช่วยทำเช็กลิสต์ระบบและตรวจความเสี่ยง",
      thinking: "กำลังตรวจมุมระบบ",
      talking: "ได้ข้อสรุประบบแล้วครับ",
      assets: characterAssets("dev"),
      commands: ["ทำ checklist ก่อน deploy", "สรุปความเสี่ยงของ AI Office", "เขียน prompt ส่ง Codex", "ตรวจว่ามีอะไรห้ามแก้ข้อมูลไหม"],
    },
  };

  const zones = {
    adminDesk: { x: 20, y: 52 }, salesDesk: { x: 78, y: 52 }, opsBoard: { x: 50, y: 32 },
    adsDesk: { x: 19, y: 31 }, contentDesk: { x: 28, y: 72 }, devDesk: { x: 82, y: 31 }, meetingTable: { x: 51, y: 67 },
  };
  const mobileZones = {
    adminDesk: { x: 22, y: 53 }, salesDesk: { x: 76, y: 53 }, opsBoard: { x: 50, y: 31 },
    adsDesk: { x: 21, y: 32 }, contentDesk: { x: 29, y: 73 }, devDesk: { x: 79, y: 32 }, meetingTable: { x: 51, y: 66 },
  };

  const state = { pin: "", pinRequired: false, activeAgent: "admin", loadingAsk: false, greeted: new Set(), agentStates: {}, walkTimers: {}, lastAnswer: "" };
  const $ = (id) => document.getElementById(id);
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;
  const pointFor = (key, zone) => (isMobile() ? mobileZones[zone] : zones[zone]) || agents[key].home;
  const homeFor = (key) => isMobile() ? agents[key].mobileHome : agents[key].home;

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function money(value){ return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
  function agentConfig(key){ return agents[key] || agents.admin; }
  function agentElement(key){ return document.querySelector(`.npc[data-agent="${key}"]`); }
  function activeAgent(){ return agentConfig(state.activeAgent); }

  function refreshAiOfficeCache(){
    try {
      console.info(`CWF AI Office ${VERSION}`);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) { reg.update().catch(() => {}); if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" }); }
        }).catch(() => {});
      }
      if ("caches" in window) {
        caches.keys().then((keys) => Promise.all(keys.map(async (key) => {
          const cache = await caches.open(key);
          await Promise.all([cache.delete("/admin/ai-office"), cache.delete("/admin/ai-office.html"), cache.delete("/admin-ai-office.html"), cache.delete("/admin-ai-office.js")]);
        }))).catch(() => {});
      }
    } catch (_) {}
  }

  function preloadCoreAssets(){
    const urls = [
      `${ASSET_ROOT}/maps/office-main-desktop.png`, `${ASSET_ROOT}/maps/office-main-mobile.png`,
      `${ASSET_ROOT}/ui/selection-ring.png`, `${ASSET_ROOT}/ui/empty-state.png`,
      ...roleOrder.map((key) => agents[key].assets.idle),
    ];
    urls.forEach((src) => { const img = new Image(); img.decoding = "async"; img.src = src; });
  }

  function placeAgent(agentKey, point){
    const el = agentElement(agentKey);
    if (!el || !point) return;
    el.style.setProperty("--x", `${point.x}%`);
    el.style.setProperty("--y", `${point.y}%`);
  }

  function setSprite(agentKey, assetKey){
    const agent = agentConfig(agentKey);
    const img = agentElement(agentKey)?.querySelector(".npcSprite");
    if (img) img.src = agent.assets[assetKey] || agent.assets.idle || agent.assets.base;
  }

  function clearWalkTimer(agentKey){
    if (state.walkTimers[agentKey]) {
      window.clearInterval(state.walkTimers[agentKey]);
      state.walkTimers[agentKey] = null;
    }
  }

  function startWalkFrames(agentKey){
    clearWalkTimer(agentKey);
    let index = 1;
    setSprite(agentKey, "walk-1");
    state.walkTimers[agentKey] = window.setInterval(() => {
      index = index >= 4 ? 1 : index + 1;
      setSprite(agentKey, `walk-${index}`);
    }, 160);
  }

  function setAgentState(agentKey, nextState){
    const el = agentElement(agentKey);
    if (!el) return;
    ["idle","walking","thinking","talking","working"].forEach((name) => el.classList.toggle(name, name === nextState));
    state.agentStates[agentKey] = nextState;
    if (nextState === "walking") startWalkFrames(agentKey);
    else {
      clearWalkTimer(agentKey);
      setSprite(agentKey, nextState === "idle" ? "idle" : nextState);
    }
    if (agentKey === state.activeAgent) updateConsoleAgent();
  }

  function showAgentBubble(agentKey, message){
    const bubble = agentElement(agentKey)?.querySelector(".npcBubble");
    if (bubble) bubble.textContent = message || "";
  }

  function moveAgent(agentKey, targetKey){
    const target = targetKey === "home" ? homeFor(agentKey) : pointFor(agentKey, targetKey);
    setAgentState(agentKey, "walking");
    placeAgent(agentKey, target);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        if (state.agentStates[agentKey] === "walking") setAgentState(agentKey, "idle");
        resolve();
      }, 880);
    });
  }
  function moveAgentToHome(agentKey){ return moveAgent(agentKey, "home"); }
  function moveSelectedAgentToWorkstation(){ return moveAgent(state.activeAgent, activeAgent().workstation); }

  function choosePrimaryAgentForCommand(commandText){
    const text = String(commandText || "").toLowerCase();
    if (/แพง|ปิดการขาย|ราคา|package|แพ็ก/.test(text)) return "sales";
    if (/ยังไม่จ่าย|ยังไม่ปิด|พรุ่งนี้|ระวัง|คิว|open|unpaid|today|tomorrow/.test(text)) return "ops";
    if (/โพสต์|คอนเทนต์|caption|แคปชัน|reels|tiktok script|รีวิว/.test(text)) return "content";
    if (/แอด|ads|keyword|facebook|google|tiktok ads|พื้นที่/.test(text)) return "ads";
    if (/codex|prompt|deploy|bug|บั๊ก|checklist|ระบบ/.test(text)) return "dev";
    return state.activeAgent || "admin";
  }

  function coordinateAgentsForCommand(commandText, primaryAgent){
    const agentKey = primaryAgent || choosePrimaryAgentForCommand(commandText);
    const text = String(commandText || "").toLowerCase();
    let partner = "";
    let target = "meetingTable";
    if (agentKey === "ops" && /ยังไม่จ่าย|ยังไม่ปิด|ระวัง/.test(text)) partner = "admin";
    if (agentKey === "admin" && /วันนี้|พรุ่งนี้|ยังไม่จ่าย|ยังไม่ปิด/.test(text)) { partner = "ops"; target = "opsBoard"; }
    if (agentKey === "sales" && /โพสต์|แคปชัน|คอนเทนต์/.test(text)) partner = "content";
    if (partner && partner !== agentKey) {
      showAgentBubble(partner, "เข้ามาช่วยประสานข้อมูล");
      moveAgent(partner, target).then(() => setAgentState(partner, "working"));
    }
  }

  function orchestrateCommand(agentKey, commandText){
    const chosen = choosePrimaryAgentForCommand(commandText);
    const finalAgent = agents[chosen] ? chosen : agentKey;
    if (finalAgent !== state.activeAgent) selectAgent(finalAgent, false, true);
    coordinateAgentsForCommand(commandText, finalAgent);
    return finalAgent;
  }

  function apiHeaders(extra){
    const headers = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if (state.pin) headers["x-ai-office-pin"] = state.pin;
    return headers;
  }
  async function apiFetchJson(url, options){
    if (typeof window.apiFetch === "function") return window.apiFetch(url, options || {});
    const res = await fetch(url, options || {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok && data && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }
  async function apiGet(url){
    const data = await apiFetchJson(url, { headers: apiHeaders() });
    if (data && (data.ok === false || data.error)) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
    return data;
  }
  async function apiPost(url, body){
    const data = await apiFetchJson(url, { method: "POST", headers: apiHeaders(), body: JSON.stringify(body || {}) });
    if (data && (data.ok === false || data.error)) throw new Error(data.error || "ส่งคำถามไม่สำเร็จ");
    return data;
  }

  function showOverlay(show){
    const overlay = $("pinOverlay");
    if (overlay) overlay.classList.toggle("show", !!show);
    if (show) setTimeout(() => $("pinInput")?.focus(), 80);
  }

  function setSummary(summary){
    $("statToday").textContent = money(summary?.today_count);
    $("statTomorrow").textContent = money(summary?.tomorrow_count);
    $("statOpen").textContent = money(summary?.open_count);
    $("statUnpaid").textContent = money(summary?.unpaid_count);
  }

  function updateConsoleAgent(){
    const agent = activeAgent();
    const statusMap = { idle: agent.status, walking: "กำลังเดินไปที่จุดทำงาน", thinking: agent.thinking, talking: agent.talking, working: "กำลังทำงานที่โต๊ะ" };
    $("agentName").textContent = agent.name;
    $("agentRole").textContent = agent.role;
    $("agentStatus").textContent = statusMap[state.agentStates[state.activeAgent]] || agent.status;
    $("agentAvatar")?.style.setProperty("background-image", `url("${agent.assets.idle}")`);
    document.documentElement.style.setProperty("--selected", agent.color);
    $("askInput")?.setAttribute("placeholder", `ถาม ${agent.name}`);
    renderCommands();
  }

  function renderCommands(){
    const box = $("quickCommands");
    if (!box) return;
    box.innerHTML = activeAgent().commands.map((cmd) => `<button class="quickBtn" type="button">${esc(cmd)}</button>`).join("");
    box.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => ask(btn.textContent || "")));
  }

  function addMessage(role, text, copyable){
    const box = $("messages");
    if (!box) return null;
    const div = document.createElement("div");
    div.className = `msg ${role === "user" ? "user" : "ai"}`;
    div.textContent = text;
    if (copyable) {
      const row = document.createElement("div");
      row.className = "copyRow";
      const btn = document.createElement("button");
      btn.className = "copy";
      btn.type = "button";
      btn.textContent = "คัดลอก";
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "คัดลอกแล้ว";
          setTimeout(() => { btn.textContent = "คัดลอก"; }, 1200);
        } catch (_) {
          btn.textContent = "คัดลอกไม่ได้";
        }
      });
      row.appendChild(btn);
      div.appendChild(row);
    }
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function addEmptyMessage(text){
    const box = $("messages");
    if (!box) return null;
    const div = document.createElement("div");
    div.className = "msg ai emptyMsg";
    div.innerHTML = `<img src="${ASSET_ROOT}/ui/empty-state.png" alt=""> <span>${esc(text)}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function addThinkingMessage(agentKey){
    const box = $("messages");
    if (!box) return null;
    const div = document.createElement("div");
    div.className = "msg ai";
    div.innerHTML = `<span class="thinkingLine"><i></i><i></i><i></i></span> ${esc(agentConfig(agentKey).thinking)}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function responsePreview(text, agentKey){
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return agentConfig(agentKey).talking;
    return clean.length > 78 ? `${clean.slice(0, 78)}...` : clean;
  }

  function expandConsole(){ $("commandConsole")?.classList.add("expanded"); }

  function selectAgent(agentKey, userTriggered = true, silent = false){
    const key = agents[agentKey] ? agentKey : "admin";
    state.activeAgent = key;
    document.querySelectorAll(".npc").forEach((el) => el.classList.toggle("selected", el.dataset.agent === key));
    updateConsoleAgent();
    showAgentBubble(key, agentConfig(key).greeting);
    if (!state.agentStates[key]) setAgentState(key, "idle");
    if (userTriggered) {
      expandConsole();
      moveAgent(key, agentConfig(key).workstation).then(() => setAgentState(key, "working"));
    }
    if (!silent && (userTriggered || !state.greeted.has(key))) {
      addMessage("ai", `${agentConfig(key).name}: ${agentConfig(key).greeting}`, false);
      state.greeted.add(key);
    }
  }

  async function loadSummary(){
    const data = await apiGet("/admin/ai-office/summary");
    setSummary(data.summary || {});
  }

  async function ask(question){
    const rawQuestion = String(question || $("askInput")?.value || "").trim();
    if (!rawQuestion || state.loadingAsk) return;
    const agentKey = orchestrateCommand(state.activeAgent, rawQuestion);
    const agent = agentConfig(agentKey);
    state.loadingAsk = true;
    expandConsole();
    if ($("askInput")) $("askInput").value = "";
    addMessage("user", `${agent.name}: ${rawQuestion}`, false);
    showAgentBubble(agentKey, "กำลังเดินไปที่โต๊ะทำงาน");
    await moveAgent(agentKey, agent.workstation);
    setAgentState(agentKey, "thinking");
    showAgentBubble(agentKey, agent.thinking);
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiPost("/admin/ai-office/ask", { agent: agentKey, question: rawQuestion, phone: $("phoneInput")?.value || "" });
      if (pending) pending.remove();
      const answer = data.answer || "ไม่มีคำตอบจากข้อมูลที่มี";
      state.lastAnswer = answer;
      addMessage("ai", answer, true);
      if (data.context?.summary) setSummary(data.context.summary);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, responsePreview(answer, agentKey));
      setTimeout(() => { setAgentState(agentKey, "working"); showAgentBubble(agentKey, agent.talking); }, 3600);
    } catch (e) {
      if (pending) pending.remove();
      const msg = e.message || "AI Office ตอบไม่ได้ในขณะนี้";
      addMessage("ai", msg, false);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, msg);
      setTimeout(() => setAgentState(agentKey, "working"), 3600);
    } finally {
      state.loadingAsk = false;
    }
  }

  async function searchPhone(){
    const phone = String($("phoneInput")?.value || "").trim();
    expandConsole();
    const agentKey = orchestrateCommand("admin", "ค้นงานจากเบอร์ลูกค้า");
    if (!phone) {
      addMessage("ai", "กรุณาใส่เบอร์ลูกค้าก่อนค้นงาน", false);
      showAgentBubble(agentKey, "ใส่เบอร์ลูกค้าก่อนนะครับ");
      return;
    }
    addMessage("user", `ค้นงานจากเบอร์ลูกค้า ${phone}`, false);
    await moveAgent(agentKey, agentConfig(agentKey).workstation);
    setAgentState(agentKey, "thinking");
    showAgentBubble(agentKey, "กำลังค้นใบงานจากเบอร์นี้");
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiGet(`/admin/ai-office/search-by-phone?phone=${encodeURIComponent(phone)}`);
      if (pending) pending.remove();
      const jobs = data.jobs || [];
      if (!jobs.length) {
        addEmptyMessage("ไม่พบงานจากเบอร์นี้ในระบบ");
        setAgentState(agentKey, "talking");
        showAgentBubble(agentKey, "ไม่พบงานจากเบอร์นี้");
        return;
      }
      const lines = jobs.slice(0, 12).map((j) => {
        const when = j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-";
        return `${j.booking_code || "#" + j.job_id} • ${j.customer_name || "-"} • ${j.job_type || "-"} • ${when} • ${j.job_status || "-"}`;
      });
      addMessage("ai", lines.join("\n"), true);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, `พบ ${money(jobs.length)} งานจากเบอร์นี้`);
      setTimeout(() => setAgentState(agentKey, "working"), 3000);
    } catch (e) {
      if (pending) pending.remove();
      const msg = e.message || "ค้นงานไม่สำเร็จ";
      addMessage("ai", msg, false);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, msg);
    }
  }

  async function refreshAll(options = {}){
    try {
      setAgentState("ops", "thinking");
      showAgentBubble("ops", "กำลังอ่านสถานะงานจริง");
      await loadSummary();
      setAgentState("ops", "idle");
      showAgentBubble("ops", "สถานะงานอัปเดตแล้ว");
    } catch (e) {
      if (options.throwOnError) throw e;
      if (String(e.message || "").includes("AI_OFFICE_PIN_REQUIRED")) showOverlay(true);
      else addMessage("ai", e.message || "โหลดข้อมูลไม่สำเร็จ", false);
    }
  }

  async function loadConfig(){
    const cfg = await apiGet("/admin/ai-office/config");
    state.pinRequired = !!cfg.pin_required;
    showOverlay(state.pinRequired && !state.pin);
    if (!state.pinRequired) await refreshAll();
  }

  function initAgents(){
    roleOrder.forEach((key) => {
      placeAgent(key, homeFor(key));
      setAgentState(key, "idle");
      showAgentBubble(key, agents[key].status);
    });
  }

  function bind(){
    document.querySelectorAll(".npc").forEach((el) => el.addEventListener("click", () => selectAgent(el.dataset.agent, true)));
    $("consoleToggle")?.addEventListener("click", () => $("commandConsole")?.classList.toggle("expanded"));
    $("btnRefresh")?.addEventListener("click", refreshAll);
    $("btnPhone")?.addEventListener("click", searchPhone);
    $("phoneInput")?.addEventListener("focus", expandConsole);
    $("phoneInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPhone(); });
    $("btnAsk")?.addEventListener("click", () => ask());
    $("askInput")?.addEventListener("focus", expandConsole);
    $("askInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
    $("btnPin")?.addEventListener("click", async () => {
      const pin = String($("pinInput")?.value || "").trim();
      const err = $("pinError");
      if (err) err.style.display = "none";
      state.pin = pin;
      try {
        await refreshAll({ throwOnError: true });
        showOverlay(false);
      } catch (_) {
        state.pin = "";
        showOverlay(true);
        if (err) {
          err.textContent = "รหัสไม่ถูกต้องหรือโหลดข้อมูลไม่ได้";
          err.style.display = "block";
        }
      }
    });
    $("pinInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") $("btnPin")?.click(); });
    window.addEventListener("resize", () => roleOrder.forEach((key) => placeAgent(key, state.agentStates[key] === "working" ? pointFor(key, agents[key].workstation) : homeFor(key))));
  }

  window.setAgentState = setAgentState;
  window.moveAgent = moveAgent;
  window.moveAgentToHome = moveAgentToHome;
  window.moveSelectedAgentToWorkstation = moveSelectedAgentToWorkstation;
  window.showAgentBubble = showAgentBubble;
  window.orchestrateCommand = orchestrateCommand;
  window.choosePrimaryAgentForCommand = choosePrimaryAgentForCommand;
  window.coordinateAgentsForCommand = coordinateAgentsForCommand;

  document.addEventListener("DOMContentLoaded", () => {
    refreshAiOfficeCache();
    preloadCoreAssets();
    initAgents();
    bind();
    selectAgent("admin", false);
    loadConfig().catch((e) => addMessage("ai", e.message || "โหลด AI Office ไม่สำเร็จ", false));
  });
})();
