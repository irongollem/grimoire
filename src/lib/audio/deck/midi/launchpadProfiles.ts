/**
 * The Launchpad models the deck can drive (#1136), in one table so a wrong
 * byte is a one-line fix.
 *
 * VERIFIED against Novation's Launchpad Pro [MK3] Programmer's reference
 * manual: the Pro row (device byte 0x0E, port "LPProMK3 MIDI", velocity, left
 * column).
 *
 * VERIFIED on a Launchpad X on 3 Nov 2026: the X row. It answers the device
 * inquiry as family 01 03, switches to and from programmer mode with 0x0E on
 * device byte 0x0C and confirms each switch, takes the LED (0x03) message with
 * static, flash, pulse and RGB specs, and sends pads as notes 11 to 88 with
 * velocity (a hard press 127, a soft one about 20) and release as a zero
 * velocity note, the top row as CC 91 up and the right column as CC 89 down.
 * macOS names its ports "LPX MIDI In" / "LPX MIDI Out" (displayed with a
 * "Launchpad X " prefix) beside "LPX DAW". The LED colours in
 * launchpadProtocol.ts were picked by eye on the same device.
 *
 * UNVERIFIED, from memory and never tried on hardware: the Mini MK3 row (0x0D,
 * "LPMiniMK3 MIDI"), that it uses the same commands, and that it sends a fixed
 * velocity.
 */

import type { DeckTool } from "../deckSurface";

export type LaunchpadProfileId = "pro3" | "x" | "mini3";

export interface LaunchpadProfile {
  id: LaunchpadProfileId;
  label: string;
  /** The model byte after the Novation SysEx prefix F0 00 20 29 02. */
  deviceByte: number;
  /** The port that carries Programmer mode and lighting; matched as a substring. */
  portSubstring: string;
  /** Every port of this model, so the DIN and DAW ports are not offered to Learn. */
  portFamily: string;
  /** False when pads send one fixed velocity, so it must not drive dynamics. */
  hasVelocity: boolean;
  /** The Pro's extra left-hand column of buttons. */
  hasLeftColumn: boolean;
  /** The eight buttons above the grid, left to right. */
  topRow: readonly LaunchpadButton[];
  /** The eight buttons right of the grid, top to bottom. */
  rightColumn: readonly LaunchpadButton[];
}

/**
 * What one edge button does. A tool and Hush borrow while held and lock on a
 * tap (holdTap.ts); everything else fires on the press. Null is a button the
 * deck leaves dark.
 */
export type LaunchpadButton =
  | { action: "tool"; tool: Exclude<DeckTool, "play"> }
  | { action: "play" }
  | { action: "hush" }
  | { action: "page"; index: number }
  | { action: "pageStep"; delta: -1 | 1 }
  | { action: "rowStep"; delta: -1 | 1 }
  | { action: "fadeAll" }
  | { action: "pauseAll" }
  | { action: "stopAll" }
  | null;

const tool = (t: Exclude<DeckTool, "play">): LaunchpadButton => ({ action: "tool", tool: t });

/** The Pro's top row: one button per page. */
const PAGE_BUTTONS: readonly LaunchpadButton[] = Array.from({ length: 8 }, (_, index) => ({ action: "page", index }));

/**
 * The X and Mini MK3 print the same top row: up, down, left, right, Session,
 * then three mode buttons (Note, Custom, Capture MIDI on the X). The arrows
 * scroll rows and pages, and Session is Play, the way out of a locked tool:
 * without it a tapped tool stayed on with nothing on the device to say how to
 * leave it, and the pads seemed to stop working (3 Nov 2026).
 */
const ARROW_TOP_ROW: readonly LaunchpadButton[] = [
  { action: "rowStep", delta: -1 },
  { action: "rowStep", delta: 1 },
  { action: "pageStep", delta: -1 },
  { action: "pageStep", delta: 1 },
  { action: "play" },
  tool("loop"),
  { action: "pauseAll" },
  { action: "stopAll" },
];

/** The X's right column, matched to its printed labels where one fits. */
const X_RIGHT_COLUMN: readonly LaunchpadButton[] = [
  tool("volume"), // Volume
  tool("fade"), // Pan
  { action: "fadeAll" }, // Send A
  null, // Send B
  tool("stop"), // Stop Clip
  { action: "hush" }, // Mute
  tool("solo"), // Solo
  tool("edit"), // Record Arm
];

/** Unlabelled arrows on the Mini MK3; the Pro's labels are unchecked. */
const PLAIN_RIGHT_COLUMN: readonly LaunchpadButton[] = [
  tool("loop"),
  tool("stop"),
  tool("fade"),
  tool("solo"),
  tool("volume"),
  tool("edit"),
  { action: "hush" },
  { action: "fadeAll" },
];

export const LAUNCHPAD_PROFILES: readonly LaunchpadProfile[] = [
  {
    id: "pro3",
    label: "Launchpad Pro MK3",
    deviceByte: 0x0e,
    portSubstring: "LPProMK3 MIDI",
    portFamily: "LPProMK3",
    hasVelocity: true,
    hasLeftColumn: true,
    topRow: PAGE_BUTTONS,
    rightColumn: PLAIN_RIGHT_COLUMN,
  },
  {
    id: "x",
    label: "Launchpad X",
    deviceByte: 0x0c,
    portSubstring: "LPX MIDI",
    portFamily: "LPX",
    hasVelocity: true,
    hasLeftColumn: false,
    topRow: ARROW_TOP_ROW,
    rightColumn: X_RIGHT_COLUMN,
  },
  {
    id: "mini3",
    label: "Launchpad Mini MK3",
    deviceByte: 0x0d,
    portSubstring: "LPMiniMK3 MIDI",
    portFamily: "LPMiniMK3",
    hasVelocity: false,
    hasLeftColumn: false,
    topRow: ARROW_TOP_ROW,
    rightColumn: PLAIN_RIGHT_COLUMN,
  },
];

function lower(name: string | null): string {
  return name === null ? "" : name.toLowerCase();
}

/** The profile whose lighting port this is, or null. Wrapped Windows names still match. */
export function profileForPort(name: string | null): LaunchpadProfile | null {
  const n = lower(name);
  return LAUNCHPAD_PROFILES.find((p) => n.includes(p.portSubstring.toLowerCase())) ?? null;
}

/** True for any port of a Launchpad, MIDI, DIN or DAW. */
export function isLaunchpadFamilyPort(name: string | null): boolean {
  const n = lower(name);
  return LAUNCHPAD_PROFILES.some((p) => n.includes(p.portFamily.toLowerCase()));
}
