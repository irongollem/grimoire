/**
 * The document importer's per-kind run: turn one kind's selections into
 * inserts, resolve the cross-entity links those inserts captured, and (for
 * the two kinds that need a second pass) write a quest's beat graph or wire
 * an encounter's combatants.
 *
 * Extracted out of `DocumentImportWizard.vue` (#353) rather than left as that
 * component's private `runImport()` so the compact create-quest paste review
 * (#839) can run the *same* insert/link/spine logic instead of forking it —
 * #839 is explicit that a second, smaller review surface is fine, but a
 * second copy of this orchestration is exactly the fork epic #780 exists to
 * undo. The wizard runs this once per reviewed step; the compact review runs
 * it once per kind it has anything to do for, in `IMPORT_ENTITY_KINDS`
 * dependency order, in a single confirm action.
 *
 * Pure by the same rule as `spineWrite.ts`: every side effect is injected via
 * `RunImportKindDeps` rather than importing `supabase` directly, so this file
 * has no Vue/Supabase dependency and is unit-testable with fake deps. Each
 * caller supplies its own thin Supabase-backed implementation (see
 * `useDocumentImportRunner.ts`) — the two callers share the *decisions* this
 * module makes; only the wiring to the database is theirs individually to
 * request the way their own composable already does.
 *
 * ── Why insert order is deterministic and caller-independent ────────────────
 *
 * `enforce_quota` is a BEFORE INSERT trigger, so a free DM importing many
 * rows of one kind can be refused partway through — which row "partway"
 * means depends entirely on insert order. `buildImportPlan` orders the plan
 * by `entities`' own order (the extraction's page order), never by whatever
 * selection structure the caller happens to be using, so re-running an
 * import with the same selections always stops at the same row. This module
 * inherits that guarantee unchanged — it does not reorder `plan`.
 */
import type { AiProvenance } from "@/ai/provenance";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import {
  buildImportPlan,
  buildImportRunReport,
  resolveLinks,
  type ImportRowOutcome,
  type ImportRunReport,
  type LinkedRow,
  type LinkResolution,
  type NameLookupRow,
} from "./importPlan";
import { resolveEncounterCombatants } from "./normalize";
import type { ExtractedEntity, ImportEntityKind } from "@/types/documentImport.types";
import type { CombatantDef, EncounterInsert } from "@/types/encounter.types";

// ── Deps ─────────────────────────────────────────────────────────────────────

export type InsertRowOutcome =
  | { status: "inserted"; id: string }
  | { status: "quota_exceeded" }
  | { status: "failed"; message: string };

/**
 * Everything one call to `runImportKind` needs from the outside world,
 * supplied by the caller so this module never talks to Supabase directly.
 *
 * `insertRow` is called once per planned row, in plan order (never batched —
 * see the file header), and classifies its own outcome: the caller is the
 * one holding the actual Supabase error, so it (not this module) decides
 * `quota_exceeded` vs `failed` via `isQuotaExceeded`.
 */
export interface RunImportKindDeps {
  insertRow: (row: Record<string, unknown>) => Promise<InsertRowOutcome>;
  /** Existing rows of `targetKind` in this campaign, for link resolution —
   *  called once per target kind a source kind's links can point at. */
  fetchNameLookup: (targetKind: ImportEntityKind) => Promise<readonly NameLookupRow[]>;
  /** Applies one resolved link. Best-effort by convention: a link write
   *  failing must not undo the row it points from, which already landed. */
  applyLinkResolution: (resolution: Extract<LinkResolution, { status: "resolved" }>) => Promise<void>;
  /** Only ever invoked for `kind === "quests"`, once per inserted quest that
   *  carries a spine. */
  writeQuestSpine: (input: {
    questId: string;
    campaignId: string;
    beats: QuestSpineBeatResult[] | undefined;
    routes: QuestSpineRouteResult[] | undefined;
    objectives: QuestObjectiveResult[] | undefined;
  }) => Promise<void>;
  /** Only ever invoked for `kind === "encounters"`: resolves combatant names
   *  against this campaign's monsters and the shared library, keyed by the
   *  name that was queried (mirrors `resolve_monster_references`'s own
   *  `distinct on (query_name)` contract). */
  resolveMonsterNames: (names: readonly string[]) => Promise<ReadonlyMap<string, { targetId: string }>>;
  /** Only ever invoked for `kind === "encounters"`, once per inserted
   *  encounter, once its combatants' ids have been resolved. */
  updateEncounterCombatants: (encounterId: string, combatants: readonly CombatantDef[]) => Promise<void>;
}

