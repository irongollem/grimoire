-- #1204: `campaign_messages.server_rolled` says Grimoire's server rolled the dice. A client must not be able to say so.
--
--   1 DM of c1   2 player in c1
--
-- Each forgery is made by a real member through the normal INSERT policy. The service role's own insert is the
-- positive control: without it, a trigger that cleared the mark for everyone would pass every other assertion here.

begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12040000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'server-roll-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;

insert into public.campaigns (id, user_id, name, game_system) values
  ('12040000-0000-4000-8000-0000000000c1', '12040000-0000-4000-8000-000000000001', 'Server roll c1', 'dnd5e-2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('12040000-0000-4000-8000-0000000000c1', '12040000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('12040000-0000-4000-8000-0000000000c1', '12040000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

create function pg_temp.as_user(p_n int) returns void language sql as $$
  select set_config('request.jwt.claims',
    format('{"sub":"12040000-0000-4000-8000-00000000000%s","role":"authenticated"}', p_n), true);
$$;

-- Read past RLS, so "the row says false" is about the row and not about who may see it.
create function pg_temp.stamp(p_id uuid) returns text language sql security definer as $$
  select server_rolled::text || '|' || coalesce(metadata->>'total', '-') from public.campaign_messages where id = p_id;
$$;

-- ── A player claims the server rolled their natural 20 ─────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.as_user(2);

select lives_ok($$
  insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata, server_rolled)
  values ('12040000-0000-4000-8000-0000000000a1', '12040000-0000-4000-8000-0000000000c1',
          '12040000-0000-4000-8000-000000000002', 'Player', 'rolled 1d20 = 20', 'roll', '{"total": 20}'::jsonb, true)
$$, 'a player may still post a roll of their own');

select is(pg_temp.stamp('12040000-0000-4000-8000-0000000000a1'), 'false|20',
  'a roll a player wrote is never marked as rolled by the server, whatever the insert said');

-- ── The DM is a client too ─────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.as_user(1);
insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata, server_rolled)
values ('12040000-0000-4000-8000-0000000000a2', '12040000-0000-4000-8000-0000000000c1',
        '12040000-0000-4000-8000-000000000001', 'DM', 'rolled 1d20 = 20', 'roll', '{"total": 20}'::jsonb, true);

select is(pg_temp.stamp('12040000-0000-4000-8000-0000000000a2'), 'false|20',
  'the DM cannot mark a roll as the server''s either');

-- ── The server's own roll keeps the mark (positive control) ────────────────────────────────────────────────────────
reset role;
set local role service_role;

insert into public.campaign_messages (id, campaign_id, user_id, sender_name, message, type, metadata, server_rolled)
values ('12040000-0000-4000-8000-0000000000a3', '12040000-0000-4000-8000-0000000000c1',
        '12040000-0000-4000-8000-000000000002', 'Player', 'rolled 1d20 = 7', 'roll', '{"total": 7}'::jsonb, true);

select is(pg_temp.stamp('12040000-0000-4000-8000-0000000000a3'), 'true|7',
  'a roll written with the service role keeps the mark');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type, server_rolled)
  values ('12040000-0000-4000-8000-0000000000c1', '12040000-0000-4000-8000-000000000002', 'Player', 'hello', 'chat', true)
$$, '23514', 'server_rolled is only for roll messages',
  'only a roll can carry the mark: a chat line marked as a server roll is refused');

-- ── Nobody rewrites a stamped roll afterwards ──────────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.as_user(2);

update public.campaign_messages set metadata = '{"total": 20}'::jsonb, message = 'rolled 1d20 = 20'
where id = '12040000-0000-4000-8000-0000000000a3';

select is(pg_temp.stamp('12040000-0000-4000-8000-0000000000a3'), 'true|7',
  'the player it was rolled for cannot change a server roll''s result');

select pg_temp.as_user(1);
update public.campaign_messages set metadata = '{"total": 20}'::jsonb
where id = '12040000-0000-4000-8000-0000000000a3';

select is(pg_temp.stamp('12040000-0000-4000-8000-0000000000a3'), 'true|7',
  'nor can the DM');

reset role;
select * from finish();
rollback;
