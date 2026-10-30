/** Notifications: broadcast / targeted / scheduled push messages + history. */
import * as api from '../data/api.js';
import { esc, icon, badge, loading, empty, pageHead, confirmDlg, fmtDateTime, $ } from './common.js';
import { toast } from '../ui/kit.js';

export default async function notifications({ root }) {
  const { rows: users } = await api.adminListUsers({ role: 'user', pageSize: 100 });
  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  root.innerHTML = `${pageHead('الإشعارات', '', 'أرسل رسالة فورية أو مجدولة لكل المستخدمين أو لمستخدم محدد')}
    <div class="adm-grid2"><form class="card adm-form" id="nf" novalidate><h3>رسالة جديدة</h3>
      <div class="field"><label for="nt">العنوان *</label><input id="nt" class="input" maxlength="60"></div>
      <div class="field"><label for="nb">النص *</label><textarea id="nb" class="input" maxlength="200" rows="3"></textarea></div>
      <div class="two"><div class="field"><label for="tg">المستهدفون</label><select id="tg" class="input"><option value="all">كل المستخدمين</option>${users.map((u) => `<option value="user:${u.id}">${esc(u.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="sc">جدولة (اختياري)</label><input id="sc" type="datetime-local" class="input"></div></div>
      <p class="adm-err" id="er" role="alert" hidden></p><div class="adm-formfoot"><button class="btn btn-primary">${icon('broadcast', { size: 18 })} إرسال</button></div></form>
    <section class="card"><h3>معاينة</h3><div class="adm-preview" style="margin-top:10px"><span class="lime">${icon('bellFill', { size: 28 })}</span><div><b id="pt">عنوان الإشعار</b><p class="muted small" id="pb">نص الإشعار يظهر هنا</p></div></div>
      <p class="muted small" style="margin-top:10px">في الوضع التجريبي تظهر الرسائل الفورية كتنبيه داخل التطبيق. مع Supabase تُرسل عبر Web Push (push_subscriptions).</p></section></div>
    <h3 style="margin-bottom:10px">السجل</h3><div id="list">${loading(3)}</div>`;
  const f = $('#nf', root);
  f.addEventListener('input', () => { $('#pt', root).textContent = $('#nt', root).value || 'عنوان الإشعار'; $('#pb', root).textContent = $('#nb', root).value || 'نص الإشعار يظهر هنا'; });
  async function load() {
    const list = await api.adminListNotifications();
    $('#list', root).innerHTML = !list.length ? empty('لا توجد رسائل بعد', '', 'bell') : `<div class="adm-tablewrap"><table><thead><tr><th scope="col">العنوان</th><th scope="col">المستهدفون</th><th scope="col">الحالة</th><th scope="col">الوقت</th><th scope="col"><span class="sr-only">حذف</span></th></tr></thead><tbody>
      ${list.map((n) => `<tr><td><b>${esc(n.title)}</b><br><span class="muted small">${esc(n.body)}</span></td><td>${n.target === 'all' ? 'الجميع' : esc(names[n.target] || n.target)}</td>
        <td>${n.status === 'scheduled' ? badge('مجدول', 'orange') : badge('مرسل', 'green')}</td><td>${fmtDateTime(n.scheduled_at || n.sent_at || n.created_at)}</td>
        <td><button class="icon-btn" data-del="${n.id}" aria-label="حذف" style="color:var(--red)">${icon('trash', { size: 18 })}</button></td></tr>`).join('')}</tbody></table></div>`;
  }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#nt', root).value.trim(), body = $('#nb', root).value.trim(), sc = $('#sc', root).value;
    const msg = !title ? 'أدخل العنوان' : !body ? 'أدخل نص الرسالة' : sc && new Date(sc) <= new Date() ? 'وقت الجدولة يجب أن يكون في المستقبل' : '';
    const er = $('#er', root); er.hidden = !msg; er.textContent = msg; if (msg) return;
    await api.adminSendNotification({ title, body, target: $('#tg', root).value, scheduled_at: sc ? new Date(sc).toISOString() : null });
    toast(sc ? 'تمت جدولة الرسالة' : 'تم إرسال الإشعار'); f.reset(); f.dispatchEvent(new Event('input')); load();
  });
  root.addEventListener('click', async (e) => { const b = e.target.closest('[data-del]'); if (b && await confirmDlg({ title: 'حذف الرسالة', message: 'سيتم حذفها من السجل.', confirmText: 'حذف' })) { await api.adminDeleteNotification(b.dataset.del); toast('تم الحذف'); load(); } });
  await load();
}
