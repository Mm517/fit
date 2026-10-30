-- FitCircle schema (all objects prefixed fc_). v1 tables first, then the v1.1 section at the bottom (private e-mail, hardening, follows, stories, messages, blocks).
-- The restaurant (Krusty Burger) objects that used to share this project were removed: see db/migrations/20261030_01_remove_krusty_burger.sql.
create extension if not exists "pgcrypto";

-- ---------- tables ----------
create table public.fc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  avatar text default '',
  goal text default '',
  role text not null default 'user' check (role in ('user','admin')),
  suspended boolean not null default false,
  weight numeric default 0,
  streak int not null default 0,
  last_workout date,
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now()
);

create table public.fc_exercises (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null, name_en text not null,
  muscle text not null check (muscle in ('صدر','ظهر','رجل','كتف','دراع','بطن')),
  equipment text not null check (equipment in ('جهاز','دمبل','بار','وزن الجسم')),
  difficulty text not null check (difficulty in ('سهل','متوسط','صعب')),
  sets int not null default 3, reps text not null default '12-10', duration int default 45,
  image text default '', steps jsonb not null default '[]',
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.fc_plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, goal text, days_count int not null default 3,
  days jsonb not null default '[]',            -- [{label, muscles[], exercise_ids[]}]
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fc_user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  name text, goal text,
  days jsonb not null default '[]',            -- [{dow, label, rest, items:[{exercise_id,sets,reps}]}]
  created_at timestamptz not null default now()
);

create table public.fc_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  exercise_id uuid references public.fc_exercises(id) on delete set null,
  date date not null default current_date,
  sets jsonb not null default '[]',            -- [{reps, weight}]
  calories int default 0,
  created_at timestamptz not null default now()
);
create index on public.fc_workout_logs (user_id, date);

create table public.fc_alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  time text not null check (time ~ '^\d{2}:\d{2}$'),
  days int[] not null default '{}',            -- JS getDay(): 0=Sun … 6=Sat
  label text default '', enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.fc_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  body text not null, image text, hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.fc_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.fc_posts(id) on delete cascade,
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
create table public.fc_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.fc_posts(id) on delete cascade,
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(), unique (post_id, user_id)
);
create table public.fc_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.fc_posts(id) on delete cascade,
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(), unique (post_id, user_id)
);
create table public.fc_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.fc_posts(id) on delete cascade,
  reporter_id uuid not null references public.fc_profiles(id) on delete cascade,
  reason text, status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), unique (post_id, reporter_id)
);

create table public.fc_coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  role text not null check (role in ('user','coach')), text text not null, card jsonb,
  created_at timestamptz not null default now()
);
create index on public.fc_coach_messages (user_id, created_at);
create table public.fc_coach_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  tool text not null, args jsonb, result jsonb, undo jsonb,
  status text not null default 'proposed' check (status in ('proposed','applied','undone','dismissed')),
  created_at timestamptz not null default now()
);

create table public.fc_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  target text not null default 'all',           -- 'all' or a user id
  status text not null default 'sent' check (status in ('sent','scheduled')),
  scheduled_at timestamptz, sent_at timestamptz,
  created_by uuid references public.fc_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.fc_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  endpoint text not null unique, keys jsonb not null,
  created_at timestamptz not null default now()
);
create table public.fc_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.fc_profiles(id) on delete set null,
  actor_name text, action text not null, target text, meta jsonb default '{}',
  created_at timestamptz not null default now()
);
create index on public.fc_audit_log (created_at desc);

-- key/value settings: id 'app' (brand, flags) and 'coach' (system prompt, tools, limits)
create table public.fc_app_settings (id text primary key, value jsonb not null default '{}');


-- ---------- helpers (all prefixed fc_: this DB is shared with the Krusty Burger restaurant app) ----------
create or replace function public.fc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fc_profiles p where p.id = auth.uid() and p.role = 'admin' and not p.suspended);
$$;

