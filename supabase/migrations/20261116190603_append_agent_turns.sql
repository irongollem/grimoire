-- A finished turn is saved whole (#1205).
--
-- When a turn ends the server holds several new messages and what the turn accrued in credits. Writing the messages
-- and then the session's totals as two requests can stop between them, and a conversation whose totals lag its
-- messages has been played without being counted. `append_agent_turns` does both in one transaction.
--
-- It also settles two tabs racing on one conversation. The caller says which message it believes is the last
-- (`p_after_seq`); if the conversation has moved on, nothing is written and the function raises, so the second turn
-- is refused instead of being spliced into a history it did not see. `unique (session_id, seq)` is the backstop.
--
-- It answers with what to bill: the whole credits the conversation's running total crossed with this turn. A
-- conversation accrues exact fractions and only whole credits are ever charged, and "which whole credits are new" can
-- only be decided where the total lives and under the lock that changes it. Worked out by the caller from a total it
-- read earlier, a turn and a summary (`summarise_agent_session`) finishing close together could each claim the same
-- credit, or neither claim it.
--
-- For the service role only: the turn function is the one writer of these tables (see 20261116190601).

create or replace function public.append_agent_turns(
  p_session_id uuid,
  p_after_seq integer,
  p_rows jsonb,
  p_credits numeric
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_last integer;
  v_before numeric;
  v_after numeric;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'append_agent_turns: no rows' using errcode = '22023';
  end if;
  if p_credits is null or p_credits < 0 then
    raise exception 'append_agent_turns: credits must not be negative' using errcode = '22023';
  end if;

  -- The session row is locked for the length of the write, so two appends to one conversation run one after the other.
  select s.user_id, s.credits_spent into v_user_id, v_before
  from public.agent_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'append_agent_turns: no such conversation' using errcode = 'P0002';
  end if;

  select coalesce(max(t.seq), 0) into v_last from public.agent_turns t where t.session_id = p_session_id;
  if v_last <> p_after_seq then
    raise exception 'append_agent_turns: the conversation has moved on (last message %, expected %)', v_last, p_after_seq
      using errcode = '40001';
  end if;

  -- The owner comes from the session, never from the rows: a message always belongs to its conversation's owner.
  insert into public.agent_turns (
    session_id, user_id, seq, role, blocks, provider, model,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
  )
  select
    p_session_id, v_user_id, p_after_seq + r.ordinality::integer, r.value ->> 'role', r.value -> 'blocks',
    r.value ->> 'provider', r.value ->> 'model',
    (r.value ->> 'input_tokens')::integer, (r.value ->> 'output_tokens')::integer,
    (r.value ->> 'cache_read_tokens')::integer, (r.value ->> 'cache_write_tokens')::integer
  from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality);

  update public.agent_sessions s
  set input_tokens = s.input_tokens + t.input_tokens,
      output_tokens = s.output_tokens + t.output_tokens,
      cache_read_tokens = s.cache_read_tokens + t.cache_read_tokens,
      cache_write_tokens = s.cache_write_tokens + t.cache_write_tokens,
      credits_spent = s.credits_spent + p_credits
  from (
    select
      coalesce(sum((r.value ->> 'input_tokens')::bigint), 0) as input_tokens,
      coalesce(sum((r.value ->> 'output_tokens')::bigint), 0) as output_tokens,
      coalesce(sum((r.value ->> 'cache_read_tokens')::bigint), 0) as cache_read_tokens,
      coalesce(sum((r.value ->> 'cache_write_tokens')::bigint), 0) as cache_write_tokens
    from jsonb_array_elements(p_rows) as r(value)
  ) t
  where s.id = p_session_id
  returning s.credits_spent into v_after;

  return (floor(v_after) - floor(v_before))::integer;
end;
$$;

revoke execute on function public.append_agent_turns(uuid, integer, jsonb, numeric) from public, anon, authenticated;
grant execute on function public.append_agent_turns(uuid, integer, jsonb, numeric) to service_role;

-- `credits_spent` holds the exact accrued total, which is finer than a hundredth of a credit per turn.
alter table public.agent_sessions alter column credits_spent type numeric(14, 6);

-- So the admin's cost breakdown lists it. The price is not this row: a turn is metered by its tokens.
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('agent_turn', 'AI Table Turn (metered by tokens)', 0, 53)
on conflict (generation_type) do nothing;
