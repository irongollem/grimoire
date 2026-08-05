-- Migration: loot_generator_retrieval
-- Item embedding side tables + band-filtered match RPCs, plus the system
-- prompt, credit cost and provenance column for the AI loot-table generator
-- (#602). Fifth and sixth corpora after monsters (#595) and
-- npcs/factions/locations/notes (#600).

-- ── Side tables ─────────────────────────────────────────────────────────────
-- Embeddings live in side tables, never as columns on items or library_items:
-- fetchItems() and fetchLibraryItems() both .select("*") (useItems.ts), and
-- get_player_visible_items returns a projection of items, so a vector(1536)
-- column (~6 KB/row) would be paid on every vault load and would start
-- shipping vectors to players. Same reasoning as 20260803000001 for monsters.
--
-- Two tables, not one, for the same reason as the monster pair: library_items.id
-- is text (the srd_* keys CLAUDE.md documents), items.id is uuid. `on delete
-- cascade` means a deleted item takes its embedding with it.
--
-- SIZING, measured rather than estimated (the #599 comment's 4x index
-- multiplier, re-measured here on 5 Aug 2026): library_monster_embeddings is
-- 52 MB across 3,541 rows -- ~15 KB/row including the HNSW index. At 1,717
-- library_items and 2,015 items that is ~26 MB + ~30 MB, i.e. ~56 MB added to
-- a 211 MB database. Budgeted for deliberately: item retrieval is the whole
-- point of #602, and unlike monsters there is no compact-index fallback that
-- could stand in for it.
--
-- embedding_model records which model produced each vector -- vectors are only
-- comparable within one model. See 20260803000001 for the full rationale; not
-- restated per table.

create table item_embeddings (
  item_id         uuid primary key references items(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table library_item_embeddings (
  library_item_id text primary key references library_items(id) on delete cascade,
  embedding       vector(1536) not null,
  embedding_model text not null,
  source_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── HNSW indexes ────────────────────────────────────────────────────────────
create index item_embeddings_vec_idx on item_embeddings
  using hnsw (embedding vector_cosine_ops);

create index library_item_embeddings_vec_idx on library_item_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger item_embeddings_updated_at
  before update on item_embeddings
  for each row execute procedure update_updated_at();

create trigger library_item_embeddings_updated_at
  before update on library_item_embeddings
  for each row execute procedure update_updated_at();

-- ── RLS: enabled, intentionally zero policies ──────────────────────────────
-- Written and read only by the embed-content and generate-loot edge functions
-- through the service-role client, which bypasses RLS entirely. Neither table
-- has a client-facing access pattern, so the four-policy pattern in CLAUDE.md
-- (written for a table a client reads or writes directly) does not apply. RLS
-- enabled with zero policies is a deny-all to anon and authenticated -- this is
-- intentional and keeps the security advisor clean. Do not "fix" this later by
-- adding permissive policies.
alter table item_embeddings enable row level security;
alter table library_item_embeddings enable row level security;

-- ── Nearest-neighbour RPCs ──────────────────────────────────────────────────
-- Same shape as the monster and campaign-entity RPCs: SECURITY INVOKER (note
-- the absence of `security definer`), `set search_path = public` pinned at
-- creation, and a revoke/grant pair that keeps each function off the PostgREST
-- RPC surface. A DEFINER function here would be auto-published as a privileged
-- `/rest/v1/rpc/<name>` endpoint and would have to authorize internally --
-- exactly the trap CLAUDE.md documents.
--
-- WHAT IS NEW HERE, and the reason #602 could not just reuse
-- campaignEntityRetrieval's RPCs: p_rarities / p_exclude_attunement.
-- "Loot for a level 7 party" is a CONSTRAINT query, not a purely semantic one.
-- Cosine similarity will happily rank a Vorpal Sword top for "impressive
-- treasure", and a model handed that candidate will use it. So the band is a
-- WHERE predicate applied BEFORE ranking, exactly like the enabled-sources
-- gate: retrieval then does thematic ranking *inside* the band the DM asked
-- for. Filtering after ranking would silently shrink (or empty) the candidate
-- set and would still let out-of-band items reach the model on the way there.
--
-- p_rarities is derived server-side from loot_tables.cr_tier by
-- generate-loot (RARITIES_BY_TIER) -- never accepted raw from the client --
-- and an empty array means "no rarity constraint" so the `any` predicate is
-- guarded rather than matching nothing.
--
-- p_embedding_model pins every comparison to vectors from the SAME model. See
-- 20260803000001 for why that column exists at all.

create function match_custom_items(
  query_embedding     vector(1536),
  p_campaign_id       uuid,
  p_owner_id          uuid,
  p_rarities          text[],
  p_exclude_attunement boolean,
  p_embedding_model   text,
  match_count         int
) returns table (
  id        uuid,
  name      text,
  item_type text,
  rarity    text,
  distance  float
)
language sql stable
set search_path = public
as $$
  select
    i.id,
    i.name,
    i.item_type,
    i.rarity,
    e.embedding <=> query_embedding as distance
  from item_embeddings e
  join items i on i.id = e.item_id
  -- Campaign rows plus the campaign OWNER's global (null-campaign) rows --
  -- mirrors useItems.ts's `campaign_id === null || campaign_id ===
  -- activeCampaignId` scope filter and match_campaign_npcs's predicate, and
  -- survives #596's planned default-flip because null keeps meaning "global"
  -- whichever way new rows default. p_owner_id is campaigns.user_id, passed by
  -- the edge function -- never a caller-supplied id.
  where (i.campaign_id = p_campaign_id or (i.campaign_id is null and i.user_id = p_owner_id))
    -- Constraint band, before ranking. See the note above.
    and (cardinality(p_rarities) = 0 or i.rarity = any(p_rarities))
    and (not p_exclude_attunement or i.requires_attunement = false)
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_custom_items(vector, uuid, uuid, text[], boolean, text, int) from public, anon, authenticated;
grant  execute on function match_custom_items(vector, uuid, uuid, text[], boolean, text, int) to service_role;

create function match_library_items(
  query_embedding     vector(1536),
  source_keys         text[],
  p_ruleset           text,
  p_rarities          text[],
  p_exclude_attunement boolean,
  p_embedding_model   text,
  match_count         int
) returns table (
  id        text,
  name      text,
  item_type text,
  rarity    text,
  distance  float
)
language sql stable
set search_path = public
as $$
  select
    li.id,
    li.name,
    li.item_type,
    li.rarity,
    e.embedding <=> query_embedding as distance
  from library_item_embeddings e
  join library_items li on li.id = e.library_item_id
  -- Enabled-sources gate on source_document_key, NOT on `source`: that is the
  -- column fetchLibraryItems() filters on client-side (useItems.ts), and the
  -- two must agree or the generator would offer books the vault itself does
  -- not show. The caller passes 'grimoire-bundled' plus the campaign's enabled
  -- slugs, matching that query's `.in()` list exactly -- edition-neutral
  -- bundled gear is always visible, enabled campaign sources add to it.
  -- Surfacing a disabled source's content into a campaign is the licensing
  -- mistake #567/#583 fixed, so this stays a WHERE predicate applied before
  -- ranking, never a post-filter on the ranked top-K.
  where li.source_document_key = any(source_keys)
    -- Null ruleset = edition-neutral, visible in both editions. Same
    -- `ruleset.is.null,ruleset.eq.X` predicate fetchLibraryItems() applies.
    and (li.ruleset is null or li.ruleset = p_ruleset)
    -- Constraint band, before ranking. See the note above match_custom_items.
    and (cardinality(p_rarities) = 0 or li.rarity = any(p_rarities))
    and (not p_exclude_attunement or li.requires_attunement = false)
    -- Same-model gate: never compare vectors across models.
    and e.embedding_model = p_embedding_model
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function match_library_items(vector, text[], text, text[], boolean, text, int) from public, anon, authenticated;
grant  execute on function match_library_items(vector, text[], text, text[], boolean, text, int) to service_role;

-- ── Provenance column ───────────────────────────────────────────────────────
-- loot_tables was NOT among the 13 tables that got `ai_provenance` in the
-- EPIC #611 wave (context/compliance/provenance-architecture.md §2) for a
-- plain reason: no loot generator existed, so no generator output could land
-- here. This migration creates that generator, so the column has to exist in
-- the same change -- an AI-authored loot table with no provenance record is
-- exactly the unmarked-output case Art 50 is about. Null = no known AI
-- involvement; no backfill (unknowable), same as the original wave.
alter table loot_tables add column ai_provenance jsonb;

-- ── System prompt ───────────────────────────────────────────────────────────
-- Deliberately mirrors the 'roll_table' prompt's structure (20260623000003):
-- one JSON object, no prose, fields named exactly as the client consumes them.
-- The candidate-item block and the "use these exact names" instruction are
-- appended server-side by generate-loot (SCHEMA_EXTENSION_INSTRUCTION + the
-- ---BEGIN VAULT ITEMS--- block), not stored here, so an admin editing this
-- row cannot accidentally delete the grounding contract.
insert into ai_system_prompts (generator_type, label, content) values
('loot', 'Loot Table Generator', $$You are a creative assistant for Dungeons & Dragons 5e campaign management.

Generate a complete loot table (a hoard) based on the dungeon master's concept. A loot table is NOT a d100 roll table: every entry is checked independently against its own drop chance, so several entries — or none — can drop in a single roll.

Return a single JSON object with exactly these fields:

{
  "name": "Evocative table name (e.g. 'Smugglers' Vault Hoard', 'Gnoll Warband Spoils')",
  "description": "One sentence describing whose hoard this is and where it is found. Plain text.",
  "tags": ["3 to 5 short descriptive tags"],
  "entries": [
    {
      "type": "item",
      "item_name": "Exact name of a specific item",
      "drop_chance": 40,
      "dice": "1d4",
      "fixed_qty": null,
      "notes": "Optional DM-facing guidance — where it is hidden, who it belonged to. Plain text, or null."
    },
    {
      "type": "currency",
      "currency_label": "Optional short label shown in chat (e.g. 'Belt pouch'), or null",
      "drop_chance": 100,
      "pp": 0, "gp": 120, "ep": 0, "sp": 40, "cp": 0,
      "notes": null
    },
    {
      "type": "random",
      "rarity": "uncommon",
      "item_type_filter": "potion",
      "drop_chance": 50,
      "dice": null,
      "fixed_qty": 1,
      "notes": null
    }
  ]
}

Rules for entries:
- Produce 4 to 8 entries in a mix of types. A hoard that is all specific items is monotonous; one that is all currency is not loot, it is a purse.
- "drop_chance" is an integer 1-100, the independent chance that entry appears. Reserve 100 for the coin pool or the one thing the hoard is famous for; make the best item genuinely uncertain.
- Quantity: set EITHER "dice" (a dice expression like "2d4" or "1d6+1") OR "fixed_qty" (a positive integer), never both — set the unused one to null. A dice expression must be able to roll at least 1.
- "item" entries: "item_name" must name ONE specific item. Do not invent a quantity into the name ("3 healing potions"); use the quantity fields.
- "random" entries let the app pick a random matching item from the DM's vault at roll time. "rarity" is required and must be one of: mundane, common, uncommon, rare, very_rare, legendary, artifact. "item_type_filter" is optional and must be one of: weapon, armor, shield, potion, wondrous_item, ring, rod, staff, wand, scroll, ammunition, gear, tool, vehicle, trade_good, crafting_material, provision, art_object, service, pack — or null.
- "currency" entries: whole numbers per denomination, zero for the ones this hoard does not contain. Scale the coin to the party level and to who owned the hoard — bandits do not sit on platinum.
- Match the loot to the requested tier. A low-tier hoard leaning on consumables and coin is better than one that hands out a legendary weapon early.
- Give the hoard a through-line: the items should read like they belonged to the same owner, in the same place.

Ground the hoard in the campaign setting provided below.

Return only the JSON object. No markdown fences, no explanation.$$);

-- ── Credit cost ─────────────────────────────────────────────────────────────
-- 1 credit, matching every other text-only generator (quest, roll table,
-- encounter, downtime). The query embedding this generator also makes is
-- recorded separately at delta 0 as 'entity_embedding' -- infrastructure, not
-- a second charge.
insert into ai_generation_credit_costs (generation_type, label, credit_cost, sort_order) values
  ('loot_generation', 'Loot Table Generation', 1, 23);
