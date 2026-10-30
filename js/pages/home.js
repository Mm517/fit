/** Home (screenshot 02): greeting + streak, today's workout, weekly goal ring, next alarm, quick stats, ask-the-coach. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { ring, skeleton, img } from '../ui/kit.js';
import { shouldShowInstall, installBannerHTML, bindInstallBanner } from '../ui/install.js';
import { goalsFor } from '../ai/nutrition.js';
import { esc, $, fmtTime12, fmtDays, fmtNum } from '../utils.js';

export default async function home({ root, navigate }) {
  root.innerHTML = skeleton('card', 4);
  const [d, meals] = await Promise.all([api.getHomeData(), api.listMeals().catch(() => null)]);
  const first = d.user.name.split(' ')[0];
  const t = d.today;
  const na = d.nextAlarm;

  const todayCard = !t || t.rest || !t.count
    ? `<section class="card home-today rest" aria-label="تمرين اليوم">
         <div class="ht-body"><span class="muted small">تمرين اليوم</span><h2>${t?.rest ? 'يوم راحة' : 'لا يوجد تمرين اليوم'}</h2>
         <p class="muted">${t?.rest ? 'ارتاح اليوم… العضلات تنمو أثناء الراحة.' : 'ابنِ جدولك الأسبوعي مع المدرب.'}</p></div>
         <a class="btn btn-primary btn-block" href="${t?.rest ? '#/plan' : '#/coach'}">${t?.rest ? 'عرض الجدول' : 'اطلب جدولاً من المدرب'} ${icon('arrow', { size: 20 })}</a></section>`
    : `<section class="card home-today" aria-label="تمرين اليوم">
         <div class="ht-row">
           <div class="ht-body"><span class="muted small">تمرين اليوم</span><h2>${esc(t.label)}</h2>
             <div class="ht-meta"><span>${icon('clock', { size: 16 })} <span class="num">${t.minutes}</span> دقيقة</span><span>${icon('dumbbell', { size: 16 })} <span class="num">${t.count}</span> تمارين</span></div></div>
           <div class="ht-photo">${img(t.image, t.label)}</div>
         </div>
         <a class="btn btn-primary btn-block" href="#/exercise/${t.items[0].exercise.id}" data-press>${icon('arrow', { size: 20 })} ابدأ التمرين</a></section>`;

  const weekCard = `<section class="card home-week" aria-label="هدفك الأسبوعي">
      <div class="hw-top"><div class="hw-title"><h3>من هدفك الأسبوعي</h3><span class="muted small"><span class="num">${d.weekly.doneDays}</span> من <span class="num">${d.weekly.goalDays}</span> أيام</span></div>
        ${ring(d.weekly.percent, { size: 92, stroke: 10 })}<a class="hw-go icon-btn plain" href="#/plan" aria-label="الجدول الأسبوعي">${icon('chevron', { size: 22 })}</a></div>
      <div class="hw-days">${d.week.map((w) => `<div class="hw-day ${w.today ? 'is-today' : ''}"><span class="hw-lbl">${w.label}</span>
        ${w.done ? `<span class="hw-dot done">${icon('check', { size: 16 })}</span>` : w.today ? `<span class="hw-dot today">${icon('chevronDown', { size: 16 })}</span>` : `<span class="hw-dot ${w.rest ? 'rest' : ''}"></span>`}</div>`).join('')}</div></section>`;

  const alarmCard = `<a class="card home-alarm" href="#/alarms" aria-label="المنبه القادم">
      <div class="ha-txt"><span class="muted small">المنبه القادم</span>
        ${na ? `<div class="ha-time"><b class="num">${fmtTime12(na.alarm.time).text}</b> <span>${fmtTime12(na.alarm.time).period}</span></div>
        <div class="ha-days">${icon('clock', { size: 15 })} ${esc(fmtDays(na.alarm.days))}</div>` : `<div class="ha-time"><span>لا يوجد منبه</span></div><div class="ha-days">اضغط لإضافة منبه</div>`}</div>
      <span class="ha-ic">${icon('alarm', { size: 34 })}</span></a>`;


  // nutrition card: today's calories vs goal (hidden if the meals table is unreachable)
  const goal = goalsFor(d.user), eaten = (meals || []).reduce((s, m) => s + m.calories, 0), pro = (meals || []).reduce((s, m) => s + m.protein, 0);
  const nutPct = Math.min(100, Math.round((eaten / goal.calories) * 100));
  const nutCard = meals === null ? '' : `<a class="card home-nut" href="#/nutrition" aria-label="التغذية">
      <div class="hn-top"><span class="hn-ic">${icon('apple', { size: 28 })}</span><div class="hn-txt"><span class="muted small">تغذية اليوم</span><b class="hn-kcal"><span class="num">${fmtNum(eaten)}</span> <small class="muted">/ <span class="num">${fmtNum(goal.calories)}</span> سعرة</small></b></div></div>
      <div class="nu-bar"><i style="width:${nutPct}%"></i></div>
      <div class="hn-foot"><span class="muted small">بروتين <span class="num">${Math.round(pro)}</span> / <span class="num">${goal.protein}</span> جم</span><span class="hn-cta">${icon('camera', { size: 16 })} صوّر وجبتك</span></div></a>`;

  const q = d.quick;
  const stat = (label, val, unit, ic) => `<div class="card stat"><span class="muted small">${label}</span><div class="stat-v"><b class="num">${val}</b>${unit ? `<small class="muted">${unit}</small>` : ''}</div><span class="stat-ic">${icon(ic, { size: 26 })}</span></div>`;

  root.innerHTML = `
    <div class="home-hero" aria-hidden="true"></div>
    ${shouldShowInstall() ? installBannerHTML() : ''}
    <header class="home-head">
      <div class="hh-top"><h1 class="home-hi">مرحباً ${esc(first)} <span class="hi-badge">${icon('spark', { size: 14 })}</span></h1><p class="muted">كل مجهودك اليوم يبني مستقبلك</p></div>
      <a class="streak" href="#/profile" aria-label="${d.streak} أيام متتالية"><span class="streak-flame">${icon('flame', { size: 54 })}</span><span><b class="num">${d.streak}</b><small>أيام متتالية</small></span></a>
    </header>
    <div class="home-grid">
    <div class="hg-today">${todayCard}</div><div class="hg-week">${weekCard}</div><div class="hg-alarm">${alarmCard}</div><div class="hg-nut">${nutCard}</div>
    <div class="hg-stats"><h2 class="h-sec home-sec">إحصائياتك السريعة</h2>
    <div class="stats3">
      ${stat('الوزن', q.weight || '—', 'كجم', 'scale')}
      ${stat('تمارين الأسبوع', `<span class="num">${q.workoutsThisWeek}</span>/<span class="num">${q.goalDays}</span>`, '', 'dumbbell')}
      ${stat('السعرات', fmtNum(q.calories), '', 'flame')}
    </div></div>
    <form class="card home-ask hg-ask" id="ask-form"><label class="muted small" for="ask-in">اسأل المدرب</label>
      <div class="ask-row"><input id="ask-in" class="input" placeholder="اكتب سؤالك هنا..." autocomplete="off" enterkeyhint="send"><button class="ask-send" aria-label="إرسال">${icon('send', { size: 22, cls: 'rtl-flip' })}</button></div></form>
    </div>`;

  bindInstallBanner(root);
  // hand the question to the coach page, which auto-sends ?q=
  $('#ask-form', root).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#ask-in', root).value.trim();
    navigate(v ? `#/coach?q=${encodeURIComponent(v)}` : '#/coach');
  });
}
