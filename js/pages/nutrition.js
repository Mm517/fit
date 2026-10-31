/**
 * Nutrition: daily calories/macros, AI meal analysis from a PHOTO and/or text, meal diary, 7-day chart,
 * and a nutrition chat that understands photos. The model runs in the `nutrition` Edge Function (see ai/nutrition.js).
 */
import * as api from '../data/api.js';
import { analyzeMeal, askNutrition, goalsFor, guessMealType, MEAL_TYPES } from '../ai/nutrition.js';
import { icon } from '../ui/icons.js';
import { toast, openSheet, confirmDialog, ring, img } from '../ui/kit.js';
import { esc, $, on, isoDate, addDays, fmtNum } from '../utils.js';

const CHAT_KEY = 'fc:nutri-chat';
const SUGGESTIONS = ['اقترح لي عشاء عالي بروتين', 'إيه أحسن أكل بعد التمرين؟', 'ازاي أزود البروتين من غير مكملات؟'];
const r1 = (n) => Math.round((+n || 0) * 10) / 10;
const dayLabel = (iso) => {
  const today = isoDate(), yest = isoDate(addDays(new Date(), -1));
  if (iso === today) return 'النهارده';
  if (iso === yest) return 'امبارح';
  return new Date(`${iso}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
};
const conf = { high: ['دقة عالية', 'tag-lime'], medium: ['دقة متوسطة', 'tag-blue'], low: ['تقدير تقريبي', 'tag-orange'] };

export default async function nutrition({ root, query }) {
  let me = await api.currentUser();
  let date = isoDate();
  let meals = [];
  let pending = null;          // { file, preview } photo waiting for analysis
  let result = null;           // analysis result being reviewed
  let chatFile = null;
  let busy = false, chatBusy = false, alive = true;
  let chat = [];
  try { chat = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]'); } catch { chat = []; }

  root.innerHTML = `
    <header class="page-head"><h1>التغذية</h1><span class="grow"></span>
      <button class="icon-btn" id="nu-goal" aria-label="هدف السعرات">${icon('target', { size: 22 })}</button></header>
    <div class="seg nu-tabs" role="tablist"><button class="active" data-tab="main" role="tab">وجباتي</button><button data-tab="chat" role="tab">اسأل الخبير</button></div>
    <div class="nu-grid">
      <div class="nu-main" data-pane="main">
        <section class="card nu-sum" id="nu-sum" aria-label="ملخص اليوم"></section>
        <section class="card card--lime nu-add" aria-label="تحليل وجبة">
          <div class="nu-add-head"><span class="nu-ai">${icon('spark', { size: 16 })} ذكاء اصطناعي</span><h2>حلّل وجبتك</h2></div>
          <p class="muted small">صوّر طبقك أو ارفع صورة، وأنا أقدّر المكونات والسعرات والبروتين. تقدر كمان تكتب وصف الوجبة.</p>
          <div class="nu-drop" id="nu-drop">
            <input type="file" id="nu-file" accept="image/*" hidden>
            <button class="nu-pick" id="nu-pick" type="button">${icon('camera', { size: 30 })}<b>صوّر أو اختر صورة</b><span class="muted xs">أي صورة · بتتحوّل WebP</span></button>
            <div class="nu-prev" id="nu-prev" hidden></div>
          </div>
          <div class="co-form nu-form"><input class="input" id="nu-text" maxlength="300" placeholder="أو اكتب: ٢ رغيف عيش وفول وبيضتين" autocomplete="off"><button class="btn btn-primary" id="nu-go" type="button">${icon('spark', { size: 18 })} حلّل</button></div>
          <div id="nu-result"></div>
          <button class="btn btn-ghost btn-sm nu-manual" id="nu-manual" type="button">${icon('plus', { size: 16 })} إضافة وجبة يدوياً</button>
        </section>
        <h2 class="h-sec" style="justify-content:flex-start">وجبات <span id="nu-day-t"></span></h2>
        <div id="nu-meals"></div>
        <h2 class="h-sec">آخر ٧ أيام</h2>
        <section class="card nu-week" id="nu-week"></section>
      </div>
      <aside class="card nu-chat" data-pane="chat" aria-label="خبير التغذية">
        <header class="nu-chat-head"><span class="co-bot-av">${icon('apple', { size: 20 })}</span><div><b>خبير التغذية</b><small class="muted xs">بيفهم الصور · معلومات تقريبية وليست نصيحة طبية</small></div>
          <button class="icon-btn plain" id="nu-clear" aria-label="مسح المحادثة">${icon('trash', { size: 18 })}</button></header>
        <div class="nu-msgs" id="nu-msgs" role="log" aria-live="polite"></div>
        <div class="chips co-chips nu-chips" id="nu-chips"></div>
        <div class="nu-cprev" id="nu-cprev" hidden></div>
        <form class="co-form nu-cform" id="nu-cform"><input type="file" id="nu-cfile" accept="image/*" hidden>
          <button class="icon-btn" id="nu-cattach" type="button" aria-label="إرفاق صورة">${icon('image', { size: 22 })}</button>
          <input class="input" id="nu-cin" placeholder="اسأل عن أكلك أو ابعت صورة..." maxlength="600" autocomplete="off" enterkeyhint="send" aria-label="رسالة">
          <button class="co-send" aria-label="إرسال">${icon('send', { size: 22, cls: 'rtl-flip' })}</button></form>
      </aside>
    </div>`;

  // ------------------------------------------------------------------ tabs (mobile only; both panes show on desktop)
  const grid = $('.nu-grid', root);
  on(root, 'click', '[data-tab]', (e, b) => {
    root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
    grid.dataset.show = b.dataset.tab;
    if (b.dataset.tab === 'chat') scrollChat();
  });
  grid.dataset.show = 'main';

  // ------------------------------------------------------------------ summary + meals
  const totals = () => meals.reduce((t, m) => ({ calories: t.calories + m.calories, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  function macroRow(label, v, goal, cls) {
    const pct = Math.min(100, Math.round((v / Math.max(1, goal)) * 100));
    return `<div class="nu-macro"><div class="nu-macro-top"><span>${label}</span><span class="num muted">${fmtNum(Math.round(v))} / ${fmtNum(Math.round(goal))} جم</span></div><div class="nu-bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
  }
  function renderSummary() {
    const g = goalsFor(me), t = totals(), left = g.calories - t.calories;
    const pct = Math.min(100, Math.round((t.calories / g.calories) * 100));
    const isToday = date === isoDate();
    $('#nu-sum', root).innerHTML = `
      <div class="nu-daynav"><button class="icon-btn plain" data-day="-1" aria-label="اليوم السابق">${icon('arrowBack', { size: 22 })}</button><b>${esc(dayLabel(date))}</b>
        <button class="icon-btn plain" data-day="1" ${isToday ? 'disabled' : ''} aria-label="اليوم التالي">${icon('arrow', { size: 22 })}</button></div>
      <div class="nu-sum-row">
        <div class="nu-ring">${ring(pct, { size: 128, stroke: 12, label: false })}<div class="nu-ring-in"><b class="num">${fmtNum(t.calories)}</b><span class="muted xs">من ${fmtNum(g.calories)} سعرة</span></div></div>
        <div class="nu-macros">
          ${macroRow('بروتين', t.protein, g.protein, 'p')}
          ${macroRow('كربوهيدرات', t.carbs, (g.calories * 0.45) / 4, 'c')}
          ${macroRow('دهون', t.fat, (g.calories * 0.3) / 9, 'f')}
        </div>
      </div>
      <p class="nu-left ${left < 0 ? 'over' : ''}">${left >= 0 ? `متبقي <b class="num">${fmtNum(left)}</b> سعرة` : `زيادة <b class="num">${fmtNum(-left)}</b> سعرة عن هدفك`}${g.estimated ? ' <span class="muted xs">(هدف تقديري، اضغط على الهدف لتغييره)</span>' : ''}</p>`;
    $('#nu-day-t', root).textContent = isToday ? 'النهارده' : '';
  }
  function renderMeals() {
    const box = $('#nu-meals', root);
    if (!meals.length) { box.innerHTML = `<div class="card card--flat empty nu-empty">${icon('utensils', { size: 44, stroke: 1.4 })}<h3>لسه ما سجلتش أكل</h3><p class="muted">صوّر وجبتك أو اكتب وصفها فوق وهتتسجل هنا.</p></div>`; return; }
    box.innerHTML = `<div class="nu-meal-list">${meals.map((m) => `<article class="card nu-meal">
      <div class="nu-thumb">${m.image ? img(m.image, m.title, '', 'assets/img/ex-default.svg') : icon('utensils', { size: 26 })}</div>
      <div class="nu-meal-body"><div class="nu-meal-top"><b>${esc(m.title)}</b><span class="tag tag-mut">${esc(MEAL_TYPES[m.meal_type] || 'سناك')}</span>${m.source === 'ai' ? `<span class="tag tag-lime">AI</span>` : ''}</div>
        <div class="muted small nu-macros-line"><span class="num">${fmtNum(m.calories)}</span> سعرة · بروتين <span class="num">${r1(m.protein)}</span> · كارب <span class="num">${r1(m.carbs)}</span> · دهون <span class="num">${r1(m.fat)}</span></div>
        ${m.items?.length ? `<div class="muted xs nu-items">${m.items.map((i) => esc(i.name)).join('، ')}</div>` : ''}</div>
      <button class="icon-btn plain" data-del="${esc(m.id)}" aria-label="حذف الوجبة">${icon('trash', { size: 18 })}</button></article>`).join('')}</div>`;
  }
  async function renderWeek() {
    const from = isoDate(addDays(new Date(), -6)), to = isoDate();
    let tot = {}; try { tot = await api.mealTotals(from, to); } catch { /* ignore */ }
    if (!alive) return;
    const g = goalsFor(me), days = Array.from({ length: 7 }, (_, i) => isoDate(addDays(new Date(), i - 6)));
    const max = Math.max(g.calories * 1.25, ...days.map((d) => tot[d]?.calories || 0));
    $('#nu-week', root).innerHTML = `<div class="nu-bars">${days.map((d) => {
      const v = tot[d]?.calories || 0, h = Math.round((v / max) * 100);
      const name = new Date(`${d}T12:00:00`).toLocaleDateString('ar-EG', { weekday: 'short' });
      return `<button class="nu-col ${d === date ? 'sel' : ''}" data-pick-day="${d}" aria-label="${esc(name)}: ${v} سعرة"><span class="num xs muted">${v ? fmtNum(v) : ''}</span><span class="nu-col-bar"><i class="${v > g.calories ? 'over' : ''}" style="height:${Math.max(v ? 6 : 2, h)}%"></i></span><span class="xs">${esc(name)}</span></button>`;
    }).join('')}</div><div class="nu-goal-line muted xs">خط الهدف: <span class="num">${fmtNum(g.calories)}</span> سعرة</div>`;
  }
  async function loadDay() {
    try { meals = await api.listMeals(date); } catch (e) { console.warn('[meals]', e); toast('تعذّر تحميل الوجبات', { type: 'error' }); meals = []; }
    if (!alive) return;
    renderSummary(); renderMeals(); renderWeek();
  }

  on(root, 'click', '[data-day]', (e, b) => {
    const next = isoDate(addDays(new Date(`${date}T12:00:00`), +b.dataset.day));
    if (next > isoDate()) return; date = next; loadDay();
  });
  on(root, 'click', '[data-pick-day]', (e, b) => { date = b.dataset.pickDay; loadDay(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  on(root, 'click', '[data-del]', async (e, b) => {
    if (!(await confirmDialog({ title: 'حذف الوجبة؟', message: 'هتتشال من يومك.', confirmText: 'حذف', danger: true }))) return;
    try { await api.deleteMeal(b.dataset.del); await loadDay(); toast('تم الحذف'); } catch { toast('تعذّر الحذف', { type: 'error' }); }
  });

  // ------------------------------------------------------------------ goals sheet
  on(root, 'click', '#nu-goal', () => {
    const g = goalsFor(me);
    openSheet({ title: 'هدفك اليومي', html: `<div style="display:grid;gap:12px">
      <div class="field"><label for="g-c">السعرات في اليوم</label><input id="g-c" class="input num" type="number" inputmode="numeric" min="800" max="6000" value="${g.calories}"></div>
      <div class="field"><label for="g-p">البروتين (جرام)</label><input id="g-p" class="input num" type="number" inputmode="numeric" min="20" max="400" value="${g.protein}"></div>
      <p class="muted xs">التقدير الافتراضي بيعتمد على وزنك وهدفك. للحالات الصحية الخاصة استشر أخصائي تغذية.</p>
      <button class="btn btn-primary btn-block" id="g-ok">حفظ</button></div>`,
    onMount: (el, close) => { $('#g-ok', el).onclick = async () => {
      const c = Math.round(+$('#g-c', el).value), p = Math.round(+$('#g-p', el).value);
      if (!(c >= 800 && c <= 6000) || !(p >= 20 && p <= 400)) return toast('السعرات بين 800 و6000 والبروتين بين 20 و400', { type: 'error' });
      try { me = await api.updateProfile({ calorie_goal: c, protein_goal: p }); close(); renderSummary(); renderWeek(); toast(); } catch { toast('تعذّر الحفظ', { type: 'error' }); }
    }; } });
  });

  // ------------------------------------------------------------------ analyze: photo + text
  const fileIn = $('#nu-file', root), prev = $('#nu-prev', root), pickBtn = $('#nu-pick', root);
  pickBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('اختر ملف صورة', { type: 'error' }); fileIn.value = ''; return; }
    pending = { file: f, preview: URL.createObjectURL(f) };
    prev.hidden = false; pickBtn.hidden = true;
    prev.innerHTML = `<img src="${pending.preview}" alt="صورة الوجبة"><button class="icon-btn cm-rm" id="nu-rm" type="button" aria-label="إزالة الصورة">${icon('x', { size: 18 })}</button>`;
  });
  on(root, 'click', '#nu-rm', clearPhoto);
  function clearPhoto() { if (pending?.preview) URL.revokeObjectURL(pending.preview); pending = null; fileIn.value = ''; prev.hidden = true; prev.innerHTML = ''; pickBtn.hidden = false; }

  const medal = (c) => { const [t, k] = conf[c] || conf.medium; return `<span class="tag ${k}">${t}</span>`; };
  function renderResult() {
    const box = $('#nu-result', root);
    if (!result) { box.innerHTML = ''; return; }
    if (!result.is_food) { box.innerHTML = `<div class="nu-note warn">${icon('info', { size: 18 })}<span>${esc(result.note || 'ما لقيتش أكل واضح.')}</span></div>`; return; }
    const m = result.meal;
    box.innerHTML = `<div class="nu-res">
      <div class="nu-res-top"><input class="input nu-title" id="r-title" maxlength="80" value="${esc(m.title)}" aria-label="اسم الوجبة">${medal(m.confidence)}</div>
      <div class="seg nu-types" id="r-types">${Object.entries(MEAL_TYPES).map(([k, v]) => `<button type="button" data-mt="${k}" class="${(m.meal_type || guessMealType()) === k ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="nu-nums">
        <label class="field"><span class="label">سعرات</span><input class="input num" id="r-cal" type="number" min="0" max="5000" value="${m.calories}"></label>
        <label class="field"><span class="label">بروتين</span><input class="input num" id="r-pro" type="number" min="0" max="300" step="0.1" value="${m.protein}"></label>
        <label class="field"><span class="label">كارب</span><input class="input num" id="r-car" type="number" min="0" max="600" step="0.1" value="${m.carbs}"></label>
        <label class="field"><span class="label">دهون</span><input class="input num" id="r-fat" type="number" min="0" max="300" step="0.1" value="${m.fat}"></label></div>
      ${m.items?.length ? `<ul class="nu-its">${m.items.map((i) => `<li><span>${esc(i.name)}</span><span class="muted num">${i.grams ? `${fmtNum(i.grams)} جم · ` : ''}${fmtNum(i.calories)} سعرة</span></li>`).join('')}</ul>` : ''}
      ${m.note ? `<div class="nu-note">${icon('info', { size: 18 })}<span>${esc(m.note)}</span></div>` : ''}
      <div class="nu-res-act"><button class="btn btn-primary" id="r-save" type="button">${icon('check', { size: 18 })} أضف لوجبات ${date === isoDate() ? 'النهارده' : esc(dayLabel(date))}</button><button class="btn btn-outline" id="r-drop" type="button">تجاهل</button></div></div>`;
  }
  on(root, 'click', '[data-mt]', (e, b) => { $('#r-types', root).querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); });
  on(root, 'click', '#r-drop', () => { result = null; renderResult(); });

  async function runAnalyze() {
    if (busy) return;
    const text = $('#nu-text', root).value;
    if (!text.trim() && !pending) return toast('صوّر الوجبة أو اكتب وصفها', { type: 'error' });
    busy = true; const go = $('#nu-go', root); go.disabled = true; go.innerHTML = 'بحلّل...';
    $('#nu-result', root).innerHTML = `<div class="nu-loading" aria-busy="true"><i></i><i></i><i></i><span>بقرأ الطبق وبحسب السعرات...</span></div>`;
    try {
      result = await analyzeMeal({ text, file: pending?.file || null });
      result.file = pending?.file || null;
      renderResult();
    } catch (er) { result = null; $('#nu-result', root).innerHTML = ''; toast(er.message || 'تعذّر التحليل', { type: 'error', ms: 4200 }); }
    busy = false; go.disabled = false; go.innerHTML = `${icon('spark', { size: 18 })} حلّل`;
  }
  $('#nu-go', root).addEventListener('click', runAnalyze);
  $('#nu-text', root).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runAnalyze(); } });

  function dataUrlToFile(url, name = 'meal.webp') {
    const [head, b64] = url.split(','); const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
    const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: mime });
  }
  on(root, 'click', '#r-save', async (e, btn) => {
    if (!result?.is_food || btn.disabled) return;
    btn.disabled = true;
    const m = result.meal;
    const body = {
      title: $('#r-title', root).value, meal_type: $('#r-types .active', root)?.dataset.mt || 'snack', date,
      calories: $('#r-cal', root).value, protein: $('#r-pro', root).value, carbs: $('#r-car', root).value, fat: $('#r-fat', root).value,
      items: m.items || [], source: result.provider === 'local' ? 'manual' : 'ai', note: m.note || '',
    };
    try {
      if (result.preview) { try { body.image = await api.uploadImage(dataUrlToFile(result.preview), { kind: 'meal' }); } catch (er) { console.warn('[meal image]', er); toast('اتحفظت الوجبة بدون الصورة', { type: 'error' }); } }
      await api.addMeal(body);
      result = null; renderResult(); clearPhoto(); $('#nu-text', root).value = '';
      await loadDay(); toast('تمت إضافة الوجبة');
    } catch (er) { btn.disabled = false; toast(/الوجبة|اسم/.test(er.message) ? er.message : 'تعذّر حفظ الوجبة', { type: 'error' }); }
  });

  // ------------------------------------------------------------------ manual add
  on(root, 'click', '#nu-manual', () => openSheet({ title: 'إضافة وجبة', html: `<div style="display:grid;gap:12px">
      <div class="field"><label for="m-t">اسم الوجبة</label><input id="m-t" class="input" maxlength="80" placeholder="مثال: ساندوتش فراخ"></div>
      <div class="seg" id="m-types">${Object.entries(MEAL_TYPES).map(([k, v]) => `<button type="button" data-mt="${k}" class="${guessMealType() === k ? 'active' : ''}">${v}</button>`).join('')}</div>
      <div class="nu-nums"><label class="field"><span class="label">سعرات</span><input class="input num" id="m-c" type="number" min="0" max="5000" value="0"></label>
        <label class="field"><span class="label">بروتين</span><input class="input num" id="m-p" type="number" min="0" max="300" value="0"></label>
        <label class="field"><span class="label">كارب</span><input class="input num" id="m-ca" type="number" min="0" max="600" value="0"></label>
        <label class="field"><span class="label">دهون</span><input class="input num" id="m-f" type="number" min="0" max="300" value="0"></label></div>
      <button class="btn btn-primary btn-block" id="m-ok">إضافة</button></div>`,
  onMount: (el, close) => {
    on(el, 'click', '[data-mt]', (e, b) => { $('#m-types', el).querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); });
    $('#m-ok', el).onclick = async () => {
      try { await api.addMeal({ title: $('#m-t', el).value, meal_type: $('#m-types .active', el)?.dataset.mt, date, calories: $('#m-c', el).value, protein: $('#m-p', el).value, carbs: $('#m-ca', el).value, fat: $('#m-f', el).value }); close(); await loadDay(); toast('تمت إضافة الوجبة'); }
      catch (er) { toast(/اسم/.test(er.message) ? er.message : 'تعذّر الحفظ', { type: 'error' }); }
    };
  } }));

  // ------------------------------------------------------------------ chat (understands photos)
  const msgsEl = $('#nu-msgs', root);
  const saveChat = () => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat.slice(-20).map(({ preview, ...m }) => m))); } catch { /* quota */ } };
  const scrollChat = () => requestAnimationFrame(() => { msgsEl.scrollTop = msgsEl.scrollHeight; });
  function bubble(m, i) {
    const mine = m.role === 'user';
    return `<div class="co-msg ${mine ? 'me' : 'bot'}">${mine ? '' : `<span class="co-bot-av">${icon('apple', { size: 18 })}</span>`}<div class="co-bub-wrap"><div class="co-bubble">${m.preview ? `<img class="nu-cimg" src="${esc(m.preview)}" alt="صورة مرفقة">` : m.hadImage ? `<span class="muted xs">${icon('image', { size: 14 })} صورة</span><br>` : ''}${esc(m.text)}</div></div></div>`;
  }
  function renderChat() {
    msgsEl.innerHTML = chat.length ? chat.map(bubble).join('') : `<div class="nu-chat-empty">${icon('apple', { size: 40, stroke: 1.4 })}<b>أهلاً! أنا خبير التغذية</b><p class="muted small">ابعتلي صورة أكلك وأقولك سعراتها وبروتينها، أو اسألني أي سؤال عن التغذية.</p></div>`;
    $('#nu-chips', root).innerHTML = chat.length ? '' : SUGGESTIONS.map((s) => `<button class="chip co-chip" data-sug="${esc(s)}" type="button">${esc(s)}</button>`).join('');
    scrollChat();
  }
  renderChat();
  const cfile = $('#nu-cfile', root), cprev = $('#nu-cprev', root);
  $('#nu-cattach', root).addEventListener('click', () => cfile.click());
  cfile.addEventListener('change', () => {
    const f = cfile.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) { toast('اختر ملف صورة', { type: 'error' }); cfile.value = ''; return; }
    chatFile = { file: f, url: URL.createObjectURL(f) };
    cprev.hidden = false; cprev.innerHTML = `<img src="${chatFile.url}" alt="صورة مرفقة"><button class="icon-btn cm-rm" id="nu-crm" type="button" aria-label="إزالة">${icon('x', { size: 16 })}</button>`;
  });
  function clearChatFile() { if (chatFile?.url) URL.revokeObjectURL(chatFile.url); chatFile = null; cfile.value = ''; cprev.hidden = true; cprev.innerHTML = ''; }
  on(root, 'click', '#nu-crm', clearChatFile);
  on(root, 'click', '#nu-clear', async () => { if (!chat.length || !(await confirmDialog({ title: 'مسح المحادثة؟', message: 'هتتمسح من الجهاز ده.', confirmText: 'مسح', danger: true }))) return; chat = []; saveChat(); renderChat(); });

  async function sendChat(text) {
    text = (text ?? $('#nu-cin', root).value).trim();
    if ((!text && !chatFile) || chatBusy) return;
    chatBusy = true; const f = chatFile?.file || null, url = chatFile?.url || '';
    const history = chat.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text }));
    chat.push({ role: 'user', text: text || 'حلّل لي الأكل ده', hadImage: !!f, preview: url });
    $('#nu-cin', root).value = ''; cfile.value = ''; cprev.hidden = true; cprev.innerHTML = ''; chatFile = null;
    renderChat();
    msgsEl.insertAdjacentHTML('beforeend', `<div class="co-msg bot" id="nu-typing"><span class="co-bot-av">${icon('apple', { size: 18 })}</span><div class="co-bubble co-dots"><i></i><i></i><i></i></div></div>`); scrollChat();
    const t = totals();
    try {
      const g = goalsFor(me);
      const r = await askNutrition({ message: text, file: f, history, context: { goal: me.goal, weight: me.weight, calorie_goal: g.calories, today: date === isoDate() ? t : undefined } });
      chat.push({ role: 'coach', text: r.text });
    } catch (er) { chat.push({ role: 'coach', text: er.message || 'تعذّر الرد دلوقتي، جرّب تاني.' }); }
    saveChat(); chatBusy = false; if (alive) renderChat();
  }
  $('#nu-cform', root).addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
  on(root, 'click', '[data-sug]', (e, b) => sendChat(b.dataset.sug));

  await loadDay();
  if (query?.tab === 'chat') root.querySelector('[data-tab="chat"]')?.click();
  return () => { alive = false; if (pending?.preview) URL.revokeObjectURL(pending.preview); if (chatFile?.url) URL.revokeObjectURL(chatFile.url); };
}
