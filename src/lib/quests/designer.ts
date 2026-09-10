import type { AiProvenance } from "@/ai/provenance";
import type { QuestHookResult } from "@/ai/types";

/**
 * Client-side shapes and pure helpers for the Quest Designer (#873) — the
 * multi-turn conversational alternative to the one-shot hook generator
 * (`useQuestGeneration`). The wire protocol these mirror lives on the
 * `quest-designer-turn` edge function; see the epic's contract for the full
 * request/response shapes and the server-side constants they're named after.
 *
 * `useQuestDesigner` (src/ai/useQuestDesigner.ts) owns the turn-taking state
 * machine and is the only caller of `sanitizeDesignQuestions`; `diffDesignTrees`
 * and `toDesignAnswer` are consumed directly by the Quest Designer UI (S3).
 */

export const QUEST_DESIGN_PROSE_LIMIT = 4000;
export const QUEST_DESIGN_TURN_BUDGET = 10;
export const QUEST_DESIGN_ANSWER_LIMIT = 500;

/** A sanity ceiling on how many questions one turn can ask — mirrors the
 *  server's own `QUEST_DESIGN_MAX_QUESTIONS_PER_TURN`. */
const MAX_QUESTIONS_PER_TURN = 3;
const MAX_OPTIONS_PER_QUESTION = 4;
const MIN_OPTIONS_PER_QUESTION = 2;

/** Re-export alias: the designer's tree is exactly the #822 hook shape —
 *  same beats/routes/objectives the one-shot generator produces — because the
 *  designer is a different way of arriving at the same artifact, not a
 *  different artifact. */
export type QuestDesignTree = QuestHookResult;

export interface QuestDesignQuestionOption {
  key: string;
  label: string;
}

export interface QuestDesignQuestion {
  key: string;
  about: string | null;
  question: string;
  why: string;
  options: QuestDesignQuestionOption[];
}

export interface QuestDesignAnswer {
  question_key: string;
  question: string;
  answer: string;
}

export interface QuestDesignTurnRequest {
  campaign_id: string;
  prose: string;
  turn: number;
  tree: QuestDesignTree | null;
  answers: QuestDesignAnswer[];
}

export interface QuestDesignTurnResponse {
  tree: QuestDesignTree;
  questions: QuestDesignQuestion[];
  note: string;
  turn: number;
  turns_left: number;
  ai_provenance: AiProvenance;
}

/** A JSON response can put anything under a field the interface calls
 *  `string` — this is what "untrusted" means for a value that only passed
 *  through `JSON.parse` and a type assertion, never a runtime check. Mirrors
 *  `asTrimmedString` in src/lib/quests/spine.ts. */
function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeOptions(raw: unknown): QuestDesignQuestionOption[] {
  if (!Array.isArray(raw)) return [];
  const seenKeys = new Set<string>();
  const options: QuestDesignQuestionOption[] = [];
  for (const entry of raw) {
    if (options.length >= MAX_OPTIONS_PER_QUESTION) break;
    const candidate = entry as { key?: unknown; label?: unknown } | null | undefined;
    const key = asTrimmedString(candidate?.key);
    const label = asTrimmedString(candidate?.label);
    if (!key || !label || seenKeys.has(key)) continue;
    seenKeys.add(key);
    options.push({ key, label });
  }
  return options;
}

/**
 * Untrusted → trusted. Drops a question with a blank key/question; sanitises
 * its options (blank key/label dropped, trimmed to
 * {@link MAX_OPTIONS_PER_QUESTION}); drops the whole question if fewer than
 * {@link MIN_OPTIONS_PER_QUESTION} options survive; dedupes by question key
 * across the whole response; caps the surviving list at
 * {@link MAX_QUESTIONS_PER_TURN}. A non-array response degrades to `[]`
 * rather than throwing, matching the sanitizer style in
 * src/lib/quests/spine.ts.
 */
