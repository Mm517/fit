/**
 * FitCircle data API — THE ONLY module UI code may use to read/write data.
 *
 * It picks an adapter once (CONFIG.ADAPTER) and builds all domain logic on top of the
 * low-level adapter interface (select/get/insert/update/remove…), so switching between the
 * mock backend and Supabase needs no UI change.
 *
 * Sections:  session · profile · exercises · plans · logs · alarms · community ·
 *            coach · home/profile aggregates · admin (users, moderation, coach, notifications,
 *            settings, audit, overview)
 * Every destructive/admin mutation writes an audit_log row automatically.
 */
import { CONFIG } from '../config.js';
import { WEEK_ORDER, DAYS_AR, isoDate, startOfWeek, addDays } from '../utils.js';

const { adapter } = await import(CONFIG.ADAPTER === 'supabase' ? './supabase.js' : './mock.js');
export const backend = adapter.name;
const db = adapter;
const rows = async (t, o) => (await db.select(t, o)).rows;
const nowIso = () => new Date().toISOString();

// =====================================================================================
// SESSION
// =====================================================================================
let _user = null, _admin = null;
/** Profile of the signed-in app user, or null (supabase mode before login). */
export async function currentUser(force = false) {
  if (_user && !force) return _user;
  const s = await db.auth.session('user');
  _user = s ? await db.get('profiles', s.user_id) : null;
  return _user;
}
export async function userLogin(email, password) { await db.auth.signIn(email, password, 'user'); return currentUser(true); }
export async function userSignUp(email, password, name) {
  if (!db.auth.signUp) throw new Error('التسجيل غير متاح في الوضع التجريبي');
  await db.auth.signUp(email, password, name); return currentUser(true);
}
export async function userLogout() { await db.auth.signOut('user'); _user = null; }

/** Returns the admin profile if (and only if) the session user has role === 'admin'. */
export async function adminSession() {
  const s = await db.auth.session('admin');
  const p = s ? await db.get('profiles', s.user_id) : null;
  _admin = p && p.role === 'admin' && !p.suspended ? p : null;
  return _admin;
}
export async function adminLogin(email, password) {
  await db.auth.signIn(email, password, 'admin');
  const a = await adminSession();
  if (!a) { await db.auth.signOut('admin'); throw new Error('هذا الحساب ليس لديه صلاحية الإدارة'); }
  return a;
}
export async function adminLogout() { await db.auth.signOut('admin'); _admin = null; }

// =====================================================================================
// PROFILE
// =====================================================================================
export async function updateProfile(patch) {
  const u = await currentUser();
  _user = await db.update('profiles', u.id, patch);
  return _user;
}
export const getProfile = (id) => db.get('profiles', id);
export async function uploadImage(file) { return db.uploadImage(file); }

// =====================================================================================
// EXERCISES
// =====================================================================================
/** opts: { q, muscle, equipment, publishedOnly = true }. Pass 'all'/'' to skip a filter. */
export async function listExercises({ q = '', muscle = 'all', equipment = 'all', publishedOnly = true } = {}) {
  const where = {};
  if (publishedOnly) where.published = true;
  if (muscle && muscle !== 'all') where.muscle = muscle;
  if (equipment && equipment !== 'all') where.equipment = equipment;
  return rows('exercises', { where, order: 'created_at', search: q ? { q, fields: ['name_ar', 'name_en'] } : null });
}
export const getExercise = (id) => db.get('exercises', id);
/** id -> exercise (all, including unpublished, so old plans keep rendering). */
export async function exerciseMap() { return Object.fromEntries((await rows('exercises')).map((e) => [e.id, e])); }
export async function saveExercise(ex) {
  const saved = ex.id ? await db.update('exercises', ex.id, ex) : await db.insert('exercises', { published: false, steps: [], ...ex });
  await audit('exercise.save', saved.id, { name: saved.name_ar });
  return saved;
}
export async function setExercisePublished(id, published) {
  const e = await db.update('exercises', id, { published });
  await audit(published ? 'exercise.publish' : 'exercise.unpublish', id, { name: e.name_ar });
  return e;
}
export async function duplicateExercise(id) {
  const { id: _i, created_at: _c, ...rest } = await db.get('exercises', id);
  const copy = await db.insert('exercises', { ...rest, name_ar: rest.name_ar + ' (نسخة)', name_en: rest.name_en + ' (Copy)', published: false });
  await audit('exercise.duplicate', copy.id, { from: id });
  return copy;
}
export async function deleteExercise(id) {
  const e = await db.get('exercises', id);
  await db.remove('exercises', id);
  await audit('exercise.delete', id, { name: e?.name_ar });
}

