/**
 * Pure decision-state helpers for the review surfaces (`ImportKindReview.vue`,
 * `ImportEntityReviewRow.vue`) that replaced the old select/skip wizard cards.
 *
 * Every extracted entity now carries one explicit `ImportDecision`
 * (`entityMatching.ts`) rather than a selected/excluded boolean, and the
 * review surfaces need three things this module owns, kept out of the
 * components so they stay testable without mounting anything:
 *
 *   - seeding a decision the first time real candidates are known, without
 *     ever clobbering a DM's own choice (`seedImportDecisions`)
 *   - the per-kind tallies the group header chips render (`tallyDecisions`)
 *   - the two group actions, "Ignore all" and "Reset to suggested"
 *     (`ignoreAllDecisions`, `resetToSuggestedDecisions`)
 */
import { defaultDecision, type EntityCandidate, type ImportDecision } from "./entityMatching";
import type { UsableEntity } from "./sanitizeEntities";
import type { ImportEntityKind } from "@/types/documentImport.types";

/**
 * Fills in `defaultDecision` for every entity that doesn't already have one —
 * never overwrites a ref already present in `existing`, which is what makes
 * this safe to re-run every time `entities`/`candidatesByRef` change (a
 * matches query resolving after the review already rendered, say) without
 * clobbering a DM who has already made a choice.
 *
 * Returns `existing` itself, not a copy, when nothing needed seeding — a
 * caller comparing identity (`seeded !== decisions.value`) can tell whether
 * anything actually changed without a deep-equality check.
 */
export function seedImportDecisions(
  kind: ImportEntityKind,
  entities: readonly UsableEntity[],
  candidatesByRef: ReadonlyMap<string, readonly EntityCandidate[]>,
  existing: ReadonlyMap<string, ImportDecision>,
): Map<string, ImportDecision> {
  let changed = false;
  const next = new Map(existing);
  for (const entity of entities) {
    if (next.has(entity.ref)) continue;
    const candidates = candidatesByRef.get(entity.ref) ?? [];
    next.set(entity.ref, defaultDecision(kind, entity.data, candidates));
    changed = true;
  }
  return changed ? next : (existing as Map<string, ImportDecision>);
}

export interface DecisionTally {
  link: number;
  /** `link` decisions whose candidate is `source: "library"` — the sweep
   *  will copy that row into the DM's own content before it lands anywhere
   *  ("add it from the library," `importSweep.ts`'s `adoptLibraryLinks`).
   *  Counted apart from `link`, which stays "reuses a row the DM already
   *  owns" — the review-time mirror of `ImportKindOutcome.adopted`, computed
   *  from the decision alone since nothing has run yet at review time. */
  adopt: number;
  create: number;
  generate: number;
  ignore: number;
}

/** Tallies whatever decisions exist for `refs` — a ref with no decision yet
 *  (matches still loading) counts toward none of the five buckets. */
export function tallyDecisions(refs: readonly string[], decisions: ReadonlyMap<string, ImportDecision>): DecisionTally {
  const tally: DecisionTally = { link: 0, adopt: 0, create: 0, generate: 0, ignore: 0 };
  for (const ref of refs) {
    const decision = decisions.get(ref);
    if (!decision) continue;
    if (decision.action === "link") {
      if (decision.candidate.source === "library") tally.adopt++;
      else tally.link++;
    } else {
      tally[decision.action]++;
    }
  }
  return tally;
}

/** Whether the default link is a guess the DM must see, not a fact to confirm
 *  — the review row starts expanded for these. Two cases: several candidates
 *  (which goblin?), or a single one that only matched on part of the name or
 *  on meaning. "Silt Wraith" partially matches the library's "Wraith", a
 *  different creature; defaulting to it behind a closed row is the silent
 *  wrong-link this review exists to prevent. One same-name match stays closed. */
export function needsDmChoice(candidates: readonly EntityCandidate[]): boolean {
  if (candidates.length > 1) return true;
  const only = candidates[0];
  return only !== undefined && only.matchKind !== "exact";
}

/** "Ignore all" — replaces every entity's decision, discarding whatever was
 *  chosen before. A full replacement (not a merge), same as
 *  `resetToSuggestedDecisions` below, because both are explicit bulk actions
 *  the DM asked for, not an incremental seed. */
export function ignoreAllDecisions(entities: readonly UsableEntity[]): Map<string, ImportDecision> {
  return new Map(entities.map((entity) => [entity.ref, { action: "ignore" } as const]));
}

/**
 * "Reset to suggested" — recomputes `defaultDecision` for every entity from
 * scratch, using each entity's current (possibly DM-edited) data so a field
 * edit that changed whether a monster has a real stat block is reflected in
 * the reset, not the page's original extraction.
 */
export function resetToSuggestedDecisions(
  kind: ImportEntityKind,
  entities: readonly UsableEntity[],
  candidatesByRef: ReadonlyMap<string, readonly EntityCandidate[]>,
  dataByRef: ReadonlyMap<string, Record<string, unknown>>,
): Map<string, ImportDecision> {
  const next = new Map<string, ImportDecision>();
  for (const entity of entities) {
    const data = dataByRef.get(entity.ref) ?? entity.data;
    const candidates = candidatesByRef.get(entity.ref) ?? [];
    next.set(entity.ref, defaultDecision(kind, data, candidates));
  }
  return next;
}

// ── Plan limits, checked before anything is written ─────────────────────────

/** One kind whose chosen decisions would insert more rows than the DM's plan
 *  still has room for. */
export interface QuotaShortfall {
  kind: ImportEntityKind;
  wouldAdd: number;
  room: number;
}

/**
 * Rows a kind's decisions insert into its quota-limited table. Creates and
 * generations always insert; a library adoption inserts a monster copy (items
 * have no quota trigger — `entityKinds.ts`), unless the DM already owns that
 * copy, so this is an upper bound. Upper is the right side to err on: the
 * failure being prevented is a sweep that stops half-way.
 */
export function rowsAddedToQuota(kind: ImportEntityKind, tally: DecisionTally): number {
  return tally.create + tally.generate + (kind === "monsters" ? tally.adopt : 0);
}

/**
 * Every kind that would run out of plan room mid-import. The sweep does stop
 * cleanly at a quota and reports it — but by then half a page has landed, and
 * every link into the rows that did not is left dangling ("NPC → location
 * 'Upper Gallery'" unresolved). Knowing before the DM confirms is the only
 * point at which they can still choose what to leave out. `roomFor` returns
 * null for "no limit" (Pro, admin, or a kind with no quota).
 */
export function quotaShortfalls(
  addsByKind: Partial<Record<ImportEntityKind, number>>,
  roomFor: (kind: ImportEntityKind) => number | null,
): QuotaShortfall[] {
  const out: QuotaShortfall[] = [];
  for (const [kind, wouldAdd] of Object.entries(addsByKind) as [ImportEntityKind, number][]) {
    const room = roomFor(kind);
    if (room !== null && wouldAdd > room) out.push({ kind, wouldAdd, room });
  }
  return out;
}
