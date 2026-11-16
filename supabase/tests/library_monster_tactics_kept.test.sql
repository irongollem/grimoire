begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- A library monster's stored tactics survive a rewrite of its stat block (#1203). The Open5e re-import rebuilds a
-- stat block from the source's own fields, which have no tactics, so without `library_monsters_keep_tactics` every
-- re-import would quietly undo the reviewed morale of the creature it touches.

insert into public.library_monsters (id, name, monster_type, size, ruleset, conceptual_key, source_document_key, source_record_key, stat_block)
values ('tactics_kept_test', 'Kept Thing', 'fiend', 'medium', '2014', 'kept-thing', 'test-doc', 'kept-thing',
  '{"armor_class": 12, "hit_points": "2d8", "speed": "30 ft.", "str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10, "challenge_rating": "1", "tactics": {"morale": {"breaksAt": 0, "then": "fight_on"}}}'::jsonb);

-- A re-import: the same block, rebuilt without the key and with a changed statistic.
update public.library_monsters
set stat_block = (stat_block - 'tactics') || '{"armor_class": 15}'::jsonb
where id = 'tactics_kept_test';

select is(
  (select stat_block -> 'tactics' -> 'morale' ->> 'then' from public.library_monsters where id = 'tactics_kept_test'),
  'fight_on', 'a stat block rewritten without tactics keeps the tactics it had'
);
select is(
  (select stat_block ->> 'armor_class' from public.library_monsters where id = 'tactics_kept_test'),
  '15', 'and the rest of the rewrite still lands'
);

-- Tactics the write does carry win: this is how a later review changes them.
update public.library_monsters
set stat_block = stat_block || '{"tactics": {"morale": {"breaksAt": 0.5, "then": "flee"}}}'::jsonb
where id = 'tactics_kept_test';
select is(
  (select stat_block -> 'tactics' -> 'morale' ->> 'then' from public.library_monsters where id = 'tactics_kept_test'),
  'flee', 'tactics in the new block replace the old ones'
);

-- And an empty object is the way to remove them on purpose.
update public.library_monsters
set stat_block = stat_block || '{"tactics": {}}'::jsonb
where id = 'tactics_kept_test';
select is(
  (select stat_block -> 'tactics' from public.library_monsters where id = 'tactics_kept_test'),
  '{}'::jsonb, 'an explicit empty tactics object is kept as written, so tactics can be cleared'
);

select * from finish();
rollback;
