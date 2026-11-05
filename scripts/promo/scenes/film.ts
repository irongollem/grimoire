/**
 * Films a picture-book scene for a Reel, or plays it in a browser to look at.
 *
 *   npm run promo:scene -- <scene id>             films promo-out/<id>/ for promo:assemble
 *   npm run promo:scene -- <scene id> --preview   serves the scene live on 127.0.0.1 and waits
 *   npm run promo:scene -- <scene id> --stills 0,6,12   writes promo-out/<id>/stills/<t>.png, to compose by eye
 *   [--art <dir>]   where the layer images are (default ~/Desktop/art-955/scenes/out)
 *   [--root <dir>]  where episodes go (default promo-out)
 *
 * Filming steps a headless page through exact frames rather than screen-recording it, so no frame is
 * dropped and every loop is identical. It writes the same manifest and shot clip a recorded episode has,
 * with the scene as one `scene` shot whose sound is the ambience, so promo:assemble and promo:post take it
 * like any Reel. See docs/promo-videos.md, "Picture-book scenes".
 */
import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";
import { chromium } from "playwright";
import { ffmpeg, STEREO_48K } from "../compose/ffmpeg.ts";
import type { EpisodeManifest, RecordedShot } from "../types.ts";
import { SCENES } from "./catalog.ts";
import { layersOf } from "../../../src/lib/bookNook/scene.ts";
import { runsToEnd, type ReelScene } from "./reel.ts";

type Ambience = NonNullable<ReelScene["sound"]>["ambience"][number];

const FPS = 30;
const HERE = dirname(fileURLToPath(import.meta.url));
/** JPEG quality of the frames handed to ffmpeg: high enough that the grain of the paint survives. */
const FRAME_QUALITY = 0.95;
/** The room sounds fade in and out at the shot's ends instead of starting and stopping on a cut. */
/** Seconds of the sound past the shot's end that are blended into its opening, so the Reel's sound loops. */
const LOOP_CROSSFADE = 1.5;
/** A cut's own fades: short, so a bell struck just before the cut's end still sounds before it fades. */
const CLIP_FADE_IN = 0.15;
const CLIP_FADE_OUT = 0.6;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    preview: { type: "boolean", default: false },
    stills: { type: "string" },
    art: { type: "string", default: join(homedir(), "Desktop/art-955/scenes/out") },
    root: { type: "string", default: "promo-out" },
  },
});
const scene = SCENES.find((s) => s.id === positionals[0]);
if (!scene) {
  console.error(`Usage: npm run promo:scene -- <scene> [--preview] [--art <dir>]\nScenes: ${SCENES.map((s) => s.id).join(", ")}`);
  process.exit(1);
}
const art = resolve(values.art);
const missing = layersOf(scene).filter((l) => !existsSync(join(art, l.src))).map((l) => l.src);
if (missing.length > 0) {
  console.error(`Scene ${scene.id} needs ${missing.join(", ")} in ${art}. Are they painted yet? (node next.mjs --count in the art folder)`);
  process.exit(1);
}

const server = await serveScene(scene, art);
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

if (values.preview) {
  console.log(`Playing ${scene.id} at ${base}/?scene=${scene.id} (Ctrl-C to stop)`);
} else if (values.stills !== undefined) {
  try {
    await writeStills(scene, base, resolve(values.root, scene.id, "stills"), values.stills.split(",").map(Number));
  } finally {
    server.close();
  }
} else {
  try {
    await filmScene(scene, base, resolve(values.root, scene.id));
  } finally {
    server.close();
  }
}

