/**
 * AI coach TOOL LAYER.
 * The coach (rule-based parser now, a real LLM via Edge Function later) never touches data directly:
 * it asks for tools by name — create_plan, edit_plan, set_alarm, log_workout, swap_exercise, create_post.
 *
 * Lifecycle of a tool call (stored in `coach_actions`):
 *   runTool(name,args) → prepare() validates + builds a preview (no mutation)
 *        → status 'proposed'   (needs the user's confirmation; admin "confirm rules" decide)
 *        → applyAction(id)     mutates data, stores an UNDO snapshot → status 'applied'
 *        → undoAction(id)      replays the snapshot                  → status 'undone'
 * Every mutation is therefore undoable. Admins can disable a tool or force confirmation in
 * the dashboard (coach settings: tools{}, confirm{}).
 *
 * Action record: { id, tool, args, status: 'proposed'|'applied'|'undone'|'dismissed',
 *                  result: { summary, … tool-specific preview … }, undo }
 */
import * as api from '../data/api.js';
import { DAYS_AR, WEEK_ORDER, fmtTime12, fmtDays } from '../utils.js';

const stripDay = (l) => String(l).replace(/^يوم\s+/, '');
const normArgs = (a) => a || {};

/** Generic undo executor: snapshot = { restore:[{table,row}], remove:[{table,id}] } */
async function replay(snap = {}) {
  for (const r of snap.restore || []) await api.restoreRow(r.table, r.row);
  for (const r of snap.remove || []) await api.removeRow(r.table, r.id);
  await api.currentUser(true); // profile may have been restored
}

