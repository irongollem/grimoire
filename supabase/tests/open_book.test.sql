begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

-- open_book (20261023190317, #1085): the owner releases a frozen snapshot of what the whole party can read.
-- Proven here: only the owner reaches the book, its releases and its two functions; a release needs Pro; anon
-- reads nothing; and the snapshot shows the world exactly what the table sees and nothing more: no entry shared
-- with only part of the party, no field the DM keeps back, no true name behind a disguise, no secret block, no
-- DM-only field, no hidden calendar event, and nothing the DM took out.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('10850000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10850000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10850000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-ada@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10850000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-bram@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('10850000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ob-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('10850000-0000-4000-8000-000000000010', '10850000-0000-4000-8000-000000000001', 'The Saltreach');

insert into public.party_members (id, user_id, campaign_id, name, ruleset) values
  ('10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000003', '10850000-0000-4000-8000-000000000010', 'Ada', '2014'),
  ('10850000-0000-4000-8000-000000000021', '10850000-0000-4000-8000-000000000004', '10850000-0000-4000-8000-000000000010', 'Bram', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('10850000-0000-4000-8000-000000000010', '10850000-0000-4000-8000-000000000001', 'dm', 'Owner', null),
  ('10850000-0000-4000-8000-000000000010', '10850000-0000-4000-8000-000000000002', 'dm', 'Co-DM', null),
  ('10850000-0000-4000-8000-000000000010', '10850000-0000-4000-8000-000000000003', 'player', 'Ada', '10850000-0000-4000-8000-000000000020'),
  ('10850000-0000-4000-8000-000000000010', '10850000-0000-4000-8000-000000000004', 'player', 'Bram', '10850000-0000-4000-8000-000000000021')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Whole party: Ada and Bram. Part of the party: Ada alone.
insert into public.npcs (id, user_id, campaign_id, name, race, occupation, backstory, player_visible_to, player_visible_fields, disguise_name, is_revealed) values
  ('10850000-0000-4000-8000-000000000030', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010',
   'Maren Vell', 'Human', 'Smuggler', 'OB-SECRET-BACKSTORY',
   array['10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000021']::uuid[], array['name', 'race'], null, false),
  ('10850000-0000-4000-8000-000000000031', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010',
   'OB-Only-Ada-Knows', null, null, null,
   array['10850000-0000-4000-8000-000000000020']::uuid[], array['name'], null, false),
  ('10850000-0000-4000-8000-000000000032', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010',
   'OB-True-Name', null, null, null,
   array['10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000021']::uuid[], array['name'], 'The Grey Pilgrim', false),
  ('10850000-0000-4000-8000-000000000033', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010',
   'OB-Taken-Out', null, null, null,
   array['10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000021']::uuid[], array['name'], null, false);

insert into public.locations (id, user_id, campaign_id, name, description, notes, is_description_shared, player_visible_to) values
  ('10850000-0000-4000-8000-000000000040', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010', 'Hollowmere',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"OB public words"}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"OB-SECRET-BLOCK"}]}]}]}',
   'OB-DM-LOCATION-NOTE', true,
   array['10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000021']::uuid[]);

insert into public.deities (id, user_id, campaign_id, name, description, player_visible_to) values
  ('10850000-0000-4000-8000-000000000050', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010', 'Orla',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Saint of the drowned"}]},{"type":"secretBlock","content":[{"type":"paragraph","content":[{"type":"text","text":"OB-DEITY-SECRET"}]}]}]}',
   array['10850000-0000-4000-8000-000000000020', '10850000-0000-4000-8000-000000000021']::uuid[]);

insert into public.calendar_events (id, user_id, campaign_id, title, event_type, player_visible, harptos_year, harptos_month, harptos_day) values
  ('10850000-0000-4000-8000-000000000060', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010', 'Feast of Orla', 'campaign', true, 312, 3, 14),
  ('10850000-0000-4000-8000-000000000061', '10850000-0000-4000-8000-000000000001', '10850000-0000-4000-8000-000000000010', 'OB-HIDDEN-EVENT', 'campaign', false, 312, 3, 20);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Only the owner sets up the book ─────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000003', true);
select throws_ok($$
  insert into public.open_books (campaign_id, slug, title) values ('10850000-0000-4000-8000-000000000010', 'ada-was-here', 'Mine')
$$, '42501', null, 'a player cannot set up the campaign''s book');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000001', true);
select lives_ok($$
  insert into public.open_books (campaign_id, slug, title) values ('10850000-0000-4000-8000-000000000010', 'saltreach', 'The Saltreach')
$$, 'the owner sets up the book');
select lives_ok($$
  insert into public.open_book_entries (campaign_id, entity_type, entity_id, included)
  values ('10850000-0000-4000-8000-000000000010', 'npc', '10850000-0000-4000-8000-000000000033', false)
$$, 'the owner takes an entry out');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000002', true);
select is_empty($$ select 1 from public.open_books $$, 'a co-DM does not see the book: publishing is the owner''s');
select is_empty($$ select 1 from public.open_book_entries $$, 'nor its entries');

-- ── preview_open_book and release_open_book refuse everyone but the owner ───────

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.preview_open_book('10850000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'a player cannot preview the book');
select throws_ok($$ select public.release_open_book('10850000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'a player cannot release the book');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.release_open_book('10850000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'a co-DM cannot release the book');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000005', true);
select throws_ok($$ select public.preview_open_book('10850000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'a stranger cannot preview the book');
select throws_ok($$ select public.release_open_book('10850000-0000-4000-8000-000000000010') $$,
  '42501', 'Not authorized', 'a stranger cannot release the book');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.release_open_book('10850000-0000-4000-8000-000000000010') $$,
  'P0001', 'open_book_requires_pro', 'releasing needs Pro');

-- ── The snapshot is what the whole party sees ───────────────────────────────────

select set_eq(
  $$ select f->>'name' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'folk') f $$,
  $$ values ('Maren Vell'), ('The Grey Pilgrim') $$,
  'Folk: the whole-party NPCs, under their cover; not one shared with Ada alone, not one taken out');
select is(
  (select f->'occupation' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'folk') f
    where f->>'name' = 'Maren Vell'),
  'null'::jsonb,
  'a field the DM does not share stays out (occupation)');
select is(
  (select f->>'race' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'folk') f
    where f->>'name' = 'Maren Vell'),
  'Human',
  'a field the DM shares is in (race)');
select ok(
  (select p->>'description' like '%OB public words%' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'places') p),
  'a shared place description is in');
select set_eq(
  $$ select e->>'title' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'events') e $$,
  $$ values ('Feast of Orla') $$,
  'the calendar shows only what players see');
select ok(
  public.preview_open_book('10850000-0000-4000-8000-000000000010')::text !~ '(OB-SECRET-BACKSTORY|OB-True-Name|OB-SECRET-BLOCK|OB-DM-LOCATION-NOTE|OB-DEITY-SECRET|OB-HIDDEN-EVENT|OB-Only-Ada-Knows|OB-Taken-Out)',
  'nothing the table cannot read appears anywhere in the snapshot');

-- With include_shared off, only what the DM puts in, and never something the party cannot all read.
select lives_ok($$
  update public.open_books set include_shared = false where campaign_id = '10850000-0000-4000-8000-000000000010';
  insert into public.open_book_entries (campaign_id, entity_type, entity_id, included) values
    ('10850000-0000-4000-8000-000000000010', 'npc', '10850000-0000-4000-8000-000000000030', true),
    ('10850000-0000-4000-8000-000000000010', 'npc', '10850000-0000-4000-8000-000000000031', true);
$$, 'the owner turns the default off and puts two people in by hand');
select set_eq(
  $$ select f->>'name' from jsonb_array_elements(public.preview_open_book('10850000-0000-4000-8000-000000000010')->'folk') f $$,
  $$ values ('Maren Vell') $$,
  'putting in an entry the whole party cannot read does nothing');

-- ── Releasing ───────────────────────────────────────────────────────────────────

reset role;
update public.user_subscriptions set plan_id = 'pro', status = 'active' where user_id = '10850000-0000-4000-8000-000000000001';
insert into public.user_subscriptions (user_id, plan_id, status)
select '10850000-0000-4000-8000-000000000001', 'pro', 'active'
 where not exists (select 1 from public.user_subscriptions where user_id = '10850000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000001', true);

select is((public.release_open_book('10850000-0000-4000-8000-000000000010', 'After session 13')).number, 1, 'the first release is number 1');
select is((public.release_open_book('10850000-0000-4000-8000-000000000010')).number, 2, 'the next is number 2');
select results_eq(
  $$ select b.is_open, r.number from public.open_books b join public.open_book_releases r on r.id = b.live_release_id $$,
  $$ values (true, 2) $$,
  'releasing opens the book on the newest release');
select is(
  (select stats->>'folk' from public.open_book_releases where number = 2),
  '1',
  'a release keeps its counts');

select lives_ok($$ delete from public.open_book_releases where number = 2 $$, 'deleting the live release is a no-op, not an error');
select is((select count(*)::int from public.open_book_releases), 2, 'the live release survives an attempt to delete it');

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000003', true);
select is_empty($$ select 1 from public.open_book_releases $$, 'a player reads no release');

-- ── Entries do not outlive their entry ──────────────────────────────────────────

select set_config('request.jwt.claim.sub', '10850000-0000-4000-8000-000000000001', true);
delete from public.npcs where id = '10850000-0000-4000-8000-000000000031';
select is(
  (select count(*)::int from public.open_book_entries where entity_id = '10850000-0000-4000-8000-000000000031'),
  0,
  'deleting an NPC forgets its Open Book choice');

-- ── anon reads nothing ──────────────────────────────────────────────────────────

set local role anon;
select throws_ok($$ select 1 from public.open_books $$, '42501', null, 'anon cannot read open_books: visitors go through the open-book Edge Function');

select * from finish();
rollback;
