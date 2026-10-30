/** Admin settings: app name/tagline/logo, brand color, feature flags, admin roles. */
import * as api from '../data/api.js';
import { esc, icon, badge, sw, flipSwitch, avatar, pageHead, confirmDlg, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';
import { debounce } from '../utils.js';

const FLAGS = [['community', 'المجتمع', 'إظهار تبويب المجتمع والمنشورات'], ['coach', 'المدرب الذكي', 'تفعيل محادثة المدرب'], ['nutrition', 'التغذية الذكية', 'تحليل الوجبات بالصور والنصوص'], ['alarms', 'المنبهات', 'تفعيل المنبهات وشاشة الاستيقاظ'], ['signups', 'التسجيل الجديد', 'السماح بإنشاء حسابات جديدة'], ['maintenance', 'وضع الصيانة', 'إيقاف التطبيق مؤقتاً للمستخدمين']];

export default async function settings({ root }) {
  const me = await api.adminSession();
  const s = JSON.parse(JSON.stringify(await api.getAppSettings()));
  root.innerHTML = `${pageHead('الإعدادات', '', 'هوية التطبيق وخصائصه وصلاحيات المديرين')}
    <div class="adm-grid2"><section class="card adm-form"><h3>هوية التطبيق</h3>
      <div class="two"><div class="field"><label for="an">اسم التطبيق</label><input id="an" class="input" maxlength="40" value="${esc(s.name)}"></div><div class="field"><label for="at">الشعار النصي</label><input id="at" class="input" maxlength="80" value="${esc(s.tagline)}"></div></div>
      <div class="field"><label>اللون الأساسي</label><div class="adm-colorrow"><input type="color" id="bc" value="${esc(s.brand_color)}" aria-label="اختيار اللون"><input id="bh" class="input" dir="ltr" value="${esc(s.brand_color)}" maxlength="7" style="max-width:140px" aria-label="كود اللون"></div></div>
      <div class="adm-preview" id="pv"><button class="btn btn-primary" type="button">زر أساسي</button><span class="tag tag-lime">وسم</span><span class="lime bold">نص بلون العلامة</span></div>
      <div class="field"><label for="lg">الشعار (صورة)</label><div class="adm-colorrow"><img id="lp" class="avatar" style="border-radius:12px;width:56px;height:56px;${s.logo ? '' : 'display:none'}" src="${esc(s.logo || '')}" alt="الشعار"><input id="lg" type="file" accept="image/*" class="input"></div></div>
      <div class="adm-formfoot"><button class="btn btn-primary" id="save">حفظ</button></div></section>
    <section class="card"><h3 style="margin-bottom:6px">الخصائص</h3>${FLAGS.map(([k, t, d]) => `<div class="adm-row" style="border-bottom:1px solid var(--line-soft);padding:6px 0"><div><b>${t}</b><br><span class="muted small">${d}</span></div>${sw(s.flags[k] !== false, `data-flag="${k}" aria-label="${t}"`)}</div>`).join('')}
      <p class="muted small" style="margin-top:10px">تُطبَّق الخصائص عند الحفظ. وضع الصيانة يتطلب تأكيداً.</p></section></div>
    <section class="card"><h3 style="margin-bottom:10px">المديرون</h3><div id="admins"></div>
      <div class="adm-toolbar" style="margin-top:14px"><div class="search-box">${icon('search', { size: 18 })}<input id="uq" class="input" placeholder="ابحث عن مستخدم لترقيته إلى مدير..." aria-label="بحث"></div></div><div id="cands"></div></section>`;

  const applyColor = (h) => { root.querySelector('#pv').style.setProperty('--lime', h); root.querySelector('#pv').style.setProperty('--lime-rgb', [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')); };
  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v);
  $('#bc', root).oninput = (e) => { s.brand_color = e.target.value; $('#bh', root).value = e.target.value; applyColor(e.target.value); };
  $('#bh', root).oninput = (e) => { if (isHex(e.target.value)) { s.brand_color = e.target.value; $('#bc', root).value = e.target.value; applyColor(e.target.value); } };
  $('#lg', root).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; s.logo = await api.uploadImage(f); const p = $('#lp', root); p.src = s.logo; p.style.display = ''; };
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-flag]'); if (!t) return;
    const v = flipSwitch(t);
    if (t.dataset.flag === 'maintenance' && v && !await confirmDlg({ title: 'تفعيل وضع الصيانة', message: 'سيُمنع المستخدمون من استخدام التطبيق عند الحفظ.', confirmText: 'تفعيل' })) { t.setAttribute('aria-checked', 'false'); return; }
    s.flags[t.dataset.flag] = v;
  });
  $('#save', root).onclick = async () => {
    s.name = $('#an', root).value.trim() || s.name; s.tagline = $('#at', root).value.trim();
    if (!isHex(s.brand_color)) return toast('كود اللون غير صحيح', { type: 'error' });
    await api.saveAppSettings(s); toast();
  };

  async function admins() {
    const { rows } = await api.adminListUsers({ role: 'admin', pageSize: 50 });
    $('#admins', root).innerHTML = rows.map((a) => `<div class="adm-mini">${avatar(a, 40)}<div class="grow"><b>${esc(a.name)}</b><span class="muted small">${esc(a.email)}</span></div>${a.id === me.id ? badge('أنت', 'lime') : `<button class="btn btn-danger btn-sm" data-demote="${a.id}">إزالة الصلاحية</button>`}</div>`).join('');
  }
  async function cands(q) {
    if (!q) { $('#cands', root).innerHTML = ''; return; }
    const { rows } = await api.adminListUsers({ q, role: 'user', pageSize: 5 });
    $('#cands', root).innerHTML = rows.map((u) => `<div class="adm-mini">${avatar(u, 36)}<div class="grow"><b>${esc(u.name)}</b><span class="muted small">${esc(u.email)}</span></div><button class="btn btn-outline btn-sm" data-promote="${u.id}">ترقية لمدير</button></div>`).join('') || '<p class="muted small">لا نتائج.</p>';
  }
  $('#uq', root).addEventListener('input', debounce((e) => cands(e.target.value.trim()), 250));
  root.addEventListener('click', async (e) => {
    const d = e.target.closest('[data-demote],[data-promote]'); if (!d) return;
    if (d.dataset.demote) { if (!await confirmDlg({ title: 'إزالة صلاحية المدير', message: 'سيتحول الحساب إلى مستخدم عادي.', confirmText: 'إزالة' })) return; await api.adminSetRole(d.dataset.demote, 'user'); }
    else { if (!await confirmDlg({ title: 'ترقية إلى مدير', message: 'سيحصل المستخدم على كامل صلاحيات لوحة الإدارة.', confirmText: 'ترقية', danger: false })) return; await api.adminSetRole(d.dataset.promote, 'admin'); }
    toast(); admins(); cands($('#uq', root).value.trim());
  });
  await admins();
}
