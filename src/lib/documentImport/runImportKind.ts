/**
 * The document importer's per-kind INSERT step: turn one kind's decisions
 * into inserts (and, for a `generate`-decided monster, a generation call),
 * row by row, and report what landed.
 *
 * This used to also own cross-entity link resolution, the quest-spine write,
 * and encounter-combatant resolution — all three needed a lookup against
 * *other* kinds' rows, which only worked when every kind a source kind could
 * point at had already imported. `IMPORT_ENTITY_KINDS`' dependency order
 * covers most fields (`factions` before `npcs`, etc.), but not all of them —
 * an NPC's `location_name` (#893) names a `locations` row, and `locations`
 * extracts *after* `npcs`, so that field could never have resolved under the
 * old per-kind scheme. `runImportSweep` (`importSweep.ts`) is the fix: import
 * every kind first, *then* run one linking phase against a registry built
 * from the whole sweep. This module is now purely the first half — the
 * second half moved to `importSweep.ts`, which calls this once per kind.
 *
 * Pure by the same rule as `importPlan.ts`: every side effect is injected via
 * `RunImportKindDeps`, so this has no Vue/Supabase dependency and is
 * unit-testable with fake deps.
 *
 * ── Why insert order is deterministic and caller-independent ────────────────
 *
 * `enforce_quota` is a BEFORE INSERT trigger, so a free DM importing many rows
 * of one kind can be refused partway through — which row "partway" means
 * depends entirely on insert order. `buildImportPlan` orders the plan by
 * `entities`' own order (the extraction's page order), never by whatever
 * selection structure the caller happens to be using, so re-running an import
 * with the same selections always stops at the same row. This module inherits
 * that guarantee unchanged — it does not reorder `plan`.
 */
import type { AiProvenance } from "@/ai/provenance";
import {
  buildImportPlan,
  buildImportRunReport,
  type ImportRowOutcome,
  type ImportRunReport,
} from "./importPlan";
import type { EntityLinkLists, EntityLinks, QuestSpinePayload } from "./normalize";
import type { ImportDecision } from "./entityMatching";
import { normalizeEntityName } from "./entityName";
import { isSiteType, LOCATION_TYPE_TIER } from "@/lib/locations/tiers";
import type { ExtractedEntity, ExtractedLocation, ImportEntityKind } from "@/types/documentImport.types";
import type { LocationType } from "@/types/location.types";

// ── Deps ─────────────────────────────────────────────────────────────────────

export type InsertRowOutcome =
  | { status: "inserted"; id: string }
  | { status: "quota_exceeded" }
  | { status: "failed"; message: string };

/**
 * Everything one call to `runImportKind` needs from the outside world.
 * `insertRow` is called once per planned row, in plan order (never batched —
 * see the file header), and classifies its own outcome: the caller is the one
 * holding the actual Supabase error, so it (not this module) decides
 * `quota_exceeded` vs `failed` via `isQuotaExceeded`.
 */
export interface RunImportKindDeps {
  insertRow: (row: Record<string, unknown>) => Promise<InsertRowOutcome>;
  /**
   * Only ever invoked for `kind === "monsters"`, once per entity whose
   * decision is `generate` (`entityMatching.ts`) — a page that named a
   * creature without ever printing its stats. Returns the same outcome shape
   * `insertRow` does, classified the same way, because a generated monster
   * still lands as one real `monsters` row and still counts against the same
   * quota resource as a plain insert.
   */
  generateMonster: (data: Record<string, unknown>) => Promise<InsertRowOutcome>;
}

// ── Result ───────────────────────────────────────────────────────────────────

/** What a `create`-decided (planned) entity's mapper captured, for
 *  `importSweep.ts`'s later linking phase to resolve against the rest of the
 *  sweep. Absent for a `link`/`ignore`/`generate`-decided entity — none of
 *  those three ever produced a `PlannedInsert` in the first place (see
 *  `buildImportPlan`'s own doc comment), so there is nothing here to defer. */
export interface RunImportKindLinkedEntity {
  links: EntityLinks;
  linkLists: EntityLinkLists;
  questSpine?: QuestSpinePayload;
  /** The exact row handed to `deps.insertRow` — the sweep's only way to reach
   *  a mapped field that isn't part of `EntityLinks`, e.g. an encounter's
   *  resolved `combatants` array (`normalize.ts`'s `mapExtractedEncounter`
   *  builds the slot shape; the sweep only resolves the names within it). */
  row: Record<string, unknown>;
}

