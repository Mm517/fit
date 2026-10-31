/**
 * NETWORK awareness.
 *   startNetWatch()      shows a sticky banner when the device goes offline and a toast when it comes back
 *   isOnline()           navigator.onLine (false = definitely offline)
 *   requireOnline(what)  throws a friendly Arabic Error when offline (use before AI / upload calls)
 *   isNetworkError(e)    true for fetch/import failures that are really "no connection"
 *   offlineState({retry})  HTML for a full-page "no internet" state (router uses it when a page chunk can't load)
 */
import { icon } from './icons.js';
import { toast } from './kit.js';

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export function requireOnline(what = 'الخدمة دي') {
  if (!isOnline()) throw new Error(`مفيش اتصال بالإنترنت. ${what} محتاجة نت، جرّب تاني لما الاتصال يرجع.`);
}

const NET_RE = /(failed to fetch|networkerror|network request failed|load failed|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|fetch failed|timeout|timed out)/i;
export const isNetworkError = (e) => NET_RE.test(String(e?.message || e || ''));

export function offlineState({ title = 'مفيش اتصال بالإنترنت', text = 'اتأكد من الواي فاي أو بيانات الموبايل وجرّب تاني.', action = 'إعادة المحاولة' } = {}) {
  return `<div class="empty net-empty">${icon('wifiOff', { size: 56, stroke: 1.4 })}<h3>${title}</h3><p>${text}</p><button class="btn btn-primary" data-net-retry>${action}</button></div>`;
}

let banner = null, started = false;
function ensureBanner() {
  if (banner) return banner;
  banner = document.createElement('div');
  banner.id = 'net-banner'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); banner.hidden = true;
  banner.innerHTML = `${icon('wifiOff', { size: 18 })}<span>مفيش اتصال بالإنترنت — المدرب والتغذية ورفع الصور والفيديو مش هيشتغلوا لحد ما النت يرجع.</span>`;
  document.body.prepend(banner);
  return banner;
}

export function startNetWatch() {
  if (started) return; started = true;
  const show = () => { ensureBanner().hidden = false; document.body.classList.add('is-offline'); };
  const hide = () => { if (banner) banner.hidden = true; document.body.classList.remove('is-offline'); };
  window.addEventListener('offline', show);
  window.addEventListener('online', () => { hide(); toast('رجع الاتصال بالإنترنت'); });
  if (!isOnline()) show();
}
