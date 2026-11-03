/**
 * The deck protocol (#1136): the one small language every surface speaks.
 *
 * The screen, the keyboard, a Launchpad, any MIDI controller through Learn and,
 * later, a Stream Deck (#125) all send `DeckAction`s in and draw from a
 * `DeckSnapshot` out. None of them talks to the soundboard store directly, so a
 * new controller is one more driver rather than a second soundboard, and what a
 * press does cannot drift between the pad on screen and the pad under a finger.
 *
 * Types only, and Vue-free, so a hardware driver can import it without pulling
 * in the app. `useDeck()` (src/composables/soundboard/useDeck.ts) is the one
 * implementation.
 */

import type { DeckFeed, DeckLaneRule, LaunchMode, SoundCategory } from "@/types/sound.types";

/** Columns on every page. A Launchpad's grid is 8 wide; so is the deck. */
export const DECK_LANES = 8;

/** Rows a controller shows; the screen scrolls past them. */
export const DECK_HARDWARE_ROWS = 8;

/**
 * What a press does to a pad. `play` is the default and fires the pad's own
 * launch mode; the rest are the tool strip. Held = borrowed for a moment (the
 * key or controller button is down); locked = tapped on until tapped off.
 */
export type DeckTool = "play" | "loop" | "stop" | "fade" | "solo" | "volume" | "edit";

export const DECK_TOOLS: readonly DeckTool[] = ["play", "loop", "stop", "fade", "solo", "volume", "edit"];

/** The tools Simple mode shows. Every other one is Full only. */
export const SIMPLE_TOOLS: readonly DeckTool[] = ["play", "loop", "stop"];

/** How much of the screen the docked deck takes. */
export type DeckSize = "tucked" | "row" | "deck" | "full";

export const DECK_SIZES: readonly DeckSize[] = ["tucked", "row", "deck", "full"];

/** Simple shows play, loop and stop; Full shows everything. Never changes how a pad sounds. */
export type DeckControls = "simple" | "full";

/** A button that is held or tapped: `down`/`up` borrow it, `toggle` locks or unlocks it. */
export type DeckPhase = "down" | "up" | "toggle";

/** In: what a surface asks the deck to do. Lane 0 to 7, row 0 and up. */
export type DeckAction =
  /** `velocity` 0 to 1 from a pressure-sensitive pad; absent for a click, a tap or a key. */
  | { type: "press"; lane: number; row: number; velocity?: number }
  /** The finger, key or button came up. Gate and Repeat pads and held tools need it. */
  | { type: "release"; lane: number; row: number }
  | { type: "tool"; tool: DeckTool; phase: DeckPhase }
  | { type: "page"; index: number }
  | { type: "pageStep"; delta: -1 | 1 }
  /** A screen says which row is in view (the Row bar's row, the top row scrolled to); keys 1 to 8 fire it. */
  | { type: "showRow"; row: number }
  | { type: "hush"; phase: DeckPhase }
  /** Fade everything out over the board's fade time. */
  | { type: "fadeAll" }
  /** Hold everything where it is, or resume it. */
  | { type: "pauseAll" }
  /** Cut everything at once. */
  | { type: "stopAll" }
  /** A pad's own level, 0 to 1: the Volume tool's drag, or a learned knob. */
  | { type: "padVolume"; lane: number; row: number; value: number }
  /** The master fader, 0 to 1. */
  | { type: "master"; value: number }
  /** Make the guest in this slot a real pad there, so it stays after the trigger lets go. */
  | { type: "keep"; lane: number; row: number };

export type DeckPadKind = "sound" | "scene" | "playlist";

/**
 * What a pad looks like right now, in the words every surface draws from: the
 * screen tints and glows, a Launchpad picks an LED colour and lighting mode.
 */
export type DeckLight =
  /** An empty slot. */
  | "off"
  /** Loaded and silent. */
  | "ready"
  | "playing"
  /** Playing and will go round again. A Launchpad pulses it. */
  | "looping"
  | "fading"
  /** Still playing, dropped back because another pad is soloed. */
  | "ducked"
  /** A Gate pad under a finger. */
  | "held"
  /** Cannot play here; `blockedReason` says why. */
  | "blocked";

/**
 * Audio the campaign started by itself (a fight's music, the party's place, a
 * quest beat's cue) that no pad on this page holds. It stands in the first free
 * slot of the lane that takes its feed, because a DM who wants it gone looks for
 * it on the deck. Never saved: it goes when the audio does. A press stops it, the
 * Fade tool fades it, and `keep` makes it a real pad in that slot.
 */
export interface DeckGuest {
  /** The trigger that owns it, as the audio bus names it. */
  sourceId: string;
  /** What started it, for the pad: "Goblin ambush", "The Mill". */
  label: string;
  /** A playlist id, or `sound:<id>` for a loose file. */
  target: string;
}

export interface DeckCellView {
  lane: number;
  row: number;
  /** Null for an empty slot and for a guest; for an empty slot every field below is a neutral default. */
  padId: string | null;
  /** Set when the slot shows triggered audio no pad holds; `padId` is then null. */
  guest: DeckGuest | null;
  kind: DeckPadKind | null;
  category: SoundCategory | null;
  name: string;
  light: DeckLight;
  /** Whether it will loop, playing or not: the arrows show before you press. */
  loop: boolean;
  mode: LaunchMode;
  /** True when `mode` is its kind's default, so Simple can hide the glyph. */
  modeIsDefault: boolean;
  /** Number of takes; 0 for a scene or playlist pad. */
  takes: number;
  /** Which take the next press plays, 0-based. */
  nextTake: number;
  /** 0 to 1 while playing; 0 otherwise. */
  progress: number;
  /** The pad's own level, 0 to 1. */
  volume: number;
  soloed: boolean;
  /** Words for why it cannot play here, shown on the pad (no tooltips on a phone). */
  blockedReason: string | null;
  /** A short line under the name: "3 layers", "3/12", "Spotify: this device only". */
  meta: string | null;
  /** 1 to 8 for the top row, the key that fires it; null elsewhere. */
  keyLabel: string | null;
}

export interface DeckLaneView {
  name: string;
  rule: DeckLaneRule;
  /** What the campaign plays here by itself, or null. */
  feed: DeckFeed | null;
  /** The colour its header takes: the kind of sound most of its pads are, else effects. */
  category: SoundCategory;
}

/** Out: everything a surface needs to draw the deck. */
export interface DeckSnapshot {
  pages: readonly { id: string; name: string }[];
  /** -1 while there are no pages. */
  pageIndex: number;
  /** Always DECK_LANES long while a page is showing. */
  lanes: readonly DeckLaneView[];
  /** Rows to draw for this page: the last used row + 1, at least 1. */
  rows: number;
  /** Row-major, `rows * DECK_LANES` long. */
  cells: readonly DeckCellView[];
  /** The row keys 1 to 8 fire: the one in view, back to 0 on another page, never past the last row. */
  keyRow: number;
  /** What a press does now: a held tool wins over a locked one. */
  tool: DeckTool;
  /** The tool tapped on, or `play`. */
  lockedTool: DeckTool;
  hush: boolean;
  /** Everything is paused by Pause all. */
  paused: boolean;
  /** Sounds, scenes and playlists audible, the deck's own and anything a trigger started. */
  audibleCount: number;
  masterVolume: number;
}
