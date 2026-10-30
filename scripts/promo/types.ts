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

/** The screen a shot is filmed on. A phone is 390x693 CSS px at 3x, a tablet 820x1180 at 2x, a desktop 1440x900 at 2x. */
export type Device = "phone" | "tablet" | "desktop";

/** A part of the screen in device pixels, relative to the screen's top-left corner. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the camera looks from `t` seconds into a shot's clip; `rect: null` is the whole screen. */
export interface CameraKeyframe {
  t: number;
  rect: ScreenRect | null;
  /** With `rect: null`: the true whole screen (paper above and below on a laptop) instead of the resting view. */
  overview?: boolean;
  /** With `rect: null`: where the resting view starts, in device pixels from the screen's left edge, for a page with no sidebar (the player portal in preview). Defaults to the device's sidebar. */
  homeInset?: number;
  /** Breathing room around the rect in device pixels. */
  padding?: number;
}

/**
 * A second person acting while a shot is filmed, on a desktop viewport that is
 * never filmed (no screencast, no camera, no sound cues). It is signed in as
 * the other fixture account, in the same demo campaign with that account's
 * lens, and lives in its own browser context. Opened the first time a shot asks
 * for it and kept for the rest of the episode, so its realtime connection
 * stays up between shots.
 */
export interface Offstage {
  page: Page;
  /** Navigates the offstage page within the app and waits for it to settle. */
  open(path: string): Promise<void>;
  /** The app's base URL, for `page.goto` with a full address. */
  base: string;
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
  /**
   * Points the camera at part of the screen, from now on: the Reel glides to
   * frame `target` (padding in CSS pixels, default 8% of the target), and
   * `null` glides back to the whole screen. Frames the target where it is now,
   * so scroll first. A shot that never calls it shows the whole screen.
   */
  focus(target: ReturnType<Page["locator"]> | null, opts?: { padding?: number; leftInset?: number }): Promise<void>;
  /**
   * The true whole screen, for a deliberate beat of "here is all of it". On a
   * laptop that is a strip with paper above and below, hard to read on a phone:
   * use it once an episode at most. `focus(null)` is the resting view, which
   * fills the window.
   */
  overview(): Promise<void>;
  /** Waits until the page has real content (no grey loading placeholders): call it after a tap that navigates, before the camera moves or the moment the narration is about starts. */
  settled(): Promise<void>;
  /** The other person at the table, acting live: see `Offstage`. */
  offstage(account: Account): Promise<Offstage>;
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
  /** Overrides the episode's device for this shot (a Reel may cut from a laptop to a phone). A shot on another device than the one before needs a `startAt`. */
  device?: Device;
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
  /** The screen the episode is filmed on; phone when omitted. */
  device?: Device;
  /** Puts the local stack into the state the first shot expects. Runs before every recording, so it must be idempotent. */
  setup?(): Promise<void> | void;
  /**
   * Runs once before the first shot is opened, after `setup`, with the offstage actor available: for a scene that
   * only exists once a person has clicked through it in a browser (a fight already under way when the Reel opens).
   * Not filmed.
   */
  prepare?(actors: { offstage(account: Account): Promise<Offstage> }): Promise<void>;
  /** Undoes what the take left behind (an open session, chat lines). Runs once after the last shot, filmed or failed, so it must not assume the take got that far. */
  teardown?(): Promise<void> | void;
  /** Seed for Math.random in the filmed page, so dice land the same on every take. */
  seed?: number;
  shots: Shot[];
}

/** One recorded shot, as `manifest.json` lists it. */
export interface RecordedShot {
  id: string;
  caption: string;
  narration: string;
  /** Relative to the episode folder: a silent 30 fps H.264 clip at the device's native pixel size. */
  file: string;
  /** The screen it was filmed on; phone when absent (older manifests). */
  device?: Device;
  /** The clip's size in device pixels. */
  size?: { width: number; height: number };
  /** Camera moves, in clip time. Absent means the whole screen throughout. */
  camera?: CameraKeyframe[];
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
