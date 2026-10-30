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
import { launch, openStage } from "./stage.ts";
import type { EpisodeManifest, RecordedShot } from "./types.ts";

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
const browser = await launch();
const recorded: RecordedShot[] = [];
try {
  const stage = await openStage(browser, { base, account: episode.account, campaignId, seed: episode.seed ?? 1, scratch: join(dir, ".scratch") });
  for (const shot of episode.shots) {
    // A shot continues from the state the previous one left, so every shot
    // before the chosen one still runs; only the filming is skipped.
    if (shot.startAt) await stage.open(shot.startAt);
    const out = join(dir, "shots", `${shot.id}.mp4`);
    const keep = values.shot && values.shot !== shot.id ? previous?.shots.find((s) => s.id === shot.id) : undefined;
    console.log(`${keep ? "running" : "filming"} ${shot.id}`);
    const { duration, cues } = await stage.film(keep ? join(dir, ".scratch", "discard.mp4") : out, shot.run);
    recorded.push(
      keep
        ? { ...keep, caption: shot.caption, narration: shot.narration }
        : { id: shot.id, caption: shot.caption, narration: shot.narration, file: `shots/${shot.id}.mp4`, duration, cues },
    );
  }
} finally {
  await browser.close();
  await server?.close();
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
