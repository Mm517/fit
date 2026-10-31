/**
 * Full-screen REELS viewer: vertical scroll-snap, one video plays at a time, tap = pause, like / mute / delete (own).
 *   openReelViewer({ reels, startIndex, meId, navigate, onClose, onChange })
 * Videos are already compressed at upload time; `src` is only attached to the visible reel and its neighbours (saves data).
 */
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { toast, confirmDialog, img } from './kit.js';
import { esc, el, $, timeAgo } from '../utils.js';

let muted = false; // remembered between reels

export function openReelViewer({ reels, startIndex = 0, meId, navigate, onClose, onChange }) {
  const list = [...reels];
  if (!list.length) return null;
  const host = $('#overlay') || document.body;
  const root = el(`<div class="rl" role="dialog" aria-modal="true" aria-label="الريلز">
    <button class="icon-btn rl-x" aria-label="إغلاق">${icon('x', { size: 24 })}</button>
    <div class="rl-list" tabindex="-1"></div></div>`);
  host.append(root);
  document.body.style.overflow = 'hidden';
  const box = $('.rl-list', root);
  let closed = false;

  const itemHTML = (r, i) => `<section class="rl-item" data-i="${i}" data-id="${esc(r.id)}">
    <video class="rl-vid" playsinline loop preload="none" poster="${esc(r.poster || '')}" ${muted ? 'muted' : ''}></video>
    <div class="rl-shade"></div>
    <div class="rl-play" aria-hidden="true">${icon('play', { size: 56 })}</div>
    <div class="rl-rail">
      <button class="rl-btn ${r.liked ? 'on' : ''}" data-like aria-pressed="${!!r.liked}" aria-label="إعجاب">${icon(r.liked ? 'heartFill' : 'heart', { size: 30 })}<span class="num">${r.likes || 0}</span></button>
      <button class="rl-btn" data-mute aria-label="الصوت">${icon(muted ? 'volumeOff' : 'volume', { size: 28 })}</button>
      ${r.mine ? `<button class="rl-btn" data-del aria-label="حذف الريل">${icon('trash', { size: 26 })}</button>` : ''}
    </div>
    <footer class="rl-info"><a class="rl-who" href="#/user/${esc(r.author?.id || r.user_id)}" data-who>${img(r.author?.avatar, r.author?.name, 'avatar rl-av', 'assets/img/av-1.svg')}<span><b>${esc(r.author?.name || '')}</b><small>${timeAgo(r.created_at)}</small></span></a>
      ${r.caption ? `<p class="rl-cap">${esc(r.caption)}</p>` : ''}</footer>
  </section>`;
  const draw = () => { box.innerHTML = list.map(itemHTML).join(''); };
  draw();

  const vids = () => [...box.querySelectorAll('.rl-vid')];
  const load = (item) => { const v = $('.rl-vid', item); if (v && !v.getAttribute('src')) { v.src = list[+item.dataset.i].video; v.preload = 'auto'; } return v; };
  const playOnly = (item) => {
    vids().forEach((v) => { if (v !== $('.rl-vid', item)) v.pause(); });
    const v = load(item); v.muted = muted;
    v.play().catch(() => { v.muted = true; muted = true; syncMuteIcons(); v.play().catch(() => null); });
    item.classList.remove('paused');
  };
  const syncMuteIcons = () => box.querySelectorAll('[data-mute]').forEach((b) => { b.innerHTML = icon(muted ? 'volumeOff' : 'volume', { size: 28 }); });

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.intersectionRatio >= 0.65) playOnly(e.target);
      else if (e.isIntersecting) load(e.target); // neighbour: preload
      else { const v = $('.rl-vid', e.target); v?.pause(); }
    }
  }, { root: box, threshold: [0, 0.65], rootMargin: '0px' });
  const observe = () => box.querySelectorAll('.rl-item').forEach((it) => io.observe(it));
  observe();
  requestAnimationFrame(() => { const it = box.children[Math.min(startIndex, list.length - 1)]; it?.scrollIntoView({ block: 'start' }); if (it) playOnly(it); });

  function close() {
    if (closed) return; closed = true;
    io.disconnect(); vids().forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); });
    document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; root.remove(); onClose?.();
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') box.scrollBy({ top: box.clientHeight, behavior: 'smooth' });
    else if (e.key === 'ArrowUp') box.scrollBy({ top: -box.clientHeight, behavior: 'smooth' });
  };
  document.addEventListener('keydown', onKey);
  $('.rl-x', root).addEventListener('click', close);

  box.addEventListener('click', async (e) => {
    const item = e.target.closest('.rl-item'); if (!item) return;
    const r = list[+item.dataset.i], v = $('.rl-vid', item);
    if (e.target.closest('[data-who]')) { e.preventDefault(); const href = e.target.closest('[data-who]').getAttribute('href'); close(); if (navigate) navigate(href); else location.hash = href; return; }
    if (e.target.closest('[data-mute]')) { muted = !muted; vids().forEach((x) => { x.muted = muted; }); syncMuteIcons(); return; }
    if (e.target.closest('[data-like]')) {
      r.liked = !r.liked; r.likes = Math.max(0, (r.likes || 0) + (r.liked ? 1 : -1));
      const b = $('[data-like]', item); b.classList.toggle('on', r.liked); b.setAttribute('aria-pressed', String(r.liked)); b.innerHTML = `${icon(r.liked ? 'heartFill' : 'heart', { size: 30 })}<span class="num">${r.likes}</span>`;
      try { await api.toggleReelLike(r.id); } catch { r.liked = !r.liked; r.likes += r.liked ? 1 : -1; toast('تعذّر الحفظ', { type: 'error' }); }
      return;
    }
    if (e.target.closest('[data-del]')) {
      v.pause();
      if (!(await confirmDialog({ title: 'حذف الريل؟', message: 'مش هتقدر ترجّعه تاني.', confirmText: 'حذف', danger: true }))) { v.play().catch(() => null); return; }
      try { await api.deleteReel(r.id); } catch { toast('تعذّر الحذف', { type: 'error' }); return; }
      const idx = +item.dataset.i; list.splice(idx, 1); onChange?.(r.id); toast('تم حذف الريل');
      if (!list.length) return close();
      io.disconnect(); vids().forEach((x) => { x.pause(); x.removeAttribute('src'); }); draw(); observe();
      const next = box.children[Math.min(idx, list.length - 1)]; next?.scrollIntoView({ block: 'start' }); if (next) playOnly(next);
      return;
    }
    if (e.target.closest('.rl-rail, .rl-info')) return;
    // tap on the video = pause / resume
    if (v.paused) { v.play().catch(() => null); item.classList.remove('paused'); } else { v.pause(); item.classList.add('paused'); }
  });
  return { close };
}
