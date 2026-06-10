(function(){
  "use strict";

  const STATE = { intakeId: null, intake: null, marked: false, fetchWrapped: false };

  function qs(){ return new URLSearchParams(window.location.search || ""); }
  function clean(v){ return String(v == null ? "" : v).replace(/\s+/g, " ").trim(); }
  function byId(id){ return document.getElementById(id); }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); } catch(_){} }
  function api(url, options){
    if (typeof apiFetch === "function") return apiFetch(url, options || {});
    return fetch(url, Object.assign({ credentials:"include", headers:{"Content-Type":"application/json"}}, options || {})).then(async (res)=>{
      const data = await res.json().catch(()=>null);
      if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP_${res.status}`);
      return data || {};
    });
  }
  function dispatch(el){
    if(!el) return;
    try { el.dispatchEvent(new Event("input", { bubbles:true })); } catch(_){}
    try { el.dispatchEvent(new Event("change", { bubbles:true })); } catch(_){}
  }
  function safeSet(id, value){
    const el = byId(id);
    const v = clean(value);
    if (!el || !v) return false;
    el.value = v;
    dispatch(el);
    return true;
  }
  function appendSet(id, value){
    const el = byId(id);
    const v = clean(value);
    if (!el || !v) return false;
    const cur = clean(el.value);
    el.value = cur ? `${cur}\n${v}` : v;
    dispatch(el);
    return true;
  }
  function normalizeJobType(serviceType){
    const s = clean(serviceType);
    if (/ติดตั้ง/.test(s)) return "ติดตั้ง";
    if (/ซ่อม|ตรวจ/.test(s)) return "ซ่อม";
    if (/ล้าง/.test(s)) return "ล้าง";
    return "";
  }
  function normalizeBtu(value){
    const n = Number((String(value || "").replace(/,/g, "").match(/\d+/) || [""])[0]);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(n);
  }
  function bangkokYmd(offsetDays){
    const d = new Date();
    d.setDate(d.getDate() + Number(offsetDays || 0));
    try {
      return new Intl.DateTimeFormat("sv-SE", { timeZone:"Asia/Bangkok", year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
    } catch(_) {
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,"0");
      const day = String(d.getDate()).padStart(2,"0");
      return `${y}-${m}-${day}`;
    }
  }
  function normalizeDate(value){
    const s = clean(value);
    if (!s) return "";
    if (s === "วันนี้") return bangkokYmd(0);
    if (s === "พรุ่งนี้") return bangkokYmd(1);
    if (s === "มะรืน") return bangkokYmd(2);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      const y = bangkokYmd(0).slice(0,4);
      return `${y}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
    }
    return "";
  }
  function normalizeTime(value){
    const s = clean(value);
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return `${String(m[1]).padStart(2,"0")}:${m[2]}`;
    return "";
  }
  function waitFor(condition, timeoutMs){
    const started = Date.now();
    return new Promise((resolve)=>{
      const tick = ()=>{
        let ok = false;
        try { ok = !!condition(); } catch(_) { ok = false; }
        if (ok || Date.now() - started > (timeoutMs || 3500)) return resolve(ok);
        setTimeout(tick, 120);
      };
      tick();
    });
  }
  function showPrefillBanner(intake){
    if (byId("aiIntakePrefillBanner")) return;
    const app = document.querySelector(".app");
    const h2 = app ? app.querySelector("h2") : null;
    const box = document.createElement("div");
    box.id = "aiIntakePrefillBanner";
    box.className = "card section-card";
    box.style.background = "linear-gradient(135deg,#081c4b,#1558d6)";
    box.style.color = "#fff";
    box.style.border = "1px solid rgba(255,204,0,.42)";
    box.innerHTML = `
      <b style="color:#ffcc00">🤖 เติมข้อมูลจาก LINE AI แล้ว</b>
      <div style="font-size:13px;font-weight:800;margin-top:6px;color:rgba(255,255,255,.86)">
        แอดมินต้องตรวจราคา คิว ช่าง และกดบันทึกงานเอง • AI ไม่ได้สร้างงานแทน
      </div>
      <div style="font-size:12px;margin-top:6px;color:rgba(255,255,255,.72)">
        รายการ #${intake.id || "-"} • ${intake.ai_summary || "รอตรวจข้อมูล"}
      </div>
    `;
    if (h2 && h2.parentNode) h2.parentNode.parentNode.insertBefore(box, h2.parentNode.nextSibling);
    else if (app) app.insertBefore(box, app.firstChild);
  }
  function applyService(intake){
    const jt = normalizeJobType(intake.service_type);
    if (jt) safeSet("job_type", jt);
    if (jt === "ล้าง") safeSet("ac_type", "ผนัง");
    const btu = normalizeBtu(intake.btu);
    if (btu) {
      waitFor(()=>byId("btu") && byId("btu").options && byId("btu").options.length, 3000).then(()=>{
        const el = byId("btu");
        if (!el) return;
        const exact = Array.from(el.options || []).find((o)=>String(o.value) === btu || String(o.textContent || "").includes(btu));
        if (exact) el.value = exact.value;
        else el.value = btu;
        dispatch(el);
      });
    }
    if (Number(intake.unit_count || 0) > 0) safeSet("machine_count", String(Number(intake.unit_count)));
    try { if (typeof buildVariantUI === "function") buildVariantUI(); } catch(_){}
    setTimeout(()=>{ try { if (typeof refreshPreviewDebounced === "function") refreshPreviewDebounced(); } catch(_){} }, 500);
  }
  function applySchedule(intake){
    const ymd = normalizeDate(intake.preferred_date);
    const hm = normalizeTime(intake.preferred_time);
    if (ymd) safeSet("appt_date", ymd);
    if (ymd && hm) safeSet("appointment_datetime", `${ymd}T${hm}`);
    else if (ymd) {
      const help = byId("appointment_datetime_help");
      if (help && intake.preferred_time) help.textContent = `LINE AI จับช่วงเวลา: ${intake.preferred_time} • กรุณาเลือกเวลาจริงก่อนบันทึก`;
    }
  }
  function applyIntake(intake){
    showPrefillBanner(intake);
    safeSet("customer_name", intake.customer_name);
    safeSet("customer_phone", intake.customer_phone);
    safeSet("address_text", intake.address_text || intake.area_text);
    safeSet("maps_url", intake.map_url);
    safeSet("job_zone", intake.area_text);
    appendSet("customer_note", [
      `จาก LINE AI intake #${intake.id}`,
      intake.latest_customer_message ? `ข้อความล่าสุด: ${intake.latest_customer_message}` : "",
      intake.ai_summary ? `AI note: ${intake.ai_summary}` : "",
    ].filter(Boolean).join("\n"));
    applyService(intake);
    applySchedule(intake);
    try { byId("customer_phone")?.dispatchEvent(new Event("blur", { bubbles:true })); } catch(_){}
    setTimeout(()=>{
      try { if (typeof detectAdminServiceZone === "function") detectAdminServiceZone(); } catch(_){}
      try { if (typeof refreshPreviewDebounced === "function") refreshPreviewDebounced(); } catch(_){}
    }, 900);
  }
  async function loadAndApply(){
    const p = qs();
    if (p.get("source") !== "line_ai" || !p.get("ai_intake_id")) return;
    STATE.intakeId = p.get("ai_intake_id");
    try {
      await waitFor(()=>typeof apiFetch === "function" && byId("customer_name") && byId("job_type"), 5000);
      const data = await api(`/admin/ai-office/booking-intakes/${encodeURIComponent(STATE.intakeId)}`);
      STATE.intake = data.intake || null;
      if (!STATE.intake) throw new Error("ไม่พบรายการ LINE AI");
      applyIntake(STATE.intake);
      toast("เติมข้อมูลจาก LINE AI แล้ว กรุณาตรวจและบันทึกเอง", "success");
    } catch (e) {
      toast(e.message || "โหลดข้อมูล LINE AI ไม่สำเร็จ", "error");
    }
  }
  function extractJobId(payload){
    if (!payload || typeof payload !== "object") return null;
    return Number(payload.job_id || payload.id || payload.job?.job_id || payload.job?.id || payload.data?.job_id || 0) || null;
  }
  function wrapFetchForJobCreated(){
    if (STATE.fetchWrapped || !STATE.intakeId || typeof window.fetch !== "function") return;
    STATE.fetchWrapped = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const isBook = /\/admin\/book_v2(?:\?|$)/.test(url) && method === "POST";
      const res = await originalFetch(input, init);
      if (isBook && res && res.ok && !STATE.marked) {
        STATE.marked = true;
        let body = null;
        try { body = await res.clone().json(); } catch(_) {}
        const jobId = extractJobId(body);
        api(`/admin/ai-office/booking-intakes/${encodeURIComponent(STATE.intakeId)}/job-created`, {
          method:"POST",
          body: JSON.stringify({ job_id: jobId, admin_note:"แอดมินสร้างงานจาก LINE AI intake แล้ว" }),
        }).then(()=>toast("อัปเดต LINE AI เป็นสร้างงานแล้ว", "success")).catch(()=>{});
      }
      return res;
    };
  }
  function init(){
    const p = qs();
    if (p.get("source") !== "line_ai" || !p.get("ai_intake_id")) return;
    STATE.intakeId = p.get("ai_intake_id");
    wrapFetchForJobCreated();
    setTimeout(loadAndApply, 700);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
