-- Whether the AI table made the clock its scene runs against (#1021).
--
-- The narrator puts a scene under pressure either by running against a clock the DM authored on the quest, or by
-- starting a clock of its own ("The night watch reaches the door", 3 turns). The second kind is the scene's and
-- nothing else's: live (17 Nov 2026) each sitting left its clock on the quest for ever, full, and a later sitting's
-- narrator picked a stale full one up again because it was listed among the quest's clocks. So the conversation
-- remembers that it made its clock, and the server deletes a clock the table made when the pressure ends: stopped,
-- replaced, filled, or the player leaves. A clock the DM authored is never deleted, only let go of.
--
-- Written by the agent functions (service role) only: `authenticated` holds SELECT and DELETE on this table.

alter table public.agent_sessions
  add column pressure_clock_made boolean not null default false;

comment on column public.agent_sessions.pressure_clock_made is
  'True when the AI table itself created the clock in pressure_clock_id; such a clock is deleted when the pressure ends. False for a clock the DM authored.';
