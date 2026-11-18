/**
 * YouTube Shorts for the Reels the posting job has already put on Instagram (docs/promo-videos.md, "YouTube Shorts").
 *
 * A Reel goes to YouTube only when `youtube-titles.json` holds a title for it: that list is the maintainer's approval gate,
 * as the caption files are for Instagram. The description is the Reel's own caption. A vertical video of three
 * minutes or less becomes a Short on its own. Tokens and the client secret are never printed or put in an error.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readYoutubeClient } from "./youtubeAuth";
import type { PostedRecord } from "./publishing";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TITLES_FILE = join(HERE, "youtube-titles.json");
export const TITLE_MAX_CHARS = 100;
export const DESCRIPTION_MAX_BYTES = 5000;

export interface ShortRecord {
  id: string;
  videoId: string;
  url: string;
  uploadedAt: string;
}

export type ShortTitles = Record<string, { title: string }>;

/** The approved titles, validated: a malformed file stops the upload rather than guessing. */
export function readShortTitles(file = TITLES_FILE): ShortTitles {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`${file} must be an object of { "<id>": { "title": "..." } }`);
  const out: ShortTitles = {};
  for (const [id, v] of Object.entries(parsed)) {
    if (typeof v !== "object" || v === null || !("title" in v) || typeof v.title !== "string") throw new Error(`${file}: "${id}" needs a string "title"`);
    out[id] = { title: v.title };
  }
  return out;
}

