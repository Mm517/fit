/** Bottom navigation: الرئيسية، التمارين، المدرب (raised center), المجتمع، حسابي */
import { icon } from './icons.js';

const ITEMS = [
  { key: 'home', href: '#/', label: 'الرئيسية', ic: 'home' },
  { key: 'workouts', href: '#/workouts', label: 'التمارين', ic: 'dumbbell' },
  { key: 'coach', href: '#/coach', label: 'المدرب', ic: 'spark' },
  { key: 'community', href: '#/community', label: 'المجتمع', ic: 'users' },
  { key: 'profile', href: '#/profile', label: 'حسابي', ic: 'user' },
];

export function renderNav(host, active) {
  host.innerHTML = `<nav class="nav-bar" aria-label="التنقل الرئيسي">${ITEMS.map((i) => i.key === 'coach'
    ? `<a class="nav-item coach ${active === i.key ? 'active' : ''}" href="${i.href}" aria-label="${i.label}" ${active === i.key ? 'aria-current="page"' : ''}>
         <span class="nav-coach-btn">${icon('spark', { size: 30 })}</span><span class="lbl">${i.label}</span></a>`
    : `<a class="nav-item ${active === i.key ? 'active' : ''}" href="${i.href}" ${active === i.key ? 'aria-current="page"' : ''}>${icon(i.ic, { size: 24 })}<span>${i.label}</span></a>`).join('')}</nav>`;
}