create or replace function public.fc_not_suspended() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select suspended from public.fc_profiles where id = auth.uid()), true);
$$;

-- No trigger on auth.users (it would also fire for restaurant customers and clash with the existing
-- handle_new_user). The app calls this RPC right after sign-in; it creates the FitCircle profile once.
create or replace function public.fc_ensure_profile(p_name text default null) returns public.fc_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_row public.fc_profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.fc_profiles (id, email, name)
  values (auth.uid(), v_email, coalesce(nullif(trim(p_name), ''), split_part(coalesce(v_email, 'user'), '@', 1)))
  on conflict (id) do nothing;
  select * into v_row from public.fc_profiles where id = auth.uid();
  return v_row;
end $$;
revoke execute on function public.fc_ensure_profile(text) from public, anon;
grant execute on function public.fc_ensure_profile(text) to authenticated;

-- non-admins can never change their own role / suspension
create or replace function public.fc_guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.fc_is_admin() and (new.role is distinct from old.role or new.suspended is distinct from old.suspended) then
    raise exception 'not allowed to change role or suspension';
  end if;
  return new;
end $$;
create trigger fc_guard_profile before update on public.fc_profiles for each row execute function public.fc_guard_profile_update();

-- coach settings WITHOUT the system prompt / provider config, readable by every signed-in user
create or replace function public.fc_coach_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select value - 'system_prompt' - 'provider_order' - 'models' from public.fc_app_settings where id = 'coach';
$$;
revoke execute on function public.fc_coach_public_settings() from public, anon;
grant execute on function public.fc_coach_public_settings() to authenticated;

-- ---------- Row Level Security ----------
alter table public.fc_profiles enable row level security;
alter table public.fc_exercises enable row level security;
alter table public.fc_plan_templates enable row level security;
alter table public.fc_user_plans enable row level security;
alter table public.fc_workout_logs enable row level security;
alter table public.fc_alarms enable row level security;
alter table public.fc_posts enable row level security;
alter table public.fc_comments enable row level security;
alter table public.fc_likes enable row level security;
alter table public.fc_saves enable row level security;
alter table public.fc_reports enable row level security;
alter table public.fc_coach_messages enable row level security;
alter table public.fc_coach_actions enable row level security;
alter table public.fc_notifications enable row level security;
alter table public.fc_push_subscriptions enable row level security;
alter table public.fc_audit_log enable row level security;
alter table public.fc_app_settings enable row level security;

-- profiles: signed-in users can see names/avatars (community). NOTE: this also exposes `email`;
-- for stricter privacy move email into a private table and keep only admin access to it.
create policy profiles_read on public.fc_profiles for select to authenticated using (true);
create policy profiles_update_own on public.fc_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.fc_profiles for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- exercises & templates: public read of published, admin-only write
create policy exercises_read on public.fc_exercises for select using (published or public.fc_is_admin());
create policy exercises_admin on public.fc_exercises for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());
create policy templates_read on public.fc_plan_templates for select using (published or public.fc_is_admin());
create policy templates_admin on public.fc_plan_templates for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- per-user private data: own rows only (+ admin read/delete for the dashboard)
do $$ declare t text; begin
  foreach t in array array['fc_user_plans','fc_workout_logs','fc_alarms','fc_coach_messages','fc_coach_actions','fc_push_subscriptions'] loop
    execute format('create policy %I_own on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_admin_read on public.%I for select to authenticated using (public.fc_is_admin())', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using (public.fc_is_admin())', t, t);
  end loop;
end $$;

-- community
create policy posts_read on public.fc_posts for select using (not hidden or user_id = auth.uid() or public.fc_is_admin());
create policy posts_insert on public.fc_posts for insert to authenticated with check (user_id = auth.uid() and public.fc_not_suspended());
create policy posts_update_own on public.fc_posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and hidden = false);
create policy posts_delete_own on public.fc_posts for delete to authenticated using (user_id = auth.uid());
create policy posts_admin on public.fc_posts for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());
create policy comments_read on public.fc_comments for select using (true);
create policy comments_insert on public.fc_comments for insert to authenticated with check (user_id = auth.uid() and public.fc_not_suspended());
create policy comments_delete_own on public.fc_comments for delete to authenticated using (user_id = auth.uid());
create policy comments_admin on public.fc_comments for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());
create policy likes_read on public.fc_likes for select using (true);
create policy likes_own on public.fc_likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saves_own on public.fc_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reports_insert on public.fc_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read_own on public.fc_reports for select to authenticated using (reporter_id = auth.uid() or public.fc_is_admin());
create policy reports_admin on public.fc_reports for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- notifications: users see sent broadcasts addressed to them; admins manage everything
create policy notif_read on public.fc_notifications for select to authenticated using (status = 'sent' and (target = 'all' or target = auth.uid()::text));
create policy notif_admin on public.fc_notifications for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- audit log: admin only (insert + read), never updatable
create policy audit_admin_read on public.fc_audit_log for select to authenticated using (public.fc_is_admin());
create policy audit_admin_insert on public.fc_audit_log for insert to authenticated with check (public.fc_is_admin());

