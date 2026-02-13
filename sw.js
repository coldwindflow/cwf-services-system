// ✅ Phase 2: PWA เสถียร + บังคับอัปเดต cache
// - เพิ่ม icons (192/512/maskable) ให้ Chrome “ติดตั้งเป็นแอพ” ได้จริง
// - bump cache name เพื่อกันไฟล์ค้าง
const CACHE_NAME = "cwf-cache-v15";

const ASSETS = [
  "/",
  "/login.html",
  "/index.html",
  "/tech.html",
  "/style.css",
  "/app.js",
  "/logo.png",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/edit-profile.html",
  "/mainfest.json",
  "/customer.html",
  "/track.html",
  "/admin-review-v2.html",
  "/admin-review-v2.js",
  "/admin-add-v2.html",
  "/admin-add-v2.js",
  "/admin-queue-v2.html",
  "/admin-queue-v2.js",
  "/admin-history-v2.html",
  "/admin-history-v2.js",
  "/admin-job-view-v2.html",
  "/admin-job-view-v2.js",
  "/admin-promotions-v2.html",
  "/admin-promotions-v2.js",
  "/admin-v2-common.js",
];

// ติดตั้งแล้ว cache ไฟล์
self.addEventListener("install", (e) => {
  self.skipWaiting(); // ✅ ให้ service worker ใหม่ทำงานทันที
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
});

// ล้าง cache เก่า
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

// ✅ ให้หน้าเว็บส่งคำสั่งมาได้ (เช่นให้ SW ใหม่ข้าม waiting)
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ดึงจาก network ก่อน ถ้าไม่ได้ค่อยใช้ cache (กันไฟล์เก่าค้าง)
self.addEventListener("fetch", (e) => {
  // ✅ อย่าแตะ request แบบ POST/PUT/DELETE
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // ✅ กัน cache API/ข้อมูล dynamic (สำคัญ: ไม่ให้เก็บ response งาน/สถานะไว้ใน cache)
  // - cache เฉพาะไฟล์ static (html/css/js/png/json) หรือไฟล์ที่อยู่ใน ASSETS
  const isSameOrigin = url.origin === self.location.origin;
  const pathname = url.pathname || "/";
  const isStaticExt = /\.(?:html|css|js|png|jpg|jpeg|webp|svg|ico|json)$/.test(pathname);
  const isAssetListed = ASSETS.includes(pathname) || (pathname === "/" && ASSETS.includes("/"));
  const shouldCache = isSameOrigin && (isStaticExt || isAssetListed || e.request.mode === "navigate");

  // ถ้าไม่ควร cache → ปล่อยผ่าน network ตรง ๆ
  if (!shouldCache) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return resp;
      })
      .catch(async () => {
        // Offline fallback (โดยเฉพาะตอนเปิดหน้าแบบ navigate)
        const cached = await caches.match(e.request);
        if (cached) return cached;

        if (e.request.mode === "navigate") {
          // พยายาม fallback ไปหน้าใช้งานหลักที่ถูก cache ไว้
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
