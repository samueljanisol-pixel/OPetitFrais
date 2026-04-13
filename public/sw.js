self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Network-only: pas de cache → pas d'offline.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

