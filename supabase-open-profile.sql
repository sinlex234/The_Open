-- The Open One: profile (photo, name, bio), activity for badges, and the avatar bucket.
-- Run once in Supabase: SQL Editor, paste, Run. Safe to run again. Uses only new open_* tables (nothing Crema uses).

-- Profile: what people choose to show
create table if not exists public.open_user_profile (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  bio text check (char_length(bio) <= 280),
  avatar_url text check (char_length(avatar_url) <= 500),
  showcase text[] not null default '{}' check (cardinality(showcase) <= 3),
  updated_at timestamptz not null default now()
);
alter table public.open_user_profile enable row level security;
drop policy if exists "read own profile" on public.open_user_profile;
create policy "read own profile" on public.open_user_profile for select using (auth.uid() = user_id);
drop policy if exists "insert own profile" on public.open_user_profile;
create policy "insert own profile" on public.open_user_profile for insert with check (auth.uid() = user_id);
drop policy if exists "update own profile" on public.open_user_profile;
create policy "update own profile" on public.open_user_profile for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per day someone uses the site (New York date), for streak and "days active" badges
create table if not exists public.open_activity (
  user_id uuid references auth.users on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.open_activity enable row level security;
-- Earliest New York minute you were on the site that day (for "ready before your session" badges)
alter table public.open_activity add column if not exists first_mins smallint;
drop policy if exists "read own activity" on public.open_activity;
create policy "read own activity" on public.open_activity for select using (auth.uid() = user_id);

-- Mark today as active (only today, only for yourself)
create or replace function public.open_touch() returns void
language sql volatile security definer set search_path = public as $$
  insert into public.open_activity (user_id, day, first_mins)
  select auth.uid(), (now() at time zone 'America/New_York')::date,
    (extract(hour from now() at time zone 'America/New_York') * 60 + extract(minute from now() at time zone 'America/New_York'))::smallint
  where auth.uid() is not null
  on conflict (user_id, day) do update set first_mins = least(coalesce(public.open_activity.first_mins, excluded.first_mins), excluded.first_mins)
$$;
revoke all on function public.open_touch() from public, anon;
grant execute on function public.open_touch() to authenticated;

-- Your stats for badges
create or replace function public.open_my_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  cur int := 0; best int := 0; run int := 0; prev date := null; d date;
begin
  if uid is null then return null; end if;
  for d in select day from public.open_activity where user_id = uid order by day loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    best := greatest(best, run); prev := d;
  end loop;
  -- current streak counts if the last active day is today or yesterday
  if prev is not null and prev >= today - 1 then cur := run; end if;
  return json_build_object(
    'days_active', (select count(*) from public.open_activity where user_id = uid),
    'first_mins', coalesce((select json_agg(first_mins) from (select first_mins from public.open_activity where user_id = uid and first_mins is not null order by day desc limit 365) x), '[]'::json),
    'streak', cur,
    'best_streak', best,
    'first_seen', (select min(day) from public.open_activity where user_id = uid),
    'joined', (select created_at from auth.users where id = uid),
    'ai_reads', coalesce((select sum(n) from public.open_ai_usage where user_id = uid), 0),
    'tier', public.open_tier(uid),
    'lifetime', coalesce((select lifetime from public.open_plans where user_id = uid), false),
    'admin', public.open_is_admin()
  );
end $$;
revoke all on function public.open_my_stats() from public, anon;
grant execute on function public.open_my_stats() to authenticated;

-- Profile photos: public to view, 2 MB max, images only. Each person can only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('open-avatars', 'open-avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
drop policy if exists "open avatars read" on storage.objects;
create policy "open avatars read" on storage.objects for select using (bucket_id = 'open-avatars');
drop policy if exists "open avatars upload own" on storage.objects;
create policy "open avatars upload own" on storage.objects for insert to authenticated with check (bucket_id = 'open-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "open avatars update own" on storage.objects;
create policy "open avatars update own" on storage.objects for update to authenticated using (bucket_id = 'open-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "open avatars delete own" on storage.objects;
create policy "open avatars delete own" on storage.objects for delete to authenticated using (bucket_id = 'open-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