// ── Which other kinds a source kind's links resolve against ─────────────────

/**
 * Mirrors (only the shape of) `importPlan.ts`'s own `LINK_TARGETS`, which
 * isn't exported — the resolution algorithm itself still comes from
 * `resolveLinks`, this only tells this module which lookups to fetch first.
 *
 * `encounters` lists both targets its own combatant resolution needs
 * (`npcs`, for a named individual) alongside the one `resolveLinks` itself
 * consumes (`locations`, for `encounter_location_name`) — see the encounters
 * block below, which reuses this same `lookups.npcs` fetch rather than
 * issuing a second one.
 */
const LINK_LOOKUP_TARGETS: Partial<Record<ImportEntityKind, ImportEntityKind[]>> = {
  npcs: ["factions"],
  locations: ["locations"],
  quests: ["npcs", "locations"],
  encounters: ["locations", "npcs"],
};

// ── Result ───────────────────────────────────────────────────────────────────

export interface RunImportKindResult {
  report: ImportRunReport;
  /** Names `resolveLinks` (or, for `encounters`, combatant resolution)
   *  couldn't match against an existing or freshly-inserted row — reported,
   *  never silently dropped, since the referent may simply not exist. */
  unresolvedLinkNames: string[];
  /** Every inserted row's plan `ref` resolved to the id it actually got —
   *  the caller's only way to learn a created row's id, since this module
   *  otherwise reports only counts. */
  insertedIds: ReadonlyMap<string, string>;
}

/**
 * Runs one kind's plan end to end: build it, insert row by row (stopping at
 * the first quota refusal — see the file header), resolve and apply the
 * cross-entity links the inserted rows captured, and run the one extra pass
 * `quests` or `encounters` needs.
 *
 * `linkedRefs` (#837/#838) names entities the caller already resolved to an
 * existing campaign/library row — passing an empty set (the compact review's
 * only use of this parameter) means every selected entity is created fresh,
 * which is a legitimate, simpler choice for a surface that doesn't offer a
 * per-entity link-vs-create decision at all.
 */
