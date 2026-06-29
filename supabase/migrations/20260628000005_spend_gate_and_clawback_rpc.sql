-- Migration: spend_gate_and_clawback_rpc
-- Code-review follow-ups (proper, not band-aid):
--
-- 1. Consolidate the spend-eligibility policy (account freeze + new-account
--    velocity cap) into ONE shared gate `assert_spend_allowed`, called by BOTH
--    paid chokepoints — reserve_credits (generators) AND spend_credits
--    (deduct-ai-credit). Previously the gate lived only in reserve_credits, so
--    the deduct-ai-credit / spend_credits path bypassed suspension + velocity.
-- 2. Run the velocity window-read INSIDE the per-user advisory lock and COUNT
--    pending holds, so concurrent/burst requests can't collectively exceed the
--    cap (the prior version read pre-lock and excluded pending → soft cap).
-- 3. Move credit clawback into a single locked, idempotent SQL function
--    `clawback_pack_credits` (per-pack idempotency, balance-clamped) shared by
--    the webhook and the admin refund tool — removes the TOCTOU balance read
--    and the refund-vs-dispute double-clawback window.

-- ── Shared spend-eligibility gate ────────────────────────────────────────────
-- Caller MUST already hold pg_advisory_xact_lock(hashtextextended(user::text,0)).
-- Returns {ok:true} or {ok:false, suspended:true} / {ok:false, velocity:true}.
create or replace function public.assert_spend_allowed(
  p_user_id uuid,
  p_cost    numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg      abuse_guard_config;
  v_age_days integer;
  v_window   numeric;
begin
  -- Account freeze — blocks all paid spend.
  if exists (
    select 1 from user_subscriptions
    where user_id = p_user_id and suspended_at is not null
  ) then
    return jsonb_build_object('ok', false, 'suspended', true);
  end if;

  -- New-account purchased-credit velocity cap (config-driven, off by default).
  select * into v_cfg from abuse_guard_config where id = 1;
  if v_cfg.enabled then
    select floor(extract(epoch from (now() - u.created_at)) / 86400)::int
      into v_age_days
      from auth.users u where u.id = p_user_id;

    if v_age_days is not null and v_age_days < v_cfg.young_account_days then
      -- Count settled AND pending purchased spend (held reservations count too,
      -- so a burst before holds settle can't slip past the cap). Read is under
      -- the caller's advisory lock, so concurrent reservations serialize.
      select coalesce(sum(-delta), 0)
        into v_window
        from ai_credit_ledger
       where user_id = p_user_id
         and bucket = 'purchased'
         and delta < 0
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

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.assert_spend_allowed(uuid, numeric) from public, anon, authenticated;
grant  execute on function public.assert_spend_allowed(uuid, numeric) to service_role;

-- ── reserve_credits: delegate eligibility to the shared gate ──────────────────
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
  v_gate      jsonb;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', true, 'ids', '[]'::jsonb);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  v_gate := assert_spend_allowed(p_user_id, p_cost);
  if not (v_gate->>'ok')::boolean then
    return v_gate;  -- {ok:false, suspended|velocity}
  end if;

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

-- ── spend_credits: apply the gate on the affordability-GATE path ──────────────
-- (p_allow_negative = false). The post-hoc recording path (true, used by
-- generators after the paid call already happened) is NOT gated — the work is
-- already done and must be recorded; that path is gated earlier at reserve time.
create or replace function public.spend_credits(
  p_user_id        uuid,
  p_reason         text,
  p_cost           numeric,
  p_log            jsonb   default '{}'::jsonb,
  p_allow_negative boolean default false
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
  v_gate      jsonb;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', true, 'balance',
      coalesce((select sum(delta) from ai_credit_ledger where user_id = p_user_id), 0));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Affordability-gate path also enforces freeze + velocity (deduct-ai-credit).
  if not p_allow_negative then
    v_gate := assert_spend_allowed(p_user_id, p_cost);
    if not (v_gate->>'ok')::boolean then
      return v_gate;
    end if;
  end if;

  select coalesce(sum(delta), 0),
         greatest(0, coalesce(sum(delta) filter (where bucket = 'subscription'), 0))
    into v_total, v_sub
    from ai_credit_ledger
   where user_id = p_user_id;

  if not p_allow_negative and v_total < p_cost then
    return jsonb_build_object('ok', false, 'insufficient', true, 'balance', v_total);
  end if;

  v_sub_spend := least(p_cost, v_sub);
  v_pur_spend := p_cost - v_sub_spend;

  if v_sub_spend > 0 then
    insert into ai_credit_ledger
      (user_id, delta, reason, is_byok, bucket,
       model, provider, input_tokens, input_image_tokens, output_tokens, image_count)
    values
      (p_user_id, -v_sub_spend, p_reason, false, 'subscription',
       p_log->>'model', p_log->>'provider',
       (p_log->>'input_tokens')::int, (p_log->>'input_image_tokens')::int,
       (p_log->>'output_tokens')::int, (p_log->>'image_count')::int);
  end if;

  if v_pur_spend > 0 then
    insert into ai_credit_ledger
      (user_id, delta, reason, is_byok, bucket,
       model, provider, input_tokens, input_image_tokens, output_tokens, image_count)
    values
      (p_user_id, -v_pur_spend, p_reason, false, 'purchased',
       case when v_sub_spend > 0 then null else p_log->>'model' end,
       case when v_sub_spend > 0 then null else p_log->>'provider' end,
       case when v_sub_spend > 0 then null else (p_log->>'input_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'input_image_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'output_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'image_count')::int end);
  end if;

  return jsonb_build_object('ok', true, 'balance', v_total - p_cost);
end;
$$;

revoke execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) from public, anon, authenticated;
grant  execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) to service_role;

-- ── clawback_pack_credits: single locked, idempotent reversal ─────────────────
-- Reverses the credits granted by a credit-pack purchase, clamped so the
-- purchased balance can't go negative. Idempotent per pack (one reversal per
-- payment intent, whether a refund OR a dispute fires) and per stripe_refund_id
-- (unique index). Returns the clawed amount, 0 if already reversed, or NULL if
-- the payment isn't a credit-pack purchase (e.g. a subscription invoice).
create or replace function public.clawback_pack_credits(
  p_payment_intent text,
  p_key            text,
  p_note           text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_credits numeric;
  v_balance numeric;
  v_claw    integer;
begin
  select user_id, delta into v_user, v_credits
    from ai_credit_ledger
   where stripe_payment_intent_id = p_payment_intent
     and reason = 'pack_purchase'
   limit 1;
  if v_user is null then
    return null;  -- not a credit-pack charge — nothing to reverse
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- One reversal per pack, regardless of refund-vs-dispute event ordering.
  if exists (
    select 1 from ai_credit_ledger
    where reason = 'pack_refund' and refunded_payment_intent_id = p_payment_intent
  ) then
    return 0;
  end if;

  select coalesce(purchased_balance, 0) into v_balance
    from ai_credit_buckets where user_id = v_user;

  v_claw := greatest(0, least(v_credits, coalesce(v_balance, 0)))::integer;

  insert into ai_credit_ledger
    (user_id, delta, reason, bucket, is_byok, refunded_payment_intent_id, stripe_refund_id, note)
  values
    (v_user, -v_claw, 'pack_refund', 'purchased', false, p_payment_intent, p_key, p_note);

  return v_claw;
exception when unique_violation then
  -- A concurrent writer (admin tool vs webhook) already recorded this refund id.
  return 0;
end;
$$;

revoke execute on function public.clawback_pack_credits(text, text, text) from public, anon, authenticated;
grant  execute on function public.clawback_pack_credits(text, text, text) to service_role;