export interface RunImportKindResult {
  report: ImportRunReport;
  /** Every inserted row's plan `ref` resolved to the id it actually got —
   *  the caller's only way to learn a created row's id, since `report` only
   *  carries counts. */
  insertedIds: ReadonlyMap<string, string>;
  /** Keyed by the same `ref` as `insertedIds` — see `RunImportKindLinkedEntity`. */
  linkedEntities: ReadonlyMap<string, RunImportKindLinkedEntity>;
}

/**
 * Runs one kind's plan end to end: insert (and, for monsters, generate) row
 * by row in the entities' own order (stopping at the first quota refusal —
 * see the file header).
 *
 * `decisions` additionally interprets the `generate` action (monsters only):
 * an entity so decided is never part of `buildImportPlan`'s output (nothing
 * to insert — see there), but it *is* attempted here, through
 * `deps.generateMonster`, in the same single ordered pass as every `create`
 * — never a separate loop, because a create and a generate both draw on the
 * same `monsters` quota resource, and running them as two loops would let a
 * generate slip in after a create already tripped the limit (or vice versa).
 */
export async function runImportKind<K extends ImportEntityKind>(
  params: {
    kind: K;
    entities: readonly ExtractedEntity<K>[];
    decisions: ReadonlyMap<string, ImportDecision>;
    campaignId: string;
    provenance: AiProvenance;
    /** The DM's chosen "Source book" for this sweep — only a `monsters`
     *  create actually reads it (its own `source` column); see
     *  `mapEntity`'s own doc comment (importPlan.ts). */
    sourceTitle?: string | null;
  },
  deps: RunImportKindDeps,
): Promise<RunImportKindResult> {
  const { kind, entities, decisions, campaignId, provenance, sourceTitle = null } = params;

  const plan = buildImportPlan(kind, entities, decisions, campaignId, provenance, sourceTitle);
  const plannedByRef = new Map(plan.map((planned) => [planned.ref, planned] as const));

  // The ordered list of every attempt this run makes — a plain insert for
  // each planned `create`, plus (monsters only) a generation call for each
  // `generate` — interleaved in `entities`' own order, the same determinism
  // rule `buildImportPlan` itself follows (file header) and for the same
  // reason: which row a mid-run quota refusal falls on must not depend on
  // which of the two kinds of attempt happens to run first.
  const attempts: { ref: string; run: () => Promise<InsertRowOutcome> }[] = [];
  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (decision?.action === "create") {
      const planned = plannedByRef.get(entity.ref);
      if (planned) attempts.push({ ref: entity.ref, run: () => deps.insertRow(planned.row as Record<string, unknown>) });
    } else if (kind === "monsters" && decision?.action === "generate") {
      attempts.push({ ref: entity.ref, run: () => deps.generateMonster(entity.data as unknown as Record<string, unknown>) });
    }
  }

  // Row by row (never batched) so a mid-batch quota rejection can be
  // attributed to the attempt that tripped it and every attempt ahead of it
  // is still known to have landed.
  const outcomes: ImportRowOutcome[] = [];
  for (const attempt of attempts) {
    const result = await attempt.run();
    if (result.status === "quota_exceeded") {
      outcomes.push({ ref: attempt.ref, status: "quota_exceeded" });
      break; // retrying the rest would fail identically — see importPlan.ts
    }
    if (result.status === "failed") {
      outcomes.push({ ref: attempt.ref, status: "failed", message: result.message });
      continue;
    }
    outcomes.push({ ref: attempt.ref, status: "inserted", id: result.id });
  }

  // `buildImportRunReport` only ever reads `.ref` off each entry, so a
  // generated attempt (no `PlannedInsert` — nothing was ever planned to
  // insert for it) satisfies this the same way a planned one does. This is
  // how "planned"/"imported" come to include generated rows without any
  // change to that function itself.
  const report = buildImportRunReport(kind, attempts, outcomes);

  const insertedIds = new Map<string, string>();
  const linkedEntities = new Map<string, RunImportKindLinkedEntity>();
  for (const outcome of outcomes) {
    if (outcome.status !== "inserted") continue;
    insertedIds.set(outcome.ref, outcome.id);
    // Only a `create`d row carries captured links — a generated monster has
    // none (mappers never run for it), and monsters are never the *source*
    // of a link field regardless.
    const planned = plannedByRef.get(outcome.ref);
    if (planned) {
      linkedEntities.set(outcome.ref, {
        links: planned.links,
        linkLists: planned.linkLists,
        questSpine: planned.questSpine,
        row: planned.row as Record<string, unknown>,
      });
    }
  }

  return { report, insertedIds, linkedEntities };
}

