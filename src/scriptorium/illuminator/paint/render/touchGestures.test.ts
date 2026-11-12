import { describe, expect, it } from "vitest";
import { createTouchGestures, type PointerRecord } from "./touchGestures";

const rec = (id: number, time: number, x = 0, y = 0, type = "touch"): PointerRecord => ({ id, type, x, y, time });

describe("one finger", () => {
  it("paints before any pen has been seen (fails if touch-only devices lose finger painting)", () => {
    const g = createTouchGestures({ penSeen: false });
    expect(g.down(rec(1, 0))).toEqual({ kind: "paint-pending" });
  });

  it("pans once a pen has been seen this visit (fails if the pen-seen rule is dropped)", () => {
    const g = createTouchGestures({ penSeen: false });
    expect(g.seePen()).toBe(true);
    expect(g.seePen()).toBe(false);
    expect(g.down(rec(1, 0))).toEqual({ kind: "pan" });
  });

  it("pans from the first touch when a pen was seen on an earlier visit (fails if the memory is ignored)", () => {
    const g = createTouchGestures({ penSeen: true });
    expect(g.down(rec(1, 0))).toEqual({ kind: "pan" });
    expect(g.move(rec(1, 10, 30, 0))).toEqual({ kind: "pan" });
  });

  it("holds a stroke back until the finger has moved or waited (fails if a dot is begun at once)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    expect(g.move(rec(1, 20, 2, 0))).toEqual({ kind: "buffer" });
    expect(g.move(rec(1, 40, 5, 0))).toEqual({ kind: "commit" });
    expect(g.move(rec(1, 60, 9, 0))).toEqual({ kind: "paint" });
  });

  it("commits by time when the finger rests (fails if a held finger never paints)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    expect(g.move(rec(1, 130, 1, 0))).toEqual({ kind: "commit" });
  });

  it("lifting a finger that never committed still leaves its dot (fails if a quick touch paints nothing)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    expect(g.up(rec(1, 50))).toEqual({ kind: "end", commitFirst: true });
  });

  it("a cancelled uncommitted touch leaves no dot (fails if a cancel keeps the stroke)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    expect(g.cancel(rec(1, 50))).toEqual({ kind: "end", commitFirst: false });
  });
});

describe("second finger landing on a finger stroke", () => {
  it("discards a stroke that was barely begun (fails if the dot before a pinch is kept)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    g.move(rec(1, 30, 1, 0));
    expect(g.down(rec(2, 60, 50, 0))).toMatchObject({ kind: "pinch-start", keepStroke: false });
  });

  it("keeps a stroke that had travelled (fails if every stroke is thrown away by a second finger)", () => {
    const g = createTouchGestures({ penSeen: false });
    g.down(rec(1, 0));
    g.move(rec(1, 30, 20, 0));
    expect(g.down(rec(2, 60, 50, 0))).toMatchObject({ kind: "pinch-start", keepStroke: true });
  });
});

describe("two- and three-finger taps", () => {
  it("two fingers down and up quickly undo (fails if the tap is not recognised)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    g.down(rec(2, 20, 50, 0));
    expect(g.up(rec(1, 100))).toEqual({ kind: "none" });
    expect(g.up(rec(2, 110, 50, 0))).toEqual({ kind: "tap-undo" });
  });

  it("three fingers redo, and a third finger ends the pinch (fails if three fingers also undo)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    g.down(rec(2, 10, 40, 0));
    expect(g.down(rec(3, 20, 80, 0))).toEqual({ kind: "pinch-end" });
    g.up(rec(1, 100));
    g.up(rec(2, 105));
    expect(g.up(rec(3, 110))).toEqual({ kind: "tap-redo" });
  });

  it("a slow touch is not a tap (fails if the 300 ms limit is removed)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    g.down(rec(2, 10, 50, 0));
    g.up(rec(1, 400));
    expect(g.up(rec(2, 410, 50, 0))).toEqual({ kind: "none" });
  });

  it("fingers that slide are not a tap (fails if the 10 px movement limit is removed)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    g.down(rec(2, 10, 100, 0));
    g.move(rec(1, 50, 0, 15));
    g.move(rec(2, 55, 100, 15));
    g.up(rec(1, 100, 0, 15));
    expect(g.up(rec(2, 110, 100, 15))).toEqual({ kind: "none" });
  });

  it("two fingers that spread are a pinch, not a tap (fails if distance change is not counted)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0, 0, 0));
    g.down(rec(2, 10, 100, 0));
    expect(g.move(rec(2, 40, 108, 0))).toEqual({ kind: "pinch" });
    g.move(rec(1, 45, -8, 0));
    g.up(rec(1, 100, -8, 0));
    expect(g.up(rec(2, 110, 108, 0))).toEqual({ kind: "none" });
  });

  it("a single quick touch is not an undo (fails if one finger taps undo)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    expect(g.up(rec(1, 50))).toEqual({ kind: "end", commitFirst: false });
  });
});

describe("palm rejection while the pen is down", () => {
  it("a resting palm does not paint, pan or tap once the pen is down (fails if touches are not ignored during a pen stroke)", () => {
    const g = createTouchGestures({ penSeen: false });
    expect(g.down(rec(9, 0, 0, 0, "pen"))).toEqual({ kind: "paint", cancelTouches: false });
    expect(g.down(rec(1, 10))).toEqual({ kind: "ignore" });
    expect(g.down(rec(2, 15, 40, 0))).toEqual({ kind: "ignore" });
    expect(g.move(rec(1, 30, 5, 5))).toEqual({ kind: "ignore" });
    expect(g.up(rec(1, 60))).toEqual({ kind: "ignore" });
    expect(g.up(rec(2, 70))).toEqual({ kind: "ignore" });
  });

  it("a palm already on the glass is dropped when the pen lands (fails if it keeps panning under the pen)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(1, 0));
    expect(g.down(rec(9, 20, 0, 0, "pen"))).toEqual({ kind: "paint", cancelTouches: true });
    expect(g.move(rec(1, 30, 40, 0))).toEqual({ kind: "ignore" });
    expect(g.up(rec(1, 50))).toEqual({ kind: "ignore" });
  });

  it("fingers work again once the pen lifts (fails if palm rejection sticks)", () => {
    const g = createTouchGestures({ penSeen: true });
    g.down(rec(9, 0, 0, 0, "pen"));
    g.up(rec(9, 100, 0, 0, "pen"));
    expect(g.down(rec(1, 200))).toEqual({ kind: "pan" });
  });
});
