/*
 * Store a bake. Every bake goes to a NEW key: R2 objects are immutable and
 * cached for good, so overwriting would leave readers on the old bytes, and a
 * late delete of a superseded bake must never be able to hit its replacement.
 * `{userId}/ill-{hash}-{random}.webp` in asset-images.
 */
import { BUCKETS, imageProvenanceKey, loadImageProvenance, uploadToBucket } from "@/lib/storage";
import { embedXmpInWebp } from "@edge-shared/provenance/embed.ts";
import { buildXmpPacket } from "@edge-shared/provenance/xmp.ts";
import { bakePicture } from "./bake";
import { aiStepOf, hashSettings, type IlluminateSettings } from "./treatment";

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

/**
 * A bake is a canvas re-encode, which drops the XMP mark the AI picture carried. Put the same mark back (edited:
 * true, since the recipe changed it after) so the player's copy is labelled AI-made too, and so the upload
 * registers the bake in the provenance registry. The chip never prints; this is the label of record.
 */
export async function markAiBake(blob: Blob, settings: IlluminateSettings): Promise<Blob> {
  const step = aiStepOf(settings);
  if (!step) return blob;
  const key = imageProvenanceKey(step.output);
  const provenance = key ? await loadImageProvenance(key) : null;
  if (!provenance) throw new Error("Could not confirm the AI label for this picture, so it was not saved. Try again.");
  const marked = embedXmpInWebp(new Uint8Array(await blob.arrayBuffer()), buildXmpPacket({ ...provenance, edited: true }));
  return new Blob([new Uint8Array(marked)], { type: "image/webp" });
}

/** Bake the original with the recipe and store it. */
export async function bakeAndUpload(originalUrl: string, settings: IlluminateSettings, userId: string): Promise<BakeResult> {
  const hash = hashSettings(settings);
  const blob = await markAiBake(await bakePicture(originalUrl, settings, BUCKETS.assetImages.maxBytes), settings);
  return { url: await uploadBake(blob, userId, hash), hash };
}
