const pageNames=['home','apps','deploy','backups','settings'];

function openPage(name){
  pageNames.forEach(page=>document.getElementById(`page-${page}`).classList.toggle('active',page===name));
  document.querySelectorAll('.bottomnav button').forEach(button=>button.classList.toggle('active',button.dataset.page===name));
  window.scrollTo({top:0,behavior:'smooth'});
}

function toast(message){
  const element=document.getElementById('toast');
  element.textContent=message;
  element.classList.add('show');
  clearTimeout(window.findfixToast);
  window.findfixToast=setTimeout(()=>element.classList.remove('show'),2200);
}

function refreshStats(){
  const value=Math.floor(13+Math.random()*18);
  document.getElementById('cpu').textContent=`${value}%`;
  document.getElementById('cpuBar').style.width=`${value}%`;
  toast('อัปเดตสถานะเซิร์ฟเวอร์แล้ว');
}

function addActivity(title,detail){
  const time=new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  const row=document.createElement('div');
  row.innerHTML=`<b>✓</b><p>${title}<small>${detail}</small></p><time>${time}</time>`;
  document.getElementById('activity').prepend(row);
}

function restart(service){
  toast(`กำลัง Restart ${service}`);
  setTimeout(()=>{
    toast(`${service} กลับมาออนไลน์แล้ว`);
    addActivity(`Restart ${service} สำเร็จ`,'หยุดให้บริการ 2 วินาที');
  },1200);
}

function runBackup(){
  toast('เริ่มสำรองข้อมูลแล้ว');
  setTimeout(()=>{
    const now=new Date();
    const card=document.createElement('article');
    card.innerHTML=`<div><b>postgres_manual_${now.getTime()}.sql.gz</b><small>686 MB · สำเร็จ · ${now.toLocaleString('th-TH')}</small></div><button onclick="toast('เริ่มดาวน์โหลด')">↓</button>`;
    document.getElementById('backupList').prepend(card);
    addActivity('สำรองข้อมูลด้วยตนเองสำเร็จ','Database + Configuration');
    toast('สำรองข้อมูลสำเร็จ');
  },1400);
}

function quickDeploy(){
  openPage('deploy');
  setTimeout(deploy,250);
}

function openDeploy(name){
  document.getElementById('project').value=name.includes('AI')?'AI Office':'CWF Services System';
  openPage('deploy');
}

function logs(name){
  openPage('deploy');
  document.getElementById('terminal').textContent=`[${new Date().toISOString()}] ${name}\n✓ service healthy\n✓ database connected\n✓ no critical errors\n`;
}

function clearLog(){
  document.getElementById('terminal').textContent='พร้อมรับคำสั่งใหม่...';
}

function deploy(){
  const name=document.getElementById('project').value;
  const modal=document.getElementById('modal');
  const progress=document.getElementById('progress');
  const log=document.getElementById('modalLog');
  const close=document.getElementById('closeBtn');
  document.getElementById('modalTitle').textContent=`กำลัง Deploy ${name}`;
  close.classList.add('hide');
  progress.style.width='0%';
  log.textContent='เริ่มต้น...';
  modal.classList.add('open');

  const steps=[
    [18,'[1/5] เชื่อมต่อ GitHub... ✓'],
    [38,'\n[2/5] ดึงโค้ด branch main... ✓'],
    [61,'\n[3/5] สร้าง Docker image... ✓'],
    [82,'\n[4/5] เปิด Container ชุดใหม่... ✓'],
    [100,'\n[5/5] Health Check ผ่าน ✓\n\nDeploy สำเร็จ ไม่มี Downtime']
  ];

  steps.forEach((step,index)=>{
    setTimeout(()=>{
      progress.style.width=`${step[0]}%`;
      log.textContent+=step[1];
      if(index===steps.length-1){
        close.classList.remove('hide');
        document.getElementById('terminal').textContent=log.textContent;
        addActivity(`Deploy ${name} สำเร็จ`,'Health Check ผ่าน · Auto rollback พร้อม');
      }
    },650*(index+1));
  });
}

function closeModal(){
  document.getElementById('modal').classList.remove('open');
}

function toggleSwitch(button){
  button.classList.toggle('on');
  toast(button.classList.contains('on')?'เปิดการตั้งค่าแล้ว':'ปิดการตั้งค่าแล้ว');
}

setInterval(()=>{
  const value=Math.floor(15+Math.random()*10);
  const cpu=document.getElementById('cpu');
  if(cpu){
    cpu.textContent=`${value}%`;
    document.getElementById('cpuBar').style.width=`${value}%`;
  }
},7000);
