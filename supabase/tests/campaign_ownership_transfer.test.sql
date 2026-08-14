begin;

create extension if not exists pgtap with schema extensions;
select plan(83);

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

-- ── #733: quest-referenced global items/npcs/factions/locations/handouts ───
-- travel through a transfer the same way #630 already made monsters travel.
-- Fresh uuid range (73300000-...) to avoid any collision with the #630
-- fixtures above. Every beat-attachment insert below runs impersonated as
-- the OUTGOING owner (RLS on quest_beat_attachments is
-- private.is_campaign_dm(campaign_id), and the validator trigger checks
-- auth.uid() too), matching the pattern already established above.

-- ── Scenario 1: global item + handout attached to a beat ───────────────────
-- Both are personal-library rows with no campaign_id; both must be cloned for
-- the recipient and both attachments repointed. The item attachment also
-- regresses the item arm of the validator patch, and the quest_refs mirror
-- row for the item must repoint with no duplicate. The handout attachment
-- regresses the handout arm's patch specifically.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-item-handout-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-item-handout-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000110', '73300000-0000-4000-8000-000000000101', 'Item and handout campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000110', '73300000-0000-4000-8000-000000000102', 'player', 'New DM ItemHandout');

insert into public.items (id, user_id, campaign_id, name, item_type, rarity, description)
values ('73300000-0000-4000-8000-000000000111', '73300000-0000-4000-8000-000000000101', null, 'Quest ref item', 'weapon', 'common', 'A blade referenced by a quest beat.');

insert into public.scriptorium_documents (id, user_id, title, doc_type)
values ('73300000-0000-4000-8000-000000000112', '73300000-0000-4000-8000-000000000101', 'Quest handout', 'handout');

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000113', '73300000-0000-4000-8000-000000000101', '73300000-0000-4000-8000-000000000110', 'Quest with a beat item and handout');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000114', '73300000-0000-4000-8000-000000000113', '73300000-0000-4000-8000-000000000110', 'Beat with an item and a handout');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '73300000-0000-4000-8000-000000000115',
      '73300000-0000-4000-8000-000000000114',
      '73300000-0000-4000-8000-000000000113',
      '73300000-0000-4000-8000-000000000110',
      'item',
      '73300000-0000-4000-8000-000000000111'
    )
  $$,
  'the outgoing DM can place their own global item on a beat before transfer'
);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '73300000-0000-4000-8000-000000000116',
      '73300000-0000-4000-8000-000000000114',
      '73300000-0000-4000-8000-000000000113',
      '73300000-0000-4000-8000-000000000110',
      'handout',
      '73300000-0000-4000-8000-000000000112'
    )
  $$,
  'the outgoing DM can place their own handout on a beat before transfer'
);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000110',
    '73300000-0000-4000-8000-000000000102',
    false,
    'promote'
  ) $$,
  'a transfer clones a beat-attached global item and handout'
);

reset role;

select is(
  (select count(*)::integer from public.items
    where user_id = '73300000-0000-4000-8000-000000000102' and campaign_id is null and name = 'Quest ref item'),
  1,
  'exactly one clone of the beat-attached global item exists for the new owner'
);
select is(
  (select count(*)::integer from public.items
    where id = '73300000-0000-4000-8000-000000000111' and user_id = '73300000-0000-4000-8000-000000000101' and campaign_id is null),
  1,
  'the global item original is untouched and still owned by the outgoing DM'
);
select is(
  (select count(*)::integer from public.scriptorium_documents
    where user_id = '73300000-0000-4000-8000-000000000102' and title = 'Quest handout'),
  1,
  'exactly one clone of the beat-attached handout exists for the new owner'
);
select is(
  (select count(*)::integer from public.scriptorium_documents
    where id = '73300000-0000-4000-8000-000000000112' and user_id = '73300000-0000-4000-8000-000000000101'),
  1,
  'the handout original is untouched and still owned by the outgoing DM'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000115'),
  (select id::text from public.items where user_id = '73300000-0000-4000-8000-000000000102' and name = 'Quest ref item'),
  'the item attachment is repointed at the clone -- regression cover for the patched item arm'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000116'),
  (select id::text from public.scriptorium_documents where user_id = '73300000-0000-4000-8000-000000000102' and title = 'Quest handout'),
  'the handout attachment is repointed at the clone -- regression cover for the patched handout arm'
);
select is(
  (select count(*)::integer from public.quest_refs
    where quest_id = '73300000-0000-4000-8000-000000000113' and ref_type = 'item'),
  1,
  'the sync-trigger mirror row for the item exists exactly once, no old+new duplicate'
);
select is(
  (select ref_id from public.quest_refs
    where quest_id = '73300000-0000-4000-8000-000000000113' and ref_type = 'item'),
  (select id::text from public.items where user_id = '73300000-0000-4000-8000-000000000102' and name = 'Quest ref item'),
  'the quest_refs mirror row for the item points at the clone'
);

