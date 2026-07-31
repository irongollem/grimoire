import { describe, it, expect } from "vitest";
import { computeFit, type FitChild } from "@/lib/fitText";

const child = (top: number, height: number, lineHeight = 10): FitChild => ({
  top,
  height,
  lineHeight,
});

describe("computeFit", () => {
  it("shows every entry when they all fit", () => {
    const children = [child(0, 20), child(22, 20), child(44, 20)];
    expect(computeFit(children, 100)).toEqual({
      visibleCount: 3,
      partialIndex: -1,
      clampLines: 0,
    });
  });

  it("drops the overflowing entry when too little room is left for a line", () => {
    // Two entries fit (bottom 44 <= 50). Third starts at 46, only 4px left —
    // not enough for even one 10px line, so it is dropped, not clamped.
    const children = [child(0, 20), child(22, 20), child(46, 30, 10)];
    expect(computeFit(children, 50)).toEqual({
      visibleCount: 2,
      partialIndex: -1,
      clampLines: 0,
    });
  });

  it("gives the partial entry as many whole lines as fit", () => {
    // Entry 1 fits (0..20). Entry 2 starts at 22, container is 55 tall.
    // 55 - 22 = 33px remaining, lineHeight 10 -> 3 lines.
    const children = [child(0, 20), child(22, 60, 10)];
    expect(computeFit(children, 55)).toEqual({
      visibleCount: 1,
      partialIndex: 1,
      clampLines: 3,
    });
  });

  it("drops a trailing entry that has no room for even one line", () => {
    const children = [child(0, 48, 10), child(50, 30, 10)];
    // First fits (48 <= 50). Second starts at 50, 0px remaining -> dropped.
    expect(computeFit(children, 50)).toEqual({
      visibleCount: 1,
      partialIndex: -1,
      clampLines: 0,
    });
  });

  it("clamps the very first entry when nothing fits whole", () => {
    const children = [child(0, 80, 10)];
    // 40px tall container, lineHeight 10 -> 4 lines of the first entry.
    expect(computeFit(children, 40)).toEqual({
      visibleCount: 0,
      partialIndex: 0,
      clampLines: 4,
    });
  });

  it("handles an empty list", () => {
    expect(computeFit([], 100)).toEqual({
      visibleCount: 0,
      partialIndex: -1,
      clampLines: 0,
    });
  });

  it("absorbs sub-pixel rounding via tolerance", () => {
    // Entry bottom is 100.4, container 100 — should still count as fitting.
    const children = [child(0, 100.4, 10)];
    expect(computeFit(children, 100)).toEqual({
      visibleCount: 1,
      partialIndex: -1,
      clampLines: 0,
    });
  });
});
