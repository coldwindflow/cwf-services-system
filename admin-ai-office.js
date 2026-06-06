(function(){
  const VERSION = "ai-office-v3-real-game-mobile";

  const agents = {
    admin: {
      name: "Admin AI", color: "#1558d6", dark: "#0d3d8d",
      role: "ผู้ช่วยแอดมินสำหรับสรุปงาน ร่างข้อความลูกค้า ข้อความช่าง และแปลภาษา",
      status: "พร้อมช่วยงานแอดมิน", greeting: "ผมอยู่ที่โต๊ะแอดมิน พร้อมสรุปงานจริงและร่างข้อความให้ใช้ต่อได้ทันที",
      thinking: "กำลังตรวจข้อมูลงานจริง", talking: "สรุปให้แล้วครับ", workstation: "adminDesk",
      home: { x: 24, y: 57 },
      commands: ["วันนี้มีงานอะไรบ้าง", "ร่างข้อความยืนยันนัดลูกค้า", "ร่างข้อความแจ้งช่าง", "แปลข้อความลูกค้าให้สุภาพ"],
    },
    sales: {
      name: "Sales AI", color: "#f0b400", dark: "#ba7b00",
      role: "ผู้ช่วยฝ่ายขายสำหรับปิดการขาย แนะนำแพ็กเกจ และตอบเรื่องราคา",
      status: "พร้อมช่วยปิดการขาย", greeting: "ผมพร้อมช่วยตอบลูกค้าให้สุภาพ ชัดเจน และเพิ่มโอกาสปิดงาน",
      thinking: "กำลังดูมุมปิดการขาย", talking: "ได้แนวตอบฝ่ายขายแล้วครับ", workstation: "salesDesk",
      home: { x: 39, y: 56 },
      commands: ["ลูกค้าบอกว่าแพง ตอบยังไงดี", "แนะนำแพ็กเกจจากงานที่มี", "ช่วยเขียนข้อความปิดการขาย", "ทำไมยอดปิดการขายอาจต่ำ"],
    },
    ops: {
      name: "Ops AI", color: "#13a46b", dark: "#087445",
      role: "ผู้ควบคุมงานสำหรับคิววันนี้ พรุ่งนี้ งานค้างชำระ งานยังไม่ปิด และจุดเสี่ยง",
      status: "พร้อมคุมคิวงาน", greeting: "ผมอยู่หน้า Operations Board พร้อมดูคิว งานค้าง และความเสี่ยงจากข้อมูลจริง",
      thinking: "กำลังตรวจคิวและความเสี่ยง", talking: "เจอประเด็นที่ต้องดูแล้วครับ", workstation: "opsBoard",
      home: { x: 66, y: 55 },
      commands: ["วันนี้มีอะไรต้องระวังไหม", "พรุ่งนี้มีงานอะไรบ้าง", "งานไหนยังไม่จ่าย", "งานไหนยังไม่ปิด"],
    },
    ads: {
      name: "Ads AI", color: "#ef5aa3", dark: "#be2370",
      role: "ผู้ช่วยการตลาดสำหรับ Google Ads, Facebook Ads, TikTok Ads, keyword และพื้นที่บริการ",
      status: "พร้อมคิดแคมเปญ", greeting: "ผมจะช่วยมองงานจริงให้เป็นไอเดียโฆษณา คำค้น และพื้นที่ยิงแอด",
      thinking: "กำลังหาโอกาสการตลาด", talking: "ได้ไอเดียแคมเปญแล้วครับ", workstation: "adsDesk",
      home: { x: 22, y: 83 },
      commands: ["ช่วยคิด keyword จากงานจริง", "พื้นที่ไหนควรยิงแอด", "เขียนข้อความโฆษณาล้างแอร์", "ไอเดีย TikTok Ads จากงานช่วงนี้"],
    },
    content: {
      name: "Content AI", color: "#8b5cf6", dark: "#5b35b8",
      role: "ผู้ช่วยทำคอนเทนต์สำหรับโพสต์ แคปชัน รีวิว และสคริปต์ Reels/TikTok",
      status: "พร้อมสร้างคอนเทนต์", greeting: "ผมพร้อมเรียบเรียงงานจริงให้เป็นโพสต์ แคปชัน หรือสคริปต์ที่ใช้ได้ทันที",
      thinking: "กำลังเรียบเรียงคอนเทนต์", talking: "ร่างคอนเทนต์ให้แล้วครับ", workstation: "contentDesk",
      home: { x: 48, y: 84 },
      commands: ["เขียนแคปชันจากงานวันนี้", "ทำสคริปต์ Reels 30 วินาที", "ไอเดียโพสต์จากงานจริง", "ร่างข้อความรีวิวให้ลูกค้า"],
    },
    dev: {
      name: "Dev AI", color: "#334155", dark: "#172033",
      role: "ผู้ช่วยระบบสำหรับ prompt สรุปบั๊ก checklist deploy และตรวจความเสี่ยง",
      status: "พร้อมตรวจระบบ", greeting: "ผมพร้อมช่วยทำเช็กลิสต์ระบบ สรุปความเสี่ยง และเขียน prompt สำหรับงานภายใน",
      thinking: "กำลังตรวจมุมระบบ", talking: "ได้ข้อสรุประบบแล้วครับ", workstation: "devDesk",
      home: { x: 77, y: 84 },
      commands: ["ทำ checklist ก่อน deploy", "สรุปความเสี่ยงของ AI Office", "ช่วยเขียน prompt สำหรับแอดมิน", "ตรวจว่ามีอะไรห้ามแก้ข้อมูลไหม"],
    },
  };

  const zones = {
    adminDesk: { x: 18, y: 45 },
    salesDesk: { x: 42, y: 41 },
    opsBoard: { x: 72, y: 45 },
    adsDesk: { x: 19, y: 75 },
    contentDesk: { x: 43, y: 78 },
    devDesk: { x: 78, y: 76 },
    meetingTable: { x: 59, y: 62 },
  };

  const state = {
    pin: "", pinRequired: false, activeAgent: "admin", loadingAsk: false,
    greeted: new Set(), agentStates: {}, positions: {}, lastAnswer: "",
    movementFrames: {}, consoleFull: false,
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function money(value){ return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
  function agentConfig(agentKey){ return agents[agentKey] || agents.admin; }
  function agentElement(agentKey){ return document.querySelector(`.npc[data-agent="${agentKey}"]`); }
  function activeAgent(){ return agentConfig(state.activeAgent); }

  function refreshAiOfficeCache(){
    try {
      console.info(`CWF AI Office ${VERSION}`);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) {
            reg.update().catch(() => {});
            if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
        }).catch(() => {});
      }
      if ("caches" in window) {
        caches.keys().then((keys) => Promise.all(keys.map(async (key) => {
          const cache = await caches.open(key);
          await Promise.all([
            cache.delete("/admin/ai-office"),
            cache.delete("/admin/ai-office.html"),
            cache.delete("/admin-ai-office.html"),
            cache.delete("/admin-ai-office.js"),
          ]);
        }))).catch(() => {});
      }
    } catch (_) {}
  }

  function setAgentColor(agentKey){
    const el = agentElement(agentKey);
    const agent = agentConfig(agentKey);
    if (!el) return;
    el.style.setProperty("--agent-main", agent.color);
    el.style.setProperty("--agent-dark", agent.dark || agent.color);
  }

  function placeAgent(agentKey, point){
    const el = agentElement(agentKey);
    if (!el || !point) return;
    const x = clamp(Number(point.x), 4, 96);
    const y = clamp(Number(point.y), 12, 92);
    state.positions[agentKey] = { x, y };
    el.style.setProperty("--agent-x", `${x}%`);
    el.style.setProperty("--agent-y", `${y}%`);
    el.style.zIndex = String(50 + Math.round(y));
    setAgentColor(agentKey);
    clampBubble(agentKey, x);
  }

  function clampBubble(agentKey, x){
    const el = agentElement(agentKey);
    if (!el) return;
    el.classList.toggle("bubbleLeft", x < 18);
    el.classList.toggle("bubbleRight", x > 82);
  }

  function setAgentState(agentKey, nextState){
    const el = agentElement(agentKey);
    if (!el) return;
    ["idle","walking","thinking","talking","working"].forEach((name) => el.classList.toggle(name, name === nextState));
    state.agentStates[agentKey] = nextState;
    if (agentKey === state.activeAgent) updateConsoleAgent();
  }

  function showAgentBubble(agentKey, message){
    const bubble = agentElement(agentKey)?.querySelector(".npcBubble");
    if (bubble) bubble.textContent = message || "";
  }

  function drawRoute(agentKey, from, to){
    const layer = $("routeLayer");
    if (!layer || !from || !to) return;
    const old = layer.querySelector(`[data-route="${agentKey}"]`);
    if (old) old.remove();
    const midX = (from.x + to.x) / 2;
    const midY = Math.min(from.y, to.y) - 8;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "routeLine");
    path.setAttribute("data-route", agentKey);
    path.setAttribute("d", `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
    layer.appendChild(path);
  }

  function clearRoute(agentKey){
    const route = $("routeLayer")?.querySelector(`[data-route="${agentKey}"]`);
    if (route) route.remove();
  }

  function animateAgent(agentKey, from, to, duration = 880){
    if (state.movementFrames[agentKey]) cancelAnimationFrame(state.movementFrames[agentKey]);
    drawRoute(agentKey, from, to);
    const start = performance.now();
    const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return new Promise((resolve) => {
      const step = (now) => {
        const raw = clamp((now - start) / duration, 0, 1);
        const t = ease(raw);
        const wave = Math.sin(t * Math.PI);
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t - wave * 1.7;
        placeAgent(agentKey, { x, y });
        if (raw < 1) state.movementFrames[agentKey] = requestAnimationFrame(step);
        else {
          placeAgent(agentKey, to);
          clearRoute(agentKey);
          Reflect.deleteProperty(state.movementFrames, agentKey);
          resolve();
        }
      };
      state.movementFrames[agentKey] = requestAnimationFrame(step);
    });
  }

  async function moveAgent(agentKey, targetKey){
    const agent = agentConfig(agentKey);
    const target = zones[targetKey] || agent.home;
    const from = state.positions[agentKey] || agent.home;
    setAgentState(agentKey, "walking");
    showAgentBubble(agentKey, "กำลังเดินไปที่จุดทำงาน");
    await animateAgent(agentKey, from, target, 860);
    if (state.agentStates[agentKey] === "walking") setAgentState(agentKey, "idle");
  }

  function moveAgentToHome(agentKey){
    return moveAgent(agentKey, "home");
  }

  function moveSelectedAgentToWorkstation(){
    return moveAgent(state.activeAgent, activeAgent().workstation);
  }

  function choosePrimaryAgentForCommand(commandText){
    const text = String(commandText || "").toLowerCase();
    if (/แพง|ปิดการขาย|ราคา|package|แพ็ก/.test(text)) return "sales";
    if (/ยังไม่จ่าย|ยังไม่ปิด|พรุ่งนี้|วันนี้|ระวัง|คิว|open|unpaid|today|tomorrow/.test(text)) return "ops";
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
    if (agentKey === "ops" && /วันนี้|พรุ่งนี้|ยังไม่จ่าย|ยังไม่ปิด|ระวัง|คิว/.test(text)) partner = "admin";
    if (agentKey === "admin" && /วันนี้|พรุ่งนี้|ยังไม่จ่าย|ยังไม่ปิด|คิว/.test(text)) { partner = "ops"; target = "opsBoard"; }
    if (agentKey === "sales" && /ราคา|แพง|ปิดการขาย/.test(text)) partner = "admin";
    if (agentKey === "ads" && /โพสต์|คอนเทนต์|รีวิว/.test(text)) partner = "content";
    if (agentKey === "content" && /แอด|ads|keyword/.test(text)) partner = "ads";
    if (partner && partner !== agentKey) {
      showAgentBubble(partner, "เข้ามาช่วยประสานงาน");
      moveAgent(partner, target).then(() => {
        setAgentState(partner, "working");
        setTimeout(() => {
          if (partner !== state.activeAgent) {
            moveAgent(partner, agents[partner].home).then(() => setAgentState(partner, "idle"));
          }
        }, 3600);
      });
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
    const data = await apiFetchJson(url, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body || {}),
    });
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
    const board = $("boardText");
    if (board) board.textContent = `วันนี้ ${money(summary?.today_count)} งาน | พรุ่งนี้ ${money(summary?.tomorrow_count)} งาน | ยังไม่ปิด ${money(summary?.open_count)} | ยังไม่จ่าย ${money(summary?.unpaid_count)}`;
  }

  function updateConsoleAgent(){
    const agent = activeAgent();
    const statusMap = {
      idle: agent.status,
      walking: "กำลังเดินไปที่จุดทำงาน",
      thinking: agent.thinking,
      talking: agent.talking,
      working: "กำลังทำงานที่โต๊ะ",
    };
    $("agentName").textContent = agent.name;
    $("agentRole").textContent = agent.role;
    $("agentStatus").textContent = statusMap[state.agentStates[state.activeAgent]] || agent.status;
    $("agentAvatar")?.style.setProperty("--selected", agent.color);
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

  function expandConsole(){
    state.consoleFull = true;
    $("commandConsole")?.classList.add("full");
    $("commandConsole")?.classList.remove("peek");
  }

  function peekConsole(){
    state.consoleFull = false;
    $("commandConsole")?.classList.add("peek");
    $("commandConsole")?.classList.remove("full");
  }

  function selectAgent(agentKey, userTriggered = true, silent = false){
    const key = agents[agentKey] ? agentKey : "admin";
    state.activeAgent = key;
    document.querySelectorAll(".npc").forEach((el) => el.classList.toggle("selected", el.dataset.agent === key));
    updateConsoleAgent();
    showAgentBubble(key, agentConfig(key).greeting);
    if (!state.agentStates[key]) setAgentState(key, "idle");
    if (userTriggered) {
      peekConsole();
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
      const data = await apiPost("/admin/ai-office/ask", {
        agent: agentKey,
        question: rawQuestion,
        phone: $("phoneInput")?.value || "",
      });
      if (pending) pending.remove();
      const answer = data.answer || "ไม่มีคำตอบจากข้อมูลที่มี";
      state.lastAnswer = answer;
      addMessage("ai", answer, true);
      if (data.context?.summary) setSummary(data.context.summary);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, responsePreview(answer, agentKey));
      setTimeout(() => {
        setAgentState(agentKey, "working");
        showAgentBubble(agentKey, agent.talking);
      }, 3600);
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
        addMessage("ai", "ไม่พบงานจากเบอร์นี้ในระบบ", false);
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
      const board = $("boardText");
      if (board) board.textContent = "กำลังโหลดข้อมูลงานจริงจากระบบ";
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
    Object.keys(agents).forEach((key) => {
      placeAgent(key, agents[key].home);
      setAgentState(key, "idle");
      showAgentBubble(key, agents[key].status);
    });
  }

  function bind(){
    document.querySelectorAll(".npc").forEach((el) => {
      el.addEventListener("click", () => selectAgent(el.dataset.agent, true));
    });
    $("consoleToggle")?.addEventListener("click", () => state.consoleFull ? peekConsole() : expandConsole());
    $("btnRefresh")?.addEventListener("click", refreshAll);
    $("btnPhone")?.addEventListener("click", searchPhone);
    $("phoneInput")?.addEventListener("focus", expandConsole);
    $("phoneInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPhone(); });
    $("btnAsk")?.addEventListener("click", () => ask());
    $("askInput")?.addEventListener("focus", expandConsole);
    $("askInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ask();
      }
    });
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
    window.addEventListener("resize", () => Object.keys(state.positions).forEach((key) => placeAgent(key, state.positions[key])));
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
    initAgents();
    bind();
    selectAgent("admin", false);
    loadConfig().catch((e) => addMessage("ai", e.message || "โหลด AI Office ไม่สำเร็จ", false));
  });
})();
