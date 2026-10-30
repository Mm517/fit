-- =====================================================================================
-- FitCircle — Supabase schema (DO NOT RUN automatically; review, then run in the SQL editor
-- or `supabase db push`). Table/column names match js/data/mock.js + seed.js exactly.
-- Security model: Row Level Security everywhere. Users touch only their own rows; published
-- exercises/templates and visible posts are public-read; admin-only writes use is_admin().
-- The AI provider key lives ONLY in the `coach` Edge Function secrets — never in the frontend.
-- =====================================================================================
create extension if not exists "pgcrypto";

-- ---------- tables ----------
create table public.profiles (
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

create table public.exercises (
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

create table public.plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null, goal text, days_count int not null default 3,
  days jsonb not null default '[]',            -- [{label, muscles[], exercise_ids[]}]
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text, goal text,
  days jsonb not null default '[]',            -- [{dow, label, rest, items:[{exercise_id,sets,reps}]}]
  created_at timestamptz not null default now()
);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  date date not null default current_date,
  sets jsonb not null default '[]',            -- [{reps, weight}]
  calories int default 0,
  created_at timestamptz not null default now()
);
create index on public.workout_logs (user_id, date);

create table public.alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  time text not null check (time ~ '^\d{2}:\d{2}$'),
  days int[] not null default '{}',            -- JS getDay(): 0=Sun … 6=Sat
  label text default '', enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null, image text, hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null, created_at timestamptz not null default now()
);
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), unique (post_id, user_id)
);
create table public.saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), unique (post_id, user_id)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text, status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default now(), unique (post_id, reporter_id)
);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','coach')), text text not null, card jsonb,
  created_at timestamptz not null default now()
);
create index on public.coach_messages (user_id, created_at);
create table public.coach_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool text not null, args jsonb, result jsonb, undo jsonb,
  status text not null default 'proposed' check (status in ('proposed','applied','undone','dismissed')),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  target text not null default 'all',           -- 'all' or a user id
  status text not null default 'sent' check (status in ('sent','scheduled')),
  scheduled_at timestamptz, sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique, keys jsonb not null,
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text, action text not null, target text, meta jsonb default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

-- key/value settings: id 'app' (brand, flags) and 'coach' (system prompt, tools, limits)
create table public.app_settings (id text primary key, value jsonb not null default '{}');

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and not p.suspended);
$$;

-- profile row is created automatically on sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- non-admins can never change their own role / suspension
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.role is distinct from old.role or new.suspended is distinct from old.suspended) then
    raise exception 'not allowed to change role or suspension';
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile_update();

-- coach settings WITHOUT the system prompt, readable by every signed-in user (tool switches + limits)
create or replace function public.coach_public_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select value - 'system_prompt' from public.app_settings where id = 'coach';
$$;
create or replace function public.not_suspended() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select suspended from public.profiles where id = auth.uid()), true);
$$;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.plan_templates enable row level security;
alter table public.user_plans enable row level security;
alter table public.workout_logs enable row level security;
alter table public.alarms enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.reports enable row level security;
alter table public.coach_messages enable row level security;
alter table public.coach_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_settings enable row level security;

-- profiles: signed-in users can see names/avatars (community). NOTE: this also exposes `email`;
-- for stricter privacy move email into a private table and keep only admin access to it.
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- exercises & templates: public read of published, admin-only write
create policy exercises_read on public.exercises for select using (published or public.is_admin());
create policy exercises_admin on public.exercises for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy templates_read on public.plan_templates for select using (published or public.is_admin());
create policy templates_admin on public.plan_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- per-user private data: own rows only (+ admin read/delete for the dashboard)
do $$ declare t text; begin
  foreach t in array array['user_plans','workout_logs','alarms','coach_messages','coach_actions','push_subscriptions'] loop
    execute format('create policy %I_own on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format('create policy %I_admin_read on public.%I for select to authenticated using (public.is_admin())', t, t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;

-- community
create policy posts_read on public.posts for select using (not hidden or user_id = auth.uid() or public.is_admin());
create policy posts_insert on public.posts for insert to authenticated with check (user_id = auth.uid() and public.not_suspended());
create policy posts_update_own on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and hidden = false);
create policy posts_delete_own on public.posts for delete to authenticated using (user_id = auth.uid());
create policy posts_admin on public.posts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy comments_read on public.comments for select using (true);
create policy comments_insert on public.comments for insert to authenticated with check (user_id = auth.uid() and public.not_suspended());
create policy comments_delete_own on public.comments for delete to authenticated using (user_id = auth.uid());
create policy comments_admin on public.comments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy likes_read on public.likes for select using (true);
create policy likes_own on public.likes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saves_own on public.saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reports_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read_own on public.reports for select to authenticated using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin on public.reports for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- notifications: users see sent broadcasts addressed to them; admins manage everything
create policy notif_read on public.notifications for select to authenticated using (status = 'sent' and (target = 'all' or target = auth.uid()::text));
create policy notif_admin on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- audit log: admin only (insert + read), never updatable
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());
create policy audit_admin_insert on public.audit_log for insert to authenticated with check (public.is_admin());

-- settings: 'app' is public (brand color/name), 'coach' (contains the system prompt) is admin-only
create policy settings_read_app on public.app_settings for select using (id = 'app');
create policy settings_admin on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- storage: public 'media' bucket for post / exercise / logo images ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_insert on storage.objects for insert to authenticated with check (bucket_id = 'media');
create policy media_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- ---------- seed (optional): default settings ----------
insert into public.app_settings (id, value) values
 ('app', '{"name":"FitCircle","tagline":"معاً نحو نسخة أفضل منك","logo":"","brand_color":"#C6FF3D","flags":{"community":true,"coach":true,"alarms":true,"signups":true,"maintenance":false}}'),
 ('coach', '{"system_prompt":"أنت المدرب، مدرب لياقة ودود يتحدث العربية. استخدم الأدوات المتاحة فقط.","tools":{"create_plan":true,"edit_plan":true,"set_alarm":true,"log_workout":true,"swap_exercise":true,"create_post":true},"confirm":{"create_plan":true,"edit_plan":false,"set_alarm":false,"log_workout":false,"swap_exercise":false,"create_post":true},"daily_limit":30}')
on conflict (id) do nothing;
-- To make the first admin:  update public.profiles set role = 'admin' where email = 'you@example.com';
