/**
 * The text files that ship beside a YouTube video: chapter lines for the
 * description and an .srt for the subtitles. Pure arithmetic over the planned
 * timeline, so it can be tested without ffmpeg.
 */

export interface ChapterInput {
  title: string;
  /** Program time of the shot that starts the chapter, in seconds. */
  start: number;
}

function clock(seconds: number, hours: boolean): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hours ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

/**
 * YouTube chapter lines, `m:ss Title`. YouTube only reads a list that starts at
 * 0:00, and the first shot starts after the intro, so the first line is pinned
 * to 0:00 and labelled with the first chapter's title. `total` decides between
 * `m:ss` and `h:mm:ss` for every line, so they stay one width.
 */
export function chaptersText(chapters: ChapterInput[], total: number): string {
  const hours = total >= 3600;
  return chapters.map((c, i) => `${clock(i === 0 ? 0 : c.start, hours)} ${c.title}`).join("\n");
}

export interface CueInput {
  /** The shot's start in program time. */
  start: number;
  length: number;
  /** Narration start from the shot's start, or null for a silent shot. */
  voStart: number | null;
  /** Length of the recorded narration, or null when none was recorded. */
  voDuration: number | null;
  narration: string;
}

function stamp(seconds: number): string {
  const total = Math.round(seconds * 1000);
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(total % 1000, 3)}`;
}

/** Splits at sentence ends, keeping the punctuation with its sentence. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * SubRip subtitles for the narration. A shot's sentences share the voice-over's
 * duration in proportion to their length, which tracks speaking time well
 * enough for subtitles. A shot with no recorded voice-over gets none, and a
 * cue never runs past its shot's end.
 */
export function srtText(shots: CueInput[]): string {
  const blocks: string[] = [];
  for (const shot of shots) {
    if (shot.voStart === null || shot.voDuration === null) continue;
    const parts = sentences(shot.narration);
    if (parts.length === 0) continue;
    const chars = parts.reduce((n, p) => n + p.length, 0);
    const begin = shot.start + shot.voStart;
    const end = Math.min(begin + shot.voDuration, shot.start + shot.length);
    let cursor = begin;
    for (const part of parts) {
      const next = cursor + ((end - begin) * part.length) / chars;
      blocks.push(`${blocks.length + 1}\n${stamp(cursor)} --> ${stamp(next)}\n${part}`);
      cursor = next;
    }
  }
  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}
