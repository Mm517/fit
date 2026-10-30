# FitCircle (فِت سيركل)

Arabic RTL, mobile-first PWA — gym community + workout tracker + AI coach that acts inside the app — plus a desktop Admin dashboard. Vanilla HTML/CSS/JS (ES modules), no build step.

## Run
```bash
python3 -m http.server 8765      # any static server; service worker needs http://localhost or https
# app:    http://localhost:8765/index.html#/
# admin:  http://localhost:8765/index.html#/admin   (MOCK-ONLY demo login: admin@fitcircle.app / admin123)
```

## Structure
```
index.html  manifest.json  sw.js
css/   app.css (tokens + shared components) · home.css · pages.css · admin.css
js/
  main.js router.js alarm.js utils.js config.js
  data/  api.js (the ONLY data entry point) · mock.js · supabase.js · seed.js
  ai/    tools.js (create_plan, edit_plan, set_alarm, log_workout, swap_exercise, create_post, undo) · coach.js (sendToCoach)
  ui/    icons.js kit.js nav.js install.js      pages/ user screens      admin/ dashboard
db/schema.sql           Supabase tables + RLS + is_admin()      (not executed)
supabase/functions/coach  Edge Function stub (the AI key lives only here)
```

## Switch to Supabase
1. Run `db/schema.sql`, create the first admin: `update profiles set role='admin' where email='…'`.
2. `js/config.js`: set `ADAPTER:'supabase'`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Deploy the `coach` function, set `AI_API_KEY` as a function secret (never in the frontend).
Adapters expose the same interface (`select/get/insert/update/upsert/remove/removeWhere/auth/uploadImage/invokeCoach/rpc`); all domain logic is in `api.js`.

## AI coach
`sendToCoach(message)` is the single entry point. Mock mode uses a rule-based Egyptian-Arabic parser ("صحّيني 6", "اعملّي جدول 4 أيام", "بدّل تمرين الصدر", "سجل بنش 3×10 60 كيلو", "تراجع"). With Supabase the Edge Function returns `{text, tool_calls}` and the same tool layer executes them. Each call is stored in `coach_actions` with an undo snapshot; replacing the whole plan needs confirmation; admins can disable tools / force confirmation / set daily limits.

## Known limits
- Alarms: a web page cannot wake a sleeping phone. They ring while the app/tab is alive (sound + wake screen + repeating notification every 2 min with صحيت / غفوة actions); reliable background ringing needs server Web Push. Settings → "توفير البطارية" explains the Android exclusion.
- Images are generated placeholders in `assets/img` (no real photos shipped); replace files of the same names.
- `profiles.email` is readable by signed-in users under the provided RLS (needed for the community); split into a private table for stricter privacy.
- Mock database lives in localStorage (`fc:db:v1`); Settings → "إعادة ضبط البيانات التجريبية" resets it.
