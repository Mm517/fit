-- Removes every Krusty Burger (restaurant) object from the shared project. FitCircle (fc_*) objects and auth.users rows are untouched.
-- Applied to project cijujqhxdjpvuyzbxedf on 2026-10-30. (Order matters: tables first, because their policies depend on is_staff().)
drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.orders cascade;
drop table if exists public.menu_extras cascade;
drop table if exists public.menu_items cascade;
drop table if exists public.staff cascade;
drop table if exists public.profiles cascade;

drop function if exists public.place_order(jsonb);
drop function if exists public.get_order_status(text[]);
drop function if exists public.claim_admin();
drop function if exists public.request_staff();
drop function if exists public.is_staff(text);
drop function if exists public.handle_new_user();
