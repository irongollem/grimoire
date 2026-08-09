-- The retention periods defined by #639 (migration 20260810000004).
--
-- Retention fails in two directions and only one of them is visible. Deleting
-- too late looks like nothing at all — a table quietly grows and the privacy
-- policy becomes untrue. Deleting too early looks like nothing either, until an
-- auditor asks for a transaction from year six of a seven-year obligation. So
-- every period is asserted on both sides of its boundary here, and the boundary
-- itself is asserted separately, because the financial-year rule behind it is
-- the part most likely to be "simplified" into a bug by someone who reads
-- `retention_horizon` as "seven years ago".
--
-- Companion to context/compliance/retention.md.

begin;

create extension if not exists pgtap with schema extensions;
-- Every assertion is scoped to a fixture id. `supabase db reset` seeds from a
-- local `seed.sql` that CI does not have, so an unscoped count passes in CI and
-- fails on a developer's machine — which is the wrong way round for a suite
-- whose job is to catch a purge that deletes more than it should.
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('63900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'retention-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  -- Only for the feature_interest pair: the table allows one click per
  -- (user, feature) and one feature, so the two sides of that boundary have to
  -- belong to different people.
  ('63900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'retention-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('63900000-0000-4000-8000-0000000000c1', '63900000-0000-4000-8000-000000000001', 'Retention');

-- ── The horizon is the end of the financial year, not the anniversary ───────
select ok(
  private.retention_horizon(7) <= now() - interval '7 years',
  'the seven-year horizon never falls inside the seven years'
);

select ok(
  private.retention_horizon(7) >= now() - interval '8 years',
  'the seven-year horizon never runs past the end of the financial year plus seven'
);

-- ── The flag is off unless the purge sets it ────────────────────────────────
select is(
  private.retention_purge_in_progress(),
  false,
  'the purge flag reads false when unset, rather than NULL'
);

-- ── Fixtures: one row either side of every boundary ─────────────────────────
-- The ledger rows are placed relative to the horizon itself. The "kept" one is
-- 60 days after it — inside the retained window under the financial-year rule,
-- and outside it under the naive now() - 7 years reading, so this row is what
-- fails if the rule is ever flattened.
insert into public.ai_credit_ledger (id, user_id, delta, reason, is_byok, pending, created_at)
values
  ('63900000-0000-4000-8000-00000000000a', '63900000-0000-4000-8000-000000000001', -1, 'test', false, false,
   private.retention_horizon(7) + interval '60 days'),
  ('63900000-0000-4000-8000-00000000000b', '63900000-0000-4000-8000-000000000001', -1, 'test', false, false,
   private.retention_horizon(7) - interval '1 day'),
  ('63900000-0000-4000-8000-00000000000c', '63900000-0000-4000-8000-000000000001', -1, 'hold', false, true, now());

insert into public.purchase_consents (id, user_id, purpose, consent_version, created_at)
values
  ('63900000-0000-4000-8000-00000000001a', '63900000-0000-4000-8000-000000000001', 'credit_pack', 'v1',
   private.retention_horizon(7) + interval '60 days'),
  ('63900000-0000-4000-8000-00000000001b', '63900000-0000-4000-8000-000000000001', 'credit_pack', 'v1',
   private.retention_horizon(7) - interval '1 day');

insert into public.admin_audit_log (id, admin_user_id, action, target_user_id, created_at)
values
  ('63900000-0000-4000-8000-00000000002a', '63900000-0000-4000-8000-000000000001', 'plan_change',
   '63900000-0000-4000-8000-000000000001', private.retention_horizon(7) + interval '60 days'),
  ('63900000-0000-4000-8000-00000000002b', '63900000-0000-4000-8000-000000000001', 'plan_change',
   '63900000-0000-4000-8000-000000000001', private.retention_horizon(7) - interval '1 day');

insert into public.abuse_guard_trips (id, user_id, attempted_cost, window_spend, enforced, created_at)
values
  ('63900000-0000-4000-8000-00000000003a', '63900000-0000-4000-8000-000000000001', 10, 100, true, now() - interval '179 days'),
  ('63900000-0000-4000-8000-00000000003b', '63900000-0000-4000-8000-000000000001', 10, 100, true, now() - interval '181 days');

-- Two of these are older than 90 days. Only the failed one is a log; the ready
-- one is a Gallery image the user can still open.
insert into public.image_generation_jobs (id, user_id, campaign_id, kind, status, image_url, created_at)
values
  ('63900000-0000-4000-8000-00000000004a', '63900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-0000000000c1',
   'entity', 'ready', 'https://example.invalid/a.webp', now() - interval '400 days'),
  ('63900000-0000-4000-8000-00000000004b', '63900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-0000000000c1',
   'entity', 'failed', null, now() - interval '91 days'),
  ('63900000-0000-4000-8000-00000000004c', '63900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-0000000000c1',
   'entity', 'failed', null, now() - interval '89 days');

insert into public.ai_generation_jobs (id, user_id, campaign_id, generator_type, created_at)
values
  ('63900000-0000-4000-8000-00000000005a', '63900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-0000000000c1',
   'music', now() - interval '364 days'),
  ('63900000-0000-4000-8000-00000000005b', '63900000-0000-4000-8000-000000000001', '63900000-0000-4000-8000-0000000000c1',
   'music', now() - interval '366 days');

insert into public.app_invites (id, label, expires_at, max_uses, use_count, created_at)
values
  ('63900000-0000-4000-8000-00000000006a', 'open', null, null, 0, now() - interval '400 days'),
  ('63900000-0000-4000-8000-00000000006b', 'expired-recently', now() - interval '89 days', null, 0, now() - interval '400 days'),
  ('63900000-0000-4000-8000-00000000006c', 'expired-long-ago', now() - interval '91 days', null, 0, now() - interval '400 days'),
  ('63900000-0000-4000-8000-00000000006d', 'spent', null, 1, 1, now() - interval '91 days');

insert into public.campaign_invites (id, campaign_id, created_by, expires_at, max_uses, use_count, created_at)
values
  ('63900000-0000-4000-8000-00000000007a', '63900000-0000-4000-8000-0000000000c1', '63900000-0000-4000-8000-000000000001',
   now() - interval '91 days', null, 0, now() - interval '400 days'),
  ('63900000-0000-4000-8000-00000000007b', '63900000-0000-4000-8000-0000000000c1', '63900000-0000-4000-8000-000000000001',
   null, null, 0, now() - interval '400 days');

insert into public.feature_interest (id, user_id, feature, created_at)
values
  ('63900000-0000-4000-8000-00000000008a', '63900000-0000-4000-8000-000000000001', 'simulacrum', now() - interval '364 days'),
  ('63900000-0000-4000-8000-00000000008b', '63900000-0000-4000-8000-000000000002', 'simulacrum', now() - interval '366 days');

insert into public.pro_waitlist (id, email, created_at)
values
  ('63900000-0000-4000-8000-00000000009a', 'kept@example.invalid', now() - interval '364 days'),
  ('63900000-0000-4000-8000-00000000009b', 'stale@example.invalid', now() - interval '366 days');

-- The waitlist has a BEFORE INSERT trigger that silently drops disposable
-- domains. Confirm both rows actually landed, so a purge assertion below
-- cannot pass because the fixture was swallowed.
select is(
  (select count(*)::int from public.pro_waitlist where email like '%@example.invalid'),
  2,
  'both waitlist fixtures were accepted by the disposable-domain guard'
);

-- ── The guards refuse an expired row when this is not the purge ─────────────
-- Age alone must not be a licence to delete: without the flag, a settled ledger
-- row past its horizon is as undeletable as a fresh one.
select throws_ok($$
  delete from public.ai_credit_ledger where id = '63900000-0000-4000-8000-00000000000b'
$$, 'P0001', null, 'an expired ledger row is not deletable outside the purge');

select throws_ok($$
  delete from public.admin_audit_log where id = '63900000-0000-4000-8000-00000000002b'
$$, 'P0001', null, 'an expired audit entry is not deletable outside the purge');

-- ── ...and refuse a row inside the window even during the purge ─────────────
-- The guard re-derives the horizon rather than trusting the caller, so a purge
-- whose WHERE clause was widened by mistake fails loudly instead of destroying
-- evidence.
select set_config('grimoire.retention_purge', 'on', true);

select throws_ok($$
  delete from public.ai_credit_ledger where id = '63900000-0000-4000-8000-00000000000a'
$$, 'P0001', null, 'the purge flag does not make an in-window ledger row deletable');

select throws_ok($$
  delete from public.admin_audit_log where id = '63900000-0000-4000-8000-00000000002a'
$$, 'P0001', null, 'the purge flag does not make an in-window audit entry deletable');

select set_config('grimoire.retention_purge', 'off', true);

-- ── Run it ─────────────────────────────────────────────────────────────────
select private.purge_expired_retention();

select is(
  (select count(*)::int from public.ai_credit_ledger where id = '63900000-0000-4000-8000-00000000000b'),
  0,
  'a settled ledger row is deleted once the bookkeeping period has run out'
);

select is(
  (select count(*)::int from public.ai_credit_ledger where id = '63900000-0000-4000-8000-00000000000a'),
  1,
  'a ledger row inside the financial year plus seven is kept — the anniversary is not the boundary'
);

select is(
  (select count(*)::int from public.ai_credit_ledger where id = '63900000-0000-4000-8000-00000000000c'),
  1,
  'the purge leaves pending reservation holds to the release-stale-credit-holds job'
);

select is(
  (select count(*)::int from public.purchase_consents where id = '63900000-0000-4000-8000-00000000001b'),
  0,
  'an expired purchase consent is deleted'
);

select is(
  (select count(*)::int from public.purchase_consents where id = '63900000-0000-4000-8000-00000000001a'),
  1,
  'a purchase consent inside the period is kept'
);

select is(
  (select count(*)::int from public.admin_audit_log where id = '63900000-0000-4000-8000-00000000002b'),
  0,
  'an expired audit entry is deleted by the purge'
);

select is(
  (select count(*)::int from public.admin_audit_log where id = '63900000-0000-4000-8000-00000000002a'),
  1,
  'an audit entry inside the period is kept'
);

select is(
  (select count(*)::int from public.abuse_guard_trips where id = '63900000-0000-4000-8000-00000000003b'),
  0,
  'abuse-guard trips older than 180 days are deleted'
);

select is(
  (select count(*)::int from public.abuse_guard_trips where id = '63900000-0000-4000-8000-00000000003a'),
  1,
  'an abuse-guard trip inside 180 days is kept'
);

-- The one that would be a data-loss bug rather than a retention bug.
select is(
  (select count(*)::int from public.image_generation_jobs where id = '63900000-0000-4000-8000-00000000004a'),
  1,
  'a ready Gallery image is never purged, however old — this table is not a log'
);

select is(
  (select count(*)::int from public.image_generation_jobs where id = '63900000-0000-4000-8000-00000000004b'),
  0,
  'a failed image job older than 90 days is deleted, prompt and all'
);

select is(
  (select count(*)::int from public.image_generation_jobs where id = '63900000-0000-4000-8000-00000000004c'),
  1,
  'a failed image job inside 90 days is kept'
);

select is(
  (select id from public.ai_generation_jobs
    where id in ('63900000-0000-4000-8000-00000000005a', '63900000-0000-4000-8000-00000000005b')),
  '63900000-0000-4000-8000-00000000005a'::uuid,
  'the 365-day AI generation job is deleted and the 364-day one is not'
);

select results_eq($$
  select id from public.app_invites
   where id::text like '63900000-0000-4000-8000-0000000000%'
   order by id
$$, $$
  values ('63900000-0000-4000-8000-00000000006a'::uuid),
         ('63900000-0000-4000-8000-00000000006b'::uuid)
$$, 'invites are purged 90 days after they stop working; an uncapped, unexpiring one survives');

select is(
  (select count(*)::int from public.campaign_invites where id = '63900000-0000-4000-8000-00000000007a'),
  0,
  'a campaign invite expired more than 90 days ago is deleted'
);

select is(
  (select count(*)::int from public.campaign_invites where id = '63900000-0000-4000-8000-00000000007b'),
  1,
  'a campaign invite with no expiry and no use cap is kept'
);

select is(
  (select user_id from public.feature_interest
    where id in ('63900000-0000-4000-8000-00000000008a', '63900000-0000-4000-8000-00000000008b')),
  '63900000-0000-4000-8000-000000000001'::uuid,
  'a notify-me click expires at 365 days, and one inside the year does not'
);

select is(
  (select email from public.pro_waitlist where email like '%@example.invalid'),
  'kept@example.invalid',
  'a waitlist address expires at the 365-day backstop'
);

-- ── Nothing can shorten the period from the client side ────────────────────
-- The register asserts a seven-year floor on the evidence tables, which is a
-- claim about what a user cannot do to their own rows in the meantime. RLS
-- already refuses (no write policy exists), so these assert the second layer:
-- the grants are gone too, and a stray future policy cannot open a path on its
-- own.
select ok(
  not has_table_privilege('authenticated', 'public.purchase_consents', 'DELETE'),
  'authenticated holds no DELETE grant on purchase_consents'
);

select ok(
  not has_table_privilege('authenticated', 'public.ai_credit_ledger', 'INSERT'),
  'authenticated holds no INSERT grant on ai_credit_ledger'
);

-- ── Every table has a decided answer ───────────────────────────────────────
-- The failure this catches is not a wrong period, it is a table nobody
-- classified — which resolves to "kept forever" in practice and is exactly how
-- the situation #639 fixed came about in the first place. A register is a
-- document and drifts; this is the same claim as an assertion.
--
-- A table reached from auth.users by ON DELETE CASCADE has an answer by
-- construction: its rows last as long as the account. Everything else has to be
-- named below and in context/compliance/retention.md, so adding one to the
-- schema fails this test until somebody decides what happens to it.
--
-- What this deliberately does NOT check: that a cascade-reached table has the
-- *tightest* period it could have. `bug_reports` and `abuse_guard_trips` both
-- cascade and both still earned a shorter bound. Reaching the cascade is the
-- floor for classification, not the ceiling.
select is(
  (
    with recursive reached(nspname, relname) as (
      select 'auth'::name, 'users'::name
      union
      select sn.nspname, src.relname
      from pg_constraint con
      join pg_class src on src.oid = con.conrelid
      join pg_namespace sn on sn.oid = src.relnamespace
      join pg_class tgt on tgt.oid = con.confrelid
      join pg_namespace tn on tn.oid = tgt.relnamespace
      join reached r on r.relname = tgt.relname and r.nspname = tn.nspname
      where con.contype = 'f' and con.confdeltype = 'c' and sn.nspname = 'public'
    )
    select coalesce(array_agg(c.relname::text order by c.relname), '{}'::text[])
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1 from reached r where r.nspname = 'public' and r.relname = c.relname
      )
      and c.relname <> all (array[
        -- Bounded, enforced: private.purge_expired_retention() for the first
        -- five, purge-rate-limit-events (20260621000008) for the last.
        'ai_credit_ledger', 'purchase_consents', 'admin_audit_log',
        'app_invites', 'pro_waitlist', 'rate_limit_events',
        -- Decided as indefinite: shared library content and its embeddings,
        -- the 5e rules catalogue, and operator configuration. None of it is
        -- personal data — it describes the product, not a person — so there is
        -- nothing for a retention period to protect.
        'abuse_guard_config', 'ai_generation_credit_costs', 'ai_model_pricing',
        'ai_system_prompts', 'app_settings', 'checkout_config',
        'credit_pack_config', 'plans', 'platform_api_keys', 'provider_config',
        'simulacrum_config', 'disposable_email_domains',
        'class_choice_rest_resets', 'class_ritual_policies',
        'class_spellcasting_policies', 'metamagic_options',
        'multiclass_prerequisites', 'system_classes', 'content_sources',
        'library_items', 'library_monsters', 'library_rules', 'library_species',
        'library_spells', 'library_art_defaults', 'library_monster_art_canonical',
        'library_spell_art_canonical', 'library_item_embeddings',
        'library_monster_embeddings', 'sound_library'
      ])
  ),
  '{}'::text[],
  'every public table is reached by the erasure cascade or classified in retention.md'
);

select * from finish();
rollback;
