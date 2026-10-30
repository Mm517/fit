/** Alarms (screenshot 07): list with toggles + add/edit bottom sheet with time picker. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, skeleton, emptyState, openSheet, confirmDialog, toggle, stepper, bindSteppers, readSteppers } from '../ui/kit.js';
import { esc, $, on, fmtTime12, fmtDays, DAYS_AR, WEEK_ORDER } from '../utils.js';
import { ensureNotificationPermission, invalidateAlarms, testRing } from '../alarm.js';

export default async function alarms({ root }) {
  root.innerHTML = skeleton('row', 3);
  let list = await api.listAlarms();

  function render() {
    root.innerHTML = `
      <header class="page-head center"><a class="icon-btn plain" href="#/" aria-label="رجوع">${icon('arrowBack', { size: 24 })}</a><h1>المنبه</h1>
        <button class="icon-btn plain lime" id="al-add" aria-label="إضافة منبه">${icon('plus', { size: 26 })}</button></header>
      ${list.length ? list.map((a) => { const t = fmtTime12(a.time); return `
        <div class="card al-card ${a.enabled ? 'on' : ''}" data-edit="${a.id}" role="button" tabindex="0">
          <span class="al-clock">${icon('clock', { size: 28 })}</span>
          <div class="al-body"><div class="al-time"><b class="num">${t.text}</b> <span>${t.period}</span></div><div class="muted small">${esc(fmtDays(a.days))}</div><div class="muted small">${esc(a.label || '')}</div></div>
          <span class="toggle-hit" data-stop>${toggle(a.enabled, `data-tg="${a.id}" aria-label="تفعيل المنبه"`)}</span></div>`; }).join('')
        : emptyState({ icon: 'alarm', title: 'لا توجد منبهات بعد', text: 'أضف منبهاً لتبدأ يومك بقوة.', action: 'إضافة منبه', actionId: 'add' })}`;
  }
  render();

  on(root, 'click', '[data-tg]', async (e, b) => {
    e.stopPropagation();
    const a = list.find((x) => x.id === b.dataset.tg); const v = b.getAttribute('aria-checked') !== 'true';
    if (v) ensureNotificationPermission();
    a.enabled = v; await api.saveAlarm({ ...a }); invalidateAlarms(); render(); toast();
  });
  on(root, 'click', '[data-stop]', (e) => e.stopPropagation());
  on(root, 'click', '#al-add, [data-act=add]', () => openEditor(null));
  on(root, 'click', '[data-edit]', (e, c) => openEditor(list.find((x) => x.id === c.dataset.edit)));

  function openEditor(a) {
    const cur = a || { time: '06:00', days: [6, 0, 1, 2, 3], label: '', enabled: true };
    const [h24, m] = cur.time.split(':').map(Number);
    let pm = h24 >= 12; const days = new Set(cur.days);
    openSheet({ title: a ? 'تعديل المنبه' : 'إضافة منبه', back: true,
      html: `<div class="al-picker">
          ${stepper({ name: 'h', value: h24 % 12 || 12, min: 1, max: 12, label: 'الساعة' })}<b>:</b>${stepper({ name: 'm', value: m, min: 0, max: 59, label: 'الدقائق' })}
          <div class="seg al-ampm"><button data-ap="am" class="${pm ? '' : 'active'}">ص</button><button data-ap="pm" class="${pm ? 'active' : ''}">م</button></div></div>
        <div class="chips al-days" style="flex-wrap:wrap;margin:14px 0">${WEEK_ORDER.map((d) => `<button class="chip ${days.has(d) ? 'active' : ''}" data-day="${d}" aria-pressed="${days.has(d)}">${DAYS_AR[d]}</button>`).join('')}</div>
        <div class="field"><label for="al-label">الاسم</label><input id="al-label" class="input" maxlength="30" value="${esc(cur.label)}" placeholder="مثال: منبه الفجر"></div>
        <button class="btn btn-primary btn-block" id="al-save" style="margin-top:14px">حفظ</button>
        ${a ? `<div class="row al-extra"><button class="btn btn-outline btn-sm" id="al-test">${icon('play', { size: 16 })} تجربة المنبه</button><button class="btn btn-danger btn-sm" id="al-del">${icon('trash', { size: 16 })} حذف</button></div>` : ''}`,
      onMount: (el, close) => {
        bindSteppers(el);
        const build = () => { const v = readSteppers(el); let h = v.h % 12; if (pm) h += 12; return `${String(h).padStart(2, '0')}:${String(v.m).padStart(2, '0')}`; };
        on(el, 'click', '[data-ap]', (e, b) => { pm = b.dataset.ap === 'pm'; el.querySelectorAll('[data-ap]').forEach((x) => x.classList.toggle('active', x === b)); });
        on(el, 'click', '[data-day]', (e, b) => { const d = +b.dataset.day; days.has(d) ? days.delete(d) : days.add(d); b.classList.toggle('active'); b.setAttribute('aria-pressed', days.has(d)); });
        $('#al-save', el).onclick = async () => {
          await ensureNotificationPermission();
          await api.saveAlarm({ ...(a || {}), time: build(), days: [...days], label: $('#al-label', el).value.trim(), enabled: true });
          list = await api.listAlarms(); invalidateAlarms(); close(); render(); toast();
        };
        $('#al-test', el)?.addEventListener('click', () => { close(); testRing({ ...a, time: build(), id: a.id }); });
        $('#al-del', el)?.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'حذف المنبه؟', message: 'لن يرن هذا المنبه بعد الآن.', confirmText: 'حذف', danger: true }))) return;
          await api.deleteAlarm(a.id); list = await api.listAlarms(); invalidateAlarms(); close(); render(); toast();
        });
      } });
  }
}
