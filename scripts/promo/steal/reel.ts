/**
 * The Reel that draws strangers to a "Steal this" carousel. Instagram shows a
 * new account's Reels to people who do not follow it and its photo posts to
 * almost nobody (6 Nov 2026: a carousel had 8 views in a day, the next Reel
 * 103 in three hours), so each creature goes out twice: this Reel for reach,
 * and the carousel on the profile for whoever it sends there.
 *
 * It opens on the creature's Card Forge card with its hook, flips it to the
 * stats on the back, says where the rest is, and flips back, so its last frame
 * is its first and Instagram's loop has no seam. A card rather than the
 * bare art, because the art alone sells a picture; the stats sell a monster
 * (the maintainer, 8 Nov 2026).
 *
 *   tsx --tsconfig tsconfig.node.json scripts/promo/steal/reel.ts [post id]
 *
 * Needs slides.ts (the art) and cards.ts (the card, as Card Forge's own PNG export) to have run.
 * The page is one timeline of Web Animations, paused and stepped a frame at a
 * time, so every frame is exact. Writes promo-out/<post id>-reel/ with <id>.mp4,
 * cover.jpg, cover.json and a manifest.json, so promo:post and the Socials tab
 * treat it as any other Reel.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { durationOf, ffmpeg, loudnessOf } from "../compose/ffmpeg";
import type { EpisodeManifest } from "../types";
import { STEAL_POSTS, type StealPost } from "./posts";

const W = 1080;
const H = 1920;
const FPS = 30;
const SECONDS = 17;
/** The card face up with its hook: the frame Instagram shows as the cover. */
const COVER_AT = 3;
const ROOT = resolve(".");
const url = (path: string) => pathToFileURL(path).href;
const FONTS = `
@font-face { font-family: Fondamento; src: url("${url(join(ROOT, "node_modules/@fontsource/fondamento/files/fondamento-latin-400-normal.woff2"))}"); }
@font-face { font-family: "Alegreya Sans"; font-weight: 700; src: url("${url(join(ROOT, "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-700-normal.woff2"))}"); }`;
const WORDMARK = url(join(ROOT, "art-src/brand/dg-wordmark-dark.svg"));
/**
 * The sound is the creature's own place from the soundboard library and a paper flick on each
 * turn of the card, not a tune (the maintainer was unsure of a brand tune under it, 8 Nov 2026).
 */
const LIBRARY = "https://cdn.dungeongrimoire.com/sounds/library";
const FLIP_SOUND = "foley/sfx-100-pack--paper-02";
/** When each turn of the card starts, in seconds: the flick lands on it. */
const FLIPS_AT = [5.2, 14.4];
const PROFILE_LINE = "The read-aloud, the stat block and a printable card are on our profile.";
/** The card's style and size in Card Forge (cards.ts captures every pair). */
const CARD = "inked-mtg";

/*
 * Instagram lays its own buttons and caption over a Reel's bottom fifth and its
 * header over the top, so everything that must be read sits between 13% and 80%.
 */
const CARD_W = 700;
const css = `${FONTS}
html, body { margin: 0; background: #15110d; }
.frame { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; font-family: "Alegreya Sans", sans-serif; color: #f1e4c8; }
.bg { position: absolute; inset: -80px; background-size: cover; background-position: center; filter: blur(44px) brightness(.4) saturate(1.1); }
.kicker { position: absolute; left: 0; right: 0; top: 250px; text-align: center; font-size: 38px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e2bd62; text-shadow: 0 2px 16px rgba(0,0,0,.6); }
.stage { position: absolute; left: 50%; top: 330px; width: ${CARD_W}px; aspect-ratio: 744 / 1041; margin-left: -${CARD_W / 2}px; perspective: 2400px; }
.card { position: absolute; inset: 0; transform-style: preserve-3d; }
/* The export has transparent rounded corners, so the shadow follows its outline. */
.face { position: absolute; inset: 0; width: 100%; height: 100%; backface-visibility: hidden; filter: drop-shadow(0 34px 44px rgba(0,0,0,.65)); }
.back { transform: rotateY(180deg); }
.line { position: absolute; left: 90px; right: 90px; top: 1340px; height: 180px; display: flex; align-items: center; justify-content: center; text-align: center; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.7); }
.hook { font-family: Fondamento, serif; font-size: 72px; line-height: 1.04; }
.profile { font-size: 42px; line-height: 1.25; font-weight: 700; }
.brand { position: absolute; left: 50%; top: 1530px; transform: translateX(-50%); width: 240px; }`;

function page(post: StealPost, art: string, front: string, back: string): string {
  return `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div class="frame">
  <div class="bg" style="background-image:url('${url(art)}')"></div>
  <div class="kicker">${post.kicker}</div>
  <div class="stage"><div class="card"><img class="face" src="${url(front)}"><img class="face back" src="${url(back)}"></div></div>
  <div class="line hook">${post.hook}</div>
  <div class="line profile">${PROFILE_LINE}</div>
  <img class="brand" src="${WORDMARK}">
</div>`;
}

/**
 * The timeline, in seconds. Each entry animates one element over the whole Reel
 * with keyframes at `offset = t / SECONDS`, so stepping `currentTime` lands every
 * element at the same moment.
 */
