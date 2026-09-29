-- #927 story 5 (20260929104117_whispers_respect_young_players): no whispers
-- between an adult and a young player who isn't theirs.
--
-- Exercised as each sender, through the insert policy the browser actually
-- hits, because the rule exists precisely for the caller who skips the chat UI
-- and writes the row by hand.

begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- A kid-run table: Kit (a child) is the DM. Pip is another family's child.
-- Paula is Kit's parent, Quinn is Pip's parent (not at the table), Sam is an
-- adult stranger who got the invite link, Gwen is a former child whose adult_on
-- has passed, and Rae is not in the campaign at all.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
select ('92700000-0000-4000-8000-00000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'whisper-' || n || '@example.invalid', '', '{}'::jsonb, '{}'::jsonb
from generate_series(1, 7) as n;
-- 1 Paula (parent of Kit), 2 Kit (child, DM), 3 Quinn (parent of Pip),
-- 4 Pip (child), 5 Sam (adult stranger), 6 Gwen (grown), 7 Rae (outsider)

insert into public.child_accounts (child_user_id, parent_user_id, login_name, adult_on, consent_version)
values
  ('92700000-0000-4000-8000-000000000002', '92700000-0000-4000-8000-000000000001', 'pgtap-kit', current_date + 400, '2026-09-28'),
  ('92700000-0000-4000-8000-000000000004', '92700000-0000-4000-8000-000000000003', 'pgtap-pip', current_date + 400, '2026-09-28'),
  ('92700000-0000-4000-8000-000000000006', '92700000-0000-4000-8000-000000000001', 'pgtap-gwen', current_date, '2026-09-28');

insert into public.campaigns (id, user_id, name)
values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000002', 'Kit''s table');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000002', 'dm', 'Kit'),
  ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000001', 'player', 'Paula'),
  ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000004', 'player', 'Pip'),
  ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'player', 'Sam'),
  ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000006', 'player', 'Gwen')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- ── The predicate is total ───────────────────────────────────────────────────

select is(
  private.may_whisper('92700000-0000-4000-8000-000000000010', null, '92700000-0000-4000-8000-000000000002'),
  false,
  'may_whisper answers false, never NULL, for a missing sender'
);

set local role authenticated;

-- ── Sam, the adult stranger ──────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"92700000-0000-4000-8000-000000000005","role":"authenticated"}', true);

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'psst', '92700000-0000-4000-8000-000000000002')
$$, '42501', null, 'an adult cannot whisper a child who is not theirs (the child DM)');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'psst', '92700000-0000-4000-8000-000000000004')
$$, '42501', null, 'nor a child player');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'rolled 20', 'dm_roll', '92700000-0000-4000-8000-000000000004')
$$, '42501', null, 'and a whispered roll is held to the same rule');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'psst', '92700000-0000-4000-8000-000000000007')
$$, '42501', null, 'nobody can whisper a user outside the campaign');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'hello', '92700000-0000-4000-8000-000000000001')
$$, 'adults may whisper each other');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'hello', '92700000-0000-4000-8000-000000000006')
$$, 'a former child whose adult_on has passed counts as an adult');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'hi all')
$$, 'a public message is unaffected');

select results_eq(
  $$ select r from public.get_whisper_recipients('92700000-0000-4000-8000-000000000010') as r order by r $$,
  $$ values ('92700000-0000-4000-8000-000000000001'::uuid), ('92700000-0000-4000-8000-000000000006'::uuid) $$,
  'the stranger''s "To:" list holds only the adults'
);

-- ── Kit, the child DM ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"92700000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000002', 'Kit', 'psst', '92700000-0000-4000-8000-000000000005')
$$, '42501', null, 'a child cannot whisper an adult who is not their parent');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000002', 'Kit', 'psst', '92700000-0000-4000-8000-000000000004')
$$, 'children may whisper each other');

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000002', 'Kit', 'mum', '92700000-0000-4000-8000-000000000001')
$$, 'a child may whisper their own parent');

select results_eq(
  $$ select r from public.get_whisper_recipients('92700000-0000-4000-8000-000000000010') as r order by r $$,
  $$ values ('92700000-0000-4000-8000-000000000001'::uuid), ('92700000-0000-4000-8000-000000000004'::uuid) $$,
  'the child''s "To:" list holds their parent and the other child'
);

-- ── Paula, Kit's parent ──────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"92700000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000001', 'Paula', 'dinner', '92700000-0000-4000-8000-000000000002')
$$, 'a parent may whisper their own child');

select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000001', 'Paula', 'psst', '92700000-0000-4000-8000-000000000004')
$$, '42501', null, 'but not someone else''s child');

-- ── Rae, not a member ────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"92700000-0000-4000-8000-000000000007","role":"authenticated"}', true);

select throws_ok($$
  select public.get_whisper_recipients('92700000-0000-4000-8000-000000000010')
$$, 'P0001', 'Not a member of this campaign', 'a non-member cannot list a campaign''s recipients');

reset role;

-- ── Grants ───────────────────────────────────────────────────────────────────

select is(
  has_function_privilege('anon', 'public.get_whisper_recipients(uuid)', 'execute'),
  false,
  'anon cannot call get_whisper_recipients'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, recipient_user_id)
  values ('92700000-0000-4000-8000-000000000010', '92700000-0000-4000-8000-000000000005', 'Sam', 'psst', '92700000-0000-4000-8000-000000000001')
$$, '42501', null, 'without a login nobody can send anything, posing as a member or not');
reset role;

select * from finish();
rollback;
