-- FitCircle v1.2: (1) admin access decided by e-mail only, (2) nutrition (meals + AI usage).
-- Safe to re-run. Apply AFTER 20261030_02_privacy_hardening_social.sql.

-- =====================================================================================
-- 1) ADMIN = a confirmed e-mail listed in fc_admin_emails (nothing else grants admin rights)
-- =====================================================================================
create table if not exists public.fc_admin_emails (
  email text primary key check (email = lower(btrim(email)))
);
alter table public.fc_admin_emails enable row level security;       -- no policies: invisible to every client
revoke all on public.fc_admin_emails from anon, authenticated;

-- Every RLS policy and the app call this function, so changing it here changes the whole system.
-- The e-mail must be CONFIRMED, otherwise anyone could sign up with the admin's address first.
create or replace function public.fc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from auth.users u
    join public.fc_admin_emails a on a.email = lower(btrim(u.email))
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and not coalesce((select p.suspended from public.fc_profiles p where p.id = u.id), false)
  );
$$;

-- Role / suspension can only be changed by an admin *session*. The SQL editor and the service role
-- (auth.uid() is null) are allowed, which also makes the README's "first admin" statement work.
create or replace function public.fc_guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.fc_is_admin()
     and (new.role is distinct from old.role or new.suspended is distinct from old.suspended) then
    raise exception 'not allowed to change role or suspension';
  end if;
  return new;
end $$;

-- =====================================================================================
-- 2) NUTRITION
-- =====================================================================================
alter table public.fc_profiles add column if not exists calorie_goal int;
alter table public.fc_profiles add column if not exists protein_goal int;
do $$ begin
  alter table public.fc_profiles add constraint fc_profiles_calorie_goal check (calorie_goal is null or calorie_goal between 800 and 6000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.fc_profiles add constraint fc_profiles_protein_goal check (protein_goal is null or protein_goal between 20 and 400);
exception when duplicate_object then null; end $$;

create table if not exists public.fc_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  date date not null default current_date,
  meal_type text not null default 'snack' check (meal_type in ('breakfast','lunch','dinner','snack')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  calories int not null default 0 check (calories between 0 and 5000),
  protein numeric not null default 0 check (protein between 0 and 300),
  carbs numeric not null default 0 check (carbs between 0 and 600),
  fat numeric not null default 0 check (fat between 0 and 300),
  items jsonb not null default '[]',                 -- [{name, grams, calories}]
  image text check (image is null or image ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/'),
  source text not null default 'manual' check (source in ('manual','ai')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists fc_meals_user_date_idx on public.fc_meals (user_id, date);
alter table public.fc_meals enable row level security;
drop policy if exists meals_own on public.fc_meals;
create policy meals_own on public.fc_meals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.fc_not_suspended());
drop policy if exists meals_admin_delete on public.fc_meals;
create policy meals_admin_delete on public.fc_meals for delete to authenticated using (public.fc_is_admin());

-- one row per AI call (written only by the Edge Function with the service role) -> daily limit
create table if not exists public.fc_ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists fc_ai_usage_idx on public.fc_ai_usage (user_id, kind, created_at desc);
alter table public.fc_ai_usage enable row level security;      -- no policies: service role only
revoke all on public.fc_ai_usage from anon, authenticated;
