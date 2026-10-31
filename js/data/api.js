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

/**
 * E-mails are NOT part of the public profile row: they live in `profile_private` (readable only by the owner and admins).
 * Admin screens call this to merge them back into profile rows. Non-admins simply get an empty string.
 */
async function withEmails(list) {
  const arr = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!arr.length) return list;
  const priv = await rows('profile_private', { where: { id: arr.map((p) => p.id) } });
  const m = Object.fromEntries(priv.map((r) => [r.id, r.email]));
  const out = arr.map((p) => ({ ...p, email: m[p.id] || '' }));
  return Array.isArray(list) ? out : out[0];
}
/** Only the profiles that are actually needed (never download the whole table). */
const profilesByIds = async (ids) => { const u = [...new Set(ids.filter(Boolean))]; return u.length ? rows('profiles', { where: { id: u } }) : []; };
const lite = (p) => (p ? { id: p.id, name: p.name, avatar: p.avatar || '', goal: p.goal || '', streak: p.streak || 0, suspended: !!p.suspended } : null);

// =====================================================================================
// SESSION
// =====================================================================================
let _user = null, _admin = null, _isAdmin = { id: null, v: false };
/** Profile of the signed-in app user, or null (supabase mode before login). */
export async function currentUser(force = false) {
  if (_user && !force) return _user;
  const s = await db.auth.session('user');
  _user = s ? await db.get('profiles', s.user_id) : null;
  return _user;
}
export async function userLogin(email, password) { _isAdmin = { id: null, v: false }; await db.auth.signIn(email, password, 'user'); return currentUser(true); }
export async function userSignUp(email, password, name) {
  if (!db.auth.signUp) throw new Error('التسجيل غير متاح في الوضع التجريبي');
  _isAdmin = { id: null, v: false }; await db.auth.signUp(email, password, name); return currentUser(true);
}
export async function userLogout() { await db.auth.signOut('user'); _user = null; _admin = null; _isAdmin = { id: null, v: false }; }

/**
 * Is this profile an admin? On Supabase the ONLY source of truth is the database function fc_is_admin():
 * a CONFIRMED e-mail that is listed in fc_admin_emails (so the `role` column and the client are never trusted).
 * The mock backend keeps using the demo `role` field.
 */
async function checkAdmin(p) {
  if (!p || p.suspended) return false;
  if (backend !== 'supabase') return p.role === 'admin';
  try { return (await db.rpc('is_admin')) === true; } catch { return false; }
}
/** Cheap, cached check used by the user app to decide whether to show the admin entry. */
export async function isAdmin() {
  const u = await currentUser();
  if (!u) return false;
  if (_isAdmin.id !== u.id) _isAdmin = { id: u.id, v: await checkAdmin(u) };
  return _isAdmin.v;
}

/** Returns the admin profile if (and only if) the session user is an admin. */
export async function adminSession() {
  const s = await db.auth.session('admin');
  const p = s ? await db.get('profiles', s.user_id) : null;
  _admin = (await checkAdmin(p)) ? await withEmails(p) : null;
  return _admin;
}
export async function adminLogin(email, password) {
  await db.auth.signIn(email, password, 'admin');
  _user = null; _isAdmin = { id: null, v: false };
  const a = await adminSession();
  if (!a) { await db.auth.signOut('admin'); throw new Error('هذا الحساب ليس لديه صلاحية الإدارة'); }
  return a;
}
export async function adminLogout() { await db.auth.signOut('admin'); _admin = null; _user = null; _isAdmin = { id: null, v: false }; }

// =====================================================================================
// PROFILE
// =====================================================================================
export async function updateProfile(patch) {
  const u = await currentUser();
  _user = await db.update('profiles', u.id, patch);
  return _user;
}
export const getProfile = (id) => db.get('profiles', id);
/** Any image -> WebP -> public URL. kind: 'avatar' | 'post' | 'story' | 'meal'. */
export async function uploadImage(file, opts) { return db.uploadImage(file, opts); }
/** Video -> compressed WebM/MP4 + WebP poster -> { video, poster, duration, bytes, originalBytes }. kind: 'reel' | 'story'. */
export async function uploadVideo(file, opts) { return db.uploadVideo(file, opts); }
export const removeMedia = (urls) => db.removeMedia(urls);

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
    profilesByIds(posts.map((p) => p.user_id)), rows('likes', { where: { post_id: ids } }), rows('saves', { where: { user_id: me.id } }), rows('comments', { where: { post_id: ids } }),
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
  const cs = await rows('comments', { where: { post_id }, order: 'created_at' });
  const users = await profilesByIds(cs.map((c) => c.user_id));
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
/** Top streak users ("أعلى المتألقين"). */
export async function listTopStreaks(limit = 8) {
  const users = (await rows('profiles', { where: { role: 'user', suspended: false }, order: 'streak', desc: true, limit })).filter((u) => u.streak > 0);
  return users.map((u) => ({ id: u.id, name: u.name.split(' ')[0], avatar: u.avatar, streak: u.streak }));
}

