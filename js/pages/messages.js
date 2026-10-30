/** Inbox: one row per conversation, newest first, with unread badges. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { skeleton, emptyState, img, toast } from '../ui/kit.js';
import { openUserSearch } from '../ui/people.js';
import { esc, on, timeAgo } from '../utils.js';

export default async function messages({ root, navigate }) {
  const head = `<header class="page-head center"><button class="icon-btn plain" data-back aria-label="رجوع">${icon('arrow', { size: 24, cls: 'rtl-flip' })}</button><h1>الرسائل</h1>
    <button class="icon-btn" data-new aria-label="رسالة جديدة">${icon('plus', { size: 22 })}</button></header>`;
  root.innerHTML = head + skeleton('card', 3);
  on(root, 'click', '[data-back]', () => navigate('#/community'));
  const newChat = () => openUserSearch({ title: 'رسالة جديدة', onPick: (id) => navigate(`#/chat/${id}`) });
  on(root, 'click', '[data-new], [data-act=new]', newChat);

  let list = [];
  try { list = await api.listInbox(); } catch (e) { console.warn('[inbox]', e); toast('تعذّر تحميل الرسائل', { type: 'error' }); }
  list.sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
  root.innerHTML = head + (list.length
    ? `<div class="in-list">${list.map((t) => `<a class="card in-row ${t.unread ? 'unread' : ''}" href="#/chat/${esc(t.user.id)}">
        ${img(t.user.avatar, t.user.name, 'avatar', 'assets/img/av-1.svg')}
        <div class="in-body"><div class="in-top"><b>${esc(t.user.name)}</b><span class="muted xs">${timeAgo(t.last.created_at)}</span></div>
          <p class="in-last ${t.unread ? '' : 'muted'}">${t.mine ? 'أنت: ' : ''}${esc(t.last.body)}</p></div>
        ${t.unread ? `<span class="in-badge num" aria-label="${t.unread} غير مقروءة">${t.unread}</span>` : ''}</a>`).join('')}</div>`
    : emptyState({ icon: 'message', title: 'لا توجد رسائل بعد', text: 'ادخل على بروفايل أي عضو واضغط «رسالة» لتبدأ المحادثة.', action: 'رسالة جديدة', actionId: 'new' }));
}
