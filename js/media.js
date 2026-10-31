/**
 * MEDIA helpers (browser only, no dependencies).
 *
 *   toWebP(file, { maxSide, quality })      any image  -> WebP File   (JPEG fallback on browsers that cannot encode WebP)
 *   compressVideo(file, { preset, onProgress, signal })  any video -> small WebM/MP4 File (re-encoded with MediaRecorder)
 *   videoPoster(fileOrUrl, { maxSide })     first frame -> WebP File
 *   probeVideo(file)                        { duration, width, height }
 *
 * Why in the browser? The Storage bucket is capped (25 MB) and phones record huge 1080p/4K clips; converting before
 * upload keeps the app fast and the bucket small. Videos are re-encoded in REAL TIME (a 30 s clip takes ~30 s).
 */

const IMAGE_PRESETS = {
  avatar: { maxSide: 512, quality: 0.82 },
  post: { maxSide: 1600, quality: 0.8 },
  story: { maxSide: 1440, quality: 0.8 },
  meal: { maxSide: 1280, quality: 0.8 },
  default: { maxSide: 1600, quality: 0.8 },
};
export const VIDEO_PRESETS = {
  // short side (px), fps, video bits/s, audio bits/s, max seconds
  reel: { short: 720, fps: 30, vbps: 1_300_000, abps: 96_000, maxSeconds: 60 },
  story: { short: 540, fps: 30, vbps: 900_000, abps: 80_000, maxSeconds: 30 },
};
export const MAX_SOURCE_VIDEO_BYTES = 500 * 1024 * 1024; // what the user may pick (it is shrunk before upload)

const blobFromCanvas = (canvas, type, quality) => new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
const swapExt = (name, ext) => `${String(name || 'file').replace(/\.[^./\\]+$/, '')}.${ext}`;

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('تعذّر قراءة الصورة')); im.src = url;
    });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 4000); }
}

/** Any image File -> WebP File (resized so the longest side <= maxSide). Falls back to JPEG if WebP encoding is unsupported. */
export async function toWebP(file, opts = {}) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('اختر ملف صورة');
  const { maxSide, quality } = { ...IMAGE_PRESETS.default, ...(typeof opts === 'string' ? IMAGE_PRESETS[opts] : opts) };
  const src = await decodeImage(file);
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  if (!w0 || !h0) throw new Error('تعذّر قراءة الصورة');
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w0 * k)); canvas.height = Math.max(1, Math.round(h0 * k));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); // PNG transparency -> black instead of ugly default
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  src.close?.();
  let blob = await blobFromCanvas(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await blobFromCanvas(canvas, 'image/jpeg', quality); // old Safari
  if (!blob) throw new Error('تعذّر تحويل الصورة');
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], swapExt(file.name, ext), { type: blob.type });
}

/** { duration (s), width, height } of a video File/Blob/URL. */
export function probeVideo(src) {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const done = (fn, val) => { if (typeof src !== 'string') URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); fn(val); };
    v.onloadedmetadata = () => done(resolve, { duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => done(reject, new Error('الفيديو ده مش مدعوم أو تالف'));
    v.src = url;
  });
}

