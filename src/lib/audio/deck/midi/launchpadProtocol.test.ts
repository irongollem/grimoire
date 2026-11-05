import { describe, expect, it } from "vitest";
import type { DeckCellView, DeckSnapshot } from "../deckSurface";
import { LAUNCHPAD_PROFILES, type LaunchpadProfile } from "./launchpadProfiles";
import {
  buildLedFrame,
  cellLed,
  decodeLaunchpadMessage,
  diffLedFrames,
  encodeLedMessages,
  type LedFrame,
  type LedSpec,
  MAX_LED_SPECS,
  padNote,
  programmerModeMessage,
  rightButtonCc,
  topButtonCc,
} from "./launchpadProtocol";

const [PRO, X, MINI] = LAUNCHPAD_PROFILES as [LaunchpadProfile, LaunchpadProfile, LaunchpadProfile];

function cell(over: Partial<DeckCellView> = {}): DeckCellView {
  return {
    lane: 0,
    row: 0,
    padId: "p",
    kind: "sound",
    category: "music",
    name: "n",
    light: "ready",
    loop: false,
    mode: "toggle",
    modeIsDefault: true,
    takes: 1,
    nextTake: 0,
    progress: 0,
    volume: 1,
    soloed: false,
    blockedReason: null,
    meta: null,
    keyLabel: null,
    ...over,
  } as DeckCellView;
}

function snap(over: Partial<DeckSnapshot> = {}): DeckSnapshot {
  return {
    pages: [{ id: "a", name: "A" }],
    pageIndex: 0,
    lanes: [],
    rows: 1,
    keyRow: 0,
    cells: [],
    tool: "play",
    lockedTool: "play",
    hush: false,
    paused: false,
    audibleCount: 0,
    masterVolume: 1,
    ...over,
  };
}

describe("address mapping", () => {
  it("puts deck row 0 on the TOP row (note 81) and row 7 on the bottom (11); a flipped grid would play the wrong pads", () => {
    expect(padNote(0, 0)).toBe(81);
    expect(padNote(7, 0)).toBe(88);
    expect(padNote(0, 7)).toBe(11);
    expect(padNote(7, 7)).toBe(18);
  });

  it("decodes every note back to the address that made it", () => {
    for (let row = 0; row < 8; row++) {
      for (let lane = 0; lane < 8; lane++) {
        const ev = decodeLaunchpadMessage(PRO, [0x90, padNote(lane, row), 100]);
        expect(ev).toMatchObject({ kind: "pad", lane, row, down: true });
      }
    }
  });

  it("ignores notes outside the 8x8 grid (19, 90, 9)", () => {
    for (const n of [9, 19, 90, 0]) expect(decodeLaunchpadMessage(PRO, [0x90, n, 100])).toBeNull();
  });

  it("treats note-on velocity 0 and note-off as release; a note-on-0 read as a press would stick every pad", () => {
    expect(decodeLaunchpadMessage(PRO, [0x90, 81, 0])).toMatchObject({ down: false });
    expect(decodeLaunchpadMessage(PRO, [0x80, 81, 64])).toMatchObject({ down: false });
  });

  it("reads the top row CC 91..98 as buttons 0..7", () => {
    expect(decodeLaunchpadMessage(PRO, [0xb0, 91, 127])).toEqual({ kind: "top", index: 0, down: true });
    expect(decodeLaunchpadMessage(PRO, [0xb0, 98, 0])).toEqual({ kind: "top", index: 7, down: false });
  });

  it("reads the right column CC 89 down to 19 as buttons 0..7, top to bottom", () => {
    expect(decodeLaunchpadMessage(PRO, [0xb0, 89, 127])).toMatchObject({ kind: "right", index: 0 });
    expect(decodeLaunchpadMessage(PRO, [0xb0, 19, 127])).toMatchObject({ kind: "right", index: 7 });
    expect(decodeLaunchpadMessage(PRO, [0xb0, 80, 127])).toMatchObject({ kind: "left" });
  });

  it("reads the Pro's left column, but not on a model without one", () => {
    expect(decodeLaunchpadMessage(PRO, [0xb0, 80, 127])).toEqual({ kind: "left", button: "prev", down: true });
    expect(decodeLaunchpadMessage(PRO, [0xb0, 70, 127])).toEqual({ kind: "left", button: "next", down: true });
    expect(decodeLaunchpadMessage(PRO, [0xb0, 10, 127])).toEqual({ kind: "left", button: "stopAll", down: true });
    expect(decodeLaunchpadMessage(MINI, [0xb0, 10, 127])).toBeNull();
    expect(decodeLaunchpadMessage(X, [0xb0, 80, 127])).toBeNull();
  });

  it("ignores sysex and short messages", () => {
    expect(decodeLaunchpadMessage(PRO, [0xf0, 0, 0xf7])).toBeNull();
    expect(decodeLaunchpadMessage(PRO, [0x90, 81])).toBeNull();
  });
});

