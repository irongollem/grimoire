/**
 * Resolve a build-relative art path to its CDN URL, once one exists (#864).
 *
 * `public/assets/**` and `src/assets/sheets/**` art is bundled and deployed
 * with every build today; #864 moves those bytes to R2 behind the same
 * `cdn.dungeongrimoire.com` Worker that already fronts Supabase Storage
 * (`ASSET_CDN_BASE`, `src/lib/storage/buckets.ts`), so a repeat viewer's
 * *second* deploy of the app reuses a cached object instead of
 * re-downloading it inside the JS/asset bundle.
 *
 * `src/generated/artManifest.json` (written by `scripts/art-manifest.ts`,
 * `npm run art:manifest`) maps a build-relative path to the content-hashed
 * key the bytes actually live under in R2, e.g.:
 *
 *   { "/assets/placeholders/npc.webp": "app-art/assets/placeholders/npc.a1b2c3d4.webp" }
 *
 * The manifest is imported directly rather than fetched: it is small (a few
 * hundred short strings) and every caller needs it synchronously on first
 * render, so inlining it into the JS bundle costs less than a network round
 * trip ever would.
 */
import { ASSET_CDN_BASE } from "@/lib/storage/buckets";
import artManifestJson from "@/generated/artManifest.json";
import { ART_PREFIX } from "./artPrefix";

/**
 * Re-exported for app code. `scripts/art-manifest.ts` and
 * `scripts/art-publish.ts` import it from `./artPrefix` directly instead —
 * see that file's docstring for why importing it through here would crash
 * under Node.
 */
export { ART_PREFIX };

const MANIFEST: Record<string, string> = artManifestJson;

/**
 * Canonical manifest-key form is leading-slash, matching how these paths are
 * already written at every call site (`/assets/cardforge/...`,
 * `/assets/scriptorium/watercolor/...`). Normalising here means a caller that
 * passes either `assets/x.webp` or `/assets/x.webp` resolves to the same
 * manifest entry.
 */
function manifestKey(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Resolve a build-relative art path to wherever it is actually served from.
 *
 * Returns `path` unchanged — the exact value passed in, not a normalised
 * form of it — when the CDN base is unset or the path has no manifest entry.
 * That is what lets every caller of this function ship and deploy before a
 * single byte exists in R2: with `ASSET_CDN_BASE` null (no env var) or the
 * manifest not yet knowing a path, nothing here can produce a CDN URL, so
 * behaviour is identical to before this module existed. Never invents a CDN
 * URL for a path the manifest does not list.
 */
export function artUrl(path: string): string {
  if (!ASSET_CDN_BASE) return path;
  const key = MANIFEST[manifestKey(path)];
  if (!key) return path;
  return `${ASSET_CDN_BASE}/${key}`;
}
