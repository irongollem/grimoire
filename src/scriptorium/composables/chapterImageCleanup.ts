/*
 * Deletes what a chapter's pictures no longer need, by the Scriptorium's own
 * rule (lib/chapterImages.ts): only what the Illuminator made, never an
 * original. Fire-and-forget, like the shared rich-text cleanup it replaces here.
 */
import { ASSET_IMAGES_BUCKET, removeStorageImages } from "@/composables/useImageUpload";
import { getCurrentUser } from "@/lib/supabase";
import { chapterUrlsRemoved, chapterUrlsToDelete } from "@/scriptorium/lib/chapterImages";

/** A chapter (or a whole book's chapters) is being deleted. */
export function removeChapterImages(json: string | null | undefined): void {
  const urls = chapterUrlsToDelete(json, getCurrentUser()?.id);
  if (urls.length > 0) void removeStorageImages(ASSET_IMAGES_BUCKET, ...urls);
}

/** A chapter was saved: delete what the edit dropped. */
export function cleanupRemovedChapterImages(before: string | null | undefined, after: string | null | undefined): void {
  const urls = chapterUrlsRemoved(before, after, getCurrentUser()?.id);
  if (urls.length > 0) void removeStorageImages(ASSET_IMAGES_BUCKET, ...urls);
}