-- ── Scenario 2: global npc with a monster link and a handout, via quest_refs ─
-- The npc itself is referenced only through a quest_refs row (no beat
-- attachment), exercising the same reachability path #630 covered for
-- monsters. Its linked_monster_id and scriptorium_doc_id are second-order
-- links -- private.campaign_referenced_monster_ids' new npc-linked union and
-- the docs loop's matching union must pull those in too, and the post-clone
-- remap must repoint the CLONE's links, not the original's.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-npc-links-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-npc-links-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000210', '73300000-0000-4000-8000-000000000201', 'NPC links campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000210', '73300000-0000-4000-8000-000000000202', 'player', 'New DM NpcLinks');

insert into public.monsters (id, user_id, campaign_id, name)
values ('73300000-0000-4000-8000-000000000211', '73300000-0000-4000-8000-000000000201', null, 'NPC-linked monster');

insert into public.scriptorium_documents (id, user_id, title, doc_type)
values ('73300000-0000-4000-8000-000000000212', '73300000-0000-4000-8000-000000000201', 'NPC handout doc', 'handout');

insert into public.npcs (id, user_id, campaign_id, name, linked_monster_id, scriptorium_doc_id)
values (
  '73300000-0000-4000-8000-000000000213',
  '73300000-0000-4000-8000-000000000201',
  null,
  'Quest ref npc',
  '73300000-0000-4000-8000-000000000211',
  '73300000-0000-4000-8000-000000000212'
);

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000214', '73300000-0000-4000-8000-000000000201', '73300000-0000-4000-8000-000000000210', 'Quest with an npc ref');

insert into public.quest_refs (quest_id, ref_type, ref_id)
values ('73300000-0000-4000-8000-000000000214', 'npc', '73300000-0000-4000-8000-000000000213');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000201', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000210',
    '73300000-0000-4000-8000-000000000202',
    false,
    'promote'
  ) $$,
  'a transfer clones a quest-referenced global npc and its second-order links'
);

reset role;

