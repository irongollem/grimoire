/**
 * Films a promo episode: `npm run promo:record -- <episode id> [--shot <id>]`.
 *
 * Writes `promo-out/<id>/` with one silent clip per shot, `manifest.json` for
 * the assembler, and `script.md` for whoever records the voice-over. Needs the
 * local stack (`npm run db:start`, `npm run dev:auth`, `npm run dev:demo`); it
 * starts its own app server. See docs/promo-videos.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { EPISODES } from "./episodes/index.ts";
import { demoCampaignId } from "./setup/demo.ts";
import { startPromoServer } from "./server.ts";
import { DEVICES } from "./devices.ts";
import { launch, launchOffstage, openOffstage, openStage, type Stage } from "./stage.ts";
import type { Account, Device, EpisodeManifest, Offstage, RecordedShot } from "./types.ts";
import type { Browser } from "playwright";

/** Words a narrator says per second at an easy pace; sizes the target length in the script. */
const WORDS_PER_SECOND = 2.5;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { shot: { type: "string" }, root: { type: "string", default: "promo-out" } },
});
const id = positionals[0];
const episode = EPISODES.find((e) => e.id === id);
if (!episode) {
  console.error(`Usage: npm run promo:record -- <episode> [--shot <id>]\nEpisodes: ${EPISODES.map((e) => e.id).join(", ")}`);
  process.exit(1);
}

const dir = resolve(values.root, episode.id);
mkdirSync(join(dir, "shots"), { recursive: true });
mkdirSync(join(dir, "vo"), { recursive: true });

// Re-filming one shot keeps the others from the last full run.
const manifestPath = join(dir, "manifest.json");
const previous: EpisodeManifest | null =
  values.shot && existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf8")) as EpisodeManifest) : null;
if (values.shot && !episode.shots.some((s) => s.id === values.shot)) {
  console.error(`No shot "${values.shot}" in ${episode.id}: ${episode.shots.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

await episode.setup?.();
const campaignId = demoCampaignId();
// PROMO_BASE_URL films an app server you run yourself; by default the take gets its own (see server.ts).
const external = process.env.PROMO_BASE_URL;
const server = external === undefined ? await startPromoServer() : null;
const base = server?.base ?? external ?? "";
const seed = episode.seed ?? 1;
const filmedAs = episode.account;

// A headed Chrome renders at one device scale per browser, so a browser is launched
// for each scale the episode uses, and a signed-in stage for each device, on first need.
const browsers = new Map<number, Browser>();
const stages = new Map<Device, Stage>();
const offstages = new Map<Account, Offstage>();
let quiet: Browser | null = null;

async function stageFor(device: Device): Promise<Stage> {
  const have = stages.get(device);
  if (have) return have;
  const scale = DEVICES[device].scale;
  let browser = browsers.get(scale);
  if (!browser) {
    browser = await launch(scale);
    browsers.set(scale, browser);
  }
  const stage = await openStage(browser, { base, account: filmedAs, device, campaignId, seed, scratch: join(dir, ".scratch"), offstage });
  stages.set(device, stage);
  return stage;
}

/** The other person at the table, signed in as the other account; opened by the first shot that asks. */
async function offstage(account: Account): Promise<Offstage> {
  const have = offstages.get(account);
  if (have) return have;
  quiet ??= await launchOffstage();
  const actor = await openOffstage(quiet, { base, account, campaignId, seed });
  offstages.set(account, actor);
  return actor;
}

const recorded: RecordedShot[] = [];
try {
  await episode.prepare?.({ offstage });
  for (const shot of episode.shots) {
    const device = shot.device ?? episode.device ?? "phone";
    const stage = await stageFor(device);
    // A shot continues from the state the previous one left, so every shot
    // before the chosen one still runs; only the filming is skipped.
    if (shot.startAt) await stage.open(shot.startAt);
    else if (stage.page.url() === "about:blank") throw new Error(`Shot "${shot.id}" is the first on the ${device} and needs a startAt.`);
    const out = join(dir, "shots", `${shot.id}.mp4`);
    const keep = values.shot && values.shot !== shot.id ? previous?.shots.find((s) => s.id === shot.id) : undefined;
    console.log(`${keep ? "running" : "filming"} ${shot.id} (${device})`);
    const { duration, size, camera, cues } = await stage.film(keep ? join(dir, ".scratch", "discard.mp4") : out, shot.run);
    recorded.push(
      keep
        ? { ...keep, caption: shot.caption, narration: shot.narration }
        : {
            id: shot.id,
            caption: shot.caption,
            narration: shot.narration,
            file: `shots/${shot.id}.mp4`,
            device,
            size,
            ...(camera.length > 0 ? { camera } : {}),
            duration,
            cues,
          },
    );
  }
} finally {
  // Teardown puts the local app back as it was (an open session left behind
  // makes the next take hit "session already open"), so nothing before it may
  // skip it: a browser that already died rejects its close. It runs after the
  // pages are shut, so none of them writes again behind the sweep.
  try {
    for (const browser of [...browsers.values(), ...(quiet ? [quiet] : [])]) await browser.close().catch(() => undefined);
    await server?.close();
  } finally {
    await episode.teardown?.();
  }
}

const manifest: EpisodeManifest = {
  id: episode.id,
  title: episode.title,
  pairedWith: episode.pairedWith ?? null,
  account: episode.account,
  recordedAt: new Date().toISOString(),
  shots: recorded,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
writeFileSync(join(dir, "script.md"), scriptMarkdown(manifest));
console.log(`\nWrote ${dir}\nRecord the narration into vo/<shot id>.m4a (or .wav/.mp3), then: npm run promo:assemble -- ${episode.id}`);

function scriptMarkdown(m: EpisodeManifest): string {
  const lines = [`# ${m.title}`, "", `Episode \`${m.id}\`${m.pairedWith ? `, paired with \`${m.pairedWith}\`` : ""}. One take per shot, saved as \`vo/<shot>.m4a\`.`, ""];
  for (const s of m.shots) {
    const words = s.narration.split(/\s+/).filter(Boolean).length;
    lines.push(
      `## ${s.id}`,
      "",
      `On screen: "${s.caption}"`,
      "",
      `> ${s.narration}`,
      "",
      `About ${Math.ceil(words / WORDS_PER_SECOND)} s spoken; the clip is ${s.duration.toFixed(1)} s (the picture holds if you run longer).`,
      "",
    );
  }
  return lines.join("\n");
}
