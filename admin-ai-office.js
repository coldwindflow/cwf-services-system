(() => {
  "use strict";
  const VERSION = "CWF AI Office Department Workspace v22 loaded";
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
    { key:"admin", code:"AD", name:"Admin Office", role:"แอดมิน / สรุปงาน / งานยังไม่จ่าย", brain:"คิดแบบหัวหน้าแอดมิน CWF: ตอบสั้น ใช้งานจริง ตรวจข้อมูลก่อน ไม่แต่งข้อมูล ไม่ส่งข้อความแทนแอดมิน" },
    { key:"sales", code:"SA", name:"Sales Reply", role:"เซลส์ปิดงาน / ราคา / ลูกค้าบอกแพง", brain:"คิดแบบเซลส์มืออาชีพ CWF: ราคา/คุณค่า/ความเชื่อมั่น/ปิดนัด ใช้ภาษาสุภาพ ไม่เวอร์ ไม่กดดันลูกค้า" },
    { key:"ops", code:"OP", name:"Ops & Queue", role:"คิวงาน / งานวันนี้ / งานค้าง", brain:"คิดแบบหัวหน้าคิวงาน: สรุปงานจริง ตรวจความเสี่ยง คิว เวลา ช่าง งานค้าง งานไม่จ่าย โดยไม่แก้ข้อมูลเอง" },
    { key:"ads", code:"MK", name:"Ads Analyst", role:"โฆษณา / พื้นที่ / ปิดการขาย", brain:"คิดแบบ performance marketer: วิเคราะห์จากข้อมูลจริง แยกปัญหา lead/call/LINE/landing/ราคา/พื้นที่ พร้อม action ที่แอดมินทำเอง" },
    { key:"content", code:"CT", name:"Content Studio", role:"โพสต์ / รีวิว / สคริปต์", brain:"คิดแบบ creative director ของ CWF: คอนเทนต์สั้น น่าเชื่อถือ สะอาด พรีเมียม ไม่โม้เกินจริง พร้อมคัดลอกใช้" },
    { key:"dev", code:"QA", name:"Dev / QA", role:"Codex prompt / QA / rollback", brain:"คิดแบบ senior production engineer: จำกัด scope, ตรวจ regression, ห้าม rewrite, ห้าม mock/demo, ต้อง rollback ได้" },
  ];


  const workspacePrompts = {
    admin: [
      ["งานยังไม่จ่าย", "สรุปงานที่ยังไม่จ่าย แยกตามลูกค้า ยอดเงิน และสิ่งที่ควรตามต่อแบบแอดมินใช้จริง"],
      ["สรุปภาพรวมวันนี้", "สรุปภาพรวมงานวันนี้ งานค้าง ความเสี่ยง และสิ่งที่แอดมินควรทำก่อน"],
      ["ค้นงานจากเบอร์", "ช่วยวางขั้นตอนค้นงานจากเบอร์ลูกค้า และข้อมูลที่ควรตรวจในระบบ CWF"]
    ],
    ops: [
      ["งานวันนี้", "วันนี้มีงานอะไรบ้าง สรุปคิว เวลา ลูกค้า ช่าง สถานะ และจุดที่ต้องระวัง"],
      ["งานพรุ่งนี้", "พรุ่งนี้มีงานอะไรบ้าง สรุปคิวและสิ่งที่ต้องเตรียมก่อนแจ้งช่าง"],
      ["งานยังไม่ปิด", "งานไหนยังไม่ปิด สรุปตามความเร่งด่วนและความเสี่ยง"]
    ],
    sales: [
      ["ตอบราคา", "ร่างคำตอบลูกค้าถามราคา ใช้ราคาโปร CWF ปัจจุบัน สุภาพ พร้อมคัดลอก"],
      ["ลูกค้าบอกแพง", "ช่วยตอบลูกค้าบอกแพงแบบเซลมืออาชีพ เน้นคุณค่า ความชัดเจน และปิดนัดอย่างสุภาพ"],
      ["ปิดนัด", "ร่างข้อความปิดนัดลูกค้า ขอข้อมูลที่จำเป็น โดยไม่ยืนยันคิวแทนแอดมิน"]
    ],
    ads: [
      ["วิเคราะห์ปิดขายน้อย", "วิเคราะห์ว่าปิดการขายน้อยเพราะอะไร แยก lead โทร LINE ราคา พื้นที่ landing และแนะนำ action"],
      ["ไอเดียแอด", "คิดมุมโฆษณา CWF สำหรับล้างแอร์/ซ่อมแอร์ แบบสุภาพน่าเชื่อถือ"],
      ["พื้นที่ยิงแอด", "ช่วยวางแผนพื้นที่ยิงแอด CWF ตามโซนหลักและบริการที่ควรดัน"]
    ],
    content: [
      ["เขียนโพสต์", "ช่วยเขียนโพสต์โปรล้างแอร์ Coldwindflow ภาษาไทย สั้น น่าเชื่อถือ พร้อมใช้"],
      ["รีวิวลูกค้า", "ช่วยปรับข้อความรีวิว/ตอบรีวิวให้สุภาพ มืออาชีพ และดูเป็นธรรมชาติ"],
      ["สคริปต์วิดีโอ", "ช่วยคิดสคริปต์วิดีโอสั้นสำหรับงานล้างแอร์/ซ่อมแอร์ของ CWF"]
    ],
    dev: [
      ["Prompt Codex", "ช่วยเขียน prompt ส่ง Codex แบบจำกัด scope มี definition of done checklist regression และ rollback"],
      ["ตรวจก่อน deploy", "ช่วยทำ checklist ตรวจ deploy AI Office และผลกระทบต่อระบบ CWF เดิม"],
      ["สรุปงานรอบนี้", "ช่วยสรุป change log และสิ่งที่ห้ามแตะในการพัฒนา AI Office รอบนี้"]
    ]
  };

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
      admin_question: String(draft.admin_question || ""),
      created_at: new Date().toISOString(),
    });
    state.lineDraftMemory[key] = list.slice(-20);
    saveLineDraftMemory();
  }

  function selectedQuestionForLearning() {
    return clean(state.selectedCustomerQuestion || state.lastCustomerMessage || "");
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
    const cards = $$('[data-agent-card]');
    cards.forEach((card) => card.classList.toggle('active', card.dataset.agentCard === state.agent));
  }


  function setAgent(key, open = false) {
    if (!agentDefs.some((a) => a.key === key)) key = "admin";
    state.agent = key;
    renderAgents();
    renderDepartmentWorkspace();
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



  function renderWorkspaceAgentNav() {
    const box = $("#workspaceAgentNav");
    if (!box) return;
    box.innerHTML = agentDefs.map((a) => `<button class="workspaceAgentBtn ${a.key === state.agent ? "active" : ""}" type="button" data-workspace-agent="${esc(a.key)}">${esc(a.name)}</button>`).join("");
  }

  function renderWorkspaceMessages() {
    const box = $("#workspaceMessages");
    if (!box) return;
    const a = currentAgent();
    const list = state.agentHistory[a.key] || [];
    if (!list.length) {
      box.innerHTML = `<div class="workspaceMsg ai">${esc(welcomeFor(a))}\n\nเลือกคำสั่งด่วนด้านบน หรือพิมพ์งานที่ต้องการให้ช่วยได้เลย</div>`;
      return;
    }
    box.innerHTML = list.slice(-18).map((m) => {
      const klass = m.role === "user" ? "user" : (m.loading ? "ai loading" : (m.error ? "ai error" : "ai"));
      const body = m.loading ? `<span class="typingDots"><i></i><i></i><i></i></span> ${esc(m.text || "กำลังคิดคำตอบ")}` : esc(m.text);
      return `<div class="workspaceMsg ${klass}">${body}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
  }

  function renderWorkspacePrompts() {
    const box = $("#workspacePromptGrid");
    if (!box) return;
    const prompts = workspacePrompts[state.agent] || workspacePrompts.admin;
    box.innerHTML = prompts.map(([label, question]) => `<button class="workspacePrompt" type="button" data-workspace-prompt="${esc(question)}"><b>${esc(label)}</b><span>${esc(question)}</span></button>`).join("");
  }

  function renderDepartmentWorkspace() {
    const root = $("#departmentWorkspace");
    if (!root) return;
    const a = currentAgent();
    const glyph = $("#workspaceGlyph");
    const name = $("#workspaceName");
    const role = $("#workspaceRole");
    if (glyph) glyph.textContent = a.code || a.key.slice(0,2).toUpperCase();
    if (name) name.textContent = a.name;
    if (role) role.textContent = a.role || "ผู้ช่วยแผนก";
    renderWorkspaceAgentNav();
    renderWorkspacePrompts();
    renderWorkspaceMessages();
  }

  function openDepartmentWorkspace(agentKey = "admin", question = "") {
    if (agentKey === "line") {
      focusInlineControlPanel("reply");
      return;
    }
    setAgent(agentKey || "admin", false);
    document.getElementById("departmentWorkspace")?.scrollIntoView({ behavior:"smooth", block:"start" });
    if (question) setTimeout(() => submitWorkspaceQuestion(null, question), 180);
  }

  async function submitWorkspaceQuestion(e, retryText = "") {
    if (e?.preventDefault) e.preventDefault();
    const input = $("#workspaceQuestion");
    const raw = clean(retryText || input?.value || "");
    if (!raw) return;
    const submitBtn = $("#workspaceForm .workspaceSend");
    if (submitBtn) submitBtn.disabled = true;
    state.lastAgentRetry = raw;
    if (looksLikeAdminCorrection(raw)) {
      logSharedMemoryEvent("admin_correction", {
        source: "department_workspace",
        agent_key: state.agent,
        customer_message: raw,
        final_admin_reply: raw,
        action_status: "correction",
        situation_type: correctionSituation(raw),
        tags: ["auto_learn", "admin_correction", "workspace"],
        metadata: { auto_detected: true }
      });
    }
    const agentInfo = currentAgent();
    const recent = (state.agentHistory[state.agent] || []).filter((m) => !m.loading).slice(-10).map((m) => `${m.role === "user" ? "แอดมิน" : "AI"}: ${m.text}`).join("\n");
    const sharedMemory = await loadSharedMemoryContext({ query: raw, agent_key: state.agent, limit: 8 });
    const question = [
      `โหมด ${agentInfo.name}`,
      agentInfo.brain || agentInfo.role,
      "ตอบให้เป็นงานจริงของ Coldwindflow ใช้ข้อมูลจริงที่ระบบอ่านได้เท่านั้น ถ้าข้อมูลไม่พอให้บอกว่าต้องตรวจในระบบก่อน",
      "ห้ามบอกว่าส่งข้อความแล้ว ห้ามแก้ข้อมูล ห้ามสร้างงาน ห้ามใช้ข้อมูลปลอม ห้ามยืนยันคิวแทนแอดมิน",
      recent ? `\nประวัติคุยล่าสุด:\n${recent}` : "",
      formatSharedMemoryForPrompt(sharedMemory),
      `\nคำถามใหม่:\n${raw}`
    ].filter(Boolean).join("\n");
    if (!retryText && input) {
      input.value = "";
      autoGrow(input);
      addAgentMessage("user", raw);
      persistAgentMessage("user", raw, { metadata: { source: "department_workspace" } });
      renderWorkspaceMessages();
    }
    addAgentMessage("ai", "กำลังคิดคำตอบ", { loading: true });
    renderWorkspaceMessages();
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
      persistAgentMessage("ai", answer, { question: raw, metadata: { source: "department_workspace" } });
      renderWorkspaceMessages();
    } catch (err) {
      const list = state.agentHistory[state.agent] || [];
      if (list.length && list[list.length - 1].loading) list.pop();
      state.agentHistory[state.agent] = list;
      addAgentMessage("ai", `ยังใช้งาน AI ไม่ได้: ${err.message}`, { error: true });
      persistAgentMessage("ai", `ERROR: ${err.message}`, { question: raw, metadata: { error: err.message, source: "department_workspace" } });
      renderWorkspaceMessages();
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function openAgentChat() {
    const a = currentAgent();
    const glyph = $("#agentGlyph");
    if (glyph) glyph.textContent = a.code || a.key.slice(0,2).toUpperCase();
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
    openDepartmentWorkspace(agentKey, question || "");
  }

  async function loadSummary() {
    try {
      const data = await api("/admin/ai-office/summary");
      const s = data.summary || {};
      $("#statToday").textContent = s.today_count ?? "-";
      $("#statTomorrow").textContent = s.tomorrow_count ?? "-";
      $("#statOpen").textContent = s.open_count ?? "-";
      $("#statUnpaid").textContent = s.unpaid_count ?? "-";
      $("#officeStatus").textContent = "โหลดข้อมูลงานจริงแล้ว เลือกการ์ดตามแผนกหรือเปิดแผงควบคุม AI ตอบลูกค้าได้ทันที";
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
    const sourceQuestion = clean(draft?.customer_question || selectedQuestionForLearning());
    const persisted = Boolean(draft?.persisted);
    if (!draft?.skip_persist && state.selectedConversation?.id && reply) {
      addDraftToConversation(state.selectedConversation.id, {
        customer_reply: reply,
        customer_question: sourceQuestion,
        admin_question: draft?.admin_question || state.lastLineRetry || "",
      });
    }
    $("#lineMessages").insertAdjacentHTML("beforeend", `
      <div class="lineBubble ai ${persisted ? "persisted" : ""}">
        <article class="aiNaturalBubble">
          <div class="aiNaturalTop">
            <span class="aiNaturalLabel">AI แนะนำ</span>
            ${sourceQuestion ? `<span class="aiNaturalSource">ตอบจากคำถามที่เลือก</span>` : `<span class="aiNaturalSource">${persisted ? "จากประวัติก่อนหน้า" : "พร้อมส่งลูกค้า"}</span>`}
          </div>
          ${sourceQuestion ? `<div class="aiDraftSource">อ้างอิง: ${esc(sourceQuestion)}</div>` : ""}
          <div class="replyDisplay" data-reply-display>${esc(text)}</div>
          <textarea class="replyText" data-reply-text data-source-question="${esc(sourceQuestion)}">${esc(text)}</textarea>
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
    const sourceQuestion = selectedQuestionForLearning();
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
          selected_customer_question: sourceQuestion,
          prior_drafts: draftsForConversation(conv.id).slice(-6),
          use_shared_memory: true,
          instruction: sourceQuestion ? `${question}\n\nต้องตอบเฉพาะคำถามลูกค้าที่แอดมินเลือกนี้เป็นหลัก: ${sourceQuestion}` : question,
          agent: state.agent === "sales" ? "sales" : "admin"
        })
      });
      removeLatestLoadingBubble();
      renderAiBubble({ ...(data.draft || { customer_reply: data.answer }), customer_question: sourceQuestion, admin_question: question });
      logSharedMemoryEvent("line_drafted", {
        source: "line_chat",
        conversation_id: conv.id,
        selected_customer_question: sourceQuestion,
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


  function handleComposerKeydown(formSelector) {
    return (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const form = e.target.closest(formSelector);
        form?.requestSubmit();
      }
    };
  }


  const v21 = {
    values: {},
    settings: [],
    health: null,
    dashboard: null,
    approvals: [],
    playbooks: [],
    analytics: null,
    logs: [],
    activeTab: "overview",
    loaded: false,
  };

  const V21_TABS = [
    ["overview", "ภาพรวม"],
    ["auto-safe", "Auto Safe"],
    ["approval", "คิวอนุมัติ"],
    ["playbook", "Playbook"],
    ["quality", "Quality"],
  ];

  function boolSetting(key, fallback = false) {
    const value = v21.values?.[key];
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  }

  function numSetting(key, fallback = 0) {
    const n = Number(v21.values?.[key]);
    return Number.isFinite(n) ? n : fallback;
  }

  function setV21Badges() {
    const box = $("#v21CommandBadges");
    if (!box) return;
    const kill = boolSetting("kill_switch", false);
    const auto = boolSetting("auto_safe_reply_send_enabled", false);
    const playbook = boolSetting("auto_safe_playbook_enabled", true);
    box.innerHTML = `
      <span class="commandBadge ${kill ? "stop" : "on"}">${kill ? "หยุดตอบอยู่" : "ระบบพร้อม"}</span>
      <span class="commandBadge ${auto ? "on" : "off"}">Auto Safe ${auto ? "เปิด" : "ปิด"}</span>
      <span class="commandBadge ${playbook ? "on" : "off"}">Playbook ${playbook ? "เปิด" : "ปิด"}</span>
    `;
  }

  function v21Metric(label, value, note = "") {
    return `<div class="commandMetric"><span>${esc(label)}</span><b>${esc(value)}</b>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
  }

  function v21Toggle(key, label, desc = "", opts = {}) {
    const hasKey = Object.prototype.hasOwnProperty.call(v21.values || {}, key);
    const on = boolSetting(key, !!opts.defaultOn);
    const stop = !!opts.stop;
    return `<div class="commandRow">
      <div class="txt"><b>${esc(label)}</b>${desc ? `<span>${esc(desc)}</span>` : ""}</div>
      <button class="toggleBtn ${stop && on ? "stop" : (on ? "on" : "off")}" type="button" data-v21-toggle="${esc(key)}" ${hasKey ? "" : "disabled"}>${on ? "เปิด" : "ปิด"}</button>
    </div>`;
  }

  function v21ActionCards() {
    return `<div class="commandActions">
      <button class="cardBtn gold" type="button" data-v21-mode="safe-on">เปิดโหมดลดงานแอดมิน</button>
      <button class="cardBtn" type="button" data-v21-mode="draft-only">ร่างอย่างเดียว</button>
      <button class="cardBtn danger" type="button" data-v21-mode="pause-all">หยุดตอบทันที</button>
      <button class="cardBtn" type="button" data-open-advanced-control="reply">ตั้งค่าขั้นสูง</button>
    </div>`;
  }

  function renderV21Overview() {
    const d = v21.dashboard || {};
    const approvalCount = Array.isArray(v21.approvals) ? v21.approvals.length : 0;
    const sent24 = d.sent_24h ?? 0;
    const skipped24 = d.skipped_24h ?? 0;
    const minutes = d.estimated?.minutes_saved_30d ?? 0;
    const activePlaybooks = d.active_playbooks ?? (Array.isArray(v21.playbooks) ? v21.playbooks.length : 0);
    return `
      <div class="commandMetrics">
        ${v21Metric("ตอบเอง 24 ชม.", sent24, "เฉพาะคำถามปลอดภัย")}
        ${v21Metric("กันไว้ 24 ชม.", skipped24, "ส่งให้แอดมินจัดการ")}
        ${v21Metric("คิวอนุมัติ", approvalCount, "รอแอดมินตรวจ")}
        ${v21Metric("Playbook", activePlaybooks, "คำตอบที่อนุมัติแล้ว")}
      </div>
      <div class="commandGrid">
        <article class="commandCard wide"><h3>โหมดหลัก</h3><p>ใช้ 3 ปุ่มนี้พอสำหรับงานประจำวัน ไม่ต้องไล่หา setting หลายชั้น</p>${v21ActionCards()}</article>
        <article class="commandCard"><h3>สถานะส่ง LINE เอง</h3><p>เปิดเฉพาะเมื่อพร้อมให้ AI ตอบคำถามง่ายแทนแอดมิน</p><div class="commandRows">
          ${v21Toggle("auto_safe_reply_send_enabled", "AI ส่ง LINE เองเฉพาะคำถามปลอดภัย", "ราคา พื้นที่บริการ ความต่างแพ็กเกจ และทักทายทั่วไป")}
          ${v21Toggle("kill_switch", "หยุด AI ตอบทันที", "ใช้เมื่ออยากหยุดการร่าง/ตอบทั้งหมด", { stop:true })}
        </div></article>
        <article class="commandCard"><h3>ผลลัพธ์โดยประมาณ</h3><p>ประเมินจาก log ของ Auto Safe</p><div class="commandRows">
          <div class="commandItem"><b>${esc(minutes)} นาที</b><span>เวลาที่ประหยัดในช่วงที่ตั้งไว้</span></div>
          <div class="commandItem"><b>${esc(d.performance?.auto_reply_rate_percent ?? 0)}%</b><span>อัตราที่ AI ตอบเองเทียบกับข้อความที่ตรวจ</span></div>
        </div></article>
      </div>`;
  }

  function renderV21AutoSafe() {
    return `<div class="commandGrid">
      <article class="commandCard wide"><h3>Auto Safe Control</h3><p>จุดควบคุมหลักของการให้ AI ส่ง LINE เอง เฉพาะคำถามไม่เสี่ยง</p><div class="commandRows">
        ${v21Toggle("auto_safe_reply_send_enabled", "เปิด AI ส่ง LINE เอง", "ส่งเองเฉพาะ SAFE_DRAFT / LOW risk / confidence ผ่านเกณฑ์")}
        ${v21Toggle("auto_safe_playbook_enabled", "ใช้ Playbook ก่อนส่งเอง", "ลดการตอบผิดราคาและลดการคิดสด")}
        ${v21Toggle("auto_safe_quality_guard_enabled", "ใช้ feedback กันตอบซ้ำแบบเดิม", "ถ้าแอดมินเคยกดตอบไม่ดี ระบบจะระวังมากขึ้น")}
        ${v21Toggle("auto_safe_reply_quiet_hours_enabled", "งดตอบเองช่วงเวลาที่กำหนด", "เหมาะกับตอนดึกหรือช่วงที่อยากให้แอดมินรับเอง")}
      </div>${v21ActionCards()}</article>
      <article class="commandCard"><h3>ค่าคุมความเสี่ยง</h3><p>ค่าหลักที่ระบบใช้อยู่</p><div class="commandList">
        <div class="commandItem"><b>${esc(numSetting("auto_safe_reply_min_confidence", 85))}%</b><span>คะแนนมั่นใจขั้นต่ำ</span></div>
        <div class="commandItem"><b>${esc(numSetting("auto_safe_reply_cooldown_minutes", 20))} นาที</b><span>พักก่อนตอบซ้ำ</span></div>
        <div class="commandItem"><b>${esc(numSetting("auto_safe_reply_daily_limit", 5))} ครั้ง</b><span>สูงสุดต่อแชทต่อวัน</span></div>
      </div></article>
      <article class="commandCard"><h3>Log ล่าสุด</h3><p>ดูว่า AI ส่งเองหรือกันไว้เพราะอะไร</p>${renderV21Logs()}</article>
    </div>`;
  }

  function renderV21Approval() {
    const list = (v21.approvals || []).slice(0, 8);
    return `<div class="commandGrid">
      <article class="commandCard"><h3>คิวอนุมัติ</h3><p>ข้อความที่ควรให้แอดมินตรวจเอง</p><div class="commandRows">
        ${v21Toggle("approval_queue_enabled", "เปิดคิวอนุมัติ", "AI ส่งร่างเข้าคิว ไม่ส่งเองในเคสเสี่ยง")}
        ${v21Toggle("draft_reply_enabled", "ให้ AI ร่างคำตอบ", "ยังให้แอดมินตรวจ/แก้ได้")}
      </div><div class="commandActions"><button class="cardBtn" type="button" data-open-advanced-control="approvals">เปิดคิวละเอียด</button></div></article>
      <article class="commandCard wide"><h3>รายการรอตรวจล่าสุด</h3><p>แสดงเฉพาะบางรายการเพื่อไม่ให้หน้านี้รก</p><div class="commandList">
        ${list.length ? list.map((x) => `<div class="commandItem"><b>${esc(x.display_name || x.line_display_name || x.line_user_id || "ลูกค้า")}</b><span>${esc(x.customer_message || x.selected_customer_message || x.reply_text || "รอแอดมินตรวจ")}</span></div>`).join("") : `<div class="commandEmpty">ยังไม่มีคิวรอตรวจ</div>`}
      </div></article>
    </div>`;
  }

  function renderV21Playbook() {
    const list = (v21.playbooks || []).slice(0, 8);
    const d = v21.dashboard || {};
    return `<div class="commandGrid">
      <article class="commandCard"><h3>Playbook</h3><p>คำตอบที่ผ่านการอนุมัติแล้ว ให้ AI ใช้ส่งเองก่อนคิดสด</p><div class="commandRows">
        ${v21Toggle("auto_safe_playbook_enabled", "ใช้ Playbook", "ให้ AI ส่งจากคำตอบที่ร้านคุมไว้")}
        ${v21Toggle("auto_safe_playbook_required", "ส่งเองเฉพาะเมื่อมี Playbook ตรง", "ถ้าไม่มี Playbook ให้กันไว้ ไม่ส่งเอง")}
        ${v21Toggle("auto_safe_playbook_suggestions_enabled", "แนะนำ Playbook จากคำถามซ้ำ", "ให้ระบบเสนอคำตอบใหม่จากแชทจริง")}
      </div><div class="commandActions"><button class="cardBtn" type="button" data-open-advanced-control="brain">เปิดคลังสมอง</button></div></article>
      <article class="commandCard"><h3>สรุป Playbook</h3><p>ดูจำนวนและรายการที่ควรเพิ่ม</p><div class="commandList">
        <div class="commandItem"><b>${esc(d.active_playbooks ?? list.length)}</b><span>Playbook ที่เปิดใช้งาน</span></div>
        <div class="commandItem"><b>${esc(d.pending_suggestions ?? v21.analytics?.pending_suggestions ?? 0)}</b><span>รายการที่ระบบเสนอให้ตรวจ</span></div>
      </div></article>
      <article class="commandCard wide"><h3>Playbook ล่าสุด</h3><p>ใช้ตรวจเร็ว ไม่ใช่หน้าแก้ละเอียด</p><div class="commandList">
        ${list.length ? list.map((x) => `<div class="commandItem"><b>${esc(x.title || x.name || "Playbook")}</b><span>${esc(x.intent || "general")} · ${esc((x.trigger_phrases || []).join ? x.trigger_phrases.join(", ") : (x.trigger_phrases || ""))}</span></div>`).join("") : `<div class="commandEmpty">ยังไม่มี Playbook หรือ API ยังไม่พร้อม</div>`}
      </div></article>
    </div>`;
  }

  function renderV21Quality() {
    const d = v21.dashboard || {};
    return `<div class="commandGrid">
      <article class="commandCard"><h3>Quality Loop</h3><p>เรียนรู้จากคำตอบดี/ไม่ดี/ราคาผิด</p><div class="commandRows">
        ${v21Toggle("auto_safe_quality_guard_enabled", "ใช้ Quality Guard", "กันไม่ให้ AI ส่งเองซ้ำในแนวที่แอดมินไม่ชอบ")}
        ${v21Toggle("auto_safe_negative_feedback_pause_enabled", "พักแชทหลัง feedback ลบ", "ถ้าแอดมินกดตอบไม่ดี ให้ AI หยุดแทรกในแชทนั้น")}
      </div></article>
      <article class="commandCard"><h3>Feedback</h3><p>ตัวเลขจากช่วงเวลาที่ตั้งไว้</p><div class="commandList">
        <div class="commandItem"><b>${esc(d.quality?.good ?? 0)}</b><span>ตอบดี</span></div>
        <div class="commandItem"><b>${esc(d.quality?.bad ?? 0)}</b><span>ตอบไม่ดี</span></div>
        <div class="commandItem"><b>${esc(d.quality?.wrong_price ?? 0)}</b><span>ราคาผิด</span></div>
      </div></article>
      <article class="commandCard wide"><h3>เหตุผลที่กันไว้บ่อย</h3><p>ใช้บอกว่าควรเพิ่ม Playbook หรือปรับกฎตรงไหน</p><div class="commandList">
        ${(d.skipped_reasons || []).length ? d.skipped_reasons.slice(0,8).map((x) => `<div class="commandItem"><b>${esc(x.reason || "UNKNOWN")}</b><span>${esc(x.count || 0)} ครั้ง</span></div>`).join("") : `<div class="commandEmpty">ยังไม่มีข้อมูล</div>`}
      </div></article>
    </div>`;
  }

  function renderV21Logs() {
    const list = (v21.logs || []).slice(0, 6);
    if (!list.length) return `<div class="commandEmpty">ยังไม่มี log ล่าสุด</div>`;
    return `<div class="commandList">${list.map((x) => `<div class="commandItem"><b>${esc(x.status || "log")} ${x.skipped_reason ? `· ${esc(x.skipped_reason)}` : ""}</b><span>${esc(x.customer_message || x.reply_text || "")}</span></div>`).join("")}</div>`;
  }

  function renderV21CommandCenter() {
    const body = $("#v21CommandBody");
    if (!body) return;
    setV21Badges();
    $$("[data-v21-tab]").forEach((btn) => btn.classList.toggle("active", btn.dataset.v21Tab === v21.activeTab));
    if (v21.activeTab === "auto-safe") body.innerHTML = renderV21AutoSafe();
    else if (v21.activeTab === "approval") body.innerHTML = renderV21Approval();
    else if (v21.activeTab === "playbook") body.innerHTML = renderV21Playbook();
    else if (v21.activeTab === "quality") body.innerHTML = renderV21Quality();
    else body.innerHTML = renderV21Overview();
  }

  async function loadV21CommandCenter() {
    const body = $("#v21CommandBody");
    if (!body) return;
    if (!v21.loaded) body.innerHTML = `<div class="controlInlineLoading">กำลังโหลดสถานะ AI Reply...</div>`;
    try {
      const results = await Promise.allSettled([
        api("/admin/ai-office/control/settings"),
        api("/admin/ai-office/control/health"),
        api("/admin/ai-office/control/auto-safe/dashboard"),
        api("/admin/ai-office/control/approvals?status=open&limit=12"),
        api("/admin/ai-office/control/auto-safe/logs?limit=8"),
        api("/admin/ai-office/control/auto-safe/playbooks?limit=12"),
        api("/admin/ai-office/control/auto-safe/playbook-analytics"),
      ]);
      const [settings, health, dashboard, approvals, logs, playbooks, analytics] = results.map((r) => r.status === "fulfilled" ? r.value : null);
      if (settings) { v21.settings = settings.settings || []; v21.values = settings.values || {}; }
      if (health) v21.health = health;
      if (dashboard) v21.dashboard = dashboard.dashboard || dashboard;
      if (approvals) v21.approvals = approvals.approvals || [];
      if (logs) v21.logs = logs.logs || logs.rows || [];
      if (playbooks) v21.playbooks = playbooks.playbooks || [];
      if (analytics) v21.analytics = analytics.analytics || analytics;
      v21.loaded = true;
      renderV21CommandCenter();
    } catch (err) {
      body.innerHTML = `<div class="inlineError">โหลด AI Reply Command Center ไม่ได้: ${esc(err.message)}</div>`;
    }
  }

  async function patchV21Setting(key, value, note = "V21 inline command center") {
    await api("/admin/ai-office/control/settings", { method:"PATCH", body: JSON.stringify({ key, value, note }) });
    await loadV21CommandCenter();
  }

  async function bulkV21Settings(updates, note) {
    await api("/admin/ai-office/control/settings/bulk", { method:"POST", body: JSON.stringify({ updates, note }) });
    await loadV21CommandCenter();
  }

  async function handleV21Mode(mode) {
    try {
      if (mode === "safe-on") {
        await bulkV21Settings([
          { key:"kill_switch", value:false },
          { key:"draft_reply_enabled", value:true },
          { key:"approval_queue_enabled", value:true },
          { key:"auto_safe_reply_send_enabled", value:true },
          { key:"auto_safe_playbook_enabled", value:true },
          { key:"auto_safe_playbook_required", value:true },
          { key:"auto_safe_quality_guard_enabled", value:true },
        ], "V21 เปิดโหมดลดงานแอดมินแบบปลอดภัย");
        showToast("เปิดโหมดลดงานแอดมินแล้ว");
      } else if (mode === "draft-only") {
        await bulkV21Settings([
          { key:"kill_switch", value:false },
          { key:"draft_reply_enabled", value:true },
          { key:"approval_queue_enabled", value:true },
          { key:"auto_safe_reply_send_enabled", value:false },
        ], "V21 โหมดร่างอย่างเดียว");
        showToast("ตั้งเป็นร่างอย่างเดียวแล้ว");
      } else if (mode === "pause-all") {
        await bulkV21Settings([
          { key:"kill_switch", value:true },
          { key:"auto_safe_reply_send_enabled", value:false },
        ], "V21 หยุด AI ตอบทันที");
        showToast("หยุด AI ตอบทันทีแล้ว");
      }
    } catch (err) {
      alert(`ปรับโหมดไม่ได้: ${err.message}`);
    }
  }

  function focusInlineControlPanel(panel = "overview") {
    const map = { reply:"auto-safe", dashboard:"overview", approvals:"approval", brain:"playbook", line:"overview", quality:"quality" };
    v21.activeTab = map[panel] || panel || "overview";
    renderV21CommandCenter();
    document.getElementById("replyCommandCenter")?.scrollIntoView({ behavior:"smooth", block:"start" });
    if (!v21.loaded) loadV21CommandCenter();
  }

  function openAdvancedControlPanel(panel = "reply") {
    const target = clean(panel || "reply");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("panel", target);
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    } catch (_) {}
    const btn = document.querySelector(".ai-control-open");
    if (btn) {
      btn.click();
      showToast("เปิดแผงขั้นสูงแล้ว");
    } else {
      showToast("กำลังโหลดแผงขั้นสูง");
      setTimeout(() => document.querySelector(".ai-control-open")?.click(), 500);
    }
  }


  function openControlPanel(panel = "reply") {
    focusInlineControlPanel(panel || "overview");
    showToast("เลื่อนไปที่ AI Reply Command Center แล้ว");
  }

  function openPage(url) {
    const safeUrl = String(url || "");
    if (!safeUrl.startsWith("/admin-")) return;
    window.location.href = safeUrl;
  }

  function bind() {
    document.addEventListener("click", (e) => {
      const workspaceAgent = e.target.closest("[data-workspace-agent]");
      if (workspaceAgent) return openDepartmentWorkspace(workspaceAgent.dataset.workspaceAgent || "admin");
      const workspacePrompt = e.target.closest("[data-workspace-prompt]");
      if (workspacePrompt) return submitWorkspaceQuestion(null, workspacePrompt.dataset.workspacePrompt || "");
      if (e.target.closest("[data-open-legacy-chat]")) return openAgentChat();
      const departmentCard = e.target.closest("[data-agent-card]");
      if (departmentCard && !e.target.closest("button")) return openDepartmentWorkspace(departmentCard.dataset.agentCard || "admin");
      const quick = e.target.closest("[data-quick-agent]");
      if (quick) return openAgentWithQuestion(quick.dataset.quickAgent, quick.dataset.quickQuestion || "");
      if (e.target.closest("[data-clear-selected-question]")) return clearSelectedQuestion(true);
      const v21Tab = e.target.closest("[data-v21-tab]");
      if (v21Tab) { v21.activeTab = v21Tab.dataset.v21Tab || "overview"; return renderV21CommandCenter(); }
      const v21ToggleBtn = e.target.closest("[data-v21-toggle]");
      if (v21ToggleBtn) return patchV21Setting(v21ToggleBtn.dataset.v21Toggle, !boolSetting(v21ToggleBtn.dataset.v21Toggle, false));
      const v21Mode = e.target.closest("[data-v21-mode]");
      if (v21Mode) return handleV21Mode(v21Mode.dataset.v21Mode || "");
      const adv = e.target.closest("[data-open-advanced-control]");
      if (adv) return openAdvancedControlPanel(adv.dataset.openAdvancedControl || "reply");
      const ctrl = e.target.closest("[data-open-control]");
      if (ctrl) return openControlPanel(ctrl.dataset.openControl || "reply");
      const pageBtn = e.target.closest("[data-open-page]");
      if (pageBtn) return openPage(pageBtn.dataset.openPage);
      if (e.target.closest("[data-open-inbox]")) return openInbox();
      if (e.target.closest("[data-close-agent]")) return closeAgentChat();
      if (e.target.closest("[data-close-inbox]")) return closeInbox();
      if (e.target.closest("[data-inbox-back]")) return handleInboxBack();
      if (e.target.closest("[data-retry-agent]")) return submitAgentQuestion(null, state.lastAgentRetry || "");
      if (e.target.closest("[data-back-list]")) return showInboxList();
      if (e.target.closest("[data-open-memory]")) return openMemoryPanel();
      if (e.target.closest("[data-prefill-memory]")) return prefillMemoryFromChat();
      if (e.target.closest("[data-edit-reply]")) return toggleEditReply(e.target.closest("[data-edit-reply]"));
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
    $("#reloadBtn")?.addEventListener("click", () => { loadSummary(); loadInbox(); loadV21CommandCenter(); });
    $("#lineRefresh")?.addEventListener("click", loadInbox);
    $("#conversationSearch")?.addEventListener("input", renderConversationList);
    $("#agentForm")?.addEventListener("submit", submitAgentQuestion);
    $("#agentQuestion")?.addEventListener("keydown", handleComposerKeydown("#agentForm"));
    $("#workspaceForm")?.addEventListener("submit", submitWorkspaceQuestion);
    $("#workspaceQuestion")?.addEventListener("keydown", handleComposerKeydown("#workspaceForm"));
    $("#lineAiForm")?.addEventListener("submit", submitLineQuestion);
    $("#lineAiQuestion")?.addEventListener("keydown", handleComposerKeydown("#lineAiForm"));
    $("#memoryForm")?.addEventListener("submit", saveMemoryExample);
    $("#memoryClose")?.addEventListener("click", closeMemoryPanel);
    $("#memoryReload")?.addEventListener("click", loadMemoryExamples);
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
    loadV21CommandCenter();
    try { const p = new URL(window.location.href).searchParams.get("panel"); if (p) setTimeout(() => focusInlineControlPanel(p), 250); } catch (_) {}
    handleViewport();
    window.visualViewport?.addEventListener("resize", handleViewport);
  });
})();
