/** Plan templates: CRUD for ready-made weekly plans the AI coach picks from (create_plan tool). */
import * as api from '../data/api.js';
import { esc, icon, badge, sw, flipSwitch, loading, empty, pageHead, modal, confirmDlg, MUSCLES, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';

export default async function templates({ root }) {
  root.innerHTML = `${pageHead('قوالب الخطط', `<button class="btn btn-primary" id="add">${icon('plus', { size: 18 })} قالب جديد</button>`, 'يختار المدرب الذكي من هذه القوالب عند طلب «اعملي جدول N أيام»')}<div id="list">${loading(4)}</div>`;
  let list = [], map = {};
  async function load() {
    [list, map] = await Promise.all([api.listTemplates(), api.exerciseMap()]);
    $('#list', root).innerHTML = !list.length ? empty('لا توجد قوالب', 'أضف قالباً ليستخدمه المدرب', 'layers') : `<div class="adm-grid3">${list.map((t) => `
      <article class="card"><div class="adm-row"><h3>${esc(t.name)}</h3>${sw(t.published, `data-pub="${t.id}" aria-label="نشر ${esc(t.name)}"`)}</div>
        <div class="adm-chips" style="margin:8px 0">${badge(t.goal || 'عام', 'blue')}${badge(`${t.days.length} أيام`, 'lime')}</div>
        ${t.days.map((d) => `<p class="small"><b>${esc(d.label)}</b> <span class="muted">— ${d.exercise_ids.length} تمارين</span></p>`).join('')}
        <div class="adm-rowact" style="margin-top:10px"><button class="icon-btn" data-edit="${t.id}" aria-label="تعديل">${icon('edit', { size: 18 })}</button><button class="icon-btn" data-del="${t.id}" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div></article>`).join('')}</div>`;
  }
  $('#add', root).onclick = () => form(null);
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pub],[data-edit],[data-del]'); if (!t) return;
    if (t.dataset.pub) { const tpl = list.find((x) => x.id === t.dataset.pub); await api.saveTemplate({ ...tpl, published: flipSwitch(t) }); toast(); }
    else if (t.dataset.edit) form(list.find((x) => x.id === t.dataset.edit));
    else { const tpl = list.find((x) => x.id === t.dataset.del); if (await confirmDlg({ title: 'حذف القالب', message: `حذف «${tpl.name}»؟ الجداول المطبقة سابقاً لن تتأثر.`, confirmText: 'حذف' })) { await api.deleteTemplate(tpl.id); toast('تم حذف القالب'); load(); } }
  });

  async function form(tpl) {
    const all = await api.listExercises({ publishedOnly: false });
    const d = tpl ? JSON.parse(JSON.stringify(tpl)) : { name: '', goal: 'تضخيم العضلات', published: true, days: [{ label: 'يوم 1', muscles: [], exercise_ids: [] }] };
    const m = modal({ title: tpl ? 'تعديل القالب' : 'قالب جديد', wide: true, html: '<form class="adm-form" id="tf" novalidate></form>' });
    const f = $('#tf', m.el);
    const paint = () => {
      f.innerHTML = `<div class="two"><div class="field"><label for="tn">اسم القالب *</label><input id="tn" class="input" value="${esc(d.name)}" maxlength="60"></div>
        <div class="field"><label for="tg">الهدف</label><select id="tg" class="input">${['تضخيم العضلات', 'خسارة الوزن', 'لياقة عامة', 'زيادة القوة'].map((g) => `<option ${g === d.goal ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
        <div class="adm-steps">${d.days.map((day, i) => `<section class="adm-day" data-d="${i}">
          <div class="adm-row"><input class="input" data-lbl="${i}" value="${esc(day.label)}" aria-label="اسم اليوم ${i + 1}" style="max-width:320px">
            <div><button type="button" class="icon-btn plain" data-dup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="للأعلى">${icon('up', { size: 18 })}</button><button type="button" class="icon-btn plain" data-ddn="${i}" ${i === d.days.length - 1 ? 'disabled' : ''} aria-label="للأسفل">${icon('down', { size: 18 })}</button>
            <button type="button" class="icon-btn plain" data-drm="${i}" aria-label="حذف اليوم" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div></div>
          <div class="adm-chips">${day.exercise_ids.map((id, j) => `<span class="adm-exchip">${esc(map[id]?.name_ar || id)}<button type="button" data-xup="${i}:${j}" aria-label="تقديم">${icon('chevron', { size: 14, cls: '' })}</button><button type="button" data-xrm="${i}:${j}" aria-label="إزالة">${icon('x', { size: 14 })}</button></span>`).join('') || '<span class="muted small">لا توجد تمارين</span>'}</div>
          <select class="input" data-addx="${i}" aria-label="إضافة تمرين"><option value="">+ إضافة تمرين...</option>${all.map((x) => `<option value="${x.id}">${esc(x.name_ar)} — ${esc(x.muscle)}</option>`).join('')}</select></section>`).join('')}</div>
        <button type="button" class="btn btn-outline btn-sm" id="ad">${icon('plus', { size: 16 })} إضافة يوم</button>
        <div class="adm-row"><b>منشور (متاح للمدرب)</b>${sw(d.published, 'id="tp" aria-label="منشور"')}</div><p class="adm-err" id="er" role="alert" hidden></p>
        <div class="adm-formfoot"><button type="button" class="btn btn-outline" data-c>إلغاء</button><button class="btn btn-primary">حفظ</button></div>`;
      $('[data-c]', f).onclick = m.close;
    };
    const sync = () => { d.name = $('#tn', f).value; d.goal = $('#tg', f).value; $$('[data-lbl]', f).forEach((i) => { d.days[+i.dataset.lbl].label = i.value; }); };
    const swap = (a, i, j) => { [a[i], a[j]] = [a[j], a[i]]; };
    paint();
    f.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const ds = b.dataset; sync();
      if (ds.dup !== undefined) swap(d.days, +ds.dup, +ds.dup - 1);
      else if (ds.ddn !== undefined) swap(d.days, +ds.ddn, +ds.ddn + 1);
      else if (ds.drm !== undefined) d.days.splice(+ds.drm, 1);
      else if (ds.xrm) { const [i, j] = ds.xrm.split(':').map(Number); d.days[i].exercise_ids.splice(j, 1); }
      else if (ds.xup) { const [i, j] = ds.xup.split(':').map(Number); if (j > 0) swap(d.days[i].exercise_ids, j, j - 1); }
      else if (b.id === 'ad') d.days.push({ label: `يوم ${d.days.length + 1}`, muscles: [], exercise_ids: [] });
      else return;
      paint();
    });
    f.addEventListener('change', (e) => {
      if (e.target.dataset.addx !== undefined && e.target.value) { sync(); const day = d.days[+e.target.dataset.addx]; day.exercise_ids.push(e.target.value); day.muscles = [...new Set(day.exercise_ids.map((id) => map[id]?.muscle).filter(Boolean))]; paint(); }
    });
    f.addEventListener('click', (e) => { const t = e.target.closest('#tp'); if (t) d.published = flipSwitch(t); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); sync();
      const msg = !d.name.trim() ? 'أدخل اسم القالب' : !d.days.length ? 'أضف يوماً واحداً على الأقل' : d.days.some((x) => !x.exercise_ids.length) ? 'كل يوم يحتاج تمريناً واحداً على الأقل' : '';
      const er = $('#er', f); er.hidden = !msg; er.textContent = msg; if (msg) return;
      await api.saveTemplate({ ...d, name: d.name.trim(), days_count: d.days.length });
      toast(); m.close(); load();
    });
  }
  await load();
}
