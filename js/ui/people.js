/** Shared people UI: a person row, a followers/following list sheet and the "find members" search sheet. */
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { openSheet, img } from './kit.js';
import { esc, $, on, debounce } from '../utils.js';

export const personRow = (u, sub = '') => `<a class="pp-row" href="#/user/${esc(u.id)}" data-person="${esc(u.id)}">${img(u.avatar, u.name, 'avatar', 'assets/img/av-1.svg')}
  <div class="pp-who"><b>${esc(u.name)}</b><span class="muted xs">${esc(sub || u.goal || '')}</span></div></a>`;

/** Sheet with a list of people; tapping one opens their profile (or calls onPick(id) when given). */
export function openPeopleList(title, users, { onPick, empty = 'لا يوجد أحد هنا بعد.' } = {}) {
  return openSheet({
    title, html: `<div class="pp-list">${users.length ? users.map((u) => personRow(u)).join('') : `<p class="muted" style="text-align:center;padding:18px">${esc(empty)}</p>`}</div>`,
    onMount: (el, close) => on(el, 'click', '[data-person]', (e, b) => { if (onPick) { e.preventDefault(); onPick(b.dataset.person); } close(); }),
  });
}

/** Search members by name. Default action: open the profile. */
export function openUserSearch({ title = 'ابحث عن أعضاء', onPick } = {}) {
  return openSheet({
    title, html: `<div class="field"><input id="us-q" class="input" type="search" placeholder="اكتب اسم العضو (حرفين على الأقل)" maxlength="40" autocomplete="off"></div>
      <div class="pp-list" id="us-res"><p class="muted" style="text-align:center;padding:18px">ابدأ بكتابة الاسم.</p></div>`,
    onMount: (el, close) => {
      const out = $('#us-res', el);
      const run = debounce(async () => {
        const q = $('#us-q', el).value.trim();
        if (q.length < 2) { out.innerHTML = '<p class="muted" style="text-align:center;padding:18px">ابدأ بكتابة الاسم.</p>'; return; }
        try {
          const list = await api.searchUsers(q);
          out.innerHTML = list.length ? list.map((u) => personRow(u)).join('') : '<p class="muted" style="text-align:center;padding:18px">لا توجد نتائج.</p>';
        } catch { out.innerHTML = '<p class="muted" style="text-align:center;padding:18px">تعذّر البحث، حاول مرة أخرى.</p>'; }
      }, 300);
      $('#us-q', el).addEventListener('input', run);
      setTimeout(() => $('#us-q', el)?.focus(), 250);
      on(el, 'click', '[data-person]', (e, b) => { if (onPick) { e.preventDefault(); onPick(b.dataset.person); } close(); });
    },
  });
}
