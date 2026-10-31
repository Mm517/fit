/** Shared UI bits for picking + uploading media: progress bar, video validation, "compress then upload" with live status. */
import * as api from '../data/api.js';
import { canCompressVideo, probeVideo, VIDEO_PRESETS, MAX_SOURCE_VIDEO_BYTES, fmtBytes } from '../media.js';
import { esc } from '../utils.js';

export const progressHTML = () => `<div class="up-prog" hidden aria-live="polite"><div class="up-prog-bar"><i></i></div><span class="up-prog-txt"></span></div>`;

/** Controller for the markup above (root = any ancestor). */
export function bindProgress(root) {
  const box = root.querySelector('.up-prog'), bar = box.querySelector('i'), txt = box.querySelector('.up-prog-txt');
  return {
    show(text, value = 0) { box.hidden = false; txt.textContent = text; bar.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`; },
    hide() { box.hidden = true; bar.style.width = '0%'; },
  };
}

/** Throws an Arabic Error if the picked video can't be used for `kind` ('reel' | 'story'). */
export async function checkVideo(file, kind) {
  if (!/^video\//.test(file.type || '')) throw new Error('اختر ملف فيديو');
  if (file.size > MAX_SOURCE_VIDEO_BYTES) throw new Error('الفيديو كبير جداً (الحد 500 ميجا)');
  if (!canCompressVideo()) throw new Error('المتصفح ده مش بيدعم تحويل الفيديو. جرّب Chrome أو Safari حديث.');
  const { maxSeconds } = VIDEO_PRESETS[kind];
  const info = await probeVideo(file);
  if (Number.isFinite(info.duration) && info.duration > maxSeconds + 0.5) throw new Error(`الفيديو أطول من ${maxSeconds} ثانية`);
  return info;
}

/** Compress (live %) then upload. Returns { video, poster, summary } where summary says how much smaller it got. */
export async function uploadVideoWithProgress(file, kind, prog, signal) {
  const r = await api.uploadVideo(file, {
    kind, signal,
    onProgress: ({ phase, value }) => prog.show(phase === 'compress' ? `بحوّل الفيديو لصيغة خفيفة… ${Math.round(value * 100)}%` : 'بارفع الفيديو…', phase === 'compress' ? value * 0.92 : 0.96),
  });
  prog.hide();
  return { ...r, summary: `اتحوّل من ${fmtBytes(r.originalBytes)} إلى ${fmtBytes(r.bytes)}` };
}

export const hintHTML = (kind) => `<p class="muted xs" style="margin-top:6px">الفيديو بيتحوّل تلقائياً لصيغة خفيفة (${esc(kind === 'reel' ? 'حد أقصى 60 ثانية' : 'حد أقصى 30 ثانية')}). سيب الصفحة مفتوحة لحد ما يخلص.</p>`;
