-- #892: a foreign key between two campaign-scoped tables must stay inside the
-- campaign, or point at a global row its owner may use. See migration
-- 20261003151455_same_campaign_references.sql for the rule and why.
begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- ── Structural: no such foreign key may land without the check ──────────────

select is(
  (select coalesce(array_agg(fk order by fk), '{}'::text[]) from (
     select cl.relname || '.' || a.attname as fk
     from pg_constraint con
     join pg_class cl on cl.oid = con.conrelid and cl.relnamespace = 'public'::regnamespace
     join pg_class ref on ref.oid = con.confrelid and ref.relnamespace = 'public'::regnamespace
     join pg_attribute a on a.attrelid = cl.oid and a.attnum = con.conkey[1]
     where con.contype = 'f' and cardinality(con.conkey) = 1 and ref.relname <> 'campaigns'
       and exists (select 1 from pg_attribute x where x.attrelid = cl.oid and x.attname = 'campaign_id' and not x.attisdropped)
       and exists (select 1 from pg_attribute y where y.attrelid = ref.oid and y.attname = 'campaign_id' and not y.attisdropped)
       and not exists (
         select 1 from pg_trigger tg
         where tg.tgrelid = cl.oid
           and tg.tgname = 'zz_same_campaign_refs'
           and tg.tgfoid = 'private.enforce_same_campaign_refs()'::regprocedure
           and a.attname = any (string_to_array(encode(tg.tgargs, 'escape'), '\000'))
           and a.attnum = any (tg.tgattr::int2[])
       )
  ) missing),
  '{}'::text[],
  'every foreign key between campaign-scoped tables is checked by zz_same_campaign_refs, on insert and on update of that column'
);

select is(
  (select array_agg(t.tgrelid::regclass::text) from pg_trigger t
    where t.tgname = 'zz_same_campaign_refs'
      and not exists (select 1 from pg_attribute a where a.attrelid = t.tgrelid and a.attname = 'campaign_id' and a.attnum = any (t.tgattr::int2[]))),
  null,
  'every zz_same_campaign_refs trigger also fires when the row changes campaign'
);

select ok(
  not has_function_privilege('authenticated', 'private.enforce_same_campaign_refs()', 'execute'),
  'the trigger function is not executable by clients'
);

-- ── Behaviour ───────────────────────────────────────────────────────────────
-- Written as the table owner, so RLS stays out of the way, with the JWT subject
-- set so the trigger sees who is writing: it judges by auth.uid(), never by the
-- user_id a client puts in the row.
create function pg_temp.as_writer(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true),
         set_config('request.jwt.claims', case when p_user is null then '' else json_build_object('sub', p_user)::text end, true);
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('89200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue892-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('89200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue892-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('89200000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue892-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000001', 'Mine'),
  ('89200000-0000-4000-8000-000000000011', '89200000-0000-4000-8000-000000000001', 'Also mine'),
  ('89200000-0000-4000-8000-000000000012', '89200000-0000-4000-8000-000000000002', 'Theirs');
insert into public.campaign_members (campaign_id, user_id, role) values
  ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000003', 'player');

insert into public.locations (id, user_id, campaign_id, name) values
  ('89200000-0000-4000-8000-000000000020', '89200000-0000-4000-8000-000000000001', '89200000-0000-4000-8000-000000000010', 'Here'),
  ('89200000-0000-4000-8000-000000000021', '89200000-0000-4000-8000-000000000001', '89200000-0000-4000-8000-000000000011', 'My other campaign'),
  ('89200000-0000-4000-8000-000000000022', '89200000-0000-4000-8000-000000000002', '89200000-0000-4000-8000-000000000012', 'Someone else''s');
insert into public.items (id, user_id, campaign_id, name) values
  ('89200000-0000-4000-8000-000000000030', '89200000-0000-4000-8000-000000000001', null, 'DM vault item'),
  ('89200000-0000-4000-8000-000000000031', '89200000-0000-4000-8000-000000000002', null, 'A stranger''s vault item');
insert into public.encounters (id, user_id, campaign_id, name) values
  ('89200000-0000-4000-8000-000000000040', '89200000-0000-4000-8000-000000000001', '89200000-0000-4000-8000-000000000010', 'Ambush');

select pg_temp.as_writer('89200000-0000-4000-8000-000000000001');

select lives_ok($$
  update public.encounters set location_id = '89200000-0000-4000-8000-000000000020'
  where id = '89200000-0000-4000-8000-000000000040'
$$, 'an encounter may be staged at a location in its own campaign');

select throws_ok($$
  update public.encounters set location_id = '89200000-0000-4000-8000-000000000022'
  where id = '89200000-0000-4000-8000-000000000040'
$$, '23514', null, 'an encounter cannot point at another account''s location (the #892 case)');

select throws_ok($$
  update public.encounters set location_id = '89200000-0000-4000-8000-000000000021'
  where id = '89200000-0000-4000-8000-000000000040'
$$, '23514', null, 'nor at a location in another of the same DM''s campaigns');

select pg_temp.as_writer('89200000-0000-4000-8000-000000000003');

-- Loot a player claims is the DM's vault item (grab_item_drop and friends).
-- Written as the table owner, this is the trigger's own allowance; a client
-- write naming it also has to pass #964's "the campaign has been shown it"
-- check (item_reference_disclosure.test.sql).
select lives_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000003', 'DM vault item', '89200000-0000-4000-8000-000000000030')
$$, 'a player may carry the campaign owner''s global vault item');

