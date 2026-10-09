-- The campaign doorbell over Realtime Broadcast (#999 4.2, 20261009233206).
--
--   send      a change rings its campaign once per transaction, at commit, as one
--             Broadcast message on `campaign:<id>` carrying the table and the
--             requesting tab; never a row
--   hear      only a member of the campaign may read its topic: a stranger, a
--             member of another campaign and anon read nothing, and a malformed
--             topic is false, not NULL
--   quiet     nothing is left published for postgres_changes
--
-- This file reads realtime.messages inside its own transaction. The send is a
-- deferred constraint trigger, so constraints are made immediate here.
begin;
create extension if not exists pgtap with schema extensions;
set constraints all immediate;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('99900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bell-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bell-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99900000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bell-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('99900000-0000-4000-8000-000000000010', '99900000-0000-4000-8000-000000000001', 'Bell'),
  ('99900000-0000-4000-8000-000000000011', '99900000-0000-4000-8000-000000000003', 'Elsewhere');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('99900000-0000-4000-8000-000000000010', '99900000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('99900000-0000-4000-8000-000000000010', '99900000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('99900000-0000-4000-8000-000000000011', '99900000-0000-4000-8000-000000000003', 'dm', 'Stranger')
on conflict (campaign_id, user_id) do update set role = excluded.role;

create function pg_temp.rings(p_campaign text) returns text[] language sql as $$
  select coalesce(array_agg(payload ->> 'table' order by payload ->> 'table'), '{}')
    from realtime.messages
   where topic = 'campaign:' || p_campaign and event = 'ring' and extension = 'broadcast';
$$;

-- ── send ─────────────────────────────────────────────────────────────────────

delete from realtime.messages where topic like 'campaign:99900000-%';
select set_config('request.headers', '{"x-grimoire-tab": "tab-a1"}', true);
insert into public.notes (user_id, campaign_id, title)
values ('99900000-0000-4000-8000-000000000001', '99900000-0000-4000-8000-000000000010', 'A note');
select ok('notes_player' = any (pg_temp.rings('99900000-0000-4000-8000-000000000010')),
  'a change rings its campaign as a Broadcast message naming what changed');
select is((select payload ->> 'origin' from realtime.messages
            where topic = 'campaign:99900000-0000-4000-8000-000000000010' limit 1),
  'tab-a1', 'and names the tab whose request caused it, so that tab can skip its own echo');
select is_empty($$
  select k from realtime.messages, jsonb_object_keys(payload) k
   where topic = 'campaign:99900000-0000-4000-8000-000000000010'
     and k not in ('table', 'origin', 'id')
$$, 'and carries no row: the payload is the table, the tab and the message id, nothing of the note');
select is((select bool_and(private) from realtime.messages where topic = 'campaign:99900000-0000-4000-8000-000000000010'),
  true, 'on a private topic, so only an authorized member can join it');

delete from realtime.messages where topic like 'campaign:99900000-%';
select set_config('request.headers', '{"x-grimoire-tab": "not a token; drop table"}', true);
update public.campaigns set name = 'Bell, renamed' where id = '99900000-0000-4000-8000-000000000010';
select is((select payload -> 'origin' from realtime.messages
            where topic = 'campaign:99900000-0000-4000-8000-000000000010' and payload ->> 'table' = 'campaigns'),
  'null'::jsonb, 'an edit to the campaign row rings it, and a malformed tab header is dropped, not echoed');

select is((select count(distinct (regexp_match(pg_get_triggerdef(g.oid), 'AFTER (INSERT|UPDATE|DELETE)'))[1])::int
             from pg_trigger g
            where g.tgrelid = 'public.encounter_state'::regclass and not g.tgisinternal
              and g.tgfoid = 'public.signal_campaign_change()'::regprocedure),
  3, 'a table that never rang before (encounter_state) now rings on insert, update and delete');

-- ── hear ─────────────────────────────────────────────────────────────────────

select realtime.send('{"table": "probe"}'::jsonb, 'ring', 'campaign:99900000-0000-4000-8000-000000000010', true);

set local role authenticated;
select set_config('realtime.topic', 'campaign:99900000-0000-4000-8000-000000000010', true);

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(exists (select 1 from realtime.messages), 'a player of the campaign hears its topic');

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(exists (select 1 from realtime.messages), 'its DM hears it too');

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$ select 1 from realtime.messages $$,
  'a DM of another campaign hears nothing on this one (positive control: the two above)');

select set_config('realtime.topic', 'campaign:not-a-uuid', true);
select is(private.can_hear_realtime_topic(realtime.topic()), false,
  'a malformed topic is false, never NULL');

reset role;
set local role anon;
select set_config('realtime.topic', 'campaign:99900000-0000-4000-8000-000000000010', true);
select is_empty($$ select 1 from realtime.messages $$, 'anon hears nothing');
reset role;

-- ── quiet ────────────────────────────────────────────────────────────────────

select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime'), 0,
  'no table is published for postgres_changes, so Realtime has nothing to poll');

select * from finish();
rollback;
