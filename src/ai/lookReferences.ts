/**
 * The campaign look's style pictures for a local-key (browser) render (#1252). The server path does the same through
 * `_shared/lookReferenceBlobs.ts`; here the browser fetches the public storage URLs itself, so no SSRF guard is
 * needed, and a picture that fails to load is skipped rather than failing the render.
 */
import { capStyleReferences } from "@edge-shared/styleReferences.ts";

export async function fetchLookReferences(urls: readonly string[]): Promise<Blob[]> {
  const settled = await Promise.all(capStyleReferences(urls).map(async (url) => {
    try {
      const response = await fetch(url);
      return response.ok ? await response.blob() : null;
    } catch {
      return null;
    }
  }));
  return settled.filter((blob): blob is Blob => blob !== null);
}