-- settings: 'app' is public (brand color/name), 'coach' (contains the system prompt) is admin-only
create policy settings_read_app on public.fc_app_settings for select using (id = 'app');
create policy settings_admin on public.fc_app_settings for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());


-- ---------- storage: bucket 'fitcircle-media' (public read, 5MB, images only, users write only inside their own folder) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fitcircle-media', 'fitcircle-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy fc_media_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'fitcircle-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy fc_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'fitcircle-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.fc_is_admin()));
create policy fc_media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'fitcircle-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.fc_is_admin()));

-- ---------- default settings ----------
insert into public.fc_app_settings (id, value) values
 ('app', '{"name":"FitCircle","tagline":"معاً نحو نسخة أفضل منك","logo":"","brand_color":"#C6FF3D","flags":{"community":true,"coach":true,"alarms":true,"signups":true,"maintenance":false}}'),
 ('coach', '{"system_prompt":"أنت المدرب، مدرب لياقة ودود يتحدث العربية بالعامية المصرية. استخدم الأدوات المتاحة فقط.","provider_order":["openrouter","gemini"],"models":{},"tools":{"create_plan":true,"edit_plan":true,"set_alarm":true,"log_workout":true,"swap_exercise":true,"create_post":true},"confirm":{"create_plan":true,"edit_plan":false,"set_alarm":false,"log_workout":false,"swap_exercise":false,"create_post":true},"daily_limit":30}')
on conflict (id) do nothing;


-- ======================================================================================
-- v1.1 (2026-10-30): everything below is db/migrations/20261030_02_privacy_hardening_social.sql
-- ======================================================================================
-- FitCircle v1.1: private e-mail table, hardening, blocks, follows, stories, direct messages.
-- Applied to project cijujqhxdjpvuyzbxedf on 2026-10-30 (run AFTER schema.fc.sql on a fresh project).

-- =====================================================================================
-- 1) PRIVATE EMAIL: moved out of fc_profiles into an owner/admin-only table
-- =====================================================================================
create table public.fc_profile_private (
  id uuid primary key references public.fc_profiles(id) on delete cascade,
  email text
);
alter table public.fc_profile_private enable row level security;
create policy private_read on public.fc_profile_private for select to authenticated
  using (id = auth.uid() or public.fc_is_admin());
-- no insert/update/delete policies: only fc_ensure_profile() (security definer) writes this table.

alter table public.fc_profiles drop column email;

