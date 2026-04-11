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

  var options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'favicon.png',
    data: { url: data.url || '#/' },
    vibrate: [200, 100, 200],
    tag: data.tag || 'eac-notification',
    renotify: true,
  };

  var title = data.title || 'EAC Natation';

  event.waitUntil(
    (async function() {
      try {
        await self.registration.showNotification(title, options);
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
