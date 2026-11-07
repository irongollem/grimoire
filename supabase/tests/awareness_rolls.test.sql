begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

-- Awareness rolls (20261105100354): a secret Perception d20 per character, rolled when a
-- session starts with the rule on, used and replaced by the DM. Players never read it.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('a7710000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7710000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-p1@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('a7710000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aw-dm2@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name, game_system) values
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'Awareness', 'dnd5e-2014'),
  ('a7710000-0000-4000-8000-000000000011', 'a7710000-0000-4000-8000-000000000004', 'Elsewhere', 'dnd5e-2014');
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, ruleset) values
  ('a7710000-0000-4000-8000-000000000021', 'a7710000-0000-4000-8000-000000000001', 'a7710000-0000-4000-8000-000000000002', 'a7710000-0000-4000-8000-000000000010', 'Mira', '2014'),
  ('a7710000-0000-4000-8000-000000000022', 'a7710000-0000-4000-8000-000000000001', null, 'a7710000-0000-4000-8000-000000000010', 'Bram', '2014'),
  ('a7710000-0000-4000-8000-000000000023', 'a7710000-0000-4000-8000-000000000001', null, 'a7710000-0000-4000-8000-000000000010', 'Old Tam', '2014'),
  ('a7710000-0000-4000-8000-000000000031', 'a7710000-0000-4000-8000-000000000004', null, 'a7710000-0000-4000-8000-000000000011', 'Stranger', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000001', 'dm', 'DM', null),
  ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000002', 'player', 'P1', 'a7710000-0000-4000-8000-000000000021'),
  ('a7710000-0000-4000-8000-000000000011', 'a7710000-0000-4000-8000-000000000004', 'dm', 'DM2', null)
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

-- Old Tam is on the wall: not at the table.
insert into public.character_memorials (party_member_id, campaign_id, kind, character_name, campaign_name)
values ('a7710000-0000-4000-8000-000000000023', 'a7710000-0000-4000-8000-000000000010', 'retired', 'Old Tam', 'Awareness');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000001', true);

-- ── The session start ────────────────────────────────────────────────────────
select public.start_campaign_session('a7710000-0000-4000-8000-000000000010');
select is((select count(*)::int from public.awareness_rolls where campaign_id = 'a7710000-0000-4000-8000-000000000010'),
  0, 'with the rule off, starting a session rolls nothing');
select public.end_campaign_session('a7710000-0000-4000-8000-000000000010');

reset role;
insert into public.campaign_rules (campaign_id, rule_key, enabled)
values ('a7710000-0000-4000-8000-000000000010', 'awareness_rolls', true);
-- A roll left over from last session, already used once: the new session forgets the use.
insert into public.awareness_rolls (campaign_id, party_member_id, d20, d20_second, last_used_d20, last_used_d20_second, last_used_at)
values ('a7710000-0000-4000-8000-000000000010', 'a7710000-0000-4000-8000-000000000021', 3, 4, 11, 12, now());
set local role authenticated;

create temporary table s2 on commit drop as
select (public.start_campaign_session('a7710000-0000-4000-8000-000000000010')).id;

select set_eq(
  $$ select party_member_id from public.awareness_rolls where campaign_id = 'a7710000-0000-4000-8000-000000000010' $$,
  $$ values ('a7710000-0000-4000-8000-000000000021'::uuid), ('a7710000-0000-4000-8000-000000000022'::uuid) $$,
  'with the rule on, the start rolls for every character still playing, and not for a retired one');
select ok((select bool_and(d20 between 1 and 20 and d20_second between 1 and 20) from public.awareness_rolls where campaign_id = 'a7710000-0000-4000-8000-000000000010'),
  'every roll is a pair of d20s, the second for disadvantage');
select is((select last_used_d20 from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  null, 'a new session forgets the roll used last session');

-- Bug: rolling before the early return would reroll on every second press of Start.
update public.awareness_rolls set last_used_d20 = 5, last_used_d20_second = 6 where party_member_id = 'a7710000-0000-4000-8000-000000000021';
select public.start_campaign_session('a7710000-0000-4000-8000-000000000010');
select is((select last_used_d20 from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  5::smallint, 'starting a session that is already open rolls nothing again');

-- Continuing an interrupted evening keeps its numbers.
select public.end_campaign_session('a7710000-0000-4000-8000-000000000010');
select public.resume_campaign_session((select id from s2));
select is((select last_used_d20 from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  5::smallint, 'continuing a session rolls nothing again');

-- ── Using a roll ─────────────────────────────────────────────────────────────
update public.awareness_rolls set d20 = 7, d20_second = 13 where party_member_id = 'a7710000-0000-4000-8000-000000000021';
create temporary table used on commit drop as
select * from public.use_awareness_rolls('a7710000-0000-4000-8000-000000000010',
  array['a7710000-0000-4000-8000-000000000021'::uuid]);
select is((select used_d20 from used), 7::smallint, 'using a roll hands back the waiting one');
select is((select used_d20_second from used), 13::smallint, 'with its second die, so disadvantage can be read off the used pair');
select is((select new_d20 from used), (select d20 from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  'and the number it returns as next is the one now waiting');
select ok((select new_d20 between 1 and 20 from used), 'the next one is a d20');
select is((select new_d20_second from used), (select d20_second from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  'and the next second die is the one now waiting too');
select is((select last_used_d20 from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  7::smallint, 'the used roll stays readable after the toast has gone');
select is((select last_used_d20_second from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000021'),
  13::smallint, 'both of its dice');

reset role;
delete from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000022';
set local role authenticated;
select is((select used_d20 from public.use_awareness_rolls('a7710000-0000-4000-8000-000000000010',
  array['a7710000-0000-4000-8000-000000000022'::uuid])),
  null, 'a character with no roll yet gets a first one, and nothing is reported used');

-- Bug: an id from another campaign, named in this campaign's call, would be planted here.
select is((select count(*)::int from public.use_awareness_rolls('a7710000-0000-4000-8000-000000000010',
  array['a7710000-0000-4000-8000-000000000031'::uuid])),
  0, 'a character from another campaign is skipped');
reset role;
select is((select count(*)::int from public.awareness_rolls where party_member_id = 'a7710000-0000-4000-8000-000000000031'),
  0, 'and gets no row');
set local role authenticated;

-- ── Players never see or touch it ────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000002', true);
select is_empty($$ select 1 from public.awareness_rolls $$, 'a player reads no awareness roll, not even their own');
select throws_ok(
  $$ select * from public.use_awareness_rolls('a7710000-0000-4000-8000-000000000010', array['a7710000-0000-4000-8000-000000000021'::uuid]) $$,
  '42501', 'Not authorized', 'a player cannot use a roll');

-- Positive control for the refusal: the DM of the other campaign is a DM, just not this one's.
select set_config('request.jwt.claim.sub', 'a7710000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select * from public.use_awareness_rolls('a7710000-0000-4000-8000-000000000010', array['a7710000-0000-4000-8000-000000000021'::uuid]) $$,
  '42501', 'Not authorized', 'another campaign''s DM cannot use this campaign''s rolls');
select is_empty($$ select 1 from public.awareness_rolls where campaign_id = 'a7710000-0000-4000-8000-000000000010' $$,
  'nor read them');

select * from finish();
rollback;