create or replace function public.fc_ensure_profile(p_name text default null) returns public.fc_profiles
language plpgsql security definer set search_path = public as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_row public.fc_profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.fc_profiles (id, name)
  values (auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'عضو ' || substr(auth.uid()::text, 1, 4)), 40))
  on conflict (id) do nothing;
  insert into public.fc_profile_private (id, email) values (auth.uid(), v_email)
  on conflict (id) do update set email = excluded.email;
  select * into v_row from public.fc_profiles where id = auth.uid();
  return v_row;
end $$;
revoke execute on function public.fc_ensure_profile(text) from public, anon;
grant execute on function public.fc_ensure_profile(text) to authenticated;

-- =====================================================================================
-- 2) HARDENING
-- =====================================================================================
-- anonymous visitors get no table access at all, except the public brand settings row
revoke all on all tables in schema public from anon;
grant select on public.fc_app_settings to anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- helper functions: signed-in only (policies that call them are now TO authenticated)
revoke execute on function public.fc_is_admin() from public, anon;
revoke execute on function public.fc_not_suspended() from public, anon;
grant execute on function public.fc_is_admin() to authenticated;
grant execute on function public.fc_not_suspended() to authenticated;
revoke execute on function public.fc_guard_profile_update() from public, anon, authenticated;
revoke execute on function public.fc_coach_public_settings() from public, anon;

drop policy if exists exercises_read on public.fc_exercises;
create policy exercises_read on public.fc_exercises for select to authenticated using (published or public.fc_is_admin());
drop policy if exists templates_read on public.fc_plan_templates;
create policy templates_read on public.fc_plan_templates for select to authenticated using (published or public.fc_is_admin());
drop policy if exists posts_read on public.fc_posts;
create policy posts_read on public.fc_posts for select to authenticated using (not hidden or user_id = auth.uid() or public.fc_is_admin());
-- comments / likes are only visible together with a post the viewer may see (hidden posts hide their comments)
drop policy if exists comments_read on public.fc_comments;
create policy comments_read on public.fc_comments for select to authenticated using (exists (select 1 from public.fc_posts p where p.id = post_id));
drop policy if exists likes_read on public.fc_likes;
create policy likes_read on public.fc_likes for select to authenticated using (exists (select 1 from public.fc_posts p where p.id = post_id));

-- audit log: an admin can only write entries in their own name
drop policy if exists audit_admin_insert on public.fc_audit_log;
create policy audit_admin_insert on public.fc_audit_log for insert to authenticated with check (public.fc_is_admin() and actor_id = auth.uid());

-- input limits + user images may only point at our own public bucket
-- (replace the project ref below if you deploy to another Supabase project)
alter table public.fc_profiles add constraint fc_profiles_name_len check (char_length(name) between 1 and 40);
alter table public.fc_profiles add constraint fc_profiles_goal_len check (char_length(coalesce(goal, '')) <= 80);
alter table public.fc_profiles add constraint fc_profiles_avatar_url check (avatar is null or avatar = '' or avatar like 'assets/img/%' or avatar ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/');
alter table public.fc_posts add constraint fc_posts_body_len check (char_length(body) <= 500);
alter table public.fc_posts add constraint fc_posts_image_url check (image is null or image ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/');
alter table public.fc_comments add constraint fc_comments_body_len check (char_length(btrim(body)) between 1 and 300);

-- =====================================================================================
-- 3) BLOCKS
-- =====================================================================================
create table public.fc_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.fc_profiles(id) on delete cascade,
  blocked_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
alter table public.fc_blocks enable row level security;
create policy blocks_own on public.fc_blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create or replace function public.fc_is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.fc_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;
revoke execute on function public.fc_is_blocked(uuid, uuid) from public, anon;
grant execute on function public.fc_is_blocked(uuid, uuid) to authenticated;

-- block = insert the block and cut the follow relationship in both directions
create or replace function public.fc_block_user(p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_target = auth.uid() then raise exception 'cannot block yourself'; end if;
  insert into public.fc_blocks (blocker_id, blocked_id) values (auth.uid(), p_target) on conflict do nothing;
  delete from public.fc_follows where (follower_id = auth.uid() and followee_id = p_target) or (follower_id = p_target and followee_id = auth.uid());
end $$;
revoke execute on function public.fc_block_user(uuid) from public, anon;
grant execute on function public.fc_block_user(uuid) to authenticated;

-- =====================================================================================
-- 4) FOLLOWS
-- =====================================================================================
create table public.fc_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.fc_profiles(id) on delete cascade,
  followee_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followee_id), check (follower_id <> followee_id)
);
create index fc_follows_followee_idx on public.fc_follows (followee_id);
alter table public.fc_follows enable row level security;
create policy follows_read on public.fc_follows for select to authenticated using (true);
create policy follows_insert on public.fc_follows for insert to authenticated
  with check (follower_id = auth.uid() and public.fc_not_suspended() and not public.fc_is_blocked(follower_id, followee_id));
