begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

-- A player in a campaign is not a DM of it — whatever the client shell says.
--
-- Reported from production: a player who switched to "DM mode" came up as DM of
-- the campaign they only *play* in, rather than of their own. The client half of
-- that was #729, which now filters the remembered campaign by the role the
-- target lens actually holds (`useModeSwitch` / `campaign.switchUserMode`).
--
-- This file pins the half that matters, and the half a UI fix cannot provide:
-- **the lens is cosmetic, and the database does not care what it says.** Even
-- with the DM shell pointed at someone else's campaign, a player must read no
-- DM content, write none, promote nobody, and be refused by every DM-only RPC.
-- If that holds, the worst a lens bug can ever be is confusing.
--
-- Deliberately asserts the DM side too. A projection that denied everyone would
-- pass every negative assertion here while breaking the product, which is the
-- shape of test that looks strongest and proves least.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('84400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lens-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('84400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lens-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('84400000-0000-4000-8000-000000000010', '84400000-0000-4000-8000-000000000001', 'The DM''s campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('84400000-0000-4000-8000-000000000010', '84400000-0000-4000-8000-000000000001', 'dm', 'The DM'),
  ('84400000-0000-4000-8000-000000000010', '84400000-0000-4000-8000-000000000002', 'player', 'The player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

-- DM-authored content the player must never see through a lens switch.
insert into public.npcs (id, user_id, campaign_id, name)
values ('84400000-0000-4000-8000-000000000020', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-000000000010', 'The DM''s secret NPC');

insert into public.quests (id, user_id, campaign_id, title)
values ('84400000-0000-4000-8000-000000000030', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-000000000010', 'The DM''s quest');

-- ── As the player ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '84400000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- `is` rather than `ok(not ...)`: the predicate must be **false**, never null.
-- A null here would be the negated-NULL bypass that let five admin functions
-- fall straight through their own guard — `not null` is null, and an `if` on
-- null does not fire. See CLAUDE.md item 3.
select is(
  private.is_campaign_dm('84400000-0000-4000-8000-000000000010'),
  false,
  'a player is not a DM of the campaign they play in — false, not null'
);

select is(
  private.is_campaign_member('84400000-0000-4000-8000-000000000010'),
  true,
  'but they are a member of it, which is what the player portal runs on'
);

select is(
  (select count(*)::integer from public.npcs where campaign_id = '84400000-0000-4000-8000-000000000010'),
  0, 'they read none of the DM''s NPCs'
);

select is(
  (select count(*)::integer from public.quests where campaign_id = '84400000-0000-4000-8000-000000000010'),
  0, 'nor any of the DM''s quests'
);

select throws_ok(
  $$ update public.campaign_members set role = 'dm'
      where campaign_id = '84400000-0000-4000-8000-000000000010'
        and user_id = '84400000-0000-4000-8000-000000000002' $$,
  null, null,
  'they cannot promote themselves to DM — the trigger refuses the role change'
);

select throws_ok(
  $$ insert into public.npcs (id, user_id, campaign_id, name)
     values ('84400000-0000-4000-8000-000000000021', '84400000-0000-4000-8000-000000000002',
             '84400000-0000-4000-8000-000000000010', 'Injected by a player') $$,
  '42501', null,
  'nor write DM content into the campaign'
);

select throws_ok(
  $$ select public.start_campaign_session('84400000-0000-4000-8000-000000000010') $$,
  null, null,
  'and a DM-only RPC refuses them outright'
);

-- ── As the DM, so none of the above passes by denying everyone ─────────────

select set_config('request.jwt.claim.sub', '84400000-0000-4000-8000-000000000001', true);

select is(
  private.is_campaign_dm('84400000-0000-4000-8000-000000000010'),
  true,
  'the actual DM is one'
);

select is(
  (select count(*)::integer from public.npcs where campaign_id = '84400000-0000-4000-8000-000000000010'),
  1, 'and reads their own NPC'
);

select is(
  (select count(*)::integer from public.quests where campaign_id = '84400000-0000-4000-8000-000000000010'),
  1, 'and their own quest'
);

select * from finish();
rollback;
