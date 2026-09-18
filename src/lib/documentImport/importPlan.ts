/**
 * The document importer's (#353) insert planning and link resolution — the
 * pure logic between "the DM ticked these review cards" and "here is what the
 * composable sends to Supabase."
 *
 * Pure by the same rule as normalize.ts: no Supabase client, no network, no
 * Vue. This module never inserts a row; it decides *what* to insert, in what
 * order, and later how to fold the results (including a mid-batch quota
 * refusal) and any resolved cross-entity links back into a report the wizard
 * can render honestly.
 *
 * ── Why insert order is deterministic and caller-independent ────────────────
 *
 * `enforce_quota` is a BEFORE INSERT trigger (documentImport.types.ts header,
 * entityKinds.ts `quotaResource` doc), so a free DM importing 40 monsters can
 * be refused partway through — which monsters "partway" means depends
 * entirely on insert order. `buildImportPlan` orders the plan by `entities`'
 * own order (the extraction's page order), never by the iteration order of
 * whatever selection structure the UI happens to be using, so re-running an
 * import with the same selections always stops at the same monster.
 *
 * ── Why partial-failure accounting is a separate pass from planning ─────────
 *
 * The plan is built before a single row exists; the report can only be built
 * after the composable has actually attempted each insert (or been stopped by
 * a quota refusal partway through). `buildImportRunReport` is therefore fed
 * the outcomes the composable observed, not something this module could ever
 * compute itself — it has no way to know which rows landed. What it *does* own
 * is the policy of what a missing outcome means: a ref present in `plan` but
 * absent from `outcomes` was never attempted, which is what "stopped at 12 of
 * 40" actually looks like once the loop that hit quota stops trying the rest.
 *
 * ── Why link resolution reports two different write shapes ──────────────────
 *
 * Most of the raw names `normalize.ts` defers (`EntityLinks`) resolve to a
 * plain FK column on the row that carries them: `quests.giver_npc_id`,
 * `quests.location_id`, `locations.npc_owner_id`. NPC → faction is not a
 * fourth column — `npcs` has no `faction_id` at all. Faction membership is the
 * `faction_npcs` join table (id, faction_id, npc_id, role, status — see
 * `useFactions.ts` / `FactionNpc` in faction.types.ts), the same table a
 * hand-created membership goes through. `resolveLinks` reports which shape a
 * resolved link needs (`fk_update` vs. `join_insert`) rather than pretending
 * every link is a column update — the composable, which actually talks to
 * Supabase, still decides how to issue the write, but it doesn't have to
 * re-derive which of the four cases is the odd one out.
 */
import type { AiProvenance } from "@/ai/provenance";
import type {
  ExtractedEncounter,
  ExtractedEntity,
  ExtractedFaction,
  ExtractedItem,
  ExtractedLocation,
  ExtractedMonster,
  ExtractedNpc,
  ExtractedPayloadMap,
  ExtractedQuest,
  ExtractedSpell,
  ImportEntityKind,
} from "@/types/documentImport.types";
import type { LocationType } from "@/types/location.types";
import {
  ENTITY_MAPPERS,
  type EntityLinkLists,
  type EntityLinks,
  type ImportRowMap,
  type MappedEntity,
  type QuestSpinePayload,
} from "./normalize";
import { normalizeEntityName } from "./entityName";
import type { ImportDecision } from "./entityMatching";

// ── Building the plan ────────────────────────────────────────────────────────

/** One row to insert, still carrying the `ref` it came from so the caller can
 *  correlate a later Supabase result (or error) back to the review card that
 *  produced it, the raw-name `links` a second pass will try to resolve, and
 *  (quests only) the story spine that same second pass writes once the quest
 *  has an id — beats, the routes between them, and the objectives they
 *  raise (#829). */
export interface PlannedInsert<K extends ImportEntityKind = ImportEntityKind> {
  ref: string;
  row: ImportRowMap[K];
  links: EntityLinks;
  /** See `EntityLinkLists`'s own doc comment — a raw-name field resolving to
   *  more than one row (today: only a faction's `location_names`). */
  linkLists: EntityLinkLists;
  questSpine?: QuestSpinePayload;
}

