/**
 * NUTRITION brain (client side).
 *
 *   analyzeMeal({ text, file })  -> { is_food, meal, note?, provider }   (photo and/or text)
 *   askNutrition({ message, file, history, context })  -> { text }
 *
 * With Supabase both go to the `nutrition` Edge Function (Gemini / OpenRouter, vision-capable) — the API key never
 * reaches the browser. In mock mode (or when the AI is unavailable) TEXT descriptions fall back to a small local
 * table of common (Egyptian) foods; photos need the real AI.
 */
import * as api from '../data/api.js';
import { fileToDataURL, toLatinDigits } from '../utils.js';

export const MEAL_TYPES = { breakfast: 'فطار', lunch: 'غداء', dinner: 'عشاء', snack: 'سناك' };
export function guessMealType(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'snack' : h < 11 ? 'breakfast' : h < 17 ? 'lunch' : h < 22 ? 'dinner' : 'snack';
}

// ------------------------------------------------------------------------------------------ goals
/** Daily targets: the user's own numbers when set, otherwise a simple estimate from weight and goal. */
export function goalsFor(user = {}) {
  const w = +user.weight || 0, g = String(user.goal || '');
  let kcal = w ? w * 31 : 2200;
  if (/(خسار|تنشيف|تخسيس|نزول|دهون)/.test(g)) kcal -= 400;
  else if (/(تضخيم|عضل|بناء|زيادة)/.test(g)) kcal += 300;
  kcal = Math.min(4500, Math.max(1500, Math.round(kcal / 50) * 50));
  const calories = +user.calorie_goal || kcal;
  const protein = +user.protein_goal || (w ? Math.round(w * 1.8) : 110);
  return { calories, protein, estimated: !user.calorie_goal };
}

