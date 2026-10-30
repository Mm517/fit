/**
 * Full-screen story viewer + "add story" sheet.
 *  - groups: [{ user:{id,name,avatar}, stories:[{id,image,caption,created_at,seen}], mine }]
 *  - 5 s per story, tap left = next / tap right = previous (RTL), hold = pause, Esc / ✕ = close.
 *  - Opening someone else's story records a view; the owner can see who viewed it and delete it.
 */
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { openSheet, confirmDialog, toast, img } from './kit.js';
import { esc, el, $, timeAgo } from '../utils.js';

const DURATION = 5000, TICK = 50;

export function openStoryViewer({ groups, startUserId, meId, onClose, navigate }) {
  const live = groups.filter((g) => g.stories.length);
  if (!live.length) return null;
  let gi = Math.max(0, live.findIndex((g) => g.user.id === startUserId)), si = 0, elapsed = 0, paused = false, held = false, closed = false;
  si = Math.max(0, live[gi].stories.findIndex((s) => !s.seen));

  const host = $('#overlay') || document.body;
  const root = el(`<div class="sv" role="dialog" aria-modal="true" aria-label="القصص">
    <div class="sv-bars" aria-hidden="true"></div>
    <header class="sv-head"><a class="sv-user" href="#"></a><button class="icon-btn plain sv-x" aria-label="إغلاق">${icon('x', { size: 24 })}</button></header>
    <div class="sv-stage"><img class="sv-img" alt="" draggable="false"></div>
    <p class="sv-cap" hidden></p>
    <button class="sv-zone sv-next" aria-label="التالي"></button><button class="sv-zone sv-prev" aria-label="السابق"></button>
    <footer class="sv-foot" hidden></footer></div>`);
  host.append(root);
  document.body.style.overflow = 'hidden';

  const bars = $('.sv-bars', root), userEl = $('.sv-user', root), imgEl = $('.sv-img', root), capEl = $('.sv-cap', root), foot = $('.sv-foot', root);
  const cur = () => live[gi].stories[si];

  function close() {
    if (closed) return; closed = true;
    clearInterval(timer); document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
    document.body.style.overflow = ''; root.remove(); onClose?.();
  }
  function go(dg, ds) { // move to the next / previous story, crossing groups
    const g = live[gi];
    if (ds > 0) { if (si < g.stories.length - 1) si++; else if (gi < live.length - 1) { gi++; si = Math.max(0, live[gi].stories.findIndex((s) => !s.seen)); } else return close(); }
    else { if (si > 0) si--; else if (gi > 0) { gi--; si = 0; } else { elapsed = 0; return paint(); } }
    show();
  }
  const next = () => go(0, 1), prev = () => go(0, -1);

  function paint() { [...bars.children].forEach((b, i) => { b.firstChild.style.width = `${i < si ? 100 : i === si ? Math.min(100, (elapsed / DURATION) * 100) : 0}%`; }); }
  function show() {
    elapsed = 0;
    const g = live[gi], st = cur();
    bars.innerHTML = g.stories.map(() => '<i><b></b></i>').join(''); paint();
    userEl.setAttribute('href', g.mine ? '#/profile' : `#/user/${g.user.id}`);
    userEl.innerHTML = `${img(g.user.avatar, '', 'avatar sv-av', 'assets/img/av-1.svg')}<span><b>${esc(g.mine ? 'قصتي' : g.user.name)}</b><small>${timeAgo(st.created_at)}</small></span>`;
    imgEl.src = st.image;
    capEl.hidden = !st.caption; capEl.textContent = st.caption || '';
    const nx = g.stories[si + 1]; if (nx) new Image().src = nx.image; // preload
    if (g.user.id !== meId) { st.seen = true; api.markStoryViewed(st.id).catch(() => null); }
    foot.hidden = !g.mine;
    if (g.mine) {
      foot.innerHTML = `<button class="sv-btn" data-viewers>${icon('eye', { size: 20 })}<span id="sv-vc">…</span></button><button class="sv-btn danger" data-del>${icon('trash', { size: 20 })}<span>حذف</span></button>`;
      api.storyViewers(st.id).then((v) => { const n = $('#sv-vc', foot); if (n && cur().id === st.id) n.textContent = `${v.length} مشاهدة`; }).catch(() => { const n = $('#sv-vc', foot); if (n) n.textContent = 'المشاهدات'; });
    }
  }

  const timer = setInterval(() => { if (paused || held || closed) return; elapsed += TICK; paint(); if (elapsed >= DURATION) next(); }, TICK);
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') next(); else if (e.key === 'ArrowRight') prev(); };
  const onVis = () => { paused = document.hidden; };
  document.addEventListener('keydown', onKey); document.addEventListener('visibilitychange', onVis);

  // tap zones (+ hold to pause: a long press must not also navigate)
  let downAt = 0;
  for (const z of [$('.sv-next', root), $('.sv-prev', root)]) {
    z.addEventListener('pointerdown', () => { downAt = Date.now(); held = true; });
    z.addEventListener('pointerup', () => { held = false; });
    z.addEventListener('pointerleave', () => { held = false; });
    z.addEventListener('pointercancel', () => { held = false; });
  }
  $('.sv-next', root).addEventListener('click', () => { if (Date.now() - downAt < 350) next(); });
  $('.sv-prev', root).addEventListener('click', () => { if (Date.now() - downAt < 350) prev(); });
  $('.sv-x', root).addEventListener('click', close);
  userEl.addEventListener('click', (e) => { e.preventDefault(); const href = userEl.getAttribute('href'); close(); if (navigate) navigate(href); else location.hash = href; });

  foot.addEventListener('click', async (e) => {
    const st = cur();
    if (e.target.closest('[data-viewers]')) {
      paused = true;
      const v = await api.storyViewers(st.id).catch(() => []);
      openSheet({ title: 'شاهدوا قصتك', html: `<div class="pp-list">${v.length ? v.map((u) => `<div class="pp-row">${img(u.avatar, u.name, 'avatar', 'assets/img/av-1.svg')}<div class="pp-who"><b>${esc(u.name)}</b><span class="muted xs">${timeAgo(u.at)}</span></div></div>`).join('') : '<p class="muted" style="text-align:center;padding:18px">لم يشاهدها أحد بعد.</p>'}</div>`, onClose: () => { paused = false; } });
    } else if (e.target.closest('[data-del]')) {
      paused = true;
      const ok = await confirmDialog({ title: 'حذف القصة؟', message: 'ستختفي من قصصك فوراً.', confirmText: 'حذف', danger: true });
      if (!ok) { paused = false; return; }
      try { await api.deleteStory(st.id); toast('تم حذف القصة'); } catch { toast('تعذّر الحذف', { type: 'error' }); paused = false; return; }
      const g = live[gi]; g.stories.splice(si, 1);
      paused = false;
      if (!g.stories.length) { live.splice(gi, 1); if (!live.length) return close(); gi = Math.min(gi, live.length - 1); si = 0; } else si = Math.min(si, g.stories.length - 1);
      show();
    }
  });

  show();
  return { close };
}

