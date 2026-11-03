/**
 * The Launchpad's wire protocol (#1136), pure: bytes in, deck events out, and
 * a DeckSnapshot in, LED messages out. Nothing here touches Web MIDI or Vue.
 * Layout and byte facts: Novation's Launchpad Pro [MK3] Programmer's reference,
 * and a Launchpad X on the desk; see launchpadProfiles.ts for what each model
 * has been checked against.
 */

import { DECK_HARDWARE_ROWS, DECK_LANES, type DeckCellView, type DeckSnapshot } from "../deckSurface";
import type { LaunchpadButton, LaunchpadProfile } from "./launchpadProfiles";

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const NOVATION_PREFIX = [0x00, 0x20, 0x29, 0x02];
const CMD_PROGRAMMER = 0x0e;
const CMD_LED = 0x03;

/** The manual allows up to 106 LED specs in one message. */
export const MAX_LED_SPECS = 106;

const CC_TOP_FIRST = 91;
const CC_RIGHT_FIRST = 89;
const CC_LEFT_PREV = 80;
const CC_LEFT_NEXT = 70;
const CC_LEFT_STOP_ALL = 10;

export function programmerModeMessage(profile: LaunchpadProfile, on: boolean): number[] {
  return [SYSEX_START, ...NOVATION_PREFIX, profile.deviceByte, CMD_PROGRAMMER, on ? 1 : 0, SYSEX_END];
}

/** Deck row 0 is the top row, so it is note 8x. */
export function padNote(lane: number, row: number): number {
  return 10 * (DECK_HARDWARE_ROWS - row) + lane + 1;
}

/** The furthest the device's eight rows can scroll down a page of `rows`. */
export function maxRowOffset(rows: number): number {
  return Math.max(0, rows - DECK_HARDWARE_ROWS);
}

export function clampRowOffset(offset: number, rows: number): number {
  return Math.min(Math.max(0, offset), maxRowOffset(rows));
}

export function topButtonCc(index: number): number {
  return CC_TOP_FIRST + index;
}

export function rightButtonCc(index: number): number {
  return CC_RIGHT_FIRST - 10 * index;
}

function padAddress(note: number): { lane: number; row: number } | null {
  const rowFromBottom = Math.floor(note / 10);
  const column = note % 10;
  if (rowFromBottom < 1 || rowFromBottom > 8 || column < 1 || column > 8) return null;
  return { lane: column - 1, row: DECK_HARDWARE_ROWS - rowFromBottom };
}

export type LaunchpadEvent =
  | { kind: "pad"; lane: number; row: number; down: boolean; velocity: number }
  | { kind: "top"; index: number; down: boolean }
  | { kind: "right"; index: number; down: boolean }
  | { kind: "left"; button: "prev" | "next" | "stopAll"; down: boolean };

/** Turns one incoming MIDI message into a button event; anything else is null. */
export function decodeLaunchpadMessage(profile: LaunchpadProfile, data: ArrayLike<number>): LaunchpadEvent | null {
  if (data.length < 3) return null;
  const kind = data[0] & 0xf0;
  const number = data[1];
  const value = data[2];
  if (kind === 0x90 || kind === 0x80) {
    const addr = padAddress(number);
    if (!addr) return null;
    const down = kind === 0x90 && value > 0;
    return { kind: "pad", ...addr, down, velocity: value };
  }
  if (kind !== 0xb0) return null;
  const down = value > 0;
  if (number >= CC_TOP_FIRST && number < CC_TOP_FIRST + 8) return { kind: "top", index: number - CC_TOP_FIRST, down };
  if (number <= CC_RIGHT_FIRST && number >= CC_RIGHT_FIRST - 70 && (CC_RIGHT_FIRST - number) % 10 === 0) {
    return { kind: "right", index: (CC_RIGHT_FIRST - number) / 10, down };
  }
  if (!profile.hasLeftColumn) return null;
  if (number === CC_LEFT_PREV) return { kind: "left", button: "prev", down };
  if (number === CC_LEFT_NEXT) return { kind: "left", button: "next", down };
  if (number === CC_LEFT_STOP_ALL) return { kind: "left", button: "stopAll", down };
  return null;
}

