import { ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { toWebP } from "@/lib/mediaConvert";
import {
  BUCKETS,
  uploadToBucket,
  removeByPublicUrl,
  type BucketConfig,
} from "@/lib/storage";

/** Look up a BucketConfig by string id; defaults to assetImages on miss so
 *  legacy callers that pass `"asset-images"` keep working unchanged. */
function resolveBucket(bucketId: string): BucketConfig {
  for (const b of Object.values(BUCKETS)) {
    if (b.id === bucketId) return b;
  }
  return BUCKETS.assetImages;
}

/**
 * Remove one or more files from a storage bucket given their public URLs.
 * Silently no-ops on null/undefined/external URLs that don't match the bucket.
 * Ignores storage errors (e.g. file not found, permission denied for shared images).
 */
export async function removeStorageImages(bucket: string, ...urls: (string | null | undefined)[]): Promise<void> {
  await removeByPublicUrl(resolveBucket(bucket), ...urls);
}

export const ASSET_IMAGES_BUCKET = "asset-images";
const RTE_IMAGE_MARKER = `/object/public/${ASSET_IMAGES_BUCKET}/`;

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
      if (typeof src === "string" && src.includes(RTE_IMAGE_MARKER)) urls.push(src);
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
  const cfg = resolveBucket(bucket);

  async function upload(file: File): Promise<string | null> {
    if (!auth.user) return null;
    isUploading.value = true;
    try {
      const webpFile = await toWebP(file);
      return await uploadToBucket(cfg, auth.user.id, webpFile, {
        contentType: "image/webp",
      });
    } catch {
      return null;
    } finally {
      isUploading.value = false;
    }
  }

  /** Delete a file from the bucket given its public URL. Silently no-ops on bad URLs. */
  async function remove(publicUrl: string): Promise<void> {
    if (!publicUrl) return;
    await removeByPublicUrl(cfg, publicUrl);
  }

  return { isUploading, upload, remove };
}
