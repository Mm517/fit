/** AI Coach admin: system prompt, tool switches, confirmation rules, daily limit, conversation log viewer. */
import * as api from '../data/api.js';
import { toolList } from '../ai/tools.js';
import { esc, icon, badge, sw, flipSwitch, avatar, loading, empty, pageHead, fmtDateTime, $, $$ } from './common.js';
import { toast } from '../ui/kit.js';
import { timeAgo } from '../utils.js';

const STATUS = { applied: ['نُفّذ', 'green'], proposed: ['بانتظار التأكيد', 'orange'], undone: ['تم التراجع', 'mut'], dismissed: ['أُلغي', 'mut'] };

export default async function coach({ root }) {
  const s = JSON.parse(JSON.stringify(await api.getCoachSettings()));
  const tools = toolList();
  root.innerHTML = `${pageHead('المدرب الذكي', '', 'التحكم في سلوك المدرب وصلاحياته')}
    <div class="adm-grid2"><section class="card adm-form"><h3>تعليمات النظام (System Prompt)</h3>
      <p class="muted small">مفتاح مزوّد الذكاء الاصطناعي لا يُحفظ هنا أبداً؛ يبقى داخل Edge Function على الخادم. هذه التعليمات تُرسل إليها مع كل محادثة.</p>
      <textarea id="sp" class="input" rows="7" aria-label="تعليمات النظام">${esc(s.system_prompt)}</textarea>
      <div class="field"><label for="dl">الحد اليومي للرسائل لكل مستخدم</label><input id="dl" type="number" min="1" max="1000" class="input" value="${s.daily_limit}" style="max-width:200px"></div></section>
    <section class="card"><h3 style="margin-bottom:8px">الأدوات وقواعد التأكيد</h3>
      <div class="adm-tablewrap"><table><thead><tr><th scope="col">الأداة</th><th scope="col">مفعّلة</th><th scope="col">تتطلب تأكيداً</th></tr></thead><tbody>
      ${tools.map((t) => `<tr><td><b>${esc(t.label)}</b><br><code>${t.name}</code></td><td>${sw(s.tools[t.name] !== false, `data-tool="${t.name}" aria-label="تفعيل ${esc(t.label)}"`)}</td><td>${sw(s.confirm[t.name] ?? t.confirm, `data-conf="${t.name}" aria-label="تأكيد ${esc(t.label)}"`)}</td></tr>`).join('')}</tbody></table></div></section></div>
    <div class="adm-formfoot" style="margin-bottom:22px"><button class="btn btn-primary" id="save">حفظ الإعدادات</button></div>
    <h3 style="margin-bottom:10px">سجل المحادثات</h3>
    <div class="adm-split card"><div><div class="search-box" style="margin-bottom:8px">${icon('search', { size: 18 })}<input id="cq" class="input" placeholder="بحث عن مستخدم..." aria-label="بحث"></div><div class="adm-convlist" id="convs">${loading(3)}</div></div><div class="adm-thread" id="thread">${empty('اختر محادثة', 'ستظهر الرسائل والإجراءات المنفّذة هنا', 'message')}</div></div>`;

  root.addEventListener('click', (e) => { const t = e.target.closest('[data-tool],[data-conf]'); if (!t) return; const v = flipSwitch(t); if (t.dataset.tool) s.tools[t.dataset.tool] = v; else s.confirm[t.dataset.conf] = v; });
  $('#save', root).onclick = async () => {
    const lim = parseInt($('#dl', root).value, 10);
    if (!(lim >= 1)) return toast('الحد اليومي غير صحيح', { type: 'error' });
    s.system_prompt = $('#sp', root).value.trim(); s.daily_limit = lim;
    await api.saveCoachSettings(s); toast();
  };

  let convs = [], active = null;
  const paintList = (q = '') => {
    const list = convs.filter((c) => !q || c.user.name.includes(q) || c.user.email.includes(q));
    $('#convs', root).innerHTML = list.length ? list.map((c) => `<button class="adm-conv ${c.user.id === active ? 'active' : ''}" data-u="${c.user.id}">${avatar(c.user, 40)}<div style="min-width:0"><b>${esc(c.user.name)}</b><br><span class="muted small">${c.count} رسائل · ${timeAgo(c.last_at)}</span></div></button>`).join('') : empty('لا توجد محادثات');
  };
  convs = await api.adminListConversations(); paintList();
  $('#cq', root).addEventListener('input', (e) => paintList(e.target.value.trim()));
  $('#convs', root).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-u]'); if (!b) return; active = b.dataset.u; paintList($('#cq', root).value.trim());
    const { messages, actions } = await api.adminGetConversation(active);
    const items = [...messages.map((m) => ({ k: 'm', at: m.created_at, m })), ...actions.map((a) => ({ k: 'a', at: a.created_at, a }))].sort((x, y) => (x.at > y.at ? 1 : -1));
    const labels = Object.fromEntries(tools.map((t) => [t.name, t.label]));
    $('#thread', root).innerHTML = items.map((it) => it.k === 'm'
      ? `<div class="adm-msg ${it.m.role === 'user' ? 'user' : ''}">${esc(it.m.text)}<small>${it.m.role === 'user' ? 'المستخدم' : 'المدرب'} · ${fmtDateTime(it.m.created_at)}</small></div>`
      : `<div class="adm-action"><b>${icon('bolt', { size: 14 })} ${esc(labels[it.a.tool] || it.a.tool)}</b> ${badge(...(STATUS[it.a.status] || [it.a.status, 'mut']))}<br><span class="muted small">${esc(it.a.result?.summary || '')} · ${fmtDateTime(it.a.created_at)}</span></div>`).join('');
  });
}
