begin;

create extension if not exists pgtap with schema extensions;
select plan(40);

-- Look after my character (#1059, 20261014214947): a character handed to
-- another member for a session. The caretaker's seat points at it beside the
-- owner's; they play it and do not rebuild it; it comes back when the
-- hand-over ends.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('10590000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'caretaker-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 5) as n;

-- 1 Dana the DM, 2 Pia who owns Mira, 3 Tomas who owns Toma and minds Mira,
-- 4 Oz at the same table, 5 Sam, DM of another table.
insert into public.campaigns (id, user_id, name, ruleset) values
  ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-000000000001', 'Dana''s table', '2024'),
  ('10590000-0000-4000-8000-0000000000c2', '10590000-0000-4000-8000-000000000005', 'Sam''s table', '2024');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-000000000003', 'player', 'Tomas'),
  ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-000000000004', 'player', 'Oz'),
  ('10590000-0000-4000-8000-0000000000c2', '10590000-0000-4000-8000-000000000005', 'dm', 'Sam')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, level, max_hp, current_hp, ruleset, notes, class_choices) values
  ('10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000002', '10590000-0000-4000-8000-000000000002',
   '10590000-0000-4000-8000-0000000000c1', 'Mira', 3, 24, 24, '2024', 'Pia''s notes', '{"feats": ["alert"], "rage_active": false}'::jsonb),
  ('10590000-0000-4000-8000-0000000000a2', '10590000-0000-4000-8000-000000000003', '10590000-0000-4000-8000-000000000003',
   '10590000-0000-4000-8000-0000000000c1', 'Toma', 3, 20, 20, '2024', null, '{}'::jsonb);

select set_config('grimoire.pm_campaign_transition', 'on', true);
update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
 where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000002';
update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a2'
 where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003';
select set_config('grimoire.pm_campaign_transition', 'off', true);

insert into public.character_spells (id, party_member_id, spell_id, source_type, source_label, uses_remaining)
select '10590000-0000-4000-8000-0000000000b1', '10590000-0000-4000-8000-0000000000a1', s.id, 'feat', 'Fey Touched', 1
  from public.library_spells s limit 1;

-- The fixture's spell is from a book the table has not enabled; that review is
-- not under test here, and a pending one would bench the character (CR001).
delete from public.character_content_reviews
 where party_member_id in ('10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-0000000000a2');

insert into public.companions (id, user_id, campaign_id, name, companion_type, source_type, owner_party_member_id, max_hp, current_hp)
values ('10590000-0000-4000-8000-0000000000f1', '10590000-0000-4000-8000-000000000002', '10590000-0000-4000-8000-0000000000c1',
        'Pip', 'familiar', 'custom', '10590000-0000-4000-8000-0000000000a1', 1, 1);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"10590000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Read back whatever the caller's RLS would hide.
create function pg_temp.seat_of(p_n int) returns uuid language sql security definer as $$
  select party_member_id from public.campaign_members
   where campaign_id = '10590000-0000-4000-8000-0000000000c1'
     and user_id = ('10590000-0000-4000-8000-00000000000' || p_n)::uuid;
$$;
create function pg_temp.minds(p_n int) returns boolean language sql security definer as $$
  select private.minds_character('10590000-0000-4000-8000-0000000000a1',
    ('10590000-0000-4000-8000-00000000000' || p_n)::uuid);
$$;

set local role authenticated;

-- ── Who may hand it over ─────────────────────────────────────────────────────

select pg_temp.as_user(3);
select throws_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000003') $$,
  '42501', null, 'a player cannot hand themselves someone else''s character');

select pg_temp.as_user(5);
select throws_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000003') $$,
  '42501', null, 'another table''s DM cannot hand a character over');

select pg_temp.as_user(2);
select throws_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000005') $$,
  'P0001', 'Only someone at this table can look after a character', 'the owner cannot hand it to someone not at the table');
select throws_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000002') $$,
  'P0001', 'A character cannot be handed to its own player', 'the owner cannot hand it to themselves');

