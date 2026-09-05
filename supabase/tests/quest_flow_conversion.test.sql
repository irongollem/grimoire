begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- The #659 story-flow machinery this file used to exercise end to end
-- (`is_overview`, the `create_quest_overview_beat` trigger, and
-- `private.backfill_quest_story_flows`) is gone as of #793 — the opening beat
-- is now a graph shape (a root beat), not minted or protected by a flag. What
-- survives, and is still worth pinning here, is that every quest stays
-- flow-enabled and that the older, already-retired conversion RPC surface
-- (#659's own predecessor) has not crept back.

select has_column('public', 'quests', 'flow_enabled_at', 'quests carry flow activation time');
select col_not_null('public', 'quests', 'flow_enabled_at', 'every quest uses story flow');
select ok(
  (select column_default is not null from information_schema.columns where table_schema = 'public' and table_name = 'quests' and column_name = 'flow_enabled_at'),
  'new quests enable story flow by default'
);
select has_column('public', 'quest_beats', 'conversion_source_type', 'generated beats retain auditable provenance');
select hasnt_function('public', 'preview_quest_flow_conversion', array['uuid'], 'the obsolete conversion preview is retired');
select hasnt_function('public', 'convert_quest_to_flow', array['uuid', 'boolean'], 'the obsolete opt-in conversion is retired');
select hasnt_function('public', 'rollback_quest_flow_conversion', array['uuid'], 'story flows no longer roll back to a second quest mode');

select * from finish();
rollback;