export const TOOLS = {
  // ------------------------------------------------------------------ create_plan
  create_plan: {
    label: 'إنشاء جدول أسبوعي', confirm: true, card: 'plan',
    async prepare({ days_count = 4, goal = '', template_id } = {}) {
      const tpls = await api.listTemplates({ publishedOnly: true });
      if (!tpls.length) return { error: 'لا توجد جداول جاهزة حالياً.' };
      let tpl = tpls.find((t) => t.id === template_id);
      if (!tpl) {
        const scored = tpls.map((t) => ({ t, s: Math.abs(t.days_count - days_count) * 10 - (goal && t.goal === goal ? 5 : 0) }));
        tpl = scored.sort((a, b) => a.s - b.s)[0].t;
      }
      const plan = await api.planFromTemplate(tpl);
      const existing = await api.getUserPlan();
      return { result: {
        summary: `جدول ${tpl.days_count} أيام`, title: `جدول ${tpl.days_count} أيام`, badge: 'مقترح', template_id: tpl.id, replaces: !!existing,
        lines: plan.days.filter((d) => !d.rest).map((d) => ({ day: DAYS_AR[d.dow], text: stripDay(d.label) })),
        plan,
      } };
    },
    async apply(_args, result) {
      const existing = await api.getUserPlan();
      const saved = await api.saveUserPlan({ ...(existing || {}), ...result.plan });
      return existing ? { restore: [{ table: 'user_plans', row: existing }] } : { remove: [{ table: 'user_plans', id: saved.id }] };
    },
  },

  // ------------------------------------------------------------------ edit_plan
  edit_plan: {
    label: 'تعديل الجدول', confirm: false, card: 'edit',
    /** args: { op:'add'|'remove'|'rest', dow, exercise_id } */
    async prepare(args) {
      const { op, dow, exercise_id } = normArgs(args);
      const plan = await api.getUserPlan(); const map = await api.exerciseMap();
      if (!plan) return { error: 'ما عندكش جدول لسه. قولي "اعملي جدول 4 أيام" الأول.' };
      const day = plan.days.find((d) => d.dow === dow);
      if (!day) return { error: 'مش لاقي اليوم ده في جدولك.' };
      const ex = map[exercise_id];
      if (op === 'add' && !ex) return { error: 'مش عارف أي تمرين تقصد.' };
      if (op === 'remove' && !day.items.some((i) => i.exercise_id === exercise_id)) return { error: `تمرين ${ex?.name_ar || ''} مش موجود يوم ${DAYS_AR[dow]}.` };
      const summary = op === 'rest' ? `${DAYS_AR[dow]} أصبح يوم راحة` : op === 'add' ? `أضفت ${ex.name_ar} ليوم ${DAYS_AR[dow]}` : `حذفت ${ex.name_ar} من يوم ${DAYS_AR[dow]}`;
      return { result: { summary, op, dow, exercise_id, lines: [{ day: DAYS_AR[dow], text: summary }] } };
    },
    async apply({ op, dow, exercise_id }) {
      const plan = await api.getUserPlan(); const map = await api.exerciseMap();
      const before = JSON.parse(JSON.stringify(plan));
      const day = plan.days.find((d) => d.dow === dow);
      if (op === 'rest') { day.rest = true; day.items = []; day.label = 'يوم راحة'; }
      if (op === 'add') { day.rest = false; day.items.push({ exercise_id, sets: map[exercise_id].sets, reps: map[exercise_id].reps }); if (day.label === 'يوم راحة') day.label = `يوم ${map[exercise_id].muscle}`; }
      if (op === 'remove') day.items = day.items.filter((i) => i.exercise_id !== exercise_id);
      await api.saveUserPlan(plan);
      return { restore: [{ table: 'user_plans', row: before }] };
    },
  },

  // ------------------------------------------------------------------ set_alarm
  set_alarm: {
    label: 'ضبط منبه', confirm: false, card: 'alarm',
    /** args: { time:'HH:MM', days:[getDay…] (empty/all = daily), label } */
    async prepare({ time, days, label } = {}) {
      if (!/^\d{1,2}:\d{2}$/.test(time || '')) return { error: 'قولي الساعة كام؟ مثلاً: "صحيني 6 الصبح".' };
      const [h, m] = time.split(':').map(Number); if (h > 23 || m > 59) return { error: 'الوقت ده مش صحيح.' };
      const t = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const d = days?.length ? days : [0, 1, 2, 3, 4, 5, 6];
      return { result: { summary: fmtTime12(t).full, time: t, days: d, label: label || 'منبه التمرين', timeText: fmtTime12(t).text, period: fmtTime12(t).period, daysText: fmtDays(d) } };
    },
    async apply(_a, r) {
      const alarm = await api.saveAlarm({ time: r.time, days: r.days, label: r.label, enabled: true });
      return { remove: [{ table: 'alarms', id: alarm.id }] };
    },
  },

  // ------------------------------------------------------------------ log_workout
  log_workout: {
    label: 'تسجيل تمرين', confirm: false, card: 'log',
    /** args: { exercise_id, sets_count, reps, weight } */
    async prepare({ exercise_id, sets_count = 3, reps = 10, weight = 0 } = {}) {
      const ex = (await api.exerciseMap())[exercise_id];
      if (!ex) return { error: 'تحب تسجّل أنهي تمرين؟' };
      return { result: { summary: `${ex.name_ar}: ${sets_count} × ${reps}${weight ? ` بوزن ${weight} كجم` : ''}`, exercise_id, sets_count, reps, weight, name: ex.name_ar } };
    },
    async apply(_a, r) {
      const profile = await api.currentUser();
      const log = await api.addLog({ exercise_id: r.exercise_id, sets: Array.from({ length: r.sets_count }, () => ({ reps: r.reps, weight: r.weight })) });
      return { remove: [{ table: 'workout_logs', id: log.id }], restore: [{ table: 'profiles', row: profile }] };
    },
  },

  // ------------------------------------------------------------------ swap_exercise
  swap_exercise: {
    label: 'استبدال تمرين', confirm: false, card: 'swap',
    /** args: { dow?, exercise_id?, muscle? } */
    async prepare({ dow, exercise_id, muscle } = {}) {
      const plan = await api.getUserPlan(); const map = await api.exerciseMap();
      if (!plan) return { error: 'ما عندكش جدول لسه.' };
      const days = plan.days.filter((d) => !d.rest && (dow == null || d.dow === dow));
      let hit = null;
      for (const d of days) {
        const it = d.items.find((i) => (exercise_id ? i.exercise_id === exercise_id : map[i.exercise_id]?.muscle === muscle));
        if (it) { hit = { d, it }; break; }
      }
      if (!hit) return { error: muscle ? `مفيش تمرين ${muscle} في جدولك.` : 'مش لاقي التمرين ده في جدولك.' };
      const cur = map[hit.it.exercise_id];
      const used = new Set(hit.d.items.map((i) => i.exercise_id));
      const pool = (await api.listExercises({ muscle: cur.muscle })).filter((e) => !used.has(e.id));
      const next = pool.find((e) => e.equipment !== cur.equipment) || pool[0];
      if (!next) return { error: `مفيش بديل متاح لتمرين ${cur.name_ar}.` };
      return { result: { summary: `${cur.name_ar} ← ${next.name_ar}`, dow: hit.d.dow, from_id: cur.id, to_id: next.id, from: cur.name_ar, to: next.name_ar, lines: [{ day: DAYS_AR[hit.d.dow], text: `${cur.name_ar} ← ${next.name_ar}` }] } };
    },
    async apply(_a, r) {
      const plan = await api.getUserPlan(); const map = await api.exerciseMap();
      const before = JSON.parse(JSON.stringify(plan));
      const it = plan.days.find((d) => d.dow === r.dow).items.find((i) => i.exercise_id === r.from_id);
      it.exercise_id = r.to_id; it.sets = map[r.to_id].sets; it.reps = map[r.to_id].reps;
      await api.saveUserPlan(plan);
      return { restore: [{ table: 'user_plans', row: before }] };
    },
  },

  // ------------------------------------------------------------------ create_post
  create_post: {
    label: 'نشر بوست', confirm: true, card: 'post',
    async prepare({ body } = {}) {
      if (!body?.trim()) return { error: 'اكتبلي نص البوست اللي عايز تنشره.' };
      return { result: { summary: body.trim().slice(0, 80), body: body.trim() } };
    },
    async apply(_a, r) { const p = await api.createPost({ body: r.body }); return { remove: [{ table: 'posts', id: p.id }] }; },
  },
};