// =====================================================================================
// PLANS  (user_plans.days = [{ dow (JS getDay 0=Sun), label, rest, items:[{exercise_id,sets,reps}] }])
// =====================================================================================
export async function getUserPlan() {
  const u = await currentUser();
  const [p] = await rows('user_plans', { where: { user_id: u.id } });
  return p || null;
}
export async function saveUserPlan(plan) {
  const u = await currentUser();
  const body = { ...plan, user_id: u.id };
  return plan.id ? db.update('user_plans', plan.id, body) : db.insert('user_plans', body);
}
/** Plan day for a given JS weekday number. */
export const planDay = (plan, dow) => plan?.days?.find((d) => d.dow === dow) || null;

export const listTemplates = async ({ publishedOnly = false } = {}) => rows('plan_templates', { where: publishedOnly ? { published: true } : {}, order: 'days_count' });
export async function saveTemplate(t) {
  const saved = t.id ? await db.update('plan_templates', t.id, t) : await db.insert('plan_templates', { published: true, days: [], ...t });
  await audit('template.save', saved.id, { name: saved.name });
  return saved;
}
export async function deleteTemplate(id) {
  const t = await db.get('plan_templates', id);
  await db.remove('plan_templates', id);
  await audit('template.delete', id, { name: t?.name });
}
/** Convert a template into a weekly user plan: first N days (from Saturday) train, others rest. */
export async function planFromTemplate(tpl) {
  const map = await exerciseMap();
  const mk = (id) => ({ exercise_id: id, sets: map[id]?.sets || 3, reps: map[id]?.reps || '12-10' });
  const days = WEEK_ORDER.map((dow, i) => {
    const d = tpl.days[i];
    return d ? { dow, label: d.label, rest: false, items: d.exercise_ids.filter((id) => map[id]).map(mk) } : { dow, label: 'يوم راحة', rest: true, items: [] };
  });
  return { name: `جدول ${tpl.days_count} أيام`, goal: tpl.goal, days };
}

// =====================================================================================
// WORKOUT LOGS + streak
// =====================================================================================
export async function listLogs({ exercise_id, limit = 50, user_id } = {}) {
  const u = user_id || (await currentUser()).id;
  const where = { user_id: u }; if (exercise_id) where.exercise_id = exercise_id;
  return rows('workout_logs', { where, order: 'created_at', desc: true, limit });
}
/** sets: [{ reps, weight }] */
export async function addLog({ exercise_id, sets }) {
  const u = await currentUser();
  const log = await db.insert('workout_logs', { user_id: u.id, exercise_id, date: isoDate(), sets, calories: sets.length * 38 });
  // streak: consecutive days with at least one log
  const today = isoDate(), yest = isoDate(addDays(new Date(), -1));
  if (u.last_workout !== today) {
    await updateProfile({ streak: u.last_workout === yest ? (u.streak || 0) + 1 : 1, last_workout: today });
  }
  return log;
}
export const deleteLog = (id) => db.remove('workout_logs', id);

