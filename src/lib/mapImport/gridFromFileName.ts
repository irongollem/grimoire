/**
 * Map creators put the grid in the file name: `riverside-ambush_30x20.webm`,
 * `Forest Glade [22x30].jpg`, `map(30X20).webp`, `foo_100ppi.png`. These read
 * it back so "Bring a map" can pre-fill the grid (#1125, canvas frame 06).
 */

const MAX_CELLS = 200;
const MIN_PPI = 20;
const MAX_PPI = 500;

/** Not preceded or followed by a digit, so "v12x3" style noise still counts but "130x20" is not read as "30x20". */
const SIZE = /(?<!\d)(\d{1,5})\s*[x×]\s*(\d{1,5})(?!\d)/gi;
const PER_CELL = /(?<!\d)(\d{2,4})\s*(?:ppi|dpi|px)(?![a-z])/gi;

export function gridFromFileName(name: string): { cols: number; rows: number } | null {
  const sizes = new Map<string, { cols: number; rows: number }>();
  for (const m of name.matchAll(SIZE)) {
    const cols = Number(m[1]);
    const rows = Number(m[2]);
    // 1920x1080 is a resolution, and 0 or 400 cells is not a map anyone drew.
    if (cols < 1 || rows < 1 || cols > MAX_CELLS || rows > MAX_CELLS) continue;
    sizes.set(`${cols}x${rows}`, { cols, rows });
  }
  // Two different sizes in one name: we cannot tell which is the grid.
  if (sizes.size !== 1) return null;
  return [...sizes.values()][0];
}

export function pixelsPerCellFromFileName(name: string): number | null {
  const found = new Set<number>();
  for (const m of name.matchAll(PER_CELL)) {
    const n = Number(m[1]);
    if (n >= MIN_PPI && n <= MAX_PPI) found.add(n);
  }
  if (found.size !== 1) return null;
  return [...found][0];
}
