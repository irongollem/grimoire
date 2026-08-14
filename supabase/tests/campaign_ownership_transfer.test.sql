begin;

create extension if not exists pgtap with schema extensions;
select plan(34);

select has_function(
  'public',
  'transfer_campaign_ownership',
  array['uuid', 'uuid', 'boolean', 'text', 'uuid'],
  'campaign transfer supports an explicit reassign target alongside the scoped-copy disposition'
);
select hasnt_function(
  'public',
  'transfer_campaign_ownership',
  array['uuid', 'uuid', 'boolean', 'text'],
  'the 4-arg overload is retired in favour of the 5-arg reassign-capable RPC'
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
    'public.transfer_campaign_ownership(uuid, uuid, boolean, text, uuid)',
    'EXECUTE'
  ),
  'authenticated owners can use the complete transfer RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.transfer_campaign_ownership(uuid, uuid, boolean, text, uuid)',
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

-- ── Reassign: scoped-but-unreferenced originals move to another campaign the
-- outgoing owner still owns, instead of promoting to global or deleting.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-reassign-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-reassign-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('63000000-0000-4000-8000-000000000030', '63000000-0000-4000-8000-000000000005', 'Reassign source'),
  ('63000000-0000-4000-8000-000000000031', '63000000-0000-4000-8000-000000000005', 'Reassign target (kept)');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('63000000-0000-4000-8000-000000000030', '63000000-0000-4000-8000-000000000006', 'player', 'New DM Reassign');

insert into public.monsters (id, user_id, campaign_id, name)
values ('63000000-0000-4000-8000-000000000034', '63000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000030', 'Reassign monster');
insert into public.traps (id, user_id, campaign_id, name)
values ('63000000-0000-4000-8000-000000000035', '63000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000030', 'Reassign trap');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000030',
    '63000000-0000-4000-8000-000000000006',
    false,
    'reassign',
    '63000000-0000-4000-8000-000000000031'
  ) $$,
  'a transfer can reassign the outgoing owner''s originals to another campaign they own'
);

reset role;

select is(
  (select count(*)::integer from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000006'
      and campaign_id = '63000000-0000-4000-8000-000000000030'
      and name = 'Reassign monster'),
  1,
  'the new owner receives an unreferenced scoped monster'
);
select is(
  (select count(*)::integer from public.traps
    where user_id = '63000000-0000-4000-8000-000000000006'
      and campaign_id = '63000000-0000-4000-8000-000000000030'
      and name = 'Reassign trap'),
  1,
  'the new owner receives an unreferenced scoped trap'
);
select is(
  (select campaign_id from public.monsters where id = '63000000-0000-4000-8000-000000000034'),
  '63000000-0000-4000-8000-000000000031'::uuid,
  'the reassigned monster original moves to the target campaign, not global'
);
select is(
  (select campaign_id from public.traps where id = '63000000-0000-4000-8000-000000000035'),
  '63000000-0000-4000-8000-000000000031'::uuid,
  'the reassigned trap original moves to the target campaign, not global'
);

-- ── Reassign validation: the target must be a real, caller-owned campaign,
-- and a reassign target on any other disposition is rejected outright rather
-- than silently ignored.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-reassign-validation@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-reassign-foreign-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values
  ('63000000-0000-4000-8000-000000000032', '63000000-0000-4000-8000-000000000007', 'Reassign validation source'),
  ('63000000-0000-4000-8000-000000000033', '63000000-0000-4000-8000-000000000008', 'Not owned by the caller');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000007', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000032',
    '63000000-0000-4000-8000-000000000009',
    false,
    'reassign',
    '63000000-0000-4000-8000-000000000033'
  ) $$,
  'P0001',
  'Reassign target must be a campaign you own',
  'reassigning to a campaign the caller does not own is refused'
);

