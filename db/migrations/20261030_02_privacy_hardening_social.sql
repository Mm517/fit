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
