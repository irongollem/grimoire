-- The story so far is written down, so a long conversation stays affordable (#1205).
--
-- Every turn sends the whole conversation to the model again. `agent_sessions.summary` and `summary_through_seq` have
-- been there since 20261117003101 with nothing writing them: once the unsummarised part grows past a size the turn
-- function sets, it asks the model for a summary of the older messages and stores it here. From then on those
-- messages are no longer sent; the summary rides along with the standing instructions instead. The messages
-- themselves stay in `agent_turns`: the summary changes what the model is sent, never what was said.
--
-- One call does it all, for the same reason `append_agent_turns` does: the summary, the point it covers, the tokens
-- the summary call used and what it accrued must not be able to land apart.
--
-- The caller says which point it believed the summary covered (`p_expected_through_seq`). A summary is written after a
-- turn has been answered, so the next turn can already be running; if another summary got there first this one is
-- dropped (SQLSTATE 40001) instead of replacing a later summary with an earlier one. The summary may not reach past
-- the last stored message, or the model would be told about a part of the conversation and never sent it.
--
-- It answers, like `append_agent_turns`, with the whole credits the running total crossed.
--
-- For the service role only: the turn function is the one writer of these tables.

create or replace function public.summarise_agent_session(
  p_session_id uuid,
  p_expected_through_seq integer,
  p_through_seq integer,
  p_summary text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cache_read_tokens bigint,
  p_cache_write_tokens bigint,
  p_credits numeric
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_through integer;
  v_last integer;
  v_before numeric;
  v_after numeric;
begin
  if p_summary is null or btrim(p_summary) = '' then
    raise exception 'summarise_agent_session: the summary is empty' using errcode = '22023';
  end if;
  -- A summary is a few hundred words. This is a ceiling against a runaway answer, not a style rule.
  if char_length(p_summary) > 20000 then
    raise exception 'summarise_agent_session: the summary is too long' using errcode = '22023';
  end if;
  if p_credits is null or p_credits < 0
    or p_input_tokens is null or p_input_tokens < 0
    or p_output_tokens is null or p_output_tokens < 0
    or p_cache_read_tokens is null or p_cache_read_tokens < 0
    or p_cache_write_tokens is null or p_cache_write_tokens < 0 then
    raise exception 'summarise_agent_session: tokens and credits must not be negative' using errcode = '22023';
  end if;

  select s.summary_through_seq, s.credits_spent into v_through, v_before
  from public.agent_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'summarise_agent_session: no such conversation' using errcode = 'P0002';
  end if;

  if v_through <> p_expected_through_seq then
    raise exception 'summarise_agent_session: another summary got there first (covers %, expected %)', v_through, p_expected_through_seq
      using errcode = '40001';
  end if;

  select coalesce(max(t.seq), 0) into v_last from public.agent_turns t where t.session_id = p_session_id;
  if p_through_seq is null or p_through_seq <= v_through or p_through_seq > v_last then
    raise exception 'summarise_agent_session: the summary must cover more than before (%) and no more than is stored (%)', v_through, v_last
      using errcode = '22023';
  end if;

  update public.agent_sessions s
  set summary = p_summary,
      summary_through_seq = p_through_seq,
      input_tokens = s.input_tokens + p_input_tokens,
      output_tokens = s.output_tokens + p_output_tokens,
      cache_read_tokens = s.cache_read_tokens + p_cache_read_tokens,
      cache_write_tokens = s.cache_write_tokens + p_cache_write_tokens,
      credits_spent = s.credits_spent + p_credits
  where s.id = p_session_id
  returning s.credits_spent into v_after;

  return (floor(v_after) - floor(v_before))::integer;
end;
$$;

revoke execute on function public.summarise_agent_session(uuid, integer, integer, text, bigint, bigint, bigint, bigint, numeric)
  from public, anon, authenticated;
grant execute on function public.summarise_agent_session(uuid, integer, integer, text, bigint, bigint, bigint, bigint, numeric)
  to service_role;
