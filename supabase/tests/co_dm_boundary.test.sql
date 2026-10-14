begin;

create extension if not exists pgtap with schema extensions;
select plan(60);

-- #590. A co-DM takes the chair on their own account: they run the owner's
-- campaign, read and edit everything in it, read the owner's library, and
-- cannot delete the owner's prep, take the keys, or decide who else is a DM.
-- Every assertion runs as `authenticated` with real claims; as `postgres` RLS
-- does not apply and none of this would mean anything. A player and an
-- outsider are the controls: the sweep must not widen sideways.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('59000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codm-owner@example.invalid',   '', '{}', '{}'),
  ('59000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codm-codm@example.invalid',    '', '{}', '{}'),
  ('59000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codm-player@example.invalid',  '', '{}', '{}'),
  ('59000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codm-outside@example.invalid', '', '{}', '{}'),
  ('59000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'codm-second@example.invalid',  '', '{}', '{}');

-- The owner's campaign, and one the co-DM owns (somewhere to try to steal into).
insert into public.campaigns (id, user_id, name) values
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000001', 'The owner''s table'),
  ('59000000-0000-4000-8000-000000000011', '59000000-0000-4000-8000-000000000002', 'The co-DM''s own');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000002', 'dm', 'Co-DM'),
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000003', 'player', 'Player'),
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000005', 'dm', 'Second co-DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- The owner's prep in the campaign, and the owner's personal library.
insert into public.npcs (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000020', '59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000010', 'Durnan');
insert into public.monsters (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000021', '59000000-0000-4000-8000-000000000001', null, 'The owner''s goblin');
insert into public.notes (id, user_id, campaign_id, title) values
  ('59000000-0000-4000-8000-000000000022', '59000000-0000-4000-8000-000000000001', null, 'The owner''s private jotting');
insert into public.locations (id, user_id, campaign_id, name, location_type) values
  ('59000000-0000-4000-8000-000000000023', '59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000010', 'Yawning Portal', 'dungeon');
-- Rows the second co-DM wrote, for the account-deletion hand-back.
insert into public.npcs (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000024', '59000000-0000-4000-8000-000000000005', '59000000-0000-4000-8000-000000000010', 'Second co-DM''s smuggler');
insert into public.location_state_events (user_id, location_id, fact, value) values
  ('59000000-0000-4000-8000-000000000005', '59000000-0000-4000-8000-000000000023', 'looted', true);
-- Lore, a DM note, and a DM invite of the owner's; a monster from the co-DM's
-- own library, for the owner to read.
insert into public.factions (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000026', '59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000010', 'The Zhentarim');
insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm) values
  ('59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000010', 'faction', '59000000-0000-4000-8000-000000000026',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"They owe Durnan."}]}]}', true, false);
insert into public.campaign_invites (campaign_id, created_by, role) values
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000001', 'dm');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('59000000-0000-4000-8000-000000000029', '59000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000003',
   '59000000-0000-4000-8000-000000000010', 'Mira', '2014');
