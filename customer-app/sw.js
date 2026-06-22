"use strict";

const BUILD_ID = "20260622_same_day_timing_v1";
const CACHE_NAME = `cwf-customer-app-v2-${BUILD_ID}`;
const APP_SHELL = [
  `./index.html?v=${BUILD_ID}`,
  `./manifest.webmanifest?v=${BUILD_ID}`,
  `./assets/customer-app.css?v=${BUILD_ID}`,
  `./assets/customer-app.js?v=${BUILD_ID}`,
  "./assets/icons/cwf-customer-192.png",
  `./modules/state.js?v=${BUILD_ID}`,
  `./modules/utils.js?v=${BUILD_ID}`,
  `./modules/api.js?v=${BUILD_ID}`,
  `./modules/services.js?v=${BUILD_ID}`,
  `./modules/ui.js?v=${BUILD_ID}`,
  `./modules/auth.js?v=${BUILD_ID}`,
  `./modules/pricing.js?v=${BUILD_ID}`,
  `./modules/availability.js?v=${BUILD_ID}`,
  `./modules/bookingScheduled.js?v=${BUILD_ID}`,
  `./modules/bookingUrgent.js?v=${BUILD_ID}`,
  `./modules/tracking.js?v=${BUILD_ID}`,
  `./modules/profile.js?v=${BUILD_ID}`,
  `./modules/router.js?v=${BUILD_ID}`
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("cwf-customer-app-v2-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/public/")
    || url.pathname.startsWith("/promotions")
    || url.pathname.startsWith("/service_zones")
    || url.pathname.startsWith("/catalog/")) {
    event.respondWith(fetch(request));
    return;
  }
  if (!url.pathname.startsWith("/customer-app/")) return;

  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match(`./index.html?v=${BUILD_ID}`);
        return Response.error();
      }))
  );
});
