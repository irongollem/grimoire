/**
 * What kind of post holds people, from the numbers we already collect.
 *   npm run promo:strategy     # per-kind table, per-post table, the strategy log's newest entries
 *
 * Every post of a small account lands in the same ~100 to 180 view band
 * (Instagram's first test audience), so views say little. What differs is how
 * much of the video an average viewer sees, so the report is built around the
 * "watched share" (average watch time / video length), read at the fair
 * 24-hour mark. It reads only promo-out/stats.jsonl and the disk: no API call.
 * The log of what was learned is scripts/promo/strategy.md, edited by hand.
 * See docs/promo-videos.md, "Stats".
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isCarousel } from "./carousels";
import type { PostedRecord } from "./publishing";
import { postedRecords, readSnapshots, SNAPSHOT_SLACK_MS, type Snapshot } from "./stats";
import type { EpisodeManifest } from "./types";

export type PostKind = "steal-carousel" | "steal-teaser" | "living-painting" | "short-feature" | "feature" | "youtube";

/** The kinds a post can be reported under; a YouTube video never goes to Instagram. */
export const REPORTED_KINDS: PostKind[] = ["living-painting", "short-feature", "feature", "steal-teaser", "steal-carousel"];

export interface KindInput {
  id: string;
  carousel: boolean;
  /** Null when the folder has no manifest (a carousel). */
  manifest: Pick<EpisodeManifest, "format" | "brand"> & { shots: { device?: string }[] } | null;
}

/** The kind of a post, from what is on disk. Null when it is neither a carousel nor has a manifest. */
export function classifyKind({ id, carousel, manifest }: KindInput): PostKind | null {
  if (carousel) return "steal-carousel";
  if (!manifest) return null;
  if (manifest.format === "youtube") return "youtube";
  // A painted scene is filmed by no recorder; `every` on no shots would call an empty manifest a scene, so require one.
  if (manifest.shots.length > 0 && manifest.shots.every((s) => s.device === "scene")) {
    return id.startsWith("steal-") ? "steal-teaser" : "living-painting";
  }
  if (manifest.brand === false) return "short-feature";
  return "feature";
}

export type Timing = "24h" | "late" | "early";

export interface PostRow {
  id: string;
  kind: PostKind;
  timing: Timing | null;
  views: number | null;
  reach: number | null;
  avgWatchS: number | null;
  /** Average watch time over the video's length; above 1 when a looped Reel is rewatched. Null for a carousel. */
  watchedShare: number | null;
  likesPerReach: number | null;
  savesSharesPerReach: number | null;
}

export interface KindRow {
  kind: PostKind;
  posts: number;
  /** How many of the posts have a snapshot at the fair 24-hour mark; the medians use only these. */
  at24h: number;
  medianViews: number | null;
  medianWatchS: number | null;
  medianWatchedShare: number | null;
  medianLikesPerReach: number | null;
  best: { id: string; watchedShare: number } | null;
}

export interface Report {
  kinds: KindRow[];
  posts: PostRow[];
  ceiling: { id: string; views: number } | null;
}

