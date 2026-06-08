(() => {
  "use strict";
  const VERSION = "CWF AI Office Availability Engine + Auto Learning v28 loaded";
  console.info(VERSION);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  function showToast(text) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("show"), 1800);
  }


  const api = async (url, opts = {}) => {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP_${res.status}`);
    return data || {};
  };

  async function loadSharedMemoryContext(payload = {}) {
    try {
      const data = await api("/admin/ai-office/shared-memory/context", {
        method: "POST",
        body: JSON.stringify({
          query: payload.query || "",
          agent_key: payload.agent_key || state.agent || "admin",
          conversation_id: payload.conversation_id || state.selectedConversation?.id || null,
          selected_customer_question: payload.selected_customer_question || state.selectedCustomerQuestion || "",
          limit: payload.limit || 8,
        }),
      });
      return data.context || null;
    } catch (_) {
      return null;
    }
  }

  function formatSharedMemoryForPrompt(context) {
    if (!context || !Array.isArray(context.items) || !context.items.length) return "";
    const lines = context.items.slice(0, 8).map((m, idx) => {
      const source = m.source || "memory";
      const sit = m.situation_type || "general";
      const customer = m.selected_customer_question || m.customer_message || "";
      const reply = m.final_admin_reply || m.ai_reply || "";
      return `${idx + 1}. [${source}/${sit}] ลูกค้า: ${customer}\n   คำตอบ/บทเรียน: ${reply}`;
    });
    return `\nสมองกลาง CWF ที่เกี่ยวข้อง:\n${lines.join("\n")}\n`;
  }

  function logSharedMemoryEvent(eventType, payload = {}) {
    return api("/admin/ai-office/shared-memory/event", {
      method: "POST",
      body: JSON.stringify({
        source: payload.source || "frontend",
        event_type: eventType,
        agent_key: payload.agent_key || state.agent || "admin",
        conversation_id: payload.conversation_id || state.selectedConversation?.id || null,
        selected_customer_question: payload.selected_customer_question || state.selectedCustomerQuestion || "",
        customer_message: payload.customer_message || state.lastCustomerMessage || "",
        ai_reply: payload.ai_reply || "",
        final_admin_reply: payload.final_admin_reply || "",
        action_status: payload.action_status || eventType,
        situation_type: payload.situation_type || "general",
        service_type: payload.service_type || "",
        tags: payload.tags || [],
        metadata: payload.metadata || {},
      }),
    }).catch(() => {});
  }


  function looksLikeAdminCorrection(text) {
    const t = String(text || "").toLowerCase();
    return /(ผิด|ไม่ใช่|อย่าบอก|ห้ามบอก|ยังว่าง|ยังไม่ควร|ควรตอบ|ต้องตอบ|จำไว้|คราวหน้า|งง|มั่ว|โง่|ไม่ตรง|ตอบผิด)/.test(t);
  }

  function correctionSituation(text) {
    const t = String(text || "").toLowerCase();
    if (/(คิว|ว่าง|ช่าง|เวลา|บ่าย|เช้า|เย็น|นัด|เต็ม)/.test(t)) return "availability_logic";
    if (/(ราคา|แพง|ส่วนลด|โปร)/.test(t)) return "sales_reply_logic";
    if (/(ลูกค้า|แชท|ตอบ|line|ไลน์)/.test(t)) return "customer_reply_style";
    return "admin_correction";
  }


  const agentDefs = [
    { key:"admin", name:"Admin AI", role:"หัวหน้าแอดมิน / ใช้ข้อมูลงานจริง", brain:"คิดแบบหัวหน้าแอดมิน CWF: ตอบสั้น ใช้งานจริง ตรวจข้อมูลก่อน ไม่แต่งข้อมูล ไม่ส่งข้อความแทนแอดมิน", x:"26%", y:"60%", size:"66px", d:"78px", avatar:"/assets/ai-office-final/characters-clean/admin/idle.png" },
    { key:"sales", name:"Sales AI", role:"เซลส์ปิดงาน / ราคา / ลูกค้าบอกแพง", brain:"คิดแบบเซลส์มืออาชีพ CWF: ราคา/คุณค่า/ความเชื่อมั่น/ปิดนัด ใช้ภาษาสุภาพ ไม่เวอร์ ไม่กดดันลูกค้า", x:"69%", y:"72%", size:"64px", d:"76px", avatar:"/assets/ai-office-final/characters-clean/sales/idle.png" },
    { key:"ops", name:"Ops AI", role:"คิวงาน / งานวันนี้ / งานค้าง", brain:"คิดแบบหัวหน้าคิวงาน: สรุปงานจริง ตรวจความเสี่ยง คิว เวลา ช่าง งานค้าง งานไม่จ่าย โดยไม่แก้ข้อมูลเอง", x:"51%", y:"50%", size:"70px", d:"82px", avatar:"/assets/ai-office-final/characters-clean/ops/idle.png" },
    { key:"ads", name:"Ads AI", role:"โฆษณา / พื้นที่ / ปิดการขาย", brain:"คิดแบบ performance marketer: วิเคราะห์จากข้อมูลจริง แยกปัญหา lead/call/LINE/landing/ราคา/พื้นที่ พร้อม action ที่แอดมินทำเอง", x:"43%", y:"68%", size:"60px", d:"72px", avatar:"/assets/ai-office-final/characters-clean/ads/idle.png" },
    { key:"content", name:"Content AI", role:"โพสต์ / รีวิว / สคริปต์", brain:"คิดแบบ creative director ของ CWF: คอนเทนต์สั้น น่าเชื่อถือ สะอาด พรีเมียม ไม่โม้เกินจริง พร้อมคัดลอกใช้", x:"45%", y:"86%", size:"59px", d:"70px", avatar:"/assets/ai-office-final/characters-clean/content/idle.png" },
    { key:"dev", name:"Dev AI", role:"Codex prompt / QA / rollback", brain:"คิดแบบ senior production engineer: จำกัด scope, ตรวจ regression, ห้าม rewrite, ห้าม mock/demo, ต้อง rollback ได้", x:"78%", y:"60%", size:"65px", d:"76px", avatar:"/assets/ai-office-final/characters-clean/dev/idle.png" },
  ];

  const state = {
    agent: "admin",
    conversations: [],
    selectedConversation: null,
    selectedMessages: [],
    lastCustomerMessage: "",
    selectedCustomerQuestion: "",
    selectedCustomerMessageId: null,
    lineDraftMemory: JSON.parse(localStorage.getItem("cwfAiOfficeLineDraftMemoryV28") || "{}"),
    lastAgentRetry: null,
    lastLineRetry: null,
    agentHistory: JSON.parse(localStorage.getItem("cwfAiOfficeAgentHistoryV28") || "{}"),
    brainPreviewItems: [],
  };


  function saveLineDraftMemory() {
    try {
      localStorage.setItem("cwfAiOfficeLineDraftMemoryV28", JSON.stringify(state.lineDraftMemory || {}));
    } catch (_) {}
  }

  function draftsForConversation(conversationId) {
    if (!conversationId) return [];
    return Array.isArray(state.lineDraftMemory[String(conversationId)]) ? state.lineDraftMemory[String(conversationId)] : [];
  }

  function addDraftToConversation(conversationId, draft) {
    if (!conversationId || !draft?.customer_reply) return;
    const key = String(conversationId);
    const list = draftsForConversation(key);
    list.push({
      id: `draft_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      customer_reply: String(draft.customer_reply || ""),
      customer_question: String(draft.customer_question || state.selectedCustomerQuestion || state.lastCustomerMessage || ""),
      customer_message_id: String(draft.customer_message_id || state.selectedCustomerMessageId || ""),
      customer_message_received_at: String(draft.customer_message_received_at || ""),
      explicit_selected: Boolean(draft.explicit_selected),
      admin_question: String(draft.admin_question || ""),
      created_at: new Date().toISOString(),
    });
    state.lineDraftMemory[key] = list.slice(-20);
    saveLineDraftMemory();
  }

  function explicitSelectedCustomerQuestion() {
    return clean(state.selectedCustomerQuestion || "");
  }

  function fallbackLatestCustomerQuestion() {
    return clean(state.lastCustomerMessage || "");
  }

  function selectedQuestionForLearning() {
    return clean(explicitSelectedCustomerQuestion() || fallbackLatestCustomerQuestion());
  }

  function latestInboundMessage() {
    return [...(state.selectedMessages || [])].reverse().find((m) => (m.direction || "inbound") === "inbound" && clean(messageText(m)));
  }

  function messageIdFor(m, fallback = "") {
    return String(m?.id || m?.message_id || fallback || "");
  }

  function latestInboundTimeMs() {
    const m = latestInboundMessage();
    const t = messageTimeMs(m);
    return Number.isFinite(t) ? t : 0;
  }

  function messageTimeMs(m) {
    const raw = m?.received_at || m?.created_at || "";
    const t = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  }

  function findCustomerMessageById(id) {
    const sid = String(id || "");
    if (!sid) return null;
    return (state.selectedMessages || []).find((m, idx) => String(messageIdFor(m, `msg_${idx}`)) === sid) || null;
  }

  function excerpt(text, max = 120) {
    const s = clean(text);
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function saveHistory() {
    localStorage.setItem("cwfAiOfficeAgentHistoryV28", JSON.stringify(state.agentHistory));
  }

  function currentAgent() {
    return agentDefs.find((a) => a.key === state.agent) || agentDefs[0];
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, el.classList?.contains("replyText") ? 360 : 118)}px`;
  }

  function renderAgents() {
    const wrap = $("#agents");
    const bar = $("#rolebar");
    if (!wrap || !bar) return;
    wrap.innerHTML = agentDefs.map((a, idx) => `
      <button class="agent ${a.key === state.agent ? "selected" : ""}" data-agent="${a.key}" aria-label="คุยกับ ${esc(a.name)}" style="--x:${a.x};--y:${a.y};--size:${a.size};--d-size:${a.d};--depth:${30+idx}">
        <img class="sprite" src="${a.avatar}" alt="${esc(a.name)}">
        <span class="agentLabel">${esc(a.name)}</span>
      </button>
    `).join("");
    bar.innerHTML = agentDefs.map((a) => `
      <button class="rolechip ${a.key === state.agent ? "active" : ""}" data-agent="${a.key}" aria-label="คุยกับ ${esc(a.name)}">
        <img src="${a.avatar}" alt=""> ${esc(a.name.replace(" AI",""))}
      </button>
    `).join("");
    $$(".agent", wrap).forEach((btn) => btn.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation(); setAgent(btn.dataset.agent, true);
    }));
    $$(".rolechip", bar).forEach((btn) => btn.addEventListener("click", (ev) => {
      ev.preventDefault(); ev.stopPropagation(); setAgent(btn.dataset.agent, true);
    }));
  }

  function setAgent(key, open = false) {
    if (!agentDefs.some((a) => a.key === key)) key = "admin";
    state.agent = key;
    renderAgents();
    if (open) openAgentChat();
  }

  function welcomeFor(agent) {
    const map = {
      admin:"สวัสดีค่ะ ให้ Admin AI ช่วยดูงานวันนี้ งานค้าง หรือร่างข้อความลูกค้าได้เลยค่ะ",
      sales:"สวัสดีค่ะ ให้ Sales AI ช่วยตอบราคา ปิดการขาย หรือตอบลูกค้าบอกแพงได้เลยค่ะ",
      ops:"สวัสดีค่ะ ให้ Ops AI ช่วยดูคิวงาน งานค้าง งานยังไม่จ่าย และความเสี่ยงหน้างานได้เลยค่ะ",
      ads:"สวัสดีค่ะ ให้ Ads AI ช่วยวิเคราะห์แอด พื้นที่ ลูกค้าทักน้อย หรือปิดการขายน้อยได้เลยค่ะ",
      content:"สวัสดีค่ะ ให้ Content AI ช่วยเขียนโพสต์ แคปชัน รีวิว หรือสคริปต์วิดีโอได้เลยค่ะ",
      dev:"สวัสดีค่ะ ให้ Dev AI ช่วยเขียน prompt ส่ง Codex ตรวจบั๊ก และทำ checklist deploy ได้เลยค่ะ",
    };
    return map[agent.key] || "สวัสดีค่ะ ให้ AI ช่วยงานส่วนไหนพิมพ์มาได้เลยค่ะ";
  }

  function renderAgentMessages() {
    const box = $("#agentMessages");
    if (!box) return;
    const a = currentAgent();
    const list = state.agentHistory[a.key] || [];
    const welcome = `<div class="welcomeBubble">${esc(welcomeFor(a))}</div>`;
    box.innerHTML = welcome + list.map((m) => {
      const klass = m.role === "user" ? "user" : (m.loading ? "ai loading" : (m.error ? "error" : "ai"));
      const body = m.loading ? `<span class="typingDots"><i></i><i></i><i></i></span> ${esc(m.text || "กำลังคิดคำตอบ")}` : esc(m.text);
      const retry = m.error ? `<br><button class="whiteBtn retryBtn" type="button" data-retry-agent>ลองอีกครั้ง</button>` : "";
      return `<div class="msg ${klass}">${body}${retry}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }

  function addAgentMessage(role, text, extra = {}) {
    const a = currentAgent();
    const list = state.agentHistory[a.key] || [];
    list.push({ role, text: String(text || ""), at: Date.now(), ...extra });
    state.agentHistory[a.key] = list.slice(-30);
    saveHistory();
    renderAgentMessages();
  }


  async function tryLoadAgentHistoryFromServer(agentKey) {
    try {
      const data = await api(`/admin/ai-office/agent-chat-history?agent_key=${encodeURIComponent(agentKey)}&limit=20`);
      const rows = data.messages || [];
      if (rows.length) {
        state.agentHistory[agentKey] = rows.map((m) => ({
          role: m.message_role === "assistant" ? "ai" : "user",
          text: m.message_text || "",
          at: m.created_at ? new Date(m.created_at).getTime() : Date.now()
        })).slice(-30);
        saveHistory();
      }
    } catch (_) {
      // Optional v21 backend endpoint may not be mounted yet. Local history still works.
    }
  }

  async function persistAgentMessage(role, text, extra = {}) {
    const a = currentAgent();
    // Existing production endpoint already persists events; new v21 endpoint is optional.
    api("/admin/ai-office/reply-learning/event", {
      method: "POST",
      body: JSON.stringify({
        event_type: role === "user" ? "agent_user_question" : "agent_ai_answer",
        agent_key: a.key,
        situation_type: "agent_chat",
        source: "ai_office_agent_chat_v21",
        customer_message: role === "user" ? text : extra.question || "",
        ai_reply: role === "ai" ? text : "",
        metadata: { agent_name: a.name, role: a.role, ...extra.metadata }
      })
    }).catch(() => {});
    api("/admin/ai-office/agent-chat-history", {
      method: "POST",
      body: JSON.stringify({
        agent_key: a.key,
        message_role: role === "ai" ? "assistant" : "user",
        message_text: text,
        source_page: "admin-ai-office",
        metadata: { agent_name: a.name, role: a.role, ...extra.metadata }
      })
    }).catch(() => {});
    logSharedMemoryEvent(role === "ai" ? "agent_ai_answer" : "agent_user_question", {
      source: "agent_chat",
      agent_key: a.key,
      customer_message: role === "user" ? text : (extra.question || ""),
      ai_reply: role === "ai" ? text : "",
      action_status: role === "ai" ? "answered" : "asked",
      metadata: { agent_name: a.name, role: a.role, ...extra.metadata },
    });
  }

  function openAgentChat() {
    const a = currentAgent();
    $("#agentAvatar").src = a.avatar;
    $("#agentName").textContent = a.name;
    $("#agentRole").textContent = a.role;
    $("#agentOverlay").classList.add("open");
    $("#agentOverlay").setAttribute("aria-hidden", "false");
    renderAgentMessages();
    tryLoadAgentHistoryFromServer(a.key).then(renderAgentMessages).finally(() => setTimeout(() => $("#agentQuestion")?.focus(), 160));
  }

  function closeAgentChat() {
    $("#agentOverlay").classList.remove("open");
    $("#agentOverlay").setAttribute("aria-hidden", "true");
  }

  function logAgentChatEvent(eventType, payload = {}) {
    return api("/admin/ai-office/reply-learning/event", {
      method: "POST",
      body: JSON.stringify({
        event_type: eventType,
        agent_key: state.agent || "admin",
        situation_type: "agent_chat",
        source: "ai_office_agent_chat",
        customer_message: payload.question || "",
        ai_reply: payload.answer || "",
        final_admin_reply: payload.final_admin_reply || "",
        metadata: {
          agent: state.agent,
          agent_name: currentAgent().name,
          role: currentAgent().role,
          ...payload.metadata
        }
      })
    }).catch(() => {});
  }

  async function submitAgentQuestion(e, retryText = "") {
    if (e?.preventDefault) e.preventDefault();
    const input = $("#agentQuestion");
    const raw = clean(retryText || input.value);
    if (!raw) return;
    const submitBtn = $("#agentForm .sendBtn");
    if (submitBtn) submitBtn.disabled = true;
    state.lastAgentRetry = raw;
    if (looksLikeAdminCorrection(raw)) {
      logSharedMemoryEvent("admin_correction", {
        source: "agent_chat",
        agent_key: state.agent,
        customer_message: raw,
        final_admin_reply: raw,
        action_status: "correction",
        situation_type: correctionSituation(raw),
        tags: ["auto_learn", "admin_correction"],
        metadata: { auto_detected: true }
      });
    }
    const agentInfo = currentAgent();
    const recent = (state.agentHistory[state.agent] || []).filter((m) => !m.loading).slice(-10).map((m) => `${m.role === "user" ? "แอดมิน" : "AI"}: ${m.text}`).join("\n");
    const sharedMemory = await loadSharedMemoryContext({ query: raw, agent_key: state.agent, limit: 8 });
    const question = [
      `โหมด ${agentInfo.name}`,
      agentInfo.brain || agentInfo.role,
      "ใช้ประวัติสนทนาล่าสุดและสมองกลาง CWF เพื่อเข้าใจบริบทต่อเนื่อง และตอบให้ใช้งานจริงกับ Coldwindflow",
      "ห้ามบอกว่าส่งข้อความแล้ว ห้ามแก้ข้อมูล ห้ามสร้างงาน ห้ามใช้ข้อมูลปลอม",
      recent ? `\nประวัติคุยล่าสุด:\n${recent}` : "",
      formatSharedMemoryForPrompt(sharedMemory),
      `\nคำถามใหม่:\n${raw}`
    ].filter(Boolean).join("\n");
    if (!retryText) {
      input.value = "";
      autoGrow(input);
      addAgentMessage("user", raw);
      persistAgentMessage("user", raw);
    }
    addAgentMessage("ai", "กำลังคิดคำตอบ", { loading: true });
    try {
      const data = await api("/admin/ai-office/ask", {
        method: "POST",
        body: JSON.stringify({ agent: state.agent, question })
      });
      const list = state.agentHistory[state.agent] || [];
      if (list.length && list[list.length - 1].loading) list.pop();
      state.agentHistory[state.agent] = list;
      const answer = data.answer || "ยังไม่ได้คำตอบจาก AI";
      addAgentMessage("ai", answer);
      persistAgentMessage("ai", answer, { question: raw });
    } catch (err) {
      const list = state.agentHistory[state.agent] || [];
      if (list.length && list[list.length - 1].loading) list.pop();
      state.agentHistory[state.agent] = list;
      addAgentMessage("ai", `ยังใช้งาน AI ไม่ได้: ${err.message}`, { error: true });
      persistAgentMessage("ai", `ERROR: ${err.message}`, { question: raw, metadata: { error: err.message } });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function openAgentWithQuestion(agentKey, question) {
    setAgent(agentKey, true);
    setTimeout(() => submitAgentQuestion(null, question), 220);
  }

  async function loadSummary() {
    try {
      const data = await api("/admin/ai-office/summary");
      const s = data.summary || {};
      $("#statToday").textContent = s.today_count ?? "-";
      $("#statTomorrow").textContent = s.tomorrow_count ?? "-";
      $("#statOpen").textContent = s.open_count ?? "-";
      $("#statUnpaid").textContent = s.unpaid_count ?? "-";
      $("#officeStatus").textContent = "โหลดข้อมูลงานจริงแล้ว แตะตัวละคร/แถบล่างเพื่อเปิดแชท AI";
    } catch (err) {
      $("#officeStatus").textContent = `โหลดข้อมูลงานไม่ได้: ${err.message}`;
    }
  }

  function openInbox() {
    $("#inboxOverlay").classList.add("open");
    $("#inboxOverlay").setAttribute("aria-hidden", "false");
    showInboxList();
    loadInbox();
  }

  function handleInboxBack() {
    if ($("#selectedChatView")?.classList.contains("active")) return showInboxList();
    return closeInbox();
  }

  function closeInbox() {
    $("#inboxOverlay").classList.remove("open");
    $("#inboxOverlay").setAttribute("aria-hidden", "true");
  }

  function showInboxList() {
    $("#conversationListView").classList.add("active");
    $("#selectedChatView").classList.remove("active");
    $("#inboxTitle").textContent = "กล่องแชทลูกค้า";
    $("#inboxSub").textContent = "เลือกแชทลูกค้า แล้วถาม AI จากบริบทแชทนั้น";
    state.selectedConversation = null;
    state.selectedMessages = [];
  }

  function showSelectedChat() {
    $("#conversationListView").classList.remove("active");
    $("#selectedChatView").classList.add("active");
  }

  async function loadInbox() {
    const list = $("#conversationList");
    if (!list) return;
    list.innerHTML = `<div class="emptyState">กำลังโหลดแชทลูกค้า...</div>`;
    try {
      const data = await api("/admin/ai-office/line-inbox?limit=80");
      state.conversations = data.conversations || [];
      renderConversationList();
    } catch (err) {
      list.innerHTML = `<div class="emptyState">โหลดแชทลูกค้าไม่ได้: ${esc(err.message)}</div>`;
    }
  }

  function renderConversationList() {
    const q = clean($("#conversationSearch")?.value).toLowerCase();
    const rows = state.conversations.filter((c) => {
      const hay = `${c.display_name || ""} ${c.last_message_text || ""} ${c.message_text_for_admin || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });
    const list = $("#conversationList");
    if (!rows.length) {
      list.innerHTML = `<div class="emptyState">ยังไม่พบแชทลูกค้า</div>`;
      return;
    }
    list.innerHTML = rows.map((c) => `
      <button class="conversationCard" type="button" data-conversation-id="${esc(c.id)}">
        <b>${c.unread ? '<span class="dot"></span>' : ""}${esc(c.display_name || c.line_user_id_masked || "ลูกค้า LINE")}</b>
        <p>${esc(c.message_text_for_admin || c.last_message_text || "-")}</p>
        <span class="meta"><span>${esc(c.detected_intent || c.conversation_status || "chat")}</span><span>${esc(c.last_message_at_display || "")}</span></span>
      </button>
    `).join("");
  }

  async function selectConversation(id) {
    const conversationId = Number(id || 0);
    if (!conversationId) return;
    showSelectedChat();
    $("#lineMessages").innerHTML = `<div class="emptyState">กำลังโหลดข้อความ...</div>`;
    try {
      const data = await api(`/admin/ai-office/line-conversations/${conversationId}/messages?limit=80`);
      state.selectedConversation = data.conversation || state.conversations.find((c) => Number(c.id) === conversationId) || { id: conversationId };
      state.selectedMessages = data.messages || [];
      const selectedNameEl = $("#selectedCustomerName");
      const selectedMetaEl = $("#selectedCustomerMeta");
      if (selectedNameEl) selectedNameEl.textContent = state.selectedConversation.display_name || "ลูกค้า LINE";
      if (selectedMetaEl) selectedMetaEl.textContent = `${data.thread_context?.status || "แชทลูกค้า LINE OA"} · ${state.selectedConversation.last_message_at_display || ""}`;
      $("#inboxTitle").textContent = state.selectedConversation.display_name || "แชทลูกค้า";
      $("#inboxSub").textContent = "ถาม AI จากบริบทลูกค้าคนนี้เท่านั้น";
      renderLineMessages();
      setTimeout(() => $("#lineAiQuestion")?.focus(), 120);
    } catch (err) {
      $("#lineMessages").innerHTML = `<div class="emptyState">โหลดข้อความไม่ได้: ${esc(err.message)}</div>`;
    }
  }

  function messageText(m) {
    return m.message_text_for_admin || m.message_text || "";
  }

  function renderLineMessages() {
    const box = $("#lineMessages");
    const messages = state.selectedMessages || [];
    if (!messages.length) {
      box.innerHTML = `<div class="emptyState">ยังไม่มีข้อความในแชทนี้</div>`;
      renderPersistedDrafts();
      return;
    }
    let latestInbound = "";
    box.innerHTML = messages.map((m, idx) => {
      const inbound = (m.direction || "inbound") === "inbound";
      const text = messageText(m);
      const messageId = m.id || m.message_id || `msg_${idx}`;
      if (inbound && clean(text)) latestInbound = clean(text);
      const klass = inbound ? "customer" : "admin";
      const time = m.received_at_display || "";
      return `<div class="lineBubble ${klass}" ${inbound ? `data-customer-message-id="${esc(messageId)}" data-customer-question="${esc(text)}"` : ""}>${esc(text)}${time ? `<div style="margin-top:8px;color:#7a879a;font-size:12px;font-weight:800">${esc(time)}</div>` : ""}</div>`;
    }).join("");
    $$(".lineBubble.customer", box).forEach(bindLongPressQuestion);
    state.lastCustomerMessage = latestInbound;
    clearSelectedQuestion(false);
    renderPersistedDrafts();
    box.scrollTop = box.scrollHeight;
  }

  function renderPersistedDrafts() {
    const box = $("#lineMessages");
    const convId = state.selectedConversation?.id;
    const drafts = draftsForConversation(convId);
    if (!box || !drafts.length) return;
    drafts.forEach((draft) => {
      renderAiBubble({
        customer_reply: draft.customer_reply,
        customer_question: draft.customer_question,
        customer_message_id: draft.customer_message_id,
        customer_message_received_at: draft.customer_message_received_at,
        explicit_selected: draft.explicit_selected,
        created_at: draft.created_at,
        persisted: true,
        skip_persist: true,
      });
    });
  }


  function setSelectedQuestion(text, id = "") {
    const question = clean(text);
    if (!question) return;
    state.selectedCustomerQuestion = question;
    state.selectedCustomerMessageId = id || null;
    $$(".lineBubble.customer").forEach((el) => {
      el.classList.toggle("selectedQuestion", String(el.dataset.customerMessageId || "") === String(id || ""));
    });
    const bar = $("#selectedQuestionBar");
    const label = $("#selectedQuestionText");
    if (label) label.textContent = `เลือกคำถาม: ${question}`;
    if (bar) bar.classList.add("show");
    showToast("เลือกคำถามลูกค้าแล้ว");
  }

  function clearSelectedQuestion(updateUi = true) {
    state.selectedCustomerQuestion = "";
    state.selectedCustomerMessageId = null;
    if (updateUi) {
      $$(".lineBubble.customer").forEach((el) => el.classList.remove("selectedQuestion"));
      $("#selectedQuestionBar")?.classList.remove("show");
    }
  }

  function bindLongPressQuestion(el) {
    let timer = null;
    const start = (ev) => {
      timer = setTimeout(() => {
        setSelectedQuestion(el.dataset.customerQuestion || el.textContent || "", el.dataset.customerMessageId || "");
      }, 430);
    };
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    el.addEventListener("pointerdown", start);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      setSelectedQuestion(el.dataset.customerQuestion || el.textContent || "", el.dataset.customerMessageId || "");
    });
    el.addEventListener("dblclick", () => setSelectedQuestion(el.dataset.customerQuestion || el.textContent || "", el.dataset.customerMessageId || ""));
  }

  function removeLatestLoadingBubble() {
    const bubbles = $$(".lineBubble.ai");
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (bubbles[i].textContent.includes("AI กำลังร่างข้อความ")) {
        bubbles[i].remove();
        return;
      }
    }
  }

  function renderAiBubble(draft) {
    const reply = clean(draft?.customer_reply || draft?.answer || "");
    const text = reply || "ยังไม่ได้ข้อความพร้อมส่งลูกค้า";
    const explicitSelected = Object.prototype.hasOwnProperty.call(draft || {}, "explicit_selected")
      ? Boolean(draft.explicit_selected)
      : Boolean(explicitSelectedCustomerQuestion());
    const sourceQuestion = clean(draft?.customer_question || (explicitSelected ? explicitSelectedCustomerQuestion() : fallbackLatestCustomerQuestion()));
    const latestInbound = latestInboundMessage();
    const sourceMessageId = String(draft?.customer_message_id || (explicitSelected ? state.selectedCustomerMessageId : messageIdFor(latestInbound)) || "");
    const sourceMsg = findCustomerMessageById(sourceMessageId) || (!explicitSelected ? latestInbound : null);
    const sourceReceivedAt = String(draft?.customer_message_received_at || sourceMsg?.received_at || sourceMsg?.created_at || "");
    const sourceLabel = explicitSelected && sourceQuestion ? `ตอบจาก:\n“${excerpt(sourceQuestion)}”` : "ตอบจากข้อความล่าสุด";
    const persisted = Boolean(draft?.persisted);
    const draftTime = draft?.created_at ? new Date(draft.created_at).getTime() : Date.now();
    const sourceTime = sourceReceivedAt ? new Date(sourceReceivedAt).getTime() : 0;
    const latestTime = latestInboundTimeMs();
    const hasNewerInbound = Boolean(latestTime && ((sourceTime && latestTime > sourceTime) || latestTime > draftTime));
    if (!draft?.skip_persist && state.selectedConversation?.id && reply) {
      addDraftToConversation(state.selectedConversation.id, {
        customer_reply: reply,
        customer_question: sourceQuestion,
        customer_message_id: sourceMessageId,
        customer_message_received_at: sourceReceivedAt,
        explicit_selected: explicitSelected,
        admin_question: draft?.admin_question || state.lastLineRetry || "",
      });
    }
    $("#lineMessages").insertAdjacentHTML("beforeend", `
      <div class="lineBubble ai ${persisted ? "persisted" : ""}">
        <article class="aiNaturalBubble">
          <div class="aiNaturalTop">
            <span class="aiNaturalLabel">AI แนะนำ</span>
            ${explicitSelected ? `<span class="aiNaturalSource">ตอบจากคำถามที่เลือก</span>` : `<span class="aiNaturalSource">ตอบจากข้อความล่าสุด</span>`}
          </div>
          <div class="aiDraftSource" data-source-message-id="${esc(sourceMessageId)}">
            <span>${esc(sourceLabel)}</span>
            ${sourceMessageId ? `<button class="miniJumpBtn" type="button" data-jump-source-message="${esc(sourceMessageId)}" aria-label="ไปที่ข้อความลูกค้า" title="ไปที่ข้อความลูกค้า">↩</button>` : ""}
          </div>
          ${hasNewerInbound ? `<div class="newCustomerContextBar">มีข้อความลูกค้าใหม่ <button type="button" data-use-latest-customer>ใช้ข้อความล่าสุด</button><button type="button" data-pick-customer-message>เลือกเอง</button></div>` : ""}
          <div class="replyDisplay" data-reply-display>${esc(text)}</div>
          <textarea class="replyText" data-reply-text data-source-question="${esc(sourceQuestion)}" data-source-message-id="${esc(sourceMessageId)}" data-explicit-selected="${explicitSelected ? "1" : "0"}">${esc(text)}</textarea>
          <div class="aiNaturalActions" aria-label="จัดการคำตอบ AI">
            <button class="iconBtn editIcon" type="button" data-edit-reply aria-label="แก้ไขข้อความ" title="แก้ไขข้อความ">✎</button>
            <button class="iconBtn copyIcon" type="button" data-copy-reply aria-label="คัดลอกข้อความนี้" title="คัดลอกข้อความนี้">⧉</button>
            <button class="iconBtn likeIcon" type="button" data-save-from-reply aria-label="บันทึกเป็นตัวอย่างคำตอบ" title="บันทึกเป็นตัวอย่างคำตอบ">👍</button>
            <button class="iconBtn dislikeIcon" type="button" data-dislike-reply aria-label="ไม่ใช้คำตอบนี้" title="ไม่ใช้คำตอบนี้">👎</button>
          </div>
        </article>
      </div>
    `);
    const bubble = $("#lineMessages .lineBubble.ai:last-child");
    const ta = bubble?.querySelector("[data-reply-text]");
    if (ta) autoGrow(ta);
    const box = $("#lineMessages");
    box.scrollTop = box.scrollHeight;
  }

  async function submitLineQuestion(e) {
    e.preventDefault();
    const conv = state.selectedConversation;
    const input = $("#lineAiQuestion");
    const question = clean(input.value);
    if (!conv?.id || !question) return;
    const explicitQuestion = explicitSelectedCustomerQuestion();
    const sourceQuestion = explicitQuestion || fallbackLatestCustomerQuestion();
    const sourceMessage = explicitQuestion ? findCustomerMessageById(state.selectedCustomerMessageId) : latestInboundMessage();
    const sourceMessageId = explicitQuestion ? (state.selectedCustomerMessageId || "") : messageIdFor(sourceMessage);
    const sourceReceivedAt = String(sourceMessage?.received_at || sourceMessage?.created_at || "");
    state.lastLineRetry = question;
    const submitBtn = $("#lineAiForm .sendBtn");
    if (submitBtn) submitBtn.disabled = true;
    input.value = "";
    autoGrow(input);
    $("#lineMessages").insertAdjacentHTML("beforeend", `<div class="lineBubble ai"><div class="bubbleTitle">AI กำลังร่างข้อความ...</div></div>`);
    const box = $("#lineMessages");
    box.scrollTop = box.scrollHeight;
    try {
      const data = await api("/admin/ai-office/line-draft-reply", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conv.id,
          admin_question: question,
          selected_customer_question: explicitQuestion ? sourceQuestion : "",
          prior_drafts: draftsForConversation(conv.id).slice(-6),
          use_shared_memory: true,
          instruction: explicitQuestion ? `${question}\n\nต้องตอบเฉพาะคำถามลูกค้าที่แอดมินเลือกนี้เป็นหลัก: ${sourceQuestion}` : question,
          agent: state.agent === "sales" ? "sales" : "admin"
        })
      });
      removeLatestLoadingBubble();
      renderAiBubble({
        ...(data.draft || { customer_reply: data.answer }),
        customer_question: sourceQuestion,
        customer_message_id: sourceMessageId,
        customer_message_received_at: sourceReceivedAt,
        explicit_selected: Boolean(explicitQuestion),
        admin_question: question
      });
      logSharedMemoryEvent("line_drafted", {
        source: "line_chat",
        conversation_id: conv.id,
        selected_customer_question: explicitQuestion ? sourceQuestion : "",
        customer_message: sourceQuestion,
        ai_reply: (data.draft?.customer_reply || data.answer || ""),
        action_status: "drafted",
        situation_type: data.draft?.situation_type || "general",
        metadata: { saved_draft_id: data.draft?.saved_draft_id || null }
      });
    } catch (err) {
      removeLatestLoadingBubble();
      renderAiBubble({ customer_reply: `ขออภัยค่ะ ตอนนี้ระบบ AI ยังร่างคำตอบไม่ได้ (${err.message})` });
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function getReplyTextFromBubble(bubble) {
    const ta = bubble?.querySelector("[data-reply-text]");
    const display = bubble?.querySelector("[data-reply-display]");
    return clean(ta?.value || display?.textContent || "");
  }

  function syncReplyDisplay(bubble) {
    const ta = bubble?.querySelector("[data-reply-text]");
    const display = bubble?.querySelector("[data-reply-display]");
    if (ta && display) display.textContent = ta.value || "";
  }

  function toggleEditReply(button) {
    const card = button.closest(".aiNaturalBubble");
    if (!card) return;
    const entering = !card.classList.contains("editing");
    card.classList.toggle("editing", entering);
    const ta = card.querySelector("[data-reply-text]");
    if (entering) {
      button.textContent = "✓";
      setTimeout(() => ta?.focus(), 60);
      autoGrow(ta);
    } else {
      syncReplyDisplay(card);
      button.textContent = "✎";
    }
  }

  function jumpToCustomerMessage(id) {
    const target = $(`.lineBubble.customer[data-customer-message-id="${CSS.escape(String(id || ""))}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("jumpHighlight");
    setTimeout(() => target.classList.remove("jumpHighlight"), 1400);
  }

  function useLatestCustomerMessage() {
    const latest = latestInboundMessage();
    if (!latest) return;
    setSelectedQuestion(messageText(latest), messageIdFor(latest));
  }

  function pickCustomerMessage() {
    clearSelectedQuestion(true);
    showToast("เลือกข้อความลูกค้าด้วยการกดค้างหรือดับเบิลคลิก");
  }

  async function copyReply(button) {
    const bubble = button.closest(".lineBubble.ai");
    const text = getReplyTextFromBubble(bubble);
    if (!clean(text)) return;
    syncReplyDisplay(bubble);
    await navigator.clipboard.writeText(text);
    button.textContent = "✓";
    showToast("คัดลอกแล้ว นำไปวางใน LINE OA ได้เลย");
    setTimeout(() => { button.textContent = "⧉"; }, 1200);
    api("/admin/ai-office/reply-learning/event", {
      method: "POST",
      body: JSON.stringify({
        event_type: "copied",
        conversation_id: state.selectedConversation?.id || null,
        agent_key: state.agent || "admin",
        situation_type: "general",
        customer_message: bubble?.querySelector("[data-reply-text]")?.dataset?.sourceQuestion || selectedQuestionForLearning(),
        final_admin_reply: text,
        source: "customer_chat_copy"
      })
    }).catch(() => {});
    logSharedMemoryEvent("copied", {
      source: "line_chat",
      selected_customer_question: bubble?.querySelector("[data-reply-text]")?.dataset?.sourceQuestion || selectedQuestionForLearning(),
      final_admin_reply: text,
      action_status: "copied",
    });
  }

  function dislikeReply(button) {
    const bubble = button.closest(".lineBubble.ai");
    const text = getReplyTextFromBubble(bubble);
    bubble?.classList.add("not-used");
    bubble?.querySelector(".aiNaturalBubble")?.classList.add("not-used");
    button.textContent = "✓";
    showToast("บันทึกว่าไม่ใช้คำตอบนี้แล้ว");
    api("/admin/ai-office/reply-learning/event", {
      method: "POST",
      body: JSON.stringify({
        event_type: "disliked",
        conversation_id: state.selectedConversation?.id || null,
        agent_key: state.agent || "admin",
        situation_type: "general",
        customer_message: bubble?.querySelector("[data-reply-text]")?.dataset?.sourceQuestion || selectedQuestionForLearning(),
        ai_reply: text,
        final_admin_reply: "",
        source: "customer_chat_dislike"
      })
    }).catch(() => {});
    logSharedMemoryEvent("disliked", {
      source: "line_chat",
      selected_customer_question: bubble?.querySelector("[data-reply-text]")?.dataset?.sourceQuestion || selectedQuestionForLearning(),
      ai_reply: text,
      action_status: "disliked",
    });
  }

  function openMemoryPanel(prefill = {}) {
    $("#memoryPanel").classList.add("open");
    $("#memoryPanel").setAttribute("aria-hidden", "false");
    if (prefill.customer_message !== undefined) $("#memCustomer").value = prefill.customer_message || "";
    if (prefill.final_admin_reply !== undefined) $("#memReply").value = prefill.final_admin_reply || "";
    if (prefill.situation_type) $("#memSituation").value = prefill.situation_type;
    if (prefill.language) $("#memLanguage").value = prefill.language;
    loadMemoryExamples();
    loadBrainItems();
  }

  function closeMemoryPanel() {
    $("#memoryPanel").classList.remove("open");
    $("#memoryPanel").setAttribute("aria-hidden", "true");
  }

  function prefillMemoryFromChat(replyText = "") {
    openMemoryPanel({
      customer_message: selectedQuestionForLearning() || "",
      final_admin_reply: replyText || "",
      situation_type: "general",
      language: "th"
    });
  }

  async function saveMemoryExample(e) {
    e.preventDefault();
    const payload = {
      agent_key: state.agent || "admin",
      situation_type: $("#memSituation").value || "general",
      customer_message: $("#memCustomer").value,
      final_admin_reply: $("#memReply").value,
      language: $("#memLanguage").value || "th",
      service_type: $("#memService").value,
      tags: $("#memTags").value,
      conversation_id: state.selectedConversation?.id || null
    };
    if (!clean(payload.customer_message) || !clean(payload.final_admin_reply)) return alert("กรุณาใส่ข้อความลูกค้าและคำตอบแอดมิน");
    try {
      await api("/admin/ai-office/reply-examples", { method:"POST", body:JSON.stringify(payload) });
      $("#memReply").value = "";
      await loadMemoryExamples();
      logSharedMemoryEvent("saved_reply_example", {
        source: "reply_example",
        selected_customer_question: payload.customer_message,
        customer_message: payload.customer_message,
        final_admin_reply: payload.final_admin_reply,
        action_status: "saved",
        situation_type: payload.situation_type,
        service_type: payload.service_type,
        tags: payload.tags,
      });
      alert("บันทึกเข้าสมองเสริมแล้ว");
    } catch (err) {
      alert(`บันทึกไม่ได้: ${err.message}`);
    }
  }

  async function loadMemoryExamples() {
    const list = $("#memoryList");
    if (!list) return;
    list.innerHTML = `<div class="emptyState">กำลังโหลดคลังคำตอบ...</div>`;
    try {
      const data = await api("/admin/ai-office/reply-examples?limit=80&active_only=true");
      const examples = data.examples || [];
      if (!examples.length) {
        list.innerHTML = `<div class="emptyState">ยังไม่มีคำตอบแอดมินในสมองเสริม</div>`;
        return;
      }
      list.innerHTML = examples.map((ex) => `
        <article class="memoryItem" data-example-id="${esc(ex.id)}">
          <b>${esc(ex.situation_type || "general")} · ${esc(ex.language || "th")}</b>
          <p><strong>ลูกค้า:</strong> ${esc(ex.customer_message || "")}</p>
          <p><strong>แอดมิน:</strong> ${esc(ex.final_admin_reply || ex.admin_reply || "")}</p>
          <div class="bubbleActions"><button class="dangerBtn" type="button" data-disable-example="${esc(ex.id)}">ปิดใช้งาน</button></div>
        </article>
      `).join("");
    } catch (err) {
      list.innerHTML = `<div class="emptyState">โหลดคลังคำตอบไม่ได้: ${esc(err.message)}</div>`;
    }
  }

  async function disableExample(id) {
    if (!id || !confirm("ปิดใช้งานคำตอบนี้ใช่ไหม")) return;
    try {
      await api(`/admin/ai-office/reply-examples/${id}/disable`, { method:"PATCH", body:"{}" });
      await loadMemoryExamples();
    } catch (err) {
      alert(`ปิดใช้งานไม่ได้: ${err.message}`);
    }
  }


  function renderBrainPreview(data = {}) {
    const box = $("#brainPreview");
    const warnings = $("#brainWarnings");
    state.brainPreviewItems = data.preview_items || [];
    if ($("#brainCommit")) $("#brainCommit").disabled = !state.brainPreviewItems.length;
    if (warnings) {
      const warn = data.warnings || [];
      warnings.innerHTML = warn.length ? `<div class="memoryItem"><b>Warnings</b><p>${esc(warn.join("\n"))}</p></div>` : "";
    }
    if (!box) return;
    if (!state.brainPreviewItems.length) {
      box.innerHTML = `<div class="emptyState">No valid brain items to import</div>`;
      return;
    }
    box.innerHTML = state.brainPreviewItems.slice(0, 20).map((item) => `
      <article class="memoryItem">
        <b>${esc(item.item_type)} · ${esc(item.agent_key || "all")} · ${esc(item.intent || "general")}</b>
        <p><strong>${esc(item.title || "(no title)")}</strong></p>
        <p>${esc(item.content || "")}</p>
        ${item.warnings?.length ? `<p><strong>Warnings:</strong> ${esc(item.warnings.join(", "))}</p>` : ""}
      </article>
    `).join("");
  }

  async function previewBrainImport(e) {
    e.preventDefault();
    const file = $("#brainFile")?.files?.[0];
    if (!file) return alert("Please choose a JSON, JSONL, or CSV brain file");
    const form = new FormData();
    form.append("file", file);
    form.append("source", $("#brainSource")?.value || "manual_import");
    try {
      const res = await fetch("/admin/ai-office/brain/import-preview", { method:"POST", body:form });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "IMPORT_PREVIEW_FAILED");
      renderBrainPreview(data);
      showToast(`Preview ${data.valid_count || 0} valid / ${data.invalid_count || 0} rejected`);
    } catch (err) {
      alert(`Preview failed: ${err.message}`);
    }
  }

  async function commitBrainImport() {
    if (!state.brainPreviewItems.length) return;
    try {
      const data = await api("/admin/ai-office/brain/import-commit", {
        method:"POST",
        body:JSON.stringify({
          mode: $("#brainCommitMode")?.value || "append",
          source: $("#brainSource")?.value || "manual_import",
          items: state.brainPreviewItems,
        })
      });
      renderBrainPreview({ preview_items: [], warnings: [] });
      await loadBrainItems();
      showToast(`Imported ${data.saved_count || 0} brain items`);
    } catch (err) {
      alert(`Commit failed: ${err.message}`);
    }
  }

  function exportBrain() {
    window.location.href = "/admin/ai-office/brain/export?format=json";
  }

  async function loadBrainItems(e) {
    if (e?.preventDefault) e.preventDefault();
    const box = $("#brainList");
    if (!box) return;
    box.innerHTML = `<div class="emptyState">Loading AI brain...</div>`;
    const qs = new URLSearchParams();
    const q = clean($("#brainSearch")?.value || "");
    const itemType = $("#brainTypeFilter")?.value || "";
    const agentKey = $("#brainAgentFilter")?.value || "";
    if (q) qs.set("q", q);
    if (itemType) qs.set("item_type", itemType);
    if (agentKey) qs.set("agent_key", agentKey);
    qs.set("active", "true");
    try {
      const data = await api(`/admin/ai-office/brain/items?${qs.toString()}`);
      const items = data.items || [];
      if (!items.length) {
        box.innerHTML = `<div class="emptyState">No active AI brain items found</div>`;
        return;
      }
      box.innerHTML = items.map((item) => `
        <article class="memoryItem" data-brain-id="${esc(item.id)}">
          <b>${esc(item.item_type)} · ${esc(item.agent_key || "all")} · P${esc(item.priority || "")}</b>
          <p><strong>${esc(item.title || "(no title)")}</strong></p>
          <p>${esc(item.content || "")}</p>
          <div class="bubbleActions"><button class="dangerBtn" type="button" data-disable-brain="${esc(item.id)}">Disable</button></div>
        </article>
      `).join("");
    } catch (err) {
      box.innerHTML = `<div class="emptyState">Load failed: ${esc(err.message)}</div>`;
    }
  }

  async function disableBrainItem(id) {
    if (!id) return;
    try {
      await api(`/admin/ai-office/brain/items/${id}/disable`, { method:"PATCH", body:"{}" });
      await loadBrainItems();
      showToast("Brain item disabled");
    } catch (err) {
      alert(`Disable failed: ${err.message}`);
    }
  }

  function handleComposerKeydown(formSelector) {
    return (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const form = e.target.closest(formSelector);
        form?.requestSubmit();
      }
    };
  }

  function bind() {
    document.addEventListener("click", (e) => {
      const quick = e.target.closest("[data-quick-agent]");
      if (quick) return openAgentWithQuestion(quick.dataset.quickAgent, quick.dataset.quickQuestion || "");
      if (e.target.closest("[data-clear-selected-question]")) return clearSelectedQuestion(true);
      if (e.target.closest("[data-open-inbox]")) return openInbox();
      if (e.target.closest("[data-close-agent]")) return closeAgentChat();
      if (e.target.closest("[data-close-inbox]")) return closeInbox();
      if (e.target.closest("[data-inbox-back]")) return handleInboxBack();
      if (e.target.closest("[data-retry-agent]")) return submitAgentQuestion(null, state.lastAgentRetry || "");
      if (e.target.closest("[data-back-list]")) return showInboxList();
      if (e.target.closest("[data-open-memory]")) return openMemoryPanel();
      if (e.target.closest("[data-disable-brain]")) return disableBrainItem(e.target.closest("[data-disable-brain]").dataset.disableBrain);
      if (e.target.closest("[data-prefill-memory]")) return prefillMemoryFromChat();
      if (e.target.closest("[data-edit-reply]")) return toggleEditReply(e.target.closest("[data-edit-reply]"));
      if (e.target.closest("[data-jump-source-message]")) return jumpToCustomerMessage(e.target.closest("[data-jump-source-message]").dataset.jumpSourceMessage);
      if (e.target.closest("[data-use-latest-customer]")) return useLatestCustomerMessage();
      if (e.target.closest("[data-pick-customer-message]")) return pickCustomerMessage();
      if (e.target.closest("[data-selected-question-add-reply]")) return prefillMemoryFromChat("");
      if (e.target.closest("[data-copy-reply]")) return copyReply(e.target.closest("[data-copy-reply]"));
      if (e.target.closest("[data-dislike-reply]")) return dislikeReply(e.target.closest("[data-dislike-reply]"));
      if (e.target.closest("[data-save-from-reply]")) {
        const bubble = e.target.closest(".lineBubble.ai");
        const ta = bubble?.querySelector("[data-reply-text]");
        const source = ta?.dataset?.sourceQuestion || "";
        if (source) state.selectedCustomerQuestion = source;
        return prefillMemoryFromChat(getReplyTextFromBubble(bubble));
      }
      const conv = e.target.closest("[data-conversation-id]");
      if (conv) return selectConversation(conv.dataset.conversationId);
      const dis = e.target.closest("[data-disable-example]");
      if (dis) return disableExample(dis.dataset.disableExample);
    });
    $("#reloadBtn")?.addEventListener("click", () => { loadSummary(); loadInbox(); });
    $("#lineRefresh")?.addEventListener("click", loadInbox);
    $("#conversationSearch")?.addEventListener("input", renderConversationList);
    $("#agentForm")?.addEventListener("submit", submitAgentQuestion);
    $("#agentQuestion")?.addEventListener("keydown", handleComposerKeydown("#agentForm"));
    $("#lineAiForm")?.addEventListener("submit", submitLineQuestion);
    $("#lineAiQuestion")?.addEventListener("keydown", handleComposerKeydown("#lineAiForm"));
    $("#memoryForm")?.addEventListener("submit", saveMemoryExample);
    $("#memoryClose")?.addEventListener("click", closeMemoryPanel);
    $("#memoryReload")?.addEventListener("click", loadMemoryExamples);
    $("#brainImportForm")?.addEventListener("submit", previewBrainImport);
    $("#brainCommit")?.addEventListener("click", commitBrainImport);
    $("#brainExport")?.addEventListener("click", exportBrain);
    $("#brainSearchForm")?.addEventListener("submit", loadBrainItems);
    $$("textarea").forEach((ta) => ta.addEventListener("input", () => autoGrow(ta)));
  }

  function handleViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    document.documentElement.style.setProperty("--vvh", `${vv.height}px`);
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAgents();
    bind();
    loadSummary();
    handleViewport();
    window.visualViewport?.addEventListener("resize", handleViewport);
  });
})();
