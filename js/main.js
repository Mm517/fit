/** FitCircle boot: apply brand settings → register SW → start alarm engine → start router. */
import * as api from './data/api.js';
import { startRouter, navigate } from './router.js';
import { startAlarmEngine } from './alarm.js';
import { toast } from './ui/kit.js';

/** Brand color + app name come from admin "Settings" (app_settings.app). */
async function applyBrand() {
  try {
    const s = await api.getAppSettings();
    if (!s) return;
    if (/^#[0-9a-f]{6}$/i.test(s.brand_color || '')) {
      const h = s.brand_color, root = document.documentElement.style;
      root.setProperty('--lime', h);
      root.setProperty('--lime-rgb', [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', '));
    }
    window.__fcSettings = s;
  } catch (e) { console.warn('[brand]', e); }
}

/** Mock-mode "push": show admin broadcasts created while the app is open / since last visit. */
async function pollBroadcasts() {
  const KEY = 'fc:notif-seen';
  const since = localStorage.getItem(KEY) || new Date(Date.now() - 60000).toISOString();
  try {
    const list = await api.unseenNotifications(since);
    list.forEach((n) => toast(`${n.title} — ${n.body}`));
    localStorage.setItem(KEY, new Date().toISOString());
  } catch { /* signed out */ }
}

async function boot() {
  await applyBrand();
  if ('serviceWorker' in navigator) {
    // sw.js lives at the project root so its scope covers the whole app
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
  }
  await startRouter();
  if (await api.currentUser()) {
    startAlarmEngine(navigate);
    pollBroadcasts(); setInterval(pollBroadcasts, 20000);
  }
}
boot();