/** The middle value; the mean of the middle two when the count is even. Null for nothing. */
export function median(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const ratio = (a: number | null, b: number | null): number | null => (a === null || b === null || b === 0 ? null : a / b);

/**
 * The snapshot nearest a post's 24-hour mark, and whether it is a fair one.
 * A snapshot outside the slack is still the nearest we have, so it is shown,
 * but marked "late" (after the mark) or "early" so it is not mistaken for 24h.
 */
export function snapshotNear24h(snapshots: Snapshot[], mediaId: string, postedAt: string): { snapshot: Snapshot; timing: Timing } | null {
  const mark = Date.parse(postedAt) + 24 * 3_600_000;
  let best: Snapshot | null = null;
  for (const s of snapshots) {
    if (s.mediaId !== mediaId || s.views === null) continue;
    if (!best || Math.abs(Date.parse(s.at) - mark) < Math.abs(Date.parse(best.at) - mark)) best = s;
  }
  if (!best) return null;
  const off = Date.parse(best.at) - mark;
  return { snapshot: best, timing: Math.abs(off) <= SNAPSHOT_SLACK_MS ? "24h" : off > 0 ? "late" : "early" };
}

export interface ReportInput {
  snapshots: Snapshot[];
  posted: PostedRecord[];
  kinds: Map<string, PostKind>;
  /** Seconds of each Reel's finished video; absent or null for a carousel. */
  lengths: Map<string, number | null>;
}

export function buildReport({ snapshots, posted, kinds, lengths }: ReportInput): Report {
  const posts: PostRow[] = [];
  for (const p of posted) {
    const kind = kinds.get(p.id);
    if (!kind || kind === "youtube") continue;
    const near = snapshotNear24h(snapshots, p.mediaId, p.postedAt);
    const s = near?.snapshot ?? null;
    const avgWatchS = s?.avgWatchMs == null ? null : s.avgWatchMs / 1000;
    const reach = s?.reach ?? null;
    posts.push({
      id: p.id,
      kind,
      timing: near?.timing ?? null,
      views: s?.views ?? null,
      reach,
      avgWatchS,
      watchedShare: ratio(avgWatchS, lengths.get(p.id) ?? null),
      likesPerReach: ratio(s?.likes ?? null, reach),
      savesSharesPerReach: s && s.saved !== null && s.shares !== null ? ratio(s.saved + s.shares, reach) : null,
    });
  }

  const rows: KindRow[] = REPORTED_KINDS.flatMap((kind) => {
    const of = posts.filter((r) => r.kind === kind);
    if (of.length === 0) return [];
    // Only the fair 24h snapshots are compared; a late one would make an old post look better.
    const fair = of.filter((r) => r.timing === "24h");
    const withShare = fair.filter((r) => r.watchedShare !== null);
    const best = withShare.reduce<PostRow | null>((a, r) => (a === null || (r.watchedShare as number) > (a.watchedShare as number) ? r : a), null);
    return [{
      kind,
      posts: of.length,
      at24h: fair.length,
      medianViews: median(fair.map((r) => r.views)),
      medianWatchS: median(fair.map((r) => r.avgWatchS)),
      medianWatchedShare: median(fair.map((r) => r.watchedShare)),
      medianLikesPerReach: median(fair.map((r) => r.likesPerReach)),
      best: best ? { id: best.id, watchedShare: best.watchedShare as number } : null,
    }];
  });

  // The highest views any post has reached at any time, to spot one that breaks out of the test-audience band.
  const ids = new Set(posts.map((r) => r.id));
  const mediaToId = new Map(posted.filter((p) => ids.has(p.id)).map((p) => [p.mediaId, p.id]));
  let ceiling: Report["ceiling"] = null;
  for (const s of snapshots) {
    const id = mediaToId.get(s.mediaId);
    if (id !== undefined && s.views !== null && (ceiling === null || s.views > ceiling.views)) ceiling = { id, views: s.views };
  }
  return { kinds: rows, posts, ceiling };
}

// ---------- the strategy log ----------

/** The newest `n` entries of the log: each starts at a `## ` heading, newest first in the file. */
export function latestEntries(markdown: string, n: number): string[] {
  const entries = markdown.split(/^(?=## )/m).filter((e) => e.startsWith("## "));
  return entries.slice(0, n).map((e) => e.trim());
}

export const LOG_FILE = fileURLToPath(new URL("./strategy.md", import.meta.url));

export function readLog(n: number, file = LOG_FILE): string[] {
  return existsSync(file) ? latestEntries(readFileSync(file, "utf8"), n) : [];
}

// ---------- reading the disk ----------

/** A finished video's length in seconds, from ffprobe; null when there is no video or ffprobe cannot read it. */
export function videoSeconds(file: string): number | null {
  if (!existsSync(file)) return null;
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
    const s = Number.parseFloat(out);
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

export function readKindInput(root: string, id: string): KindInput {
  const file = join(root, id, "manifest.json");
  return { id, carousel: isCarousel(root, id), manifest: existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as KindInput["manifest"]) : null };
}

/** The report for everything posted, from promo-out/. */
export function reportFromDisk(root: string): Report {
  const posted = postedRecords(root);
  const kinds = new Map<string, PostKind>();
  const lengths = new Map<string, number | null>();
  for (const p of posted) {
    const kind = classifyKind(readKindInput(root, p.id));
    if (!kind) continue;
    kinds.set(p.id, kind);
    lengths.set(p.id, kind === "steal-carousel" ? null : videoSeconds(join(root, p.id, `${p.id}.mp4`)));
  }
  return buildReport({ snapshots: readSnapshots(root), posted, kinds, lengths });
}

// ---------- printing ----------

const dash = (v: string | null) => v ?? "-";
const secs = (n: number | null) => (n === null ? null : `${n.toFixed(1)}s`);
const pct = (n: number | null, digits = 0) => (n === null ? null : `${(n * 100).toFixed(digits)}%`);
const whole = (n: number | null) => (n === null ? null : String(Math.round(n)));

function grid(head: string[], body: string[][]): string {
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [line(head), ...body.map(line)].join("\n");
}

export function kindTable(report: Report): string {
  return grid(
    ["kind", "posts", "at 24h", "views", "watch", "watched", "likes/reach", "best watched"],
    report.kinds.map((k) => [
      k.kind, String(k.posts), String(k.at24h), dash(whole(k.medianViews)), dash(secs(k.medianWatchS)), dash(pct(k.medianWatchedShare)),
      dash(pct(k.medianLikesPerReach, 1)), k.best ? `${k.best.id} ${pct(k.best.watchedShare)}` : "-",
    ]),
  );
}

export function postTable(report: Report): string {
  const ordered = REPORTED_KINDS.flatMap((k) => report.posts.filter((p) => p.kind === k));
  return grid(
    ["kind", "post", "when", "views", "reach", "watch", "watched", "likes/reach", "saves+shares/reach"],
    ordered.map((p) => [
      p.kind, p.id, p.timing === null ? "-" : p.timing, dash(whole(p.views)), dash(whole(p.reach)), dash(secs(p.avgWatchS)),
      dash(pct(p.watchedShare)), dash(pct(p.likesPerReach, 1)), dash(pct(p.savesSharesPerReach, 1)),
    ]),
  );
}

export function ceilingLine(report: Report): string {
  return report.ceiling ? `Ceiling: ${report.ceiling.id} reached ${report.ceiling.views} views, the most of any post.` : "Ceiling: no views recorded yet.";
}

function main() {
  const report = reportFromDisk(resolve("promo-out"));
  console.log(kindTable(report));
  console.log(`\n${ceilingLine(report)}\n`);
  console.log(postTable(report));
  console.log("\nMedians use only posts with a snapshot at the 24h mark. when: 24h is a fair snapshot, late or early is the nearest one we have and is not comparable.");
  console.log("watched = average watch time / video length (above 100% when a looped Reel is rewatched).\n");
  for (const e of readLog(3)) console.log(`${e}\n`);
}

// pathToFileURL, not a `file://` template: the repo path has a space, which a URL spells %20.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
