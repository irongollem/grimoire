/**
 * Cuts a recorded episode into the final Reel.
 *   tsx --tsconfig tsconfig.node.json scripts/promo/assemble.ts <episode id> [--no-brand] [--root <dir>]
 * Reads <root>/<id>/ (see types.ts), writes <root>/<id>/<id>.mp4 and cover.jpg.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canvasFor, homeView, planCamera, zoompanExpressions } from "./camera";
import { backdropCard, baseCard, captionCard, introCard, maskCard, outroCard, renderCards } from "./compose/cards";
import { audibleEnd, durationOf, ffmpeg, hasAudio, leadingSilence, loudnessOf, STEREO_48K } from "./compose/ffmpeg";
import { DEVICES } from "./devices";
import { gainExpression, planTheme } from "./theme";
import { planTimeline, VO_LEAD, type PlannedShot, type ShotInput } from "./timeline";
import type { Device, EpisodeManifest, RecordedShot } from "./types";

const INTERMEDIATE = ["-c:v", "libx264", "-crf", "14", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30", "-g", "30", "-an"];
const WAV = ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"];
const BG = "0xf2ece0";

function parseArgs(argv: string[]) {
  let root = "promo-out";
  let brand = true;
  let id: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-brand") brand = false;
    else if (argv[i] === "--root") root = argv[++i] ?? root;
    else if (!argv[i].startsWith("--")) id = argv[i];
  }
  if (!id) throw new Error("Usage: assemble.ts <episode id> [--no-brand] [--root <dir>]");
  return { id, root: resolve(root), brand };
}

function findFirst(dir: string, stem: string, exts: string[]): string | null {
  for (const e of exts) {
    const p = join(dir, `${stem}.${e}`);
    if (existsSync(p)) return p;
  }
  return null;
}

const silence = (seconds: number) => ["-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=r=48000:cl=stereo"];

/** The camera's canvas for a recorded shot: its screen on paper in the window's shape. */
function canvasOf(shot: RecordedShot) {
  const { window: w } = DEVICES[shot.device ?? "phone"];
  if (!shot.size) throw new Error(`Shot ${shot.id} has camera moves but no recorded size: re-film it.`);
  return canvasFor(shot.size, { width: w.w, height: w.h });
}

/** The silent screen-in-frame video for one shot. */
function renderShotVideo(p: PlannedShot, shot: RecordedShot, clip: string, work: string, out: string): void {
  const device: Device = shot.device ?? "phone";
  const spec = DEVICES[device];
  const { x, y, w, h } = spec.window;
  const L = p.length;
  // A frozen last frame holds the screen, and with it wherever the camera ended.
  const hold = p.freeze > 0 ? `tpad=stop_mode=clone:stop_duration=${p.freeze},` : "";
  const loop = (file: string) => ["-loop", "1", "-framerate", "30", "-t", String(L), "-i", file];
  const camera = (shot.camera?.length ?? 0) > 0 || !spec.framed;
  if (!camera) {
    ffmpeg([
      ...loop(join(work, `base-${device}.png`)),
      "-i", clip,
      ...loop(join(work, `mask-${device}.png`)),
      ...loop(join(work, `caption-${p.id}.png`)),
      "-filter_complex",
      `[1:v]fps=30,scale=${w}:${h},${hold}trim=duration=${L},setpts=PTS-STARTPTS,format=yuva420p[c];` +
        `[2:v]format=gray[m];[c][m]alphamerge[s];` +
        `[0:v][s]overlay=${x}:${y}:format=auto[a];[a][3:v]overlay=0:230:format=auto,format=yuv420p[v]`,
      "-map", "[v]", "-t", String(L), ...INTERMEDIATE, out,
    ]);
    return;
  }
  // Camera: the screen goes onto its backdrop, zoompan crops a window out of that, and the window goes on the page.
  const canvas = canvasOf(shot);
  if (!shot.size) throw new Error(`Shot ${shot.id} has no recorded size: re-film it.`);
  const size = shot.size;
  const home = homeView(canvas, size, spec.sidebar * spec.scale);
  const { z, x: zx, y: zy } = zoompanExpressions(planCamera(shot.camera ?? [], canvas, home, (inset) => homeView(canvas, size, inset)), canvas, home);
  const window =
    `[4:v]format=yuv420p[bd];[1:v]fps=30,${hold}trim=duration=${L},setpts=PTS-STARTPTS,format=yuv420p[c];` +
    `[bd][c]overlay=${canvas.screenX}:${canvas.screenY}[cv];` +
    `[cv]zoompan=z='${z}':x='${zx}':y='${zy}':d=1:s=${w}x${h}:fps=30[zp]`;
  const place = spec.framed
    ? `[zp]format=yuva420p[zv];[2:v]format=gray[m];[zv][m]alphamerge[s];[0:v][s]overlay=${x}:${y}:format=auto[a]`
    : `[0:v][zp]overlay=${x}:${y}[a]`;
  ffmpeg([
    ...loop(join(work, `base-${device}.png`)),
    "-i", clip,
    ...loop(spec.framed ? join(work, `mask-${device}.png`) : join(work, `base-${device}.png`)),
    ...loop(join(work, `caption-${p.id}.png`)),
    ...loop(join(work, `backdrop-${p.id}.png`)),
    "-filter_complex", `${window};${place};[a][3:v]overlay=0:230:format=auto,format=yuv420p[v]`,
    "-map", "[v]", "-t", String(L), ...INTERMEDIATE, out,
  ]);
}

