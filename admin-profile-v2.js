/* Admin Profile v2 (Production) */
(async function(){
  const $ = (id)=>document.getElementById(id);
  let me = null;
  let pickedFile = null;

  function setAvatar(url){
    const img = $('avatar');
    if (url) img.src = url;
    else img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
        <rect width="100%" height="100%" rx="32" fill="#e2e8f0"/>
        <circle cx="120" cy="95" r="42" fill="#94a3b8"/>
        <rect x="55" y="145" width="130" height="70" rx="35" fill="#94a3b8"/>
      </svg>`
    );
  }

  async function load(){
    const data = await apiFetch('/admin/profile_v2/me');
    me = data.me;
    $('usernameBox').textContent = me.username || '-';
    $('roleBox').textContent = (me.role === 'super_admin') ? 'Super Admin' : 'Admin';
    $('fullName').value = me.full_name || '';
    setAvatar(me.photo_url || '');
    $('statusBox').textContent = 'พร้อมใช้งาน';
  }

  async function saveName(){
    const full_name = String($('fullName').value || '').trim();
    const r = await apiFetch('/admin/profile_v2/me', {
      method:'PUT',
      body: JSON.stringify({ full_name })
    });
    me = r.me;
    showToast('บันทึกชื่อแล้ว', 'success');
  }

  async function uploadPhoto(){
    if (!pickedFile) return showToast('ยังไม่ได้เลือกรูป', 'error');
    const fd = new FormData();
    fd.append('photo', pickedFile);
    const token = getToken();
    const headers = Object.assign(getAdminRoleHeader(), token ? { Authorization:`Bearer ${token}` } : {});
    const res = await fetch('/admin/profile_v2/me/photo', { method:'POST', headers, body: fd });
    const data = await res.json().catch(()=>null);
    if (!res.ok) return showToast((data && data.error) ? data.error : 'อัปโหลดไม่สำเร็จ', 'error');
    me = data.me;
    setAvatar(me.photo_url || '');
    showToast('อัปโหลดรูปแล้ว', 'success');
  }

  $('btnPick').addEventListener('click', ()=> $('photo').click());
  $('photo').addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    pickedFile = f || null;
    if (pickedFile){
      try{
        const u = URL.createObjectURL(pickedFile);
        setAvatar(u);
      }catch(_){}
      $('statusBox').textContent = `เลือกรูปแล้ว: ${pickedFile.name}`;
    }
  });
  $('btnUpload').addEventListener('click', ()=> uploadPhoto().catch(e=>showToast(e.message||'อัปโหลดไม่สำเร็จ','error')));
  $('btnSaveName').addEventListener('click', ()=> saveName().catch(e=>showToast(e.message||'บันทึกไม่สำเร็จ','error')));

  load().catch(e=>showToast(e.message||'โหลดไม่สำเร็จ','error'));
})();