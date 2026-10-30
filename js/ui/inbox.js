/** Conversation list shared by #/messages and #/chat/:id (the side column of the messenger). */
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { img, toast } from './kit.js';
import { openUserSearch } from './people.js';
import { esc, $, on, timeAgo } from '../utils.js';

export function mountInbox(host, { activeId = '', navigate } = {}) {
  host.innerHTML = `
    <header class="msgr-side-head"><h1>الرسائل</h1>
      <button class="icon-btn lime" data-new aria-label="رسالة جديدة">${icon('plus', { size: 22 })}</button></header>
    <div class="search-box msgr-search">${icon('search', { size: 18 })}<input class="input" id="msgr-q" type="search" placeholder="ابحث في المحادثات" aria-label="بحث في المحادثات" autocomplete="off"></div>
    <div class="msgr-list" id="msgr-list" aria-busy="true"><div class="skel" style="height:68px;margin-bottom:8px"></div><div class="skel" style="height:68px;margin-bottom:8px"></div><div class="skel" style="height:68px"></div></div>`;
  const listEl = $('#msgr-list', host);
  let all = [], alive = true, sig = '';

  const rowHTML = (t) => `<a class="msgr-row ${t.user.id === activeId ? 'active' : ''} ${t.unread ? 'unread' : ''}" href="#/chat/${esc(t.user.id)}" ${t.user.id === activeId ? 'aria-current="page"' : ''}>
      ${img(t.user.avatar, t.user.name, 'avatar', 'assets/img/av-1.svg')}
      <div class="msgr-row-body"><div class="msgr-row-top"><b>${esc(t.user.name)}</b><span class="muted xs">${timeAgo(t.last.created_at)}</span></div>
        <div class="msgr-row-bot"><p class="${t.unread ? '' : 'muted'}">${t.mine ? 'أنت: ' : ''}${esc(t.last.body)}</p>${t.unread ? `<span class="in-badge num" aria-label="${t.unread} غير مقروءة">${t.unread}</span>` : ''}</div></div></a>`;

  function render() {
    const q = $('#msgr-q', host).value.trim().toLowerCase();
    const list = q ? all.filter((t) => t.user.name.toLowerCase().includes(q)) : all;
    listEl.removeAttribute('aria-busy');
    listEl.innerHTML = list.length ? list.map(rowHTML).join('')
      : `<div class="msgr-none">${icon('message', { size: 40, stroke: 1.4 })}<b>${q ? 'لا توجد نتائج' : 'لا توجد رسائل بعد'}</b><p class="muted small">${q ? 'جرّب اسماً آخر.' : 'اضغط + أو ادخل على بروفايل أي عضو واضغط «رسالة».'}</p></div>`;
  }
  async function load(first) {
    try {
      const l = await api.listInbox();
      if (!alive) return;
      l.sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
      const s = l.map((t) => `${t.user.id}:${t.last.id}:${t.unread}:${t.last.read_at ? 1 : 0}`).join('|');
      if (first || s !== sig) { sig = s; all = l; render(); }
    } catch (e) { console.warn('[inbox]', e); if (first) { listEl.innerHTML = '<p class="muted" style="text-align:center;padding:24px">تعذّر تحميل الرسائل</p>'; toast('تعذّر تحميل الرسائل', { type: 'error' }); } }
  }
  $('#msgr-q', host).addEventListener('input', render);
  on(host, 'click', '[data-new], [data-act=new]', () => openUserSearch({ title: 'رسالة جديدة', onPick: (id) => navigate(`#/chat/${id}`) }));
  load(true);
  const timer = setInterval(() => { if (!document.hidden) load(false); }, 8000);
  return () => { alive = false; clearInterval(timer); };
}
