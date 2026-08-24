/**
 * The document importer's (#353) per-kind registry: what table an extracted
 * kind lands in, what to call it in the wizard, which field is its heading,
 * and whether importing it is quota-limited.
 *
 * One frozen object rather than a switch scattered across the wizard steps,
 * so a new field (an icon, a route, a colour — deliberately not added here
 * yet) has exactly one place to go. The `satisfies Record<ImportEntityKind, …>`
 * below is load-bearing: adding an eighth kind to `IMPORT_ENTITY_KINDS`
 * (src/types/documentImport.types.ts) without adding an entry here is a
 * compile error, not a step the wizard silently skips.
 */
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";

/**
 * Resource keys `public.check_quota` validates against, restricted to the
 * ones an entity kind can actually pass it. The full server-side allowlist
 * (supabase/migrations/20260809222131_route_admin_gates_through_is_app_admin.sql:199-202)
 * also covers campaigns, encounters, scriptorium_documents, notes, sounds,
 * soundboard_pages, soundboard_playlists, deities, pantheons and puzzle_rooms
 * — none of which a document import creates.
 */
export type ImportQuotaResource = "monsters" | "npcs" | "locations" | "quests" | "factions";

export interface EntityKindEntry {
  readonly kind: ImportEntityKind;
  /** Target content table. Equal to `kind` for all seven today, but recorded
   *  explicitly rather than derived — a table rename must not silently follow
   *  the kind name. */
  readonly table: string;
  readonly labelSingular: string;
  readonly labelPlural: string;
  /**
   * Which field the review card renders as the entity's heading. `quests` is
   * the one outlier — its display column is `title`, not `name` (squashed
   * schema, initial_schema_squashed.sql:1862) — so this cannot be hardcoded
   * to "name" anywhere downstream.
   */
  readonly displayField: "name" | "title";
  /**
   * The `check_quota` resource key this kind counts against, or `null` when
   * importing it never hits a cap. `enforce_quota` is a BEFORE INSERT
   * trigger, so this is not cosmetic: a free user bulk-importing monsters can
   * be refused partway through the batch, and the wizard needs to know in
   * advance which kinds can do that. `items` and `spells` are the two kinds
   * with no quota table at all — explicitly `null`, never an empty string or
   * an omitted key, so "not quota-limited" and "forgot to fill this in" stay
   * distinguishable at the type level.
   */
  readonly quotaResource: ImportQuotaResource | null;
}

const registry = {
  monsters: {
    kind: "monsters",
    table: "monsters",
    labelSingular: "Monster",
    labelPlural: "Monsters",
    displayField: "name",
    quotaResource: "monsters",
  },
  npcs: {
    kind: "npcs",
    table: "npcs",
    labelSingular: "NPC",
    labelPlural: "NPCs",
    displayField: "name",
    quotaResource: "npcs",
  },
  locations: {
    kind: "locations",
    table: "locations",
    labelSingular: "Location",
    labelPlural: "Locations",
    displayField: "name",
    quotaResource: "locations",
  },
  items: {
    kind: "items",
    table: "items",
    labelSingular: "Item",
    labelPlural: "Items",
    displayField: "name",
    quotaResource: null,
  },
  spells: {
    kind: "spells",
    table: "spells",
    labelSingular: "Spell",
    labelPlural: "Spells",
    displayField: "name",
    quotaResource: null,
  },
  quests: {
    kind: "quests",
    table: "quests",
    labelSingular: "Quest",
    labelPlural: "Quests",
    displayField: "title",
    quotaResource: "quests",
  },
  factions: {
    kind: "factions",
    table: "factions",
    labelSingular: "Faction",
    labelPlural: "Factions",
    displayField: "name",
    quotaResource: "factions",
  },
} as const satisfies Record<ImportEntityKind, EntityKindEntry>;

/**
 * The registry. `Object.freeze` is shallow, so it stops a consumer swapping a
 * whole entry but not editing a field on one — the real guarantee is the
 * `as const` above, which makes every field `readonly` at the type level. Both
 * are kept: the type stops it at compile time, the freeze stops a reassignment
 * from untyped JS at runtime.
 */
export const ENTITY_KIND_REGISTRY: Readonly<Record<ImportEntityKind, EntityKindEntry>> =
  Object.freeze(registry);

/** Look up a single kind's registry entry. */
export function getEntityKindEntry(kind: ImportEntityKind): EntityKindEntry {
  return ENTITY_KIND_REGISTRY[kind];
}

/**
 * All seven entries, in wizard order (the order `IMPORT_ENTITY_KINDS` already
 * defines — monsters and NPCs first, factions last). Returns entries rather
 * than bare kinds so a step component can render off one call.
 */
export function listEntityKindsInWizardOrder(): readonly EntityKindEntry[] {
  return IMPORT_ENTITY_KINDS.map((kind) => ENTITY_KIND_REGISTRY[kind]);
}
