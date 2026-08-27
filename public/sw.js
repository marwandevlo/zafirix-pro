/* ZAFIRIX PRO — lightweight service worker (cache-first static assets, network-first navigations). */
const CACHE_VERSION = 'zafirix-pwa-v2';
const PRECACHE = [
  '/manifest.json',
  '/zafirix-icon-192.png',
  '/zafirix-icon-512.png',
  '/zafirix-favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  const { pathname } = url;
  if (pathname.startsWith('/_next/static/')) return true;
  if (pathname.startsWith('/_next/image')) return true;
  return /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(pathname);
}

function isCacheableStaticResponse(url, res) {
  if (!res || !res.ok || res.redirected) return false;
  const pathname = url.pathname;
  const imagePath =
    pathname.startsWith('/_next/image') || /\.(?:png|jpg|jpeg|webp|svg|ico|gif|avif)$/i.test(pathname);
  if (!imagePath) return true;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.startsWith('image/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept API / auth / Supabase — always network.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth') ||
    url.hostname.includes('supabase')
  ) {
    return;
  }

  // Same-origin only.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first with offline fallback shell hint.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>ZAFIRIX — hors ligne</title><style>body{font-family:system-ui,sans-serif;background:#0F1F3D;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center}h1{font-size:1.25rem;margin:0 0 8px}p{opacity:.8;margin:0}</style></head><body><div><h1>ZAFIRIX PRO</h1><p>Connexion indisponible. Vérifiez votre réseau puis réessayez.</p></div></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }),
    );
    return;
  }

  // Static assets: cache-first. Never cache auth redirects or HTML served at an image URL.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached && isCacheableStaticResponse(url, cached)) return cached;
        return fetch(request).then((res) => {
          if (isCacheableStaticResponse(url, res)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        });
      }),
    );
  }
});
