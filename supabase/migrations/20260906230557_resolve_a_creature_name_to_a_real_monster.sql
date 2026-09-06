-- A creature named on a page resolves to a real monster. Story #837.
--
-- The document importer returns the creatures a chapter names. Until now the
-- best it could do was mint a `partial` monster with no stat block, because an
-- adventure prints the *name* and refers you to an appendix for the numbers —
-- in a digital edition that name is a link, and a link does not survive a paste.
--
-- A hollow monster row is worse than it looks: no AC, no HP, no actions, so it
-- cannot be dropped into an encounter, which is the thing a DM imports a
-- dungeon chapter to do.
--
-- ── The app already knows these creatures ──────────────────────────────────
--
-- Measured against production: 3,541 `library_monsters`, and for the reference
-- chapter's DM, 98 of their own `monsters`. Of the seven creatures extracted
-- from that chapter, **all seven** exist — four in the shared library (ghost,
-- giant rat, kobold, yeti) and three in the DM's own vault (grell, mind flayer,
-- and the book-specific "Icewind kobold"). Not one needed a stub.
--
-- ── Why name matching, and not embeddings, is the first cut ────────────────
--
-- Both corpora are 100% embedded and a vector search is the obvious reach. It
-- is also the wrong *first* move: a plain name match resolved seven of seven on
-- real data, costs nothing, needs no embedding call before the lookup, and is
-- deterministic — a DM reviewing "we matched your grell" can see why. Vector
-- similarity is the fallback for what this cannot reach (a renamed variant, a
-- creature described but never named), and it belongs in the extractor's edge
-- function, where an embedding can actually be computed.
--
-- Deliberately **no `pg_trgm`**: fuzzy matching would want it, and the standing
-- advisor baseline already carries one `extension_in_public` finding that is not
-- worth growing for a match this narrow. Plain-SQL normalisation covers the
-- cases that occur.
--
-- ── Own monsters win ties, and that is correctness, not preference ─────────
--
-- A DM who has already built their own grell — their notes, their art, their
-- variant statline — wants *theirs*. A shared-library hit is the fallback. So
-- the rank order is: own exact, library exact, own containment, library
-- containment.

create or replace function private.normalize_creature_name(p_name text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(coalesce(p_name, ''))), '^(a|an|the)\s+', ''),
      '\s+', ' ', 'g'),
    '([a-z]{3,})s$', '\1'),
  '');
$function$;

comment on function private.normalize_creature_name(text) is
  'Lowercases, trims, drops a leading article and de-pluralises the last word '
  'so "The Giant Rats" and "giant rat" meet (#837). Deliberately naive: this is '
  'a lookup key for creature names, not an English stemmer, and a wrong '
  'singularisation costs a missed match rather than a wrong one.';

revoke execute on function private.normalize_creature_name(text) from public, anon, authenticated;

create or replace function public.resolve_monster_references(
  p_campaign_id uuid,
  p_names text[]
)
returns table (
  query_name text,
  monster_id uuid,
  library_monster_id text,
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
      private.normalize_creature_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_creature_name(n) is not null
  ),
  -- Own monsters, scoped to the caller. `monsters` SELECT is owner-only and
  -- this function is SECURITY DEFINER, so the scope has to be re-stated here
  -- rather than inherited. Never widen past `auth.uid()`.
  mine as (
    select m.id, m.name, private.normalize_creature_name(m.name) as norm
    from public.monsters m
    where m.user_id = auth.uid()
      and (m.campaign_id = p_campaign_id or m.campaign_id is null)
  ),
  shared as (
    select l.id, l.name, private.normalize_creature_name(l.name) as norm
    from public.library_monsters l
  ),
  candidates as (
    select a.query_name, mine.id as id, null::text as library_monster_id, 'campaign'::text as source, mine.name, 'exact'::text as match_kind, 1 as rank
      from asked a join mine on mine.norm = a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'exact', 2
      from asked a join shared on shared.norm = a.norm
    union all
    -- "Icewind kobold" → "kobold". Anchored as a whole-word *suffix*, so a
    -- qualifier in front still matches while "rat" never matches "pirate".
    select a.query_name, mine.id, null::text, 'campaign', mine.name, 'contains', 3
      from asked a join mine on a.norm ~ ('(^| )' || mine.norm || '$') and mine.norm <> a.norm
    union all
    select a.query_name, null::uuid, shared.id, 'library', shared.name, 'contains', 4
      from asked a join shared on a.norm ~ ('(^| )' || shared.norm || '$') and shared.norm <> a.norm
  )
  select distinct on (c.query_name)
    c.query_name, c.id, c.library_monster_id, c.source, c.name, c.match_kind
  from candidates c
  where private.is_campaign_dm(p_campaign_id)
  -- `name, id` after `rank` so a corpus holding the same creature from several
  -- publishers returns the same row every run. A resolver that picks a
  -- different duplicate each time is worse than one that picks a mediocre match
  -- consistently — the DM reviews it once.
  order by c.query_name, c.rank, c.name, c.id;
$function$;

comment on function public.resolve_monster_references(uuid, text[]) is
  'Resolves creature names from an imported page to real monsters (#837) — the '
  'caller''s own vault first, then the shared library. A campaign match fills '
  '`monster_id` (uuid); a library match fills `library_monster_id` (text) — '
  'shared content is keyed by a stable text id, not a uuid, so the two cannot '
  'share a column. Returns at most one row '
  'per name; a name with no match is simply absent, which the importer treats '
  'as "create a partial stub".';

revoke execute on function public.resolve_monster_references(uuid, text[]) from public, anon;
grant execute on function public.resolve_monster_references(uuid, text[]) to authenticated, service_role;
