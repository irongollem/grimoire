/**
 * Posts a finished Reel to the Grimoire Instagram account.
 *   npm run promo:post -- <episode id>            # a dry run: checks everything, posts nothing
 *   npm run promo:post -- <episode id> --publish  # posts it, at once
 *   npm run promo:post -- --schedule              # the schedule, and a dry run of everything on it
 *   npm run promo:post -- --due                   # posts the next Reel whose time has come (the launchd job)
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
import { findAccount, postsLeft } from "./instagram";
import { checkReel, postReel, readPosted, readSchedule } from "./publishing";
import { nextDue } from "./schedule";

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

/** Prints what would go out and every reason it cannot; true when it is ready. */
async function dryRun(token: string, root: string, id: string): Promise<boolean> {
  const c = checkReel(root, id);
  const account = await findAccount(token);
  const quota = await postsLeft(token, account.id);
  console.log(`account   @${account.username}`);
  console.log(`video     ${c.video}${c.problems.some((p) => p.startsWith("not assembled")) ? "" : ` (${durationOf(c.video).toFixed(1)} s)`}`);
  if (c.coverAt !== null) console.log(`cover     the frame at ${c.coverAt.toFixed(2)} s (cover.jpg)`);
  console.log(`quota     ${quota.used} of ${quota.total} posts used in the last 24 hours`);
  if (c.posted) console.log(`posted    ${c.posted.postedAt}: ${c.posted.permalink}`);
  console.log(`caption\n\n${c.caption ?? "(none)"}\n`);
  for (const p of c.problems) console.log(`NOT READY ${p}`);
  return c.problems.length === 0;
}

async function main() {
  const { id, root, publishNow, again, mode } = parseArgs(process.argv.slice(2));
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("INSTAGRAM_SYSTEM_USER_TOKEN is not set. Run through `npm run promo:post`, which loads .env.local.");
  const log = (l: string) => console.log(l);

  if (mode === "one" && id) {
    if (publishNow) await postReel(token, root, id, log, { again });
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
  const due = nextDue(schedule, posted, new Date());
  const stamp = new Date().toISOString();
  if (!due) {
    console.log(`${stamp} nothing due`);
    return;
  }
  console.log(`${stamp} posting ${due.id}, planned for ${due.at}`);
  try {
    const record = await postReel(token, root, due.id, log);
    notify("Grimoire Reel posted", `${due.id}: ${record.permalink}`);
  } catch (e) {
    notify("Grimoire Reel NOT posted", `${due.id}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