/** The scene page, its script bundled from browser/page.ts, and the layer images under /art/. */
async function serveScene(s: ReelScene, artDir: string): Promise<Server> {
  const bundle = await build({ entryPoints: [join(HERE, "browser/page.ts")], bundle: true, format: "esm", platform: "browser", write: false, logLevel: "warning" });
  const script = bundle.outputFiles[0].text;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${s.title}</title>
<style>html,body{margin:0;height:100%;background:#111}canvas{display:block;margin:0 auto;height:100vh;width:auto;max-width:100vw;object-fit:contain}body.film canvas{height:auto}</style>
<body><canvas></canvas><script>if (location.search.includes("film")) document.body.className = "film";</script><script type="module" src="/page.js"></script></body>`;
  const types: Record<string, string> = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
  const listener = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/") return void res.writeHead(200, { "content-type": "text/html" }).end(html);
    if (path === "/page.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(script);
    // Only a bare file name inside the art folder: nothing else on disk is reachable.
    const name = decodeURIComponent(path.replace(/^\/art\//, ""));
    const file = join(artDir, basename(name));
    if (!path.startsWith("/art/") || name !== basename(name) || !types[extname(name)] || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": types[extname(name)] });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((done) => listener.listen(values.preview ? 5183 : 0, "127.0.0.1", done));
  return listener;
}

/** Single frames at the given seconds, for placing layers by eye without filming the whole loop. */
async function writeStills(s: ReelScene, url: string, dir: string, times: number[]): Promise<void> {
  if (times.some((t) => !Number.isFinite(t))) throw new Error("--stills takes seconds separated by commas, such as 0,6,12");
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: s.size, deviceScaleFactor: 1 });
    await page.goto(`${url}/?scene=${s.id}&film`);
    await page.waitForFunction("window.scene !== undefined", undefined, { timeout: 15_000 });
    await page.evaluate("window.scene.ready");
    for (const t of times) {
      const png = (await page.evaluate(`window.scene.still(${t})`)) as string;
      writeFileSync(join(dir, `${t}.png`), Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
    }
    console.log(`Wrote ${times.length} stills to ${dir}`);
  } finally {
    await browser.close();
  }
}

async function filmScene(s: ReelScene, url: string, dir: string): Promise<void> {
  mkdirSync(join(dir, "shots"), { recursive: true });
  const clip = join(dir, "shots", "scene.mp4");
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: s.size, deviceScaleFactor: 1 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${url}/?scene=${s.id}&film`);
    // The page script is a module: wait for it to have set window.scene, then for the images.
    await page.waitForFunction("window.scene !== undefined", undefined, { timeout: 15_000 }).catch(() => {
      throw new Error(`The scene page did not start: ${errors.join("; ") || "no error reported"}`);
    });
    await page.evaluate("window.scene.ready");

    const encoder = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-crf", "14", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), clip],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    const encoded = new Promise<void>((done, fail) => encoder.on("close", (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`)))));
    const frames = Math.round(s.duration * FPS);
    for (let i = 0; i < frames; i++) {
      const data = (await page.evaluate(`window.scene.frame(${i / FPS}, ${FRAME_QUALITY})`)) as string;
      const jpeg = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
      if (!encoder.stdin.write(jpeg)) await new Promise((done) => encoder.stdin.once("drain", done));
      if (i % FPS === 0) process.stdout.write(`\rframe ${i} of ${frames}`);
    }
    encoder.stdin.end();
    await encoded;
    process.stdout.write(`\rframe ${frames} of ${frames}\n`);
    // The composed opening frame, for the review page beside the plate it came from.
    const still = (await page.evaluate("window.scene.still(0)")) as string;
    writeFileSync(join(dir, "still.png"), Buffer.from(still.slice(still.indexOf(",") + 1), "base64"));
    if (errors.length > 0) throw new Error(`The scene page reported: ${errors.join("; ")}`);
  } finally {
    await browser.close();
  }

  const ambience = s.sound && s.sound.ambience.length > 0 ? join(dir, "ambience.wav") : null;
  if (ambience && s.sound) mixAmbience(s.sound.ambience.map((a) => ({ ...a, src: soundSource(a.src) })), s.duration, ambience);

  const shot: RecordedShot = {
    id: "scene",
    caption: s.caption ?? "",
    ...(s.captionAt === undefined ? {} : { captionAt: s.captionAt }),
    ...(s.tagline === undefined ? {} : { tagline: s.tagline }),
    narration: "",
    file: "shots/scene.mp4",
    device: "scene",
    size: s.size,
    duration: s.duration,
    cues: ambience ? [{ t: 0, src: ambience, gain: 1 }] : [],
  };
  const manifest: EpisodeManifest = {
    id: s.id,
    title: s.title,
    pairedWith: null,
    account: "dm",
    format: "reel",
    brand: false,
    recordedAt: new Date().toISOString(),
    shots: [shot],
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${dir}\nThen: npm run promo:assemble -- ${s.id}`);
}

/** A library URL as it is, or a file in the art folder (the scene's own tune) as its path, which must exist. */
function soundSource(src: string): string {
  if (src.startsWith("https://")) return src;
  const file = join(art, basename(src));
  if (!existsSync(file)) throw new Error(`Scene sound ${src} is not in ${art}`);
  return file;
}

/**
 * The scene's sound as one wav exactly as long as the shot, that loops without a seam: Instagram plays a scene
 * Reel round and round. Everything is mixed `LOOP_CROSSFADE` seconds past the end, and that overflow is blended
 * into the opening, so the last moment runs on into the first. A looping sound simply carries on into the
 * overflow; a `clip` that reaches the end of the shot (the tune) carries on past its own end into it; a
 * shorter clip (the bells) plays once from `at`, with short fades so it neither clicks on nor stops on a cut.
 */
function mixAmbience(sounds: Ambience[], length: number, out: string): void {
  const run = length + LOOP_CROSSFADE;
  const inputs = sounds.flatMap((a) => (a.clip ? ["-i", a.src] : ["-stream_loop", "-1", "-i", a.src]));
  const chains = sounds
    .map((a, i) => {
      if (!a.clip) return `[${i}:a]${STEREO_48K},volume=${a.gain},atrim=0:${run}[s${i}]`;
      const [from, to] = a.clip;
      const at = a.at ?? 0;
      const ms = Math.round(at * 1000);
      if (runsToEnd(at, a.clip, length)) {
        return `[${i}:a]${STEREO_48K},atrim=${from}:${from + run - at},asetpts=PTS-STARTPTS,volume=${a.gain},adelay=${ms}|${ms},apad=whole_dur=${run}[s${i}]`;
      }
      const tail = Math.min(CLIP_FADE_OUT, (to - from) / 2);
      return `[${i}:a]${STEREO_48K},atrim=${from}:${to},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${CLIP_FADE_IN},afade=t=out:st=${to - from - tail}:d=${tail},volume=${a.gain},adelay=${ms}|${ms},apad=whole_dur=${run}[s${i}]`;
    })
    .join(";");
  const X = LOOP_CROSSFADE;
  const mix =
    `${sounds.map((_, i) => `[s${i}]`).join("")}amix=inputs=${sounds.length}:duration=longest:normalize=0,atrim=0:${run},asplit=3[m1][m2][m3];` +
    // Equal-power fades: the overflow and the opening are different sounds, so their powers add.
    `[m1]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[head];` +
    `[m2]atrim=${length}:${run},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[over];` +
    `[head][over]amix=inputs=2:normalize=0[joined];` +
    `[m3]atrim=${X}:${length},asetpts=PTS-STARTPTS[body];` +
    `[joined][body]concat=n=2:v=0:a=1[o]`;
  ffmpeg([...inputs, "-filter_complex", `${chains};${mix}`, "-map", "[o]", "-t", String(length), "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", out]);
}
