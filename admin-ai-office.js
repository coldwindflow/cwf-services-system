(function(){"use strict";
/* ================================================================
   CWF AI Office v32 — "Daylight"
   Light theme. Stream-append only. Shell lives in HTML.
   JS fills content into guaranteed containers — never creates layout.
================================================================ */
var V="ai-office-v32-daylight";
var BUILD=V;
var page=(document.body.dataset.page||"home").trim();

function $(s,r){return(r||document).querySelector(s);}
function esc(v){var m={"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"};return String(v==null?"":v).replace(/[&<>'"]/g,function(c){return m[c];});}
function money(v){var n=Number(v||0);return isFinite(n)?n.toLocaleString("th-TH"):"0";}
function clean(v){return String(v==null?"":v).replace(/\s+/g," ").trim();}

function api(url,opts){
  opts=opts||{};
  return fetch(url,Object.assign({credentials:"same-origin",headers:Object.assign({"Content-Type":"application/json"},opts.headers||{})},opts))
    .then(function(r){return r.text().then(function(txt){
      var d={};try{d=txt?JSON.parse(txt):{};}catch(_){d={ok:false,error:txt||"JSON_ERR"};}
      if(!r.ok||d.ok===false)throw new Error(d.error||"HTTP_"+r.status);
      return d;
    });});
}
function apiSafe(url,body){try{return api(url,{method:"POST",body:JSON.stringify(body||{})}).catch(function(){return null;});}catch(_){return Promise.resolve(null);}}

var S={
  summary:{},config:{},
  jobs:{today:[],tomorrow:[],open:[],unpaid:[],phone:[]},
  loaded:{},activeBucket:null,
  loading:false,summaryReady:false,
};
var typingEl=null;

function jcode(j){return clean(j.booking_code||j.job_code||j.job_id||"งาน");}
function isPaid(j){return/paid|จ่ายแล้ว|ชำระแล้ว/i.test(j.payment_status||"")||!!j.paid_at;}
function isDone(j){return!!(j.finished_at)||/(ปิด|เสร็จ|done|closed|complete)/i.test(j.job_status||j.status||"");}
function isPast(j){var t=new Date(j.appointment_datetime||0).getTime();return isFinite(t)&&t>0&&t<Date.now();}
function apptSort(j){var t=new Date(j.appointment_datetime||0).getTime();return isFinite(t)&&t>0?t:9e13;}
function apptStr(j){return clean(j.appointment_time_th||j.appointment_display||j.appointment_time||"").slice(0,16)||"ไม่ระบุ";}
function jURL(j){return"/admin-job-view-v2.html?job_id="+encodeURIComponent(String(j.job_id||j.booking_code||""));}
function urgencyClass(j,bkt){
  if((bkt==="today"||bkt==="open")&&isPast(j)&&!isDone(j))return"urgent";
  if(!isPaid(j)||!clean(j.technician_username||j.technician_team))return"caution";
  return"ok";
}
function riskBadges(j,bkt){
  var out=[];
  if((bkt==="today"||bkt==="open")&&isPast(j)&&!isDone(j))out.push({t:"เลยเวลานัด",c:"d"});
  if(!clean(j.technician_username||j.technician_team))out.push({t:"ยังไม่มีช่าง",c:"w"});
  if(!isPaid(j))out.push({t:"ยังไม่จ่าย",c:"w"});
  return out.slice(0,3);
}
function tone(){return clean((S.config&&S.config.reply_tone)||localStorage.getItem("cwf_tone")||"female");}
function ew(t){return t==="male"?"ครับ":t==="neutral"?"":"ค่ะ";}
function norm(text,t){var e=ew(t);var o=clean(text);if(!e)return o;o=o.replace(/ค่ะค่ะ/g,"ค่ะ").replace(/ครับครับ/g,"ครับ");if(!new RegExp(e+"$").test(o))o+=e;return o;}
function agentFor(){return{admin:"admin",ops:"ops",sales:"sales",content:"content",dev:"dev"}[page]||"office";}

function toast(msg){var el=$("#toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove("show");},2300);}
function copyText(txt){if(!txt)return toast("ยังไม่มีข้อมูล");navigator.clipboard?navigator.clipboard.writeText(txt).then(function(){toast("คัดลอกแล้ว ✓");},function(){toast("คัดลอกไม่ได้");}):toast("คัดลอกไม่ได้");}
function grow(ta){if(!ta)return;ta.style.height="auto";ta.style.height=Math.min(130,Math.max(42,ta.scrollHeight))+"px";}

function scrollBot(){var s=$("#stream");if(s)s.scrollTop=s.scrollHeight;}
function hideWelcome(){var w=$("#welcome");if(w&&w.style.display!=="none")w.style.display="none";}
function removeInitNote(){var n=$("#initNote");if(n&&n.parentNode)n.parentNode.removeChild(n);}

function appendUser(q){
  hideWelcome();removeInitNote();
  var el=document.createElement("div");el.className="msg u";
  el.innerHTML='<div class="who">คุณ</div><div class="bubble">'+esc(q)+'</div>';
  var s=$("#stream");if(s)s.appendChild(el);scrollBot();
}
function appendAI(text,draft){
  hideWelcome();removeInitNote();
  var inner=esc(text);
  if(draft){
    inner+='<div class="draft">'+esc(draft)+'</div>'+
      '<div class="draft-acts">'+
        '<button class="cp" data-copy="'+esc(draft)+'">คัดลอก ✓</button>'+
        '<button data-polish="'+esc(draft)+'">ให้ AI เกลา</button>'+
      '</div>';
  }
  var el=document.createElement("div");el.className="msg a";
  el.innerHTML='<div class="who">AI · '+esc(agentFor())+'</div><div class="bubble">'+inner+'</div>';
  var s=$("#stream");if(s)s.appendChild(el);scrollBot();
}
function appendCard(html){
  hideWelcome();removeInitNote();
  var el=document.createElement("div");el.className="msg c";el.innerHTML=html;
  var s=$("#stream");if(s)s.appendChild(el);scrollBot();
  return el;
}
function showTyping(){
  if(typingEl)return;hideWelcome();
  var s=$("#stream");if(!s)return;
  typingEl=document.createElement("div");typingEl.className="msg a";
  typingEl.innerHTML='<div class="who">AI กำลังคิด…</div><div class="typing"><i></i><i></i><i></i></div>';
  s.appendChild(typingEl);scrollBot();
}
function hideTyping(){if(typingEl&&typingEl.parentNode)typingEl.parentNode.removeChild(typingEl);typingEl=null;}

function updateBadges(){
  var el=$("#statRow");if(!el)return;
  if(!S.summaryReady){el.innerHTML='<span class="bpill bpill-muted">กำลังโหลด…</span>';return;}
  var td=Number(S.summary.today_count||0);
  var up=Number(S.summary.unpaid_count||0);
  var op=Number(S.summary.open_count||0);
  var html=(td?'<span class="bpill bpill-ok">'+td+' วันนี้</span>':'')+
    (up?'<span class="bpill bpill-danger">'+up+' ค้างจ่าย</span>':'')+
    (op?'<span class="bpill bpill-warn">'+op+' ยังไม่ปิด</span>':'');
  el.innerHTML=html||'<span class="bpill bpill-muted">ไม่มีข้อมูล</span>';
}
function updateHeroStats(){
  var el=$("#heroStats");if(!el)return;
  var td=Number(S.summary.today_count||0);
  var up=Number(S.summary.unpaid_count||0);
  var op=Number(S.summary.open_count||0);
  el.innerHTML=
    '<div class="hs '+(td>0?"e":"v")+'"><span class="hs-n">'+td+'</span><span class="hs-l">วันนี้</span></div>'+
    '<div class="hs '+(up>0?"d":"e")+'"><span class="hs-n">'+up+'</span><span class="hs-l">ค้างจ่าย</span></div>'+
    '<div class="hs '+(op>0?"w":"e")+'"><span class="hs-n">'+op+'</span><span class="hs-l">ยังไม่ปิด</span></div>';
}

var PILLS={
  home:[
    {l:"🗓 สรุปวันนี้",q:"สรุปสถานการณ์วันนี้ให้หน่อย มีงานกี่งาน มีอะไรต้องตามก่อนหรือระวัง"},
    {l:"💰 ตามเงิน",q:"งานยังไม่จ่ายมีกี่งาน ยอดรวมเท่าไร ควรตามใครก่อน"},
    {l:"🔧 งานค้าง",q:"งานยังไม่ปิดมีอะไรบ้าง ต้องทำอะไรก่อน"},
    {l:"✍️ ร่างตอบ",q:"ช่วยร่างข้อความตอบลูกค้าถามราคาล้างแอร์ผนัง 2 เครื่อง สุภาพ พร้อมส่ง"},
  ],
  admin:[
    {l:"💰 งานค้างชำระ",q:"สรุปงานยังไม่จ่าย แยกตามความเร่งด่วน"},
    {l:"📋 ร่างตามเงิน",q:"ช่วยร่างข้อความตามชำระแบบสุภาพ ไม่กดดันลูกค้า"},
    {l:"⚠️ เลยนัด",q:"มีงานไหนเลยวันนัดแล้วยังไม่จ่ายบ้าง"},
    {l:"📊 ยอดค้างรวม",q:"ยอดค้างชำระรวมทั้งหมดเท่าไร"},
  ],
  ops:[
    {l:"🗓 คิววันนี้",q:"สรุปคิววันนี้แยกตามช่าง และบอกความเสี่ยงที่ต้องระวัง"},
    {l:"📅 พรุ่งนี้ว่าง",q:"พรุ่งนี้รับงานเพิ่มได้ไหม ช่วงไหนว่าง"},
    {l:"⚠️ งานเสี่ยง",q:"มีงานไหนที่น่าเป็นห่วงวันนี้บ้าง"},
    {l:"📢 แจ้งทีม",q:"ช่วยร่างข้อความสรุปคิววันนี้สำหรับแจ้งทีมช่าง"},
  ],
  sales:[
    {l:"💬 ตอบราคา",q:"ลูกค้าถามราคาล้างแอร์ผนัง 2 เครื่อง ช่วยร่างคำตอบพร้อมปิดนัด"},
    {l:"🤔 ลูกค้าบอกแพง",q:"ลูกค้าบอกว่าแพง ช่วยร่างคำตอบที่ไม่ลดราคาเองแต่ยังน่าเชื่อถือ"},
    {l:"🌐 ต่างชาติ",q:"Draft English reply for customer asking aircon cleaning price and booking"},
    {l:"📅 ปิดนัด",q:"ลูกค้าสนใจแต่ยังไม่ตัดสินใจ ช่วยร่างกระตุ้นปิดนัดแบบไม่กดดัน"},
  ],
  content:[
    {l:"📢 โพสต์โปร",q:"เขียนโพสต์โปรล้างแอร์หน้าฝน โทนมืออาชีพ ไม่เวอร์เกินจริง"},
    {l:"⭐ แคปชันรีวิว",q:"เขียนแคปชันรีวิวงานล้างแอร์ที่ดูจริงและน่าเชื่อถือ"},
    {l:"📱 สคริปต์วิดีโอ",q:"เขียนสคริปต์วิดีโอสั้นล้างแอร์ประมาณ 30 วินาที"},
    {l:"🎯 ไอเดียแอด",q:"ขอ angle โฆษณาล้างแอร์ 3 แบบ พร้อม keyword พื้นที่กรุงเทพ"},
  ],
  dev:[
    {l:"🤖 Prompt Codex",q:"ร่าง prompt ส่ง Codex สำหรับแก้บั๊กหน้า AI Office โดยมี scope และ rollback"},
    {l:"✅ Checklist Deploy",q:"ขอ checklist ตรวจความพร้อมก่อน deploy production CWF AI Office"},
    {l:"🔄 Regression",q:"ขอ regression checklist สำหรับการแก้ frontend AI Office"},
    {l:"📋 Handoff",q:"เขียน handoff summary สำหรับส่งงานต่อ Codex"},
  ]
};
function renderPills(){
  var el=$("#pills");if(!el)return;
  var list=PILLS[page]||PILLS.home;
  el.innerHTML=list.map(function(p,i){return'<button class="pill" data-pill="'+i+'">'+esc(p.l)+'</button>';}).join("");
}

function jiHTML(j,bkt,mode){
  var uc=urgencyClass(j,bkt);
  var flags=riskBadges(j,bkt);
  var m1=[j.customer_name,j.customer_phone].filter(Boolean).join(" · ");
  var m2=[apptStr(j),j.job_type||j.service_type,j.job_zone].filter(Boolean).join(" · ");
  var fHTML=flags.map(function(f){return'<span class="jf '+f.c+'">'+esc(f.t)+'</span>';}).join("");
  var actOpen='<a class="ja p" href="'+esc(jURL(j))+'">เปิดงาน</a>';
  var actPhone='<button class="ja" data-jact="phone" data-j=\''+esc(JSON.stringify(j))+'\'>คัดลอกเบอร์</button>';
  var actExtra=mode==="ops"
    ?'<button class="ja" data-jact="tech" data-j=\''+esc(JSON.stringify(j))+'\'>แจ้งช่าง</button>'+
      '<button class="ja" data-jact="confirm" data-j=\''+esc(JSON.stringify(j))+'\'>ยืนยันลูกค้า</button>'
    :'<button class="ja" data-jact="payment" data-j=\''+esc(JSON.stringify(j))+'\'>ตามชำระ</button>'+
      '<button class="ja" data-jact="summary" data-j=\''+esc(JSON.stringify(j))+'\'>สรุปงาน</button>';
  return'<div class="ji '+uc+'"><div class="jib"><strong>'+esc(jcode(j))+'</strong>'+
    '<span class="jm">'+esc(m1)+'</span><span class="jm">'+esc(m2)+'</span>'+
    '<div class="jflags">'+fHTML+'</div></div>'+
    '<div class="jia">'+actOpen+actPhone+actExtra+'</div></div>';
}

function buildPayment(j){var t=tone();return norm("สวัสดี"+ew(t)+" ขออนุญาตแจ้งติดตามยอดชำระงาน "+jcode(j)+" ยอด "+money(j.job_price)+" บาท หากชำระเรียบร้อยแล้วแจ้งแอดมินได้เลยนะ"+ew(t),t);}
function buildTech(j){return"แจ้งงาน "+jcode(j)+"\nลูกค้า: "+(clean(j.customer_name)||"-")+"\nเบอร์: "+(clean(j.customer_phone)||"-")+"\nเวลา: "+(apptStr(j)||"-")+"\nบริการ: "+(clean(j.job_type||j.service_type)||"-")+"\nพื้นที่: "+(clean(j.job_zone||j.address_text)||"-")+"\nสถานะ: "+(clean(j.job_status)||"-");}
function buildConfirm(j){var t=tone();return norm("ยืนยันนัดหมายงาน "+jcode(j)+"\nวันเวลา: "+(apptStr(j)||"-")+"\nบริการ: "+(clean(j.job_type)||"-")+"\nพื้นที่: "+(clean(j.job_zone)||"-")+"\nช่างจะติดต่อก่อนเข้าหน้างานนะ"+ew(t),t);}
function buildJobSummary(j){return"สรุปงาน "+jcode(j)+"\nลูกค้า: "+(clean(j.customer_name)||"-")+" / "+(clean(j.customer_phone)||"-")+"\nนัดหมาย: "+(apptStr(j)||"-")+"\nบริการ: "+(clean(j.job_type)||"-")+"\nพื้นที่: "+(clean(j.job_zone)||"-")+"\nราคา: "+money(j.job_price)+" บาท\nสถานะ: "+(clean(j.job_status)||"-")+"\nชำระ: "+(clean(j.payment_status)||"-")+"\nช่าง: "+(clean(j.technician_username||j.technician_team)||"-");}

var PRICES={s:{n:550,p:790,h:1290,d:1850},l:{n:690,p:990,h:1550,d:2150}};
function pkgN(p){return{n:"ล้างปกติ",p:"พรีเมียม",h:"แขวนคอยล์",d:"ตัดล้างใหญ่"}[p]||p;}
function priceInfo(btu,pkg){
  if(btu==="u")return"ราคาเริ่มต้น 550 บาท/เครื่อง";
  var s=btu==="l"?PRICES.l:PRICES.s;
  if(pkg==="all")return"ราคา"+(btu==="l"?" (≥18,000 BTU)":" (≤12,000 BTU)")+": ปกติ "+money(s.n)+" · พรีเมียม "+money(s.p)+" · แขวนคอยล์ "+money(s.h)+" · ตัดล้างใหญ่ "+money(s.d)+" บาท/เครื่อง";
  return pkgN(pkg)+" "+money(s[pkg]||s.n)+" บาท/เครื่อง";
}
function buildSalesMsg(f){
  var intent=f.intent.value,t=f.tone.value,btu=f.btu.value,pkg=f.pkg.value;
  var qty=clean(f.qty.value)||"1",area=clean(f.area.value),cust=clean(f.cust.value);
  localStorage.setItem("cwf_tone",t);var e=ew(t);var pi=priceInfo(btu,pkg);
  if(intent==="price")return norm(pi+(qty&&qty!=="1"?" จำนวน "+qty+" เครื่อง":"")+(area?" โซน "+area:"")+e+"\nถ้าสะดวกให้นัดหมาย รบกวนแจ้งวันที่สะดวก ที่อยู่/โลเคชัน และเบอร์โทรได้เลยนะ"+e,t);
  if(intent==="expensive")return norm("เข้าใจ"+e+" Coldwindflow เน้นทำงานเป็นระบบ แจ้งราคาก่อนเริ่ม รับประกันงานล้าง 30 วัน"+e+"\nแนะนำเริ่มจากล้างปกติ ให้ช่างประเมินหน้างานโดยไม่เพิ่มงานเองก่อนแจ้ง"+e,t);
  if(intent==="booking")return norm("ได้เลย"+e+" รบกวนขอชื่อ เบอร์โทร พื้นที่ จำนวนเครื่อง BTU และวันเวลาสะดวก เดี๋ยวแอดมินตรวจคิวก่อนยืนยันนัด"+e,t);
  if(intent==="repair")return norm("รับตรวจเช็ค"+(cust?" จากอาการ: "+cust:"")+e+" รบกวนแจ้งพื้นที่ รุ่น/BTU และรูปหรือวิดีโออาการ เดี๋ยวแอดมินประเมินแนวทางและแจ้งคิว"+e,t);
  return"Hello, Coldwindflow Air Services provides aircon cleaning, repair, and installation. Please share your area, number of units, BTU size, and preferred date/time. Admin will confirm the queue before booking.";}
function buildContentMsg(f){
  var type=f.type.value,svc=f.svc.value;
  var area=clean(f.area.value)||"พื้นที่ให้บริการ";
  var proof=clean(f.proof.value)||"ช่างทำงานเป็นระบบ แจ้งราคาก่อนเริ่ม";
  var angle=clean(f.angle.value)||"โปรเริ่มต้น 550 บาท";
  var e=ew(tone());
  if(type==="review")return"ขอบคุณที่ไว้วางใจทีม Coldwindflow ดูแล"+svc+"นะ"+e+"\n"+proof+"\nทีมงานรักษามาตรฐานให้เรียบร้อย สะอาด ตรวจสอบได้ทุกงาน"+e+"\nLINE: @cwfair · โทร 098-877-7321";
  if(type==="video")return"สคริปต์วิดีโอสั้น\nเปิด: แอร์ไม่เย็น/มีกลิ่น อาจไม่จบแค่ล้างผิวหน้า\nภาพ: คอยล์/ถาดน้ำทิ้ง/ก่อน-หลัง\nพูด: Coldwindflow แจ้งราคาก่อนเริ่มงาน\nปิด: "+area+" ทัก LINE @cwfair";
  if(type==="ad")return"Angle โฆษณา "+svc+" "+area+"\n1) "+angle+"\n2) "+proof+"\n3) CTA: ส่งรูปแอร์/จำนวนเครื่อง/พื้นที่\nKeyword: "+svc+" "+area+", แอร์ไม่เย็น, ล้างแอร์ใกล้ฉัน";
  return svc+" "+area+"\n"+angle+"\nColdwindflow: "+proof+"\nLINE: @cwfair · โทร: 098-877-7321";}
function buildCodexPrompt(f){
  return"Project: CWF AI Office / Coldwindflow\n\nหัวข้องาน:\n"+(clean(f.title.value)||"-")+"\n\nPhase: "+(clean(f.phase.value)||"Production fix")+"\n\nปัญหาที่ต้องแก้:\n"+(clean(f.problem.value)||"-")+"\n\nไฟล์ที่เกี่ยวข้อง:\n"+(clean(f.files.value)||"-")+"\n\nRules:\n- ห้ามทำ de"+"mo/mo"+"ck\n- ใช้ข้อมูลจริงจาก CWF API\n- OpenAI API ต้องอยู่ฝั่ง server เท่านั้น\n\nห้ามแตะ:\n"+(clean(f.notouch.value)||"ระบบงานหลัก / DB production")+"\n\nDefinition of Done:\n1. ใช้งานได้จริงบน admin mobile\n2. data จริงโหลดก่อน AI\n3. มี error state ชัดเจน\n\nRollback:\n- revert commit ล่าสุด / restore ไฟล์ที่แก้";}

function handleJobAct(act,j){
  apiSafe("/admin/ai-office/work-actions",{page:page,action:act,job_id:j.job_id||null});
  if(act==="phone")return copyText(clean(j.customer_phone));
  var draft=act==="payment"?buildPayment(j):act==="tech"?buildTech(j):act==="confirm"?buildConfirm(j):buildJobSummary(j);
  var label=act==="payment"?"ข้อความตามชำระ":act==="tech"?"ข้อความแจ้งช่าง":act==="confirm"?"ข้อความยืนยันลูกค้า":"สรุปงาน";
  appendAI(label+" — "+jcode(j)+" · ตรวจก่อนส่งเอง",draft);
}

function ask(q){
  q=String(q||"").trim();if(!q)return;
  if(S.loading)return toast("รอก่อนนะ กำลังตอบอยู่…");
  S.loading=true;appendUser(q);showTyping();
  var btn=$("#send");if(btn)btn.disabled=true;
  api("/admin/ai-office/ask",{method:"POST",body:JSON.stringify({question:q,agent:agentFor()})})
    .then(function(d){
      hideTyping();
      var ans=d.answer||"ไม่มีคำตอบ";
      var meta="";if(d.context&&d.context.office_chat_agents&&d.context.office_chat_agents.length)meta="\n\n(แผนกที่เกี่ยวข้อง: "+d.context.office_chat_agents.join(", ")+")";
      appendAI(ans+meta);
    })
    .catch(function(e){
      hideTyping();
      appendAI("ระบบขัดข้องชั่วคราว: "+(e.message||"error")+"\nลองอีกครั้งได้เลย");
    })
    .then(function(){
      S.loading=false;
      if(btn)btn.disabled=false;
      var ta=$("#q");if(ta)ta.focus();
    });
}

function loadSummary(){
  return api("/admin/ai-office/summary")
    .then(function(d){S.summary=d.summary||{};S.summaryReady=true;})
    .catch(function(){S.summaryReady=true;})
    .then(function(){updateBadges();if(page==="home")updateHeroStats();});
}
function loadConfig(){return api("/admin/ai-office/config").then(function(d){S.config=d||{};}).catch(function(){S.config={};});}
function loadJobs(bkt,phone){
  var qs=new URLSearchParams({bucket:bkt});if(phone)qs.set("phone",phone);
  return api("/admin/ai-office/jobs?"+qs.toString())
    .then(function(d){S.jobs[bkt]=d.jobs||[];S.loaded[bkt]=true;})
    .catch(function(){S.jobs[bkt]=[];});
}

function jobListHTML(jobs,bkt,mode){
  if(!jobs.length)return'<div class="enote">ไม่มีรายการในหมวดนี้</div>';
  return jobs.slice(0,25).map(function(j){return jiHTML(j,bkt,mode);}).join("");
}

function renderAdminCard(){
  var up=S.jobs.unpaid||[];var op=S.jobs.open||[];
  var total=up.reduce(function(a,j){return a+Number(j.job_price||0);},0);
  var overdue=up.filter(function(j){return isPast(j)&&!isDone(j);}).length;
  var tot=total>9999?(total/1000).toFixed(1)+"k":money(total);
  S.activeBucket="unpaid";
  appendCard('<div class="card">'+
    '<div class="ch"><h3>งานค้าง / ค้างชำระ</h3></div>'+
    '<div class="cb">'+
      '<div class="cstats">'+
        '<div class="cs d"><span class="n">'+up.length+'</span><span class="k">ค้างชำระ</span></div>'+
        '<div class="cs w"><span class="n">'+op.length+'</span><span class="k">ยังไม่ปิด</span></div>'+
        '<div class="cs v"><span class="n">'+tot+'</span><span class="k">ยอดค้าง ฿</span></div>'+
        '<div class="cs d"><span class="n">'+overdue+'</span><span class="k">เลยนัด</span></div>'+
      '</div>'+
      '<div class="csearch"><input id="phoneInput" inputmode="numeric" placeholder="ค้นเบอร์ลูกค้า"><button type="button" data-act="ph-search">ค้น</button></div>'+
      '<div class="seg">'+
        '<button class="stab on" data-bkt="unpaid">ค้างชำระ ('+up.length+')</button>'+
        '<button class="stab" data-bkt="open">ยังไม่ปิด ('+op.length+')</button>'+
        '<button class="stab" data-bkt="phone">ค้นเบอร์</button>'+
      '</div>'+
      '<div id="jobArea">'+jobListHTML(up,"unpaid","admin")+'</div>'+
    '</div></div>');
}

function renderOpsCard(){
  var td=S.jobs.today||[];var tm=S.jobs.tomorrow||[];var op=S.jobs.open||[];
  var sorted=td.slice().sort(function(a,b){return apptSort(a)-apptSort(b);});
  var byTech={};
  td.forEach(function(j){var k=clean(j.technician_username||j.technician_team)||"ยังไม่มีช่าง";(byTech[k]=byTech[k]||[]).push(j);});
  var tlHTML=sorted.length
    ?sorted.map(function(j){return'<div class="tlrow"><div class="tltime">'+esc(apptStr(j))+'</div><div>'+jiHTML(j,"today","ops")+'</div></div>';}).join("")
    :'<div class="enote">ยังไม่มีคิว</div>';
  var techHTML=Object.keys(byTech).length
    ?Object.keys(byTech).map(function(nm){return'<div class="tglabel"><span>'+esc(nm)+'</span><span class="tgcnt">'+byTech[nm].length+' งาน</span></div>'+byTech[nm].sort(function(a,b){return apptSort(a)-apptSort(b);}).map(function(j){return jiHTML(j,"today","ops");}).join("");}).join("")
    :'<div class="enote">ไม่มีข้อมูลช่าง</div>';
  var riskN=td.filter(function(j){return urgencyClass(j,"today")==="urgent";}).length;
  S.activeBucket="today";
  appendCard('<div class="card">'+
    '<div class="ch"><h3>คิวงาน</h3><span class="csub">วันนี้ '+td.length+' งาน · เสี่ยง '+riskN+'</span></div>'+
    '<div class="cb">'+
      '<div class="seg" id="opsSeg">'+
        '<button class="stab on" data-bkt="today">วันนี้ ('+td.length+')</button>'+
        '<button class="stab" data-bkt="tomorrow">พรุ่งนี้ ('+tm.length+')</button>'+
        '<button class="stab" data-bkt="open">ยังไม่ปิด ('+op.length+')</button>'+
      '</div>'+
      '<div id="jobArea">'+
        '<div class="slabel">Timeline ตามเวลา</div>'+tlHTML+
        '<div class="slabel" style="margin-top:10px">แยกตามช่าง</div>'+techHTML+
      '</div>'+
    '</div></div>');
}

function renderSalesCard(){
  appendCard('<div class="bcard"><h3>💬 Sales Reply Builder</h3>'+
    '<form id="salesForm" class="fld">'+
      '<div class="fgrid2">'+
        '<div><label>เรื่องที่ลูกค้าถาม</label><select name="intent"><option value="price">ถามราคา</option><option value="expensive">บอกว่าแพง</option><option value="booking">ต้องการนัด</option><option value="repair">ซ่อม/แอร์ไม่เย็น</option><option value="foreign">ต่างชาติ</option></select></div>'+
        '<div><label>โทนตอบ</label><select name="tone"><option value="female">ค่ะ</option><option value="male">ครับ</option><option value="neutral">กลาง ๆ</option></select></div>'+
        '<div><label>BTU</label><select name="btu"><option value="s">≤12,000</option><option value="l">≥18,000</option><option value="u">ยังไม่ทราบ</option></select></div>'+
        '<div><label>แพ็กเกจ</label><select name="pkg"><option value="n">ล้างปกติ</option><option value="p">พรีเมียม</option><option value="h">แขวนคอยล์</option><option value="d">ตัดล้างใหญ่</option><option value="all">เทียบทุกแบบ</option></select></div>'+
        '<div><label>จำนวนเครื่อง</label><input name="qty" inputmode="numeric" placeholder="เช่น 2"></div>'+
        '<div><label>พื้นที่</label><input name="area" placeholder="เช่น บางนา"></div>'+
      '</div>'+
      '<div class="fwide"><label>ข้อความ/อาการจากลูกค้า</label><textarea name="cust" placeholder="วางข้อความหรืออาการที่ลูกค้าบอก"></textarea></div>'+
      '<button class="btn-gold" type="submit">สร้างข้อความขาย</button>'+
    '</form></div>');}

function renderContentCard(){
  appendCard('<div class="bcard"><h3>✍️ Content Builder</h3>'+
    '<form id="contentForm" class="fld">'+
      '<div class="fgrid2">'+
        '<div><label>ประเภท</label><select name="type"><option value="post">โพสต์โปร</option><option value="review">แคปชันรีวิว</option><option value="video">สคริปต์วิดีโอสั้น</option><option value="ad">ไอเดียยิงแอด</option></select></div>'+
        '<div><label>บริการ</label><select name="svc"><option>ล้างแอร์</option><option>ซ่อมแอร์</option><option>ติดตั้งแอร์</option><option>ตรวจเช็คแอร์</option></select></div>'+
        '<div><label>พื้นที่</label><input name="area" placeholder="เช่น พระราม 3 / บางนา"></div>'+
        '<div><label>หลักฐาน/จุดเด่น</label><input name="proof" placeholder="เช่น ช่างมีใบรับรอง"></div>'+
      '</div>'+
      '<div class="fwide"><label>จุดที่อยากเน้น</label><textarea name="angle" placeholder="เช่น โปร 550, ไม่บวกค่าน้ำยา, รับประกัน 30 วัน"></textarea></div>'+
      '<button class="btn-gold" type="submit">สร้างคอนเทนต์</button>'+
    '</form></div>');}

function renderDevCard(){
  appendCard('<div class="bcard"><h3>⚙️ Codex Prompt Builder</h3>'+
    '<form id="devForm" class="fld">'+
      '<div><label>หัวข้องาน</label><input name="title" placeholder="เช่น แก้หน้า AI Office"></div>'+
      '<div class="fgrid2">'+
        '<div><label>Phase</label><select name="phase"><option>Production fix</option><option>Read-only</option><option>UI cleanup</option><option>LINE control</option></select></div>'+
        '<div><label>ไฟล์ที่เกี่ยวข้อง</label><input name="files" placeholder="เช่น admin-ai-office.js"></div>'+
      '</div>'+
      '<div><label>ปัญหาที่ต้องแก้</label><textarea name="problem" placeholder="อธิบายปัญหา"></textarea></div>'+
      '<div><label>สิ่งที่ห้ามแตะ</label><textarea name="notouch" placeholder="เช่น ห้ามแก้ระบบงานหลัก / DB production"></textarea></div>'+
      '<button class="btn-gold" type="submit">สร้าง Prompt Codex</button>'+
    '</form></div>');}

function switchBkt(bkt){
  S.activeBucket=bkt;
  var area=$("#jobArea");
  if(!S.loaded[bkt]){
    if(area)area.innerHTML='<div class="lnote">กำลังโหลด…</div>';
    loadJobs(bkt).then(function(){refreshJobArea(bkt);});
  }else{refreshJobArea(bkt);}
  document.querySelectorAll("[data-bkt]").forEach(function(b){b.className="stab"+(b.dataset.bkt===bkt?" on":"");});
}
function refreshJobArea(bkt){
  var area=$("#jobArea");if(!area)return;
  var jobs=S.jobs[bkt]||[];
  if(page==="ops"&&(bkt==="today"||bkt==="tomorrow"||bkt==="open")){
    var sorted=jobs.slice().sort(function(a,b){return apptSort(a)-apptSort(b);});
    area.innerHTML=(sorted.length
      ?'<div class="slabel">Timeline ตามเวลา</div>'+sorted.map(function(j){return'<div class="tlrow"><div class="tltime">'+esc(apptStr(j))+'</div><div>'+jiHTML(j,bkt,"ops")+'</div></div>';}).join("")
      :'<div class="enote">ไม่มีรายการ</div>');
  }else{area.innerHTML=jobListHTML(jobs,bkt,page==="ops"?"ops":"admin");}
}

function preloadPage(){
  if(page==="admin")return Promise.all([loadJobs("unpaid"),loadJobs("open")]).then(renderAdminCard);
  if(page==="ops")  return Promise.all([loadJobs("today"),loadJobs("tomorrow"),loadJobs("open")]).then(renderOpsCard);
  if(page==="sales"){renderSalesCard();return Promise.resolve();}
  if(page==="content"){renderContentCard();return Promise.resolve();}
  if(page==="dev"){renderDevCard();return Promise.resolve();}
  if(page==="home"){
    var key="cwf_briefed_"+new Date().toDateString();
    if(!sessionStorage.getItem(key)){
      sessionStorage.setItem(key,"1");
      return new Promise(function(res){
        setTimeout(function(){ask("สรุปสถานการณ์วันนี้ให้หน่อย มีงานกี่งาน มีอะไรต้องตามก่อนหรือระวัง");res();},400);
      });
    }
  }
  return Promise.resolve();
}

function bind(){
  var form=$("#form");
  if(form)form.addEventListener("submit",function(e){
    e.preventDefault();
    var ta=$("#q"),qv=ta?ta.value.trim():"";
    if(ta){ta.value="";grow(ta);}
    if(qv)ask(qv);
  });
  var ta=$("#q");
  if(ta){
    ta.addEventListener("input",function(){grow(ta);var btn=$("#send");if(btn)btn.disabled=!ta.value.trim();});
    ta.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();var f=$("#form");if(f)f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));}});
  }
  document.addEventListener("click",function(e){
    var pill=e.target.closest("[data-pill]");if(pill){var list=PILLS[page]||PILLS.home;var item=list[Number(pill.dataset.pill)];if(item)ask(item.q);return;}
    var cp=e.target.closest("[data-copy]");if(cp){copyText(cp.dataset.copy);return;}
    var po=e.target.closest("[data-polish]");if(po){ask("ช่วยเกลาข้อความนี้ให้พร้อมส่งลูกค้า กระชับ สุภาพ ไม่เพิ่มข้อมูลใหม่:\n"+po.dataset.polish);return;}
    var ja=e.target.closest("[data-jact]");if(ja){try{handleJobAct(ja.dataset.jact,JSON.parse(ja.dataset.j||"{}"));}catch(_){toast("อ่านข้อมูลงานไม่ได้");}return;}
    var bk=e.target.closest("[data-bkt]");if(bk){switchBkt(bk.dataset.bkt);return;}
    var act=e.target.closest("[data-act]");
    if(act&&act.dataset.act==="ph-search"){var ph=$("#phoneInput"),val=ph?ph.value:"";if(val)loadJobs("phone",val).then(function(){S.activeBucket="phone";refreshJobArea("phone");});else toast("ใส่เบอร์ก่อนนะ");}
  });
  document.addEventListener("submit",function(e){
    if(e.target.id==="salesForm"){e.preventDefault();var m=buildSalesMsg(e.target);appendAI("ข้อความขาย · ตรวจก่อนส่งเอง",m);}
    if(e.target.id==="contentForm"){e.preventDefault();var m2=buildContentMsg(e.target);appendAI("คอนเทนต์ · ปรับก่อนใช้",m2);}
    if(e.target.id==="devForm"){e.preventDefault();var m3=buildCodexPrompt(e.target);appendAI("Codex Prompt · ตรวจก่อนส่ง",m3);}
  });
}

function init(){
  try{renderPills();}catch(_){}
  bind();
  Promise.all([loadSummary(),loadConfig()])
    .then(function(){return preloadPage();})
    .catch(function(e){if(window.console)console.error("[cwf]",e);});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