describe("programmer mode bytes", () => {
  it("switches each model on and off with its own device byte", () => {
    expect(programmerModeMessage(PRO, true)).toEqual([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x01, 0xf7]);
    expect(programmerModeMessage(PRO, false)).toEqual([0xf0, 0x00, 0x20, 0x29, 0x02, 0x0e, 0x0e, 0x00, 0xf7]);
    expect(programmerModeMessage(X, true)[5]).toBe(0x0c);
    expect(programmerModeMessage(MINI, true)[5]).toBe(0x0d);
  });
});

describe("LED frame", () => {
  it("lights each state as designed, per category", () => {
    const c = (light: DeckCellView["light"], category: DeckCellView["category"] = "music") =>
      cellLed(cell({ light, category }));
    expect(c("off")).toEqual({ type: "static", color: 0 });
    expect(c("playing")).toEqual({ type: "rgb", r: 127, g: 75, b: 0 });
    expect(c("held")).toEqual(c("playing"));
    expect(c("blocked")).toEqual({ type: "static", color: 121 });
    expect(c("playing", "ambient")).toEqual({ type: "rgb", r: 0, g: 127, b: 60 });
    expect(c("playing", "effects")).toEqual({ type: "rgb", r: 40, g: 30, b: 127 });
  });

  it("draws every dim look from the palette, never a scaled RGB, which the LEDs turn muddy", () => {
    const c = (light: DeckCellView["light"], category: DeckCellView["category"]) => cellLed(cell({ light, category }));
    expect(c("ready", "music")).toEqual({ type: "static", color: 126 });
    expect(c("ready", "ambient")).toEqual({ type: "static", color: 22 });
    expect(c("ready", "effects")).toEqual({ type: "static", color: 38 });
    expect(c("ducked", "ambient")).toEqual(c("ready", "ambient"));
    expect(c("looping", "music")).toEqual({ type: "pulse", color: 96 });
    expect(c("looping", "ambient")).toEqual({ type: "pulse", color: 21 });
    expect(c("looping", "effects")).toEqual({ type: "pulse", color: 45 });
  });

  it("flashes a fading pad between its pulse colour and its ready shade, so it reads apart from a loop", () => {
    expect(cellLed(cell({ light: "fading", category: "ambient" }))).toEqual({ type: "flash", color: 21, between: 22 });
  });

  it("lights a cell at its own note, and every other pad off", () => {
    const frame = buildLedFrame(PRO, snap({ cells: [cell({ lane: 2, row: 1, light: "playing" })] }));
    expect(frame.get(padNote(2, 1))).toMatchObject({ type: "rgb" });
    expect(frame.get(padNote(3, 1))).toEqual({ type: "static", color: 0 });
    expect(frame.get(padNote(2, 5))).toEqual({ type: "static", color: 0 });
  });

  it("lights the top row: current page white, other pages dim gold, no page off", () => {
    const frame = buildLedFrame(
      PRO,
      snap({
        pages: [
          { id: "a", name: "a" },
          { id: "b", name: "b" },
        ],
        pageIndex: 1,
      }),
    );
    expect(frame.get(topButtonCc(1))).toEqual({ type: "rgb", r: 110, g: 110, b: 110 });
    expect(frame.get(topButtonCc(0))).toEqual({ type: "static", color: 126 });
    expect(frame.get(topButtonCc(2))).toEqual({ type: "static", color: 0 });
  });

  it("lights the active tool white, hush amber while on, others dim grey", () => {
    const frame = buildLedFrame(PRO, snap({ tool: "stop", hush: true }));
    expect(frame.get(rightButtonCc(1))).toEqual({ type: "rgb", r: 110, g: 110, b: 110 });
    expect(frame.get(rightButtonCc(0))).toEqual({ type: "static", color: 103 });
    expect(frame.get(rightButtonCc(6))).toEqual({ type: "rgb", r: 127, g: 80, b: 10 });
    expect(frame.get(rightButtonCc(7))).toEqual({ type: "static", color: 103 });
    expect(buildLedFrame(PRO, snap()).get(rightButtonCc(6))).toEqual({ type: "static", color: 103 });
  });

  it("lights the Pro extras only on the Pro, page arrows only past 8 pages", () => {
    const many = snap({ pages: Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, name: `${i}` })) });
    expect(buildLedFrame(PRO, many).get(80)).toEqual({ type: "static", color: 103 });
    expect(buildLedFrame(PRO, snap()).get(80)).toEqual({ type: "static", color: 0 });
    expect(buildLedFrame(PRO, snap()).get(10)).toEqual({ type: "static", color: 121 });
    expect(buildLedFrame(MINI, many).has(80)).toBe(false);
    expect(buildLedFrame(MINI, many).has(10)).toBe(false);
  });
});