create policy follows_delete on public.fc_follows for delete to authenticated using (follower_id = auth.uid());
create policy follows_admin on public.fc_follows for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());

-- =====================================================================================
-- 5) STORIES (24h)
-- =====================================================================================
create table public.fc_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  image text not null check (image ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/'),
  caption text check (caption is null or char_length(caption) <= 140),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index fc_stories_user_idx on public.fc_stories (user_id, created_at desc);
create index fc_stories_exp_idx on public.fc_stories (expires_at);
alter table public.fc_stories enable row level security;
create policy stories_read on public.fc_stories for select to authenticated
  using ((not hidden and expires_at > now() and not public.fc_is_blocked(user_id, auth.uid())) or user_id = auth.uid() or public.fc_is_admin());
create policy stories_insert on public.fc_stories for insert to authenticated with check (user_id = auth.uid() and public.fc_not_suspended());
create policy stories_delete_own on public.fc_stories for delete to authenticated using (user_id = auth.uid());
create policy stories_admin on public.fc_stories for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());
-- clients may only choose who/what/caption; expiry, hidden flag and timestamps are server-controlled
revoke insert, update on public.fc_stories from authenticated;
grant insert (user_id, image, caption) on public.fc_stories to authenticated;

create table public.fc_story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.fc_stories(id) on delete cascade,
  viewer_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);
create index fc_story_views_viewer_idx on public.fc_story_views (viewer_id);
alter table public.fc_story_views enable row level security;
create policy story_views_read on public.fc_story_views for select to authenticated
  using (viewer_id = auth.uid() or exists (select 1 from public.fc_stories s where s.id = story_id and s.user_id = auth.uid()));
create policy story_views_insert on public.fc_story_views for insert to authenticated
  with check (viewer_id = auth.uid() and exists (select 1 from public.fc_stories s where s.id = story_id));
revoke update on public.fc_story_views from authenticated;

-- =====================================================================================
-- 6) DIRECT MESSAGES (1:1, private: only sender + recipient can read; admins cannot)
-- =====================================================================================
create table public.fc_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.fc_profiles(id) on delete cascade,
  recipient_id uuid not null references public.fc_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index fc_messages_recipient_idx on public.fc_messages (recipient_id, created_at desc);
create index fc_messages_sender_idx on public.fc_messages (sender_id, created_at desc);
alter table public.fc_messages enable row level security;
create policy messages_read on public.fc_messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy messages_insert on public.fc_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.fc_not_suspended() and not public.fc_is_blocked(sender_id, recipient_id));
create policy messages_mark_read on public.fc_messages for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy messages_delete_own on public.fc_messages for delete to authenticated using (sender_id = auth.uid());
-- the only column a recipient may change is read_at; senders choose only recipient + body
revoke insert, update on public.fc_messages from authenticated;
grant insert (sender_id, recipient_id, body) on public.fc_messages to authenticated;
grant update (read_at) on public.fc_messages to authenticated;
