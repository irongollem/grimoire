/**
 * A level-to-value table as the editor edits it: ordered rows of text. The
 * level is a row's identity only while the row is valid, so the editor keeps its
 * own rows (a half-typed level must not rename or drop a row under the cursor)
 * and turns them into the stored record on every change.
 */
export interface LevelRow {
  level: string;
  value: string;
}

export function rowsFromRecord(record: Readonly<Record<string, string>>): LevelRow[] {
  return Object.entries(record)
    .map(([level, value]) => ({ level, value }))
    .sort((a, b) => Number(a.level) - Number(b.level));
}

/** Rows with a level from 1 to 20 and a value become entries; the first row at a level wins. */
export function recordFromRows(rows: readonly LevelRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const level = Number(row.level);
    if (row.level.trim() === "" || !Number.isInteger(level) || level < 1 || level > 20) continue;
    const value = row.value.trim();
    if (value === "") continue;
    const key = String(level);
    if (!(key in out)) out[key] = value;
  }
  return out;
}

export function stringsFromNumbers(record: Readonly<Record<string, number>>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([level, value]) => [level, String(value)]));
}

/** Entries that are not whole numbers are dropped, which the parser then reports as a missing table. */
export function numbersFromStrings(record: Readonly<Record<string, string>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [level, value] of Object.entries(record)) {
    const n = Number(value);
    if (Number.isInteger(n)) out[level] = n;
  }
  return out;
}

/** The next level worth offering: one past the highest row, capped at 20. */
export function nextLevel(rows: readonly LevelRow[]): string {
  const highest = rows.reduce((max, r) => {
    const n = Number(r.level);
    return Number.isInteger(n) ? Math.max(max, n) : max;
  }, 0);
  return String(Math.min(20, highest + 1));
}
