/**
 * Shared UI kit: toast, bottom sheet, confirm dialog, skeletons, empty state, stepper, toggle,
 * progress ring, page header. Everything returns HTML strings or small controllers — no framework.
 */
import { icon } from './icons.js';
import { esc, el, $, $$ } from '../utils.js';

// ---------------------------------------------------------------- toast
export function toast(message = 'تم حفظ التغييرات بنجاح', { type = 'success', ms = 2600 } = {}) {
  let host = $('#toasts');
  if (!host) { host = el('<div id="toasts" role="status" aria-live="polite"></div>'); document.body.append(host); }
  const t = el(`<div class="toast ${type}"><span>${esc(message)}</span><span class="t-ic">${icon(type === 'error' ? 'x' : 'checkCircle', { size: 24 })}</span></div>`);
  host.append(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  setTimeout(kill, ms);
  t.addEventListener('click', kill);
  return t;
}

// ---------------------------------------------------------------- bottom sheet
/**
 * openSheet({ title, html, onMount(sheetEl, close), onClose })
 * Returns { el, close }. Closes on backdrop tap, Escape, or the X button.
 */
export function openSheet({ title = '', html = '', onMount, onClose, back = false } = {}) {
  const host = $('#overlay') || document.body;
  const backdrop = el('<div class="backdrop"></div>');
  const sheet = el(`<section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grab"></div>
    <div class="sheet-head">
      ${back ? `<button class="icon-btn plain" data-close aria-label="رجوع">${icon('arrow', { cls: 'rtl-flip' })}</button>` : '<span style="width:44px"></span>'}
      <h3>${esc(title)}</h3>
      <button class="icon-btn plain" data-close aria-label="إغلاق">${icon('x')}</button>
    </div>
    <div class="sheet-body">${html}</div></section>`);
  host.append(backdrop, sheet);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    sheet.classList.add('closing'); backdrop.style.opacity = '0'; backdrop.style.transition = 'opacity .2s';
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { sheet.remove(); backdrop.remove(); onClose?.(); }, 210);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);
  $$('[data-close]', sheet).forEach((b) => b.addEventListener('click', close));
  onMount?.(sheet, close);
  return { el: sheet, close };
}

// ---------------------------------------------------------------- confirm dialog
/** await confirmDialog({ title, message, confirmText, danger }) -> boolean */
export function confirmDialog({ title = 'هل أنت متأكد؟', message = '', confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false } = {}) {
  return new Promise((resolve) => {
    const host = $('#overlay') || document.body;
    const backdrop = el('<div class="backdrop" style="z-index:110"></div>');
    const d = el(`<div class="dialog" role="alertdialog" aria-modal="true" style="z-index:111"><h3>${esc(title)}</h3><p>${esc(message)}</p>
      <div class="row"><button class="btn btn-outline" data-no>${esc(cancelText)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirmText)}</button></div></div>`);
    host.append(backdrop, d);
    const done = (v) => { document.removeEventListener('keydown', onKey); d.remove(); backdrop.remove(); resolve(v); };
    const onKey = (e) => e.key === 'Escape' && done(false);
    document.addEventListener('keydown', onKey);
    $('[data-yes]', d).addEventListener('click', () => done(true));
    $('[data-no]', d).addEventListener('click', () => done(false));
    backdrop.addEventListener('click', () => done(false));
    $('[data-yes]', d).focus();
  });
}

// ---------------------------------------------------------------- skeleton / empty
/** skeleton('card', 3) | skeleton('row', 4) | skeleton('exercise', 4) */
export function skeleton(kind = 'card', n = 3) {
  const one = {
    card: '<div class="skel skel-card"></div>',
    row: '<div class="skel" style="height:64px;margin-bottom:10px"></div>',
    exercise: '<div class="skel" style="height:118px;border-radius:22px;margin-bottom:12px"></div>',
    post: '<div class="skel" style="height:300px;border-radius:22px;margin-bottom:14px"></div>',
  }[kind];
  return `<div aria-busy="true" aria-label="جارٍ التحميل">${one.repeat(n)}</div>`;
}
/** emptyState({ icon:'dumbbell', title, text, action:'إضافة تمرين', actionId:'add' }) */
export function emptyState({ icon: ic = 'dumbbell', title = 'لا توجد تمارين بعد', text = '', action = '', actionId = 'empty-action' } = {}) {
  return `<div class="empty">
    <div class="empty-ic">${icon(ic, { size: 64, stroke: 1.4 })}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
    ${action ? `<button class="btn btn-primary" data-act="${actionId}">${icon('plus', { size: 18 })} ${esc(action)}</button>` : ''}</div>`;
}

// ---------------------------------------------------------------- controls
/** <button role=switch> — wire clicks yourself or use bindToggles(root, onChange). */
export const toggle = (checked, attrs = '') => `<button type="button" class="toggle" role="switch" aria-checked="${!!checked}" ${attrs}></button>`;
export function bindToggles(root, onChange) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.toggle'); if (!t || !root.contains(t)) return;
    const v = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', String(v));
    onChange?.(t, v);
  });
}
/** Numeric stepper. name is used by readSteppers(). */
export function stepper({ name, value = 0, min = 0, max = 999, step = 1, label = '' }) {
  return `<div class="stepper" data-stepper="${esc(name)}" data-min="${min}" data-max="${max}" data-step="${step}" data-value="${value}" ${label ? `aria-label="${esc(label)}"` : ''}>
    <button type="button" data-dir="1" aria-label="زيادة">${icon('plus', { size: 18 })}</button><output>${value}</output>
    <button type="button" data-dir="-1" aria-label="إنقاص">${icon('minus', { size: 18 })}</button></div>`;
}
export function bindSteppers(root, onChange) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.stepper [data-dir]'); if (!b) return;
    const s = b.closest('.stepper'), min = +s.dataset.min, max = +s.dataset.max, st = +s.dataset.step;
    const v = Math.min(max, Math.max(min, +s.dataset.value + st * +b.dataset.dir));
    s.dataset.value = v; $('output', s).textContent = v; onChange?.(s.dataset.stepper, v);
  });
}
export const readSteppers = (root) => Object.fromEntries($$('.stepper', root).map((s) => [s.dataset.stepper, +s.dataset.value]));
export function setStepper(root, name, v) { const s = $(`.stepper[data-stepper="${name}"]`, root); if (s) { s.dataset.value = v; $('output', s).textContent = v; } }

/** Progress ring (lime, glowing). percent 0-100. */
export function ring(percent, { size = 96, stroke = 10, label = true } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${percent}%">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="prog" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - percent / 100)}"/></svg>
    ${label ? `<span class="ring-label num">${percent}%</span>` : ''}</div>`;
}

/** Standard page header. back: hash to go back to. actions: html. */
export function pageHeader({ title, back = '', actions = '', center = false }) {
  return `<header class="page-head ${center ? 'center' : ''}">
    ${back ? `<a class="icon-btn plain" href="${back}" aria-label="رجوع">${icon('arrowBack', { size: 24 })}</a>` : ''}
    <h1>${esc(title)}</h1>${actions}</header>`;
}

/** Image with graceful fallback (placeholder svg if the file/url is missing or broken). */
export const img = (src, alt = '', cls = '', fallback = 'assets/img/ex-default.svg') =>
  `<img class="${cls}" src="${esc(src || fallback)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${fallback}'">`;
