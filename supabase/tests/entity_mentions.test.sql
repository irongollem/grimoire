begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

-- "Mentioned in" reads entity_mentions (#972, migration 20261004221637). The
-- index is kept by a trigger on the six source tables; these pin what lands in
-- it, when it is left alone, and who may read it.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('97200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mentions-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('97200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mentions-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000001', 'Mentions');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.npcs (id, user_id, campaign_id, name) values
  ('97200000-0000-4000-8000-000000000020', '97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Sera'),
  -- Mentions itself and Sera: only Sera's backlink may list it.
  ('97200000-0000-4000-8000-000000000021', '97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Odric');
update public.npcs
   set backstory = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"entityMention","attrs":{"id":"97200000-0000-4000-8000-000000000021","entityType":"npc"}},{"type":"entityMention","attrs":{"id":"97200000-0000-4000-8000-000000000020","entityType":"npc"}}]}]}'
 where id = '97200000-0000-4000-8000-000000000021';

insert into public.notes (id, user_id, campaign_id, title, content) values
  ('97200000-0000-4000-8000-000000000030', '97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Session 1',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"met "},{"type":"entityMention","attrs":{"id":"97200000-0000-4000-8000-000000000020","entityType":"npc"}},{"type":"entityMention","attrs":{"id":"srd_goblin","entityType":"monster"}}]}]}'),
  -- Legacy HTML and plain text that happens to contain the id hold no mention.
  ('97200000-0000-4000-8000-000000000031', '97200000-0000-4000-8000-000000000001', '97200000-0000-4000-8000-000000000010', 'Old note',
   '<p>97200000-0000-4000-8000-000000000020 entityMention</p>');

select is(
  (select array_agg(target_id order by target_id) from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000030'),
  array['97200000-0000-4000-8000-000000000020', 'srd_goblin'],
  'a note indexes every mention it holds, a library slug included'
);
select is(
  (select count(*)::int from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000031'),
  0,
  'HTML or text that merely contains an id is not a mention'
);

-- Saving the note again without touching its mentions leaves the rows alone
-- (and so rings no doorbell).
update public.entity_mentions set created_at = '2000-01-01' where source_id = '97200000-0000-4000-8000-000000000030';
update public.notes set title = 'Session one' where id = '97200000-0000-4000-8000-000000000030';
update public.notes
   set content = replace(content, '"met "', '"met again "')
 where id = '97200000-0000-4000-8000-000000000030';
select is(
  (select min(created_at) from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000030'),
  '2000-01-01'::timestamptz,
  'an edit that keeps the same mentions rewrites nothing'
);

update public.notes
   set content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"entityMention","attrs":{"id":"srd_goblin","entityType":"monster"}}]}]}'
 where id = '97200000-0000-4000-8000-000000000030';
select is(
  (select array_agg(target_id) from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000030'),
  array['srd_goblin'],
  'removing a mention removes its row'
);

-- A source that leaves every campaign keeps no rows; deleting it drops them.
update public.notes set campaign_id = null where id = '97200000-0000-4000-8000-000000000030';
select is((select count(*)::int from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000030'), 0, 'a note with no campaign keeps no rows');
update public.notes set campaign_id = '97200000-0000-4000-8000-000000000010' where id = '97200000-0000-4000-8000-000000000030';
select is((select count(*)::int from public.entity_mentions where source_id = '97200000-0000-4000-8000-000000000030'), 1, 'moving it back into a campaign indexes it again');

-- The doorbell rings for the campaign when the index changes.
select ok(
  (select changed_table = 'entity_mentions' from public.campaign_sync where campaign_id = '97200000-0000-4000-8000-000000000010'),
  'a change to the index rings entity_mentions for its campaign'
);

-- Reads, as the DM.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '97200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"97200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select array_agg(kind || ':' || title order by kind) from public.get_entity_backlinks('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000020')),
  array['npc:Odric'],
  'Sera is mentioned in Odric''s backstory (the note no longer names her)'
);
select is(
  (select count(*)::int from public.get_entity_backlinks('97200000-0000-4000-8000-000000000010', '97200000-0000-4000-8000-000000000021')),
  0,
  'an NPC is never listed as mentioning itself'
);
select is(
  (select array_agg(kind || ':' || title) from public.get_entity_backlinks('97200000-0000-4000-8000-000000000010', 'srd_goblin')),
  array['note:Session one'],
  'a library monster resolves its backlinks by slug'
);

-- Reads, as a player: the index is DM-only, and so is the read.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '97200000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"97200000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is_empty(
  $$ select 1 from public.entity_mentions where campaign_id = '97200000-0000-4000-8000-000000000010' $$,
  'a player reads no mention rows'
);
select is_empty(
  $$ select 1 from public.get_entity_backlinks('97200000-0000-4000-8000-000000000010', 'srd_goblin') $$,
  'a player gets no backlinks'
);

reset role;

select ok(not has_function_privilege('anon', 'public.get_entity_backlinks(uuid,text)', 'EXECUTE'), 'anon cannot call the read');
select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'entity_mentions'),
  0,
  'mention rows never travel as realtime payloads'
);

select * from finish();
rollback;
