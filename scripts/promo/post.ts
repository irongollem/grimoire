/**
 * Posts a finished Reel, or a carousel of slides (carousels.ts), to the Grimoire Instagram account.
 *   npm run promo:post -- <episode id>            # a dry run: checks everything, posts nothing
 *   npm run promo:post -- <episode id> --publish  # posts it, at once
 *   npm run promo:post -- --schedule              # the schedule, and a dry run of everything on it
 *   npm run promo:post -- --youtube <episode id> # a dry run of its YouTube upload (youtube.ts); add --publish to upload it
 *   npm run promo:post -- --due                   # posts the next post whose time has come (the launchd job)
 *
 * What "ready" means, the caption and schedule files and the post itself live
 * in publishing.ts, shared with the recorder's Socials tab. The token is
 * INSTAGRAM_SYSTEM_USER_TOKEN in .env.local, a system user of the Dungeon
 * Grimoire business portfolio; it is never printed. See docs/promo-videos.md,
 * "Posting".
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { durationOf } from "./compose/ffmpeg";
import { checkCarousel, isCarousel, postCarousel } from "./carousels";
import { findAccount, postsLeft } from "./instagram";
import { runDue } from "./dueRun";
import { checkReel, postReel, readCaption, readPosted, readSchedule, writeSchedule } from "./publishing";
import { dayMarkDue, postedRecords, takeSnapshot } from "./stats";
import { nextShort, planShort, publishShort, readShortRecord, readShortTitles, scheduledWithoutTitle } from "./youtube";

function parseArgs(argv: string[]) {
  let root = "promo-out";
  let id: string | undefined;
  let publishNow = false;
  let again = false;
  let shortId: string | undefined;
  let mode: "one" | "schedule" | "due" = "one";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--publish") publishNow = true;
    else if (argv[i] === "--again") again = true;
    else if (argv[i] === "--schedule") mode = "schedule";
    else if (argv[i] === "--due") mode = "due";
    else if (argv[i] === "--youtube") shortId = argv[++i];
    else if (argv[i] === "--root") root = argv[++i] ?? root;
    else if (!argv[i].startsWith("--")) id = argv[i];
  }
  if (mode === "one" && !id && !shortId)
    throw new Error("Usage: promo:post -- <episode id> [--publish] [--again] | --youtube <episode id> [--publish] [--again] | --schedule | --due");
  return { id, shortId, root: resolve(root), publishNow, again, mode };
}

/** A macOS notification, so a post (or a failure) made by the hourly job while nobody is watching is still seen. */
function notify(title: string, message: string) {
  try {
    execFileSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`]);
  } catch {
    // Not on a Mac, or no notification permission: the log line is the record.
  }
}

/** Posts a Reel or a carousel, whichever the post's folder holds. */
function post(token: string, root: string, id: string, log: (l: string) => void, opts: { again?: boolean } = {}) {
  return isCarousel(root, id) ? postCarousel(token, root, id, log, opts) : postReel(token, root, id, log, opts);
}

/** Prints what would go out and every reason it cannot; true when it is ready. */
async function dryRun(token: string, root: string, id: string): Promise<boolean> {
  const account = await findAccount(token);
  const quota = await postsLeft(token, account.id);
  console.log(`account   @${account.username}`);
  let c: { problems: string[]; caption: string | null; posted: { postedAt: string; permalink: string } | null };
  if (isCarousel(root, id)) {
    const k = checkCarousel(root, id);
    console.log(`carousel  ${k.slides.length} slides in ${root}/${id}/slides`);
    c = k;
  } else {
    const r = checkReel(root, id);
    console.log(`video     ${r.video}${r.problems.some((p) => p.startsWith("not assembled")) ? "" : ` (${durationOf(r.video).toFixed(1)} s)`}`);
    if (r.titleCover) console.log(`cover     ${r.titleCover}`);
    else if (r.coverAt !== null) console.log(`cover     the frame at ${r.coverAt.toFixed(2)} s (cover.jpg)`);
    c = r;
  }
  console.log(`quota     ${quota.used} of ${quota.total} posts used in the last 24 hours`);
  if (c.posted) console.log(`posted    ${c.posted.postedAt}: ${c.posted.permalink}`);
  console.log(`caption\n\n${c.caption ?? "(none)"}\n`);
  for (const p of c.problems) console.log(`NOT READY ${p}`);
  return c.problems.length === 0;
}

/**
 * launchd runs a missed hour the moment the Mac wakes, often before Wi-Fi is
 * back: the 5 Nov 2026 post died on "fetch failed" at 23:09 for exactly that.
 * Wait up to three minutes for Instagram's host to answer before posting.
 */
async function networkUp(log: (line: string) => void): Promise<void> {
  for (let tries = 0; ; tries++) {
    try {
      await fetch("https://graph.facebook.com/", { method: "HEAD" });
      return;
    } catch (e) {
      if (tries >= 12) throw new Error(`no network after three minutes: ${e instanceof Error ? e.message : String(e)}`);
      if (tries === 0) log("no network yet (just woke?); waiting for it");
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
}

/** The Short for one Reel: a dry run printing what would go up, or (with --publish) the upload itself. */
async function shortCommand(root: string, id: string, publishNow: boolean, again: boolean, log: (l: string) => void) {
  const plan = planShort(root, id, readShortTitles(), readCaption(id));
  if (!plan) throw new Error(`${id} has no title in scripts/promo/youtube-titles.json, so it is not approved for YouTube.`);
  if (!publishNow) {
    log(`title     ${plan.title}`);
    log(`video     ${plan.video}`);
    log(`tags      ${plan.tags.join(", ") || "(none)"}`);
    log(`description\n\n${plan.description === null ? "(no caption)" : plan.description}\n`);
    for (const p of plan.problems) log(`NOT READY ${p}`);
    if (plan.problems.length === 0) log("Dry run: nothing was uploaded. Add --publish to upload it now.");
    else process.exitCode = 1;
    return;
  }
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refresh) throw new Error("YOUTUBE_REFRESH_TOKEN is not set. Run `npm run promo:youtube-auth` once.");
  const r = await publishShort(refresh, root, id, plan, { again });
  log(`uploaded ${id} to YouTube: ${r.url}`);
}

/**
 * After the Instagram run: at most one waiting Short. It never throws, so it cannot mask the Instagram run's own
 * error or exit code; a failure is notified and logged. No refresh token means the sign-in was never done: skip.
 */
async function uploadWaitingShort(root: string, log: (l: string) => void) {
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refresh) {
    log("youtube: YOUTUBE_REFRESH_TOKEN is not set; skipping Shorts");
    return;
  }
  let id: string | null = null;
  try {
    id = nextShort({
      posted: postedRecords(root),
      titles: readShortTitles(),
      uploaded: (x) => readShortRecord(root, x) !== null,
      isCarousel: (x) => isCarousel(root, x),
    });
    if (!id) return;
    await networkUp(log);
    const plan = planShort(root, id, readShortTitles(), readCaption(id));
    if (!plan) return;
    const r = await publishShort(refresh, root, id, plan);
    log(`youtube: uploaded ${id}: ${r.url}`);
    notify("Short uploaded", `${id}: ${r.url}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log(`youtube: ${id ?? "Shorts"} failed: ${message}`);
    notify("Short upload failed", `${id ?? "Shorts"}: ${message}`);
  }
}

