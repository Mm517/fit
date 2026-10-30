/* FitCircle service worker: app-shell cache + alarm notification actions. */
const VERSION = 'fc-shell-v4';
const SHELL = [
  './', 'index.html', 'manifest.json',
  'css/app.css', 'css/home.css', 'css/pages.css', 'css/admin.css', 'css/desktop.css',
  'js/main.js', 'js/router.js', 'js/utils.js', 'js/config.js', 'js/alarm.js',
  'js/data/api.js', 'js/data/mock.js', 'js/data/seed.js', 'js/ui/icons.js', 'js/ui/kit.js', 'js/ui/nav.js', 'js/ui/install.js', 'js/ui/people.js', 'js/ui/stories.js', 'js/ui/inbox.js', 'js/ai/nutrition.js', 'js/pages/nutrition.js',
  'js/ai/coach.js', 'js/ai/tools.js', 'js/pages/alarms.js', 'js/pages/coach.js', 'js/pages/community.js', 'js/pages/exercise.js', 'js/pages/home.js', 'js/pages/login.js', 'js/pages/plan.js', 'js/pages/profile.js', 'js/pages/settings.js', 'js/pages/user.js', 'js/pages/messages.js', 'js/pages/chat.js', 'js/pages/wake.js', 'js/pages/workouts.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/img/ex-default.svg',
];

self.addEventListener('install', (e) => {
  // addAll would fail the whole install if one file 404s, so cache one by one
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// stale-while-revalidate for same-origin GETs (+ Google Fonts); never cache API calls to other origins
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !fonts) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
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
