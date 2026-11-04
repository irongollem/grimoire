/**
 * Photo posts: a "Steal this" post's slides as an Instagram carousel. A post
 * is a carousel when promo-out/<id>/slides/ holds slide-1.jpg, slide-2.jpg...
 * and has no manifest.json (that is a Reel; see publishing.ts).
 *
 * Instagram takes photos only from a public URL (direct upload is for video),
 * so posting first puts the slides on the asset CDN under `promo/<id>/`,
 * named by their content so a changed slide never reuses an old URL, checks
 * each one loads, and only then hands the URLs to Instagram. They are public
 * from that moment, as the post is a minute later.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { putObject } from "../../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom } from "../../supabase/functions/_shared/r2/config.ts";
import { captionProblems, createCarousel, findAccount, postsLeft, publish } from "./instagram";
import { readCaption, readPosted, type PostedRecord } from "./publishing";

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 20;
const SLIDE = /^slide-(\d+)\.jpg$/;

export interface CarouselCheck {
  id: string;
  problems: string[];
  caption: string | null;
  slides: string[];
  posted: PostedRecord | null;
}

/** Whether a post folder is a carousel (slides, no Reel manifest). */
export function isCarousel(root: string, id: string): boolean {
  return !existsSync(join(root, id, "manifest.json")) && existsSync(join(root, id, "slides"));
}

/** A JPEG's pixel size, from its first SOF marker; null when the file is not a baseline or progressive JPEG. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker === 0xc0 || marker === 0xc2) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + length;
  }
  return null;
}

/** The slides in order: slide-1.jpg, slide-2.jpg, ... (numeric, so slide-10 follows slide-9). */
export function slideFiles(names: string[]): string[] {
  return names
    .map((n) => SLIDE.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => m[0]);
}

export function checkCarousel(root: string, id: string, captionText: string | null = readCaption(id)): CarouselCheck {
  const dir = join(root, id, "slides");
  const problems: string[] = [];
  const names = existsSync(dir) ? slideFiles(readdirSync(dir)) : [];
  const slides = names.map((n) => join(dir, n));
  if (slides.length < MIN_SLIDES) problems.push(`${slides.length} slide(s); a carousel needs at least ${MIN_SLIDES} (slides/slide-N.jpg)`);
  if (slides.length > MAX_SLIDES) problems.push(`${slides.length} slides; Instagram takes at most ${MAX_SLIDES}`);
  // Instagram crops every slide to the first one's shape, so a different size would be cut.
  const sizes = slides.map((s) => jpegSize(readFileSync(s)));
  sizes.forEach((size, i) => {
    if (!size) problems.push(`${names[i]} is not a JPEG Instagram can read`);
  });
  const first = sizes[0];
  if (first) {
    const odd = names.filter((_, i) => sizes[i] && (sizes[i]!.width !== first.width || sizes[i]!.height !== first.height));
    if (odd.length > 0) problems.push(`not the size of slide 1 (${first.width}x${first.height}), so Instagram would crop them: ${odd.join(", ")}`);
  }
  if (captionText === null) problems.push(`no caption yet (scripts/promo/captions/${id}.txt)`);
  else problems.push(...captionProblems(captionText).map((p) => `caption: ${p}`));
  return { id, problems, caption: captionText, slides, posted: readPosted(root, id) };
}

/** Puts each slide on the asset CDN and returns its public URL, after checking it loads. */
async function hostSlides(id: string, slides: string[], log: (line: string) => void): Promise<string[]> {
  const r2 = r2ConfigFrom((k) => process.env[k]);
  const cdn = process.env.ASSET_CDN_URL?.replace(/\/+$/, "");
  if (!r2 || !cdn) throw new Error("R2_* and ASSET_CDN_URL must be set (npm run promo:post loads .env.local).");
  const urls: string[] = [];
  for (const [i, file] of slides.entries()) {
    const body = readFileSync(file);
    const key = `promo/${id}/${createHash("sha256").update(body).digest("hex").slice(0, 12)}-slide-${i + 1}.jpg`;
    await putObject(r2, { key, body, contentType: "image/jpeg", cacheControl: IMMUTABLE_CACHE_CONTROL });
    const url = `${cdn}/${key}`;
    const res = await fetch(url, { method: "HEAD" });
    if (!res.ok) throw new Error(`${url} answers ${res.status} after upload; Instagram could not fetch it.`);
    log(`hosted ${url}`);
    urls.push(url);
  }
  return urls;
}

/** Posts a ready carousel at once. Refuses before uploading anything if it is not ready, or already posted without `again`. */
export async function postCarousel(
  token: string,
  root: string,
  id: string,
  log: (line: string) => void,
  opts: { again?: boolean } = {},
): Promise<PostedRecord> {
  const check = checkCarousel(root, id);
  if (check.posted && !opts.again) throw new Error(`${id} was already posted on ${check.posted.postedAt}: ${check.posted.permalink}`);
  if (check.problems.length > 0) throw new Error(`${id} is not ready to post:\n  ${check.problems.join("\n  ")}`);
  const account = await findAccount(token);
  const quota = await postsLeft(token, account.id);
  if (quota.used >= quota.total) throw new Error(`No posts left: ${quota.used} of ${quota.total} used in the last 24 hours.`);
  const imageUrls = await hostSlides(id, check.slides, log);
  const containerId = await createCarousel(token, account.id, { imageUrls, caption: check.caption as string }, log);
  const { mediaId, permalink } = await publish(token, account.id, containerId);
  const record: PostedRecord = { id, account: account.username, mediaId, permalink, postedAt: new Date().toISOString() };
  writeFileSync(join(root, id, "posted.json"), JSON.stringify(record, null, 2) + "\n");
  log(`posted ${permalink}`);
  return record;
}
