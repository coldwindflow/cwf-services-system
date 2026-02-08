/* Admin v2 - Job Detail
 * Requirements:
 * - Show full job info + items + pricing summary
 * - Show uploaded photos (downloadable)
 * - Show updates timeline (job_updates_v2)
 * - Return for fix (within warranty only, reason required)
 * - Extend warranty (audit via updates)
 * - Clone job (new job_id, copy customer/address/items, allow change job_type and drop items)
 * 
 * Note: Uses /admin/job_v2/:id and new endpoints:
 *  - /admin/jobs/:id/return_for_fix_v2
 *  - /admin/jobs/:id/extend_warranty_v2
 *  - /admin/jobs/:id/clone_v2
 */

function safe(t){ return (t||'').toString(); }
function fmtDT(iso){
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toLocalDatetimeInput(iso){
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusPill(status){
  const s = String(status||'').trim();
  let st = 'background:#0f172a;color:#fff;border-color:transparent';
  if (s.includes('รอ')) st = 'background:#fbbf24;color:#000;border-color:transparent'; // yellow => black
  else if (s.includes('กำลัง') || s.includes('เริ่ม')) st = 'background:#2563eb;color:#fff;border-color:transparent'; // blue => white
  else if (s.includes('เสร็จ')) st = 'background:#16a34a;color:#fff;border-color:transparent';
  else if (s.includes('ยกเลิก')) st = 'background:#ef4444;color:#fff;border-color:transparent';
  else if (s.includes('แก้ไข') || s.includes('ตีกลับ')) st = 'background:#a855f7;color:#fff;border-color:transparent';
  return `<span class="pill" style="${st}">${escapeHtml(s)||'-'}</span>`;
}

function escapeHtml(str){
  return String(str||'')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function actorName(){
  return localStorage.getItem('username') || localStorage.getItem('admin_username') || 'admin';
}

function inWarranty(job){
  if (job?.is_in_warranty != null) return !!job.is_in_warranty;
  if (!job?.warranty_end_at) return false;
  return new Date(job.warranty_end_at).getTime() >= Date.now();
}

function warrantyLabel(job){
  const end = job?.warranty_end_at ? fmtDT(job.warranty_end_at) : null;
  const kind = String(job?.warranty_kind||'').trim();
  if (!end) return `<span class="pill" style="background:#0f172a;color:#fff;border-color:transparent">ยังไม่ระบุประกัน</span>`;
  const ok = inWarranty(job);
  const base = ok ? 'background:#16a34a;color:#fff;border-color:transparent' : 'background:#ef4444;color:#fff;border-color:transparent';
  const title = ok ? 'อยู่ในประกัน' : 'หมดประกัน';
  const extra = kind === 'repair' && job?.warranty_months ? ` (${job.warranty_months} เดือน)` : '';
  return `<span class="pill" style="${base}">${title}</span> <span class="muted2" style="font-size:12px">หมด: ${end}${extra}</span>`;
}

async function loadJob(){
  const qs = new URLSearchParams(location.search);
  const raw = qs.get('job_id') || '';
  const jobId = raw.trim();
  if (!jobId) {
    el('jobCard').innerHTML = '❌ ไม่พบ job_id';
    return;
  }

  const r = await apiFetch(`/admin/job_v2/${encodeURIComponent(jobId)}`);
  const job = r.job || {};
  const items = Array.isArray(r.items) ? r.items : [];
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const updates = Array.isArray(r.updates) ? r.updates : [];
  const team = Array.isArray(r.team_members) ? r.team_members : [];

  const itemRows = items.length
    ? items.map(it=>{
        const qty = Number(it.qty||0);
        const unit = Number(it.unit_price||0);
        const line = Number(it.line_total|| (qty*unit));
        return `<tr>
          <td style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(safe(it.item_name))}">${escapeHtml(safe(it.item_name))}</td>
          <td style="width:70px;text-align:right">${qty}</td>
          <td style="width:90px;text-align:right">${unit.toLocaleString()}</td>
          <td style="width:110px;text-align:right"><b>${line.toLocaleString()}</b></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4" class="muted2">ไม่มีรายการ</td></tr>`;

  const photoRows = photos.length
    ? photos.map(p=>{
        const url = safe(p.public_url);
        const phase = safe(p.phase||'-');
        const created = fmtDT(p.created_at);
        return `<div class="item">
          <b title="${escapeHtml(phase)}">📷 ${escapeHtml(phase)}</b>
          <div class="mini" title="${escapeHtml(url)}">${escapeHtml(created)}</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${url ? `<a class="secondary btn-small" href="${escapeHtml(url)}" target="_blank" rel="noopener">เปิด/โหลดรูป</a>` : `<span class="pill">ยังไม่มีลิงก์รูป</span>`}
          </div>
        </div>`;
      }).join('')
    : `<div class="muted2">ยังไม่มีรูปที่ช่างอัปโหลด</div>`;

  const updRows = updates.length
    ? `<div class="list">${updates.map(u=>{
        const when = fmtDT(u.created_at);
        const act = safe(u.action);
        const msg = safe(u.message);
        const by = safe(u.actor_username || u.actor_role || '-');
        return `<div class="item">
          <b title="${escapeHtml(act)}">${escapeHtml(act || 'update')}</b>
          <div class="mini">${escapeHtml(when)} • ${escapeHtml(by)}</div>
          ${msg ? `<div class="muted2" style="margin-top:6px;white-space:pre-wrap">${escapeHtml(msg)}</div>` : ''}
        </div>`;
      }).join('')}</div>`
    : `<div class="muted2">ยังไม่มีประวัติอัปเดต</div>`;

  const teamText = team.length
    ? team.map(m=>`${safe(m.full_name||m.username)}${m.phone ? ` (${safe(m.phone)})` : ''}`).join(', ')
    : '-';

  const wOk = inWarranty(job);

  el('jobCard').innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
      <div style="min-width:220px">
        <b style="font-size:16px">เลขงาน: ${escapeHtml(safe(job.booking_code||job.job_id))}</b>
        <div class="muted2" style="margin-top:4px">#${escapeHtml(safe(job.job_id))}</div>
      </div>
      <div>${statusPill(job.job_status)}</div>
    </div>

    <div style="margin-top:10px" class="row">
      <div class="pill" style="background:#fff;border-color:rgba(15,23,42,0.12)"><b>นัด:</b> ${escapeHtml(fmtDT(job.appointment_datetime))}</div>
      <div class="pill" style="background:#fff;border-color:rgba(15,23,42,0.12)"><b>ประเภท:</b> ${escapeHtml(safe(job.job_type||'-'))}</div>
    </div>

    <div style="margin-top:10px">
      <div><b>ลูกค้า:</b> ${escapeHtml(safe(job.customer_name||'-'))}</div>
      <div><b>โทร:</b> ${escapeHtml(safe(job.customer_phone||'-'))}</div>
      <div style="margin-top:6px"><b>ที่อยู่:</b> <span title="${escapeHtml(safe(job.address_text||''))}">${escapeHtml(safe(job.address_text||'-'))}</span></div>
      <div style="margin-top:6px"><b>โซน:</b> ${escapeHtml(safe(job.job_zone||'-'))}</div>
      <div style="margin-top:6px"><b>ช่างหลัก:</b> ${escapeHtml(safe(job.technician_username||'-'))}</div>
      <div style="margin-top:6px"><b>ทีมช่าง:</b> <span title="${escapeHtml(teamText)}">${escapeHtml(teamText)}</span></div>
    </div>

    <hr style="margin:12px 0;" />

    <details class="cwf-details" style="margin-top:0" open>
      <summary>✏️ แก้ไขใบงาน (Admin)</summary>
      <div class="cwf-details-body">
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:220px">
            <label>ชื่อลูกค้า</label>
            <input id="edit_customer_name" value="${escapeHtml(safe(job.customer_name||''))}" />
          </div>
          <div style="width:220px">
            <label>เบอร์โทร</label>
            <input id="edit_customer_phone" value="${escapeHtml(safe(job.customer_phone||''))}" />
          </div>
          <div style="width:220px">
            <label>ประเภทงาน</label>
            <select id="edit_job_type">
              <option value="">-</option>
              <option value="ล้าง" ${String(job.job_type||'')==='ล้าง'?'selected':''}>ล้าง</option>
              <option value="ซ่อม" ${String(job.job_type||'')==='ซ่อม'?'selected':''}>ซ่อม</option>
              <option value="ติดตั้ง" ${String(job.job_type||'')==='ติดตั้ง'?'selected':''}>ติดตั้ง</option>
            </select>
          </div>
          <div style="width:240px">
            <label>วัน/เวลานัด</label>
            <input id="edit_appt" type="datetime-local" />
          </div>
        </div>

        <div style="margin-top:10px">
          <label>ที่อยู่</label>
          <textarea id="edit_address" rows="2" placeholder="ที่อยู่ลูกค้า">${escapeHtml(safe(job.address_text||''))}</textarea>
        </div>

        <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="flex:1;min-width:220px">
            <label>โซน</label>
            <input id="edit_zone" value="${escapeHtml(safe(job.job_zone||''))}" />
          </div>
          <div style="flex:1;min-width:220px">
            <label>Maps URL</label>
            <input id="edit_maps_url" value="${escapeHtml(safe(job.maps_url||''))}" />
          </div>
          <div style="width:160px">
            <label>Lat</label>
            <input id="edit_lat" value="${escapeHtml(safe(job.latitude||''))}" />
          </div>
          <div style="width:160px">
            <label>Lng</label>
            <input id="edit_lng" value="${escapeHtml(safe(job.longitude||''))}" />
          </div>
        </div>

        <div style="margin-top:12px">
          <b>🧾 แก้ไข/เพิ่มรายการบริการ</b>
          <div class="muted2 mini" style="margin-top:6px">เพิ่ม/ลบ/แก้ไขได้ (เหมือนหน้าเพิ่มงานแบบย่อ)</div>
          <div class="table-wrap" style="margin-top:10px;overflow:auto">
            <table>
              <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th><th></th></tr></thead>
              <tbody id="items_editor"></tbody>
            </table>
          </div>
          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap">
            <button id="btnAddItem" class="secondary" type="button" style="width:auto">➕ เพิ่มรายการ</button>
            <button id="btnSaveEdit" type="button" style="width:auto">💾 บันทึกใบงาน</button>
          </div>
          <div id="edit_msg" class="muted2" style="margin-top:8px"></div>
        </div>
      </div>
    </details>

    <hr style="margin:12px 0;" />

    <div>
      <b>🛡️ ประกัน / ตีกลับงานแก้ไข</b>
      <div style="margin-top:8px">${warrantyLabel(job)}</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px">
          <label>เหตุผล/ปัญหา (จำเป็นเมื่อ “ตีกลับ”)</label>
          <textarea id="return_reason" rows="2" placeholder="ระบุปัญหาที่ต้องให้ช่างแก้ไข"></textarea>
        </div>
        <button id="btnReturnFix" class="danger" type="button" style="width:auto" ${wOk ? '' : 'disabled'} title="${wOk ? '' : 'หมดประกันแล้ว'}">↩️ ตีกลับเป็นงานแก้ไข</button>
      </div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="width:220px">
          <label>Extend ประกัน (วัน)</label>
          <input id="extend_days" type="number" min="1" step="1" placeholder="เช่น 7" />
        </div>
        <button id="btnExtend" type="button" style="width:auto">➕ Extend</button>
      </div>
    </div>

    <hr style="margin:12px 0;" />

    <div>
      <b>🧾 รายการบริการ</b>
      <div class="table-wrap" style="margin-top:10px;overflow:auto">
        <table>
          <thead><tr><th>รายการ</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      </div>
    </div>

    <div style="margin-top:12px">
      <b>♻️ สร้างงานใหม่จากใบงานเดิม (Clone)</b>
      <div class="muted2 mini" style="margin-top:6px">สร้าง job ใหม่คนละ jobId และไม่กระทบงานเดิม</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="width:220px">
          <label>วัน/เวลาใหม่</label>
          <input id="clone_appt" type="datetime-local" />
        </div>
        <div style="flex:1;min-width:220px">
          <label>ช่างใหม่ (username) (เว้นว่าง = ไม่กำหนด)</label>
          <input id="clone_tech" placeholder="เช่น A2MKUNG" />
        </div>
        <div style="width:220px">
          <label>เปลี่ยนประเภทงาน (ถ้าต้องการ)</label>
          <input id="clone_type" placeholder="เช่น ล้าง / ซ่อม / ติดตั้ง" />
        </div>
        <button id="btnClone" class="secondary" type="button" style="width:auto">สร้างงานใหม่</button>
      </div>
      <details class="cwf-details" style="margin-top:10px">
        <summary>เลือก “ลดรายการล้าง” (ตัดบางรายการออก)</summary>
        <div class="cwf-details-body" id="clone_items"></div>
      </details>
    </div>

    <hr style="margin:12px 0;" />

    <details class="cwf-details" style="margin-top:0" open>
      <summary>📷 รูปถ่าย (ดาวน์โหลดได้)</summary>
      <div class="cwf-details-body">
        <div class="list">${photoRows}</div>
      </div>
    </details>

    <details class="cwf-details" style="margin-top:10px" open>
      <summary>🕒 Updates / Timeline</summary>
      <div class="cwf-details-body">${updRows}</div>
    </details>
  `;

  // clone item selector
  const cloneItems = el('clone_items');
  if (cloneItems) {
    if (!items.length) cloneItems.innerHTML = `<div class="muted2">ไม่มีรายการให้เลือก</div>`;
    else {
      cloneItems.innerHTML = items.map(it=>{
        const id = Number(it.item_id);
        const nm = safe(it.item_name);
        return `<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;">
          <input type="checkbox" class="clone-item" value="${id}" checked>
          <div style="flex:1;min-width:0">
            <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(nm)}">${escapeHtml(nm)}</b>
            <div class="muted2 mini">qty ${escapeHtml(String(it.qty||''))}</div>
          </div>
        </label>`;
      }).join('');
    }
  }

  // wire actions
  // --- Admin Edit (Job + Items) ---
  try {
    const apptInput = el('edit_appt');
    if (apptInput) apptInput.value = toLocalDatetimeInput(job.appointment_datetime);

    let editorItems = (Array.isArray(items) ? items : []).map(it=>({
      item_id: Number(it.item_id||0) || null,
      item_name: safe(it.item_name||''),
      qty: Number(it.qty||1) || 1,
      unit_price: Number(it.unit_price||0) || 0,
    }));

    const tbody = el('items_editor');
    const renderEditor = () => {
      if (!tbody) return;
      if (!editorItems.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="muted2">ยังไม่มีรายการ (กด “เพิ่มรายการ”)</td></tr>`;
        return;
      }
      tbody.innerHTML = editorItems.map((it, idx)=>{
        const line = (Number(it.qty)||0) * (Number(it.unit_price)||0);
        return `<tr data-idx="${idx}">
          <td style="min-width:220px">
            <input class="it_name" value="${escapeHtml(it.item_name)}" placeholder="ชื่อรายการ" />
          </td>
          <td style="width:90px;text-align:right"><input class="it_qty" type="number" min="0" step="1" value="${escapeHtml(String(it.qty))}" /></td>
          <td style="width:130px;text-align:right"><input class="it_unit" type="number" min="0" step="1" value="${escapeHtml(String(it.unit_price))}" /></td>
          <td style="width:110px;text-align:right"><b class="it_line">${Number.isFinite(line) ? line.toLocaleString() : '0'}</b></td>
          <td style="width:70px;text-align:right"><button type="button" class="danger btn-small it_del" style="width:auto">ลบ</button></td>
        </tr>`;
      }).join('');

      // bind per-row
      Array.from(tbody.querySelectorAll('tr')).forEach(tr=>{
        const idx = Number(tr.getAttribute('data-idx'));
        const name = tr.querySelector('.it_name');
        const qty = tr.querySelector('.it_qty');
        const unit = tr.querySelector('.it_unit');
        const lineEl = tr.querySelector('.it_line');
        const del = tr.querySelector('.it_del');

        const recalc = () => {
          const qv = Number(qty?.value||0);
          const uv = Number(unit?.value||0);
          const ln = (Number.isFinite(qv)?qv:0) * (Number.isFinite(uv)?uv:0);
          if (lineEl) lineEl.textContent = (Number.isFinite(ln) ? ln : 0).toLocaleString();
        };

        if (name) name.oninput = ()=>{ editorItems[idx].item_name = name.value; };
        if (qty) qty.oninput = ()=>{ editorItems[idx].qty = Number(qty.value||0); recalc(); };
        if (unit) unit.oninput = ()=>{ editorItems[idx].unit_price = Number(unit.value||0); recalc(); };
        if (del) del.onclick = ()=>{ editorItems.splice(idx,1); renderEditor(); };
      });
    };

    renderEditor();

    const btnAddItem = el('btnAddItem');
    if (btnAddItem) {
      btnAddItem.onclick = ()=>{
        editorItems.push({ item_id: null, item_name: '', qty: 1, unit_price: 0 });
        renderEditor();
      };
    }

    const btnSave = el('btnSaveEdit');
    const msg = el('edit_msg');
    if (btnSave) {
      btnSave.onclick = async ()=>{
        try{
          btnSave.disabled = true;
          if (msg) msg.textContent = 'กำลังบันทึก...';

          const apptRaw = String(el('edit_appt')?.value||'').trim();
          const payload = {
            customer_name: String(el('edit_customer_name')?.value||'').trim(),
            customer_phone: String(el('edit_customer_phone')?.value||'').trim(),
            job_type: String(el('edit_job_type')?.value||'').trim(),
            address_text: String(el('edit_address')?.value||'').trim(),
            job_zone: String(el('edit_zone')?.value||'').trim(),
            maps_url: String(el('edit_maps_url')?.value||'').trim(),
            latitude: String(el('edit_lat')?.value||'').trim(),
            longitude: String(el('edit_lng')?.value||'').trim(),
            appointment_datetime: apptRaw ? new Date(apptRaw).toISOString() : null,
          };
          await apiFetch(`/jobs/${encodeURIComponent(String(job.job_id))}/admin-edit`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });

          const cleanItems = editorItems
            .map(it=>({
              item_id: it.item_id ? Number(it.item_id) : null,
              item_name: String(it.item_name||'').trim(),
              qty: Number(it.qty||0),
              unit_price: Number(it.unit_price||0),
            }))
            .filter(it=>it.item_name);

          await apiFetch(`/jobs/${encodeURIComponent(String(job.job_id))}/items-admin`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ items: cleanItems })
          });

          showToast('บันทึกใบงานแล้ว', 'success');
          if (msg) msg.textContent = '✅ บันทึกแล้ว';
          await loadJob();
        }catch(e){
          console.error(e);
          alert(e?.message || 'บันทึกไม่สำเร็จ');
          if (msg) msg.textContent = `❌ ${e?.message||'บันทึกไม่สำเร็จ'}`;
        }finally{
          btnSave.disabled = false;
        }
      };
    }
  } catch (e) {
    console.warn('admin edit init failed', e);
  }

  const btnReturn = el('btnReturnFix');
  if (btnReturn) {
    btnReturn.onclick = async ()=>{
      const reason = (el('return_reason')?.value||'').trim();
      if (!reason) return alert('ต้องระบุปัญหา/เหตุผลก่อนตีกลับ');
      if (!confirm('ตีกลับเป็นงานแก้ไข?')) return;
      await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/return_for_fix_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, actor_username: actorName() })
      });
      showToast('ตีกลับงานแก้ไขแล้ว', 'success');
      await loadJob();
    };
  }

  const btnExtend = el('btnExtend');
  if (btnExtend) {
    btnExtend.onclick = async ()=>{
      const days = Number(el('extend_days')?.value||0);
      if (!Number.isFinite(days) || days <= 0) return alert('กรอกจำนวนวันให้ถูกต้อง');
      if (!confirm(`Extend ประกัน +${days} วัน?`)) return;
      await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/extend_warranty_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, actor_username: actorName() })
      });
      showToast('Extend ประกันแล้ว', 'success');
      await loadJob();
    };
  }

  const btnClone = el('btnClone');
  if (btnClone) {
    btnClone.onclick = async ()=>{
      const appt = String(el('clone_appt')?.value||'').trim();
      if (!appt) return alert('ต้องเลือกวัน/เวลาใหม่');
      const tech = String(el('clone_tech')?.value||'').trim();
      const type = String(el('clone_type')?.value||'').trim();
      const keep = Array.from(document.querySelectorAll('.clone-item')).filter(c=>c.checked).map(c=>Number(c.value)).filter(n=>Number.isFinite(n));
      const payload = {
        actor_username: actorName(),
        appointment_datetime: new Date(appt).toISOString(),
        technician_username: tech || null,
        job_type: type || null,
        keep_item_ids: keep
      };
      const rr = await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/clone_v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast(`สร้างงานใหม่แล้ว #${rr.new_job_id}`, 'success');
      // jump to new job
      location.href = `/admin-job-view-v2.html?job_id=${encodeURIComponent(String(rr.new_job_id))}`;
    };
  }

  // summary copy (existing feature)
  try {
    const text = buildSummaryText(job, items, r.promotion);
    if (text) {
      el('summary_card').style.display = 'block';
      el('summary_text').value = text;
    }
  } catch (e) {}
}

