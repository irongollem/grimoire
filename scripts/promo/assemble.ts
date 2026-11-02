/**
 * Cuts a recorded episode into the final Reel.
 *   tsx --tsconfig tsconfig.node.json scripts/promo/assemble.ts <episode id> [--no-brand] [--root <dir>]
 * Reads <root>/<id>/ (see types.ts), writes <root>/<id>/<id>.mp4 and cover.jpg.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canvasFor, homeView, planCamera, zoompanExpressions } from "./camera";
import { backdropCard, baseCard, captionCard, introCard, maskCard, outroCard, renderCards, subtitleCard } from "./compose/cards";
import { audibleEnd, durationOf, ffmpeg, hasAudio, leadingSilence, loudnessOf, STEREO_48K } from "./compose/ffmpeg";
import { DEVICES } from "./devices";
import { formatCanvas, layoutFor, type Layout } from "./layouts";
import { chaptersText, srtText } from "./sidecars";
import { BED_CROSSFADE, bedWindow, planBeds } from "./beds";
import { BED_DB, FULL_DB, SILENT_DB, gainExpression, planTheme } from "./theme";
import { planTimeline, VO_LEAD, type PlannedShot, type ShotInput, type Timeline } from "./timeline";
import type { Device, EpisodeManifest, Format, RecordedShot } from "./types";

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
function canvasOf(shot: RecordedShot, format: Format | undefined) {
  const { window: w } = layoutFor(format, shot.device);
  if (!shot.size) throw new Error(`Shot ${shot.id} has camera moves but no recorded size: re-film it.`);
  return canvasFor(shot.size, { width: w.w, height: w.h });
}

/**
 * The caption, and where the layout has one the narration, as the last inputs of a
 * shot's filter graph (`first` is the index of the first of them), with the graph
 * that lays them over `[a]` and ends in `[v]`.
 */
function textLayers(layout: Layout, p: PlannedShot, work: string, first: number): { inputs: string[]; graph: string } {
  const loop = (file: string) => ["-loop", "1", "-framerate", "30", "-t", String(p.length), "-i", file];
  const caption = loop(join(work, `caption-${p.id}.png`));
  const c = layout.caption;
  if (c.kind === "band") {
    const over = `[a][${first}:v]overlay=0:${c.y}:format=auto`;
    return layout.subtitles
      ? {
          inputs: [...caption, ...loop(join(work, `subtitle-${p.id}.png`))],
          graph: `${over}[t];[t][${first + 1}:v]overlay=0:${layout.subtitles.y}:format=auto,format=yuv420p[v]`,
        }
      : { inputs: caption, graph: `${over},format=yuv420p[v]` };
  }
  if (c.kind === "panel") return { inputs: caption, graph: `[a][${first}:v]overlay=${c.x}:${c.y}:format=auto,format=yuv420p[v]` };
  // A lower third fades in and out inside its window, so the pill does not pop on and off the page.
  const FADE = 0.25;
  const fade = `[${first}:v]format=rgba,fade=t=in:st=${c.from}:d=${FADE}:alpha=1,fade=t=out:st=${c.to - FADE}:d=${FADE}:alpha=1[cap]`;
  return { inputs: caption, graph: `${fade};[a][cap]overlay=${c.x}:${c.y}:format=auto,format=yuv420p[v]` };
}

