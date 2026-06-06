// CWF PWA cache — AI Office v5 pixel engine
const CACHE_NAME = "cwf-cache-v106-ai-office-v5-pixel-engine";

const ASSETS = [
  "/",
  "/login.html",
  "/index.html",
  "/tech.html",
  "/style.css",
  "/app.js?v=20260603_tech_map_url_fix",
  "/logo.png",
  "/assets/cwf-promptpay-qr.jpg",
  "/manifest.json",
  "/mainfest.json",
  "/icon-cwf-v34-180.png",
  "/icon-cwf-v34-192.png",
  "/icon-cwf-v34-512.png",
  "/icon-cwf-v34-512-maskable.png",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/edit-profile.html",
  "/customer.html",
  "/track.html",
  "/admin-review-v2.html",
  "/admin-review-v2.js",
  "/admin-add-v2.html",
  "/admin-add-v2.js?v=20260520_generic_price_campaign_v1",
  "/admin-queue-v2.html",
  "/admin-queue-v2.js",
  "/admin-history-v2.html",
  "/admin-history-v2.js",
  "/admin-job-view-v2.html",
  "/admin-job-view-v2.js?v=20260508_edit_service_builder_v2",
  "/admin-promotions-v2.html",
  "/admin-promotions-v2.js?v=20260520_generic_price_campaign_v1",
  "/admin-v2-common.js",
  "/admin-work-readiness-v2.html",
  "/admin-work-readiness-v2.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const pathname = url.pathname || "/";
  const isAiOffice = (
    pathname === "/admin/ai-office" ||
    pathname === "/admin/ai-office.html" ||
    pathname === "/admin-ai-office.html" ||
    pathname === "/admin-ai-office.js" ||
    pathname.startsWith("/admin/ai-office/") ||
    pathname.startsWith("/assets/ai-office-v5/")
  );
  if (isSameOrigin && isAiOffice) {
    e.respondWith(fetch(e.request, { cache: "no-store" }));
    return;
  }
  const isStaticExt = /\.(?:html|css|js|png|jpg|jpeg|webp|svg|ico|json)$/.test(pathname);
  const isAssetListed = ASSETS.includes(pathname) || (pathname === "/" && ASSETS.includes("/"));
  const shouldCache = isSameOrigin && (isStaticExt || isAssetListed || e.request.mode === "navigate");
  if (!shouldCache) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return resp;
      })
      .catch(async () => {
        const cached = await caches.match(e.request);
        if (cached) return cached;
        if (e.request.mode === "navigate") {
          return (
            (await caches.match(url.pathname)) ||
            (await caches.match("/customer.html")) ||
            (await caches.match("/track.html")) ||
            (await caches.match("/login.html")) ||
            (await caches.match("/index.html"))
          );
        }
        return cached;
      })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  const title = data.title || "CWF มีงานใหม่";
  const options = {
    body: data.body || "มีงานใหม่เข้ามา กรุณาเปิดแอพเพื่อตรวจสอบ",
    icon: "/icon-cwf-v34-192.png",
    badge: "/icon-cwf-v34-192.png",
    tag: data.tag || "cwf-job-notification",
    renotify: true,
    requireInteraction: data.kind === "urgent_offer",
    timestamp: Date.now(),
    vibrate: [120, 70, 120],
    actions: [
      { action: "open", title: data.kind === "urgent_offer" ? "เปิดดูงาน / รับงาน" : "เปิดดูงาน" }
    ],
    data: { url: data.url || "/tech.html", job_id: data.job_id || null, kind: data.kind || "job", income_amount_text: data.income_amount_text || "" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || "/tech.html";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin && "focus" in client) {
          if ("navigate" in client) await client.navigate(targetUrl);
          return client.focus();
        }
      } catch (_) {}
    }
    return clients.openWindow(targetUrl);
  })());
});
