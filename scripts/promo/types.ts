/**
 * The shape of a promo episode and of what the recorder hands the assembler.
 *
 * An episode is one short vertical video about one feature, shot on a phone
 * screen against the local stack. `npm run promo:record -- <id>` plays its
 * shots in a real browser and writes `promo-out/<id>/`; the maintainer reads
 * `script.md` aloud into `vo/<shot id>.<ext>`; `npm run promo:assemble -- <id>`
 * cuts it together with the brand open and close. See docs/promo-videos.md.
 */
import type { Page } from "playwright";

/** Which local fixture account a shot is filmed as. */
export type Account = "dm" | "player";

/** A sound to mix in at a moment the recorder logged (the app plays it, but a screencast has no audio). */
export interface SoundCue {
  /** Seconds from the start of the shot's clip. */
  t: number;
  /** An http(s) URL or an absolute file path the assembler can read with ffmpeg. */
  src: string;
  /** Linear gain, 1 = as recorded. */
  gain?: number;
}

/** What a shot's `run` gets to work with. */
export interface ShotContext {
  page: Page;
  /** Taps an element with a visible touch mark, then waits `holdMs` (default 600). */
  tap(target: ReturnType<Page["locator"]>, holdMs?: number): Promise<void>;
  /** Types into a field one character at a time, as a person would. */
  type(target: ReturnType<Page["locator"]>, text: string): Promise<void>;
  /** Scrolls the page by `dy` CSS pixels over `ms`, smoothly. */
  scroll(dy: number, ms?: number): Promise<void>;
  /** Scrolls smoothly until `target`'s top sits `offset` CSS pixels below the top of the screen (default 90). */
  scrollTo(target: ReturnType<Page["locator"]>, ms?: number, offset?: number): Promise<void>;
  /** Waits, so the viewer can read what is on screen. */
  hold(ms: number): Promise<void>;
  /** Logs a sound to mix in now. */
  cue(src: string, gain?: number): void;
  /** Navigates within the app and waits for it to settle (not filmed until it has). */
  open(path: string): Promise<void>;
}

export interface Shot {
  /** Stable, file-safe id: the voice-over for it is `vo/<id>.*`. */
  id: string;
  /** The on-screen caption, short: most Reels play muted. Up to about eight words. */
  caption: string;
  /** What the narrator says over this shot. */
  narration: string;
  /** The app path to be on, settled, before filming starts. Omit to continue from the previous shot. */
  startAt?: string;
  run(ctx: ShotContext): Promise<void>;
}

export interface Episode {
  /** File-safe id, e.g. "workshop-player". */
  id: string;
  /** The feature, as the series names it. */
  title: string;
  /** The episode that shows the other side of the same feature (DM or player). */
  pairedWith?: string;
  account: Account;
  /** Puts the local stack into the state the first shot expects. Runs before every recording, so it must be idempotent. */
  setup?(): Promise<void> | void;
  /** Seed for Math.random in the filmed page, so dice land the same on every take. */
  seed?: number;
  shots: Shot[];
}

/** One recorded shot, as `manifest.json` lists it. */
export interface RecordedShot {
  id: string;
  caption: string;
  narration: string;
  /** Relative to the episode folder: a 1080x1920, 30 fps, silent H.264 clip. */
  file: string;
  /** Seconds. */
  duration: number;
  cues: SoundCue[];
}

/** `promo-out/<id>/manifest.json`. */
export interface EpisodeManifest {
  id: string;
  title: string;
  pairedWith: string | null;
  account: Account;
  recordedAt: string;
  shots: RecordedShot[];
}
