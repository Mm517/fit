/** Community moderation: all posts, reported queue, hidden; bulk actions; comments; ban author. */
import * as api from '../data/api.js';
import { esc, icon, badge, avatar, loading, empty, pageHead, modal, confirmDlg, fmtDateTime, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';
import { timeAgo, debounce } from '../utils.js';

export default async function moderation({ root, query }) {
  const st = { tab: query?.tab === 'reported' ? 'reported' : 'all', q: '' };
  const sel = new Set();
  const TABS = [['all', 'كل المنشورات'], ['reported', 'المبلّغ عنها'], ['hidden', 'المخفية']];
  root.innerHTML = `${pageHead('إشراف المجتمع', '', 'مراجعة المنشورات والبلاغات والتعليقات')}
    <div class="adm-toolbar"><div class="adm-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" data-tab="${k}" class="${k === st.tab ? 'active' : ''}">${t}</button>`).join('')}</div>
      <div class="search-box">${icon('search', { size: 18 })}<input id="q" class="input" placeholder="ابحث في نص المنشور..." aria-label="بحث"></div></div>
    <div id="bulk"></div><div id="list">${loading(3)}</div>`;
  let posts = [];

  const bulkBar = () => {
    $('#bulk', root).innerHTML = sel.size ? `<div class="adm-bulk"><b>${sel.size} محدد</b>
      <button class="btn btn-outline btn-sm" data-bulk="hide">${icon('eyeOff', { size: 16 })} إخفاء</button><button class="btn btn-outline btn-sm" data-bulk="unhide">${icon('eye', { size: 16 })} إظهار</button>
      <button class="btn btn-outline btn-sm" data-bulk="dismiss-reports">تجاهل البلاغات</button><button class="btn btn-danger btn-sm" data-bulk="delete">${icon('trash', { size: 16 })} حذف</button>
      <button class="btn btn-ghost btn-sm" data-bulk="clear">إلغاء التحديد</button></div>` : '';
  };

  async function load() {
    posts = await api.adminListPosts({ filter: st.tab, q: st.q });
    sel.forEach((id) => { if (!posts.some((p) => p.id === id)) sel.delete(id); });
    const el = $('#list', root);
    if (st.tab === 'reported') {
      const reps = await api.adminListReports({ status: 'open' });
      el.innerHTML = !reps.length ? empty('لا توجد بلاغات مفتوحة', 'ممتاز! المجتمع هادئ', 'shieldCheck') : `<div class="adm-reports">${reps.map((r) => `
        <article class="card adm-report"><img src="${esc(r.post?.image || 'assets/img/ex-default.svg')}" alt="" onerror="this.onerror=null;this.src='assets/img/ex-default.svg'">
          <div><p>${esc(r.post?.body || 'منشور محذوف')}</p><p class="muted small">الكاتب: <b>${esc(r.post_author?.name || '—')}</b> · المبلّغ: ${esc(r.reporter?.name || '—')} · ${timeAgo(r.created_at)}</p><div style="margin-top:6px">${badge(r.reason, 'orange')}${r.post?.hidden ? badge('مخفي', 'red') : ''}</div></div>
          <div class="adm-rowact"><button class="btn btn-outline btn-sm" data-rs="dismiss:${r.id}">تجاهل</button><button class="btn btn-outline btn-sm" data-rs="hide:${r.id}">إخفاء</button><button class="btn btn-danger btn-sm" data-rs="delete:${r.id}">حذف</button></div></article>`).join('')}</div>`;
      bulkBar(); return;
    }
    el.innerHTML = !posts.length ? empty('لا توجد منشورات', '', 'image') : `<div class="adm-posts">${posts.map((p) => `
      <article class="card adm-post ${sel.has(p.id) ? 'sel' : ''}">${p.image ? `<img class="pimg" src="${esc(p.image)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='assets/img/p-1.svg'">` : ''}
        <div class="pb"><div class="adm-row"><label class="adm-user" style="gap:8px"><input type="checkbox" class="adm-check" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} aria-label="تحديد المنشور">${avatar(p.author, 32)}<div><b>${esc(p.author.name)}</b><small>${timeAgo(p.created_at)}</small></div></label>
          <div>${p.hidden ? badge('مخفي', 'red') : ''}${p.open_reports.length ? badge(`${p.open_reports.length} بلاغ`, 'orange') : ''}</div></div>
          <p>${esc(p.body)}</p><small class="muted"><span class="num">${p.likes}</span> إعجاب · <span class="num">${p.comments}</span> تعليق</small></div>
        <div class="pf"><button class="icon-btn" data-hide="${p.id}" aria-label="${p.hidden ? 'إظهار' : 'إخفاء'}" title="${p.hidden ? 'إظهار' : 'إخفاء'}">${icon(p.hidden ? 'eye' : 'eyeOff', { size: 18 })}</button>
          <button class="icon-btn" data-cm="${p.id}" aria-label="التعليقات" title="التعليقات">${icon('comment', { size: 18 })}</button>
          <button class="icon-btn" data-ban="${p.id}" aria-label="حظر الكاتب" title="حظر الكاتب">${icon('ban', { size: 18 })}</button>
          <button class="icon-btn" data-del="${p.id}" aria-label="حذف" title="حذف" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div></article>`).join('')}</div>
      <label class="adm-user" style="margin-top:12px;gap:8px"><input type="checkbox" class="adm-check" id="all" aria-label="تحديد الكل"> تحديد الكل</label>`;
    bulkBar();
  }

  $('.adm-tabs', root).addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; st.tab = b.dataset.tab; sel.clear(); $$('[data-tab]', root).forEach((x) => x.classList.toggle('active', x === b)); load(); });
  $('#q', root).addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load(); }, 250));
  root.addEventListener('change', (e) => {
    if (e.target.id === 'all') { posts.forEach((p) => (e.target.checked ? sel.add(p.id) : sel.delete(p.id))); load(); }
    else if (e.target.dataset.sel) { e.target.checked ? sel.add(e.target.dataset.sel) : sel.delete(e.target.dataset.sel); e.target.closest('.adm-post').classList.toggle('sel', e.target.checked); bulkBar(); }
  });
  const LBL = { hide: 'إخفاء', unhide: 'إظهار', delete: 'حذف', 'dismiss-reports': 'تجاهل البلاغات' };
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-bulk],[data-rs],[data-hide],[data-cm],[data-ban],[data-del]'); if (!t) return;
    const d = t.dataset;
    if (d.bulk) {
      if (d.bulk === 'clear') { sel.clear(); return load(); }
      if (!await confirmDlg({ title: `${LBL[d.bulk]} جماعي`, message: `سيتم تنفيذ «${LBL[d.bulk]}» على ${sel.size} منشورات.`, confirmText: 'تنفيذ', danger: d.bulk === 'delete' })) return;
      await api.adminBulkPosts([...sel], d.bulk); sel.clear(); toast(); load();
    } else if (d.rs) {
      const [act, id] = d.rs.split(':');
      if (act !== 'dismiss' && !await confirmDlg({ title: act === 'delete' ? 'حذف المنشور' : 'إخفاء المنشور', message: act === 'delete' ? 'سيتم حذف المنشور وتعليقاته نهائياً.' : 'سيختفي المنشور عن المستخدمين.', confirmText: act === 'delete' ? 'حذف' : 'إخفاء', danger: act === 'delete' })) return;
      await api.adminResolveReport(id, act); toast(); load();
    } else if (d.hide) { const p = posts.find((x) => x.id === d.hide); await api.adminHidePost(p.id, !p.hidden); toast(); load(); }
    else if (d.del) { if (await confirmDlg({ title: 'حذف المنشور', message: 'سيتم حذف المنشور وتعليقاته نهائياً.', confirmText: 'حذف' })) { await api.adminDeletePost(d.del); toast('تم حذف المنشور'); load(); } }
    else if (d.ban) { const p = posts.find((x) => x.id === d.ban); if (await confirmDlg({ title: 'حظر المستخدم', message: `سيتم تعليق حساب ${p.author.name} وإخفاء منشوراته.`, confirmText: 'حظر' })) { await api.adminBanUser(p.user_id); toast('تم حظر المستخدم'); load(); } }
    else if (d.cm) comments(posts.find((x) => x.id === d.cm));
  });

  async function comments(p) {
    const m = modal({ title: 'التعليقات', html: loading(2) });
    const paint = async () => {
      const cs = await api.listComments(p.id);
      m.setBody(cs.length ? cs.map((c) => `<div class="adm-mini">${avatar(c.author, 32)}<div class="grow"><b>${esc(c.author.name)}</b><span>${esc(c.body)}</span><span class="muted small">${fmtDateTime(c.created_at)}</span></div>
        <button class="icon-btn" data-dc="${c.id}" aria-label="حذف التعليق" style="color:var(--red)">${icon('trash', { size: 18 })}</button></div>`).join('') : empty('لا توجد تعليقات', '', 'comment'));
    };
    await paint();
    m.body.addEventListener('click', async (e) => { const b = e.target.closest('[data-dc]'); if (!b) return; if (await confirmDlg({ title: 'حذف التعليق', message: 'هل تريد حذف هذا التعليق؟', confirmText: 'حذف' })) { await api.adminDeleteComment(b.dataset.dc); toast('تم حذف التعليق'); paint(); load(); } });
  }
  await load();
}
