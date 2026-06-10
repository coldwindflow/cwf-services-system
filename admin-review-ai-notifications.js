(function(){
  "use strict";

  function byId(id){ return document.getElementById(id); }
  function toast(msg, type){ try { if (typeof showToast === "function") showToast(msg, type || "info"); } catch(_){} }
  function canNotify(){ return "Notification" in window; }
  function buttonLabel(){
    if (!canNotify()) return "🔕 แจ้งเตือนไม่รองรับ";
    if (Notification.permission === "granted") return "🔔 แจ้งเตือนเปิดแล้ว";
    if (Notification.permission === "denied") return "🔕 แจ้งเตือนถูกบล็อก";
    return "🔔 เปิดแจ้งเตือน";
  }
  function updateButton(){
    const btn = byId("btnAiNotifyEnable");
    if (!btn) return;
    btn.textContent = buttonLabel();
    btn.disabled = !canNotify() || Notification.permission === "denied" || Notification.permission === "granted";
    btn.style.opacity = btn.disabled && Notification.permission !== "granted" ? ".65" : "1";
  }
  function insertButton(){
    if (byId("btnAiNotifyEnable")) return;
    const reload = byId("btnReload");
    if (!reload || !reload.parentNode) return;
    const btn = document.createElement("button");
    btn.id = "btnAiNotifyEnable";
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.style.background = "#ffcc00";
    btn.style.color = "#081c4b";
    btn.style.border = "1px solid rgba(21,88,214,.22)";
    btn.style.fontWeight = "1000";
    btn.textContent = buttonLabel();
    btn.addEventListener("click", async ()=>{
      if (!canNotify()) return toast("เครื่องนี้ไม่รองรับ Browser Notification", "error");
      try {
        const result = await Notification.requestPermission();
        updateButton();
        if (result === "granted") {
          try { new Notification("CWF AI", { body:"เปิดแจ้งเตือนงานจาก LINE AI แล้ว" }); } catch(_) {}
          toast("เปิดแจ้งเตือนแล้ว", "success");
        } else {
          toast("ยังไม่ได้อนุญาตแจ้งเตือน", "error");
        }
      } catch (_) {
        toast("เปิดแจ้งเตือนไม่สำเร็จ", "error");
      }
    });
    reload.parentNode.appendChild(btn);
    updateButton();
  }
  function init(){
    insertButton();
    setInterval(updateButton, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
