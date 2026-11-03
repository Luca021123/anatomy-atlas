/* Open Medical Toolkit — service worker
 * Offline-first: precaches the hub and each suite page, then discovers and caches every
 * same-origin script/stylesheet/icon referenced by those pages, so a single visit makes
 * all three suites available offline. Same-origin GETs use stale-while-revalidate;
 * cross-origin requests (e.g. optional weather/air-quality data) go to the network only.
 * Bump VERSION to force a clean re-cache.
 */
var VERSION = 'omt-v1';
var PAGES = ['./', './index.html', './student/index.html', './clinician/index.html', './health/index.html'];
var EXTRA = ['./assets/css/core.css', './assets/js/core.js', './assets/js/preload.js', './assets/js/hub.js',
  './student/manifest.webmanifest', './clinician/manifest.webmanifest', './health/manifest.webmanifest'];

function sameScope(url) { return url.indexOf(self.registration.scope) === 0; }

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(VERSION);
    await Promise.all(PAGES.concat(EXTRA).map(function (u) { return cache.add(u).catch(function () { /* missing file: skip */ }); }));
    for (var i = 0; i < PAGES.length; i++) {
      try {
        var pageUrl = new URL(PAGES[i], self.registration.scope);
        var res = await fetch(pageUrl, { cache: 'no-cache' });
        if (!res.ok) continue;
        var html = await res.text();
        var re = /(?:src|href)="([^"#?:]+)"/g, m, urls = [];
        while ((m = re.exec(html))) urls.push(new URL(m[1], pageUrl).href);
        await Promise.all(urls.filter(sameScope).map(function (u) { return cache.add(u).catch(function () { }); }));
      } catch (e) { /* offline during install: runtime caching will fill gaps */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // network only for third parties
  event.respondWith((async function () {
    var cache = await caches.open(VERSION);
    var key = req.mode === 'navigate' && url.pathname.slice(-1) === '/' ? new Request(url.origin + url.pathname + 'index.html') : req;
    var cached = await cache.match(key, { ignoreSearch: true });
    var network = fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    }).catch(function () { return null; });
    if (cached) { event.waitUntil(network); return cached; }
    var res = await network;
    if (res) return res;
    if (req.mode === 'navigate') {
      var fallback = await cache.match(new URL('./index.html', self.registration.scope).href);
      if (fallback) return fallback;
    }
    return new Response('Offline and not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
