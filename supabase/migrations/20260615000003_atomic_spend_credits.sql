-- Migration: atomic_spend_credits
-- Atomic, race-free credit spend on the append-only ledger.
--
-- Before: every deduction path was read-balance → compare → insert (in
-- deduct-ai-credit and in _shared/credits.ts recordSpend, used by every
-- generator). With no lock, N concurrent requests all read the same pre-spend
-- balance, all pass the affordability check, and all insert negative deltas —
-- driving the balance negative (free credits), which the monthly reset then
-- forgives. The subscription-first bucket split had the same race (two spends
-- could both draw the same subscription balance).
--
-- This RPC serializes spends per-user with a transaction-scoped advisory lock,
-- recomputes balances under the lock, applies the subscription-first split, and
-- inserts the bucketed ledger rows in one transaction.
--
--   p_allow_negative = false → atomic GATE: refuses (no insert) if the user
--     cannot afford the cost. Used by pure-ledger deductions (deduct-ai-credit).
--   p_allow_negative = true  → records a spend for work already performed
--     (server generators that already called the paid AI API). Still serialized
--     and split correctly; may push the balance slightly negative under genuine
--     concurrency, but cannot be exploited to multiply generations.
--
-- Spends draw subscription-bucket first (burn the expiring monthly allowance
-- before permanent purchased credits).

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
  v_total    numeric;
  v_sub      numeric;
  v_sub_spend numeric;
  v_pur_spend numeric;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', true, 'balance',
      coalesce((select sum(delta) from ai_credit_ledger where user_id = p_user_id), 0));
  end if;

  -- Serialize all spends for this user within the current transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

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
    -- Attach the cost-bearing log fields to exactly one row (the subscription
    -- row if it exists) so the analytics views never double-count a generation.
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

-- Credit spending must never be directly callable by clients — only the
-- service-role edge functions invoke this.
revoke execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) from public;
revoke execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) from anon;
revoke execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) from authenticated;
grant execute on function public.spend_credits(uuid, text, numeric, jsonb, boolean) to service_role;
