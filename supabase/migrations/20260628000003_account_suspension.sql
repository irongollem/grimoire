-- Migration: account_suspension
-- Soft account freeze: blocks PAID actions (credit-spend generation, new
-- purchases) while keeping login + read access. Set automatically by the
-- stripe-webhook on a chargeback / early-fraud-warning, and manually by admins.
-- (A *hard* login lock-out is handled separately via Supabase auth ban.)

alter table user_subscriptions
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

-- Gate paid generation at the single chokepoint every generator passes through.
-- Placed AFTER the cost<=0 early return, so BYOK / $0 calls remain allowed —
-- we only freeze actions that cost us money. (Body mirrors 20260621000007; the
-- suspension check is the only addition.)
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

-- Surface soft-freeze + hard-lockout state in the all-users admin list. Return
-- shape changes, so drop + recreate (CREATE OR REPLACE can't alter columns).
drop function if exists public.get_admin_users();
create function get_admin_users()
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  created_at   timestamptz,
  plan_id      text,
  status       text,
  ai_credits   bigint,
  suspended_at timestamptz,
  banned       boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' then
    raise exception 'Access denied';
  end if;

  return query
  select
    u.id                                          as user_id,
    u.email::text                                 as email,
    (u.raw_user_meta_data ->> 'display_name')     as display_name,
    u.created_at                                  as created_at,
    coalesce(s.plan_id, 'free')                   as plan_id,
    coalesce(s.status,  'active')                 as status,
    coalesce(b.balance, 0)::bigint                as ai_credits,
    s.suspended_at                                as suspended_at,
    (u.banned_until is not null and u.banned_until > now()) as banned
  from auth.users u
  left join user_subscriptions s on s.user_id = u.id
  left join ai_credit_balance   b on b.user_id = u.id
  order by u.created_at desc;
end;
$$;
