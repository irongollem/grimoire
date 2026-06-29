-- Migration: abuse_velocity_guard
-- New-account credit-spend velocity guard (buy → burn → chargeback / friendly
-- fraud). Caps how fast a *young* account can consume PURCHASED credits.
--
-- Shipped OFF by default: thresholds must be tuned against real post-launch
-- consumption data so we never throttle a legit power user. `enabled` is the
-- master switch; `enforce` toggles block (true) vs log-only (false). When
-- disabled it's a single cheap config read in reserve_credits — zero behaviour
-- change. Admin-tunable; trips are logged for review + dispute evidence.

-- ── Config (singleton row) ───────────────────────────────────────────────────
create table abuse_guard_config (
  id                          smallint primary key default 1 check (id = 1),
  enabled                     boolean not null default false,
  enforce                     boolean not null default false,
  young_account_days          integer not null default 7,
  window_hours                integer not null default 24,
  max_purchased_spend_window  integer not null default 2600,
  updated_at                  timestamptz not null default now()
);

insert into abuse_guard_config (id) values (1) on conflict do nothing;

create trigger abuse_guard_config_updated_at
  before update on abuse_guard_config
  for each row execute procedure update_updated_at();

alter table abuse_guard_config enable row level security;

-- Global config — admin-only (no per-user ownership). Seeded here; clients only
-- read/update the singleton.
create policy "abuse_guard_config_select" on abuse_guard_config
  for select using (is_app_admin());
create policy "abuse_guard_config_update" on abuse_guard_config
  for update using (is_app_admin());

-- ── Trip log ─────────────────────────────────────────────────────────────────
create table abuse_guard_trips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  attempted_cost   numeric not null,
  window_spend     numeric not null,
  account_age_days integer,
  enforced         boolean not null,
  created_at       timestamptz not null default now()
);

alter table abuse_guard_trips enable row level security;

-- Admin-only read; rows are written by reserve_credits (security definer, bypasses RLS).
create policy "abuse_guard_trips_select" on abuse_guard_trips
  for select using (is_app_admin());

-- ── reserve_credits: + velocity guard ────────────────────────────────────────
-- Body mirrors 20260628000003 (suspension); the velocity block is the only
-- addition, placed after the suspension check and before the affordability gate.
create or replace function public.reserve_credits(
  p_user_id uuid,
  p_reason  text,
  p_cost    numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total     numeric;
  v_sub       numeric;
  v_sub_spend numeric;
  v_pur_spend numeric;
  v_ids       uuid[] := array[]::uuid[];
  v_id        uuid;
  v_cfg       abuse_guard_config;
  v_age_days  integer;
  v_window    numeric;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', true, 'ids', '[]'::jsonb);
  end if;

  -- Frozen accounts cannot spend credits. BYOK / $0 calls return above.
  if exists (
    select 1 from user_subscriptions
    where user_id = p_user_id and suspended_at is not null
  ) then
    return jsonb_build_object('ok', false, 'suspended', true);
  end if;

  -- New-account velocity guard (config-driven; off by default).
  select * into v_cfg from abuse_guard_config where id = 1;
  if v_cfg.enabled then
    select floor(extract(epoch from (now() - u.created_at)) / 86400)::int
      into v_age_days
      from auth.users u where u.id = p_user_id;

    if v_age_days is not null and v_age_days < v_cfg.young_account_days then
      select coalesce(sum(-delta), 0)
        into v_window
        from ai_credit_ledger
       where user_id = p_user_id
         and bucket = 'purchased'
         and delta < 0
         and not pending
         and reason <> 'pack_refund'
         and created_at > now() - make_interval(hours => v_cfg.window_hours);

      if v_window + p_cost > v_cfg.max_purchased_spend_window then
        insert into abuse_guard_trips (user_id, attempted_cost, window_spend, account_age_days, enforced)
        values (p_user_id, p_cost, v_window, v_age_days, v_cfg.enforce);

        if v_cfg.enforce then
          return jsonb_build_object('ok', false, 'velocity', true);
        end if;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(sum(delta), 0),
         greatest(0, coalesce(sum(delta) filter (where bucket = 'subscription'), 0))
    into v_total, v_sub
    from ai_credit_ledger
   where user_id = p_user_id;

  if v_total < p_cost then
    return jsonb_build_object('ok', false, 'insufficient', true, 'balance', v_total);
  end if;

  v_sub_spend := least(p_cost, v_sub);
  v_pur_spend := p_cost - v_sub_spend;

  if v_sub_spend > 0 then
    insert into ai_credit_ledger (user_id, delta, reason, is_byok, bucket, pending)
    values (p_user_id, -v_sub_spend, p_reason, false, 'subscription', true)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  if v_pur_spend > 0 then
    insert into ai_credit_ledger (user_id, delta, reason, is_byok, bucket, pending)
    values (p_user_id, -v_pur_spend, p_reason, false, 'purchased', true)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end if;

  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'balance', v_total - p_cost);
end;
$$;

revoke execute on function public.reserve_credits(uuid, text, numeric) from public, anon, authenticated;
grant  execute on function public.reserve_credits(uuid, text, numeric) to service_role;
