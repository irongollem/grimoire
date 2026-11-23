-- A fight waits while the person at the AI table decides their own Reaction (#1021, the maintainer's decision of 21 Nov 2026:
-- "Ask with a React card").
--
-- A creature's turn is played on the server in one request (`take_turn`). When that turn hits the played character and Shield
-- would turn the hit into a miss, or casts a spell the played character could Counterspell, the choice is the person's, not the
-- rules'. So the turn stops there and nothing of it is saved: the moment is kept here instead, with every die the turn had rolled
-- and every tactics judgment it had asked for, and the page asks. The answer (`answer_reaction`) plays the same turn again from
-- the same fight with the same dice and judgments, so it comes out exactly as it would have, and takes the answer at that moment.
-- A second chance in the same turn (a second hit after Shield was declined) waits again the same way.
--
-- While it is set the fight takes no other command (the turn's replay needs the fight it started from), except a sync, which is
-- answered without being applied, and End combat or Abandon, which clear it. Null whenever nothing waits.
-- Shape (written and read only by `encounter-command`): { command, answers, tape, offer }.

alter table public.encounter_state
  add column pending_reaction jsonb;

comment on column public.encounter_state.pending_reaction is
  'The Reaction the played character at the AI table is being asked for, and what replays the paused creature turn (#1021). '
  'Written only by encounter-command; null when nothing waits.';
