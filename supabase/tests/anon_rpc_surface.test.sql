begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- Regression cover for #650 (fixed in 20260809000001), which took
-- apply_level_up, apply_de_level and acknowledge_ai_generation_job off the
-- anonymous surface.
--
-- That migration asserts its own outcome, but only at its point in the replay.
-- The privilege can come back afterwards, and by a route this codebase has
-- already taken: `create or replace function` preserves the ACL, but
-- `drop function` + `create` resets it to the `PUBLIC` default, and PUBLIC
-- includes anon. 20260711000024 drops and recreates apply_de_level exactly that
-- way. That default is also how all three acquired the grant in the first
-- place, which is why it never appeared in a diff.
--
-- So this is written against the whole anon surface rather than the three
-- names. A test naming the three would pass while a *new* SECURITY DEFINER
-- function shipped with the PUBLIC default — the same bug, one function later.
-- Pinning the set means anything reaching anon has to be added here
-- deliberately, by someone who has read why the existing five are allowed.

-- ── The anon-executable SECURITY DEFINER surface, in full ────────────────────
-- These five are deliberate; see CLAUDE.md → Sanctioned Exceptions.
--   validate_app_invite      — runs before login by definition; the token is
--                              the credential, so gating it on a session is
--                              circular.
--   get_library_*_sources    — shared Open5e/library content metadata,
--                              intentionally not account-gated (content
--                              licensing decision).
--
-- Adding a sixth is not automatically wrong, but it is a decision: an
-- unauthenticated caller will reach that function body with auth.uid() null.

select set_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  $$ values ('validate_app_invite'),
            ('get_library_item_sources'),
            ('get_library_monster_sources'),
            ('get_library_species_sources'),
            ('get_library_spell_sources') $$,
  'exactly five SECURITY DEFINER functions are reachable by anon, and they are the sanctioned ones'
);

-- ── The same question, without the `prosecdef` filter ────────────────────────
-- The assertion above reasons correctly about how a grant drifts back — and then
-- looks only at SECURITY DEFINER functions, so it could not see the drift when it
-- happened. `craft_apply` was recreated under a new signature by 20260711000006
-- (`uuid[]` → `jsonb`, a drop-and-create), picked up the default EXECUTE-to-anon,
-- and stayed anon-executable through two later migrations, invisible here purely
-- because it is SECURITY INVOKER. Revoked in 20260828211313.
--
-- An invoker function reaching anon is much weaker than a definer one — RLS still
-- applies, so an anonymous caller usually accomplishes nothing — but "usually
-- nothing" depends on the policies of the day, and the point of pinning a surface
-- is not to re-derive that each time. So this pins the whole surface.
--
-- The two extra names are read-only license metadata, deliberately public: the
-- marketing and in-app attribution pages render them before anyone signs in.
select set_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  $$,
  $$ values ('validate_app_invite'),
            ('get_library_item_sources'),
            ('get_library_monster_sources'),
            ('get_library_species_sources'),
            ('get_library_spell_sources'),
            ('get_content_licenses'),
            ('get_audio_licenses') $$,
  'the entire anon-executable function surface is the sanctioned set, invoker included'
);

-- ── Trigger functions stay off the RPC surface ──────────────────────────────
-- The trigger system bypasses the EXECUTE check, so a trigger function never needs
-- the grant, and PostgREST will not expose one returning `trigger` in any case.
-- Revoking is therefore convention rather than exposure — but it is the convention
-- every other trigger function in `public` already follows, and three had drifted
-- out of it (20260828211313).
select is(
  (select coalesce(string_agg(p.proname::text, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and pg_get_function_result(p.oid) = 'trigger'
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE'))),
  '',
  'no trigger function in public is executable by anon or authenticated');

-- ── The three from #650 still work for the people who need them ──────────────
-- A revoke that overshoots is the other way to get this wrong: `from public`
-- with no matching `grant ... to authenticated` would leave every logged-in
-- user unable to level a character, and the set_eq above would still pass.

select ok(
  has_function_privilege('authenticated', 'public.apply_level_up(uuid, jsonb, jsonb, jsonb)', 'EXECUTE'),
  'authenticated can still execute apply_level_up'
);

select ok(
  has_function_privilege('authenticated', 'public.apply_de_level(uuid, jsonb, jsonb, text[])', 'EXECUTE'),
  'authenticated can still execute apply_de_level'
);

select ok(
  has_function_privilege('authenticated', 'public.acknowledge_ai_generation_job(uuid)', 'EXECUTE'),
  'authenticated can still execute acknowledge_ai_generation_job'
);

-- Named explicitly as well as covered by the set above, so a regression reports
-- the issue it re-opens instead of an unexplained set difference.
select ok(
  not has_function_privilege('anon', 'public.apply_level_up(uuid, jsonb, jsonb, jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.apply_de_level(uuid, jsonb, jsonb, text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.acknowledge_ai_generation_job(uuid)', 'EXECUTE'),
  'anon cannot execute the three login-only RPCs from #650'
);

select * from finish();
rollback;
