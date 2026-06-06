(function(){
  const agents = {
    admin: {
      name: "Admin AI",
      color: "#1558d6",
      role: "ผู้ช่วยแอดมินสำหรับสรุปงาน ร่างข้อความลูกค้า ข้อความช่าง และแปลภาษา",
      status: "พร้อมช่วยงานแอดมิน",
      greeting: "สวัสดีครับ ผมช่วยสรุปงานจริง ร่างข้อความลูกค้า และช่วยแอดมินตอบงานประจำวันได้",
      thinking: "กำลังตรวจข้อมูลงานจริง",
      talking: "สรุปให้แล้วครับ",
      commands: ["วันนี้มีงานอะไรบ้าง", "ร่างข้อความยืนยันนัดลูกค้า", "ร่างข้อความแจ้งช่าง", "แปลข้อความลูกค้าให้สุภาพ"],
    },
    sales: {
      name: "Sales AI",
      color: "#f0b400",
      role: "ผู้ช่วยฝ่ายขายสำหรับปิดการขาย แนะนำแพ็กเกจ และตอบเมื่อลูกค้าบอกว่าแพง",
      status: "พร้อมช่วยปิดการขาย",
      greeting: "ผมจะช่วยตอบลูกค้าให้ดูมั่นใจ สุภาพ และปิดงานได้ดีขึ้นจากข้อมูลจริงที่มี",
      thinking: "กำลังดูมุมปิดการขาย",
      talking: "ได้แนวตอบฝ่ายขายแล้วครับ",
      commands: ["ลูกค้าบอกว่าแพง ตอบยังไงดี", "แนะนำแพ็กเกจจากงานที่มี", "ช่วยเขียนข้อความปิดการขาย", "เหตุผลที่ยอดปิดการขายอาจต่ำ"],
    },
    ops: {
      name: "Ops AI",
      color: "#13a46b",
      role: "ผู้ควบคุมงานสำหรับวันนี้ พรุ่งนี้ งานค้างชำระ งานยังไม่ปิด และความเสี่ยงต้องติดตาม",
      status: "พร้อมคุมคิวงาน",
      greeting: "ผมจะช่วยดูคิววันนี้ งานพรุ่งนี้ งานค้าง และจุดที่ควรระวังจากระบบจริง",
      thinking: "กำลังตรวจคิวและความเสี่ยง",
      talking: "เจอประเด็นที่ต้องดูแล้วครับ",
      commands: ["วันนี้มีอะไรต้องระวังไหม", "พรุ่งนี้มีงานอะไรบ้าง", "งานไหนยังไม่จ่าย", "งานไหนยังไม่ปิด"],
    },
    ads: {
      name: "Ads AI",
      color: "#ef5aa3",
      role: "ผู้ช่วยการตลาดสำหรับ Google Ads, Facebook Ads, TikTok Ads, keyword และพื้นที่บริการ",
      status: "พร้อมคิดแคมเปญ",
      greeting: "ผมช่วยเปลี่ยนข้อมูลงานจริงให้เป็นไอเดียโฆษณา คำค้น และพื้นที่ยิงแอดได้",
      thinking: "กำลังหาโอกาสการตลาด",
      talking: "ได้ไอเดียแคมเปญแล้วครับ",
      commands: ["ช่วยคิด keyword จากงานจริง", "พื้นที่ไหนควรยิงแอด", "เขียนข้อความโฆษณาล้างแอร์", "ไอเดีย TikTok Ads จากงานช่วงนี้"],
    },
    content: {
      name: "Content AI",
      color: "#8b5cf6",
      role: "ผู้ช่วยทำคอนเทนต์สำหรับโพสต์ แคปชัน รีวิว และสคริปต์ Reels/TikTok",
      status: "พร้อมสร้างคอนเทนต์",
      greeting: "ผมช่วยทำคอนเทนต์จากงานจริงให้อ่านดี ดูน่าเชื่อถือ และใช้ต่อได้ทันที",
      thinking: "กำลังเรียบเรียงคอนเทนต์",
      talking: "ร่างคอนเทนต์ให้แล้วครับ",
      commands: ["เขียนแคปชันจากงานวันนี้", "ทำสคริปต์ Reels 30 วินาที", "ไอเดียโพสต์จากงานจริง", "ร่างข้อความรีวิวให้ลูกค้า"],
    },
    dev: {
      name: "Dev AI",
      color: "#334155",
      role: "ผู้ช่วยระบบสำหรับ prompt, สรุปบั๊ก, checklist deploy และ review ความเสี่ยง",
      status: "พร้อมตรวจระบบ",
      greeting: "ผมช่วยคิดเช็กลิสต์ ตรวจความเสี่ยง และสรุปงานระบบแบบไม่แตะข้อมูลจริง",
      thinking: "กำลังตรวจมุมระบบ",
      talking: "ได้ข้อสรุประบบแล้วครับ",
      commands: ["ทำ checklist ก่อน deploy", "สรุปความเสี่ยงของ AI Office", "ช่วยเขียน prompt สำหรับแอดมิน", "ตรวจว่ามีอะไรห้ามแก้ข้อมูลไหม"],
    },
  };

  const state = { pin: "", pinRequired: false, activeAgent: "admin", loadingAsk: false, greeted: new Set() };
  const $ = (id) => document.getElementById(id);

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function money(value){
    return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 });
  }

  function activeAgent(){
    return agents[state.activeAgent] || agents.admin;
  }

  function activeAgentElement(){
    return document.querySelector(`.agent[data-agent="${state.activeAgent}"]`);
  }

  function setBubble(agentKey, text){
    const el = document.querySelector(`.agent[data-agent="${agentKey}"] .agentBubble`);
    if (el) el.textContent = text || "";
  }

  function setAgentVisual(agentKey, mode, bubbleText){
    document.querySelectorAll(".agent").forEach((el) => {
      const isCurrent = el.dataset.agent === agentKey;
      el.classList.toggle("thinking", isCurrent && mode === "thinking");
      el.classList.toggle("talking", isCurrent && mode === "talking");
      el.classList.toggle("tapped", isCurrent && mode === "tapped");
    });
    if (bubbleText) setBubble(agentKey, bubbleText);
    const status = $("agentStatus");
    if (status && agentKey === state.activeAgent) {
      const agent = activeAgent();
      status.textContent = mode === "thinking" ? agent.thinking : (mode === "talking" ? agent.talking : agent.status);
    }
    if (mode === "tapped") setTimeout(() => activeAgentElement()?.classList.remove("tapped"), 180);
  }

  function apiHeaders(extra){
    const headers = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if (state.pin) headers["x-ai-office-pin"] = state.pin;
    return headers;
  }

  async function apiGet(url){
    const data = await apiFetch(url, { headers: apiHeaders() });
    if (data && data.ok === false) throw new Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
    return data;
  }

  async function apiPost(url, body){
    const data = await apiFetch(url, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body || {}),
    });
    if (data && data.ok === false) throw new Error(data.error || "ส่งคำถามไม่สำเร็จ");
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
    if (board) board.textContent = `วันนี้ ${money(summary?.today_count)} งาน • พรุ่งนี้ ${money(summary?.tomorrow_count)} งาน • ยังไม่ปิด ${money(summary?.open_count)} • ยังไม่จ่าย ${money(summary?.unpaid_count)}`;
  }

  function renderCommands(){
    const box = $("quickCommands");
    if (!box) return;
    box.innerHTML = activeAgent().commands.map((cmd) => `<button class="chip" type="button">${esc(cmd)}</button>`).join("");
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

  function addThinkingMessage(){
    const box = $("messages");
    if (!box) return null;
    const div = document.createElement("div");
    div.className = "msg ai";
    div.innerHTML = `<span class="thinkingLine"><i></i><i></i><i></i></span> ${esc(activeAgent().thinking)}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  function responsePreview(text){
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return activeAgent().talking;
    return clean.length > 84 ? `${clean.slice(0, 84)}...` : clean;
  }

  function selectAgent(agentKey, userTriggered = true){
    const key = agents[agentKey] ? agentKey : "admin";
    state.activeAgent = key;
    const agent = activeAgent();
    document.documentElement.style.setProperty("--agent-color", agent.color);
    document.querySelectorAll(".agent").forEach((el) => el.classList.toggle("active", el.dataset.agent === key));
    $("agentName").textContent = agent.name;
    $("agentRole").textContent = agent.role;
    $("agentStatus").textContent = agent.status;
    $("agentAvatar")?.style.setProperty("--selected-agent", agent.color);
    setBubble(key, agent.greeting);
    renderCommands();
    const input = $("askInput");
    if (input) input.placeholder = `ถาม ${agent.name}`;
    setAgentVisual(key, "tapped", agent.greeting);
    if (userTriggered || !state.greeted.has(key)) {
      addMessage("ai", `${agent.name}: ${agent.greeting}`, false);
      state.greeted.add(key);
    }
  }

  async function loadSummary(){
    const data = await apiGet("/admin/ai-office/summary");
    setSummary(data.summary || {});
  }

  async function ask(question){
    const q = String(question || $("askInput")?.value || "").trim();
    if (!q || state.loadingAsk) return;
    const agentKey = state.activeAgent;
    const agent = activeAgent();
    state.loadingAsk = true;
    if ($("askInput")) $("askInput").value = "";
    addMessage("user", `${agent.name}: ${q}`, false);
    setAgentVisual(agentKey, "thinking", agent.thinking);
    const pending = addThinkingMessage();
    try {
      const data = await apiPost("/admin/ai-office/ask", {
        agent: agentKey,
        question: q,
        phone: $("phoneInput")?.value || "",
      });
      if (pending) pending.remove();
      const answer = data.answer || "ไม่มีคำตอบ";
      addMessage("ai", answer, true);
      if (data.context?.summary) setSummary(data.context.summary);
      setAgentVisual(agentKey, "talking", responsePreview(answer));
      setTimeout(() => setAgentVisual(agentKey, "idle", agent.status), 3600);
    } catch (e) {
      if (pending) pending.remove();
      const msg = e.message || "AI Office ตอบไม่ได้ในขณะนี้";
      addMessage("ai", msg, false);
      setAgentVisual(agentKey, "talking", msg);
      setTimeout(() => setAgentVisual(agentKey, "idle", agent.status), 3600);
    } finally {
      state.loadingAsk = false;
    }
  }

  async function searchPhone(){
    const phone = String($("phoneInput")?.value || "").trim();
    if (!phone) {
      addMessage("ai", "กรุณาใส่เบอร์ลูกค้าก่อนค้นงาน", false);
      setAgentVisual(state.activeAgent, "talking", "ใส่เบอร์ลูกค้าก่อนนะครับ");
      return;
    }
    const agentKey = state.activeAgent;
    addMessage("user", `ค้นงานจากเบอร์ลูกค้า ${phone}`, false);
    setAgentVisual(agentKey, "thinking", "กำลังค้นใบงานจากเบอร์นี้");
    const pending = addThinkingMessage();
    try {
      const data = await apiGet(`/admin/ai-office/search-by-phone?phone=${encodeURIComponent(phone)}`);
      if (pending) pending.remove();
      const jobs = data.jobs || [];
      if (!jobs.length) {
        addMessage("ai", "ไม่พบงานจากเบอร์นี้ในระบบ", false);
        setAgentVisual(agentKey, "talking", "ไม่พบงานจากเบอร์นี้");
        return;
      }
      const lines = jobs.slice(0, 12).map((j) => {
        const when = j.appointment_datetime ? new Date(j.appointment_datetime).toLocaleString("th-TH") : "-";
        return `${j.booking_code || "#" + j.job_id} • ${j.customer_name || "-"} • ${j.job_type || "-"} • ${when} • ${j.job_status || "-"}`;
      });
      addMessage("ai", lines.join("\n"), true);
      setAgentVisual(agentKey, "talking", `พบ ${money(jobs.length)} งานจากเบอร์นี้`);
      setTimeout(() => setAgentVisual(agentKey, "idle", activeAgent().status), 3000);
    } catch (e) {
      if (pending) pending.remove();
      const msg = e.message || "ค้นงานไม่สำเร็จ";
      addMessage("ai", msg, false);
      setAgentVisual(agentKey, "talking", msg);
    }
  }

  async function refreshAll(options = {}){
    try {
      const board = $("boardText");
      if (board) board.textContent = "กำลังโหลดข้อมูลจริงจากระบบ";
      await loadSummary();
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

  function bind(){
    document.querySelectorAll(".agent").forEach((el) => {
      el.addEventListener("click", () => selectAgent(el.dataset.agent, true));
    });
    $("btnRefresh")?.addEventListener("click", refreshAll);
    $("btnPhone")?.addEventListener("click", searchPhone);
    $("phoneInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") searchPhone(); });
    $("btnAsk")?.addEventListener("click", () => ask());
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
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    selectAgent("admin", false);
    loadConfig().catch((e) => addMessage("ai", e.message || "โหลด AI Office ไม่สำเร็จ", false));
  });
})();
