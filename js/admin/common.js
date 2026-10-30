/**
 * Shared helpers for the admin dashboard.
 * NOTE: kit.js dialogs append to #overlay which lives inside the (hidden) mobile #app,
 * so admin uses its own confirm/drawer/modal that append to <body>.
 */
import { icon } from '../ui/icons.js';
import { esc, el, $, $$, fmtDateTime } from '../utils.js';

export const MUSCLES = ['صدر', 'ظهر', 'رجل', 'كتف', 'دراع', 'بطن'];
export const EQUIP = ['جهاز', 'دمبل', 'بار', 'وزن الجسم'];
export const DIFFS = ['سهل', 'متوسط', 'صعب'];
export { esc, fmtDateTime };

export const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

/** Destructive confirm dialog that works inside the admin layout. */
export function confirmDlg({ title = 'هل أنت متأكد؟', message = '', confirmText = 'تأكيد', danger = true } = {}) {
  return new Promise((resolve) => {
    const backdrop = el('<div class="backdrop" style="z-index:300"></div>');
    const d = el(`<div class="dialog" role="alertdialog" aria-modal="true" style="z-index:301"><h3>${esc(title)}</h3><p>${esc(message)}</p>
      <div class="row"><button class="btn btn-outline" data-no>إلغاء</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmText)}</button></div></div>`);
    document.body.append(backdrop, d);
    const done = (v) => { document.removeEventListener('keydown', key); d.remove(); backdrop.remove(); resolve(v); };
    const key = (e) => e.key === 'Escape' && done(false);
    document.addEventListener('keydown', key);
    $('[data-yes]', d).onclick = () => done(true); $('[data-no]', d).onclick = () => done(false); backdrop.onclick = () => done(false);
    $('[data-no]', d).focus();
  });
}

/** Drawer (side panel) or modal. Returns { el, body, close }. */
function layer(kind, { title = '', html = '', wide = false, onMount, onClose } = {}) {
  const wrap = el(`<div class="adm adm-layer" dir="rtl"><div class="adm-scrim2"></div>
    <section class="adm-${kind} ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="adm-layer-head"><h2>${esc(title)}</h2><button class="icon-btn plain" data-close aria-label="إغلاق">${icon('x')}</button></header>
      <div class="adm-layer-body">${html}</div></section></div>`);
  document.body.append(wrap);
  const box = $(`.adm-${kind}`, wrap);
  let closed = false;
  const close = () => { if (closed) return; closed = true; document.removeEventListener('keydown', key); wrap.remove(); onClose?.(); };
  const key = (e) => e.key === 'Escape' && !document.querySelector('.dialog') && close();
  document.addEventListener('keydown', key);
  $('.adm-scrim2', wrap).onclick = close; $('[data-close]', wrap).onclick = close;
  const api = { el: box, body: $('.adm-layer-body', wrap), close, setBody: (h) => { $('.adm-layer-body', wrap).innerHTML = h; } };
  onMount?.(api);
  return api;
}
export const drawer = (o) => layer('drawer', o);
export const modal = (o) => layer('modal', o);

export const badge = (text, kind = 'mut') => `<span class="adm-badge ${kind}">${esc(text)}</span>`;
export const roleBadge = (r) => (r === 'admin' ? badge('مدير', 'lime') : badge('مستخدم', 'mut'));
export const statusBadge = (s) => (s ? badge('معلّق', 'red') : badge('نشط', 'green'));

/** Pagination bar. Buttons carry data-page. */
export function pager(count, page, pageSize) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const from = count ? (page - 1) * pageSize + 1 : 0, to = Math.min(count, page * pageSize);
  return `<nav class="adm-pager" aria-label="الصفحات"><span class="muted small">${from}–${to} من ${count}</span>
    <div class="adm-pager-btns"><button class="icon-btn" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="التالي">${icon('chevron')}</button>
    <span class="adm-page-num">${page} / ${pages}</span>
    <button class="icon-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="السابق">${icon('chevron', { cls: 'rtl-flip' })}</button></div></nav>`;
}

export const loading = (n = 4) => `<div class="adm-skel" aria-busy="true">${'<div class="skel" style="height:56px;margin-bottom:10px"></div>'.repeat(n)}</div>`;
export const empty = (title, text = '', ic = 'list') => `<div class="empty">${`<div class="empty-ic">${icon(ic, { size: 56, stroke: 1.4 })}</div>`}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;

export function pageHead(title, actions = '', sub = '') {
  return `<div class="adm-pagehead"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}</div><div class="adm-actions">${actions}</div></div>`;
}
export const sw = (checked, attrs = '') => `<button type="button" class="toggle" role="switch" aria-checked="${!!checked}" ${attrs}></button>`;
export function flipSwitch(t) { const v = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', String(v)); return v; }
export const avatar = (u, size = 36) => `<img class="avatar" style="width:${size}px;height:${size}px" src="${esc(u?.avatar || 'assets/img/av-1.svg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/img/av-1.svg'">`;
export const thumb = (src) => `<img class="adm-thumb" src="${esc(src || 'assets/img/ex-default.svg')}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/img/ex-default.svg'">`;
export { $, $$, el, icon };
