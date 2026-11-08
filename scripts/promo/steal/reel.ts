/**
 * The Reel that draws strangers to a "Steal this" carousel. Instagram shows a
 * new account's Reels to people who do not follow it and its photo posts to
 * almost nobody (6 Nov 2026: a carousel had 8 views in a day, the next Reel
 * 103 in three hours), so each creature goes out twice: this Reel for reach,
 * and the carousel on the profile for whoever it sends there.
 *
 * It only teases the creature: its art, what it is, its hook, then where the
 * rest is. The page, the stat block and the card stay in the carousel.
 *
 *   tsx --tsconfig tsconfig.node.json scripts/promo/steal/reel.ts [post id]
 *
 * Needs slides.ts to have run (it fetched the art). Writes promo-out/<post id>-reel/
 * with <id>.mp4, cover.jpg, cover.json and a manifest.json, so promo:post and the
 * Socials tab treat it as any other Reel.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { durationOf, ffmpeg, loudnessOf } from "../compose/ffmpeg";
import type { EpisodeManifest } from "../types";
import { STEAL_POSTS, type StealPost } from "./posts";

const W = 1080;
const H = 1920;
const FPS = 30;
const SECONDS = 12;
/** When the hook is up and the profile line not yet: the frame Instagram shows as the cover. */
const COVER_AT = 3;
const ROOT = resolve(".");
const url = (path: string) => pathToFileURL(path).href;
const FONTS = `
@font-face { font-family: Fondamento; src: url("${url(join(ROOT, "node_modules/@fontsource/fondamento/files/fondamento-latin-400-normal.woff2"))}"); }
@font-face { font-family: "Alegreya Sans"; font-weight: 700; src: url("${url(join(ROOT, "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-700-normal.woff2"))}"); }`;
const WORDMARK = url(join(ROOT, "art-src/brand/dg-wordmark-dark.svg"));
/** The bed under it: a brand tune from its middle, so neither its opening nor its ending is heard. */
const BED = join(ROOT, "promo-out/brand/bed-1.mp3");
const BED_FROM = 60;
const PROFILE_LINE = "The read-aloud, the stat block and a printable card are on our profile.";

/*
 * Instagram lays its own buttons and caption over a Reel's bottom fifth and its
 * header over the top, so everything that must be read sits between 14% and 78%.
 * The art is a portrait card rather than full bleed: the demo's Memory-Magpie is
 * 400 x 500, and a card keeps its upscale under 1.7x.
 */
const CARD = { top: 380, width: 660 };
const css = `${FONTS}
html, body { margin: 0; background: transparent; }
.frame { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; font-family: "Alegreya Sans", sans-serif; color: #f1e4c8; }
.bg { position: absolute; inset: -60px; background-size: cover; background-position: center; filter: blur(40px) brightness(.42) saturate(1.1); }
.card { position: absolute; left: 50%; top: ${CARD.top}px; width: ${CARD.width}px; transform: translateX(-50%); border-radius: 18px; box-shadow: 0 40px 90px rgba(0,0,0,.7); }
.kicker { position: absolute; left: 0; right: 0; top: 290px; text-align: center; font-size: 34px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e2bd62; text-shadow: 0 2px 16px rgba(0,0,0,.6); }
.line { position: absolute; left: 90px; right: 90px; top: 1290px; height: 200px; display: flex; align-items: center; justify-content: center; text-align: center; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.7); }
.hook { font-family: Fondamento, serif; font-size: 76px; line-height: 1.04; }
.profile { font-size: 44px; line-height: 1.25; font-weight: 700; color: #f1e4c8; }
.brand { position: absolute; left: 50%; top: 1510px; transform: translateX(-50%); width: 260px; opacity: .9; }`;

const doc = (body: string) => `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="frame">${body}</div>`;