/**
 * Dispatches to the one correctly-typed mapper in `ENTITY_MAPPERS` for `kind`.
 *
 * A direct `ENTITY_MAPPERS[kind](data, ...)` does not type-check when `kind`
 * and `data` are both generic in the same `K`: TypeScript does not narrow a
 * *derived* indexed-access type (`ExtractedPayloadMap[K]`) just because the
 * unrelated `kind` value has been compared to a literal in a switch —
 * "correlated records" narrowing like that is a known, still-open TypeScript
 * limitation (microsoft/TypeScript#33014), not something to work around with
 * `any`. The switch below gives the compiler a literal `kind` at each branch
 * so every `ENTITY_MAPPERS` call is the exact pair it was actually typed for;
 * the `as` casts only restate, at each already-proven-correct branch, what
 * `kind === K`'s single possible value in that branch already establishes.
 */
/**
 * `sourceTitle` is the DM's chosen "Source book" for the whole sweep — only
 * `monsters`/`items`/`spells` mappers read it (their own `source` column);
 * every other kind's mapper simply ignores the trailing argument, exactly
 * like it already ignores any other parameter it has no use for. Defaults to
 * `null` so every pre-existing caller (before this feature existed) keeps
 * compiling without having to name an argument it doesn't care about either.
 */
export function mapEntity<K extends ImportEntityKind>(
  kind: K,
  data: ExtractedPayloadMap[K],
  campaignId: string,
  provenance: AiProvenance,
  sourceTitle: string | null = null,
): MappedEntity<K> {
  switch (kind) {
    case "monsters":
      return ENTITY_MAPPERS.monsters(data as ExtractedMonster, campaignId, provenance, sourceTitle) as MappedEntity<K>;
    case "npcs":
      return ENTITY_MAPPERS.npcs(data as ExtractedNpc, campaignId, provenance) as MappedEntity<K>;
    case "locations":
      return ENTITY_MAPPERS.locations(data as ExtractedLocation, campaignId, provenance) as MappedEntity<K>;
    case "items":
      return ENTITY_MAPPERS.items(data as ExtractedItem, campaignId, provenance, sourceTitle) as MappedEntity<K>;
    case "spells":
      return ENTITY_MAPPERS.spells(data as ExtractedSpell, campaignId, provenance, sourceTitle) as MappedEntity<K>;
    case "quests":
      return ENTITY_MAPPERS.quests(data as ExtractedQuest, campaignId, provenance) as MappedEntity<K>;
    case "factions":
      return ENTITY_MAPPERS.factions(data as ExtractedFaction, campaignId, provenance) as MappedEntity<K>;
    case "encounters":
      return ENTITY_MAPPERS.encounters(data as ExtractedEncounter, campaignId, provenance) as MappedEntity<K>;
  }
}

/**
 * Turns one review surface's per-entity decisions into an ordered insert
 * plan — the `action === "create"` entities only.
 *
 * `decisions` replaced the old `selectedRefs`/`linkedRefs` pair (#837/#838):
 * every entity now gets one explicit `ImportDecision` (`entityMatching.ts`)
 * rather than two independent booleans, and an entity **absent** from the
 * map is not planned — absence is not consent. That is a deliberate reversal
 * from the old "selected by default unless excluded" shape: a review surface
 * must now say what it wants for every entity it means to act on, including
 * the common case where the decision is `create`.
 *
 * `link`, `generate` and `ignore` entities all produce no insert here, for
 * the same underlying reason in each case: `link` because the row it would
 * have duplicated already exists; `ignore` because the DM said no; `generate`
 * because `runImportKind.ts` sends it through the AI generator instead of a
 * plain insert (monsters only — see `entityMatching.ts`'s `canCreateFromPage`).
 * This module's whole job is deciding what to *insert*, so all three are
 * simply not its concern; the caller accounts for them separately.
 */
