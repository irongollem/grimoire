# Database Review: graded table setup (epic #999, story 3.4)

A graded review of the schema as it stands after the 7 Oct 2026 work (2.2 slim lists, migration `20261006230038` initplan wrapping, `20261006231018` cron history purge). Read-only: every schema fact below was taken from `pg_catalog` on a local stack replayed from `supabase/migrations/` plus `grep` over `src/` and `supabase/functions/`. Nothing here was measured on production, and the doc deliberately carries no production row counts or sizes; where size matters it uses the relative buckets (tiny, small, medium) the maintainer supplied.

RLS policy merging is story 3.3 and is not reviewed here. FK-index work overlaps 3.1 and slow-query work overlaps 3.2; both wait for a day of production statistics, and the candidates below say which of theirs they touch.

Scale of the schema: about 176 tables in `public`, 628 indexes, 387 foreign keys, 540 RLS policies on 168 tables, 190 `jsonb` columns across 70 tables, 102 array columns, 251 CHECK constraints, 6 enums.

## Grades

| # | Dimension | Grade | One-line reason |
| - | --------- | ----- | --------------- |
| 1 | Keys and integrity | B | Every table has a PK and RLS; 69 FKs lack a covering index (a handful matter); text-id references to shared content are well covered by `content_integrity.sql` |
| 2 | Normalisation and jsonb | C+ | Hot display fields (`challenge_rating`, `armor_class`, `hit_points`) live inside TOAST-heavy `stat_block`; 190 jsonb columns with only a few queried by path; no GIN indexes behind the containment filters that exist |
| 3 | Indexes | B | Hot lookups (`campaign_members`) are covered; 5 exact duplicate indexes and 13 prefix-redundant ones; ten tables with `campaign_id` and no `campaign_id`-led index |
| 4 | RLS cost | B | `auth.uid()` wrapped in 349 of 350 uses; helpers are STABLE, definer, with `search_path` set, but are per-row calls that the planner cannot inline or hoist |
| 5 | Naming and conventions | A- | No `srd_*` objects, 139 triggers on `update_updated_at()`, `gen_random_uuid()` everywhere, no `timestamp without time zone`; two tables miss the `updated_at` trigger |
| 6 | Data lifecycle | B- | Real purge machinery exists (11 cron jobs plus `purge_expired_retention`); several append-only tables have no retention at all |
| 7 | Embeddings | B+ | One vector per entity, HNSW cosine indexes, cascade cleanup, model and hash gating; scoped searches have no iterative-scan setting, so filtered recall is unproven |

## 1. Keys and integrity (B)

**Primary keys.** No table in `public` lacks one. 24 tables use a `text` PK, all of them shared-library or config tables whose ids are slugs (`library_monsters.id`, `library_spells.id`). The rest are uuid with `gen_random_uuid()` defaults (130 defaults, no `uuid_generate_*` left).

**Foreign keys.** 387 FKs; 96 cascade from `auth.users` and 66 cascade from `campaigns`. Those two parents are the real delete amplifiers: account erasure and campaign deletion walk every child table.

**FKs with no covering index (69 by a set-wise leading-column test).** Most are harmless because the parent is almost never deleted or the child is tiny. Grouped by whether they matter:

*Matter: cascade from `campaigns`, a parent whose delete walks the child.* Without an index each child costs a sequential scan per deleted campaign. All the child tables are small or warm, so this is a latency tail on campaign delete, not a steady-state cost.

- `item_entries.campaign_id`, `dashboard_layouts.campaign_id`, `document_imports.campaign_id`, `quest_threads.campaign_id`, `npc_favors.campaign_id`, `dm_note_touches.campaign_id`
- `loot_placements (campaign_id, location_id)` toward `locations`

*Matter: join or filter path used by the app, cascade from quest topology.* The quest runtime is warm, and `quest_beats`, `quest_beat_edges`, `quest_beat_attachments`, `quest_runtime_state` and `quest_threads` are all read by `(campaign_id, quest_id)` or by beat id.

