/**
 * Posts a finished Reel, or a carousel of slides (carousels.ts), to the Grimoire Instagram account.
 *   npm run promo:post -- <episode id>            # a dry run: checks everything, posts nothing
 *   npm run promo:post -- <episode id> --publish  # posts it, at once
 *   npm run promo:post -- --schedule              # the schedule, and a dry run of everything on it
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
import { checkReel, postReel, readPosted, readSchedule, writeSchedule } from "./publishing";
import { LATE_LIMIT_HOURS, nextDue, pushMissed } from "./schedule";

function parseArgs(argv: string[]) {
  let root = "promo-out";
  let id: string | undefined;
  let publishNow = false;
  let again = false;
  let mode: "one" | "schedule" | "due" = "one";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--publish") publishNow = true;
    else if (argv[i] === "--again") again = true;
    else if (argv[i] === "--schedule") mode = "schedule";
    else if (argv[i] === "--due") mode = "due";
    else if (argv[i] === "--root") root = argv[++i] ?? root;
    else if (!argv[i].startsWith("--")) id = argv[i];
  }
  if (mode === "one" && !id) throw new Error("Usage: promo:post -- <episode id> [--publish] [--again] | --schedule | --due");
  return { id, root: resolve(root), publishNow, again, mode };
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
    if (r.coverAt !== null) console.log(`cover     the frame at ${r.coverAt.toFixed(2)} s (cover.jpg)`);
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

async function main() {
  const { id, root, publishNow, again, mode } = parseArgs(process.argv.slice(2));
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("INSTAGRAM_SYSTEM_USER_TOKEN is not set. Run through `npm run promo:post`, which loads .env.local.");
  const log = (l: string) => console.log(l);

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
    return;
  }

  const posted = new Set(schedule.filter((e) => readPosted(root, e.id) !== null).map((e) => e.id));
  const now = new Date();
  const stamp = now.toISOString();
  const missed = pushMissed(schedule, posted, now);
  if (missed) {
    writeSchedule(missed.entries);
    const days = missed.days === 1 ? "a day" : `${missed.days} days`;
    console.log(`${stamp} missed a slot by more than ${LATE_LIMIT_HOURS} hours; moved the queue back ${days}`);
    notify("Grimoire posts moved", `A post missed its time (the Mac was off or asleep). The queue moved back ${days}.`);
    return;
  }
  const due = nextDue(schedule, posted, now);
  if (!due) {
    console.log(`${stamp} nothing due`);
    return;
  }
  console.log(`${stamp} posting ${due.id}, planned for ${due.at}`);
  try {
    await networkUp(log);
    const record = await post(token, root, due.id, log);
    notify("Grimoire post published", `${due.id}: ${record.permalink}`);
  } catch (e) {
    notify("Grimoire post NOT published", `${due.id}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