select is(
  (select count(*)::integer from public.npcs
    where user_id = '73300000-0000-4000-8000-000000000202' and campaign_id is null and name = 'Quest ref npc'),
  1,
  'exactly one clone of the quest-referenced npc exists for the new owner'
);
select is(
  (select count(*)::integer from public.monsters
    where user_id = '73300000-0000-4000-8000-000000000202' and campaign_id is null and name = 'NPC-linked monster'),
  1,
  'the npc''s linked monster is cloned too, via the extended reachability helper'
);
select is(
  (select count(*)::integer from public.scriptorium_documents
    where user_id = '73300000-0000-4000-8000-000000000202' and title = 'NPC handout doc'),
  1,
  'the npc''s handout is cloned too, via the docs loop''s extended reachability'
);
select is(
  (select m.id::text from public.npcs n join public.monsters m on m.id = n.linked_monster_id
    where n.user_id = '73300000-0000-4000-8000-000000000202' and n.name = 'Quest ref npc'),
  (select id::text from public.monsters where user_id = '73300000-0000-4000-8000-000000000202' and name = 'NPC-linked monster'),
  'the npc CLONE''s linked_monster_id points at the monster clone, not the original'
);
select is(
  (select d.id::text from public.npcs n join public.scriptorium_documents d on d.id = n.scriptorium_doc_id
    where n.user_id = '73300000-0000-4000-8000-000000000202' and n.name = 'Quest ref npc'),
  (select id::text from public.scriptorium_documents where user_id = '73300000-0000-4000-8000-000000000202' and title = 'NPC handout doc'),
  'the npc CLONE''s scriptorium_doc_id points at the handout clone, not the original'
);
select is(
  (select ref_id from public.quest_refs where quest_id = '73300000-0000-4000-8000-000000000214' and ref_type = 'npc'),
  (select id::text from public.npcs where user_id = '73300000-0000-4000-8000-000000000202' and name = 'Quest ref npc'),
  'the quest_refs row is repointed at the npc clone'
);
select is(
  (select linked_monster_id from public.npcs where id = '73300000-0000-4000-8000-000000000213'),
  '73300000-0000-4000-8000-000000000211'::uuid,
  'the original npc''s linked_monster_id is untouched'
);
select is(
  (select count(*)::integer from public.npcs where id = '73300000-0000-4000-8000-000000000213' and user_id = '73300000-0000-4000-8000-000000000201'),
  1,
  'the original npc is untouched and still owned by the outgoing DM'
);

-- ── Scenario 3: location_set attachment with a parent location and a room ──
-- Both are global locations; the attachment's ref_id is the parent, and
-- metadata->room_ids lists the room. Both must clone, both references in the
-- attachment must repoint, the room clone's parent_id must remap to the
-- parent CLONE (clone-to-clone), and both clones' source_map_id must be
-- nulled (the parent had a real Cartographer deep-link before transfer, to
-- make that null-out assertion mean something rather than trivially holding).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-location-rooms-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-location-rooms-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000310', '73300000-0000-4000-8000-000000000301', 'Location rooms campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000310', '73300000-0000-4000-8000-000000000302', 'player', 'New DM LocationRooms');

insert into public.dungeon_maps (id, user_id, name)
values ('73300000-0000-4000-8000-000000000315', '73300000-0000-4000-8000-000000000301', 'Outgoing DM''s Cartographer map');

insert into public.locations (id, user_id, campaign_id, name, source_map_id)
values ('73300000-0000-4000-8000-000000000311', '73300000-0000-4000-8000-000000000301', null, 'Quest ref parent location', '73300000-0000-4000-8000-000000000315');

insert into public.locations (id, user_id, campaign_id, name, parent_id)
values ('73300000-0000-4000-8000-000000000312', '73300000-0000-4000-8000-000000000301', null, 'Quest ref room location', '73300000-0000-4000-8000-000000000311');

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000313', '73300000-0000-4000-8000-000000000301', '73300000-0000-4000-8000-000000000310', 'Quest with a location set beat');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000314', '73300000-0000-4000-8000-000000000313', '73300000-0000-4000-8000-000000000310', 'Beat with a location set');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000301', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id, metadata)
    values (
      '73300000-0000-4000-8000-000000000316',
      '73300000-0000-4000-8000-000000000314',
      '73300000-0000-4000-8000-000000000313',
      '73300000-0000-4000-8000-000000000310',
      'location_set',
      '73300000-0000-4000-8000-000000000311',
      jsonb_build_object('room_ids', jsonb_build_array('73300000-0000-4000-8000-000000000312'))
    )
  $$,
  'the outgoing DM can place their own global location set on a beat before transfer'
);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000310',
    '73300000-0000-4000-8000-000000000302',
    false,
    'promote'
  ) $$,
  'a transfer clones a beat-attached location set, its parent and its room'
);

reset role;

