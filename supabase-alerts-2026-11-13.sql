-- The Open One: Smart alerts (Telegram now; email and SMS later).
-- Readers manage their own settings. Only the always-on watcher (with the server-only secret) can link a Telegram chat,
-- read everyone's settings to send alerts, and record what was sent. Telegram chat numbers are never shown to the public.

-- Each reader's settings
create table if not exists public.open_alert_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  types jsonb not null default '{"moves": true, "releases": true, "speeches": true, "memes": false}',
  release_opts jsonb not null default '{"pre": true, "result": true}',
  markets text[] not null default array['NQ', 'ES'],
  freq text not null default 'normal' check (freq in ('big', 'normal', 'all')),
  quiet_from int not null default 1380 check (quiet_from between 0 and 1439),
  quiet_to int not null default 420 check (quiet_to between 0 and 1439),
  tz text not null default 'America/New_York' check (length(tz) <= 64),
  weekend_crypto boolean not null default true,
  summary boolean not null default true,
  test_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.open_alert_prefs enable row level security;
drop policy if exists "alert prefs: own" on public.open_alert_prefs;
create policy "alert prefs: own" on public.open_alert_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.open_alert_prefs to authenticated;
revoke all on public.open_alert_prefs from anon;

-- Linked Telegram chats (written only by the watcher)
create table if not exists public.open_alert_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tg_chat bigint unique,
  tg_name text,
  muted jsonb not null default '{}',
  linked_at timestamptz not null default now()
);
alter table public.open_alert_links enable row level security;
drop policy if exists "alert links: own read" on public.open_alert_links;
create policy "alert links: own read" on public.open_alert_links for select to authenticated using (user_id = auth.uid());
drop policy if exists "alert links: own delete" on public.open_alert_links;
create policy "alert links: own delete" on public.open_alert_links for delete to authenticated using (user_id = auth.uid());
revoke all on public.open_alert_links from anon, authenticated;
grant select, delete on public.open_alert_links to authenticated;

-- One-time codes for the "Connect Telegram" button (10 minutes)
create table if not exists public.open_alert_codes (code text primary key, user_id uuid not null references auth.users(id) on delete cascade, expires timestamptz not null);
alter table public.open_alert_codes enable row level security;
revoke all on public.open_alert_codes from anon, authenticated;

-- What was sent (no repeats, daily limits); readers can see their own
create table if not exists public.open_alert_sent (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, t timestamptz not null default now(),
  kind text, title text);
create index if not exists open_alert_sent_user_t on public.open_alert_sent (user_id, t desc);
alter table public.open_alert_sent enable row level security;
drop policy if exists "alert sent: own read" on public.open_alert_sent;
create policy "alert sent: own read" on public.open_alert_sent for select to authenticated using (user_id = auth.uid());
revoke all on public.open_alert_sent from anon, authenticated;
grant select on public.open_alert_sent to authenticated;

-- A reader asks for a connect code
create or replace function public.open_alert_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.open_alert_codes where user_id = auth.uid() or expires < now();
  c := replace(gen_random_uuid()::text, '-', '');
  insert into public.open_alert_codes (code, user_id, expires) values (c, auth.uid(), now() + interval '10 minutes');
  return c;
end $$;
revoke all on function public.open_alert_code() from public, anon;
grant execute on function public.open_alert_code() to authenticated;

-- The watcher links a chat after the reader taps Start (one chat per account, one account per chat)
create or replace function public.open_alert_link(secret text, code text, chat bigint, name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  select user_id into uid from public.open_alert_codes where open_alert_codes.code = open_alert_link.code and expires > now();
  if uid is null then return false; end if;
  delete from public.open_alert_codes where user_id = uid;
  delete from public.open_alert_links where tg_chat = chat and user_id <> uid;
  insert into public.open_alert_links (user_id, tg_chat, tg_name, linked_at) values (uid, chat, left(name, 64), now())
    on conflict (user_id) do update set tg_chat = excluded.tg_chat, tg_name = excluded.tg_name, linked_at = now(), muted = '{}';
  insert into public.open_alert_prefs (user_id) values (uid) on conflict do nothing;
  return true;
end $$;

-- The watcher handles /stop and the "Mute today" button
create or replace function public.open_alert_chat(secret text, chat bigint, action text, mkt text default null, until timestamptz default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  if action = 'unlink' then delete from public.open_alert_links where tg_chat = chat; return true; end if;
  if action = 'mute' and mkt is not null and length(mkt) <= 12 then
    update public.open_alert_links set muted = muted || jsonb_build_object(mkt, until) where tg_chat = chat; return true; end if;
  if action = 'tested' then update public.open_alert_prefs set test_at = null where user_id = (select user_id from public.open_alert_links where tg_chat = chat); return true; end if;
  return false;
end $$;

-- Everyone the watcher may alert: linked chat, settings, plan, and how many alerts they've had in the last 24 hours
create or replace function public.open_alert_targets(secret text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  return coalesce((select json_agg(json_build_object(
    'user', l.user_id, 'chat', l.tg_chat, 'muted', l.muted,
    'tier', case when exists (select 1 from public.open_admins a join auth.users u on lower(u.email) = lower(a.email) where u.id = l.user_id) then 'pro' else public.open_tier(l.user_id) end,
    'prefs', to_jsonb(p) - 'user_id',
    'sent24', (select count(*) from public.open_alert_sent s where s.user_id = l.user_id and s.t > now() - interval '24 hours' and s.kind <> 'test' and s.kind <> 'summary')))
    from public.open_alert_links l join public.open_alert_prefs p on p.user_id = l.user_id), '[]'::json);
end $$;
revoke all on function public.open_alert_link(text, text, bigint, text) from public;
revoke all on function public.open_alert_chat(text, bigint, text, text, timestamptz) from public;
revoke all on function public.open_alert_targets(text) from public;
grant execute on function public.open_alert_link(text, text, bigint, text) to anon, authenticated;
grant execute on function public.open_alert_chat(text, bigint, text, text, timestamptz) to anon, authenticated;
grant execute on function public.open_alert_targets(text) to anon, authenticated;

-- the writer also accepts sent-alert records
create or replace function public.open_log(secret text, tbl text, rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare cols text; n int;
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  if tbl not in ('open_calls', 'open_pulse', 'open_relcalls', 'open_heads', 'open_daybias', 'open_moves', 'open_radar', 'open_speech', 'open_beat', 'open_alert_sent') then raise exception 'Unknown table'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then return 0; end if;
  select string_agg(quote_ident(k), ',') into cols
    from (select distinct jsonb_object_keys(r) as k from jsonb_array_elements(rows) r) x
    where k in (select column_name from information_schema.columns where table_schema = 'public' and table_name = tbl);
  if cols is null then return 0; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing', tbl, cols, cols, tbl) using rows;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.open_log(text, text, jsonb) from public;
grant execute on function public.open_log(text, text, jsonb) to anon, authenticated;
