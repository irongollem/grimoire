# Re-importing SRD content from Open5e

All SRD content carries a stable source identity — `source_document_key` +
`source_record_key` — enforced by a unique index per table (see
`supabase/migrations/20260720000012_version_srd_spell_content.sql`,
`20260720000022_version_character_options.sql`, `20260720000023_imported_content_identity_indexes.sql`).
Every import path below is keyed on that identity, so re-running it never
creates duplicates. This doc records, per entity type, what to run, what a
re-run does and does not overwrite, and known upstream data worth re-checking.

General rule for every path: fields Open5e actually supplies (name,
mechanical text, stat blocks, source metadata) refresh on re-run so upstream
fixes propagate. Fields Open5e has no data for — DM art, notes, custom
overrides, admin-reviewed mechanics — are **never** touched by a re-run, only
set once at creation.

## Shared/system content (service-role, admin-run)

| Entity | Command | On re-run |
| --- | --- | --- |
| `srd_spells` | `npm run seed-srd-spells` (flags: `--all`, `--list`, `--dry-run`, or explicit document keys) | Upserts on `(source_document_key, source_record_key)`. Refreshes all mapped fields **except** rows already marked `mechanics_reviewed = true` in the DB — those are excluded from the upsert entirely and left untouched (see `planSrdSpellImport` in `src/lib/open5eSpellImport.ts`). Art backfill from `srd_art_defaults` runs after. |
| `srd_monsters` | `npm run seed-srd-monsters` (same flags) | Upserts on `(source_document_key, source_record_key)`. Refreshes all mapped fields (name, stat block, source metadata). Art backfill from `srd_monster_art`/`srd_art_defaults` runs after. |
| `srd_rules` | Deployed as the `sync-srd-rules` Edge Function, runs on a weekly cron (`supabase functions deploy sync-srd-rules`); can also be invoked manually via `supabase functions invoke sync-srd-rules` (service-role only) | Upserts on `(source_document_key, source_record_key)` (`Prefer: resolution=merge-duplicates` equivalent — see `index.ts`). Removes rows this sync previously wrote that Open5e no longer returns; never touches user-authored custom rules entries. |
| `srd_items` (#303) | `npm run seed-srd-items` (same flags) | Upserts on `(source_document_key, source_record_key)`. Seeds Open5e v2 weapons/armor/magic items **plus** the grimoire-bundled gear/provisions/services/ammunition datasets (always included, stamped `ruleset: null` = edition-neutral, unlike the retired per-user import which stamped them 2014). Art backfill from `srd_art_defaults` (`content_type = 'item'`, matched on lowercase name) runs after; `sync_srd_item_art_to_shared_table()` re-runs the same backfill from the admin panel. |
| `srd_species` (#303) | `npm run seed-srd-species` (same flags) | Upserts on `(source_document_key, source_record_key)`. Seeds the core (non-subspecies) species per edition. Fields Open5e has no data for (`subraces`, `granted_spells`, `is_shapeshifter`, art) stay at defaults — a DM enriches a species by cloning it ("Clone to customize"), and the clone shadows the shared row. No art backfill (no canonical species art source yet). |

The seed scripts reuse the exact same mappers (`fetchSrdSpells` /
`fetchSrdMonsters` / `fetchSrdItems` / `fetchSrdSpecies` from
`src/lib/open5e*Import.ts`) that the in-app import flows use — there is one
source of truth for the Open5e → row shape, only the transport (CLI +
service-role upsert vs. browser client) differs.

**Client-side shadowing (#303):** `useItems()` / `useAllSpecies()` merge the
shared srd tables with the user's own rows. A per-user row hides ("shadows")
its shared counterpart when their `(source_document_key, source_record_key)`
match — and, as a fallback for rows imported before the versioning migration
`20260720000018` (which have `source` set but NULL identity keys), when their
lowercase names match. Existing vaults therefore look unchanged: previously
imported rows (with any hand-added art/edits) win over the shared rows, and
nothing is deleted or remapped. Item references (`store_items`,
`party_inventory`, recipes, loot tables, quest rewards, …) remain uuid FKs
into `items`; UI pickers convert a picked shared row into a per-user clone
via `useEnsureOwnedItem()` before persisting. Species references
(`party_members.species_id` / `disguise_species_id`,
`campaigns.disabled_species_ids`) are text since `20260724000003` and may
hold either a custom uuid or an `srd_species` slug directly.

## Per-user content (in-app import buttons)

These import into the *user's own* `items` / `class_features` /
`custom_classes` / `custom_subclasses` / `species` rows, keyed on
`(user_id, source_document_key, source_record_key)`. Insert-vs-update is
decided client-side by looking up existing rows with that identity; a DB
partial unique index is the last-resort duplicate guard if the client-side
check is ever wrong (insert then fails loudly instead of silently
duplicating).

| Entity | Where | Refreshed on re-run | Never touched on re-run |
| --- | --- | --- | --- |
| Items | **Retired in #303** — the "Import SRD Items" button and `useImportSrdItems` were removed; SRD items now come from the shared `srd_items` table (see above). Existing per-user imported rows are kept and shadow their shared counterparts. | — | — |
| Feats (`class_features`) | Character Codex → Abilities → **Import from Open5e** (`useImportSrdFeatures`) | `prerequisite`, `feature_type`, `name`, `description`, `source`, ruleset/identity fields — only rows with `open5e_import = true` are matched for update | `tags`, any `source` override, `campaign_id` |
| Classes (`custom_classes`) | Character Codex → Classes → **Import from Open5e** (`useImportOpen5eClasses`) | `class_name`, `source`, `hit_die`, `saving_throws`, `features`, ruleset/identity fields | `primary_ability`, `armor_proficiencies`, `weapon_proficiencies`, `subclass_level`, `asi_levels`, `spell_slots`, `spells_known`, `cantrips_known`, `slot_recovery`, `caster_type`, `prepared_ability`, `prepared_divisor`, `steps`, `resources`, `campaign_id` — Open5e's class API has no data for any of these; a DM fills them in by hand after the first import |
| Subclasses (`custom_subclasses`) | Character Codex → Archetypes → **Import from Open5e** (`useImportOpen5eSubclasses`) | `class_name`, `subclass_name`, `source`, `description`, `features`, ruleset/identity fields | `granted_spells`, `steps`, `resources`, `hp_per_level`, `campaign_id` |
| Species | Species list → **Import from Open5e** panel (`SpeciesOpen5ePanel.vue`) — search-and-pick flow only; the "Import / update core PHB species" bulk seed button was retired in #303 (core species now come from the shared `srd_species` table, mapper extracted to `src/lib/open5eSpeciesImport.ts`) | `name`, `description`, `size`, `speed`, `ability_score_increases`, `traits`, `languages`, `tags`, `source`, ruleset/identity fields | `notes`, `subraces`, `image_url`, `focal_point`, `is_shapeshifter`, `avg_height`, `avg_weight`, `granted_spells` |
| Monsters (`monsters`) | `useImportSrdMonsters` in `src/composables/useMonsters.ts` — **not currently wired to any UI**; the supported re-import path for monsters is `npm run seed-srd-monsters` into the shared `srd_monsters` table instead. Kept idempotent defensively in case it's ever surfaced. | `name`, `monster_type`, `size`, `alignment`, `source`, `source_title`, `source_url`, `stat_block`, ruleset/identity fields | `notes`, `image_url`, `portrait_focal_point`, `description`, `habitat`, `lair_location_id`, `tags` |
| Spells (`spells` table, legacy) | `useImportSrdSpells` in `src/composables/useSpells.ts` — **not currently wired to any UI**; the supported re-import path for spells is `npm run seed-srd-spells` into the shared `srd_spells` table instead. Kept idempotent defensively. | Same content fields as the `srd_spells` seed | Same `mechanics_reviewed = true` exclusion as the seed path |

Backgrounds (`backgrounds` table, `src/lib/open5eBackgroundImport.ts` /
`src/composables/useBackgrounds.ts`) are out of scope for this document —
owned by a separate in-flight change.

## Known upstream records worth re-checking

- **open5e-api#964** — `srd-2024_greater-invisibility` (Greater Invisibility,
  SRD 5.2) currently returns an empty `desc` from the Open5e v2 API. Re-run
  `npm run seed-srd-spells` once upstream fixes it; the row isn't
  `mechanics_reviewed`, so the fix picks up automatically. Any other
  SRD 5.2 spell/monster that ships with an obviously blank or truncated
  description is worth checking against this same upstream issue before
  assuming it's a mapper bug.

## Verifying a re-run was safe

After any bulk seed/import (and automatically after every migration deploy —
the supabase-migrations workflow runs
[`supabase/checks/content_integrity.sql`](../supabase/checks/content_integrity.sql)
against production and fails the deploy on any dangling shared-content
reference):

1. Row counts shouldn't jump beyond `inserted` — `select count(*) from srd_spells;` before/after.
2. `select id, name from srd_spells where mechanics_reviewed and updated_at > now() - interval '5 minutes';` should return nothing after a spell re-import (reviewed rows must never show as just-updated).
3. Spot-check a DM-customized row (custom art, edited description, hand-tuned class mechanics) still has its edits after re-running the relevant import.
