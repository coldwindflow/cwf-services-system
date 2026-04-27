(function(){
  'use strict';
  var VERSION = 'company-logo-icon-v32';
  function register(){
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/sw.js?v=' + VERSION).then(function(reg){
        try {
          if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          if (reg) {
            reg.addEventListener('updatefound', function(){
              var nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', function(){
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  nw.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
          }
        } catch(e) {}
      }).catch(function(){ /* keep app usable even when SW registration fails */ });
    });
  }
  register();
})();
