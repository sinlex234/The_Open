-- The Open One: run once in your Crema Supabase project (SQL Editor → New query → paste → Run).
-- It stores each person's setup answers. Accounts, usernames and Google sign-in are shared with Crema.
create table if not exists public.open_profiles (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.open_profiles enable row level security;
drop policy if exists "open_profiles: own row" on public.open_profiles;
create policy "open_profiles: own row" on public.open_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
