import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { toWebP } from "@/lib/mediaConvert";
import {
  BUCKETS,
  uploadToBucket,
  uploadWithVariants,
  removeByPublicUrl,
  isBucketUrl,
  type BucketKey,
} from "@/lib/storage";

/** Map a bucket ID string (e.g. "asset-images") to its BucketKey ("assetImages").
 *  Falls back to "assetImages" for unknown ids so legacy callers keep working. */
function resolveBucketKey(bucketId: string): BucketKey {
  for (const [key, cfg] of Object.entries(BUCKETS)) {
    if (cfg.id === bucketId) return key as BucketKey;
  }
  return "assetImages";
}

/**
 * Remove one or more files from a storage bucket given their public URLs.
 * Silently no-ops on null/undefined/external URLs that don't match the bucket.
 * Ignores storage errors (e.g. file not found, permission denied for shared images).
 */
export async function removeStorageImages(bucket: string, ...urls: (string | null | undefined)[]): Promise<void> {
  await removeByPublicUrl(resolveBucketKey(bucket), ...urls);
}

export const ASSET_IMAGES_BUCKET = "asset-images";

/**
 * Walk a serialised Tiptap JSON string and return all asset-images URLs
 * that are embedded as image nodes. Safe to call with null/invalid JSON.
 */
export function extractRichTextImageUrls(json: string | null | undefined): string[] {
  if (!json) return [];
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(json) as Record<string, unknown>; } catch { return []; }
  const urls: string[] = [];
  function walk(node: Record<string, unknown>) {
    if (node.type === "image" && node.attrs) {
      const src = (node.attrs as Record<string, unknown>).src;
      // Registry-based rather than a URL-prefix match, so embeds keep being
      // collected once asset-images is served from the CDN (#577) — otherwise
      // this returns [] and rich-text image cleanup silently stops deleting.
      if (typeof src === "string" && isBucketUrl("assetImages", src)) urls.push(src);
    }
    if (Array.isArray(node.content)) {
      (node.content as Record<string, unknown>[]).forEach(walk);
    }
  }
  walk(doc);
  return urls;
}

/** Fire-and-forget: delete all storage images embedded in a rich-text JSON blob. */
export function removeRichTextImages(json: string | null | undefined): void {
  void removeStorageImages(ASSET_IMAGES_BUCKET, ...extractRichTextImageUrls(json));
}

/** Fire-and-forget: delete storage images that were removed between two versions of a rich-text blob. */
export function cleanupRemovedRichTextImages(
  oldJson: string | null | undefined,
  newJson: string | null | undefined,
): void {
  const oldUrls = new Set(extractRichTextImageUrls(oldJson));
  const newUrls = new Set(extractRichTextImageUrls(newJson));
  const removed = [...oldUrls].filter((u) => !newUrls.has(u));
  void removeStorageImages(ASSET_IMAGES_BUCKET, ...removed);
}

/**
 * Reusable image upload composable.
 *
 * Usage:
 *   const { isUploading, upload } = useImageUpload('asset-images')
 *   const url = await upload(file)   // returns public URL or null on error
 *
 * The file is stored at: {bucket}/{user_id}/{uuid}.webp
 * All images are converted to WebP before upload (max 1920px, 85% quality).
 */
export function useImageUpload(bucket: string) {
  const auth = useAuthStore();
  const isUploading = ref(false);
  const uploadError = ref<string | null>(null);
  const key = resolveBucketKey(bucket);

  async function upload(file: File): Promise<string | null> {
    if (!auth.user) {
      uploadError.value = "Not signed in";
      return null;
    }
    isUploading.value = true;
    uploadError.value = null;
    try {
      const webpFile = await toWebP(file);
      const cfg = BUCKETS[key];
      const url = cfg.generateVariants
        ? await uploadWithVariants({ bucket: key, userId: auth.user.id, blob: webpFile })
        : await uploadToBucket({ bucket: key, userId: auth.user.id, blob: webpFile, contentType: webpFile.type });
      if (!url) uploadError.value = "Upload failed";
      return url;
    } catch (e) {
      uploadError.value = e instanceof Error ? e.message : "Upload failed";
      return null;
    } finally {
      isUploading.value = false;
    }
  }

  /** Delete a file from the bucket given its public URL. Silently no-ops on bad URLs. */
  async function remove(publicUrl: string): Promise<void> {
    if (!publicUrl) return;
    await removeByPublicUrl(key, publicUrl);
  }

  return { isUploading, uploadError, upload, remove };
}
