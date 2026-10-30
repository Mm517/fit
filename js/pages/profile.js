/** Profile (screenshot 10): avatar, goal, stats, achievement badges, my photos. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, img } from '../ui/kit.js';
import { openPeopleList } from '../ui/people.js';
import { esc, $, on, fmtNum } from '../utils.js';

const TIER = { gold: ['#ffd76a', '#c58a12'], teal: ['#4fe3d0', '#16867a'], silver: ['#dfe7ee', '#7e8f9c'], bronze: ['#ffb066', '#a8581a'] };
const ICONS = { start: 'flame', regular: 'target', challenger: 'trophy', habit: 'dumbbell' };

function badge(b, i) {
  const [a, c] = TIER[b.tier];
  return `<div class="pf-badge ${b.earned ? '' : 'off'}"><svg viewBox="0 0 64 74" width="64" height="74" aria-hidden="true"><defs><linearGradient id="bg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
    <path d="M32 3 59 13v22c0 17-11 30-27 36C16 65 5 52 5 35V13Z" fill="#0b1318" stroke="url(#bg${i})" stroke-width="3.5"/><path d="M32 10 52 18v17c0 13-8 23-20 28C20 58 12 48 12 35V18Z" fill="url(#bg${i})" opacity=".18"/></svg>
    <span class="pf-bic" style="color:${a}">${icon(b.earned ? ICONS[b.id] : 'lock', { size: 26 })}</span><small>${esc(b.name)}</small></div>`;
}

export default async function profile({ root }) {
  root.innerHTML = skeleton('card', 4);
  const s = await api.getProfileSummary(); const p = s.profile;
  const fc = await api.followCounts(p.id).catch(() => ({ followers: 0, following: 0 }));

  root.innerHTML = `
    <header class="page-head center"><a class="icon-btn plain" href="#/settings" aria-label="الإعدادات">${icon('gear', { size: 24 })}</a><h1>حسابي</h1><span style="width:44px"></span></header>
    <section class="pf-top"><div class="avatar-ring pf-av">${img(p.avatar, p.name, 'avatar pf-avatar', 'assets/img/av-1.svg')}</div>
      <button class="pf-name" id="pf-edit" aria-label="تعديل الملف الشخصي"><h2>${esc(p.name)}</h2><p class="muted">الهدف: ${esc(p.goal || 'لم يتم تحديده')} ${icon('edit', { size: 14 })}</p></button></section>
    <div class="up-counts"><button class="up-count" data-list="followers"><b class="num">${fmtNum(fc.followers)}</b><span class="muted small">متابِع</span></button><button class="up-count" data-list="following"><b class="num">${fmtNum(fc.following)}</b><span class="muted small">يتابع</span></button><a class="up-count" href="#/messages">${icon('message', { size: 22 })}<span class="muted small">رسائلي</span></a></div>
    <div class="pf-stats">
      <div class="card stat"><span class="muted small">الوزن الحالي</span><div class="stat-v"><b class="num">${esc(s.stats.weight || '—')}</b><small class="muted">كجم</small></div></div>
      <div class="card stat"><span class="muted small">تمارين هذا الأسبوع</span><div class="stat-v"><b class="num">${s.stats.weekWorkouts}</b></div></div>
      <div class="card card--lime stat pf-streak"><span class="muted small">أيام متتالية</span><div class="stat-v"><b class="num orange">${s.stats.streak}</b></div></div>
    </div>
    <h2 class="h-sec">الإنجازات</h2><div class="card pf-badges">${s.badges.map(badge).join('')}</div>
    <h2 class="h-sec">صوري</h2>
    ${s.photos.length ? `<div class="pf-photos">${s.photos.map((u) => `<div>${img(u, 'صورة', '', 'assets/img/p-1.svg')}</div>`).join('')}</div>` : emptyState({ icon: 'image', title: 'لا توجد صور بعد', text: 'صور منشوراتك ستظهر هنا.' })}`;

  on(root, 'click', '[data-list]', async (e, b) => {
    const kind = b.dataset.list;
    try { openPeopleList(kind === 'followers' ? 'المتابِعون' : 'يتابع', await api.listFollowList(p.id, kind), { empty: kind === 'followers' ? 'لا يوجد متابِعون بعد.' : 'لم تتابع أحداً بعد.' }); } catch { toast('تعذّر تحميل القائمة', { type: 'error' }); }
  });
  on(root, 'click', '#pf-edit', () => openSheet({ title: 'تعديل الملف الشخصي', html: `<div style="display:grid;gap:12px">
      <div class="field"><label for="e-n">الاسم</label><input id="e-n" class="input" maxlength="40" value="${esc(p.name)}"></div>
      <div class="field"><label for="e-g">الهدف</label><input id="e-g" class="input" maxlength="60" value="${esc(p.goal || '')}"></div>
      <div class="field"><label for="e-w">الوزن (كجم)</label><input id="e-w" class="input" type="number" inputmode="decimal" min="20" max="300" value="${esc(p.weight || '')}"></div>
      <div class="field"><label for="e-a">الصورة الشخصية</label><input id="e-a" class="input" type="file" accept="image/*"></div>
      <button class="btn btn-primary btn-block" id="e-ok">حفظ</button></div>`,
    onMount: (el, close) => { $('#e-ok', el).onclick = async () => {
      const name = $('#e-n', el).value.trim(); if (!name) return toast('الاسم مطلوب', { type: 'error' });
      const patch = { name, goal: $('#e-g', el).value.trim(), weight: +$('#e-w', el).value || p.weight };
      const f = $('#e-a', el).files[0]; if (f) patch.avatar = await api.uploadImage(f);
      await api.updateProfile(patch); close(); toast(); profile({ root });
    }; } }));
}