- `quest_beats (campaign_id, quest_id)`, `quest_threads (campaign_id, quest_id)`, `quest_runtime_state (campaign_id, quest_id)`
- `quest_beat_edges (campaign_id, quest_id, source_beat_id)` and `(..., target_beat_id)`; `quest_beat_attachments (beat_id, campaign_id, quest_id)`; `quest_beat_edge_gates (campaign_id, edge_id, quest_id)`
- `quest_consequences` on `target_quest_id`, `on_objective_id`, `target_npc_id`, `entry_beat_id`

*Matter: shared-library parents.* `library_items` is replaced by the Open5e import path; a delete of a library item must scan `crafting_recipe_ingredients`, `crafting_recipe_outputs`, `faction_items`, `store_items`, `npc_inventory`, `party_inventory` by `library_item_id`. Those child tables are small, so this is correctness-safe and cost-minor.

*Do not matter (SET NULL to rarely-deleted parents, audit columns).* `quest_consequence_events.*` (calendar_event_id, message_id, journal_entry_id, favor_id, milestone_id, ...), `npc_favors.source_event_id`, `party_milestones.source_event_id`, `library_tile_packs.content_source_key`, `quests.entry_beat_id`.

*`auth.users` children with no index (about 20).* `created_by`/`updated_by`/`decided_by`/`marked_by` audit columns are SET NULL and harmless. The ON DELETE CASCADE ones matter only for account erasure: `item_entries.user_id`, `location_placements.user_id`, `location_doors.user_id`, `location_state_events.user_id`, `location_map_regions.user_id`, `prompt_screenings.user_id`. Erasure is rare, and `prepare_user_erasure` already exists as the orchestrated path.

Overlap with 3.1: this is exactly 3.1's FK-index list. This review adds the "does it matter" grading; 3.1's statistics should confirm which of the "matter" group are actually scanned.

