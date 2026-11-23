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
-- Shape: { command, answers, tape, offer, answerBatchId, offerId, sheets }. `answerBatchId` is required and nullable: the batch whose answer
-- made `answers` what it is, null for the turn's first pause. `offerId` is the id of the batch that raised this offer: an answer must name
-- it, and an answer to any other offer is refused. `sheets` is what the replay reads of the player characters' sheets as they stood at the
-- first pause (`{ players }`), so a sheet edited while the fight waits cannot change the turn being replayed.
-- Who writes it: `encounter-command` is the only writer that creates an offer (a paused take_turn or answer_reaction). It also clears it
-- (an answer that finishes the turn, End combat, Abandon, and `open` on an ended fight), and `carryFight` (agent-turn) clears it when it
-- resets the row for the fight that follows.

alter table public.encounter_state
  add column pending_reaction jsonb;

comment on column public.encounter_state.pending_reaction is
  'The Reaction the played character at the AI table is being asked for, and what replays the paused creature turn (#1021). '
  'Shape { command, answers, tape, offer, answerBatchId (required, nullable), offerId, sheets }. '
  'Created only by encounter-command; cleared by it (a finishing answer, End combat, Abandon, open) and by carryFight; null when nothing waits.';

-- The cost of an answered Reaction (a slot, a daily use, a class resource) is written to the sheet after the fight is saved.
-- So a sheet write that fails cannot leave Shield up and the slot unspent, the answer's save carries what it still owes here,
-- in the same update as the fight, and `encounter-command` clears it once every write landed; any later batch on the fight
-- settles a record it finds first. Every write is an absolute value, so settling twice changes nothing. Null when nothing is owed.
-- Shape (written and read only by `encounter-command`, `owedWrites.ts`): { batchId, slots, innate, resources }.

alter table public.encounter_state
  add column owed_writes jsonb;

comment on column public.encounter_state.owed_writes is
  'Sheet writes the batch that answered the played character''s Reaction still owes (#1021): { batchId, slots, innate, resources }, '
  'absolute values. Saved with the fight, cleared by encounter-command once the writes landed; null when nothing is owed.';