// ── Locations: parent resolution happens AT INSERT, not the linking phase ────
//
// `guard_location_room_parent` (a live BEFORE INSERT trigger on `locations`,
// via `private.location_is_interior`/`private.location_can_hold_rooms`)
// requires an interior row (`room`/`grounds`) to already carry a `parent_id`
// pointing at a row that can hold one (the `site` tier — `building`, `dungeon`,
// `store`, `tavern`, `inn`, `wilds`; mirrored client-side by `isSiteType`,
// src/lib/locations/tiers.ts) on the very insert that creates it. The sweep's
// usual post-import linking phase (`importSweep.ts`) resolves every other
// deferred name only once every kind has finished importing — far too late
// for this one column, which the database checks immediately. So `locations`
// gets its own insert runner: it orders this kind's own creates parents-first
// (a room whose dungeon is elsewhere on the same page must not be attempted
// before that dungeon exists), and resolves each row's `parent_name` right
// before that row's own insert, against whatever has already landed in this
// same batch plus the campaign's pre-existing rows.
//
// An interior row that still can't find a holder parent — the page named
// none, or named something that turns out not to be one — is not dropped and
// not left to fail the trigger: it's imported anyway as `location_type: "other"`
// (which the trigger never constrains), and the sweep reports why. Losing a
// keyed room entirely because its container didn't resolve would be worse
// than importing it detached and letting the DM re-parent it by hand.

/** One resolvable parent candidate: an existing row (fetched once before this
 *  kind's loop starts) or a row this same batch already inserted. */
export interface LocationParentCandidate {
  id: string;
  name: string;
  locationType: LocationType;
}

export interface RunLocationsImportKindDeps {
  insertRow: (row: Record<string, unknown>) => Promise<InsertRowOutcome>;
}

export interface RunLocationsImportKindResult extends RunImportKindResult {
  /** One line per interior row this run downgraded to `location_type: "other"`
   *  for lack of a resolvable holder parent — folded into the sweep's
   *  `unresolvedLinks` by the caller (`importSweep.ts`), exactly like any
   *  other unresolved reference. */
  parentFallbackMessages: string[];
}

/**
 * Orders `entities` so that any entity named as another entity's `parent_name`
 * (matched via `normalizeEntityName`, same as every other name match in this
 * feature) comes before it — a stable topological sort over this batch alone,
 * never touching rows outside it.
 *
 * A parent named here but decided `link`/`ignore` (never inserted) or not
 * present in this batch at all rides along in its original position — nothing
 * to order it against, since its resolution (if any) comes from the existing-
 * rows lookup instead, which doesn't care about this batch's insert order.
 *
 * Cycles and self-references never hang this: once no remaining entity has an
 * already-placed (or absent) parent, whatever is left is appended in its
 * original relative order rather than spun on forever. Whichever of those
 * entities actually needed the cycle to resolve will end up in the "no
 * resolvable parent" fallback below — a real, reported outcome, not a hang.
 */