**Text-id references to shared content.** Shared ids are text slugs, so a reference from a user table to `library_*` is either a real FK (when the child column is `text`, as in the nine `library_item_id` / `library_monster_id` FKs that exist) or a soft reference. `supabase/checks/content_integrity.sql` (209 lines, run against production by the deploy workflow) covers: `discovered_monsters`, `pinned_forms`, the four `library_*_art*` tables, `companions.source_monster_id`, `character_spells.spell_id`, `spell_cast_records.spell_id`, and the jsonb referrers (`encounters.combatants[]`, `encounter_state.combatants_live[]`, spawn actions, `party_members.concentration`, `species`/`custom_subclasses.granted_spells`). That list was derived by a column scan (see the file's COVERAGE NOTE), which is the right method.

Gaps found:

- Uuid array columns that reference user-owned rows have neither FK nor check: `items.spell_ids`, `loot_tables.monster_ids`, `campaigns.excluded_monster_ids` (all `uuid[]`). A deleted spell or monster leaves a dangling element. They cannot be FKs; a trigger-based or periodic check is the only protection. Low impact (the UI tolerates unknown ids), listed for completeness.
- `encounters.item_ids` is `text[]` of library item slugs and has no check in the file.
- `character_spells.spell_id` and `spell_cast_records.spell_id` are plain `text` that could in principle be FKs to `library_spells` for the slug case, but they also hold uuids of custom spells (the check excludes uuid-shaped values), which is why they are checked rather than constrained.

## 2. Normalisation and jsonb (C+)

190 jsonb columns on 70 tables. The great majority are legitimate documents (focal points, provenance, manifests, layouts, `ai_provenance`). The review looked for jsonb that is *queried by path* or *over-read by lists*.

**Queried by path in functions.** `stat_block ->` appears in `browse_monsters` (`lm.stat_block -> 'challenge_rating'`, `'armor_class'`, `'hit_points'`), `match_library_monsters` (`stat_block->>'challenge_rating'`), and the client's `useMonsterIndex.ts:31` (`challenge_rating:stat_block->>challenge_rating`, `speed:stat_block->>speed`). Others: `dispatch_loot`, `get_loot_placements`, `get_player_visible_quest_beats`, `get_player_visible_site_state`, `perform_quest_consequence`, `match_import_entity_names` read `payload`, `entries`, `layers`, `metadata`.

**The over-read.** `library_monsters.stat_block` is the single biggest TOAST consumer after the embeddings (one of the largest tables by bytes). Every list or browse call that wants three scalar fields detoasts and parses the whole document per row. `browse_monsters` does this for the whole shared bestiary on each search, because it filters `library_monsters` into a CTE before paging. The NPC list had the same shape and 2.2 fixed it by narrowing the select; the monster path was narrowed on the client (`useMonsterIndex`) but the function and the retrieval RPC still reach into the document.

*Fix shape:* promote `challenge_rating`, `armor_class`, `hit_points` (and `speed` for the index) to stored generated columns, or plain columns kept in step by the import. Stored generated columns from `stat_block` keep one source of truth and need no app-side backfill.

**Client containment filter without an index.** `useNpcs.ts:135` runs `.contains("stat_block", { spellcasting: { entries: [{ spell_ids: [id] }] } })` on `npcs`. It is scoped by `.eq("campaign_id", cid)` first, `npcs` is small per campaign, and there is no GIN index on `stat_block`; at this size the filter is fine. It would only matter if one campaign held thousands of NPCs. `usePlayerHandouts.ts:34,54` uses `.contains("player_visible_to", [id])` on an array column; the arrays are tiny.

**Array columns with GIN.** `sound_library.tags`, `soundboard_playlists.tags` and `npcs.tags` have GIN indexes. The 102 array columns include other `tags` that are only ever displayed, which is fine.

**No jsonb path or containment in RLS.** No policy in `public` uses `->`, `->>` or `@>` outside of `auth.jwt()` claim reads, so RLS never parses a document per row. This is the good news in this dimension.

**Duplicated data.** `ai_provenance` appears on 30 tables and `provenance` on 18, and `image_provenance` also records by storage key (epic #935). That is intentional (registry by key, column by row) but is the largest duplication. `portrait_focal_point`/`image_focal_point`/`focal_point` are three names for the same shape on about 30 tables; naming only, no cost.

**Bulky documents that rows carry.** `encounters.combatants` and `.events`, `encounter_state.combatants_live`, `party_members` (11 jsonb columns on a warm table), `ai_generation_jobs.request_json/result_json`, `document_imports.extracted`, `dungeon_maps.layers`. `party_members` is the one worth watching: any list that selects `*` pulls `doll`, `class_resources`, `level_choices`, `wildshape_state`. The 2.2 slim-list pattern (narrow select) is the answer, not a schema change.

## 3. Indexes (B)

**Hot path.** `private.is_campaign_member(cid)` and `is_campaign_dm(cid)` both do `select exists (select 1 from public.campaign_members where campaign_id = cid and user_id = auth.uid() [and role = 'dm'])`. `campaign_members_campaign_id_user_id_key` is a unique index on exactly `(campaign_id, user_id)`, so the lookup is an index-only probe. This is the right shape for the hottest table. The client reads of `campaign_members` (11 call sites) filter on `campaign_id`, `user_id` or `id`, all indexed.

**Exact duplicates (same table, columns, opclass and predicate).** Each wastes a write on every row change and the index pages:

| Table | Keep | Drop |
| ----- | ---- | ---- |
| `app_invites` | `app_invites_token_key` | `app_invites_token_idx` |
| `campaign_invites` | `campaign_invites_token_key` | `campaign_invites_token_idx` |
| `downtime_outcomes` | `downtime_outcomes_draw_id_key` | `downtime_outcomes_draw_idx` |
| `soundboard_broadcast` | `soundboard_broadcast_campaign_id_key` | `soundboard_broadcast_campaign_idx` |
| `location_map_regions` | `location_map_regions_space_uniq` | `location_map_regions_space_idx` |

All five tables are tiny to small, so the saving is small in absolute terms. This is not an "unused index" argument (the sanctioned exception does not apply): a unique index on the same column set already serves every lookup the plain one can.

**Prefix-redundant (a non-unique index whose columns lead another index).** Worth a human look rather than a bulk drop, because a narrower index can win on size for scans that need only the leading column:

- Strictly covered by a unique constraint on the same leading column: `campaign_members_campaign_idx` (by `(campaign_id, user_id)`), `npc_pc_notes_npc_idx`, `session_availability_proposal_idx`, `character_classes_member_idx`, `store_items_location_id_idx`, `class_option_texts_campaign_class_idx`, `location_doors_from_idx`, `character_content_reviews_party_member_idx`.
- Covered by another non-unique composite: `npcs_user_idx` (by `npcs_relationship_idx` and `npcs_status_idx`), `calendar_events_user_idx` (by `calendar_events_year_idx`), `notes_user_id_idx` (by `notes_category_idx`), `scriptorium_docs_user_idx` (by `scriptorium_docs_type_idx`). Here the single-column index is smaller and may serve RLS `user_id = ...` scans better; keep unless size matters.

`campaign_members_campaign_idx` deserves a specific note: `campaign_members` is the hot table and receives a write for every join and role change; the unique `(campaign_id, user_id)` index fully replaces it.

**Missing leading-column indexes on scoping columns.**

- `campaign_id` with no index led by it: `dashboard_layouts`, `dm_note_touches`, `document_imports`, `item_entries`, `loot_placements`, `npc_favors`, `quest_beat_attachments`, `quest_beat_edge_gates`, `quest_beat_edges`, `quest_threads`. `document_imports` is warm and `quest_threads` / `quest_beat_edges` are in the quest runtime read path (these reads are narrowed by `quest_id` first on other indexes, so impact is not obvious without statistics).
- `user_id` with no led index: `item_entries`, `location_doors`, `location_map_regions`, `location_placements`, `location_state_events`, `prompt_screenings`. The location tables have campaign or location indexes that serve their reads, so only erasure pays.

Overlap with 3.1 (FK indexes) and 3.2 (slow queries): the `campaign_id` gaps are the same set as the campaign-cascade FK gaps in section 1.

**Search.** `library_monsters`, `library_items` and `library_spells` have only the PK, a source-identity unique and `(ruleset, conceptual_key)`. `browse_monsters` filters `source = any(p_slugs)` and `ruleset = ...` and does `ilike '%term%'` on `name`/`monster_type`/`habitat`. There is no `pg_trgm` and no index on `source`. For tables in the "medium" bucket this resolves to a sequential scan, which is acceptable; the cost is dominated by the detoast in section 2, not the scan.

**Index count.** 628 indexes for 176 tables, roughly 3.6 per table. Top: `quest_consequences` (11), `party_members` (10), `location_placements` (10), `npcs` (9). Mostly justified by RLS plus filter columns.

## 4. RLS cost (B)

Out of scope: merging policies (3.3). In scope: what each policy costs per row.

**Initplan wrapping is essentially complete.** Of 350 policy expressions that reference `auth.uid()`, 349 use `( SELECT auth.uid() AS uid)`. The one bare use is `campaign_tile_packs_select` (`(auth.uid() = user_id) OR private.is_campaign_member(campaign_id)`), and it stays bare on purpose: wrapping it adds a sublink, which turns on Postgres's policy-recursion check, and because it and `user_tile_packs_select` reference each other, that check then fails with "infinite recursion detected in policy" (see `20261006230038`, caught by `cartographer_tile_packs.test.sql`). Both tables are tiny.

**Helpers per row.** Policy usage of `private.*` helpers: `is_campaign_dm` 185 policies, `is_app_admin` 104, `is_campaign_member` 52, `can_edit_faction` 10, `my_party_member_id` 7, plus a long tail. All hot helpers are `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, with correct `search_path`, which satisfies the repo's definer rules.

Costs inherent to that shape:

- `private.is_campaign_member(campaign_id)` takes a column argument, so it cannot be hoisted into an initplan. It runs once per candidate row, each call an index probe on `campaign_members`. For list reads of campaign-scoped data the probe repeats for every row of the same campaign, with the same answer.
- `SECURITY DEFINER` plus `SET search_path` prevents the planner from inlining the SQL body into the policy, so each call pays a function-call context switch. Inlinable invoker alternatives are not available because `campaign_members` is itself RLS-protected.
- 81 policies use an `EXISTS`/`IN (SELECT ...)` subquery, for example `party_members_select` and `party_members_player_update` (an `EXISTS` on `campaign_members` plus two helper calls), which makes the party list the most expensive policy evaluation among the warm tables.

**Joins inside policies.** `campaign_tile_packs_insert` joins `user_tile_packs`; `party_members_player_update` and `_select` read `campaign_members`. Elsewhere policies are single-table or helper-only, which is good.

**Warm-table check.** `items`, `npcs`, `quests` read policies are plain `(select auth.uid()) = user_id`, so their list reads pay nothing for helpers. `items_select` and `npcs` being owner-only means player visibility of those goes through views and RPCs, not policies, which is why their policy cost is low.

*Fix shape for the helper cost:* a campaign-membership set can be resolved once per statement by calling a helper that returns the caller's campaign ids as an array and using `campaign_id = any ((select private.my_campaign_ids()))`, which becomes an initplan. This changes policies and is therefore 3.3 territory; recorded only as a measurement target for 3.2.

## 5. Naming and conventions (A-)

- No `srd_*` tables, columns or functions in `public`; shared content is `library_*` throughout. Pass.
- `updated_at` triggers: 139 use `update_updated_at()` (the sanctioned form). Two tables carry an `updated_at` column with no trigger: `ai_model_pricing` and `encounter_state_player_updates`. The latter is an append-style table so the column may be insert-only; `ai_model_pricing` is admin-edited config where a stale `updated_at` is misleading. One additional trigger function, `items_touch_content_updated_at`, is a deliberate per-column variant.
- RLS: every table has RLS enabled (zero without). 168 tables carry policies; the 8 embedding tables, `parental_consent_requests` and `session_proposal_invites` are deny-all by design (documented in CLAUDE.md as the `rls_enabled_no_policy` category). The CRUD four-policy pattern is not universal: 50-odd tables have fewer than four commands. Spot checks show these are server-written tables (ledgers, jobs, config) where writes go through RPCs; that is a convention variance and not a hole.
- Types: no `timestamp without time zone`, no `uuid_generate_*`, 6 enums against 251 CHECK constraints (CHECK is the dominant idiom, which is consistent).
- Outliers: 24 tables use text PKs (all shared content, expected). `library_art_staging`, `library_art_defaults`, `*_art_canonical` follow the `library_*` rule.

## 6. Data lifecycle (B-)

**What exists.** 11 pg_cron jobs, listed from `cron.job` on the local stack: `fail-stale-image-jobs`, `fail-stale-ai-generation-jobs`, `release-stale-credit-holds`, `purge-rate-limit-events` (25h), `scrub-stale-ai-prompt-content` (nightly), `purge-bug-report-data` (nightly), `purge-expired-retention` (nightly 04:20), `sweep-stranded-document-imports`, `sweep-stranded-minis`, `sweep-child-accounts`, `poll-meshy-jobs` (every minute), `purge-cron-run-history` (7 days, the half-the-database fix).

`private.purge_expired_retention()` deletes, by horizon: `ai_credit_ledger`, `purchase_consents`, `admin_audit_log`, `dsr_requests` (7 calendar years from year start, legal retention), `abuse_guard_trips` (180 days), `image_generation_jobs` (90 days unless a ready image), `ai_generation_jobs` (365 days), expired `app_invites` and `campaign_invites` (90 days), `feature_interest` (365 days).

**Append-only tables with no purge found.** Neither the function nor any cron job touches these. Whether each matters is a production-statistics question (3.2):

| Table | Growth driver | Note |
| ----- | ------------- | ---- |
| `prompt_screenings` | one row per AI prompt screened | has `created_at_idx`; scores jsonb; likely the fastest-growing of the group |
| `encounter_state_player_updates` | one row per combat update pushed to players | transient by nature; a short horizon is safe |
| `campaign_messages` | consequence and chat messages | cascades with the campaign; only the quest engine deletes selectively |
| `quest_consequence_events` | one per fired consequence | the quest runtime log; bounded by play, cascades with the campaign |
| `location_state_events` | door and fog play-state facts | the state log by design (epic #868) |
| `spell_cast_records`, `dm_note_touches` | per-cast / per-edit | `dm_note_touches` has its own trim inside the DM-notes write path (`20261006093358`) |
| `tile_pack_generation_jobs`, `tile_pack_generation_runs` | per tile-pack run | `attempts` and `plan` jsonb; no horizon |
| `image_provenance` | one row per stored image key | permanent registry by design (epic #935), with no orphan sweep found in the migrations or cron jobs |
| `private.campaign_sync_pending` | the doorbell's per-transaction queue | inserted and drained inside one transaction (`private.send_campaign_rings` at commit), so empty between transactions; the rings themselves are Realtime Broadcast messages, which Realtime keeps for three days in daily partitions |

`rate_limit_events` (hourly), `bug_reports` (screenshot scrub) and the AI job tables are handled. The pattern already in `purge_expired_retention` (a dated `delete` per table) is the right home for the rest.

**Per-user cascade.** Everything user-owned cascades from `auth.users` (96 FKs), so account deletion closes the lifecycle for the personal tables; the open question is only unbounded growth *within* a live account.

## 7. Embeddings (B+)

**Shape.** Eight embedding tables (not six): `library_monster_embeddings`, `library_item_embeddings`, `monster_embeddings`, `item_embeddings`, `npc_embeddings`, `location_embeddings`, `faction_embeddings`, `note_embeddings`. Each has the entity id as its PK (one vector per entity), `embedding vector(1536)`, `embedding_model text`, `source_hash text`, `created_at`, `updated_at`.

- **Dimension and size.** 1536 float32 dimensions is 6 KB per vector before index. This is why the embedding tables head the bytes list even though their row counts are modest.
- **Index.** Every table has `*_vec_idx` as `hnsw (embedding vector_cosine_ops)` with default `m` and `ef_construction` (no `reloptions` set). HNSW is the right type for this size (no training step, unlike ivfflat). Each HNSW index is itself several times the heap size of its table; for the largest tables the vector index probably dominates their on-disk footprint. At their current sizes the planner will often prefer an exact scan, so the index may be bought for scale that has not arrived.
- **Stored once per entity.** Yes: PK on entity id, upserted with `source_hash` and `embedding_model` gating (`supabase/functions/_shared/embeddings.ts`, re-embed when text or platform model changes). There is no history or duplicate per model; a model change rewrites the row.
- **Cleanup.** All eight FKs are `ON DELETE CASCADE` to the owning entity, so deleting a monster, NPC, item, location, faction, note, library monster or library item removes its vector. `private.is_demo_embedding_table` handles the demo-campaign copy path. No orphan class exists.
- **RLS.** Deny-all (enabled, zero policies); reads go through the invoker `match_*` functions called with the service role by edge functions. Correct for vectors that must not travel as payloads.

**Recall risk on scoped searches.** The retrieval functions (`match_library_monsters`, `match_custom_monsters`, `match_campaign_npcs`, `match_custom_items`, `match_library_items`, `match_campaign_locations`, `match_campaign_factions`, `match_campaign_notes`) order by `embedding <=> query_embedding` with a `WHERE` on a joined table (campaign, owner, source slugs, ruleset, model). When the planner chooses the HNSW index, pgvector returns at most `hnsw.ef_search` (default 40) candidates and the filter is applied afterwards, so a restrictive filter can return fewer than `match_count` rows. The code comments in `match_library_monsters` state the filter must never be a post-filter on the ranked top-K, but the index scan does exactly that unless iterative scan is on. `grep` finds no `hnsw.iterative_scan` or `ef_search` anywhere in the repo. pgvector 0.8.0 (installed) supports `hnsw.iterative_scan`. At current table sizes the planner likely uses exact scans, so the defect is latent.

**Duplicated vectors across tables.** `items` copies adopted from `library_items` embed again in `item_embeddings` alongside `library_item_embeddings`; same for `monsters`/`library_monsters`. Embedding the user's own copy is needed only when its text diverges; an `adopt` that carries `source_hash` could reuse the library vector. A modest saving, not a defect.

## Follow-up candidates

Ranked by benefit times confidence over risk. "Stats" means it needs production statistics first; "3.1" and "3.2" mark overlap with those stories.

| Rank | Story | Candidate | Evidence | Benefit | Risk | Size | Stats |
| ---- | ----- | --------- | -------- | ------- | ---- | ---- | ----- |
| 1 | 3.4.1 | Drop the 5 exact duplicate indexes and the strictly-covered `campaign_members_campaign_idx` | Section 3 table; identical key, opclass and predicate | Fewer writes on the hottest table and 5 others; no read change | Very low (an identical or covering index remains) | One migration, 6 `drop index` | No |
| 2 | 3.4.2 | Add generated columns `challenge_rating`, `armor_class`, `hit_points` (and `speed`) on `library_monsters` and `monsters`, and point `browse_monsters`, `match_library_monsters`, `useMonsterIndex` at them | `browse_monsters` body, `useMonsterIndex.ts:31`, `match_library_monsters`; TOAST-heavy `stat_block` | Removes per-row detoast on the busiest library browse; likely the largest read win in this review | Low-medium (rewrite of a table with large rows; function and client changes; the `stat_block->` paths must stay in step) | One migration plus function and composable edits; M | Confirm with 3.2 (`browse_monsters` in `pg_stat_statements`) |
| 3 | 3.4.3 | Enable `hnsw.iterative_scan = relaxed_order` for the `match_*` functions (function-level `SET`), or confirm exact scans are chosen | No `iterative_scan` or `ef_search` in repo; filtered `order by <=> limit` | Better recall for restrictive scopes (campaign, source, ruleset) as tables grow: the scan keeps going until enough rows pass the filter or its limit is reached, so it narrows the shortfall rather than guaranteeing exact results | Low (a `SET` clause per function; test with a fixture) | Small; needs an EXPLAIN test over seeded vectors | Partly (to see which plan prod picks) |
| 4 | 3.4.4 | Index the campaign-cascade and quest-runtime FKs that matter: `item_entries`, `dashboard_layouts`, `document_imports`, `quest_threads`, `npc_favors`, `dm_note_touches`, `loot_placements` on `campaign_id`; `quest_beats`, `quest_threads`, `quest_runtime_state` on `(campaign_id, quest_id)`; the two `quest_beat_edges` beat pairs; `quest_beat_attachments (beat_id, campaign_id, quest_id)` and `quest_beat_edge_gates (campaign_id, edge_id, quest_id)`; `quest_consequences` on `target_quest_id`, `on_objective_id`, `target_npc_id`, `entry_beat_id` | Section 1 and 3 lists | Fast campaign delete and quest-runtime lookups; avoids sequential scans in cascades | Low (write cost of ~20 small indexes) | One migration; S-M | Yes: this is 3.1; use its statistics to pick the subset |
| 5 | 3.4.5 | Retention for `prompt_screenings` and `encounter_state_player_updates`, then a decision for `tile_pack_generation_jobs/runs`; add each to `purge_expired_retention` | Section 6 table | Bounds the largest unbounded append-only tables; the cron-history incident was this class of bug | Low (delete by date; confirm product horizon for `prompt_screenings`, which is an abuse-review log) | S per table | Yes: size and growth rate first |
| 6 | 3.4.6 | Review the HNSW indexes on the small embedding tables (the small `*_embeddings` tables): drop where exact scan is planned and keep where growth is expected; consider `halfvec` for storage | Section 7: 6 KB/row, default HNSW parameters | Smaller database (these are the top bytes consumers); faster upsert | Medium (changes retrieval plan; needs recall check) | M | Yes: index versus heap sizes from `pg_relation_size` |
| 7 | 3.4.7 | ~~Wrap the one bare `auth.uid()` in `campaign_tile_packs_select`~~ Not a candidate: left bare deliberately (policy recursion, section 4) | Section 4 | None | Wrapping it breaks the policy | None | No |
| 8 | 3.4.8 | Add `updated_at` triggers to `ai_model_pricing` (and decide for `encounter_state_player_updates`) | Section 5 | Convention parity; accurate timestamps for admin-edited pricing | None | One migration; XS | No |
| 9 | 3.4.9 | Investigate per-row helper cost on `party_members` (the `EXISTS` on `campaign_members` plus helper calls) and `private.is_campaign_member` hoisting | Section 4 | Possibly a measurable win on a warm table | Medium (policy semantics; 3.3's territory) | M; measurement first | Yes: 3.2 slow-query data |
| 10 | 3.4.10 | Extend `content_integrity.sql` for `encounters.item_ids` (text[] of library slugs); document the three `uuid[]` columns with no possible FK | Section 1 | Closes the remaining gaps in the dangling-reference check | None | XS-S | No |
| 11 | 3.4.11 | Orphan sweep for `image_provenance` against deleted storage keys | Section 6 | Bounds a permanent registry | Low-medium (must not remove still-referenced keys) | M | Yes |

Overlap summary: candidate 4 is story 3.1; candidates 2, 5, 6 and 9 depend on or inform story 3.2; candidate 9 touches policies and must be sequenced with story 3.3; candidate 7 is withdrawn. Candidates 1, 3, 8 and 10 can start immediately and are independent of production statistics.
