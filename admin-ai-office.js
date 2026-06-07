(function(){
  "use strict";
  console.info("CWF AI Office Customer Chat UX v18 loaded");

  const API = "/admin/ai-office";
  const AGENTS = [
    {key:"office", label:"Office", name:"Office Chat", img:"/assets/ai-office-final/characters-clean/admin/idle.png", x:"50%", y:"49%", size:"76px"},
    {key:"admin", label:"Admin", name:"Admin AI", img:"/assets/ai-office-final/characters-clean/admin/idle.png", x:"25%", y:"64%", size:"74px"},
    {key:"sales", label:"Sales", name:"Sales AI", img:"/assets/ai-office-final/characters-clean/sales/idle.png", x:"66%", y:"72%", size:"74px"},
    {key:"ops", label:"Ops", name:"Ops AI", img:"/assets/ai-office-final/characters-clean/ops/idle.png", x:"50%", y:"55%", size:"82px"},
    {key:"content", label:"Content", name:"Content AI", img:"/assets/ai-office-final/characters-clean/content/idle.png", x:"43%", y:"80%", size:"72px"},
    {key:"dev", label:"Dev", name:"Dev AI", img:"/assets/ai-office-final/characters-clean/dev/idle.png", x:"77%", y:"56%", size:"74px"},
  ];
  const SITUATION_WORDS = [
    ["bad_smell", /กลิ่น|เหม็น|อับ|เชื้อรา/i],
    ["water_leak", /น้ำหยด|หยด|รั่ว/i],
    ["air_not_cold", /ไม่เย็น|ลมไม่เย็น|เย็นน้อย/i],
    ["expensive", /แพง|ลด|ส่วนลด|ถูกกว่า/i],
    ["price_question", /ราคา|เท่าไหร่|กี่บาท|โปร/i],
    ["appointment", /นัด|คิว|ว่าง|เวลา|วันไหน/i],
    ["foreign_customer", /[A-Za-z]{5,}/],
    ["cleaning_package", /ล้างแบบไหน|พรีเมียม|แขวนคอยล์|ตัดล้าง|ล้างใหญ่/i],
  ];

  const state = {
    selectedAgent:"admin",
    conversations:[],
    selectedConversation:null,
    messages:[],
    chatView:"list",
    loadingDraft:false,
    latestDraft:null,
  };

  const $ = (id)=>document.getElementById(id);
  const clean = (v)=>String(v||"").replace(/\s+$/g,"").trim();
  const esc = (s)=>String(s==null?"":s).replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));

  function toast(msg){
    const old=document.querySelector(".toast"); if(old) old.remove();
    const div=document.createElement("div"); div.className="toast"; div.textContent=msg;
    document.body.appendChild(div); setTimeout(()=>div.remove(),2600);
  }

  async function apiJson(path, opts={}){
    const res = await fetch(`${API}${path}`, Object.assign({credentials:"include"}, opts, {
      headers:Object.assign({"Content-Type":"application/json"}, opts.headers||{})
    }));
    const data = await res.json().catch(()=>({ok:false,error:"INVALID_JSON"}));
    if(!res.ok || data.ok===false){
      throw new Error(data.error || data.message || `HTTP_${res.status}`);
    }
    return data;
  }

  function inferSituation(text){
    const t = String(text||"");
    const row = SITUATION_WORDS.find(([,rx])=>rx.test(t));
    return row ? row[0] : "general";
  }
  function detectLanguage(text){
    const t=String(text||"");
    if(/[\u3040-\u30ff]/.test(t)) return "ja";
    if(/[\u3400-\u9fff]/.test(t)) return "zh";
    if(/[\uac00-\ud7af]/.test(t)) return "ko";
    if(/[A-Za-z]/.test(t) && !/[\u0E00-\u0E7F]/.test(t)) return "en";
    return "th";
  }
  function latestCustomerText(){
    const inbound = [...state.messages].reverse().find(m=>String(m.direction||"").toLowerCase()==="inbound" && (m.message_text || m.message_text_for_admin));
    return clean(inbound?.message_text_for_admin || inbound?.message_text || state.selectedConversation?.last_message_text || "");
  }
  function autoGrow(el){
    if(!el) return;
    el.style.height="auto";
    el.style.height=Math.min(el.scrollHeight,140)+"px";
  }

  function renderAgents(){
    const agents = $("agents"); const rolebar=$("rolebar");
    if(!agents || !rolebar) return;
    agents.innerHTML = AGENTS.map(a=>`
      <button class="agent ${state.selectedAgent===a.key?"active":""}" data-agent="${a.key}" style="--x:${a.x};--y:${a.y};--size:${a.size}" type="button" aria-label="${esc(a.name)}">
        <img src="${a.img}" alt="${esc(a.name)}" onerror="this.style.display='none'">
        <span class="label">${esc(a.name)}</span>
      </button>`).join("");
    rolebar.innerHTML = AGENTS.map(a=>`
      <button class="rolechip ${state.selectedAgent===a.key?"active":""}" data-agent="${a.key}" type="button">
        <img src="${a.img}" alt="" onerror="this.style.display='none'"><span>${esc(a.label)}</span>
      </button>`).join("");
    document.querySelectorAll("[data-agent]").forEach(btn=>btn.addEventListener("click",()=>{
      state.selectedAgent = btn.getAttribute("data-agent") || "admin";
      const agent = AGENTS.find(x=>x.key===state.selectedAgent) || AGENTS[1];
      const s=$("officeStatus"); if(s) s.textContent = `เลือก ${agent.name} แล้ว`;
      renderAgents();
    }));
  }

  async function loadSummary(){
    try{
      const data = await apiJson("/summary");
      const s = data.summary || {};
      if($("statToday")) $("statToday").textContent = Number(s.today_count||0);
      if($("statTomorrow")) $("statTomorrow").textContent = Number(s.tomorrow_count||0);
      if($("statOpen")) $("statOpen").textContent = Number(s.open_count||0);
      if($("statUnpaid")) $("statUnpaid").textContent = Number(s.unpaid_count||0);
    }catch(e){
      const s=$("officeStatus"); if(s) s.textContent = "ยังโหลดสรุปงานไม่ได้: " + e.message;
    }
  }

  function openInbox(){
    $("customerInboxModal")?.classList.add("open");
    showCustomerList();
    loadInbox();
  }
  function closeInbox(){
    $("customerInboxModal")?.classList.remove("open");
    state.selectedConversation = null;
    state.messages = [];
    state.chatView = "list";
  }
  function showCustomerList(){
    state.chatView = "list";
    $("customerListScreen")?.classList.remove("hidden");
    $("selectedChatScreen")?.classList.add("hidden");
    const sub=$("lineTopSubtitle"); if(sub) sub.textContent = "เลือกแชทลูกค้า แล้วถาม AI ในแชทนั้นได้เลย";
  }
  function showSelectedChat(){
    state.chatView = "chat";
    $("customerListScreen")?.classList.add("hidden");
    $("selectedChatScreen")?.classList.remove("hidden");
    const sub=$("lineTopSubtitle"); if(sub) sub.textContent = "AI ไม่ส่ง LINE เอง แอดมินคัดลอกไปส่งเอง";
  }

  async function loadInbox(){
    const list=$("conversationList"); if(list) list.innerHTML = `<div class="emptyState">กำลังโหลดแชทลูกค้า...</div>`;
    try{
      const data = await apiJson("/line-inbox?limit=80");
      state.conversations = Array.isArray(data.conversations) ? data.conversations : [];
      renderConversationList();
    }catch(e){
      if(list) list.innerHTML = `<div class="emptyState">โหลดแชทลูกค้าไม่สำเร็จ<br>${esc(e.message)}</div>`;
    }
  }
  function renderConversationList(){
    const list=$("conversationList"); if(!list) return;
    if(!state.conversations.length){
      list.innerHTML = `<div class="emptyState">ยังไม่มีแชท LINE OA ในระบบ</div>`;
      return;
    }
    list.innerHTML = state.conversations.map(c=>{
      const name = clean(c.display_name || c.line_user_id_masked || `LINE #${c.id}`) || "ลูกค้า LINE";
      const text = clean(c.message_text_for_admin || c.last_message_text || "-");
      const time = c.last_message_at_display || c.last_message_at || "";
      const status = c.conversation_status || (c.unread ? "needs_reply" : "read");
      return `<button class="convItem" type="button" data-conv="${Number(c.id)}">
        <strong>${esc(name)}</strong>
        <p>${esc(text)}</p>
        <span class="convMeta"><span>${esc(status)}</span><span>${esc(time)}</span></span>
      </button>`;
    }).join("");
    list.querySelectorAll("[data-conv]").forEach(btn=>btn.addEventListener("click",()=>openConversation(Number(btn.getAttribute("data-conv")))));
  }

  async function openConversation(id){
    const conv = state.conversations.find(c=>Number(c.id)===Number(id)) || {id};
    state.selectedConversation = conv;
    state.messages = [];
    showSelectedChat();
    renderSelectedHeader();
    const box=$("chatMessages"); if(box) box.innerHTML = `<div class="emptyState">กำลังโหลดข้อความ...</div>`;
    try{
      const data = await apiJson(`/line-conversations/${encodeURIComponent(id)}/messages?limit=80`);
      state.selectedConversation = data.conversation || conv;
      state.messages = Array.isArray(data.messages) ? data.messages : [];
      renderSelectedHeader();
      renderMessages();
    }catch(e){
      if(box) box.innerHTML = `<div class="emptyState">โหลดข้อความไม่สำเร็จ<br>${esc(e.message)}</div>`;
    }
  }
  function renderSelectedHeader(){
    const c = state.selectedConversation || {};
    const name = clean(c.display_name || c.line_user_id_masked || `LINE #${c.id}`) || "ลูกค้า LINE";
    if($("selectedCustomerName")) $("selectedCustomerName").textContent = name;
    if($("selectedCustomerSubtitle")) $("selectedCustomerSubtitle").textContent = c.conversation_status ? `สถานะ: ${c.conversation_status}` : "แชทลูกค้า LINE OA";
  }
  function renderMessages(){
    const box=$("chatMessages"); if(!box) return;
    if(!state.messages.length){
      box.innerHTML = `<div class="emptyState">ยังไม่มีข้อความในแชทนี้</div>`;
      return;
    }
    box.innerHTML = state.messages.map(m=>{
      const dir = String(m.direction||"inbound").toLowerCase();
      const cls = dir === "inbound" ? "customer" : "admin";
      const label = dir === "inbound" ? "ลูกค้า" : "แอดมิน/ระบบ";
      const text = clean(m.message_text_for_admin || m.message_text || "-");
      const time = m.received_at_display || "";
      return `<article class="msg ${cls}">${esc(text)}<small>${esc(label)}${time?" • "+esc(time):""}</small></article>`;
    }).join("");
    scrollChatToBottom();
  }
  function appendAskBubble(text){
    const box=$("chatMessages"); if(!box) return;
    const article=document.createElement("article"); article.className="msg ask"; article.textContent=text;
    box.appendChild(article); scrollChatToBottom();
  }
  function appendLoadingBubble(){
    const box=$("chatMessages"); if(!box) return null;
    const article=document.createElement("article"); article.className="msg ai loading"; article.innerHTML=`กำลังร่างคำตอบลูกค้า...`;
    box.appendChild(article); scrollChatToBottom();
    return article;
  }
  function appendAiReplyBubble(draft){
    const box=$("chatMessages"); if(!box) return;
    const reply = clean(draft?.customer_reply || draft?.answer || "");
    const customer = latestCustomerText();
    const article=document.createElement("article");
    article.className="msg ai";
    article.innerHTML = `
      <span class="aiTitle">ข้อความพร้อมส่งลูกค้า</span>
      <textarea class="replyEdit" rows="4">${esc(reply)}</textarea>
      <div class="aiActions">
        <button class="ghostBtn copyReply" type="button">คัดลอกข้อความนี้</button>
        <button class="ghostBtn saveExample" type="button">บันทึกเป็นตัวอย่างคำตอบ</button>
      </div>`;
    const textarea = article.querySelector("textarea");
    const copyBtn = article.querySelector(".copyReply");
    const saveBtn = article.querySelector(".saveExample");
    textarea.addEventListener("input",()=>autoGrow(textarea));
    setTimeout(()=>autoGrow(textarea),0);
    copyBtn.addEventListener("click",()=>copyReply(textarea, draft, customer));
    saveBtn.addEventListener("click",()=>saveExampleFromReply(textarea, draft, customer));
    box.appendChild(article); scrollChatToBottom();
  }
  async function copyReply(textarea, draft, customerMessage){
    const text = clean(textarea?.value || "");
    if(!text) return toast("ยังไม่มีข้อความให้คัดลอก");
    try{
      await navigator.clipboard.writeText(text);
      toast("คัดลอกข้อความแล้ว");
      apiJson("/reply-learning/event",{
        method:"POST",
        body:JSON.stringify({
          event_type:"copied",
          conversation_id: state.selectedConversation?.id || null,
          agent_key: state.selectedAgent || "admin",
          situation_type: inferSituation(`${customerMessage}\n${text}`),
          customer_message: customerMessage,
          ai_reply: draft?.customer_reply || "",
          final_admin_reply: text,
          admin_question: draft?.admin_question || "",
          source:"customer_chat_copy"
        })
      }).catch(()=>{});
    }catch(e){ toast("คัดลอกไม่สำเร็จ"); }
  }
  async function saveExampleFromReply(textarea, draft, customerMessage){
    const finalText = clean(textarea?.value || "");
    if(!customerMessage || !finalText) return toast("ต้องมีข้อความลูกค้าและคำตอบก่อนบันทึก");
    try{
      await apiJson("/reply-examples",{
        method:"POST",
        body:JSON.stringify({
          agent_key: state.selectedAgent || "admin",
          situation_type: inferSituation(`${customerMessage}\n${finalText}`),
          customer_message: customerMessage,
          final_admin_reply: finalText,
          language: detectLanguage(customerMessage || finalText),
          service_type:"air_service",
          tags: [],
          conversation_id: state.selectedConversation?.id || null,
          source:"ai_bubble_save"
        })
      });
      toast("บันทึกเป็นตัวอย่างคำตอบแล้ว");
    }catch(e){ toast("บันทึกไม่สำเร็จ: " + e.message); }
  }
  function scrollChatToBottom(){
    const box=$("chatMessages"); if(box) setTimeout(()=>{ box.scrollTop = box.scrollHeight; },30);
  }

  async function askAi(){
    if(state.loadingDraft) return;
    const qEl=$("aiQuestion");
    const question=clean(qEl?.value || "");
    if(!state.selectedConversation?.id) return toast("กรุณาเลือกแชทลูกค้าก่อน");
    if(!question) return toast("พิมพ์สิ่งที่ต้องการให้ AI ช่วยก่อน");
    state.loadingDraft = true;
    const btn=$("btnAskAi"); if(btn) btn.disabled = true;
    appendAskBubble(question);
    if(qEl){ qEl.value=""; autoGrow(qEl); }
    const loading = appendLoadingBubble();
    try{
      const data = await apiJson("/line-draft-reply",{
        method:"POST",
        body:JSON.stringify({
          conversation_id: state.selectedConversation.id,
          admin_question: question,
          instruction: question,
          agent: state.selectedAgent || "admin"
        })
      });
      if(loading) loading.remove();
      const draft = data.draft || { customer_reply:data.answer || "" };
      draft.admin_question = question;
      state.latestDraft = draft;
      appendAiReplyBubble(draft);
    }catch(e){
      if(loading) loading.innerHTML = `ร่างคำตอบไม่สำเร็จ: ${esc(e.message)}`;
      toast("AI ตอบไม่ได้: " + e.message);
    }finally{
      state.loadingDraft = false;
      if(btn) btn.disabled = false;
    }
  }

  async function saveManualExample(e){
    e.preventDefault();
    const customer = clean($("exCustomer")?.value || "");
    const reply = clean($("exReply")?.value || "");
    if(!customer || !reply) return toast("กรอกข้อความลูกค้าและคำตอบแอดมินก่อน");
    try{
      await apiJson("/reply-examples",{
        method:"POST",
        body:JSON.stringify({
          agent_key:"admin",
          situation_type: $("exSituation")?.value || inferSituation(`${customer}\n${reply}`),
          customer_message: customer,
          final_admin_reply: reply,
          language: detectLanguage(customer || reply),
          service_type:"air_service",
          tags: clean($("exTags")?.value || "").split(/[,#|\n]/).map(x=>clean(x)).filter(Boolean),
          source:"manual_owner_entry"
        })
      });
      toast("เพิ่มเข้าคลังคำตอบแล้ว");
      $("exCustomer").value=""; $("exReply").value=""; $("exTags").value="";
    }catch(err){ toast("บันทึกไม่สำเร็จ: " + err.message); }
  }
  async function showExampleCount(){
    try{
      const data = await apiJson("/reply-examples?limit=1&active_only=true");
      const total = Array.isArray(data.examples) ? data.examples.length : 0;
      toast(total ? "คลังคำตอบใช้งานได้" : "ยังไม่มีตัวอย่าง หรือยังโหลดไม่พบ");
    }catch(e){ toast("โหลดคลังคำตอบไม่ได้: "+e.message); }
  }

  function bind(){
    $("btnOpenInbox")?.addEventListener("click", openInbox);
    $("btnReload")?.addEventListener("click", ()=>{ loadSummary(); if($("customerInboxModal")?.classList.contains("open")) loadInbox(); });
    $("btnCloseInbox")?.addEventListener("click", closeInbox);
    $("btnReloadInbox")?.addEventListener("click", loadInbox);
    $("btnBackToList")?.addEventListener("click", showCustomerList);
    $("btnAskAi")?.addEventListener("click", askAi);
    $("aiQuestion")?.addEventListener("input", (e)=>autoGrow(e.target));
    $("aiQuestion")?.addEventListener("keydown", (e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); askAi(); } });
    $("btnToggleMemory")?.addEventListener("click", ()=>$("replyMemoryPanel")?.classList.toggle("open"));
    $("replyExampleForm")?.addEventListener("submit", saveManualExample);
    $("btnLoadExamples")?.addEventListener("click", showExampleCount);
    document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && $("customerInboxModal")?.classList.contains("open")) closeInbox(); });
  }

  function init(){
    bind();
    renderAgents();
    loadSummary();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
