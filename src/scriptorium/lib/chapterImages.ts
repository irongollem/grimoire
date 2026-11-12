/*
 * Which stored pictures a chapter's text may delete (#1176 story 9c).
 *
 * A book's pictures can be any picture of ours (a place's art, a portrait, one
 * of the author's own pictures), and editing one only reads its original. So
 * the Scriptorium does not use the shared rich-text cleanup, which deletes
 * every asset-images picture a field drops: a chapter deletes only what the
 * Illuminator made for it (ownedPictures.ts), and only once nothing in the
 * chapter still refers to it.
 */
import { heldUrls, madeUrls } from "@/scriptorium/illuminator/lib/ownedPictures";

/** The image nodes of a serialised chapter: their attrs. Safe with null or invalid JSON. */
function imagesIn(json: string | null | undefined): Record<string, unknown>[] {
  if (!json) return [];
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return [];
  }
  const found: Record<string, unknown>[] = [];
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const n = node as { type?: unknown; attrs?: unknown; content?: unknown };
    if (n.type === "image" && typeof n.attrs === "object" && n.attrs !== null) found.push(n.attrs as Record<string, unknown>);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return found;
}

/** Every stored picture the chapter refers to, originals included. */
export function heldChapterUrls(json: string | null | undefined): Set<string> {
  return new Set(imagesIn(json).flatMap((attrs) => heldUrls(attrs)));
}

/** What deleting the whole chapter may delete: the files the Illuminator made for its pictures. */
export function chapterUrlsToDelete(json: string | null | undefined, userId: string | null | undefined): string[] {
  return [...new Set(imagesIn(json).flatMap((attrs) => madeUrls(attrs, userId)))];
}

/** What an edit from `before` to `after` may delete: what the Illuminator made that `after` no longer refers to. */
export function chapterUrlsRemoved(
  before: string | null | undefined,
  after: string | null | undefined,
  userId: string | null | undefined,
): string[] {
  const stillHeld = heldChapterUrls(after);
  return chapterUrlsToDelete(before, userId).filter((url) => !stillHeld.has(url));
}