// --- lights ---

export type LedSpec =
  | { type: "static"; color: number }
  | { type: "flash"; color: number; between: number }
  | { type: "pulse"; color: number }
  | { type: "rgb"; r: number; g: number; b: number };

export type LedFrame = Map<number, LedSpec>;

type Rgb = readonly [number, number, number];
type Category = "music" | "ambient" | "effects";

// Picked by eye on a Launchpad X (3 Nov 2026), which shows two things the
// screen colours cannot predict. The LEDs are not linear: an RGB value scaled
// down still reads bright, and at low levels the mix breaks into a muddy,
// broken-looking colour that drifts to blue, so every dim look is a Novation
// palette shade, tuned by Novation for these LEDs, never a scaled RGB. And the
// screen's gold washes to white and its teal reads as the effects blue, so the
// device gets its own saturated gold, a green for ambient, and a violet blue.
// The Pro MK3 and Mini MK3 share the palette and the LEDs.

/** Playing, full RGB. */
const CATEGORY_RGB: Record<Category, Rgb> = {
  music: [127, 75, 0],
  ambient: [0, 127, 60],
  effects: [40, 30, 127],
};
/** Loaded and silent: the dim palette shade of the category. */
const CATEGORY_READY_PALETTE: Record<Category, number> = { music: 126, ambient: 22, effects: 38 };
/** Looping: the device pulses this palette colour by itself. */
const CATEGORY_PULSE_PALETTE: Record<Category, number> = { music: 96, ambient: 21, effects: 45 };

const PALETTE_BLOCKED = 121;
const PALETTE_IDLE = 103;
const PALETTE_OTHER_PAGE = 126;

const OFF: LedSpec = { type: "static", color: 0 };
const WHITE: Rgb = [110, 110, 110];
const AMBER: Rgb = [127, 80, 10];

function rgb(c: Rgb): LedSpec {
  return { type: "rgb", r: c[0], g: c[1], b: c[2] };
}

function palette(color: number): LedSpec {
  return { type: "static", color };
}

export function cellLed(cell: DeckCellView | undefined): LedSpec {
  if (!cell) return OFF;
  const category = cell.category ?? "effects";
  switch (cell.light) {
    case "off":
      return OFF;
    case "ready":
    // A ducked pad is still playing, under a solo; the dim shade says "turned down".
    case "ducked":
      return palette(CATEGORY_READY_PALETTE[category]);
    case "playing":
    case "held":
      return rgb(CATEGORY_RGB[category]);
    case "looping":
      return { type: "pulse", color: CATEGORY_PULSE_PALETTE[category] };
    case "fading":
      // A hard flash, unlike a loop's smooth pulse: on its way out.
      return { type: "flash", color: CATEGORY_PULSE_PALETTE[category], between: CATEGORY_READY_PALETTE[category] };
    case "blocked":
      return palette(PALETTE_BLOCKED);
  }
}

function buttonLed(button: LaunchpadButton, snapshot: DeckSnapshot, rowOffset: number): LedSpec {
  if (button === null) return OFF;
  switch (button.action) {
    case "page":
      if (button.index >= snapshot.pages.length) return OFF;
      return button.index === snapshot.pageIndex ? rgb(WHITE) : palette(PALETTE_OTHER_PAGE);
    case "tool":
      return snapshot.tool === button.tool ? rgb(WHITE) : palette(PALETTE_IDLE);
    case "play":
      return snapshot.tool === "play" ? rgb(WHITE) : palette(PALETTE_IDLE);
    case "hush":
      return snapshot.hush ? rgb(AMBER) : palette(PALETTE_IDLE);
    case "pauseAll":
      return snapshot.paused ? rgb(AMBER) : palette(PALETTE_IDLE);
    case "fadeAll":
      return palette(PALETTE_IDLE);
    case "stopAll":
      return palette(PALETTE_BLOCKED);
    case "pageStep": {
      const next = snapshot.pageIndex + button.delta;
      return next >= 0 && next < snapshot.pages.length ? palette(PALETTE_IDLE) : OFF;
    }
    case "rowStep": {
      const next = rowOffset + button.delta;
      return next >= 0 && next <= maxRowOffset(snapshot.rows) ? palette(PALETTE_IDLE) : OFF;
    }
  }
}

