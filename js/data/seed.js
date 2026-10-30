/**
 * Seed data for the MOCK adapter only. Deterministic (seeded RNG) so a reset always looks the same.
 * Table/column names mirror /db/schema.sql exactly.
 * Nothing here is imported by UI code — UI only talks to /js/data/api.js.
 */
function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const dateOnly = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** [id, name_en, name_ar, muscle, equipment, difficulty, sets, reps, steps[]] */
const EX = [
  ['ex-bench', 'Bench Press', 'ضغط بنش', 'صدر', 'بار', 'متوسط', 3, '10-8', ['استلقِ على البنش مع تثبيت القدمين.', 'امسك البار بعرض الكتفين.', 'انزل بالبار ببطء حتى يلامس صدرك.', 'ادفع البار للأعلى مع الزفير.']],
  ['ex-incline-db', 'Incline Dumbbell Press', 'ضغط دمبل مائل', 'صدر', 'دمبل', 'متوسط', 3, '12-10', ['اضبط البنش على زاوية 30 درجة.', 'ارفع الدمبل فوق صدرك والمرفقان مفتوحان قليلاً.', 'انزل ببطء حتى تشعر بتمدد الصدر.', 'ادفع للأعلى دون قفل المرفقين.']],
  ['ex-chest-fly', 'Chest Fly', 'تفتيح صدر', 'صدر', 'جهاز', 'سهل', 3, '12-10', ['اجلس وظهرك ملاصق للمسند.', 'امسك المقبضين والمرفقان بزاوية خفيفة.', 'اضغط بالذراعين أمام صدرك.', 'ارجع ببطء مع التحكم في الحركة.']],
  ['ex-pushup', 'Push Up', 'ضغط', 'صدر', 'وزن الجسم', 'سهل', 3, '15-12', ['ضع يديك أوسع قليلاً من الكتفين.', 'حافظ على جسمك مستقيماً كالخط.', 'انزل حتى يقترب صدرك من الأرض.', 'ادفع الأرض بقوة للأعلى.']],
  ['ex-lat-pulldown', 'Lat Pulldown', 'سحب أمامي', 'ظهر', 'جهاز', 'متوسط', 3, '12-10', ['امسك البار بعرض أوسع من الكتفين.', 'اسحب البار نحو أعلى صدرك.', 'اضغط لوحي الكتف معاً في الأسفل.', 'ارجع ببطء ولا ترفع الوزن بسرعة.']],
  ['ex-seated-row', 'Seated Row', 'سحب أرضي', 'ظهر', 'جهاز', 'متوسط', 3, '12-10', ['اجلس بظهر مستقيم وصدر مرفوع.', 'اسحب المقبض نحو بطنك.', 'اعصر عضلات الظهر لثانية.', 'ارجع ببطء مع تمديد الذراعين.']],
  ['ex-deadlift', 'Deadlift', 'رفعة ميتة', 'ظهر', 'بار', 'صعب', 3, '8-6', ['قف والبار فوق منتصف القدمين.', 'انحنِ وأمسك البار وظهرك مستقيم.', 'ادفع بقدميك وارفع البار قريباً من جسمك.', 'ثبّت في الأعلى ثم انزل بتحكم.']],
  ['ex-pullup', 'Pull Up', 'عقلة', 'ظهر', 'وزن الجسم', 'صعب', 3, '8-6', ['امسك العقلة بعرض أوسع من الكتفين.', 'شد كتفيك للأسفل ثم اسحب جسمك.', 'ارفع ذقنك فوق العقلة.', 'انزل ببطء حتى تمديد الذراعين.']],
  ['ex-squat', 'Squat', 'سكوات', 'رجل', 'بار', 'صعب', 4, '12-8', ['ضع البار على أعلى الظهر وقدماك بعرض الكتفين.', 'انزل بالورك للخلف كأنك تجلس.', 'حافظ على الركبتين باتجاه أصابع القدم.', 'ادفع بكعبيك للوقوف.']],
  ['ex-leg-press', 'Leg Press', 'ضغط رجل', 'رجل', 'جهاز', 'متوسط', 3, '12-10', ['اجلس وظهرك ملاصق للمسند.', 'ضع قدميك بعرض الكتفين على المنصة.', 'انزل بالمنصة حتى زاوية 90 درجة.', 'ادفع دون قفل الركبتين.']],
  ['ex-lunges', 'Walking Lunges', 'طعنات', 'رجل', 'دمبل', 'متوسط', 3, '12-10', ['امسك دمبل في كل يد.', 'خذ خطوة كبيرة للأمام.', 'انزل حتى تكون الركبتان بزاوية 90 درجة.', 'ادفع وبدّل الرجل.']],
  ['ex-shoulder-press', 'Shoulder Press', 'ضغط كتف', 'كتف', 'دمبل', 'متوسط', 3, '12-10', ['اجلس بظهر مستقيم والدمبل عند مستوى الأذن.', 'ادفع الدمبل للأعلى فوق رأسك.', 'ثبّت لحظة دون قفل المرفقين.', 'انزل ببطء إلى البداية.']],
  ['ex-lateral-raise', 'Lateral Raise', 'رفرفة جانبية', 'كتف', 'دمبل', 'سهل', 3, '15-12', ['قف ممسكاً دمبل خفيف بجانبك.', 'ارفع الذراعين جانباً حتى مستوى الكتف.', 'ثبّت لحظة في الأعلى.', 'انزل ببطء دون تأرجح.']],
  ['ex-bicep-curl', 'Dumbbell Curl', 'باي دمبل', 'دراع', 'دمبل', 'سهل', 3, '12-10', ['قف والمرفقان ملاصقان لجسمك.', 'اثنِ المرفق وارفع الدمبل نحو كتفك.', 'اعصر العضلة في الأعلى.', 'انزل ببطء مع التحكم.']],
  ['ex-tricep-pushdown', 'Triceps Pushdown', 'ترايسبس كابل', 'دراع', 'جهاز', 'سهل', 3, '12-10', ['امسك الحبل أو البار من الأعلى.', 'ثبّت المرفقين بجانب الجسم.', 'ادفع للأسفل حتى فرد الذراعين.', 'ارجع ببطء.']],
  ['ex-plank', 'Plank', 'بلانك', 'بطن', 'وزن الجسم', 'سهل', 3, '45ث', ['ارتكز على ساعديك وأصابع القدم.', 'اجعل جسمك خطاً مستقيماً.', 'شد عضلات البطن والمؤخرة.', 'تنفّس بانتظام وثبّت المدة.']],
  ['ex-crunch', 'Crunch', 'كرنش', 'بطن', 'وزن الجسم', 'سهل', 3, '20-15', ['استلقِ على ظهرك وثنِ ركبتيك.', 'ضع يديك خلف رأسك دون سحبه.', 'ارفع كتفيك عن الأرض بقوة البطن.', 'انزل ببطء.']],
  ['ex-leg-raise', 'Leg Raise', 'رفع رجل', 'بطن', 'وزن الجسم', 'متوسط', 3, '15-12', ['استلقِ وضع يديك تحت أسفل ظهرك.', 'ارفع الرجلين مستقيمتين للأعلى.', 'انزل ببطء دون ملامسة الأرض.', 'حافظ على ثبات أسفل الظهر.']],
];

