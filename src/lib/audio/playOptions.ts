import type { AudioBus } from "@/lib/audio/audioEngine";

/** Per-press options. Anything omitted keeps the sound's own behaviour. */
export interface PlayOptions {
  /** Fade-in length; omitted keeps the default 250ms. */
  fadeInMs?: number;
  /** Multiplies the sound's level for this play only (velocity, take variation). 1 is neutral. */
  gain?: number;
  /** playbackRate with pitch preservation off, so it nudges pitch. 1 is neutral. */
  rate?: number;
  /** Loop gaplessly (plain element loop where Web Audio is unavailable). */
  loop?: boolean;
  /** What the phone's Now Playing (CarPlay, lock screen) calls this sound; the sound's name. */
  title?: string;
}

/** What the last play of a sound used, so it can be converted to a loop without the caller repeating it. */
export interface PlayMeta {
  fileUrl: string;
  bus: AudioBus;
  gainTrim: number | undefined;
  playGain: number;
  rate: number;
  title: string | undefined;
}

/** The neutral values for anything a press left out; gain is floored at silence. */
export function resolvePlayOptions(opts: PlayOptions | undefined): { playGain: number; rate: number } {
  return {
    playGain: opts !== undefined && opts.gain !== undefined ? Math.max(0, opts.gain) : 1,
    rate: opts !== undefined && opts.rate !== undefined ? opts.rate : 1,
  };
}

export function setRate(audio: HTMLAudioElement, rate: number): void {
  audio.playbackRate = rate;
  // Pitch follows the rate only when a rate was asked for; otherwise leave
  // the browser's default so a later plain play is untouched.
  audio.preservesPitch = rate === 1;
}