export function buildImportPlan<K extends ImportEntityKind>(
  kind: K,
  entities: readonly ExtractedEntity<K>[],
  decisions: ReadonlyMap<string, ImportDecision>,
  campaignId: string,
  provenance: AiProvenance,
  /** The DM's chosen "Source book" for this sweep — see `mapEntity`'s own
   *  doc comment for which kinds actually read it. */
  sourceTitle: string | null = null,
): PlannedInsert<K>[] {
  return entities
    .filter((entity) => decisions.get(entity.ref)?.action === "create")
    .map((entity) => {
      const { row, links, linkLists, questSpine } = mapEntity(kind, entity.data, campaignId, provenance, sourceTitle);
      return { ref: entity.ref, row, links, linkLists: linkLists ?? {}, questSpine };
    });
}

// ── Partial-failure accounting ───────────────────────────────────────────────

/**
 * What actually happened when the composable tried to insert one planned row.
 * `quota_exceeded` is its own status rather than folding into `failed` because
 * it is the one outcome the wizard reacts to differently — it means "stop
 * attempting the rest of this kind," not "this particular row was bad." The
 * composable is expected to classify a caught error with `isQuotaExceeded`
 * (quotaError.ts) before reporting it here; this module has no Supabase error
 * shape to inspect and does not try to guess one.
 */
export type ImportRowOutcome =
  | { ref: string; status: "inserted"; id: string }
  | { ref: string; status: "quota_exceeded" }
  | { ref: string; status: "failed"; message: string };

/** `ImportRowOutcome` plus the fourth state a row can end up in: never attempted. */
export type ReportedRow = ImportRowOutcome | { ref: string; status: "not_attempted" };

export interface ImportRunReport {
  kind: ImportEntityKind;
  /** Total rows the plan intended to insert. */
  planned: number;
  /** Rows that actually landed. */
  imported: number;
  /** True when a quota refusal is why fewer than `planned` rows were attempted. */
  stoppedAtQuota: boolean;
  /** One entry per planned row, in plan order. */
  rows: ReportedRow[];
}

/**
 * Folds however far the composable got into a full accounting of the plan —
 * "12 of 40 imported, stopped at quota" instead of a boolean. `outcomes` may
 * be shorter than `plan`: once a `quota_exceeded` outcome is observed for a
 * quota-limited kind, retrying the remaining rows would fail identically for
 * every one of them (same resource, same cap), so the composable is expected
 * to stop there rather than attempt — and report — each remaining row. Every
 * planned ref with no matching outcome is reported `not_attempted`, which is
 * the honest read of "never sent," not a failure of that specific row.
 */
export function buildImportRunReport(
  kind: ImportEntityKind,
  plan: readonly Pick<PlannedInsert, "ref">[],
  outcomes: readonly ImportRowOutcome[],
): ImportRunReport {
  const outcomeByRef = new Map(outcomes.map((outcome) => [outcome.ref, outcome] as const));
  const rows: ReportedRow[] = plan.map(
    (planned) => outcomeByRef.get(planned.ref) ?? { ref: planned.ref, status: "not_attempted" },
  );
  const imported = rows.filter((row) => row.status === "inserted").length;
  const stoppedAtQuota = rows.some((row) => row.status === "quota_exceeded");

  return { kind, planned: plan.length, imported, stoppedAtQuota, rows };
}

// ── Link resolution (second pass) ────────────────────────────────────────────

/** One already-inserted row's captured links, keyed by the id it actually got
 *  from the database — link resolution has to wait for that id to exist. */
export interface LinkedRow {
  id: string;
  links: EntityLinks;
}

/** An existing row usable as a link target: whatever the referenced kind's
 *  rows expose as an id and the name a raw link string is matched against. */
export interface NameLookupRow {
  id: string;
  name: string;
  /**
   * Only ever populated when the target kind is `locations` — the existing
   * row's own `location_type`. `runLocationsImportKind` (runImportKind.ts)
   * needs it to check whether a resolved `parent_name` can actually hold a
   * room (`private.location_can_hold_rooms`, mirrored by `isSiteType` in
   * `src/lib/locations/tiers.ts`) before writing it as `parent_id` — every
   * other kind's lookup has no use for a type at all, so this stays optional
   * rather than widening every caller's shape.
   */
  locationType?: LocationType;
}

