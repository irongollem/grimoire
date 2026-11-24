-- #1270 (20261124193712_only_a_dm_speaks_as_an_npc_in_chat): only a DM of the campaign may store a chat line that
-- speaks as an NPC (metadata.for_npc_id). Exercised as each sender through the insert policy, because the rule is for
-- the caller who writes the row by hand.

begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('12700000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'npc-speech-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 2) as n;
-- 1 the DM (owner), 2 a player

insert into public.campaigns (id, user_id, name)
values ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000001', 'The Kettle');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000002', 'player', 'Pell')
on conflict (campaign_id, user_id) do update set role = excluded.role;

set local role authenticated;

-- ── The player ───────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"12700000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Bug caught: a player storing a line that every client draws as an NPC speaking, with a face of their choosing.
select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, metadata)
  values ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000002', 'The Kettle Witch', 'Trust me.',
          '{"for_npc_id": "12700000-0000-4000-8000-000000000099", "speaker_portrait_url": "https://attacker.example/x.png"}')
$$, '42501', null, 'a player cannot store a line that speaks as an NPC');

-- Bug caught: the NULL-predicate trap (metadata ? key is NULL for NULL metadata) refusing every ordinary line.
select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message)
  values ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000002', 'Pell', 'hello')
$$, 'a player''s ordinary line with no metadata is still stored');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, metadata)
  values ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000002', 'Pell', 'look', '{"mentions": []}')
$$, 'a player''s line with other metadata is still stored');

-- ── The DM ───────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"12700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, metadata)
  values ('12700000-0000-4000-8000-000000000010', '12700000-0000-4000-8000-000000000001', 'The Kettle Witch', 'Kettle''s on.',
          '{"for_npc_id": "12700000-0000-4000-8000-000000000099"}')
$$, 'the DM may speak as an NPC');

-- Positive control for the refusal above: the DM is a member the policy otherwise admits.
select ok(private.is_campaign_dm('12700000-0000-4000-8000-000000000010'), 'the owner counts as the campaign''s DM');

select * from finish();
rollback;