select is(
  (select count(*)::integer from public.locations
    where user_id = '73300000-0000-4000-8000-000000000302' and campaign_id is null and name = 'Quest ref parent location'),
  1,
  'exactly one clone of the parent location exists for the new owner'
);
select is(
  (select count(*)::integer from public.locations
    where user_id = '73300000-0000-4000-8000-000000000302' and campaign_id is null and name = 'Quest ref room location'),
  1,
  'exactly one clone of the room location exists for the new owner'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000316'),
  (select id::text from public.locations where user_id = '73300000-0000-4000-8000-000000000302' and name = 'Quest ref parent location'),
  'the attachment ref_id is repointed at the parent clone'
);
select is(
  (select metadata->'room_ids' from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000316'),
  (select jsonb_build_array(id::text) from public.locations where user_id = '73300000-0000-4000-8000-000000000302' and name = 'Quest ref room location'),
  'the attachment''s room_ids array is rebuilt to point at the room clone'
);
select is(
  (select parent_id from public.locations where user_id = '73300000-0000-4000-8000-000000000302' and name = 'Quest ref room location'),
  (select id from public.locations where user_id = '73300000-0000-4000-8000-000000000302' and name = 'Quest ref parent location'),
  'the room clone''s parent_id is remapped clone-to-clone, not left pointing at the original parent'
);
select is(
  (select count(*)::integer from public.locations
    where user_id = '73300000-0000-4000-8000-000000000302' and name in ('Quest ref parent location', 'Quest ref room location') and source_map_id is null),
  2,
  'both clones'' source_map_id is nulled -- the new owner cannot open the outgoing DM''s Cartographer map'
);
select is(
  (select source_map_id from public.locations where id = '73300000-0000-4000-8000-000000000311'),
  '73300000-0000-4000-8000-000000000315'::uuid,
  'the original parent location is untouched, including its own source_map_id'
);

-- ── Scenario 4: shallow faction attached to a beat ──────────────────────────
-- A global faction cloned for the recipient; both the attachment and the
-- quest_refs mirror row repoint at the clone. Cloning is SHALLOW by design --
-- there are no faction_* junction rows to worry about here since this
-- faction is global and never had campaign relations of its own.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-faction-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000402', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-faction-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000410', '73300000-0000-4000-8000-000000000401', 'Faction campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000410', '73300000-0000-4000-8000-000000000402', 'player', 'New DM Faction');

insert into public.factions (id, user_id, campaign_id, name)
values ('73300000-0000-4000-8000-000000000411', '73300000-0000-4000-8000-000000000401', null, 'Quest ref faction');

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000412', '73300000-0000-4000-8000-000000000401', '73300000-0000-4000-8000-000000000410', 'Quest with a faction beat');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000413', '73300000-0000-4000-8000-000000000412', '73300000-0000-4000-8000-000000000410', 'Beat with a faction');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000401', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '73300000-0000-4000-8000-000000000414',
      '73300000-0000-4000-8000-000000000413',
      '73300000-0000-4000-8000-000000000412',
      '73300000-0000-4000-8000-000000000410',
      'faction',
      '73300000-0000-4000-8000-000000000411'
    )
  $$,
  'the outgoing DM can place their own global faction on a beat before transfer'
);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000410',
    '73300000-0000-4000-8000-000000000402',
    false,
    'promote'
  ) $$,
  'a transfer clones a beat-attached global faction -- regression cover for the patched faction arm'
);

reset role;

select is(
  (select count(*)::integer from public.factions
    where user_id = '73300000-0000-4000-8000-000000000402' and campaign_id is null and name = 'Quest ref faction'),
  1,
  'exactly one clone of the faction exists for the new owner'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000414'),
  (select id::text from public.factions where user_id = '73300000-0000-4000-8000-000000000402' and name = 'Quest ref faction'),
  'the attachment is repointed at the faction clone'
);
select is(
  (select ref_id from public.quest_refs where quest_id = '73300000-0000-4000-8000-000000000412' and ref_type = 'faction'),
  (select id::text from public.factions where user_id = '73300000-0000-4000-8000-000000000402' and name = 'Quest ref faction'),
  'the quest_refs mirror row for the faction points at the clone, with no duplicate'
);
select is(
  (select count(*)::integer from public.factions where id = '73300000-0000-4000-8000-000000000411' and user_id = '73300000-0000-4000-8000-000000000401'),
  1,
  'the original faction is untouched and still owned by the outgoing DM'
);

