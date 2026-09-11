/**
 * Resolve a character-sheet plate's URL, routed through artUrl (#864/#877) so
 * plates can move to R2 behind the CDN.
 *
 * Extracted out of IllustratedSheet.vue's <script setup> so the fallback
 * logic below is unit-testable without mounting the whole sheet (which needs
 * a full PartyMember/inventory fixture) — mirrors how sheetPlates.test.ts
 * already tests the same glob directly instead of mounting the component.
 *
 * Keyed on the *source* path rather than the glob's already-hashed build URL:
 * the manifest (scripts/art-manifest.ts) hashes `src/assets/sheets/**` under
 * the `/assets/sheets/...` key, not the `/src/assets/sheets/...` glob key.
 *
 * artUrl's usual "return the input unchanged when unmapped" fallback does not
 * fit this call site: the manifest key (`/assets/sheets/...`) is not itself a
 * servable URL — only Vite's content-hashed glob URL is. So the CDN URL is
 * used only when artUrl actually resolves a manifest entry; otherwise this
 * falls back to the glob's own hashed URL, exactly as before artUrl existed.
 */
import type { SheetPageSize } from "./sheetTypes";
import { artUrl } from "@/lib/assets/artUrl";

/** The import.meta.glob key a plate lives under: `/src/assets/sheets/<size>/<plate>`. */
export function plateGlobKey(pageSize: SheetPageSize, plate: string): string {
  return `/src/assets/sheets/${pageSize.toLowerCase()}/${plate}`;
}

export function resolvePlateUrl(
  pageSize: SheetPageSize,
  plate: string,
  plateModules: Record<string, string>,
): string | undefined {
  const globKey = plateGlobKey(pageSize, plate);
  const viteUrl = plateModules[globKey];
  const manifestKey = globKey.replace(/^\/src/, "");
  const resolved = artUrl(manifestKey);
  return resolved !== manifestKey ? resolved : viteUrl;
}
