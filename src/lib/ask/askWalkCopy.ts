/**
 * The words and places "Design it with me" shows inside the Familiar (#1282): what a stop is called, where it sits in
 * the walk, where its chapter is, and what the composer says while the walk is waiting on the DM.
 */
import { sameStop, stepOf, type WalkState, type WalkStop, type WalkStopRef } from "@/lib/canon/canonWalk";

/** What the walk shows the pane: whether it is running, every stop with its state, and what it waits on. */
export interface AskWalkView {
  active: boolean;
  progress: readonly (WalkStop & { current: boolean })[];
  pitchWritten: boolean;
  /** The stop whose question is waiting for words. */
  awaiting: WalkStopRef | null;
  /** A block holds a draft: typed words change it. */
  drafted: boolean;
  /** What the walk's drafts have cost so far, shown in the progress line. */
  spent: number;
}

/** What a stop is called: its section, or the character's notes. */
export function stopTitle(stop: WalkStopRef): string {
  const step = stepOf(stop.step);
  return stop.memberName === null ? step.title : `Notes on ${stop.memberName}`;
}

/** "Voice · 4 of 15": the stop's name and where it sits in the walk. */
export function stopEyebrow(stop: WalkStopRef, progress: readonly WalkStopRef[]): string {
  const at = progress.findIndex((s) => sameStop(s, stop));
  return at === -1 ? stopTitle(stop) : `${stopTitle(stop)} · ${at + 1} of ${progress.length}`;
}

/** Where the stop's words live in the canon. */
export function stopChapterPath(stop: WalkStopRef): string {
  return stop.memberId === null ? `/canon/${stepOf(stop.step).chapter}` : `/canon/backstories?backstory=${stop.memberId}`;
}

const STATE_WORD: Record<WalkState, string> = { filled: "Filled", skipped: "Skipped", todo: "To do" };
export const stateWord = (state: WalkState): string => STATE_WORD[state];

/** What the composer says: the awaited step's example, or how to change a draft; null leaves its usual line. */
export function composerPlaceholder(walk: Pick<AskWalkView, "awaiting" | "drafted">): string | null {
  if (walk.awaiting !== null) return `e.g. ${stepOf(walk.awaiting.step).placeholder}`;
  if (walk.drafted) return "Type what to change, or keep what you like";
  return null;
}
