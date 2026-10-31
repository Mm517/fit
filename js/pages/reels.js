/** Reels section: everyone's short videos in a grid; tap one to watch full-screen (swipe up/down). */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { skeleton, emptyState, img } from '../ui/kit.js';
import { openReelViewer } from '../ui/reels.js';
import { openReelComposer } from '../ui/composer.js';
import { esc, on, fmtNum } from '../utils.js';

export default async function reelsPage({ root, navigate }) {
  const me = await api.currentUser();
  root.innerHTML = `<header class="page-head"><h1>ريلز</h1><button class="icon-btn" data-new aria-label="ريل جديد">${icon('plus', { size: 22 })}</button></header>${skeleton('card', 3)}`;
  let reels = [];
  const draw = async () => {
    try { reels = await api.listReels({ limit: 60 }); } catch (e) { console.warn('[reels]', e); reels = []; }
    root.innerHTML = `<header class="page-head"><h1>ريلز</h1><button class="icon-btn" data-new aria-label="ريل جديد">${icon('plus', { size: 22 })}</button></header>
      ${reels.length ? `<div class="pf-grid rl-feed">${reels.map((r, i) => `<button class="pf-tile pf-rtile" data-reel="${i}" aria-label="ريل ${esc(r.author.name)}">${img(r.poster, 'ريل', '', 'assets/img/ex-default.svg')}
        <span class="pf-rmeta">${icon('heart', { size: 14 })}<span class="num">${fmtNum(r.likes)}</span><span class="rl-by">${esc(r.author.name.split(' ')[0])}</span></span></button>`).join('')}</div>`
        : emptyState({ icon: 'reel', title: 'لا توجد ريلز بعد', text: 'كن أول من ينشر ريل!', action: 'ريل جديد', actionId: 'new' })}`;
  };
  await draw();
  on(root, 'click', '[data-new], [data-act=new]', () => openReelComposer({ onDone: draw }));
  on(root, 'click', '[data-reel]', (e, b) => openReelViewer({ reels, startIndex: +b.dataset.reel, meId: me.id, navigate, onChange: (id) => { reels = reels.filter((r) => r.id !== id); }, onClose: draw }));
}
