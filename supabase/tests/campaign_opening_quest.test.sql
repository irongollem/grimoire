begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

-- Where a campaign's story begins (#1021): `campaigns.opening_quest_id` is a plain uuid, not a foreign key
-- (migration 20261119121105 says why), so the two things a key would have held are held by a trigger and are
-- tested here: it can only name a quest of this campaign, and a quest that is gone does not block anything.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12170000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'opening-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('12170000-0000-4000-8000-000000000010', '12170000-0000-4000-8000-000000000001', 'Opening campaign', 'dnd5e-2024'),
  ('12170000-0000-4000-8000-000000000011', '12170000-0000-4000-8000-000000000001', 'The other campaign', 'dnd5e-2024');

insert into public.quests (id, user_id, campaign_id, title) values
  ('12170000-0000-4000-8000-000000000020', '12170000-0000-4000-8000-000000000001', '12170000-0000-4000-8000-000000000010', 'The prologue'),
  ('12170000-0000-4000-8000-000000000021', '12170000-0000-4000-8000-000000000001', '12170000-0000-4000-8000-000000000011', 'Another campaign''s quest');

-- Positive control: a quest of the campaign can be named.
select lives_ok(
  $$ update public.campaigns set opening_quest_id = '12170000-0000-4000-8000-000000000020'
     where id = '12170000-0000-4000-8000-000000000010' $$,
  'a campaign can open with one of its own quests'
);

select throws_ok(
  $$ update public.campaigns set opening_quest_id = '12170000-0000-4000-8000-000000000021'
     where id = '12170000-0000-4000-8000-000000000010' $$,
  '23514',
  null,
  'a quest of another campaign is refused, even for the same owner'
);

select throws_ok(
  $$ update public.campaigns set opening_quest_id = '12170000-0000-4000-8000-0000000000ff'
     where id = '12170000-0000-4000-8000-000000000010' $$,
  '23514',
  null,
  'an id that is no quest at all is refused'
);

select lives_ok(
  $$ update public.campaigns set opening_quest_id = null where id = '12170000-0000-4000-8000-000000000010' $$,
  'the opening can be cleared'
);

-- A deleted quest leaves the id behind (there is no key to clear it). That must not stop the campaign being edited.
update public.campaigns set opening_quest_id = '12170000-0000-4000-8000-000000000020' where id = '12170000-0000-4000-8000-000000000010';
delete from public.quests where id = '12170000-0000-4000-8000-000000000020';
select lives_ok(
  $$ update public.campaigns set name = 'Renamed' where id = '12170000-0000-4000-8000-000000000010' $$,
  'a campaign whose opening quest was deleted can still be changed'
);

select * from finish();
rollback;
