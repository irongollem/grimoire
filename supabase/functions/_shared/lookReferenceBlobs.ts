/**
 * The Look entry's style pictures as Blobs, for a generator to hand to `generateImage({ styleReferences })` (#1252).
 * The URLs come from a canon row a DM wrote, so each goes through the storage SSRF guard before it is fetched; a
 * picture that is unsafe, missing or slow to fail is skipped, never fatal (a painting without its references is
 * still a painting).
 */
import { isSafeStorageUrl } from "./storage-url.ts";
import { capStyleReferences } from "./styleReferences.ts";

export async function lookReferenceBlobs(urls: readonly string[]): Promise<Blob[]> {
  const safe = capStyleReferences(urls).filter((url) => {
    if (isSafeStorageUrl(url)) return true;
    console.warn("Rejected unsafe look reference URL, skipping");
    return false;
  });
  const settled = await Promise.allSettled(safe.map((url) => fetch(url).then((r) => (r.ok ? r.blob() : null))));
  const blobs: Blob[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) blobs.push(r.value);
  }
  return blobs;
}
