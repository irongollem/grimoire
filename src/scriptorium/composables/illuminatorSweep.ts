/*
 * One deferred, reference-checked removal of the files the Illuminator made
 * (bakes, painted masks, textures, AI results).
 *
 * A save, a layer move, a cut and paste or an undo can each stop one place from
 * using a file while another still does, and each place only sees its own
 * home. So nothing deletes at the moment of the edit: a path only marks a file
 * as a candidate, and the sweep runs when the editor closes (or a chapter or
 * book is deleted). The server then says which candidates any chapter or
 * page furniture still refers to; only the rest leave storage.
 */
import { ASSET_IMAGES_BUCKET, removeStorageImages } from "@/composables/useImageUpload";
import { reportHandledError } from "@/lib/observability/sentry";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { isMadeByIlluminator } from "@/scriptorium/illuminator/lib/ownedPictures";

const pending = new Set<string>();

/** Candidates for removal. Only the author's own Illuminator files are kept; an original is never a candidate. */
export function markForSweep(...urls: (string | null | undefined)[]): void {
  const userId = getCurrentUser()?.id;
  for (const url of urls) if (isMadeByIlluminator(url, userId)) pending.add(url);
}

/** Remove every marked file nothing refers to any more. Throws when the check or the removal fails. */
export async function sweepIlluminatorFiles(): Promise<void> {
  if (pending.size === 0) return;
  const snapshot = [...pending];
  const { data, error } = await supabase.rpc("scriptorium_pictures_in_use", { p_urls: snapshot });
  if (error) throw error;
  if (!data) throw new Error("scriptorium_pictures_in_use answered nothing");
  const inUse = new Set<string>(data);
  const unused = snapshot.filter((url) => !inUse.has(url));
  if (unused.length > 0) await removeStorageImages(ASSET_IMAGES_BUCKET, ...unused);
  for (const url of snapshot) pending.delete(url);
}

/** The sweep for callers that cannot wait on it: a failure is reported, and the files stay marked for the next one. */
export function sweepInBackground(): void {
  sweepIlluminatorFiles().catch((error: unknown) => reportHandledError(error, "scriptorium:sweep"));
}

/** Test seam: forget what is marked. */
export function clearSweepMarks(): void {
  pending.clear();
}