/**
 * Every LED the device has, as the snapshot says it should look. The grid
 * shows the page's rows from `rowOffset` down, which the arrows scroll.
 */
export function buildLedFrame(profile: LaunchpadProfile, snapshot: DeckSnapshot, rowOffset = 0): LedFrame {
  const offset = clampRowOffset(rowOffset, snapshot.rows);
  const frame: LedFrame = new Map();
  const byAddress = new Map<number, DeckCellView>();
  for (const cell of snapshot.cells) {
    const row = cell.row - offset;
    if (row >= 0 && row < DECK_HARDWARE_ROWS) byAddress.set(padNote(cell.lane, row), cell);
  }
  for (let row = 0; row < DECK_HARDWARE_ROWS; row++) {
    for (let lane = 0; lane < DECK_LANES; lane++) {
      const note = padNote(lane, row);
      frame.set(note, cellLed(byAddress.get(note)));
    }
  }
  for (let i = 0; i < 8; i++) {
    frame.set(topButtonCc(i), buttonLed(profile.topRow[i] ?? null, snapshot, offset));
    frame.set(rightButtonCc(i), buttonLed(profile.rightColumn[i] ?? null, snapshot, offset));
  }
  if (profile.hasLeftColumn) {
    const paged = snapshot.pages.length > 8 ? palette(PALETTE_IDLE) : OFF;
    frame.set(CC_LEFT_PREV, paged);
    frame.set(CC_LEFT_NEXT, paged);
    frame.set(CC_LEFT_STOP_ALL, palette(PALETTE_BLOCKED));
  }
  return frame;
}

function specKey(spec: LedSpec): string {
  if (spec.type === "rgb") return `rgb${spec.r},${spec.g},${spec.b}`;
  if (spec.type === "flash") return `flash${spec.color},${spec.between}`;
  return `${spec.type}${spec.color}`;
}

/** The LEDs whose look differs; a null previous frame means everything. */
export function diffLedFrames(prev: LedFrame | null, next: LedFrame): LedFrame {
  if (!prev) return new Map(next);
  const out: LedFrame = new Map();
  for (const [led, spec] of next) {
    const before = prev.get(led);
    if (!before || specKey(before) !== specKey(spec)) out.set(led, spec);
  }
  return out;
}

/** A frame that switches every LED of `frame` off. */
export function blankLedFrame(frame: LedFrame): LedFrame {
  const out: LedFrame = new Map();
  for (const led of frame.keys()) out.set(led, OFF);
  return out;
}

function specBytes(led: number, spec: LedSpec): number[] {
  if (spec.type === "static") return [0, led, spec.color];
  // Novation's order is colour B, then colour A.
  if (spec.type === "flash") return [1, led, spec.between, spec.color];
  if (spec.type === "pulse") return [2, led, spec.color];
  return [3, led, spec.r, spec.g, spec.b];
}

/** LED SysEx messages for these LEDs, split at the 106-spec limit. */
export function encodeLedMessages(profile: LaunchpadProfile, leds: LedFrame): number[][] {
  const entries = [...leds];
  const messages: number[][] = [];
  for (let i = 0; i < entries.length; i += MAX_LED_SPECS) {
    const body = entries.slice(i, i + MAX_LED_SPECS).flatMap(([led, spec]) => specBytes(led, spec));
    messages.push([SYSEX_START, ...NOVATION_PREFIX, profile.deviceByte, CMD_LED, ...body, SYSEX_END]);
  }
  return messages;
}
