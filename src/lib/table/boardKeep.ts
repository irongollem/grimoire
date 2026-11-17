import type { BoardLine } from "./fight/boardLines";

/**
 * What happened on the board of a fight, kept so a reopened sitting still shows it.
 *
 * The board's lines (a creature's attack, "Round 2 · your turn") are written by the page and never sent to the
 * Dungeon Master, so the stored conversation does not hold them: after a reload a fight read as its narration alone.
 * They are kept in this browser, per sitting, each with how many turns of the sitting had been kept when it was
 * written, which is where `storyFromTurns` puts it back. A per-viewer convenience: on another device, or with
 * storage blocked, the fight reads as before.
 */
export interface KeptLine {
  /** How many turns of the sitting had been kept when the line was written: it follows that many, in the story. */
  after: number;
  line: BoardLine;
  /** Whether the board (the rules) wrote it, not the player's own hand. */
  byServer: boolean;
}

export type KeptBoards = Record<string, KeptLine[]>;

/** A sitting keeps its latest lines only: a fight is tens of lines, and the browser's storage is small. */
export const LINES_KEPT = 400;
/** Lines are kept for the sittings last played; an older sitting reads as its narration. */
export const SITTINGS_KEPT = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLine(raw: unknown): BoardLine | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "margin" && typeof raw.text === "string") {
    return { kind: "margin", text: raw.text, ...(raw.tone === "harm" || raw.tone === "end" ? { tone: raw.tone } : {}) };
  }
  if (raw.kind === "roll" && typeof raw.die === "number" && typeof raw.label === "string" && typeof raw.detail === "string" && typeof raw.critical === "boolean") {
    return { kind: "roll", die: raw.die, label: raw.label, detail: raw.detail, critical: raw.critical };
  }
  return null;
}

/** The lines kept for one sitting. What the browser stored is untrusted: anything that is not a line is left out. */
export function keptLinesOf(boards: unknown, sessionId: string): KeptLine[] {
  if (!isRecord(boards)) return [];
  const raw = boards[sessionId];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.after !== "number" || !Number.isInteger(entry.after) || entry.after < 0) return [];
    const line = parseLine(entry.line);
    return line === null ? [] : [{ after: entry.after, line, byServer: entry.byServer === true }];
  });
}

/** The boards with these lines added to a sitting, which becomes the one last played. */
export function withKeptLines(boards: KeptBoards, sessionId: string, lines: readonly KeptLine[]): KeptBoards {
  const { [sessionId]: had, ...others } = boards;
  const mine = [...(had === undefined ? [] : had), ...lines].slice(-LINES_KEPT);
  const kept = Object.entries(others).slice(-(SITTINGS_KEPT - 1));
  return { ...Object.fromEntries(kept), [sessionId]: mine };
}
