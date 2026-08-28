# Re-importing shared library content from Open5e

Note on naming: this covers the whole shared library (`library_monsters`,
`library_spells`, `library_items`, `library_species`, `library_rules`), not just
SRD. Most of it is not SRD — Kobold Press and EN Publishing supply the bulk of
the monsters and spells under their own licences. See the shared-content naming
rule in `CLAUDE.md`.

All shared content carries a stable source identity — `source_document_key` +
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
| `library_spells` | `npm run seed-library-spells` (flags: `--all`, `--list`, `--dry-run`, or explicit document keys) | Upserts on `(source_document_key, source_record_key)`. Refreshes all mapped fields **except** rows already marked `mechanics_reviewed = true` in the DB — those are excluded from the upsert entirely and left untouched (see `planLibrarySpellImport` in `src/lib/library/open5eSpellImport.ts`). Art backfill from `library_art_defaults` runs after. |
| `library_monsters` | `npm run seed-library-monsters` (same flags) | Upserts on `(source_document_key, source_record_key)`. Refreshes all mapped fields (name, stat block, source metadata). Art backfill from `library_monster_art`/`library_art_defaults` runs after. |
| `library_rules` | Deployed as the `sync-srd-rules` Edge Function, runs on a weekly cron (`supabase functions deploy sync-srd-rules`); can also be invoked manually via `supabase functions invoke sync-srd-rules` (service-role only) | Upserts on `(source_document_key, source_record_key)` (`Prefer: resolution=merge-duplicates` equivalent — see `index.ts`). Removes rows this sync previously wrote that Open5e no longer returns; never touches user-authored custom rules entries. |
| `library_items` (#303) | `npm run seed-library-items` (same flags) | Upserts on `(source_document_key, source_record_key)`. Seeds Open5e v2 weapons/armor/magic items **plus** the grimoire-bundled gear/provisions/services/ammunition datasets (always included, stamped `ruleset: null` = edition-neutral, unlike the retired per-user import which stamped them 2014). Art backfill from `library_art_defaults` (`content_type = 'item'`, matched on lowercase name) runs after; `sync_library_item_art()` re-runs the same backfill from the admin panel. |
| `library_species` (#303) | `npm run seed-library-species` (same flags) | Upserts on `(source_document_key, source_record_key)`. Seeds the core (non-subspecies) species per edition. Fields Open5e has no data for (`subraces`, `granted_spells`, `is_shapeshifter`, art) stay at defaults — a DM enriches a species by cloning it ("Clone to customize"), and the clone shadows the shared row. No art backfill (no canonical species art source yet). |

The seed scripts reuse the exact same mappers (`fetchOpen5eSpells` /
`fetchOpen5eMonsters` / `fetchOpen5eItems` / `fetchOpen5eSpecies` from
`src/lib/open5e*Import.ts`) that the in-app import flows use — there is one
source of truth for the Open5e → row shape, only the transport (CLI +
service-role upsert vs. browser client) differs. Note the naming split those
four sit on: `fetchOpen5e*` fetches over HTTP from api.open5e.com, while
`fetchLibrary*` (in the composables) reads the `library_*` table. The same verb
on both sides of that line is how the two got confused before.

**Client-side shadowing (#303):** `useItems()` / `useAllSpecies()` merge the
shared library tables with the user's own rows. A per-user row hides ("shadows")
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
hold either a custom uuid or a `library_species` slug directly.

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
| Items | **Retired in #303** — the "Import SRD Items" button and `useImportSrdItems` were removed; SRD items now come from the shared `library_items` table (see above). Existing per-user imported rows are kept and shadow their shared counterparts. | — | — |
| Feats (`class_features`) | Character Codex → Abilities → **Import from Open5e** (`useImportOpen5eFeatures`) | `prerequisite`, `feature_type`, `name`, `description`, `source`, ruleset/identity fields — only rows with `open5e_import = true` are matched for update | `tags`, any `source` override, `campaign_id` |
| Classes (`custom_classes`) | Character Codex → Classes → **Import from Open5e** (`useImportOpen5eClasses`) | `class_name`, `source`, `hit_die`, `saving_throws`, `features`, ruleset/identity fields | `primary_ability`, `armor_proficiencies`, `weapon_proficiencies`, `subclass_level`, `asi_levels`, `spell_slots`, `spells_known`, `cantrips_known`, `slot_recovery`, `caster_type`, `prepared_ability`, `prepared_divisor`, `steps`, `resources`, `campaign_id` — Open5e's class API has no data for any of these; a DM fills them in by hand after the first import |
| Subclasses (`custom_subclasses`) | Character Codex → Archetypes → **Import from Open5e** (`useImportOpen5eSubclasses`) | `class_name`, `subclass_name`, `source`, `description`, `features`, ruleset/identity fields | `granted_spells`, `steps`, `resources`, `hp_per_level`, `campaign_id` |
| Species | Species list → **Import from Open5e** panel (`SpeciesOpen5ePanel.vue`) — search-and-pick flow only; the "Import / update core PHB species" bulk seed button was retired in #303 (core species now come from the shared `library_species` table, mapper extracted to `src/lib/library/open5eSpeciesImport.ts`) | `name`, `description`, `size`, `speed`, `ability_score_increases`, `traits`, `languages`, `tags`, `source`, ruleset/identity fields | `notes`, `subraces`, `image_url`, `focal_point`, `is_shapeshifter`, `avg_height`, `avg_weight`, `granted_spells` |
| Monsters (`monsters`) | **No per-user import path** — the unwired `useImportSrdMonsters` composable is gone from `src/composables/monsters/useMonsters.ts`; the supported re-import for monsters is `npm run seed-library-monsters` into the shared `library_monsters` table (see above). | — | — |
| Spells (`spells` table, legacy) | **No per-user import path** — the unwired `useImportSrdSpells` composable is gone from `src/composables/spells/useSpells.ts`; the supported re-import for spells is `npm run seed-library-spells` into the shared `library_spells` table (see above). | — | — |

Backgrounds (`backgrounds` table, `src/lib/library/open5eBackgroundImport.ts` /
`src/composables/rules/useBackgrounds.ts`) are out of scope for this document —
owned by a separate in-flight change.

## Known upstream records worth re-checking

- **open5e-api#964** — `srd-2024_greater-invisibility` (Greater Invisibility,
  SRD 5.2) currently returns an empty `desc` from the Open5e v2 API. Re-run
  `npm run seed-library-spells` once upstream fixes it; the row isn't
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

1. Row counts shouldn't jump beyond `inserted` — `select count(*) from library_spells;` before/after.
2. `select id, name from library_spells where mechanics_reviewed and updated_at > now() - interval '5 minutes';` should return nothing after a spell re-import (reviewed rows must never show as just-updated).
3. Spot-check a DM-customized row (custom art, edited description, hand-tuned class mechanics) still has its edits after re-running the relevant import.
