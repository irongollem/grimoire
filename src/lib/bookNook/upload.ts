import { toWebP } from "@/lib/mediaConvert";
import { uploadToBucket, removeByPublicUrl } from "@/lib/storage";

/**
 * Stores a nook image (a cut-out, a backdrop or the still) as WebP under the owner's prefix:
 * `location-images/{userId}/nooks/{nookId}/{uuid}.webp`. Never under `srd/`: this is user content.
 * Returns the public URL.
 */
export async function uploadNookImage(blob: Blob, nookId: string, userId: string): Promise<string> {
  const webp = await toWebP(new File([blob], "nook.png", { type: blob.type }), 4096);
  // toWebP hands the original back when it cannot decode or encode; storing that as WebP would be a lie.
  if (webp.type !== "image/webp") throw new Error("the nook image could not be converted to WebP");
  const url = await uploadToBucket({
    bucket: "locationImages",
    blob: webp,
    path: `${userId}/nooks/${nookId}/${crypto.randomUUID()}.webp`,
    contentType: "image/webp",
  });
  if (!url) throw new Error("the nook image could not be stored");
  return url;
}

export async function removeNookImages(urls: string[]): Promise<void> {
  await removeByPublicUrl("locationImages", ...urls);
}
