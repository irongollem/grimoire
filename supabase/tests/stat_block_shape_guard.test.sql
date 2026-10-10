begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- #1017: the old client lives on in installed PWAs for days after a release, and
-- every stat block it saves would crash the new client. The write guard
-- (`private.guard_stat_block_shape`, migration 20261010004946) keeps the stored
-- shape structured: old defense prose is refused, empty old strings are dropped,
-- a missing `defenses` and a missing entry `structured` are filled in.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('10170000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shape-guard@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

select throws_ok(
  $$insert into public.monsters (id, user_id, name, monster_type, stat_block)
    values ('10170000-0000-4000-8000-000000000010', '10170000-0000-4000-8000-000000000001', 'Old Goblin', 'humanoid',
            '{"challenge_rating": "1/4", "damage_resistances": "fire"}'::jsonb)$$,
  '23514',
  null,
  'old defense prose is refused rather than silently lost'
);

insert into public.monsters (id, user_id, name, monster_type, stat_block)
values ('10170000-0000-4000-8000-000000000011', '10170000-0000-4000-8000-000000000001', 'Blank Goblin', 'humanoid',
        '{"challenge_rating": "1/4", "damage_resistances": "", "condition_immunities": "False",
          "actions": [{"name": "Scimitar", "description": "Melee Weapon Attack: +4 to hit."}]}'::jsonb);

select ok(
  (select not (stat_block ?| array['damage_resistances', 'condition_immunities'])
     from public.monsters where id = '10170000-0000-4000-8000-000000000011'),
  'empty and junk old strings are dropped'
);

select is(
  (select stat_block -> 'defenses' from public.monsters where id = '10170000-0000-4000-8000-000000000011'),
  '{"resistances": [], "immunities": [], "vulnerabilities": [], "condition_immunities": []}'::jsonb,
  'a missing defenses becomes an empty one'
);

select is(
  (select stat_block -> 'actions' -> 0 -> 'structured' from public.monsters where id = '10170000-0000-4000-8000-000000000011'),
  '{"kind": "other", "source": "parsed"}'::jsonb,
  'an entry with no structured payload is kept as prose with nothing to roll'
);

select is(
  (select stat_block -> 'actions' -> 0 ->> 'description' from public.monsters where id = '10170000-0000-4000-8000-000000000011'),
  'Melee Weapon Attack: +4 to hit.',
  'the prose itself is untouched'
);

insert into public.monsters (id, user_id, name, monster_type, stat_block)
values ('10170000-0000-4000-8000-000000000012', '10170000-0000-4000-8000-000000000001', 'New Goblin', 'humanoid',
        '{"challenge_rating": "1/4",
          "defenses": {"resistances": [{"types": ["fire"]}], "immunities": [], "vulnerabilities": [], "condition_immunities": []},
          "actions": [{"name": "Scimitar", "description": "x", "structured": {"kind": "attack", "source": "manual",
             "attack": {"delivery": "melee", "bonus": 4, "hit": [{"dice": "1d6+2", "type": "slashing"}]}}}]}'::jsonb);

select is(
  (select stat_block -> 'actions' -> 0 -> 'structured' ->> 'kind' from public.monsters where id = '10170000-0000-4000-8000-000000000012'),
  'attack',
  'a structured block is stored as written'
);

select throws_ok(
  $$update public.monsters set stat_block = stat_block || '{"damage_immunities": "poison"}'::jsonb
     where id = '10170000-0000-4000-8000-000000000012'$$,
  '23514',
  null,
  'an update that brings old prose back is refused too'
);

-- Every stat-block table carries the guard: a new one added without it fails here.
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_proc p on p.oid = t.tgfoid
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'guard_stat_block_shape' and not t.tgisinternal),
  (select array_agg(c.table_name::text order by c.table_name)
     from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'stat_block'),
  'every table with a stat_block column is guarded'
);

select * from finish();
rollback;
