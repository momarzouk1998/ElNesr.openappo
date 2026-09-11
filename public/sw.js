// Service Worker for PWA installability and lifecycle
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch handler for Chrome PWA criteria
  event.respondWith(fetch(event.request));
});
