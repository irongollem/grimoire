/**
 * "Must not be persisted" check for query data.
 *
 * An object URL (`blob:`) is only valid for the page load that minted it. A
 * query that cached one and is restored after a restart would hand the UI a
 * dead URL, and because many of our queries use `staleTime: Infinity` nothing
 * would ever fetch a replacement. Blobs, files, buffers and functions are the
 * same kind of thing: they are either not meaningful once the page is gone or
 * they cannot be structured-cloned at all. Such data is simply never written.
 *
 * Written for a 3,500-row array of flat objects, which is the biggest thing we
 * cache: an explicit stack-free recursion over `Object.keys` indexes, no
 * per-node allocation beyond the key array of each object, and a depth bound so
 * a pathological or cyclic structure cannot run away.
 */

/** Past this depth we stop looking. Real query payloads are 3-5 levels deep. */
const MAX_DEPTH = 12;

function isEphemeralValue(value: unknown): boolean {
  switch (typeof value) {
    case "string":
      return value.startsWith("blob:");
    case "function":
      return true;
    case "object":
      if (value === null) return false;
      return (
        (typeof Blob !== "undefined" && value instanceof Blob) || // File extends Blob
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
      );
    default:
      return false;
  }
}

function walk(value: unknown, depth: number): boolean {
  if (isEphemeralValue(value)) return true;
  if (typeof value !== "object" || value === null || depth >= MAX_DEPTH) return false;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (walk(value[i], depth + 1)) return true;
    }
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  for (let i = 0; i < keys.length; i++) {
    if (walk(record[keys[i]!], depth + 1)) return true;
  }
  return false;
}

/** True when `data` holds anything that would be dead or unclonable after a restart. */
export function containsEphemeral(data: unknown): boolean {
  return walk(data, 0);
}
