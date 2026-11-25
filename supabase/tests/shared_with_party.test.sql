begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- #1259 (migration 20261125222311): a share with the whole party reaches a character who joins later, and an explicit
-- audience stays explicit. `shared_with_party` is derived on every write from the party at the table; the party
-- changing widens every row that has it.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('12590000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dm1259@example.invalid',      '', '{}'::jsonb, '{}'::jsonb),
  ('12590000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newcomer1259@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system)
values ('12590000-0000-4000-8000-000000000010', '12590000-0000-4000-8000-000000000001', 'Party campaign', 'dnd5e-2014');

-- Ash, Birch and Cedar at the table.
insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('12590000-0000-4000-8000-0000000000a1', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'Ash',   '2014'),
  ('12590000-0000-4000-8000-0000000000b1', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'Birch', '2014'),
  ('12590000-0000-4000-8000-0000000000c1', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'Cedar', '2014');

insert into public.notes (id, user_id, campaign_id, title, player_visible_to, updated_at) values
  ('12590000-0000-4000-8000-000000000101', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010',
   'Told to everyone', array['12590000-0000-4000-8000-0000000000a1', '12590000-0000-4000-8000-0000000000b1', '12590000-0000-4000-8000-0000000000c1']::uuid[],
   '2026-01-01T00:00:00Z'),
  ('12590000-0000-4000-8000-000000000102', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010',
   'Kept from Cedar', array['12590000-0000-4000-8000-0000000000a1', '12590000-0000-4000-8000-0000000000b1']::uuid[],
   '2026-01-01T00:00:00Z');

-- A deity, whose updated_at moves on any edit (a note's does not move when only its audience changes).
insert into public.deities (id, user_id, campaign_id, name, player_visible_to, updated_at)
values ('12590000-0000-4000-8000-000000000301', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010',
        'The Tide Mother', array['12590000-0000-4000-8000-0000000000a1', '12590000-0000-4000-8000-0000000000b1', '12590000-0000-4000-8000-0000000000c1']::uuid[],
        '2026-01-01T00:00:00Z');

select ok(
  (select shared_with_party from public.notes where id = '12590000-0000-4000-8000-000000000101'),
  'a row listing everyone at the table is shared with the whole party'
);

select ok(
  not (select shared_with_party from public.notes where id = '12590000-0000-4000-8000-000000000102'),
  'a row kept from one character is not'
);

-- A client cannot claim the flag: it is derived from the array.
update public.notes set shared_with_party = true where id = '12590000-0000-4000-8000-000000000102';
select ok(
  not (select shared_with_party from public.notes where id = '12590000-0000-4000-8000-000000000102'),
  'writing the flag directly does not widen an explicit audience'
);

-- A lore passage a player told to the party, so the widening runs past `guard_player_passage`.
insert into public.canon_entries (id, user_id, campaign_id, part, title)
values ('12590000-0000-4000-8000-000000000201', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'lore', 'The flood');
insert into public.canon_lore_passages (id, user_id, campaign_id, entry_id, body, player_visible_to)
values ('12590000-0000-4000-8000-000000000202', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', '12590000-0000-4000-8000-000000000201',
        'The river rose in a night.',
        array['12590000-0000-4000-8000-0000000000a1', '12590000-0000-4000-8000-0000000000b1', '12590000-0000-4000-8000-0000000000c1']::uuid[]);

-- Dove joins, in the newcomer's own session: a signed-in player who is not the DM.
select set_config('request.jwt.claims', '{"sub":"12590000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('12590000-0000-4000-8000-0000000000d1', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'Dove', '2014');
select set_config('request.jwt.claims', '', true);

select ok(
  exists (select 1 from public.notes where id = '12590000-0000-4000-8000-000000000101' and '12590000-0000-4000-8000-0000000000d1'::uuid = any (player_visible_to)),
  'a character who joins later is added to what the whole party was told'
);

select ok(
  not exists (select 1 from public.notes where id = '12590000-0000-4000-8000-000000000102' and '12590000-0000-4000-8000-0000000000d1'::uuid = any (player_visible_to)),
  'but not to what was kept from someone'
);

select is(
  (select array[updated_at = '2026-01-01T00:00:00Z'::timestamptz, '12590000-0000-4000-8000-0000000000d1'::uuid = any (player_visible_to)]
     from public.deities where id = '12590000-0000-4000-8000-000000000301'),
  array[true, true],
  'the party changing is not an edit: the deity reaches Dove and its updated_at stays'
);

select ok(
  exists (select 1 from public.canon_lore_passages where id = '12590000-0000-4000-8000-000000000202' and '12590000-0000-4000-8000-0000000000d1'::uuid = any (player_visible_to)),
  'a player''s passage told to the party reaches the newcomer, inside that player''s own transaction'
);

-- Cedar falls. "Kept from Cedar" still misses Dove, so it stays explicit until the DM adds Dove; then it is the whole
-- party's, though fallen Cedar is not on it.
insert into public.character_memorials (party_member_id, campaign_id, kind, character_name, campaign_name)
values ('12590000-0000-4000-8000-0000000000c1', '12590000-0000-4000-8000-000000000010', 'fallen', 'Cedar', 'Party campaign');

select ok(
  not (select shared_with_party from public.notes where id = '12590000-0000-4000-8000-000000000102'),
  'a row missing a character still at the table (Dove) stays explicit when another falls'
);

update public.notes
   set player_visible_to = player_visible_to || '12590000-0000-4000-8000-0000000000d1'::uuid
 where id = '12590000-0000-4000-8000-000000000102';
select ok(
  (select shared_with_party from public.notes where id = '12590000-0000-4000-8000-000000000102'),
  'a fallen character is not needed for a share to be the whole party''s'
);

-- ...and Elm, Cedar's replacement, reads it through the player projection.
insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('12590000-0000-4000-8000-0000000000e1', '12590000-0000-4000-8000-000000000001', '12590000-0000-4000-8000-000000000010', 'Elm', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values ('12590000-0000-4000-8000-000000000010', '12590000-0000-4000-8000-000000000002', 'player', 'Newcomer', '12590000-0000-4000-8000-0000000000e1')
on conflict (campaign_id, user_id) do update set party_member_id = excluded.party_member_id, role = excluded.role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12590000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select array_agg(title order by title) from public.get_player_visible_notes('12590000-0000-4000-8000-000000000010')),
  array['Kept from Cedar', 'Told to everyone'],
  'a replacement character reads every note the whole party was told'
);

select ok(
  (select bool_and(shared_with_party) from public.get_player_visible_notes('12590000-0000-4000-8000-000000000010')),
  'the projection returns the flag in its own column'
);

select * from finish();
rollback;
