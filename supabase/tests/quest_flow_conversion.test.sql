begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

-- The #659 story-flow machinery this file used to exercise end to end
-- (`is_overview`, the `create_quest_overview_beat` trigger, and
-- `private.backfill_quest_story_flows`) is gone as of #793 — the opening beat
-- is now a graph shape (a root beat), not minted or protected by a flag.
--
-- This file used to also pin the residue #793 left behind: `quests
-- .flow_enabled_at` (a flag that could never be false) and `quest_beats
-- .conversion_source_type`/`_id` (provenance nothing read). #799 dropped both
-- outright, so there is nothing left of that half to assert — a dropped
-- column has no state to pin.
--
-- What remains, and is still a real regression pin: the opt-in conversion RPC
-- surface `preview_quest_flow_conversion` / `convert_quest_to_flow` /
-- `rollback_quest_flow_conversion`, shipped in `20260810000016` and dropped
-- the same day by `20260810202052`, has not crept back. That drop predates
-- #799 and is untouched by it, but it is the one thing left in this file
-- worth a file of its own rather than folding into a general dead-function
-- sweep.

select hasnt_function('public', 'preview_quest_flow_conversion', array['uuid'], 'the obsolete conversion preview is retired');
select hasnt_function('public', 'convert_quest_to_flow', array['uuid', 'boolean'], 'the obsolete opt-in conversion is retired');
select hasnt_function('public', 'rollback_quest_flow_conversion', array['uuid'], 'story flows no longer roll back to a second quest mode');

select * from finish();
rollback;
