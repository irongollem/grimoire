/**
 * What the promo:post command and the recorder's Socials tab share: whether a
 * Reel is ready to post, its caption and schedule on disk, and the post itself.
 *
 * A Reel is ready when every shot has a voice take (else the .mp4 is a silent
 * draft), the build is newer than every take, the assembler left its cover time
 * (cover.json) and the caption (captions/<id>.txt) is one Instagram would take.
 * A posted Reel leaves promo-out/<id>/posted.json; it is never posted twice
 * unless asked to be.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { captionProblems, findAccount, postsLeft, publish, uploadReel } from "./instagram";
import { parseSchedule, type ScheduleEntry } from "./schedule";
import type { EpisodeManifest } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAPTIONS_DIR = join(HERE, "captions");
export const SCHEDULE_FILE = join(HERE, "schedule.json");
const VOICE_EXTS = [".wav", ".m4a", ".mp3", ".aif", ".aiff"];

export interface PostedRecord {
  id: string;
  account: string;
  mediaId: string;
  permalink: string;
  postedAt: string;
}

export interface ReelCheck {
  id: string;
  /** Every reason it cannot be posted as it stands; empty means ready. */
  problems: string[];
  caption: string | null;
  /** Seconds into the video of the cover frame. */
  coverAt: number | null;
  video: string;
  posted: PostedRecord | null;
}

const captionFile = (id: string) => join(CAPTIONS_DIR, `${id}.txt`);

export function readCaption(id: string): string | null {
  return existsSync(captionFile(id)) ? readFileSync(captionFile(id), "utf8").trimEnd() : null;
}

export function writeCaption(id: string, text: string): void {
  writeFileSync(captionFile(id), text.trimEnd() + "\n");
}

export function readPosted(root: string, id: string): PostedRecord | null {
  const f = join(root, id, "posted.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as PostedRecord) : null;
}

export function readSchedule(file = SCHEDULE_FILE): ScheduleEntry[] {
  return existsSync(file) ? parseSchedule(JSON.parse(readFileSync(file, "utf8"))) : [];
}

/** Puts a Reel on the schedule at `at`, moves it, or (`at: null`) takes it off. Kept in time order. */
export function setScheduled(id: string, at: string | null, file = SCHEDULE_FILE): ScheduleEntry[] {
  const rest = readSchedule(file).filter((e) => e.id !== id);
  const next = parseSchedule(at === null ? rest : [...rest, { id, at }]);
  next.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  writeFileSync(file, "[\n" + next.map((e) => `  ${JSON.stringify(e)}`).join(",\n") + "\n]\n");
  return next;
}

export function checkReel(root: string, id: string, captionText: string | null = readCaption(id)): ReelCheck {
  const dir = join(root, id);
  const video = join(dir, `${id}.mp4`);
  const problems: string[] = [];
  const result = (coverAt: number | null): ReelCheck => ({ id, problems, caption: captionText, coverAt, video, posted: readPosted(root, id) });

  const manifestFile = join(dir, "manifest.json");
  if (!existsSync(manifestFile)) {
    problems.push("not recorded yet (no manifest.json)");
    return result(null);
  }
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as EpisodeManifest;
  if ((manifest.format ?? "reel") !== "reel") problems.push(`a ${manifest.format} video; only Reels go to Instagram`);

  const voDir = join(dir, "vo");
  const takes = existsSync(voDir) ? readdirSync(voDir).filter((f) => VOICE_EXTS.some((e) => f.endsWith(e))) : [];
  const unvoiced = manifest.shots.filter((s) => !takes.some((t) => t.replace(/\.[^.]+$/, "") === s.id)).map((s) => s.id);
  if (unvoiced.length > 0) problems.push(`no voice take for ${unvoiced.join(", ")}: the build is a silent draft`);

  if (!existsSync(video)) problems.push("not assembled yet");
  else {
    const builtAt = statSync(video).mtimeMs;
    const stale = takes.filter((t) => statSync(join(voDir, t)).mtimeMs > builtAt);
    if (stale.length > 0) problems.push(`takes newer than the build (${stale.join(", ")}): assemble it again`);
  }

  const coverFile = join(dir, "cover.json");
  const coverAt = existsSync(coverFile) ? (JSON.parse(readFileSync(coverFile, "utf8")) as { at: number }).at : null;
  if (coverAt === null && existsSync(video)) problems.push("no cover time (cover.json): assemble it again");

  if (captionText === null) problems.push(`no caption yet (${captionFile(id)})`);
  else problems.push(...captionProblems(captionText).map((p) => `caption: ${p}`));
  return result(coverAt);
}

/** Posts a ready Reel at once. Refuses before touching the network if it is not ready, or already posted without `again`. */
export async function postReel(
  token: string,
  root: string,
  id: string,
  log: (line: string) => void,
  opts: { again?: boolean } = {},
): Promise<PostedRecord> {
  const check = checkReel(root, id);
  if (check.posted && !opts.again) throw new Error(`${id} was already posted on ${check.posted.postedAt}: ${check.posted.permalink}`);
  if (check.problems.length > 0) throw new Error(`${id} is not ready to post:\n  ${check.problems.join("\n  ")}`);
  const caption = check.caption as string;
  const coverAt = check.coverAt as number;

  const account = await findAccount(token);
  const quota = await postsLeft(token, account.id);
  if (quota.used >= quota.total) throw new Error(`No posts left: ${quota.used} of ${quota.total} used in the last 24 hours.`);
  const bytes = readFileSync(check.video);
  const containerId = await uploadReel(token, account.id, { video: bytes, caption, coverAtMs: coverAt * 1000 }, log);
  const { mediaId, permalink } = await publish(token, account.id, containerId);
  const record: PostedRecord = { id, account: account.username, mediaId, permalink, postedAt: new Date().toISOString() };
  writeFileSync(join(root, id, "posted.json"), JSON.stringify(record, null, 2) + "\n");
  log(`posted ${permalink}`);
  return record;
}
