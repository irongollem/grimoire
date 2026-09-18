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
import type { ExtractedEntity, ImportEntityKind } from "@/types/documentImport.types";

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
  },
  deps: RunImportKindDeps,
): Promise<RunImportKindResult> {
  const { kind, entities, decisions, campaignId, provenance } = params;

  const plan = buildImportPlan(kind, entities, decisions, campaignId, provenance);
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