const at = (t: number) => t / SECONDS;
/** A Web Animations keyframe, as the page reads it (the scripts' tsconfig has no DOM types). */
type Frame = { offset: number; opacity?: number; transform?: string; easing?: string };
const TIMELINE: Array<{ selector: string; keyframes: Frame[] }> = [
  // The card drifts a little the whole time, so a still never reads as a slide, and is back where it began at the end.
  { selector: ".stage", keyframes: [{ transform: "scale(1)", offset: 0 }, { transform: "scale(1.04)", offset: at(8.5) }, { transform: "scale(1)", offset: 1 }] },
  {
    selector: ".card",
    keyframes: [
      { transform: "rotateY(-6deg)", offset: 0 },
      { transform: "rotateY(4deg)", offset: at(5.2), easing: "cubic-bezier(.5,0,.3,1)" },
      { transform: "rotateY(174deg)", offset: at(6.3) },
      { transform: "rotateY(184deg)", offset: at(14.4), easing: "cubic-bezier(.5,0,.3,1)" },
      { transform: "rotateY(348deg)", offset: at(15.5) },
      // 354 is -6 once round: the loop's first frame.
      { transform: "rotateY(354deg)", offset: 1 },
    ],
  },
  {
    selector: ".hook",
    keyframes: [
      { opacity: 0, transform: "translateY(16px)", offset: 0 },
      { opacity: 0, transform: "translateY(16px)", offset: at(0.9) },
      { opacity: 1, transform: "translateY(0)", offset: at(1.6) },
      { opacity: 1, transform: "translateY(0)", offset: at(4.8) },
      { opacity: 0, transform: "translateY(0)", offset: at(5.3) },
      { opacity: 0, offset: 1 },
    ],
  },
  ...[".profile", ".brand"].map((selector) => ({
    selector,
    keyframes: [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: at(10.4) },
      { opacity: 1, offset: at(11.2) },
      { opacity: 1, offset: at(13.9) },
      { opacity: 0, offset: at(14.4) },
      { opacity: 0, offset: 1 },
    ],
  })),
];

/** A library sound, fetched once from the CDN into `dir`. */
async function librarySound(slug: string, dir: string): Promise<string> {
  const file = join(dir, `${slug.replace(/\//g, "_")}.ogg`);
  if (!existsSync(file)) {
    const res = await fetch(`${LIBRARY}/${slug}.ogg`);
    if (!res.ok) throw new Error(`library sound ${slug}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

async function render(post: StealPost) {
  const source = resolve("promo-out", post.id);
  const artFile = readdirSync(source).find((f) => f.startsWith("art."));
  const front = join(source, "pages", `card-${CARD}-front.png`);
  const back = join(source, "pages", `card-${CARD}-back.png`);
  if (!artFile) throw new Error(`${post.id}: no art yet; run slides.ts first`);
  if (!existsSync(front) || !existsSync(back)) throw new Error(`${post.id}: no Card Forge card yet; run cards.ts first`);
  const id = `${post.id}-reel`;
  const dir = resolve("promo-out", id);
  const work = join(dir, "work");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const html = join(work, "reel.html");
  writeFileSync(html, page(post, join(source, artFile), front, back));
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await tab.goto(url(html));
    // Page code goes in as strings: the scripts' tsconfig has no DOM types.
    await tab.evaluate("document.fonts.ready");
    await tab.waitForTimeout(300);
    await tab.evaluate(`for (const { selector, keyframes } of ${JSON.stringify(TIMELINE)}) {
      const el = document.querySelector(selector);
      if (el) el.animate(keyframes, { duration: ${SECONDS * 1000}, fill: "both" }).pause();
    }`);
    const frames = SECONDS * FPS;
    for (let f = 0; f < frames; f++) {
      await tab.evaluate(`for (const a of document.getAnimations()) a.currentTime = ${(f * 1000) / FPS};`);
      await tab.screenshot({ path: join(work, `f${String(f).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    }
  } finally {
    await browser.close();
  }

  const ambience = await librarySound(post.ambience, work);
  const flip = await librarySound(FLIP_SOUND, work);
  const bed = join(work, "bed.wav");
  ffmpeg([
    "-stream_loop", "-1", "-i", ambience, "-i", flip,
    "-filter_complex",
    [
      `[0:a]atrim=0:${SECONDS},afade=t=in:d=0.6,afade=t=out:st=${SECONDS - 1.2}:d=1.2,aresample=48000,aformat=channel_layouts=stereo[amb]`,
      `[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=${FLIPS_AT.length}${FLIPS_AT.map((_, i) => `[f${i}]`).join("")}`,
      ...FLIPS_AT.map((t, i) => `[f${i}]adelay=${Math.round(t * 1000)}:all=1[d${i}]`),
      `[amb]${FLIPS_AT.map((_, i) => `[d${i}]`).join("")}amix=inputs=${FLIPS_AT.length + 1}:duration=first:normalize=0[mix]`,
    ].join(";"),
    "-map", "[mix]", "-t", String(SECONDS), bed,
  ]);
  const gain = -14 - loudnessOf(bed);
  const out = join(dir, `${id}.mp4`);
  ffmpeg([
    "-framerate", String(FPS), "-i", join(work, "f%04d.jpg"), "-i", bed,
    "-filter_complex", `[1:a]volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false[aud]`,
    "-map", "0:v", "-map", "[aud]", "-t", String(SECONDS),
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", String(FPS),
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
