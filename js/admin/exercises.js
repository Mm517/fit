/** Exercises: full CRUD (image upload, steps editor with reorder, publish toggle, duplicate). */
import * as api from '../data/api.js';
import { esc, icon, badge, thumb, sw, flipSwitch, loading, empty, pageHead, modal, confirmDlg, MUSCLES, EQUIP, DIFFS, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';
import { debounce } from '../utils.js';

export default async function exercises({ root }) {
  const st = { q: '', muscle: 'all', equipment: 'all', status: 'all' };
  const opts = (arr, all) => `<option value="all">${all}</option>${arr.map((x) => `<option>${x}</option>`).join('')}`;
  root.innerHTML = `${pageHead('التمارين', `<button class="btn btn-primary" id="add">${icon('plus', { size: 18 })} تمرين جديد</button>`, 'إدارة مكتبة التمارين المنشورة وغير المنشورة')}
    <div class="adm-toolbar"><div class="search-box">${icon('search', { size: 18 })}<input id="q" class="input" placeholder="ابحث عن تمرين..." aria-label="بحث"></div>
      <select id="muscle" class="input" aria-label="العضلة">${opts(MUSCLES, 'كل العضلات')}</select>
      <select id="equipment" class="input" aria-label="الأداة">${opts(EQUIP, 'كل الأدوات')}</select>
      <select id="status" class="input" aria-label="الحالة"><option value="all">كل الحالات</option><option value="pub">منشور</option><option value="draft">مسودة</option></select></div>
    <div id="list">${loading(6)}</div>`;
  let rows = [];

  async function load() {
    rows = await api.listExercises({ q: st.q, muscle: st.muscle, equipment: st.equipment, publishedOnly: false });
    if (st.status !== 'all') rows = rows.filter((e) => e.published === (st.status === 'pub'));
    $('#list', root).innerHTML = !rows.length ? empty('لا توجد تمارين', 'أضف أول تمرين أو غيّر الفلاتر', 'dumbbell') : `
      <div class="adm-tablewrap"><table><thead><tr><th scope="col">التمرين</th><th scope="col">العضلة</th><th scope="col">الأداة</th><th scope="col">الصعوبة</th><th scope="col">مجموعات × تكرار</th><th scope="col">منشور</th><th scope="col"><span class="sr-only">إجراءات</span></th></tr></thead><tbody>
      ${rows.map((e) => `<tr><td><div class="adm-user">${thumb(e.image)}<div><b>${esc(e.name_ar)}</b><small>${esc(e.name_en)}</small></div></div></td>
        <td>${badge(e.muscle, 'blue')}</td><td>${esc(e.equipment)}</td><td>${badge(e.difficulty, e.difficulty === 'سهل' ? 'lime' : e.difficulty === 'صعب' ? 'red' : 'orange')}</td>
        <td class="num">${e.sets} × ${esc(e.reps)}</td><td>${sw(e.published, `data-pub="${e.id}" aria-label="نشر ${esc(e.name_ar)}"`)}</td>
        <td><div class="adm-rowact"><button class="icon-btn" data-edit="${e.id}" aria-label="تعديل">${icon('edit', { size: 18 })}</button>
          <button class="icon-btn" data-dup="${e.id}" aria-label="تكرار">${icon('copy', { size: 18 })}</button>
          <button class="icon-btn" data-del="${e.id}" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }
  const re = debounce(load, 250);
  $('#q', root).addEventListener('input', (e) => { st.q = e.target.value.trim(); re(); });
  ['muscle', 'equipment', 'status'].forEach((k) => $('#' + k, root).addEventListener('change', (e) => { st[k] = e.target.value; load(); }));
  $('#add', root).onclick = () => form(null);

  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pub],[data-edit],[data-dup],[data-del]'); if (!t) return;
    if (t.dataset.pub) { const v = flipSwitch(t); await api.setExercisePublished(t.dataset.pub, v); toast(); }
    else if (t.dataset.edit) form(rows.find((x) => x.id === t.dataset.edit));
    else if (t.dataset.dup) { await api.duplicateExercise(t.dataset.dup); toast('تم تكرار التمرين كمسودة'); load(); }
    else if (t.dataset.del) {
      const ex = rows.find((x) => x.id === t.dataset.del);
      if (await confirmDlg({ title: 'حذف التمرين', message: `سيتم حذف «${ex.name_ar}» نهائياً. الجداول التي تحتويه لن تعرضه بعد الآن.`, confirmText: 'حذف' })) { await api.deleteExercise(ex.id); toast('تم حذف التمرين'); load(); }
    }
  });

  function form(ex) {
    const d = ex ? { ...ex, steps: [...(ex.steps || [])] } : { name_ar: '', name_en: '', muscle: 'صدر', equipment: 'بار', difficulty: 'متوسط', sets: 3, reps: '12-10', duration: 45, image: '', steps: [''], published: false };
    const sel = (id, arr, v) => `<select id="${id}" class="input">${arr.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    const m = modal({ title: ex ? 'تعديل التمرين' : 'تمرين جديد', wide: true, html: `<form class="adm-form" id="xf" novalidate>
      <div class="two"><div class="field"><label for="na">الاسم بالعربية *</label><input id="na" class="input" value="${esc(d.name_ar)}" maxlength="60"></div>
        <div class="field"><label for="ne">الاسم بالإنجليزية *</label><input id="ne" class="input" dir="ltr" value="${esc(d.name_en)}" maxlength="60"></div></div>
      <div class="three"><div class="field"><label for="mu">العضلة</label>${sel('mu', MUSCLES, d.muscle)}</div><div class="field"><label for="eq">الأداة</label>${sel('eq', EQUIP, d.equipment)}</div><div class="field"><label for="df">الصعوبة</label>${sel('df', DIFFS, d.difficulty)}</div></div>
      <div class="three"><div class="field"><label for="se">المجموعات</label><input id="se" type="number" min="1" max="20" class="input" value="${d.sets}"></div>
        <div class="field"><label for="re">التكرارات</label><input id="re" class="input" dir="ltr" value="${esc(d.reps)}" placeholder="12-10"></div>
        <div class="field"><label for="du">المدة (دقيقة)</label><input id="du" type="number" min="1" class="input" value="${d.duration || 45}"></div></div>
      <div class="field"><label>الصورة</label><img class="adm-imgprev" id="ip" src="${esc(d.image || 'assets/img/ex-default.svg')}" alt="معاينة" onerror="this.onerror=null;this.src='assets/img/ex-default.svg'">
        <div class="two"><input id="if" type="file" accept="image/*" class="input" aria-label="رفع صورة"><input id="iu" class="input" dir="ltr" placeholder="أو رابط الصورة" value="${esc(d.image?.startsWith('data:') ? '' : d.image || '')}"></div></div>
      <div class="field"><label>الخطوات</label><div class="adm-steps" id="steps"></div><button type="button" class="btn btn-outline btn-sm" id="as">${icon('plus', { size: 16 })} إضافة خطوة</button></div>
      <div class="adm-row"><b>منشور للمستخدمين</b>${sw(d.published, 'id="pb" aria-label="منشور"')}</div>
      <p class="adm-err" id="er" role="alert" hidden></p>
      <div class="adm-formfoot"><button type="button" class="btn btn-outline" data-close2>إلغاء</button><button class="btn btn-primary">حفظ</button></div></form>` });
    const f = $('#xf', m.el);
    $('[data-close2]', f).onclick = m.close;
    const paintSteps = () => {
      $('#steps', f).innerHTML = d.steps.map((s, i) => `<div class="adm-step" draggable="true" data-i="${i}"><span class="grip" aria-hidden="true">${icon('drag', { size: 18 })}</span><span class="n">${i + 1}</span>
        <textarea class="input" aria-label="الخطوة ${i + 1}" data-s="${i}">${esc(s)}</textarea>
        <div><button type="button" class="icon-btn plain" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="للأعلى">${icon('up', { size: 18 })}</button><button type="button" class="icon-btn plain" data-dn="${i}" ${i === d.steps.length - 1 ? 'disabled' : ''} aria-label="للأسفل">${icon('down', { size: 18 })}</button>
        <button type="button" class="icon-btn plain" data-rm="${i}" aria-label="حذف" style="color:var(--red)">${icon('x', { size: 18 })}</button></div></div>`).join('');
    };
    paintSteps();
    const sync = () => $$('[data-s]', f).forEach((t) => { d.steps[+t.dataset.s] = t.value; });
    f.addEventListener('click', (e) => {
      const b = e.target.closest('[data-up],[data-dn],[data-rm]'); if (!b) return; sync();
      const i = +(b.dataset.up ?? b.dataset.dn ?? b.dataset.rm);
      if (b.dataset.rm !== undefined) d.steps.splice(i, 1); else { const j = b.dataset.up !== undefined ? i - 1 : i + 1; [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]]; }
      paintSteps();
    });
    $('#as', f).onclick = () => { sync(); d.steps.push(''); paintSteps(); $$('[data-s]', f).at(-1).focus(); };
    let from = null; // drag & drop reorder
    f.addEventListener('dragstart', (e) => { const s = e.target.closest('.adm-step'); if (s) { from = +s.dataset.i; e.dataTransfer.effectAllowed = 'move'; } });
    f.addEventListener('dragover', (e) => { const s = e.target.closest('.adm-step'); if (s && from !== null) { e.preventDefault(); $$('.adm-step', f).forEach((x) => x.classList.toggle('drag-over', x === s)); } });
    f.addEventListener('drop', (e) => { const s = e.target.closest('.adm-step'); if (!s || from === null) return; e.preventDefault(); sync(); const [it] = d.steps.splice(from, 1); d.steps.splice(+s.dataset.i, 0, it); from = null; paintSteps(); });
    f.addEventListener('dragend', () => { from = null; $$('.adm-step', f).forEach((x) => x.classList.remove('drag-over')); });
    $('#if', f).onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { d.image = await api.uploadImage(file); $('#ip', f).src = d.image; $('#iu', f).value = ''; } catch { toast('تعذّر رفع الصورة', { type: 'error' }); } };
    $('#iu', f).oninput = (e) => { d.image = e.target.value.trim(); $('#ip', f).src = d.image || 'assets/img/ex-default.svg'; };
    $('#pb', f).onclick = (e) => { d.published = flipSwitch(e.currentTarget); };
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); sync();
      const err = $('#er', f), val = (id) => $('#' + id, f).value.trim();
      const steps = d.steps.map((s) => s.trim()).filter(Boolean);
      const msg = !val('na') ? 'أدخل الاسم بالعربية' : !val('ne') ? 'أدخل الاسم بالإنجليزية' : !(+val('se') >= 1) ? 'عدد المجموعات غير صحيح' : !val('re') ? 'أدخل التكرارات' : !steps.length ? 'أضف خطوة واحدة على الأقل' : '';
      err.hidden = !msg; err.textContent = msg; if (msg) return;
      await api.saveExercise({ ...(ex ? { id: ex.id } : {}), name_ar: val('na'), name_en: val('ne'), muscle: val('mu'), equipment: val('eq'), difficulty: val('df'), sets: +val('se'), reps: val('re'), duration: +val('du') || 45, image: d.image || '', steps, published: d.published });
      toast(); m.close(); load();
    });
  }
  await load();
}
