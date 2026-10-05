-- Epic #973 item 16: assuming a DM-offered character is once per player.
--   1 Dana  DM of the table   2 Pia  player   3 Sam  player (a different one)
-- The second assume by the same player hands back their copy; another player
-- can still take their own copy of the same original.

begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97300000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'assume-once-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 3) as n;

insert into public.campaigns (id, user_id, name) values
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000001', 'Assume table');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000001', 'dm', 'Dana'),
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000002', 'player', 'Pia'),
  ('97300000-0000-4000-8000-0000000000c1', '97300000-0000-4000-8000-000000000003', 'player', 'Sam')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, is_dm_managed, campaign_id, name, ruleset) values
  ('97300000-0000-4000-8000-0000000000e1', '97300000-0000-4000-8000-000000000001', null, true,
   '97300000-0000-4000-8000-0000000000c1', 'Toddy', '2014');

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"97300000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
create function pg_temp.copies(p_owner int) returns bigint language sql security definer as $$
  select count(*) from public.party_members
   where assumed_from_id = '97300000-0000-4000-8000-0000000000e1'
     and owner_user_id = ('97300000-0000-4000-8000-00000000000' || p_owner)::uuid;
$$;
create function pg_temp.active_of(p_owner int) returns uuid language sql security definer as $$
  select party_member_id from public.campaign_members
   where campaign_id = '97300000-0000-4000-8000-0000000000c1'
     and user_id = ('97300000-0000-4000-8000-00000000000' || p_owner)::uuid;
$$;

set local role authenticated;

select pg_temp.as_user(3);
select public.assume_character('97300000-0000-4000-8000-0000000000e1') as sam_copy \gset
select pg_temp.as_user(2);
select public.assume_character('97300000-0000-4000-8000-0000000000e1') as first \gset

select is(pg_temp.copies(2), 1::bigint, 'the first assume makes one copy');
select isnt(:'first'::uuid, '97300000-0000-4000-8000-0000000000e1'::uuid, 'the copy is its own character');
select is(pg_temp.active_of(2), :'first'::uuid, 'the copy is the player''s active character');

select is(public.assume_character('97300000-0000-4000-8000-0000000000e1'), :'first'::uuid,
  'a second assume returns the same copy');
select is(pg_temp.copies(2), 1::bigint, 'a second assume does not duplicate');

-- Switching away and tapping again returns the player to their copy.
select lives_ok($$ update public.campaign_members set party_member_id = null
  where campaign_id = '97300000-0000-4000-8000-0000000000c1' and user_id = '97300000-0000-4000-8000-000000000002' $$,
  'control: the player can switch away from the copy');
select is(public.assume_character('97300000-0000-4000-8000-0000000000e1'), :'first'::uuid,
  'assuming again makes the existing copy active, not a new one');

select isnt(:'sam_copy'::uuid, :'first'::uuid, 'another player still gets their own copy of the same original');
select is(pg_temp.copies(3), 1::bigint, 'the other player has exactly one copy');

select * from finish();
rollback;
