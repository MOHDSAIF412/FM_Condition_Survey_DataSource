// Cache application files only, never Supabase/API responses or survey data.
const CACHE = 'fm-shell-__VERSION__';
const ASSETS = __ASSETS__;
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Existing tabs may still request their old lazy chunks. Retain shell
    // caches so activating a new worker never breaks a survey in progress.
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const shell = request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html');
  if (!shell && !ASSETS.includes(url.pathname) && !url.pathname.startsWith('/assets/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (shell) {
      // Online navigation must see the deployment, not an indefinitely cached
      // home page. Offline navigation uses this build's matching HTML/chunks.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(request, { cache: 'no-store', signal: controller.signal });
        if (response.ok) return response;
      } catch { /* offline or slow network: use the complete cached build */ }
      finally { clearTimeout(timer); }
      return (await cache.match('/index.html')) || fetch(request);
    }
    const current = await cache.match(url.pathname);
    if (current) return current;
    const keys = await caches.keys();
    for (const key of keys.filter(key => key.startsWith('fm-shell-') && key !== CACHE)) {
      const previous = await (await caches.open(key)).match(url.pathname);
      if (previous) return previous;
    }
    return fetch(request);
  })());
});
