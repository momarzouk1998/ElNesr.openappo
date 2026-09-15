// Service Worker for PWA installability and lifecycle
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('Network Error', { status: 503, statusText: 'Service Unavailable' });
    })
  );
});
