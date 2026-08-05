-- Migration: move_vector_extension_out_of_public
-- Relocate pgvector to the `extensions` schema and repin every retrieval RPC's
-- search_path so the distance operator still resolves (issue #595).

-- WHY. `20260803000001` created pgvector with a bare `create extension if not
-- exists vector`, which installs it into `public`. That raises the security
-- advisor's `extension_in_public` finding: an extension in `public` shares a
-- namespace with application objects, so every type, operator and function it
-- ships (pgvector adds ~90) can be shadowed by, or collide with, a future table
-- or function of the same name. #595's acceptance criteria required a clean
-- `get_advisors({ type: "security" })` and this was the one finding the issue
-- itself introduced.
--
-- (`pg_net` is also in `public` and is NOT touched here. It is installed and
-- managed by the Supabase platform rather than by any migration in this repo,
-- and moving a platform-managed extension out from under the features that
-- depend on it is not ours to do.)

-- ── THE TRAP, stated plainly ────────────────────────────────────────────────
-- Moving the extension ALONE silently breaks every semantic-search feature in
-- the app. All eight `match_*` RPCs are pinned with `SET search_path = public`
-- (by 20260803000002 and its successors, to satisfy a different advisor). A
-- `language sql` body is parsed on first execution using exactly that path, so
-- the moment `vector` lives in `extensions` the `<=>` operator is no longer
-- visible and the function dies with:
--
--     operator does not exist: extensions.vector <=> extensions.vector
--
-- That error is not visible to users. `generate-encounter`, `generate-loot`,
-- `generate-complication` and the note/entity retrieval paths all wrap their
-- retrieval block in a try/catch that degrades to an ungrounded prompt on any
-- failure -- by design, so retrieval can never take a generator down. The
-- result of moving the extension without the repin below is therefore not an
-- outage but something worse: every generator quietly stops using retrieval,
-- output quality regresses, and nothing anywhere reports a problem.
--
-- So the two halves of this migration are ONE change and must never be split.
--
-- Verified before writing: with the repin, all eight RPCs execute against the
-- relocated extension; without it, `match_library_monsters` raises the error
-- above. `supabase/tests/monster_retrieval.test.sql` executes two of these
-- functions for real, so a future migration that adds a `match_*` RPC and
-- forgets the `extensions` entry fails CI rather than degrading in production.

do $$
begin
  -- Guarded so the migration is a no-op where pgvector is already installed
  -- outside `public` (a fresh environment may create it there directly).
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector' and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end $$;

-- ── Repin: `extensions` added, `public` kept ───────────────────────────────
-- `ALTER FUNCTION ... SET search_path` changes only the stored config, not the
-- body -- deliberately, so this migration cannot introduce a transcription
-- error into eight function definitions it has no other reason to touch.
--
-- `public` stays FIRST: these bodies reference application tables unqualified,
-- and `extensions` must not be able to shadow one. This is still a pinned path,
-- so the advisor finding that 20260803000002 fixed does not come back.
--
-- NOTE FOR THE NEXT `match_*` RPC: pin it `SET search_path = public, extensions`
-- from the start. `= public` alone will not find `<=>`.

alter function public.match_library_monsters(vector, text[], text, text, integer)
  set search_path = public, extensions;
alter function public.match_custom_monsters(vector, uuid, text, text, integer)
  set search_path = public, extensions;
alter function public.match_library_items(vector, text[], text, text[], boolean, text, integer)
  set search_path = public, extensions;
alter function public.match_custom_items(vector, uuid, uuid, text[], boolean, text, integer)
  set search_path = public, extensions;
alter function public.match_campaign_npcs(vector, uuid, uuid, text, integer)
  set search_path = public, extensions;
alter function public.match_campaign_factions(vector, uuid, uuid, text, integer)
  set search_path = public, extensions;
alter function public.match_campaign_locations(vector, uuid, uuid, text, integer)
  set search_path = public, extensions;
alter function public.match_campaign_notes(vector, uuid, uuid, text, uuid, text[], integer)
  set search_path = public, extensions;

-- ── Fail loudly here rather than quietly in production ─────────────────────
-- The whole risk of this migration is a `match_*` function that exists but was
-- left off the list above; the failure mode is silent, so it has to be caught
-- at apply time. Any pgvector-dependent function in `public` without
-- `extensions` on its path aborts the migration and the deploy.
do $$
declare
  unpinned text;
begin
  select string_agg(p.proname, ', ')
    into unpinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%<=>%'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c
      where c like 'search_path=%' and c like '%extensions%'
    );

  if unpinned is not null then
    raise exception 'pgvector moved to `extensions` but these functions still resolve `<=>` against `public` only: %', unpinned;
  end if;
end $$;
