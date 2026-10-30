/**
 * The assembler's arithmetic, kept free of ffmpeg so it can be tested.
 * All times are seconds, snapped to the 30 fps frame grid so that every
 * segment (and its audio, 1600 samples per frame at 48 kHz) has an exact length.
 */
import type { SoundCue } from "./types";

export const FPS = 30;
/** The narration starts this long after the shot does. */
export const VO_LEAD = 0.15;
/** Breathing room after the narration ends. */
export const VO_TAIL = 0.4;

/** Rounds up to a whole frame, ignoring float noise (2.0000000001 stays 2). */
export function snapToFrame(seconds: number): number {
  return Math.ceil(seconds * FPS - 1e-6) / FPS;
}

export interface ShotInput {
  id: string;
  /** Duration of the recorded clip. */
  clipDuration: number;
  /** Duration of the narration, or null when none was recorded. */
  voDuration: number | null;
  cues: SoundCue[];
}

export interface PlannedCue {
  src: string;
  gain: number;
  /** Seconds from the shot's start. */
  local: number;
  /** Seconds from the start of the whole program. */
  program: number;
}

export interface PlannedShot {
  id: string;
  /** Start in program time. */
  start: number;
  length: number;
  clipDuration: number;
  /** How long the last frame of the clip is held to fill the shot. */
  freeze: number;
  /** Narration start from the shot's start, or null for a silent shot. */
  voStart: number | null;
  cues: PlannedCue[];
}

export interface Timeline {
  intro: { start: number; length: number } | null;
  shots: PlannedShot[];
  outro: { start: number; length: number } | null;
  total: number;
}

export function planTimeline(input: {
  shots: ShotInput[];
  introLength: number | null;
  outroLength: number | null;
}): Timeline {
  let cursor = 0;
  let intro: Timeline["intro"] = null;
  if (input.introLength !== null) {
    const length = snapToFrame(input.introLength);
    intro = { start: 0, length };
    cursor = length;
  }
  const shots: PlannedShot[] = input.shots.map((s) => {
    const clip = snapToFrame(s.clipDuration);
    const voNeeds = s.voDuration === null ? 0 : s.voDuration + VO_TAIL;
    const length = snapToFrame(Math.max(clip, voNeeds));
    const start = cursor;
    cursor += length;
    const cues: PlannedCue[] = s.cues
      .map((c) => {
        const local = Math.max(0, c.t);
        return { src: c.src, gain: c.gain ?? 1, local, program: start + local };
      })
      // A cue at or past the shot's end would play over the next shot.
      .filter((c) => c.local < length);
    return {
      id: s.id,
      start,
      length,
      clipDuration: clip,
      freeze: length - clip,
      voStart: s.voDuration === null ? null : VO_LEAD,
      cues,
    };
  });
  let outro: Timeline["outro"] = null;
  if (input.outroLength !== null) {
    const length = snapToFrame(input.outroLength);
    outro = { start: cursor, length };
    cursor += length;
  }
  return { intro, shots, outro, total: cursor };
}