export function orderLocationsParentsFirst(
  entities: readonly ExtractedEntity<"locations">[],
): readonly ExtractedEntity<"locations">[] {
  const nameToIndex = new Map<string, number>();
  entities.forEach((entity, i) => {
    const name = (entity.data as ExtractedLocation).name;
    const norm = typeof name === "string" ? normalizeEntityName(name) : null;
    if (norm !== null && !nameToIndex.has(norm)) nameToIndex.set(norm, i); // first entity with a given name wins a duplicate
  });

  // child index -> in-batch parent index, only when the parent is a distinct
  // entity actually present in this same batch.
  const parentIndex = new Map<number, number>();
  entities.forEach((entity, i) => {
    const parentName = (entity.data as ExtractedLocation).parent_name;
    if (typeof parentName !== "string") return;
    const norm = normalizeEntityName(parentName);
    if (norm === null) return;
    const pIdx = nameToIndex.get(norm);
    if (pIdx === undefined || pIdx === i) return;
    parentIndex.set(i, pIdx);
  });

  const placed = new Set<number>();
  const order: number[] = [];
  let remaining = entities.map((_, i) => i);
  while (remaining.length > 0) {
    const ready = remaining.filter((i) => {
      const p = parentIndex.get(i);
      return p === undefined || placed.has(p);
    });
    if (ready.length === 0) {
      // A cycle among what's left (A's parent is B, B's parent is A) — no
      // ordering can satisfy both, so take them as they came rather than loop.
      order.push(...remaining);
      break;
    }
    for (const i of ready) {
      order.push(i);
      placed.add(i);
    }
    remaining = remaining.filter((i) => !placed.has(i));
  }

  return order.map((i) => entities[i]!);
}

/** `LOCATION_TYPE_TIER`'s own insertion order already lists the site tier as
 *  building, dungeon, store, tavern, inn, wilds — deriving the phrase from it
 *  rather than hand-typing a second copy is what keeps this message unable to
 *  drift from `isSiteType`'s own definition. */
