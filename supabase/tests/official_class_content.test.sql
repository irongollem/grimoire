-- Epic #976: official class features, subclasses and feats are one shared set.
--
-- What is held here, each refusal beside a control:
--
--   reading      rows with no owner (user_id is null) are read by every account;
--                the widening reaches nothing else, so another account's private
--                row stays unreadable
--   writing      only the admin inserts, updates or deletes an official row, in
--                class_features, custom_classes and custom_subclasses, and only
--                the admin edits system_classes
--   the shape    kind, feat_category and mechanics refuse what they cannot hold
--   approval     an official class, subclass or feat is approved when the table
--                has its book, flagged 'source' when it does not, and always when
--                it is Grimoire's own chassis
--   the trigger  a character may take an official subclass of its own edition
--
--   1 Ann  plain account, in no campaign      3 Bo   plain account, owns private rows
--   2 Ada  the app admin                      4 Dana DM of c1 (2014)

begin;

create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97600000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'official-content-' || n || '@example.invalid', '',
       case when n = 2 then '{"provider":"email","role":"admin"}'::jsonb else '{}'::jsonb end,
       '{}'::jsonb
from generate_series(1, 4) as n;

insert into public.campaigns (id, user_id, name, ruleset) values
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000004', 'Dana''s table', '2014');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('97600000-0000-4000-8000-0000000000c1', '97600000-0000-4000-8000-000000000004', 'dm', 'Dana')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- Every campaign starts with both SRDs; make the starting point explicit.
insert into public.campaign_enabled_sources (campaign_id, source_slug)
values ('97600000-0000-4000-8000-0000000000c1', 'srd-2024')
on conflict (campaign_id, source_slug) do nothing;

-- Official rows (no owner), and Bo's private ones.
insert into public.class_features (id, user_id, name, source, ruleset) values
  ('97600000-0000-4000-8000-0000000000f1', null, 'Official Feature', 'srd-2024', '2024'),
  ('97600000-0000-4000-8000-0000000000f2', '97600000-0000-4000-8000-000000000003', 'Bo''s Private Feature', null, '2024');
insert into public.class_features (id, user_id, name, source, ruleset, kind, feat_category) values
  ('97600000-0000-4000-8000-0000000000f3', null, 'Official Chassis Feat', 'grimoire-system', '2024', 'feat', 'general');
insert into public.custom_classes (id, user_id, class_name, source, ruleset) values
  ('97600000-0000-4000-8000-0000000000a1', null, 'Official Class', 'srd-2024', '2024'),
  ('97600000-0000-4000-8000-0000000000a2', '97600000-0000-4000-8000-000000000003', 'Bo''s Private Class', null, '2024');
insert into public.custom_subclasses (id, user_id, class_name, subclass_name, source, ruleset) values
  ('97600000-0000-4000-8000-0000000000b1', null, 'Wizard', 'Official School', 'srd-2024', '2024'),
  ('97600000-0000-4000-8000-0000000000b2', '97600000-0000-4000-8000-000000000003', 'Wizard', 'Bo''s Private School', null, '2024'),
  ('97600000-0000-4000-8000-0000000000b3', null, 'Wizard', 'Old Edition School', 'srd-2014', '2014'),
  ('97600000-0000-4000-8000-0000000000b4', null, 'Wizard', 'Official 2014 School', 'srd-2014', '2014');

-- A 2014 character of Ann's, a Wizard on the built-in class.
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, ruleset, class_choices, level_choices) values
  ('97600000-0000-4000-8000-0000000000e1', '97600000-0000-4000-8000-000000000001', '97600000-0000-4000-8000-000000000001',
   null, 'Ann''s wizard', 'Wizard', 3, '2014', '{}'::jsonb, '{}'::jsonb);
insert into public.character_classes (id, party_member_id, class_name, levels, is_primary, class_definition_id, class_definition_kind)
values ('97600000-0000-4000-8000-0000000000d1', '97600000-0000-4000-8000-0000000000e1', 'Wizard', 3, true,
  (select id from public.system_classes where ruleset = '2014' and class_name = 'Wizard'), 'system');