/** The layers, each a full frame: the picture moves slowly, the words hold still over it. */
function layers(post: StealPost, art: string): Record<string, string> {
  return {
    picture: doc(`<div class="bg" style="background-image:url('${url(art)}')"></div><img class="card" src="${url(art)}">`),
    kicker: doc(`<div class="kicker">${post.kicker}</div>`),
    hook: doc(`<div class="line hook">${post.hook}</div>`),
    profile: doc(`<div class="line profile">${PROFILE_LINE}</div><img class="brand" src="${WORDMARK}">`),
  };
}

/** Fade a layer in at `inAt` and, when given, out at `outAt`, each over `f` seconds. */
const fade = (label: string, inAt: number, outAt: number | null, f = 0.6) =>
  `format=rgba,fade=t=in:st=${inAt}:d=${f}:alpha=1${outAt === null ? "" : `,fade=t=out:st=${outAt}:d=${f}:alpha=1`}[${label}]`;

async function render(post: StealPost) {
  const source = resolve("promo-out", post.id);
  const artFile = readdirSync(source).find((f) => f.startsWith("art."));
  if (!artFile) throw new Error(`${post.id}: no art yet; run slides.ts first`);
  const id = `${post.id}-reel`;
  const dir = resolve("promo-out", id);
  const work = join(dir, "work");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const [name, html] of Object.entries(layers(post, join(source, artFile)))) {
      // The picture at twice the size, so the slow push-in has pixels to spare and does not shimmer.
      const scale = name === "picture" ? 2 : 1;
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      const file = join(work, `${name}.html`);
      writeFileSync(file, html);
      await page.goto(url(file));
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(work, `${name}.png`), omitBackground: name !== "picture" });
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const frames = SECONDS * FPS;
  const out = join(dir, `${id}.mp4`);
  const mix = join(work, "bed.wav");
  ffmpeg([
    "-ss", String(BED_FROM), "-t", String(SECONDS), "-i", BED,
    "-af", `afade=t=in:d=0.5,afade=t=out:st=${SECONDS - 1.5}:d=1.5,aresample=48000`, "-ac", "2", mix,
  ]);
  const gain = -14 - loudnessOf(mix);
  ffmpeg([
    "-loop", "1", "-i", join(work, "picture.png"),
    "-loop", "1", "-i", join(work, "kicker.png"),
    "-loop", "1", "-i", join(work, "hook.png"),
    "-loop", "1", "-i", join(work, "profile.png"),
    "-i", mix,
    "-filter_complex",
    [
      `[0]zoompan=z='1+0.06*on/${frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${W}x${H}:fps=${FPS}[pic]`,
      `[1]${fade("k", 0.4, null)}`,
      `[2]${fade("h", 1.2, 6.6)}`,
      `[3]${fade("p", 7.2, null)}`,
      `[pic][k]overlay=format=auto[a];[a][h]overlay=format=auto[b];[b][p]overlay=format=auto,format=yuv420p[v]`,
      `[4:a]volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false[aud]`,
    ].join(";"),
    "-map", "[v]", "-map", "[aud]", "-t", String(SECONDS),
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-r", String(FPS),
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", out,
  ]);
  ffmpeg(["-ss", String(COVER_AT), "-i", out, "-frames:v", "1", "-q:v", "2", join(dir, "cover.jpg")]);
  writeFileSync(join(dir, "cover.json"), JSON.stringify({ at: COVER_AT }) + "\n");

  const manifest: EpisodeManifest = {
    id,
    title: post.hook,
    pairedWith: null,
    account: "dm",
    format: "reel",
    brand: false,
    recordedAt: new Date().toISOString(),
    shots: [{ id: "teaser", caption: post.hook, narration: "", file: `${id}.mp4`, device: "scene", size: { width: W, height: H }, duration: SECONDS, cues: [] }],
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  rmSync(work, { recursive: true, force: true });
  console.log(`${id}: ${durationOf(out).toFixed(2)} s in ${out}`);
}

async function main() {
  const only = process.argv[2];
  const posts = STEAL_POSTS.filter((p) => !only || p.id === only);
  if (posts.length === 0) throw new Error(`no Steal this post called ${only}`);
  for (const post of posts) await render(post);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
