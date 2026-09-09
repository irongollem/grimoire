// A stable identity for a set of cells (#868).
//
// The publish reconciles a derived space against the Atlas by this string:
// same signature, same room, nothing to do. It is deliberately NOT a
// cryptographic hash — a 64-bit FNV-1a over the sorted keys is stable across
// runs, independent of the order cells were painted in, cheap enough to run
// on every keystroke in the editor's status bar, and collision-resistant
// enough for the few dozen regions one site holds. What matters is that two
// derivations of the same cells agree, and that one moved cell disagrees.
//
// Written in its own module so both halves of the publish
// (`cartographer/structure.ts` producing, `lib/locations/publish.ts`
// consuming) share one definition rather than each restating it.

import type { CellKey } from "@/types/dungeonMap.types";

/** Sort a cell set numerically (by y, then x) and drop duplicates, so the
 *  signature — and every `cells` array the publish writes — is canonical. */
export function canonicalCells(cells: Iterable<CellKey>): CellKey[] {
  const seen = new Set<CellKey>(cells);
  return [...seen].sort((a, b) => {
    const [ax, ay] = a.split(",").map(Number);
    const [bx, by] = b.split(",").map(Number);
    return ay - by || ax - bx;
  });
}

export function cellSignature(cells: Iterable<CellKey>): string {
  const canonical = canonicalCells(cells);
  // FNV-1a, 64-bit, on the joined canonical keys.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const text = canonical.join(";");
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return `${canonical.length}:${hash.toString(16).padStart(16, "0")}`;
}