// =====================================================================================
// ALARMS  (time 'HH:MM', days = JS getDay numbers)
// =====================================================================================
export async function listAlarms() {
  const u = await currentUser();
  return rows('alarms', { where: { user_id: u.id }, order: 'time' });
}
export async function saveAlarm(a) {
  const u = await currentUser();
  return a.id ? db.update('alarms', a.id, a) : db.insert('alarms', { enabled: true, days: [], label: '', ...a, user_id: u.id });
}
export const getAlarm = (id) => db.get('alarms', id);
export const deleteAlarm = (id) => db.remove('alarms', id);
/** Next time an alarm will ring: { alarm, at: Date } | null */
export function computeNextAlarm(alarms, from = new Date()) {
  let best = null;
  for (const a of alarms.filter((x) => x.enabled)) {
    const [h, m] = a.time.split(':').map(Number);
    for (let i = 0; i < 8; i++) {
      const d = addDays(from, i); d.setHours(h, m, 0, 0);
      if (d <= from) continue;
      if (a.days.length && !a.days.includes(d.getDay())) continue;
      if (!best || d < best.at) best = { alarm: a, at: d };
      break;
    }
  }
  return best;
}
export async function nextAlarm() { return computeNextAlarm(await listAlarms()); }

// =====================================================================================
// COMMUNITY
// =====================================================================================
async function enrichPosts(posts, me) {
  const ids = posts.map((p) => p.id);
  const [users, likes, saves, comments] = await Promise.all([
    rows('profiles'), rows('likes', { where: { post_id: ids } }), rows('saves', { where: { user_id: me.id } }), rows('comments', { where: { post_id: ids } }),
  ]);
  const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return posts.map((p) => ({
    ...p,
    author: { id: p.user_id, name: uMap[p.user_id]?.name || 'مستخدم محذوف', avatar: uMap[p.user_id]?.avatar || '', suspended: !!uMap[p.user_id]?.suspended },
    likes: likes.filter((l) => l.post_id === p.id).length,
    liked: likes.some((l) => l.post_id === p.id && l.user_id === me.id),
    saved: saves.some((s) => s.post_id === p.id),
    comments: comments.filter((c) => c.post_id === p.id).length,
    mine: p.user_id === me.id,
  }));
}
/** opts: { userId } to filter by author. Hidden posts and suspended authors are excluded. */
export async function listPosts({ userId } = {}) {
  const me = await currentUser();
  const posts = await rows('posts', { where: { hidden: false, ...(userId ? { user_id: userId } : {}) }, order: 'created_at', desc: true });
  return (await enrichPosts(posts, me)).filter((p) => !p.author.suspended || p.mine);
}
export async function createPost({ body, image = null }) {
  const me = await currentUser();
  return db.insert('posts', { user_id: me.id, body, image, hidden: false });
}
export async function deleteOwnPost(id) { return adminCascadePost(id); }
export async function toggleLike(post_id) {
  const me = await currentUser();
  const [ex] = await rows('likes', { where: { post_id, user_id: me.id } });
  if (ex) await db.remove('likes', ex.id); else await db.insert('likes', { post_id, user_id: me.id });
  return !ex;
}
export async function toggleSave(post_id) {
  const me = await currentUser();
  const [ex] = await rows('saves', { where: { post_id, user_id: me.id } });
  if (ex) await db.remove('saves', ex.id); else await db.insert('saves', { post_id, user_id: me.id });
  return !ex;
}
export async function listComments(post_id) {
  const [cs, users] = await Promise.all([rows('comments', { where: { post_id }, order: 'created_at' }), rows('profiles')]);
  const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return cs.map((c) => ({ ...c, author: { id: c.user_id, name: uMap[c.user_id]?.name || 'مستخدم', avatar: uMap[c.user_id]?.avatar || '' } }));
}
export async function addComment(post_id, body) { const me = await currentUser(); return db.insert('comments', { post_id, user_id: me.id, body }); }
export async function reportPost(post_id, reason = 'محتوى غير لائق') {
  const me = await currentUser();
  const dup = await rows('reports', { where: { post_id, reporter_id: me.id } });
  if (dup.length) return dup[0];
  return db.insert('reports', { post_id, reporter_id: me.id, reason, status: 'open' });
}
/** Top streak users for the stories row. */
export async function listStories(limit = 8) {
  const users = (await rows('profiles', { where: { role: 'user', suspended: false }, order: 'streak', desc: true, limit })).filter((u) => u.streak > 0);
  return users.map((u) => ({ id: u.id, name: u.name.split(' ')[0], avatar: u.avatar, streak: u.streak }));
}

