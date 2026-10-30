/** Settings (screenshot 11): notifications, appearance, Android battery tip, language, about. */
import * as api from '../data/api.js';
import { CONFIG } from '../config.js';
import { icon } from '../ui/icons.js';
import { toast, openSheet, confirmDialog, toggle, bindToggles } from '../ui/kit.js';
import { $, on } from '../utils.js';
import { ensureNotificationPermission } from '../alarm.js';

const KEY = 'fc:prefs';
const prefs = () => { try { return { workout: true, alarms: true, community: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { workout: true, alarms: true, community: false }; } };

export default async function settings({ root, navigate }) {
  root.innerHTML = `
    <header class="page-head"><a class="icon-btn plain" href="#/profile" aria-label="رجوع">${icon('arrowBack', { size: 24 })}</a><h1>الإعدادات</h1></header>
    <section class="card st-card">
      <button class="st-row" data-s="notif"><span class="st-ic">${icon('bell')}</span><b>الإشعارات</b><span class="st-chev">${icon('chevron', { size: 18 })}</span></button>
      <button class="st-row" data-s="theme"><span class="st-ic">${icon('moon')}</span><b>المظهر</b><span class="muted small st-val">داكن</span><span class="st-chev">${icon('chevron', { size: 18 })}</span></button>
      <button class="st-row st-batt" data-s="battery"><span class="st-ic lime">${icon('battery')}</span><b>توفير البطارية (Android)</b><span class="st-chev">${icon('chevron', { size: 18 })}</span></button>
      <p class="muted small st-tip">فعّل وضع توفير البطارية للتقليل من استهلاك الطاقة. ولضمان رنين المنبه: استثنِ التطبيق من تحسين البطارية.</p>
      <button class="st-row" data-s="lang"><span class="st-ic">${icon('globe')}</span><b>العربية</b><span class="st-chev">${icon('chevron', { size: 18 })}</span></button>
      <button class="st-row" data-s="about"><span class="st-ic">${icon('info')}</span><b>معلومات التطبيق</b><span class="muted small num st-val">v${CONFIG.APP_VERSION}</span></button>
    </section>
    <section class="st-more">
      <a class="btn btn-outline btn-block" href="#/admin/login">${icon('shield', { size: 20 })} لوحة الإدارة</a>
      ${api.backend === 'mock' ? `<button class="btn btn-ghost btn-block" id="st-reset">${icon('refresh', { size: 20 })} إعادة ضبط البيانات التجريبية</button>` : `<button class="btn btn-danger btn-block" id="st-out">${icon('logout', { size: 20 })} تسجيل الخروج</button>`}
    </section>`;

  on(root, 'click', '[data-s]', (e, b) => {
    const k = b.dataset.s;
    if (k === 'notif') {
      const p = prefs();
      openSheet({ title: 'الإشعارات', html: [['workout', 'تذكير التمرين'], ['alarms', 'المنبهات'], ['community', 'المجتمع']].map(([id, t]) => `<div class="list-row"><b>${t}</b><span style="margin-inline-start:auto">${toggle(p[id], `data-pref="${id}" aria-label="${t}"`)}</span></div>`).join(''),
        onMount: (el) => bindToggles(el, async (t, v) => { if (v) { const r = await ensureNotificationPermission(); if (r === 'denied') toast('الإشعارات محظورة من إعدادات المتصفح', { type: 'error' }); } const n = prefs(); n[t.dataset.pref] = v; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* */ } toast(); }) });
    }
    if (k === 'theme') openSheet({ title: 'المظهر', html: `<div class="seg"><button class="active">داكن</button><button disabled style="opacity:.5">تلقائي (قريباً)</button></div>` });
    if (k === 'lang') openSheet({ title: 'اللغة', html: `<div class="seg"><button class="active">العربية</button><button disabled style="opacity:.5">English (قريباً)</button></div>` });
    if (k === 'about') openSheet({ title: 'معلومات التطبيق', html: `<p style="text-align:center;padding:8px 0 14px"><b>FitCircle — فِت سيركل</b><br><span class="muted">معاً نحو نسخة أفضل منك</span><br><span class="muted num">v${CONFIG.APP_VERSION} · ${api.backend}</span></p>` });
    if (k === 'battery') openSheet({ title: 'ضمان رنين المنبه (Android)', html: `<ol class="st-steps"><li>افتح <b>الإعدادات</b> ← <b>التطبيقات</b> ← <b>Chrome</b> (أو FitCircle بعد التثبيت).</li><li>اختر <b>البطارية</b> ثم <b>غير مقيّد</b>.</li><li>اسمح بـ<b>الإشعارات</b> للتطبيق من نفس الصفحة.</li><li>ثبّت التطبيق على الشاشة الرئيسية وأبقِه في الخلفية دون إغلاقه.</li></ol><p class="muted small">يمنع نظام أندرويد التطبيقات من العمل في الخلفية لتوفير الطاقة، وقد يؤخر المنبه.</p>` });
  });
  $('#st-reset', root)?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'إعادة ضبط البيانات؟', message: 'سيتم حذف كل البيانات التجريبية المحفوظة على هذا الجهاز.', confirmText: 'إعادة ضبط', danger: true })) {
      Object.keys(localStorage).filter((k) => k.startsWith('fc:')).forEach((k) => localStorage.removeItem(k)); location.hash = '#/'; location.reload();
    }
  });
  $('#st-out', root)?.addEventListener('click', async () => { await api.userLogout(); navigate('#/login'); });
}
