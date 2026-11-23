/**
 * The Look entry's style pictures as Blobs, for a generator to hand to `generateImage({ styleReferences })` (#1252).
 * The URLs come from a canon row a DM wrote, so each goes through the storage SSRF guard before it is fetched; a
 * picture that is unsafe, missing, not an image, too big or slow to fail is skipped, never fatal (a painting without
 * its references is still a painting).
 */
import { fetchGuardedImage } from "./fetchImage.ts";
import { isSafeStorageUrl } from "./storage-url.ts";
import { capStyleReferences } from "./styleReferences.ts";

export async function lookReferenceBlobs(urls: readonly string[]): Promise<Blob[]> {
  const safe = capStyleReferences(urls).filter((url) => {
    if (isSafeStorageUrl(url)) return true;
    console.warn("Rejected unsafe look reference URL, skipping");
    return false;
  });
  const settled = await Promise.allSettled(safe.map((url) => fetchGuardedImage(url)));
  const blobs: Blob[] = [];
  for (const r of settled) {
    if (r.status === "rejected") {
      console.warn("Look reference could not be fetched, skipping");
    } else if (r.value) {
      blobs.push(new Blob([r.value.bytes], { type: r.value.mimeType }));
    } else {
      console.warn("Look reference is not a usable picture, skipping");
    }
  }
  return blobs;
}
