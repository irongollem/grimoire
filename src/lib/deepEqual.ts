/**
 * Structural equality for JSON-shaped values, key order ignored. Its own
 * module (and not in `utils`) because the fight rules use it and run on the
 * server, where `utils`' browser-side imports do not load.
 *
 * Used to detect whether a save actually changed AI-generated content, so
 * `markEdited` (src/ai/provenance.ts) only fires on a real edit rather than a
 * no-op save, and to compare a jsonb column read back with its keys reordered.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.hasOwn(bRec, k) && deepEqual(aRec[k], bRec[k]));
}
