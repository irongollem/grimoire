-- Migration: rag_campaign_entity_embeddings
-- Embedding side tables + match RPCs for npcs, factions and locations, so the
-- quest-hook generator can retrieve the DM's own entities (#600), mirroring
-- the monster pattern from 20260803000001 (#595).

-- ── Side tables ─────────────────────────────────────────────────────────────
-- Embeddings live in side tables, never as columns on npcs/factions/locations:
-- useNpcs.ts and its faction/location equivalents .select("*"), so a
-- vector(1536) column (~6 KB/row) would add that weight to every list load
-- across hundreds of rows per campaign. `on delete cascade` means a deleted
-- entity takes its embedding with it -- no orphan rows, no stale vectors
-- matching an entity that no longer exists.
--
-- Unlike 20260803000001 there is no library_* counterpart here: npcs,
-- factions and locations are entirely DM-authored, with no shared/canonical
-- twin to embed alongside them.
--
-- embedding_model records which model produced each vector, for the same
-- reason as the monster tables: vectors are only comparable when they come
-- from the same model, and this column is what makes an AI-vendor switch
-- lossless rather than corrupting. See 20260803000001 for the full
-- rationale -- not restated per table here.

create table npc_embeddings (
  npc_id          uuid primary key references npcs(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table faction_embeddings (
  faction_id      uuid primary key references factions(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table location_embeddings (
  location_id     uuid primary key references locations(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── HNSW indexes ────────────────────────────────────────────────────────────
create index npc_embeddings_vec_idx on npc_embeddings
  using hnsw (embedding vector_cosine_ops);

create index faction_embeddings_vec_idx on faction_embeddings
  using hnsw (embedding vector_cosine_ops);

create index location_embeddings_vec_idx on location_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger npc_embeddings_updated_at
  before update on npc_embeddings
  for each row execute procedure update_updated_at();

create trigger faction_embeddings_updated_at
  before update on faction_embeddings
  for each row execute procedure update_updated_at();

create trigger location_embeddings_updated_at
  before update on location_embeddings
  for each row execute procedure update_updated_at();

-- ── RLS: enabled, intentionally zero policies ──────────────────────────────
-- These tables are written and read only by the generate-quest edge function
-- through the service-role client, which bypasses RLS entirely. None of the
-- three has a client-facing access pattern of its own, so the standard
-- four-policy pattern in CLAUDE.md (built for a table a client reads from or
-- writes to directly) does not apply here. RLS enabled with zero policies is
-- a deny-all to anon and authenticated -- this is intentional and keeps the
-- security advisor clean. Do not "fix" this later by adding permissive
-- policies.
alter table npc_embeddings enable row level security;
alter table faction_embeddings enable row level security;
alter table location_embeddings enable row level security;

-- ── Nearest-neighbour RPCs ──────────────────────────────────────────────────
-- Same shape as match_library_monsters/match_custom_monsters (20260803000001,
-- pinned in 20260803000002): SECURITY INVOKER (the default; note the absence
-- of `security definer`), `set search_path = public` pinned at creation
-- rather than left for a follow-up migration, and a revoke/grant pair that
-- keeps each function off the PostgREST RPC surface -- a DEFINER function
-- here would be auto-published as a privileged `/rest/v1/rpc/<name>` endpoint
-- and would have to authorize internally, exactly the trap CLAUDE.md
-- documents. An invoker function runs as its caller instead, so the
-- empty-policy tables above already deny everyone but service_role, and the
-- revoke/grant pair is the only additional gate needed.
--
-- p_embedding_model pins every comparison to vectors from the SAME model, for
-- the same reason as the monster RPCs: comparing across models returns
-- near-random matches with no error anywhere. See 20260803000001 for the full
-- rationale.
--
-- Deliberately NOT dedup'd like match_library_monsters (20260803000003). That
-- dedup exists because library_monsters duplicates a creature's name across
-- publishers (Ghost: srd-2014, srd-2024, blackflag and menagerie all carry
-- it). npcs, factions and locations are single-DM corpora with no
-- cross-source duplication -- a DM's "Ghost" NPC exists exactly once -- so
-- the plain ranked query below is already correct, and a conceptual_key layer
-- would add complexity with nothing to collapse.

create function match_campaign_npcs(
  query_embedding   vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  match_count       int
) returns table (
  id         uuid,
  name       text,
  occupation text,
  distance   float
)
language sql stable
set search_path = public
as $$
  select
    n.id,
    n.name,
    n.occupation,
    e.embedding <=> query_embedding as distance
  from npc_embeddings e
  join npcs n on n.id = e.npc_id
  -- Campaign rows plus the campaign OWNER's global (null-campaign) rows.
  -- Mirrors the client list views' `campaign_id === null ||
  -- campaign_id === activeCampaignId` semantics (useItems.ts,
  -- campaignContentGating.ts) and generate-encounter's owner-scoped bestiary
  -- filter, which reads `monsters` by the campaign owner's user_id rather
  -- than the caller's, because the bestiary has no campaign_id column at all
  -- (generate-encounter/index.ts). It also survives #596's planned
  -- default-flip: whichever way new rows default, null keeps meaning
  -- "global", so this predicate does not need to change with it. p_owner_id
  -- is campaigns.user_id, passed by the edge function -- never a
  -- caller-supplied id.
  where (n.campaign_id = p_campaign_id or (n.campaign_id is null and n.user_id = p_owner_id))
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_campaign_npcs(vector, uuid, uuid, text, int) from public, anon, authenticated;
grant  execute on function match_campaign_npcs(vector, uuid, uuid, text, int) to service_role;

create function match_campaign_factions(
  query_embedding   vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  match_count       int
) returns table (
  id           uuid,
  name         text,
  faction_type text,
  distance     float
)
language sql stable
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.faction_type,
    e.embedding <=> query_embedding as distance
  from faction_embeddings e
  join factions f on f.id = e.faction_id
  -- Campaign rows plus the campaign OWNER's global (null-campaign) rows --
  -- see match_campaign_npcs above for the full rationale.
  where (f.campaign_id = p_campaign_id or (f.campaign_id is null and f.user_id = p_owner_id))
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_campaign_factions(vector, uuid, uuid, text, int) from public, anon, authenticated;
grant  execute on function match_campaign_factions(vector, uuid, uuid, text, int) to service_role;

create function match_campaign_locations(
  query_embedding   vector(1536),
  p_campaign_id     uuid,
  p_owner_id        uuid,
  p_embedding_model text,
  match_count       int
) returns table (
  id            uuid,
  name          text,
  location_type text,
  distance      float
)
language sql stable
set search_path = public
as $$
  select
    l.id,
    l.name,
    -- location_type is a USER-DEFINED enum (location_type_enum); postgres
    -- registers no implicit/assignment cast for it (confirmed against
    -- pg_cast), so this explicit cast is required to match the declared
    -- `text` return column -- not decorative.
    l.location_type::text as location_type,
    e.embedding <=> query_embedding as distance
  from location_embeddings e
  join locations l on l.id = e.location_id
  -- Campaign rows plus the campaign OWNER's global (null-campaign) rows --
  -- see match_campaign_npcs above for the full rationale.
  where (l.campaign_id = p_campaign_id or (l.campaign_id is null and l.user_id = p_owner_id))
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_campaign_locations(vector, uuid, uuid, text, int) from public, anon, authenticated;
grant  execute on function match_campaign_locations(vector, uuid, uuid, text, int) to service_role;
