-- Migration: credit_ledger_refund_reset_fixes
-- Money-path correctness fixes surfaced by the payment audit (irongollem/grimoire#493):
--
--   1. clawback_pack_credits reversed the FULL grant on ANY refund, so a partial
--      (goodwill) refund wiped the whole pack. Now PROPORTIONAL to the refunded
--      fraction of the charge. **This proportional behaviour is a POLICY DEFAULT**
--      chosen in the absence of a product decision — see the note in the RPC body
--      for the one-line switch to "only claw back on a FULL refund".
--   2. clawback_pack_credits clamped against purchased_balance, which INCLUDES
--      pending reservation holds → transient under-clawback. Now clamps against the
--      SETTLED purchased balance (excludes pending rows).
--   3. The subscription period-reset ran inline in the webhook without the per-user
--      advisory lock and read a balance that INCLUDES pending holds, so it raced
--      reserve/release_credits and could leave `allowance + h` free credits. Moved
--      into a locked SECURITY DEFINER RPC (reset_subscription_credits) that takes
--      the per-user advisory lock and computes the current balance EXCLUDING pending
--      rows, preserving the existing per-period idempotency.
--
-- Grant/revoke hygiene mirrors the sibling RPCs in 20260628000005: service_role
-- only, never anon/authenticated (these run only from the webhook / admin tool).

-- ── clawback_pack_credits: proportional, pending-excluded clamp ────────────────
-- Signature change: two new trailing amount params (default null) thread the
-- refunded fraction from the webhook. Defaulting them to null keeps the existing
-- 3-arg caller (admin-refund-credit-pack, which always issues a FULL refund)
-- working unchanged: null amounts ⇒ full reversal. Drop the old 3-arg definition
-- first so the 3-arg call resolves unambiguously to this one via the defaults.
drop function if exists public.clawback_pack_credits(text, text, text);

create or replace function public.clawback_pack_credits(
  p_payment_intent  text,
  p_key             text,
  p_note            text,
  p_amount_refunded numeric default null,
  p_amount          numeric default null
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
  v_target  numeric;
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

  -- One reversal per pack, regardless of refund-vs-dispute event ordering and
  -- regardless of how many partial refunds fire. (A subsequent partial refund on
  -- the same PI no-ops — see #493; the per-pack guard is intentional.)
  if exists (
    select 1 from ai_credit_ledger
    where reason = 'pack_refund' and refunded_payment_intent_id = p_payment_intent
  ) then
    return 0;
  end if;

  -- PROPORTIONAL clawback (POLICY DEFAULT): reverse the share of the granted
  -- credits equal to the refunded fraction of the charge. A dispute passes
  -- amount_refunded = amount (fraction 1.0 → full reversal). Missing amounts
  -- (the admin full-refund path) also fall through to a full reversal.
  --
  --   >>> TO SWITCH TO "only claw back on a FULL refund", replace the else branch
  --   >>> below with:
  --   >>>   v_target := case when p_amount_refunded >= p_amount then v_credits else 0 end;
  if p_amount is null or p_amount <= 0 or p_amount_refunded is null then
    v_target := v_credits;
  else
    v_target := round(v_credits * least(p_amount_refunded, p_amount) / p_amount);
  end if;

  -- Clamp so the purchased bucket can't go negative — read the SETTLED balance
  -- only (exclude pending holds; a committed in-flight reservation must not mask
  -- credits that are really present, which would under-claw transiently).
  select coalesce(sum(delta), 0) into v_balance
    from ai_credit_ledger
   where user_id = v_user and bucket = 'purchased' and not pending;

  v_claw := greatest(0, least(v_target, coalesce(v_balance, 0)))::integer;

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

revoke execute on function public.clawback_pack_credits(text, text, text, numeric, numeric) from public, anon, authenticated;
grant  execute on function public.clawback_pack_credits(text, text, text, numeric, numeric) to service_role;

-- ── reset_subscription_credits: locked, pending-excluded period reset ──────────
-- Replaces the inline topUpSubscriptionCredits logic in stripe-webhook. Takes the
-- per-user advisory lock (serializes against reserve_credits / release_credits)
-- and computes the current subscription balance EXCLUDING pending reservation
-- rows, so an in-flight generation hold can't inflate the reset (issue #493 §2).
-- Writes exactly one row per period (even a delta of 0) as the idempotency marker,
-- backstopped by the ai_credit_ledger_subscription_topup_unique index (23505).
create or replace function public.reset_subscription_credits(
  p_user_id         uuid,
  p_subscription_id text,
  p_period_start    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance integer;
  v_current   bigint;
  v_delta     bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Fast-path per-period idempotency: already reset this period, nothing to do.
  -- (The unique index is the hard backstop for a concurrent racing delivery.)
  if exists (
    select 1 from ai_credit_ledger
    where user_id = p_user_id
      and reason = 'subscription_topup'
      and subscription_period_start = p_period_start
  ) then
    return;
  end if;

  -- The plan's monthly included-credit allowance (0 if no plan / free).
  select coalesce(p.monthly_credits, 0) into v_allowance
    from user_subscriptions s
    join plans p on p.id = s.plan_id
   where s.user_id = p_user_id;
  v_allowance := coalesce(v_allowance, 0);

  -- Current SETTLED subscription balance (exclude pending holds). Under the
  -- advisory lock this can't be interleaved with a reserve/release, so the
  -- computed delta restores the bucket to exactly `allowance`.
  select coalesce(sum(delta), 0) into v_current
    from ai_credit_ledger
   where user_id = p_user_id and bucket = 'subscription' and not pending;

  v_delta := v_allowance - v_current;

  insert into ai_credit_ledger
    (user_id, delta, reason, bucket, subscription_period_start)
  values
    (p_user_id, v_delta, 'subscription_topup', 'subscription', p_period_start);
exception when unique_violation then
  -- A concurrent delivery already reset this period. Safe to ignore.
  return;
end;
$$;

revoke execute on function public.reset_subscription_credits(uuid, text, date) from public, anon, authenticated;
grant  execute on function public.reset_subscription_credits(uuid, text, date) to service_role;
