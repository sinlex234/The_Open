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
