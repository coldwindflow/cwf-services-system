// ✅ Phase 2: PWA เสถียร + บังคับอัปเดต cache
// - เพิ่ม icons (192/512/maskable) ให้ Chrome “ติดตั้งเป็นแอพ” ได้จริง
// - bump cache name เพื่อกันไฟล์ค้าง
const CACHE_NAME = "cwf-cache-v12";

const ASSETS = [
  "/",
  "/login.html",
  "/index.html",
  "/admin.html",
  "/tech.html",
  "/style.css",
  "/app.js",
  "/admin.js",
  "/logo.png",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/edit-profile.html",
  "/admin-tech.html",
  "/admin-tech.js",
  "/mainfest.json",
  "/customer.html",
  "/track.html",
  "/add-job.html"
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

// ดึงจาก network ก่อน ถ้าไม่ได้ค่อยใช้ cache (กันไฟล์เก่าค้าง)
self.addEventListener("fetch", (e) => {
  // ✅ อย่า cache request แบบ POST/PUT/DELETE
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
