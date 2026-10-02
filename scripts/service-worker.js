// Cache application files only, never Supabase/API responses or survey data.
const CACHE = 'fm-shell-__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  // Existing tabs keep their matching chunks until closed: no skipWaiting.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('fm-shell-') && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const shell = request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
  if (!shell && !ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(shell ? '/index.html' : url.pathname)) || fetch(request);
  })());
});