select throws_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000032',
    '63000000-0000-4000-8000-000000000009',
    false,
    'promote',
    '63000000-0000-4000-8000-000000000033'
  ) $$,
  'P0001',
  'A reassign target is only valid with the ''reassign'' disposition',
  'a reassign target is rejected outright on any other disposition'
);

reset role;

-- ── Quest-referenced GLOBAL monster travels: a monster the campaign has never
-- placed on an encounter, only on a quest_refs row, still gets cloned and the
-- quest_refs row repointed at the clone. The global original is untouched --
-- it is not part of either owner's scoped disposition.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-questref-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-questref-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('63000000-0000-4000-8000-000000000040', '63000000-0000-4000-8000-000000000010', 'Quest ref campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('63000000-0000-4000-8000-000000000040', '63000000-0000-4000-8000-000000000011', 'player', 'New DM QuestRef');

insert into public.monsters (id, user_id, campaign_id, name)
values ('63000000-0000-4000-8000-000000000041', '63000000-0000-4000-8000-000000000010', null, 'Quest ref monster');

insert into public.quests (id, user_id, campaign_id, title)
values ('63000000-0000-4000-8000-000000000042', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000040', 'Quest with a monster ref');

insert into public.quest_refs (quest_id, ref_type, ref_id)
values ('63000000-0000-4000-8000-000000000042', 'monster', '63000000-0000-4000-8000-000000000041');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000040',
    '63000000-0000-4000-8000-000000000011',
    false,
    'promote'
  ) $$,
  'a transfer clones a global monster referenced only through quest_refs'
);

reset role;

select is(
  (select count(*)::integer from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000011'
      and campaign_id is null
      and name = 'Quest ref monster'),
  1,
  'exactly one clone of the quest-referenced global monster exists for the new owner'
);
select is(
  (select count(*)::integer from public.quest_refs qr
    join public.monsters m on m.id = qr.ref_id::uuid
    where qr.quest_id = '63000000-0000-4000-8000-000000000042'
      and qr.ref_type = 'monster'
      and m.user_id = '63000000-0000-4000-8000-000000000011'
      and m.campaign_id is null),
  1,
  'the quest_refs row is repointed at the clone''s id'
);
select is(
  (select count(*)::integer from public.monsters
    where id = '63000000-0000-4000-8000-000000000041'
      and user_id = '63000000-0000-4000-8000-000000000010'
      and campaign_id is null),
  1,
  'the global original is untouched and still owned by the outgoing DM'
);

-- ── Beat-attachment monster repoint through the patched validator: a global
-- monster placed on a quest beat (attachment_type 'monster') must still be
-- placeable after the transfer flips campaigns.user_id, because the
-- validator's global-row arm now also accepts the campaign's current owner.
-- This is the regression test for that patch -- without it this update fails
-- with "Invalid monster attachment ..." instead of repointing.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-beatattach-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-beatattach-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('63000000-0000-4000-8000-000000000050', '63000000-0000-4000-8000-000000000012', 'Beat attachment campaign');

-- The create_dm_membership trigger on public.campaigns already inserted the
-- owner's 'dm' row above; only the recipient's consent-membership row is
-- needed here (same pattern as every other scenario in this file).
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('63000000-0000-4000-8000-000000000050', '63000000-0000-4000-8000-000000000013', 'player', 'New DM BeatAttach');

insert into public.monsters (id, user_id, campaign_id, name)
values ('63000000-0000-4000-8000-000000000051', '63000000-0000-4000-8000-000000000012', null, 'Beat attachment monster');

