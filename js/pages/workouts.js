/** Workouts list (screenshot 03): search + muscle chips + equipment chips + exercise cards. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { skeleton, emptyState, img } from '../ui/kit.js';
import { esc, $, on, debounce } from '../utils.js';

const MUSCLES = ['الكل', 'صدر', 'ظهر', 'رجل', 'كتف', 'دراع', 'بطن'];
const GEAR = ['جهاز', 'دمبل', 'بار', 'وزن الجسم'];

export default async function workouts({ root }) {
  const st = { q: '', muscle: 'الكل', gear: '' };
  root.innerHTML = `
    <header class="page-head"><h1>التمارين</h1><a class="icon-btn" href="#/plan" aria-label="الجدول الأسبوعي">${icon('calendar')}</a></header>
    <div class="search-box">${icon('search', { size: 20 })}<input class="input" id="wk-q" type="search" placeholder="ابحث عن تمرين..." aria-label="بحث"></div>
    <div class="chips wk-muscles" id="wk-muscles" style="margin-top:12px">${MUSCLES.map((m) => `<button class="chip ${m === 'الكل' ? 'active' : ''}" data-muscle="${m}">${m}</button>`).join('')}</div>
    <h2 class="h-sec" style="margin-top:10px">الأدوات</h2>
    <div class="chips" id="wk-gear">${GEAR.map((g) => `<button class="chip rect" data-gear="${g}">${g}</button>`).join('')}</div>
    <div id="wk-list" style="margin-top:12px"></div>`;
  const list = $('#wk-list', root);

  async function load() {
    list.innerHTML = skeleton('exercise', 4);
    const rows = await api.listExercises({ q: st.q, muscle: st.muscle === 'الكل' ? 'all' : st.muscle, equipment: st.gear || 'all' });
    list.innerHTML = rows.length ? rows.map((e) => `
      <a class="card wk-card card--tap" href="#/exercise/${e.id}">
        <div class="wk-body">
          <div class="wk-names"><b class="wk-en">${esc(e.name_en)}</b><span>${esc(e.name_ar)}</span></div>
          <div class="wk-tags"><span class="tag diff-${esc(e.difficulty)}">${esc(e.difficulty)}</span><span class="tag tag-blue">${esc(e.muscle)}</span></div>
          <div class="wk-sets muted small">${icon('timer', { size: 15 })} <span class="num">${e.sets} × ${esc(e.reps)}</span></div>
        </div>
        <div class="wk-photo">${img(e.image, e.name_ar)}</div>
        <span class="wk-plus" aria-hidden="true">${icon('plus', { size: 14 })}</span>
      </a>`).join('') : emptyState({ title: 'لا توجد تمارين بعد', text: 'جرّب تغيير البحث أو الفلاتر.' });
  }
  const d = debounce(() => { st.q = $('#wk-q', root).value.trim(); load(); }, 250);
  $('#wk-q', root).addEventListener('input', d);
  on(root, 'click', '[data-muscle]', (e, b) => { st.muscle = b.dataset.muscle; $('#wk-muscles', root).querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === b)); load(); });
  on(root, 'click', '[data-gear]', (e, b) => { const on_ = !b.classList.contains('active'); $('#wk-gear', root).querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); b.classList.toggle('active', on_); st.gear = on_ ? b.dataset.gear : ''; load(); });
  await load();
}
