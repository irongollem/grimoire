/**
 * Whether a nook image that has just been replaced is this nook's own file and nothing still points at it, so it
 * may be deleted. A stock part (`srd/`), a place's own picture or another nook's file lies outside
 * `/nooks/{nookId}/` and is never ours to remove; a layer that still uses it (the picture swapped for a copy,
 * a cut-out added twice) keeps it.
 */
export function isOrphanedOwnNookFile(oldUrl: string | null | undefined, nookId: string, scene: unknown): oldUrl is string {
  if (!oldUrl || !nookId) return false;
  if (!oldUrl.includes(`/nooks/${nookId}/`)) return false;
  return !JSON.stringify(scene).includes(oldUrl);
}
