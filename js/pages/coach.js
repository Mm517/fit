/** AI Coach chat (screenshot 06) with inline ACTION CARDS (plan / alarm / edit / swap / log / post). */
import * as api from '../data/api.js';
import { sendToCoach, DEFAULT_SUGGESTIONS, WELCOME } from '../ai/coach.js';
import { applyAction, undoAction, dismissAction } from '../ai/tools.js';
import { icon } from '../ui/icons.js';
import { toast, openSheet, confirmDialog } from '../ui/kit.js';
import { esc, $, on, fmtDays } from '../utils.js';

const hhmm = (iso) => { const d = new Date(iso); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default async function coach({ root, query }) {
  const acked = new Set();
  root.innerHTML = `
    <div class="co-wrap">
      <header class="page-head"><h1 class="co-title">المدرب <span class="lime">${icon('spark', { size: 26 })}</span></h1>
        <button class="co-avatar" id="co-menu" aria-label="خيارات المحادثة">${icon('sparkO', { size: 22 })}</button></header>
      <div class="co-msgs" id="co-msgs" aria-live="polite"></div>
      <div class="co-bottom">
        <div class="chips co-chips" id="co-chips"></div>
        <form class="co-form" id="co-form"><input class="input" id="co-in" placeholder="اكتب رسالتك..." autocomplete="off" enterkeyhint="send" aria-label="رسالة"><button class="co-send" aria-label="إرسال">${icon('send', { size: 22, cls: 'rtl-flip' })}</button></form>
      </div>
    </div>`;
  const box = $('#co-msgs', root);
  const scroll = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

  // ---------- action cards ----------
  function cardHTML(a) {
    if (!a) return '';
    const r = a.result || {};
    if (a.status === 'undone') return `<div class="co-card co-card--done muted">${icon('undo', { size: 18 })} تم التراجع</div>`;
    if (a.status === 'dismissed') return `<div class="co-card co-card--done muted">${icon('x', { size: 18 })} تم الإلغاء</div>`;
    const lines = (r.lines || []).map((l) => `<div class="co-line"><span class="muted">${esc(l.day)} :</span> <b>${esc(l.text)}</b></div>`).join('');
    const undoBtn = `<button class="btn btn-outline btn-sm" data-undo="${a.id}">تراجع</button>`;
    if (a.tool === 'create_plan') {
      return a.status === 'proposed'
        ? `<div class="co-card"><h4 class="co-ct"><span class="lime">${esc(r.title)}</span> (مقترح)</h4>${lines}<button class="btn btn-primary btn-block" data-apply="${a.id}" style="margin-top:10px">تطبيق الجدول</button></div>`
        : `<div class="co-card"><h4 class="co-ct">${esc(r.title)}</h4>${lines}<div class="co-row"><span class="lime bold">${icon('check', { size: 18 })} تم التطبيق</span>${undoBtn}</div></div>`;
    }
    if (a.tool === 'set_alarm') {
      return `<div class="co-card"><div class="co-alarm"><span class="lime">${icon('bellFill', { size: 30 })}</span><div><h4 class="co-ct">تم ضبط المنبه: <span class="lime num">${esc(r.timeText)} ${esc(r.period)}</span></h4><div class="muted small">${esc(r.daysText || fmtDays(r.days))}</div></div></div>
        <div class="co-row">${acked.has(a.id) ? '' : `<button class="btn btn-primary btn-sm" data-ok="${a.id}">تم</button>`}${undoBtn}</div></div>`;
    }
    if (a.status === 'proposed') return `<div class="co-card"><h4 class="co-ct">${esc(r.summary)}</h4><div class="co-row"><button class="btn btn-primary btn-sm" data-apply="${a.id}">${a.tool === 'create_post' ? 'نشر' : 'تطبيق'}</button><button class="btn btn-outline btn-sm" data-dismiss="${a.id}">إلغاء</button></div></div>`;
    return `<div class="co-card"><h4 class="co-ct">${esc(r.summary)}</h4>${lines}<div class="co-row"><span class="lime bold">${icon('check', { size: 18 })} تم</span>${undoBtn}</div></div>`;
  }
  async function fillCard(slot) {
    const a = await api.getCoachAction(slot.dataset.card).catch(() => null);
    slot.innerHTML = cardHTML(a);
  }

  // ---------- messages ----------
  const addMsg = (m) => {
    const mine = m.role === 'user';
    const el = document.createElement('div'); el.className = `co-msg ${mine ? 'me' : 'bot'}`;
    el.innerHTML = `${mine ? '' : `<span class="co-bot-av">${icon('spark', { size: 20 })}</span>`}<div class="co-bub-wrap"><div class="co-bubble">${esc(m.text)}${m.card ? `<div data-card="${esc(m.card.action_id)}"></div>` : ''}</div><time class="co-time num">${hhmm(m.created_at || Date.now())}</time></div>`;
    box.append(el);
    const slot = el.querySelector('[data-card]'); if (slot) fillCard(slot);
    scroll();
  };
  const setChips = (list) => { $('#co-chips', root).innerHTML = list.map((s) => `<button class="chip co-chip" data-sug="${esc(s)}">${esc(s)}</button>`).join(''); };
  const typing = (on_) => {
    $('#co-typing', root)?.remove();
    if (on_) { const t = document.createElement('div'); t.id = 'co-typing'; t.className = 'co-msg bot'; t.innerHTML = `<span class="co-bot-av">${icon('spark', { size: 20 })}</span><div class="co-bubble co-dots" aria-label="المدرب يكتب"><i></i><i></i><i></i></div>`; box.append(t); scroll(); }
  };

  let busy = false;
  async function send(text) {
    text = text.trim(); if (!text || busy) return; busy = true;
    $('#co-in', root).value = ''; setChips([]);
    addMsg({ role: 'user', text, created_at: new Date().toISOString() }); typing(true);
    try {
      const res = await sendToCoach(text);
      typing(false); addMsg(res.reply); setChips(res.suggestions?.length ? res.suggestions : DEFAULT_SUGGESTIONS);
    } catch (e) { typing(false); toast('تعذّر الاتصال بالمدرب', { type: 'error' }); setChips(DEFAULT_SUGGESTIONS); }
    busy = false;
  }

  const hist = await api.coachHistory();
  if (!hist.length) addMsg({ role: 'coach', text: WELCOME, created_at: new Date().toISOString() }); else hist.forEach(addMsg);
  setChips(DEFAULT_SUGGESTIONS);

  $('#co-form', root).addEventListener('submit', (e) => { e.preventDefault(); send($('#co-in', root).value); });
  on(root, 'click', '[data-sug]', (e, b) => send(b.dataset.sug));
  const refresh = async (id) => { const s = box.querySelector(`[data-card="${id}"]`); if (s) await fillCard(s); };
  on(root, 'click', '[data-apply]', async (e, b) => {
    const id = b.dataset.apply, a = await api.getCoachAction(id);
    if (a.result?.replaces && !(await confirmDialog({ title: 'استبدال الجدول', message: 'سيتم استبدال جدولك الحالي بالكامل. متابعة؟', confirmText: 'متابعة' }))) return;
    await applyAction(id); await refresh(id); toast('تم تطبيق التغيير');
  });
  on(root, 'click', '[data-undo]', async (e, b) => { await undoAction(b.dataset.undo); await refresh(b.dataset.undo); toast('تم التراجع'); });
  on(root, 'click', '[data-dismiss]', async (e, b) => { await dismissAction(b.dataset.dismiss); await refresh(b.dataset.dismiss); });
  on(root, 'click', '[data-ok]', async (e, b) => { acked.add(b.dataset.ok); await refresh(b.dataset.ok); });
  on(root, 'click', '#co-menu', () => openSheet({ title: 'المحادثة', html: '<button class="btn btn-danger btn-block" id="clr">مسح المحادثة</button>',
    onMount: (el, close) => { $('#clr', el).onclick = async () => { close(); if (await confirmDialog({ title: 'مسح المحادثة؟', message: 'سيتم حذف كل الرسائل. لن يتم التراجع عن تعديلات الجدول.', confirmText: 'مسح', danger: true })) { await api.coachClear(); box.innerHTML = ''; addMsg({ role: 'coach', text: WELCOME, created_at: new Date().toISOString() }); } }; } }));

  if (query?.q) { history.replaceState(null, '', '#/coach'); send(query.q); }
}
