-- Epic #976, wave 3: features drive pools, and a rest knows what it gives back.
--
-- Held here:
--
--   the rest      a long-rest pool with `short_rest_regain` gets that many uses
--                 back on a short rest, never above its max; a long-rest pool
--                 without it, and everything a short rest has no claim on,
--                 stays put; a short-rest pool refills; a long rest refills all
--   the toggles   every `<key>_active` choice ends on any rest, a `_turn` key
--                 only on a long one, and an unrelated choice is never touched
--   the refusal   a stranger cannot rest someone else's character
--   the data      after the conversion no feature holds mechanics that are not
--                 an object, the 2014 Artificer's markers are gone, every
--                 converted pool key is a plain snake_case word, and a member
--                 who had Rage on keeps it in `class_choices`
--
-- The conversion itself runs on whatever the database held when the migration
-- ran, so its checks are about the shape of the result and hold on an empty
-- dataset too.
--
--   1 Ann  owns the character      2 Bo  a stranger

begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('97601000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'feature-rests-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name, class, level, ruleset, class_resources, class_choices)
values ('97601000-0000-4000-8000-0000000000e1', '97601000-0000-4000-8000-000000000001', '97601000-0000-4000-8000-000000000001',
  null, 'Ann''s barbarian', 'Barbarian', 5, '2014',
  '{"rage_uses":   {"current": 0, "max": 3, "rest": "long", "short_rest_regain": 1},
    "wild_uses":   {"current": 0, "max": 2, "rest": "long"},
    "ki":          {"current": 0, "max": 4, "rest": "short"}}'::jsonb,
  '{"rage_active": true, "innate_sorcery_active": true, "fighting_style": "defense", "sneak_turn": true}'::jsonb);

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"97601000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;
-- Definers, so a check reads the row whoever is signed in.
create function pg_temp.pool(p_key text) returns int language sql security definer as $$
  select (class_resources -> p_key ->> 'current')::int from public.party_members
   where id = '97601000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.choice(p_key text) returns text language sql security definer as $$
  select class_choices ->> p_key from public.party_members
   where id = '97601000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.has_choice(p_key text) returns boolean language sql security definer as $$
  select class_choices ? p_key from public.party_members
   where id = '97601000-0000-4000-8000-0000000000e1';
$$;
create function pg_temp.set_state(p_resources jsonb, p_choices jsonb) returns void language sql security definer as $$
  update public.party_members
     set class_resources = class_resources || p_resources, class_choices = class_choices || p_choices
   where id = '97601000-0000-4000-8000-0000000000e1';
$$;

-- ── The data the conversion left ─────────────────────────────────────────────

select is((select count(*)::int from public.class_features where jsonb_typeof(mechanics) <> 'object'), 0,
  'no feature holds mechanics that are not an object');

select is((select count(*)::int
             from public.system_classes sc, jsonb_each(sc.features) l, jsonb_array_elements_text(l.value) x(v)
             join public.class_features f on f.id::text = x.v
            where sc.ruleset = '2014' and sc.class_name = 'Artificer'
              and (f.name like 'Infusions known:%' or f.name = 'Artificer Specialist feature')), 0,
  'the 2014 Artificer''s map no longer points at a tier marker or a specialist placeholder');

select is((select count(*)::int from public.class_features
            where mechanics ? 'uses' and (mechanics -> 'uses' ->> 'key') !~ '^[a-z][a-z0-9_]*$'), 0,
  'every pool a feature holds is stored under a plain snake_case key');

-- 20261005181019 copied a raging member's flag into class_choices; the cleanup
-- (20261005181021) then drops the column, so only its absence is left to check.
select hasnt_column('public', 'party_members', 'rage_active',
  'Rage lives in class_choices like every other toggle, not in a column of its own');

-- ── The rest ─────────────────────────────────────────────────────────────────

set local role authenticated;
select pg_temp.as_user(1);

select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'short');
select is(pg_temp.pool('rage_uses'), 1, 'a short rest gives a long-rest pool its short_rest_regain back');
select is(pg_temp.pool('ki'), 4, 'a short rest refills a short-rest pool');
select is(pg_temp.pool('wild_uses'), 0, 'a long-rest pool with no short_rest_regain is unchanged by a short rest');
select is(pg_temp.choice('rage_active'), 'false', 'a short rest ends Rage');
select is(pg_temp.choice('innate_sorcery_active'), 'false', 'a short rest ends Innate Sorcery');
select is(pg_temp.choice('fighting_style'), 'defense', 'a choice that is no toggle is untouched by a short rest');
select ok(pg_temp.has_choice('sneak_turn'), 'a turn-scoped key survives a short rest');

select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'short');
select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'short');
select is(pg_temp.pool('rage_uses'), 3, 'the regained uses stack across short rests up to the max');
select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'short');
select is(pg_temp.pool('rage_uses'), 3, 'a short rest never takes a pool above its max');

select pg_temp.set_state('{"rage_uses": {"current": 0, "max": 3, "rest": "long", "short_rest_regain": 1}}'::jsonb,
  '{"rage_active": true}'::jsonb);
select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'long');
select is(pg_temp.pool('rage_uses'), 3, 'a long rest refills a pool that has a short_rest_regain');
select is(pg_temp.pool('wild_uses'), 2, 'a long rest refills a long-rest pool');
select is(pg_temp.choice('rage_active'), 'false', 'a long rest ends a toggle too');
select ok(not pg_temp.has_choice('sneak_turn'), 'a long rest drops the turn-scoped keys');
select is(pg_temp.choice('fighting_style'), 'defense', 'a choice that is no toggle is untouched by a long rest');

-- ── The refusal ──────────────────────────────────────────────────────────────

select pg_temp.as_user(2);
select throws_ok($$ select public.take_spellcasting_rest('97601000-0000-4000-8000-0000000000e1', 'short') $$,
  'P0001', 'Access denied', 'a stranger cannot rest another account''s character');

select * from finish();
rollback;