/** WebP poster (frame at ~0.4 s) of a video File or URL. */
export async function videoPoster(src, { maxSide = 720, at = 0.4, quality = 0.75 } = {}) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  try {
    await new Promise((resolve, reject) => {
      v.onerror = () => reject(new Error('تعذّر قراءة الفيديو'));
      v.onloadeddata = () => { try { v.currentTime = Math.min(at, (v.duration || at) / 2); } catch { resolve(); } };
      v.onseeked = () => resolve();
      v.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k) || 2; c.height = Math.round(v.videoHeight * k) || 2;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    let blob = await blobFromCanvas(c, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await blobFromCanvas(c, 'image/jpeg', quality);
    return new File([blob], `poster.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
}

/** Best container the current browser can record: WebM (Chrome/Firefox/Edge/Android) or MP4 (Safari/iOS). */
export function pickVideoMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'];
  return list.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || null;
}
export const canCompressVideo = () => !!pickVideoMime() && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;

/**
 * Re-encode a video to a small file. preset: 'reel' | 'story'.
 * onProgress(0..1). signal: AbortSignal to cancel. Rejects with an Arabic message on failure.
 */
export async function compressVideo(file, { preset = 'reel', onProgress, signal } = {}) {
  if (!file || !/^video\//.test(file.type || '')) throw new Error('اختر ملف فيديو');
  if (file.size > MAX_SOURCE_VIDEO_BYTES) throw new Error('الفيديو كبير جداً (الحد 500 ميجا قبل الضغط)');
  const cfg = VIDEO_PRESETS[preset] || VIDEO_PRESETS.reel;
  const mime = pickVideoMime();
  if (!mime || !canCompressVideo()) throw new Error('المتصفح ده مش بيدعم تحويل الفيديو. جرّب Chrome أو Safari حديث.');

  const info = await probeVideo(file);
  if (Number.isFinite(info.duration) && info.duration > cfg.maxSeconds + 0.5) throw new Error(`الفيديو أطول من ${cfg.maxSeconds} ثانية`);
  if (!info.width || !info.height) throw new Error('الفيديو ده مش مدعوم');

  // output size: short side <= cfg.short, both sides even
  const k = Math.min(1, cfg.short / Math.min(info.width, info.height));
  const W = Math.max(2, Math.round((info.width * k) / 2) * 2), H = Math.max(2, Math.round((info.height * k) / 2) * 2);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true; video.preload = 'auto'; video.src = url; video.setAttribute('playsinline', '');
  video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(video);

  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  let audioCtx = null, recorder = null, raf = 0, rvfc = 0, stopped = false;
  const cleanup = () => {
    stopped = true; cancelAnimationFrame(raf); if (rvfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfc);
    try { video.pause(); } catch { /* */ }
    try { audioCtx?.close(); } catch { /* */ }
    video.remove(); URL.revokeObjectURL(url);
  };

  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('الفيديو ده مش مدعوم أو تالف')); });

    // audio: route the element into a MediaStream only (nothing plays out loud)
    const out = canvas.captureStream(cfg.fps);
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC(); await audioCtx.resume?.();
        const srcNode = audioCtx.createMediaElementSource(video), dest = audioCtx.createMediaStreamDestination();
        srcNode.connect(dest);
        dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
      }
    } catch (e) { console.warn('[video] no audio track', e); }

    const chunks = [];
    recorder = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: cfg.vbps, audioBitsPerSecond: cfg.abps });
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const finished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = (e) => reject(e.error || new Error('فشل تحويل الفيديو'));
    });

    const draw = () => { if (!stopped) ctx.drawImage(video, 0, 0, W, H); };
    const loop = () => {
      if (stopped) return;
      draw();
      if (Number.isFinite(video.duration) && video.duration > 0) onProgress?.(Math.min(1, video.currentTime / video.duration));
      if (video.requestVideoFrameCallback) rvfc = video.requestVideoFrameCallback(loop); else raf = requestAnimationFrame(loop);
    };

    const aborted = () => new Error('تم إلغاء التحويل');
    if (signal?.aborted) throw aborted();
    const ended = new Promise((resolve, reject) => {
      video.onended = resolve;
      video.onerror = () => reject(new Error('الفيديو ده مش مدعوم أو تالف'));
      signal?.addEventListener('abort', () => reject(aborted()), { once: true });
    });

    draw(); recorder.start(1000);
    try { await video.play(); } catch { throw new Error('المتصفح منع تشغيل الفيديو للتحويل. جرّب تاني.'); }
    loop();
    await ended;
    draw(); onProgress?.(1);
    if (recorder.state !== 'inactive') recorder.stop();
    await finished;

    const type = mime.split(';')[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error('فشل تحويل الفيديو');
    return { file: new File([blob], swapExt(file.name, type === 'video/mp4' ? 'mp4' : 'webm'), { type }), duration: info.duration, width: W, height: H };
  } finally {
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* */ }
    cleanup();
  }
}

export const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} ميجا` : `${Math.max(1, Math.round(n / 1024))} كيلو`);
