import { describe, expect, it } from "vitest";
import { BED_CROSSFADE, BED_MIN_RUN, BED_SKIP_IN, BED_SKIP_OUT, bedWindow, planBeds, type BedWindow } from "./beds";

// Three 3-minute tunes, each with half a second of silence at the start.
const TUNES: BedWindow[] = [bedWindow(0.5, 180), bedWindow(0.5, 180), bedWindow(0.5, 180)];
const PLAYABLE = 180 - 0.5 - BED_SKIP_IN - BED_SKIP_OUT;

describe("bedWindow", () => {
  it("skips the tune's introduction and its ending", () => {
    expect(bedWindow(0.5, 180)).toEqual({ start: 0.5 + BED_SKIP_IN, end: 180 - BED_SKIP_OUT });
  });
});

describe("planBeds", () => {
  it("covers the whole stretch with no gap, each tune overlapping the next by the crossfade", () => {
    const segs = planBeds({ from: 4, to: 540, chapterStarts: [60, 150, 230, 330, 420], beds: TUNES });
    expect(segs[0].at).toBe(4);
    const last = segs[segs.length - 1];
    expect(last.at + last.length).toBeCloseTo(540);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i - 1].at + segs[i - 1].length - segs[i].at).toBeCloseTo(BED_CROSSFADE);
    }
  });

  it("hands over where a chapter starts, the latest one the tune can reach", () => {
    const segs = planBeds({ from: 4, to: 540, chapterStarts: [60, 150, 230, 330, 420], beds: TUNES });
    // The first tune can play until 4 + PLAYABLE (163.5); 150 is the latest chapter it reaches.
    expect(segs[1].at + BED_CROSSFADE / 2).toBeCloseTo(150);
  });

  it("never plays past a tune's window, so its ending is never heard", () => {
    const segs = planBeds({ from: 4, to: 900, chapterStarts: [], beds: TUNES });
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(PLAYABLE + 1e-9);
  });

  it("moves to the next tune in order and comes back to the first after the last", () => {
    const segs = planBeds({ from: 0, to: 700, chapterStarts: [], beds: TUNES });
    expect(segs.map((s) => s.bed)).toEqual([0, 1, 2, 0, 1]);
  });

  it("does not hop to a new tune for a chapter that starts soon after the last handover", () => {
    const segs = planBeds({ from: 0, to: 300, chapterStarts: [20], beds: TUNES });
    expect(segs[0].length).toBeGreaterThan(BED_MIN_RUN);
  });

  it("plays one tune for a video shorter than a tune", () => {
    expect(planBeds({ from: 2, to: 120, chapterStarts: [40, 80], beds: TUNES })).toEqual([{ bed: 0, from: TUNES[0].start, at: 2, length: 118 }]);
  });

  it("refuses a tune too short to play rather than looping a sliver of it", () => {
    expect(() => planBeds({ from: 0, to: 300, chapterStarts: [], beds: [bedWindow(0, 22)] })).toThrow(/too short/);
  });
});
