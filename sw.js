// This app changes often, so the strategy is network-first for the shell
// (index.html, manifest, this file's own registration) — always try the
// live version, only fall back to cache when offline. Icons rarely change
// so those stay cache-first for speed.
//
// Bump this whenever the caching strategy itself changes — it's what
// forces browsers to install a fresh service worker and clear old caches.
const CACHE_VERSION = 'styx-notes-v14';
// Holds whatever was just shared into the app until the page picks it up.
const SHARE_CACHE = 'styx-share';

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
          .filter((key) => key !== CACHE_VERSION && key !== SHARE_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // "Share to Styx" from another app (manifest share_target) arrives as a
  // POST. Stash the shared text/link/image, then open the app, which turns
  // it into a new note (index.html, openSharedNote).
  if (request.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await request.formData();
        const cache = await caches.open(SHARE_CACHE);
        await cache.put('shared.json', new Response(JSON.stringify({
          title: form.get('title') || '',
          text: form.get('text') || '',
          url: form.get('url') || '',
        }), { headers: { 'Content-Type': 'application/json' } }));
        const image = form.get('image');
        if (image && typeof image !== 'string' && image.size) {
          await cache.put('shared-image', new Response(image, { headers: { 'Content-Type': image.type || 'image/jpeg' } }));
        } else {
          await cache.delete('shared-image');
        }
      } catch (err) {}
      return Response.redirect(new URL('./index.html?action=share', self.registration.scope).href, 303);
    })());
    return;
  }

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