export function sanitizeDesignQuestions(raw: unknown): QuestDesignQuestion[] {
  if (!Array.isArray(raw)) return [];
  const seenKeys = new Set<string>();
  const questions: QuestDesignQuestion[] = [];
  for (const entry of raw) {
    if (questions.length >= MAX_QUESTIONS_PER_TURN) break;
    const candidate = entry as { key?: unknown; about?: unknown; question?: unknown; why?: unknown; options?: unknown } | null | undefined;
    const key = asTrimmedString(candidate?.key);
    const question = asTrimmedString(candidate?.question);
    if (!key || !question || seenKeys.has(key)) continue;
    const options = sanitizeOptions(candidate?.options);
    if (options.length < MIN_OPTIONS_PER_QUESTION) continue;
    seenKeys.add(key);
    const about = asTrimmedString(candidate?.about);
    questions.push({
      key,
      about: about || null,
      question,
      why: asTrimmedString(candidate?.why),
      options,
    });
  }
  return questions;
}

export interface QuestDesignDiff {
  beats: Record<string, "added" | "changed" | "unchanged">;
  removedBeatTitles: string[];
  objectivesAdded: string[];
  objectivesRemoved: string[];
}

function beatsOf(tree: QuestDesignTree): NonNullable<QuestDesignTree["beats"]> {
  return Array.isArray(tree.beats) ? tree.beats : [];
}

/**
 * Per-beat-key added/changed/unchanged, plus the titles of beats present in
 * `prev` but absent from `next`, and objectives added/removed between the two
 * (compared by description — the tree carries no other stable objective
 * identity). Empty diff for every field except `beats` additions when `prev`
 * is null (turn 1: everything in `next` is new).
 */
export function diffDesignTrees(prev: QuestDesignTree | null, next: QuestDesignTree): QuestDesignDiff {
  const nextBeats = beatsOf(next);

  // The first proposal has nothing to be compared against: badging every beat
  // "new" there is noise that drowns the badges that matter on turn two. So
  // no previous tree means no diff — every beat unchanged, nothing added.
  if (!prev) {
    const beats: Record<string, "added" | "changed" | "unchanged"> = {};
    for (const beat of nextBeats) {
      if (beat.key) beats[beat.key] = "unchanged";
    }
    return { beats, removedBeatTitles: [], objectivesAdded: [], objectivesRemoved: [] };
  }

  const prevBeats = beatsOf(prev);
  const prevByKey = new Map(prevBeats.map((b) => [b.key, b]));
  const nextKeys = new Set(nextBeats.map((b) => b.key));

  const beats: Record<string, "added" | "changed" | "unchanged"> = {};
  for (const beat of nextBeats) {
    if (!beat.key) continue;
    const prevBeat = prevByKey.get(beat.key);
    if (!prevBeat) {
      beats[beat.key] = "added";
    } else if (
      prevBeat.title !== beat.title ||
      prevBeat.dm_content !== beat.dm_content ||
      prevBeat.kind !== beat.kind
    ) {
      beats[beat.key] = "changed";
    } else {
      beats[beat.key] = "unchanged";
    }
  }

  const removedBeatTitles = prevBeats.filter((b) => !nextKeys.has(b.key)).map((b) => b.title);

  const prevDescriptions = new Set(prev.objectives.map((o) => o.description));
  const nextDescriptions = new Set(next.objectives.map((o) => o.description));
  const objectivesAdded = next.objectives.map((o) => o.description).filter((d) => !prevDescriptions.has(d));
  const objectivesRemoved = prev.objectives.map((o) => o.description).filter((d) => !nextDescriptions.has(d));

  return { beats, removedBeatTitles, objectivesAdded, objectivesRemoved };
}

/**
 * A selection is either a chosen option's key or free text — never both
 * meaningfully at once, since picking an option and also typing text is the
 * UI presenting one control at a time. Returns the option's *label* (not its
 * key) as the answer text, matching what the DM actually saw and chose, or
 * the trimmed free text; `null` when neither is present, meaning the question
 * was left unanswered. The answer text is capped at
 * {@link QUEST_DESIGN_ANSWER_LIMIT}, matching the server's own limit.
 */
export function toDesignAnswer(
  question: QuestDesignQuestion,
  selection: { optionKey: string | null; freeText: string },
): QuestDesignAnswer | null {
  const chosenOption = selection.optionKey
    ? question.options.find((o) => o.key === selection.optionKey)
    : undefined;
  const rawAnswer = chosenOption ? chosenOption.label : asTrimmedString(selection.freeText);
  if (!rawAnswer) return null;
  return {
    question_key: question.key,
    question: question.question,
    answer: rawAnswer.slice(0, QUEST_DESIGN_ANSWER_LIMIT),
  };
}
