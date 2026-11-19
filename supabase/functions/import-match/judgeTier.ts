/**
 * The judging tier's orchestration (#1061), with every effect injected so it
 * is tested under vitest: reading the candidates' rows, and judging one pair.
 * index.ts supplies the Supabase reads and the TypeSafe call.
 *
 * Contract: this never throws. A row that cannot be read, a pair whose request
 * failed, a pair over a cap and a pair the deadline cut off are all simply
 * absent from `verdicts`, and applyVerdicts then treats them as unjudged.
 */

import {
  buildRelationRequest,
  buildStoredText,
  JUDGE_CONCURRENCY,
  JUDGE_DEADLINE_MS,
  planPairs,
  runBounded,
  verdictKey,
  type PlannedPair,
  type PoolEntity,
} from "./judging.ts";
import type { JudgeRequest } from "../_shared/typesafe.ts";
import type { MatchSource, SemanticKind } from "./matching.ts";

export interface TierEntity extends PoolEntity {
  kind: SemanticKind;
  importedText: string;
}

export interface PairJudgment {
  /** The Score, or null when the answer carried none. */
  score: number | null;
  model: string;
  inputTokens: number;
}

export interface TierDeps {
  /** Rows by id for one kind and source. A missing id means unreadable. May throw. */
  loadRows: (kind: SemanticKind, source: MatchSource, ids: string[]) => Promise<Map<string, Record<string, unknown>>>;
  judgePair: (request: JudgeRequest, signal: AbortSignal) => Promise<PairJudgment>;
  concurrency?: number;
  deadlineMs?: number;
  perEntity?: number;
  perRequest?: number;
}

export interface TierResult {
  verdicts: Map<string, number>;
  /** The model that answered, null when no pair was judged. */
  model: string | null;
  inputTokens: number;
  /** Pairs that produced a verdict. */
  judged: number;
}

export async function runJudgingTier(entities: TierEntity[], deps: TierDeps): Promise<TierResult> {
  const result: TierResult = { verdicts: new Map(), model: null, inputTokens: 0, judged: 0 };
  const kindOf = new Map(entities.map((e) => [e.key, e]));
  const planned = planPairs(entities, deps.perEntity, deps.perRequest);
  if (planned.length === 0) return result;

  // One read per (kind, source): the ids this request needs, deduplicated.
  const wanted = new Map<string, { kind: SemanticKind; source: MatchSource; ids: Set<string> }>();
  for (const pair of planned) {
    const kind = kindOf.get(pair.entityKey)?.kind;
    if (!kind) continue;
    const groupKey = `${kind}|${pair.candidate.source}`;
    const group = wanted.get(groupKey) ?? { kind, source: pair.candidate.source, ids: new Set<string>() };
    group.ids.add(pair.candidate.targetId);
    wanted.set(groupKey, group);
  }
  const rows = new Map<string, Record<string, unknown>>();
  await Promise.all([...wanted.entries()].map(async ([groupKey, group]) => {
    try {
      const loaded = await deps.loadRows(group.kind, group.source, [...group.ids]);
      for (const [id, row] of loaded) rows.set(`${groupKey}|${id}`, row);
    } catch {
      // This group's pairs have no row text, so they are unjudged below.
    }
  }));

  const jobs: { pair: PlannedPair; request: JudgeRequest }[] = [];
  for (const pair of planned) {
    const entity = kindOf.get(pair.entityKey);
    if (!entity) continue;
    const row = rows.get(`${entity.kind}|${pair.candidate.source}|${pair.candidate.targetId}`);
    if (!row) continue;
    const existing = buildStoredText(entity.kind, row);
    if (existing === null) continue;
    jobs.push({ pair, request: buildRelationRequest(entity.importedText, existing) });
  }

  const outcomes = await runBounded(
    jobs.map((job) => (signal: AbortSignal) => deps.judgePair(job.request, signal)),
    { concurrency: deps.concurrency ?? JUDGE_CONCURRENCY, deadlineMs: deps.deadlineMs ?? JUDGE_DEADLINE_MS },
  );

  outcomes.forEach((outcome, i) => {
    if (!outcome.done) return;
    const { score, model, inputTokens } = outcome.value;
    // Tokens were spent whether or not the answer carried a score.
    result.inputTokens += inputTokens;
    result.model = model;
    if (score === null) return;
    result.verdicts.set(verdictKey(jobs[i].pair.entityKey, jobs[i].pair.candidate), score);
    result.judged++;
  });
  return result;
}