function buildSummaryText(job, items, promotion){
  // Minimal, safe summary (no regression to existing flows)
  const appt = fmtDT(job.appointment_datetime);
  const addr = safe(job.address_text||'');
  const lines = [];
  lines.push(`ยืนยันนัดหมายบริการแอร์`);
  lines.push(`Coldwindflow Air Services`);
  lines.push('');
  lines.push(`🔎 เลขงาน: ${safe(job.booking_code||job.job_id)}`);
  lines.push(`📍 ชื่อลูกค้า: ${safe(job.customer_name||'-')}`);
  lines.push(`📞 เบอร์: ${safe(job.customer_phone||'-')}`);
  lines.push(`📅 วันที่นัด: ${appt}`);
  lines.push(`🧾 ประเภทงาน: ${safe(job.job_type||'-')}`);
  if (addr) lines.push(`🏠 ที่อยู่: ${addr}`);
  if (items?.length){
    lines.push('');
    lines.push('รายการบริการ:');
    for (const it of items){
      lines.push(`- ${safe(it.item_name)} x${safe(it.qty)}`);
    }
  }
  if (promotion?.promo_name){
    lines.push('');
    lines.push(`🎁 โปรโมชั่น: ${safe(promotion.promo_name)}`);
  }
  return lines.join('\n');
}

function init(){
  const btnLogout = el('btnLogout');
  if (btnLogout) btnLogout.onclick = ()=>{ location.href='/logout'; };
  const btnCopy = el('btnCopySummary');
  if (btnCopy) {
    btnCopy.onclick = async ()=>{
      const t = el('summary_text')?.value || '';
      try {
        await navigator.clipboard.writeText(t);
        showToast('คัดลอกแล้ว', 'success');
      } catch (e) {
        alert('คัดลอกไม่สำเร็จ');
      }
    };
  }
  loadJob().catch(e=>{
    console.error(e);
    el('jobCard').innerHTML = `❌ ${escapeHtml(e.message||'โหลดใบงานไม่สำเร็จ')}`;
  });
}

init();
