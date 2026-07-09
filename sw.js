/* CWF root service worker: Tech App shell/cache refresh */
const CWF_TECH_BUILD_ID = "20260710_payout_no_pay_status_v1";
const CWF_ACCOUNTING_CACHE_BUMP = "20260703_accounting_payout_adjustment_v1";
const CACHE_PREFIX = "cwf-root-tech-app-";
const CACHE_NAME = `${CACHE_PREFIX}${CWF_TECH_BUILD_ID}-${CWF_ACCOUNTING_CACHE_BUMP}`;
const SHELL_ASSETS = [
  `/tech.html?v=${CWF_TECH_BUILD_ID}`,
  `/app.js?v=${CWF_TECH_BUILD_ID}`,
  `/cwf-pwa.js?v=${CWF_TECH_BUILD_ID}`,
  `/manifest.json?v=${CWF_TECH_BUILD_ID}`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => (
          (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
          key === "close-panel-hard-clean-v4" ||
          key.startsWith("cwf-tech-")
        ))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/tech/work-calendar")) return;

  if (request.mode === "navigate" || /\.(?:js|css|html|json)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(`/tech.html?v=${CWF_TECH_BUILD_ID}`)))
    );
  }
});
