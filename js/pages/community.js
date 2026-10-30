/** Community (screenshot 09): streak stories, composer, post cards (like/comment/save/report). */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, confirmDialog, img } from '../ui/kit.js';
import { openUserSearch } from '../ui/people.js';
import { openStoryViewer, openAddStory } from '../ui/stories.js';
import { esc, $, on, timeAgo } from '../utils.js';

const REASONS = ['محتوى غير لائق', 'سبام أو إعلان', 'معلومات مضللة', 'إساءة أو تنمر'];

export default async function community({ root, navigate }) {
  root.innerHTML = `<header class="page-head"><h1>المجتمع</h1></header>${skeleton('card', 1)}${skeleton('post', 2)}`;
  const me = await api.currentUser();
  let posts = [], tray = [], unread = 0;
  const href = (id) => (id === me.id ? '#/profile' : `#/user/${id}`);

  const postHTML = (p) => `
    <article class="card cm-post" data-post="${p.id}">
      <header class="cm-head"><a class="cm-author" href="${href(p.author.id)}" aria-label="ملف ${esc(p.author.name)}">${img(p.author.avatar, p.author.name, 'avatar', 'assets/img/av-1.svg')}</a>
        <div class="cm-who"><a href="${href(p.author.id)}"><b>${esc(p.author.name)}</b></a><span class="muted xs">${timeAgo(p.created_at)}</span></div>
        <button class="icon-btn plain" data-more="${p.id}" aria-label="المزيد">${icon('dots', { size: 20 })}</button></header>
      <p class="cm-body">${esc(p.body)}</p>
      ${p.image ? `<div class="cm-photo">${img(p.image, 'صورة المنشور', '', 'assets/img/p-1.svg')}</div>` : ''}
      <footer class="cm-actions">
        <button class="cm-act ${p.liked ? 'liked' : ''}" data-like="${p.id}" aria-pressed="${p.liked}" aria-label="إعجاب">${icon(p.liked ? 'heartFill' : 'heart', { size: 22 })}<span class="num">${p.likes}</span></button>
        <button class="cm-act" data-cmt="${p.id}" aria-label="تعليقات">${icon('comment', { size: 22 })}<span class="num">${p.comments}</span></button>
        <button class="cm-act cm-save ${p.saved ? 'saved' : ''}" data-save="${p.id}" aria-pressed="${p.saved}" aria-label="حفظ">${icon(p.saved ? 'bookmarkFill' : 'bookmark', { size: 22 })}</button>
      </footer></article>`;

  async function load() {
    const [top, ps, tr, un] = await Promise.all([api.listTopStreaks(), api.listPosts(), api.listStoryTray().catch(() => []), api.unreadMessageCount().catch(() => 0)]);
    posts = ps; tray = tr; unread = un;
    root.innerHTML = `
      <header class="page-head"><h1>المجتمع</h1>
        <button class="icon-btn" data-search aria-label="بحث عن أعضاء">${icon('search', { size: 22 })}</button>
        <a class="icon-btn cm-msg" href="#/messages" aria-label="الرسائل${unread ? ` (${unread} غير مقروءة)` : ''}">${icon('message', { size: 22 })}${unread ? `<span class="cm-dot num">${unread > 9 ? '9+' : unread}</span>` : ''}</a></header>
      <div class="chips cm-stories" aria-label="القصص">${tray.map((g, i) => `<div class="cm-story">
        <button class="cm-story-btn" data-story="${i}" aria-label="${g.mine ? 'قصتي' : `قصة ${esc(g.user.name)}`}"><span class="avatar-ring ${g.stories.length ? (g.unseen ? '' : 'seen') : 'nostory'}">${img(g.user.avatar, g.user.name, 'avatar cm-sav', 'assets/img/av-1.svg')}</span></button>
        ${g.mine ? `<button class="cm-plus" data-add-story aria-label="إضافة قصة">${icon('plus', { size: 14 })}</button>` : ''}
        <span class="small cm-sname">${g.mine ? 'قصتي' : esc(g.user.name.split(' ')[0])}</span></div>`).join('')}</div>
      <h2 class="h-sec">أعلى المتألقين</h2>
      <div class="chips cm-stories">${top.map((s) => `<a class="cm-story" href="${href(s.id)}"><span class="avatar-ring">${img(s.avatar, s.name, 'avatar cm-sav', 'assets/img/av-1.svg')}</span><span class="cm-badge num">${s.streak} يوم</span><span class="small">${esc(s.name)}</span></a>`).join('')}</div>
      <button class="card cm-composer" id="cm-new"><span class="muted">ابدأ بوست...</span><span class="cm-img-ic">${icon('image', { size: 22 })}</span></button>
      <div id="cm-list">${posts.length ? posts.map(postHTML).join('') : emptyState({ icon: 'users', title: 'لا توجد منشورات بعد', text: 'كن أول من يشارك تقدمه!', action: 'ابدأ بوست', actionId: 'new' })}</div>`;
  }
  await load();
  const find = (id) => posts.find((p) => p.id === id);
  const redraw = (p) => { const el = root.querySelector(`[data-post="${p.id}"]`); if (el) el.outerHTML = postHTML(p); };

  on(root, 'click', '#cm-new, [data-act=new]', () => composer());
  on(root, 'click', '[data-search]', () => openUserSearch());
  on(root, 'click', '[data-add-story]', () => openAddStory({ onDone: load }));
  on(root, 'click', '[data-story]', (e, b) => {
    const g = tray[+b.dataset.story];
    if (!g.stories.length) return g.mine ? openAddStory({ onDone: load }) : null;
    openStoryViewer({ groups: tray, startUserId: g.user.id, meId: me.id, navigate, onClose: load });
  });
  on(root, 'click', '[data-like]', async (e, b) => { const p = find(b.dataset.like); p.liked = !p.liked; p.likes += p.liked ? 1 : -1; redraw(p); try { await api.toggleLike(p.id); } catch { toast('تعذّر الحفظ', { type: 'error' }); } });
  on(root, 'click', '[data-save]', async (e, b) => { const p = find(b.dataset.save); p.saved = !p.saved; redraw(p); try { await api.toggleSave(p.id); if (p.saved) toast('تم حفظ المنشور'); } catch { toast('تعذّر الحفظ', { type: 'error' }); } });
  on(root, 'click', '[data-cmt]', (e, b) => comments(find(b.dataset.cmt)));
  on(root, 'click', '[data-more]', (e, b) => {
    const p = find(b.dataset.more);
    openSheet({ title: 'خيارات المنشور', html: `<div style="display:grid;gap:10px">${p.mine ? `<button class="btn btn-danger btn-block" id="del">${icon('trash', { size: 18 })} حذف المنشور</button>` : `<button class="btn btn-outline btn-block" id="rep">${icon('flag', { size: 18 })} إبلاغ عن المنشور</button>`}</div>`,
      onMount: (el, close) => {
        $('#del', el)?.addEventListener('click', async () => { close(); if (await confirmDialog({ title: 'حذف المنشور؟', message: 'لا يمكن التراجع عن الحذف.', confirmText: 'حذف', danger: true })) { await api.deleteOwnPost(p.id); await load(); toast('تم حذف المنشور'); } });
        $('#rep', el)?.addEventListener('click', () => { close(); report(p); });
      } });
  });

  function report(p) {
    openSheet({ title: 'سبب الإبلاغ', html: `<div style="display:grid;gap:10px">${REASONS.map((r) => `<button class="btn btn-outline btn-block" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>`,
      onMount: (el, close) => on(el, 'click', '[data-r]', async (e, b) => { await api.reportPost(p.id, b.dataset.r); close(); toast('تم الإبلاغ، شكراً لك'); }) });
  }

  async function comments(p) {
    const cs = await api.listComments(p.id);
    const row = (c) => `<div class="cm-cmt"><a href="${href(c.author.id)}" data-person>${img(c.author.avatar, '', 'avatar cm-cav', 'assets/img/av-1.svg')}</a><div><a href="${href(c.author.id)}" data-person><b class="small">${esc(c.author.name)}</b></a><p>${esc(c.body)}</p></div></div>`;
    openSheet({ title: 'التعليقات', html: `<div class="cm-cmts" id="cl">${cs.length ? cs.map(row).join('') : '<p class="muted" style="text-align:center;padding:16px">لا توجد تعليقات بعد.</p>'}</div>
      <form class="co-form" id="cf"><input class="input" id="ci" placeholder="اكتب تعليقاً..." maxlength="300" autocomplete="off"><button class="co-send" aria-label="إرسال">${icon('send', { size: 22, cls: 'rtl-flip' })}</button></form>`,
      onMount: (el) => $('#cf', el).addEventListener('submit', async (e) => {
        e.preventDefault(); const v = $('#ci', el).value.trim(); if (!v) return;
        await api.addComment(p.id, v); $('#ci', el).value = '';
        const list = await api.listComments(p.id); $('#cl', el).innerHTML = list.map(row).join(''); p.comments = list.length; redraw(p);
      }) });
  }

  function composer() {
    let image = null;
    openSheet({ title: 'منشور جديد', html: `<div class="field"><textarea class="input" id="pb" maxlength="500" placeholder="شارك تقدمك مع المجتمع..."></textarea></div>
      <div id="pv" class="cm-preview" hidden></div>
      <div class="row" style="display:flex;gap:10px;margin-top:12px"><label class="btn btn-outline" style="flex:1" for="pf">${icon('image', { size: 20 })} صورة</label><input id="pf" type="file" accept="image/*" hidden>
      <button class="btn btn-primary" id="pub" style="flex:2">نشر</button></div>`,
      onMount: (el, close) => {
        const pv = $('#pv', el);
        $('#pf', el).addEventListener('change', async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try { image = await api.uploadImage(f); pv.hidden = false; pv.innerHTML = `<img src="${esc(image)}" alt="معاينة"><button class="icon-btn cm-rm" id="rm" aria-label="إزالة الصورة">${icon('x', { size: 18 })}</button>`; } catch { toast('تعذّر رفع الصورة', { type: 'error' }); }
        });
        pv.addEventListener('click', (e) => { if (e.target.closest('#rm')) { image = null; pv.hidden = true; pv.innerHTML = ''; } });
        $('#pub', el).onclick = async () => {
          const body = $('#pb', el).value.trim(); if (!body && !image) return toast('اكتب شيئاً أولاً', { type: 'error' });
          await api.createPost({ body, image }); close(); await load(); toast('تم نشر المنشور');
        };
      } });
  }
}
