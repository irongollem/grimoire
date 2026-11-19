/**
 * What the player sent before, to bring back with the up arrow (the maintainer, 17 Nov 2026: "button up gets to the
 * last 10 messages or so"). It works like a shell's: up goes back through what was sent, down comes forward, and
 * past the newest is whatever was being typed when the walk began. Pure: the composer holds the state.
 */
export const HISTORY_MAX = 10;

/** The history with one more sent line: newest last, at most `HISTORY_MAX`, and never the same line twice in a row. */
export function remembered(history: readonly string[], sent: string): string[] {
  const text = sent.trim();
  if (text === "" || history[history.length - 1] === text) return [...history];
  return [...history, text].slice(-HISTORY_MAX);
}

export interface HistoryWalk {
  /** Which sent line is in the box; null while the player's own draft is. */
  at: number | null;
  /** What was being typed when the walk began, to come back to. */
  draft: string;
}

/**
 * One step back (-1) or forward (+1). Answers the new walk and the text for the box, or null when there is nowhere
 * to go that way (nothing sent yet, already at the oldest, or forward from the draft).
 */
export function stepHistory(history: readonly string[], walk: HistoryWalk, typed: string, by: -1 | 1): { walk: HistoryWalk; text: string } | null {
  if (history.length === 0) return null;
  if (walk.at === null) {
    if (by === 1) return null;
    const at = history.length - 1;
    return { walk: { at, draft: typed }, text: history[at] };
  }
  const at = walk.at + by;
  if (at < 0) return null;
  if (at >= history.length) return { walk: { at: null, draft: "" }, text: walk.draft };
  return { walk: { at, draft: walk.draft }, text: history[at] };
}