/**
 * The cleanup every take gets on its way into the Reel (the recording itself
 * stays untouched): cut rumble below 80 Hz, remove mouth clicks, soften the
 * sibilants, and even the level a little. Chosen by ear against a raw take
 * from the maintainer's condenser mic.
 */
const VOICE_POLISH =
  "highpass=f=80,adeclick=window=55:overlap=75:arorder=2:threshold=2,deesser=i=0.4,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2";

/** Narration for one shot as a wav exactly as long as the shot. */
function renderVoWav(p: PlannedShot, vo: string | null, out: string): void {
  if (!vo) return ffmpeg([...silence(p.length), ...WAV, out]);
  const ms = Math.round(VO_LEAD * 1000);
  ffmpeg(["-i", vo, "-af", `${VOICE_POLISH},${STEREO_48K},adelay=${ms}|${ms},apad=whole_dur=${p.length},atrim=0:${p.length}`, ...WAV, out]);
}

/** Sound cues for one shot as a wav exactly as long as the shot. */
function renderFxWav(p: PlannedShot, out: string): void {
  if (p.cues.length === 0) return ffmpeg([...silence(p.length), ...WAV, out]);
  const inputs = p.cues.flatMap((c) => ["-i", c.src]);
  const chains = p.cues.map((c, i) => {
    const ms = Math.round(c.local * 1000);
    return `[${i + 1}:a]${STEREO_48K},volume=${c.gain},adelay=${ms}|${ms}[c${i}]`;
  });
  const labels = p.cues.map((_, i) => `[c${i}]`).join("");
  ffmpeg([
    ...silence(p.length), ...inputs, "-filter_complex",
    `${chains.join(";")};[0:a]${labels}amix=inputs=${p.cues.length + 1}:duration=first:normalize=0,atrim=0:${p.length}[o]`,
    "-map", "[o]", ...WAV, out,
  ]);
}

interface BrandSeg { video: string; audio: string; length: number }

/** A brand clip or a placeholder card, as a 1080x1920 30 fps video plus a wav. */
function renderBrandSegment(name: string, file: string | null, card: string, cardLength: number, work: string): BrandSeg {
  const video = join(work, `${name}.mp4`);
  const audio = join(work, `${name}.wav`);
  if (file) {
    const vf = `fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1`;
    ffmpeg(["-i", file, "-vf", vf, ...INTERMEDIATE, video]);
    const length = durationOf(video);
    if (hasAudio(file)) ffmpeg(["-i", file, "-af", `${STEREO_48K},apad=whole_dur=${length},atrim=0:${length}`, ...WAV, audio]);
    else ffmpeg([...silence(length), ...WAV, audio]);
    return { video, audio, length };
  }
  ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(cardLength), "-i", card, "-vf", "format=yuv420p", ...INTERMEDIATE, video]);
  ffmpeg([...silence(cardLength), ...WAV, audio]);
  return { video, audio, length: cardLength };
}

