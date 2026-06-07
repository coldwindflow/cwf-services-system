(() => {
  "use strict";
  const VERSION = "CWF AI Office Customer Chat UX v18 loaded";
  console.info(VERSION);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const api = async (url, opts = {}) => {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP_${res.status}`);
    }
    return data || {};
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  const agentDefs = [
    { key:"admin", name:"Admin AI", role:"หัวหน้าแอดมิน ช่วยสรุปงาน ร่างข้อความลูกค้าและข้อความช่าง", x:"26%", y:"58%", size:"112px", m:"100px", avatar:"/assets/ai-office-final/characters-clean/admin/idle.png" },
    { key:"sales", name:"Sales AI", role:"เซลส์ปิดงาน ตอบราคา ตอบลูกค้าบอกแพง และช่วยปิดการขาย", x:"66%", y:"68%", size:"108px", m:"98px", avatar:"/assets/ai-office-final/characters-clean/sales/idle.png" },
    { key:"ops", name:"Ops AI", role:"ควบคุมคิวงาน งานวันนี้ พรุ่งนี้ งานค้าง และความเสี่ยงหน้างาน", x:"51%", y:"45%", size:"118px", m:"102px", avatar:"/assets/ai-office-final/characters-clean/ops/idle.png" },
    { key:"ads", name:"Ads AI", role:"วิเคราะห์แอด พื้นที่ คีย์เวิร์ด และเหตุผลที่ปิดการขายน้อย", x:"42%", y:"66%", size:"100px", m:"92px", avatar:"/assets/ai-office-final/characters-clean/ads/idle.png" },
    { key:"content", name:"Content AI", role:"เขียนโพสต์ แคปชัน รีวิว สคริปต์ และคอนเทนต์สั้น", x:"44%", y:"83%", size:"98px", m:"90px", avatar:"/assets/ai-office-final/characters-clean/content/idle.png" },
    { key:"dev", name:"Dev AI", role:"ช่วยเขียน prompt ส่ง Codex ตรวจบั๊ก checklist และ rollback", x:"78%", y:"55%", size:"112px", m:"96px", avatar:"/assets/ai-office-final/characters-clean/dev/idle.png" },
  ];

  const state = {
    agent: "admin",
    summary: null,
    conversations: [],
    selectedConversation: null,
    selectedMessages: [],
    lastCustomerMessage: "",
    agentHistory: JSON.parse(localStorage.getItem("cwfAiOfficeAgentHistoryV18") || "{}"),
  };

  function saveHistory() {
    localStorage.setItem("cwfAiOfficeAgentHistoryV18", JSON.stringify(state.agentHistory));
  }

  function renderAgents() {
    const wrap = $("#agents");
    const bar = $("#rolebar");
    if (!wrap || !bar) return;
    wrap.innerHTML = agentDefs.map((a, idx) => `
      <button class="agent ${a.key === state.agent ? "selected" : ""}" data-agent="${a.key}" style="--x:${a.x};--y:${a.y};--size:${a.size};--m-size:${a.m};--depth:${30+idx}">
        <img class="sprite" src="${a.avatar}" alt="${esc(a.name)}">
        <span class="agentLabel">${esc(a.name)}</span>
      </button>
    `).join("");
    bar.innerHTML = agentDefs.map((a) => `
      <button class="rolechip ${a.key === state.agent ? "active" : ""}" data-agent="${a.key}">
        <img src="${a.avatar}" alt=""> ${esc(a.name.replace(" AI",""))}
      </button>
    `).join("");
  }

  function setAgent(key, open = false) {
    if (!agentDefs.some((a) => a.key === key)) key = "admin";
    state.agent = key;
    renderAgents();
    if (open) openAgentChat();
  }

  function currentAgent() {
    return agentDefs.find((a) => a.key === state.agent) || agentDefs[0];
  }

  function addAgentMessage(role, text) {
    const a = currentAgent();
    const list = state.agentHistory[a.key] || [];
    list.push({ role, text: String(text || ""), at: Date.now() });
    state.agentHistory[a.key] = list.slice(-18);
    saveHistory();
    renderAgentMessages();
  }

  function renderAgentMessages() {
    const box = $("#agentMessages");
    if (!box) return;
    const a = currentAgent();
    const list = state.agentHistory[a.key] || [];
    if (!list.length) {
      box.innerHTML = `<div class="emptyState">ถาม ${esc(a.name)} ได้เลย ระบบจะใช้บริบทงานจริงและประวัติคุยล่าสุดในหน้านี้ช่วยให้ตอบต่อเนื่องขึ้น</div>`;
      return;
    }
    box.innerHTML = list.map((m) => `<div class="msg ${m.role === "user" ? "user" : "ai"}">${esc(m.text)}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }

  function openAgentChat() {
    const a = currentAgent();
    $("#agentAvatar").src = a.avatar;
    $("#agentName").textContent = a.name;
    $("#agentRole").textContent = a.role;
    $("#agentOverlay").classList.add("open");
    $("#agentOverlay").setAttribute("aria-hidden", "false");
    renderAgentMessages();
    setTimeout(() => $("#agentQuestion")?.focus(), 80);
  }

  function closeAgentChat() {
    $("#agentOverlay").classList.remove("open");
    $("#agentOverlay").setAttribute("aria-hidden", "true");
  }

  async function submitAgentQuestion(e) {
    e.preventDefault();
    const input = $("#agentQuestion");
    const raw = clean(input.value);
    if (!raw) return;
    const recent = (state.agentHistory[state.agent] || []).slice(-6).map((m) => `${m.role === "user" ? "แอดมิน" : "AI"}: ${m.text}`).join("\n");
    const question = recent ? `บริบทคุยล่าสุด:\n${recent}\n\nคำถามใหม่:\n${raw}` : raw;
    input.value = "";
    addAgentMessage("user", raw);
    addAgentMessage("ai", "กำลังอ่านข้อมูลจริงและคิดคำตอบ...");
    try {
      const data = await api("/admin/ai-office/ask", {
        method: "POST",
        body: JSON.stringify({ agent: state.agent, question })
      });
      const list = state.agentHistory[state.agent] || [];
      if (list.length && list[list.length - 1].text.includes("กำลังอ่านข้อมูลจริง")) list.pop();
      state.agentHistory[state.agent] = list;
      addAgentMessage("ai", data.answer || "ยังไม่ได้คำตอบจาก AI");
    } catch (err) {
      const list = state.agentHistory[state.agent] || [];
      if (list.length && list[list.length - 1].text.includes("กำลังอ่านข้อมูลจริง")) list.pop();
      state.agentHistory[state.agent] = list;
      addAgentMessage("ai", `ยังใช้งาน AI ไม่ได้: ${err.message}`);
    }
  }

  async function loadSummary() {
    try {
      const data = await api("/admin/ai-office/summary");
      const s = data.summary || {};
      $("#statToday").textContent = s.today_count ?? "-";
      $("#statTomorrow").textContent = s.tomorrow_count ?? "-";
      $("#statOpen").textContent = s.open_count ?? "-";
      $("#statUnpaid").textContent = s.unpaid_count ?? "-";
      $("#officeStatus").textContent = "โหลดข้อมูลงานจริงแล้ว ทีม AI พร้อมช่วยงาน";
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
      $("#selectedCustomerName").textContent = state.selectedConversation.display_name || "ลูกค้า LINE";
      $("#selectedCustomerMeta").textContent = `${data.thread_context?.status || "แชทลูกค้า LINE OA"} · ${state.selectedConversation.last_message_at_display || ""}`;
      $("#inboxTitle").textContent = state.selectedConversation.display_name || "แชทลูกค้า";
      $("#inboxSub").textContent = "ถาม AI จากบริบทลูกค้าคนนี้เท่านั้น";
      renderLineMessages();
      setTimeout(() => $("#lineAiQuestion")?.focus(), 80);
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
      return;
    }
    let latestInbound = "";
    box.innerHTML = messages.map((m) => {
      const inbound = (m.direction || "inbound") === "inbound";
      const text = messageText(m);
      if (inbound && clean(text)) latestInbound = clean(text);
      const klass = inbound ? "customer" : "admin";
      const time = m.received_at_display || "";
      return `<div class="lineBubble ${klass}">${esc(text)}${time ? `<div style="margin-top:8px;color:#7a879a;font-size:12px;font-weight:800">${esc(time)}</div>` : ""}</div>`;
    }).join("");
    state.lastCustomerMessage = latestInbound;
    box.scrollTop = box.scrollHeight;
  }

  function renderAiBubble(draft) {
    const reply = clean(draft?.customer_reply || draft?.answer || "");
    const text = reply || "ยังไม่ได้ข้อความพร้อมส่งลูกค้า";
    const id = `reply_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    $("#lineMessages").insertAdjacentHTML("beforeend", `
      <div class="lineBubble ai" data-ai-bubble="${id}">
        <div class="bubbleTitle">ข้อความพร้อมส่งลูกค้า</div>
        <textarea class="replyText" data-reply-text>${esc(text)}</textarea>
        <div class="bubbleActions">
          <button class="blueBtn" type="button" data-copy-reply>คัดลอกข้อความนี้</button>
          <button class="whiteBtn" type="button" data-save-from-reply>บันทึกเป็นตัวอย่างคำตอบ</button>
        </div>
      </div>
    `);
    const box = $("#lineMessages");
    box.scrollTop = box.scrollHeight;
  }

  async function submitLineQuestion(e) {
    e.preventDefault();
    const conv = state.selectedConversation;
    const input = $("#lineAiQuestion");
    const question = clean(input.value);
    if (!conv?.id || !question) return;
    input.value = "";
    $("#lineMessages").insertAdjacentHTML("beforeend", `<div class="lineBubble ai"><div class="bubbleTitle">AI กำลังร่างข้อความ...</div></div>`);
    const box = $("#lineMessages");
    box.scrollTop = box.scrollHeight;
    try {
      const data = await api("/admin/ai-office/line-draft-reply", {
        method: "POST",
        body: JSON.stringify({
          conversation_id: conv.id,
          admin_question: question,
          instruction: question,
          agent: state.agent === "sales" ? "sales" : "admin"
        })
      });
      const loading = $$(".lineBubble.ai").findLast?.((el) => el.textContent.includes("AI กำลังร่างข้อความ"));
      if (loading) loading.remove();
      renderAiBubble(data.draft || { customer_reply: data.answer });
    } catch (err) {
      const loading = $$(".lineBubble.ai").findLast?.((el) => el.textContent.includes("AI กำลังร่างข้อความ"));
      if (loading) loading.remove();
      renderAiBubble({ customer_reply: `ขออภัยค่ะ ตอนนี้ระบบ AI ยังร่างคำตอบไม่ได้ (${err.message})` });
    }
  }

  async function copyReply(button) {
    const bubble = button.closest(".lineBubble.ai");
    const text = bubble?.querySelector("[data-reply-text]")?.value || "";
    if (!clean(text)) return;
    await navigator.clipboard.writeText(text);
    button.textContent = "คัดลอกแล้ว";
    setTimeout(() => { button.textContent = "คัดลอกข้อความนี้"; }, 1200);
    api("/admin/ai-office/reply-learning/event", {
      method: "POST",
      body: JSON.stringify({
        event_type: "copied",
        conversation_id: state.selectedConversation?.id || null,
        agent_key: state.agent || "admin",
        situation_type: "general",
        customer_message: state.lastCustomerMessage,
        final_admin_reply: text,
        source: "customer_chat_copy"
      })
    }).catch(() => {});
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
      customer_message: state.lastCustomerMessage || "",
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

  function bind() {
    document.addEventListener("click", (e) => {
      const agentBtn = e.target.closest("[data-agent]");
      if (agentBtn) return setAgent(agentBtn.dataset.agent, agentBtn.classList.contains("agent"));
      if (e.target.closest("[data-open-inbox]")) return openInbox();
      if (e.target.closest("[data-close-agent]")) return closeAgentChat();
      if (e.target.closest("[data-close-inbox]")) return closeInbox();
      if (e.target.closest("[data-back-list]")) return showInboxList();
      if (e.target.closest("[data-open-memory]")) return openMemoryPanel();
      if (e.target.closest("[data-prefill-memory]")) return prefillMemoryFromChat();
      if (e.target.closest("[data-copy-reply]")) return copyReply(e.target.closest("[data-copy-reply]"));
      if (e.target.closest("[data-save-from-reply]")) {
        const bubble = e.target.closest(".lineBubble.ai");
        return prefillMemoryFromChat(bubble?.querySelector("[data-reply-text]")?.value || "");
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
    $("#lineAiForm")?.addEventListener("submit", submitLineQuestion);
    $("#memoryForm")?.addEventListener("submit", saveMemoryExample);
    $("#memoryClose")?.addEventListener("click", closeMemoryPanel);
    $("#memoryReload")?.addEventListener("click", loadMemoryExamples);
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAgents();
    bind();
    loadSummary();
  });
})();
