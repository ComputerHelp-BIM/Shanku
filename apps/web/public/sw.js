/*
 * Shanku's service worker: the app opens without internet, with the work kept on this device.
 * - The page: network first (updates arrive whenever online), else the saved copy.
 * - The app's files (hashed assets, WebAssembly, fonts, samples) and the Python runtime (jsDelivr's
 *   Pyodide): kept on first use, served from here after.
 * - Never kept: /api/ (sharing), shared models in Vercel Blob, the Revit bridge on this computer.
 */
const SHELL = 'shanku-shell-v2';
const FILES = 'shanku-files-v2';
const KEEP = [SHELL, FILES];
const MAX_FILES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

const sameOrigin = (url) => url.origin === self.location.origin;
const neverKeep = (url) =>
  (sameOrigin(url) && url.pathname.startsWith('/api/')) ||
  url.hostname.endsWith('.blob.vercel-storage.com') ||
  // the Revit bridge on this computer (another port), not Shanku itself served from localhost
  (!sameOrigin(url) && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
const keepable = (url) => sameOrigin(url) || url.hostname === 'cdn.jsdelivr.net';

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_FILES; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (neverKeep(url)) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.open(SHELL).then((c) => c.match('/')).then((r) => r || Response.error())),
    );
    return;
  }
  if (!keepable(url)) return;
  e.respondWith(
    caches.open(FILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
        void c.put(req, res.clone()).then(() => trim(c));
      }
      return res;
    }),
  );
});