export function readShortRecord(root: string, id: string): ShortRecord | null {
  const f = join(root, id, "youtube.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as ShortRecord) : null;
}

/** Every reason YouTube would refuse this title and description, checked before any network call. Empty means fine. */
export function shortProblems(title: string, description: string): string[] {
  const problems: string[] = [];
  if (title.trim() === "") problems.push("the title is empty");
  const chars = [...title].length;
  if (chars > TITLE_MAX_CHARS) problems.push(`the title is ${chars} characters, the limit is ${TITLE_MAX_CHARS}`);
  const bytes = Buffer.byteLength(description, "utf8");
  if (bytes > DESCRIPTION_MAX_BYTES) problems.push(`the description is ${bytes} bytes, the limit is ${DESCRIPTION_MAX_BYTES}`);
  if (/[<>]/.test(title)) problems.push("the title contains < or >, which YouTube rejects");
  if (/[<>]/.test(description)) problems.push("the description contains < or >, which YouTube rejects");
  return problems;
}

/** The caption's hashtags without their #, as tags. */
export function tagsFrom(caption: string): string[] {
  return [...new Set([...caption.matchAll(/(?:^|\s)#([\p{L}\p{N}_]+)/gu)].map((m) => m[1]))];
}

/**
 * The Reel to upload next: the oldest posted on Instagram that has an approved title, no youtube.json yet and is
 * not a carousel (not a video). Pure, so the order and every exclusion can be tested.
 */
export function nextShort(input: {
  posted: PostedRecord[];
  titles: ShortTitles;
  uploaded: (id: string) => boolean;
  isCarousel: (id: string) => boolean;
}): string | null {
  const oldestFirst = [...input.posted].sort((a, b) => a.postedAt.localeCompare(b.postedAt));
  for (const p of oldestFirst) {
    if (!(p.id in input.titles)) continue;
    if (input.uploaded(p.id) || input.isCarousel(p.id)) continue;
    return p.id;
  }
  return null;
}

export interface YoutubeIo {
  fetch: typeof fetch;
  readFile(path: string): Buffer;
}
const realIo: YoutubeIo = { fetch: (...a) => fetch(...a), readFile: (p) => readFileSync(p) };

/** Trades the long-lived refresh token for a short-lived access token. Errors carry Google's status and error code only. */
export async function accessToken(refreshToken: string, client = readYoutubeClient(), io: Pick<YoutubeIo, "fetch"> = realIo): Promise<string> {
  const res = await io.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client.clientId, client_secret: client.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body: unknown = await res.json().catch(() => null);
  const token = typeof body === "object" && body !== null && "access_token" in body ? body.access_token : null;
  if (!res.ok || typeof token !== "string") {
    const code = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "unknown";
    throw new Error(`YouTube token refresh failed: ${res.status} ${code}`);
  }
  return token;
}

export interface ShortUpload {
  title: string;
  description: string;
  tags: string[];
  videoPath: string;
}

/** Uploads one video through YouTube's resumable protocol; returns the new video's id. */
export async function uploadShort(access: string, up: ShortUpload, io: YoutubeIo = realIo): Promise<{ videoId: string; url: string }> {
  const problems = shortProblems(up.title, up.description);
  if (problems.length > 0) throw new Error(`not uploaded: ${problems.join("; ")}`);
  const bytes = io.readFile(up.videoPath);
  const start = await io.fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(bytes.length),
    },
    body: JSON.stringify({
      snippet: { title: up.title, description: up.description, tags: up.tags, categoryId: "20" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new Error(`YouTube refused the upload session: ${start.status}`);
  const put = await io.fetch(session, { method: "PUT", headers: { "content-type": "video/mp4" }, body: new Uint8Array(bytes) });
  const body: unknown = await put.json().catch(() => null);
  const videoId = typeof body === "object" && body !== null && "id" in body ? body.id : null;
  if (!put.ok || typeof videoId !== "string") throw new Error(`YouTube upload failed: ${put.status}`);
  return { videoId, url: `https://youtu.be/${videoId}` };
}

/**
 * An Instagram caption as a YouTube description. Instagram allows no links in a caption, so the captions point at
 * the profile ("Link in bio."); a YouTube description can carry the link itself.
 */
export function descriptionFrom(caption: string): string {
  return caption.replace(/\bLink in bio\./g, "Try it at https://dungeongrimoire.com");
}

/** What `promo:post -- --youtube <id>` shows and the job uploads: null when the Reel has no approved title. */
export function planShort(root: string, id: string, titles: ShortTitles, caption: string | null) {
  const entry = titles[id];
  if (!entry) return null;
  const video = join(root, id, `${id}.mp4`);
  const missing = existsSync(video) ? [] : ["the video is not assembled"];
  if (caption === null) return { title: entry.title, description: null, tags: [], video, problems: ["no caption to use as the description", ...missing] };
  const description = descriptionFrom(caption);
  return { title: entry.title, description, tags: tagsFrom(caption), video, problems: [...shortProblems(entry.title, description), ...missing] };
}

/** Uploads one planned Short and writes its youtube.json. Never uploads an id twice unless `again`. */
export async function publishShort(
  refreshToken: string,
  root: string,
  id: string,
  plan: NonNullable<ReturnType<typeof planShort>>,
  opts: { again?: boolean } = {},
  io: YoutubeIo = realIo,
): Promise<ShortRecord> {
  if (!opts.again && readShortRecord(root, id)) throw new Error(`${id} is already on YouTube (youtube.json). Add --again to upload it twice.`);
  if (plan.problems.length > 0 || plan.description === null) throw new Error(`${id} is not ready for YouTube: ${plan.problems.join("; ")}`);
  const access = await accessToken(refreshToken, undefined, io);
  const { videoId, url } = await uploadShort(access, { title: plan.title, description: plan.description, tags: plan.tags, videoPath: plan.video }, io);
  const record: ShortRecord = { id, videoId, url, uploadedAt: new Date().toISOString() };
  writeFileSync(join(root, id, "youtube.json"), JSON.stringify(record, null, 2) + "\n");
  return record;
}

export interface ShortStats {
  views: number | null;
  likes: number | null;
}

/** Views and likes of the given videos; a count YouTube hides (likes can be) is null, never 0. */
export async function readShortStats(access: string, videoIds: string[], io: Pick<YoutubeIo, "fetch"> = realIo): Promise<Map<string, ShortStats>> {
  const out = new Map<string, ShortStats>();
  if (videoIds.length === 0) return out;
  const res = await io.fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(",")}`, {
    headers: { authorization: `Bearer ${access}` },
  });
  if (!res.ok) throw new Error(`YouTube stats read failed: ${res.status}`);
  const body: unknown = await res.json();
  const items = typeof body === "object" && body !== null && "items" in body && Array.isArray(body.items) ? body.items : [];
  const count = (s: unknown, k: string): number | null => {
    if (typeof s !== "object" || s === null || !(k in s)) return null;
    const n = Number((s as Record<string, unknown>)[k]);
    return Number.isFinite(n) ? n : null;
  };
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("id" in item) || typeof item.id !== "string") continue;
    const stats: unknown = "statistics" in item ? item.statistics : null;
    out.set(item.id, { views: count(stats, "viewCount"), likes: count(stats, "likeCount") });
  }
  return out;
}
