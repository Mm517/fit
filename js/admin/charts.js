/** Plain SVG charts (no libraries). */
import { esc } from '../utils.js';

const W = 860, H = 300, M = { t: 16, r: 16, b: 34, l: 40 };

/**
 * lineChart(container, { labels:[iso dates], series:[{ name, color, values }] })
 * Responsive via viewBox; hover shows a tooltip with every series value for that day.
 */
export function lineChart(container, { labels, series }) {
  const max = Math.max(4, ...series.flatMap((s) => s.values));
  const top = Math.ceil(max / 4) * 4, n = labels.length;
  const x = (i) => M.l + (i * (W - M.l - M.r)) / (n - 1), y = (v) => M.t + (1 - v / top) * (H - M.t - M.b);
  const grid = [0, 1, 2, 3, 4].map((k) => { const v = (top / 4) * k; return `<line x1="${M.l}" x2="${W - M.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${v}</text>`; }).join('');
  const xt = labels.map((d, i) => (i % 5 === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" class="tick">${new Date(d).getDate()}/${new Date(d).getMonth() + 1}</text>` : '')).join('');
  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    return `<path d="M${pts.join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z" fill="${s.color}" opacity=".08"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join('');
  container.innerHTML = `<div class="adm-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="رسم بياني لآخر 30 يوماً" preserveAspectRatio="xMidYMid meet">
      ${grid}${xt}${paths}<line class="hover-line" y1="${M.t}" y2="${H - M.b}" x1="0" x2="0" style="display:none"/>
      ${series.map((s, i) => `<circle class="hover-dot" data-s="${i}" r="5" fill="${s.color}" stroke="#05090c" stroke-width="2" style="display:none"/>`).join('')}
      <rect class="hit" x="${M.l}" y="${M.t}" width="${W - M.l - M.r}" height="${H - M.t - M.b}" fill="transparent"/></svg>
    <div class="adm-tip" hidden></div>
    <div class="adm-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div></div>`;
  const svg = container.querySelector('svg'), tip = container.querySelector('.adm-tip'), line = svg.querySelector('.hover-line'), dots = [...svg.querySelectorAll('.hover-dot')];
  const hide = () => { tip.hidden = true; line.style.display = 'none'; dots.forEach((d) => (d.style.display = 'none')); };
  svg.querySelector('.hit').addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / (W - M.l - M.r)) * (n - 1))));
    line.setAttribute('x1', x(i)); line.setAttribute('x2', x(i)); line.style.display = '';
    dots.forEach((d, k) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(series[k].values[i])); d.style.display = ''; });
    tip.innerHTML = `<b>${new Date(labels[i]).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}</b>${series.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.name)}: <b>${s.values[i]}</b></div>`).join('')}`;
    tip.hidden = false;
    const tx = (x(i) / W) * r.width; tip.style.left = `${Math.min(r.width - 150, Math.max(0, tx - 70))}px`;
  });
  svg.querySelector('.hit').addEventListener('pointerleave', hide);
}
