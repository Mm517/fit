/** Profile (screenshot 10): avatar (+ story ring), goal, stats, badges, and CREATE buttons for posts / reels / stories with my posts + reels grids. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, confirmDialog, img } from '../ui/kit.js';
import { openPeopleList } from '../ui/people.js';
import { openStoryViewer, openAddStory } from '../ui/stories.js';
import { openReelViewer } from '../ui/reels.js';
import { openPostComposer, openReelComposer } from '../ui/composer.js';
import { esc, $, on, fmtNum, timeAgo } from '../utils.js';

const TIER = { gold: ['#ffd76a', '#c58a12'], teal: ['#4fe3d0', '#16867a'], silver: ['#dfe7ee', '#7e8f9c'], bronze: ['#ffb066', '#a8581a'] };
const ICONS = { start: 'flame', regular: 'target', challenger: 'trophy', habit: 'dumbbell' };

function badge(b, i) {
  const [a, c] = TIER[b.tier];
  return `<div class="pf-badge ${b.earned ? '' : 'off'}"><svg viewBox="0 0 64 74" width="64" height="74" aria-hidden="true"><defs><linearGradient id="bg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
    <path d="M32 3 59 13v22c0 17-11 30-27 36C16 65 5 52 5 35V13Z" fill="#0b1318" stroke="url(#bg${i})" stroke-width="3.5"/><path d="M32 10 52 18v17c0 13-8 23-20 28C20 58 12 48 12 35V18Z" fill="url(#bg${i})" opacity=".18"/></svg>
    <span class="pf-bic" style="color:${a}">${icon(b.earned ? ICONS[b.id] : 'lock', { size: 26 })}</span><small>${esc(b.name)}</small></div>`;
}

export default async function profile({ root, navigate }) {
  { const fresh = root.cloneNode(false); root.replaceWith(fresh); root = fresh; } // re-render = fresh element, so click handlers never stack up
  root.innerHTML = skeleton('card', 4);
  const s = await api.getProfileSummary(); const p = s.profile;
  const [fc, reels, stories] = await Promise.all([
    api.followCounts(p.id).catch(() => ({ followers: 0, following: 0 })),
    api.listReels({ userId: p.id }).catch(() => []),
    api.listUserStories(p.id).catch(() => []),
  ]);
  let tab = sessionStorage.getItem('fc:pf-tab') || 'posts';
  const posts = s.posts || [];
  const refresh = () => profile({ root, navigate });

  const tile = (x) => `<button class="pf-tile" data-post="${esc(x.id)}" aria-label="منشور">${x.image ? img(x.image, 'منشور', '', 'assets/img/p-1.svg') : `<span class="pf-tile-txt">${esc((x.body || '').slice(0, 90))}</span>`}</button>`;
  const rtile = (r, i) => `<button class="pf-tile pf-rtile" data-reel="${i}" aria-label="ريل">${img(r.poster, 'ريل', '', 'assets/img/ex-default.svg')}<span class="pf-rmeta">${icon('play', { size: 16 })}<span class="num">${fmtNum(r.likes)}</span></span></button>`;
  function gridHTML() {
    if (tab === 'reels') return reels.length ? `<div class="pf-grid">${reels.map(rtile).join('')}</div>` : emptyState({ icon: 'reel', title: 'لا توجد ريلز بعد', text: 'ارفع أول ريل ليك وهيظهر هنا.', action: 'ريل جديد', actionId: 'new-reel' });
    return posts.length ? `<div class="pf-grid">${posts.map(tile).join('')}</div>` : emptyState({ icon: 'image', title: 'لا توجد منشورات بعد', text: 'منشوراتك هتظهر هنا.', action: 'منشور جديد', actionId: 'new-post' });
  }

  root.innerHTML = `
    <header class="page-head center"><a class="icon-btn plain" href="#/settings" aria-label="الإعدادات">${icon('gear', { size: 24 })}</a><h1>حسابي</h1><span style="width:44px"></span></header>
    <section class="pf-top"><button class="avatar-ring pf-av ${stories.length ? '' : 'nostory'}" ${stories.length ? 'data-mystory' : 'disabled'} aria-label="${stories.length ? 'عرض قصتي' : esc(p.name)}">${img(p.avatar, p.name, 'avatar pf-avatar', 'assets/img/av-1.svg')}</button>
      <button class="pf-name" id="pf-edit" aria-label="تعديل الملف الشخصي"><h2>${esc(p.name)}</h2><p class="muted">الهدف: ${esc(p.goal || 'لم يتم تحديده')} ${icon('edit', { size: 14 })}</p></button></section>
    <div class="up-counts"><button class="up-count" data-list="followers"><b class="num">${fmtNum(fc.followers)}</b><span class="muted small">متابِع</span></button><button class="up-count" data-list="following"><b class="num">${fmtNum(fc.following)}</b><span class="muted small">يتابع</span></button><a class="up-count" href="#/messages">${icon('message', { size: 22 })}<span class="muted small">رسائلي</span></a><a class="up-count pf-nut" href="#/nutrition">${icon('apple', { size: 22 })}<span class="muted small">التغذية</span></a></div>
    <div class="pf-create" role="group" aria-label="إنشاء محتوى">
      <button class="pf-cbtn" data-new="post">${icon('image', { size: 24 })}<b>منشور</b></button>
      <button class="pf-cbtn" data-new="reel">${icon('reel', { size: 24 })}<b>ريل</b></button>
      <button class="pf-cbtn" data-new="story">${icon('spark', { size: 24 })}<b>قصة</b></button>
    </div>
    <div class="pf-stats">
      <div class="card stat"><span class="muted small">الوزن الحالي</span><div class="stat-v"><b class="num">${esc(s.stats.weight || '—')}</b><small class="muted">كجم</small></div></div>
      <div class="card stat"><span class="muted small">تمارين هذا الأسبوع</span><div class="stat-v"><b class="num">${s.stats.weekWorkouts}</b></div></div>
      <div class="card card--lime stat pf-streak"><span class="muted small">أيام متتالية</span><div class="stat-v"><b class="num orange">${s.stats.streak}</b></div></div>
    </div>
    <h2 class="h-sec">الإنجازات</h2><div class="card pf-badges">${s.badges.map(badge).join('')}</div>
    <h2 class="h-sec">محتواي</h2>
    <div class="seg pf-tabs" role="tablist"><button role="tab" data-tab="posts" class="${tab === 'posts' ? 'active' : ''}">المنشورات (${fmtNum(posts.length)})</button><button role="tab" data-tab="reels" class="${tab === 'reels' ? 'active' : ''}">الريلز (${fmtNum(reels.length)})</button></div>
    <div id="pf-content" style="margin-top:12px">${gridHTML()}</div>`;

  const redrawGrid = () => { $('#pf-content', root).innerHTML = gridHTML(); root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab)); };
  on(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; sessionStorage.setItem('fc:pf-tab', tab); redrawGrid(); });

  // ---- create ----
  const done = () => refresh();
  on(root, 'click', '[data-new]', (e, b) => ({ post: openPostComposer, reel: openReelComposer, story: openAddStory })[b.dataset.new]({ onDone: done }));
  on(root, 'click', '[data-act=new-reel]', () => openReelComposer({ onDone: done }));
  on(root, 'click', '[data-act=new-post]', () => openPostComposer({ onDone: done }));

  // ---- view my story / reels / posts ----
  on(root, 'click', '[data-mystory]', () => openStoryViewer({ groups: [{ user: p, stories, mine: true }], startUserId: p.id, meId: p.id, navigate, onClose: refresh }));
  on(root, 'click', '[data-reel]', (e, b) => openReelViewer({ reels, startIndex: +b.dataset.reel, meId: p.id, navigate, onClose: refresh }));
  on(root, 'click', '[data-post]', (e, b) => {
    const x = posts.find((q) => q.id === b.dataset.post); if (!x) return;
    openSheet({ title: 'منشوري', html: `${x.image ? `<div class="cm-photo">${img(x.image, 'صورة المنشور', '', 'assets/img/p-1.svg')}</div>` : ''}${x.body ? `<p class="cm-body" style="margin-top:10px">${esc(x.body)}</p>` : ''}
      <p class="muted xs" style="margin:8px 0">${timeAgo(x.created_at)}</p><button class="btn btn-danger btn-block" id="pdel">${icon('trash', { size: 18 })} حذف المنشور</button>`,
      onMount: (el, close) => { $('#pdel', el).onclick = async () => {
        close();
        if (!(await confirmDialog({ title: 'حذف المنشور؟', message: 'لا يمكن التراجع عن الحذف.', confirmText: 'حذف', danger: true }))) return;
        try { await api.deleteOwnPost(x.id); api.removeMedia([x.image]); toast('تم حذف المنشور'); refresh(); } catch { toast('تعذّر الحذف', { type: 'error' }); }
      }; } });
  });

  on(root, 'click', '[data-list]', async (e, b) => {
    const kind = b.dataset.list;
    try { openPeopleList(kind === 'followers' ? 'المتابِعون' : 'يتابع', await api.listFollowList(p.id, kind), { empty: kind === 'followers' ? 'لا يوجد متابِعون بعد.' : 'لم تتابع أحداً بعد.' }); } catch { toast('تعذّر تحميل القائمة', { type: 'error' }); }
  });
  on(root, 'click', '#pf-edit', () => openSheet({ title: 'تعديل الملف الشخصي', html: `<div style="display:grid;gap:12px">
      <div class="field"><label for="e-n">الاسم</label><input id="e-n" class="input" maxlength="40" value="${esc(p.name)}"></div>
      <div class="field"><label for="e-g">الهدف</label><input id="e-g" class="input" maxlength="60" value="${esc(p.goal || '')}"></div>
      <div class="field"><label for="e-w">الوزن (كجم)</label><input id="e-w" class="input" type="number" inputmode="decimal" min="20" max="300" value="${esc(p.weight || '')}"></div>
      <div class="field"><label for="e-a">الصورة الشخصية</label><input id="e-a" class="input" type="file" accept="image/*"><small class="muted xs">بتتحوّل تلقائياً لـ WebP.</small></div>
      <button class="btn btn-primary btn-block" id="e-ok">حفظ</button></div>`,
    onMount: (el, close) => { $('#e-ok', el).onclick = async (ev) => {
      const name = $('#e-n', el).value.trim(); if (!name) return toast('الاسم مطلوب', { type: 'error' });
      const btn = ev.currentTarget; btn.disabled = true;
      try {
        const patch = { name, goal: $('#e-g', el).value.trim(), weight: +$('#e-w', el).value || p.weight };
        const f = $('#e-a', el).files[0]; if (f) patch.avatar = await api.uploadImage(f, { kind: 'avatar' });
        await api.updateProfile(patch); close(); toast(); refresh();
      } catch (er) { btn.disabled = false; toast(er.message || 'تعذّر الحفظ', { type: 'error' }); }
    }; } }));
}