describe("Launchpad X buttons and the row window", () => {
  it("lights Play white until a tool is tapped on, then the tool's own button", () => {
    expect(buildLedFrame(X, snap()).get(topButtonCc(4))).toEqual({ type: "rgb", r: 110, g: 110, b: 110 });
    const locked = buildLedFrame(X, snap({ tool: "stop", lockedTool: "stop" }));
    expect(locked.get(topButtonCc(4))).toEqual({ type: "static", color: 103 });
    expect(locked.get(rightButtonCc(4))).toEqual({ type: "rgb", r: 110, g: 110, b: 110 });
  });

  it("lights Mute amber while hushed and Custom amber while paused, and leaves Send B dark", () => {
    const frame = buildLedFrame(X, snap({ hush: true, paused: true }));
    expect(frame.get(rightButtonCc(5))).toEqual({ type: "rgb", r: 127, g: 80, b: 10 });
    expect(frame.get(topButtonCc(6))).toEqual({ type: "rgb", r: 127, g: 80, b: 10 });
    expect(frame.get(rightButtonCc(3))).toEqual({ type: "static", color: 0 });
  });

  it("lights an arrow only where it can go", () => {
    const top = buildLedFrame(X, snap({ rows: 10 }), 0);
    expect(top.get(topButtonCc(0))).toEqual({ type: "static", color: 0 });
    expect(top.get(topButtonCc(1))).toEqual({ type: "static", color: 103 });
    const bottom = buildLedFrame(X, snap({ rows: 10 }), 2);
    expect(bottom.get(topButtonCc(0))).toEqual({ type: "static", color: 103 });
    expect(bottom.get(topButtonCc(1))).toEqual({ type: "static", color: 0 });
    // A page of eight rows or fewer does not scroll at all.
    expect(buildLedFrame(X, snap({ rows: 8 })).get(topButtonCc(1))).toEqual({ type: "static", color: 0 });
  });

  // Fails if the page arrows still went dark at the last page: a step from there wraps to the first.
  it("lights both page arrows whenever there is another page, and neither with one", () => {
    const pages = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const last = buildLedFrame(X, snap({ pages, pageIndex: 1 }));
    expect(last.get(topButtonCc(2))).toEqual({ type: "static", color: 103 });
    expect(last.get(topButtonCc(3))).toEqual({ type: "static", color: 103 });
    const one = buildLedFrame(X, snap({ pages: [pages[0]], pageIndex: 0 }));
    expect(one.get(topButtonCc(3))).toEqual({ type: "static", color: 0 });
  });

  it("draws the rows from the offset down, and clamps an offset past the last row", () => {
    const cells = [cell({ lane: 0, row: 0, light: "playing" }), cell({ lane: 0, row: 9, light: "playing" })];
    const scrolled = buildLedFrame(X, snap({ rows: 10, cells }), 2);
    expect(scrolled.get(padNote(0, 7))).toMatchObject({ type: "rgb" });
    expect(scrolled.get(padNote(0, 0))).toEqual({ type: "static", color: 0 });
    expect(buildLedFrame(X, snap({ rows: 10, cells }), 50)).toEqual(scrolled);
  });
});

describe("diff and encoding", () => {
  it("sends only the LEDs that changed; resending a whole frame per tick floods the device", () => {
    const a = buildLedFrame(PRO, snap({ cells: [cell({ light: "ready" })] }));
    const b = buildLedFrame(PRO, snap({ cells: [cell({ light: "playing" })] }));
    expect([...diffLedFrames(a, b).keys()]).toEqual([81]);
    expect(diffLedFrames(a, a).size).toBe(0);
  });

  it("sends everything when there is no previous frame", () => {
    const a = buildLedFrame(PRO, snap());
    expect(diffLedFrames(null, a).size).toBe(a.size);
  });

  it("encodes static, flash, pulse and RGB specs byte for byte", () => {
    const leds = new Map<number, LedSpec>([
      [11, { type: "static", color: 5 }],
      [12, { type: "pulse", color: 13 }],
      [13, { type: "rgb", r: 1, g: 2, b: 3 }],
      // Novation's flash takes colour B first: the ready shade, then the pulse colour.
      [14, { type: "flash", color: 96, between: 126 }],
    ]);
    expect(encodeLedMessages(PRO, leds)).toEqual([
      [0xf0, 0, 0x20, 0x29, 2, 0x0e, 0x03, 0, 11, 5, 2, 12, 13, 3, 13, 1, 2, 3, 1, 14, 126, 96, 0xf7],
    ]);
  });

  it("resends a fading pad when either of its two flash colours changes", () => {
    const a: LedFrame = new Map([[11, { type: "flash", color: 96, between: 126 }]]);
    const b: LedFrame = new Map([[11, { type: "flash", color: 96, between: 22 }]]);
    expect([...diffLedFrames(a, b).keys()]).toEqual([11]);
  });

  it("splits at 106 specs per message; the device rejects a longer one", () => {
    const leds = new Map(Array.from({ length: 107 }, (_, i) => [i, { type: "static", color: 1 } as const]));
    const msgs = encodeLedMessages(PRO, leds);
    expect(msgs).toHaveLength(2);
    expect((msgs[0].length - 8) / 3).toBe(MAX_LED_SPECS);
    expect((msgs[1].length - 8) / 3).toBe(1);
    expect(encodeLedMessages(PRO, new Map())).toEqual([]);
  });
});