insert into public.monsters (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000027', '59000000-0000-4000-8000-000000000002', null, 'The co-DM''s owlbear');

-- ── The predicates are total ────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(private.is_campaign_owner('59000000-0000-4000-8000-000000000010'), false,
  'is_campaign_owner is false, not NULL, for a co-DM');
select is(private.is_campaign_owner('59000000-0000-4000-8000-0000000000ff'), false,
  'and false for a campaign that does not exist');
select ok('59000000-0000-4000-8000-000000000001' = any (private.dm_library_authors()),
  'a co-DM may read the library of the campaign''s owner');

-- ── A co-DM runs the owner's content ────────────────────────────────────────
select is((select count(*)::int from public.npcs where id = '59000000-0000-4000-8000-000000000020'), 1,
  'a co-DM reads the owner''s NPC in the campaign');
select lives_ok(
  $$update public.npcs set name = 'Durnan the Wary' where id = '59000000-0000-4000-8000-000000000020'$$,
  'a co-DM edits the owner''s NPC');
select is((select name from public.npcs where id = '59000000-0000-4000-8000-000000000020'), 'Durnan the Wary',
  'and the edit lands');
select lives_ok(
  $$delete from public.npcs where id = '59000000-0000-4000-8000-000000000020'$$,
  'a co-DM''s delete of the owner''s NPC is filtered, not an error');
select is((select count(*)::int from public.npcs where id = '59000000-0000-4000-8000-000000000020'), 1,
  'and the owner''s prep is still there');
select throws_ok(
  $$update public.npcs set user_id = '59000000-0000-4000-8000-000000000002' where id = '59000000-0000-4000-8000-000000000020'$$,
  '42501', null, 'a co-DM cannot make the owner''s NPC their own');
select throws_ok(
  $$update public.npcs set campaign_id = '59000000-0000-4000-8000-000000000011' where id = '59000000-0000-4000-8000-000000000020'$$,
  '42501', null, 'nor carry it off to a campaign they own');
select lives_ok(
  $$insert into public.npcs (id, user_id, campaign_id, name)
    values ('59000000-0000-4000-8000-000000000025', '59000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000010', 'A co-DM''s barkeep')$$,
  'a co-DM adds content to the campaign under their own name');

-- ── The catalogues list the campaign, not just the caller's rows ────────────
select ok(
  (public.browse_monsters(array[]::text[], '2014', '59000000-0000-4000-8000-000000000010', 'goblin', 'all', null, 48, 0, 0)::text)
    like '%The owner''s goblin%',
  'the Bestiary a co-DM browses holds the owner''s monsters');

-- ── The owner's library: read, never write ──────────────────────────────────
select is((select count(*)::int from public.monsters where id = '59000000-0000-4000-8000-000000000021'), 1,
  'a co-DM reads the owner''s library monster');
update public.monsters set name = 'Renamed' where id = '59000000-0000-4000-8000-000000000021';
select is((select name from public.monsters where id = '59000000-0000-4000-8000-000000000021'), 'The owner''s goblin',
  'but cannot edit it');
select is((select count(*)::int from public.notes where id = '59000000-0000-4000-8000-000000000022'), 0,
  'and a personal note is not library: the co-DM cannot read it');

-- ── The campaign row: run it, but the keys stay the owner's ─────────────────
select lives_ok(
  $$update public.campaigns set current_year = 1496 where id = '59000000-0000-4000-8000-000000000010'$$,
  'a co-DM advances the in-world year');
select is((select current_year from public.campaigns where id = '59000000-0000-4000-8000-000000000010'), 1496,
  'and it lands');
select throws_ok(
  $$update public.campaigns set ai_enabled = true where id = '59000000-0000-4000-8000-000000000010'$$,
  '42501', null, 'a co-DM cannot switch the owner''s AI on');
select throws_ok(
  $$update public.campaigns set ical_token = gen_random_uuid() where id = '59000000-0000-4000-8000-000000000010'$$,
  '42501', null, 'nor rotate the calendar feed');
select throws_ok(
  $$update public.campaigns set is_archived = true where id = '59000000-0000-4000-8000-000000000010'$$,
  '42501', null, 'nor archive the campaign');
delete from public.campaigns where id = '59000000-0000-4000-8000-000000000010';
select is((select count(*)::int from public.campaigns where id = '59000000-0000-4000-8000-000000000010'), 1,
  'nor delete it');

-- ── The DM chair is the owner's to give ─────────────────────────────────────
select throws_ok(
  $$update public.campaign_members set role = 'dm'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'a co-DM cannot seat another DM');
select throws_ok(
  $$update public.campaign_members set role = 'player'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'nor demote the owner');
select throws_ok(
  $$delete from public.campaign_members
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'nor take the owner''s seat away');
select throws_ok(
  $$insert into public.campaign_invites (campaign_id, created_by, role)
    values ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000002', 'dm')$$,
  '42501', null, 'nor mint an invite into the DM chair');
select lives_ok(
  $$insert into public.campaign_invites (campaign_id, created_by, role)
    values ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000002', 'player')$$,
  'a co-DM still invites players');
select is((select count(*)::int from public.campaign_invites
            where campaign_id = '59000000-0000-4000-8000-000000000010' and role = 'dm'), 0,
  'nor read the owner''s DM invite, whose token is a seat');

-- ── An edit is not a theft ──────────────────────────────────────────────────
select throws_ok(
  $$update public.npcs set user_id = '59000000-0000-4000-8000-000000000003' where id = '59000000-0000-4000-8000-000000000025'$$,
  '42501', null, 'an author cannot hand their own row, and its quota, to another account');
select throws_ok(
  $$update public.npcs set campaign_id = null where id = '59000000-0000-4000-8000-000000000020'$$,
  '42501', null, 'a co-DM cannot pull the owner''s NPC out of the campaign');
select lives_ok(
  $$update public.factions set name = 'The Black Network' where id = '59000000-0000-4000-8000-000000000026'$$,
  'a co-DM edits the owner''s faction without taking it over');
select is((select (name, user_id)::text from public.factions where id = '59000000-0000-4000-8000-000000000026'),
  '("The Black Network",59000000-0000-4000-8000-000000000001)',
  'and the faction is still the owner''s');
delete from public.factions where id = '59000000-0000-4000-8000-000000000026';
select is((select count(*)::int from public.factions where id = '59000000-0000-4000-8000-000000000026'), 1,
  'but cannot delete it');
select is((select count(*)::int from public.entity_notes where entity_id = '59000000-0000-4000-8000-000000000026'), 1,
  'a co-DM reads the owner''s DM note on the faction');

-- ── The player and the outsider gained nothing ──────────────────────────────
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.npcs where campaign_id = '59000000-0000-4000-8000-000000000010'), 0,
  'a player reads no NPC row (their way in is npcs_player)');
