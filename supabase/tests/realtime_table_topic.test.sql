-- The table topic (#1125 decision 12, 20261103093426): pings, measure lines and drawings are Broadcast messages a
-- member sends on `table:<campaign id>`. Only a member of that campaign (DM or player) may hear or send on it; the
-- doorbell stays receive-only; every predicate is total. Measures, drawings and clears travel on `table-dm:<id>`,
-- which only the DM may send on (20261103093434): Realtime authorizes a sender at join, never per message.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('99910000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'table-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99910000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'table-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('99910000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'table-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('99910000-0000-4000-8000-000000000010', '99910000-0000-4000-8000-000000000001', 'Table'),
  ('99910000-0000-4000-8000-000000000011', '99910000-0000-4000-8000-000000000003', 'Elsewhere');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('99910000-0000-4000-8000-000000000010', '99910000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('99910000-0000-4000-8000-000000000010', '99910000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('99910000-0000-4000-8000-000000000011', '99910000-0000-4000-8000-000000000003', 'dm', 'Stranger')
on conflict (campaign_id, user_id) do update set role = excluded.role;

set local role authenticated;

select set_config('request.jwt.claim.sub', '99910000-0000-4000-8000-000000000002', true);
select is(private.can_send_realtime_topic('table:99910000-0000-4000-8000-000000000010'), true,
  'a player may send on their campaign''s table topic');
select is(private.can_hear_realtime_topic('table:99910000-0000-4000-8000-000000000010'), true,
  'and hear it');
select is(private.can_send_realtime_topic('doorbell:99910000-0000-4000-8000-000000000010'), false,
  'but may never send on the doorbell: only the database rings it');
select is(private.can_send_realtime_topic('table:99910000-0000-4000-8000-000000000011'), false,
  'nor on another campaign''s table');
select is(private.can_send_realtime_topic('table-dm:99910000-0000-4000-8000-000000000010'), false,
  'a player may not send on the DM''s topic, so cannot clear the DM''s drawings or draw in the DM''s name');
select is(private.can_hear_realtime_topic('table-dm:99910000-0000-4000-8000-000000000010'), true,
  'but hears the DM''s measures and drawings');

select set_config('request.jwt.claim.sub', '99910000-0000-4000-8000-000000000001', true);
select is(private.can_send_realtime_topic('table:99910000-0000-4000-8000-000000000010'), true,
  'the DM may send on the table topic');
select is(private.can_send_realtime_topic('table-dm:99910000-0000-4000-8000-000000000010'), true,
  'and on their own topic');

select set_config('request.jwt.claim.sub', '99910000-0000-4000-8000-000000000003', true);
select is(private.can_send_realtime_topic('table:99910000-0000-4000-8000-000000000010'), false,
  'a stranger may not send on a campaign''s table');
select is(private.can_hear_realtime_topic('table:99910000-0000-4000-8000-000000000010'), false,
  'nor hear it');
select is(private.can_send_realtime_topic('table-dm:99910000-0000-4000-8000-000000000010'), false,
  'a DM of another campaign may not send on this campaign''s DM topic');
select is(private.can_hear_realtime_topic('table-dm:99910000-0000-4000-8000-000000000010'), false,
  'nor hear it');

select is(private.can_send_realtime_topic('table:not-a-uuid'), false, 'a malformed table topic is false, not NULL');
select is(private.can_send_realtime_topic(null), false, 'a missing topic is false, not NULL');
select is(private.can_hear_realtime_topic('table:'), false, 'an empty campaign id is false, not NULL');

-- The policy itself: a member inserting a broadcast row on the joined table topic passes, on the doorbell fails.
select set_config('request.jwt.claim.sub', '99910000-0000-4000-8000-000000000002', true);
select set_config('realtime.topic', 'table:99910000-0000-4000-8000-000000000010', true);
select lives_ok(
  $$insert into realtime.messages (topic, extension, event, payload, private)
    values ('table:99910000-0000-4000-8000-000000000010', 'broadcast', 'ping', '{"x":1,"y":2}', true)$$,
  'a player''s ping on the joined table topic is accepted');
select set_config('realtime.topic', 'doorbell:99910000-0000-4000-8000-000000000010', true);
select throws_ok(
  $$insert into realtime.messages (topic, extension, event, payload, private)
    values ('doorbell:99910000-0000-4000-8000-000000000010', 'broadcast', 'ring', '{"table":"notes"}', true)$$,
  '42501', null,
  'a player cannot ring the doorbell');

select * from finish();
rollback;
