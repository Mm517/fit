/**
 * MOCK adapter — localStorage-backed database seeded from seed.js.
 *
 * Every adapter (mock.js and supabase.js) exposes EXACTLY the same low-level interface:
 *   select(table, opts) -> { rows, count }
 *   get(table, id) / insert(table, row) / update(table, id, patch) / upsert(table, row)
 *   remove(table, id) / removeWhere(table, where)
 *   auth.session(scope) / auth.signIn(email, password, scope) / auth.signOut(scope)
 *   uploadImage(file) -> url
 *   invokeCoach(payload) -> LLM reply | null
 *
 * select() options:
 *   where  { col: value | [values] }       equality / IN
 *   gte / lte { col: value }               range filters (ISO strings or numbers)
 *   search { fields: [cols], q: 'text' }   case-insensitive contains on any field
 *   order 'col', desc true|false, limit n, offset n
 *
 * Domain logic (streaks, stats, audit…) lives in api.js, so it is shared by both adapters.
 */
import { CONFIG } from '../config.js';
import { buildSeed } from './seed.js';
import { uid, fileToDataURL } from '../utils.js';

let db = null;
const SESSION_KEYS = { user: 'fc:session:user', admin: 'fc:session:admin' };

function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(CONFIG.DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.__v === CONFIG.SEED_VERSION) { db = parsed; return db; }
    }
  } catch { /* corrupted -> reseed */ }
  db = { __v: CONFIG.SEED_VERSION, ...buildSeed() };
  save();
  return db;
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(CONFIG.DB_KEY, JSON.stringify(db)); } catch (e) { console.warn('[mock] could not persist', e); }
  }, 30);
}
const table = (name) => { const d = load(); if (!d[name]) d[name] = []; return d[name]; };
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const wait = () => new Promise((r) => setTimeout(r, 0)); // keep everything async like a real backend

export const adapter = {
  name: 'mock',

  async select(name, { where = {}, gte = {}, lte = {}, search = null, order = null, desc = false, limit = null, offset = 0 } = {}) {
    await wait();
    let rows = table(name).filter((r) => {
      for (const [k, v] of Object.entries(where)) {
        if (Array.isArray(v) ? !v.includes(r[k]) : r[k] !== v) return false;
      }
      for (const [k, v] of Object.entries(gte)) if (!(r[k] >= v)) return false;
      for (const [k, v] of Object.entries(lte)) if (!(r[k] <= v)) return false;
      if (search?.q) {
        const q = search.q.toLowerCase();
        if (!search.fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
    if (order) {
      rows = [...rows].sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0));
      if (desc) rows.reverse();
    }
    const count = rows.length;
    if (offset) rows = rows.slice(offset);
    if (limit != null) rows = rows.slice(0, limit);
    return { rows: clone(rows), count };
  },

  async get(name, id) {
    await wait();
    return clone(table(name).find((r) => r.id === id) || null);
  },

  async insert(name, row) {
    await wait();
    const r = { id: uid(), created_at: new Date().toISOString(), ...clone(row) };
    table(name).push(r); save();
    return clone(r);
  },

  async update(name, id, patch) {
    await wait();
    const t = table(name); const i = t.findIndex((r) => r.id === id);
    if (i < 0) throw new Error(`[mock] ${name}/${id} not found`);
    t[i] = { ...t[i], ...clone(patch) }; save();
    return clone(t[i]);
  },

  async upsert(name, row) {
    const exists = row.id && (await this.get(name, row.id));
    return exists ? this.update(name, row.id, row) : this.insert(name, row);
  },

  async remove(name, id) {
    await wait();
    const t = table(name); const i = t.findIndex((r) => r.id === id);
    if (i >= 0) { t.splice(i, 1); save(); }
    return true;
  },

  async removeWhere(name, where) {
    await wait();
    const d = load();
    d[name] = table(name).filter((r) => !Object.entries(where).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
    save();
    return true;
  },

  // ---- auth (mock): the user app auto-signs-in as محمد; admin needs the demo login ----
  auth: {
    async session(scope = 'user') {
      let id = localStorage.getItem(SESSION_KEYS[scope]);
      if (!id && scope === 'user') { id = 'u1'; localStorage.setItem(SESSION_KEYS.user, id); }
      return id ? { user_id: id } : null;
    },
    async signIn(email, password, scope = 'user') {
      // ⚠️ MOCK-ONLY: demo admin credentials from config.js. Real auth is Supabase Auth.
      const { rows } = await adapter.select('profiles', { where: { email } });
      const p = rows[0];
      const okAdmin = scope === 'admin' && email === CONFIG.MOCK_ADMIN.email && password === CONFIG.MOCK_ADMIN.password;
      const okUser = scope === 'user' && p && p.role !== 'admin';
      if (!p || !(okAdmin || okUser)) throw new Error('بيانات الدخول غير صحيحة');
      localStorage.setItem(SESSION_KEYS[scope], p.id);
      return { user_id: p.id };
    },
    async signOut(scope = 'user') { localStorage.removeItem(SESSION_KEYS[scope]); },
  },

  async rpc() { return null; },

  /** In mock mode images are kept as small data URLs. Supabase adapter uploads to Storage. */
  async uploadImage(file) { return fileToDataURL(file); },

  /** Mock mode: no LLM — returns null so coach.js falls back to the rule-based Arabic parser. */
  async invokeCoach() { return null; },

  /** Dev helper: wipe local data and reseed. */
  async reset() { localStorage.removeItem(CONFIG.DB_KEY); db = null; load(); },
};
