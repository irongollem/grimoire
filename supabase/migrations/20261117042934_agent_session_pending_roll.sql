-- The roll the AI table has asked the player for (#1021, Solo Table canvas, frame "Your roll").
--
-- The narrator never rolls for the player's own character. It asks (the `ask_roll` tool), the story stops, and the
-- player rolls on screen or at the table and types the face. Between the turn that asked and the turn that answers,
-- the request has to live somewhere the server can score the answer against: here, on the conversation.
--
-- The value is { label, kind, ability, skill, dc }, written by the agent-turn function (service role) when a turn is
-- kept and cleared by the next kept turn, whether it answered the roll or dropped it. A request lasts one turn.
--
-- Who can touch it: `authenticated` holds only SELECT and DELETE on this table (20261117003101), so a client cannot
-- write a request or lower a DC. The owner CAN read their own row, DC included; the page never selects it for
-- display and the stream never carries it, but it is not a secret from someone who opens the network panel. Moving
-- it out of reach would take column grants on the whole table for one number in a single-player game, so it stays
-- here and this comment says so.

alter table public.agent_sessions
  add column pending_roll jsonb
  constraint agent_sessions_pending_roll_is_object check (pending_roll is null or jsonb_typeof(pending_roll) = 'object');

comment on column public.agent_sessions.pending_roll is
  'The roll the narrator asked the player for at the end of the last kept turn: { label, kind, ability, skill, dc }. Null when none is asked. Written by agent-turn only.';
