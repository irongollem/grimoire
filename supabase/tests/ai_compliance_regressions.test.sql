begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('68000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-fix-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68000000-0000-4000-8000-000000000002', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'ai-fix-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68000000-0000-4000-8000-000000000003', '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated', 'ai-fix-ledger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

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

select * from finish();
rollback;
