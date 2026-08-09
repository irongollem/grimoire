begin;

create extension if not exists pgtap with schema extensions;
select plan(5);

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
