/**
 * SUPABASE adapter — same interface as mock.js. Activated with CONFIG.ADAPTER = 'supabase'.
 * Table/column names match /db/schema.sql. Row Level Security (see schema.sql) enforces
 * who can read/write what, so this file contains no authorization logic.
 *
 * supabase-js is loaded lazily from a pinned CDN build so the mock mode has zero dependencies.
 */
import { CONFIG } from '../config.js';

let client = null;
async function sb() {
  if (client) return client;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true } });
  return client;
}
const unwrap = ({ data, error, count }) => { if (error) throw new Error(error.message); return { data, count }; };

export const adapter = {
  name: 'supabase',

  async select(name, { where = {}, gte = {}, lte = {}, search = null, order = null, desc = false, limit = null, offset = 0 } = {}) {
    const c = await sb();
    let q = c.from(name).select('*', { count: 'exact' });
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
    return unwrap(await c.from(name).select('*').eq('id', id).maybeSingle()).data;
  },
  async insert(name, row) {
    const c = await sb();
    return unwrap(await c.from(name).insert(row).select().single()).data;
  },
  async update(name, id, patch) {
    const c = await sb();
    return unwrap(await c.from(name).update(patch).eq('id', id).select().single()).data;
  },
  async upsert(name, row) {
    const c = await sb();
    return unwrap(await c.from(name).upsert(row).select().single()).data;
  },
  async remove(name, id) {
    const c = await sb();
    unwrap(await c.from(name).delete().eq('id', id));
    return true;
  },
  async removeWhere(name, where) {
    const c = await sb();
    let q = c.from(name).delete();
    for (const [k, v] of Object.entries(where)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    unwrap(await q);
    return true;
  },

  auth: {
    async session() {
      const c = await sb();
      const { data } = await c.auth.getSession();
      return data.session ? { user_id: data.session.user.id } : null;
    },
    async signIn(email, password) {
      const c = await sb();
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw new Error('بيانات الدخول غير صحيحة');
      return { user_id: data.user.id };
    },
    async signUp(email, password, name) {
      const c = await sb();
      const { data, error } = await c.auth.signUp({ email, password, options: { data: { name } } });
      if (error) throw new Error(error.message);
      return { user_id: data.user?.id };
    },
    async signOut() { const c = await sb(); await c.auth.signOut(); },
  },

  async rpc(name, args = {}) {
    const c = await sb();
    return unwrap(await c.rpc(name, args)).data;
  },

  /** Uploads to the public 'media' Storage bucket and returns its public URL. */
  async uploadImage(file) {
    const c = await sb();
    const path = `${crypto.randomUUID()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
    const { error } = await c.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) throw new Error(error.message);
    return c.storage.from('media').getPublicUrl(path).data.publicUrl;
  },

  /**
   * The AI key stays server-side: this calls the Edge Function (supabase/functions/coach).
   * Expected response: { text: string, tool_calls?: [{ name, args }], suggestions?: string[] }
   */
  async invokeCoach(payload) {
    const c = await sb();
    const { data, error } = await c.functions.invoke(CONFIG.COACH_FUNCTION, { body: payload });
    if (error) throw new Error(error.message);
    return data;
  },
};
