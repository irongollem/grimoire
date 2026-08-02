-- Migration: rag_monster_embeddings
-- pgvector side tables + nearest-neighbour RPCs for retrieval-backed monster
-- selection in the Encounter Suggester (issue #595).

create extension if not exists vector;

-- ── Provider config ─────────────────────────────────────────────────────────
-- Embeddings get the same config treatment as text/image/audio: which model a
-- vendor uses lives in provider_config, not in code, so switching the
-- embedding vendor is a one-row UPDATE plus a backfill re-run -- no deploy, no
-- migration, no reindex.
--
-- Only two of the four integrated vendors can embed at all: Anthropic has no
-- embeddings endpoint and fal.ai is image generation, so both stay disabled
-- with a null model. Gemini's model is recorded but disabled, so flipping to
-- it later is `update provider_config set embedding_enabled = true where
-- provider = 'gemini'` (and false for openai) rather than a code change.
alter table provider_config
  add column embedding_model   text,
  add column embedding_enabled boolean not null default false;

update provider_config set embedding_model = 'text-embedding-3-small', embedding_enabled = true
  where provider = 'openai';
update provider_config set embedding_model = 'gemini-embedding-001'
  where provider = 'gemini';

-- Exactly one embedding vendor may be active, enforced by the database rather
-- than by convention. Two enabled vendors would mix incomparable vectors in
-- one index and return near-random matches while raising no error anywhere --
-- the single worst failure mode of this feature, and one an admin has no way
-- to notice. A unique index on a constant expression, partial on the flag, is
-- the standard "at most one row may be true" guarantee.
create unique index provider_config_single_embedding_vendor
  on provider_config ((true)) where embedding_enabled;

-- Switching vendor is ONE statement, so the invalid two-enabled state cannot
-- exist even transiently between two UPDATEs. SECURITY INVOKER (note the
-- absence of `security definer`): provider_config's UPDATE policy already
-- gates on app_metadata.role = 'admin', so RLS does the authorization and this
-- function needs none of its own. A non-admin caller updates zero rows and
-- gets the exception below.
create function set_embedding_provider(p_provider text, p_model text)
returns void
language plpgsql
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

revoke execute on function set_embedding_provider(text, text) from public, anon;
grant  execute on function set_embedding_provider(text, text) to authenticated, service_role;

-- ── Generation type ─────────────────────────────────────────────────────────
-- Zero credits: embedding is infrastructure, and the user already paid for the
-- encounter generation it serves. The row exists anyway because spend tracking
-- joins the ledger to ai_model_pricing by model, and an unlogged call is
-- invisible spend. Recording delta-0 rows with real token counts is the same
-- pattern BYOK generations already use -- see logUsage() in useAiCredits.ts --
-- and it is what lets feature pricing be set from measured cost instead of
-- guesswork.
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('monster_embedding', 'Monster Embedding (infrastructure)', 0, 21);

-- ── Model pricing ───────────────────────────────────────────────────────────
-- Embedding models need rows here or their spend is invisible to the cost
-- analytics -- the ledger derives real cost by joining usage to this table, so
-- an unpriced model silently reports as free. Embeddings are input-token-only
-- (there is no completion), hence a null output cost rather than a zero, which
-- would claim we know the output rate is nothing.
--
-- last_verified_at is deliberately left NULL: these rates are transcribed from
-- published vendor pricing rather than confirmed against an invoice, and the
-- admin pricing tab surfaces unverified rows so someone can check them. Do not
-- backfill a timestamp here to make the UI look tidy.
-- model_type is CHECK-constrained to text/image/audio, so it has to be widened
-- before the inserts below or this migration fails on apply and takes the
-- whole deploy with it. Keep useAdminModelPricing.ts's ModelPricing["model_type"]
-- union in step with this list.
alter table ai_model_pricing drop constraint ai_model_pricing_model_type_check;
alter table ai_model_pricing add constraint ai_model_pricing_model_type_check
  check (model_type = any (array['text', 'image', 'audio', 'embedding']));

insert into ai_model_pricing
  (model, provider, model_type, input_cost_per_million_tokens, output_cost_per_million_tokens, notes)
values
  ('text-embedding-3-small', 'openai', 'embedding', 0.02, null,
   'Embedding model. Input-token priced only. Rate as published Aug 2026 - verify before relying on cost reports.'),
  ('text-embedding-3-large', 'openai', 'embedding', 0.13, null,
   'Higher-quality OpenAI embedding model, not currently enabled. Rate as published Aug 2026 - verify.'),
  ('gemini-embedding-001',   'gemini', 'embedding', 0.15, null,
   'Gemini embedding model, recorded so a vendor flip has pricing ready. Rate as published Aug 2026 - verify.');

-- ── Side tables ─────────────────────────────────────────────────────────────
-- Embeddings live in side tables, never as a column on monsters or
-- library_monsters:
--   - fetchMonsters() and fetchLibraryMonsters() both .select("*"), so a
--     vector(1536) column (~6 KB/row) would add ~21 MB to every bestiary load
--     across 3,541 library rows.
--   - get_player_visible_monsters returns SETOF monsters. A new column there
--     would change that projection's shape -- which exists precisely to strip
--     DM-only data -- and start shipping vectors to players.
-- library_monsters.id is text (the srd_* keys CLAUDE.md documents); monsters.id
-- is uuid, hence the two tables instead of one. `on delete cascade` means a
-- deleted monster takes its embedding with it -- no orphan rows, no stale
-- vectors matching a monster that no longer exists.

-- embedding_model records which model produced each vector. Vectors are only
-- comparable when they come from the same model -- cosine distance between an
-- OpenAI vector and a Gemini one is meaningless, and the dimensions differ
-- (1536 vs 768). Storing the model makes a provider switch detectable and
-- self-healing: the backfill treats a row whose embedding_model no longer
-- matches the configured provider as stale and re-embeds it, exactly as it
-- does for a changed source_hash. Without this column a vendor swap would
-- leave a half-and-half index that returns near-random matches and raises no
-- error anywhere.

create table library_monster_embeddings (
  library_monster_id text primary key references library_monsters(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table monster_embeddings (
  monster_id      uuid primary key references monsters(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── HNSW indexes ────────────────────────────────────────────────────────────
create index library_monster_embeddings_vec_idx on library_monster_embeddings
  using hnsw (embedding vector_cosine_ops);

create index monster_embeddings_vec_idx on monster_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger library_monster_embeddings_updated_at
  before update on library_monster_embeddings
  for each row execute procedure update_updated_at();

create trigger monster_embeddings_updated_at
  before update on monster_embeddings
  for each row execute procedure update_updated_at();

-- ── RLS: enabled, intentionally zero policies ──────────────────────────────
-- These tables are written and read only by the generate-encounter edge
-- function through the service-role client, which bypasses RLS entirely.
-- Neither table has a user_id column or any client-facing access pattern, so
-- the standard four-policy pattern in CLAUDE.md (which assumes both) does not
-- apply here. RLS enabled with zero policies is a deny-all to anon and
-- authenticated -- this is intentional and keeps the security advisor clean.
-- Do not "fix" this later by adding permissive policies.
alter table library_monster_embeddings enable row level security;
alter table monster_embeddings enable row level security;

-- ── Nearest-neighbour RPCs ──────────────────────────────────────────────────
-- supabase-js/PostgREST has no way to express the `<=>` distance operator, so
-- there is no .select().order() form that performs a similarity search -- it
-- has to be a SQL function called via .rpc(). Both functions below are
-- SECURITY INVOKER (the default; note the absence of `security definer`), not
-- DEFINER: a definer function here would be auto-published by PostgREST as a
-- privileged `/rest/v1/rpc/<name>` endpoint and would have to authorize
-- internally -- exactly the trap CLAUDE.md documents. An invoker function runs
-- as its caller instead, so ordinary RLS applies: the empty-policy tables
-- above already deny everyone but service_role, and the revoke/grant pair
-- below is the only additional gate needed.

-- p_embedding_model pins every comparison to vectors produced by the SAME
-- model. This is what makes an AI-vendor switch lossless rather than
-- corrupting: flip the configured provider and re-run the backfill, and during
-- the re-embed window rows still carrying the old model are simply not
-- eligible -- they fall back to the compact-index path exactly like a monster
-- that has never been embedded. Without this predicate the index would serve a
-- mix of old- and new-model vectors and return near-random matches with no
-- error anywhere.
--
-- Why 1536 specifically: of the four vendors this app integrates, only two can
-- embed at all -- OpenAI and Gemini (Anthropic has no embeddings endpoint;
-- fal.ai is image generation). Both can emit exactly 1536 dimensions -- OpenAI
-- via its `dimensions` parameter, Gemini via gemini-embedding-001's Matryoshka
-- truncation. Pinning the column to the width they share means an AI-vendor
-- flip needs NO schema change and NO reindex: change the configured provider,
-- re-run the backfill, done. _shared/embeddings.ts rejects any adapter whose
-- dimensions are not 1536 rather than letting it write vectors the index
-- cannot use.

create function match_library_monsters(
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
    -- Same-model gate: never compare vectors across models. See the note above.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_library_monsters(vector, text[], text, text, int) from public, anon, authenticated;
grant  execute on function match_library_monsters(vector, text[], text, text, int) to service_role;

create function match_custom_monsters(
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
    -- Same-model gate: never compare vectors across models. See the note above.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_custom_monsters(vector, uuid, text, text, int) from public, anon, authenticated;
grant  execute on function match_custom_monsters(vector, uuid, text, text, int) to service_role;
