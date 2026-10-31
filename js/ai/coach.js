/**
 * AI COACH brain.
 *
 *   sendToCoach(message) -> { user, reply, suggestions, limited? }
 *
 * This is the ONLY entry point the chat UI uses. Today (mock mode) it runs a rule-based parser that
 * understands Egyptian-Arabic phrases ("صحّيني 6", "اعملّي جدول 4 أيام", "بدّل تمرين الصدر" …).
 * To use a real LLM: set CONFIG.ADAPTER='supabase' and deploy the `coach` Edge Function —
 * api.invokeCoachFunction() then returns { text, tool_calls:[{name,args}], suggestions } and the
 * SAME tool layer (tools.js) executes the calls, so confirmations/undo/admin rules keep working.
 * The AI provider key lives only inside the Edge Function, never in this frontend.
 */
import * as api from '../data/api.js';
import { runTool, undoLast } from './tools.js';
import { toLatinDigits, DAYS_AR } from '../utils.js';
import { isOnline, isNetworkError } from '../ui/net.js';

export const DEFAULT_SUGGESTIONS = ['اعملي جدول 6 أيام', 'صحّيني 6 الصبح', 'بدّل تمرين الصدر', 'سجّل تمريني'];
export const WELCOME = 'أهلاً! أنا مدربك الذكي. أقدر أعملك جدول، أضبط منبه، أسجّل تمرينك أو أبدّل تمارين. قولي تحب نبدأ بإيه؟';

// ---------------------------------------------------------------- normalisation helpers
/** Lowercase, latin digits, no tashkeel, unified alef/ya/ta-marbuta so regexes stay simple. */
export const norm = (s) => toLatinDigits(String(s)).toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

const DAY_RE = [[6, /سبت/], [0, /(^|\s)(ال)?احد/], [1, /(اثنين|اتنين)/], [2, /ثلاث|تلات/], [3, /اربع/], [4, /خميس/], [5, /جمع/]];
const MUSCLES = [['صدر', /صدر/], ['ظهر', /ظهر/], ['رجل', /(رجل|ارجل|رجلين|سكوات)/], ['كتف', /كتف/], ['دراع', /(دراع|ذراع|باي|ترايسبس|بايسبس)/], ['بطن', /بطن/]];
const NUM_WORDS = { واحده: 1, واحد: 1, اتنين: 2, اثنين: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6, ست: 6, سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10, حداشر: 11, احداشر: 11, اتناشر: 12, اثناشر: 12 };

const findDays = (t) => DAY_RE.filter(([, re]) => re.test(t)).map(([d]) => d);
const findMuscle = (t) => MUSCLES.find(([, re]) => re.test(t))?.[0] || null;

/** Best matching exercise mentioned in the text (Arabic or English name, or any distinctive word). */
function findExercise(t, exercises) {
  let best = null;
  for (const e of exercises) {
    const ar = norm(e.name_ar), en = e.name_en.toLowerCase();
    let score = 0;
    if (t.includes(ar)) score = 100 + ar.length;
    else if (t.includes(en)) score = 90 + en.length;
    else for (const w of ar.split(' ')) if (w.length >= 3 && t.includes(w)) score = Math.max(score, w.length);
    if (score && (!best || score > best.score)) best = { e, score };
  }
  return best?.e || null;
}

