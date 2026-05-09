const CACHE_NAME = "cwf-cache-v78-fix31-emergency-purge-stable26-20260510";
const STATIC_ASSETS = [
  "/",
  "/tech.html",
  "/app.js?v=20260510_fix31_emergency_purge_stable26",
  "/style.css",
  "/manifest.json",
  "/logo.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => undefined))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME && /^cwf-cache-/i.test(key))
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "CWF_CACHE_PURGED", cache: CACHE_NAME });
    }
  })());
});

function shouldNetworkFirst(request) {
  if (request.method !== "GET") return true;
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.mode === "navigate") return true;
  if (path === "/" || path.endsWith(".html") || path.endsWith(".js") || path.endsWith(".css")) return true;
  if (path.startsWith("/tech/")) return true;
  if (path.startsWith("/api/")) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (shouldNetworkFirst(request)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        // Cache only static app shell files, not dynamic API/tech data.
        if (fresh && fresh.ok && (request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone()).catch(() => undefined);
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  })());
});