async function main() {
  const { id, shortId, root, publishNow, again, mode } = parseArgs(process.argv.slice(2));
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("INSTAGRAM_SYSTEM_USER_TOKEN is not set. Run through `npm run promo:post`, which loads .env.local.");
  const log = (l: string) => console.log(l);

  if (mode === "one" && shortId) {
    await shortCommand(root, shortId, publishNow, again, log);
    return;
  }

  if (mode === "one" && id) {
    if (publishNow) await post(token, root, id, log, { again });
    else if (await dryRun(token, root, id)) console.log("Dry run: nothing was posted. Add --publish to post it now.");
    else process.exitCode = 1;
    return;
  }

  const schedule = readSchedule();
  if (mode === "schedule") {
    for (const e of schedule) {
      const when = new Date(e.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const posted = readPosted(root, e.id);
      console.log(`\n=== ${when}  ${e.id}${posted ? "  (posted)" : ""}`);
      if (!posted && !(await dryRun(token, root, e.id))) process.exitCode = 1;
    }
    // YouTube rides on the same run, so a Reel without an approved title would go to Instagram alone.
    const untitled = scheduledWithoutTitle({ schedule, titles: readShortTitles(), posted: (x) => readPosted(root, x) !== null, isCarousel: (x) => isCarousel(root, x) });
    if (untitled.length > 0) {
      console.log(`\nNOT READY no YouTube title in scripts/promo/youtube-titles.json for ${untitled.join(", ")}: each would post to Instagram only.`);
      process.exitCode = 1;
    }
    return;
  }

  const now = new Date();
  try {
    await runDue({
      now,
      schedule,
      posted: new Set(schedule.filter((e) => readPosted(root, e.id) !== null).map((e) => e.id)),
      dayMark: dayMarkDue(postedRecords(root), now),
      log,
      notify,
      writeSchedule,
      networkUp: () => networkUp(log),
      post: async (postId) => {
        const record = await post(token, root, postId, log);
        if (!isCarousel(root, postId) && !(postId in readShortTitles())) {
          log(`youtube: ${postId} has no approved title, so it went to Instagram only`);
          notify("Instagram only", `${postId} has no YouTube title in youtube-titles.json yet.`);
        }
        return record;
      },
      snapshot: () => snapshot(token, root, log),
    });
  } finally {
    await uploadWaitingShort(root, log);
  }
}

/**
 * Stats ride on the posting job (stats.ts). It waits for the network like a
 * post does (a day mark can fall on a run that woke the Mac), and a failed
 * read is logged, never failing the run, whose job is posting.
 */
async function snapshot(token: string, root: string, log: (l: string) => void) {
  try {
    await networkUp(log);
    const { rows, failed } = await takeSnapshot(token, root);
    log(`stats snapshot of ${rows.length} posts`);
    for (const f of failed) log(`stats: could not read ${f.id}: ${f.error}`);
  } catch (e) {
    log(`stats snapshot failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
