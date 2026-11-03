/**
 * Posts a finished Reel to the Grimoire Instagram account.
 *   npm run promo:post -- <episode id>            # a dry run: checks everything, posts nothing
 *   npm run promo:post -- <episode id> --publish  # posts it, at once
 *   npm run promo:post -- --schedule              # the schedule, and a dry run of everything on it
 *   npm run promo:post -- --due                   # posts the next Reel whose time has come (the launchd job)
 *
 * Reads promo-out/<id>/<id>.mp4, its cover time (cover.json, from the
 * assembler) and the caption in scripts/promo/captions/<id>.txt. The token is
 * INSTAGRAM_SYSTEM_USER_TOKEN in .env.local, a system user of the Dungeon
 * Grimoire business portfolio; it is never printed. A posted Reel leaves
 * promo-out/<id>/posted.json, and the command refuses to post it twice
 * unless given --again. See docs/promo-videos.md, "Posting".
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { durationOf } from "./compose/ffmpeg";
import { execFileSync } from "node:child_process";
import { captionProblems, findAccount, postsLeft, publish, uploadReel } from "./instagram";
import { nextDue, parseSchedule } from "./schedule";
import type { EpisodeManifest } from "./types";

const VOICE_EXTS = [".wav", ".m4a", ".mp3", ".aif"];

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

const SCHEDULE_FILE = resolve("scripts/promo/schedule.json");

function postedIds(root: string, ids: string[]): Set<string> {
  return new Set(ids.filter((id) => existsSync(join(root, id, "posted.json"))));
}

/** A macOS notification, so a post (or a failure) made by the hourly job while nobody is watching is still seen. */
function notify(title: string, message: string) {
  try {
    execFileSync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`]);
  } catch {
    // Not on a Mac, or no notification permission: the log line is the record.
  }
}

async function postEpisode(token: string, root: string, id: string, opts: { publishNow: boolean; again: boolean }): Promise<string | null> {
  const { publishNow, again } = opts;
  const dir = join(root, id);
  const video = join(dir, `${id}.mp4`);
  const coverFile = join(dir, "cover.json");
  const captionFile = resolve("scripts/promo/captions", `${id}.txt`);
  const postedFile = join(dir, "posted.json");
  for (const f of [join(dir, "manifest.json"), video, coverFile, captionFile]) {
    if (!existsSync(f)) throw new Error(`Missing ${f}${f === coverFile ? " (assemble the episode again; older builds did not write it)" : ""}`);
  }
  if (existsSync(postedFile) && !again) {
    const posted = JSON.parse(readFileSync(postedFile, "utf8")) as { permalink: string; postedAt: string };
    throw new Error(`${id} was already posted on ${posted.postedAt}: ${posted.permalink}. Pass --again to post it a second time.`);
  }

  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as EpisodeManifest;
  if ((manifest.format ?? "reel") !== "reel") throw new Error(`${id} is a ${manifest.format} video; only Reels go to Instagram.`);

  // A shot with no take means the .mp4 is a silent draft; a take newer than the .mp4 means the build is stale.
  const voDir = join(dir, "vo");
  const takes = existsSync(voDir) ? readdirSync(voDir).filter((f) => VOICE_EXTS.some((e) => f.endsWith(e))) : [];
  const unvoiced = manifest.shots.filter((s) => !takes.some((t) => t.replace(/\.[^.]+$/, "") === s.id)).map((s) => s.id);
  if (unvoiced.length > 0) throw new Error(`${id} has no voice take for: ${unvoiced.join(", ")}. That build is a silent draft.`);
  const builtAt = statSync(video).mtimeMs;
  const stale = takes.filter((t) => statSync(join(voDir, t)).mtimeMs > builtAt);
  if (stale.length > 0) throw new Error(`Takes newer than ${id}.mp4: ${stale.join(", ")}. Assemble it again first.`);

  const caption = readFileSync(captionFile, "utf8").trimEnd();
  const problems = captionProblems(caption);
  if (problems.length > 0) throw new Error(`The caption in ${captionFile} would not post as written:\n  ${problems.join("\n  ")}`);
  const { at: coverAt } = JSON.parse(readFileSync(coverFile, "utf8")) as { at: number };

  const account = await findAccount(token);
  const quota = await postsLeft(token, account.id);
  const bytes = readFileSync(video);
  console.log(`account   @${account.username}`);
  console.log(`video     ${video} (${durationOf(video).toFixed(1)} s, ${(bytes.byteLength / 1e6).toFixed(1)} MB)`);
  console.log(`cover     the frame at ${coverAt.toFixed(2)} s (cover.jpg)`);
  console.log(`quota     ${quota.used} of ${quota.total} posts used in the last 24 hours`);
  console.log(`caption\n\n${caption}\n`);
  if (quota.used >= quota.total) throw new Error("No posts left in the 24-hour limit.");
  if (!publishNow) {
    console.log("Dry run: nothing was posted. Add --publish to post it now.");
    return null;
  }

  const containerId = await uploadReel(token, account.id, { video: bytes, caption, coverAtMs: coverAt * 1000 }, (l) => console.log(l));
  const { mediaId, permalink } = await publish(token, account.id, containerId);
  writeFileSync(postedFile, JSON.stringify({ id, account: account.username, mediaId, permalink, postedAt: new Date().toISOString() }, null, 2) + "\n");
  console.log(`posted    ${permalink}`);
  return permalink;
}

async function main() {
  const { id, root, publishNow, again, mode } = parseArgs(process.argv.slice(2));
  const token = process.env.INSTAGRAM_SYSTEM_USER_TOKEN;
  if (!token) throw new Error("INSTAGRAM_SYSTEM_USER_TOKEN is not set. Run through `npm run promo:post`, which loads .env.local.");
  if (mode === "one" && id) {
    await postEpisode(token, root, id, { publishNow, again });
    return;
  }

  const schedule = parseSchedule(JSON.parse(readFileSync(SCHEDULE_FILE, "utf8")));
  const posted = postedIds(root, schedule.map((e) => e.id));
  if (mode === "schedule") {
    for (const e of [...schedule].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      const when = new Date(e.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      console.log(`\n=== ${when}  ${e.id}${posted.has(e.id) ? "  (posted)" : ""}`);
      if (!posted.has(e.id)) await postEpisode(token, root, e.id, { publishNow: false, again: false });
    }
    return;
  }

  const due = nextDue(schedule, posted, new Date());
  const stamp = new Date().toISOString();
  if (!due) {
    console.log(`${stamp} nothing due`);
    return;
  }
  console.log(`${stamp} posting ${due.id}, planned for ${due.at}`);
  try {
    const permalink = await postEpisode(token, root, due.id, { publishNow: true, again: false });
    notify("Grimoire Reel posted", `${due.id}: ${permalink}`);
  } catch (e) {
    notify("Grimoire Reel NOT posted", `${due.id}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