// =====================================================================================
// SOCIAL: follow · block · people search · public profile
// =====================================================================================
export async function searchUsers(q, limit = 20) {
  const me = await currentUser();
  const term = (q || '').trim();
  if (term.length < 2) return [];
  const [found, myBlocks] = await Promise.all([
    rows('profiles', { where: { suspended: false }, search: { q: term, fields: ['name'] }, limit: limit + 1 }),
    rows('blocks', { where: { blocker_id: me.id } }),
  ]);
  const blocked = new Set(myBlocks.map((b) => b.blocked_id));
  return found.filter((u) => u.id !== me.id && !blocked.has(u.id)).slice(0, limit).map(lite);
}
export async function followCounts(userId) {
  const [a, b] = await Promise.all([db.select('follows', { where: { followee_id: userId }, limit: 1 }), db.select('follows', { where: { follower_id: userId }, limit: 1 })]);
  return { followers: a.count, following: b.count };
}
export async function isFollowing(userId) {
  const me = await currentUser();
  return (await rows('follows', { where: { follower_id: me.id, followee_id: userId }, limit: 1 })).length > 0;
}
/** returns the NEW state (true = now following) */
export async function toggleFollow(userId) {
  const me = await currentUser();
  if (userId === me.id) throw new Error('لا يمكنك متابعة نفسك');
  const [ex] = await rows('follows', { where: { follower_id: me.id, followee_id: userId }, limit: 1 });
  if (ex) { await db.remove('follows', ex.id); return false; }
  await db.insert('follows', { follower_id: me.id, followee_id: userId });
  return true;
}
/** kind: 'followers' | 'following' -> light profiles */
export async function listFollowList(userId, kind) {
  const list = await rows('follows', kind === 'followers' ? { where: { followee_id: userId }, order: 'created_at', desc: true, limit: 200 } : { where: { follower_id: userId }, order: 'created_at', desc: true, limit: 200 });
  const users = await profilesByIds(list.map((f) => (kind === 'followers' ? f.follower_id : f.followee_id)));
  const m = Object.fromEntries(users.map((u) => [u.id, u]));
  return list.map((f) => lite(m[kind === 'followers' ? f.follower_id : f.followee_id])).filter((u) => u && !u.suspended);
}
export async function isBlockedByMe(userId) {
  const me = await currentUser();
  return (await rows('blocks', { where: { blocker_id: me.id, blocked_id: userId }, limit: 1 })).length > 0;
}
export async function blockUser(userId) {
  const me = await currentUser();
  if (backend === 'supabase') return db.rpc('block_user', { p_target: userId }); // also removes follows both ways (security definer)
  if (await isBlockedByMe(userId)) return;
  await db.insert('blocks', { blocker_id: me.id, blocked_id: userId });
  await db.removeWhere('follows', { follower_id: me.id, followee_id: userId });
  await db.removeWhere('follows', { follower_id: userId, followee_id: me.id });
}
export async function unblockUser(userId) {
  const me = await currentUser();
  await db.removeWhere('blocks', { blocker_id: me.id, blocked_id: userId });
}
/** Everything the public profile screen needs. Private data (workout logs, e-mail, alarms…) is never part of it. */
export async function getPublicProfile(userId) {
  const me = await currentUser();
  const p = await db.get('profiles', userId);
  if (!p || (p.suspended && me.role !== 'admin')) return null;
  const [counts, following, blocked, posts, stories] = await Promise.all([
    followCounts(userId), isFollowing(userId), isBlockedByMe(userId), listPosts({ userId }), listUserStories(userId),
  ]);
  return { profile: lite(p), followers: counts.followers, followingCount: counts.following, following, blocked, posts, stories, since: p.created_at };
}

