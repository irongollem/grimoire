/**
 * Pure logic for the judging tier of `import-match` (#1061): which candidate
 * pairs get a Jev verdict, how the verdicts filter and order the candidates,
 * and the bounded runner that keeps the tier inside its time budget.
 *
 * Deno-free like matching.ts, so judging.test.ts runs under vitest. index.ts
 * owns the Deno-only parts (the platform key, the row reads, the ledger row).
 *
 * Why this tier exists: the embedding tier alone, cut off at a per-kind
 * distance, made 8 wrong default links and missed 17 of 48 real matches on 80
 * labelled entities, because a distance cannot tell "the same innkeeper,
 * described differently" from "the innkeeper's brother". Offering the five
 * nearest rows with no cut-off and letting Jev judge each (imported, existing)
 * pair linked 47 of 48 with none wrong.
 */

import {
  buildFactionEmbedText,
  buildItemEmbedText,
  buildLocationEmbedText,
  buildNpcEmbedText,
} from "../_shared/entityEmbedText.ts";
import { buildMonsterEmbedText } from "../_shared/monsterEmbedText.ts";
import type { JudgeRequest, ScoreQuestion } from "../_shared/typesafe.ts";
import { MAX_SIMILAR_APPEND, SIMILAR_MAX_DISTANCE, type Candidate, type MatchSource, type SemanticKind } from "./matching.ts";

// ── The question ─────────────────────────────────────────────────────────────

/** The name of the Score question in the request, read back from the answers. */
export const RELATION_QUESTION = "relation";

/** The wording that was evaluated (80 labelled entities); changing it voids that measurement. */
export const RELATION_QUESTION_BODY: ScoreQuestion = {
  type: "score",
  instructions:
    "How do `imported` (an entry read from a new adventure text) and `existing` (an entry already in the campaign) relate?",
  criteria: [
    "They are two different people, places, creatures, groups or items. A shared name or word alone does not make them the same.",
    "They are closely related but distinct: a relative or associate, a part or a room of the other, a variant, or a stronger or weaker version.",
    "They are one and the same entity, described in different words, possibly under a shortened, lengthened, misspelled or alternative name.",
  ],
};

