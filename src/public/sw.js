const CACHE = 'copro-v5';
const STATIQUES = ['/style.css', '/app.js', '/icon.svg?v=3', '/icon-192.png?v=3', '/icon-512.png?v=3'];

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
  // Navigations ET assets statiques : reseau d'abord (pour toujours servir la
  // derniere version de app.js/style.css), cache en secours hors-ligne.
  e.respondWith(
    fetch(e.request).then(function (reponse) {
      if (reponse.ok && new URL(e.request.url).origin === location.origin && e.request.mode !== 'navigate') {
        var copie = reponse.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copie); });
      }
      return reponse;
    }).catch(function () {
      return caches.match(e.request).then(function (cache) {
        return cache || (e.request.mode === 'navigate' ? caches.match('/connexion') : Response.error());
      });
    })
  );
});