// =====================================================================================
// STORIES (24h, images). Visible to every signed-in user; expiry is enforced by the database.
// =====================================================================================
/** Tray for the community screen: me first, then people with unseen stories (followed first), then seen ones. */
export async function listStoryTray() {
  const me = await currentUser();
  const [stories, views, follows] = await Promise.all([
    rows('stories', { where: { hidden: false }, gte: { expires_at: nowIso() }, order: 'created_at' }),
    rows('story_views', { where: { viewer_id: me.id } }), rows('follows', { where: { follower_id: me.id } }),
  ]);
  const seen = new Set(views.map((v) => v.story_id)), fol = new Set(follows.map((f) => f.followee_id));
  const users = await profilesByIds([me.id, ...stories.map((s) => s.user_id)]);
  const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const groups = {};
  for (const s of stories) { if (uMap[s.user_id] && !uMap[s.user_id].suspended) (groups[s.user_id] ||= []).push({ ...s, seen: seen.has(s.id) || s.user_id === me.id }); }
  const tray = Object.entries(groups).map(([uid, list]) => ({ user: lite(uMap[uid]), stories: list, unseen: list.some((x) => !x.seen), mine: uid === me.id, following: fol.has(uid) }));
  const rank = (g) => (g.mine ? 0 : g.unseen && g.following ? 1 : g.unseen ? 2 : 3);
  const latest = (g) => g.stories[g.stories.length - 1]?.created_at || '';
  tray.sort((a, b) => rank(a) - rank(b) || (latest(a) < latest(b) ? 1 : -1)); // newest first inside each rank
  if (!tray.some((g) => g.mine)) tray.unshift({ user: lite(me), stories: [], unseen: false, mine: true, following: false });
  return tray;
}
export async function listUserStories(userId) {
  const me = await currentUser();
  const [list, views] = await Promise.all([
    rows('stories', { where: { user_id: userId, hidden: false }, gte: { expires_at: nowIso() }, order: 'created_at' }),
    rows('story_views', { where: { viewer_id: me.id } }),
  ]);
  const seen = new Set(views.map((v) => v.story_id));
  return list.map((s) => ({ ...s, seen: seen.has(s.id) || s.user_id === me.id }));
}
export async function createStory({ image, video = null, caption = '' }) {
  const me = await currentUser();
  const row = { user_id: me.id, image, caption: caption.trim() || null, ...(video ? { video } : {}) };
  if (backend === 'mock') Object.assign(row, { hidden: false, expires_at: new Date(Date.now() + 24 * 3600000).toISOString() });
  return db.insert('stories', row); // supabase: expires_at / hidden are server defaults (column grants)
}
export async function markStoryViewed(storyId) {
  const me = await currentUser();
  const ex = await rows('story_views', { where: { story_id: storyId, viewer_id: me.id }, limit: 1 });
  if (!ex.length) await db.insert('story_views', { story_id: storyId, viewer_id: me.id }).catch(() => null);
}
/** Only the story owner can read this (RLS). */
export async function storyViewers(storyId) {
  const v = await rows('story_views', { where: { story_id: storyId }, order: 'created_at', desc: true });
  const users = await profilesByIds(v.map((x) => x.viewer_id));
  const m = Object.fromEntries(users.map((u) => [u.id, u]));
  return v.map((x) => ({ ...lite(m[x.viewer_id]), at: x.created_at })).filter((x) => x.id);
}
export async function deleteStory(id) {
  const st = await db.get('stories', id).catch(() => null);
  await db.removeWhere('story_views', { story_id: id }); // no-op on the real DB (cascade); needed by the mock
  const r = await db.remove('stories', id);
  if (st) removeMedia([st.image, st.video]);
  return r;
}

