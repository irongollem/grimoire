/**
 * Tag normalisation, shared by every UI that lets a DM type a tag (TagInput)
 * and every AI post-processor that proposes one (the Chronicler's tag
 * suggestions). Extracted verbatim from TagInput.vue's private normalizeTag
 * so both sides of the reconciliation in chronicleTags.ts compare tags the
 * same way a human typing into the tag bar would.
 */

/** Normalize a tag: lowercase, spaces/underscores → hyphens, strip anything that isn't a-z 0-9 or hyphen. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")       // spaces and underscores → hyphen
    .replace(/[^a-z0-9-]/g, "")   // strip everything else
    .replace(/-{2,}/g, "-")        // collapse double-hyphens
    .replace(/^-+|-+$/g, "");      // trim leading/trailing hyphens
}
