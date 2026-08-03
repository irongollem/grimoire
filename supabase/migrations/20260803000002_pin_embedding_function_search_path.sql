-- Migration: pin_embedding_function_search_path
-- Resolve the security advisor's function_search_path_mutable WARN on the three
-- functions added by 20260803000001 (issue #595).

-- Without a SET search_path a function resolves unqualified names using the
-- CALLER's search_path, so a caller who can create objects in a schema earlier
-- on their path can shadow the tables these functions read. All three are
-- SECURITY INVOKER, so this cannot escalate privileges -- the function runs as
-- the caller either way -- which is why the advisor rates it WARN rather than
-- ERROR. It is still worth pinning: the shadowing would change which ROWS the
-- similarity search sees, and a retrieval function that can be pointed at a
-- different table is a bad thing to leave lying around.
--
-- `set search_path = public` matches this codebase's dominant convention (88
-- other functions) rather than the stricter `set search_path = ''`. Empty would
-- require schema-qualifying not just the tables but the pgvector `<=>` operator
-- (OPERATOR(public.<=>)) and the `vector` type in every signature -- more
-- surface to get wrong, for no gain over a pinned path here.
--
-- CREATE OR REPLACE preserves existing privileges, so the revoke/grant pairs
-- from 20260803000001 still stand and are not restated.

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
  select
    m.id,
    m.name,
    m.monster_type,
    m.stat_block->>'challenge_rating' as challenge_rating,
    e.embedding <=> query_embedding as distance
  from library_monster_embeddings e
  join library_monsters m on m.id = e.library_monster_id
  -- Enabled-sources + ruleset gate applied here, as a WHERE predicate, before
  -- the similarity ordering below -- never as a post-filter on the ranked
  -- top-K. Filtering after ranking would silently shrink the candidate set
  -- (potentially to zero) for DMs who enable fewer books, and surfacing a
  -- disabled source's content into a campaign is the licensing mistake #567
  -- and #583 fixed.
  where m.source = any(source_slugs)
    and m.ruleset = p_ruleset
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
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
  select
    m.id,
    m.name,
    m.monster_type,
    m.stat_block->>'challenge_rating' as challenge_rating,
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
  limit match_count;
$$;

create or replace function set_embedding_provider(p_provider text, p_model text)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- Of the four integrated vendors only these two have an embeddings endpoint.
  if p_provider not in ('openai', 'gemini') then
    raise exception 'Provider % cannot produce embeddings', p_provider;
  end if;
  if p_model is null or btrim(p_model) = '' then
    raise exception 'An embedding model is required';
  end if;

  update provider_config
     set embedding_enabled = (provider = p_provider),
         embedding_model   = case when provider = p_provider then p_model
                                  else embedding_model end;

  if not found then
    raise exception 'Not authorised to change the embedding provider';
  end if;
end;
$$;