-- Before any hand-over, Tomas cannot take Mira up.
select pg_temp.as_user(3);
select throws_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003' $$,
  'P0001', 'Cannot link a character from another campaign or owned by another player',
  'nobody takes up another player''s character uninvited');

select pg_temp.as_user(1);
select throws_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000004' $$,
  'P0001', 'That character belongs to another player',
  'the DM seats nobody on another player''s character without a hand-over');

-- The owner hands Mira to Tomas.
select pg_temp.as_user(2);
select lives_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000003') $$,
  'the owner hands their character to a player at the table');
select ok(pg_temp.minds(3), 'Tomas is minding Mira');

-- ── Taking it up, and switching back and forth ──────────────────────────────

select pg_temp.as_user(3);
select lives_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003' $$,
  'the caretaker takes the character up');
select is(pg_temp.seat_of(2), '10590000-0000-4000-8000-0000000000a1'::uuid, 'the owner''s seat stays on their character');
select lives_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a2'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003' $$,
  'the caretaker switches back to their own character');
select lives_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003' $$,
  'and back again');

select pg_temp.as_user(4);
select throws_ok($$ update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000004' $$,
  'P0001', 'Cannot link a character from another campaign or owned by another player',
  'another player at the table still cannot take it up');

-- ── Playing it ──────────────────────────────────────────────────────────────

select pg_temp.as_user(3);
select lives_ok($$ update public.party_members set current_hp = 17, temp_hp = 5
  where id = '10590000-0000-4000-8000-0000000000a1' $$, 'the caretaker changes hit points');
select lives_ok($$ update public.party_members set class_choices = class_choices || '{"rage_active": true}'::jsonb
  where id = '10590000-0000-4000-8000-0000000000a1' $$, 'the caretaker switches a feature on');
select lives_ok($$ select public.take_spellcasting_rest('10590000-0000-4000-8000-0000000000a1', 'short') $$,
  'the caretaker rests the character');
select lives_ok($$ update public.character_spells set uses_remaining = 0 where id = '10590000-0000-4000-8000-0000000000b1' $$,
  'the caretaker spends an innate spell''s use');

-- ── Not rebuilding it ───────────────────────────────────────────────────────

select throws_ok($$ update public.party_members set notes = 'Tomas was here' where id = '10590000-0000-4000-8000-0000000000a1' $$,
  '42501', 'A character you are looking after stays as its player built it (notes)', 'the caretaker leaves the owner''s notes alone');
select throws_ok($$ update public.party_members set name = 'Mirabelle' where id = '10590000-0000-4000-8000-0000000000a1' $$,
  '42501', 'A character you are looking after stays as its player built it (name)', 'the caretaker does not rename the character');
select throws_ok($$ update public.party_members set class_choices = class_choices || '{"feats": []}'::jsonb
  where id = '10590000-0000-4000-8000-0000000000a1' $$,
  '42501', 'A character you are looking after keeps the choices its player made', 'the caretaker does not change a build choice');
select throws_ok($$ insert into public.character_spells (party_member_id, spell_id, source_type, source_label)
  select '10590000-0000-4000-8000-0000000000a1', s.id, 'feat', 'Magic Initiate' from public.library_spells s offset 1 limit 1 $$,
  '42501', 'A character you are looking after keeps the spells its player chose', 'the caretaker does not learn a spell for it');
select throws_ok($$ select public.set_character_down('10590000-0000-4000-8000-0000000000a1', 'retired', null, null, null, null, null) $$,
  'P0001', 'Access denied', 'the caretaker does not retire the character');
select throws_ok($$ select public.detach_party_member_from_campaign('10590000-0000-4000-8000-0000000000a1') $$,
  'P0001', 'Only the character''s owner or the campaign DM can detach it', 'the caretaker does not take it to another table');

select throws_ok($$ update public.party_members set weapon_masteries = array['longsword'] where id = '10590000-0000-4000-8000-0000000000a1' $$,
  '42501', 'A character you are looking after stays as its player built it (weapon_masteries)', 'weapon masteries are its player''s long-rest choice');
