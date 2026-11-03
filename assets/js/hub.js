/* Hub page: register the service worker so all three suites become available offline. */
(function () {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.search.indexOf('sw=1') < 0) return;
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW registration failed', e); }); });
})();