-- ── Scenario 5: campaign-SCOPED npc and item are NOT cloned ─────────────────
-- Both already move with the campaign (step 3, ids intact) because their
-- campaign_id equals the transferring campaign -- the #733 gap was only
-- GLOBAL rows. Confirms no accidental double-clone and that the attachments'
-- ref_ids are stable through the move (they were never in any clone map).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000501', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-scoped-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000502', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-scoped-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000510', '73300000-0000-4000-8000-000000000501', 'Scoped rows campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000510', '73300000-0000-4000-8000-000000000502', 'player', 'New DM Scoped');

insert into public.npcs (id, user_id, campaign_id, name)
values ('73300000-0000-4000-8000-000000000511', '73300000-0000-4000-8000-000000000501', '73300000-0000-4000-8000-000000000510', 'Scoped npc');

insert into public.items (id, user_id, campaign_id, name, item_type, rarity, description)
values ('73300000-0000-4000-8000-000000000512', '73300000-0000-4000-8000-000000000501', '73300000-0000-4000-8000-000000000510', 'Scoped item', 'weapon', 'common', 'Campaign-scoped, not global.');

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000513', '73300000-0000-4000-8000-000000000501', '73300000-0000-4000-8000-000000000510', 'Quest with scoped beats');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000514', '73300000-0000-4000-8000-000000000513', '73300000-0000-4000-8000-000000000510', 'Beat with scoped npc and item');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000501', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '73300000-0000-4000-8000-000000000515',
      '73300000-0000-4000-8000-000000000514',
      '73300000-0000-4000-8000-000000000513',
      '73300000-0000-4000-8000-000000000510',
      'npc',
      '73300000-0000-4000-8000-000000000511'
    )
  $$,
  'the outgoing DM can place their own campaign-scoped npc on a beat before transfer'
);

select lives_ok(
  $$
    insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id)
    values (
      '73300000-0000-4000-8000-000000000516',
      '73300000-0000-4000-8000-000000000514',
      '73300000-0000-4000-8000-000000000513',
      '73300000-0000-4000-8000-000000000510',
      'item',
      '73300000-0000-4000-8000-000000000512'
    )
  $$,
  'the outgoing DM can place their own campaign-scoped item on a beat before transfer'
);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000510',
    '73300000-0000-4000-8000-000000000502',
    false,
    'promote'
  ) $$,
  'a transfer moves campaign-scoped npc/item beats without cloning them'
);

reset role;

select is(
  (select count(*)::integer from public.npcs where name = 'Scoped npc'),
  1,
  'the campaign-scoped npc has exactly one row -- no clone was made'
);
select is(
  (select count(*)::integer from public.items where name = 'Scoped item'),
  1,
  'the campaign-scoped item has exactly one row -- no clone was made'
);
select is(
  (select user_id from public.npcs where id = '73300000-0000-4000-8000-000000000511'),
  '73300000-0000-4000-8000-000000000502'::uuid,
  'the scoped npc now belongs to the new owner, id unchanged'
);
select is(
  (select user_id from public.items where id = '73300000-0000-4000-8000-000000000512'),
  '73300000-0000-4000-8000-000000000502'::uuid,
  'the scoped item now belongs to the new owner, id unchanged'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000515'),
  '73300000-0000-4000-8000-000000000511',
  'the npc attachment''s ref_id is unchanged -- the scoped row''s id was stable through the move'
);
select is(
  (select ref_id from public.quest_beat_attachments where id = '73300000-0000-4000-8000-000000000516'),
  '73300000-0000-4000-8000-000000000512',
  'the item attachment''s ref_id is unchanged -- the scoped row''s id was stable through the move'
);

