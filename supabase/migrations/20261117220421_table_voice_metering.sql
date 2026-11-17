-- What a voiced line at the AI table costs (#1021).
--
-- Speech was free while only the maintainer used it. Before anyone else does, a line read aloud is charged what it
-- cost to make, the way a turn of the story is: provider cost, times the admin's margin, in credits
-- (`_shared/agent/metering.ts`, `public.agent_credit_calibration()`).
--
-- Speech is priced by the character of text sent, so `ai_model_pricing` gets a rate for that. The rows below are
-- the two speech services the table speaks through, and they are the admin's to change like any other model's.
--
--   * ElevenLabs: measured on 17 Nov 2026 with the Creator plan, a line cost about 0.22 of their credits per
--     character sent on Eleven v4 Turbo (28 for 128, 21 for 97, 23 for 104, 24 for 111) and about twice that on
--     Eleven v4. A credit of theirs is taken at 0.18 USD per thousand: above the plan's own rate (about 0.165) and
--     below its overage rate, so a month that runs over does not turn speech into a loss.
--   * Inworld: its published pay-as-you-go price for TTS-2, 25 USD per million characters (the maintainer,
--     18 Nov 2026; TTS-2 Flash is 15, and a subscription lowers both).
--
-- A line already made is kept (the voice clips' bucket) and is never charged twice.

alter table public.ai_model_pricing
  add column cost_per_million_characters_usd numeric;

comment on column public.ai_model_pricing.cost_per_million_characters_usd is
  'Speech models: USD per million characters of text sent to be spoken. Null for models not priced by the character.';

insert into public.ai_model_pricing (model, provider, model_type, cost_per_million_characters_usd, notes, last_verified_at)
values
  ('eleven_v4_turbo', 'elevenlabs', 'audio', 40,
   'AI table voices (default). Measured 17 Nov 2026: about 0.22 ElevenLabs credits per character sent, at 0.18 USD per thousand credits.',
   '2026-11-17'),
  ('eleven_v4', 'elevenlabs', 'audio', 80,
   'AI table voices when TABLE_VOICE_MODEL names it. About twice Turbo per character (measured 17 Nov 2026).',
   '2026-11-17'),
  ('inworld-tts-2', 'inworld', 'audio', 25,
   'AI table voices on Inworld (children''s voices; narrator trial). Published pay-as-you-go rate for TTS-2, 18 Nov 2026; TTS-2 Flash is 15, a subscription lowers both.',
   '2026-11-18')
on conflict (model) do nothing;

-- A voiced line accrues on its conversation like a turn does: exactly, with only the whole credits the running
-- total has newly crossed billed, decided here under the conversation's row lock so a line and a turn finishing
-- together cannot both claim the same credit (see `append_agent_turns`). Returns those whole credits.
create or replace function public.accrue_agent_voice(p_session_id uuid, p_credits numeric)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_before numeric;
  v_after numeric;
begin
  if p_credits is null or p_credits < 0 then
    raise exception 'accrue_agent_voice: credits must not be negative' using errcode = '22023';
  end if;

  select s.credits_spent into v_before
  from public.agent_sessions s where s.id = p_session_id for update;
  if not found then
    raise exception 'accrue_agent_voice: no such conversation' using errcode = 'P0002';
  end if;

  update public.agent_sessions s
  set credits_spent = s.credits_spent + p_credits
  where s.id = p_session_id
  returning s.credits_spent into v_after;

  return (floor(v_after) - floor(v_before))::integer;
end;
$$;

comment on function public.accrue_agent_voice(uuid, numeric) is
  'Adds a voiced line''s exact cost to its conversation and returns the whole credits newly due. Server only.';

-- Not a definer: it runs as the service role, the only role that may call it.
revoke execute on function public.accrue_agent_voice(uuid, numeric) from public, anon, authenticated;
grant execute on function public.accrue_agent_voice(uuid, numeric) to service_role;
