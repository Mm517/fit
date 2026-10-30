/** Small shared helpers (no data access here). */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape any user-generated text before putting it into an HTML string. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Event delegation: on(root,'click','[data-x]', (e, el) => …) */
export function on(root, type, selector, handler) {
  const fn = (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

/** Turn an HTML string into a single element. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- Dates (week starts Saturday, like the screenshots) ----------
/** Names indexed by JS getDay(): 0 = Sunday … 6 = Saturday */
export const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** Display order of a week: Saturday first. Values are JS getDay() numbers. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export const isoDate = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export function startOfWeek(d = new Date()) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() + 1) % 7; // days since Saturday
  x.setDate(x.getDate() - diff);
  return x;
}
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** '06:00' -> { h12:'6:00', period:'ص' } */
export function fmtTime12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { text: `${h12}:${String(m).padStart(2, '0')}`, period, full: `${h12}:${String(m).padStart(2, '0')} ${period}` };
}
/** Compact list of day names: all days => "يومياً" */
export function fmtDays(days = []) {
  if (days.length === 7) return 'يومياً';
  if (!days.length) return 'مرة واحدة';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAYS_AR[d]).join('، ');
}
export function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60); if (m < 60) return m === 1 ? 'منذ دقيقة' : m === 2 ? 'منذ دقيقتين' : m <= 10 ? `منذ ${m} دقائق` : `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60); if (h < 24) return h === 1 ? 'منذ ساعة' : h === 2 ? 'منذ ساعتين' : h <= 10 ? `منذ ${h} ساعات` : `منذ ${h} ساعة`;
  const d = Math.floor(h / 24); if (d < 30) return d === 1 ? 'منذ يوم' : d === 2 ? 'منذ يومين' : d <= 10 ? `منذ ${d} أيام` : `منذ ${d} يوماً`;
  return new Date(iso).toLocaleDateString('ar-EG');
}
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
export const fmtNum = (n) => new Intl.NumberFormat('en-US').format(n ?? 0);

/** Arabic-Indic / Persian digits -> western digits (for the coach parser). */
export const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

/** Resize an image File to a data URL (keeps localStorage small in mock mode). */
export function fileToDataURL(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
