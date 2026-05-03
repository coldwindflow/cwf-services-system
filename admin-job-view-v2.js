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
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d);
    const map = Object.fromEntries(parts.map((p)=>[p.type, p.value]));
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
  } catch {
    return '';
  }
}

function localDatetimeToBangkokISO(localValue){
  // localValue from <input type="datetime-local"> (no timezone)
  const s = String(localValue||'').trim();
  if (!s) return '';
  // ensure seconds
  const hasSeconds = /\d{2}:\d{2}:\d{2}$/.test(s);
  const base = hasSeconds ? s : `${s}:00`;
  // treat as Bangkok (+07:00) to avoid UTC shift
  return `${base}+07:00`;
}

function buildAdminEditItemsSnapshot(items){
  return (Array.isArray(items) ? items : [])
    .map(it=>({
      item_id: it.item_id ? Number(it.item_id) : null,
      item_name: String(it.item_name||'').trim(),
      qty: Number(it.qty||0),
      unit_price: Number(it.unit_price||0),
      assigned_technician_username: String(it.assigned_technician_username||'').trim() || null,
    }))
    .filter(it=>it.item_name);
}

function buildAdminEditTeamSnapshot(primaryUsername, members){
  const primary = String(primaryUsername||'').trim() || null;
  let list = (Array.isArray(members) ? members : []).map(x=>String(x||'').trim()).filter(Boolean);
  if (primary && !list.includes(primary)) list.unshift(primary);
  list = Array.from(new Set(list));
  return {
    primary_username: primary && list.includes(primary) ? primary : (list[0] || null),
    members: list,
  };
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

// --- Team editor (minimal UI; backward compatible) ---
const teamEdit = {
  techs: [],
  techMap: {},
  loaded: false,
};

async function loadAllTechsOnce(){
  if (teamEdit.loaded) return;
  teamEdit.loaded = true;
  try {
    const data = await apiFetch('/admin/technicians');
    const rows = Array.isArray(data) ? data : (data.rows || data.technicians || []);
    teamEdit.techs = (rows || []).map(r=>({
      username: String(r.username||'').trim(),
      display: (String(r.full_name||'').trim() || String(r.username||'').trim() || '').trim(),
    })).filter(t=>t.username);
    teamEdit.techMap = {};
    for (const t of teamEdit.techs) teamEdit.techMap[t.username] = t;
  } catch (e) {
    console.warn('[admin-job-view] load techs failed', e);
    teamEdit.techs = [];
    teamEdit.techMap = {};
  }
}

function techDisplayName(u){
  const key = String(u||'').trim();
  if (!key) return '';
  return (teamEdit.techMap[key]?.display) || key;
}

function getPrimaryTechFromUI(fallback){
  const v = String(el('edit_primary_tech')?.value || '').trim();
  if (v) return v;
  return String(fallback||'').trim();
}

function renderTeamEditor(primaryUsername, currentTeamUsernames){
  const primary = String(primaryUsername||'').trim();
  const selected = new Set((Array.isArray(currentTeamUsernames)?currentTeamUsernames:[]).map(x=>String(x||'').trim()).filter(Boolean));
  if (primary) selected.add(primary);

  const sel = el('edit_team_members');
  const search = el('edit_team_search');
  const hint = el('edit_team_hint');
  if (!sel) return;

  const q = String(search?.value||'').trim().toLowerCase();

  // preserve selection from UI if already rendered
  const uiSelected = new Set(Array.from(sel.options||[]).filter(o=>o.selected).map(o=>o.value).filter(Boolean));
  if (uiSelected.size) {
    selected.clear();
    for (const u of uiSelected) selected.add(u);
    if (primary) selected.add(primary);
  }

  sel.innerHTML = '';
  const makeOpt = (u, isPrimary=false) => {
    const o = document.createElement('option');
    o.value = u;
    o.textContent = isPrimary ? `⭐ ${techDisplayName(u)} (${u})` : `${techDisplayName(u)} (${u})`;
    o.selected = selected.has(u);
    if (isPrimary) {
      o.disabled = true;
      o.selected = true;
    }
    return o;
  };

  // primary on top
  if (primary) sel.appendChild(makeOpt(primary, true));

  const list = (teamEdit.techs || [])
    .filter(t=>t.username && t.username !== primary)
    .filter(t=>{
      if (!q) return true;
      const hay = `${t.username} ${t.display}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a,b)=>a.username.localeCompare(b.username));

  for (const t of list) sel.appendChild(makeOpt(t.username, false));

  // update hint + hidden json
  const finalMembers = Array.from(new Set([primary, ...Array.from(selected)])).filter(Boolean);
  if (hint) {
    const extras = finalMembers.filter(u=>u && u !== primary);
    hint.innerHTML = extras.length
      ? `หัวหน้างาน: <b>${escapeHtml(techDisplayName(primary))}</b> • ช่างร่วม: <b>${escapeHtml(extras.map(u=>techDisplayName(u)).join(', '))}</b>`
      : `หัวหน้างาน: <b>${escapeHtml(primary ? techDisplayName(primary) : '-')}</b> • ยังไม่ได้เลือกช่างร่วม (ถ้าต้องเพิ่มทีม ให้เลือกในรายการด้านบน)`;
  }
  const hid = el('edit_team_members_json');
  if (hid) hid.value = JSON.stringify(finalMembers);
}

function actorName(){
  return localStorage.getItem('username') || localStorage.getItem('admin_username') || 'admin';
}

function inferMachineCountFromName(name){
  try{
    const s = String(name||'');
    const m = s.match(/(\d+)\s*เครื่อง/);
    const n = m ? Number(m[1]) : 0;
    return (Number.isFinite(n) && n > 1) ? n : 0;
  }catch(e){ return 0; }
}

function normalizeLegacyQtyUnit(it){
  // Backward-compatible: old jobs sometimes stored machine_count incorrectly in unit_price/qty.
  // If we can infer "X เครื่อง" from item_name, reconstruct qty + unit_price from line_total.
  try{
    const mc = inferMachineCountFromName(it?.item_name);
    const qty = Number(it?.qty||0);
    const unit = Number(it?.unit_price||0);
    const line = Number(it?.line_total|| (qty*unit));
    if (mc && (qty <= 1 || qty !== mc) && Number.isFinite(line) && line > 0) {
      // Heuristic trigger: very small unit_price (e.g., 35) or qty=1 while name says many machines.
      if (unit < 100 || qty <= 1) {
        it.qty = mc;
        it.unit_price = Number((line / mc).toFixed(2));
        it.line_total = Number((it.unit_price * mc).toFixed(2));
      }
    }
  }catch(e){/* fail-open */}
  return it;
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
  const items = Array.isArray(r.items) ? r.items.map(x=>normalizeLegacyQtyUnit(Object.assign({}, x))) : [];
  const photos = Array.isArray(r.photos) ? r.photos : [];
  const updates = Array.isArray(r.updates) ? r.updates : [];
  const team = Array.isArray(r.team_members) ? r.team_members : [];
  const promotion = r.promotion || null;

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

  const teamUsernames = team.map(m=>String(m.username||'').trim()).filter(Boolean);
  const teamInitMembers = Array.from(new Set([String(job.technician_username||'').trim(), ...teamUsernames])).filter(Boolean);
  const baseItemsSnapshot = buildAdminEditItemsSnapshot(items);
  const baseTeamSnapshot = buildAdminEditTeamSnapshot(String(job.technician_username||'').trim(), teamInitMembers);

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

    <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap">
      <button id="btnDocQuote" class="secondary" type="button" style="width:auto">🧾 ใบเสนอราคา (เต็ม)</button>
      <button id="btnDocReceipt" class="secondary" type="button" style="width:auto">🧾 บิล/ใบเสร็จ (เต็ม)</button>
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
          <b>👥 ทีมช่าง</b>
          <div class="row" style="margin-top:8px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="width:220px">
              <label>รูปแบบการทำงาน</label>
              <select id="edit_team_mode">
                <option value="single">เดี่ยว (ช่างคนเดียว)</option>
                <option value="team">ทีม (หลายคน)</option>
              </select>
            </div>
          </div>
          <div class="muted2 mini" style="margin-top:6px">เลือกหัวหน้างาน (ช่างหลัก) และเลือกช่างร่วมได้หลายคน • สามารถเปลี่ยนหัวหน้างานและเอาคนเดิมออกจากทีมได้</div>
          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:260px">
              <label>หัวหน้างาน / ช่างหลัก</label>
              <select id="edit_primary_tech" style="width:100%"></select>
            </div>
          </div>
          <div id="edit_team_multi_wrap">
          <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:220px">
              <label>ค้นหาช่าง (ชื่อ/username)</label>
              <input id="edit_team_search" placeholder="พิมพ์เพื่อค้นหา" />
            </div>
            <div style="flex:1;min-width:260px">
              <label>เลือกช่างร่วม (กด Ctrl/Command เพื่อเลือกหลายคน)</label>
              <select id="edit_team_members" multiple size="6" style="width:100%"></select>
            </div>
          </div>
          </div>
          <div id="edit_team_hint" class="muted2" style="margin-top:8px"></div>
          <input id="edit_team_members_json" type="hidden" value="${escapeHtml(JSON.stringify(teamInitMembers))}" />
        </div>

        <div style="margin-top:12px">
          <b>🧾 แก้ไข/เพิ่มรายการบริการ</b>
          <div class="muted2 mini" style="margin-top:6px">เพิ่ม/ลบ/แก้ไขได้ (เหมือนหน้าเพิ่มงานแบบย่อ)</div>
          <div class="table-wrap" style="margin-top:10px;overflow:auto">
            <div class="row" style="gap:10px;flex-wrap:wrap;margin-bottom:8px">
              <select id="edit_split_mode" style="width:220px">
                <option value="mixed">แบ่งตามที่กำหนด (assign + ร่วม)</option>
                <option value="coop_equal">ทำร่วมกันทั้งหมด (หารเท่ากัน)</option>
              </select>
              <button id="btnApplySplitMode" class="secondary" type="button" style="width:auto">ใช้โหมดนี้กับทุกรายการ</button>
              <button id="btnNormalizeItems" class="secondary" type="button" style="width:auto">แปลงจำนวนเครื่องอัตโนมัติ</button>
            </div>
            <table>
              <thead><tr><th>รายการ</th><th style="text-align:right">มอบหมายให้</th><th style="text-align:right">จำนวน</th><th style="text-align:right">ราคา/หน่วย</th><th style="text-align:right">รวม</th><th></th></tr></thead>
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
      <b>🧯 ปิดงานแทนช่าง (Force Close)</b>
      <div class="muted2 mini" style="margin-top:6px">ใช้เมื่อช่างกดปิดงานไม่ได้ ระบบจะปิดงานให้ทันที (ไม่สนเงื่อนไขอื่น ยกเว้น job_id ต้องถูกต้อง)</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px">
          <label>เหตุผล (ไม่บังคับ)</label>
          <textarea id="force_finish_reason" rows="2" placeholder="เช่น ช่างกดปิดงานไม่ได้ / ระบบค้าง / รูปค้าง"></textarea>
        </div>
        <button id="btnForceFinish" class="danger" type="button" style="width:auto"
          ${(['เสร็จแล้ว','ยกเลิก'].includes(safe(job.job_status||'')) ? 'disabled' : '')}
          title="${(['เสร็จแล้ว','ยกเลิก'].includes(safe(job.job_status||'')) ? 'งานปิดแล้ว' : 'ปิดงานแทนช่าง')}">
          ✅ ปิดงานแทนช่าง
        </button>
      </div>
    </div>



    
    <hr style="margin:12px 0;" />

    <div>
      <b>🗑️ ลบงานถาวร (ลบจากฐานข้อมูลจริง)</b>
      <div class="muted2 mini" style="margin-top:6px">ระวัง: ลบแล้วกู้คืนไม่ได้ • ต้องยืนยัน 2 ชั้น</div>
      <div class="row" style="margin-top:10px;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <button id="btn_delete_job" class="danger" type="button" style="width:auto">🗑️ ลบงานนี้</button>
      </div>
    </div>

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
        <button id="btnCreateReworkCase" class="secondary" type="button" style="width:auto">ส่งงานกลับแก้</button>
        <button id="btnCreateDeductionCase" class="secondary" type="button" style="width:auto">เปิดเคสหักเงิน</button>
        <button id="btnViewCaseHistory" class="secondary" type="button" style="width:auto">ดูประวัติเคส</button>
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

  // --- Full docs (Quote / Receipt) ---
  try {
    const btnQ = el('btnDocQuote');
    if (btnQ) {
      btnQ.onclick = () => {
        const url = `${location.origin}/docs/quote/${encodeURIComponent(String(job.job_id))}`;
        window.open(url, '_blank', 'noopener');
      };
    }
    const btnR = el('btnDocReceipt');
    if (btnR) {
      btnR.onclick = () => {
        const url = `${location.origin}/docs/receipt/${encodeURIComponent(String(job.job_id))}`;
        window.open(url, '_blank', 'noopener');
      };
    }
  } catch (e) {
    console.warn('doc buttons init failed', e);
  }

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

    const inferAssigneeFromItemName = (name) => {
      const s = String(name || '').trim();
      if (!s) return null;
      // Legacy pattern: "... (USERNAME)" at end
      const m = s.match(/\(([A-Za-z0-9_\-]{2,64})\)\s*$/);
      if (m && m[1]) return String(m[1]).trim();
      return null;
    };

    // Auto-normalize legacy service rows:
    // - บางงานเก่าถูกเก็บเป็น qty=1 แต่ชื่อมี "... 5 เครื่อง" และ unit_price=ยอดรวม
    // - ทำให้แอดมินเห็น "จำนวน 1 ราคา 2500" (งง) ทั้งที่ควรเป็น qty=5 unit=500
    const parseMachineCountFromName = (name) => {
      const s = String(name || '');
      const m = s.match(/(\d+)\s*เครื่อง/);
      if (!m) return 0;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : 0;
    };
    const normalizeLegacyServiceRow = (row) => {
      try {
        const nm = String(row.item_name || '');
        const mc = parseMachineCountFromName(nm);
        const q = Number(row.qty || 0);
        const u = Number(row.unit_price || 0);
        const total = (Number.isFinite(q) ? q : 0) * (Number.isFinite(u) ? u : 0);
        if (mc >= 2 && q === 1 && total > 0) {
          row.qty = mc;
          row.unit_price = Number((total / mc).toFixed(2));
        }
      } catch(_e) {}
      return row;
    };

    let editorItems = (Array.isArray(items) ? items : []).map(it=>({
      item_id: Number(it.item_id||0) || null,
      item_name: safe(it.item_name||''),
      qty: Number(it.qty||1) || 1,
      unit_price: Number(it.unit_price||0) || 0,
      assigned_technician_username: (String(it.assigned_technician_username||'').trim() || inferAssigneeFromItemName(it.item_name) || null),
    })).map(normalizeLegacyServiceRow);

    const tbody = el('items_editor');

    const getCurrentTeamMembers = () => {
      // Prefer current UI selection (hidden json). Fallback to initial team members.
      const primaryU = getPrimaryTechFromUI(String(job.technician_username||'').trim());
      let members = [];
      try {
        const hid = el('edit_team_members_json');
        if (hid && hid.value) members = JSON.parse(hid.value);
      } catch {}
      if (!Array.isArray(members)) members = [];
      members = members.map(x=>String(x||'').trim()).filter(Boolean);
      if (primaryU && !members.includes(primaryU)) members.unshift(primaryU);
      return Array.from(new Set(members));
    };

    const renderEditor = () => {
      if (!tbody) return;
      if (!editorItems.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="muted2">ยังไม่มีรายการ (กด “เพิ่มรายการ”)</td></tr>`;
        return;
      }
      const teamMembers = getCurrentTeamMembers();
      tbody.innerHTML = editorItems.map((it, idx)=>{
        const line = (Number(it.qty)||0) * (Number(it.unit_price)||0);
        const curAssignee = String(it.assigned_technician_username||'').trim();
        // Ensure the current assignee is selectable even if not in the team list snapshot (legacy jobs).
        const members = teamMembers.slice();
        if (curAssignee && !members.includes(curAssignee)) members.push(curAssignee);
        const assigneeOpts = [''].concat(members).map(u=>{
          const val = String(u||'').trim();
          if (!val) return `<option value="">-</option>`;
          const label = `${techDisplayName(val)} (${val})`;
          const sel = curAssignee && curAssignee === val ? 'selected' : '';
          return `<option value="${escapeHtml(val)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
        return `<tr data-idx="${idx}">
          <td style="min-width:220px">
            <input class="it_name" value="${escapeHtml(it.item_name)}" placeholder="ชื่อรายการ" />
          </td>
          <td style="width:210px">
            <select class="it_assignee" style="width:100%">${assigneeOpts}</select>
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
        const assignee = tr.querySelector('.it_assignee');
        const splitMode = String(el('edit_split_mode')?.value || 'mixed');
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
        if (assignee) {
          if (splitMode === 'coop_equal') { assignee.value = ''; assignee.disabled = true; }
          assignee.onchange = ()=>{
          const v = String(assignee.value||'').trim();
          editorItems[idx].assigned_technician_username = v || null;
        };
        }
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

    // --- Team editor init ---
    try {
      await loadAllTechsOnce();
      const primaryU = String(job.technician_username||'').trim();
      const curTeamUsers = teamUsernames; // from loadJob scope

      // primary dropdown (allow change lead)
      const primarySel = el('edit_primary_tech');
      if (primarySel) {
        const all = (teamEdit.techs || []).slice().sort((a,b)=>a.username.localeCompare(b.username));
        primarySel.innerHTML = `<option value="">- ไม่ระบุ -</option>` + all.map(t=>{
          const u = String(t.username||'').trim();
          const label = `${techDisplayName(u)} (${u})`;
          const sel = (u && u === primaryU) ? 'selected' : '';
          return `<option value="${escapeHtml(u)}" ${sel}>${escapeHtml(label)}</option>`;
        }).join('');
        // if job has primary not in list (legacy), still show it
        if (primaryU && !all.some(t=>t.username===primaryU)) {
          const opt = document.createElement('option');
          opt.value = primaryU;
          opt.textContent = `${techDisplayName(primaryU)} (${primaryU})`;
          opt.selected = true;
          primarySel.insertBefore(opt, primarySel.children[1] || null);
        }
      }

      // initial render
      renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers);
      const searchEl = el('edit_team_search');
      const selEl = el('edit_team_members');
      if (searchEl) searchEl.oninput = ()=>renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers);
      if (selEl) selEl.onchange = ()=>{ renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers); renderEditor(); };
      if (primarySel) primarySel.onchange = ()=>{ renderTeamEditor(getPrimaryTechFromUI(primaryU), curTeamUsers); renderEditor(); };
    } catch (e) {
      console.warn('team editor init failed', e);
    }

    const btnSave = el('btnSaveEdit');
    const msg = el('edit_msg');
    if (btnSave) {
      btnSave.onclick = async ()=>{
        try{
          btnSave.disabled = true;
          if (msg) msg.textContent = 'กำลังบันทึกข้อมูลใบงาน รายการบริการ และทีมช่าง...';

          const apptRaw = String(el('edit_appt')?.value||'').trim();
          const primaryU = getPrimaryTechFromUI(String(job.technician_username||'').trim()) || null;
          const payload = {
            customer_name: String(el('edit_customer_name')?.value||'').trim(),
            customer_phone: String(el('edit_customer_phone')?.value||'').trim(),
            job_type: String(el('edit_job_type')?.value||'').trim(),
            address_text: String(el('edit_address')?.value||'').trim(),
            job_zone: String(el('edit_zone')?.value||'').trim(),
            maps_url: String(el('edit_maps_url')?.value||'').trim(),
            latitude: String(el('edit_lat')?.value||'').trim(),
            longitude: String(el('edit_lng')?.value||'').trim(),
            // IMPORTANT (Timezone): <input type="datetime-local"> has no timezone.
            // Using Date(...).toISOString() will convert to UTC ("Z") and cause 09:00 -> 16:00/18:00 shifts.
            // Treat the picked wall-clock time as Bangkok (+07:00).
            appointment_datetime: apptRaw ? localDatetimeToBangkokISO(apptRaw) : null,
            // allow change lead / primary technician (backward-compatible)
            technician_username: primaryU,
          };
          const cleanItems = editorItems
            .map(it=>({
              item_id: it.item_id ? Number(it.item_id) : null,
              item_name: String(it.item_name||'').trim(),
              qty: Number(it.qty||0),
              unit_price: Number(it.unit_price||0),
              assigned_technician_username: String(it.assigned_technician_username||'').trim() || null,
            }))
            .filter(it=>it.item_name);

          const hid = el('edit_team_members_json');
          let desired = [];
          if (hid && hid.value) {
            try { desired = JSON.parse(hid.value); } catch {}
          }
          if (!Array.isArray(desired)) desired = [];
          desired = desired.map(x=>String(x||'').trim()).filter(Boolean);
          if (primaryU && !desired.includes(primaryU)) desired.unshift(primaryU);
          desired = Array.from(new Set(desired));

          // Save everything through one orchestrated backend call.
          // Rationale: avoid the old 3-step save flow that could leave header/items/team out of sync.
          // Snapshot fields let backend reject stale editor data with 409 instead of overwriting newer changes.
          const result = await apiFetch(`/jobs/${encodeURIComponent(String(job.job_id))}/admin-edit`, {
            method:'PUT',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              ...payload,
              items: cleanItems,
              team_members: desired,
              primary_username: primaryU,
              base_items_snapshot: baseItemsSnapshot,
              base_team_snapshot: baseTeamSnapshot,
            })
          });

          const done = [];
          if (result?.steps?.header) done.push('ข้อมูลหลัก');
          if (result?.steps?.items) done.push('รายการบริการ');
          if (result?.steps?.team) done.push('ทีมช่าง');

          showToast('บันทึกใบงานครบแล้ว', 'success');
          if (msg) msg.textContent = `✅ บันทึกใบงานครบแล้ว${done.length ? `: ${done.join(' / ')}` : ''}`;
          await loadJob();
        }catch(e){
          console.error(e);
          let text = e?.message || 'บันทึกไม่สำเร็จ';
          if (Number(e?.status || 0) === 409) {
            const code = String(e?.data?.code || '').trim();
            if (code === 'STALE_ITEMS' || code === 'STALE_TEAM') {
              text = `${text}\n\nคำแนะนำ: กดรีโหลดหน้าใบงานนี้ก่อน แล้วตรวจสอบข้อมูลล่าสุดอีกครั้ง`;
            }
          }
          alert(text);
          if (msg) msg.textContent = `❌ ${text.replace(/\n+/g, ' ')} • รอบนี้ยังไม่มีการบันทึกข้อมูลเพิ่ม`;
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

  const btnCreateReworkCase = el('btnCreateReworkCase');
  if (btnCreateReworkCase) {
    btnCreateReworkCase.onclick = async ()=>{
      const reason = (el('return_reason')?.value||'').trim() || prompt('ระบุปัญหาที่ต้องส่งงานกลับแก้', '');
      if (!reason) return alert('ต้องระบุปัญหา/เหตุผลก่อนส่งงานกลับแก้');
      const reason_type = prompt('ประเภทงานแก้ไข: water_leak, not_clean, customer_complaint, missing_photos, same_issue_not_fixed, poor_work_standard, other', 'other') || 'other';
      if (!confirm('สร้างเคสงานแก้ไขและส่งงานกลับให้ช่างแก้?')) return;
      await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/rework_case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_type, reason_note: reason, warranty_checked: !!job.is_in_warranty })
      });
      showToast('สร้างเคสงานแก้ไขแล้ว', 'success');
      await loadJob();
    };
  }

  const btnCreateDeductionCase = el('btnCreateDeductionCase');
  if (btnCreateDeductionCase) {
    btnCreateDeductionCase.onclick = async ()=>{
      const technician_username = String(job.technician_username || '').trim() || prompt('username ช่าง', '');
      if (!technician_username) return alert('ต้องระบุช่าง');
      const deduction_type = prompt('ประเภทหักเงิน', 'manual_adjustment') || 'manual_adjustment';
      const amount = Number(prompt('จำนวนเงินที่ต้องการหัก', '0') || 0);
      const reason = prompt('เหตุผล', '') || '';
      if (!amount || amount <= 0 || !reason) return alert('ต้องระบุจำนวนเงินและเหตุผลให้ครบ');
      await apiFetch('/admin/deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ technician_username, job_id: job.job_id, deduction_type, amount, reason, severity: 'medium', evidence_json: [] })
      });
      showToast('เปิดเคสหักเงินแล้ว', 'success');
    };
  }

  const btnViewCaseHistory = el('btnViewCaseHistory');
  if (btnViewCaseHistory) {
    btnViewCaseHistory.onclick = async ()=>{
      const d = await apiFetch(`/admin/deductions?job_id=${encodeURIComponent(String(job.job_id))}`);
      const r = await apiFetch(`/admin/rework_cases?job_id=${encodeURIComponent(String(job.job_id))}`);
      const lines = [
        'เคสหักเงิน',
        ...((d.rows || []).map(x => `${x.case_code} | ${x.status} | ${x.deduction_type} | ${Number(x.amount||0).toLocaleString()} บาท | ${x.reason}`)),
        '',
        'งานแก้ไข',
        ...((r.rows || []).map(x => `${x.case_code} | ${x.status} | ${x.reason_type} | ${x.resolution || '-'}`)),
      ];
      alert(lines.join('\n') || 'ยังไม่มีประวัติเคส');
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

  
  const btnForce = el('btnForceFinish');
  if (btnForce) {
    btnForce.onclick = async ()=> {
      if (!confirm('ยืนยันปิดงานแทนช่าง? (งานจะถูกตั้งเป็น “เสร็จแล้ว” ทันที)')) return;
      const reason = (el('force_finish_reason')?.value || '').trim();
      const payload = { role:'admin', actor_username: (localStorage.getItem('admin_username')||'').trim() || null, reason };
      const r = await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}/force_finish_v2`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (r && r.success) {
        alert('✅ ปิดงานแทนช่างเรียบร้อย');
        // reload page state
        location.reload();
      } else {
        alert('❌ ปิดงานไม่สำเร็จ');
      }
    };
  }

  const btnDel = el('btn_delete_job');
  if (btnDel) {
    btnDel.onclick = async ()=> {
      const code = String(job.booking_code||'').trim();
      const t1 = `ยืนยันลบงานนี้?\n\njob_id: ${job.job_id}\nbooking_code: ${code}\nช่าง: ${job.technician_username||'-'}\nวันเวลา: ${job.appointment_datetime||job.appointment_datetime_th||'-'}`;
      if (!confirm(t1)) return;
      const t2 = prompt(`พิมพ์ DELETE หรือ ${code} เพื่อยืนยันการลบถาวร`, '');
      if (!t2) return;
      const v = String(t2).trim();
      if (!(v === 'DELETE' || (code && v === code))) {
        alert('คำยืนยันไม่ถูกต้อง ยกเลิกการลบ');
        return;
      }
      try {
        btnDel.disabled = true;
        await apiFetch(`/admin/jobs/${encodeURIComponent(String(job.job_id))}`, { method: 'DELETE' });
        showToast('ลบงานเรียบร้อย', 'success');
        // go back to queue/history page (fail-open)
        setTimeout(()=>{ location.href = '/admin-queue-v2.html'; }, 600);
      } catch (e) {
        btnDel.disabled = false;
        alert(`ลบงานไม่สำเร็จ: ${e?.data?.error || e.message || 'error'}`);
      }
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
        appointment_datetime: localDatetimeToBangkokISO(appt),
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
    const text = buildSummaryText(job, items, promotion);
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
