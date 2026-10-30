/** Public profile of another member: stories ring, follow / message / block, followers lists, their posts. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, confirmDialog, img } from '../ui/kit.js';
import { openPeopleList } from '../ui/people.js';
import { openStoryViewer } from '../ui/stories.js';
import { esc, $, on, timeAgo, fmtNum } from '../utils.js';

const head = (title = '') => `<header class="page-head center"><button class="icon-btn plain" data-back aria-label="رجوع">${icon('arrow', { size: 24, cls: 'rtl-flip' })}</button><h1>${esc(title)}</h1><span style="width:44px"></span></header>`;

export default async function userPage({ root, params, navigate }) {
  const me = await api.currentUser();
  if (params.id === me.id) { navigate('#/profile'); return; }
  root.innerHTML = head() + skeleton('card', 3);
  on(root, 'click', '[data-back]', () => (history.length > 1 ? history.back() : navigate('#/community')));

  let d = null;
  try { d = await api.getPublicProfile(params.id); } catch (e) { console.warn('[user]', e); }
  if (!d) { root.innerHTML = head('الملف الشخصي') + emptyState({ icon: 'user', title: 'المستخدم غير موجود', text: 'ربما تم حذف الحساب أو تعليقه.' }); return; }
  const p = d.profile;
  let busy = false;

  function draw() {
    const hasStory = d.stories.length > 0 && !d.blocked, unseen = d.stories.some((s) => !s.seen);
    root.innerHTML = `${head(p.name)}
      <section class="pf-top">
        <button class="avatar-ring pf-av up-av ${hasStory ? (unseen ? '' : 'seen') : 'nostory'}" ${hasStory ? 'data-story' : 'disabled'} aria-label="${hasStory ? 'عرض القصة' : esc(p.name)}">${img(p.avatar, p.name, 'avatar pf-avatar', 'assets/img/av-1.svg')}</button>
        <div class="pf-name" style="cursor:default"><h2>${esc(p.name)}</h2><p class="muted">${p.goal ? `الهدف: ${esc(p.goal)}` : 'عضو في FitCircle'}</p></div>
      </section>
      <div class="up-counts">
        <div class="up-count"><b class="num">${fmtNum(d.posts.length)}</b><span class="muted small">منشور</span></div>
        <button class="up-count" data-list="followers"><b class="num">${fmtNum(d.followers)}</b><span class="muted small">متابِع</span></button>
        <button class="up-count" data-list="following"><b class="num">${fmtNum(d.followingCount)}</b><span class="muted small">يتابع</span></button>
        <div class="up-count"><b class="num orange">${fmtNum(p.streak)}</b><span class="muted small">يوم متتالي</span></div>
      </div>
      ${d.blocked ? `<div class="card up-blocked"><p>لقد حظرت هذا المستخدم. لن يتمكن من مراسلتك أو متابعتك.</p><button class="btn btn-outline btn-block" data-unblock>إلغاء الحظر</button></div>` : `
      <div class="up-actions">
        <button class="btn ${d.following ? 'btn-outline' : 'btn-primary'}" data-follow aria-pressed="${d.following}">${icon(d.following ? 'check' : 'plus', { size: 18 })} ${d.following ? 'تتابعه' : 'متابعة'}</button>
        <a class="btn btn-outline" href="#/chat/${esc(p.id)}">${icon('message', { size: 18 })} رسالة</a>
        <button class="icon-btn" data-more aria-label="المزيد">${icon('dots', { size: 22 })}</button>
      </div>
      <h2 class="h-sec">المنشورات</h2>
      ${d.posts.length ? d.posts.map(postHTML).join('') : emptyState({ icon: 'image', title: 'لا توجد منشورات بعد', text: 'لم ينشر شيئاً حتى الآن.' })}`}`;
  }
  const postHTML = (x) => `<article class="card cm-post"><div class="cm-head"><div class="cm-who"><span class="muted xs">${timeAgo(x.created_at)}</span></div></div>
    ${x.body ? `<p class="cm-body">${esc(x.body)}</p>` : ''}${x.image ? `<div class="cm-photo">${img(x.image, 'صورة المنشور', '', 'assets/img/p-1.svg')}</div>` : ''}
    <footer class="cm-actions muted small"><span>${icon('heart', { size: 18 })} ${x.likes}</span><span>${icon('comment', { size: 18 })} ${x.comments}</span></footer></article>`;

  draw();

  on(root, 'click', '[data-follow]', async () => {
    if (busy) return; busy = true;
    const was = d.following; d.following = !was; d.followers += was ? -1 : 1; draw();
    try { d.following = await api.toggleFollow(p.id); } catch { d.following = was; d.followers += was ? 1 : -1; toast('تعذّر تنفيذ العملية', { type: 'error' }); }
    busy = false; draw();
  });
  on(root, 'click', '[data-list]', async (e, b) => {
    const kind = b.dataset.list;
    try { openPeopleList(kind === 'followers' ? 'المتابِعون' : 'يتابع', await api.listFollowList(p.id, kind), { empty: kind === 'followers' ? 'لا يوجد متابِعون بعد.' : 'لا يتابع أحداً بعد.' }); } catch { toast('تعذّر تحميل القائمة', { type: 'error' }); }
  });
  on(root, 'click', '[data-story]', () => openStoryViewer({
    groups: [{ user: p, stories: d.stories, mine: false }], startUserId: p.id, meId: me.id, navigate,
    onClose: () => draw(),
  }));
  on(root, 'click', '[data-more]', () => openSheet({
    title: p.name, html: `<div style="display:grid;gap:10px"><button class="btn btn-danger btn-block" id="blk">${icon('ban', { size: 18 })} حظر ${esc(p.name)}</button></div>`,
    onMount: (el, close) => $('#blk', el).addEventListener('click', async () => {
      close();
      if (!(await confirmDialog({ title: `حظر ${p.name}؟`, message: 'سيتم إلغاء المتابعة بينكما ولن يتمكن من مراسلتك أو رؤية قصصك.', confirmText: 'حظر', danger: true }))) return;
      try { await api.blockUser(p.id); d.blocked = true; d.following = false; draw(); toast('تم حظر المستخدم'); } catch { toast('تعذّر الحظر', { type: 'error' }); }
    }),
  }));
  on(root, 'click', '[data-unblock]', async () => {
    try { await api.unblockUser(p.id); d.blocked = false; draw(); toast('تم إلغاء الحظر'); } catch { toast('تعذّر إلغاء الحظر', { type: 'error' }); }
  });
}