// =====================================================================================
// REELS (short videos, compressed in the browser before upload)
// =====================================================================================
/** opts: { userId } to filter by author. Newest first, with like counts + author. */
export async function listReels({ userId, limit = 60 } = {}) {
  const me = await currentUser();
  const list = await rows('reels', { where: { hidden: false, ...(userId ? { user_id: userId } : {}) }, order: 'created_at', desc: true, limit });
  if (!list.length) return [];
  const ids = list.map((r) => r.id);
  const [users, likes] = await Promise.all([profilesByIds([...new Set(list.map((r) => r.user_id))]), rows('reel_likes', { where: { reel_id: ids } })]);
  const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return list.filter((r) => !uMap[r.user_id]?.suspended || r.user_id === me.id).map((r) => ({
    ...r,
    author: { id: r.user_id, name: uMap[r.user_id]?.name || 'مستخدم محذوف', avatar: uMap[r.user_id]?.avatar || '' },
    likes: likes.filter((l) => l.reel_id === r.id).length,
    liked: likes.some((l) => l.reel_id === r.id && l.user_id === me.id),
    mine: r.user_id === me.id,
  }));
}
export async function createReel({ video, poster = null, caption = '' }) {
  const me = await currentUser();
  return db.insert('reels', { user_id: me.id, video, poster, caption: caption.trim() || null, ...(backend === 'mock' ? { hidden: false } : {}) });
}
export async function deleteReel(id) {
  const r = await db.get('reels', id).catch(() => null);
  await db.removeWhere('reel_likes', { reel_id: id });
  await db.remove('reels', id);
  if (r) removeMedia([r.video, r.poster]);
}
export async function toggleReelLike(reel_id) {
  const me = await currentUser();
  const [ex] = await rows('reel_likes', { where: { reel_id, user_id: me.id } });
  if (ex) { await db.remove('reel_likes', ex.id); return false; }
  await db.insert('reel_likes', { reel_id, user_id: me.id }); return true;
}

// =====================================================================================
// DIRECT MESSAGES (1:1). Only the two participants can read them — admins cannot.
// =====================================================================================
async function myMessages(limit = 300) {
  const me = await currentUser();
  const [sent, recv] = await Promise.all([
    rows('messages', { where: { sender_id: me.id }, order: 'created_at', desc: true, limit }),
    rows('messages', { where: { recipient_id: me.id }, order: 'created_at', desc: true, limit }),
  ]);
  return { me, sent, recv };
}
export async function listInbox() {
  const { me, sent, recv } = await myMessages();
  const all = [...sent, ...recv].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const threads = {};
  for (const m of all) {
    const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
    const t = (threads[other] ||= { other, last: m, unread: 0 });
    if (m.recipient_id === me.id && !m.read_at) t.unread++;
  }
  const users = await profilesByIds(Object.keys(threads));
  const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
  return Object.values(threads).map((t) => ({ ...t, user: lite(uMap[t.other]) || { id: t.other, name: 'مستخدم محذوف', avatar: '' }, mine: t.last.sender_id === me.id }));
}
export async function unreadMessageCount() {
  const me = await currentUser();
  return (await rows('messages', { where: { recipient_id: me.id }, order: 'created_at', desc: true, limit: 300 })).filter((m) => !m.read_at).length;
}
export async function listThread(otherId, limit = 200) {
  const me = await currentUser();
  const [a, b] = await Promise.all([
    rows('messages', { where: { sender_id: me.id, recipient_id: otherId }, order: 'created_at', desc: true, limit }),
    rows('messages', { where: { sender_id: otherId, recipient_id: me.id }, order: 'created_at', desc: true, limit }),
  ]);
  return [...a, ...b].sort((x, y) => (x.created_at > y.created_at ? 1 : -1)).slice(-limit);
}
export async function sendMessage(otherId, body) {
  const me = await currentUser();
  const text = (body || '').trim();
  if (!text) throw new Error('الرسالة فارغة');
  if (text.length > 1000) throw new Error('الرسالة طويلة جداً (الحد 1000 حرف)');
  return db.insert('messages', { sender_id: me.id, recipient_id: otherId, body: text, ...(backend === 'mock' ? { read_at: null } : {}) });
}
export async function markThreadRead(otherId, thread) {
  const me = await currentUser();
  const unread = thread.filter((m) => m.recipient_id === me.id && m.sender_id === otherId && !m.read_at);
  for (const m of unread) await db.update('messages', m.id, { read_at: nowIso() });
  return unread.length;
}
export const deleteMessage = (id) => db.remove('messages', id);

