-- The Open One: paid plans (Free / Plus / Pro), lifetime codes and the AI meter.
-- Run once in Supabase: SQL Editor, paste, Run. Safe to run again.
-- Nothing here needs the service_role key: every write goes through a checked function.

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
insert into public.open_admins (email) values ('alexpokhodun201@gmail.com') on conflict do nothing;

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

-- ---------- one-time step (run this line by itself, then copy the value into Vercel as OPEN_SYNC_SECRET) ----------
-- insert into public.open_secrets (name, value) values ('stripe_sync', encode(extensions.gen_random_bytes(24), 'hex'))
--   on conflict (name) do update set value = excluded.value returning value;
