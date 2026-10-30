/** Exercise detail (screenshot 04): hero, tabs, numbered steps, log form. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, stepper, bindSteppers, readSteppers, img, emptyState } from '../ui/kit.js';
import { esc, $, on, timeAgo } from '../utils.js';

export default async function exercise({ root, params }) {
  root.innerHTML = skeleton('card', 3);
  const ex = await api.getExercise(params.id);
  if (!ex) { root.innerHTML = emptyState({ icon: 'dumbbell', title: 'التمرين غير موجود', action: 'العودة للتمارين', actionId: 'back' }); root.querySelector('[data-act=back]').onclick = () => { location.hash = '#/workouts'; }; return; }
  const sets = []; let tab = 'steps';
  let logs = await api.listLogs({ exercise_id: ex.id, limit: 5 });
  const baseW = logs[0]?.sets?.[0]?.weight ?? 20;

  const logsHTML = () => logs.length ? logs.map((l) => `<div class="ex-log"><span>${timeAgo(l.created_at)}</span><b class="num">${l.sets.length} × ${l.sets[0]?.reps ?? 0}${l.sets[0]?.weight ? ` — ${l.sets[0].weight} كجم` : ''}</b></div>`).join('') : '<p class="muted small">لا توجد تسجيلات سابقة.</p>';
  const setsHTML = () => sets.map((s, i) => `<div class="ex-set"><span class="lime bold">${i + 1}</span><span class="num">${s.reps} تكرار × ${s.weight} كجم</span><button class="icon-btn plain" data-del="${i}" aria-label="حذف المجموعة">${icon('x', { size: 18 })}</button></div>`).join('');

  function render() {
    root.innerHTML = `
      <section class="ex-hero">${img(ex.image, ex.name_ar)}<div class="ex-hero-fade"></div>
        <a class="icon-btn ex-back" href="#/workouts" aria-label="رجوع">${icon('arrowBack', { size: 22 })}</a></section>
      <div class="ex-pad">
        <h1 class="ex-en">${esc(ex.name_en)}</h1><p class="ex-ar">${esc(ex.name_ar)}</p>
        <div class="ex-tags"><span class="tag tag-blue">${esc(ex.muscle)}</span><span class="tag diff-${esc(ex.difficulty)}">${esc(ex.difficulty)}</span><span class="tag tag-orange num">${ex.sets} × ${esc(ex.reps)}</span></div>
        <div class="seg" role="tablist" style="margin:16px 0"><button role="tab" data-tab="steps" class="${tab === 'steps' ? 'active' : ''}">الخطوات</button><button role="tab" data-tab="details" class="${tab === 'details' ? 'active' : ''}">التفاصيل</button></div>
        <div id="ex-tab"></div>
        <section class="card ex-log-card"><h3>سجّل تمرينك</h3>
          <div class="ex-steppers">
            <div class="field"><label>المجموعات</label>${stepper({ name: 'sets', value: ex.sets, min: 1, max: 20 })}</div>
            <div class="field"><label>التكرارات</label>${stepper({ name: 'reps', value: parseInt(ex.reps) || 10, min: 1, max: 100 })}</div>
            <div class="field"><label>الوزن (كجم)</label>${stepper({ name: 'weight', value: baseW, min: 0, max: 500, step: 1 })}</div>
          </div>
          <div class="field" style="margin-top:10px"><label>الراحة بين المجموعات (ثانية)</label>${stepper({ name: 'rest', value: 60, min: 0, max: 600, step: 15 })}</div>
          <div id="ex-sets">${setsHTML()}</div>
          <button class="btn btn-primary btn-block" id="add-set" style="margin-top:12px">${icon('plus', { size: 18 })} إضافة مجموعة</button>
          <button class="btn btn-outline btn-block" id="save-log" style="margin-top:10px;border-color:var(--lime);color:var(--lime)" ${sets.length ? '' : 'hidden'}>حفظ التمرين</button>
        </section>
        <h2 class="h-sec">آخر تسجيلاتك</h2><div id="ex-logs" class="card card--flat">${logsHTML()}</div>
      </div>`;
    renderTab();
  }
  function renderTab() {
    $('#ex-tab', root).innerHTML = tab === 'steps'
      ? (ex.steps || []).map((s, i) => `<div class="card ex-step"><span class="ex-n">${i + 1}</span><p>${esc(s)}</p></div>`).join('')
      : `<div class="card ex-details">${[['العضلة', ex.muscle], ['الأداة', ex.equipment], ['الصعوبة', ex.difficulty], ['المجموعات × التكرار', `${ex.sets} × ${ex.reps}`], ['المدة التقريبية', `${ex.duration || 45} دقيقة`]].map(([k, v]) => `<div class="list-row"><span class="muted">${k}</span><b style="margin-inline-start:auto">${esc(v)}</b></div>`).join('')}</div>`;
  }
  render();
  bindSteppers(root);
  on(root, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b)); renderTab(); });
  on(root, 'click', '#add-set', () => {
    const v = readSteppers(root); const n = v.sets || 1;
    for (let i = 0; i < 1; i++) sets.push({ reps: v.reps, weight: v.weight });
    $('#ex-sets', root).innerHTML = setsHTML(); $('#save-log', root).hidden = false;
  });
  on(root, 'click', '[data-del]', (e, b) => { sets.splice(+b.dataset.del, 1); $('#ex-sets', root).innerHTML = setsHTML(); $('#save-log', root).hidden = !sets.length; });
  on(root, 'click', '#save-log', async (e, b) => {
    b.disabled = true;
    await api.addLog({ exercise_id: ex.id, sets: sets.map((s) => ({ ...s })) });
    sets.length = 0; logs = await api.listLogs({ exercise_id: ex.id, limit: 5 });
    $('#ex-sets', root).innerHTML = ''; $('#ex-logs', root).innerHTML = logsHTML(); b.hidden = true; b.disabled = false;
    toast('تم حفظ التغييرات بنجاح');
  });
}
