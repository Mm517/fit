/** Admin overview: KPIs, 30-day chart, top exercises, recent signups, recent reports. */
import * as api from '../data/api.js';
import { lineChart } from './charts.js';
import { esc, icon, avatar, thumb, fmtDay, badge, $ } from './common.js';
import { fmtNum, timeAgo } from '../utils.js';

export default async function overview({ root }) {
  const d = await api.adminOverview();
  const k = d.kpis;
  const kpi = (label, v, ic) => `<div class="card adm-kpi"><span class="k-ic">${icon(ic, { size: 20 })}</span><span class="muted small">${label}</span><b class="num">${fmtNum(v)}</b></div>`;
  const maxTop = Math.max(1, ...d.topExercises.map((t) => t.count));
  root.innerHTML = `
    <div class="adm-kpis">${kpi('إجمالي المستخدمين', k.users, 'users')}${kpi('نشطين اليوم', k.activeToday, 'bolt')}${kpi('تمارين مسجلة', k.workouts, 'dumbbell')}${kpi('بوستات جديدة (7 أيام)', k.newPosts, 'message')}${kpi('منبهات مفعّلة', k.alarms, 'alarm')}</div>
    <div class="adm-grid2">
      <section class="card"><h3 class="adm-h">آخر 30 يوماً</h3><div id="chart"></div></section>
      <section class="card"><h3 class="adm-h">أكثر التمارين تسجيلاً</h3>
        ${d.topExercises.length ? d.topExercises.map((t) => `<div class="adm-bar"><span>${thumb(t.exercise.image)}</span><div><b>${esc(t.exercise.name_ar)}</b><div class="track"><div class="fill" style="width:${(t.count / maxTop) * 100}%"></div></div></div><span class="num muted">${t.count}</span></div>`).join('') : '<p class="muted">لا توجد بيانات.</p>'}</section>
    </div>
    <div class="adm-grid2" style="grid-template-columns:1fr 1fr">
      <section class="card"><h3 class="adm-h">أحدث المسجلين <a class="btn btn-ghost btn-sm" href="#/admin/users">عرض الكل</a></h3>
        ${d.recentSignups.map((u) => `<div class="adm-mini">${avatar(u)}<div class="grow"><b>${esc(u.name)}</b><span class="muted small">${esc(u.email)}</span></div><span class="muted small">${fmtDay(u.created_at)}</span></div>`).join('')}</section>
      <section class="card"><h3 class="adm-h">بلاغات حديثة <a class="btn btn-ghost btn-sm" href="#/admin/moderation">إلى الإشراف</a></h3>
        ${d.recentReports.length ? d.recentReports.map((r) => `<div class="adm-mini">${icon('flag', { size: 20, cls: 'orange' })}<div class="grow"><b>${esc(r.post?.body || 'منشور محذوف')}</b><span class="muted small">${esc(r.reason)} — ${esc(r.reporter?.name || '')}</span></div><span class="muted small">${timeAgo(r.created_at)}</span></div>`).join('') : '<p class="muted">لا توجد بلاغات مفتوحة.</p>'}</section>
    </div>`;
  lineChart($('#chart', root), { labels: d.series.days, series: [{ name: 'مستخدمون جدد', color: '#4da3ff', values: d.series.users }, { name: 'تمارين مسجلة', color: '#c6ff3d', values: d.series.workouts }] });
}
