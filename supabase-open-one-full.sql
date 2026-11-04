-- The Open One: complete database setup for its own Supabase project.
-- Run once: SQL Editor -> New query -> paste -> Run. Safe to run again.
-- Covers accounts/usernames, setup answers, calls and live-read history, reports,
-- plans and lifetime codes, the AI meter, profiles and badges, avatars, and the 5-minute live read.

-- ---------- Usernames (The Open One's own; nothing shared with any other project) ----------
create table if not exists public.open_usernames (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  created_at timestamptz not null default now()
);
alter table public.open_usernames enable row level security;
drop policy if exists "open_usernames: read own" on public.open_usernames;
create policy "open_usernames: read own" on public.open_usernames for select using (auth.uid() = user_id);

-- Save the username chosen at sign-up (Google sign-ups have none, and that's fine)
create or replace function public.open_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if u ~ '^[a-z0-9_]{3,20}$' then
    insert into public.open_usernames (user_id, username) values (new.id, u) on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists open_on_new_user on auth.users;
create trigger open_on_new_user after insert on auth.users for each row execute function public.open_new_user();

create or replace function public.username_available(uname text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(uname) ~ '^[a-z0-9_]{3,20}$' and not exists (select 1 from public.open_usernames where username = lower(uname))
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Sign in with a username: turns it into the account email
create or replace function public.email_for_username(uname text) returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email from public.open_usernames n join auth.users u on u.id = n.user_id where n.username = lower(uname)
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- ---------- Setup answers, calls, reports, live read ----------
create table if not exists public.open_profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.open_profiles enable row level security;
drop policy if exists "open_profiles: own row" on public.open_profiles;
create policy "open_profiles: own row" on public.open_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Call tracker and mistake reports (added Oct 2026). Safe to run more than once. ----------
-- Every "Likely up / Likely down" call the site makes. Anyone can read them (the public scorecard).
-- New rows can only be added with the current time, so nobody can back-date a call.
create table if not exists public.open_calls (
  id         bigint generated always as identity primary key,
  story_id   text not null check (char_length(story_id) <= 120),
  market     text not null check (market in ('NQ', 'BTC', 'EURUSD')),
  dir        text not null check (dir in ('up', 'down')),
  headline   text not null check (char_length(headline) <= 300),
  source     text check (char_length(source) <= 120),
  link       text check (char_length(link) <= 1000),
  outlets    int  not null default 1 check (outlets between 1 and 50),
  price      double precision,
  called_at  timestamptz not null default now(),
  unique (story_id, market)
);
alter table public.open_calls enable row level security;
drop policy if exists "open_calls: read" on public.open_calls;
create policy "open_calls: read" on public.open_calls for select using (true);
drop policy if exists "open_calls: add now" on public.open_calls;
create policy "open_calls: add now" on public.open_calls for insert
  with check (called_at between now() - interval '1 minute' and now() + interval '1 minute');
create index if not exists open_calls_time on public.open_calls (called_at desc);

-- "Report a mistake" messages from readers. Write-only: only you can read them (Table Editor).
create table if not exists public.open_reports (
  id         bigint generated always as identity primary key,
  headline   text check (char_length(headline) <= 300),
  link       text check (char_length(link) <= 1000),
  page       text check (char_length(page) <= 40),
  problem    text not null check (char_length(problem) between 3 and 1000),
  created_at timestamptz not null default now()
);
alter table public.open_reports enable row level security;
drop policy if exists "open_reports: add now" on public.open_reports;
create policy "open_reports: add now" on public.open_reports for insert
  with check (created_at between now() - interval '1 minute' and now() + interval '1 minute');

-- ---------- Live read (added Oct 29 2026). Safe to run more than once. ----------
-- One row per market per 5-minute check: the lean, its confidence and the price at that moment. Anyone can read them (Scorecard).
create table if not exists public.open_pulse (
  id       bigint generated always as identity primary key,
  market   text not null check (market in ('NQ', 'BTC', 'EURUSD')),
  slot     bigint not null,
  lean     text not null check (lean in ('up', 'down', 'none')),
  conf     text check (conf in ('low', 'medium')),
  score    double precision,
  price    double precision,
  note     text check (char_length(note) <= 400),
  engine   text check (engine in ('rules', 'ai')),
  read_at  timestamptz not null default now(),
  unique (market, slot)
);
alter table public.open_pulse enable row level security;
drop policy if exists "open_pulse: read" on public.open_pulse;
create policy "open_pulse: read" on public.open_pulse for select using (true);
drop policy if exists "open_pulse: add now" on public.open_pulse;
create policy "open_pulse: add now" on public.open_pulse for insert
  with check (read_at between now() - interval '1 minute' and now() + interval '1 minute'
    and slot between (extract(epoch from now()) * 1000)::bigint - 600000 and (extract(epoch from now()) * 1000)::bigint + 60000);
create index if not exists open_pulse_slot on public.open_pulse (slot desc);
grant select, insert on public.open_pulse to anon, authenticated;

-- Run the check every 5 minutes, even when nobody has the site open
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'open-one-live-read';
select cron.schedule('open-one-live-read', '*/5 * * * *',
  $$select net.http_get(url := 'https://the-open-one.vercel.app/api/data?fn=pulse&slot=' || floor(extract(epoch from now()) / 300)::bigint)$$);

-- ---------- Confidence levels and the session bias record (added Nov 2 2026). Safe to run more than once. ----------
-- The Live read can now be high confidence too
alter table public.open_pulse drop constraint if exists open_pulse_conf_check;
alter table public.open_pulse add constraint open_pulse_conf_check check (conf in ('low', 'medium', 'high'));

-- The "Your day" session bias, saved once a day at 9:30 New York and graded at the 4 PM close. Anyone can read it (Scorecard).
create table if not exists public.open_daybias (
  id        bigint generated always as identity primary key,
  day       date not null,
  market    text not null check (market in ('NQ', 'BTC', 'EURUSD')),
  call      text not null check (call in ('up', 'down')),
  conf      text not null check (conf in ('low', 'medium', 'high')),
  score     double precision,
  price     double precision,
  logged_at timestamptz not null default now(),
  unique (day, market)
);
alter table public.open_daybias enable row level security;
drop policy if exists "open_daybias: read" on public.open_daybias;
create policy "open_daybias: read" on public.open_daybias for select using (true);
drop policy if exists "open_daybias: add now" on public.open_daybias;
create policy "open_daybias: add now" on public.open_daybias for insert
  with check (logged_at between now() - interval '1 minute' and now() + interval '1 minute'
    and day = (now() at time zone 'America/New_York')::date);
grant select, insert on public.open_daybias to anon, authenticated;

-- ---------- Release calls: the site's up/down call after each big release, saved once and graded on the Scorecard ----------
create table if not exists public.open_relcalls (
  id          bigint generated always as identity primary key,
  event_key   text not null,
  title       text not null,
  kind        text not null,
  country     text not null,
  released_at timestamptz not null,
  actual      text,
  forecast    text,
  surprise    text not null check (surprise in ('up', 'down')),
  market      text not null check (market in ('NQ', 'BTC', 'EURUSD')),
  dir         text not null check (dir in ('up', 'down')),
  how         text not null check (how in ('rule', 'react')),
  price       double precision,
  called_at   timestamptz not null default now(),
  unique (event_key, market)
);
alter table public.open_relcalls enable row level security;
drop policy if exists "open_relcalls: read" on public.open_relcalls;
create policy "open_relcalls: read" on public.open_relcalls for select using (true);
drop policy if exists "open_relcalls: add now" on public.open_relcalls;
-- Only fresh calls: stamped now, for a release in the last 40 minutes (no back-dating)
create policy "open_relcalls: add now" on public.open_relcalls for insert
  with check (called_at between now() - interval '1 minute' and now() + interval '1 minute'
    and released_at between now() - interval '40 minutes' and now() + interval '1 minute');
grant select, insert on public.open_relcalls to anon, authenticated;

-- ---------- Plans, codes and the AI meter ----------
create extension if not exists pgcrypto with schema extensions;

-- Who has which plan. People can read only their own row; nobody can write it directly.
create table if not exists public.open_plans (
  user_id uuid primary key references auth.users on delete cascade,
  tier text not null check (tier in ('plus', 'pro')),
  source text not null check (source in ('stripe', 'code')),
  lifetime boolean not null default false,
  status text not null default 'active',
  period_end timestamptz,
  stripe_customer text,
  stripe_sub text,
  code_id bigint,
  updated_at timestamptz not null default now()
);
alter table public.open_plans enable row level security;
drop policy if exists "read own plan" on public.open_plans;
create policy "read own plan" on public.open_plans for select using (auth.uid() = user_id);

-- Lifetime codes. Only a hash is stored, so the table never holds a usable code. No policies: nobody reads it directly.
create table if not exists public.open_codes (
  id bigserial primary key,
  code_hash text unique not null,
  hint text not null,
  tier text not null default 'pro' check (tier in ('plus', 'pro')),
  note text,
  created_at timestamptz not null default now(),
  redeemed_by uuid references auth.users on delete set null,
  redeemed_at timestamptz,
  revoked boolean not null default false
);
alter table public.open_codes enable row level security;

-- Who can make and cancel codes (by sign-in email)
create table if not exists public.open_admins (email text primary key);
alter table public.open_admins enable row level security;
insert into public.open_admins (email) values ('alexpokhodun201@gmail.com'), ('sinlex46@gmail.com') on conflict do nothing;

-- AI uses per person per day (New York date)
create table if not exists public.open_ai_usage (
  user_id uuid references auth.users on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (user_id, day)
);
alter table public.open_ai_usage enable row level security;
drop policy if exists "read own usage" on public.open_ai_usage;
create policy "read own usage" on public.open_ai_usage for select using (auth.uid() = user_id);

-- Shared secret the website uses to report Stripe payments. Not readable by anyone through the API.
create table if not exists public.open_secrets (name text primary key, value text not null);
alter table public.open_secrets enable row level security;

-- ---------- helpers ----------
create or replace function public.open_tier(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((
    select tier from public.open_plans
    where user_id = uid and (lifetime or (status in ('active', 'trialing', 'past_due') and (period_end is null or period_end > now() - interval '2 days')))
  ), 'free')
$$;
revoke all on function public.open_tier(uuid) from public, anon, authenticated;

create or replace function public.open_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.open_admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;
revoke all on function public.open_is_admin() from public, anon;
grant execute on function public.open_is_admin() to authenticated;

create or replace function public.open_ai_limit(t text) returns int language sql immutable as $$
  select case t when 'pro' then 250 when 'plus' then 40 else 3 end
$$;

-- ---------- what the website calls ----------
-- Your plan, for the account menu and the Plans page
create or replace function public.open_my_plan() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'tier', public.open_tier(auth.uid()),
    'lifetime', coalesce(p.lifetime, false),
    'status', p.status,
    'period_end', p.period_end,
    'source', p.source,
    'has_billing', p.stripe_customer is not null,
    'used', coalesce((select n from public.open_ai_usage where user_id = auth.uid() and day = (now() at time zone 'America/New_York')::date), 0),
    'limit', public.open_ai_limit(public.open_tier(auth.uid())),
    'admin', public.open_is_admin()
  )
  from (select 1) x left join public.open_plans p on p.user_id = auth.uid()
$$;
revoke all on function public.open_my_plan() from public, anon;
grant execute on function public.open_my_plan() to authenticated;

-- Count one AI use (cost = how many uses it takes). Returns whether it's allowed, the plan and what's left today.
create or replace function public.open_use_ai(cost int default 1, need text default 'free') returns json
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t text;
  lim int;
  d date := (now() at time zone 'America/New_York')::date;
  used int;
begin
  if uid is null then return json_build_object('ok', false, 'why', 'signin'); end if;
  t := public.open_tier(uid);
  if (need = 'plus' and t = 'free') or (need = 'pro' and t <> 'pro') then
    return json_build_object('ok', false, 'why', 'tier', 'tier', t);
  end if;
  lim := public.open_ai_limit(t);
  insert into public.open_ai_usage (user_id, day, n) values (uid, d, 0) on conflict do nothing;
  select n into used from public.open_ai_usage where user_id = uid and day = d for update;
  if used + greatest(cost, 1) > lim then
    return json_build_object('ok', false, 'why', 'limit', 'tier', t, 'used', used, 'limit', lim);
  end if;
  update public.open_ai_usage set n = n + greatest(cost, 1) where user_id = uid and day = d;
  return json_build_object('ok', true, 'tier', t, 'used', used + greatest(cost, 1), 'limit', lim);
end $$;
revoke all on function public.open_use_ai(int, text) from public, anon;
grant execute on function public.open_use_ai(int, text) to authenticated;

-- Redeem a lifetime code
create or replace function public.open_redeem(code text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.open_codes;
  n text := upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'));
  h text;
begin
  if left(n, 4) <> 'OPEN' then n := 'OPEN' || n; end if;
  h := encode(extensions.digest(n, 'sha256'), 'hex');
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'Sign in first, then enter your code.'); end if;
  select * into c from public.open_codes where code_hash = h for update;
  if not found or c.revoked then return json_build_object('ok', false, 'why', 'That code doesn’t work. Check it and try again.'); end if;
  if c.redeemed_by is not null and c.redeemed_by <> auth.uid() then return json_build_object('ok', false, 'why', 'That code has already been used.'); end if;
  update public.open_codes set redeemed_by = auth.uid(), redeemed_at = coalesce(redeemed_at, now()) where id = c.id;
  insert into public.open_plans (user_id, tier, source, lifetime, status, code_id)
    values (auth.uid(), c.tier, 'code', true, 'active', c.id)
    on conflict (user_id) do update set tier = excluded.tier, source = 'code', lifetime = true, status = 'active', code_id = excluded.code_id, updated_at = now();
  return json_build_object('ok', true, 'tier', c.tier);
end $$;
revoke all on function public.open_redeem(text) from public, anon;
grant execute on function public.open_redeem(text) to authenticated;

-- Admin: make a code. The plain code is shown once and never stored.
create or replace function public.open_make_code(p_tier text default 'pro', p_note text default null) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  raw text := '';
  i int;
begin
  if not public.open_is_admin() then raise exception 'Not allowed'; end if;
  if p_tier not in ('plus', 'pro') then raise exception 'Plan must be plus or pro'; end if;
  for i in 0..11 loop raw := raw || substr(abc, (get_byte(b, i) % 32) + 1, 1); end loop;
  insert into public.open_codes (code_hash, hint, tier, note)
    values (encode(extensions.digest('OPEN' || raw, 'sha256'), 'hex'), right(raw, 4), p_tier, nullif(trim(p_note), ''));
  return 'OPEN-' || substr(raw, 1, 4) || '-' || substr(raw, 5, 4) || '-' || substr(raw, 9, 4);
end $$;
revoke all on function public.open_make_code(text, text) from public, anon;
grant execute on function public.open_make_code(text, text) to authenticated;

-- Admin: list codes (never the codes themselves, just the last 4 characters)
create or replace function public.open_list_codes() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.open_is_admin() then raise exception 'Not allowed'; end if;
  return coalesce((select json_agg(json_build_object('id', id, 'hint', hint, 'tier', tier, 'note', note, 'created_at', created_at,
    'used', redeemed_by is not null, 'used_at', redeemed_at, 'revoked', revoked) order by created_at desc) from public.open_codes), '[]'::json);
end $$;
revoke all on function public.open_list_codes() from public, anon;
grant execute on function public.open_list_codes() to authenticated;

-- Admin: cancel a code. Whoever used it loses the lifetime plan.
create or replace function public.open_revoke_code(p_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.open_is_admin() then raise exception 'Not allowed'; end if;
  update public.open_codes set revoked = true where id = p_id;
  delete from public.open_plans where code_id = p_id and source = 'code';
  return found;
end $$;
revoke all on function public.open_revoke_code(bigint) from public, anon;
grant execute on function public.open_revoke_code(bigint) to authenticated;

-- The website reports Stripe subscription changes here, proving itself with the shared secret.
-- A lifetime code always wins over a subscription.
create or replace function public.open_stripe_sync(secret text, uid uuid, p_tier text, p_status text, p_period_end timestamptz, p_customer text, p_sub text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if secret is null or secret <> (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  if p_tier not in ('plus', 'pro') then raise exception 'Bad plan'; end if;
  if exists (select 1 from public.open_plans where user_id = uid and lifetime) then
    update public.open_plans set stripe_customer = p_customer, updated_at = now() where user_id = uid;
    return true;
  end if;
  insert into public.open_plans (user_id, tier, source, lifetime, status, period_end, stripe_customer, stripe_sub)
    values (uid, p_tier, 'stripe', false, p_status, p_period_end, p_customer, p_sub)
    on conflict (user_id) do update set tier = excluded.tier, source = 'stripe', status = excluded.status, period_end = excluded.period_end,
      stripe_customer = excluded.stripe_customer, stripe_sub = excluded.stripe_sub, updated_at = now();
  return true;
end $$;
revoke all on function public.open_stripe_sync(text, uuid, text, text, timestamptz, text, text) from public;
grant execute on function public.open_stripe_sync(text, uuid, text, text, timestamptz, text, text) to anon, authenticated;

-- The website looks up who a Stripe customer is, for billing management
create or replace function public.open_my_customer() returns text
language sql stable security definer set search_path = public as $$
  select stripe_customer from public.open_plans where user_id = auth.uid()
$$;
revoke all on function public.open_my_customer() from public, anon;
grant execute on function public.open_my_customer() to authenticated;


-- ---------- Profile, badges and avatars ----------
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

-- ---------- Moving over from the old project (one time) ----------
-- Holds each existing member's setup answers, profile, plan and active days by email.
-- The first time they sign in here (with that same confirmed email), it's restored and the row is removed.
create table if not exists public.open_carry (
  email    text primary key,
  username text,
  answers  jsonb,
  profile  jsonb,
  plan     jsonb,
  days     jsonb
);
alter table public.open_carry enable row level security;

create or replace function public.open_claim_carry() returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  em text;
  c public.open_carry;
begin
  if uid is null then return false; end if;
  select lower(email) into em from auth.users where id = uid and (email_confirmed_at is not null or confirmed_at is not null);
  if em is null then return false; end if;
  select * into c from public.open_carry where lower(email) = em for update;
  if not found then return false; end if;
  if c.username is not null and not exists (select 1 from public.open_usernames where user_id = uid) then
    insert into public.open_usernames (user_id, username) values (uid, c.username) on conflict do nothing;
  end if;
  if c.answers is not null then
    insert into public.open_profiles (user_id, answers) values (uid, c.answers) on conflict (user_id) do nothing;
  end if;
  if c.profile is not null then
    insert into public.open_user_profile (user_id, display_name, bio, showcase)
    values (uid, c.profile ->> 'display_name', c.profile ->> 'bio',
      coalesce(array(select jsonb_array_elements_text(c.profile -> 'showcase')), '{}'))
    on conflict (user_id) do nothing;
  end if;
  if c.plan is not null then
    insert into public.open_plans (user_id, tier, source, lifetime, status, period_end, stripe_customer, stripe_sub, code_id)
    values (uid, c.plan ->> 'tier', c.plan ->> 'source', coalesce((c.plan ->> 'lifetime')::boolean, false), coalesce(c.plan ->> 'status', 'active'),
      (c.plan ->> 'period_end')::timestamptz, c.plan ->> 'stripe_customer', c.plan ->> 'stripe_sub', (c.plan ->> 'code_id')::bigint)
    on conflict (user_id) do nothing;
    if (c.plan ->> 'code_id') is not null then
      update public.open_codes set redeemed_by = uid where id = (c.plan ->> 'code_id')::bigint;
    end if;
  end if;
  if c.days is not null then
    insert into public.open_activity (user_id, day, first_mins)
    select uid, (d ->> 'day')::date, (d ->> 'first_mins')::smallint from jsonb_array_elements(c.days) d
    on conflict do nothing;
  end if;
  delete from public.open_carry where email = c.email;
  return true;
end $$;
revoke all on function public.open_claim_carry() from public, anon;
grant execute on function public.open_claim_carry() to authenticated;

-- ---------- Stripe sync secret ----------
-- Makes a new random secret the first time only. To see it, run by itself:
--   select value from public.open_secrets where name = 'stripe_sync';
-- then paste it into Vercel as OPEN_SYNC_SECRET.
insert into public.open_secrets (name, value) values ('stripe_sync', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (name) do nothing;
