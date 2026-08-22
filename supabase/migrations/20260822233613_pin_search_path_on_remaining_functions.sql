-- Migration: pin_search_path_on_remaining_functions
-- The last four functions with a role-mutable search_path.

-- Surfaced by `get_advisors({ type: "security" })` as two WARN-level
-- `function_search_path_mutable` findings — a category absent from the baseline
-- CLAUDE.md records, so they are a regression rather than part of the standing
-- set. Both arrived with the document-items work (20260819231506); every other
-- trigger function in the codebase, `private.protect_quest_overview_beat()`
-- included, already pins it.
--
-- A local sweep found two more the advisor does not report, because it only
-- inspects `public`:
--
--   select n.nspname||'.'||p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname in ('public','private') and p.prokind = 'f'
--     and not exists (
--       select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');
--
-- None of the four is SECURITY DEFINER, so none was exploitable: they run with
-- the caller's own privileges, and a caller who repoints search_path attacks
-- only themselves. That is why these are WARN and not ERROR. Pinning them is
-- defence in depth and, more usefully, it makes "no function has a mutable
-- search_path" a property the whole schema has — which is a rule a test can
-- enforce, where "no *important* function has one" is a judgement call that
-- decays.
--
-- ALTER rather than CREATE OR REPLACE on purpose: the bodies are not being
-- changed, and copying four of them forward would be four chances to introduce
-- a difference this migration does not intend.

alter function public.items_touch_content_updated_at() set search_path = public;
alter function public.guard_item_entry_anchors() set search_path = public;

-- Both are IMMUTABLE SQL predicates that already schema-qualify what they call;
-- `private` is listed so a later edit that drops a qualifier still resolves.
alter function private.is_third_party_column(text) set search_path = public, private;
alter function private.is_withheld_column(text) set search_path = public, private;
