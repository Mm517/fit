/** Messages: conversation list (phones) / list + empty pane (desktop). Opening a conversation goes to #/chat/:id. */
import { icon } from '../ui/icons.js';
import { mountInbox } from '../ui/inbox.js';
import { openUserSearch } from '../ui/people.js';
import { $, on } from '../utils.js';

export default async function messages({ root, navigate }) {
  root.innerHTML = `<div class="msgr" data-mode="inbox">
    <aside class="msgr-side" id="msgr-side"></aside>
    <section class="msgr-main msgr-welcome"><div>${icon('message', { size: 64, stroke: 1.3 })}<h2>رسائلك</h2><p class="muted">اختر محادثة من القائمة أو ابدأ محادثة جديدة مع أي عضو.</p>
      <button class="btn btn-primary" id="mw-new">${icon('plus', { size: 18 })} رسالة جديدة</button></div></section></div>`;
  on(root, 'click', '#mw-new', () => openUserSearch({ title: 'رسالة جديدة', onPick: (id) => navigate(`#/chat/${id}`) }));
  return mountInbox($('#msgr-side', root), { navigate });
}