create function pg_temp.as_user(p_n int, p_admin boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_admin
      then format('{"sub":"97600000-0000-4000-8000-00000000000%s","role":"authenticated","app_metadata":{"provider":"email","role":"admin"}}', p_n)
      else format('{"sub":"97600000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n) end, true);
$$;
-- Definers, so a check reads the row whatever the signed-in account may see.
create function pg_temp.feature_name(p_suffix text) returns text language sql security definer as $$
  select name from public.class_features where id = ('97600000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.class_name_of(p_suffix text) returns text language sql security definer as $$
  select class_name from public.custom_classes where id = ('97600000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.subclass_name_of(p_suffix text) returns text language sql security definer as $$
  select subclass_name from public.custom_subclasses where id = ('97600000-0000-4000-8000-0000000000' || p_suffix)::uuid;
$$;
create function pg_temp.assess(p_kind text, p_suffix text, p_owner int default null) returns text language sql as $$
  select format('%s:%s:%s', a.approved::text, coalesce(a.reason, '-'), coalesce(a.source_slug, '-'))
    from private.assess_content(p_kind, '97600000-0000-4000-8000-0000000000' || p_suffix,
      '97600000-0000-4000-8000-0000000000c1',
      case when p_owner is null then null else ('97600000-0000-4000-8000-00000000000' || p_owner)::uuid end) a;
$$;

-- ── 1. Everyone reads the official set ───────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(1);
select is((select name from public.class_features where id = '97600000-0000-4000-8000-0000000000f1'), 'Official Feature',
  'a plain account reads an official class feature');
select is((select subclass_name from public.custom_subclasses where id = '97600000-0000-4000-8000-0000000000b1'), 'Official School',
  'a plain account reads an official subclass');
select is((select class_name from public.custom_classes where id = '97600000-0000-4000-8000-0000000000a1'), 'Official Class',
  'a plain account reads an official class');

-- ── 3. The widening reaches only rows with no owner ──────────────────────────

select is((select count(*)::int from public.class_features where id = '97600000-0000-4000-8000-0000000000f2'), 0,
  'another account''s private feature stays unreadable');
select is((select count(*)::int from public.custom_subclasses where id = '97600000-0000-4000-8000-0000000000b2'), 0,
  'another account''s private subclass stays unreadable');
select is((select count(*)::int from public.custom_classes where id = '97600000-0000-4000-8000-0000000000a2'), 0,
  'another account''s private class stays unreadable');
select pg_temp.as_user(3);
select is((select count(*)::int from public.class_features where id = '97600000-0000-4000-8000-0000000000f2'), 1,
  'control: the owner reads their own private feature');
select is((select count(*)::int from public.custom_subclasses where id = '97600000-0000-4000-8000-0000000000b2'), 1,
  'control: the owner reads their own private subclass');
select is((select count(*)::int from public.custom_classes where id = '97600000-0000-4000-8000-0000000000a2'), 1,
  'control: the owner reads their own private class');

-- ── 2. Only the admin writes the official set ────────────────────────────────

select pg_temp.as_user(1);
select throws_ok($$ insert into public.class_features (name, user_id) values ('Forged Feature', null) $$,
  '42501', 'new row violates row-level security policy for table "class_features"',
  'a plain account cannot insert an official class feature');
select throws_ok($$ insert into public.custom_subclasses (user_id, class_name, subclass_name) values (null, 'Wizard', 'Forged School') $$,
  '42501', 'new row violates row-level security policy for table "custom_subclasses"',
  'a plain account cannot insert an official subclass');
select throws_ok($$ insert into public.custom_classes (user_id, class_name) values (null, 'Forged Class') $$,
  '42501', 'new row violates row-level security policy for table "custom_classes"',
  'a plain account cannot insert an official class');

with u as (update public.class_features set name = 'Defaced' where id = '97600000-0000-4000-8000-0000000000f1' returning 1)
select is((select count(*)::int from u), 0, 'a plain account updates no official class feature');
with u as (update public.custom_subclasses set subclass_name = 'Defaced' where id = '97600000-0000-4000-8000-0000000000b1' returning 1)
select is((select count(*)::int from u), 0, 'a plain account updates no official subclass');
with u as (update public.custom_classes set class_name = 'Defaced' where id = '97600000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from u), 0, 'a plain account updates no official class');

with d as (delete from public.class_features where id = '97600000-0000-4000-8000-0000000000f1' returning 1)
select is((select count(*)::int from d), 0, 'a plain account deletes no official class feature');
with d as (delete from public.custom_subclasses where id = '97600000-0000-4000-8000-0000000000b1' returning 1)
select is((select count(*)::int from d), 0, 'a plain account deletes no official subclass');
with d as (delete from public.custom_classes where id = '97600000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from d), 0, 'a plain account deletes no official class');

select is(pg_temp.feature_name('f1') || '/' || pg_temp.subclass_name_of('b1') || '/' || pg_temp.class_name_of('a1'),
  'Official Feature/Official School/Official Class', 'and every official row is exactly as it was');

-- The admin does all three.
select pg_temp.as_user(2, true);
select lives_ok($$ insert into public.class_features (id, name, user_id) values ('97600000-0000-4000-8000-0000000000f9', 'Admin Feature', null) $$,
  'control: the admin inserts an official class feature');
select lives_ok($$ insert into public.custom_subclasses (id, user_id, class_name, subclass_name) values ('97600000-0000-4000-8000-0000000000b9', null, 'Wizard', 'Admin School') $$,
  'control: the admin inserts an official subclass');
select lives_ok($$ insert into public.custom_classes (id, user_id, class_name) values ('97600000-0000-4000-8000-0000000000a9', null, 'Admin Class') $$,
  'control: the admin inserts an official class');

with u as (update public.class_features set name = 'Admin Renamed' where id = '97600000-0000-4000-8000-0000000000f9' returning 1)
select is((select count(*)::int from u), 1, 'control: the admin updates an official class feature');
with u as (update public.custom_subclasses set subclass_name = 'Admin Renamed' where id = '97600000-0000-4000-8000-0000000000b9' returning 1)
select is((select count(*)::int from u), 1, 'control: the admin updates an official subclass');
with u as (update public.custom_classes set class_name = 'Admin Renamed' where id = '97600000-0000-4000-8000-0000000000a9' returning 1)
select is((select count(*)::int from u), 1, 'control: the admin updates an official class');

with d as (delete from public.class_features where id = '97600000-0000-4000-8000-0000000000f9' returning 1)
select is((select count(*)::int from d), 1, 'control: the admin deletes an official class feature');
with d as (delete from public.custom_subclasses where id = '97600000-0000-4000-8000-0000000000b9' returning 1)
select is((select count(*)::int from d), 1, 'control: the admin deletes an official subclass');
with d as (delete from public.custom_classes where id = '97600000-0000-4000-8000-0000000000a9' returning 1)
select is((select count(*)::int from d), 1, 'control: the admin deletes an official class');

-- ── 4. system_classes ────────────────────────────────────────────────────────

reset role;
set local role authenticated;
select pg_temp.as_user(1);
with u as (update public.system_classes set features = '{"1": ["tampered"]}'::jsonb where ruleset = '2014' and class_name = 'Wizard' returning 1)
select is((select count(*)::int from u), 0, 'a plain account cannot update a system class');
select pg_temp.as_user(2, true);
with u as (update public.system_classes set features = '{"1": ["admin edit"]}'::jsonb where ruleset = '2014' and class_name = 'Wizard' returning 1)
select is((select count(*)::int from u), 1, 'control: the admin updates a system class');
reset role;
select is((select features from public.system_classes where ruleset = '2014' and class_name = 'Wizard'),
  '{"1": ["admin edit"]}'::jsonb, 'and the admin''s edit is what is stored, not the plain account''s');

-- ── 5. What a feature or feat row can hold ───────────────────────────────────

select throws_ok($$ insert into public.class_features (name, kind) values ('Bad kind', 'spell') $$,
  '23514', null, 'a kind other than feature or feat is refused');
select throws_ok($$ insert into public.class_features (name, kind, feat_category) values ('Bad feature', 'feature', 'general') $$,
  '23514', null, 'a feature cannot carry a feat category');
select throws_ok($$ insert into public.class_features (name, kind, feat_category) values ('Bad category', 'feat', 'cosmic') $$,
  '23514', null, 'a feat category outside the four is refused');
select throws_ok($$ insert into public.class_features (name, mechanics) values ('Bad mechanics', '[]'::jsonb) $$,
  '23514', null, 'mechanics that is a jsonb array is refused');
select lives_ok($$ insert into public.class_features (name, kind, feat_category, repeatable) values ('Good feat', 'feat', 'general', true) $$,
  'control: a general, repeatable feat is accepted');
select lives_ok($$ insert into public.class_features (name, kind, mechanics) values ('Good feature', 'feature', '{"activation": "action"}'::jsonb) $$,
  'control: a feature with object mechanics is accepted');

-- ── 6. Approval ──────────────────────────────────────────────────────────────

select is(pg_temp.assess('subclass', 'b1'), 'true:-:srd-2024', 'an official subclass is approved when the table has its book');
select is(pg_temp.assess('class', 'a1'), 'true:-:srd-2024', 'an official class is approved when the table has its book');

select is(pg_temp.assess('feat', 'f3'), 'true:-:-', 'an official feat of Grimoire''s own chassis is approved');

delete from public.campaign_enabled_sources
 where campaign_id = '97600000-0000-4000-8000-0000000000c1' and source_slug = 'srd-2024';
select is(pg_temp.assess('subclass', 'b1'), 'false:source:srd-2024', 'without the book the official subclass is flagged as source');
select is(pg_temp.assess('feat', 'f1'), 'false:source:srd-2024', 'and so is an official feat of that book');
select is(pg_temp.assess('feat', 'f3'), 'true:-:-', 'but the chassis feat is approved with no sources at all');

select is(pg_temp.assess('subclass', 'b2', 1), 'false:foreign:-',
  'control: a private subclass of somebody else, for a character owned by another account, is foreign');
select is(pg_temp.assess('subclass', 'b2', 3), 'false:homebrew:-',
  'control: the same subclass for its own author''s character is homebrew');

-- ── 7. The subclass trigger ──────────────────────────────────────────────────

select lives_ok($$
  update public.character_classes
     set subclass_name = 'Official 2014 School', subclass_definition_id = '97600000-0000-4000-8000-0000000000b4'
   where id = '97600000-0000-4000-8000-0000000000d1'
$$, 'a character takes an official subclass of its own edition');
select throws_ok($$
  update public.character_classes
     set subclass_name = 'Official School', subclass_definition_id = '97600000-0000-4000-8000-0000000000b1'
   where id = '97600000-0000-4000-8000-0000000000d1'
$$, 'P0001', 'Subclass definition is unavailable for ruleset 2014',
  'but not one of the other edition');

select * from finish();
rollback;
