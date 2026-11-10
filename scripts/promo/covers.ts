/**
 * A Reel's cover for the profile grid: what the video is about, in the shape of
 * the two Workshop covers the maintainer made by hand (8 Nov 2026), which are
 * the only ones on the grid that say anything. The wordmark, the promise as a
 * small-caps headline, a pill naming whose side and which feature, and one
 * tilted crop of the screen the episode is about. A frame from the video says
 * none of that: it shows a first-shot caption the grid's crop usually cuts.
 *
 *   tsx --tsconfig tsconfig.node.json scripts/promo/covers.ts [episode id ...]
 *
 * Writes promo-out/<id>/title-cover.jpg (1080 x 1920, everything that matters
 * inside the grid's 3:4 middle). promo:post sends it as the Reel's cover
 * (publishing.ts); for a Reel already posted, set it in the Instagram app.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type { EpisodeManifest } from "./types";

const ROOT = resolve(".");
const url = (path: string) => pathToFileURL(path).href;
const font = (pkg: string, file: string) => url(join(ROOT, "node_modules/@fontsource", pkg, "files", file));

/** The screen the cover shows: a frame `fromEnd` seconds before a raw shot ends, cropped to `crop` (clip pixels). */
interface CoverSpec {
  shot: string;
  fromEnd: number;
  crop: [x: number, y: number, w: number, h: number];
  /** The headline, when the title's promise does not make one. */
  headline?: string;
}

/**
 * Per episode, the moment that is the episode's payoff. Clip pixels: a phone
 * shot is 1170 x 2078, a tablet shot 1640 x 2360, a laptop shot 2880 x 1800.
 */
export const COVERS: Record<string, CoverSpec> = {
  "combat-player": { shot: "turn", fromEnd: 1.2, crop: [0, 290, 1170, 1250] },
  "combat-dm": { shot: "damage", fromEnd: 1.2, crop: [1836, 110, 648, 1120] },
  "sheets-player": { shot: "sheet", fromEnd: 1.2, crop: [0, 140, 1170, 1120] },
  "sheets-dm": { shot: "tracker", fromEnd: 1.2, crop: [520, 270, 1300, 1060] },
  "session-player": { shot: "live", fromEnd: 1.2, crop: [40, 260, 1600, 1120] },
  "session-dm": { shot: "deck", fromEnd: 1.2, crop: [480, 1210, 1250, 520] },
  "quests-player": { shot: "objective", fromEnd: 1.2, crop: [30, 300, 1110, 1090] },
  "handouts-player": { shot: "open", fromEnd: 1.2, crop: [0, 0, 1170, 1150] },
};

/** "Combat: run the fight from one screen" → the feature and its promise, as the cover says them. */
export function coverWords(title: string, account: "dm" | "player"): { pill: string; headline: string } {
  const at = title.indexOf(": ");
  const topic = at < 0 ? title : title.slice(0, at);
  const promise = at < 0 ? "" : title.slice(at + 2);
  const sentence = promise.charAt(0).toUpperCase() + promise.slice(1);
  return {
    pill: `${account === "dm" ? "DM side" : "Player side"} · ${topic.replace(/^The /, "the ")}`,
    headline: /[.!?]$/.test(sentence) ? sentence : `${sentence}.`,
  };
}

function page(words: { pill: string; headline: string }, shotFile: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Alegreya; font-weight: 800; src: url("${font("alegreya", "alegreya-latin-800-normal.woff2")}"); }
@font-face { font-family: "Alegreya Sans"; font-weight: 700; src: url("${font("alegreya-sans", "alegreya-sans-latin-700-normal.woff2")}"); }
html, body { margin: 0; }
.frame { width: 1080px; height: 1920px; background: #f1ebe0; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; }
.mark { margin-top: 290px; width: 640px; }
.headline { margin: 34px 90px 0; font-family: Alegreya, serif; font-weight: 800; font-variant: small-caps; font-size: 92px; line-height: 1.02; text-align: center; color: #241a12; text-wrap: balance; }
.pill { margin-top: 38px; padding: 10px 34px; border: 3px solid #a87c24; border-radius: 9999px; font-family: "Alegreya Sans", sans-serif; font-weight: 700; font-size: 34px; letter-spacing: .12em; text-transform: uppercase; color: #a87c24; }
.shot { margin-top: 60px; max-width: 760px; max-height: 960px; border-radius: 14px; box-shadow: 0 30px 60px rgba(60,40,20,.28); transform: rotate(-2.5deg); }
</style><div class="frame">
  <img class="mark" src="${url(join(ROOT, "art-src/brand/dg-logo-light.png"))}">
  <div class="headline">${words.headline}</div>
  <div class="pill">${words.pill}</div>
  <img class="shot" src="${url(shotFile)}">
</div>`;
}

async function main() {
  const ids = process.argv.slice(2);
  const todo = ids.length > 0 ? ids : Object.keys(COVERS);
  const browser = await chromium.launch();
  try {
    for (const id of todo) {
      const spec = COVERS[id];
      if (!spec) throw new Error(`${id}: no cover in COVERS (covers.ts); add its shot and crop`);
      const dir = resolve("promo-out", id);
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as EpisodeManifest;
      const clip = join(dir, "shots", `${spec.shot}.mp4`);
      if (!existsSync(clip)) throw new Error(`${id}: no shot ${spec.shot} (${clip})`);
      const work = join(dir, ".cover");
      mkdirSync(work, { recursive: true });
      const shotFile = join(work, "shot.png");
      const [x, y, w, h] = spec.crop;
      execFileSync("ffmpeg", ["-v", "error", "-y", "-sseof", `-${spec.fromEnd}`, "-i", clip, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, shotFile]);
      const words = coverWords(manifest.title, manifest.account === "dm" ? "dm" : "player");
      const html = join(work, "cover.html");
      writeFileSync(html, page(spec.headline ? { ...words, headline: spec.headline } : words, shotFile));
      const tab = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
      await tab.goto(url(html));
      await tab.evaluate("document.fonts.ready");
      await tab.waitForTimeout(300);
      const png = join(work, "cover.png");
      await tab.screenshot({ path: png });
      await tab.close();
      // Instagram takes a cover as JPEG.
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, "-q:v", "2", join(dir, "title-cover.jpg")]);
      rmSync(work, { recursive: true, force: true });
      console.log(`${id}: ${join(dir, "title-cover.jpg")}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("scripts/promo/covers.ts")) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
