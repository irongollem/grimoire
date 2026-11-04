/**
 * The Launchpad's wire protocol (#1136), pure: bytes in, deck events out, and
 * a DeckSnapshot in, LED messages out. Nothing here touches Web MIDI or Vue.
 * Layout and byte facts: Novation's Launchpad Pro [MK3] Programmer's reference;
 * the other models are unverified, see launchpadProfiles.ts.
 */

import { DECK_HARDWARE_ROWS, DECK_LANES, type DeckCellView, type DeckSnapshot, type DeckTool } from "../deckSurface";
import type { LaunchpadProfile } from "./launchpadProfiles";

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const NOVATION_PREFIX = [0x00, 0x20, 0x29, 0x02];
const CMD_PROGRAMMER = 0x0e;
const CMD_LED = 0x03;

/** The manual allows up to 106 LED specs in one message. */
export const MAX_LED_SPECS = 106;

/** Right-hand column, top to bottom. Null entries are the non-tool buttons. */
export const RIGHT_COLUMN_TOOLS: readonly (DeckTool | "hush" | "fadeAll")[] = [
  "loop",
  "stop",
  "fade",
  "solo",
  "volume",
  "edit",
  "hush",
  "fadeAll",
];

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
  | { type: "pulse"; color: number }
  | { type: "rgb"; r: number; g: number; b: number };

export type LedFrame = Map<number, LedSpec>;

type Rgb = readonly [number, number, number];

/** 0xf2c35a and friends, halved into the 0 to 127 the device takes. */
const CATEGORY_RGB: Record<"music" | "ambient" | "effects", Rgb> = {
  music: [0xf2 >> 1, 0xc3 >> 1, 0x5a >> 1],
  ambient: [0x74 >> 1, 0xcd >> 1, 0xb0 >> 1],
  effects: [0x86 >> 1, 0xa9 >> 1, 0xf5 >> 1],
};
const CATEGORY_PULSE_PALETTE: Record<"music" | "ambient" | "effects", number> = { music: 13, ambient: 37, effects: 45 };

const OFF: LedSpec = { type: "static", color: 0 };
const WHITE: Rgb = [110, 110, 110];
const DIM_GOLD: Rgb = [40, 30, 10];
const DIM_GREY: Rgb = [12, 12, 12];
const DIM_RED: Rgb = [40, 0, 0];
const AMBER: Rgb = [127, 80, 10];

function rgb(c: Rgb): LedSpec {
  return { type: "rgb", r: c[0], g: c[1], b: c[2] };
}

function scaled(c: Rgb, f: number): LedSpec {
  return { type: "rgb", r: Math.round(c[0] * f), g: Math.round(c[1] * f), b: Math.round(c[2] * f) };
}

export function cellLed(cell: DeckCellView | undefined): LedSpec {
  if (!cell) return OFF;
  const category = cell.category ?? "effects";
  const base = CATEGORY_RGB[category];
  switch (cell.light) {
    case "off":
      return OFF;
    case "ready":
      return scaled(base, 0.15);
    case "playing":
    case "held":
      return scaled(base, 1);
    case "looping":
      return { type: "pulse", color: CATEGORY_PULSE_PALETTE[category] };
    case "fading":
      return scaled(base, 0.45);
    case "ducked":
      return scaled(base, 0.3);
    case "blocked":
      return rgb(DIM_RED);
  }
}

/** Every LED the device has, as the snapshot says it should look. */
export function buildLedFrame(profile: LaunchpadProfile, snapshot: DeckSnapshot): LedFrame {
  const frame: LedFrame = new Map();
  const byAddress = new Map<number, DeckCellView>();
  for (const cell of snapshot.cells) byAddress.set(padNote(cell.lane, cell.row), cell);
  for (let row = 0; row < DECK_HARDWARE_ROWS; row++) {
    for (let lane = 0; lane < DECK_LANES; lane++) {
      const note = padNote(lane, row);
      frame.set(note, cellLed(byAddress.get(note)));
    }
  }
  for (let i = 0; i < 8; i++) {
    let top: LedSpec = OFF;
    if (i < snapshot.pages.length) top = rgb(i === snapshot.pageIndex ? WHITE : DIM_GOLD);
    frame.set(topButtonCc(i), top);
    const button = RIGHT_COLUMN_TOOLS[i];
    let colour: Rgb = DIM_GREY;
    if (button === "hush") colour = snapshot.hush ? AMBER : DIM_GREY;
    else if (button !== "fadeAll" && button === snapshot.tool) colour = WHITE;
    frame.set(rightButtonCc(i), rgb(colour));
  }
  if (profile.hasLeftColumn) {
    const paged = snapshot.pages.length > 8 ? rgb(DIM_GREY) : OFF;
    frame.set(CC_LEFT_PREV, paged);
    frame.set(CC_LEFT_NEXT, paged);
    frame.set(CC_LEFT_STOP_ALL, rgb(DIM_RED));
  }
  return frame;
}

function specKey(spec: LedSpec): string {
  return spec.type === "rgb" ? `rgb${spec.r},${spec.g},${spec.b}` : `${spec.type}${spec.color}`;
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