export async function runImportKind<K extends ImportEntityKind>(
  params: {
    kind: K;
    entities: readonly ExtractedEntity<K>[];
    selectedRefs: ReadonlySet<string>;
    linkedRefs: ReadonlySet<string>;
    campaignId: string;
    provenance: AiProvenance;
  },
  deps: RunImportKindDeps,
): Promise<RunImportKindResult> {
  const { kind, entities, selectedRefs, linkedRefs, campaignId, provenance } = params;

  const plan = buildImportPlan(kind, entities, selectedRefs, campaignId, provenance, linkedRefs);

  // Row by row (never a single batched insert) so a mid-batch quota
  // rejection can be attributed to the row that tripped it and every row
  // ahead of it is still known to have landed.
  const outcomes: ImportRowOutcome[] = [];
  for (const planned of plan) {
    const result = await deps.insertRow(planned.row as Record<string, unknown>);
    if (result.status === "quota_exceeded") {
      outcomes.push({ ref: planned.ref, status: "quota_exceeded" });
      break; // retrying the rest would fail identically — see importPlan.ts
    }
    if (result.status === "failed") {
      outcomes.push({ ref: planned.ref, status: "failed", message: result.message });
      continue;
    }
    outcomes.push({ ref: planned.ref, status: "inserted", id: result.id });
  }

  const report = buildImportRunReport(kind, plan, outcomes);

  const insertedIds = new Map<string, string>();
  const linkedRows: LinkedRow[] = [];
  for (const outcome of outcomes) {
    if (outcome.status !== "inserted") continue;
    insertedIds.set(outcome.ref, outcome.id);
    const planned = plan.find((p) => p.ref === outcome.ref);
    if (planned) linkedRows.push({ id: outcome.id, links: planned.links });
  }

  const lookupTargets = LINK_LOOKUP_TARGETS[kind] ?? [];
  const lookups: Partial<Record<ImportEntityKind, readonly NameLookupRow[]>> = {};
  for (const targetKind of lookupTargets) {
    lookups[targetKind] = await deps.fetchNameLookup(targetKind);
  }

  const resolutions = resolveLinks(kind, linkedRows, lookups);
  const unresolvedLinkNames: string[] = [];
  for (const resolution of resolutions) {
    if (resolution.status === "unresolved") {
      unresolvedLinkNames.push(resolution.name);
      continue;
    }
    await deps.applyLinkResolution(resolution);
  }

  // A second pass like the link resolution above, for the same reason: every
  // beat needs the quest's own id, which does not exist until here.
  if (kind === "quests") {
    for (const outcome of outcomes) {
      if (outcome.status !== "inserted") continue;
      const spine = plan.find((p) => p.ref === outcome.ref)?.questSpine;
      if (!spine) continue;
      try {
        await deps.writeQuestSpine({
          questId: outcome.id,
          campaignId,
          beats: spine.beats,
          routes: spine.routes,
          objectives: spine.objectives,
        });
      } catch {
        // Best-effort: a partially wired spine doesn't undo the quest, which
        // already landed and is already counted as imported.
      }
    }
  }

  // A second pass like the two above, and for the same reason — a
  // combatant's real id can't exist until the encounter row it lives inside
  // does — but this one doesn't go through `resolveLinks`/link lookups like
  // `encounter_location_name` just did: a combatant name resolves against
  // *either* `npcs` or `monsters`/`library_monsters`, never one fixed
  // target, which is exactly what that resolver cannot express.
  if (kind === "encounters") {
    const insertedEncounters: { id: string; row: EncounterInsert }[] = [];
    for (const outcome of outcomes) {
      if (outcome.status !== "inserted") continue;
      const planned = plan.find((p) => p.ref === outcome.ref);
      if (planned) insertedEncounters.push({ id: outcome.id, row: planned.row as unknown as EncounterInsert });
    }

    // Every combatant name across every encounter in this run, deduped, in
    // one lookup — never one per card.
    const allCombatantNames = [
      ...new Set(
        insertedEncounters.flatMap((inserted) =>
          inserted.row.combatants.map((combatant) => combatant.custom_name).filter((name): name is string => name !== null),
        ),
      ),
    ];
    const monsterMatches = allCombatantNames.length > 0 ? await deps.resolveMonsterNames(allCombatantNames) : new Map();
    // Reuses the same fetch `resolveLinks` above just consumed — `encounters`
    // is declared with `npcs` in `LINK_LOOKUP_TARGETS` for exactly this.
    const npcLookup = lookups.npcs ?? [];

    for (const inserted of insertedEncounters) {
      const resolvedCombatants = resolveEncounterCombatants(inserted.row.combatants, npcLookup, monsterMatches);
      // A combatant left with neither id is a real, meaningful outcome —
      // never silently dropped — so it's reported the same way an
      // unresolved FK link is.
      unresolvedLinkNames.push(
        ...resolvedCombatants
          .filter((combatant) => !combatant.monster_id && !combatant.npc_id && combatant.custom_name)
          .map((combatant) => combatant.custom_name as string),
      );
      try {
        await deps.updateEncounterCombatants(inserted.id, resolvedCombatants);
      } catch {
        // Best-effort, like the link writes and quest-spine write above: the
        // encounter already landed and is already counted as imported.
      }
    }
  }

  return { report, unresolvedLinkNames, insertedIds };
}
