// 高爾夫攻略測距 — 離線用 service worker
// 程式本體：先抓網路（才拿得到更新），沒網路用快取
// 地圖程式庫、圖示：快取優先
// 正射影像圖磚：快取優先，看過或下載過的都會留著
const SHELL = 'golf-shell-v4';
const TILES = 'golf-tiles-v1';
const SHELL_FILES = ['./', './index.html', './leaflet.js', './leaflet.css', './leaflet-rotate.js',
  './manifest.webmanifest', './apple-touch-icon.png', './icon-512.png'];
const TILE_HOSTS = ['wmts.nlsc.gov.tw', 'server.arcgisonline.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('golf-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const r = await fetch(req);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? await c.match('./index.html') : undefined) ||
      new Response('', { status: 504 });
  }
}

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const r = await fetch(req);
    if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()).catch(() => {});
    return r;
  } catch (e) {
    return new Response('', { status: 504 });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname === 'api.github.com') return;                 // 同步不快取
  if (TILE_HOSTS.includes(u.hostname)) { e.respondWith(cacheFirst(req, TILES)); return; }
  if (u.origin === self.location.origin) {
    const p = u.pathname;
    if (req.mode === 'navigate' || p.endsWith('/') || p.endsWith('.html') || /course[^/]*\.json$/.test(p) || p.endsWith('.webmanifest')) {
      e.respondWith(networkFirst(req));
    } else {
      e.respondWith(cacheFirst(req, SHELL));
    }
  }
});
