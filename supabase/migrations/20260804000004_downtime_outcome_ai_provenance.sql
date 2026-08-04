-- Migration: downtime_outcome_ai_provenance
-- resolve_downtime_draw gains p_ai_provenance so an AI-drafted outcome (#606) can
-- be recorded on accept — the RPC is the only write path for downtime_outcomes,
-- so the column added in 20260804000002 was otherwise unreachable from the client.
--
-- `create or replace` only replaces a function with an identical argument-type
-- signature; adding a trailing parameter creates a stray second overload
-- instead (see 20260720000046 for a case where exactly this survived on the
-- remote). Drop the old 7-arg signature explicitly first.
drop function if exists public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid);

create or replace function public.resolve_downtime_draw(
  p_draw_id uuid,
  p_title text,
  p_vignette text,
  p_reward_type text,
  p_reward_id uuid,
  p_effects jsonb,
  p_back_id uuid,
  p_ai_provenance jsonb default null
)
returns downtime_outcomes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draw downtime_draws;
  v_outcome downtime_outcomes;
begin
  select * into v_draw from downtime_draws where id = p_draw_id for update;
  if not found then
    raise exception 'Draw not found' using errcode = 'no_data_found';
  end if;

  -- Authorize against the draw's own campaign, not a caller-supplied one.
  if not private.is_campaign_dm(v_draw.campaign_id) then
    raise exception 'Only the DM may resolve a downtime draw'
      using errcode = 'insufficient_privilege';
  end if;

  if v_draw.status <> 'pending' then
    raise exception 'This draw is already %', v_draw.status
      using errcode = 'check_violation';
  end if;

  insert into downtime_outcomes (
    campaign_id, draw_id, title, vignette, reward_type, reward_id, proposed_effects, ai_provenance
  )
  values (
    v_draw.campaign_id, v_draw.id, p_title, p_vignette,
    p_reward_type, p_reward_id, coalesce(p_effects, '[]'::jsonb), p_ai_provenance
  )
  returning * into v_outcome;

  update downtime_draws
     set status = 'resolved', resolved_at = now()
   where id = v_draw.id;

  -- Recurring backs are never consumed; one-shots are stamped once.
  if p_back_id is not null then
    update downtime_deck_backs
       set consumed_at = now()
     where id = p_back_id
       and campaign_id = v_draw.campaign_id
       and is_recurring = false
       and consumed_at is null;
  end if;

  return v_outcome;
end;
$$;

revoke execute on function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.resolve_downtime_draw(uuid, text, text, text, uuid, jsonb, uuid, jsonb) to authenticated, service_role;