function concatList(work: string, name: string, files: string[]): string {
  const list = join(work, name);
  writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  return list;
}

async function main() {
  const { id, root, brand } = parseArgs(process.argv.slice(2));
  const dir = join(root, id);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as EpisodeManifest;
  const work = join(dir, ".work");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const brandDir = join(root, "brand");
  const introFile = brand ? findFirst(brandDir, "intro", ["mp4", "mov"]) : null;
  const outroFile = brand ? findFirst(brandDir, "outro", ["mp4", "mov"]) : null;
  const themeFile = brand ? findFirst(brandDir, "theme", ["mp3", "wav", "m4a"]) : null;

  // Static art, once per run.
  const devicesUsed = [...new Set(manifest.shots.map((s): Device => s.device ?? "phone"))];
  await renderCards(work, [
    ...devicesUsed.map((d) => baseCard(join(work, `base-${d}.png`), d)),
    ...devicesUsed.filter((d) => DEVICES[d].framed).map((d) => maskCard(join(work, `mask-${d}.png`), d)),
    ...manifest.shots
      .filter((s) => (s.camera?.length ?? 0) > 0 || !DEVICES[s.device ?? "phone"].framed)
      .map((s) => backdropCard(join(work, `backdrop-${s.id}.png`), s.device ?? "phone", canvasOf(s), s.size ?? { width: 0, height: 0 })),
    ...manifest.shots.map((s) => captionCard(join(work, `caption-${s.id}.png`), s.caption)),
    ...(brand ? [introCard(join(work, "intro.png"), manifest.title), outroCard(join(work, "outro.png"))] : []),
  ]);

  const intro = brand ? renderBrandSegment("intro", introFile, join(work, "intro.png"), 1.2, work) : null;
  const outro = brand ? renderBrandSegment("outro", outroFile, join(work, "outro.png"), 2, work) : null;

  const voFiles = manifest.shots.map((s) => findFirst(join(dir, "vo"), s.id, ["wav", "m4a", "mp3", "aif", "aiff"]));
  const inputs: ShotInput[] = manifest.shots.map((s, i) => ({
    id: s.id,
    clipDuration: durationOf(join(dir, s.file)),
    voDuration: voFiles[i] ? durationOf(voFiles[i]) : null,
    cues: s.cues,
  }));
  const tl = planTimeline({ shots: inputs, introLength: intro?.length ?? null, outroLength: outro?.length ?? null });

  const videos: string[] = [];
  const voWavs: string[] = [];
  const fxWavs: string[] = [];
  if (intro) { videos.push(intro.video); voWavs.push(silenceWav(work, "intro-vo", intro.length)); fxWavs.push(intro.audio); }
  tl.shots.forEach((p, i) => {
    const v = join(work, `shot-${i}.mp4`);
    const vo = join(work, `vo-${i}.wav`);
    const fx = join(work, `fx-${i}.wav`);
    console.log(`shot ${p.id}: start ${p.start.toFixed(2)}s, length ${p.length.toFixed(2)}s${p.voStart === null ? " (no VO)" : ""}, ${p.cues.length} cue(s)`);
    renderShotVideo(p, manifest.shots[i], join(dir, manifest.shots[i].file), work, v);
    renderVoWav(p, voFiles[i], vo);
    renderFxWav(p, fx);
    videos.push(v); voWavs.push(vo); fxWavs.push(fx);
  });
  if (outro) { videos.push(outro.video); voWavs.push(silenceWav(work, "outro-vo", outro.length)); fxWavs.push(outro.audio); }

  const videoAll = join(work, "video.mp4");
  const voAll = join(work, "vo.wav");
  const fxAll = join(work, "fx.wav");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", concatList(work, "video.txt", videos), "-c", "copy", videoAll]);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", concatList(work, "vo.txt", voWavs), "-c", "copy", voAll]);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", concatList(work, "fx.txt", fxWavs), "-c", "copy", fxAll]);

  // Audio: narration + cues/brand audio, over a theme bed that ducks under the narration.
  const T = tl.total;
  const theme = themeFile ? themeGraph(themeFile, T, intro?.length ?? 0, outro?.length ?? 0) : `[vo1][fx]amix=inputs=2:duration=first:normalize=0[mix]`;
  // The mix first, then one fixed gain to Instagram's -14 LUFS and a limiter.
  // A dynamic loudnorm would lift the quiet bed and flatten the theme's levels.
  const mixWav = join(work, "mix.wav");
  ffmpeg([
    "-i", videoAll, "-i", voAll, "-i", fxAll,
    ...(themeFile ? ["-i", themeFile] : []),
    "-filter_complex", `[1:a]anull[vo1];[2:a]anull[fx];${theme};[mix]aresample=48000,${STEREO_48K}[a]`,
    "-map", "[a]", "-t", String(T), ...WAV, mixWav,
  ]);
  const gain = -14 - loudnessOf(mixWav);
  const out = join(dir, `${id}.mp4`);
  ffmpeg([
    "-i", videoAll, "-i", mixWav,
    "-filter_complex", `[1:a]volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false[a]`,
    "-map", "0:v", "-map", "[a]", "-t", String(T),
    "-c:v", "libx264", "-crf", "18", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", "-movflags", "+faststart", out,
  ]);

  // Cover: the composed frame from the middle of the first shot.
  const first = tl.shots[0];
  ffmpeg(["-ss", String(first.length / 2), "-i", join(work, "shot-0.mp4"), "-frames:v", "1", "-q:v", "2", join(dir, "cover.jpg")]);

  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${out} (${T.toFixed(2)}s planned, ${durationOf(out).toFixed(2)}s actual) and cover.jpg`);
}

/**
 * The theme as the brief laid it out (see theme.ts): its motif over the opening
 * logo, its underscore under the narration (ducked further while you speak),
 * and its ending on the close. Input 3 is the theme file.
 */
function themeGraph(file: string, total: number, intro: number, outro: number): string {
  // The audible end, not the file length: a generated track can end in seconds of silence.
  const plan = planTheme({ total, intro, outro, themeDuration: audibleEnd(file), lead: leadingSilence(file) });
  const n = plan.body.length;
  const outs = [...plan.body.map((_, i) => `[ts${i}]`), "[tsTail]"].join("");
  const pieces = plan.body.map((r, i) => `[ts${i}]atrim=${r.from}:${r.to},asetpts=PTS-STARTPTS[tb${i}];`).join("");
  const join = plan.body.map((_, i) => `[tb${i}]`).join("");
  const delay = Math.round(plan.tail.at * 1000);
  return (
    `[3:a]${STEREO_48K},asplit=${n + 1}${outs};${pieces}` +
    `${join}concat=n=${n}:v=0:a=1,atrim=0:${plan.bodyLength},volume='${gainExpression(plan.bodyGain)}':eval=frame[tbody];` +
    `[tsTail]atrim=${plan.tail.from},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume='${gainExpression(plan.tailGain)}':eval=frame[ttail];` +
    `[tbody][ttail]amix=inputs=2:duration=longest:normalize=0,apad,atrim=0:${total}[th];` +
    `[vo1]asplit[voA][voB];[th][voB]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[duck];` +
    `[voA][fx][duck]amix=inputs=3:duration=first:normalize=0[mix]`
  );
}

function silenceWav(work: string, name: string, length: number): string {
  const out = join(work, `${name}.wav`);
  ffmpeg([...silence(length), ...WAV, out]);
  return out;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
