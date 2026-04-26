// public/push-handler.js
// Imported by the Workbox-generated service worker via importScripts.
// Handles Web Push events and notification clicks.

self.addEventListener('push', function(event) {
  if (!event.data) return;

  var data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'EAC Natation', body: event.data.text() };
  }

  event.waitUntil(
    (async function() {
      try {
        // §171 P2 — if any window client is focused, skip OS notification
        // (the focused client owns the in-app toast); just postMessage the
        // payload so the client can render it however it wants.
        var clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        var focused = false;
        for (var i = 0; i < clients.length; i++) {
          if (clients[i].focused) {
            focused = true;
            try { clients[i].postMessage({ type: 'eac-push', payload: data }); } catch (_) {}
          }
        }
        if (focused) return;

        var options = {
          body: data.body || '',
          icon: 'icon-192.png',
          badge: 'favicon.png',
          data: { url: data.url || '#/' },
          vibrate: [200, 100, 200],
          tag: data.tag || 'eac-notification',
          renotify: true,
        };
        await self.registration.showNotification(data.title || 'EAC Natation', options);
      } catch (err) {
        console.error('[push-handler] showNotification failed:', err);
      }
    })()
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '#/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes('/competition/') && 'focus' in client) {
          client.focus();
          if (targetUrl.startsWith('#')) {
            client.navigate(client.url.split('#')[0] + targetUrl);
          }
          return;
        }
      }
      var base = self.registration.scope || '/competition/';
      return self.clients.openWindow(base + targetUrl);
    })
  );
});
