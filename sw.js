// Service worker: guarda la app para usarla sin conexión.
// Al publicar cambios, sube el número de versión para forzar la actualización.
const VERSION = 'calc-nom-v12';
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
const ARCHIVOS = [
  './', './index.html', './admin.html', './config.js', './license.js', './circuitos.js', './unifilar.js',
  './manifest.webmanifest', './logo.png', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', SUPABASE_CDN
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) =>
    Promise.all(ARCHIVOS.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Las llamadas a Supabase siempre van a la red (la validación de licencia no se guarda).
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;
  const propio = url.origin === location.origin || req.url === SUPABASE_CDN;
  if (!propio) return;
  // Primero lo guardado, y en segundo plano se actualiza.
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const guardado = await c.match(req, { ignoreSearch: true });
    const red = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (guardado) { e.waitUntil(red); return guardado; }
    const r = await red;
    return r || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
  }));
});