const FIRST = ['محمد', 'أحمد', 'يوسف', 'علي', 'كريم', 'عمر', 'مصطفى', 'خالد', 'حسن', 'إبراهيم', 'سارة', 'نور', 'ليلى', 'هدى', 'مها', 'آية', 'ياسمين', 'طارق', 'زياد', 'ماهر'];
const LAST = ['أحمد', 'حسن', 'علي', 'محمود', 'السيد', 'عبدالله', 'فتحي', 'سعيد', 'نصر', 'منصور'];
const GOALS = ['جسم أقوى وصحة أفضل', 'تضخيم العضلات', 'خسارة الوزن', 'زيادة اللياقة', 'زيادة القوة'];

export function buildSeed() {
  const R = rng(7);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const now = Date.now();
  const db = {};

  // ---------- exercises ----------
  db.exercises = EX.map(([id, en, ar, muscle, equipment, difficulty, sets, reps, steps], i) => ({
    id, name_en: en, name_ar: ar, muscle, equipment, difficulty, sets, reps, steps,
    duration: 45, image: `assets/img/${id}.svg`, published: id !== 'ex-leg-raise' ? true : true,
    created_at: iso(now - (40 - i) * DAY),
  }));

  // ---------- profiles ----------
  db.profiles = [
    { id: 'u1', name: 'محمد أحمد', avatar: 'assets/img/av-1.svg', goal: 'جسم أقوى وصحة أفضل', role: 'user', suspended: false, weight: 72, streak: 7, last_workout: dateOnly(now), created_at: iso(now - 60 * DAY), last_active: iso(now - 600000) },
    { id: 'admin1', name: 'مدير النظام', avatar: 'assets/img/av-5.svg', goal: '', role: 'admin', suspended: false, weight: 0, streak: 0, last_workout: null, created_at: iso(now - 120 * DAY), last_active: iso(now - 3600000) },
  ];
  for (let i = 0; i < 38; i++) {
    const nm = `${pick(FIRST)} ${pick(LAST)}`;
    const created = now - Math.floor(R() * 30 * DAY) - (i < 4 ? 0 : 0);
    db.profiles.push({
      id: `u${i + 2}`, name: nm, avatar: `assets/img/av-${(i % 8) + 1}.svg`,
      goal: pick(GOALS), role: 'user', suspended: i === 11 || i === 27, weight: 55 + Math.floor(R() * 40),
      streak: Math.floor(R() * 30), last_workout: dateOnly(now - Math.floor(R() * 5) * DAY),
      created_at: iso(i < 5 ? now - i * 3600000 * 2 : created), last_active: iso(now - Math.floor(R() * 4 * DAY)),
    });
  }

  // e-mails are private: they live in their own table (owner/admin only on the real backend)
  db.profile_private = db.profiles.map((p) => ({ id: p.id, email: p.id === 'u1' ? 'mohamed@example.com' : p.id === 'admin1' ? 'admin@fitcircle.app' : `user${p.id.slice(1)}@example.com` }));

  // ---------- social: follows · stories · messages · blocks ----------
  db.follows = []; db.blocks = []; db.story_views = []; db.messages = [];
  const fol = (a, b, h = 24) => db.follows.push({ id: `fw-${db.follows.length + 1}`, follower_id: a, followee_id: b, created_at: iso(now - h * 3600000) });
  ['u2', 'u3', 'u5', 'u6'].forEach((u, i) => fol('u1', u, 50 + i));
  ['u2', 'u3', 'u4', 'u7', 'u8'].forEach((u, i) => fol(u, 'u1', 30 + i));
  for (let u = 3; u < 14; u++) fol(`u${u}`, `u${2 + (u % 5)}`, u);
  db.stories = ['u2', 'u3', 'u5', 'u6', 'u9'].map((user_id, i) => ({
    id: `st-${i + 1}`, user_id, image: `assets/img/p-${(i % 4) + 1}.svg`, caption: ['يوم رجل 🔥', 'صباح الخير يا أبطال', '', 'رقم جديد!', 'استمروا 💪'][i], hidden: false,
    created_at: iso(now - (i + 1) * 2 * 3600000), expires_at: iso(now + (22 - i * 2) * 3600000),
  }));
  db.messages = [
    ['u3', 'u1', 'ازيك يا بطل! عايز أسألك عن جدول الصدر', 180, false], ['u1', 'u3', 'أهلاً! تمام، اسأل', 170, true], ['u3', 'u1', 'بتعمل كام ست في البنش؟', 160, false],
    ['u2', 'u1', 'تمرين الصبح بكرة؟ 💪', 60, false],
  ].map(([sender_id, recipient_id, body, mins, read], i) => ({ id: `ms-${i + 1}`, sender_id, recipient_id, body, read_at: read || i === 0 ? iso(now - (mins - 5) * 60000) : null, created_at: iso(now - mins * 60000) }));

  // ---------- plan templates (used by the AI coach) ----------
  const day = (label, muscles, ids) => ({ label, muscles, exercise_ids: ids });
  const CH = ['ex-bench', 'ex-incline-db', 'ex-chest-fly'], BK = ['ex-lat-pulldown', 'ex-seated-row', 'ex-deadlift'], LG = ['ex-squat', 'ex-leg-press', 'ex-lunges'], SH = ['ex-shoulder-press', 'ex-lateral-raise'], AR = ['ex-bicep-curl', 'ex-tricep-pushdown'], AB = ['ex-plank', 'ex-crunch', 'ex-leg-raise'];
  db.plan_templates = [
    { id: 'tpl-3', name: 'فول بودي 3 أيام', goal: 'لياقة عامة', days_count: 3, published: true, created_at: iso(now - 50 * DAY),
      days: [day('يوم جسم كامل أ', ['صدر', 'ظهر'], ['ex-bench', 'ex-lat-pulldown', 'ex-shoulder-press', 'ex-plank']), day('يوم جسم كامل ب', ['رجل', 'كتف'], ['ex-squat', 'ex-incline-db', 'ex-seated-row', 'ex-crunch']), day('يوم جسم كامل ج', ['رجل', 'دراع'], ['ex-deadlift', 'ex-lunges', 'ex-bicep-curl', 'ex-tricep-pushdown'])] },
    { id: 'tpl-4', name: 'علوي / سفلي 4 أيام', goal: 'تضخيم العضلات', days_count: 4, published: true, created_at: iso(now - 49 * DAY),
      days: [day('يوم صدر + ترايسبس', ['صدر', 'دراع'], [...CH, 'ex-tricep-pushdown']), day('يوم ظهر + بايسبس', ['ظهر', 'دراع'], [...BK.slice(0, 2), 'ex-bicep-curl']), day('يوم رجل', ['رجل'], LG), day('يوم كتف + بطن', ['كتف', 'بطن'], [...SH, 'ex-plank', 'ex-crunch'])] },
    { id: 'tpl-5', name: 'سبليت 5 أيام', goal: 'تضخيم العضلات', days_count: 5, published: true, created_at: iso(now - 48 * DAY),
      days: [day('يوم صدر', ['صدر'], CH), day('يوم ظهر', ['ظهر'], BK), day('يوم رجل', ['رجل'], LG), day('يوم كتف', ['كتف'], [...SH, 'ex-pushup']), day('يوم دراع + بطن', ['دراع', 'بطن'], [...AR, ...AB.slice(0, 2)])] },
    { id: 'tpl-6', name: 'بوش / بول / ليجز 6 أيام', goal: 'تضخيم العضلات', days_count: 6, published: true, created_at: iso(now - 47 * DAY),
      days: [day('يوم صدر + ترايسبس', ['صدر', 'دراع'], [...CH, 'ex-tricep-pushdown']), day('يوم ظهر + بايسبس', ['ظهر', 'دراع'], [...BK.slice(0, 2), 'ex-bicep-curl']), day('يوم رجل', ['رجل'], LG), day('يوم كتف + دراع', ['كتف', 'دراع'], [...SH, ...AR]), day('يوم صدر + ظهر', ['صدر', 'ظهر'], ['ex-incline-db', 'ex-pullup', 'ex-pushup']), day('يوم رجل + بطن', ['رجل', 'بطن'], ['ex-leg-press', 'ex-lunges', 'ex-plank', 'ex-leg-raise'])] },
    { id: 'tpl-cut', name: 'تنشيف 4 أيام', goal: 'خسارة الوزن', days_count: 4, published: true, created_at: iso(now - 30 * DAY),
      days: [day('يوم دفع', ['صدر', 'كتف'], ['ex-pushup', 'ex-incline-db', 'ex-shoulder-press']), day('يوم سحب', ['ظهر', 'دراع'], ['ex-pullup', 'ex-seated-row', 'ex-bicep-curl']), day('يوم رجل', ['رجل'], ['ex-squat', 'ex-lunges', 'ex-leg-press']), day('يوم جسم كامل + بطن', ['بطن'], ['ex-deadlift', 'ex-plank', 'ex-crunch', 'ex-leg-raise'])] },
  ];

  // ---------- user plan for u1 (weekday keyed, JS getDay(): 0=Sun … 6=Sat) ----------
  const items = (ids) => ids.map((id) => { const e = db.exercises.find((x) => x.id === id); return { exercise_id: id, sets: e.sets, reps: e.reps }; });
  db.user_plans = [{
    id: 'plan-u1', user_id: 'u1', name: 'جدول 6 أيام', goal: 'تضخيم العضلات', created_at: iso(now - 20 * DAY),
    days: [
      { dow: 6, label: 'يوم صدر', rest: false, items: items(CH) },
      { dow: 0, label: 'يوم ظهر', rest: false, items: items(BK) },
      { dow: 1, label: 'يوم رجل', rest: false, items: items(LG) },
      { dow: 2, label: 'يوم كتف', rest: false, items: items([...SH, 'ex-pushup']) },
      { dow: 3, label: 'يوم دراع', rest: false, items: items([...AR, 'ex-plank']) },
      { dow: 4, label: 'يوم صدر + ظهر', rest: false, items: items(['ex-incline-db', 'ex-pullup', 'ex-chest-fly']) },
      { dow: 5, label: 'يوم راحة', rest: true, items: [] },
    ],
  }];

  // ---------- workout logs (last 30 days; u1 has the last 7 days consecutively) ----------
  db.workout_logs = [];
  const mkLog = (uid, exId, ms) => {
    const ex = db.exercises.find((e) => e.id === exId);
    const n = ex.sets, w = 10 + Math.floor(R() * 50);
    const sets = Array.from({ length: n }, () => ({ reps: 8 + Math.floor(R() * 6), weight: w }));
    db.workout_logs.push({ id: `log-${db.workout_logs.length + 1}`, user_id: uid, exercise_id: exId, date: dateOnly(ms), sets, calories: n * 38, created_at: iso(ms) });
  };
  for (let d = 1; d < 8; d++) { // yesterday and back: today's workout is still to do
    const ids = [CH, BK, LG, SH, AR, CH, BK][d % 7];
    ids.slice(0, 2).forEach((id, k) => mkLog('u1', id, now - d * DAY - k * 600000 - 3600000));
  }
  for (let d = 7; d < 30; d++) if (R() > 0.35) mkLog('u1', pick(EX)[0], now - d * DAY - 7200000);
  for (let u = 2; u < 40; u++) for (let d = 0; d < 30; d++) if (R() > 0.82) mkLog(`u${u}`, pick(EX)[0], now - d * DAY - Math.floor(R() * DAY / 2));

  // ---------- alarms ----------
  db.alarms = [
    { id: 'al-1', user_id: 'u1', time: '06:00', days: [6, 1, 3], label: 'منبه الفجر', enabled: true, created_at: iso(now - 10 * DAY) },
    { id: 'al-2', user_id: 'u1', time: '07:30', days: [0, 2, 4], label: 'قبل التمرين', enabled: false, created_at: iso(now - 9 * DAY) },
    { id: 'al-3', user_id: 'u1', time: '21:00', days: [0, 1, 2, 3, 4, 5, 6], label: 'تذكير النوم', enabled: false, created_at: iso(now - 8 * DAY) },
  ];
  for (let u = 2; u < 16; u++) db.alarms.push({ id: `al-x${u}`, user_id: `u${u}`, time: pick(['05:30', '06:00', '06:30', '17:00']), days: [6, 0, 1], label: 'تمرين', enabled: R() > 0.4, created_at: iso(now - 5 * DAY) });

  // ---------- posts / comments / likes / saves / reports ----------
  const POSTS = [
    ['u1', 'تطور بسيط كل يوم يصنع فرقاً كبيراً 💪', 'assets/img/p-1.svg'],
    ['u3', 'خلصت تمرين الرجل النهاردة… مش قادر أمشي 😅', 'assets/img/p-2.svg'],
    ['u1', 'أسبوع كامل من الالتزام. الخطوة الأولى كانت الأصعب.', 'assets/img/p-3.svg'],
    ['u5', 'رقم شخصي جديد في الرفعة الميتة!', 'assets/img/p-4.svg'],
    ['u6', 'مين يشاركني تمرين الصبح بكرة؟', null],
    ['u7', 'نصيحة: النوم الكويس نص التمرين.', null],
    ['u8', 'أول مرة أنزل الجيم بعد انقطاع شهرين، رجعت بقوة.', 'assets/img/p-2.svg'],
    ['u9', 'إعلان مشبوه: اشتري مكملات بخصم 90% من الرابط!!!', null],
  ];
  db.posts = POSTS.map(([user_id, body, image], i) => ({ id: `post-${i + 1}`, user_id, body, image, hidden: false, created_at: iso(now - (i * 5 + 3) * 3600000) }));
  db.likes = []; db.saves = []; db.comments = []; db.reports = [];
  db.posts.forEach((p, i) => {
    const n = 4 + Math.floor(R() * 20);
    for (let k = 0; k < n; k++) db.likes.push({ id: `lk-${db.likes.length + 1}`, post_id: p.id, user_id: `u${2 + k}`, created_at: p.created_at });
    if (i < 3) db.saves.push({ id: `sv-${db.saves.length + 1}`, post_id: p.id, user_id: 'u1', created_at: p.created_at });
  });
  const CMT = ['ما شاء الله، استمر 👏', 'بطل!', 'عايز البرنامج ده', 'تمرين جامد', 'فخور بيك'];
  for (let i = 0; i < 14; i++) db.comments.push({ id: `cm-${i + 1}`, post_id: `post-${(i % 6) + 1}`, user_id: `u${3 + i}`, body: pick(CMT), created_at: iso(now - (i + 1) * 1800000) });
  db.reports = [
    { id: 'rp-1', post_id: 'post-8', reporter_id: 'u1', reason: 'محتوى مضلل / إعلان', status: 'open', created_at: iso(now - 2 * 3600000) },
    { id: 'rp-2', post_id: 'post-8', reporter_id: 'u3', reason: 'سبام', status: 'open', created_at: iso(now - 3600000) },
    { id: 'rp-3', post_id: 'post-5', reporter_id: 'u4', reason: 'غير لائق', status: 'open', created_at: iso(now - 7200000) },
    { id: 'rp-4', post_id: 'post-3', reporter_id: 'u6', reason: 'سبام', status: 'dismissed', created_at: iso(now - DAY) },
  ];

  // ---------- coach conversation log (so the admin viewer has content) ----------
  db.coach_messages = []; db.coach_actions = [];
  const cm = (user_id, role, text, ago, extra = {}) => db.coach_messages.push({ id: `cmsg-${db.coach_messages.length + 1}`, user_id, role, text, card: null, created_at: iso(now - ago), ...extra });
  cm('u2', 'user', 'اعملي جدول 4 أيام', 5 * 3600000); cm('u2', 'coach', 'تمام! جهزت لك جدول 4 أيام مناسب لهدفك.', 5 * 3600000 - 60000, { card: { type: 'plan', action_id: 'act-1' } });
  cm('u3', 'user', 'صحّيني 6', 3 * 3600000); cm('u3', 'coach', 'تم ضبط المنبه 6:00 ص.', 3 * 3600000 - 60000, { card: { type: 'alarm', action_id: 'act-2' } });
  db.coach_actions = [
    { id: 'act-1', user_id: 'u2', tool: 'create_plan', args: { days_count: 4 }, status: 'applied', result: { summary: 'جدول 4 أيام', template_id: 'tpl-4' }, undo: null, created_at: iso(now - 5 * 3600000) },
    { id: 'act-2', user_id: 'u3', tool: 'set_alarm', args: { time: '06:00' }, status: 'applied', result: { summary: 'منبه 6:00 ص' }, undo: null, created_at: iso(now - 3 * 3600000) },
  ];

  // ---------- notifications / push ----------
  db.notifications = [
    { id: 'n-1', title: 'تمرين اليوم ينتظرك', body: 'لا تكسر السلسلة! تمرين الصدر اليوم.', target: 'all', status: 'sent', scheduled_at: null, sent_at: iso(now - 2 * DAY), created_at: iso(now - 2 * DAY), created_by: 'admin1' },
    { id: 'n-2', title: 'تحدي الأسبوع', body: 'سجّل 5 تمارين هذا الأسبوع واحصل على شارة جديدة.', target: 'all', status: 'sent', scheduled_at: null, sent_at: iso(now - 6 * DAY), created_at: iso(now - 6 * DAY), created_by: 'admin1' },
    { id: 'n-3', title: 'رسالة مجدولة', body: 'صباح الخير! جاهز لتمرين اليوم؟', target: 'all', status: 'scheduled', scheduled_at: iso(now + DAY), sent_at: null, created_at: iso(now - 3600000), created_by: 'admin1' },
  ];
  db.push_subscriptions = [];

  // ---------- audit log ----------
  db.audit_log = [
    { id: 'au-1', actor_id: 'admin1', actor_name: 'مدير النظام', action: 'user.suspend', target: 'u12', meta: { name: 'مستخدم تجريبي' }, created_at: iso(now - 3 * DAY) },
    { id: 'au-2', actor_id: 'admin1', actor_name: 'مدير النظام', action: 'exercise.save', target: 'ex-leg-raise', meta: { name: 'رفع رجل' }, created_at: iso(now - 4 * DAY) },
    { id: 'au-3', actor_id: 'admin1', actor_name: 'مدير النظام', action: 'notification.send', target: 'n-1', meta: { title: 'تمرين اليوم ينتظرك' }, created_at: iso(now - 2 * DAY) },
  ];

  // ---------- app + coach settings (key/value, id = key) ----------
  db.app_settings = [
    { id: 'app', value: { name: 'FitCircle', tagline: 'معاً نحو نسخة أفضل منك', logo: '', brand_color: '#C6FF3D', flags: { community: true, coach: true, alarms: true, signups: true, maintenance: false } } },
    { id: 'coach', value: {
      system_prompt: 'أنت "المدرب"، مدرب لياقة ودود يتحدث بالعربية (لهجة مصرية مبسطة). ساعد المستخدم في الجداول والمنبهات وتسجيل التمارين. استخدم الأدوات المتاحة فقط، ولا تعطِ نصائح طبية. اطلب تأكيداً قبل استبدال الجدول بالكامل.',
      tools: { create_plan: true, edit_plan: true, set_alarm: true, log_workout: true, swap_exercise: true, create_post: true },
      confirm: { create_plan: true, edit_plan: false, set_alarm: false, log_workout: false, swap_exercise: false, create_post: true },
      daily_limit: 30,
    } },
  ];
  return db;
}

export const SEED_EXERCISE_COUNT = EX.length;
