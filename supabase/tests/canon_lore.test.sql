begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- Lore told in passages (20261120033042, #1226 story 5): sharing a lore entry tells its first passage; a later passage
-- reaches only the members it was told to; telling a passage that is a clue finds the clue; passages hang off lore
-- only; outsiders and other campaigns read nothing.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12260000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lore-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lore-tansy@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000403', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lore-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12260000-0000-4000-8000-000000000404', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lore-bram@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000401', 'The Kind Country', 'dnd5e-2014'),
  ('12260000-0000-4000-8000-000000000411', '12260000-0000-4000-8000-000000000403', 'Elsewhere', 'dnd5e-2014');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12260000-0000-4000-8000-000000000420', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410', 'Tansy', '2014'),
  ('12260000-0000-4000-8000-000000000421', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410', 'Bram', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000401', 'dm', 'DM', null),
  ('12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000402', 'player', 'Tansy', '12260000-0000-4000-8000-000000000420'),
  ('12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000404', 'player', 'Bram', '12260000-0000-4000-8000-000000000421'),
  ('12260000-0000-4000-8000-000000000411', '12260000-0000-4000-8000-000000000403', 'dm', 'Other DM', null)
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- The Fall of the Bakers' Guild, shared with both; a secret whose clue is the guild's last passage; a truth.
insert into public.canon_entries (id, user_id, campaign_id, part, knowledge, lore_kind, world_year, title, player_visible_to) values
  ('12260000-0000-4000-8000-000000000430', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   'lore', null, 'history', 412, 'The Fall of the Bakers'' Guild',
   array['12260000-0000-4000-8000-000000000420', '12260000-0000-4000-8000-000000000421']::uuid[]),
  ('12260000-0000-4000-8000-000000000431', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   'secret', null, null, null, 'The Stain began under the great oven.', '{}'),
  ('12260000-0000-4000-8000-000000000432', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   'truth', 'all', null, null, 'Magic leaves a taste on the tongue.', '{}');

insert into public.canon_lore_passages (id, user_id, campaign_id, entry_id, title, sort_order, player_visible_to) values
  ('12260000-0000-4000-8000-000000000440', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   '12260000-0000-4000-8000-000000000430', 'What everyone says', 0, '{}'),
  ('12260000-0000-4000-8000-000000000441', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   '12260000-0000-4000-8000-000000000430', 'What Bell-Note believes', 1, array['12260000-0000-4000-8000-000000000420']::uuid[]),
  ('12260000-0000-4000-8000-000000000442', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   '12260000-0000-4000-8000-000000000430', 'Where the master went', 2, '{}');

insert into public.canon_clues (id, user_id, campaign_id, secret_id, title, passage_id) values
  ('12260000-0000-4000-8000-000000000450', '12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410',
   '12260000-0000-4000-8000-000000000431', 'The master never left.', '12260000-0000-4000-8000-000000000442');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000401', true);

select throws_ok($$
  insert into public.canon_lore_passages (user_id, campaign_id, entry_id, title) values
    ('12260000-0000-4000-8000-000000000401', '12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000432', 'A passage of a truth')
$$, '23514', null, 'a passage cannot hang off a truth, so a truth is never told in pieces');

select throws_ok($$
  update public.canon_entries set lore_kind = 'legend' where id = '12260000-0000-4000-8000-000000000432'
$$, '23514', null, 'only lore has a lore kind');

update public.canon_lore_passages set told_at = now(), player_visible_to = array['12260000-0000-4000-8000-000000000420']::uuid[]
 where id = '12260000-0000-4000-8000-000000000442';
select isnt(
  (select found_at from public.canon_clues where id = '12260000-0000-4000-8000-000000000450'),
  null,
  'telling a passage that is a clue finds the clue, so the DM never ticks it twice');

-- ── Tansy, who was told two later passages; Bram, told none ──────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000402', true);
select is_empty($$ select id from public.canon_lore_passages $$, 'a player reads no passage from the table itself');
select is(
  (select array_agg(title order by sort_order) from public.get_player_lore_passages('12260000-0000-4000-8000-000000000410')),
  array['What everyone says', 'What Bell-Note believes', 'Where the master went'],
  'a player reads the first passage and the passages told to them');
select ok(
  exists (select 1 from public.get_player_canon('12260000-0000-4000-8000-000000000410')
           where part = 'lore' and lore_kind = 'history' and world_year = 412),
  'a shared lore entry reaches the player with its kind and its date in the world');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000404', true);
select is(
  (select array_agg(title order by sort_order) from public.get_player_lore_passages('12260000-0000-4000-8000-000000000410')),
  array['What everyone says'],
  'a member nobody told a later passage reads only the first');

select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000401', true);
update public.canon_entries set player_visible_to = '{}' where id = '12260000-0000-4000-8000-000000000430';
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000402', true);
select is_empty(
  $$ select 1 from public.get_player_lore_passages('12260000-0000-4000-8000-000000000410') $$,
  'unsharing the entry takes back every passage, even the ones told');

-- ── Someone else ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '12260000-0000-4000-8000-000000000403', true);
select is_empty(
  $$ select 1 from public.get_player_lore_passages('12260000-0000-4000-8000-000000000410', '12260000-0000-4000-8000-000000000420') $$,
  'another campaign''s DM cannot read these passages, even naming a character to preview');
select is_empty($$ select id from public.canon_lore_passages $$, 'another campaign''s DM reads no passage of this one');

select * from finish();
rollback;
