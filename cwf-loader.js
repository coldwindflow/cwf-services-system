(function(){
  'use strict';
  var KEY='cwf_loader_seen_v2';
  var MAX_WAIT=1300;
  var MIN_SHOW=420;
  function ready(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn,{once:true}); else fn(); }
  function hide(el){ if(!el) return; el.classList.add('is-hidden'); setTimeout(function(){ try{ el.remove(); }catch(e){} }, 380); }
  ready(function(){
    try{ if(sessionStorage.getItem(KEY)==='1') return; sessionStorage.setItem(KEY,'1'); }catch(e){}
    var el=document.createElement('div');
    el.className='cwf-loader';
    el.setAttribute('aria-label','กำลังโหลด CWF');
    el.innerHTML='<div class="cwf-loader__card"><div class="cwf-loader__logoWrap"><img class="cwf-loader__logo" src="/icon-192.png" alt="CWF"></div><div class="cwf-loader__title">Coldwindflow Air Services</div><div class="cwf-loader__sub">กำลังโหลดหน้าแอพ...</div><div class="cwf-loader__bar"><span></span></div></div>';
    document.body.prepend(el);
    var start=Date.now();
    function done(){ var left=Math.max(0, MIN_SHOW-(Date.now()-start)); setTimeout(function(){ hide(el); }, left); }
    if(document.readyState==='complete') done(); else window.addEventListener('load', done, {once:true});
    setTimeout(function(){ hide(el); }, MAX_WAIT);
  });
})();
