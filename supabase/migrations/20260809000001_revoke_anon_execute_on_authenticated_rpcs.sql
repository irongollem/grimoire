-- Migration: revoke_anon_execute_on_authenticated_rpcs
-- Takes three login-only RPCs off the anonymous surface (#650).
--
-- All three already authorize internally from auth.uid(), which is null for
-- anon, so an unauthenticated call fails its own check — this is defence in
-- depth, not a live hole. But it leaves one null test as the only thing between
-- anon and a character-sheet mutation, and CLAUDE.md already sets the standard
-- these three miss: login-only RPCs revoke from public+anon and grant to
-- authenticated+service_role.
--
-- The grant came from the `PUBLIC` default rather than an explicit
-- `grant ... to anon`, which is why no diff ever showed it. That is also why
-- each revoke names `public, anon` and not `anon` alone: revoking from anon
-- while PUBLIC still holds the privilege is a no-op.
--
-- Audited against the full advisor baseline at the same time; the remaining
-- anon-executable functions are deliberate and are NOT touched here —
-- validate_app_invite runs before login by definition, and the four
-- get_library_*_sources are shared content that is intentionally not
-- account-gated. See CLAUDE.md → Sanctioned Exceptions.

revoke execute on function public.apply_level_up(uuid, jsonb, jsonb, jsonb) from public, anon;
grant  execute on function public.apply_level_up(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

revoke execute on function public.apply_de_level(uuid, jsonb, jsonb, text[]) from public, anon;
grant  execute on function public.apply_de_level(uuid, jsonb, jsonb, text[]) to authenticated, service_role;

revoke execute on function public.acknowledge_ai_generation_job(uuid) from public, anon;
grant  execute on function public.acknowledge_ai_generation_job(uuid) to authenticated, service_role;

-- Assert the outcome rather than trusting the grants above to have matched the
-- intended signatures: a typo in an argument list would silently target nothing
-- and this migration would "succeed" while changing no privilege at all.
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('apply_level_up', 'apply_de_level', 'acknowledge_ai_generation_job')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  if bad is not null then
    raise exception 'anon still holds EXECUTE, or authenticated lost it, on: %', bad;
  end if;
end $$;
