/*
 * Which stored pictures a book may delete (#1176 story 9c).
 *
 * Any picture served from our storage can be edited now, so a picture's
 * `original` may be anyone's file: a place's art, a portrait, a picture the
 * author keeps in their own pictures. Editing only ever reads it. What the
 * Illuminator itself stores is a bake, a brush mask, a texture and an AI
 * result, always in asset-images under the author's own id and named `ill-...`
 * (bakeUpload.ts, useIlluminateWorkbench.ts, useIlluminatePicture.ts). Those
 * are the only files cleanup may delete, and an `original` never is, whatever
 * its name: `madeUrls` is the one rule every cleanup path asks.
 */
import { parseSettings, pictureUrls } from "@/scriptorium/illuminator/lib/treatment";
import { parsePublicUrl } from "@/lib/storage";

/** The name every file the Illuminator stores starts with. */
const MADE_PREFIX = "ill-";

/** A file the Illuminator stored for this author: asset-images, directly under their id, named `ill-...`. */
export function isMadeByIlluminator(url: unknown, userId: string | null | undefined): url is string {
  if (typeof url !== "string" || !userId) return false;
  const parsed = parsePublicUrl(url);
  if (parsed?.bucket !== "assetImages") return false;
  const prefix = `${userId}/${MADE_PREFIX}`;
  return parsed.path.startsWith(prefix) && !parsed.path.slice(userId.length + 1).includes("/");
}

/** What a picture holds: an image node's attrs, or art furniture's props. */
export interface PictureValues {
  src?: unknown;
  original?: unknown;
  illuminate?: unknown;
}

/** Every stored picture it refers to, the original included. Anything still held is never removed. */
export function heldUrls(values: PictureValues): string[] {
  const urls = [values.src, values.original, ...pictureUrls(parseSettings(values.illuminate))];
  return urls.filter((u): u is string => typeof u === "string" && u !== "");
}

/**
 * The files the Illuminator made for this picture and the author owns: its bake, and the masks, textures and
 * AI results its recipe points at. Never the original, and never a file that is not the author's own `ill-` file.
 */
export function madeUrls(values: PictureValues, userId: string | null | undefined): string[] {
  const candidates = [values.src, ...pictureUrls(parseSettings(values.illuminate))];
  return candidates.filter((u): u is string => isMadeByIlluminator(u, userId) && u !== values.original);
}