export function buildRelationRequest(imported: string, existing: string): JudgeRequest {
  return { state: { imported, existing }, questions: { [RELATION_QUESTION]: RELATION_QUESTION_BODY } };
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const MAX_PAIRS_PER_ENTITY = 8;
export const MAX_PAIRS_PER_REQUEST = 1600;
export const JUDGE_CONCURRENCY = 16;
export const JUDGE_DEADLINE_MS = 45_000;
/** A similar candidate judged below this is dropped: between "different" (0) and "related" (1). */
export const KEEP_VERDICT = 0.5;
/** From here up a pair reads as "the same thing". The client links at this number too (`LINK_VERDICT` in
 *  src/lib/documentImport/entityMatching.ts); the two are stated apart because edge code and client code share no
 *  module, and are held equal by the comment only. */
export const SAME_VERDICT = 1.5;
/** How many merely related similar rows are shown when nothing is judged the same. In a small campaign every
 *  neighbour is "related" (another NPC of the same town), and seen in the review (15 Nov 2026) three of those under
 *  a confident match were noise. Beside a match they are dropped; with no match the two closest stay, since "this is
 *  the Gaffer's namesake, not the Gaffer" is worth showing. */
export const MAX_RELATED_SIMILAR = 2;

// ── Pool and pairs ───────────────────────────────────────────────────────────

export function candidateKey(c: Pick<Candidate, "source" | "targetId">): string {
  return `${c.source}:${c.targetId}`;
}

/**
 * Name candidates in their order, then the similar ones by distance, no row
 * twice. A row the name tier found keeps its name-tier entry: it should not
 * come back as a "similar" one (same rule as mergeCandidates).
 */
export function buildPool(nameCandidates: Candidate[], similarCandidates: Candidate[]): Candidate[] {
  const seen = new Set(nameCandidates.map(candidateKey));
  const pool = [...nameCandidates];
  const byDistance = [...similarCandidates].sort(
    (a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY),
  );
  for (const c of byDistance) {
    const key = candidateKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(c);
  }
  return pool;
}

export interface PoolEntity {
  /** Unique per entity in the request (kind and ref). */
  key: string;
  pool: Candidate[];
}

export interface PlannedPair {
  entityKey: string;
  candidate: Candidate;
}

/**
 * At most `perEntity` pairs per entity (name candidates first, as the pool is
 * ordered) and at most `perRequest` overall, in entity order. Pairs beyond a
 * cap are simply never planned, which makes them unjudged.
 */
export function planPairs(
  entities: PoolEntity[],
  perEntity = MAX_PAIRS_PER_ENTITY,
  perRequest = MAX_PAIRS_PER_REQUEST,
): PlannedPair[] {
  const pairs: PlannedPair[] = [];
  for (const entity of entities) {
    for (const candidate of entity.pool.slice(0, perEntity)) {
      if (pairs.length >= perRequest) return pairs;
      pairs.push({ entityKey: entity.key, candidate });
    }
  }
  return pairs;
}

export function verdictKey(entityKey: string, candidate: Pick<Candidate, "source" | "targetId">): string {
  return `${entityKey}|${candidateKey(candidate)}`;
}

// ── After judgement ──────────────────────────────────────────────────────────

/**
 * Applies verdicts to one entity's pool.
 *
 * Name candidates are never dropped, whatever the verdict: a DM who owns five
 * goblins must see all five (see mergeCandidates). A judged similar candidate
 * stays only at KEEP_VERDICT or above. An unjudged similar candidate (the pair
 * failed, hit a cap, or the tier did not run) falls back to today's rule: kept
 * within SIMILAR_MAX_DISTANCE[kind], at most MAX_SIMILAR_APPEND of them.
 * Judged first by verdict (best first, a stable sort), then the unjudged in the
 * pool's own order.
 */
export function applyVerdicts(
  kind: SemanticKind,
  entityKey: string,
  pool: Candidate[],
  verdicts: ReadonlyMap<string, number>,
): Candidate[] {
  const judged: { candidate: Candidate; verdict: number }[] = [];
  const unjudged: Candidate[] = [];
  let unjudgedSimilar = 0;
  for (const c of pool) {
    const verdict = verdicts.get(verdictKey(entityKey, c));
    if (verdict !== undefined) {
      if (c.matchKind === "similar" && verdict < KEEP_VERDICT) continue;
      judged.push({ candidate: { ...c, verdict }, verdict });
      continue;
    }
    if (c.matchKind === "similar") {
      if (c.distance === null || c.distance > SIMILAR_MAX_DISTANCE[kind]) continue;
      if (unjudgedSimilar >= MAX_SIMILAR_APPEND) continue;
      unjudgedSimilar++;
    }
    unjudged.push({ ...c, verdict: null });
  }
  judged.sort((a, b) => b.verdict - a.verdict);
  const hasSame = judged.some((j) => j.verdict >= SAME_VERDICT);
  let related = 0;
  const shown = judged.filter((j) => {
    if (j.candidate.matchKind !== "similar" || j.verdict >= SAME_VERDICT) return true;
    if (hasSame) return false;
    return ++related <= MAX_RELATED_SIMILAR;
  });
  return [...shown.map((j) => j.candidate), ...unjudged];
}

// ── Bounded runner ───────────────────────────────────────────────────────────

export type Outcome<T> = { done: true; value: T } | { done: false };

/**
 * Runs `tasks` with at most `concurrency` in flight and stops at `deadlineMs`:
 * no new task starts after it, in-flight ones are aborted through the signal,
 * and the function returns at the deadline without waiting for stragglers. A
 * task that throws, or had not finished, is `{ done: false }`; this never
 * rejects, because the judging tier must never fail the function.
 */
export async function runBounded<T>(
  tasks: ((signal: AbortSignal) => Promise<T>)[],
  opts: { concurrency: number; deadlineMs: number },
): Promise<Outcome<T>[]> {
  const controller = new AbortController();
  const results: Outcome<T>[] = tasks.map(() => ({ done: false }));
  let expired = false;
  let next = 0;

  const worker = async (): Promise<void> => {
    while (!expired) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i](controller.signal);
        results[i] = { done: true, value };
      } catch {
        // A failed task is an unfinished one.
      }
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      resolve();
    }, opts.deadlineMs);
  });
  const workers = Array.from({ length: Math.min(opts.concurrency, tasks.length) }, worker);
  await Promise.race([Promise.all(workers), deadline]);
  clearTimeout(timer);
  // Snapshot: a straggler resolving after the deadline must not change what
  // was returned (and `expired` already stops it starting another task).
  return [...results];
}

