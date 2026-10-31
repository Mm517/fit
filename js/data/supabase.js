/**
 * SUPABASE adapter — same interface as mock.js. Activated with CONFIG.ADAPTER = 'supabase'.
 * Table/column names match /db/schema.fc.sql (tables are prefixed fc_). Row Level Security (see schema.sql) enforces
 * who can read/write what, so this file contains no authorization logic.
 *
 * supabase-js is loaded lazily from a pinned CDN build so the mock mode has zero dependencies.
 */
import { CONFIG } from '../config.js';
import { toWebP, compressVideo, videoPoster } from '../media.js';
import { requireOnline } from '../ui/net.js';

let client = null;
async function sb() {
  if (client) return client;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, storageKey: 'fitcircle-auth' } });
  return client;
}
/** The Supabase project is shared with another app, so every FitCircle table/function is prefixed (fc_). */
const T = (name) => `${CONFIG.TABLE_PREFIX}${name}`;

/** Creates the FitCircle profile row on first sign-in (no auth.users trigger — see db/schema.fc.sql). */
const ensured = new Set();
async function ensureProfile(c, userId, name) {
  if (!userId || ensured.has(userId)) return;
  const { error } = await c.rpc(T('ensure_profile'), { p_name: name ?? null });
  if (error) throw new Error(error.message);
  ensured.add(userId);
}
const unwrap = ({ data, error, count }) => { if (error) throw new Error(error.message); return { data, count }; };


