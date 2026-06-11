(function(){
  "use strict";
  const BUILD="ai-office-v30-premium-redesign";
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=(v)=>String(v==null?"":v).replace(/[&<>'"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
  const clean=(v)=>String(v==null?"":v).replace(/\s+/g," ").trim();
  const digits=(v)=>String(v||"").replace(/\D/g,"");
  const money=(v)=>{const n=Number(v||0);return Number.isFinite(n)?n.toLocaleString("th-TH"):"0";};
  const api=async(url,opts={})=>{const r=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts});const txt=await r.text();let data={};try{data=txt?JSON.parse(txt):{};}catch(_){data={ok:false,error:txt||"INVALID_JSON"};}if(!r.ok||data.ok===false){throw new Error(data.error||`HTTP_${r.status}`);}return data;};
  const postSafe=async(url,body)=>{try{return await api(url,{method:"POST",body:JSON.stringify(body||{})});}catch(_){return null;}};
  const page=String(document.body.dataset.aiOfficePage||"home").trim().toLowerCase()||"home";
  const jobUrl=(j)=>`/admin-job-view-v2.html?job_id=${encodeURIComponent(String(j.job_id||j.booking_code||""))}`;
  const state={summary:{},health:{},productionHealth:null,config:{},jobs:{today:[],tomorrow:[],open:[],unpaid:[],phone:[]},loaded:{},activeBucket:null,answer:"",answerMeta:"",loading:false,selectedJob:null,lastQuestion:"",history:[],builder:{},showBuilder:true};

  // Departments are now CHAT CONTEXTS, not destinations.
  const dept={
    admin:{label:"Admin",icon:"AD",url:"/admin-ai-office-admin.html",agent:"admin",desc:"ตามงานค้าง ตรวจยอดค้างชำระ ค้นลูกค้า และสรุปงานให้แอดมิน",primaryBuckets:["unpaid","open"]},
    ops:{label:"Ops & คิว",icon:"OP",url:"/admin-ai-office-ops.html",agent:"ops",desc:"ดูคิววันนี้ พรุ่งนี้ งานยังไม่ปิด และความเสี่ยงหน้างาน",primaryBuckets:["today","tomorrow","open"]},
    sales:{label:"Sales",icon:"SR",url:"/admin-ai-office-sales.html",agent:"sales",desc:"สร้างข้อความขาย ตอบราคา ตอบลูกค้าบอกแพง และปิดนัดแบบไม่ส่งเอง"},
    content:{label:"Content",icon:"CA",url:"/admin-ai-office-content.html",agent:"content",desc:"ทำโพสต์ แคปชัน สคริปต์ และไอเดียโฆษณาจากข้อมูล CWF จริง"},
    dev:{label:"Dev",icon:"DV",url:"/admin-ai-office-dev.html",agent:"dev",desc:"สร้าง prompt ส่ง Codex, checklist, regression และ rollback notes"}
  };
  const bucketLabel={today:"งานวันนี้",tomorrow:"งานพรุ่งนี้",open:"งานยังไม่ปิด",unpaid:"งานยังไม่จ่าย",phone:"ผลค้นจากเบอร์"};
  const servicePrices={
    small:{normal:550,premium:790,hanging:1290,deep:1850},
    large:{normal:690,premium:990,hanging:1550,deep:2150}
  };

  // Chat shortcut chips per page context. Home uses Office Chat agent across all departments.
  const shortcuts={
    home:[
      {label:"งานวันนี้มีกี่งาน",q:"วันนี้มีงานอะไรบ้าง สรุปสั้น ๆ ให้หน่อย"},
      {label:"งานพรุ่งนี้",q:"พรุ่งนี้มีงานอะไรบ้าง และมีคิวว่างช่วงไหน"},
      {label:"งานค้างชำระ",q:"ตอนนี้มีงานที่ยังไม่จ่ายกี่งาน ยอดรวมเท่าไร และควรตามใคร"},
      {label:"งานยังไม่ปิด",q:"มีงานที่ยังไม่ปิดค้างอยู่ไหม ควรตามอะไรก่อน"},
      {label:"ร่างตอบลูกค้า",q:"ช่วยร่างข้อความตอบลูกค้าที่ถามราคาล้างแอร์ผนัง 2 เครื่อง สุภาพ พร้อมส่ง"}
    ],
    admin:[
      {label:"สรุปงานค้างชำระ",q:"สรุปงานที่ยังไม่จ่ายทั้งหมด แยกตามความเร่งด่วน และร่างข้อความตามชำระ"},
      {label:"งานเลยนัดยังไม่จ่าย",q:"มีงานไหนเลยวันนัดแล้วแต่ยังไม่จ่ายบ้าง"},
      {label:"ร่างข้อความตามเงิน",q:"ช่วยร่างข้อความตามชำระแบบสุภาพ ไม่กดดันลูกค้า"}
    ],
    ops:[
      {label:"คิววันนี้แยกตามช่าง",q:"สรุปคิววันนี้แยกตามช่าง และบอกความเสี่ยงที่ต้องระวัง"},
      {label:"คิวว่างพรุ่งนี้",q:"พรุ่งนี้ยังรับงานเพิ่มได้ไหม ช่วงเวลาไหนว่าง"},
      {label:"ร่างแจ้งทีม",q:"ช่วยร่างข้อความสรุปคิววันนี้สำหรับแจ้งทีมช่าง"}
    ],
    sales:[
      {label:"ตอบราคาล้างแอร์",q:"ลูกค้าถามราคาล้างแอร์ผนัง 2 เครื่อง ช่วยร่างคำตอบพร้อมปิดนัด"},
      {label:"ลูกค้าบอกแพง",q:"ลูกค้าบอกว่าแพง ช่วยร่างคำตอบที่ไม่ลดราคาเองแต่ยังน่าเชื่อถือ"},
      {label:"ตอบลูกค้าต่างชาติ",q:"Draft an English reply for a customer asking about aircon cleaning price and booking"}
    ],
    content:[
      {label:"โพสต์โปรล้างแอร์",q:"ช่วยเขียนโพสต์โปรล้างแอร์หน้าฝน โทนมืออาชีพ ไม่เวอร์เกินจริง"},
      {label:"แคปชันรีวิว",q:"ช่วยเขียนแคปชันรีวิวงานล้างแอร์ที่ดูจริงและน่าเชื่อถือ"},
      {label:"ไอเดียยิงแอด",q:"ขอ angle โฆษณาล้างแอร์ 3 แบบ พร้อม keyword พื้นที่กรุงเทพ"}
    ],
    dev:[
      {label:"สร้าง prompt Codex",q:"ช่วยร่าง prompt ส่ง Codex สำหรับแก้บั๊กหน้า AI Office โดยมี scope และ rollback"},
      {label:"Checklist ก่อน deploy",q:"ขอ checklist ตรวจความพร้อมก่อน deploy production CWF AI Office"},
      {label:"Regression checklist",q:"ขอ regression checklist สำหรับการแก้ frontend AI Office"}
    ]
  };

  function defaultReplyTone(){return clean(state.config?.reply_tone || state.productionHealth?.reply_tone || localStorage.getItem("cwf_ai_reply_tone") || document.body.dataset.replyTone || "female").toLowerCase() || "female";}
  function setReplyTone(tone){const t=clean(tone||"female").toLowerCase();localStorage.setItem("cwf_ai_reply_tone",t);state.config.reply_tone=t;}
  function logWorkAction(action,job,extra){postSafe("/admin/ai-office/work-actions",{page,action,job_id:job?.job_id||null,booking_code:job?.booking_code||job?.job_code||null,customer_phone:job?.customer_phone||null,payload:{bucket:state.activeBucket||null,...(extra||{})}});}
  function toast(msg){const el=$("#toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),2300);}
  function count(k){const n=Number(state.summary?.[k]??0);return Number.isFinite(n)?n:0;}
  function isPaid(j){return /paid|จ่ายแล้ว|ชำระแล้ว/i.test(String(j.payment_status||""))||Boolean(j.paid_at);}
  function isDone(j){return Boolean(j.finished_at)||/(ปิด|เสร็จ|done|closed|complete)/i.test(String(j.job_status||j.status||""));}
  function isPastAppointment(j){if(!j.appointment_datetime)return false;const t=new Date(j.appointment_datetime).getTime();return Number.isFinite(t)&&t<Date.now();}
  function riskFlags(j,bucket){const flags=[];if((bucket==="today"||bucket==="open")&&isPastAppointment(j)&&!isDone(j))flags.push({t:"เลยเวลานัด",c:"danger"});if(!clean(j.technician_username||j.technician_team))flags.push({t:"ยังไม่เห็นช่าง",c:"warn"});if(!isPaid(j))flags.push({t:"ยังไม่จ่าย",c:"warn"});if(!isDone(j))flags.push({t:"ยังไม่ปิด",c:"info"});return flags.slice(0,4);}
  function getJobCode(j){return clean(j.booking_code||j.job_code||j.job_id||"งาน");}
  function jobLine(j){return [getJobCode(j),j.customer_name,j.customer_phone,j.appointment_display||j.appointment_time_th,j.job_type||j.service_type,j.job_zone,j.technician_username||j.technician_team,j.job_status||j.status,j.payment_status].filter(Boolean).join(" | ");}

  // ============ NAV (shared) ============
  function renderNav(){
    const nav=$("#aiNav");if(!nav)return;
    const items=Object.keys(dept).map(k=>{const d=dept[k];const active=(page===k)?"active":"";return `<a class="nav-chip ${active}" href="${esc(d.url)}">${esc(d.label)}</a>`;}).join("");
    const home=(page==="home")?"":`<a class="nav-chip" href="/admin-ai-office.html">หน้าหลัก</a>`;
    // LINE OA is a clearly separate module — styled distinctly and labelled.
    const line=`<a class="nav-chip line" href="/admin-ai-line-control.html?panel=dashboard" title="LINE OA / Auto Reply / Settings — แยกจาก AI Chat">LINE OA / ตั้งค่า</a>`;
    nav.innerHTML=`${home}${items}${line}`;
  }

  // ============ CHAT COLUMN (main, every page) ============
  function agentForPage(){return (dept[page]&&dept[page].agent)||"office";}
  function pageTitle(){if(page==="home")return"AI Chat กลาง";const d=dept[page];return d?`AI · ${d.label}`:"AI Chat";}
  function pageSub(){if(page==="home")return"ถามเรื่องงาน ร่างข้อความ หรือสรุปสถานการณ์ได้เลย AI จะดึงข้อมูลงานจริงมาช่วย";const d=dept[page];return d?d.desc:"";}

  function renderChat(){
    const col=$("#chatCol");if(!col)return;
    const sc=(shortcuts[page]||shortcuts.home);
    const chips=sc.map((s,i)=>`<button class="chip" type="button" data-shortcut="${i}">${esc(s.label)}</button>`).join("");
    const histHtml=state.history.length?state.history.map(h=>`<div class="bubble user">${esc(h.q)}</div><div class="bubble ai">${esc(h.a)}</div>`).join(""):"";
    const liveAi=state.loading
      ? `<div class="bubble ai loading"><span class="dots"><i></i><i></i><i></i></span> กำลังคิด…</div>`
      : (state.answer?`<div class="bubble ai current">${esc(state.answer)}${state.answerMeta?`<div class="bubble-meta">${esc(state.answerMeta)}</div>`:""}</div>`:"");
    const emptyState=(!state.history.length&&!state.answer&&!state.loading)
      ? `<div class="chat-empty"><div class="chat-empty-icon">💬</div><h3>เริ่มพิมพ์ถาม AI ได้เลย</h3><p>${esc(pageSub())}</p></div>`:"";
    const tools=(state.answer&&!state.loading)
      ? `<div class="tool-row"><button class="tool-btn" type="button" data-action="copy">คัดลอกคำตอบ</button><button class="tool-btn" type="button" data-action="ai-polish">ให้ AI เกลาอีกครั้ง</button><button class="tool-btn ghost" type="button" data-action="clear-output">ล้างแชท</button></div>`:"";
    col.innerHTML=`
      <div class="chat-card">
        <div class="chat-card-head">
          <div><h2>${esc(pageTitle())}</h2><p>${esc(pageSub())}</p></div>
          <span class="chat-status" id="chatStatus"><i class="dot"></i><span>ตรวจระบบ…</span></span>
        </div>
        <div class="chat-stream" id="chatStream">${emptyState}${histHtml}${liveAi}</div>
        ${tools}
        <div class="chip-row">${chips}</div>
        <form class="composer" id="askForm">
          <textarea id="askInput" rows="1" placeholder="พิมพ์คำถาม เช่น วันนี้มีงานกี่งาน / ร่างตอบลูกค้าถามราคา…" autocomplete="off"></textarea>
          <button class="send" type="submit" title="ส่ง">➤</button>
        </form>
      </div>`;
    const stream=$("#chatStream");if(stream)stream.scrollTop=stream.scrollHeight;
    autoGrow($("#askInput"));
    updateChatStatus();
  }
  function autoGrow(ta){if(!ta)return;ta.style.height="auto";ta.style.height=Math.min(170,Math.max(46,ta.scrollHeight))+"px";}
  function updateChatStatus(){const el=$("#chatStatus");if(!el)return;const ok=state.health.summary;const dot=el.querySelector(".dot");const txt=el.querySelector("span:last-child");if(ok===true){if(dot)dot.className="dot ok";if(txt)txt.textContent="พร้อมใช้งาน";}else if(ok===false){if(dot)dot.className="dot bad";if(txt)txt.textContent="ข้อมูลยังไม่พร้อม";}else{if(dot)dot.className="dot";if(txt)txt.textContent="ตรวจระบบ…";}}

  // ============ SIDEBAR (metrics + quick + health) ============
  function renderSidebar(){
    const side=$("#sideCol");if(!side)return;
    const metrics=[["งานวันนี้","today_count","ready"],["งานพรุ่งนี้","tomorrow_count","info"],["ยังไม่ปิด","open_count","warn"],["ยังไม่จ่าย","unpaid_count","warn"]];
    const metricHtml=metrics.map(([l,k,t])=>`<div class="side-metric ${t}"><span>${esc(l)}</span><b>${esc(count(k))}</b></div>`).join("");
    const h=state.productionHealth;
    let healthHtml="";
    if(h&&Array.isArray(h.checks)){
      const bad=h.checks.filter(x=>!x.ok);
      healthHtml=bad.length
        ? `<div class="side-health bad"><b>ต้องตรวจ ${bad.length} รายการ</b>${bad.slice(0,3).map(x=>`<span>• ${esc(x.label)}</span>`).join("")}</div>`
        : `<div class="side-health ok"><b>ระบบพร้อมใช้งาน</b><span>ข้อมูลงานจริงเชื่อมต่อแล้ว</span></div>`;
    }else{
      const ready=state.health.summary===true;
      healthHtml=`<div class="side-health ${ready?'ok':'wait'}"><b>${ready?'ระบบพร้อมใช้งาน':'กำลังตรวจระบบ'}</b><span>${ready?'ข้อมูลงานจริงเชื่อมต่อแล้ว':'กำลังเชื่อมต่อข้อมูลงานจริง'}</span></div>`;
    }
    side.innerHTML=`
      <div class="side-card">
        <div class="side-head"><h3>ภาพรวมวันนี้</h3><button class="side-refresh" type="button" data-action="refresh" title="รีเฟรช">↻</button></div>
        <div class="side-metrics">${metricHtml}</div>
      </div>
      <div class="side-card">
        <h3>ลัดไปแผนก</h3>
        <div class="side-nav">${Object.keys(dept).map(k=>{const d=dept[k];return `<a class="side-nav-item ${page===k?'active':''}" href="${esc(d.url)}"><span class="ico">${esc(d.icon)}</span><span class="lbl">${esc(d.label)}</span></a>`;}).join("")}</div>
      </div>
      <div class="side-card line-block">
        <h3>LINE OA / Auto Reply</h3>
        <p>กล่องแชทลูกค้า, Auto Safe, Playbook, คิวอนุมัติ และตั้งค่า แยกเป็นโมดูลของตัวเอง</p>
        <a class="line-btn" href="/admin-ai-line-control.html?panel=dashboard">เปิด LINE OA Control →</a>
      </div>
      <div class="side-card">
        <div class="side-head"><h3>สถานะระบบ</h3><button class="side-refresh" type="button" data-action="health" title="ตรวจระบบ">⟳</button></div>
        ${healthHtml}
      </div>`;
  }

  // ============ DEPT CONTEXT (below chat, per page) ============
  function renderDeptContext(){
    const wrap=$("#deptContext");if(!wrap)return;
    if(page==="home"){wrap.innerHTML=renderHomeContext();return;}
    if(page==="admin"){wrap.innerHTML=renderAdminContext();return;}
    if(page==="ops"){wrap.innerHTML=renderOpsContext();return;}
    if(page==="sales"){wrap.innerHTML=renderSalesContext();return;}
    if(page==="content"){wrap.innerHTML=renderContentContext();return;}
    if(page==="dev"){wrap.innerHTML=renderDevContext();return;}
    wrap.innerHTML="";
  }

  function ctxHead(title,sub,toggle){return `<div class="ctx-head"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>${toggle?`<button class="small-btn" type="button" data-action="toggle-builder">${state.showBuilder?'ซ่อน':'แสดง'}</button>`:''}</div>`;}

  function renderHomeContext(){
    const cards=[
      {title:"งานต้องตามเงิน",value:count("unpaid_count"),text:"เปิด Admin เพื่อดูรายการและร่างข้อความตามชำระ",href:dept.admin.url,tone:"warn"},
      {title:"งานต้องปิด",value:count("open_count"),text:"เปิด Ops เพื่อดูงานค้างและความเสี่ยงหน้างาน",href:dept.ops.url,tone:"info"},
      {title:"คิววันนี้",value:count("today_count"),text:"เปิด Ops เพื่อดูคิววันนี้แยกตามช่าง",href:dept.ops.url,tone:"ready"}
    ];
    return `<div class="ctx-card">${ctxHead("ภาพงานที่ต้องทำ","ตัวเลขจริงจากระบบ กดเข้าแผนกเพื่อทำงานต่อ พร้อมถาม AI ได้ทุกหน้า")}
      <div class="operator-grid">${cards.map(c=>`<a class="operator-card ${c.tone}" href="${esc(c.href)}"><span>${esc(c.title)}</span><b>${esc(c.value)}</b><p>${esc(c.text)}</p></a>`).join("")}</div></div>`;
  }

  function renderAdminContext(){
    const active=state.activeBucket||"unpaid";const jobs=state.jobs[active]||[];const unpaid=state.jobs.unpaid||[];const open=state.jobs.open||[];
    const unpaidTotal=unpaid.reduce((s,j)=>s+Number(j.job_price||0),0);const overdue=unpaid.filter(j=>isPastAppointment(j)).length;
    return `<div class="ctx-card">${ctxHead("งานค้าง / ค้างชำระ","ข้อมูลงานจริง ไม่ส่งข้อความ ไม่แก้สถานะ ให้แอดมินตรวจ/คัดลอกเอง")}
      <div class="ctx-metrics"><div><span>ยอดค้างรวม</span><b>${money(unpaidTotal)}฿</b></div><div><span>งานค้างชำระ</span><b>${unpaid.length}</b></div><div><span>เลยนัดยังไม่จ่าย</span><b>${overdue}</b></div><div><span>งานยังไม่ปิด</span><b>${open.length}</b></div></div>
      <div class="search-line"><input id="phoneInput" inputmode="numeric" placeholder="ค้นเบอร์ลูกค้า"><button type="button" data-action="phone-search">ค้น</button></div>
      ${tabBar(["unpaid","open","phone"],active)}
      ${renderJobTable(jobs,active,"admin")}</div>`;
  }

  function renderOpsContext(){
    const active=state.activeBucket||"today";const jobs=state.jobs[active]||[];
    return `<div class="ctx-card">${ctxHead("คิวงาน","คิววันนี้ พรุ่งนี้ และงานยังไม่ปิด แยกตามเวลาและตามช่าง")}
      <div class="ctx-metrics"><div><span>วันนี้</span><b>${(state.jobs.today||[]).length}</b></div><div><span>พรุ่งนี้</span><b>${(state.jobs.tomorrow||[]).length}</b></div><div><span>ยังไม่ปิด</span><b>${(state.jobs.open||[]).length}</b></div><div><span>เสี่ยงต้องตาม</span><b>${jobs.filter(j=>riskFlags(j,active).some(f=>f.c==='danger'||f.c==='warn')).length}</b></div></div>
      <div class="tool-row"><button class="small-btn" type="button" data-action="draft-dispatch-summary">ร่างสรุปแจ้งทีม</button></div>
      ${tabBar(["today","tomorrow","open"],active)}
      ${renderGroupedJobs(jobs,active)}</div>`;
  }

  function renderSalesContext(){
    return `<div class="ctx-card">${ctxHead("Sales Builder","กรอกฟอร์มสร้างคำตอบขายเร็ว ๆ หรือพิมพ์ถาม AI ด้านบนก็ได้",true)}
      ${state.showBuilder?renderSalesBuilder():''}</div>`;
  }
  function renderContentContext(){
    return `<div class="ctx-card">${ctxHead("Content Builder","สร้างโพสต์/แคปชัน/สคริปต์จากข้อมูลบริการจริง หรือถาม AI ด้านบน",true)}
      ${state.showBuilder?renderContentBuilder():''}</div>`;
  }
  function renderDevContext(){
    return `<div class="ctx-card">${ctxHead("Codex Prompt Builder","สร้าง prompt ส่ง Codex แบบมี scope + rollback หรือถาม AI ด้านบน",true)}
      ${state.showBuilder?renderDevBuilder():''}</div>`;
  }

  // ============ shared builders / job tables (logic unchanged) ============
  function tabBar(buckets,active){return `<div class="tab-row">${buckets.map(b=>`<button class="tab ${active===b?'active':''}" type="button" data-bucket="${esc(b)}">${esc(bucketLabel[b])} <small>${esc((state.jobs[b]||[]).length||'')}</small></button>`).join("")}</div>`;}
  function renderJobTable(jobs,bucket,mode){if(!jobs.length)return `<div class="empty-state">ยังไม่มีรายการ หรือยังไม่ได้ค้นข้อมูล</div>`;return `<div class="job-table">${jobs.map(j=>renderJobRow(j,bucket,mode)).join("")}</div>`;}
  function renderJobRow(j,bucket,mode){const flags=riskFlags(j,bucket);return `<article class="job-row"><div class="job-main"><h4>${esc(getJobCode(j))}</h4><p>${esc([j.customer_name,j.customer_phone].filter(Boolean).join(' · '))}</p><p>${esc([j.appointment_display||j.appointment_time_th,j.job_type||j.service_type,j.job_zone].filter(Boolean).join(' · '))}</p><div class="job-meta">${flags.map(f=>`<span class="mini-status ${f.c}">${esc(f.t)}</span>`).join("")}</div></div><div class="job-actions"><a class="mini-btn" href="${esc(jobUrl(j))}">เปิดงาน</a><button class="mini-btn" type="button" data-job-action="phone" data-job='${esc(JSON.stringify(j))}'>คัดลอกเบอร์</button>${mode==='ops'?`<button class="mini-btn" type="button" data-job-action="tech" data-job='${esc(JSON.stringify(j))}'>แจ้งช่าง</button><button class="mini-btn" type="button" data-job-action="customer-confirm" data-job='${esc(JSON.stringify(j))}'>ยืนยันลูกค้า</button>`:`<button class="mini-btn" type="button" data-job-action="payment" data-job='${esc(JSON.stringify(j))}'>ตามชำระ</button><button class="mini-btn" type="button" data-job-action="job-summary" data-job='${esc(JSON.stringify(j))}'>สรุปงานนี้</button>`}</div></article>`;}
  function appointmentSortValue(j){const t=new Date(j.appointment_datetime||j.appointment_time||0).getTime();return Number.isFinite(t)?t:9999999999999;}
  function appointmentSlot(j){return clean(j.appointment_time_th||j.appointment_display||j.appointment_time||"").slice(0,16)||"ไม่ระบุเวลา";}
  function renderOpsTimeline(jobs,bucket){if(!jobs.length)return `<div class="empty-state">ยังไม่มีรายการในหมวดนี้</div>`;const sorted=[...jobs].sort((a,b)=>appointmentSortValue(a)-appointmentSortValue(b));return `<div class="ops-timeline">${sorted.map(j=>`<div class="timeline-row"><div class="time-badge">${esc(appointmentSlot(j))}</div><div class="timeline-card">${renderJobRow(j,bucket,"ops")}</div></div>`).join("")}</div>`;}
  function renderGroupedJobs(jobs,bucket){if(!jobs.length)return `<div class="empty-state">ยังไม่มีรายการในหมวดนี้</div>`;const groups={};jobs.forEach(j=>{const k=clean(j.technician_username||j.technician_team)||"ยังไม่เห็นช่าง";(groups[k]=groups[k]||[]).push(j);});return `<div class="ops-layout"><section><h4 class="sub-title">Timeline ตามเวลา</h4>${renderOpsTimeline(jobs,bucket)}</section><section><h4 class="sub-title">แยกตามช่าง</h4><div class="tech-groups">${Object.entries(groups).map(([name,items])=>`<div class="tech-group"><div class="tech-head"><b>${esc(name)}</b><span>${items.length} งาน</span></div>${items.sort((a,b)=>appointmentSortValue(a)-appointmentSortValue(b)).map(j=>renderJobRow(j,bucket,"ops")).join("")}</div>`).join("")}</div></section></div>`;}

  function renderSalesBuilder(){return `<form class="builder" id="salesBuilder"><div class="form-grid"><label>เรื่องที่ลูกค้าถาม<select name="intent"><option value="price">ถามราคา</option><option value="expensive">บอกว่าแพง</option><option value="booking">ต้องการนัด</option><option value="repair">ซ่อม / แอร์ไม่เย็น</option><option value="foreign">ลูกค้าต่างชาติ</option></select></label><label>โทนตอบ<select name="tone"><option value="female">ค่ะ</option><option value="male">ครับ</option><option value="neutral">กลาง ๆ</option></select></label><label>บริการ<select name="service"><option value="ล้างแอร์">ล้างแอร์</option><option value="ซ่อมแอร์">ซ่อมแอร์</option><option value="ติดตั้งแอร์">ติดตั้งแอร์</option><option value="ตรวจเช็คแอร์">ตรวจเช็คแอร์</option></select></label><label>BTU<select name="btu"><option value="small">ไม่เกิน 12,000 BTU</option><option value="large">18,000 BTU ขึ้นไป</option><option value="unknown">ยังไม่ทราบ</option></select></label><label>แพ็กเกจ<select name="package"><option value="normal">ล้างปกติ</option><option value="premium">ล้างพรีเมียม</option><option value="hanging">ล้างแบบแขวนคอยล์</option><option value="deep">ตัดล้างใหญ่</option><option value="all">เทียบราคา 4 แบบ</option></select></label><label>จำนวนเครื่อง<input name="qty" inputmode="numeric" placeholder="เช่น 2"></label><label>พื้นที่<input name="area" placeholder="เช่น อ่อนนุช / บางนา / พระราม 3"></label></div><label class="full-label">ข้อความ/อาการจากลูกค้า<textarea name="customer" placeholder="วางข้อความลูกค้าหรืออาการเสียที่ลูกค้าบอก"></textarea></label><div class="tool-row"><button class="wide-btn" type="submit">สร้างข้อความขาย</button><button class="wide-btn soft" type="button" data-action="ai-sales-polish">ให้ AI ช่วยเกลา</button></div></form>`;}
  function renderContentBuilder(){return `<form class="builder" id="contentBuilder"><div class="form-grid"><label>ประเภทคอนเทนต์<select name="type"><option value="post">โพสต์โปร</option><option value="review">แคปชันรีวิว</option><option value="video">สคริปต์วิดีโอสั้น</option><option value="ad">ไอเดียยิงแอด</option></select></label><label>บริการ<select name="service"><option>ล้างแอร์</option><option>ซ่อมแอร์</option><option>ติดตั้งแอร์</option><option>ตรวจเช็คแอร์</option></select></label><label>พื้นที่<input name="area" placeholder="เช่น พระราม 3 / บางนา"></label><label>หลักฐานที่มี<input name="proof" placeholder="เช่น รีวิวจริง / ช่างมีใบรับรอง"></label></div><label class="full-label">จุดที่อยากเน้น<textarea name="angle" placeholder="เช่น โปร 550, ไม่บวกค่าน้ำยา, รับประกันงานล้าง 30 วัน"></textarea></label><div class="tool-row"><button class="wide-btn" type="submit">สร้างคอนเทนต์</button><button class="wide-btn soft" type="button" data-action="ai-content-polish">ให้ AI ทำหลายเวอร์ชัน</button></div></form>`;}
  function renderDevBuilder(){return `<form class="builder" id="devBuilder"><div class="form-grid"><label>หัวข้องาน<input name="title" placeholder="เช่น แก้หน้า AI Office"></label><label>Phase/ขอบเขต<select name="phase"><option>Production fix</option><option>Read-only</option><option>LINE control</option><option>UI cleanup</option></select></label></div><label class="full-label">ปัญหาที่เจอ<textarea name="problem" placeholder="อธิบายปัญหาที่ต้องการให้ Codex แก้"></textarea></label><label class="full-label">ไฟล์ที่เกี่ยวข้อง<textarea name="files" placeholder="เช่น admin-ai-office.js, admin-ai-office.css"></textarea></label><label class="full-label">สิ่งที่ห้ามแตะ<textarea name="notouch" placeholder="เช่น ห้ามแก้ระบบงานหลัก ห้ามแก้ฐานข้อมูล production"></textarea></label><div class="tool-row"><button class="wide-btn" type="submit">สร้าง Prompt Codex</button><button class="wide-btn soft" type="button" data-action="deploy-checklist">Checklist ก่อน deploy</button></div></form>`;}

  // ============ render orchestration ============
  function render(){renderNav();renderChat();renderSidebar();renderDeptContext();}

  async function loadSummary(){try{const data=await api('/admin/ai-office/summary');state.summary=data.summary||{};state.health.summary=true;}catch(e){state.health.summary=false;}render();}
  async function loadHealth(){try{state.productionHealth=await api('/admin/ai-office/production-health');}catch(_){state.productionHealth=null;}try{const cfg=await api('/admin/ai-office/config');state.config=cfg||{};}catch(_){state.config={};}render();}
  async function loadJobs(bucket,phone){state.loading=true;render();try{const qs=new URLSearchParams({bucket});if(phone)qs.set('phone',phone);const data=await api(`/admin/ai-office/jobs?${qs.toString()}`);state.jobs[bucket]=data.jobs||[];state.loaded[bucket]=true;state.activeBucket=bucket;}catch(e){toast(`โหลดรายการงานไม่ได้: ${e.message||'เกิดข้อผิดพลาด'}`);}finally{state.loading=false;render();}}
  async function preloadForPage(){if(page==='admin'){state.activeBucket='unpaid';await Promise.allSettled([loadJobsSilent('unpaid'),loadJobsSilent('open')]);render();}if(page==='ops'){state.activeBucket='today';await Promise.allSettled([loadJobsSilent('today'),loadJobsSilent('tomorrow'),loadJobsSilent('open')]);render();}}
  async function loadJobsSilent(bucket){try{const data=await api(`/admin/ai-office/jobs?bucket=${encodeURIComponent(bucket)}`);state.jobs[bucket]=data.jobs||[];state.loaded[bucket]=true;}catch(_){state.jobs[bucket]=[];state.loaded[bucket]=false;}}

  async function ask(question){
    const q=String(question||'').trim();if(!q)return toast('กรุณาพิมพ์คำสั่ง');
    if(state.answer&&state.lastQuestion){state.history.push({q:state.lastQuestion,a:state.answer});if(state.history.length>6)state.history=state.history.slice(-6);}
    state.loading=true;state.answer='';state.answerMeta='';state.lastQuestion=q;render();
    try{
      const agent=agentForPage();
      const data=await api('/admin/ai-office/ask',{method:'POST',body:JSON.stringify({question:q,agent})});
      state.answer=data.answer||'ไม่มีคำตอบ';
      const rel=data.context&&data.context.office_chat_agents;
      state.answerMeta=Array.isArray(rel)&&rel.length?`แผนกที่เกี่ยวข้อง: ${rel.join(', ')}`:'';
    }catch(e){state.answer=`ใช้งานไม่ได้ในตอนนี้: ${e.message||'เกิดข้อผิดพลาด'}`;}
    finally{state.loading=false;render();}
  }

  function summarizeBucket(){const b=state.activeBucket||'unpaid';const jobs=state.jobs[b]||[];if(!jobs.length)return toast('ยังไม่มีรายการให้สรุป');const brief=jobs.slice(0,35).map(jobLine).join('\n');ask(`ช่วยสรุป${bucketLabel[b]||'รายการงาน'}ให้แอดมินใช้งานจริง แยกสิ่งที่ต้องตามก่อน ความเสี่ยง และข้อความที่ควรส่งต่อทีม:\n${brief}`);}
  async function copyText(text){if(!text)return toast('ยังไม่มีข้อมูลให้คัดลอก');try{await navigator.clipboard.writeText(text);toast('คัดลอกแล้ว');}catch(_){toast('คัดลอกไม่ได้');}}
  function currentOutputText(){return state.answer||'';}
  function endWord(tone){if(tone==='male')return 'ครับ'; if(tone==='neutral')return ''; return 'ค่ะ';}
  function normalizeEnd(text,tone){const e=endWord(tone);let out=clean(text);if(!e)return out;out=out.replace(/ค่ะค่ะ/g,'ค่ะ').replace(/ครับครับ/g,'ครับ');if(!new RegExp(`${e}$`).test(out))out+=e;return out;}
  function buildPaymentMessage(j){const tone=defaultReplyTone();const e=endWord(tone);return normalizeEnd(`สวัสดี${e} ขออนุญาตแจ้งติดตามยอดชำระของงาน ${getJobCode(j)} ยอด ${money(j.job_price)} บาท หากลูกค้าสะดวกชำระเรียบร้อยแล้ว แจ้งแอดมินได้เลยนะ${e}`, tone);}
  function buildTechMessage(j){return `แจ้งงาน ${getJobCode(j)}
ลูกค้า: ${clean(j.customer_name)||'-'}
เบอร์: ${clean(j.customer_phone)||'-'}
เวลา: ${clean(j.appointment_display||j.appointment_time_th)||'-'}
บริการ: ${clean(j.job_type||j.service_type)||'-'}
พื้นที่: ${clean(j.job_zone||j.address_text)||'-'}
สถานะ: ${clean(j.job_status)||'-'}`;}
  function buildCustomerConfirm(j){const tone=defaultReplyTone();const e=endWord(tone);return normalizeEnd(`ยืนยันนัดหมายงาน ${getJobCode(j)}
วันเวลา: ${clean(j.appointment_display||j.appointment_time_th)||'-'}
บริการ: ${clean(j.job_type||j.service_type)||'-'}
พื้นที่: ${clean(j.job_zone)||'-'}
ช่างจะติดต่อก่อนเข้าหน้างานอีกครั้งนะ${e}`, tone);}
  function buildJobSummary(j){return `สรุปงาน ${getJobCode(j)}\nลูกค้า: ${clean(j.customer_name)||'-'} / ${clean(j.customer_phone)||'-'}\nนัดหมาย: ${clean(j.appointment_display||j.appointment_time_th)||'-'}\nบริการ: ${clean(j.job_type||j.service_type)||'-'}\nพื้นที่: ${clean(j.job_zone)||'-'}\nราคา: ${money(j.job_price)} บาท\nสถานะงาน: ${clean(j.job_status)||'-'}\nสถานะชำระ: ${clean(j.payment_status)||'-'}\nช่าง: ${clean(j.technician_username||j.technician_team)||'-'}`;}
  function pushDraftAsAnswer(text){if(state.answer&&state.lastQuestion){state.history.push({q:state.lastQuestion,a:state.answer});if(state.history.length>6)state.history=state.history.slice(-6);}state.answer=text;state.answerMeta='ร่างจากข้อมูลงานจริง · ตรวจก่อนส่งเอง';state.lastQuestion='(ร่างข้อความจากปุ่ม)';render();}
  function handleJobAction(action,job){logWorkAction(action,job);if(action==='phone')return copyText(clean(job.customer_phone));if(action==='payment')return pushDraftAsAnswer(buildPaymentMessage(job));if(action==='tech')return pushDraftAsAnswer(buildTechMessage(job));if(action==='customer-confirm')return pushDraftAsAnswer(buildCustomerConfirm(job));if(action==='job-summary')return pushDraftAsAnswer(buildJobSummary(job));}
  function packageLabel(pkg){return ({normal:"ล้างปกติ",premium:"ล้างพรีเมียม",hanging:"ล้างแบบแขวนคอยล์",deep:"ตัดล้างใหญ่"}[pkg]||pkg);}
  function priceTextFor(btu,pkg){const set=btu==='large'?servicePrices.large:servicePrices.small;if(btu==='unknown')return "ราคาล้างแอร์ผนังเริ่มต้น 550 บาท/เครื่อง";if(pkg==='all')return `ราคาโปรผนัง ${btu==='large'?'18,000 BTU ขึ้นไป':'ไม่เกิน 12,000 BTU'}: ล้างปกติ ${money(set.normal)} บาท, พรีเมียม ${money(set.premium)} บาท, แขวนคอยล์ ${money(set.hanging)} บาท, ตัดล้างใหญ่ ${money(set.deep)} บาท`;return `${packageLabel(pkg)} ${money(set[pkg]||set.normal)} บาท/เครื่อง`; }
  function buildSalesReply(form){const intent=form.intent.value, tone=form.tone.value, btu=form.btu.value, pkg=form.package?.value||'normal', qty=clean(form.qty.value)||'1', area=clean(form.area.value), service=form.service.value, customer=clean(form.customer.value);setReplyTone(tone);const e=endWord(tone);const priceLine=priceTextFor(btu,pkg);let msg='';if(intent==='price')msg=`${priceLine}${qty?` จำนวน ${qty} เครื่อง`:''}${area?` โซน ${area}`:''}${e}
ถ้าต้องการให้นัดหมาย รบกวนแจ้งวันที่สะดวก ที่อยู่/โลเคชัน และเบอร์โทรสำหรับให้แอดมินตรวจคิวก่อนยืนยันนัดนะ${e}`;else if(intent==='expensive')msg=`เข้าใจ${e} งานของ Coldwindflow เน้นทำงานเป็นระบบ แจ้งราคาก่อนเริ่ม และรับประกันงานล้าง 30 วันสำหรับอาการที่เกิดจากบริการ${e}
ถ้าต้องการเริ่มจากงบที่คุมได้ แนะนำเริ่มจากล้างปกติตามโปรปัจจุบันก่อน แล้วให้ช่างประเมินหน้างานโดยไม่เพิ่มงานเองก่อนแจ้งลูกค้านะ${e}`;else if(intent==='booking')msg=`ได้เลย${e} รบกวนขอชื่อ เบอร์โทร พื้นที่/โลเคชัน จำนวนเครื่อง ขนาด BTU และวันเวลาที่สะดวก เดี๋ยวแอดมินตรวจคิวก่อนยืนยันนัดให้นะ${e}`;else if(intent==='repair')msg=`เบื้องต้นรับตรวจเช็ค${service}${customer?` จากอาการที่แจ้ง: ${customer}`:''}${e}
รบกวนแจ้งพื้นที่ รุ่น/ขนาด BTU และรูปหรือวิดีโออาการเพิ่มเติม เดี๋ยวแอดมินประเมินแนวทางและแจ้งคิวให้ก่อนนะ${e}`;else msg=`Hello, Coldwindflow Air Services provides air conditioner cleaning, repair, installation, and inspection. Please share your area, number of units, BTU size, and preferred date/time. Our admin will check the queue before confirming the appointment.`;return clean(msg);}
  function buildContent(form){const type=form.type.value,service=form.service.value,area=clean(form.area.value)||'พื้นที่ให้บริการหลัก',proof=clean(form.proof.value)||'ช่างทำงานเป็นระบบ แจ้งราคาก่อนเริ่ม',angle=clean(form.angle.value)||'โปรหน้าฝนเริ่มต้น 550 บาท';const e=endWord(defaultReplyTone());if(type==='review')return `ขอบคุณลูกค้าที่ไว้วางใจให้ทีม Coldwindflow ดูแล${service}นะ${e}
${proof}
ทีมงานจะรักษามาตรฐานงานให้เรียบร้อย สะอาด และตรวจสอบได้ทุกงาน${e}

LINE: @cwfair
โทร 098-877-7321`;
    if(type==='video')return `สคริปต์วิดีโอสั้น
เปิด: แอร์ไม่เย็น/มีกลิ่นอับ อาจไม่ได้จบแค่ล้างผิวหน้า
ภาพงาน: โชว์คอยล์/ถาดน้ำทิ้ง/ก่อน-หลัง
พูด: ทีม Coldwindflow ตรวจเช็คและแจ้งราคาก่อนเริ่มงาน
ปิด: ${area} ทัก LINE @cwfair หรือโทร 098-877-7321`;
    if(type==='ad')return `Angle โฆษณา ${service} ${area}
1) ${angle}
2) ${proof}
3) CTA: ส่งรูปแอร์/จำนวนเครื่อง/พื้นที่ เพื่อให้แอดมินเช็คคิว
Keyword: ${service} ${area}, แอร์ไม่เย็น, แอร์น้ำหยด, ล้างแอร์ใกล้ฉัน`;
    return `${service} ${area}
${angle}
ทีม Coldwindflow Air Services ดูแลโดยทีมช่างมืออาชีพ ${proof}

สอบถาม/นัดหมาย
LINE: @cwfair
โทร: 098-877-7321`;}
  function buildCodexPrompt(form){return `Project: CWF AI Office / Coldwindflow Air Services\n\nหัวข้องาน:\n${clean(form.title.value)||'-'}\n\nPhase:\n${clean(form.phase.value)||'Production fix'}\n\nปัญหาที่ต้องแก้:\n${clean(form.problem.value)||'-'}\n\nไฟล์/พื้นที่ที่เกี่ยวข้อง:\n${clean(form.files.value)||'-'}\n\nRules:\n- ห้ามทำ demo/mock/sample/prototype\n- ห้ามสร้างระบบใหม่แยกจาก CWF production\n- ใช้ข้อมูลจริงจากระบบ CWF เท่านั้น\n- OpenAI API ต้องอยู่ฝั่ง server เท่านั้น\n- ห้าม expose API key ใน frontend\n- ห้ามแก้ฐานข้อมูลหรือสถานะงานจาก AI Office เว้นแต่ระบุชัด\n\nThings not to touch:\n${clean(form.notouch.value)||'- ห้าม rewrite ระบบหลัก\n- ห้ามกระทบ flow เพิ่มงาน/รับงาน/ปิดงานของช่าง'}\n\nDefinition of Done:\n1. หน้าใช้งานได้จริงบน admin\n2. ไม่มีปุ่มซ้อนหรือ UI เกม/ตัวละคร\n3. ข้อมูลจริงโหลดก่อน AI\n4. มี error state ชัดเจน\n5. ผ่าน syntax check\n6. ไม่กระทบระบบ CWF เดิม\n\nManual Test Checklist:\n- เปิดหน้า admin ที่เกี่ยวข้อง\n- ทดสอบบนมือถือ\n- ทดสอบโหลดข้อมูลจริง\n- ทดสอบปุ่มคัดลอก/ร่างข้อความ\n- ทดสอบ error state\n\nRegression Checklist:\n- Admin dashboard เดิม\n- Queue/Job view\n- LINE webhook\n- Tracking ลูกค้า\n\nRollback:\n- revert commit ล่าสุด\n- restore ไฟล์ frontend/backend ที่แก้\n- ปิด feature flag/env ที่เกี่ยวข้อง`;}
  function draftDispatchSummary(){const jobs=state.jobs[state.activeBucket||'today']||[];if(!jobs.length)return toast('ยังไม่มีคิวให้สรุป');pushDraftAsAnswer(`สรุปคิว${bucketLabel[state.activeBucket]||''}\n`+jobs.map((j,i)=>`${i+1}. ${getJobCode(j)} ${clean(j.appointment_time_th||j.appointment_display)||'-'} / ${clean(j.customer_name)||'-'} / ${clean(j.job_zone)||'-'} / ช่าง: ${clean(j.technician_username||j.technician_team)||'ยังไม่เห็นช่าง'}`).join('\n'));}
  async function aiPolish(prefix){if(!state.answer)return toast('ยังไม่มีข้อความให้ AI เกลา');await ask(`${prefix||'ช่วยเกลาข้อความนี้ให้พร้อมใช้งานจริง กระชับ สุภาพ และไม่เพิ่มข้อมูลใหม่'}:\n${state.answer}`);}

  function bind(){
    document.addEventListener('click',e=>{
      const sc=e.target.closest('[data-shortcut]');
      if(sc){const list=shortcuts[page]||shortcuts.home;const item=list[Number(sc.dataset.shortcut)];if(item){logWorkAction('shortcut',null,{label:item.label});ask(item.q);}return;}
      const tab=e.target.closest('[data-bucket]');
      if(tab){state.activeBucket=tab.dataset.bucket; if(!state.loaded[state.activeBucket])loadJobs(state.activeBucket); else render(); return;}
      const act=e.target.closest('[data-action]');
      if(act){const a=act.dataset.action;
        if(a==='refresh'){loadSummary();loadHealth();preloadForPage();}
        if(a==='health')loadHealth();
        if(a==='toggle-builder'){state.showBuilder=!state.showBuilder;render();}
        if(a==='phone-search'){const p=$('#phoneInput')?.value||'';loadJobs('phone',p);}
        if(a==='summarize-bucket'){logWorkAction('summarize_bucket',null,{bucket:state.activeBucket});summarizeBucket();}
        if(a==='draft-dispatch-summary')draftDispatchSummary();
        if(a==='copy'){logWorkAction('copy_output',null,{text_length:currentOutputText().length});copyText(currentOutputText());}
        if(a==='clear-output'){state.answer='';state.answerMeta='';state.lastQuestion='';state.history=[];render();}
        if(a==='ai-polish')aiPolish();
        if(a==='ai-sales-polish')aiPolish('ช่วยเกลาข้อความขายนี้ให้น่าเชื่อถือและพร้อมส่งลูกค้า โดยไม่ลดราคาเอง');
        if(a==='ai-content-polish')aiPolish('ช่วยทำคอนเทนต์นี้เพิ่ม 3 เวอร์ชัน ใช้โทนมืออาชีพ ไม่เวอร์เกินจริง');
        if(a==='deploy-checklist'){pushDraftAsAnswer(buildCodexPrompt({title:{value:'Checklist ก่อน deploy'},phase:{value:'Production deploy'},problem:{value:'ตรวจความพร้อมก่อน deploy CWF AI Office'},files:{value:'Render env, routes, migrations, frontend pages'},notouch:{value:'ห้ามแก้ระบบหลักนอก scope'}}));}
      }
      const ja=e.target.closest('[data-job-action]');
      if(ja){try{handleJobAction(ja.dataset.jobAction,JSON.parse(ja.dataset.job||'{}'));}catch(_){toast('อ่านข้อมูลงานไม่ได้');}}
    });
    document.addEventListener('submit',e=>{
      if(e.target.id==='askForm'){e.preventDefault();const ta=$('#askInput');const q=ta?ta.value:'';if(ta)ta.value='';ask(q);return;}
      if(e.target.id==='salesBuilder'){e.preventDefault();pushDraftAsAnswer(buildSalesReply(e.target));}
      if(e.target.id==='contentBuilder'){e.preventDefault();pushDraftAsAnswer(buildContent(e.target));}
      if(e.target.id==='devBuilder'){e.preventDefault();pushDraftAsAnswer(buildCodexPrompt(e.target));}
    });
    document.addEventListener('input',e=>{if(e.target.id==='askInput')autoGrow(e.target);});
    document.addEventListener('keydown',e=>{if(e.target.id==='askInput'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();const f=$('#askForm');if(f)f.requestSubmit();}});
  }

  function init(){render();bind();loadSummary().then(()=>{loadHealth();preloadForPage();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
