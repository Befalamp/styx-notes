// This app changes often, so the strategy is network-first for the shell
// (index.html, manifest, this file's own registration) — always try the
// live version, only fall back to cache when offline. Icons rarely change
// so those stay cache-first for speed.
//
// Bump this whenever the caching strategy itself changes — it's what
// forces browsers to install a fresh service worker and clear old caches.
const CACHE_VERSION = 'styx-notes-v12';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
];

const CACHE_FIRST_PATHS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests for our own origin. Everything else —
  // Firestore/Auth calls, Google's gstatic SDK imports, etc. — goes
  // straight to the network untouched.
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  const isCacheFirst = CACHE_FIRST_PATHS.some((p) => url.pathname.endsWith(p));

  if (isCacheFirst) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for the app shell itself — this is what makes a
  // fresh deploy show up on next reload without a stale cache in the way.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});