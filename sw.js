/*
 * Whole Life Hub — service worker (sw.js)
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES
 *   Makes the web app installable as a PWA and usable on a flaky connection:
 *   the app shell still opens offline, and static images/fonts don't have to
 *   be re-downloaded on every visit.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - It never caches Supabase traffic (auth, database, storage). Those
 *     responses are per-user and can carry tokens; Cache Storage is readable
 *     by any script on the origin, so API data simply never goes in there.
 *   - It never caches non-GET requests (writes always hit the network; the
 *     app's own offline sync queue already handles deferred writes).
 *   - It does NOT cache-first the HTML document. Whole Life ships updates
 *     constantly, so the document is network-first: users always get the
 *     newest build when online, and the cached copy is only an offline
 *     fallback. Serving a stale app shell is the classic PWA bug — this
 *     avoids it by design.
 *
 * HOW TO UPDATE
 *   Bump VERSION whenever this file's strategy or the precache list changes.
 *   On activate, every older cache is deleted, so users can't get stuck on
 *   a previous shell.
 *
 * WIRING (one paste in index.html — see docs/APP_READINESS.md)
 *   The page registers this worker; this file must stay at the site root so
 *   its scope covers the whole app.
 */

'use strict';

// Bump this on every meaningful change to force an old-cache clean-out.
const VERSION = 'wlh-v1';
const SHELL_CACHE = VERSION + '-shell';   // the app document + manifest
const ASSET_CACHE = VERSION + '-assets'; // images and fonts (cache-forever style)

// The smallest set that makes "open the app offline" work. Everything else
// is cached lazily on first successful fetch (see the fetch handler).
// The one other-site file the page needs to start: the pinned, SRI-checked supabase-js. Without it a cold offline start has no sign-in layer.
const LIBRARY_PREFIX = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@';

const PRECACHE_URLS = [
  '/',                    // the whole app is one document
  '/manifest.webmanifest',
  '/img/icon-192.png'
];

// --- Install: warm the shell cache, then take over promptly --------------
// skipWaiting() means a new worker doesn't sit in "waiting" until every tab
// closes. For a solo-developed app that ships often, fast takeover is worth
// more than the (small) risk of a mid-session version mix.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // One missing file must not stop the worker installing: add each on its own and ignore failures.
      .then((cache) => Promise.all(PRECACHE_URLS.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

// --- Activate: delete stale caches from older versions --------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

// --- Fetch: three strategies, chosen by request type ----------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1) Writes and cross-origin traffic (Supabase, CDNs) pass straight
  //    through to the network. Never intercepted, never cached.
  const isLibrary = request.url.startsWith(LIBRARY_PREFIX);
  if (request.method !== 'GET' || (url.origin !== self.location.origin && !isLibrary)) {
    return;
  }

  // 2) Page navigations: network-first, cache fallback when offline.
  //    A fresh copy of the app page is stored on every good visit so the
  //    fallback is never more than one visit old. Only the app document
  //    ever becomes the offline copy: not an error page, and not an image
  //    or other file someone opened directly.
  if (request.mode === 'navigate') {
    const isAppPage = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          const type = (response.headers && response.headers.get('content-type')) || '';
          if (isAppPage && response.ok && type.includes('text/html')) {
            const copy = response.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => {}));
          }
          return response;
        })
        .catch(() => (isAppPage ? caches.match('/') : Response.error()))
    );
    return;
  }

  // 3) Same-origin static assets (images, fonts, this worker's siblings):
  //    stale-while-revalidate — serve the cached copy immediately, refresh
  //    it in the background. Fast repeat loads, self-healing content.
  event.respondWith(
    caches.open(ASSET_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.status !== 206 && (!isLibrary || response.type === 'cors')) cache.put(request, response.clone()).catch(() => {}); // partial (media range) responses cannot be cached
          return response;
        })
        .catch(() => cached); // offline: fall back to whatever we have
      return cached || network;
    })
  );
});
