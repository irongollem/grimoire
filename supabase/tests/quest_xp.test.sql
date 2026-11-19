begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- XP for a completed quest (#1021 row 27, `20261119192723`). What would go wrong silently: a quest completed twice
-- (reopened, then completed again) paying twice, a milestone campaign paying XP at all, or the share going to another
-- campaign's characters.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qx-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name, game_system) values
  ('10300000-0000-4000-8000-000000000010', '10300000-0000-4000-8000-000000000001', 'By XP', 'dnd5e-2014'),
  ('10300000-0000-4000-8000-000000000011', '10300000-0000-4000-8000-000000000001', 'By milestone', 'dnd5e-2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('10300000-0000-4000-8000-000000000010', '10300000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('10300000-0000-4000-8000-000000000011', '10300000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.campaign_rules (campaign_id, rule_key, enabled) values
  ('10300000-0000-4000-8000-000000000010', 'xp_levelling', true);
insert into public.party_members (id, user_id, campaign_id, name, ruleset, experience_points) values
  ('10300000-0000-4000-8000-000000000030', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000010', 'Wren', '2014', 0),
  ('10300000-0000-4000-8000-000000000031', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000010', 'Ash', '2014', 300),
  ('10300000-0000-4000-8000-000000000032', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000010', 'Pell', '2014', 0),
  ('10300000-0000-4000-8000-000000000039', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000011', 'Elsewhere', '2014', 0);
insert into public.quests (id, user_id, campaign_id, title, status, xp_reward) values
  ('10300000-0000-4000-8000-000000000020', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000010', 'The Salt Road', 'active', 1000),
  ('10300000-0000-4000-8000-000000000021', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000011', 'The Old Map', 'active', 1000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- 1,000 XP between three characters is 333 each, the third of a point dropped.
update public.quests set status = 'completed' where id = '10300000-0000-4000-8000-000000000020';
select is(
  (select array_agg(experience_points order by name) from public.party_members where campaign_id = '10300000-0000-4000-8000-000000000010'),
  array[633, 333, 333],
  'completing the quest shares its XP among the campaign''s characters, rounded down'
);
select is(
  (select experience_points from public.party_members where id = '10300000-0000-4000-8000-000000000039'), 0,
  'a character of another campaign gets nothing'
);

-- Reopened and completed again: nothing more.
update public.quests set status = 'active' where id = '10300000-0000-4000-8000-000000000020';
update public.quests set status = 'completed' where id = '10300000-0000-4000-8000-000000000020';
select is(
  (select experience_points from public.party_members where id = '10300000-0000-4000-8000-000000000030'), 333,
  'a quest completed a second time gives nothing'
);
reset role;
select is(
  (select count(*)::integer from public.campaign_messages where campaign_id = '10300000-0000-4000-8000-000000000010' and message like '%The Salt Road is worth 1000 XP: 333 each%'),
  1, 'the table hears it once'
);

-- A campaign that levels by milestone keeps the number and pays nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.quests set status = 'completed' where id = '10300000-0000-4000-8000-000000000021';
select is(
  (select experience_points from public.party_members where id = '10300000-0000-4000-8000-000000000039'), 0,
  'a campaign without the Experience Points rule gives no quest XP'
);
select is(
  (select xp_awarded_at from public.quests where id = '10300000-0000-4000-8000-000000000021'), null,
  'and does not mark it given'
);
reset role;

select * from finish();
rollback;