select is((select count(*)::int from public.monsters where id = '59000000-0000-4000-8000-000000000021'), 0,
  'nor the owner''s library');
select is((select count(*)::int from public.entity_notes where entity_id = '59000000-0000-4000-8000-000000000026'), 0,
  'nor the DM''s note');
select throws_ok(
  $$update public.campaign_members set role = 'dm'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'$$,
  'P0001', 'Not allowed to change role or campaign assignment', 'a player cannot promote themselves');

select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.npcs where campaign_id = '59000000-0000-4000-8000-000000000010')
        + (select count(*)::int from public.monsters where id = '59000000-0000-4000-8000-000000000021'), 0,
  'an outsider reads nothing');
select is(private.dm_library_authors(), '{}'::uuid[],
  'dm_library_authors is empty, not NULL, for an account at no table');

-- ── The owner decides, and keeps what the co-DM wrote ───────────────────────
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.npcs where id = '59000000-0000-4000-8000-000000000025'), 1,
  'the owner reads what the co-DM added');
select is((select count(*)::int from public.monsters where id = '59000000-0000-4000-8000-000000000027'), 1,
  'and the co-DM''s own library, so what they brought still hydrates');
-- ── A seat that rotates keeps its two kinds of note apart ──────────────────
-- The player writes a private note as a player; the owner seats them; they
-- write a DM note in the chair; they stand down. The owner never reads the
-- first and always reads the second, whatever the player's role is now.
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm, written_as_dm)
values ('59000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000010', 'quest', 'q-rotate',
        '{"type":"doc","content":[]}', true, false, true);
select is((select written_as_dm from public.entity_notes where entity_id = 'q-rotate'), false,
  'a player''s private note is a player note, whatever the client claims');
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.campaign_members set held_chair = true
 where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003';
select is(
  (select held_chair from public.campaign_members
    where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'),
  false,
  'nobody marks a member as having held the chair by hand, a DM included');
select lives_ok(
  $$update public.campaign_members set role = 'dm'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'$$,
  'the owner seats a player as co-DM');
select is((select count(*)::int from public.entity_notes where entity_id = 'q-rotate'), 0,
  'and still cannot read the note they wrote as a player');
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
insert into public.entity_notes (user_id, campaign_id, entity_type, entity_id, content, is_private, shared_with_dm)
values ('59000000-0000-4000-8000-000000000003', '59000000-0000-4000-8000-000000000010', 'quest', 'q-rotate-dm',
        '{"type":"doc","content":[]}', true, false);
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$update public.campaign_members set role = 'player'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'$$,
  'and stands them down again');
