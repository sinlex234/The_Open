-- The Open One: security fixes (Nov 9, 2026). Supabase -> SQL Editor -> paste -> Run. Safe to run again.

-- 1. The site's own records (calls, live reads, release calls, headlines, day bias) can only be written by the
--    site's server, through a function that checks the server's secret. Visitors can still read them.
create or replace function public.open_log(secret text, tbl text, rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare cols text; n int;
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  if tbl not in ('open_calls', 'open_pulse', 'open_relcalls', 'open_heads', 'open_daybias') then raise exception 'Unknown table'; end if;
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

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('open_calls', 'open_pulse', 'open_relcalls', 'open_heads', 'open_daybias') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
revoke insert, update, delete on public.open_calls, public.open_pulse, public.open_relcalls, public.open_heads, public.open_daybias from anon, authenticated;

-- 2. Crowd calls: the release time comes from the event itself (the number at the end of its key), not from the
--    reader, so nobody can call after the number is out or move the grading hour for everyone.
alter table public.open_crowd drop constraint if exists open_crowd_title_len;
alter table public.open_crowd add constraint open_crowd_title_len check (length(title) <= 160 and length(event_key) <= 240);
create or replace function public.open_crowd_time(k text) returns timestamptz
language sql immutable as $$ select to_timestamp(((regexp_match(k, '\|(\d{12,14})$'))[1])::bigint / 1000.0) $$;
drop policy if exists "open_crowd: call" on public.open_crowd;
create policy "open_crowd: call" on public.open_crowd for insert to authenticated
  with check (auth.uid() = user_id and voted_at between now() - interval '1 minute' and now() + interval '1 minute'
    and released_at = public.open_crowd_time(event_key) and released_at > now() and released_at < now() + interval '3 days');
drop policy if exists "open_crowd: change" on public.open_crowd;
create policy "open_crowd: change" on public.open_crowd for update to authenticated
  using (auth.uid() = user_id and public.open_crowd_time(event_key) > now())
  with check (auth.uid() = user_id and public.open_crowd_time(event_key) > now());

-- 3. Usernames no longer reveal email addresses: only the site's server (which signs the reader in) can look one up.
drop function if exists public.email_for_username(text);
create or replace function public.email_for_login(uname text, secret text) returns text
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
  return (select u.email from public.open_usernames n join auth.users u on u.id = n.user_id where n.username = lower(uname));
end $$;
revoke all on function public.email_for_login(text, text) from public;
grant execute on function public.email_for_login(text, text) to anon, authenticated;

-- 4. Plan sync: a missing secret can never let a request through.
create or replace function public.open_stripe_sync(secret text, uid uuid, p_tier text, p_status text, p_period_end timestamptz, p_customer text, p_sub text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if secret is null or secret is distinct from (select value from public.open_secrets where name = 'stripe_sync') then raise exception 'Not allowed'; end if;
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

-- 5. AI reads: check the reader's allowance without using it up (the server charges only after a good answer).
create or replace function public.open_ai_check(cost int default 1, need text default 'free') returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t text;
  lim int;
  used int;
begin
  if uid is null then return json_build_object('ok', false, 'why', 'signin'); end if;
  t := public.open_tier(uid);
  if (need = 'plus' and t = 'free') or (need = 'pro' and t <> 'pro') then
    return json_build_object('ok', false, 'why', 'tier', 'tier', t);
  end if;
  lim := public.open_ai_limit(t);
  select coalesce((select n from public.open_ai_usage where user_id = uid and day = (now() at time zone 'America/New_York')::date), 0) into used;
  if used + greatest(cost, 1) > lim then
    return json_build_object('ok', false, 'why', 'limit', 'tier', t, 'used', used, 'limit', lim);
  end if;
  return json_build_object('ok', true, 'tier', t, 'used', used, 'limit', lim);
end $$;
revoke all on function public.open_ai_check(int, text) from public, anon;
grant execute on function public.open_ai_check(int, text) to authenticated;
