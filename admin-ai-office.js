(function(){
  const VERSION = "ai-office-v5-pixel-engine";
  const WORLD = { w: 1600, h: 920, grid: 40 };
  const ASSET_BASE = "/assets/ai-office-v5";
  const defaultAgents = {
    admin:{name:"Admin AI",color:"#1558d6",accent:"#ffcc00",role:"แอดมินประจำออฟฟิศ สรุปงาน ร่างข้อความลูกค้า แจ้งช่าง และแปลภาษา",status:"พร้อมช่วยงานแอดมิน",greeting:"ผมอยู่ที่โต๊ะแอดมิน พร้อมสรุปงานจริงและร่างข้อความให้ใช้ต่อได้ทันที",thinking:"กำลังตรวจข้อมูลงานจริง",talking:"สรุปให้แล้วครับ",workstation:"adminDesk",home:{x:330,y:520},commands:["วันนี้มีงานอะไรบ้าง","ร่างข้อความยืนยันนัดลูกค้า","ร่างข้อความแจ้งช่าง","แปลข้อความลูกค้าให้สุภาพ"]},
    sales:{name:"Sales AI",color:"#0d3d8d",accent:"#ffcc00",role:"ฝ่ายขาย ช่วยตอบลูกค้า ปิดการขาย แนะนำแพ็กเกจ และตอบเรื่องราคา",status:"พร้อมช่วยปิดการขาย",greeting:"ผมพร้อมช่วยตอบลูกค้าให้สุภาพ ชัดเจน และเพิ่มโอกาสปิดงาน",thinking:"กำลังดูมุมปิดการขาย",talking:"ได้แนวตอบฝ่ายขายแล้วครับ",workstation:"salesDesk",home:{x:620,y:495},commands:["ลูกค้าบอกว่าแพง ตอบยังไงดี","แนะนำแพ็กเกจจากงานที่มี","ช่วยเขียนข้อความปิดการขาย","ทำไมยอดปิดการขายอาจต่ำ"]},
    ops:{name:"Ops AI",color:"#13a46b",accent:"#ffcc00",role:"หัวหน้าคิวงาน ดูงานวันนี้ พรุ่งนี้ งานยังไม่ปิด งานยังไม่จ่าย และความเสี่ยง",status:"พร้อมคุมคิวงาน",greeting:"ผมอยู่หน้า Operations Board พร้อมดูคิว งานค้าง และความเสี่ยงจากข้อมูลจริง",thinking:"กำลังตรวจคิวและความเสี่ยง",talking:"เจอประเด็นที่ต้องดูแล้วครับ",workstation:"opsBoard",home:{x:1115,y:510},commands:["วันนี้มีอะไรต้องระวังไหม","พรุ่งนี้มีงานอะไรบ้าง","งานไหนยังไม่จ่าย","งานไหนยังไม่ปิด"]},
    ads:{name:"Ads AI",color:"#ef5aa3",accent:"#ffcc00",role:"ฝ่ายการตลาด ช่วยคิด Google Ads, Facebook Ads, TikTok Ads, keyword และพื้นที่ยิงแอด",status:"พร้อมคิดแคมเปญ",greeting:"ผมจะช่วยมองงานจริงให้เป็นไอเดียโฆษณา คำค้น และพื้นที่ยิงแอด",thinking:"กำลังหาโอกาสการตลาด",talking:"ได้ไอเดียแคมเปญแล้วครับ",workstation:"adsDesk",home:{x:300,y:735},commands:["ช่วยคิด keyword จากงานจริง","พื้นที่ไหนควรยิงแอด","เขียนข้อความโฆษณาล้างแอร์","ไอเดีย TikTok Ads จากงานช่วงนี้"]},
    content:{name:"Content AI",color:"#8b5cf6",accent:"#ffcc00",role:"ฝ่ายคอนเทนต์ ช่วยเขียนโพสต์ แคปชัน รีวิว และสคริปต์ Reels/TikTok",status:"พร้อมสร้างคอนเทนต์",greeting:"ผมพร้อมเรียบเรียงงานจริงให้เป็นโพสต์ แคปชัน หรือสคริปต์ที่ใช้ได้ทันที",thinking:"กำลังเรียบเรียงคอนเทนต์",talking:"ร่างคอนเทนต์ให้แล้วครับ",workstation:"contentDesk",home:{x:655,y:745},commands:["เขียนแคปชันจากงานวันนี้","ทำสคริปต์ Reels 30 วินาที","ไอเดียโพสต์จากงานจริง","ร่างข้อความรีวิวให้ลูกค้า"]},
    dev:{name:"Dev AI",color:"#334155",accent:"#ffcc00",role:"ฝ่ายระบบ ช่วยเขียน prompt สรุปบั๊ก checklist deploy และตรวจความเสี่ยง",status:"พร้อมตรวจระบบ",greeting:"ผมพร้อมช่วยทำเช็กลิสต์ระบบ สรุปความเสี่ยง และเขียน prompt สำหรับงานภายใน",thinking:"กำลังตรวจมุมระบบ",talking:"ได้ข้อสรุประบบแล้วครับ",workstation:"devDesk",home:{x:1225,y:745},commands:["ทำ checklist ก่อน deploy","สรุปความเสี่ยงของ AI Office","ช่วยเขียน prompt สำหรับแอดมิน","ตรวจว่ามีอะไรห้ามแก้ข้อมูลไหม"]},
  };
  let agents = JSON.parse(JSON.stringify(defaultAgents));
  const zones = {
    adminDesk:{x:285,y:420,label:"Admin Desk"},salesDesk:{x:610,y:400,label:"Sales Desk"},opsBoard:{x:1220,y:385,label:"Ops Board"},
    adsDesk:{x:285,y:650,label:"Ads Desk"},contentDesk:{x:640,y:680,label:"Content Desk"},devDesk:{x:1245,y:680,label:"Dev Desk"},meetingTable:{x:840,y:570,label:"Meeting Table"}
  };
  const blockedRects = [
    {x:135,y:335,w:300,h:145},{x:470,y:315,w:300,h:145},{x:1080,y:295,w:310,h:160},
    {x:135,y:575,w:300,h:145},{x:500,y:600,w:300,h:145},{x:1095,y:600,w:300,h:150},{x:690,y:500,w:320,h:120}
  ];
  const state = {pin:"",pinRequired:false,activeAgent:"admin",loadingAsk:false,greeted:new Set(),agentStates:{},positions:{},paths:{},bubbles:{},lastAnswer:"",consoleFull:false,summary:{},images:{},frame:0};
  const canvas = () => document.getElementById("officeCanvas");
  const ctx = () => canvas().getContext("2d");
  const $ = (id) => document.getElementById(id);
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
  function money(value){ return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 0 }); }
  function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function agentConfig(k){return agents[k]||agents.admin;}
  function activeAgent(){return agentConfig(state.activeAgent);}
  function worldFromEvent(e){
    const rect=canvas().getBoundingClientRect();
    const touch=e.touches&&e.touches[0]?e.touches[0]:e;
    return {x:(touch.clientX-rect.left)/rect.width*WORLD.w,y:(touch.clientY-rect.top)/rect.height*WORLD.h};
  }
  function loadLocalAgents(){
    try{
      const saved=localStorage.getItem("cwfAiOfficeAgentsV5");
      if(saved){
        const parsed=JSON.parse(saved);
        if(parsed && typeof parsed==="object") agents=Object.assign(JSON.parse(JSON.stringify(defaultAgents)), parsed);
      }
    }catch(_){}
  }
  async function loadAgentConfig(){
    loadLocalAgents();
    try{
      const res=await fetch(`${ASSET_BASE}/agents.json`,{cache:"no-store"});
      if(res.ok){
        const data=await res.json();
        if(Array.isArray(data.agents)){
          const fromFile={};
          data.agents.forEach(a=>{
            if(!a.key) return;
            fromFile[a.key]={
              name:a.displayName||a.name||a.key,
              color:a.color||defaultAgents[a.key]?.color||"#1558d6",
              accent:a.accent||"#ffcc00",
              role:a.role||"",
              status:a.status||"พร้อมช่วยงาน",
              greeting:a.greeting||a.status||"พร้อมช่วยงาน",
              thinking:a.thinking||"กำลังคิดจากข้อมูลจริง",
              talking:a.talking||"จัดการให้แล้วครับ",
              workstation:a.workstation||"meetingTable",
              home:a.home||{x:800,y:700},
              commands:a.commands||[]
            };
          });
          agents=Object.assign(agents, fromFile);
          loadLocalAgents();
        }
      }
    }catch(_){}
  }
  function refreshAiOfficeCache(){
    try{
      console.info(`CWF AI Office ${VERSION}`);
      if("serviceWorker" in navigator){
        navigator.serviceWorker.getRegistration().then(reg=>{if(reg){reg.update().catch(()=>{});if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});}}).catch(()=>{});
      }
      if("caches" in window){
        caches.keys().then(keys=>Promise.all(keys.map(async key=>{
          const c=await caches.open(key);
          await Promise.all([c.delete("/admin/ai-office"),c.delete("/admin-ai-office.html"),c.delete("/admin-ai-office.js")]);
        }))).catch(()=>{});
      }
    }catch(_){}
  }
  function setAgentState(k,s){state.agentStates[k]=s; if(k===state.activeAgent) updateConsoleAgent();}
  function showAgentBubble(k,msg,duration=4200){state.bubbles[k]={text:msg||"",until:performance.now()+duration};}
  function setPosition(k,p){state.positions[k]={x:p.x,y:p.y};}
  function gridKey(c,r){return `${c},${r}`;}
  function cellFromPoint(p){return {c:clamp(Math.floor(p.x/WORLD.grid),0,Math.floor(WORLD.w/WORLD.grid)-1),r:clamp(Math.floor(p.y/WORLD.grid),0,Math.floor(WORLD.h/WORLD.grid)-1)};}
  function pointFromCell(cell){return {x:cell.c*WORLD.grid+WORLD.grid/2,y:cell.r*WORLD.grid+WORLD.grid/2};}
  function isBlockedCell(c,r){
    const p=pointFromCell({c,r});
    if(p.y<260) return true;
    return blockedRects.some(rect=>p.x>rect.x-15&&p.x<rect.x+rect.w+15&&p.y>rect.y-15&&p.y<rect.y+rect.h+20);
  }
  function findPath(start,end){
    const s=cellFromPoint(start), t=cellFromPoint(end);
    const cols=Math.floor(WORLD.w/WORLD.grid), rows=Math.floor(WORLD.h/WORLD.grid);
    const q=[s], came={}, seen=new Set([gridKey(s.c,s.r)]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    while(q.length){
      q.sort((a,b)=>(Math.abs(a.c-t.c)+Math.abs(a.r-t.r))-(Math.abs(b.c-t.c)+Math.abs(b.r-t.r)));
      const cur=q.shift();
      if(cur.c===t.c&&cur.r===t.r) break;
      dirs.forEach(([dc,dr])=>{
        const n={c:cur.c+dc,r:cur.r+dr};
        const key=gridKey(n.c,n.r);
        if(n.c<0||n.r<0||n.c>=cols||n.r>=rows||seen.has(key)||isBlockedCell(n.c,n.r)) return;
        seen.add(key); came[key]=cur; q.push(n);
      });
    }
    const out=[]; let cur=t; let guard=0;
    while(cur && guard++<500){
      out.unshift(pointFromCell(cur));
      if(cur.c===s.c&&cur.r===s.r) break;
      cur=came[gridKey(cur.c,cur.r)];
    }
    if(out.length<2) return [start,end];
    out[0]=start; out[out.length-1]=end;
    return out;
  }
  function moveAgent(k,targetKey){
    const target=zones[targetKey]||agentConfig(k).home;
    const start=state.positions[k]||agentConfig(k).home;
    const path=findPath(start,target);
    state.paths[k]={path,index:0,target,started:performance.now(),speed:230};
    setAgentState(k,"walking");
    showAgentBubble(k,"กำลังเดินไปประสานงาน",1600);
    return new Promise(resolve=>{state.paths[k].resolve=resolve;});
  }
  function moveAgentToHome(k){return moveAgent(k,"home");}
  function moveSelectedAgentToWorkstation(){return moveAgent(state.activeAgent,activeAgent().workstation);}
  function choosePrimaryAgentForCommand(text){
    const v=String(text||"").toLowerCase();
    if(/แพง|ปิดการขาย|ราคา|package|แพ็ก/.test(v))return"sales";
    if(/ยังไม่จ่าย|ยังไม่ปิด|พรุ่งนี้|วันนี้|ระวัง|คิว|open|unpaid|today|tomorrow/.test(v))return"ops";
    if(/โพสต์|คอนเทนต์|caption|แคปชัน|reels|tiktok|รีวิว/.test(v))return"content";
    if(/แอด|ads|keyword|facebook|google|พื้นที่/.test(v))return"ads";
    if(/codex|prompt|deploy|bug|บั๊ก|checklist|ระบบ/.test(v))return"dev";
    return state.activeAgent||"admin";
  }
  function coordinateAgentsForCommand(text,primary){
    let partner="";
    if(primary==="ops"&&/วันนี้|พรุ่งนี้|ยังไม่จ่าย|ยังไม่ปิด|ระวัง|คิว/.test(text))partner="admin";
    if(primary==="sales"&&/แพง|ราคา|ปิดการขาย/.test(text))partner="admin";
    if(primary==="ads"&&/โพสต์|คอนเทนต์/.test(text))partner="content";
    if(primary==="content"&&/แอด|ads|keyword/.test(text))partner="ads";
    if(partner&&partner!==primary){
      showAgentBubble(partner,"เข้ามาช่วยประสานงาน");
      moveAgent(partner,"meetingTable").then(()=>{setAgentState(partner,"working");setTimeout(()=>{if(partner!==state.activeAgent) moveAgent(partner,agentConfig(partner).workstation);},3800);});
    }
  }
  function orchestrateCommand(agentKey,text){
    const final=choosePrimaryAgentForCommand(text);
    if(final!==state.activeAgent) selectAgent(final,false,true);
    coordinateAgentsForCommand(text,final);
    return agents[final]?final:agentKey;
  }
  function apiHeaders(extra){const h=Object.assign({"Content-Type":"application/json"},extra||{});if(state.pin)h["x-ai-office-pin"]=state.pin;return h;}
  async function apiFetchJson(url,opt){if(typeof window.apiFetch==="function")return window.apiFetch(url,opt||{});const res=await fetch(url,opt||{});const data=await res.json().catch(()=>({}));if(!res.ok&&data&&!data.error)data.error=`HTTP ${res.status}`;return data;}
  async function apiGet(url){const data=await apiFetchJson(url,{headers:apiHeaders()});if(data&&(data.ok===false||data.error))throw new Error(data.error||"โหลดข้อมูลไม่สำเร็จ");return data;}
  async function apiPost(url,body){const data=await apiFetchJson(url,{method:"POST",headers:apiHeaders(),body:JSON.stringify(body||{})});if(data&&(data.ok===false||data.error))throw new Error(data.error||"ส่งคำถามไม่สำเร็จ");return data;}
  function showOverlay(show){$("pinOverlay")?.classList.toggle("show",!!show);if(show)setTimeout(()=>$("pinInput")?.focus(),80);}
  function setSummary(summary){
    state.summary=summary||{};
    $("statToday").textContent=money(summary?.today_count);$("statTomorrow").textContent=money(summary?.tomorrow_count);$("statOpen").textContent=money(summary?.open_count);$("statUnpaid").textContent=money(summary?.unpaid_count);
  }
  function updateConsoleAgent(){
    const a=activeAgent(), statusMap={idle:a.status,walking:"กำลังเดินไปที่จุดทำงาน",thinking:a.thinking,talking:a.talking,working:"กำลังทำงานที่โต๊ะ"};
    $("agentName").textContent=a.name;$("agentRole").textContent=a.role;$("agentStatus").textContent=statusMap[state.agentStates[state.activeAgent]]||a.status;$("agentAvatar")?.style.setProperty("--selected",a.color);$("askInput")?.setAttribute("placeholder",`ถาม ${a.name}`);renderCommands();
  }
  function renderCommands(){const box=$("quickCommands");if(!box)return;box.innerHTML=(activeAgent().commands||[]).map(cmd=>`<button class="quickBtn" type="button">${esc(cmd)}</button>`).join("");box.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",()=>ask(btn.textContent||"")));}
  function addMessage(role,text,copyable){
    const box=$("messages");if(!box)return null;const div=document.createElement("div");div.className=`msg ${role==="user"?"user":"ai"}`;div.textContent=text;
    if(copyable){const row=document.createElement("div");row.className="copyRow";const btn=document.createElement("button");btn.className="copy";btn.type="button";btn.textContent="คัดลอก";btn.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(text);btn.textContent="คัดลอกแล้ว";setTimeout(()=>btn.textContent="คัดลอก",1200);}catch(_){btn.textContent="คัดลอกไม่ได้";}});row.appendChild(btn);div.appendChild(row);}
    box.appendChild(div);box.scrollTop=box.scrollHeight;return div;
  }
  function addThinkingMessage(k){const box=$("messages");if(!box)return null;const div=document.createElement("div");div.className="msg ai";div.innerHTML=`<span class="thinkingLine"><i></i><i></i><i></i></span> ${esc(agentConfig(k).thinking)}`;box.appendChild(div);box.scrollTop=box.scrollHeight;return div;}
  function responsePreview(text,k){const clean=String(text||"").replace(/\s+/g," ").trim();return clean?clean.length>78?`${clean.slice(0,78)}...`:clean:agentConfig(k).talking;}
  function expandConsole(){state.consoleFull=true;$("commandConsole")?.classList.add("full");$("commandConsole")?.classList.remove("peek");}
  function peekConsole(){state.consoleFull=false;$("commandConsole")?.classList.add("peek");$("commandConsole")?.classList.remove("full");}
  function selectAgent(k,userTriggered=true,silent=false){
    if(!agents[k])k="admin";state.activeAgent=k;updateConsoleAgent();showAgentBubble(k,agentConfig(k).greeting);
    if(!state.agentStates[k])setAgentState(k,"idle");
    if(userTriggered){peekConsole();moveAgent(k,agentConfig(k).workstation).then(()=>setAgentState(k,"working"));}
    if(!silent&&(userTriggered||!state.greeted.has(k))){addMessage("ai",`${agentConfig(k).name}: ${agentConfig(k).greeting}`,false);state.greeted.add(k);}
  }
  async function loadSummary(){const data=await apiGet("/admin/ai-office/summary");setSummary(data.summary||{});}
  async function ask(question){
    const raw=String(question||$("askInput")?.value||"").trim();if(!raw||state.loadingAsk)return;
    const k=orchestrateCommand(state.activeAgent,raw), a=agentConfig(k);state.loadingAsk=true;expandConsole();if($("askInput"))$("askInput").value="";
    addMessage("user",`${a.name}: ${raw}`,false);showAgentBubble(k,"กำลังเดินไปที่โต๊ะทำงาน");await moveAgent(k,a.workstation);setAgentState(k,"thinking");showAgentBubble(k,a.thinking);
    const pending=addThinkingMessage(k);
    try{const data=await apiPost("/admin/ai-office/ask",{agent:k,question:raw,phone:$("phoneInput")?.value||""});if(pending)pending.remove();const answer=data.answer||"ไม่มีคำตอบจากข้อมูลที่มี";state.lastAnswer=answer;addMessage("ai",answer,true);if(data.context?.summary)setSummary(data.context.summary);setAgentState(k,"talking");showAgentBubble(k,responsePreview(answer,k));setTimeout(()=>{setAgentState(k,"working");showAgentBubble(k,a.talking);},3600);}
    catch(e){if(pending)pending.remove();const msg=e.message||"AI Office ตอบไม่ได้ในขณะนี้";addMessage("ai",msg,false);setAgentState(k,"talking");showAgentBubble(k,msg);setTimeout(()=>setAgentState(k,"working"),3600);}
    finally{state.loadingAsk=false;}
  }
  async function searchPhone(){
    const phone=String($("phoneInput")?.value||"").trim();expandConsole();const k=orchestrateCommand("admin","ค้นงานจากเบอร์ลูกค้า");
    if(!phone){addMessage("ai","กรุณาใส่เบอร์ลูกค้าก่อนค้นงาน",false);showAgentBubble(k,"ใส่เบอร์ลูกค้าก่อนนะครับ");return;}
    addMessage("user",`ค้นงานจากเบอร์ลูกค้า ${phone}`,false);await moveAgent(k,agentConfig(k).workstation);setAgentState(k,"thinking");showAgentBubble(k,"กำลังค้นใบงานจากเบอร์นี้");const pending=addThinkingMessage(k);
    try{const data=await apiGet(`/admin/ai-office/search-by-phone?phone=${encodeURIComponent(phone)}`);if(pending)pending.remove();const jobs=data.jobs||[];if(!jobs.length){addMessage("ai","ไม่พบงานจากเบอร์นี้ในระบบ",false);setAgentState(k,"talking");showAgentBubble(k,"ไม่พบงานจากเบอร์นี้");return;}const lines=jobs.slice(0,12).map(j=>{const when=j.appointment_datetime?new Date(j.appointment_datetime).toLocaleString("th-TH"):"-";return `${j.booking_code||"#"+j.job_id} • ${j.customer_name||"-"} • ${j.job_type||"-"} • ${when} • ${j.job_status||"-"}`;});addMessage("ai",lines.join("\n"),true);setAgentState(k,"talking");showAgentBubble(k,`พบ ${money(jobs.length)} งานจากเบอร์นี้`);setTimeout(()=>setAgentState(k,"working"),3000);}
    catch(e){if(pending)pending.remove();const msg=e.message||"ค้นงานไม่สำเร็จ";addMessage("ai",msg,false);setAgentState(k,"talking");showAgentBubble(k,msg);}
  }
  async function refreshAll(options={}){
    try{setAgentState("ops","thinking");showAgentBubble("ops","กำลังอ่านสถานะงานจริง");await loadSummary();setAgentState("ops","idle");showAgentBubble("ops","สถานะงานอัปเดตแล้ว");}
    catch(e){if(options.throwOnError)throw e;if(String(e.message||"").includes("AI_OFFICE_PIN_REQUIRED"))showOverlay(true);else addMessage("ai",e.message||"โหลดข้อมูลไม่สำเร็จ",false);}
  }
  async function loadConfig(){const cfg=await apiGet("/admin/ai-office/config");state.pinRequired=!!cfg.pin_required;showOverlay(state.pinRequired&&!state.pin);if(!state.pinRequired)await refreshAll();}
  function initAgents(){Object.keys(agents).forEach(k=>{setPosition(k,agentConfig(k).home);setAgentState(k,"idle");showAgentBubble(k,agentConfig(k).status,2000);});}
  function renderAgentManager(){
    const list=$("agentManagerList");if(!list)return;
    list.innerHTML=Object.entries(agents).map(([k,a])=>`<div class="agentItem"><b>${esc(a.name)}</b><small>${esc(a.role)}</small><div class="managerActions"><button class="chip" data-edit="${esc(k)}" type="button">แก้บทบาท</button></div></div>`).join("");
    list.querySelectorAll("[data-edit]").forEach(btn=>btn.addEventListener("click",()=>editLocalAgent(btn.dataset.edit)));
  }
  function saveLocalAgents(){localStorage.setItem("cwfAiOfficeAgentsV5",JSON.stringify(agents));renderAgentManager();updateConsoleAgent();}
  function editLocalAgent(k){
    const a=agentConfig(k);
    const name=prompt("ชื่อ Agent",a.name);if(!name)return;
    const role=prompt("บทบาท",a.role);if(role===null)return;
    const commands=prompt("คำสั่งด่วน คั่นด้วย |",(a.commands||[]).join(" | "));if(commands===null)return;
    agents[k]=Object.assign({},a,{name,role,commands:commands.split("|").map(s=>s.trim()).filter(Boolean)});
    saveLocalAgents();
  }
  function addLocalAgent(){
    const key=prompt("รหัส Agent ภาษาอังกฤษ เช่น finance");if(!key||!/^[a-z0-9_-]+$/i.test(key))return;
    const name=prompt("ชื่อ Agent",`${key} AI`);if(!name)return;
    const role=prompt("บทบาท","ช่วยงานเฉพาะทางใน AI Office");if(role===null)return;
    agents[key]={name,color:"#1558d6",accent:"#ffcc00",role,status:"พร้อมช่วยงาน",greeting:"พร้อมช่วยงานตามบทบาทนี้",thinking:"กำลังคิดจากข้อมูลจริง",talking:"จัดการให้แล้วครับ",workstation:"meetingTable",home:{x:860,y:760},commands:["ช่วยสรุปงานนี้","ร่างข้อความให้หน่อย"]};
    setPosition(key,agents[key].home);setAgentState(key,"idle");saveLocalAgents();
  }
  function bind(){
    canvas().addEventListener("click",e=>{const p=worldFromEvent(e);let picked="";Object.entries(state.positions).forEach(([k,pos])=>{if(Math.hypot(pos.x-p.x,pos.y-p.y)<58)picked=k;});if(picked)selectAgent(picked,true);});
    $("consoleToggle")?.addEventListener("click",()=>state.consoleFull?peekConsole():expandConsole());$("btnRefresh")?.addEventListener("click",refreshAll);$("btnPhone")?.addEventListener("click",searchPhone);$("phoneInput")?.addEventListener("focus",expandConsole);$("phoneInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")searchPhone();});$("btnAsk")?.addEventListener("click",()=>ask());$("askInput")?.addEventListener("focus",expandConsole);$("askInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask();}});
    $("btnPin")?.addEventListener("click",async()=>{const pin=String($("pinInput")?.value||"").trim();const err=$("pinError");if(err)err.style.display="none";state.pin=pin;try{await refreshAll({throwOnError:true});showOverlay(false);}catch(_){state.pin="";showOverlay(true);if(err){err.textContent="รหัสไม่ถูกต้องหรือโหลดข้อมูลไม่ได้";err.style.display="block";}}});
    $("pinInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")$("btnPin")?.click();});
    $("btnManager")?.addEventListener("click",()=>{$("agentManager")?.classList.add("show");renderAgentManager();});
    $("btnCloseManager")?.addEventListener("click",()=>$("agentManager")?.classList.remove("show"));
    $("btnAddLocalAgent")?.addEventListener("click",addLocalAgent);
    $("btnResetAgents")?.addEventListener("click",()=>{localStorage.removeItem("cwfAiOfficeAgentsV5");agents=JSON.parse(JSON.stringify(defaultAgents));initAgents();renderAgentManager();updateConsoleAgent();});
    window.addEventListener("resize",resizeCanvas);
  }
  function resizeCanvas(){
    const c=canvas(), rect=c.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    c.width=Math.max(320,Math.floor(rect.width*dpr));c.height=Math.max(260,Math.floor(rect.height*dpr));
    ctx().setTransform(c.width/WORLD.w,0,0,c.height/WORLD.h,0,0);
  }
  function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
  function drawText(g,text,x,y,size,color="#07152f",weight=800,align="center"){g.save();g.font=`${weight} ${size}px Inter, system-ui, sans-serif`;g.fillStyle=color;g.textAlign=align;g.textBaseline="middle";g.fillText(text,x,y);g.restore();}
  function drawWorld(g){
    g.clearRect(0,0,WORLD.w,WORLD.h);
    const wall=g.createLinearGradient(0,0,0,310);wall.addColorStop(0,"#eaf5ff");wall.addColorStop(1,"#f7fbff");g.fillStyle=wall;g.fillRect(0,0,WORLD.w,310);
    const floor=g.createLinearGradient(0,310,WORLD.w,WORLD.h);floor.addColorStop(0,"#edf4fb");floor.addColorStop(1,"#cbd8e8");g.fillStyle=floor;g.fillRect(0,310,WORLD.w,WORLD.h);
    g.strokeStyle="rgba(7,21,47,.10)";g.lineWidth=1;for(let y=330;y<WORLD.h;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(WORLD.w,y);g.stroke();}for(let x=-160;x<WORLD.w+200;x+=80){g.beginPath();g.moveTo(x,310);g.lineTo(x-230,WORLD.h);g.stroke();}
    drawWallBrand(g);drawWindow(g);drawPosters(g);drawWorkstations(g);drawRoutes(g);
  }
  function drawWallBrand(g){
    g.save();g.translate(610,65);g.shadowColor="rgba(7,21,47,.18)";g.shadowBlur=18;g.shadowOffsetY=10;g.fillStyle="#fff";roundRect(g,0,0,420,95,26);g.fill();g.shadowColor="transparent";g.strokeStyle="#ffcc00";g.lineWidth=5;g.stroke();g.fillStyle="#ffcc00";g.beginPath();g.arc(72,48,36,0,Math.PI*2);g.fill();g.fillStyle="#1558d6";g.beginPath();g.arc(78,48,24,0,Math.PI*2);g.fill();g.fillStyle="#fff";g.beginPath();g.arc(84,48,15,0,Math.PI*2);g.fill();drawText(g,"COLDWINDFLOW",255,38,31,"#092765",1000);drawText(g,"AI OFFICE",255,70,18,"#d19a00",900);g.restore();
  }
  function drawWindow(g){g.fillStyle="#9dd8ff";roundRect(g,65,70,270,150,28);g.fill();g.strokeStyle="#fff";g.lineWidth=14;g.stroke();g.strokeStyle="#fff";g.lineWidth=9;g.beginPath();g.moveTo(200,70);g.lineTo(200,220);g.moveTo(65,148);g.lineTo(335,148);g.stroke();}
  function drawPosters(g){g.fillStyle="#fff";roundRect(g,45,255,120,170,14);g.fill();drawText(g,"COOL",105,300,20,"#0d3d8d",1000);drawText(g,"TRUST",105,335,18,"#0d3d8d",1000);drawText(g,"CWF",105,372,22,"#c99a00",1000);g.fillStyle="#fff";roundRect(g,1430,105,120,170,14);g.fill();drawText(g,"KEEP",1490,150,18,"#0d3d8d",1000);drawText(g,"WORLD",1490,185,18,"#0d3d8d",1000);drawText(g,"COOL",1490,222,22,"#0d3d8d",1000);}
  function drawDesk(g,x,y,w=300,h=125,label="Desk",color="#8e5a2c"){
    g.save();g.shadowColor="rgba(7,21,47,.22)";g.shadowBlur=20;g.shadowOffsetY=18;g.fillStyle="rgba(7,21,47,.12)";g.beginPath();g.ellipse(x+w/2,y+h-5,w*.52,34,0,0,Math.PI*2);g.fill();g.fillStyle=color;roundRect(g,x,y,w,h,24);g.fill();g.shadowColor="transparent";g.fillStyle="#092765";roundRect(g,x+w*.35,y-50,w*.32,56,10);g.fill();g.strokeStyle="#fff";g.lineWidth=7;g.stroke();g.fillStyle="rgba(255,255,255,.7)";roundRect(g,x+35,y+38,60,12,6);g.fill();roundRect(g,x+w-105,y+40,70,12,6);g.fill();drawText(g,label,x+w/2,y+h+38,18,"#0d3d8d",1000);g.restore();
  }
  function drawWorkstations(g){
    drawDesk(g,135,335,300,125,"Admin Desk","#925b2d");drawDesk(g,470,315,300,125,"Sales Desk","#945d2d");drawDesk(g,135,575,300,125,"Ads Desk","#945d2d");drawDesk(g,500,600,300,125,"Content Desk","#945d2d");drawDesk(g,1095,600,300,125,"Dev Desk","#334155");
    g.save();g.shadowColor="rgba(7,21,47,.25)";g.shadowBlur=22;g.shadowOffsetY=18;g.fillStyle="#13a46b";roundRect(g,1080,295,310,160,34);g.fill();g.shadowColor="transparent";g.fillStyle="rgba(255,255,255,.9)";roundRect(g,1120,335,210,18,9);g.fill();roundRect(g,1120,372,230,16,8);g.fill();roundRect(g,1120,408,170,16,8);g.fill();drawText(g,"Operations Board",1235,475,20,"#0d3d8d",1000);g.restore();
    g.save();g.shadowColor="rgba(7,21,47,.23)";g.shadowBlur=22;g.shadowOffsetY=18;g.fillStyle="#b77628";g.beginPath();g.ellipse(850,560,190,80,0,0,Math.PI*2);g.fill();g.fillStyle="#f2c46b";g.beginPath();g.ellipse(850,545,165,60,0,0,Math.PI*2);g.fill();drawText(g,"Meeting Table",850,660,20,"#0d3d8d",1000);g.restore();
    g.fillStyle="#0e805b";roundRect(g,55,705,70,90,16);g.fill();g.fillStyle="#52d88b";g.beginPath();g.arc(70,690,44,0,Math.PI*2);g.arc(110,665,44,0,Math.PI*2);g.arc(140,698,34,0,Math.PI*2);g.fill();
  }
  function drawRoutes(g){Object.entries(state.paths).forEach(([k,m])=>{if(!m||!m.path)return;g.save();g.strokeStyle="rgba(255,204,0,.75)";g.lineWidth=5;g.setLineDash([8,10]);g.lineCap="round";g.beginPath();m.path.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.stroke();g.restore();});}
  function drawAgent(g,k,a,pos){
    const s=state.agentStates[k]||"idle", t=state.frame/60, bob=s==="walking"?Math.sin(t*18)*8:Math.sin(t*3)*2;
    g.save();g.translate(pos.x,pos.y+bob);
    g.fillStyle="rgba(7,21,47,.18)";g.beginPath();g.ellipse(0,34,42,13,0,0,Math.PI*2);g.fill();
    g.fillStyle=a.color;g.strokeStyle="#fff";g.lineWidth=6;roundRect(g,-28,-58,56,82,18);g.fill();g.stroke();
    g.fillStyle=a.accent||"#ffcc00";roundRect(g,-24,-55,48,22,10);g.fill();
    g.fillStyle="#172033";roundRect(g,-23,18,18,45,8);g.fill();roundRect(g,5,18,18,45,8);g.fill();
    if(s==="walking"){g.save();g.rotate(Math.sin(t*18)*0.08);}
    g.fillStyle="#ffe0b7";g.beginPath();g.arc(0,-88,34,0,Math.PI*2);g.fill();g.lineWidth=5;g.strokeStyle="#fff";g.stroke();
    g.fillStyle="#111827";g.beginPath();g.arc(-6,-105,30,Math.PI,Math.PI*2);g.fill();
    g.fillStyle="#111827";g.beginPath();g.arc(-12,-88,3.5,0,Math.PI*2);g.arc(12,-88,3.5,0,Math.PI*2);g.fill();
    g.strokeStyle="#8b4f25";g.lineWidth=3;g.beginPath();g.arc(0,-76,12,.15*Math.PI,.85*Math.PI);g.stroke();
    if(s==="walking")g.restore();
    g.fillStyle="#fff";roundRect(g,-54,54,108,28,14);g.fill();g.strokeStyle="rgba(15,23,42,.12)";g.stroke();drawText(g,a.name,0,68,16,"#07152f",1000);
    const b=state.bubbles[k];if(b&&performance.now()<b.until){drawBubble(g,b.text,0,-145);}
    if(k===state.activeAgent){g.strokeStyle="#ffcc00";g.lineWidth=5;g.beginPath();g.ellipse(0,36,55,19,0,0,Math.PI*2);g.stroke();}
    g.restore();
  }
  function drawBubble(g,text,x,y){
    const str=String(text||"").slice(0,54), w=clamp(str.length*8+28,90,240), h=46;
    g.save();g.fillStyle="#fff";g.strokeStyle="rgba(15,23,42,.12)";g.lineWidth=2;g.shadowColor="rgba(7,21,47,.18)";g.shadowBlur=18;g.shadowOffsetY=8;roundRect(g,x-w/2,y-h/2,w,h,16);g.fill();g.shadowColor="transparent";g.stroke();drawText(g,str,x,y,13,"#07152f",850);g.restore();
  }
  function stepMovement(delta){
    Object.entries(state.paths).forEach(([k,m])=>{
      const cur=state.positions[k]||agentConfig(k).home; const next=m.path[m.index+1];
      if(!next){Reflect.deleteProperty(state.paths,k);setAgentState(k,"idle");if(m.resolve)m.resolve();return;}
      const dx=next.x-cur.x,dy=next.y-cur.y,dist=Math.hypot(dx,dy),step=(m.speed||220)*delta;
      if(dist<=step){setPosition(k,next);m.index+=1;}else setPosition(k,{x:cur.x+dx/dist*step,y:cur.y+dy/dist*step});
    });
  }
  let last=performance.now();
  function loop(now){
    const d=Math.min(.05,(now-last)/1000);last=now;state.frame++;
    stepMovement(d);resizeCanvasIfNeeded();const g=ctx();drawWorld(g);Object.entries(agents).sort((a,b)=>(state.positions[a[0]]?.y||0)-(state.positions[b[0]]?.y||0)).forEach(([k,a])=>drawAgent(g,k,a,state.positions[k]||a.home));
    requestAnimationFrame(loop);
  }
  let lastW=0,lastH=0;
  function resizeCanvasIfNeeded(){const c=canvas(),rect=c.getBoundingClientRect();if(Math.floor(rect.width)===lastW&&Math.floor(rect.height)===lastH)return;resizeCanvas();}
  function resizeCanvas(){const c=canvas(),rect=c.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);lastW=Math.floor(rect.width);lastH=Math.floor(rect.height);c.width=Math.max(320,Math.floor(rect.width*dpr));c.height=Math.max(260,Math.floor(rect.height*dpr));ctx().setTransform(c.width/WORLD.w,0,0,c.height/WORLD.h,0,0);}
  function renderAgentManager(){
    const list=$("agentManagerList");if(!list)return;
    list.innerHTML=Object.entries(agents).map(([k,a])=>`<div class="agentItem"><b>${esc(a.name)}</b><small>${esc(a.role)}</small><div class="managerActions"><button class="chip" data-edit="${esc(k)}" type="button">แก้บทบาท</button></div></div>`).join("");
    list.querySelectorAll("[data-edit]").forEach(btn=>btn.addEventListener("click",()=>editLocalAgent(btn.dataset.edit)));
  }
  function saveLocalAgents(){localStorage.setItem("cwfAiOfficeAgentsV5",JSON.stringify(agents));renderAgentManager();updateConsoleAgent();}
  function editLocalAgent(k){const a=agentConfig(k);const name=prompt("ชื่อ Agent",a.name);if(!name)return;const role=prompt("บทบาท",a.role);if(role===null)return;const commands=prompt("คำสั่งด่วน คั่นด้วย |",(a.commands||[]).join(" | "));if(commands===null)return;agents[k]=Object.assign({},a,{name,role,commands:commands.split("|").map(s=>s.trim()).filter(Boolean)});saveLocalAgents();}
  function addLocalAgent(){const key=prompt("รหัส Agent ภาษาอังกฤษ เช่น finance");if(!key||!/^[a-z0-9_-]+$/i.test(key))return;const name=prompt("ชื่อ Agent",`${key} AI`);if(!name)return;const role=prompt("บทบาท","ช่วยงานเฉพาะทางใน AI Office");if(role===null)return;agents[key]={name,color:"#1558d6",accent:"#ffcc00",role,status:"พร้อมช่วยงาน",greeting:"พร้อมช่วยงานตามบทบาทนี้",thinking:"กำลังคิดจากข้อมูลจริง",talking:"จัดการให้แล้วครับ",workstation:"meetingTable",home:{x:860,y:760},commands:["ช่วยสรุปงานนี้","ร่างข้อความให้หน่อย"]};setPosition(key,agents[key].home);setAgentState(key,"idle");saveLocalAgents();}
  document.addEventListener("DOMContentLoaded",async()=>{
    refreshAiOfficeCache();await loadAgentConfig();initAgents();resizeCanvas();bind();selectAgent("admin",false);requestAnimationFrame(loop);loadConfig().catch(e=>addMessage("ai",e.message||"โหลด AI Office ไม่สำเร็จ",false));
  });
  window.setAgentState=setAgentState;window.moveAgent=moveAgent;window.moveAgentToHome=moveAgentToHome;window.moveSelectedAgentToWorkstation=moveSelectedAgentToWorkstation;window.showAgentBubble=showAgentBubble;window.orchestrateCommand=orchestrateCommand;window.choosePrimaryAgentForCommand=choosePrimaryAgentForCommand;window.coordinateAgentsForCommand=coordinateAgentsForCommand;
})();
