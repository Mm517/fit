/**
 * Hash router.
 *
 * Page contract (user pages):
 *   export default async function page(ctx) { ctx.root.innerHTML = …; …; return cleanupFn? }
 *   ctx = { params, query, root, navigate(hash) }
 *   `root` is a fresh <div> per navigation, so late async writes after leaving are harmless.
 *
 * Admin contract (#/admin/*): js/admin/shell.js exports
 *   mount(ctx)   – called on EVERY hash change inside /admin (render/keep layout, show sub page)
 *   unmount()    – called when leaving /admin
 *   ctx.params.rest = 'users' | 'exercises' | … ('' = overview, 'login' = login screen)
 */
import { renderNav } from './ui/nav.js';
import { $ } from './utils.js';
import * as api from './data/api.js';
import { toast } from './ui/kit.js';

/** nav: which tab is highlighted; false hides the nav everywhere; mobileNav:false hides only the phone bottom bar (the desktop sidebar stays);
 *  full: no padding (full-bleed page); layout:'msgr-view' = full-height messenger layout */
const ROUTES = [
  { re: /^\/$/, load: () => import('./pages/home.js'), nav: 'home' },
  { re: /^\/workouts$/, load: () => import('./pages/workouts.js'), nav: 'workouts' },
  { re: /^\/exercise\/([^/]+)$/, keys: ['id'], load: () => import('./pages/exercise.js'), nav: 'workouts' },
  { re: /^\/plan$/, load: () => import('./pages/plan.js'), nav: 'workouts' },
  { re: /^\/coach$/, load: () => import('./pages/coach.js'), nav: 'coach' },
  { re: /^\/alarms$/, load: () => import('./pages/alarms.js'), nav: 'home' },
  { re: /^\/wake\/([^/]+)$/, keys: ['id'], load: () => import('./pages/wake.js'), nav: false, full: true },
  { re: /^\/community$/, load: () => import('./pages/community.js'), nav: 'community' },
  { re: /^\/user\/([^/]+)$/, keys: ['id'], load: () => import('./pages/user.js'), nav: 'community' },
  { re: /^\/nutrition$/, load: () => import('./pages/nutrition.js'), nav: 'nutrition' },
  { re: /^\/messages$/, load: () => import('./pages/messages.js'), nav: 'messages', layout: 'msgr-view' },
  { re: /^\/chat\/([^/]+)$/, keys: ['id'], load: () => import('./pages/chat.js'), nav: 'messages', layout: 'msgr-view', mobileNav: false },
  { re: /^\/profile$/, load: () => import('./pages/profile.js'), nav: 'profile' },
  { re: /^\/settings$/, load: () => import('./pages/settings.js'), nav: 'profile' },
  { re: /^\/login$/, load: () => import('./pages/login.js'), nav: false },
];

let cleanup = null, inAdmin = false, adminShell = null, token = 0;

export const navigate = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

export function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

export async function route() {
  const my = ++token;
  const { path, query } = parseHash();
  const app = $('#view'), navHost = $('#nav');

  // ---------------- admin area ----------------
  if (path === '/admin' || path.startsWith('/admin/')) {
    const rest = path.replace(/^\/admin\/?/, '');
    if (rest !== 'login' && !(await api.adminSession())) { // admin guard: a confirmed admin e-mail only (checked by the database)
      const signedIn = api.backend === 'supabase' && (await api.currentUser());
      if (signedIn) toast('هذه الصفحة للمشرفين فقط', { type: 'error' });
      location.hash = signedIn ? '#/' : '#/admin/login'; return;
    }
    if (my !== token) return;
    cleanup?.(); cleanup = null;
    document.body.classList.add('is-admin');
    document.title = 'FitCircle — لوحة الإدارة';
    adminShell ||= await import('./admin/shell.js');
    inAdmin = true;
    await adminShell.mount({ params: { rest }, query, root: $('#admin-root'), navigate });
    return;
  }
  if (inAdmin) { adminShell?.unmount?.(); inAdmin = false; document.body.classList.remove('is-admin'); }
  document.title = 'FitCircle — فِت سيركل';

  // ---------------- user app ----------------
  const user = await api.currentUser();
  if (!user && path !== '/login') { location.hash = '#/login'; return; }
  if (user?.suspended) { app.innerHTML = '<div class="empty" style="padding-top:30vh"><h3>تم تعليق حسابك</h3><p>تواصل مع الدعم لمزيد من المعلومات.</p></div>'; navHost.classList.add('hidden'); return; }

  let match = null, params = {};
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) { match = r; (r.keys || []).forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; }
  }
  if (!match) { location.hash = '#/'; return; }

  cleanup?.(); cleanup = null;
  const root = document.createElement('div');
  root.className = 'page-enter';
  app.replaceChildren(root);
  app.className = match.full ? 'fullscreen' : match.layout || (match.nav === false ? 'no-nav' : '');
  app.dataset.page = match.nav || 'bare';
  navHost.classList.toggle('mobile-hidden', match.mobileNav === false);
  if (match.nav === false) navHost.classList.add('hidden');
  else { navHost.classList.remove('hidden'); renderNav(navHost, match.nav, { admin: await api.isAdmin().catch(() => false) }); }
  window.scrollTo(0, 0);

  try {
    const mod = await match.load();
    if (my !== token) return;
    const c = await mod.default({ params, query, root, navigate });
    if (my !== token) { c?.(); return; }
    cleanup = typeof c === 'function' ? c : null;
  } catch (err) {
    console.error('[router]', err);
    root.innerHTML = `<div class="empty"><h3>حدث خطأ غير متوقع</h3><p>${String(err.message || err)}</p><a class="btn btn-primary" href="#/">العودة للرئيسية</a></div>`;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', route);
  return route();
}
