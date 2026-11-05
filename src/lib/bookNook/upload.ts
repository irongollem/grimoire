import { toWebP } from "@/lib/mediaConvert";
import { layersOf, type Scene } from "@/lib/bookNook/scene";
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

/**
 * The stored files that belong to one nook: every image URL its scene names (layers, frame shapes) and its still,
 * kept only when the URL's path runs through `/{userId}/nooks/{nookId}/`. A stock part (`srd/…`), another nook's
 * file and a place's own picture lie elsewhere, so deleting a nook can never reach them.
 */
export function nookFiles(scene: Scene, stillUrl: string | null, nookId: string): string[] {
  const candidates = [
    ...layersOf(scene).map((l) => l.src),
    scene.frame?.tall,
    scene.frame?.wide,
    stillUrl,
  ].filter((u): u is string => !!u);
  const own = (url: string) => {
    let path: string;
    try {
      path = new URL(url).pathname;
    } catch {
      path = url.split(/[?#]/)[0];
    }
    const parts = path.split("/").filter(Boolean);
    const at = parts.indexOf("nooks");
    return at > 0 && parts[at + 1] === nookId && parts[at - 1] !== "srd" && parts[at - 1] !== "nooks";
  };
  return [...new Set(candidates.filter(own))];
}