select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000003', 'Stolen', '89200000-0000-4000-8000-000000000031')
$$, '23514', null, 'but not a stranger''s global vault item');

-- As a client: a direct write is judged by auth.uid(), whatever user_id it
-- claims. (BEFORE triggers run ahead of RLS, so this is the trigger answering,
-- not the insert policy.)
set local role authenticated;
select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000002', 'Stolen', '89200000-0000-4000-8000-000000000031')
$$, '23514', null, 'nor by writing the stranger''s user_id into the row: a client''s writer is auth.uid(), not the row''s claim');
reset role;

select pg_temp.as_writer(null);
select lives_ok($$
  insert into public.party_inventory (campaign_id, user_id, name, item_id)
  values ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000002', 'Server-written', '89200000-0000-4000-8000-000000000031')
$$, 'a write with no JWT is server code, which RLS already trusts, and is not judged');
select pg_temp.as_writer('89200000-0000-4000-8000-000000000001');

select lives_ok($$
  insert into public.locations (user_id, campaign_id, name, parent_id)
  values ('89200000-0000-4000-8000-000000000001', null, 'Homebrew room', '89200000-0000-4000-8000-000000000020')
$$, 'a DM''s global location may nest under one of their own campaign locations');

select throws_ok($$
  update public.encounters set campaign_id = '89200000-0000-4000-8000-000000000011'
  where id = '89200000-0000-4000-8000-000000000040'
$$, '23514', null, 'moving a row to another campaign re-checks the references it keeps');

-- A row written before the check existed is not blocked from unrelated edits.
alter table public.encounters disable trigger zz_same_campaign_refs;
update public.encounters set location_id = '89200000-0000-4000-8000-000000000022'
where id = '89200000-0000-4000-8000-000000000040';
alter table public.encounters enable trigger zz_same_campaign_refs;

select lives_ok($$
  update public.encounters set name = 'Ambush, renamed'
  where id = '89200000-0000-4000-8000-000000000040'
$$, 'an edit that leaves the references alone is not re-judged');

-- Editors save the whole record (#946), so an unchanged reference arrives in
-- every save. Judging it would lock a legacy row out of editing for good.
select lives_ok($$
  update public.encounters set location_id = '89200000-0000-4000-8000-000000000022', name = 'Ambush again'
  where id = '89200000-0000-4000-8000-000000000040'
$$, 'a whole-record save resending an unchanged reference is not re-judged');

-- The policy half: a member may no longer write a row in someone else's name.
set local role authenticated;
select pg_temp.as_writer('89200000-0000-4000-8000-000000000003');
select throws_ok($$
  insert into public.party_inventory (campaign_id, user_id, name)
  values ('89200000-0000-4000-8000-000000000010', '89200000-0000-4000-8000-000000000002', 'Forged')
$$, '42501', null, 'party_inventory refuses a row whose user_id is not the writer');
reset role;

select * from finish();
rollback;
