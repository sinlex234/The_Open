-- The Open One: always-on watcher (Railway). Sudden moves, memecoin radar, central bank speech flags, heartbeat.
-- Anyone can read these; only the watcher (through open_log and the server-only secret) can write them.
create table if not exists public.open_moves (
  id text primary key, t timestamptz not null, mkt text not null, name text, pct double precision, ratio double precision,
  price double precision, price_from double precision, cause_kind text, cause text, cause_source text, why text, created_at timestamptz default now());
create table if not exists public.open_radar (
  id text primary key, t timestamptz not null, chain text, address text, symbol text, name text, url text, price double precision,
  mcap double precision, liq double precision, vol_h1 double precision, chg_h1 double precision, chg_h6 double precision, chg_h24 double precision,
  buys_h1 int, sells_h1 int, age_h double precision, score int, flags jsonb, created_at timestamptz default now());
create table if not exists public.open_speech (
  id text primary key, t timestamptz not null, bank text, kind text, title text, speaker text, url text, summary text, tone text, lines jsonb,
  created_at timestamptz default now());
create table if not exists public.open_beat (id text primary key, t timestamptz not null, stats jsonb);
create index if not exists open_moves_t on public.open_moves (t desc);
create index if not exists open_radar_t on public.open_radar (t desc);
create index if not exists open_speech_t on public.open_speech (t desc);
create index if not exists open_beat_t on public.open_beat (t desc);

do $$ declare tb text; begin
  foreach tb in array array['open_moves', 'open_radar', 'open_speech', 'open_beat'] loop
    execute format('alter table public.%I enable row level security', tb);
    execute format('drop policy if exists "%s: read" on public.%I', tb, tb);
    execute format('create policy "%s: read" on public.%I for select to anon, authenticated using (true)', tb, tb);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', tb);
    execute format('grant select on public.%I to anon, authenticated', tb);
  end loop;
end $$;

-- the site's writer now also accepts the watcher's four tables
create or replace function public.open_log(secret text, tbl text, rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare cols text; n int;
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  if tbl not in ('open_calls', 'open_pulse', 'open_relcalls', 'open_heads', 'open_daybias', 'open_moves', 'open_radar', 'open_speech', 'open_beat') then raise exception 'Unknown table'; end if;
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
