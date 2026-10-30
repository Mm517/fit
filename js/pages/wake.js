/**
 * Wake-up screen (screenshot 08): full-screen photo, huge time, pulsing lime ring,
 * [صحيت] and [غفوة 10 دقائق]. Plays the alarm sound while open.
 * Query: ?do=awake|snooze (applied when the page is opened from a notification action),
 *        ?preview=1 (test ring from the alarms page: no persistent ringing state).
 */
import * as api from '../data/api.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/kit.js';
import { esc, $, fmtTime12, fmtDays } from '../utils.js';
import { dismiss, snooze, ringing, playAlarmSound, stopAlarmSound } from '../alarm.js';

export default async function wake({ root, params, query, navigate }) {
  let alarm = await api.getAlarm(params.id).catch(() => null);
  const r = ringing();
  alarm ||= r ? { time: r.time, label: r.label, days: r.days } : null;
  const time = alarm ? fmtTime12(alarm.time) : fmtTime12(`${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`);

  const finish = async (kind) => {
    stopAlarmSound();
    if (kind === 'snooze') { await snooze(10); toast('سنوقظك بعد 10 دقائق'); } else { await dismiss(); toast('صباح الخير! يوم موفق'); }
    navigate('#/');
  };
  if (query.do === 'awake' || query.do === 'snooze') { await finish(query.do); return; }

  root.innerHTML = `
    <section class="wake" aria-label="وقت الاستيقاظ">
      <div class="wake-bg" aria-hidden="true"></div>
      <h1 class="wake-title">وقت الاستيقاظ</h1>
      <div class="wake-ring" role="timer" aria-live="polite"><div class="wake-pulse"></div>
        <div class="wake-inner"><b class="num wake-time">${time.text}</b><div class="wake-label">${esc(alarm?.label || 'وقت التمرين')}</div>
        <div class="wake-days">${esc(alarm ? fmtDays(alarm.days) : '')}</div></div></div>
      <div class="wake-actions">
        <button class="btn btn-primary btn-block wake-main" id="awake">صحيت</button>
        <button class="btn btn-outline btn-block" id="snooze">غفوة 10 دقائق</button>
      </div>
      <p class="wake-foot">بداية يومك تصنع فرقاً ${icon('chart', { size: 18 })}</p>
    </section>`;

  playAlarmSound(); // browsers need a prior user gesture; main.js unlocks audio on first tap
  $('#awake', root).addEventListener('click', () => finish('awake'));
  $('#snooze', root).addEventListener('click', () => finish('snooze'));
  const onFirstTap = () => playAlarmSound();
  root.addEventListener('pointerdown', onFirstTap, { once: true });
  return () => stopAlarmSound(); // leaving the page silences the sound (ringing state is kept until dismissed)
}
