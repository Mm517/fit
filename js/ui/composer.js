/**
 * Create-content sheets: post (text + image), reel (video), and the "+" chooser used on the profile.
 *   openPostComposer({ onDone })   image is converted to WebP before upload
 *   openReelComposer({ onDone })   video is compressed (WebM/MP4, ≤ 60 s) in the browser before upload
 *   openCreateSheet({ onDone })    chooser: post / reel / story   (story sheet lives in ui/stories.js)
 */
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { toast, openSheet } from './kit.js';
import { openAddStory } from './stories.js';
import { progressHTML, bindProgress, checkVideo, uploadVideoWithProgress, hintHTML } from './mediaUpload.js';
import { esc, $ } from '../utils.js';

export function openPostComposer({ onDone } = {}) {
  let image = null, busy = false;
  openSheet({
    title: 'منشور جديد',
    html: `<div class="field"><textarea class="input" id="pb" maxlength="500" placeholder="شارك تقدمك مع المجتمع..."></textarea></div>
      <div id="pv" class="cm-preview" hidden></div>
      ${progressHTML()}
      <div class="row" style="display:flex;gap:10px;margin-top:12px"><label class="btn btn-outline" style="flex:1" for="pf">${icon('image', { size: 20 })} صورة</label><input id="pf" type="file" accept="image/*" hidden>
      <button class="btn btn-primary" id="pub" style="flex:2">نشر</button></div>
      <p class="muted xs" style="margin-top:6px">الصور بتتحوّل تلقائياً لصيغة WebP الخفيفة.</p>`,
    onMount: (el, close) => {
      const pv = $('#pv', el), pub = $('#pub', el), prog = bindProgress(el);
      $('#pf', el).addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        pub.disabled = true; prog.show('بحوّل الصورة لـ WebP وبرفعها…', 0.5);
        try {
          image = await api.uploadImage(f, { kind: 'post' });
          pv.hidden = false; pv.innerHTML = `<img src="${esc(image)}" alt="معاينة"><button class="icon-btn cm-rm" id="rm" aria-label="إزالة الصورة">${icon('x', { size: 18 })}</button>`;
        } catch (er) { image = null; toast(er.message || 'تعذّر رفع الصورة', { type: 'error' }); }
        prog.hide(); pub.disabled = false; e.target.value = '';
      });
      pv.addEventListener('click', (e) => { if (e.target.closest('#rm')) { image = null; pv.hidden = true; pv.innerHTML = ''; } });
      pub.onclick = async () => {
        if (busy) return;
        const body = $('#pb', el).value.trim(); if (!body && !image) return toast('اكتب شيئاً أولاً', { type: 'error' });
        busy = true; pub.disabled = true;
        try { await api.createPost({ body, image }); close(); toast('تم نشر المنشور'); onDone?.(); }
        catch { toast('تعذّر النشر', { type: 'error' }); busy = false; pub.disabled = false; }
      };
    },
  });
}

export function openReelComposer({ onDone } = {}) {
  let up = null, busy = false, ctrl = null;
  openSheet({
    title: 'ريل جديد',
    onClose: () => ctrl?.abort(),
    html: `<p class="muted small" style="margin-bottom:10px">فيديو قصير (لحد 60 ثانية) هيظهر على بروفايلك.</p>
      <div id="rp" class="cm-preview" hidden></div>
      <div class="row" style="display:flex;gap:10px;margin:10px 0"><label class="btn btn-outline" style="flex:1" for="rf">${icon('film', { size: 20 })} اختر فيديو</label><input id="rf" type="file" accept="video/*" hidden></div>
      ${progressHTML()}${hintHTML('reel')}
      <div class="field" style="margin-top:10px"><input id="rc" class="input" maxlength="200" placeholder="اكتب وصف للريل (اختياري)"></div>
      <button class="btn btn-primary btn-block" id="rok" style="margin-top:12px" disabled>نشر الريل</button>`,
    onMount: (el, close) => {
      const pv = $('#rp', el), ok = $('#rok', el), fileIn = $('#rf', el), prog = bindProgress(el);
      const lock = (v) => { ok.disabled = v || !up; fileIn.disabled = v; };
      fileIn.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        up = null; pv.hidden = true; lock(true); ok.textContent = 'جاري التجهيز…';
        try {
          await checkVideo(f, 'reel');
          ctrl = new AbortController();
          up = await uploadVideoWithProgress(f, 'reel', prog, ctrl.signal);
          pv.hidden = false; pv.innerHTML = `<video src="${esc(up.video)}" poster="${esc(up.poster)}" controls playsinline muted style="max-height:340px;width:100%;object-fit:contain;background:#000"></video><p class="muted xs" style="padding:6px 2px">${esc(up.summary)}</p>`;
        } catch (er) { up = null; prog.hide(); if (er?.message !== 'تم إلغاء التحويل') toast(er.message || 'تعذّر تجهيز الفيديو', { type: 'error', ms: 4500 }); }
        lock(false); ok.textContent = 'نشر الريل'; fileIn.value = '';
      });
      ok.addEventListener('click', async () => {
        if (!up || busy) return; busy = true; lock(true);
        try { await api.createReel({ video: up.video, poster: up.poster, caption: $('#rc', el).value }); close(); toast('تم نشر الريل'); onDone?.(); }
        catch { toast('تعذّر نشر الريل', { type: 'error' }); busy = false; lock(false); }
      });
    },
  });
}

export function openCreateSheet({ onDone } = {}) {
  openSheet({
    title: 'إنشاء',
    html: `<div class="cr-grid">
      <button class="cr-card" data-k="post">${icon('image', { size: 30 })}<b>منشور</b><span class="muted xs">نص وصورة</span></button>
      <button class="cr-card" data-k="reel">${icon('reel', { size: 30 })}<b>ريل</b><span class="muted xs">فيديو قصير</span></button>
      <button class="cr-card" data-k="story">${icon('spark', { size: 30 })}<b>قصة</b><span class="muted xs">24 ساعة</span></button></div>`,
    onMount: (el, close) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      close();
      setTimeout(() => ({ post: openPostComposer, reel: openReelComposer, story: openAddStory })[b.dataset.k]({ onDone }), 230);
    }),
  });
}
