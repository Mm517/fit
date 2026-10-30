/**
 * Admin shell: persistent layout (right sidebar in RTL + top bar) and sub-page loader.
 * Router contract: mount(ctx) on every hash change inside /admin, unmount() on leaving.
 */
import * as api from '../data/api.js';
import { icon, logoMark } from '../ui/icons.js';
import { esc, $, $$, on } from '../utils.js';

const PAGES = {
  '': { title: 'نظرة عامة', ic: 'chart', mod: () => import('./overview.js') },
  users: { title: 'المستخدمون', ic: 'users', mod: () => import('./users.js') },
  exercises: { title: 'التمارين', ic: 'dumbbell', mod: () => import('./exercises.js') },
  templates: { title: 'قوالب الخطط', ic: 'layers', mod: () => import('./templates.js') },
  moderation: { title: 'إشراف المجتمع', ic: 'shieldCheck', mod: () => import('./moderation.js'), badge: true },
  coach: { title: 'المدرب الذكي', ic: 'spark', mod: () => import('./coach.js') },
  notifications: { title: 'الإشعارات', ic: 'broadcast', mod: () => import('./notifications.js') },
  audit: { title: 'سجل التدقيق', ic: 'history', mod: () => import('./audit.js') },
  settings: { title: 'الإعدادات', ic: 'gear', mod: () => import('./settings.js') },
  login: { title: 'تسجيل الدخول', mod: () => import('./login.js') },
};

let rootEl = null, layout = false, pageCleanup = null, unbind = [], navToken = 0;

function buildLayout(root, admin) {
  root.innerHTML = `<div class="adm" dir="rtl">
    <aside class="adm-side" id="adm-side" aria-label="القائمة الرئيسية">
      <a class="adm-brand" href="#/admin">${logoMark(40)}<span><b>FitCircle</b><small>لوحة الإدارة</small></span></a>
      <nav class="adm-nav">${Object.entries(PAGES).filter(([, p]) => p.ic).map(([k, p]) =>
        `<a href="#/admin${k ? '/' + k : ''}" data-nav="${k}">${icon(p.ic, { size: 20 })}<span>${p.title}</span>${p.badge ? '<em class="adm-count" id="adm-reports" hidden></em>' : ''}</a>`).join('')}</nav>
      <div class="adm-side-foot"><a href="#/">${icon('arrowBack', { size: 20 })}<span>العودة للتطبيق</span></a>
        <button id="adm-logout">${icon('logout', { size: 20 })}<span>تسجيل الخروج</span></button></div>
    </aside>
    <div class="adm-scrim" id="adm-scrim"></div>
    <div class="adm-main">
      <header class="adm-top"><button class="icon-btn adm-burger" id="adm-burger" aria-label="القائمة" aria-controls="adm-side">${icon('menu')}</button>
        <h1 id="adm-title"></h1><span class="adm-spacer"></span>
        <div class="adm-me"><img class="avatar" src="${esc(admin.avatar || 'assets/img/av-5.svg')}" alt="" onerror="this.style.display='none'"><span><b>${esc(admin.name)}</b><small>${esc(admin.email)}</small></span></div></header>
      <main class="adm-content" id="adm-content" tabindex="-1"></main>
    </div></div>`;
  const side = $('#adm-side', root);
  const toggle = (open) => document.body.classList.toggle('adm-nav-open', open);
  $('#adm-burger', root).onclick = () => toggle(!document.body.classList.contains('adm-nav-open'));
  $('#adm-scrim', root).onclick = () => toggle(false);
  side.addEventListener('click', (e) => { if (e.target.closest('a')) toggle(false); });
  $('#adm-logout', root).onclick = async () => { await api.adminLogout(); location.hash = '#/admin/login'; };
}

async function refreshBadge() {
  try {
    const n = (await api.adminListReports({ status: 'open' })).length, b = $('#adm-reports');
    if (b) { b.textContent = n; b.hidden = !n; }
  } catch { /* ignore */ }
}

export async function mount(ctx) {
  const my = ++navToken;
  rootEl = ctx.root;
  const key = PAGES[ctx.params.rest] ? ctx.params.rest : ctx.params.rest.split('/')[0];
  const page = PAGES[key] || PAGES[''];
  pageCleanup?.(); pageCleanup = null;
  document.querySelectorAll('.adm-layer').forEach((n) => n.remove()); // close drawers/modals left open by the previous page

  if (key === 'login') {
    layout = false; document.body.classList.remove('adm-nav-open');
    rootEl.innerHTML = '<div class="adm adm-login-wrap" dir="rtl" id="adm-content"></div>';
    const mod = await page.mod(); if (my !== navToken) return;
    pageCleanup = (await mod.default({ root: $('#adm-content', rootEl), navigate: ctx.navigate, query: ctx.query })) || null;
    return;
  }
  const admin = await api.adminSession();
  if (!admin) { location.hash = '#/admin/login'; return; }
  if (!layout || !$('#adm-content', rootEl)) { buildLayout(rootEl, admin); layout = true; }
  $$('[data-nav]', rootEl).forEach((a) => { const on = a.dataset.nav === (PAGES[key] ? key : ''); a.classList.toggle('active', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  $('#adm-title', rootEl).textContent = page.title;
  document.title = `${page.title} — إدارة FitCircle`;
  const content = $('#adm-content', rootEl);
  content.innerHTML = '<div class="adm-skel"><div class="skel" style="height:120px;margin-bottom:14px"></div><div class="skel" style="height:260px"></div></div>';
  refreshBadge();
  try {
    const mod = await page.mod(); if (my !== navToken) return;
    const holder = document.createElement('div'); holder.className = 'adm-page';
    content.replaceChildren(holder);
    const c = await mod.default({ root: holder, navigate: ctx.navigate, query: ctx.query, refreshBadge });
    if (my !== navToken) { c?.(); return; }
    pageCleanup = typeof c === 'function' ? c : null;
    content.scrollTop = 0; window.scrollTo(0, 0);
  } catch (err) {
    console.error('[admin]', err);
    content.innerHTML = `<div class="empty"><h3>حدث خطأ</h3><p>${esc(err.message || err)}</p></div>`;
  }
}

export function unmount() {
  navToken++; pageCleanup?.(); pageCleanup = null; unbind.forEach((f) => f()); unbind = [];
  document.body.classList.remove('adm-nav-open');
  if (rootEl) rootEl.innerHTML = '';
  layout = false;
}
