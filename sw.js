// Bump CACHE_NAME on every release (admin "Publish" in GitHub = new commit; change this string to ship app code changes).
var CACHE_NAME = "spot-check-v3";
var ASSETS = [
  "./", "./index.html", "./admin.html", "./styles.css", "./app.js", "./common.js", "./pdf.js",
  "./admin.js", "./vendor/jspdf.umd.min.js", "./manifest.json", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", function (e) {
  // No skipWaiting here: the new version waits until the manager taps "Update now".
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) {
    return Promise.all(ASSETS.map(function (u) { return c.add(new Request(u, { cache: "reload" })); }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("message", function (e) { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // config.json (shops/categories) is always fetched fresh so admin changes reach phones on open.
  if (url.pathname.slice(-11) === "config.json") {
    e.respondWith(fetch(e.request, { cache: "no-store" }).catch(function () { return caches.match(e.request); }));
    return;
  }
  // Admin files are always fetched fresh (cache only as offline fallback).
  if (/\/admin\.(html|js)$/.test(url.pathname)) {
    e.respondWith(fetch(e.request, { cache: "no-store" }).catch(function () { return caches.match(e.request); }));
    return;
  }
  // Everything else: cache first, so the app is stable and works offline until the user updates.
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