/** "6", "6:30", "6 ونص", "7 الا ربع", "ست الصبح", + صباحاً/مساءً -> 'HH:MM' */
export function parseTime(t) {
  let h = null, m = 0;
  const dm = t.match(/(\d{1,2})(?:[:.](\d{2}))?/);
  if (dm) { h = +dm[1]; m = dm[2] ? +dm[2] : 0; }
  else { for (const [w, n] of Object.entries(NUM_WORDS)) if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(t)) { h = n; break; } }
  if (h == null) return null;
  if (/ونص/.test(t)) m = 30; else if (/وربع/.test(t)) m = 15; else if (/وثلث/.test(t)) m = 20;
  else if (/الا ربع/.test(t)) { m = 45; h = h === 1 ? 12 : h - 1; } else if (/الا ثلث/.test(t)) { m = 40; h = h === 1 ? 12 : h - 1; }
  const pm = /(مساء|عصر|بليل|ليل|بعد الظهر|\sم(\s|$))/.test(t), am = /(صباح|صبح|فجر|\sص(\s|$))/.test(t);
  if (h <= 12) {
    if (pm && h < 12) h += 12;
    else if (!pm && !am && /ظهر/.test(t) && h < 12) h = h < 6 ? h + 12 : h; // "الساعة 1 الظهر"
    else if (am && h === 12) h = 0;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the rule-based parser
async function parseArabic(raw) {
  const t = norm(raw);
  const exercises = await api.listExercises({});
  const days = findDays(t), muscle = findMuscle(t);
  const today = new Date().getDay();

  // 1) undo
  if (/^(تراجع|الغي|الغاء|ارجع)/.test(t) || /\bتراجع\b/.test(t)) return { undo: true };

  // 2) alarm
  if (/(صحيني|صحني|نبهني|فوقني|ايقظني|منبه|تنبيه)/.test(t) && !/(جدول|خطه)/.test(t)) {
    const time = parseTime(t.replace(/(صحيني|صحني|نبهني|فوقني|ايقظني|اضبط لي|اضبطلي|ظبطلي|ضبط|اضبط|ظبط|منبه|تنبيه|الساعه|ساعه)/g, ' '));
    const daily = /(يوميا|كل يوم)/.test(t);
    return { calls: [{ name: 'set_alarm', args: { time, days: daily ? [] : days, label: /فجر/.test(t) ? 'منبه الفجر' : /تمرين/.test(t) ? 'قبل التمرين' : 'منبه التمرين' } }],
      text: 'تمام، جهزت المنبه:', ask: 'قولي الساعة كام؟ مثلاً: "صحيني 6 الصبح" أو "منبه 7 ونص".', askChips: ['صحّيني 6 الصبح', 'صحّيني 7 ونص', 'منبه 5 فجراً'] , needs: time };
  }

  // 3) plan edits
  if (/(يوم راحه)/.test(t) && days.length && /(خلي|اجعل|خليه|حول|خلّي)/.test(t))
    return { calls: [{ name: 'edit_plan', args: { op: 'rest', dow: days[0] } }], text: 'تمام، عدّلت الجدول:' };
  if (/(ضيف|زود|حط|اضف|اضيف)/.test(t) && findExercise(t, exercises)) {
    const ex = findExercise(t, exercises);
    return { calls: [{ name: 'edit_plan', args: { op: 'add', dow: days[0] ?? today, exercise_id: ex.id } }], text: 'تمام، عدّلت الجدول:' };
  }
  if (/(شيل|احذف|امسح|الغي تمرين|احذفلي)/.test(t) && findExercise(t, exercises)) {
    const ex = findExercise(t, exercises);
    const plan = await api.getUserPlan();
    const dow = days[0] ?? plan?.days.find((d) => d.items.some((i) => i.exercise_id === ex.id))?.dow ?? today;
    return { calls: [{ name: 'edit_plan', args: { op: 'remove', dow, exercise_id: ex.id } }], text: 'تمام، عدّلت الجدول:' };
  }

  // 4) swap
  if (/(بدل|بدلي|غير|غيرلي|استبدل)/.test(t) && (muscle || findExercise(t, exercises))) {
    const ex = findExercise(t, exercises);
    return { calls: [{ name: 'swap_exercise', args: { dow: days[0], exercise_id: ex?.id, muscle: ex ? undefined : muscle } }], text: 'تمام، بدّلت التمرين:' };
  }

  // 5) create plan
  const planWord = /(جدول|خطه|بلان|برنامج)/.test(t);
  const planVerb = /(اعمل|جهز|عايز|عاوز|اعطي|ابني|انشئ|اقترح|ابغي|محتاج|ابي|اعفني|جدد|كون|هات)/.test(t);
  const planDays = /\d\s*(ايام|يوم)/.test(t) || /(تلات|ثلاث|اربع|خمس|ست)\w*\s*(ايام|يوم)/.test(t);
  if (planWord && (planVerb || planDays)) {
    let n = +(t.match(/(\d)\s*(ايام|يوم)/)?.[1] || 0);
    if (!n) for (const [w, v] of Object.entries(NUM_WORDS)) if (v >= 3 && v <= 6 && new RegExp(`${w}\\s*(ايام|يوم)`).test(t)) n = v;
    const goal = /(تضخيم|ضخامه|عضل|بناء)/.test(t) ? 'تضخيم العضلات' : /(تنشيف|تخسيس|نزول|دهون|وزن)/.test(t) ? 'خسارة الوزن' : /(لياقه)/.test(t) ? 'لياقة عامة' : '';
    return { calls: [{ name: 'create_plan', args: { days_count: n || 4, goal } }], text: `تمام! جهزت لك جدول ${n || 4} أيام مناسب لهدفك:`, textApplied: 'تم تطبيق الجدول الجديد.' };
  }
  if (/(جدولي|جدول النهارده|جدول اليوم)/.test(t) || /(تمرين|تمارين).*(النهارده|اليوم|بكره)/.test(t) || /ايه.*(تمرين)/.test(t)) {
    const home = await api.getHomeData();
    if (!home.today || home.today.rest) return { text: 'النهارده يوم راحة. ارتاح وتغذى كويس، وبكره نرجع بقوة.', suggestions: DEFAULT_SUGGESTIONS };
    return { text: `تمرين النهارده: ${home.today.label} (${home.today.count} تمارين تقريباً ${home.today.minutes} دقيقة). تحب أبدّل حاجة فيه؟`, suggestions: ['ابدأ التمرين', 'بدّل تمرين الصدر', 'سجّل تمريني'] };
  }

  // 6) log workout
  if (/(سجل|سجلي|ضيفلي في السجل)/.test(t)) {
    const ex = findExercise(t, exercises) || (muscle && exercises.find((e) => e.muscle === muscle));
    if (!ex) return { text: 'تحب أسجّل أنهي تمرين؟ قولي الاسم والمجموعات والتكرارات والوزن، مثلاً: "سجل بنش 3 مجموعات 10 عدات 60 كيلو".', suggestions: ['سجل بنش 3×10 60 كيلو', 'سجل سكوات 4×12', 'سجل عقلة 3×8'] };
    const x = t.match(/(\d+)\s*[x×*]\s*(\d+)/);
    const sets = +(x?.[1] || t.match(/(\d+)\s*(مجموعات|مجموعه|سيت|جولات)/)?.[1] || 3);
    const reps = +(x?.[2] || t.match(/(\d+)\s*(عده|عدات|تكرار|ريب|مره)/)?.[1] || 10);
    const weight = +(t.match(/(\d+(?:\.\d+)?)\s*(كيلو|كجم|كغ|kg)/)?.[1] || 0);
    return { calls: [{ name: 'log_workout', args: { exercise_id: ex.id, sets_count: sets, reps, weight } }], text: 'تمام، سجلت التمرين:' };
  }

  // 7) post
  if (/(انشر|بوست|شارك)/.test(t)) {
    const body = raw.includes(':') ? raw.split(':').slice(1).join(':').trim() : '';
    return { calls: [{ name: 'create_post', args: { body: body || 'خلصت تمرين النهارده وحاسس بطاقة رائعة! 💪' } }], text: 'جهزت لك البوست، أنشره؟', textApplied: 'تم نشر البوست في المجتمع.' };
  }

  // 8) small talk
  if (/(شكرا|تسلم|ميرسي)/.test(t)) return { text: 'العفو! أنا هنا في أي وقت. كمّل بقوة.', suggestions: DEFAULT_SUGGESTIONS };
  if (/(مرحبا|اهلا|السلام|هاي|صباح|مساء الخير)/.test(t)) return { text: 'أهلاً بيك يا بطل! تحب نعمل إيه النهارده؟', suggestions: DEFAULT_SUGGESTIONS };
  if (/(مساعده|تقدر|بتعمل ايه|ايه اللي)/.test(t)) return { text: 'أقدر: أعملك جدول أسبوعي، أضبط منبه، أبدّل تمرين، أسجّل تمرينك، وأنشر بوست في المجتمع. وكل حاجة تقدر تتراجع عنها.', suggestions: DEFAULT_SUGGESTIONS };
  return { text: 'ما فهمتش قصدك تمام. جرّب واحدة من دول:', suggestions: DEFAULT_SUGGESTIONS, unknown: true };
}


// ---------------------------------------------------------------- remote errors -> a clear Arabic message
const COACH_ERRORS = {
  coach_disabled: 'المدرب الذكي متوقف مؤقتاً من الإدارة. تقدر تستخدم الأوامر البسيطة زي «صحّيني 6 الصبح» أو «اعملي جدول 4 أيام».',
  daily_limit: 'وصلت للحد اليومي من رسائل المدرب. نكمل بكرة بإذن الله.',
  unauthorized: 'الجلسة انتهت. سجّل دخولك من جديد وجرّب تاني.',
  suspended: 'حسابك معلّق.',
  ai_unavailable: 'خدمة الذكاء الاصطناعي مش متاحة دلوقتي. جرّب بعد شوية.',
  no_ai_key_configured: 'مفتاح الذكاء الاصطناعي لسه ما اتضبطش على السيرفر (OPENROUTER_API_KEY أو GEMINI_API_KEY).',
};
export function coachErrorText(e) {
  if (!isOnline()) return 'مفيش اتصال بالإنترنت. المدرب محتاج نت، جرّب تاني لما الاتصال يرجع.';
  const code = String(e?.message || '');
  if (COACH_ERRORS[code]) return COACH_ERRORS[code];
  if (isNetworkError(e) || /Edge Function|send a request/i.test(code)) return 'تعذّر الاتصال بالمدرب. اتأكد من النت وجرّب تاني.';
  return 'حصلت مشكلة مؤقتة مع المدرب. جرّب تاني.';
}

// ---------------------------------------------------------------- public entry point
const CARD = { create_plan: 'plan', set_alarm: 'alarm', edit_plan: 'edit', swap_exercise: 'swap', log_workout: 'log', create_post: 'post' };

export async function sendToCoach(message) {
  const settings = await api.getCoachSettings();
  if ((await api.coachMessagesToday()) >= (settings?.daily_limit ?? 30)) {
    const reply = await api.coachAppend({ role: 'coach', text: 'وصلت للحد اليومي من الرسائل. نكمل بكرة بإذن الله.' });
    return { reply, suggestions: [], limited: true };
  }
  const user = await api.coachAppend({ role: 'user', text: message });

  let plan, remoteErr = null;
  try {
    if (api.backend === 'supabase' && !isOnline()) throw new Error('offline');
    const remote = await api.invokeCoachFunction({ message, history: (await api.coachHistory(12)).map((m) => ({ role: m.role, text: m.text })) });
    if (!remote) plan = await parseArabic(message);
    else if (remote.tool_calls?.[0]?.name === 'undo_last') plan = { undo: true, suggestions: remote.suggestions };
    else plan = { text: remote.text, calls: remote.tool_calls || [], suggestions: remote.suggestions };
  } catch (e) {
    console.warn('[coach] remote failed, using local parser', e);
    remoteErr = e;
    plan = await parseArabic(message);
    // the simple rule-based commands still work; anything it can't understand gets the REAL reason instead of "ما فهمتش"
    if (plan.unknown) plan = { text: coachErrorText(e), suggestions: DEFAULT_SUGGESTIONS };
  }

  let text = plan.text, card = null, suggestions = plan.suggestions || [];
  if (plan.undo) {
    const a = await undoLast();
    text = a ? 'تمام، رجّعت آخر تعديل.' : 'مفيش حاجة أتراجع عنها دلوقتي.';
  } else if (plan.calls?.length) {
    if (plan.needs === null) { text = plan.ask; suggestions = plan.askChips || []; }
    else {
      const action = await runTool(plan.calls[0].name, plan.calls[0].args);
      if (action.error) { text = action.error; suggestions = suggestions.length ? suggestions : DEFAULT_SUGGESTIONS; }
      else {
        card = { type: CARD[action.tool], action_id: action.id };
        text = action.status === 'applied' ? (plan.textApplied || plan.text || 'تم.') : plan.text;
      }
    }
  }
  const reply = await api.coachAppend({ role: 'coach', text: text || '...', card });
  return { user, reply, suggestions: suggestions.length ? suggestions : [] };
}

export { DAYS_AR };