/** Upload one File (already converted) to `<user id>/<uuid>.<ext>` and return its public URL. */
const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'video/webm': 'webm', 'video/mp4': 'mp4' };
async function putFile(file) {
  const c = await sb();
  const { data: { session } } = await c.auth.getSession();
  if (!session) throw new Error('سجّل الدخول الأول');
  const type = String(file.type).split(';')[0];
  const ext = EXT[type];
  if (!ext) throw new Error('نوع الملف غير مدعوم');
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await c.storage.from(CONFIG.MEDIA_BUCKET).upload(path, file, { contentType: type, cacheControl: '31536000' });
  if (error) throw new Error(/exceeded|too large|size/i.test(error.message) ? 'الملف أكبر من الحد المسموح' : error.message);
  return c.storage.from(CONFIG.MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export const adapter = {
  name: 'supabase',

  async select(name, { where = {}, gte = {}, lte = {}, search = null, order = null, desc = false, limit = null, offset = 0 } = {}) {
    const c = await sb();
    let q = c.from(T(name)).select('*', { count: 'exact' });
    for (const [k, v] of Object.entries(where)) q = Array.isArray(v) ? q.in(k, v) : v === null ? q.is(k, null) : q.eq(k, v);
    for (const [k, v] of Object.entries(gte)) q = q.gte(k, v);
    for (const [k, v] of Object.entries(lte)) q = q.lte(k, v);
    if (search?.q) {
      const safe = search.q.replace(/[,()%]/g, ' ');
      q = q.or(search.fields.map((f) => `${f}.ilike.%${safe}%`).join(','));
    }
    if (order) q = q.order(order, { ascending: !desc });
    if (limit != null) q = q.range(offset, offset + limit - 1);
    const { data, count } = unwrap(await q);
    return { rows: data || [], count: count ?? (data || []).length };
  },

  async get(name, id) {
    const c = await sb();
    return unwrap(await c.from(T(name)).select('*').eq('id', id).maybeSingle()).data;
  },
  async insert(name, row) {
    const c = await sb();
    return unwrap(await c.from(T(name)).insert(row).select().single()).data;
  },
  async update(name, id, patch) {
    const c = await sb();
    return unwrap(await c.from(T(name)).update(patch).eq('id', id).select().single()).data;
  },
  async upsert(name, row) {
    const c = await sb();
    return unwrap(await c.from(T(name)).upsert(row).select().single()).data;
  },
  async remove(name, id) {
    const c = await sb();
    unwrap(await c.from(T(name)).delete().eq('id', id));
    return true;
  },
  async removeWhere(name, where) {
    const c = await sb();
    let q = c.from(T(name)).delete();
    for (const [k, v] of Object.entries(where)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    unwrap(await q);
    return true;
  },

  auth: {
    async session() {
      const c = await sb();
      const { data } = await c.auth.getSession();
      if (!data.session) return null;
      await ensureProfile(c, data.session.user.id);
      return { user_id: data.session.user.id };
    },
    async signIn(email, password) {
      const c = await sb();
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw new Error('بيانات الدخول غير صحيحة');
      await ensureProfile(c, data.user.id);
      return { user_id: data.user.id };
    },
    async signUp(email, password, name) {
      const c = await sb();
      const { data, error } = await c.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw new Error(error.message);
      // With e-mail confirmation ON there is no session yet: the profile is created at the first sign-in.
      if (data.session) await ensureProfile(c, data.user.id, name);
      return { user_id: data.user?.id };
    },
    async signOut() { const c = await sb(); await c.auth.signOut(); },
  },

  async rpc(name, args = {}) {
    const c = await sb();
    return unwrap(await c.rpc(T(name), args)).data;
  },

  /**
   * Uploads to the public Storage bucket (CONFIG.MEDIA_BUCKET) inside the user's own folder
   * (`<user_id>/<uuid>.<ext>` — enforced by the Storage RLS policy) and returns the public URL.
   * EVERY image is converted to WebP (and resized) in the browser first. kind: 'avatar' | 'post' | 'story' | 'meal'.
   */
  async uploadImage(file, { kind = 'post' } = {}) {
    requireOnline('رفع الصور');
    if (!/^image\//.test(file.type || '')) throw new Error('اختر ملف صورة');
    const webp = await toWebP(file, kind);
    if (webp.size > 5 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 5 ميجا');
    return putFile(webp);
  },

  /**
   * Compress a video in the browser (WebM/MP4, 540–720p, ~1 Mbps) + make a WebP poster, then upload both.
   * kind: 'reel' (<= 60 s) | 'story' (<= 30 s). onProgress({ phase:'compress'|'upload', value:0..1 }).
   * Returns { video, poster, duration, bytes, originalBytes }.
   */
  async uploadVideo(file, { kind = 'reel', onProgress, signal } = {}) {
    requireOnline('رفع الفيديو');
    const small = await compressVideo(file, { preset: kind, signal, onProgress: (v) => onProgress?.({ phase: 'compress', value: v }) });
    if (small.file.size > 24 * 1024 * 1024) throw new Error('الفيديو لسه كبير بعد الضغط. جرّب مقطع أقصر.');
    onProgress?.({ phase: 'upload', value: 0 });
    const posterFile = await videoPoster(small.file).catch(() => videoPoster(file));
    const [video, poster] = await Promise.all([putFile(small.file), putFile(posterFile)]);
    onProgress?.({ phase: 'upload', value: 1 });
    return { video, poster, duration: small.duration, bytes: small.file.size, originalBytes: file.size };
  },

  /** Best-effort cleanup of files we uploaded (own folder only; failures are ignored). */
  async removeMedia(urls = []) {
    try {
      const prefix = `/storage/v1/object/public/${CONFIG.MEDIA_BUCKET}/`;
      const paths = urls.filter(Boolean).map((u) => { const i = String(u).indexOf(prefix); return i < 0 ? null : decodeURIComponent(String(u).slice(i + prefix.length).split('?')[0]); }).filter(Boolean);
      if (!paths.length) return;
      const c = await sb();
      await c.storage.from(CONFIG.MEDIA_BUCKET).remove(paths);
    } catch (e) { console.warn('[media cleanup]', e); }
  },

  /**
   * The AI key stays server-side: this calls the Edge Function (supabase/functions/coach).
   * Expected response: { text: string, tool_calls?: [{ name, args }], suggestions?: string[] }
   */
  async invokeCoach(payload) {
    const c = await sb();
    const { data, error } = await c.functions.invoke(CONFIG.COACH_FUNCTION, { body: payload });
    if (error) {
      let detail = error.message;
      try { detail = (await error.context?.json?.())?.error || detail; } catch { /* keep message */ }
      throw new Error(detail);
    }
    return data;
  },

  /**
   * Nutrition AI (Edge Function `nutrition`): { mode:'analyze'|'chat', text|message, image?:{mime,data}, history?, context? }.
   * Throws an Error whose message is the function's error code (daily_limit, ai_unavailable, bad_image, ...).
   */
  async invokeNutrition(payload) {
    const c = await sb();
    const { data, error } = await c.functions.invoke(CONFIG.NUTRITION_FUNCTION, { body: payload });
    if (error) {
      let code = error.message;
      try { code = (await error.context?.json?.())?.error || code; } catch { /* keep message */ }
      throw new Error(code);
    }
    return data;
  },
};