select throws_ok($$ select public.open_spell_change_windows('10590000-0000-4000-8000-0000000000a1', 'level_up') $$,
  '42501', 'Not authorized', 'the caretaker does not refill a level-up spell swap');
select lives_ok($$ select public.open_spell_change_windows('10590000-0000-4000-8000-0000000000a1', 'long_rest') $$,
  'a long rest still opens its windows');
select throws_ok($$ select public.spend_downtime_draw('10590000-0000-4000-8000-0000000000c1', 'carousing') $$,
  '42501', 'Downtime is spent by the character''s own player', 'the caretaker does not spend its player''s downtime');

-- Its companions are played, not remade.
select lives_ok($$ update public.companions set current_hp = 0 where id = '10590000-0000-4000-8000-0000000000f1' $$,
  'the caretaker plays the familiar');
select throws_ok($$ update public.companions set name = 'Squeak' where id = '10590000-0000-4000-8000-0000000000f1' $$,
  '42501', 'A companion you are looking after stays as its player made it', 'the caretaker does not rename it');
select throws_ok($$ delete from public.companions where id = '10590000-0000-4000-8000-0000000000f1' $$,
  '42501', 'A companion you are looking after stays as its player made it', 'the caretaker does not delete it');

-- The owner, unaffected, still edits it as before.
select pg_temp.as_user(2);
select lives_ok($$ update public.party_members set notes = 'Pia''s notes, still' where id = '10590000-0000-4000-8000-0000000000a1' $$,
  'the owner still edits their own character');

-- ── Taking it back ──────────────────────────────────────────────────────────

select lives_ok($$ update public.character_caretakers set revoked_at = now()
  where party_member_id = '10590000-0000-4000-8000-0000000000a1' and revoked_at is null $$,
  'the owner takes the character back');
select is(pg_temp.seat_of(3), '10590000-0000-4000-8000-0000000000a2'::uuid, 'the caretaker''s seat goes back to their own character');
select throws_ok($$ update public.character_caretakers set revoked_at = null
  where party_member_id = '10590000-0000-4000-8000-0000000000a1' $$,
  'P0001', 'This hand-over has already ended', 'an ended hand-over stays ended');

-- ── A hand-over lasts the session ───────────────────────────────────────────

select pg_temp.as_user(1);
select lives_ok($$ insert into public.character_caretakers (campaign_id, party_member_id, caretaker_user_id)
  values ('10590000-0000-4000-8000-0000000000c1', '10590000-0000-4000-8000-0000000000a1', '10590000-0000-4000-8000-000000000003') $$,
  'the DM hands a character over too');
select public.start_campaign_session('10590000-0000-4000-8000-0000000000c1');

select pg_temp.as_user(3);
update public.campaign_members set party_member_id = '10590000-0000-4000-8000-0000000000a1'
 where campaign_id = '10590000-0000-4000-8000-0000000000c1' and user_id = '10590000-0000-4000-8000-000000000003';

select pg_temp.as_user(1);
select public.end_campaign_session('10590000-0000-4000-8000-0000000000c1');
select ok(not pg_temp.minds(3), 'the hand-over lapses when its session ends');
select is(pg_temp.seat_of(3), '10590000-0000-4000-8000-0000000000a2'::uuid, 'and the caretaker''s seat goes home');

select public.resume_campaign_session((select id from public.campaign_sessions
  where campaign_id = '10590000-0000-4000-8000-0000000000c1' order by started_at desc limit 1));
select ok(pg_temp.minds(3), 'continuing the session continues the hand-over');

-- ── The caretaker hands it back ─────────────────────────────────────────────

select pg_temp.as_user(3);
select lives_ok($$ update public.character_caretakers set revoked_at = now()
  where party_member_id = '10590000-0000-4000-8000-0000000000a1' and revoked_at is null $$,
  'the caretaker hands the character back');

select pg_temp.as_user(4);
select is_empty($$ update public.character_caretakers set revoked_at = now() returning id $$,
  'another player ends nobody''s hand-over');

select * from finish();
rollback;
