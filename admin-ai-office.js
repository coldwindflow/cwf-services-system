(function(){
  const VERSION = "ai-office-agent-first-20260607c";
  const ASSET_ROOT = "/assets/ai-office-final";
  const CHARACTER_ROOT = `${ASSET_ROOT}/characters-clean`;
  const roles = ["admin","sales","ops","ads","content","dev"];
  const state = { activeAgent:null, activeTab:"commands", summary:null, walkTimers:{}, bubbleTimers:{}, expanded:false };

  const roleLabels = { admin:"Admin", sales:"Sales", ops:"Ops", ads:"Ads", content:"Content", dev:"Dev" };
  const agents = {
    admin:{name:"Admin AI",color:"#1558d6",role:"ผู้ช่วยแอดมิน: สรุปงาน ร่างข้อความลูกค้า แจ้งช่าง แปลภาษา",status:"พร้อมช่วยงานแอดมิน",home:{x:25,y:58},mobile:{x:22,y:56},work:{x:27,y:55},commands:["วันนี้มีงานอะไรบ้าง","ร่างข้อความยืนยันนัดลูกค้า","ร่างข้อความแจ้งช่าง","ดูแชท LINE ล่าสุด"]},
    sales:{name:"Sales AI",color:"#f0b400",role:"ผู้ช่วยฝ่ายขาย: ปิดการขาย ตอบราคา แนะนำแพ็กเกจ",status:"พร้อมช่วยปิดการขาย",home:{x:73,y:61},mobile:{x:74,y:56},work:{x:70,y:56},commands:["ลูกค้าบอกว่าแพง ตอบยังไงดี","ช่วยเขียนข้อความปิดการขาย","ร่างตอบลูกค้าจาก LINE","วิเคราะห์ปิดการขายน้อย"]},
    ops:{name:"Ops AI",color:"#13a46b",role:"ผู้ช่วยคิวงาน: วันนี้ พรุ่งนี้ งานค้าง งานยังไม่จ่าย",status:"พร้อมคุมคิวงาน",home:{x:50,y:42},mobile:{x:50,y:38},work:{x:50,y:51},commands:["พรุ่งนี้มีงานอะไรบ้าง","งานไหนยังไม่ปิด","งานไหนยังไม่จ่าย","ผู้ช่วยเตรียมลงคิว"]},
    ads:{name:"Ads AI",color:"#ef5aa3",role:"ผู้ช่วยโฆษณา: keyword พื้นที่ยิงแอด ข้อความโฆษณา",status:"พร้อมคิดแคมเปญ",home:{x:19,y:35},mobile:{x:21,y:36},work:{x:23,y:43},commands:["ช่วยคิด keyword จากงานจริง","พื้นที่ไหนควรยิงแอด","เขียนข้อความโฆษณาล้างแอร์","ไอเดีย TikTok Ads"]},
    content:{name:"Content AI",color:"#8b5cf6",role:"ผู้ช่วยคอนเทนต์: โพสต์ แคปชัน รีวิว สคริปต์",status:"พร้อมสร้างคอนเทนต์",home:{x:29,y:77},mobile:{x:30,y:70},work:{x:32,y:63},commands:["เขียนแคปชันจากงานวันนี้","ทำสคริปต์ Reels 30 วินาที","ไอเดียโพสต์จากงานจริง","ร่างโพสต์รีวิว"]},
    dev:{name:"Dev AI",color:"#334155",role:"ผู้ช่วยระบบ: ตรวจระบบ checklist rollback และ prompt Codex",status:"พร้อมตรวจระบบ",home:{x:82,y:37},mobile:{x:79,y:36},work:{x:76,y:44},commands:["ตรวจระบบทั้งหมด","ทำ Checklist ก่อน Deploy","ทำ Rollback Notes","เขียน Prompt ส่ง Codex"]}
  };
  function asset(role,stateName){ return `${CHARACTER_ROOT}/${role}/${stateName}.png`; }
  function isMobile(){ return window.matchMedia("(max-width: 899px)").matches; }
  function $(sel,root=document){ return root.querySelector(sel); }
  function $all(sel,root=document){ return Array.from(root.querySelectorAll(sel)); }
  function agentEl(role){ return $(`.agent[data-agent="${role}"]`); }
  function agentConfig(role){ return agents[role] || agents.admin; }
  function safeText(v){ return String(v==null?"":v); }

  function preload(){
    const urls = [`${ASSET_ROOT}/maps-clean/office-main-mobile.png`, `${ASSET_ROOT}/maps-clean/office-main-desktop.png`, `${ASSET_ROOT}/brand/logo-mark.png`];
    roles.forEach(r => ["idle","thinking","talking","working","walk-1","walk-2","walk-3","walk-4"].forEach(s => urls.push(asset(r,s))));
    urls.forEach(src => { const img = new Image(); img.decoding="async"; img.src=src; });
  }
  function placeAgent(role,point){
    const el = agentEl(role); if(!el || !point) return;
    const sizeMapMobile = {admin:54,sales:52,ops:54,ads:52,content:54,dev:52};
    const sizeMapDesktop = {admin:82,sales:82,ops:86,ads:78,content:80,dev:78};
    const size = isMobile() ? sizeMapMobile[role] : sizeMapDesktop[role];
    el.style.setProperty("--x", `${point.x}%`); el.style.setProperty("--y", `${point.y}%`); el.style.setProperty("--depth", Math.round(point.y)); el.style.setProperty("--agent-size", `${size}px`); el.style.setProperty("--agent-size-desktop", `${size}px`);
  }
  function setSprite(role,stateName){
    const img = agentEl(role)?.querySelector(".npcSprite"); if(!img) return;
    img.src = asset(role,stateName || "idle");
    img.onerror = () => { if(!img.dataset.fallback){ img.dataset.fallback="1"; img.src = `${ASSET_ROOT}/characters/${role}/idle.png`; } };
  }
  function setupAgents(){
    roles.forEach(role => { const point = isMobile() ? agents[role].mobile : agents[role].home; placeAgent(role,point); setSprite(role,"idle"); const el = agentEl(role); if(el){ el.querySelector(".npcName").textContent = agents[role].name; el.style.setProperty("--selected", agents[role].color); } });
  }
  function setupSelector(){
    const row = $("#agentSelector"); if(!row) return;
    row.innerHTML = roles.map(role => `<button class="agent-chip" type="button" data-agent-chip="${role}"><span class="agent-chip-avatar" style="background-image:url('${asset(role,"idle")}')"></span>${roleLabels[role]}</button>`).join("");
    row.addEventListener("click", e => { const btn = e.target.closest("[data-agent-chip]"); if(btn) selectAgent(btn.dataset.agentChip, true); });
  }
  function setTab(tab){
    state.activeTab = tab || "commands";
    $all(".consoleTab").forEach(b => b.classList.toggle("active", b.dataset.tab === state.activeTab));
    $all(".tabPane").forEach(p => p.classList.remove("active"));
    const pane = state.activeTab === "chat" ? "chatPane" : state.activeTab === "phone" ? "phonePane" : "commandsPane";
    $(`#${pane}`)?.classList.add("active");
    openConsole(state.activeTab === "chat" ? "expanded" : "open");
  }
  function openConsole(mode="open"){
    const panel = $("#commandConsole"); if(!panel) return;
    panel.classList.add("open"); panel.classList.toggle("expanded", mode === "expanded"); state.expanded = mode === "expanded";
  }
  function collapseConsole(){
    const panel = $("#commandConsole"); if(!panel) return;
    panel.classList.toggle("expanded"); state.expanded = panel.classList.contains("expanded");
  }
  function updateConsoleAgent(){
    const role = state.activeAgent || "admin"; const a = agentConfig(role);
    $("#agentName").textContent = a.name; $("#agentRole").textContent = a.role; $("#agentStatus").textContent = a.status;
    const avatar = $("#agentAvatar"); if(avatar){ avatar.style.backgroundImage = `url('${asset(role,"idle")}')`; }
    document.documentElement.style.setProperty("--selected", a.color);
    $all(".agent-chip").forEach(ch => ch.classList.toggle("active", ch.dataset.agentChip === role));
    renderQuickActions();
  }
  function renderQuickActions(){
    const box = $("#quickCommands"); if(!box) return; const role = state.activeAgent || "admin"; const a = agentConfig(role);
    box.innerHTML = a.commands.map(text => `<button class="quickBtn" type="button" data-command="${escapeAttr(text)}">${escapeHtml(text)}</button>`).join("");
  }
  function escapeHtml(s){ return safeText(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }
  function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }
  function hideBubbles(except){ roles.forEach(role => { if(role!==except) agentEl(role)?.classList.remove("has-bubble"); if(state.bubbleTimers[role]) clearTimeout(state.bubbleTimers[role]); }); }
  function showBubble(role,text,ms=2300){
    if(role !== state.activeAgent) return; hideBubbles(role); const el=agentEl(role), b=el?.querySelector(".npcBubble"); if(!el||!b) return;
    b.textContent = shorten(text || "พร้อมช่วยครับ", 44); el.classList.add("has-bubble"); if(state.bubbleTimers[role]) clearTimeout(state.bubbleTimers[role]); state.bubbleTimers[role]=setTimeout(()=> el.classList.remove("has-bubble"),ms);
  }
  function shorten(s,max){ s=safeText(s).replace(/\s+/g," ").trim(); return s.length>max ? `${s.slice(0,max-1)}…` : s; }
  function clearWalk(role){ if(state.walkTimers[role]){ clearInterval(state.walkTimers[role]); state.walkTimers[role]=null; } }
  function setAgentState(role,next){
    const el=agentEl(role); if(!el) return; ["idle","walking","thinking","talking","working"].forEach(n=>el.classList.toggle(n,n===next));
    if(next==="walking"){ let i=1; setSprite(role,"walk-1"); clearWalk(role); state.walkTimers[role]=setInterval(()=>{ i=i>=4?1:i+1; setSprite(role,`walk-${i}`); },170); }
    else { clearWalk(role); setSprite(role,next==="idle"?"idle":next); }
  }
  function moveAgent(role,target="work"){
    const a=agentConfig(role); const point = target==="home" ? (isMobile()?a.mobile:a.home) : a.work || a.home;
    setAgentState(role,"walking"); placeAgent(role,point);
    return new Promise(res => setTimeout(()=>{ setAgentState(role,"idle"); res(); },760));
  }
  async function selectAgent(role,fromChip=false){
    if(!agents[role]) role="admin"; state.activeAgent=role;
    $all(".agent").forEach(el => el.classList.toggle("selected", el.dataset.agent===role));
    updateConsoleAgent(); openConsole("open"); setTab("commands"); hideBubbles(role); showBubble(role, agents[role].status, 2200);
    if(!fromChip) moveAgent(role,"work");
  }
  function addMessage(kind,text){
    const box=$("#messages"); if(!box) return null;
    if(box.children.length===1 && box.textContent.includes("เลือกตัวละคร")) box.innerHTML="";
    const msg=document.createElement("div"); msg.className=`msg ${kind}`; msg.textContent=text;
    if(kind==="ai" && text && !text.includes("กำลังอ่าน")){
      const btn=document.createElement("button"); btn.type="button"; btn.className="copy"; btn.textContent="คัดลอก"; btn.addEventListener("click",()=>copyText(text)); msg.appendChild(btn);
    }
    box.appendChild(msg); box.scrollTop=box.scrollHeight; return msg;
  }
  async function copyText(text){ try{ await navigator.clipboard.writeText(text); }catch(_){ const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); } }
  async function requestJson(url,options={}){
    const res = await fetch(url,{credentials:"include",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const data = await res.json().catch(()=>({ok:false,error:"อ่านข้อมูลไม่สำเร็จ"}));
    if(!res.ok || data.ok===false) throw new Error(data.error || `HTTP ${res.status}`); return data;
  }
  async function loadSummary(){
    try{ const data=await requestJson("/admin/ai-office/summary"); const s=data.summary||{}; state.summary=s; $("#statToday").textContent=s.today_count ?? 0; $("#statTomorrow").textContent=s.tomorrow_count ?? 0; $("#statOpen").textContent=s.open_count ?? 0; $("#statUnpaid").textContent=s.unpaid_count ?? 0; }
    catch(e){ addMessage("system",`โหลดสถานะงานไม่ได้: ${e.message}`); }
  }
  async function ask(question){
    question = safeText(question).trim(); if(!question) return; const role = state.activeAgent || "admin"; if(!state.activeAgent) selectAgent(role,true); setTab("chat"); addMessage("user",question); const loading=addMessage("ai","กำลังอ่านข้อมูลจริง..."); setAgentState(role,"thinking"); showBubble(role,"กำลังอ่านข้อมูลจริง...",2400);
    try{
      const phone = $("#phoneInput")?.value || "";
      const data = await requestJson("/admin/ai-office/ask",{method:"POST",body:JSON.stringify({question,agent:role,phone})});
      loading.remove(); const answer = data.answer || "ไม่มีคำตอบจาก AI Office"; addMessage("ai",answer); setAgentState(role,"talking"); showBubble(role,"ดูคำตอบเต็มในแชท",2600); setTimeout(()=>setAgentState(role,"idle"),2300);
    }catch(e){ loading.remove(); addMessage("system",`AI Office ตอบไม่ได้: ${e.message}`); setAgentState(role,"idle"); showBubble(role,"ต้องตรวจเพิ่มครับ",2200); }
  }
  async function searchPhone(){
    setTab("phone"); const phone = safeText($("#phoneInput")?.value).trim(); const box=$("#phoneResult"); if(!box) return; box.innerHTML=`<div class="msg ai">กำลังค้นงานจริง...</div>`;
    try{ const data=await requestJson(`/admin/ai-office/search-by-phone?phone=${encodeURIComponent(phone)}`); const jobs=data.jobs||[]; if(!jobs.length){ box.innerHTML=`<div class="msg ai">ไม่พบงานจากเบอร์นี้ หรือข้อมูลยังไม่พอ</div>`; return; }
      box.innerHTML = jobs.map(j => `<div class="resultCard"><b>${escapeHtml(j.booking_code || j.job_id || "งาน")}</b>${escapeHtml(j.customer_name||"-")} · ${escapeHtml(j.customer_phone||"-")}<br>${escapeHtml(j.job_type||"-")} · ${escapeHtml(j.appointment_datetime||"ไม่ระบุวันเวลา")}<br>สถานะ: ${escapeHtml(j.job_status||"-")} / ชำระ: ${escapeHtml(j.payment_status||"-")}</div>`).join("");
    }catch(e){ box.innerHTML=`<div class="msg system">ค้นงานไม่ได้: ${escapeHtml(e.message)}</div>`; }
  }
  function bind(){
    $all(".agent").forEach(el => el.addEventListener("click",()=>selectAgent(el.dataset.agent)));
    $("#consoleToggle")?.addEventListener("click",collapseConsole); $("#btnRefresh")?.addEventListener("click",loadSummary);
    $all(".consoleTab").forEach(btn => btn.addEventListener("click",()=>setTab(btn.dataset.tab)));
    $("#quickCommands")?.addEventListener("click",e=>{ const btn=e.target.closest("[data-command]"); if(btn) ask(btn.dataset.command); });
    $("#btnAsk")?.addEventListener("click",()=>{ const input=$("#askInput"); const q=input.value.trim(); if(q){ input.value=""; ask(q); } });
    $("#askInput")?.addEventListener("focus",()=>setTab("chat"));
    $("#askInput")?.addEventListener("keydown",e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); $("#btnAsk")?.click(); } });
    $("#btnPhone")?.addEventListener("click",searchPhone); $("#phoneInput")?.addEventListener("focus",()=>setTab("phone")); $("#phoneInput")?.addEventListener("keydown",e=>{ if(e.key==="Enter") searchPhone(); });
    window.addEventListener("resize",()=>{ setupAgents(); if(state.activeAgent){ agentEl(state.activeAgent)?.classList.add("selected"); } });
  }
  async function init(){
    preload(); setupSelector(); setupAgents(); bind(); updateConsoleAgent(); await loadSummary();
    setTimeout(()=>{ if(!state.activeAgent) { $("#commandConsole")?.classList.remove("open","expanded"); } },100);
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",init); else init();
})();
