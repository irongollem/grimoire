-- Migration: dedupe_monster_matches_by_concept
-- Collapse same-creature-different-sourcebook duplicates inside the retrieval
-- RPCs, before the top-K limit rather than after it (issue #595).

-- THE PROBLEM. library_monsters holds 3,541 rows but only 2,350 distinct names:
-- 660 names appear in more than one sourcebook. "Ghost" exists in srd-2014,
-- srd-2024, blackflag and menagerie. A nearest-neighbour search for an undead
-- concept therefore spends several of its 15 slots on the same creature, and
-- generate-encounter's own name-dedup then collapses them AFTER the RPC has
-- already paid for them. Net effect: a DM who enables more sourcebooks gets
-- FEWER distinct suggestions, which is exactly backwards.
--
-- WHY NOT MERGE THE ROWS. The copies are not identical -- each source has its
-- own stat block (Ghost: 4 copies, 4 distinct stat_blocks). Black Flag
-- rebalanced it; Menagerie has its own take. Merging would destroy real
-- content a DM deliberately enabled. The duplication is only a problem for
-- RETRIEVAL, so it is fixed in retrieval.
--
-- THE DEDUP KEY. `conceptual_key` already models "same creature, different
-- book" and is populated on every library row, so it beats comparing names.
-- It is NULL on all 98 custom monsters though -- homebrew has no conceptual
-- key -- so `coalesce(conceptual_key, lower(name))` is load-bearing, not
-- defensive: `distinct on (conceptual_key)` alone would collapse a DM's entire
-- bestiary into a single candidate.
--
-- SHAPE. The innermost query keeps its ORDER BY distance + LIMIT so the HNSW
-- index still does the work; it over-fetches 5x because the worst observed
-- duplication is 4 copies of one name, so 5x guarantees enough distinct
-- concepts to fill match_count. DISTINCT ON then keeps the nearest copy of
-- each concept, and the outer query restores distance ordering.
--
-- Note the ruleset filter already prevents srd-2014 and srd-2024 from
-- competing, so this handles cross-publisher duplication specifically.

create or replace function match_library_monsters(
  query_embedding   vector(1536),
  source_slugs      text[],
  p_ruleset         text,
  p_embedding_model text,
  match_count       int
) returns table (
  id               text,
  name             text,
  monster_type     text,
  challenge_rating text,
  distance         float
)
language sql stable
set search_path = public
as $$
  select s.id, s.name, s.monster_type, s.challenge_rating, s.distance
  from (
    select distinct on (coalesce(k.conceptual_key, lower(k.name)))
           k.id, k.name, k.monster_type, k.challenge_rating, k.distance
    from (
      select
        m.id,
        m.name,
        m.monster_type,
        m.stat_block->>'challenge_rating' as challenge_rating,
        m.conceptual_key,
        e.embedding <=> query_embedding as distance
      from library_monster_embeddings e
      join library_monsters m on m.id = e.library_monster_id
      -- Enabled-sources + ruleset gate stays a WHERE predicate, before the
      -- similarity ordering -- never a post-filter on the ranked top-K.
      -- Filtering after ranking would silently shrink the candidate set for
      -- DMs who enable fewer books, and surfacing a disabled source's content
      -- is the licensing mistake #567 and #583 fixed.
      where m.source = any(source_slugs)
        and m.ruleset = p_ruleset
        -- Same-model gate: never compare vectors across models.
        and e.embedding_model = p_embedding_model
      order by e.embedding <=> query_embedding
      limit greatest(match_count * 5, match_count)
    ) k
    order by coalesce(k.conceptual_key, lower(k.name)), k.distance
  ) s
  order by s.distance
  limit match_count;
$$;

create or replace function match_custom_monsters(
  query_embedding   vector(1536),
  p_user_id         uuid,
  p_ruleset         text,
  p_embedding_model text,
  match_count       int
) returns table (
  id               uuid,
  name             text,
  monster_type     text,
  challenge_rating text,
  distance         float
)
language sql stable
set search_path = public
as $$
  select s.id, s.name, s.monster_type, s.challenge_rating, s.distance
  from (
    -- conceptual_key is null on every custom monster, so this degrades to
    -- lower(name) -- which matches what generate-encounter's merge already
    -- does, and keeps two deliberately same-named homebrew variants from both
    -- occupying candidate slots.
    select distinct on (coalesce(k.conceptual_key, lower(k.name)))
           k.id, k.name, k.monster_type, k.challenge_rating, k.distance
    from (
      select
        m.id,
        m.name,
        m.monster_type,
        m.stat_block->>'challenge_rating' as challenge_rating,
        m.conceptual_key,
        e.embedding <=> query_embedding as distance
      from monster_embeddings e
      join monsters m on m.id = e.monster_id
      where m.user_id = p_user_id
        and coalesce(m.open5e_import, false) = false
        -- ruleset may be null on custom monsters that predate the column.
        and (m.ruleset is null or m.ruleset = p_ruleset)
        -- Same-model gate: never compare vectors across models.
        and e.embedding_model = p_embedding_model
      order by e.embedding <=> query_embedding
      limit greatest(match_count * 5, match_count)
    ) k
    order by coalesce(k.conceptual_key, lower(k.name)), k.distance
  ) s
  order by s.distance
  limit match_count;
$$;
