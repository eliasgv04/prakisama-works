// Service worker de Prakisama Works (lo procesa scripts/vite-plugin-sw.mjs al hacer el build).
//
// Qué hace:
//  - Precachea la app shell (HTML, JS, CSS, iconos) para que la app abra sin conexión.
//  - Navegaciones: red primero (con tiempo máximo) y, si falla, la app shell en caché.
//  - Estáticos del mismo origen: caché primero.
//  - Peticiones a Supabase (otro origen): SIEMPRE a la red. No se cachean datos aquí (sin modo
//    offline de lectura en esta app: las obras se consultan siempre en vivo).

const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `works-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', ...PRECACHE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('works-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function navigate(request) {
  const cache = await caches.open(CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put('index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
  }
}

// Solo estáticos de la app. Las peticiones fetch()/XHR (destination "") van siempre a la red.
const STATIC_DESTINATIONS = new Set(['script', 'style', 'image', 'font', 'manifest', 'worker']);

async function staticAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return; // Supabase y demás: red directa
  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (STATIC_DESTINATIONS.has(request.destination)) event.respondWith(staticAsset(request));
});
