/** Audit log: who did what, when. Every destructive admin action writes a row here (api.audit). */
import * as api from '../data/api.js';
import { esc, icon, loading, empty, pageHead, pager, fmtDateTime, $ } from './common.js';
import { debounce } from '../utils.js';

const LABELS = {
  'user.suspend': 'تعليق مستخدم', 'user.unsuspend': 'إلغاء تعليق مستخدم', 'user.role': 'تغيير دور مستخدم', 'user.delete': 'حذف مستخدم', 'user.ban': 'حظر مستخدم',
  'exercise.save': 'حفظ تمرين', 'exercise.delete': 'حذف تمرين', 'exercise.duplicate': 'تكرار تمرين', 'exercise.publish': 'نشر تمرين', 'exercise.unpublish': 'إلغاء نشر تمرين',
  'template.save': 'حفظ قالب خطة', 'template.delete': 'حذف قالب خطة',
  'post.hide': 'إخفاء منشور', 'post.unhide': 'إظهار منشور', 'post.delete': 'حذف منشور', 'comment.delete': 'حذف تعليق', 'report.dismiss': 'تجاهل بلاغ',
  'post.bulk.hide': 'إخفاء جماعي', 'post.bulk.unhide': 'إظهار جماعي', 'post.bulk.delete': 'حذف جماعي', 'post.bulk.dismiss-reports': 'تجاهل بلاغات جماعي',
  'notification.send': 'إرسال إشعار', 'notification.schedule': 'جدولة إشعار', 'notification.delete': 'حذف إشعار', 'settings.app': 'تعديل إعدادات التطبيق', 'settings.coach': 'تعديل إعدادات المدرب',
};
export const auditLabel = (k) => LABELS[k] || k;

export default async function audit({ root }) {
  const st = { q: '', page: 1, size: 15 };
  root.innerHTML = `${pageHead('سجل التدقيق', '', 'سجل كل الإجراءات الإدارية: من، ماذا، ومتى')}
    <div class="adm-toolbar"><div class="search-box">${icon('search', { size: 18 })}<input id="q" class="input" placeholder="ابحث بالإجراء أو المدير..." aria-label="بحث"></div></div><div id="list">${loading(6)}</div>`;
  async function load() {
    const { rows, count } = await api.listAudit({ q: st.q, page: st.page, pageSize: st.size });
    $('#list', root).innerHTML = !rows.length ? empty('لا توجد سجلات', '', 'history') : `<div class="adm-tablewrap"><table><thead><tr><th scope="col">الوقت</th><th scope="col">المدير</th><th scope="col">الإجراء</th><th scope="col">الهدف</th><th scope="col">التفاصيل</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${fmtDateTime(r.created_at)}</td><td>${esc(r.actor_name)}</td><td><b>${esc(auditLabel(r.action))}</b><br><code>${esc(r.action)}</code></td><td><code>${esc(r.target)}</code></td><td><span class="adm-meta" title="${esc(JSON.stringify(r.meta || {}))}">${esc(JSON.stringify(r.meta || {}))}</span></td></tr>`).join('')}</tbody></table></div>${pager(count, st.page, st.size)}`;
  }
  $('#q', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }, 250));
  root.addEventListener('click', (e) => { const p = e.target.closest('[data-page]'); if (p) { st.page = +p.dataset.page; load(); } });
  await load();
}