-- ── Scenario 6: join-based FK repoints (faction_items, store_items) ────────
-- A quest-referenced global item is also linked from a campaign faction (via
-- faction_items) and a campaign store (via store_items) -- both reachable
-- only through a campaign-scoped PARENT (the faction / the location), the
-- same join shape as the pre-existing store_items ownership update in step 3.
-- One clone must serve every reference, not only the quest one.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('73300000-0000-4000-8000-000000000601', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-join-repoints-old@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('73300000-0000-4000-8000-000000000602', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue733-join-repoints-new@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('73300000-0000-4000-8000-000000000610', '73300000-0000-4000-8000-000000000601', 'Join repoints campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('73300000-0000-4000-8000-000000000610', '73300000-0000-4000-8000-000000000602', 'player', 'New DM JoinRepoints');

insert into public.items (id, user_id, campaign_id, name, item_type, rarity, description)
values ('73300000-0000-4000-8000-000000000611', '73300000-0000-4000-8000-000000000601', null, 'Join-referenced item', 'weapon', 'common', 'Referenced via quest_refs, a faction and a store.');

insert into public.quests (id, user_id, campaign_id, title)
values ('73300000-0000-4000-8000-000000000612', '73300000-0000-4000-8000-000000000601', '73300000-0000-4000-8000-000000000610', 'Quest with an item ref');

insert into public.quest_refs (quest_id, ref_type, ref_id)
values ('73300000-0000-4000-8000-000000000612', 'item', '73300000-0000-4000-8000-000000000611');

insert into public.factions (id, user_id, campaign_id, name)
values ('73300000-0000-4000-8000-000000000613', '73300000-0000-4000-8000-000000000601', '73300000-0000-4000-8000-000000000610', 'Join repoints faction');

insert into public.faction_items (id, user_id, faction_id, item_id)
values ('73300000-0000-4000-8000-000000000614', '73300000-0000-4000-8000-000000000601', '73300000-0000-4000-8000-000000000613', '73300000-0000-4000-8000-000000000611');

insert into public.locations (id, user_id, campaign_id, name)
values ('73300000-0000-4000-8000-000000000615', '73300000-0000-4000-8000-000000000601', '73300000-0000-4000-8000-000000000610', 'Join repoints store location');

insert into public.store_items (id, user_id, location_id, item_id)
values ('73300000-0000-4000-8000-000000000616', '73300000-0000-4000-8000-000000000601', '73300000-0000-4000-8000-000000000615', '73300000-0000-4000-8000-000000000611');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73300000-0000-4000-8000-000000000601', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.transfer_campaign_ownership(
    '73300000-0000-4000-8000-000000000610',
    '73300000-0000-4000-8000-000000000602',
    false,
    'promote'
  ) $$,
  'a transfer repoints join-reachable faction_items and store_items references to the item clone'
);

reset role;

select is(
  (select count(*)::integer from public.items
    where user_id = '73300000-0000-4000-8000-000000000602' and campaign_id is null and name = 'Join-referenced item'),
  1,
  'exactly one clone of the join-referenced item exists for the new owner'
);
select is(
  (select item_id from public.faction_items where id = '73300000-0000-4000-8000-000000000614'),
  (select id from public.items where user_id = '73300000-0000-4000-8000-000000000602' and name = 'Join-referenced item'),
  'faction_items.item_id, reachable only via its campaign faction parent, is repointed at the clone'
);
select is(
  (select item_id from public.store_items where id = '73300000-0000-4000-8000-000000000616'),
  (select id from public.items where user_id = '73300000-0000-4000-8000-000000000602' and name = 'Join-referenced item'),
  'store_items.item_id, reachable only via its campaign location parent, is repointed at the clone'
);
select is(
  (select user_id from public.faction_items where id = '73300000-0000-4000-8000-000000000614'),
  '73300000-0000-4000-8000-000000000602'::uuid,
  'the faction_items junction row itself moved to the new owner'
);

select * from finish();
rollback;
