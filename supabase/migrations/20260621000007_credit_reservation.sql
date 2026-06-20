-- Migration: credit_reservation
-- Close the AI-generation cost-drain. The generators checked the balance with a
-- non-atomic read before calling the paid provider, and the post-call deduction
-- used spend_credits(allow_negative=true) which never refuses — so N concurrent
-- requests from a ~1-credit user all passed the check and all ran paid calls,
-- driving the balance negative (then forgiven by the monthly reset).
--
-- Fix: a PENDING reservation that holds the balance for the duration of the paid
-- call. reserve_credits() atomically (advisory-locked) refuses if the user can't
-- afford the cost, else inserts pending negative ledger rows. Pending rows count
-- toward sum(delta) (so concurrent reservations see the reduced balance and the
-- gate actually holds) but are excluded from the ai_generation_costs analytics
-- view. On success the generator releases the hold and records the real spend via
-- the existing recordGeneration() path (one cost row with analytics, unchanged).
-- On failure it releases the hold — net zero, no provider charge persisted.

alter table public.ai_credit_ledger
  add column if not exists pending boolean not null default false;

-- ── reserve_credits: atomic affordability GATE + pending hold ─────────────────
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

-- ── release_credits: drop the pending hold (on success OR failure) ────────────
create or replace function public.release_credits(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  delete from ai_credit_ledger where id = any(p_ids) and pending = true;
end;
$$;

-- Service-role only, like spend_credits — clients must never call these.
revoke execute on function public.reserve_credits(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.release_credits(uuid[])             from public, anon, authenticated;
grant  execute on function public.reserve_credits(uuid, text, numeric) to service_role;
grant  execute on function public.release_credits(uuid[])             to service_role;

-- ── Exclude pending holds from the generations analytics view ─────────────────
create or replace view public.ai_generation_costs
with (security_invoker = true)
as
  select
    l.id,
    l.user_id,
    l.delta,
    l.reason,
    l.model,
    l.provider,
    l.input_tokens,
    l.input_image_tokens,
    l.output_tokens,
    l.image_count,
    l.is_byok,
    l.created_at,
    case
      when p.image_output_cost_per_million_tokens is not null
           and (l.input_tokens is not null or l.input_image_tokens is not null or l.output_tokens is not null)
        then round(
          coalesce(l.input_tokens, 0)::numeric       / 1000000 * coalesce(p.input_cost_per_million_tokens, 0)       * 100
          + coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100
          + coalesce(l.output_tokens, 0)::numeric      / 1000000 * p.image_output_cost_per_million_tokens             * 100,
          4)
      when p.cost_per_image_usd is not null
        then round(coalesce(l.image_count, 1)::numeric * p.cost_per_image_usd * 100, 4)
      when p.input_cost_per_million_tokens is not null
        then round(
          coalesce(l.input_tokens, 0)::numeric  / 1000000 * p.input_cost_per_million_tokens          * 100
          + coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0) * 100,
          4)
      else null::numeric
    end as estimated_cost_usd_cents
  from ai_credit_ledger l
  left join ai_model_pricing p on l.model = p.model
  where l.delta <= 0 and not l.pending;