// =====================================================================================
// AI COACH storage (logic lives in /js/ai)
// =====================================================================================
/** Admins read the full row; regular users get the safe RPC (no system prompt) under RLS. */
export async function getCoachSettings() {
  const row = await db.get('app_settings', 'coach').catch(() => null);
  return row?.value || (await db.rpc('coach_public_settings').catch(() => null));
}
export async function coachHistory(limit = 60) {
  const me = await currentUser();
  const all = await rows('coach_messages', { where: { user_id: me.id }, order: 'created_at', desc: true, limit });
  return all.reverse();
}
export async function coachAppend({ role, text, card = null }) { const me = await currentUser(); return db.insert('coach_messages', { user_id: me.id, role, text, card }); }
export async function coachMessagesToday() {
  const me = await currentUser(); const start = new Date(); start.setHours(0, 0, 0, 0);
  return (await db.select('coach_messages', { where: { user_id: me.id, role: 'user' }, gte: { created_at: start.toISOString() } })).count;
}
export async function coachClear() { const me = await currentUser(); await db.removeWhere('coach_messages', { user_id: me.id }); }
export async function createCoachAction(a) { const me = await currentUser(); return db.insert('coach_actions', { user_id: me.id, status: 'applied', undo: null, ...a }); }
export const getCoachAction = (id) => db.get('coach_actions', id);
export const updateCoachAction = (id, patch) => db.update('coach_actions', id, patch);
export async function lastUndoableAction() {
  const me = await currentUser();
  const list = await rows('coach_actions', { where: { user_id: me.id, status: 'applied' }, order: 'created_at', desc: true, limit: 1 });
  return list.find((a) => a.undo) || null;
}
/** Remote LLM (Supabase Edge Function). Returns null in mock mode -> rule-based parser is used. */
export const invokeCoachFunction = (payload) => db.invokeCoach(payload);
/** Raw table helpers the tool layer needs for undo snapshots. */
export const restoreRow = (table, row) => db.upsert(table, row);
export const removeRow = (table, id) => db.remove(table, id);

// =====================================================================================
// HOME / PROFILE AGGREGATES
// =====================================================================================
export async function getHomeData() {
  const [user, plan, logs, alarms, map] = await Promise.all([currentUser(), getUserPlan(), listLogs({ limit: 400 }), listAlarms(), exerciseMap()]);
  const today = new Date(), todayIso = isoDate(today), sow = startOfWeek(today);
  const doneDates = new Set(logs.map((l) => l.date));
  const week = WEEK_ORDER.map((dow, i) => {
    const d = addDays(sow, i), iso = isoDate(d);
    return { dow, date: d, iso, label: DAYS_AR[dow], done: doneDates.has(iso), today: iso === todayIso, future: d > today && iso !== todayIso, rest: !!planDay(plan, dow)?.rest };
  });
  const goalDays = Math.max(1, (plan?.days || []).filter((d) => !d.rest).length || 6);
  const doneDays = week.filter((w) => w.done).length;
  const td = planDay(plan, today.getDay());
  const items = (td?.items || []).map((it) => ({ ...it, exercise: map[it.exercise_id] })).filter((i) => i.exercise);
  const weekLogs = logs.filter((l) => l.date >= isoDate(sow));
  return {
    user, plan, week,
    streak: user.streak || 0,
    today: td ? { label: td.label, rest: td.rest, items, count: items.length, minutes: Math.max(20, items.length * 12), image: items[0]?.exercise.image || '' } : null,
    weekly: { percent: Math.min(100, Math.round((doneDays / goalDays) * 100)), doneDays, goalDays },
    nextAlarm: computeNextAlarm(alarms),
    quick: { weight: user.weight, workoutsThisWeek: doneDays, goalDays, calories: weekLogs.reduce((s, l) => s + (l.calories || 0), 0) },
  };
}

