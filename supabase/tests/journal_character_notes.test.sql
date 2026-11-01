-- A "Character" journal note belongs to the character it was written for
-- (20261101140455), so a player's next character does not inherit the notes of
-- one who fell. The trigger stamps the author's active character, clears the
-- link outside the category, and refuses a character the author does not play.
--   1 Dana  DM   2 Pia  player (plays Ash, later Birch)   3 Sam  player (plays Cole)

begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'journal-character-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name) values
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000001', 'Journal table');

insert into public.party_members (id, user_id, owner_user_id, is_dm_managed, campaign_id, name, ruleset) values
  ('97600000-0000-4000-8000-0000000000a1', '97600000-0000-4000-8000-000000000002', '97600000-0000-4000-8000-000000000002', false,
   '97600000-0000-4000-8000-0000000000c1', 'Ash', '2014'),
  ('97600000-0000-4000-8000-0000000000a2', '97600000-0000-4000-8000-000000000002', '97600000-0000-4000-8000-000000000002', false,
   '97600000-0000-4000-8000-0000000000c1', 'Birch', '2014'),
  ('97600000-0000-4000-8000-0000000000a3', '97600000-0000-4000-8000-000000000003', '97600000-0000-4000-8000-000000000003', false,
   '97600000-0000-4000-8000-0000000000c1', 'Cole', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000001', 'dm', 'Dana', null),
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'player', 'Pia', '97600000-0000-4000-8000-0000000000a1'),
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000003', 'player', 'Sam', '97600000-0000-4000-8000-0000000000a3')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

create function pg_temp.link_of(p_id uuid) returns uuid language sql security definer as $$
  select party_member_id from public.player_journal_entries where id = p_id;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"97600000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into public.player_journal_entries (id, campaign_id, user_id, title, category) values
  ('97600000-0000-4000-8000-0000000000e1', '97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'Ash''s oath', 'character'),
  ('97600000-0000-4000-8000-0000000000e2', '97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'A rumour', 'rumor');

select is(pg_temp.link_of('97600000-0000-4000-8000-0000000000e1'), '97600000-0000-4000-8000-0000000000a1'::uuid,
  'a character note is stamped with the author''s active character');
select is(pg_temp.link_of('97600000-0000-4000-8000-0000000000e2'), null,
  'a note of any other category belongs to no character');

select throws_ok(
  $$ insert into public.player_journal_entries (campaign_id, user_id, title, category, party_member_id)
     values ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'Not mine', 'character',
             '97600000-0000-4000-8000-0000000000a3') $$,
  '42501', null,
  'a character note cannot be pinned to another player''s character');
select lives_ok(
  $$ insert into public.player_journal_entries (campaign_id, user_id, title, category, party_member_id)
     values ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'For Birch', 'character',
             '97600000-0000-4000-8000-0000000000a2') $$,
  'but can name one of the author''s own characters that is not the active one');

update public.player_journal_entries set category = 'clue' where id = '97600000-0000-4000-8000-0000000000e1';
select is(pg_temp.link_of('97600000-0000-4000-8000-0000000000e1'), null,
  'a note that leaves the category drops its character');
update public.player_journal_entries set category = 'character' where id = '97600000-0000-4000-8000-0000000000e1';

-- Ash falls; Pia now plays Birch.
reset role;
update public.campaign_members set party_member_id = '97600000-0000-4000-8000-0000000000a2'
 where campaign_id = '97600000-0000-4000-8000-0000000000c1' and user_id = '97600000-0000-4000-8000-000000000002';
update public.player_journal_entries set party_member_id = '97600000-0000-4000-8000-0000000000a1'
 where id = '97600000-0000-4000-8000-0000000000e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"97600000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into public.player_journal_entries (id, campaign_id, user_id, title, category) values
  ('97600000-0000-4000-8000-0000000000e3', '97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000002', 'Birch''s vow', 'character');
select is(pg_temp.link_of('97600000-0000-4000-8000-0000000000e3'), '97600000-0000-4000-8000-0000000000a2'::uuid,
  'the new character''s notes go to the new character');

update public.player_journal_entries set title = 'Ash''s oath, kept' where id = '97600000-0000-4000-8000-0000000000e1';
select is(pg_temp.link_of('97600000-0000-4000-8000-0000000000e1'), '97600000-0000-4000-8000-0000000000a1'::uuid,
  'and editing the fallen character''s note does not move it to the new one');

select * from finish();
rollback;