/** How a resolved link becomes a write — see the file header for why NPC →
 *  faction is a join-table insert rather than a fourth FK column. */
export type LinkApplication =
  | { kind: "fk_update"; table: string; column: string }
  | { kind: "join_insert"; table: string; sourceColumn: string; targetColumn: string };

interface LinkTarget {
  sourceKind: ImportEntityKind;
  targetKind: ImportEntityKind;
  apply: LinkApplication;
}

/**
 * Every raw-name field `EntityLinks` (normalize.ts) can carry, and what
 * resolving it means. Keyed by field name with `satisfies Record<keyof
 * EntityLinks, …>` so a sixth link field added to `EntityLinks` without an
 * entry here is a compile error, the same exhaustiveness idiom entityKinds.ts
 * uses for `ImportEntityKind` itself.
 */
const LINK_TARGETS = {
  faction_name: {
    sourceKind: "npcs",
    targetKind: "factions",
    apply: { kind: "join_insert", table: "faction_npcs", sourceColumn: "npc_id", targetColumn: "faction_id" },
  },
  // Deliberately no `parent_name` entry here — a location's own parent is
  // resolved AT INSERT (`runLocationsImportKind`, runImportKind.ts), never in
  // this second pass, because `guard_location_room_parent` checks it on the
  // very insert that creates an interior row. `EntityLinks` (normalize.ts) no
  // longer declares the field either, so there is nothing left to resolve
  // twice — see that file's header for the full reasoning.
  giver_npc_name: {
    sourceKind: "quests",
    targetKind: "npcs",
    apply: { kind: "fk_update", table: "quests", column: "giver_npc_id" },
  },
  location_name: {
    sourceKind: "quests",
    targetKind: "locations",
    apply: { kind: "fk_update", table: "quests", column: "location_id" },
  },
  // Named `encounter_location_name` rather than reusing `location_name`
  // above — this map has exactly one fixed `apply` target per field name, and
  // an encounter's room link needs a different one (`encounters.location_id`).
  encounter_location_name: {
    sourceKind: "encounters",
    targetKind: "locations",
    apply: { kind: "fk_update", table: "encounters", column: "location_id" },
  },
  // NPC → the location they're usually found at. `locations` extracts *after*
  // `npcs` in IMPORT_ENTITY_KINDS order — the reason this link can only be
  // resolved in the sweep's single linking phase, once every kind has
  // imported, rather than in this kind's own per-kind pass. See
  // `EntityLinks.npc_location_name`'s own doc comment (normalize.ts).
  npc_location_name: {
    sourceKind: "npcs",
    targetKind: "locations",
    apply: { kind: "fk_update", table: "npcs", column: "location_id" },
  },
  owner_npc_name: {
    sourceKind: "locations",
    targetKind: "npcs",
    apply: { kind: "fk_update", table: "locations", column: "npc_owner_id" },
  },
} as const satisfies Record<keyof EntityLinks, LinkTarget>;

/**
 * `field` is a plain `string` rather than `keyof EntityLinks` because
 * `resolveLinkLists` below reports through this same shape for a
 * `keyof EntityLinkLists` field — the two never collide in practice (checked
 * by each of `LINK_TARGETS`/`LINK_LIST_TARGETS`'s own `satisfies`), and every
 * consumer of `field` only ever displays it, never branches on it.
 */
export type LinkResolution =
  | { status: "resolved"; sourceId: string; field: string; name: string; targetId: string; apply: LinkApplication }
  | { status: "unresolved"; sourceId: string; field: string; name: string };

/**
 * Matches through `normalizeEntityName` (`entityName.ts`) rather than plain
 * case-insensitive equality — a document's printed name and an existing row's
 * name only need to agree once articles and pluralisation are stripped, not
 * exactly. This is what lets "Blue Clam" (a page's raw heading) find "The
 * Blue Clam" (a hand-created row), which a bare `.toLowerCase()` never did.
 * A name that normalizes to nothing (`null`) matches nothing — never every
 * other blank name — so two unrelated rows with no usable name don't collide.
 */
