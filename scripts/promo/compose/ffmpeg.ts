import { execFileSync, spawnSync } from "node:child_process";

/** Runs ffmpeg with an argument array (paths contain spaces). */
export function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

function probe(file: string, entries: string[]): string {
  return execFileSync("ffprobe", ["-v", "error", ...entries, "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim();
}

/** Container duration in seconds. */
export function durationOf(file: string): number {
  const d = Number(probe(file, ["-show_entries", "format=duration"]));
  if (!Number.isFinite(d) || d <= 0) throw new Error(`Cannot read a duration from ${file}`);
  return d;
}

/** Runs an ffmpeg analysis pass and returns what it logs (ffmpeg writes measurements to stderr). */
function analyse(args: string[]): string {
  const run = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`ffmpeg analysis failed: ${run.stderr.split("\n").slice(-3).join(" ")}`);
  return run.stderr;
}

/** Seconds of silence at the very start of an audio file (below -40 dB), 0 when it starts at once. */
export function leadingSilence(file: string): number {
  const log = analyse(["-hide_banner", "-i", file, "-af", "silencedetect=n=-40dB:d=0.1", "-f", "null", "-"]);
  const start = /silence_start: (-?[\d.]+)/.exec(log);
  const end = /silence_end: ([\d.]+)/.exec(log);
  return start && Number(start[1]) <= 0.01 && end ? Number(end[1]) : 0;
}

/** Where the sound in a file ends: the start of its trailing silence, or the file's length when there is none. */
export function audibleEnd(file: string): number {
  const length = durationOf(file);
  const log = analyse(["-hide_banner", "-i", file, "-af", "silencedetect=n=-40dB:d=0.3", "-f", "null", "-"]);
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const last = starts[starts.length - 1];
  // A trailing silence either never logs an end or ends at the end of the file.
  const trailing = last !== undefined && (ends.length < starts.length || length - ends[ends.length - 1] < 0.05);
  return trailing ? last : length;
}

/** Integrated loudness (LUFS) of an audio file. */
export function loudnessOf(file: string): number {
  const log = analyse(["-hide_banner", "-i", file, "-af", "ebur128", "-f", "null", "-"]);
  const m = /Integrated loudness:\s+I:\s+(-?[\d.]+) LUFS/.exec(log);
  if (!m) throw new Error(`Cannot measure the loudness of ${file}`);
  return Number(m[1]);
}

export function hasAudio(file: string): boolean {
  return probe(file, ["-select_streams", "a", "-show_entries", "stream=codec_type"]) !== "";
}

export const STEREO_48K = "aformat=sample_rates=48000:channel_layouts=stereo";
