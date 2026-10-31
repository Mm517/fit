/* FitCircle service worker: reliable app shell + alarm notification actions.
 *
 * Strategy (fixes "Failed to fetch dynamically imported module"):
 *   - code (HTML / JS / CSS / JSON of THIS site): NETWORK-FIRST, 4 s timeout, cache fallback → a new deployment is picked up
 *     immediately and an old cached file can never be mixed with new ones; offline still works from the cache.
 *   - images / icons / fonts: cache-first (they rarely change), refreshed in the background.
 *   - the service worker never answers with `undefined` (that is what produced the failed module import before).
 *   - Supabase / AI / other origins are never cached.
 */
const VERSION = 'fc-shell-v5';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/app.css', 'css/home.css', 'css/pages.css', 'css/admin.css', 'css/desktop.css',
  'js/main.js', 'js/router.js', 'js/utils.js', 'js/config.js', 'js/alarm.js', 'js/media.js',
  'js/data/api.js', 'js/data/mock.js', 'js/data/seed.js', 'js/data/supabase.js',
  'js/ui/icons.js', 'js/ui/kit.js', 'js/ui/nav.js', 'js/ui/net.js', 'js/ui/install.js', 'js/ui/people.js', 'js/ui/stories.js', 'js/ui/reels.js', 'js/ui/composer.js', 'js/ui/mediaUpload.js', 'js/ui/inbox.js',
  'js/ai/coach.js', 'js/ai/tools.js', 'js/ai/nutrition.js',
  'js/pages/alarms.js', 'js/pages/chat.js', 'js/pages/coach.js', 'js/pages/community.js', 'js/pages/exercise.js', 'js/pages/home.js', 'js/pages/login.js', 'js/pages/messages.js', 'js/pages/nutrition.js', 'js/pages/plan.js', 'js/pages/profile.js', 'js/pages/reels.js', 'js/pages/settings.js', 'js/pages/user.js', 'js/pages/wake.js', 'js/pages/workouts.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/img/ex-default.svg',
];

self.addEventListener('install', (e) => {
  // add one by one: a single 404 must not fail the whole install
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isCode = (url, req) => req.mode === 'navigate' || /\.(?:js|css|json|html)$/.test(url.pathname) || url.pathname.endsWith('/');
const withTimeout = (p, ms) => new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('timeout')), ms); p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); }); });

async function networkFirst(req, cache) {
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    if (req.mode === 'navigate') { const shell = (await cache.match('index.html')) || (await cache.match('./')); if (shell) return shell; }
    return Response.error(); // a real network error (never `undefined`)
  }
}
async function cacheFirst(req, cache) {
  const hit = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { net.catch(() => null); return hit; }
  try { return await net; } catch { return Response.error(); }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return; // Supabase, AI, esm.sh … go straight to the network
  if (req.headers.has('range')) return; // let the browser stream videos itself
  e.respondWith(caches.open(VERSION).then((cache) => (sameOrigin && isCode(url, req) ? networkFirst(req, cache) : cacheFirst(req, cache))));
});

// ---------------------------------------------------------------- alarm notifications
async function tellClients(msg) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
  return list;
}
self.addEventListener('notificationclick', (e) => {
  const { action } = e; const data = e.notification.data || {};
  e.notification.close();
  e.waitUntil((async () => {
    if (action === 'awake' || action === 'snooze') {
      const clients = await tellClients({ type: 'alarm-action', action, alarmId: data.alarmId });
      // no open app window: open one that applies the action on load
      if (!clients.length) await self.clients.openWindow(`./#/wake/${data.alarmId}?do=${action}`);
      return;
    }
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (list.length) { await list[0].focus(); list[0].navigate?.(data.url || './#/'); } else await self.clients.openWindow(data.url || './#/');
  })());
});

/**
 * Best-effort repeat: while the notification is still on screen, re-show it every `repeatMs`.
 * Browsers may stop a service worker early; the in-page engine (alarm.js) is the primary repeater.
 */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'alarm-ring') return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  e.waitUntil((async () => {
    for (let i = 0; i < 2; i++) {
      await wait(e.data.repeatMs || 120000);
      const open = await self.registration.getNotifications({ tag: 'fc-alarm' });
      if (!open.length) return; // dismissed
      const n = open[0];
      await self.registration.showNotification('ما زال المنبه يرن!', { body: n.body, tag: 'fc-alarm', renotify: true, requireInteraction: true, dir: 'rtl', lang: 'ar', icon: n.icon, actions: n.actions, data: n.data, vibrate: [300, 150, 300] });
    }
  })());
});
