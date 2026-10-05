-- #976: the generated backfill gives official features their mechanics and every
-- level, without overwriting an edit or removing a hand-added id.
begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Rows that may already be in a populated database stand aside inside this transaction.
delete from public.class_features
 where user_id is null and source_document_key = 'srd-2014'
   and source_record_key in ('srd_rogue_sneak-attack', 'srd_rogue_ability-score-improvement', 'srd_rogue_expertise');
delete from public.class_features where user_id is null and name like 'Backfill %';

-- The adopted shape: the baseline holds what the adoption wrote.
insert into public.class_features (id, user_id, name, source, ruleset, source_document_key, source_record_key, provenance, mechanics) values
  ('97600000-0000-4000-8000-00000000d001', null, 'Backfill Sneak Attack', 'srd-2014', '2014', 'srd-2014', 'srd_rogue_sneak-attack',
   '{"imported": {"mechanics": {}}}', '{}'),
  ('97600000-0000-4000-8000-00000000d002', null, 'Backfill Ability Score Improvement', 'srd-2014', '2014', 'srd-2014', 'srd_rogue_ability-score-improvement',
   '{"imported": {"mechanics": {}}}', '{}'),
  -- An admin edit: the mechanics no longer equal the baseline.
  ('97600000-0000-4000-8000-00000000d003', null, 'Backfill Expertise', 'srd-2014', '2014', 'srd-2014', 'srd_rogue_expertise',
   '{"imported": {"mechanics": {}}}', '{"activation": "special"}');

-- The Rogue's map as the old importer left it: ASI at 10 only, plus a hand-added id.
update public.system_classes
   set features = jsonb_build_object('10', jsonb_build_array('97600000-0000-4000-8000-00000000d002'),
                                     '3', jsonb_build_array('97600000-0000-4000-8000-00000000d999'))
 where ruleset = '2014' and class_name = 'Rogue';

select is((select count(*)::int from public.system_classes where ruleset = '2014' and class_name = 'Rogue'), 1,
  'positive control: the 2014 Rogue is a system class');

select private.apply_official_mechanics_backfill();

select isnt((select mechanics from public.class_features where id = '97600000-0000-4000-8000-00000000d001'), '{}'::jsonb,
  'Sneak Attack gained mechanics');
select ok((select mechanics ? 'scaling' from public.class_features where id = '97600000-0000-4000-8000-00000000d001'),
  'Sneak Attack scales');
select ok((select mechanics ? 'riders' from public.class_features where id = '97600000-0000-4000-8000-00000000d001'),
  'Sneak Attack carries its damage rider');
select is((select provenance -> 'imported' -> 'mechanics' from public.class_features where id = '97600000-0000-4000-8000-00000000d001'),
  (select mechanics from public.class_features where id = '97600000-0000-4000-8000-00000000d001'),
  'the baseline moved with the write');

select is((select mechanics from public.class_features where id = '97600000-0000-4000-8000-00000000d003'), '{"activation": "special"}'::jsonb,
  'an edited field is not overwritten');
select is((select provenance -> 'imported' -> 'mechanics' from public.class_features where id = '97600000-0000-4000-8000-00000000d003'), '{}'::jsonb,
  'and its baseline stays put');

select is(
  (select array_agg(l.key::int order by l.key::int)
     from public.system_classes sc, jsonb_each(sc.features) l
    where sc.ruleset = '2014' and sc.class_name = 'Rogue'
      and l.value ? '97600000-0000-4000-8000-00000000d002'),
  array[4, 8, 10, 12, 16, 19],
  'the Ability Score Improvement sits at every level the book gives it');
select ok((select features -> '3' ? '97600000-0000-4000-8000-00000000d999' from public.system_classes where ruleset = '2014' and class_name = 'Rogue'),
  'a hand-added id survives');

create temp table before_second_run on commit drop as
select id, features from public.system_classes;
select private.apply_official_mechanics_backfill();
select is((select count(*)::int from public.system_classes sc join before_second_run b using (id)
            where sc.features is distinct from b.features), 0,
  'running it again changes no map');

select ok(not has_function_privilege('authenticated', 'private.apply_official_mechanics_backfill()', 'execute'),
  'client roles cannot call the backfill');

select * from finish();
rollback;
