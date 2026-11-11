/*
 * Store a bake. Every bake goes to a NEW key: R2 objects are immutable and
 * cached for good, so overwriting would leave readers on the old bytes, and a
 * late delete of a superseded bake must never be able to hit its replacement.
 * `{userId}/ill-{hash}-{random}.webp` in asset-images.
 */
import { BUCKETS, uploadToBucket } from "@/lib/storage";
import { bakePicture } from "./bake";
import { hashSettings, type IlluminateSettings } from "./treatment";

export function bakeKey(userId: string, hash: string, random: string = crypto.randomUUID().slice(0, 8)): string {
  return `${userId}/ill-${hash}-${random}.webp`;
}

/** Upload a baked blob and return its public URL. */
export async function uploadBake(blob: Blob, userId: string, hash: string): Promise<string> {
  const url = await uploadToBucket({ bucket: "assetImages", blob, path: bakeKey(userId, hash), contentType: "image/webp" });
  if (!url) throw new Error("Could not store the treated picture.");
  return url;
}

export interface BakeResult { url: string; hash: string }

/** Bake the original with the recipe and store it. */
export async function bakeAndUpload(originalUrl: string, settings: IlluminateSettings, userId: string): Promise<BakeResult> {
  const hash = hashSettings(settings);
  const blob = await bakePicture(originalUrl, settings, BUCKETS.assetImages.maxBytes);
  return { url: await uploadBake(blob, userId, hash), hash };
}
