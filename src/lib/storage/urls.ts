/**
 * Public URL construction and parsing for stored objects.
 *
 * Two shapes exist, and both are permanently supported:
 *
 *   origin: `https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>`
 *   CDN:    `https://cdn.example.com/<bucket>/<path>`
 *
 * The CDN shape drops Supabase's routing prefix deliberately. `<bucket>/<path>`
 * is exactly the R2 object key (#577), so moving a bucket's bytes to R2 is an
 * origin swap at the Worker with no stored-URL rewrite.
 */

import { supabase } from "@/lib/supabase";
import { assetCdnUrl } from "@edge-shared/cdn-buckets.ts";
import { BUCKETS, BUCKET_ENTRIES, ASSET_CDN_BASE, type BucketKey } from "./buckets";

/** Get a public URL for an existing object (no fetch — pure URL builder). */
export function getPublicUrl(bucket: BucketKey, path: string): string {
  const cfg = BUCKETS[bucket];
  return (
    assetCdnUrl(cfg.id, path, ASSET_CDN_BASE) ??
    supabase.storage.from(cfg.id).getPublicUrl(path).data.publicUrl
  );
}

export interface ParsedPublicUrl {
  readonly bucket: BucketKey;
  readonly path: string;
}

/** Path portion of a URL, with any query string and fragment removed. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // Not absolute — still strip `?v=…` cache-busters by hand so a relative or
    // malformed value degrades to a best-effort parse rather than to garbage.
    return url.split(/[?#]/)[0];
  }
}

/**
 * True when `url` points at an object in `bucket`, in either URL shape.
 *
 * Prefer this over `url.startsWith(<some base>)` or `url.includes("/object/public/…")`:
 * those match only the origin shape, so they quietly turn into "always false"
 * the day the bucket moves to the CDN — taking whatever they gate (a cleanup
 * sweep, an edit affordance, a validity check) with them.
 */
export function isBucketUrl(bucket: BucketKey, url: string | null | undefined): url is string {
  return !!url && parsePublicUrl(url)?.bucket === bucket;
}

/**
 * Resolve a stored public URL back to its bucket + storage path, accepting
 * **either** URL shape regardless of how this client is configured.
 *
 * Host-agnostic on purpose. Rows written before the CDN existed, rows written
 * by Edge Functions, and rows written after a stage-2 origin swap all coexist
 * indefinitely; a parser keyed on the current hostname would stop matching the
 * others and deletes would start silently no-oping — the failure mode #577
 * calls out for `removeByPublicUrl`.
 *
 * Returns null when the URL belongs to no registered bucket (external images
 * pasted into rich text, `downtime-images`).
 */
export function parsePublicUrl(url: string): ParsedPublicUrl | null {
  const pathname = pathnameOf(url);

  // Origin shape — the bucket id follows Supabase's routing prefix.
  for (const [key, cfg] of BUCKET_ENTRIES) {
    const marker = `/object/public/${cfg.id}/`;
    const at = pathname.indexOf(marker);
    if (at !== -1) {
      return { bucket: key, path: decodeURIComponent(pathname.slice(at + marker.length)) };
    }
  }

  // CDN shape — the bucket id is the first path segment.
  const rest = pathname.replace(/^\/+/, "");
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const bucketId = rest.slice(0, slash);
  const entry = BUCKET_ENTRIES.find(([, cfg]) => cfg.id === bucketId);
  if (!entry) return null;
  return { bucket: entry[0], path: decodeURIComponent(rest.slice(slash + 1)) };
}
