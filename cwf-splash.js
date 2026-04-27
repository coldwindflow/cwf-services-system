(function(){
  var KEY = 'cwf_launch_splash_seen_session_v2';
  var MIN_MS = 1200;
  var MAX_MS = 2300;
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true}); else fn(); }
  function show(){
    try{
      if(sessionStorage.getItem(KEY) === '1') return;
      sessionStorage.setItem(KEY, '1');
    }catch(e){}
    var started = Date.now();
    var wrap = document.createElement('div');
    wrap.className = 'cwf-splash';
    wrap.setAttribute('aria-label','Coldwindflow loading');
    wrap.innerHTML = '<div class="cwf-splash__card">'
      + '<div class="cwf-splash__media"><video src="/cwf-splash.mp4" autoplay muted playsinline preload="auto"></video></div>'
      + '<div class="cwf-splash__logo"><img src="/logo.png" alt="CWF"></div>'
      + '<div class="cwf-splash__brand"><b>Coldwindflow Air Services</b><span>Smart Field Service System</span></div>'
      + '<div class="cwf-splash__bar"><i></i></div>'
      + '</div>';
    document.body.appendChild(wrap);
    function hide(){
      var remain = Math.max(0, MIN_MS - (Date.now() - started));
      setTimeout(function(){
        wrap.classList.add('is-hide');
        setTimeout(function(){ try{ wrap.remove(); }catch(e){} }, 420);
      }, remain);
    }
    setTimeout(hide, MAX_MS);
    window.addEventListener('load', function(){ setTimeout(hide, 450); }, {once:true});
    try{ wrap.querySelector('video').play().catch(function(){}); }catch(e){}
  }
  ready(show);
})();
