-- An item named on a page resolves to a real item. Story #838.
--
-- The sibling of #837, and it only became possible today. When #838 was filed,
-- items were the one corpus with no vector coverage — 3 of 2,018 personal items
-- and 0 of 1,717 library items, against 100% for monsters, NPCs, locations,
-- factions and notes. That backfill has since run: both item corpora are now
-- fully embedded.
--
-- ── What this fixes ────────────────────────────────────────────────────────
--
-- A dungeon chapter yields creatures **and** treasure. After #837 the creatures
-- come back already runnable, resolved against the DM's own vault and then the
-- shared library. The items could not: with nothing to match against, an
-- extracted "psi crystal" could only ever be created fresh, and a DM who owns
-- that item already ends up with a duplicate.
--
-- Half a chapter resolving and half not is the asymmetry this closes.
--
-- ── Why this is a second function and not a generic one ────────────────────
--
-- It is deliberately near-identical to `resolve_monster_references`, and the
-- duplication is bounded on purpose. The genuinely shared part — how a name
-- becomes a lookup key — is `private.normalize_entity_name`, renamed from
-- `normalize_creature_name` in the same change that added it, since it was
-- never creature-specific.
--
-- What differs is the tables, their id types and their scoping columns, and the
-- only way to share *that* in SQL is dynamic SQL over table names: it would
-- trade two typed, readable functions for one that the planner cannot check and
-- that opens an injection surface, to save a CTE. Two thin resolvers over one
-- shared normaliser is the smaller thing.
--
-- ── Same ranking rule, same reason ────────────────────────────────────────
--
-- Own items win ties. A DM who has already made their own psi crystal — with
-- their price, their art, their notes on what it does in *their* campaign —
-- wants theirs. The shared library is the fallback.

create or replace function public.resolve_item_references(
  p_campaign_id uuid,
  p_names text[]
)
returns table (
  query_name text,
  item_id uuid,
  library_item_id text,
  source text,
  matched_name text,
  match_kind text
)
language sql
stable
security definer
set search_path to 'public', 'private'
as $function$
  with asked as (
    select distinct
      n as query_name,
      private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- `items` SELECT is owner-only and this function is SECURITY DEFINER, so the
  -- scope is re-stated here rather than inherited. Never widen past auth.uid().
  mine as (
    select i.id, i.name, private.normalize_entity_name(i.name) as norm
    from public.items i
    where i.user_id = auth.uid()
      and (i.campaign_id = p_campaign_id or i.campaign_id is null)
  ),
  shared as (
    select l.id, l.name, private.normalize_entity_name(l.name) as norm
    from public.library_items l
  ),
  candidates as (
    select a.query_name, mine.id as id, null::text as library_item_id, 'campaign'::text as source, mine.name, 'exact'::text as match_kind, 1 as rank
      from asked a join mine on mine.norm = a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'exact', 2
      from asked a join shared on shared.norm = a.norm
    union all
    -- "a potion of healing" → "potion of healing" is handled by the normaliser;
    -- this catches the qualifier case, anchored as a whole-word *suffix* so
    -- "rope" never matches "garrote".
    select a.query_name, mine.id, null::text, 'campaign', mine.name, 'contains', 3
      from asked a join mine on a.norm ~ ('(^| )' || mine.norm || '$') and mine.norm <> a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'contains', 4
      from asked a join shared on a.norm ~ ('(^| )' || shared.norm || '$') and shared.norm <> a.norm
  )
  select distinct on (c.query_name)
    c.query_name, c.id, c.library_item_id, c.source, c.name, c.match_kind
  from candidates c
  where private.is_campaign_dm(p_campaign_id)
  order by c.query_name, c.rank, c.name, c.id;
$function$;

comment on function public.resolve_item_references(uuid, text[]) is
  'Resolves item names from an imported page to real items (#838) — the '
  'caller''s own vault first, then the shared library. A campaign match fills '
  '`item_id` (uuid); a library match fills `library_item_id` (text), since '
  'shared content is keyed by a stable text id. Returns at most one row per '
  'name; an unmatched name is simply absent, and the importer creates it fresh.';

revoke execute on function public.resolve_item_references(uuid, text[]) from public, anon;
grant execute on function public.resolve_item_references(uuid, text[]) to authenticated, service_role;
