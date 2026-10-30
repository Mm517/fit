/**
 * SUPABASE adapter — same interface as mock.js. Activated with CONFIG.ADAPTER = 'supabase'.
 * Table/column names match /db/schema.fc.sql (tables are prefixed fc_). Row Level Security (see schema.sql) enforces
 * who can read/write what, so this file contains no authorization logic.
 *
 * supabase-js is loaded lazily from a pinned CDN build so the mock mode has zero dependencies.
 */
import { CONFIG } from '../config.js';

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
   */
  async uploadImage(file) {
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ALLOWED.includes(file.type)) throw new Error('نوع الصورة غير مدعوم (JPG / PNG / WEBP / GIF فقط)');
    if (file.size > 5 * 1024 * 1024) throw new Error('حجم الصورة أكبر من 5 ميجا');
    const c = await sb();
    const { data: { session } } = await c.auth.getSession();
    if (!session) throw new Error('سجّل الدخول الأول');
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
    const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await c.storage.from(CONFIG.MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '31536000' });
    if (error) throw new Error(error.message);
    return c.storage.from(CONFIG.MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
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
};
