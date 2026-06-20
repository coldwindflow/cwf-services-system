"use strict";

const CACHE_NAME = "cwf-customer-app-v2-cleaning-calendar-20260620";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/customer-app.css",
  "./assets/customer-app.js",
  "./assets/icons/cwf-customer-192.png",
  "./modules/state.js",
  "./modules/utils.js",
  "./modules/api.js",
  "./modules/services.js",
  "./modules/ui.js",
  "./modules/auth.js",
  "./modules/pricing.js",
  "./modules/availability.js",
  "./modules/bookingScheduled.js",
  "./modules/tracking.js",
  "./modules/profile.js",
  "./modules/router.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("cwf-customer-app-v2-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/public/") || url.pathname.startsWith("/promotions") || url.pathname.startsWith("/service_zones") || url.pathname.startsWith("/catalog/")) {
    event.respondWith(fetch(request));
    return;
  }
  if (!url.pathname.startsWith("/customer-app/")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }))
  );
});
