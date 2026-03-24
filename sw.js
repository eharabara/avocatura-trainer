const CACHE_NAME = "avocatura-trainer-v2";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./quiz.html",
  "./review.html",
  "./results.html",
  "./style.css",
  "./script.js",
  "./questions-data.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isDocumentRequest = event.request.mode === "navigate";
  const isCoreAsset = isSameOrigin && [".html", ".css", ".js", ".webmanifest"].some((extension) => requestUrl.pathname.endsWith(extension));

  event.respondWith(
    (isDocumentRequest || isCoreAsset
      ? fetch(event.request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === "opaque") {
              return networkResponse;
            }

            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            return networkResponse;
          })
          .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match("./index.html")))
      : caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request)
            .then((networkResponse) => {
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === "opaque") {
                return networkResponse;
              }

              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
              return networkResponse;
            })
            .catch(() => caches.match("./index.html"));
        }))
  );
});
