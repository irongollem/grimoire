/**
 * Which of an NPC's memories the Voice Coach's prompt carries (#1061).
 *
 * Recency alone forgot the promise from session 3 exactly when the party came
 * back to what it was about. With a TypeSafe key, the newest
 * MEMORY_CANDIDATE_LIMIT memories are each scored for how much they bear on the
 * situation, and the prompt takes the central ones, then the related ones,
 * then the newest of the rest, up to MEMORY_PROMPT_LIMIT. Without a key, with
 * few memories, or when judging fails, the newest MEMORY_PROMPT_LIMIT apply
 * unchanged.
 *
 * Pure like import-match/judgeTier.ts: the judge is injected and nothing here
 * throws. Deno-free, so memoryRelevance.test.ts runs under vitest.
 */

import { maskTrueName, MEMORY_PROMPT_LIMIT, type NpcMemoryIdentity, type PromptNpcMemory } from "../_shared/npcMemories.ts";
import type { JudgeRequest, ScoreQuestion } from "../_shared/typesafe.ts";
import { runBounded } from "../import-match/judging.ts";

/** How many of the newest memories are read and scored. */
export const MEMORY_CANDIDATE_LIMIT = 60;
export const MEMORY_JUDGE_CONCURRENCY = 16;
export const MEMORY_JUDGE_DEADLINE_MS = 8_000;
/** From here up a memory bears directly on the situation. */
export const CENTRAL_MIN_SCORE = 1.5;
/** From here up a memory shares people, place or subject with the situation. */
export const RELATED_MIN_SCORE = 0.5;

export const RELEVANCE_QUESTION = "relevance";

export const RELEVANCE_QUESTION_BODY: ScoreQuestion = {
  type: "score",
  instructions: "How much does `memory` bear on `situation` for a character deciding what to say?",
  criteria: [
    "The memory has nothing to do with the situation.",
    "The memory involves the same people, place or subject as the situation, but would not change what the character says now.",
    "The memory bears directly on the situation: a promise, debt, grudge, secret or earlier meeting the character would have in mind while speaking.",
  ],
};

/** The memory text is the name-masked body: for a disguised NPC the true name must never leave the server. */
export function buildRelevanceRequest(situation: string, maskedBody: string): JudgeRequest {
  return { state: { situation, memory: maskedBody }, questions: { [RELEVANCE_QUESTION]: RELEVANCE_QUESTION_BODY } };
}

/**
 * Picks at most `limit` of `candidates` (oldest first) and returns them oldest
 * first. `scores[i]` is candidate i's score, or null when it was not judged.
 * Central memories first (the newest if more than fit), then related, then
 * everything else, each group newest first.
 */
export function selectPromptMemories(
  candidates: PromptNpcMemory[],
  scores: (number | null)[],
  limit: number = MEMORY_PROMPT_LIMIT,
): PromptNpcMemory[] {
  const central: number[] = [];
  const related: number[] = [];
  const rest: number[] = [];
  // Walk newest to oldest so every group is already newest first.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const score = scores[i];
    if (score !== null && score >= CENTRAL_MIN_SCORE) central.push(i);
    else if (score !== null && score >= RELATED_MIN_SCORE) related.push(i);
    else rest.push(i);
  }
  const chosen = [...central, ...related, ...rest].slice(0, limit).sort((a, b) => a - b);
  return chosen.map((i) => candidates[i]);
}

export interface RelevanceScore {
  score: number | null;
  inputTokens: number;
}

export interface RelevancePick {
  memories: PromptNpcMemory[];
  /** Tokens Jev read, for the ledger row; 0 when no request was made. */
  inputTokens: number;
  /** How many memories were scored. */
  judged: number;
}

/**
 * `candidates` oldest first, up to MEMORY_CANDIDATE_LIMIT. Makes no request when
 * there is no key or nothing needs choosing; any failure of a memory's judgment
 * leaves that memory unjudged, and a thrown judge is a failed judgment.
 */
export async function pickPromptMemories(args: {
  candidates: PromptNpcMemory[];
  situation: string;
  identity: NpcMemoryIdentity;
  apiKey: string | null;
  judgeScore: (request: JudgeRequest, signal: AbortSignal) => Promise<RelevanceScore>;
}): Promise<RelevancePick> {
  const { candidates, situation, identity, apiKey, judgeScore } = args;
  if (!apiKey || candidates.length <= MEMORY_PROMPT_LIMIT) {
    return { memories: candidates.slice(-MEMORY_PROMPT_LIMIT), inputTokens: 0, judged: 0 };
  }
  try {
    const outcomes = await runBounded(
      candidates.map((m) => (signal: AbortSignal) =>
        judgeScore(buildRelevanceRequest(situation, maskTrueName(m.body, identity)), signal)),
      { concurrency: MEMORY_JUDGE_CONCURRENCY, deadlineMs: MEMORY_JUDGE_DEADLINE_MS },
    );
    let inputTokens = 0;
    let judged = 0;
    const scores = outcomes.map((o) => {
      if (!o.done) return null;
      inputTokens += o.value.inputTokens;
      if (o.value.score === null) return null;
      judged++;
      return o.value.score;
    });
    return { memories: selectPromptMemories(candidates, scores), inputTokens, judged };
  } catch {
    return { memories: candidates.slice(-MEMORY_PROMPT_LIMIT), inputTokens: 0, judged: 0 };
  }
}