// ------------------------------------------------------------------------------------------ images
/** Resize (max 1024 px, JPEG) and return the payload the Edge Function expects. */
export async function imageToPayload(file) {
  if (!/^image\//.test(file.type || '')) throw new Error('اختر ملف صورة');
  const url = await fileToDataURL(file, 1024, 0.8); // data:image/jpeg;base64,....
  const data = url.split(',')[1] || '';
  if (!data) throw new Error('تعذّر قراءة الصورة');
  return { mime: 'image/jpeg', data, preview: url };
}

const ERRORS = {
  daily_limit: 'وصلت للحد اليومي لتحليل الوجبات. جرّب بكرة أو أضف الوجبة يدوياً.',
  unauthorized: 'سجّل دخولك من جديد وجرّب تاني.',
  suspended: 'حسابك معلّق.',
  nutrition_disabled: 'خدمة التغذية متوقفة مؤقتاً.',
  bad_image: 'الصورة غير مناسبة (JPG / PNG / WEBP وأقل من 2 ميجا).',
  ai_unavailable: 'خدمة الذكاء الاصطناعي مش متاحة دلوقتي. جرّب بعد شوية.',
  no_ai_key_configured: 'مفتاح الذكاء الاصطناعي لسه ما اتضبطش على السيرفر.',
};
const friendly = (e) => new Error(ERRORS[e?.message] || 'حصلت مشكلة في الاتصال. جرّب تاني.');

// ------------------------------------------------------------------------------------------ local estimator (text only)
// [name, regex, grams per serving, kcal/100g, protein, carbs, fat]   (rough averages)
const FOODS = [
  ['فول', /فول/, 180, 110, 7.6, 19, 0.5], ['طعمية / فلافل', /(طعمي|فلافل)/, 100, 333, 13, 31, 17],
  ['عيش بلدي', /(عيش|خبز|رغيف)/, 80, 270, 9, 55, 1.5], ['كشري', /كشري/, 350, 150, 4.5, 27, 3],
  ['رز', /(رز|ارز|أرز)/, 200, 130, 2.7, 28, 0.3], ['مكرونة', /(مكرون|باستا|معكرون)/, 200, 158, 5.8, 31, 0.9],
  ['فراخ مشوية', /(فراخ|فرخ|دجاج|صدور)/, 150, 165, 31, 0, 3.6], ['لحمة', /(لحم|ستيك|كفت|استيك)/, 150, 250, 26, 0, 15],
  ['سمك', /(سمك|بلطي|جمبري|تونة)/, 150, 140, 24, 0, 4.5], ['بيض', /(بيض)/, 50, 155, 13, 1.1, 11],
  ['جبنة', /(جبن)/, 50, 264, 14, 4, 21], ['زبادي', /(زبادي|زبدي)/, 150, 61, 3.5, 4.7, 3.3],
  ['لبن', /(لبن|حليب)/, 250, 60, 3.2, 4.7, 3.3], ['موز', /موز/, 120, 89, 1.1, 23, 0.3],
  ['تفاح', /تفاح/, 180, 52, 0.3, 14, 0.2], ['برتقال', /(برتقال|يوسفي)/, 150, 47, 0.9, 12, 0.1],
  ['بطاطس مسلوقة / مشوية', /(بطاطس مسلوق|بطاطس مشوي|بطاطا)/, 200, 90, 2, 21, 0.1], ['بطاطس محمرة', /(بطاطس|شيبس|فرايز)/, 120, 312, 3.4, 41, 15],
  ['شوفان', /شوفان/, 40, 380, 13, 67, 7], ['سلطة', /(سلطة|خيار|خس)/, 150, 20, 1, 4, 0.2],
  ['ملوخية', /ملوخي/, 250, 60, 4, 8, 1.5], ['محشي', /(محشي|ورق عنب)/, 200, 140, 3, 22, 4.5],
  ['شاورما', /شاورما/, 250, 230, 15, 18, 11], ['برجر', /(برجر|همبرجر)/, 220, 250, 13, 22, 12],
  ['بيتزا', /بيتزا/, 200, 270, 11, 33, 10], ['حمص', /(حمص|حمّص)/, 150, 160, 8.9, 27, 2.6],
  ['مكسرات', /(مكسرات|لوز|عين جمل|بندق|فول سوداني)/, 30, 600, 20, 21, 53], ['زيت / سمن', /(زيت|سمنة|سمن|زبدة)/, 10, 800, 0, 0, 90],
  ['واي بروتين', /(واي|بروتين شيك|بروتين باودر)/, 30, 400, 80, 10, 5], ['حلويات', /(حلو|كنافة|بسبوسة|كيك|شوكولاتة|آيس|ايس)/, 100, 400, 4, 55, 18],
];
const WORD_NUM = { نص: 0.5, نصف: 0.5, واحد: 1, واحدة: 1, اتنين: 2, اثنين: 2, تلات: 3, ثلاث: 3, تلاتة: 3, ثلاثة: 3, اربع: 4, أربع: 4, اربعة: 4, خمس: 5, خمسة: 5 };

function localEstimate(text) {
  const t = toLatinDigits(text).toLowerCase();
  const items = [];
  for (const [name, re, grams, kcal, p, c, f] of FOODS) {
    const m = t.match(re);
    if (!m) continue;
    const before = t.slice(Math.max(0, m.index - 14), m.index);
    let qty = 1;
    const n = before.match(/(\d+(?:\.\d+)?)\s*(?:حبة|حبات|رغيف|ارغفة|أرغفة|بيضة|بيضات|كوب|اكواب|ملعقة|ملاعق|طبق|اطباق|شريحة)?\s*(?:من\s*)?$/);
    if (n) qty = Math.min(10, +n[1]); else { const w = before.match(/(نص|نصف|واحد|واحدة|اتنين|اثنين|تلات|ثلاث|تلاتة|ثلاثة|اربع|أربع|اربعة|خمس|خمسة)\s*(?:حبة|حبات|رغيف|بيضة|بيضات|كوب|ملعقة|طبق)?\s*$/); if (w) qty = WORD_NUM[w[1]]; }
    const g = Math.round(grams * qty);
    items.push({ name, grams: g, calories: Math.round((kcal * g) / 100), p: (p * g) / 100, c: (c * g) / 100, f: (f * g) / 100 });
  }
  if (!items.length) return null;
  const sum = (k) => items.reduce((s, i) => s + i[k], 0);
  return {
    is_food: true, provider: 'local',
    meal: {
      title: items.map((i) => i.name).slice(0, 3).join(' + '), meal_type: guessMealType(), calories: Math.round(sum('calories')),
      protein: Math.round(sum('p') * 10) / 10, carbs: Math.round(sum('c') * 10) / 10, fat: Math.round(sum('f') * 10) / 10,
      items: items.map(({ name, grams, calories }) => ({ name, grams, calories })), confidence: 'low',
      note: 'تقدير تقريبي من جدول بسيط للأكلات الشائعة. للصور والدقة الأعلى فعّل الذكاء الاصطناعي.',
    },
  };
}

// ------------------------------------------------------------------------------------------ public API
/** Analyze a meal from a photo and/or a text description. Never throws for "not food": check `is_food`. */
export async function analyzeMeal({ text = '', file = null } = {}) {
  text = text.trim();
  if (!text && !file) throw new Error('صوّر الوجبة أو اكتب وصفها');
  const image = file ? await imageToPayload(file) : null;
  let remote = null;
  try { remote = await api.invokeNutrition({ mode: 'analyze', text, image: image ? { mime: image.mime, data: image.data } : undefined }); }
  catch (e) {
    const code = e?.message;
    if (!text || image || code === 'daily_limit' || code === 'bad_image' || code === 'unauthorized') throw friendly(e); // text-only may fall back
    console.warn('[nutrition] AI failed, using local estimate', e);
  }
  if (remote) return { ...remote, preview: image?.preview };
  if (image && !text) return { is_food: false, note: 'تحليل الصور بيشتغل بالذكاء الاصطناعي على الحساب الحقيقي (سوبابيس). اكتب وصف الوجبة هنا وهقدّرها لك.', provider: 'local', preview: image.preview };
  const loc = localEstimate(text);
  return loc ? { ...loc, preview: image?.preview } : { is_food: false, note: 'ما قدرتش أفهم الأكلة دي. جرّب تكتب مكوناتها (مثال: ٢ رغيف عيش وفول وبيضتين).', provider: 'local' };
}

/** Free-form nutrition question (optionally with a photo). */
export async function askNutrition({ message = '', file = null, history = [], context = {} } = {}) {
  message = message.trim();
  if (!message && !file) throw new Error('اكتب سؤالك');
  const image = file ? await imageToPayload(file) : null;
  let r = null;
  try { r = await api.invokeNutrition({ mode: 'chat', message, history, context, image: image ? { mime: image.mime, data: image.data } : undefined }); }
  catch (e) { throw friendly(e); }
  if (!r) return { text: 'المساعد الذكي للتغذية بيشتغل على الحساب الحقيقي (سوبابيس). في الوضع التجريبي تقدر تستخدم «تحليل وجبة» بالوصف النصي.', preview: image?.preview };
  return { text: r.text, preview: image?.preview };
}
