(function(){
  const VERSION = "ai-office-stage-motion-20260607";
  const ASSET_ROOT = "/assets/ai-office-final";
  const CLEAN_CHARACTER_ROOT = `${ASSET_ROOT}/characters-clean`;
  const roleOrder = ["admin","sales","ops","ads","content","dev"];
  const states = ["base","idle","thinking","talking","working","walk-1","walk-2","walk-3","walk-4"];

  function characterAssets(role){
    const out = {};
    states.forEach((state) => { out[state] = `${CLEAN_CHARACTER_ROOT}/${role}/${state}.png`; });
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

  agents.dev.commands = ["ตรวจระบบ AI Office", "ตรวจ API read-only", "ตรวจ Asset 404", "ตรวจ Cache / Service Worker", "ตรวจ OpenAI server-side", "ตรวจ Auth / PIN", "ตรวจคำต้องห้ามใน UI", "ตรวจความเสี่ยงก่อน Deploy", "สร้าง Prompt แก้ปัญหาให้ Codex"];
  agents.admin.commands = ["\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49\u0e21\u0e35\u0e07\u0e32\u0e19\u0e2d\u0e30\u0e44\u0e23\u0e1a\u0e49\u0e32\u0e07", "\u0e23\u0e48\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e19\u0e31\u0e14\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32", "\u0e23\u0e48\u0e32\u0e07\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e41\u0e08\u0e49\u0e07\u0e0a\u0e48\u0e32\u0e07", "\u0e14\u0e39\u0e41\u0e0a\u0e17 LINE \u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14"];
  agents.sales.commands = ["\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32\u0e1a\u0e2d\u0e01\u0e27\u0e48\u0e32\u0e41\u0e1e\u0e07 \u0e15\u0e2d\u0e1a\u0e22\u0e31\u0e07\u0e44\u0e07\u0e14\u0e35", "\u0e0a\u0e48\u0e27\u0e22\u0e40\u0e02\u0e35\u0e22\u0e19\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e1b\u0e34\u0e14\u0e01\u0e32\u0e23\u0e02\u0e32\u0e22", "\u0e23\u0e48\u0e32\u0e07\u0e15\u0e2d\u0e1a\u0e25\u0e39\u0e01\u0e04\u0e49\u0e32\u0e08\u0e32\u0e01 LINE", "\u0e27\u0e34\u0e40\u0e04\u0e23\u0e32\u0e30\u0e2b\u0e4c\u0e1b\u0e34\u0e14\u0e01\u0e32\u0e23\u0e02\u0e32\u0e22\u0e19\u0e49\u0e2d\u0e22"];
  agents.ops.commands = ["\u0e1e\u0e23\u0e38\u0e48\u0e07\u0e19\u0e35\u0e49\u0e21\u0e35\u0e07\u0e32\u0e19\u0e2d\u0e30\u0e44\u0e23\u0e1a\u0e49\u0e32\u0e07", "\u0e07\u0e32\u0e19\u0e44\u0e2b\u0e19\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e1b\u0e34\u0e14", "\u0e07\u0e32\u0e19\u0e44\u0e2b\u0e19\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e08\u0e48\u0e32\u0e22", "\u0e1c\u0e39\u0e49\u0e0a\u0e48\u0e27\u0e22\u0e40\u0e15\u0e23\u0e35\u0e22\u0e21\u0e25\u0e07\u0e04\u0e34\u0e27"];
  agents.ads.commands = ["\u0e0a\u0e48\u0e27\u0e22\u0e04\u0e34\u0e14 keyword \u0e08\u0e32\u0e01\u0e07\u0e32\u0e19\u0e08\u0e23\u0e34\u0e07", "\u0e1e\u0e37\u0e49\u0e19\u0e17\u0e35\u0e48\u0e44\u0e2b\u0e19\u0e04\u0e27\u0e23\u0e22\u0e34\u0e07\u0e41\u0e2d\u0e14", "\u0e40\u0e02\u0e35\u0e22\u0e19\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e42\u0e06\u0e29\u0e13\u0e32\u0e25\u0e49\u0e32\u0e07\u0e41\u0e2d\u0e23\u0e4c", "\u0e44\u0e2d\u0e40\u0e14\u0e35\u0e22 TikTok Ads"];
  agents.content.commands = ["\u0e40\u0e02\u0e35\u0e22\u0e19\u0e41\u0e04\u0e1b\u0e0a\u0e31\u0e19\u0e08\u0e32\u0e01\u0e07\u0e32\u0e19\u0e27\u0e31\u0e19\u0e19\u0e35\u0e49", "\u0e17\u0e33\u0e2a\u0e04\u0e23\u0e34\u0e1b\u0e15\u0e4c Reels 30 \u0e27\u0e34\u0e19\u0e32\u0e17\u0e35", "\u0e44\u0e2d\u0e40\u0e14\u0e35\u0e22\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e08\u0e32\u0e01\u0e07\u0e32\u0e19\u0e08\u0e23\u0e34\u0e07", "\u0e23\u0e48\u0e32\u0e07\u0e42\u0e1e\u0e2a\u0e15\u0e4c\u0e23\u0e35\u0e27\u0e34\u0e27"];
  agents.dev.commands = [
    "\u0e15\u0e23\u0e27\u0e08\u0e23\u0e30\u0e1a\u0e1a AI Office",
    "\u0e15\u0e23\u0e27\u0e08 API read-only",
    "\u0e15\u0e23\u0e27\u0e08 Asset 404",
    "\u0e15\u0e23\u0e27\u0e08 Cache / Service Worker",
    "\u0e15\u0e23\u0e27\u0e08 OpenAI server-side",
    "\u0e15\u0e23\u0e27\u0e08 Auth / PIN",
    "\u0e15\u0e23\u0e27\u0e08\u0e04\u0e33\u0e15\u0e49\u0e2d\u0e07\u0e2b\u0e49\u0e32\u0e21\u0e43\u0e19 UI",
    "\u0e15\u0e23\u0e27\u0e08\u0e04\u0e27\u0e32\u0e21\u0e40\u0e2a\u0e35\u0e48\u0e22\u0e07\u0e01\u0e48\u0e2d\u0e19 Deploy",
    "\u0e2a\u0e23\u0e49\u0e32\u0e07 Prompt \u0e41\u0e01\u0e49\u0e1b\u0e31\u0e0d\u0e2b\u0e32\u0e43\u0e2b\u0e49 Codex"
  ];

  const zones = {
    adminDesk: { x: 20, y: 52 }, salesDesk: { x: 78, y: 52 }, opsBoard: { x: 50, y: 32 },
    adsDesk: { x: 19, y: 31 }, contentDesk: { x: 28, y: 72 }, devDesk: { x: 82, y: 31 }, meetingTable: { x: 51, y: 67 },
  };
  const mobileZones = {
    adminDesk: { x: 27, y: 53 }, salesDesk: { x: 70, y: 54 }, opsBoard: { x: 50, y: 31 },
    adsDesk: { x: 28, y: 32 }, contentDesk: { x: 34, y: 73 }, devDesk: { x: 72, y: 33 }, meetingTable: { x: 51, y: 66 },
  };

  const state = { pin: "", pinRequired: false, activeAgent: "admin", loadingAsk: false, loadingDiagnostics: false, loadingLine: false, greeted: new Set(), agentStates: {}, walkTimers: {}, bubbleTimers: {}, agentPositions: {}, idlePatrolTimer: null, lastAnswer: "", lastDiagnostics: null, lineConversations: [], selectedLineConversation: null, selectedLineMessages: [] };
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
      `${ASSET_ROOT}/maps-clean/office-main-desktop.png`, `${ASSET_ROOT}/maps-clean/office-main-mobile.png`,
      `${ASSET_ROOT}/ui/selection-ring.png`, `${ASSET_ROOT}/ui/empty-state.png`,
      ...roleOrder.map((key) => agents[key].assets.idle),
    ];
    urls.forEach((src) => { const img = new Image(); img.decoding = "async"; img.src = src; });
  }

  function placeAgent(agentKey, point){
    const el = agentElement(agentKey);
    if (!el || !point) return;
    const mobile = isMobile();
    const size = mobile ? ({ admin: 44, sales: 43, ops: 46, ads: 42, content: 43, dev: 42 }[agentKey] || 44) : ({ admin: 58, sales: 58, ops: 62, ads: 54, content: 56, dev: 54 }[agentKey] || 56);
    el.style.setProperty("--x", `${point.x}%`);
    el.style.setProperty("--y", `${point.y}%`);
    el.style.setProperty("--depth", `${Math.round(point.y)}`);
    el.style.setProperty("--agent-size", `${size}px`);
    el.style.setProperty("--agent-size-mobile", `${size}px`);
    el.style.setProperty("--agent-size-desktop", `${size}px`);
    state.agentPositions[agentKey] = { x: point.x, y: point.y };
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

  function hideAgentBubbles(exceptKey){
    roleOrder.forEach((key) => {
      if (key === exceptKey) return;
      const el = agentElement(key);
      if (el) el.classList.remove("has-bubble");
      if (state.bubbleTimers[key]) {
        window.clearTimeout(state.bubbleTimers[key]);
        state.bubbleTimers[key] = null;
      }
    });
  }

  function showAgentBubble(agentKey, message, durationMs = 3400){
    if (agentKey !== state.activeAgent) return;
    hideAgentBubbles(agentKey);
    const el = agentElement(agentKey);
    const bubble = el?.querySelector(".npcBubble");
    if (!el || !bubble) return;
    bubble.textContent = message || "";
    el.classList.add("has-bubble");
    if (state.bubbleTimers[agentKey]) window.clearTimeout(state.bubbleTimers[agentKey]);
    if (durationMs > 0) {
      state.bubbleTimers[agentKey] = window.setTimeout(() => {
        if (state.activeAgent === agentKey && !["thinking","talking"].includes(state.agentStates[agentKey])) el.classList.remove("has-bubble");
      }, durationMs);
    }
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

  function scheduleIdlePatrol(){
    if (state.idlePatrolTimer) window.clearTimeout(state.idlePatrolTimer);
    const delay = 12000 + Math.floor(Math.random() * 13000);
    state.idlePatrolTimer = window.setTimeout(async () => {
      if (!state.loadingAsk && !state.loadingDiagnostics && !state.loadingLine) {
        const candidates = roleOrder.filter((key) => key !== state.activeAgent && !["thinking","talking","walking"].includes(state.agentStates[key]));
        const agentKey = candidates[Math.floor(Math.random() * candidates.length)];
        if (agentKey) {
          await moveAgent(agentKey, agentConfig(agentKey).workstation);
          window.setTimeout(() => moveAgentToHome(agentKey), 900);
        }
      }
      scheduleIdlePatrol();
    }, delay);
  }

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
    $("askInput")?.setAttribute("placeholder", "\u0e1e\u0e34\u0e21\u0e1e\u0e4c\u0e16\u0e32\u0e21\u0e07\u0e32\u0e19\u0e15\u0e23\u0e07\u0e19\u0e35\u0e49...");
    renderCommands();
  }

  function renderCommands(){
    const box = $("quickCommands");
    if (!box) return;
    const isDev = state.activeAgent === "dev";
    box.classList.toggle("diagnosticList", isDev);
    box.innerHTML = activeAgent().commands.map((cmd) => {
      const mode = isDev ? diagnosticModeFor(cmd) : "";
      return `<button class="quickBtn${isDev ? " diagCard" : ""}" type="button" data-diag="${esc(mode)}">${esc(cmd)}</button>`;
    }).join("");
    box.querySelectorAll("button").forEach((btn) => btn.addEventListener("click", () => {
      if (state.activeAgent === "dev") runDiagnostics(btn.dataset.diag || "full", btn.textContent || "");
      else if (isLineCommand(btn.textContent || "")) handleLineCommand(btn.textContent || "");
      else ask(btn.textContent || "");
    }));
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

  function isLineCommand(text){
    const value = String(text || "");
    return /LINE|แชท|ลูกค้าถามราคา|แพง|follow-up|ลงคิว|แจ้งช่างจากแชท|ตอบลูกค้า|ข้อมูลที่ยังขาด/.test(value);
  }

  function lineDraftInstruction(label){
    const value = String(label || "");
    if (/ลงคิว|ข้อมูลที่ยังขาด|เช็กข้อมูล|เวลา/.test(value)) return "สรุปแชทและดึงข้อมูลสำหรับเตรียมลงคิว พร้อมระบุข้อมูลที่ยังขาด";
    if (/ราคา|แพง|follow-up|Sales/.test(value)) return "ช่วยร่างข้อความฝ่ายขายเพื่อตอบลูกค้าอย่างสุภาพและเพิ่มโอกาสปิดงาน";
    if (/แจ้งช่าง/.test(value)) return "ดึงข้อมูลจากแชทและร่างข้อความแจ้งช่างแบบแอดมินต้องคัดลอกส่งเอง";
    if (/สรุป/.test(value)) return "สรุปแชทลูกค้าและข้อมูลที่จับได้";
    return "ร่างข้อความตอบลูกค้าจากแชท LINE โดยให้แอดมินตรวจสอบและคัดลอกส่งเอง";
  }

  function addHtmlMessage(html){
    const box = $("messages");
    if (!box) return null;
    const div = document.createElement("div");
    div.className = "msg ai linePanel";
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function formatDate(value){
    if (!value) return "-";
    try { return new Date(value).toLocaleString("th-TH"); } catch (_) { return "-"; }
  }

  function renderLineInboxPanel(){
    const rows = state.lineConversations || [];
    if (!rows.length) {
      return addHtmlMessage(`<div class="lineInbox"><b>LINE Inbox</b><p>ยังไม่มีข้อความ LINE ที่ได้รับหลังตั้งค่า webhook</p></div>`);
    }
    const html = [
      `<div class="lineInbox"><b>LINE Inbox</b><p>เลือกแชทเพื่อดูข้อความล่าสุดและให้ AI ช่วยร่างคำตอบ</p><div class="lineList">`,
      ...rows.map((c) => `
        <button class="lineConversation" type="button" data-line-conversation="${esc(c.id)}">
          <span>${esc(c.display_name || c.line_user_id_masked || "LINE user")}</span>
          <em>${esc(c.last_message_text || c.last_message_type || "-")}</em>
          <small>${esc(formatDate(c.last_message_at))} · ${money(c.message_count)} ข้อความ</small>
        </button>
      `),
      `</div></div>`,
    ].join("");
    const panel = addHtmlMessage(html);
    panel?.querySelectorAll("[data-line-conversation]").forEach((btn) => {
      btn.addEventListener("click", () => loadLineMessages(btn.dataset.lineConversation));
    });
    return panel;
  }

  function renderLineMessagesPanel(){
    const convo = state.selectedLineConversation;
    const messages = state.selectedLineMessages || [];
    const title = esc(convo?.display_name || convo?.line_user_id_masked || "LINE user");
    const html = [
      `<div class="lineInbox"><b>${title}</b><p>ข้อความล่าสุดจาก LINE OA</p><div class="lineMessages">`,
      ...messages.map((m) => `
        <div class="lineBubble ${esc(m.direction || "inbound")}">
          <span>${esc(m.message_text || `[${m.message_type || "message"}]`)}</span>
          <small>${esc(formatDate(m.received_at))}</small>
        </div>
      `),
      messages.length ? "" : `<p>ยังไม่มีข้อความในแชทนี้</p>`,
      `</div><div class="lineActions">
        <button class="ghost" type="button" data-line-draft="สรุปแชทลูกค้า">สรุปแชท</button>
        <button class="ghost" type="button" data-line-draft="ร่างข้อความตอบลูกค้า">ร่างตอบลูกค้า</button>
        <button class="ghost" type="button" data-line-draft="ดึงข้อมูลเตรียมลงคิวจากแชท">ดึงข้อมูลเตรียมลงคิว</button>
        <button class="ghost" type="button" data-line-draft="ถามข้อมูลที่ยังขาดก่อนลงคิว">ถามข้อมูลที่ยังขาด</button>
      </div></div>`,
    ].join("");
    const panel = addHtmlMessage(html);
    panel?.querySelectorAll("[data-line-draft]").forEach((btn) => {
      btn.addEventListener("click", () => draftLineReply(btn.dataset.lineDraft || btn.textContent || ""));
    });
    return panel;
  }

  async function handleLineCommand(label){
    if (state.loadingLine) return;
    expandConsole();
    const agentKey = ["admin", "sales", "ops"].includes(state.activeAgent) ? state.activeAgent : "admin";
    showAgentBubble(agentKey, "กำลังเปิด LINE Inbox");
    if (/สรุป|ร่าง|ราคา|แพง|follow-up|ลงคิว|แจ้งช่าง|ข้อมูลที่ยังขาด|เช็กข้อมูล|เวลา/.test(String(label || "")) && state.selectedLineConversation) {
      await draftLineReply(label);
      return;
    }
    await loadLineInbox();
  }

  async function loadLineInbox(){
    state.loadingLine = true;
    const agentKey = ["admin", "sales", "ops"].includes(state.activeAgent) ? state.activeAgent : "admin";
    setAgentState(agentKey, "thinking");
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiGet("/admin/ai-office/line-inbox?limit=30");
      state.lineConversations = data.conversations || [];
      if (pending) pending.remove();
      renderLineInboxPanel();
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, state.lineConversations.length ? "เลือกแชทที่ต้องการให้ช่วยดู" : "ยังไม่มีข้อความ LINE ใหม่");
      setTimeout(() => setAgentState(agentKey, "working"), 2200);
    } catch (e) {
      if (pending) pending.remove();
      addMessage("ai", e.message || "โหลด LINE Inbox ไม่สำเร็จ", false);
      showAgentBubble(agentKey, "โหลด LINE Inbox ไม่สำเร็จ");
    } finally {
      state.loadingLine = false;
    }
  }

  async function loadLineMessages(conversationId){
    const id = Number(conversationId || 0);
    if (!id) return;
    const agentKey = ["admin", "sales", "ops"].includes(state.activeAgent) ? state.activeAgent : "admin";
    setAgentState(agentKey, "thinking");
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiGet(`/admin/ai-office/line-conversations/${encodeURIComponent(id)}/messages?limit=50`);
      state.selectedLineConversation = data.conversation || null;
      state.selectedLineMessages = data.messages || [];
      if (pending) pending.remove();
      renderLineMessagesPanel();
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, "เปิดแชทแล้ว เลือกงานที่ให้ AI ช่วยได้");
    } catch (e) {
      if (pending) pending.remove();
      addMessage("ai", e.message || "โหลดข้อความ LINE ไม่สำเร็จ", false);
      showAgentBubble(agentKey, "โหลดข้อความไม่สำเร็จ");
    }
  }

  async function draftLineReply(label){
    const convo = state.selectedLineConversation;
    if (!convo?.id) {
      addMessage("ai", "กรุณาเลือกแชท LINE ก่อนให้ AI สรุปหรือร่างข้อความ", false);
      await loadLineInbox();
      return;
    }
    const agentKey = ["admin", "sales", "ops"].includes(state.activeAgent) ? state.activeAgent : "admin";
    addMessage("user", `${agentConfig(agentKey).name}: ${label}`, false);
    setAgentState(agentKey, "thinking");
    showAgentBubble(agentKey, "กำลังอ่านแชทและร่างข้อความ");
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiPost("/admin/ai-office/line-draft-reply", {
        conversation_id: convo.id,
        agent: agentKey,
        instruction: lineDraftInstruction(label),
      });
      if (pending) pending.remove();
      const answer = data.answer || "ยังไม่มีคำตอบจากข้อมูลแชทนี้";
      state.lastAnswer = answer;
      addMessage("ai", answer, true);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, responsePreview(answer, agentKey));
      setTimeout(() => setAgentState(agentKey, "working"), 3200);
    } catch (e) {
      if (pending) pending.remove();
      addMessage("ai", e.message || "ร่างข้อความจาก LINE ไม่สำเร็จ", false);
      showAgentBubble(agentKey, "ร่างข้อความไม่สำเร็จ");
    }
  }

  function diagnosticModeFor(label){
    const text = String(label || "");
    if (text.includes("API")) return "api";
    if (text.includes("Asset")) return "assets";
    if (text.includes("Cache")) return "cache";
    if (text.includes("OpenAI")) return "openai";
    if (text.includes("Auth")) return "auth";
    if (text.includes("คำต้องห้าม")) return "wording";
    if (text.includes("ความเสี่ยง")) return "risk";
    if (text.includes("Prompt")) return "prompt";
    return "full";
  }

  function linesFromDiagnostics(data, mode){
    const summary = data?.summary || {};
    const items = Array.isArray(data?.items) ? data.items : [];
    const missing = items.flatMap((item) => Array.isArray(item.missing_assets) ? item.missing_assets : []);
    const endpointFailures = items.filter((item) => item.status !== "pass").map((item) => `${item.label}: ${item.detail}`);
    const passLines = (summary.pass || []).map((label) => `- ${label}`);
    const fixLines = (summary.fix || []).map((line) => `- ${line}`);
    const riskLines = (summary.risks || []).map((risk) => `- ${risk.label}: ${risk.detail}`);
    const prompt = summary.prompt || "ยังไม่มี prompt สำหรับแก้ปัญหา";

    if (mode === "prompt") return `Prompt ส่ง Codex ถ้าต้องแก้\n${prompt}`;
    if (mode === "assets") {
      return [
        "ตรวจ Asset 404",
        missing.length ? `ต้องแก้\n${missing.map((p) => `- ${p}`).join("\n")}` : "ผ่าน\n- asset หลักและ manifest ครบ",
        endpointFailures.length ? `API failures\n${endpointFailures.map((line) => `- ${line}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n");
    }
    if (mode === "risk") {
      return [
        "ตรวจความเสี่ยงก่อน Deploy",
        riskLines.length ? `ความเสี่ยง\n${riskLines.join("\n")}` : "ความเสี่ยง\n- ไม่พบความเสี่ยงจาก diagnostics",
        fixLines.length ? `ต้องแก้\n${fixLines.join("\n")}` : "ผ่าน\n- ไม่พบรายการต้องแก้",
        `Prompt ส่ง Codex ถ้าต้องแก้\n${prompt}`,
      ].join("\n\n");
    }
    return [
      "ผลตรวจระบบ AI Office",
      passLines.length ? `ผ่าน\n${passLines.join("\n")}` : "ผ่าน\n- ยังไม่มีรายการผ่าน",
      fixLines.length ? `ต้องแก้\n${fixLines.join("\n")}` : "ต้องแก้\n- ไม่มี",
      riskLines.length ? `ความเสี่ยง\n${riskLines.join("\n")}` : "ความเสี่ยง\n- ไม่มี",
      missing.length ? `Missing assets\n${missing.map((p) => `- ${p}`).join("\n")}` : "",
      `Prompt ส่ง Codex ถ้าต้องแก้\n${prompt}`,
    ].filter(Boolean).join("\n\n");
  }

  async function runDiagnostics(mode = "full", label = "ตรวจระบบ AI Office"){
    if (state.loadingDiagnostics) return;
    state.loadingDiagnostics = true;
    const agentKey = "dev";
    if (state.activeAgent !== "dev") selectAgent("dev", false, true);
    expandConsole();
    addMessage("user", `Dev AI: ${label}`, false);
    showAgentBubble(agentKey, "กำลังตรวจระบบแบบอ่านอย่างเดียว");
    await moveAgent(agentKey, agentConfig(agentKey).workstation);
    setAgentState(agentKey, "thinking");
    const pending = addThinkingMessage(agentKey);
    try {
      const data = await apiPost("/admin/ai-office/diagnostics", {
        mode,
        phone: $("phoneInput")?.value || "",
        viewport_width: Math.round(window.innerWidth || 0),
      });
      state.lastDiagnostics = data;
      if (pending) pending.remove();
      const text = linesFromDiagnostics(data, mode);
      state.lastAnswer = text;
      addMessage("ai", text, true);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, data.passed ? "ระบบหลักผ่าน พร้อมให้ทดสอบต่อ" : "พบรายการที่ต้องแก้ในผลตรวจ");
      setTimeout(() => { setAgentState(agentKey, "working"); showAgentBubble(agentKey, "พร้อมตรวจต่อ"); }, 3600);
    } catch (e) {
      if (pending) pending.remove();
      const msg = e.message || "ตรวจระบบ AI Office ไม่สำเร็จ";
      addMessage("ai", `ต้องแก้\n- ${msg}`, false);
      setAgentState(agentKey, "talking");
      showAgentBubble(agentKey, "ตรวจระบบไม่สำเร็จ");
    } finally {
      state.loadingDiagnostics = false;
    }
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
    scheduleIdlePatrol();
    loadConfig().catch((e) => addMessage("ai", e.message || "โหลด AI Office ไม่สำเร็จ", false));
  });
})();
