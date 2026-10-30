/** Users: table + filters + pagination + detail drawer with moderation actions. */
import * as api from '../data/api.js';
import { esc, icon, avatar, badge, roleBadge, statusBadge, pager, loading, empty, pageHead, drawer, confirmDlg, fmtDay, fmtDateTime, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';
import { debounce, DAYS_AR } from '../utils.js';

export default async function users({ root }) {
  const me = await api.adminSession();
  const st = { q: '', role: 'all', status: 'all', page: 1, size: 10 };
  root.innerHTML = `${pageHead('المستخدمون', '', 'بحث وفلترة وإدارة الحسابات')}
    <div class="adm-toolbar"><div class="search-box">${icon('search', { size: 18 })}<input id="q" class="input" placeholder="ابحث بالاسم أو البريد..." aria-label="بحث"></div>
      <select id="role" class="input" aria-label="الدور"><option value="all">كل الأدوار</option><option value="user">مستخدم</option><option value="admin">مدير</option></select>
      <select id="status" class="input" aria-label="الحالة"><option value="all">كل الحالات</option><option value="active">نشط</option><option value="suspended">معلّق</option></select></div>
    <div id="list">${loading(6)}</div>`;

  async function load() {
    const { rows, count } = await api.adminListUsers({ ...st, pageSize: st.size });
    $('#list', root).innerHTML = !rows.length ? empty('لا يوجد مستخدمون', 'جرّب تغيير البحث أو الفلاتر', 'users') : `
      <div class="adm-tablewrap"><table><thead><tr><th scope="col">المستخدم</th><th scope="col">الدور</th><th scope="col">الحالة</th><th scope="col">السلسلة</th><th scope="col">انضم</th><th scope="col">آخر نشاط</th></tr></thead><tbody>
      ${rows.map((u) => `<tr class="clickable" tabindex="0" data-id="${u.id}"><td><div class="adm-user">${avatar(u)}<div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div></div></td>
        <td>${roleBadge(u.role)}</td><td>${statusBadge(u.suspended)}</td><td class="num">${u.streak || 0}</td><td>${fmtDay(u.created_at)}</td><td>${fmtDay(u.last_active)}</td></tr>`).join('')}</tbody></table></div>${pager(count, st.page, st.size)}`;
  }
  const reload = debounce(() => { st.page = 1; load(); }, 250);
  $('#q', root).addEventListener('input', (e) => { st.q = e.target.value.trim(); reload(); });
  $('#role', root).addEventListener('change', (e) => { st.role = e.target.value; reload(); });
  $('#status', root).addEventListener('change', (e) => { st.status = e.target.value; reload(); });
  root.addEventListener('click', (e) => {
    const pg = e.target.closest('[data-page]'); if (pg) { st.page = +pg.dataset.page; load(); return; }
    const tr = e.target.closest('tr[data-id]'); if (tr) openUser(tr.dataset.id);
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-id]'); if (tr) openUser(tr.dataset.id); } });

  async function openUser(id) {
    const d = await api.adminGetUserDetail(id), p = d.profile, self = p.id === me.id;
    const dlg = drawer({ title: 'تفاصيل المستخدم', html: '' });
    const paint = (d) => {
      const p = d.profile;
      dlg.setBody(`
        <div class="adm-dprofile">${avatar(p, 64)}<div><h3>${esc(p.name)}</h3><span class="muted">${esc(p.email)}</span><div style="margin-top:6px;display:flex;gap:6px">${roleBadge(p.role)}${statusBadge(p.suspended)}</div></div></div>
        <div class="adm-kv"><div><small>الهدف</small>${esc(p.goal || '—')}</div><div><small>السلسلة الحالية</small><b class="num">${p.streak || 0}</b> يوم</div>
          <div><small>الوزن</small>${p.weight || '—'} كجم</div><div><small>انضم</small>${fmtDay(p.created_at)}</div>
          <div><small>المنبهات</small>${d.alarms.length}</div><div><small>المنشورات</small>${d.postsCount}</div></div>
        <section><h4 class="adm-h">الخطة الحالية</h4>${d.plan ? `<p class="muted small">${esc(d.plan.name)} — ${esc(d.plan.goal || '')}</p><div class="adm-chips">${d.plan.days.map((x) => `<span class="adm-badge ${x.rest ? '' : 'blue'}">${DAYS_AR[x.dow]}: ${esc(x.label)}</span>`).join('')}</div>` : '<p class="muted">لا توجد خطة.</p>'}</section>
        <section><h4 class="adm-h">آخر التمارين المسجلة</h4>${d.logs.length ? d.logs.slice(0, 8).map((l) => `<div class="adm-mini"><div class="grow"><b>${esc(l.exercise?.name_ar || l.exercise_id)}</b><span class="muted small">${l.sets.length} مجموعات</span></div><span class="muted small">${fmtDateTime(l.created_at)}</span></div>`).join('') : '<p class="muted">لا توجد تسجيلات.</p>'}</section>
        <section class="adm-form"><div class="field"><label for="rl">الدور</label><select id="rl" class="input" ${self ? 'disabled' : ''}><option value="user" ${p.role === 'user' ? 'selected' : ''}>مستخدم</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>مدير</option></select></div>
          ${self ? '<p class="muted small">لا يمكنك تعديل حسابك الخاص.</p>' : ''}
          <div class="adm-formfoot"><button class="btn btn-outline" id="sus" ${self ? 'disabled' : ''}>${icon('ban', { size: 18 })} ${p.suspended ? 'إلغاء التعليق' : 'تعليق الحساب'}</button>
          <button class="btn btn-danger" id="del" ${self ? 'disabled' : ''}>${icon('trash', { size: 18 })} حذف</button></div></section>`);
      const refresh = async () => { paint(await api.adminGetUserDetail(p.id)); load(); };
      $('#rl', dlg.el)?.addEventListener('change', async (e) => {
        if (!await confirmDlg({ title: 'تغيير الدور', message: `تغيير دور ${p.name} إلى ${e.target.value === 'admin' ? 'مدير' : 'مستخدم'}؟`, confirmText: 'تأكيد', danger: false })) { e.target.value = p.role; return; }
        await api.adminSetRole(p.id, e.target.value); toast(); refresh();
      });
      $('#sus', dlg.el).addEventListener('click', async () => {
        if (!await confirmDlg({ title: p.suspended ? 'إلغاء التعليق' : 'تعليق الحساب', message: p.suspended ? `سيستعيد ${p.name} الوصول للتطبيق.` : `لن يتمكن ${p.name} من استخدام التطبيق.`, confirmText: 'تأكيد', danger: !p.suspended })) return;
        await api.adminSetSuspended(p.id, !p.suspended); toast(); refresh();
      });
      $('#del', dlg.el).addEventListener('click', async () => {
        if (!await confirmDlg({ title: 'حذف المستخدم', message: `سيتم حذف ${p.name} وكل بياناته نهائياً. لا يمكن التراجع.`, confirmText: 'حذف نهائي' })) return;
        await api.adminDeleteUser(p.id); toast('تم حذف المستخدم'); dlg.close(); load();
      });
    };
    paint(d);
  }
  await load();
}
