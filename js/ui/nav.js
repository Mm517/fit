/**
 * Navigation. ONE render, TWO presentations (CSS decides):
 *   - phones  : bottom bar — الرئيسية، التمارين، المدرب (raised center), المجتمع، حسابي
 *   - desktop : right-hand sidebar with every section (+ التغذية, الرسائل, and the admin entry for admins only)
 */
import { icon, logoMark } from './icons.js';
import * as api from '../data/api.js';

const BAR = [
  { key: 'home', href: '#/', label: 'الرئيسية', ic: 'home' },
  { key: 'workouts', href: '#/workouts', label: 'التمارين', ic: 'dumbbell' },
  { key: 'coach', href: '#/coach', label: 'المدرب', ic: 'spark' },
  { key: 'community', href: '#/community', label: 'المجتمع', ic: 'users' },
  { key: 'profile', href: '#/profile', label: 'حسابي', ic: 'user' },
];
const SIDE = [
  { key: 'home', href: '#/', label: 'الرئيسية', ic: 'home' },
  { key: 'workouts', href: '#/workouts', label: 'التمارين', ic: 'dumbbell' },
  { key: 'nutrition', href: '#/nutrition', label: 'التغذية', ic: 'apple' },
  { key: 'coach', href: '#/coach', label: 'المدرب الذكي', ic: 'spark' },
  { key: 'community', href: '#/community', label: 'المجتمع', ic: 'users' },
  { key: 'messages', href: '#/messages', label: 'الرسائل', ic: 'message', badge: true },
  { key: 'profile', href: '#/profile', label: 'حسابي', ic: 'user' },
  { key: 'settings', href: '#/settings', label: 'الإعدادات', ic: 'gear' },
];

export function renderNav(host, active, { admin = false } = {}) {
  const barActive = active === 'messages' || active === 'nutrition' ? (active === 'messages' ? 'community' : '') : active === 'settings' ? 'profile' : active;
  const bar = `<nav class="nav-bar" aria-label="التنقل الرئيسي">${BAR.map((i) => i.key === 'coach'
    ? `<a class="nav-item coach ${barActive === i.key ? 'active' : ''}" href="${i.href}" aria-label="${i.label}" ${barActive === i.key ? 'aria-current="page"' : ''}>
         <span class="nav-coach-btn">${icon('spark', { size: 30 })}</span><span class="lbl">${i.label}</span></a>`
    : `<a class="nav-item ${barActive === i.key ? 'active' : ''}" href="${i.href}" ${barActive === i.key ? 'aria-current="page"' : ''}>${icon(i.ic, { size: 24 })}<span>${i.label}</span></a>`).join('')}</nav>`;

  const side = `<aside class="side-nav" aria-label="القائمة الرئيسية">
      <a class="side-brand" href="#/">${logoMark(42)}<span><b>FitCircle</b><small>معاً نحو نسخة أفضل منك</small></span></a>
      <nav class="side-links">${SIDE.map((i) => `<a class="side-link ${active === i.key ? 'active' : ''}" href="${i.href}" ${active === i.key ? 'aria-current="page"' : ''}>${icon(i.ic, { size: 22 })}<span>${i.label}</span>${i.badge ? '<em class="side-badge" id="side-unread" hidden></em>' : ''}</a>`).join('')}</nav>
      ${admin ? `<a class="side-link side-admin" href="#/admin">${icon('shield', { size: 22 })}<span>لوحة الإدارة</span></a>` : ''}
    </aside>`;
  host.innerHTML = bar + side;

  // unread-message badge (sidebar). Failure is harmless.
  api.unreadMessageCount().then((n) => { const b = host.querySelector('#side-unread'); if (b && n) { b.textContent = n > 9 ? '9+' : n; b.hidden = false; } }).catch(() => {});
}
