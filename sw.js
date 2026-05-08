const CACHE_NAME = "cwf-cache-v76-fix-active-history-v23-20260509";
const ASSETS = [
  "/tech.html?v=20260509_emergency_no_revisit_v22",
  "/app.js?v=20260509_fix_active_history_v23"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME))
      .then(cache => cache.addAll(ASSETS).catch(() => null))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET") return;

  // APIs must always go network-first / never stale-cache
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/jobs/") || url.pathname.startsWith("/admin/")) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // HTML/JS/CSS use network-first to escape broken PWA cache fast
  if (req.mode === "navigate" || /\.(html|js|css)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
