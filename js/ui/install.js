/** PWA install banner (reference screenshot 12) — shown on Home until installed or dismissed. */
import { icon, logoMark } from './icons.js';
import { openSheet } from './kit.js';
import { $ } from '../utils.js';

const KEY = 'fc:install-dismissed';
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem(KEY, '1'); } catch { /* */ } });

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const dismissed = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export const shouldShowInstall = () => !isStandalone() && !dismissed();

export function installBannerHTML() {
  return `<section class="card card--lime install-banner" id="install-banner" aria-label="تثبيت التطبيق">
    <button class="icon-btn plain ib-close" data-install-close aria-label="إغلاق">${icon('x', { size: 20 })}</button>
    <div class="ib-text"><b>تثبيت FitCircle</b><span class="muted">للوصول السريع للتطبيق</span></div>
    ${logoMark(64)}
    <button class="btn btn-primary btn-block" data-install>ثبّت</button></section>`;
}

export function bindInstallBanner(root) {
  const b = $('#install-banner', root); if (!b) return;
  $('[data-install-close]', b).addEventListener('click', () => { try { localStorage.setItem(KEY, '1'); } catch { /* */ } b.remove(); });
  $('[data-install]', b).addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; b.remove(); return; }
    openSheet({ title: 'تثبيت التطبيق', html: `<div style="display:grid;gap:12px;padding-bottom:6px">
      <p><b>أندرويد (Chrome):</b> اضغط ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
      <p><b>آيفون (Safari):</b> اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</p></div>` });
  });
}
