/** One-to-one chat. Polls every 4 s (no realtime dependency), marks incoming messages as read, tap your own message to delete it. */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, emptyState, confirmDialog, img } from '../ui/kit.js';
import { esc, $, on } from '../utils.js';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

export default async function chat({ root, params, navigate }) {
  const me = await api.currentUser(), otherId = params.id;
  if (otherId === me.id) { navigate('#/messages'); return; }
  const back = `<button class="icon-btn plain" data-back aria-label="رجوع">${icon('arrow', { size: 24, cls: 'rtl-flip' })}</button>`;
  on(root, 'click', '[data-back]', () => (history.length > 1 ? history.back() : navigate('#/messages')));

  let other = null, blocked = false;
  try { [other, blocked] = await Promise.all([api.getProfile(otherId), api.isBlockedByMe(otherId)]); } catch (e) { console.warn('[chat]', e); }
  if (!other || other.suspended) { root.innerHTML = `<header class="page-head">${back}<h1>المحادثة</h1></header>${emptyState({ icon: 'user', title: 'المستخدم غير متاح', text: 'تعذّر فتح هذه المحادثة.' })}`; return; }

  root.innerHTML = `<header class="page-head ch-head">${back}<a class="ch-who" href="#/user/${esc(other.id)}">${img(other.avatar, other.name, 'avatar', 'assets/img/av-1.svg')}<b>${esc(other.name)}</b></a></header>
    <div class="ch-list" id="ch-list" role="log" aria-live="polite"></div>
    ${blocked ? '<p class="muted small ch-note">لقد حظرت هذا المستخدم. ألغِ الحظر من صفحته لتتمكن من مراسلته.</p>'
      : `<form class="co-form ch-form" id="ch-form"><input class="input" id="ch-in" placeholder="اكتب رسالة..." maxlength="1000" autocomplete="off" aria-label="الرسالة"><button class="co-send" aria-label="إرسال">${icon('send', { size: 22, cls: 'rtl-flip' })}</button></form>`}`;
  const listEl = $('#ch-list', root);
  let thread = [], sig = '', alive = true, first = true;

  function render(stickToBottom) {
    if (!thread.length) { listEl.innerHTML = '<p class="muted ch-empty">ابدأ المحادثة بإرسال رسالة 👋</p>'; return; }
    const lastMineId = [...thread].reverse().find((m) => m.sender_id === me.id)?.id;
    listEl.innerHTML = thread.map((m) => {
      const mine = m.sender_id === me.id;
      return `<div class="ch-msg ${mine ? 'mine' : 'theirs'}" ${mine ? `data-mine="${esc(m.id)}" tabindex="0"` : ''}><p>${esc(m.body)}</p><span class="ch-meta">${hhmm(m.created_at)}${mine && m.id === lastMineId ? (m.read_at ? ' · تمت القراءة' : ' · تم الإرسال') : ''}</span></div>`;
    }).join('');
    if (stickToBottom) window.scrollTo({ top: document.body.scrollHeight, behavior: first ? 'auto' : 'smooth' });
    first = false;
  }
  async function refresh() {
    try {
      const t = await api.listThread(otherId);
      if (!alive) return;
      const hadUnread = t.some((m) => m.sender_id === otherId && !m.read_at);
      if (hadUnread) { await api.markThreadRead(otherId, t).catch(() => 0); t.forEach((m) => { if (m.sender_id === otherId && !m.read_at) m.read_at = new Date().toISOString(); }); }
      const s = t.map((m) => m.id + (m.read_at ? 'r' : '')).join('|');
      const grew = t.length > thread.length;
      thread = t;
      if (s !== sig) { sig = s; render(grew || first); }
    } catch (e) { console.warn('[chat refresh]', e); }
  }
  await refresh();
  if (!thread.length) render(false);
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 4000);

  const form = $('#ch-form', root);
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#ch-in', root), body = input.value.trim(); if (!body) return;
    input.disabled = true;
    try { await api.sendMessage(otherId, body); input.value = ''; await refresh(); }
    catch (er) { toast(/فارغة|طويلة/.test(er.message) ? er.message : 'تعذّر إرسال الرسالة', { type: 'error' }); }
    input.disabled = false; input.focus();
  });
  on(root, 'click', '[data-mine]', async (e, b) => {
    if (!(await confirmDialog({ title: 'حذف الرسالة؟', message: 'ستُحذف عندك وعند المستلم.', confirmText: 'حذف', danger: true }))) return;
    try { await api.deleteMessage(b.dataset.mine); sig = ''; await refresh(); } catch { toast('تعذّر الحذف', { type: 'error' }); }
  });
  return () => { alive = false; clearInterval(timer); };
}
