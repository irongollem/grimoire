-- The campaign doorbell over Realtime Broadcast (#999 4.2, 20261009233206).
--
--   send      a change rings its campaign once per transaction, at commit, as one
--             Broadcast message on `doorbell:<campaign id>` carrying the table and the
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
select plan(26);

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
   where topic = 'doorbell:' || p_campaign and event = 'ring' and extension = 'broadcast';
$$;

-- ── send ─────────────────────────────────────────────────────────────────────

delete from realtime.messages where topic like 'doorbell:99900000-%';
select set_config('request.headers', '{"x-grimoire-tab": "tab-a1"}', true);
insert into public.notes (user_id, campaign_id, title)
values ('99900000-0000-4000-8000-000000000001', '99900000-0000-4000-8000-000000000010', 'A note');
select ok('notes_player' = any (pg_temp.rings('99900000-0000-4000-8000-000000000010')),
  'a change rings its campaign as a Broadcast message naming what changed');
select is((select payload ->> 'origin' from realtime.messages
            where topic = 'doorbell:99900000-0000-4000-8000-000000000010' limit 1),
  'tab-a1', 'and names the tab whose request caused it, so that tab can skip its own echo');
select is_empty($$
  select k from realtime.messages, jsonb_object_keys(payload) k
   where topic = 'doorbell:99900000-0000-4000-8000-000000000010'
     and k not in ('table', 'origin', 'id')
$$, 'and carries no row: the payload is the table, the tab and the message id, nothing of the note');
select is((select bool_and(private) from realtime.messages where topic = 'doorbell:99900000-0000-4000-8000-000000000010'),
  true, 'on a private topic, so only an authorized member can join it');

delete from realtime.messages where topic like 'doorbell:99900000-%';
select set_config('request.headers', '{"x-grimoire-tab": "not a token; drop table"}', true);
update public.campaigns set name = 'Bell, renamed' where id = '99900000-0000-4000-8000-000000000010';
select is((select payload -> 'origin' from realtime.messages
            where topic = 'doorbell:99900000-0000-4000-8000-000000000010' and payload ->> 'table' = 'campaigns'),
  'null'::jsonb, 'an edit to the campaign row rings it, and a malformed tab header is dropped, not echoed');

select is((select count(distinct (regexp_match(pg_get_triggerdef(g.oid), 'AFTER (INSERT|UPDATE|DELETE)'))[1])::int
             from pg_trigger g
            where g.tgrelid = 'public.encounter_state'::regclass and not g.tgisinternal
              and g.tgfoid = 'public.signal_campaign_change()'::regprocedure),
  3, 'a table that never rang before (encounter_state) now rings on insert, update and delete');

-- The tab id is a short token or nothing.
delete from realtime.messages where topic like 'doorbell:99900000-%';
select set_config('request.headers', json_build_object('x-grimoire-tab', repeat('a', 65))::text, true);
update public.campaigns set name = 'Bell 2' where id = '99900000-0000-4000-8000-000000000010';
select is((select payload -> 'origin' from realtime.messages where topic = 'doorbell:99900000-0000-4000-8000-000000000010'),
  'null'::jsonb, 'a 65-character tab id is dropped');
delete from realtime.messages where topic like 'doorbell:99900000-%';
select set_config('request.headers', json_build_object('x-grimoire-tab', repeat('a-_', 21) || 'b')::text, true);
update public.campaigns set name = 'Bell 3' where id = '99900000-0000-4000-8000-000000000010';
select is((select payload ->> 'origin' from realtime.messages where topic = 'doorbell:99900000-0000-4000-8000-000000000010'),
  repeat('a-_', 21) || 'b', 'a 64-character token of letters, digits, - and _ is kept');
delete from realtime.messages where topic like 'doorbell:99900000-%';
select set_config('request.headers', '["x-grimoire-tab"]', true);
update public.campaigns set name = 'Bell 4' where id = '99900000-0000-4000-8000-000000000010';
select is((select payload -> 'origin' from realtime.messages where topic = 'doorbell:99900000-0000-4000-8000-000000000010'),
  'null'::jsonb, 'a header that is not an object gives no origin');

-- ── hear ─────────────────────────────────────────────────────────────────────

select realtime.send('{"table": "probe"}'::jsonb, 'ring', 'doorbell:99900000-0000-4000-8000-000000000010', true);

set local role authenticated;
select set_config('realtime.topic', 'doorbell:99900000-0000-4000-8000-000000000010', true);

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(exists (select 1 from realtime.messages), 'a player of the campaign hears its topic');

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(exists (select 1 from realtime.messages), 'its DM hears it too');

select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is_empty($$ select 1 from realtime.messages $$,
  'a DM of another campaign hears nothing on this one (positive control: the two above)');

select set_config('realtime.topic', 'doorbell:not-a-uuid', true);
select is(private.can_hear_realtime_topic(realtime.topic()), false,
  'a malformed topic is false, never NULL');

-- Totality, as the campaign's own DM (so a true would be a real leak, not a non-member).
select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(private.can_hear_realtime_topic('doorbell:99900000-0000-4000-8000-000000000010'), true,
  'positive control: the DM hears their own campaign');
select is(private.can_hear_realtime_topic('doorbell:99900000-0000-4000-8000-000000000010:extra'), false, 'a suffix after the uuid is false');
select is(private.can_hear_realtime_topic('doorbell:99900000-0000-4000-8000-000000000010' || chr(10)), false, 'a trailing newline is false');
select is(private.can_hear_realtime_topic('campaign:99900000-0000-4000-8000-000000000010'), false,
  'the presence channel''s topic (campaign:<id>) is not the doorbell, so it is false');
select is(private.can_hear_realtime_topic(null), false, 'a missing topic is false, never NULL');
select is(private.can_hear_realtime_topic(''), false, 'an empty topic is false');

-- A member removed mid-session reads nothing on the next query (Realtime caches
-- the join until a rejoin; a ring never carries a row, so that window leaks no data).
reset role;
select realtime.send('{"table": "probe"}'::jsonb, 'ring', 'doorbell:99900000-0000-4000-8000-000000000010', true);
delete from public.campaign_members
 where campaign_id = '99900000-0000-4000-8000-000000000010' and user_id = '99900000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('realtime.topic', 'doorbell:99900000-0000-4000-8000-000000000010', true);
select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is_empty($$ select 1 from realtime.messages $$, 'a removed player hears nothing once their membership is gone');

-- A session that sets the topic by hand still reads only that topic's rows.
select set_config('request.jwt.claims', '{"sub":"99900000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('realtime.topic', 'doorbell:99900000-0000-4000-8000-000000000011', true);
select is_empty($$ select 1 from realtime.messages where topic = 'doorbell:99900000-0000-4000-8000-000000000010' $$,
  'a member of one campaign cannot read another campaign''s rings by setting the topic to their own');

-- No client can forge a ring.
select throws_ok($$ insert into realtime.messages (topic, extension, event, payload, private)
                    values ('doorbell:99900000-0000-4000-8000-000000000011', 'broadcast', 'ring', '{"table":"notes"}', true) $$,
  '42501', null, 'an authenticated client cannot insert a ring, even on its own campaign''s topic');

reset role;
set local role anon;
select set_config('realtime.topic', 'doorbell:99900000-0000-4000-8000-000000000010', true);
select is_empty($$ select 1 from realtime.messages $$, 'anon hears nothing');
reset role;

select ok(not has_function_privilege('authenticated', 'private.ring_campaigns(uuid[], text)', 'EXECUTE')
       and not has_function_privilege('anon', 'private.ring_campaigns(uuid[], text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'private.send_campaign_rings()', 'EXECUTE')
       and not has_function_privilege('authenticated', 'private.signal_campaign_row_change()', 'EXECUTE')
       and not has_function_privilege('authenticated', 'private.signal_encounter_npc_identity_change()', 'EXECUTE'),
  'no client can call the functions that queue or send a ring');
select ok(not has_function_privilege('anon', 'private.can_hear_realtime_topic(text)', 'EXECUTE'),
  'anon cannot call the topic check');

-- ── quiet ────────────────────────────────────────────────────────────────────

select is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime'), 0,
  'no table is published for postgres_changes, so Realtime has nothing to poll');

select * from finish();
rollback;
