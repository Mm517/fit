/** Weekly plan (screenshot 05): date strip, day sections, rest card, edit mode (reorder/delete). */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, confirmDialog, img } from '../ui/kit.js';
import { esc, $, $$, on, DAYS_AR, WEEK_ORDER, startOfWeek, addDays, isoDate } from '../utils.js';

export default async function plan({ root }) {
  root.innerHTML = skeleton('card', 3);
  let [p, map] = await Promise.all([api.getUserPlan(), api.exerciseMap()]);
  let edit = false, sel = new Date().getDay();
  const sow = startOfWeek(), todayIso = isoDate();
  const save = async () => { p = await api.saveUserPlan(p); toast(); };

  function render() {
    if (!p) { root.innerHTML = `<header class="page-head"><a class="icon-btn plain" href="#/" aria-label="رجوع">${icon('arrowBack', { size: 24 })}</a><h1>الجدول الأسبوعي</h1></header>${emptyState({ icon: 'calendar', title: 'لا يوجد جدول بعد', text: 'اطلب من المدرب جدولاً مناسباً لك.', action: 'اطلب جدولاً من المدرب', actionId: 'coach' })}`; return; }
    const strip = WEEK_ORDER.map((dow, i) => { const d = addDays(sow, i); return `<button class="pl-day ${dow === sel ? 'active' : ''}" data-dow="${dow}" aria-pressed="${dow === sel}"><span>${DAYS_AR[dow]}</span><b class="num">${d.getDate()}</b></button>`; }).join('');
    const sections = WEEK_ORDER.map((dow) => {
      const d = p.days.find((x) => x.dow === dow); if (!d) return '';
      if (d.rest) return `<section class="card pl-rest" id="day-${dow}"><span class="pl-sofa">${icon('sofa', { size: 34 })}</span><h3>يوم راحة</h3><p class="muted">استرح اليوم… فالأقوى قادم</p><a class="btn btn-primary btn-block" href="#/coach">عدّله بالمدرب</a></section>`;
      return `<section class="card pl-day-sec" id="day-${dow}"><h3 class="pl-sec-h">${DAYS_AR[dow]} - ${esc(d.label)} ${edit ? `<button class="icon-btn plain" data-label="${dow}" aria-label="تعديل الاسم">${icon('edit', { size: 18 })}</button>` : ''}</h3>
        ${d.items.map((it, i) => { const e = map[it.exercise_id]; if (!e) return '';
          return `<div class="pl-row"><div class="pl-thumb">${img(e.image, e.name_ar)}</div><a class="pl-info" href="#/exercise/${e.id}"><b>${esc(e.name_en)}</b><span class="muted small num">${it.sets} × ${esc(it.reps)}</span></a>
          ${edit ? `<div class="pl-ctl"><button class="icon-btn plain" data-up="${dow}:${i}" aria-label="للأعلى" ${i === 0 ? 'disabled' : ''}>${icon('up', { size: 18 })}</button><button class="icon-btn plain" data-down="${dow}:${i}" aria-label="للأسفل" ${i === d.items.length - 1 ? 'disabled' : ''}>${icon('down', { size: 18 })}</button><button class="icon-btn plain" data-rm="${dow}:${i}" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div>` : `<span class="pl-count num">+${it.sets}</span>`}</div>`; }).join('')}
        <button class="btn btn-primary btn-block" data-add="${dow}" style="margin-top:10px">${icon('arrow', { size: 18 })} إضافة تمرين</button></section>`;
    }).join('');
    root.innerHTML = `<header class="page-head center"><a class="icon-btn plain" href="#/" aria-label="رجوع">${icon('arrowBack', { size: 24 })}</a><h1>الجدول الأسبوعي</h1><button class="icon-btn ${edit ? 'lime' : ''}" id="pl-edit" aria-label="تعديل" aria-pressed="${edit}">${icon(edit ? 'check' : 'edit')}</button></header>
      <div class="pl-strip" id="pl-strip">${strip}</div><div class="pl-days">${sections}</div>`;
    root.querySelector(`#day-${sel}`)?.scrollIntoView?.({ block: 'nearest' });
  }
  render();
  on(root, 'click', '[data-act=coach]', () => { location.hash = '#/coach'; });
  on(root, 'click', '#pl-edit', () => { edit = !edit; render(); });
  on(root, 'click', '[data-dow]', (e, b) => { sel = +b.dataset.dow; $$('[data-dow]', root).forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); }); $(`#day-${sel}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const day = (dow) => p.days.find((d) => d.dow === +dow);
  const move = async (key, delta) => { const [dow, i] = key.split(':').map(Number); const a = day(dow).items; [a[i], a[i + delta]] = [a[i + delta], a[i]]; await save(); render(); };
  on(root, 'click', '[data-up]', (e, b) => move(b.dataset.up, -1));
  on(root, 'click', '[data-down]', (e, b) => move(b.dataset.down, 1));
  on(root, 'click', '[data-rm]', async (e, b) => {
    const [dow, i] = b.dataset.rm.split(':').map(Number);
    if (!(await confirmDialog({ title: 'حذف التمرين؟', message: 'سيتم حذفه من هذا اليوم.', confirmText: 'حذف', danger: true }))) return;
    day(dow).items.splice(i, 1); await save(); render();
  });
  on(root, 'click', '[data-label]', (e, b) => {
    const d = day(b.dataset.label);
    const s = openSheet({ title: 'اسم اليوم', html: `<div class="field"><input class="input" id="lbl" value="${esc(d.label)}" maxlength="40"></div><button class="btn btn-primary btn-block" id="ok" style="margin-top:12px">حفظ</button>`,
      onMount: (el, close) => { $('#ok', el).onclick = async () => { d.label = $('#lbl', el).value.trim() || d.label; close(); await save(); render(); }; } });
  });
  on(root, 'click', '[data-add]', async (e, b) => {
    const d = day(b.dataset.add); const all = await api.listExercises({});
    openSheet({ title: 'إضافة تمرين', html: `<div class="pl-pick">${all.map((x) => `<button class="pl-row pl-pickrow" data-pick="${x.id}"><div class="pl-thumb">${img(x.image, '')}</div><span class="pl-info"><b>${esc(x.name_en)}</b><span class="muted small">${esc(x.name_ar)} — ${esc(x.muscle)}</span></span>${icon('plus', { size: 20, cls: 'lime' })}</button>`).join('')}</div>`,
      onMount: (el, close) => on(el, 'click', '[data-pick]', async (ev, pb) => { const x = map[pb.dataset.pick]; d.items.push({ exercise_id: x.id, sets: x.sets, reps: x.reps }); close(); await save(); render(); }) });
  });
}