function siteTypesPhrase(): string {
  const names = Object.entries(LOCATION_TYPE_TIER)
    .filter(([, tier]) => tier === "site")
    .map(([type]) => type);
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function findLocationParent(
  candidates: readonly LocationParentCandidate[],
  name: string,
): LocationParentCandidate | undefined {
  const needle = normalizeEntityName(name);
  if (needle === null) return undefined;
  return candidates.find((c) => normalizeEntityName(c.name) === needle);
}

/**
 * A room's `parent_name` can name a container the DM chose to LINK rather
 * than create — the page's "Termalaine Gem Mine" linked to the DM's existing
 * "Gem Mine" (a `dungeon`). That container never gets inserted (a `link`
 * decision produces no row — see `buildImportPlan`'s own doc comment), so it
 * is absent from `batchResolved`, and its *printed* name ("Termalaine Gem
 * Mine") matches no name in `existingLocations` either — only the target
 * row's own name ("Gem Mine") is in there. Without this, every room in that
 * container is silently downgraded to `location_type: "other"`.
 *
 * The fix: build one candidate per this batch's own `locations` `link`
 * decision, keyed by the extracted entity's *own* printed name, pointing at
 * the linked target — with the target's `location_type` looked up in
 * `existingLocations` by id, since a `link` candidate's `targetId` is always
 * one of those rows. A candidate whose target isn't found there (shouldn't
 * happen — a `link` decision is only ever offered against an existing row)
 * is skipped rather than guessed at.
 */
function buildLinkedLocationCandidates(
  entities: readonly ExtractedEntity<"locations">[],
  decisions: ReadonlyMap<string, ImportDecision>,
  existingLocations: readonly LocationParentCandidate[],
): LocationParentCandidate[] {
  const existingById = new Map(existingLocations.map((c) => [c.id, c] as const));
  const linked: LocationParentCandidate[] = [];
  for (const entity of entities) {
    const decision = decisions.get(entity.ref);
    if (decision?.action !== "link") continue;

    const name = (entity.data as ExtractedLocation).name;
    if (typeof name !== "string" || name.trim() === "") continue;

    const target = existingById.get(decision.candidate.targetId);
    if (!target) continue;

    linked.push({ id: target.id, name, locationType: target.locationType });
  }
  return linked;
}

/**
 * The `locations` kind's own insert runner — see the section header above for
 * why this can't be the generic `runImportKind`. Shares its quota/failure
 * classification and its "stop at the first quota_exceeded, report the rest
 * not_attempted" rule exactly; the only real difference is insert order
 * (parents-first rather than page order) and that `row.parent_id` is filled
 * in immediately before each insert rather than left for a later pass.
 *
 * `existingLocations` is fetched once by the caller before this loop starts
 * (`fetchNameLookup("locations")`, extended with `location_type`) — every
 * campaign (and the DM's own global) location that existed before this sweep
 * ran, including anything a `link` decision elsewhere in this same kind
 * points at (a linked row is, by definition, one of these).
 *
 * A room's `parent_name` resolves against, in order: this batch's own
 * inserted rows, then this batch's own `link` decisions (by the *linked*
 * entity's printed name — see `buildLinkedLocationCandidates`), then
 * `existingLocations` by the target row's own name — the same "linked rows
 * win" precedence the sweep's post-import linking phase already uses.
 */
export async function runLocationsImportKind(
  params: {
    entities: readonly ExtractedEntity<"locations">[];
    decisions: ReadonlyMap<string, ImportDecision>;
    campaignId: string;
    provenance: AiProvenance;
    existingLocations: readonly LocationParentCandidate[];
  },
  deps: RunLocationsImportKindDeps,
): Promise<RunLocationsImportKindResult> {
  const { decisions, campaignId, provenance, existingLocations } = params;
  const orderedEntities = orderLocationsParentsFirst(params.entities);
  const plan = buildImportPlan("locations", orderedEntities, decisions, campaignId, provenance);
  const plannedByRef = new Map(plan.map((planned) => [planned.ref, planned] as const));

  // This batch's own `link` decisions, by the linked entity's printed name —
  // see `buildLinkedLocationCandidates`'s own doc comment for why a room's
  // `parent_name` needs this on top of `batchResolved`/`existingLocations`.
  const linkedParents = buildLinkedLocationCandidates(params.entities, decisions, existingLocations);

  // Grows as each row lands — a room whose dungeon is earlier in this very
  // batch needs THAT row's id, which cannot be in `existingLocations` (it
  // didn't exist before this sweep ran).
  const batchResolved: LocationParentCandidate[] = [];
  const parentFallbackMessages: string[] = [];
  const outcomes: ImportRowOutcome[] = [];

  for (const entity of orderedEntities) {
    const planned = plannedByRef.get(entity.ref);
    if (!planned) continue; // link/ignore — nothing to insert, nothing to resolve

    const row = planned.row as Record<string, unknown>;
    const displayName = typeof row.name === "string" ? row.name : "";
    const ownType = row.location_type as LocationType;
    const parentName = (entity.data as ExtractedLocation).parent_name;

    const resolvedParent =
      typeof parentName === "string" && parentName.trim() !== ""
        ? (findLocationParent(batchResolved, parentName) ??
          findLocationParent(linkedParents, parentName) ??
          findLocationParent(existingLocations, parentName))
        : undefined;

    const isInterior = LOCATION_TYPE_TIER[ownType] === "interior";
    if (isInterior && (!resolvedParent || !isSiteType(resolvedParent.locationType))) {
      row.location_type = "other";
      row.parent_id = null;
      parentFallbackMessages.push(
        `Location "${displayName}": no ${siteTypesPhrase()} to sit in on this page, so it was imported as "other".`,
      );
    } else if (resolvedParent) {
      row.parent_id = resolvedParent.id;
    }

    const result = await deps.insertRow(row);
    if (result.status === "quota_exceeded") {
      outcomes.push({ ref: entity.ref, status: "quota_exceeded" });
      break; // retrying the rest would fail identically — see the file header above
    }
    if (result.status === "failed") {
      outcomes.push({ ref: entity.ref, status: "failed", message: result.message });
      continue;
    }
    outcomes.push({ ref: entity.ref, status: "inserted", id: result.id });
    batchResolved.push({ id: result.id, name: displayName, locationType: row.location_type as LocationType });
  }

  const report = buildImportRunReport("locations", plan, outcomes);

  const insertedIds = new Map<string, string>();
  const linkedEntities = new Map<string, RunImportKindLinkedEntity>();
  for (const outcome of outcomes) {
    if (outcome.status !== "inserted") continue;
    insertedIds.set(outcome.ref, outcome.id);
    const planned = plannedByRef.get(outcome.ref);
    if (planned) {
      linkedEntities.set(outcome.ref, {
        links: planned.links,
        linkLists: planned.linkLists,
        questSpine: planned.questSpine,
        row: planned.row as Record<string, unknown>,
      });
    }
  }

  return { report, insertedIds, linkedEntities, parentFallbackMessages };
}
