-- FitCircle v1.3: lightweight video (reels + video stories). Every upload is converted in the browser first
-- (images -> WebP, videos -> small WebM/MP4), so the bucket only needs a bigger cap and two video MIME types.

-- 1) Storage: images (webp/jpeg/png/gif) + compressed video (webm/mp4), 25 MB per file
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/webm','video/mp4']
where id = 'fitcircle-media';

-- 2) Stories may carry a video; `image` stays NOT NULL and holds the WebP poster frame of the video
alter table public.fc_stories add column if not exists video text;
alter table public.fc_stories drop constraint if exists fc_stories_video_url;
alter table public.fc_stories add constraint fc_stories_video_url
  check (video is null or video ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/');
grant insert (video) on public.fc_stories to authenticated;

-- 3) Reels (short vertical videos shown on the profile)
create table if not exists public.fc_reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  video text not null check (video ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/'),
  poster text check (poster is null or poster ~ '^https://cijujqhxdjpvuyzbxedf\.supabase\.co/storage/v1/object/public/fitcircle-media/'),
  caption text check (caption is null or char_length(caption) <= 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists fc_reels_user_idx on public.fc_reels (user_id, created_at desc);
create index if not exists fc_reels_created_idx on public.fc_reels (created_at desc);
alter table public.fc_reels enable row level security;
create policy reels_read on public.fc_reels for select to authenticated
  using ((not hidden and not public.fc_is_blocked(user_id, auth.uid())) or user_id = auth.uid() or public.fc_is_admin());
create policy reels_insert on public.fc_reels for insert to authenticated
  with check (user_id = auth.uid() and public.fc_not_suspended());
create policy reels_delete_own on public.fc_reels for delete to authenticated using (user_id = auth.uid());
create policy reels_admin on public.fc_reels for all to authenticated using (public.fc_is_admin()) with check (public.fc_is_admin());
-- clients choose only who/what/caption; hidden + timestamps are server-controlled
revoke insert, update on public.fc_reels from authenticated;
grant insert (user_id, video, poster, caption) on public.fc_reels to authenticated;

create table if not exists public.fc_reel_likes (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.fc_reels(id) on delete cascade,
  user_id uuid not null references public.fc_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (reel_id, user_id)
);
alter table public.fc_reel_likes enable row level security;
create policy reel_likes_read on public.fc_reel_likes for select to authenticated
  using (exists (select 1 from public.fc_reels r where r.id = reel_id));
create policy reel_likes_insert on public.fc_reel_likes for insert to authenticated
  with check (user_id = auth.uid() and public.fc_not_suspended() and exists (select 1 from public.fc_reels r where r.id = reel_id));
create policy reel_likes_delete on public.fc_reel_likes for delete to authenticated using (user_id = auth.uid());
revoke update on public.fc_reel_likes from authenticated;

-- 4) Maintenance flag was ON and blocked the coach + nutrition functions: make sure both services are enabled
update public.fc_app_settings
set value = jsonb_set(jsonb_set(value, '{flags,maintenance}', 'false'::jsonb, true), '{flags,nutrition}', 'true'::jsonb, true)
where id = 'app';