// ── Stored-row text ──────────────────────────────────────────────────────────
// The existing row's text is built with the same builders (and so the same
// shape) as the imported entity's, so Jev compares like with like. A row
// missing a required column yields null: that pair is unjudged, not guessed.

/** Columns each kind's builder reads (the selects embed-content and embed-monsters use, minus ownership and timestamps). */
export const JUDGE_ROW_SELECT: Record<SemanticKind, string> = {
  npcs: "id, name, race, occupation, alignment, tags, appearance, personality, backstory",
  factions: "id, name, faction_type, alignment, tags, description",
  locations: "id, name, location_type, tags, player_summary, description",
  items: "id, name, item_type, rarity, subtype, requires_attunement, attunement_requirements, cost, tags, description",
  monsters: "id, name, monster_type, size, habitat, tags, description, stat_block",
};

/** The table holding this kind's rows for a source, or null where no such table exists (only monsters and items have a library). */
export function judgeTable(kind: SemanticKind, source: MatchSource): string | null {
  if (source === "campaign") return kind;
  if (kind === "monsters") return "library_monsters";
  if (kind === "items") return "library_items";
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function stringList(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((t): t is string => typeof t === "string") ? v : null;
}

export function buildStoredText(kind: SemanticKind, row: Record<string, unknown>): string | null {
  const name = optStr(row.name);
  if (name === null) return null;

  switch (kind) {
    case "npcs": {
      const tags = stringList(row.tags);
      if (tags === null) return null;
      return buildNpcEmbedText({
        name,
        race: optStr(row.race),
        occupation: optStr(row.occupation),
        alignment: optStr(row.alignment),
        tags,
        appearance: optStr(row.appearance),
        personality: optStr(row.personality),
        backstory: optStr(row.backstory),
      });
    }
    case "factions": {
      const tags = stringList(row.tags);
      if (tags === null) return null;
      return buildFactionEmbedText({
        name,
        faction_type: optStr(row.faction_type),
        alignment: optStr(row.alignment),
        tags,
        description: optStr(row.description),
      });
    }
    case "locations": {
      const tags = stringList(row.tags);
      const locationType = optStr(row.location_type);
      if (tags === null || locationType === null) return null;
      return buildLocationEmbedText({
        name,
        location_type: locationType,
        tags,
        player_summary: optStr(row.player_summary),
        description: optStr(row.description),
      });
    }
    case "items": {
      const tags = stringList(row.tags);
      const itemType = optStr(row.item_type);
      const rarity = optStr(row.rarity);
      if (tags === null || itemType === null || rarity === null) return null;
      return buildItemEmbedText({
        name,
        item_type: itemType,
        rarity,
        subtype: optStr(row.subtype),
        requires_attunement: row.requires_attunement === true,
        attunement_requirements: optStr(row.attunement_requirements),
        cost: optStr(row.cost),
        tags,
        description: optStr(row.description),
      });
    }
    case "monsters": {
      // monsters.tags is nullable (an absent list is fine); a present but malformed one is not.
      const tags = row.tags === null ? null : stringList(row.tags);
      if (row.tags !== null && tags === null) return null;
      const statBlock = isPlainObject(row.stat_block) ? row.stat_block : null;
      return buildMonsterEmbedText({
        name,
        monster_type: optStr(row.monster_type),
        size: optStr(row.size),
        habitat: optStr(row.habitat),
        tags,
        description: optStr(row.description),
        stat_block: { challenge_rating: statBlock ? optStr(statBlock.challenge_rating) : null },
      });
    }
  }
}
