/**
 * One-to-one chat. Layout: [conversation list | thread] on desktop, thread only on phones.
 * Polls every 4 s (no realtime dependency), marks incoming messages as read, tap your own message to delete it.
 */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast, confirmDialog, img } from '../ui/kit.js';
import { mountInbox } from '../ui/inbox.js';
import { esc, $, on } from '../utils.js';

const hhmm = (iso) => new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso) => new Date(iso).toDateString();
function dayLabel(iso) {
  const d = new Date(iso), t = new Date(), y = new Date(Date.now() - 864e5);
  if (d.toDateString() === t.toDateString()) return 'اليوم';
  if (d.toDateString() === y.toDateString()) return 'أمس';
  return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default async function chat({ root, params, navigate }) {
  const me = await api.currentUser(), otherId = params.id;
  if (otherId === me.id) { navigate('#/messages'); return; }

  let other = null, blocked = false;
  try { [other, blocked] = await Promise.all([api.getProfile(otherId), api.isBlockedByMe(otherId)]); } catch (e) { console.warn('[chat]', e); }

  const shell = (mainHTML) => `<div class="msgr" data-mode="chat"><aside class="msgr-side" id="msgr-side"></aside><section class="msgr-main ch-pane">${mainHTML}</section></div>`;
  const back = `<button class="icon-btn plain ch-back" data-back aria-label="رجوع">${icon('arrowBack', { size: 24 })}</button>`;
  on(root, 'click', '[data-back]', () => navigate('#/messages'));

  if (!other || other.suspended) {
    root.innerHTML = shell(`<header class="ch-head">${back}<b>المحادثة</b></header><div class="empty" style="margin:auto">${icon('user', { size: 56, stroke: 1.4 })}<h3>المستخدم غير متاح</h3><p>تعذّر فتح هذه المحادثة.</p></div>`);
    return mountInbox($('#msgr-side', root), { navigate });
  }

  root.innerHTML = shell(`
    <header class="ch-head">${back}
      <a class="ch-who" href="#/user/${esc(other.id)}">${img(other.avatar, other.name, 'avatar', 'assets/img/av-1.svg')}<span><b>${esc(other.name)}</b><small class="muted xs">${esc(other.goal || 'عضو في FitCircle')}</small></span></a></header>
    <div class="ch-list" id="ch-list" role="log" aria-live="polite" aria-label="الرسائل"></div>
    ${blocked ? '<p class="muted small ch-note">لقد حظرت هذا المستخدم. ألغِ الحظر من صفحته لتتمكن من مراسلته.</p>'
      : `<form class="ch-form" id="ch-form" autocomplete="off"><textarea class="ch-input" id="ch-in" rows="1" maxlength="1000" placeholder="اكتب رسالة..." aria-label="الرسالة" enterkeyhint="send"></textarea>
         <button class="co-send ch-send" id="ch-send" aria-label="إرسال" disabled>${icon('send', { size: 22, cls: 'rtl-flip' })}</button></form>`}`);
  const stopInbox = mountInbox($('#msgr-side', root), { activeId: otherId, navigate });
  const listEl = $('#ch-list', root), input = $('#ch-in', root), sendBtn = $('#ch-send', root);
  let thread = [], sig = '', alive = true, first = true;

  const atBottom = () => listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 90;
  const toBottom = (smooth) => requestAnimationFrame(() => listEl.scrollTo({ top: listEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));

  function render(stick) {
    if (!thread.length) { listEl.innerHTML = `<div class="ch-empty">${img(other.avatar, other.name, 'avatar ch-empty-av', 'assets/img/av-1.svg')}<b>${esc(other.name)}</b><p class="muted small">ابدأ المحادثة بإرسال رسالة.</p></div>`; return; }
    const lastMineId = [...thread].reverse().find((m) => m.sender_id === me.id)?.id;
    let html = '', prevDay = '', prevSender = '';
    thread.forEach((m, i) => {
      const mine = m.sender_id === me.id, dk = dayKey(m.created_at), next = thread[i + 1];
      if (dk !== prevDay) { html += `<div class="ch-day"><span>${esc(dayLabel(m.created_at))}</span></div>`; prevDay = dk; prevSender = ''; }
      const groupStart = prevSender !== m.sender_id, groupEnd = !next || next.sender_id !== m.sender_id || dayKey(next.created_at) !== dk;
      html += `<div class="ch-msg ${mine ? 'mine' : 'theirs'} ${groupStart ? 'gs' : ''} ${groupEnd ? 'ge' : ''}" ${mine ? `data-mine="${esc(m.id)}" tabindex="0" title="اضغط للحذف"` : ''}><p>${esc(m.body)}</p>${groupEnd ? `<span class="ch-meta">${hhmm(m.created_at)}${mine && m.id === lastMineId ? (m.read_at ? ` · ${icon('check', { size: 12 })} تمت القراءة` : ' · تم الإرسال') : ''}</span>` : ''}</div>`;
      prevSender = m.sender_id;
    });
    listEl.innerHTML = html;
    if (stick) toBottom(!first);
    first = false;
  }
  async function refresh() {
    try {
      const t = await api.listThread(otherId);
      if (!alive) return;
      const hadUnread = t.some((m) => m.sender_id === otherId && !m.read_at);
      if (hadUnread) { await api.markThreadRead(otherId, t).catch(() => 0); t.forEach((m) => { if (m.sender_id === otherId && !m.read_at) m.read_at = new Date().toISOString(); }); }
      const s = t.map((m) => m.id + (m.read_at ? 'r' : '')).join('|');
      const grew = t.length > thread.length, stick = first || (grew && (atBottom() || t[t.length - 1]?.sender_id === me.id));
      thread = t;
      if (s !== sig) { sig = s; render(stick); }
    } catch (e) { console.warn('[chat refresh]', e); }
  }
  await refresh();
  if (!thread.length) render(false);
  const timer = setInterval(() => { if (!document.hidden) refresh(); }, 4000);

  if (input) {
    const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 130)}px`; sendBtn.disabled = !input.value.trim(); };
    input.addEventListener('input', grow);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#ch-form', root).requestSubmit(); } });
    $('#ch-form', root).addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input.value.trim(); if (!body || sendBtn.disabled) return;
      sendBtn.disabled = true; input.readOnly = true;
      try { await api.sendMessage(otherId, body); input.value = ''; input.style.height = 'auto'; await refresh(); }
      catch (er) { toast(/فارغة|طويلة/.test(er.message) ? er.message : 'تعذّر إرسال الرسالة', { type: 'error' }); }
      input.readOnly = false; sendBtn.disabled = !input.value.trim(); input.focus();
    });
    if (matchMedia('(min-width: 900px)').matches) input.focus();
  }
  on(root, 'click', '[data-mine]', async (e, b) => {
    if (!(await confirmDialog({ title: 'حذف الرسالة؟', message: 'ستُحذف عندك وعند المستلم.', confirmText: 'حذف', danger: true }))) return;
    try { await api.deleteMessage(b.dataset.mine); sig = ''; await refresh(); } catch { toast('تعذّر الحذف', { type: 'error' }); }
  });
  return () => { alive = false; clearInterval(timer); stopInbox(); };
}