insert into public.quests (id, user_id, campaign_id, title)
values ('63000000-0000-4000-8000-000000000052', '63000000-0000-4000-8000-000000000012', '63000000-0000-4000-8000-000000000050', 'Quest with a beat monster');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('63000000-0000-4000-8000-000000000053', '63000000-0000-4000-8000-000000000052', '63000000-0000-4000-8000-000000000050', 'Beat with a monster');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000012', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '63000000-0000-4000-8000-000000000054',
      '63000000-0000-4000-8000-000000000053',
      '63000000-0000-4000-8000-000000000052',
      '63000000-0000-4000-8000-000000000050',
      'monster',
      '63000000-0000-4000-8000-000000000051'
    )
  $$,
  'the outgoing DM can place their own global monster on a beat before transfer'
);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000050',
    '63000000-0000-4000-8000-000000000013',
    false,
    'promote'
  ) $$,
  'the transfer repoints the beat attachment through the patched validator'
);

reset role;

select is(
  (select count(*)::integer from public.quest_beat_attachments qba
    join public.monsters m on m.id = qba.ref_id::uuid
    where qba.id = '63000000-0000-4000-8000-000000000054'
      and m.user_id = '63000000-0000-4000-8000-000000000013'
      and m.campaign_id is null),
  1,
  'the attachment''s ref_id equals the new clone''s id'
);
select is(
  (select count(*)::integer from public.quest_refs
    where quest_id = '63000000-0000-4000-8000-000000000052' and ref_type = 'monster'),
  1,
  'the sync-trigger mirror row is repointed too, with no old+new duplicate'
);

-- ── Single clone when referenced from both an encounter and a quest: the
-- same global monster sits in an encounter's combatants AND on a quest_refs
-- row. Only one clone should be made, and both references should land on it.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('63000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-doubleref-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('63000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue630-doubleref-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('63000000-0000-4000-8000-000000000060', '63000000-0000-4000-8000-000000000014', 'Double reference campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('63000000-0000-4000-8000-000000000060', '63000000-0000-4000-8000-000000000015', 'player', 'New DM DoubleRef');

insert into public.monsters (id, user_id, campaign_id, name)
values ('63000000-0000-4000-8000-000000000061', '63000000-0000-4000-8000-000000000014', null, 'Double-referenced monster');

insert into public.encounters (id, user_id, campaign_id, name, combatants)
values (
  '63000000-0000-4000-8000-000000000062',
  '63000000-0000-4000-8000-000000000014',
  '63000000-0000-4000-8000-000000000060',
  'Encounter with the double-referenced monster',
  '[{"monster_id": "63000000-0000-4000-8000-000000000061"}]'::jsonb
);

insert into public.quests (id, user_id, campaign_id, title)
values ('63000000-0000-4000-8000-000000000063', '63000000-0000-4000-8000-000000000014', '63000000-0000-4000-8000-000000000060', 'Quest also referencing the monster');

insert into public.quest_refs (quest_id, ref_type, ref_id)
values ('63000000-0000-4000-8000-000000000063', 'monster', '63000000-0000-4000-8000-000000000061');

set local role authenticated;
select set_config('request.jwt.claim.sub', '63000000-0000-4000-8000-000000000014', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '63000000-0000-4000-8000-000000000060',
    '63000000-0000-4000-8000-000000000015',
    false,
    'delete'
  ) $$,
  'a transfer clones a monster referenced from both an encounter and a quest exactly once'
);

reset role;

select is(
  (select count(*)::integer from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000015'
      and campaign_id is null
      and name = 'Double-referenced monster'),
  1,
  'exactly one clone exists despite two independent reference sources'
);
select is(
  (select (combatants->0->>'monster_id') from public.encounters
    where id = '63000000-0000-4000-8000-000000000062'),
  (select id::text from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000015' and campaign_id is null and name = 'Double-referenced monster'),
  'the encounter combatant now points at the single clone'
);
select is(
  (select ref_id from public.quest_refs
    where quest_id = '63000000-0000-4000-8000-000000000063' and ref_type = 'monster'),
  (select id::text from public.monsters
    where user_id = '63000000-0000-4000-8000-000000000015' and campaign_id is null and name = 'Double-referenced monster'),
  'the quest_refs row also points at the single clone'
);

select * from finish();
rollback;