export async function getProfileSummary(userId) {
  const me = userId ? await db.get('profiles', userId) : await currentUser();
  const [logs, myPosts] = await Promise.all([listLogs({ user_id: me.id, limit: 1000 }), rows('posts', { where: { user_id: me.id, hidden: false }, order: 'created_at', desc: true })]);
  const sow = isoDate(startOfWeek());
  const weekDays = new Set(logs.filter((l) => l.date >= sow).map((l) => l.date)).size;
  const badges = [
    { id: 'start', name: 'بداية قوية', earned: logs.length >= 1, tier: 'gold' },
    { id: 'regular', name: 'منتظم', earned: (me.streak || 0) >= 5, tier: 'teal' },
    { id: 'challenger', name: 'محب التحدي', earned: logs.length >= 25, tier: 'silver' },
    { id: 'habit', name: 'حافظ على العادة', earned: (me.streak || 0) >= 7, tier: 'bronze' },
  ];
  return { profile: me, stats: { weight: me.weight, streak: me.streak || 0, weekWorkouts: weekDays, totalLogs: logs.length }, badges, photos: myPosts.filter((p) => p.image).map((p) => p.image) };
}

/** Mock-mode "inbox": admin broadcasts created after `sinceIso` that target this user. */
export async function unseenNotifications(sinceIso) {
  const me = await currentUser();
  return (await rows('notifications', { where: { status: 'sent' }, gte: { created_at: sinceIso }, order: 'created_at' })).filter((n) => n.target === 'all' || n.target === me?.id);
}

// =====================================================================================
// APP SETTINGS (admin edits, everyone reads)
// =====================================================================================
export async function getAppSettings() { return (await db.get('app_settings', 'app'))?.value; }
export async function saveAppSettings(value) {
  await db.upsert('app_settings', { id: 'app', value });
  await audit('settings.app', 'app', { name: value.name });
  return value;
}
export async function saveCoachSettings(value) {
  await db.upsert('app_settings', { id: 'coach', value });
  await audit('settings.coach', 'coach', { daily_limit: value.daily_limit });
  return value;
}

// =====================================================================================
// ADMIN
// =====================================================================================
/** Writes an audit_log row. Called automatically by admin mutations; exported for custom use. */
export async function audit(action, target = '', meta = {}) {
  const a = _admin || (await adminSession());
  if (!a) return null; // user-side calls (e.g. exercise edits by non-admin) are not audited
  return db.insert('audit_log', { actor_id: a.id, actor_name: a.name, action, target, meta });
}
export async function listAudit({ q = '', page = 1, pageSize = 15 } = {}) {
  return db.select('audit_log', { order: 'created_at', desc: true, limit: pageSize, offset: (page - 1) * pageSize, search: q ? { q, fields: ['action', 'actor_name', 'target'] } : null });
}

