# FitCircle (فِت سيركل)

> **v1.2** — desktop layout (sidebar + wide pages), new messenger (list | thread), **Nutrition** (AI meal analysis from photos), admin tied to a single confirmed e-mail in Supabase. Migration: `db/migrations/20261030_03_admin_email_nutrition.sql` (already applied). Edge Function `nutrition` (already deployed).

Arabic RTL, mobile-first PWA — gym community (posts, **stories, follow, direct messages**) + workout tracker + AI coach that acts inside the app — plus a desktop Admin dashboard. Vanilla HTML/CSS/JS (ES modules), no build step.

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
  ui/    icons.js kit.js nav.js install.js people.js (member list/search) stories.js (viewer + add story)      pages/ user screens (user.js = public profile · messages.js = inbox · chat.js)      admin/ dashboard
db/schema.fc.sql        Supabase tables (fc_*) + RLS + storage policies   (v1 + v1.1 section, already applied)
db/migrations/          the exact SQL applied on 2026-10-30: 01 remove restaurant · 02 privacy + hardening + social
db/schema.sql           legacy generic schema, NOT used (has a public e-mail column — do not run it)
supabase/functions/coach  Edge Function: OpenRouter + Gemini (the AI keys live only here)
```

## Backend: Supabase (project `krustyburger`, already connected)
`js/config.js` points at the **krustyburger** project (`ADAPTER:'supabase'`). The project name is historical: the restaurant app's tables,
functions and `auth.users` trigger were **removed** (`db/migrations/20261030_01_…`), so it now only contains FitCircle. Every table/function keeps the
`fc_` prefix and the adapter adds it automatically. Open the app with `?mock` to run the offline mock backend instead.

- **Profiles**: no trigger on `auth.users`; the app calls `fc_ensure_profile()` right after sign-in.
- **E-mail privacy**: e-mails are **not** in `fc_profiles` any more. They live in `fc_profile_private` (readable only by the owner and admins, written only by `fc_ensure_profile`). Admin screens merge them in (`withEmails()` in `api.js`).
- **First admin**: sign up in the app, then in the SQL editor:
  `update public.fc_profiles set role='admin' where id = (select id from auth.users where email='you@example.com');`
- **Storage**: public bucket `fitcircle-media` (5 MB, JPG/PNG/WEBP/GIF). Users can only write to `<their user id>/…`; admins can delete anything. Story / post / avatar URLs must point at this bucket (CHECK constraints).
- **Exercises / templates**: seeded (18 exercises, 5 plan templates); manage them from the admin dashboard.

## Social features (v1.1)
| Feature | Where | Rules (enforced by RLS, not by the UI) |
|---|---|---|
| **Stories** (24 h, image + caption) | Community → top row; "+" on your own bubble | visible to every signed-in user; `expires_at`/`hidden` are server-side (clients can't extend a story); owner sees who viewed and can delete; admins can hide/delete |
| **Public profile** | tap any avatar/name (post, comment, story, "top streaks", search) → `#/user/<id>` | shows name, goal, streak, counts, posts. Workout logs, alarms, e-mail are private |
| **Follow / unfollow** | public profile; counts + lists on both profiles | can't follow yourself, a blocked user, or when suspended |
| **Direct messages** | profile → «رسالة», inbox `#/messages`, chat `#/chat/<id>` | only sender + recipient can read (admins can't); recipient can only set `read_at`; sender can delete own messages; blocked/suspended can't send. Chat polls every 4 s |
| **Block** | profile → ⋯ | removes follows both ways, stops messages, hides your stories from them |
| **Find members** | Community → 🔍 | name search, hides suspended + blocked |

## AI coach
`sendToCoach(message)` is the single entry point. Mock mode uses a rule-based Egyptian-Arabic parser ("صحّيني 6", "اعملّي جدول 4 أيام", "بدّل تمرين الصدر", "سجل بنش 3×10 60 كيلو", "تراجع"). With Supabase the `coach` Edge Function calls **OpenRouter** first and falls back to **Gemini** (order/models configurable); it returns `{text, tool_calls}` and the same tool layer executes them. If both providers fail the app silently falls back to the rule-based parser. Each call is stored in `coach_actions` with an undo snapshot; replacing the whole plan needs confirmation; admins can disable tools / force confirmation / set daily limits.

## AI setup (one-time, in Supabase Dashboard → Edge Functions → Secrets)
| Secret | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | one of the two | primary provider |
| `GEMINI_API_KEY` | one of the two | fallback (Google AI Studio key) |
| `OPENROUTER_MODEL` | no | default `google/gemini-2.5-flash` |
| `GEMINI_MODEL` | no | default `gemini-2.5-flash` |
| `AI_PROVIDER_ORDER` | no | default `openrouter,gemini` |

Per-project overrides live in `fc_app_settings` row `coach` (`provider_order`, `models`, `system_prompt`, `daily_limit`, tool switches).
The function checks the caller's session, suspension, the admin switches and a server-side daily limit before spending any tokens.

## Known limits
- Alarms: a web page cannot wake a sleeping phone. They ring while the app/tab is alive (sound + wake screen + repeating notification every 2 min with صحيت / غفوة actions); reliable background ringing needs server Web Push. Settings → "توفير البطارية" explains the Android exclusion.
- Images are generated placeholders in `assets/img` (no real photos shipped); replace files of the same names.
- Other profile columns (weight, goal, streak, last_active, role) are still readable by signed-in users (the community needs name/avatar/goal/streak). The public profile screen only displays the safe ones; move `weight`/`last_active` to `fc_profile_private` if you want them hidden at the database level too.
- Expired stories are hidden by RLS but their rows and image files stay until cleaned up (no cron is enabled on this project). Delete rows where `expires_at < now() - interval '7 days'` and the matching files in the `fitcircle-media` bucket from the dashboard / a scheduled Edge Function.
- Dashboard setting that SQL can't change: **Auth → Passwords → "Leaked password protection"** (HaveIBeenPwned check; Pro plan feature).
- Supabase's linter still lists `fc_is_admin`, `fc_not_suspended`, `fc_is_blocked` (needed by the RLS policies) and the RPCs the app calls (`fc_ensure_profile`, `fc_block_user`, `fc_coach_public_settings`) as "signed-in users can execute a SECURITY DEFINER function". That is intentional; anonymous access to all of them is revoked.
- Mock database lives in localStorage (`fc:db:v1`); Settings → "إعادة ضبط البيانات التجريبية" resets it.

## v1.2 additions
- **Admin = e-mail only.** `fc_is_admin()` is true only for a *confirmed* e-mail listed in `fc_admin_emails` (invisible to every client). The `role` column is no longer trusted. The admin entry (Settings button + sidebar) is shown **only** to that account; other users who open `#/admin` are sent home. Make someone admin (SQL editor):
  `insert into public.fc_admin_emails(email) values (lower('you@example.com'));`  — remove with `delete from public.fc_admin_emails where email = '...'`.
- **Nutrition** `#/nutrition`: daily calories/macros vs goal, meal diary (`fc_meals`), 7-day chart, **AI analysis of a meal photo and/or text**, and a nutrition chat that also accepts photos. Images are resized to ≤1024 px in the browser. Edge Function `supabase/functions/nutrition` (same secrets as `coach`; per-user daily limit `nutrition_daily_limit`, default 40, editable in Admin → المدرب الذكي; switch `flags.nutrition` in Admin → الإعدادات). In `?mock` mode text descriptions use a small local food table; photos need the real AI.
- **Desktop (≥900 px)**: right sidebar navigation, wide pages, 2-column home/nutrition, bottom sheets become centered dialogs. Phones keep the bottom bar.
- **Messenger**: `ui/inbox.js` (conversation list, search, unread badges) + `pages/chat.js` (day separators, grouped bubbles, pinned auto-growing composer, Enter to send).
