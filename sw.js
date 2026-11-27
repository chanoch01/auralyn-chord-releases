/*
 * Auralyn Chord, web version: keeps the app working with no connection once it
 * has been opened. Only this site's own files are cached, and only when they
 * are asked for (the bundled sounds are large, so each is kept after its first
 * use rather than all downloaded up front).
 *
 *  - The page itself: fresh from the network when there is one, the kept copy
 *    when there is not.
 *  - Program files, sounds and icons: the kept copy first (their names change
 *    whenever their contents do, and a new app version starts a new store).
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || '0';
const PREFIX = 'auralyn-chord-';
const STORE = PREFIX + VERSION;
const KEPT = /\/(assets|sounds)\/|\.(svg|png|webmanifest)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Stores left by older versions of the app.
      for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== STORE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function keep(request, response) {
  // Whole, successful answers only: never a partial (range) answer or an error page.
  if (response && response.status === 200 && response.type === 'basic') {
    const store = await caches.open(STORE);
    await store.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // other sites are never touched

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await keep(request, await fetch(request));
        } catch {
          const store = await caches.open(STORE);
          return (await store.match(request, { ignoreSearch: true })) || (await store.match(new URL('./', self.registration.scope).href)) || Response.error();
        }
      })(),
    );
    return;
  }

  if (KEPT.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const store = await caches.open(STORE);
        return (await store.match(request)) || keep(request, await fetch(request));
      })(),
    );
  }
});
