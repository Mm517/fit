/**
 * Inline SVG icon set (no emoji anywhere in the UI). 24x24 viewBox, stroke-based, currentColor.
 * Usage: icon('home') / icon('flame', { size: 28, cls: 'flame' })
 * Directional icons (arrow, chevron) point to the "forward" side in RTL (left) by default
 * and flip automatically via the .rtl-flip class when needed.
 */
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V10"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  spark: '<path d="M12 2.5c.6 4.9 2.6 6.9 7.5 9.5-4.9 2.6-6.9 4.6-7.5 9.5-.6-4.9-2.6-6.9-7.5-9.5C9.4 9.4 11.4 7.4 12 2.5Z" fill="currentColor" stroke="none"/>',
  sparkO: '<path d="M12 2.5c.6 4.9 2.6 6.9 7.5 9.5-4.9 2.6-6.9 4.6-7.5 9.5-.6-4.9-2.6-6.9-7.5-9.5C9.4 9.4 11.4 7.4 12 2.5Z"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.5c.4-3.2 3-5 6.2-5s5.8 1.8 6.2 5"/><circle cx="17.2" cy="9.6" r="2.4"/><path d="M17.5 14.4c2.2.2 3.8 1.7 4.2 4.4"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c.5-4 3.6-6.2 7.5-6.2s7 2.2 7.5 6.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',           // points left (= forward in RTL)
  arrowBack: '<path d="M5 12h14M13 6l6 6-6 6"/>',          // points right (= back in RTL)
  chevron: '<path d="m14.5 6-6 6 6 6"/>',                  // points left
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronUp: '<path d="m6 14.5 6-6 6 6"/>',
  flame: '<path d="M12 2.8c.5 3.2 4.7 5.2 4.7 10a4.7 4.7 0 0 1-9.4 0c0-1.9.9-3 1.8-3.9.2 1.4.8 2.2 1.6 2.6C10.1 8.6 10.6 5.4 12 2.8Z" fill="currentColor" stroke="none"/><path d="M12 21c-2 0-3.2-1.3-3.2-2.9 0-1.6 1.3-2.4 2.1-3.7.4 1 1.1 1.3 1.6 1.7.8-.7 1.1-1.5 1.1-2.4 1.1.9 1.6 2.1 1.6 3.3 0 1.9-1.4 4-3.2 4Z" fill="#0b1114" stroke="none" opacity=".25"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.8M4 5.2 6.8 3M20 5.2 17.2 3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  bellFill: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z" fill="currentColor"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2.2" fill="currentColor" stroke="none"/><path d="M21 10.5v3" stroke-width="2.2"/><path d="M11 9.2 9.2 12.2h2.6L10.4 15" stroke="#0b1114" stroke-width="1.6" fill="none"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 3.6 5.2 3.6 8.5s-1.1 6.1-3.6 8.5c-2.5-2.4-3.6-5.2-3.6-8.5S9.5 5.9 12 3.5Z"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8v.1" stroke-width="2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" stroke-width="2.4"/>',
  checkCircle: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="m7.8 12.4 3 3 5.4-6" stroke="#0b1114" stroke-width="2.3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  heartFill: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" fill="currentColor"/>',
  comment: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5Z"/>',
  bookmark: '<path d="M6.5 4h11v16.5L12 16.5l-5.5 4Z"/>',
  bookmarkFill: '<path d="M6.5 4h11v16.5L12 16.5l-5.5 4Z" fill="currentColor"/>',
  flag: '<path d="M5.5 21V4.5M5.5 5h11l-2 4 2 4h-11"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17 5-4.5 3.5 3L16 12l4.5 4.5"/>',
  send: '<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4Z"/>',
  scale: '<rect x="4" y="5" width="16" height="15" rx="3.5"/><path d="M8.5 10a4 4 0 0 1 7 0M12 9l1.2 1.8"/>',
  weight: '<path d="M7 9h10l2 10.5H5Z"/><circle cx="12" cy="6.2" r="2.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  drag: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M9.8 5.8A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.2 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.6-.3 3.7-.8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1Z"/>',
  logout: '<path d="M14 4.5h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6Z"/>',
  shieldCheck: '<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6Z"/><path d="m8.8 12 2.4 2.4 4.2-4.6"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
  play: '<path d="M8 5.5v13l11-6.5Z" fill="currentColor"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.8M9.5 2.8h5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  trophy: '<path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0ZM7.5 6H4.5c0 3 1 4.5 3 5M16.5 6h3c0 3-1 4.5-3 5M12 14v3.5M8.5 20.5h7M9.5 17.5h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  filter: '<path d="M4 6h16l-6 7.5V19l-4 1.5v-7Z"/>',
  upload: '<path d="M12 16V4.5M7 9l5-5 5 5M4.5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  download: '<path d="M12 4.5V16M7 11.5l5 5 5-5M4.5 19.5h15"/>',
  chart: '<path d="M4 20.5V4M4 20.5h16.5"/><path d="m7.5 15 4-4.5 3 2.5 4.5-6"/>',
  bars: '<path d="M5 20.5v-8M10 20.5V6M15 20.5v-5M20 20.5V10"/>',
  list: '<path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor"/>',
  message: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V17h0A2.5 2.5 0 0 1 4 14.5Z"/><path d="M8 9h8M8 12.2h5"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  sofa: '<path d="M5 11V8.5A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5V11"/><path d="M3.5 12.5a2 2 0 0 1 4 0V15h9v-2.5a2 2 0 0 1 4 0V18a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1Z"/><path d="M6 19v1.5M18 19v1.5"/>',
  lightning: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z" fill="currentColor"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 8 7.5 5.5L19.5 8"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4M19.5 4.5v4.2h-4.2"/>',
  undo: '<path d="M9 8H5V4M5.3 8A8 8 0 1 1 4 13"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  dots: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  install: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8.5 8.5 7 7M15.5 9v6.5H9" />',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8Z"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/>',
  layers: '<path d="m12 3.5 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  broadcast: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v4h4M12 8v4.3l2.8 1.7"/>',
};

export function icon(name, { size = 22, cls = '', stroke = 1.8 } = {}) {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Brand mark: lime rounded square with a "C ring + F + dumbbell" monogram. */
export function logoMark(size = 56, { bg = true } = {}) {
  const mark = `
    <g fill="none" stroke="#C6FF3D" stroke-linecap="round" stroke-linejoin="round">
      <path d="M45.5 20.2A22 22 0 1 0 45.5 59.8" stroke-width="7"/>
      <path d="M33 22.5h15M30.5 42h13.5" stroke-width="7"/><path d="M33 22.5 29 58" stroke-width="7.5"/>
      <path d="M57 30v20M63.5 26v28M70 33v14" stroke-width="5"/><path d="M57 40h6.5" stroke-width="3"/>
    </g>`;
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 80 80" role="img" aria-label="FitCircle">
    ${bg ? '<rect x="1.5" y="1.5" width="77" height="77" rx="20" fill="#071014" stroke="#C6FF3D" stroke-width="2.2"/>' : ''}${mark}</svg>`;
}
