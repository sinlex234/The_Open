-- The Open One: run once in your Supabase project (SQL Editor → New query → paste → Run).
-- It stores each person's setup answers. Accounts, usernames and Google sign-in come from the profiles setup.
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
