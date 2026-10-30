/**
 * Alarm engine (client side).
 *
 * - Checks enabled alarms every second while the app is open. When one is due it:
 *     1. marks it "ringing" (persisted in localStorage so a reload keeps ringing),
 *     2. opens the full-screen wake-up page (#/wake/:id) if the app is visible,
 *     3. plays an alarm sound (Web Audio — generated, no audio file),
 *     4. shows a system notification through the SERVICE WORKER with actions
 *        [صحيت] [غفوة 10 دقائق] and re-notifies every 2 minutes until dismissed.
 * - Notification action clicks arrive from sw.js as messages and call dismiss()/snooze().
 *
 * Browser limitation (be honest in README): web pages can't wake a sleeping phone. A PWA can only
 * ring reliably while the app/tab is alive or via Web Push from the server. The Android battery tip
 * in Settings explains how to keep the app alive.
 */
import * as api from './data/api.js';
import { isoDate, fmtTime12, fmtDays } from './utils.js';

const RING_KEY = 'fc:ringing';      // { alarmId, label, time, days, started, nextRepeat }
const SNOOZE_KEY = 'fc:snoozed';    // [{ alarmId, at, label, time }]
const REPEAT_MS = 2 * 60 * 1000;
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

let alarms = [], lastLoad = 0, firedKey = '', timer = null, goTo = null;

// ------------------------------------------------------------------ sound
let ctx = null, soundTimer = null;
export function unlockAudio() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* unsupported */ }
}
export function playAlarmSound() {
  unlockAudio(); stopAlarmSound(); if (!ctx) return;
  const beep = () => {
    if (!ctx) return; const t0 = ctx.currentTime;
    [0, .28, .56].forEach((o) => {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'square'; osc.frequency.value = o === .28 ? 1040 : 880;
      g.gain.setValueAtTime(0.0001, t0 + o); g.gain.exponentialRampToValueAtTime(0.25, t0 + o + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o + .22);
      osc.connect(g).connect(ctx.destination); osc.start(t0 + o); osc.stop(t0 + o + .25);
    });
  };
  beep(); soundTimer = setInterval(beep, 1200);
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
}
export function stopAlarmSound() { clearInterval(soundTimer); soundTimer = null; navigator.vibrate?.(0); }

// ------------------------------------------------------------------ notifications
/** Ask for notification permission (call from a user gesture, e.g. when enabling an alarm). */
export async function ensureNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}
async function notify(r, repeat = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts = {
    body: `${fmtTime12(r.time).full} — ${r.label || 'وقت التمرين'}`, tag: 'fc-alarm', renotify: true, requireInteraction: true, dir: 'rtl', lang: 'ar',
    icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', vibrate: [300, 150, 300],
    actions: [{ action: 'awake', title: 'صحيت' }, { action: 'snooze', title: 'غفوة 10 دقائق' }], data: { alarmId: r.alarmId, url: `./#/wake/${r.alarmId}` },
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) { await reg.showNotification(repeat ? 'ما زال المنبه يرن!' : 'وقت الاستيقاظ', opts); reg.active?.postMessage({ type: 'alarm-ring', repeatMs: REPEAT_MS }); }
    else new Notification('وقت الاستيقاظ', opts);
  } catch (e) { console.warn('[alarm] notification failed', e); }
}
async function closeNotifications() {
  try { (await (await navigator.serviceWorker?.ready)?.getNotifications({ tag: 'fc-alarm' }))?.forEach((n) => n.close()); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ ringing state
export const ringing = () => read(RING_KEY, null);

function startRinging(a, opts = {}) {
  const state = { alarmId: a.id ?? a.alarmId, label: a.label, time: a.time, days: a.days || [], started: Date.now(), nextRepeat: Date.now() + REPEAT_MS };
  write(RING_KEY, state);
  if (!opts.silent) { playAlarmSound(); notify(state); }
  if (document.visibilityState === 'visible' && !location.hash.startsWith('#/wake/')) goTo?.(`#/wake/${state.alarmId}`);
  return state;
}

/** User is awake: stop sound, clear notification & repeat. */
export async function dismiss() {
  write(RING_KEY, null); stopAlarmSound(); await closeNotifications();
  // one-shot alarms (no repeat days) switch themselves off after ringing
  return true;
}
/** Snooze N minutes: stop now, ring again later. */
export async function snooze(minutes = 10) {
  const r = ringing(); await dismiss();
  if (!r) return;
  const list = read(SNOOZE_KEY, []).filter((s) => s.alarmId !== r.alarmId);
  list.push({ alarmId: r.alarmId, at: Date.now() + minutes * 60000, label: r.label, time: r.time, days: r.days });
  write(SNOOZE_KEY, list);
}

// ------------------------------------------------------------------ engine loop
async function tick() {
  const now = new Date();
  if (Date.now() - lastLoad > 15000) { lastLoad = Date.now(); try { alarms = await api.listAlarms(); } catch { /* signed out */ } }

  // scheduled alarms
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const key = `${isoDate(now)}T${hhmm}`;
  if (key !== firedKey && now.getSeconds() < 20) {
    const due = alarms.find((a) => a.enabled && a.time === hhmm && (!a.days.length || a.days.includes(now.getDay())));
    if (due) { firedKey = key; if (!ringing()) startRinging(due); }
  }
  // snoozed alarms
  const sn = read(SNOOZE_KEY, []), left = [];
  for (const s of sn) { if (Date.now() >= s.at) { if (!ringing()) startRinging(s); } else left.push(s); }
  if (left.length !== sn.length) write(SNOOZE_KEY, left);

  // keep ringing: repeat notification every 2 minutes until dismissed
  const r = ringing();
  if (r && Date.now() >= r.nextRepeat) { r.nextRepeat = Date.now() + REPEAT_MS; write(RING_KEY, r); notify(r, true); if (document.visibilityState === 'visible') playAlarmSound(); }
}

/** Call once at boot. navigateFn(hash) is used to open the wake-up screen. */
export function startAlarmEngine(navigateFn) {
  goTo = navigateFn;
  clearInterval(timer); timer = setInterval(tick, 1000); tick();
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  // actions chosen on the system notification
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type !== 'alarm-action') return;
    if (e.data.action === 'snooze') snooze(10); else dismiss();
  });
  // a reload while ringing resumes the wake-up screen
  const r = ringing();
  if (r && Date.now() - r.started < 30 * 60000) goTo?.(`#/wake/${r.alarmId}`); else if (r) write(RING_KEY, null);
}
/** Force the alarm list to be re-read on the next tick (call after saving alarms). */
export const invalidateAlarms = () => { lastLoad = 0; };
/** Start ringing right now (used by the "test alarm" action). */
export const testRing = (a) => startRinging(a);
export { fmtDays };
