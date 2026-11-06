self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.titre || 'Copro des Pavillons', {
      body: data.message || '',
      tag: 'ticket-' + (data.ticketId || ''),
      data: { ticketId: data.ticketId }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var id = event.notification.data && event.notification.data.ticketId;
  event.waitUntil(clients.openWindow(id ? '/tickets/' + id : '/tickets'));
});
