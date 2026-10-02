/**
 * Registry key for an image's provenance (#935). One image is several stored
 * files: the original (.webp, .jpeg or .png) and its `_w<digits>.webp` size
 * variants. They share one stem, the object path with the final extension and
 * any variant suffix removed, so a lookup by any of their URLs finds the one
 * `image_provenance` row. Pure string work so Deno and the browser agree.
 *
 * Only `_w<digits>` directly before the extension counts as a variant suffix,
 * so `u/new_wizard.webp` keeps its `_wizard`. A path with no extension is
 * returned unchanged.
 */
export function imageProvenanceStem(objectPath: string): string {
  return objectPath.replace(/(_w\d+)?\.[A-Za-z0-9]+$/, "");
}
