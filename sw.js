const CACHE_NAME = 'boscpwa-v1';

// The exact files and external CDN URLs our app needs to run 100% offline
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js',
  'https://cdn.jsdelivr.net/npm/@openscad/openscad-wasm@2024.1.25/dist/openscad.js',
  'https://cdn.jsdelivr.net/npm/@openscad/openscad-wasm@2024.1.25/dist/openscad.wasm'
];

// 1. Install Event: Cache all critical files locally
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches if we update version numbers
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Intercept network requests and serve from local cache instead
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached file if found, otherwise try fetching from network
      return cachedResponse || fetch(event.request);
    })
  );
});
