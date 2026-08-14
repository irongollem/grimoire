begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function(
  'public',
  'transfer_campaign_ownership',
  array['uuid', 'uuid', 'boolean', 'text'],
  'campaign transfer requires an explicit scoped-copy disposition'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.transfer_campaign_ownership(uuid, uuid, boolean)',
    'EXECUTE'
  ),
  'the legacy transfer overload cannot bypass the disposition choice'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.transfer_campaign_ownership(uuid, uuid, boolean, text)',
    'EXECUTE'
  ),
  'authenticated owners can use the complete transfer RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.transfer_campaign_ownership(uuid, uuid, boolean, text)',
    'EXECUTE'
  ),
  'anonymous callers cannot transfer campaigns'
);

insert into public.plans (id, name) values ('free', 'Free')
on conflict (id) do nothing;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-promote-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-promote-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-delete-old@example.invalid',  '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-delete-new@example.invalid',  '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000001', 'Keep originals'),
  ('63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000003', 'Remove originals');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000002', 'player', 'New DM A'),
  ('63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000004', 'player', 'New DM B');

set local grimoire.bypass_quota = 'on';

-- None of these rows is referenced by campaign content. That is the exact
-- reachability gap from #630.
insert into public.monsters (id, user_id, campaign_id, name)
values
  ('63000000-0000-4000-8000-000000000011', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', 'Unplaced keeper monster'),
  ('63000000-0000-4000-8000-000000000021', '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000020', 'Unplaced removed monster');

insert into public.traps (id, user_id, campaign_id, name)
values
  ('63000000-0000-4000-8000-000000000012', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', 'Unplaced keeper trap'),
  ('63000000-0000-4000-8000-000000000022', '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000020', 'Unplaced removed trap');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000010',
    '63000000-0000-4000-8000-000000000002',
    false,
    'promote'
  ) $$,
  'a transfer can retain the outgoing owner''s originals'
);

reset role;

select is(
  (select count(*)::integer from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000002'
      and campaign_id = '63000000-0000-4000-8000-000000000010'
      and name = 'Unplaced keeper monster'),
  1,
  'the new owner receives an unreferenced scoped monster'
);
select is(
  (select count(*)::integer from public.traps
    where user_id = '63000000-0000-4000-8000-000000000002'
      and campaign_id = '63000000-0000-4000-8000-000000000010'
      and name = 'Unplaced keeper trap'),
  1,
  'the new owner receives an unreferenced scoped trap'
);
select is(
  (select count(*)::integer from public.monsters
    where id = '63000000-0000-4000-8000-000000000011' and campaign_id is null),
  1,
  'retained monster originals become global for the outgoing owner'
);
select is(
  (select count(*)::integer from public.traps
    where id = '63000000-0000-4000-8000-000000000012' and campaign_id is null),
  1,
  'retained trap originals become global for the outgoing owner'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000020',
    '63000000-0000-4000-8000-000000000004',
    true,
    'delete'
  ) $$,
  'a transfer can remove the outgoing owner''s originals'
);

reset role;

select is(
  (select count(*)::integer from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000004'
      and campaign_id = '63000000-0000-4000-8000-000000000020'
      and name = 'Unplaced removed monster'),
  1,
  'deleting the original does not delete the new owner''s monster copy'
);
select is(
  (select count(*)::integer from public.traps
    where user_id = '63000000-0000-4000-8000-000000000004'
      and campaign_id = '63000000-0000-4000-8000-000000000020'
      and name = 'Unplaced removed trap'),
  1,
  'deleting the original does not delete the new owner''s trap copy'
);
select is(
  (select count(*)::integer from public.monsters
    where id = '63000000-0000-4000-8000-000000000021'),
  0,
  'the outgoing owner''s monster original is deleted when chosen'
);
select is(
  (select count(*)::integer from public.traps
    where id = '63000000-0000-4000-8000-000000000022'),
  0,
  'the outgoing owner''s trap original is deleted when chosen'
);

select * from finish();
rollback;