function findByName(candidates: readonly NameLookupRow[], name: string): NameLookupRow | undefined {
  const needle = normalizeEntityName(name);
  if (needle === null) return undefined;
  return candidates.find((candidate) => normalizeEntityName(candidate.name) === needle);
}

/**
 * The second pass over one kind's already-inserted rows: for each captured
 * link, look up its raw name against the target kind's existing rows and
 * report what to do about it.
 *
 * An unresolved name — the document referenced "Captain Reyes" but no NPC by
 * that name was imported or already existed — is reported, never thrown and
 * never guessed at with an invented id: the referent may simply not exist in
 * this campaign, which is a fact the DM needs to see, not an error in this
 * code. `lookups` is `Partial` because a kind with no rows of the relevant
 * target type yet (a fresh campaign with zero factions) is a normal starting
 * point, not a caller mistake.
 */
export function resolveLinks(
  sourceKind: ImportEntityKind,
  rows: readonly LinkedRow[],
  lookups: Partial<Record<ImportEntityKind, readonly NameLookupRow[]>>,
): LinkResolution[] {
  const fields = (Object.keys(LINK_TARGETS) as (keyof EntityLinks)[]).filter(
    (field) => LINK_TARGETS[field].sourceKind === sourceKind,
  );
  if (fields.length === 0) return [];

  const results: LinkResolution[] = [];
  for (const row of rows) {
    for (const field of fields) {
      const name = row.links[field];
      if (name === undefined) continue; // no link of this kind captured for this row — not a failure

      const target = LINK_TARGETS[field];
      const candidates = lookups[target.targetKind] ?? [];
      const match = findByName(candidates, name);

      results.push(
        match
          ? { status: "resolved", sourceId: row.id, field, name, targetId: match.id, apply: target.apply }
          : { status: "unresolved", sourceId: row.id, field, name },
      );
    }
  }
  return results;
}

// ── Link-list resolution (a raw-name field naming several rows) ─────────────

/** Every raw-name-*list* field `EntityLinkLists` (normalize.ts) can carry.
 *  Same exhaustiveness idiom as `LINK_TARGETS` above. */
const LINK_LIST_TARGETS = {
  location_names: {
    sourceKind: "factions",
    targetKind: "locations",
    apply: { kind: "join_insert", table: "faction_locations", sourceColumn: "faction_id", targetColumn: "location_id" },
  },
} as const satisfies Record<keyof EntityLinkLists, LinkTarget>;

/** One already-inserted row's captured link-lists, keyed by its real id —
 *  the list-field counterpart of `LinkedRow`. */
export interface LinkedRowList {
  id: string;
  linkLists: EntityLinkLists;
}

/**
 * The list-field counterpart of `resolveLinks`: each name in the array gets
 * its own `LinkResolution`, since a faction naming three locations needs
 * three `faction_locations` rows, not one. `applyLinkResolution` (the
 * composable) already knows how to apply a `join_insert` — this function
 * changes nothing about how a resolution is *applied*, only how it's found,
 * so no new apply path was needed to add this field.
 */
export function resolveLinkLists(
  sourceKind: ImportEntityKind,
  rows: readonly LinkedRowList[],
  lookups: Partial<Record<ImportEntityKind, readonly NameLookupRow[]>>,
): LinkResolution[] {
  const fields = (Object.keys(LINK_LIST_TARGETS) as (keyof EntityLinkLists)[]).filter(
    (field) => LINK_LIST_TARGETS[field].sourceKind === sourceKind,
  );
  if (fields.length === 0) return [];

  const results: LinkResolution[] = [];
  for (const row of rows) {
    for (const field of fields) {
      const names = row.linkLists[field];
      if (names === undefined) continue;

      const target = LINK_LIST_TARGETS[field];
      const candidates = lookups[target.targetKind] ?? [];
      for (const name of names) {
        const match = findByName(candidates, name);
        results.push(
          match
            ? { status: "resolved", sourceId: row.id, field, name, targetId: match.id, apply: target.apply }
            : { status: "unresolved", sourceId: row.id, field, name },
        );
      }
    }
  }
  return results;
}
