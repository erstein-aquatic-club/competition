// public/push-handler.js
// Imported by the Workbox-generated service worker via importScripts.
// Handles Web Push events and notification clicks.

// §194 Vague C — duplique la logique pure de `src/lib/pushHelpers.ts`
// (le SW est servi en JS classique, pas de bundling).
function extractHashPath(url) {
  if (!url) return '';
  var hashPart;
  var hashIndex = url.indexOf('#');
  if (hashIndex >= 0) {
    hashPart = url.substring(hashIndex + 1);
  } else if (url.charAt(0) === '/') {
    hashPart = url;
  } else {
    return '';
  }
  var queryIndex = hashPart.indexOf('?');
  return queryIndex >= 0 ? hashPart.substring(0, queryIndex) : hashPart;
}

function pushTargetMatchesClient(clientUrl, targetUrl) {
  var clientPath = extractHashPath(clientUrl);
  var targetPath = extractHashPath(targetUrl);
  if (!clientPath || !targetPath) return false;
  var normClient = clientPath.length > 1 && clientPath.charAt(clientPath.length - 1) === '/'
    ? clientPath.substring(0, clientPath.length - 1)
    : clientPath;
  var normTarget = targetPath.length > 1 && targetPath.charAt(targetPath.length - 1) === '/'
    ? targetPath.substring(0, targetPath.length - 1)
    : targetPath;
  return normClient === normTarget;
}

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
        // §194 Vague C — gate "focused" contextuel : on ne supprime la notif
        // OS que si un client focused est DÉJÀ sur la page ciblée par
        // data.url. Sinon on l'affiche, même si un autre onglet est ouvert.
        // Le postMessage est envoyé à tous les clients focused (le pont §180
        // déclenche un toast + invalide les caches).
        var clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        var anyFocusedSamePage = false;
        for (var i = 0; i < clients.length; i++) {
          var c = clients[i];
          if (c.focused) {
            try { c.postMessage({ type: 'eac-push', payload: data }); } catch (_) {}
            if (pushTargetMatchesClient(c.url, data.url || '')) {
              anyFocusedSamePage = true;
            }
          }
        }
        if (anyFocusedSamePage) return;

        var options = {
          body: data.body || '',
          icon: 'icon-192.png',
          badge: 'favicon.png',
          data: { url: data.url || '#/' },
          vibrate: [200, 100, 200],
          // §194 Vague C — tag par notif (envoyé par push-send) au lieu du
          // tag partagé 'eac-notification' qui faisait écraser les notifs
          // rapprochées dans le tray OS. Fallback inchangé.
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