select is((select count(*)::int from public.entity_notes where entity_id = 'q-rotate-dm'), 1,
  'the DM note they wrote in the chair stays readable to the owner');
update public.entity_notes set written_as_dm = false where entity_id = 'q-rotate-dm';
select is((select written_as_dm from public.entity_notes where entity_id = 'q-rotate-dm'), true,
  'and a note''s kind never changes once written');
select is((select user_id from public.party_members where id = '59000000-0000-4000-8000-000000000029'),
  '59000000-0000-4000-8000-000000000003'::uuid,
  'handing the chair back leaves the character they play theirs');
select is(
  (select held_chair from public.campaign_members
    where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000003'),
  true,
  'a player who sat in the chair is remembered as having held it');
select lives_ok(
  $$delete from public.campaign_members
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000002'$$,
  'the owner takes the co-DM''s seat away');
select is((select user_id from public.npcs where id = '59000000-0000-4000-8000-000000000025'),
  '59000000-0000-4000-8000-000000000001'::uuid,
  'what the co-DM wrote passes to the owner');

-- ── A co-DM's account deletion does not take the owner's campaign with it ───
reset role;
delete from auth.users where id = '59000000-0000-4000-8000-000000000005';
select is((select user_id from public.npcs where id = '59000000-0000-4000-8000-000000000024'),
  '59000000-0000-4000-8000-000000000001'::uuid,
  'a deleted co-DM''s NPC survives, now the owner''s');
select is((select user_id from public.location_state_events
            where location_id = '59000000-0000-4000-8000-000000000023' and fact = 'looted'),
  '59000000-0000-4000-8000-000000000001'::uuid,
  'and so does the site state they recorded');

-- ── A co-DM steps down on their own ─────────────────────────────────────────
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000004', 'dm', 'Guest DM');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$update public.campaign_members set role = 'player'
     where campaign_id = '59000000-0000-4000-8000-000000000010' and user_id = '59000000-0000-4000-8000-000000000004'$$,
  'a co-DM hands the chair back');
select is(private.is_campaign_dm('59000000-0000-4000-8000-000000000010'), false,
  'and is a DM there no longer');

-- ── Transfer moves the site state it used to leave behind ───────────────────
reset role;
insert into public.location_state_events (user_id, location_id, fact, value) values
  ('59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000023', 'cleared', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.transfer_campaign_ownership('59000000-0000-4000-8000-000000000010', '59000000-0000-4000-8000-000000000003', false, 'promote')$$,
  'the owner transfers the campaign');
reset role;
select is((select user_id from public.location_state_events
            where location_id = '59000000-0000-4000-8000-000000000023' and fact = 'cleared'),
  '59000000-0000-4000-8000-000000000003'::uuid,
  'and the site state goes with it, not left with the outgoing owner');

-- ── Deleting a campaign is not blocked by what a co-DM wrote in it ──────────
-- The set-null cascades run once the campaign row is gone; the author guard
-- must let them through, and the row returns to its author's library.
reset role;
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('59000000-0000-4000-8000-000000000011', '59000000-0000-4000-8000-000000000001', 'dm', 'Guest');
insert into public.npcs (id, user_id, campaign_id, name) values
  ('59000000-0000-4000-8000-000000000028', '59000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000011', 'A guest''s NPC');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"59000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$delete from public.campaigns where id = '59000000-0000-4000-8000-000000000011'$$,
  'an owner deletes a campaign a co-DM wrote in');
reset role;
select is((select campaign_id from public.npcs where id = '59000000-0000-4000-8000-000000000028'), null::uuid,
  'and the co-DM''s NPC survives in their own library');

select * from finish();
rollback;