// ---------------------------------------------------------------------------------- public API
/**
 * Run a tool on behalf of the coach. Returns the action record:
 *   { error } | { disabled } | action (status 'proposed' or 'applied')
 */
export async function runTool(name, args = {}) {
  const tool = TOOLS[name];
  if (!tool) return { error: 'أداة غير معروفة.' };
  const s = await api.getCoachSettings();
  if (s?.tools?.[name] === false) return { disabled: true, error: 'الميزة دي متوقفة حالياً من الإدارة.' };
  const prepared = await tool.prepare(args);
  if (prepared.error) return { error: prepared.error };
  const action = await api.createCoachAction({ tool: name, args, status: 'proposed', result: prepared.result });
  const needsConfirm = s?.confirm?.[name] ?? tool.confirm;
  return needsConfirm ? action : applyAction(action.id);
}

export async function applyAction(id) {
  const a = await api.getCoachAction(id);
  if (!a || a.status === 'applied') return a;
  const undo = await TOOLS[a.tool].apply(a.args, a.result);
  return api.updateCoachAction(id, { status: 'applied', undo });
}
export async function undoAction(id) {
  const a = await api.getCoachAction(id);
  if (!a?.undo) return a;
  await replay(a.undo);
  return api.updateCoachAction(id, { status: 'undone', undo: null });
}
export const dismissAction = (id) => api.updateCoachAction(id, { status: 'dismissed' });
/** Undo the most recent applied action (used by the phrase "تراجع"). */
export async function undoLast() {
  const a = await api.lastUndoableAction();
  return a ? undoAction(a.id) : null;
}
/** Name list helper for the admin panel: [{ name, label }] */
export const toolList = () => Object.entries(TOOLS).map(([name, t]) => ({ name, label: t.label, confirm: t.confirm }));
export { WEEK_ORDER };