/** filters: { q, role, status: 'active'|'suspended', page, pageSize } -> { rows, count } */
export async function adminListUsers({ q = '', role = 'all', status = 'all', page = 1, pageSize = 10 } = {}) {
  const where = {};
  if (role !== 'all') where.role = role;
  if (status !== 'all') where.suspended = status === 'suspended';
  return db.select('profiles', { where, order: 'created_at', desc: true, limit: pageSize, offset: (page - 1) * pageSize, search: q ? { q, fields: ['name', 'email'] } : null });
}
export async function adminGetUserDetail(id) {
  const [profile, [plan], logs, alarms, posts, map] = await Promise.all([
    db.get('profiles', id), rows('user_plans', { where: { user_id: id } }),
    rows('workout_logs', { where: { user_id: id }, order: 'created_at', desc: true, limit: 15 }), rows('alarms', { where: { user_id: id } }),
    rows('posts', { where: { user_id: id } }), exerciseMap(),
  ]);
  return { profile, plan: plan || null, logs: logs.map((l) => ({ ...l, exercise: map[l.exercise_id] })), alarms, postsCount: posts.length };
}
export async function adminSetSuspended(id, suspended) {
  const p = await db.update('profiles', id, { suspended });
  await audit(suspended ? 'user.suspend' : 'user.unsuspend', id, { name: p.name });
  return p;
}
export async function adminSetRole(id, role) {
  const p = await db.update('profiles', id, { role });
  await audit('user.role', id, { name: p.name, role });
  return p;
}
export async function adminDeleteUser(id) {
  const p = await db.get('profiles', id);
  for (const t of ['user_plans', 'workout_logs', 'alarms', 'posts', 'comments', 'likes', 'saves', 'coach_messages', 'coach_actions', 'push_subscriptions']) await db.removeWhere(t, { user_id: id });
  await db.removeWhere('reports', { reporter_id: id });
  await db.remove('profiles', id);
  await audit('user.delete', id, { name: p?.name });
}

/** filter: 'all' | 'reported' | 'hidden' | 'visible'. Returns enriched posts + open_reports[]. */
export async function adminListPosts({ filter = 'all', q = '' } = {}) {
  const me = _admin || (await adminSession());
  const [posts, reports] = await Promise.all([rows('posts', { order: 'created_at', desc: true, search: q ? { q, fields: ['body'] } : null }), rows('reports', { where: { status: 'open' } })]);
  let out = (await enrichPosts(posts, me)).map((p) => ({ ...p, open_reports: reports.filter((r) => r.post_id === p.id) }));
  if (filter === 'reported') out = out.filter((p) => p.open_reports.length);
  if (filter === 'hidden') out = out.filter((p) => p.hidden);
  if (filter === 'visible') out = out.filter((p) => !p.hidden);
  return out;
}
export async function adminListReports({ status = 'open' } = {}) {
  const [reps, posts, users] = await Promise.all([rows('reports', { where: status === 'all' ? {} : { status }, order: 'created_at', desc: true }), rows('posts'), rows('profiles')]);
  const pMap = Object.fromEntries(posts.map((p) => [p.id, p])), uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return reps.map((r) => ({ ...r, post: pMap[r.post_id] || null, reporter: uMap[r.reporter_id] || null, post_author: uMap[pMap[r.post_id]?.user_id] || null }));
}
export async function adminHidePost(id, hidden = true) {
  await db.update('posts', id, { hidden });
  await audit(hidden ? 'post.hide' : 'post.unhide', id);
}
async function adminCascadePost(id) {
  await db.removeWhere('comments', { post_id: id }); await db.removeWhere('likes', { post_id: id }); await db.removeWhere('saves', { post_id: id });
  await db.removeWhere('reports', { post_id: id }); await db.remove('posts', id);
}
export async function adminDeletePost(id) { await adminCascadePost(id); await audit('post.delete', id); }
export async function adminDeleteComment(id) { await db.remove('comments', id); await audit('comment.delete', id); }
export async function adminBanUser(id) { return adminSetSuspended(id, true); }
/** action: 'hide' | 'unhide' | 'delete' | 'dismiss-reports' */
export async function adminBulkPosts(ids, action) {
  for (const id of ids) {
    if (action === 'hide') await db.update('posts', id, { hidden: true });
    else if (action === 'unhide') await db.update('posts', id, { hidden: false });
    else if (action === 'delete') await adminCascadePost(id);
    else if (action === 'dismiss-reports') for (const r of await rows('reports', { where: { post_id: id, status: 'open' } })) await db.update('reports', r.id, { status: 'dismissed' });
  }
  await audit(`post.bulk.${action}`, `${ids.length} posts`, { ids });
}
/** action: 'dismiss' | 'hide' | 'delete' */
export async function adminResolveReport(id, action) {
  const r = await db.get('reports', id);
  if (action === 'delete') { await adminCascadePost(r.post_id); await audit('post.delete', r.post_id, { via: 'report' }); return; }
  if (action === 'hide') { await db.update('posts', r.post_id, { hidden: true }); await audit('post.hide', r.post_id, { via: 'report' }); }
  for (const x of await rows('reports', { where: { post_id: r.post_id, status: 'open' } })) await db.update('reports', x.id, { status: action === 'dismiss' ? 'dismissed' : 'resolved' });
  if (action === 'dismiss') await audit('report.dismiss', id);
}