/** Pick an image + optional caption and publish it as a 24h story. onDone() is called after publishing. */
export function openAddStory({ onDone } = {}) {
  let image = null, busy = false;
  openSheet({
    title: 'إضافة قصة',
    html: `<p class="muted small" style="margin-bottom:10px">تظهر القصة لكل الأعضاء لمدة 24 ساعة.</p>
      <div id="as-pv" class="cm-preview" hidden></div>
      <div class="row" style="display:flex;gap:10px;margin:10px 0"><label class="btn btn-outline" style="flex:1" for="as-f">${icon('image', { size: 20 })} اختر صورة</label><input id="as-f" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></div>
      <div class="field"><input id="as-c" class="input" maxlength="140" placeholder="أضف تعليقاً (اختياري)"></div>
      <button class="btn btn-primary btn-block" id="as-ok" style="margin-top:12px" disabled>نشر القصة</button>`,
    onMount: (sheet, close) => {
      const pv = $('#as-pv', sheet), ok = $('#as-ok', sheet);
      $('#as-f', sheet).addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        ok.disabled = true; ok.textContent = 'جاري رفع الصورة…';
        try { image = await api.uploadImage(f); pv.hidden = false; pv.innerHTML = `<img src="${esc(image)}" alt="معاينة القصة" style="max-height:300px">`; ok.disabled = false; }
        catch (er) { image = null; toast(er.message || 'تعذّر رفع الصورة', { type: 'error' }); }
        ok.textContent = 'نشر القصة';
      });
      ok.addEventListener('click', async () => {
        if (!image || busy) return; busy = true; ok.disabled = true;
        try { await api.createStory({ image, caption: $('#as-c', sheet).value }); close(); toast('تم نشر قصتك'); onDone?.(); }
        catch { toast('تعذّر نشر القصة', { type: 'error' }); busy = false; ok.disabled = false; }
      });
    },
  });
}
