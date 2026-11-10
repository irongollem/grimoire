-- The ledger records each image render's quality and size.
--
-- 20260826215438 added `ai_credit_ledger.quality` and `.size` so cost reports
-- could tell one model's variants apart (gpt-image high versus low is an order
-- of magnitude in output tokens, and output tokens scale with area), and every
-- image function has passed both in its log fields since. But the two
-- functions that write a charged row were never taught the columns:
-- `spend_credits` inserted the token counts and dropped the rest, and
-- `settle_ai_generation_job` did the same for a BYOK render. On 8 Nov 2026 not
-- one charged row in production had either, so no report could group by them.
--
-- Only the inserts change. A spend split across both buckets keeps its rule:
-- the usage (now including quality and size) goes on the subscription row and
-- the purchased row carries none, so a report summing usage counts it once.
-- `create or replace` keeps each function's grants (service_role only).

CREATE OR REPLACE FUNCTION public.spend_credits(p_user_id uuid, p_reason text, p_cost numeric, p_log jsonb DEFAULT '{}'::jsonb, p_allow_negative boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       model, provider, input_tokens, input_image_tokens, output_tokens, image_count,
       quality, size)
    values
      (p_user_id, -v_sub_spend, p_reason, false, 'subscription',
       p_log->>'model', p_log->>'provider',
       (p_log->>'input_tokens')::int, (p_log->>'input_image_tokens')::int,
       (p_log->>'output_tokens')::int, (p_log->>'image_count')::int,
       p_log->>'quality', p_log->>'size');
  end if;

  if v_pur_spend > 0 then
    insert into ai_credit_ledger
      (user_id, delta, reason, is_byok, bucket,
       model, provider, input_tokens, input_image_tokens, output_tokens, image_count,
       quality, size)
    values
      (p_user_id, -v_pur_spend, p_reason, false, 'purchased',
       case when v_sub_spend > 0 then null else p_log->>'model' end,
       case when v_sub_spend > 0 then null else p_log->>'provider' end,
       case when v_sub_spend > 0 then null else (p_log->>'input_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'input_image_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'output_tokens')::int end,
       case when v_sub_spend > 0 then null else (p_log->>'image_count')::int end,
       case when v_sub_spend > 0 then null else p_log->>'quality' end,
       case when v_sub_spend > 0 then null else p_log->>'size' end);
  end if;

  return jsonb_build_object('ok', true, 'balance', v_total - p_cost);
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_ai_generation_job(p_job_id uuid, p_result_json jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.ai_generation_jobs%rowtype;
  v_reservation_ids uuid[];
  v_billing jsonb;
  v_spend jsonb;
begin
  select * into v_job from public.ai_generation_jobs where id = p_job_id for update;
  if not found then
    raise exception 'AI generation job not found';
  end if;
  if v_job.status = 'ready' then
    return;
  end if;
  if v_job.status <> 'settling' then
    raise exception 'AI generation job is not ready to settle';
  end if;
  if v_job.artifact_url is null and v_job.artifact_storage_path is null then
    raise exception 'AI generation job has no persisted artifact';
  end if;

  v_billing := coalesce(v_job.billing_context, '{}'::jsonb);
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into v_reservation_ids
    from jsonb_array_elements_text(coalesce(v_billing->'reservation_ids', '[]'::jsonb));

  if coalesce((v_billing->>'is_byok')::boolean, false) then
    insert into public.ai_credit_ledger (user_id, delta, reason, is_byok, model, provider, image_count, quality, size)
    values (
      v_job.user_id,
      0,
      coalesce(v_billing->>'generation_type', v_job.generator_type),
      true,
      v_billing->'log'->>'model',
      v_billing->'log'->>'provider',
      coalesce((v_billing->'log'->>'image_count')::int, 1),
      v_billing->'log'->>'quality',
      v_billing->'log'->>'size'
    );
  elsif coalesce((v_billing->>'cost')::numeric, 0) > 0 then
    v_spend := public.spend_credits(
      v_job.user_id,
      coalesce(v_billing->>'generation_type', v_job.generator_type),
      (v_billing->>'cost')::numeric,
      coalesce(v_billing->'log', '{}'::jsonb),
      true
    );
    if not coalesce((v_spend->>'ok')::boolean, false) then
      raise exception 'Could not settle AI generation credits';
    end if;
  end if;

  if cardinality(v_reservation_ids) > 0 then
    perform public.release_credits(v_reservation_ids);
  end if;

  update public.ai_generation_jobs
  set status = 'ready',
      result_json = p_result_json,
      error = null,
      completed_at = now(),
      billing_context = v_billing || jsonb_build_object('settlement', 'recorded')
  where id = p_job_id;
end;
$function$;
