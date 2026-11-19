import type { BoardLine } from "./fight/boardLines";

/**
 * What happened on the board of a fight, kept so a reopened sitting still shows it.
 *
 * The board's lines (a creature's attack, "Round 2 · your turn") are written by the page and never sent to the
 * Dungeon Master, so the stored turns do not hold them: without these a fight read back as its narration alone.
 * They are kept with the conversation (`agent_board_lines`), each with how many turns of the sitting had been kept
 * when it was written, which is where `storyFromTurns` puts it back.
 */
export interface KeptLine {
  /** How many turns of the sitting had been kept when the line was written: it follows that many, in the story. */
  after: number;
  line: BoardLine;
  /** Whether the board (the rules) wrote it, not the player's own hand. */
  byServer: boolean;
}

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

/**
 * The stored rows as lines, in the order they came. `line` is jsonb, so it is untrusted until read: a row that is
 * not a whole line is left out, never drawn half.
 */
export function keptLinesOf(rows: readonly unknown[]): KeptLine[] {
  return rows.flatMap((row: unknown) => {
    if (!isRecord(row) || typeof row.after_turns !== "number" || !Number.isInteger(row.after_turns) || row.after_turns < 0) return [];
    const line = parseLine(row.line);
    return line === null ? [] : [{ after: row.after_turns, line, byServer: row.by_server === true }];
  });
}

/** The rows that keep these lines for a sitting. The owner is the database's to fill in (the caller). */
export function boardRows(sessionId: string, after: number, lines: readonly BoardLine[], byServer: boolean): Array<{ session_id: string; after_turns: number; line: BoardLine; by_server: boolean }> {
  return lines.map((line) => ({ session_id: sessionId, after_turns: after, line, by_server: byServer }));
}
