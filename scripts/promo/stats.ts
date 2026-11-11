/**
 * How the posted Reels and carousels are doing on Instagram.
 *   npm run promo:stats        # a table of every post: views, views at 24 hours, reach, likes, saves, shares, comments
 *
 * Instagram reports only lifetime totals, so a post up for a week always beats
 * one up for a night. To compare them fairly the posting job
 * (`promo:post -- --due`) appends every post's numbers to
 * promo-out/stats.jsonl whenever it posts and whenever a post turns one day
 * old (with a post every night those are the same run), and the "24h" column
 * reads a post's views from the snapshot nearest its first day. Posts that
 * were older than a day when the snapshots began show none.
 *
 * Needs `instagram_manage_insights` on INSTAGRAM_SYSTEM_USER_TOKEN (added
 * 11 Nov 2026). See docs/promo-videos.md, "Stats".
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isCarousel } from "./carousels";
import { accountSummary, findAccount, mediaInsights, type MediaInsights } from "./instagram";
import { readPosted, type PostedRecord } from "./publishing";

export const STATS_FILE = "stats.jsonl";
/** How far a snapshot may sit from the 24-hour mark and still stand for it: the job runs hourly, so one always lands within this when the Mac is awake. */
export const SNAPSHOT_SLACK_MS = 90 * 60_000;

export interface Snapshot extends MediaInsights {
  at: string;
  id: string;
  mediaId: string;
}

/** Every post that left a posted.json, newest first. */
export function postedRecords(root: string): PostedRecord[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .flatMap((id) => {
      const r = readPosted(root, id);
      return r ? [r] : [];
    })
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
}

/**
 * Every snapshot line that parses. A line cut short (the Mac slept or shut down
 * mid-append) is skipped, never fatal: one bad line used to stop promo:stats
 * for good until someone edited the file by hand.
 */
export function readSnapshots(root: string): Snapshot[] {
  const f = join(root, STATS_FILE);
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Snapshot];
      } catch {
        return [];
      }
    });
}

/**
 * A post's views when it was `hours` old: the snapshot of that post nearest
 * the mark, if one lies within SNAPSHOT_SLACK_MS of it. Null when none does,
 * never the latest total, which would make an old post look like a hit.
 */
export function viewsAt(snapshots: Snapshot[], mediaId: string, postedAt: string, hours = 24): number | null {
  const mark = Date.parse(postedAt) + hours * 3_600_000;
  let best: Snapshot | null = null;
  for (const s of snapshots) {
    if (s.mediaId !== mediaId || s.views === null) continue;
    const off = Math.abs(Date.parse(s.at) - mark);
    if (off > SNAPSHOT_SLACK_MS) continue;
    if (!best || off < Math.abs(Date.parse(best.at) - mark)) best = s;
  }
  return best?.views ?? null;
}

/**
 * Whether the hourly job should snapshot now without posting: some post is
 * within half an hour of being one day old. The job runs once an hour, so one
 * run lands that close to every post's mark while the Mac is awake.
 */
export function dayMarkDue(posted: PostedRecord[], now: Date, hours = 24): boolean {
  return posted.some((p) => Math.abs(now.getTime() - (Date.parse(p.postedAt) + hours * 3_600_000)) <= 30 * 60_000);
}

/** How many posts' numbers are asked for at once: enough to finish in a few round trips, few enough to stay polite to the Graph API. */
export const SNAPSHOT_CONCURRENCY = 6;

export interface SnapshotResult {
  /** The posts read, and appended to stats.jsonl. */
  rows: Snapshot[];
  /** Every post that left a posted.json, as read for this snapshot (newest first). */
  records: PostedRecord[];
  /** Posts whose numbers could not be read this time (deleted on Instagram, a metric refused), with why. */
  failed: { id: string; error: string }[];
}

type ReadInsights = (token: string, mediaId: string, kind: "reel" | "carousel") => Promise<MediaInsights>;

/**
 * Reads every post's numbers now, a few at a time, and appends the ones it got
 * to stats.jsonl. One post that cannot be read is skipped and named in
 * `failed`: it used to throw away the whole snapshot, every hour, for every post.
 */
export async function takeSnapshot(token: string, root: string, read: ReadInsights = mediaInsights): Promise<SnapshotResult> {
  const at = new Date().toISOString();
  const records = postedRecords(root);
  const readOne = async (r: PostedRecord): Promise<Snapshot | { id: string; error: string }> => {
    try {
      const insights = await read(token, r.mediaId, isCarousel(root, r.id) ? "carousel" : "reel");
      return { at, id: r.id, mediaId: r.mediaId, ...insights };
    } catch (e) {
      return { id: r.id, error: e instanceof Error ? e.message : String(e) };
    }
  };
  const results: (Snapshot | { id: string; error: string })[] = [];
  for (let i = 0; i < records.length; i += SNAPSHOT_CONCURRENCY) {
    results.push(...(await Promise.all(records.slice(i, i + SNAPSHOT_CONCURRENCY).map(readOne))));
  }
  const rows = results.filter((x): x is Snapshot => "mediaId" in x);
  const failed = results.filter((x): x is { id: string; error: string } => "error" in x);
  if (rows.length > 0) appendFileSync(join(root, STATS_FILE), rows.map((s) => JSON.stringify(s)).join("\n") + "\n");
  return { rows, records, failed };
}

const num = (n: number | null) => (n === null ? "-" : String(n));

function age(postedAt: string, now: Date): string {
  const h = (now.getTime() - Date.parse(postedAt)) / 3_600_000;
  return h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

export function statsTable(rows: Snapshot[], posted: PostedRecord[], snapshots: Snapshot[], now: Date): string {
  const head = ["post", "age", "views", "24h", "reach", "likes", "saves", "shares", "comments", "watch"];
  const body = posted.map((p) => {
    const s = rows.find((r) => r.mediaId === p.mediaId);
    return [
      p.id,
      age(p.postedAt, now),
      num(s?.views ?? null),
      num(viewsAt(snapshots, p.mediaId, p.postedAt)),
      num(s?.reach ?? null),
      num(s?.likes ?? null),
      num(s?.saved ?? null),
      num(s?.shares ?? null),
      num(s?.comments ?? null),
      s?.avgWatchMs == null ? "-" : `${(s.avgWatchMs / 1000).toFixed(1)}s`,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  return [line(head), ...body.map(line)].join("\n");
}

async function main() {
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("INSTAGRAM_SYSTEM_USER_TOKEN is not set. Run through `npm run promo:stats`, which loads .env.local.");
  const root = resolve("promo-out");
  // The snapshot and the account lookup are independent: run them side by side.
  const [{ rows, records, failed }, summary] = await Promise.all([
    takeSnapshot(token, root),
    findAccount(token).then(async (account) => ({ account, ...(await accountSummary(token, account.id)) })),
  ]);
  console.log(`@${summary.account.username}: ${summary.followers} followers, ${summary.posts} posts\n`);
  // The records the snapshot read, so a post landing between two reads never shows without its row.
  console.log(statsTable(rows, records, readSnapshots(root), new Date()));
  for (const f of failed) console.log(`\ncould not read ${f.id}: ${f.error}`);
  console.log("\n24h = views at one day old, from the posting job's snapshots; - where none was taken then. watch = average play time.");
}

// pathToFileURL, not a `file://` template: the repo path has a space, which a URL spells %20.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
