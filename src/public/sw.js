const CACHE = 'copro-v2';
const STATIQUES = ['/style.css', '/app.js', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(STATIQUES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Pages (navigations) : réseau d'abord, cache en secours uniquement hors-ligne.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(function () {
        return caches.match(e.request).then(function (cache) {
          return cache || caches.match('/connexion');
        });
      })
    );
    return;
  }
  // Assets statiques : cache d'abord.
  e.respondWith(
    caches.match(e.request).then(function (cache) {
      return cache || fetch(e.request).then(function (reponse) {
        if (reponse.ok && new URL(e.request.url).origin === location.origin) {
          var copie = reponse.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copie); });
        }
        return reponse;
      });
    })
  );
});
