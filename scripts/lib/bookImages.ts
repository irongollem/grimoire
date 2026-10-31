/**
 * Picture preparation and storage shared by the setting-book scripts (epic #1115):
 * `scriptorium-book.ts` (art slots in the document, bucket `asset-images`) and
 * `import-statblocks.ts --art` (a monster's own picture, bucket `monster-images`).
 *
 * Each picture is resized to at most 2400px on its long edge, encoded as WebP,
 * marked with the AI provenance packet and keyed by the hash of the final bytes,
 * so a re-run finds it already stored. Production writes Cloudflare R2 and builds
 * the CDN URL; the local stack writes its own Storage. `writeProvenance` records the
 * `image_provenance` row the app's disclosure badge reads. Nothing here prints a key.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { assetCdnUrl } from "../../supabase/functions/_shared/cdn-buckets.ts";
import { headObject, putObject } from "../../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, type R2Config, r2ObjectKey } from "../../supabase/functions/_shared/r2/config.ts";
import { markGeneratedImage } from "../../supabase/functions/_shared/provenance/mark.ts";
import { imageProvenanceStem } from "../../supabase/functions/_shared/provenance/key.ts";
import type { AiProvenance } from "../../supabase/functions/_shared/provenance/types.ts";
import { type ServiceTarget as Target, serviceHeaders as authHeaders } from "./dev-stack.ts";
import { assetImagePath } from "./scriptoriumBook.ts";

export const MAX_EDGE = 2400;
export const WEBP_QUALITY = 82;
export const GENERATOR_TYPE = "setting-book-art";
/** The GPT art pipeline's output folder: the only pictures whose generator is known. */
export const GPT_OUTPUT = "/art-955/kind-country/out/";

/**
 * Every picture in the book is AI-generated, so every one is marked. Only the
 * GPT pipeline's output has a known generator; the author's own illustrations
 * folder was made with tools this script cannot name, so those say "unknown"
 * rather than claim a model they were not made with.
 */
export function provenanceFor(file: string, generatedAt: string, generatorType: string = GENERATOR_TYPE): AiProvenance {
  const gpt = file.includes(GPT_OUTPUT);
  return {
    generatorType,
    provider: gpt ? "openai" : "unknown",
    model: gpt ? "gpt-image-2" : "unknown",
    generatedAt,
    edited: false,
  };
}

export interface PreparedImage {
  path: string;
  bytes: Uint8Array;
  provenance: AiProvenance;
  sourceBytes: number;
}

/** Resize, encode as WebP, mark as AI-generated, and key by the hash of the final bytes. */
export async function prepareImage(file: string, userId: string, generatorType: string = GENERATOR_TYPE): Promise<PreparedImage> {
  const prov = provenanceFor(file, statSync(file).mtime.toISOString(), generatorType);
  const source = readFileSync(file);
  const webp = await sharp(source)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const bytes = markGeneratedImage(new Uint8Array(webp), "image/webp", prov);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 40);
  return { path: assetImagePath(userId, hash), bytes, provenance: prov, sourceBytes: source.byteLength };
}

export interface Storage {
  /** Whether the object is already stored; null when it cannot be told (a dry run without R2 credentials). */
  has: (path: string) => Promise<boolean | null>;
  put: (path: string, bytes: Uint8Array) => Promise<void>;
  url: (path: string) => string;
}

export function localStorage(target: Target, bucket: string): Storage {
  const publicUrl = (path: string) => `${target.origin}/storage/v1/object/public/${bucket}/${path}`;
  return {
    has: async (path) => (await fetch(publicUrl(path), { method: "HEAD" })).ok,
    put: async (path, bytes) => {
      const response = await fetch(`${target.origin}/storage/v1/object/${bucket}/${path}`, {
        method: "POST",
        headers: authHeaders(target, { "Content-Type": "image/webp", "x-upsert": "true" }),
        body: Buffer.from(bytes),
      });
      if (!response.ok) throw new Error(`Local storage upload of ${path} failed (${response.status}).`);
    },
    url: publicUrl,
  };
}

export function r2Storage(config: R2Config | null, cdnBase: string | null, bucket: string): Storage {
  return {
    has: async (path) => (config === null ? null : (await headObject(config, r2ObjectKey(bucket, path))) !== null),
    put: async (path, bytes) => {
      if (config === null) throw new Error("R2 is not configured (R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
      await putObject(config, { key: r2ObjectKey(bucket, path), body: bytes, contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_CONTROL });
    },
    url: (path) => {
      const url = assetCdnUrl(bucket, path, cdnBase);
      if (url === null) throw new Error("ASSET_CDN_URL is not set, so the stored URL cannot be built.");
      return url;
    },
  };
}

/** Upserts the image's `image_provenance` row (status only on failure: a body could echo row content). */
export async function writeProvenance(target: Target, bucket: string, image: PreparedImage, userId: string): Promise<void> {
  const response = await fetch(`${target.origin}/rest/v1/image_provenance?on_conflict=bucket,stem`, {
    method: "POST",
    headers: authHeaders(target, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ bucket, stem: imageProvenanceStem(image.path), user_id: userId, provenance: image.provenance }),
  });
  if (!response.ok) throw new Error(`POST image_provenance failed (${response.status}).`);
}
