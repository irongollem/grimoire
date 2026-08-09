begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('68000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-fix-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68000000-0000-4000-8000-000000000002', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'ai-fix-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68000000-0000-4000-8000-000000000003', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'ai-fix-ledger@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68000000-0000-4000-8000-000000000004', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'ai-fix-selfserve@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('68000000-0000-4000-8000-000000000010', '68000000-0000-4000-8000-000000000001', 'AI compliance regression test');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('68000000-0000-4000-8000-000000000010', '68000000-0000-4000-8000-000000000002', 'player', 'Player');

set local role authenticated;
select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  insert into public.notes (id, user_id, title, category)
  values ('68000000-0000-4000-8000-000000000020', '68000000-0000-4000-8000-000000000002', 'Private note', 'session')
$$, 'players may still create their own global notes');

select throws_ok($$
  insert into public.notes (user_id, campaign_id, title, category)
  values ('68000000-0000-4000-8000-000000000002', '68000000-0000-4000-8000-000000000010', 'Injected note', 'session')
$$, '42501', null, 'players cannot insert notes into a campaign retrieval corpus');

select throws_ok($$
  update public.notes
  set campaign_id = '68000000-0000-4000-8000-000000000010'
  where id = '68000000-0000-4000-8000-000000000020'
$$, '42501', null, 'players cannot move a global note into a campaign retrieval corpus');

select set_config('request.jwt.claim.sub', '68000000-0000-4000-8000-000000000001', true);

select lives_ok($$
  insert into public.notes (user_id, campaign_id, title, category)
  values ('68000000-0000-4000-8000-000000000001', '68000000-0000-4000-8000-000000000010', 'DM session note', 'session')
$$, 'campaign DMs can create campaign notes');

reset role;

insert into public.ai_credit_ledger (id, user_id, delta, reason, pending)
values ('68000000-0000-4000-8000-000000000030', '68000000-0000-4000-8000-000000000003', 10, 'test_grant', false);

select throws_ok($$
  delete from public.ai_credit_ledger
  where id = '68000000-0000-4000-8000-000000000030'
$$, 'P0001', null, 'settled ledger rows remain protected from direct deletion');

-- auth.jwt() reads the whole claims blob, not the per-claim GUCs the RLS tests
-- above use, so the service_role gate needs `request.jwt.claims` set as JSON.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- The actor is the only record of who erased an account, so "self" must really
-- mean self — an admin cannot file their deletion as the user's own request.
select throws_ok($$
  select public.prepare_user_erasure(
    '68000000-0000-4000-8000-000000000003',
    '68000000-0000-4000-8000-000000000001',
    'self'
  )
$$, 'P0001', null, 'a self erasure attributed to a different account is refused');

select lives_ok($$
  select public.prepare_user_erasure(
    '68000000-0000-4000-8000-000000000003',
    '68000000-0000-4000-8000-000000000001',
    'admin'
  )
$$, 'an admin may prepare another account for erasure');

select set_config('request.jwt.claims', '', true);

select lives_ok($$
  delete from auth.users
  where id = '68000000-0000-4000-8000-000000000003'
$$, 'account deletion may proceed despite settled ledger rows');

select is(
  (select count(*)::integer from auth.users where id = '68000000-0000-4000-8000-000000000003'),
  0,
  'the account row is deleted'
);

select is(
  (select count(*)::integer from public.ai_credit_ledger where user_id = '68000000-0000-4000-8000-000000000003'),
  0,
  'no ledger row remains linked to the deleted account'
);

select is(
  (select count(*)::integer from public.ai_credit_ledger
   where id = '68000000-0000-4000-8000-000000000030' and user_id is null and delta = 10),
  1,
  'the settled row survives erasure anonymized — billing evidence is retained, not cascaded away'
);

-- Erasure is a recorded fact, not an inference from a null: without the stamp
-- an unattributable row and an erased one are indistinguishable.
select isnt(
  (select anonymized_at from public.ai_credit_ledger
   where id = '68000000-0000-4000-8000-000000000030'),
  null,
  'the anonymized row records when it was erased'
);

-- The other half of that guarantee: nothing may enter the table already
-- looking erased. This is what dropping NOT NULL would otherwise have allowed.
select throws_ok($$
  insert into public.ai_credit_ledger (user_id, delta, reason, pending)
  values (null, 5, 'orphan_grant', false)
$$, '23514', null, 'a ledger row that is neither attributable nor anonymized is rejected');

select throws_ok($$
  insert into public.purchase_consents (user_id, purpose, consent_version, stripe_session_id)
  values (null, 'credit_pack', 'v1', 'cs_test_orphan')
$$, '23514', null, 'a consent row that is neither attributable nor anonymized is rejected');

-- Who erased the account (#642). The admin survives the deletion, so their id is
-- still on the entry; the target's is kept deliberately, as the receipt.
select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'account_erasure'
     and target_user_id = '68000000-0000-4000-8000-000000000003'
     and admin_user_id = '68000000-0000-4000-8000-000000000001'
     and details ->> 'actor_kind' = 'admin'
     and (details ->> 'ledger_rows_anonymized')::integer = 1),
  1,
  'the erasure is recorded against the admin who performed it'
);

-- An audit log an admin can edit is not an audit log.
select throws_ok($$
  update public.admin_audit_log set action = 'something_else'
  where target_user_id = '68000000-0000-4000-8000-000000000003'
$$, 'P0001', null, 'audit entries cannot be rewritten');

select throws_ok($$
  delete from public.admin_audit_log
  where target_user_id = '68000000-0000-4000-8000-000000000003'
$$, 'P0001', null, 'audit entries cannot be deleted');

-- ── Self-serve erasure ──────────────────────────────────────────────────────
-- The actor is the target here, so deleting them fires ON DELETE SET NULL on
-- the audit entry written moments earlier — an UPDATE, straight into the
-- append-only guard. If that transition is not sanctioned, self-serve account
-- deletion fails outright, so this covers the guard's exception rather than
-- just its refusal.
insert into public.ai_credit_ledger (id, user_id, delta, reason, pending)
values ('68000000-0000-4000-8000-000000000031', '68000000-0000-4000-8000-000000000004', 4, 'test_grant', false);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok($$
  select public.prepare_user_erasure(
    '68000000-0000-4000-8000-000000000004',
    '68000000-0000-4000-8000-000000000004',
    'self'
  )
$$, 'an account may prepare its own erasure');

select set_config('request.jwt.claims', '', true);

select lives_ok($$
  delete from auth.users
  where id = '68000000-0000-4000-8000-000000000004'
$$, 'self-serve deletion survives the audit entry naming the deleted account as actor');

select is(
  (select count(*)::integer from public.admin_audit_log
   where action = 'account_erasure'
     and target_user_id = '68000000-0000-4000-8000-000000000004'
     and admin_user_id is null
     and details ->> 'actor_kind' = 'self'),
  1,
  'the entry outlives its actor — actor_kind is what still says who did it'
);

select * from finish();
rollback;