/** The silent screen-in-frame video for one shot. */
function renderShotVideo(p: PlannedShot, shot: RecordedShot, format: Format | undefined, clip: string, work: string, out: string): void {
  const device: Device = shot.device ?? "phone";
  const spec = DEVICES[device];
  const layout = layoutFor(format, device);
  const { x, y, w, h } = layout.window;
  const L = p.length;
  // A frozen last frame holds the screen, and with it wherever the camera ended.
  const hold = p.freeze > 0 ? `tpad=stop_mode=clone:stop_duration=${p.freeze},` : "";
  const loop = (file: string) => ["-loop", "1", "-framerate", "30", "-t", String(L), "-i", file];
  const words = (first: number) => textLayers(layout, p, work, first);
  const camera = (shot.camera?.length ?? 0) > 0 || layout.frame === "browser";
  if (!camera) {
    const text = words(3);
    ffmpeg([
      ...loop(join(work, `base-${device}.png`)),
      "-i", clip,
      ...loop(join(work, `mask-${device}.png`)),
      ...text.inputs,
      "-filter_complex",
      `[1:v]fps=30,scale=${w}:${h},${hold}trim=duration=${L},setpts=PTS-STARTPTS,format=yuva420p[c];` +
        `[2:v]format=gray[m];[c][m]alphamerge[s];` +
        `[0:v][s]overlay=${x}:${y}:format=auto[a];${text.graph}`,
      "-map", "[v]", "-t", String(L), ...INTERMEDIATE, out,
    ]);
    return;
  }
  // Camera: the screen goes onto its backdrop, zoompan crops a window out of that, and the window goes on the page.
  const canvas = canvasOf(shot, format);
  if (!shot.size) throw new Error(`Shot ${shot.id} has no recorded size: re-film it.`);
  const size = shot.size;
  const sidebar = spec.sidebar * spec.scale;
  const home = homeView(canvas, size, sidebar);
  const plan = planCamera(shot.camera ?? [], canvas, home, (inset) => homeView(canvas, size, inset), sidebar);
  const { z, x: zx, y: zy } = zoompanExpressions(plan, canvas, home);
  const text = words(4);
  const window =
    `[3:v]format=yuv420p[bd];[1:v]fps=30,${hold}trim=duration=${L},setpts=PTS-STARTPTS,format=yuv420p[c];` +
    `[bd][c]overlay=${canvas.screenX}:${canvas.screenY}[cv];` +
    `[cv]zoompan=z='${z}':x='${zx}':y='${zy}':d=1:s=${w}x${h}:fps=30[zp]`;
  const place = `[zp]format=yuva420p[zv];[2:v]format=gray[m];[zv][m]alphamerge[s];[0:v][s]overlay=${x}:${y}:format=auto[a]`;
  ffmpeg([
    ...loop(join(work, `base-${device}.png`)),
    "-i", clip,
    ...loop(join(work, `mask-${device}.png`)),
    ...loop(join(work, `backdrop-${p.id}.png`)),
    ...text.inputs,
    "-filter_complex", `${window};${place};${text.graph}`,
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

/** A brand clip or a placeholder card, as a 30 fps video of the format's size plus a wav. */
function renderBrandSegment(name: string, file: string | null, card: string, cardLength: number, work: string, canvas: Layout["canvas"]): BrandSeg {
  const video = join(work, `${name}.mp4`);
  const audio = join(work, `${name}.wav`);
  if (file) {
    const vf = `fps=30,scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=${BG},setsar=1`;
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

  const format = manifest.format;
  const frame = formatCanvas(format);
  const brandDir = join(root, "brand");
  const introFile = brand ? findFirst(brandDir, "intro", ["mp4", "mov"]) : null;
  const outroFile = brand ? findFirst(brandDir, "outro", ["mp4", "mov"]) : null;
  const themeFile = brand ? findFirst(brandDir, "theme", ["mp3", "wav", "m4a"]) : null;
  // A long video's narration sits on the longer tunes (beds.ts); a Reel keeps the theme's own underscore.
  const bedFiles = brand && format === "youtube" ? bedsIn(brandDir) : [];
  if (format === "youtube" && themeFile && bedFiles.length === 0) {
    console.warn("No brand/bed-1.mp3: the theme's one-minute underscore loops under the whole video. Add bed-1, bed-2, ... for a long video.");
  }

  // Static art, once per run.
  const devicesUsed = [...new Set(manifest.shots.map((s): Device => s.device ?? "phone"))];
  await renderCards(work, [
    ...devicesUsed.map((d) => baseCard(join(work, `base-${d}.png`), layoutFor(format, d))),
    ...devicesUsed.map((d) => maskCard(join(work, `mask-${d}.png`), layoutFor(format, d))),
    ...manifest.shots
      .filter((s) => (s.camera?.length ?? 0) > 0 || layoutFor(format, s.device).frame === "browser")
      .map((s) => backdropCard(join(work, `backdrop-${s.id}.png`), layoutFor(format, s.device), canvasOf(s, format))),
    ...manifest.shots.map((s) => captionCard(join(work, `caption-${s.id}.png`), s.caption, layoutFor(format, s.device), s.chapter)),
    ...manifest.shots.flatMap((s) => {
      const layout = layoutFor(format, s.device);
      return layout.subtitles ? [subtitleCard(join(work, `subtitle-${s.id}.png`), s.narration, layout)] : [];
    }),
    ...(brand ? [introCard(join(work, "intro.png"), manifest.title, frame), outroCard(join(work, "outro.png"), frame)] : []),
  ]);

  const intro = brand ? renderBrandSegment("intro", introFile, join(work, "intro.png"), 1.2, work, frame) : null;
  const outro = brand ? renderBrandSegment("outro", outroFile, join(work, "outro.png"), 2, work, frame) : null;

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
    renderShotVideo(p, manifest.shots[i], format, join(dir, manifest.shots[i].file), work, v);
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
  const chapterStarts = tl.shots.flatMap((p, i) => (manifest.shots[i].chapter === undefined ? [] : [p.start]));
  const theme = !themeFile
    ? `[vo1][fx]amix=inputs=2:duration=first:normalize=0[mix]`
    : bedFiles.length > 0
      ? bedThemeGraph(themeFile, bedFiles, T, intro?.length ?? 0, outro?.length ?? 0, chapterStarts)
      : themeGraph(themeFile, T, intro?.length ?? 0, outro?.length ?? 0);
  // The mix first, then one fixed gain to Instagram's -14 LUFS and a limiter.
  // A dynamic loudnorm would lift the quiet bed and flatten the theme's levels.
  const mixWav = join(work, "mix.wav");
  ffmpeg([
    "-i", videoAll, "-i", voAll, "-i", fxAll,
    ...(themeFile ? ["-i", themeFile] : []),
    ...(themeFile ? bedFiles.flatMap((f) => ["-i", f]) : []),
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

  if (format === "youtube") writeSidecars(dir, manifest, tl, inputs);

  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${out} (${T.toFixed(2)}s planned, ${durationOf(out).toFixed(2)}s actual) and cover.jpg`);
}

/** `chapters.txt` for the description and `captions.srt` for the subtitles, beside the finished video. */
function writeSidecars(dir: string, manifest: EpisodeManifest, tl: Timeline, inputs: ShotInput[]): void {
  const chapters = tl.shots.flatMap((p, i) => {
    const title = manifest.shots[i].chapter;
    return title === undefined ? [] : [{ title, start: p.start }];
  });
  if (chapters.length === 0) console.warn("No shot has a chapter: add `chapter` to the shots that start one. chapters.txt is not written.");
  else writeFileSync(join(dir, "chapters.txt"), `${chaptersText(chapters, tl.total)}\n`);
  const srt = srtText(
    tl.shots.map((p, i) => ({ start: p.start, length: p.length, voStart: p.voStart, voDuration: inputs[i].voDuration, narration: manifest.shots[i].narration })),
  );
  if (srt === "") console.warn("No shot has a voice-over yet: captions.srt is not written.");
  else writeFileSync(join(dir, "captions.srt"), srt);
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

/** `brand/bed-1.*`, `bed-2.*`, ... in order, stopping at the first missing number. */
function bedsIn(brandDir: string): string[] {
  const files: string[] = [];
  for (let n = 1; ; n++) {
    const file = findFirst(brandDir, `bed-${n}`, ["mp3", "wav", "m4a"]);
    if (!file) return files;
    files.push(file);
  }
}

/** Under the voice, a bed is level-matched to the theme and set this far below the Reel's bed: the tunes are busier than its underscore. */
const BED_EXTRA_DB = -3;
/**
 * Keeps a busy tune behind the voice: no rumble, a dip where speech is
 * intelligible, softened highs. The same on every tune, so the chain sounds
 * like one piece of music rather than three.
 */
const BED_EQ = "highpass=f=90,equalizer=f=2500:t=q:w=1.2:g=-5,treble=g=-4:f=6000";

/**
 * The theme's motif over the opening logo and its ending over the close, as
 * in a Reel, with the background tunes chained between them (see beds.ts).
 * Input 3 is the theme, inputs 4 and on the tunes.
 */
function bedThemeGraph(themeFile: string, bedFiles: string[], total: number, intro: number, outro: number, chapterStarts: number[]): string {
  const plan = planTheme({ total, intro, outro, themeDuration: audibleEnd(themeFile), lead: leadingSilence(themeFile) });
  const themeLoudness = loudnessOf(themeFile);
  const windows = bedFiles.map((f) => bedWindow(leadingSilence(f), audibleEnd(f)));
  const trims = bedFiles.map((f) => themeLoudness - loudnessOf(f));
  // The tunes take over from the motif as the logo ends, and hand over to the theme's ending at its crossfade.
  const bedFrom = intro;
  const bedTo = plan.bodyLength;
  const segs = planBeds({ from: bedFrom, to: bedTo, chapterStarts, beds: windows });
  const last = segs.length - 1;
  const pieces = segs.map((s, i) => {
    const fadeIn = i === 0 && intro === 0 ? 0.5 : BED_CROSSFADE;
    const fadeOut = i === last ? bedTo - plan.tail.at : BED_CROSSFADE;
    const ms = Math.round(s.at * 1000);
    return (
      `[${4 + s.bed}:a]${STEREO_48K},atrim=${s.from}:${s.from + s.length},asetpts=PTS-STARTPTS,volume=${trims[s.bed].toFixed(2)}dB,` +
      `afade=t=in:st=0:d=${fadeIn}:curve=qsin,afade=t=out:st=${Math.max(0, s.length - fadeOut)}:d=${fadeOut}:curve=qsin,adelay=${ms}|${ms}[bed${i}];`
    );
  });
  const motifEnd = intro + BED_CROSSFADE;
  const motifGain = gainExpression([{ t: 0, db: FULL_DB }, { t: intro, db: FULL_DB }, { t: motifEnd, db: SILENT_DB }]);
  const delay = Math.round(plan.tail.at * 1000);
  return (
    `[3:a]${STEREO_48K},asplit=2[tsMotif][tsTail];` +
    (intro > 0 ? `[tsMotif]atrim=${plan.body[0].from}:${plan.body[0].from + motifEnd},asetpts=PTS-STARTPTS,volume='${motifGain}':eval=frame[tmotif];` : `[tsMotif]anullsink;`) +
    pieces.join("") +
    `${segs.map((_, i) => `[bed${i}]`).join("")}amix=inputs=${segs.length}:duration=longest:normalize=0,${BED_EQ},volume=${BED_DB + BED_EXTRA_DB}dB[tbeds];` +
    `[tsTail]atrim=${plan.tail.from},asetpts=PTS-STARTPTS,adelay=${delay}|${delay},volume='${gainExpression(plan.tailGain)}':eval=frame[ttail];` +
    `${intro > 0 ? "[tmotif]" : ""}[tbeds][ttail]amix=inputs=${intro > 0 ? 3 : 2}:duration=longest:normalize=0,apad,atrim=0:${total}[th];` +
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