// =====================================================================================
// NUTRITION (private: only the owner can read their meals)
// =====================================================================================
const mealNum = (m) => ({ ...m, calories: Math.round(Number(m.calories) || 0), protein: Number(m.protein) || 0, carbs: Number(m.carbs) || 0, fat: Number(m.fat) || 0, items: Array.isArray(m.items) ? m.items : [] });
export async function listMeals(date = isoDate()) {
  const me = await currentUser();
  return (await rows('meals', { where: { user_id: me.id, date }, order: 'created_at' })).map(mealNum);
}
/** Totals per day for [from, to] (ISO dates) -> { 'YYYY-MM-DD': { calories, protein, carbs, fat, count } } */
export async function mealTotals(from, to) {
  const me = await currentUser();
  const list = (await rows('meals', { where: { user_id: me.id }, gte: { date: from }, lte: { date: to } })).map(mealNum);
  const out = {};
  for (const m of list) { const t = (out[m.date] ||= { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 }); t.calories += m.calories; t.protein += m.protein; t.carbs += m.carbs; t.fat += m.fat; t.count++; }
  return out;
}
export async function addMeal(m) {
  const me = await currentUser();
  const title = String(m.title || '').trim().slice(0, 80);
  if (!title) throw new Error('اكتب اسم الوجبة');
  const row = {
    user_id: me.id, date: m.date || isoDate(), meal_type: m.meal_type || 'snack', title,
    calories: Math.min(5000, Math.max(0, Math.round(+m.calories || 0))), protein: Math.min(300, Math.max(0, +m.protein || 0)),
    carbs: Math.min(600, Math.max(0, +m.carbs || 0)), fat: Math.min(300, Math.max(0, +m.fat || 0)),
    items: m.items || [], image: m.image || null, source: m.source === 'ai' ? 'ai' : 'manual', note: m.note ? String(m.note).slice(0, 300) : null,
  };
  return mealNum(await db.insert('meals', row));
}
export const deleteMeal = (id) => db.remove('meals', id);
/** Edge Function `nutrition` (vision + chat). Returns null in mock mode -> the local estimator is used. */
export const invokeNutrition = (payload) => db.invokeNutrition(payload);

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
  return { profile: me, stats: { weight: me.weight, streak: me.streak || 0, weekWorkouts: weekDays, totalLogs: logs.length }, badges, photos: myPosts.filter((p) => p.image).map((p) => p.image), posts: myPosts };
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
  if (!q) { const r = await db.select('profiles', { where, order: 'created_at', desc: true, limit: pageSize, offset: (page - 1) * pageSize }); return { rows: await withEmails(r.rows), count: r.count }; }
  // search by name OR e-mail (e-mails live in the private table, so the two matches are merged here)
  const [byName, mails] = await Promise.all([rows('profiles', { where, search: { q, fields: ['name'] }, order: 'created_at', desc: true }), rows('profile_private', { search: { q, fields: ['email'] }, limit: 200 })]);
  const byMail = mails.length ? await rows('profiles', { where: { ...where, id: mails.map((m) => m.id) } }) : [];
  const seen = new Set();
  const all = [...byName, ...byMail].filter((p) => !seen.has(p.id) && seen.add(p.id)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { rows: await withEmails(all.slice((page - 1) * pageSize, page * pageSize)), count: all.length };
}
export async function adminGetUserDetail(id) {
  const [profile, [plan], logs, alarms, posts, map] = await Promise.all([
    db.get('profiles', id), rows('user_plans', { where: { user_id: id } }),
    rows('workout_logs', { where: { user_id: id }, order: 'created_at', desc: true, limit: 15 }), rows('alarms', { where: { user_id: id } }),
    rows('posts', { where: { user_id: id } }), exerciseMap(),
  ]);
  return { profile: await withEmails(profile), plan: plan || null, logs: logs.map((l) => ({ ...l, exercise: map[l.exercise_id] })), alarms, postsCount: posts.length };
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
  for (const t of ['user_plans', 'workout_logs', 'alarms', 'posts', 'comments', 'likes', 'saves', 'coach_messages', 'coach_actions', 'push_subscriptions', 'stories', 'meals', 'reels', 'reel_likes']) await db.removeWhere(t, { user_id: id });
  await db.removeWhere('reports', { reporter_id: id });
  // social data (the real DB cascades these; the mock needs them removed explicitly)
  await db.removeWhere('story_views', { viewer_id: id }); await db.removeWhere('follows', { follower_id: id }); await db.removeWhere('follows', { followee_id: id });
  await db.removeWhere('messages', { sender_id: id }); await db.removeWhere('messages', { recipient_id: id });
  await db.removeWhere('blocks', { blocker_id: id }); await db.removeWhere('blocks', { blocked_id: id }); await db.removeWhere('profile_private', { id });
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
  const [msgs, users0] = await Promise.all([rows('coach_messages', { order: 'created_at', desc: true }), rows('profiles')]);
  const users = await withEmails(users0);
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
    recentSignups: await withEmails([...users].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6)),
    recentReports: reports.slice(0, 5),
  };
}