/** Conversation list grouped by user + one conversation with its tool actions. */
export async function adminListConversations({ q = '' } = {}) {
  const [msgs, users] = await Promise.all([rows('coach_messages', { order: 'created_at', desc: true }), rows('profiles')]);
  const uMap = Object.fromEntries(users.map((u) => [u.id, u])), g = {};
  for (const m of msgs) { (g[m.user_id] ||= { user: uMap[m.user_id], count: 0, last_at: m.created_at, last_text: m.text }).count++; }
  let list = Object.values(g).filter((x) => x.user);
  if (q) list = list.filter((x) => x.user.name.includes(q) || x.user.email.includes(q));
  return list;
}
export async function adminGetConversation(user_id) {
  const [messages, actions] = await Promise.all([rows('coach_messages', { where: { user_id }, order: 'created_at' }), rows('coach_actions', { where: { user_id }, order: 'created_at' })]);
  return { messages, actions };
}

export const adminListNotifications = () => rows('notifications', { order: 'created_at', desc: true });
/** target: 'all' | 'user:<id>' | 'segment:inactive' ... ; scheduled_at (ISO) makes it a scheduled message. */
export async function adminSendNotification({ title, body, target = 'all', scheduled_at = null }) {
  const a = _admin || (await adminSession());
  const n = await db.insert('notifications', {
    title, body, target: target.startsWith('user:') ? target.slice(5) : target, scheduled_at,
    status: scheduled_at ? 'scheduled' : 'sent', sent_at: scheduled_at ? null : nowIso(), created_by: a?.id,
  });
  await audit(scheduled_at ? 'notification.schedule' : 'notification.send', n.id, { title });
  return n;
}
export async function adminDeleteNotification(id) { await db.remove('notifications', id); await audit('notification.delete', id); }

export async function adminOverview() {
  const [users, logs, posts, alarms, reports, map] = await Promise.all([rows('profiles'), rows('workout_logs'), rows('posts'), rows('alarms'), adminListReports({ status: 'open' }), exerciseMap()]);
  const days = Array.from({ length: 30 }, (_, i) => isoDate(addDays(new Date(), i - 29)));
  const usersBy = Object.fromEntries(days.map((d) => [d, 0])), logsBy = { ...usersBy };
  users.forEach((u) => { const d = isoDate(u.created_at); if (d in usersBy) usersBy[d]++; });
  logs.forEach((l) => { if (l.date in logsBy) logsBy[l.date]++; });
  const dayAgo = Date.now() - 86400000, weekAgo = Date.now() - 7 * 86400000;
  const top = {}; logs.forEach((l) => { top[l.exercise_id] = (top[l.exercise_id] || 0) + 1; });
  return {
    kpis: {
      users: users.length,
      activeToday: users.filter((u) => new Date(u.last_active).getTime() > dayAgo).length,
      workouts: logs.length,
      newPosts: posts.filter((p) => new Date(p.created_at).getTime() > weekAgo).length,
      alarms: alarms.filter((a) => a.enabled).length,
    },
    series: { days, users: days.map((d) => usersBy[d]), workouts: days.map((d) => logsBy[d]) },
    topExercises: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => ({ exercise: map[id], count })).filter((x) => x.exercise),
    recentSignups: [...users].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6),
    recentReports: reports.slice(0, 5),
  };
}
