import { describe, it, expect } from "vitest";
import { computeAnchoredPosition, type Rect } from "./floatingPosition";

function rect(partial: Partial<Rect> & { top: number; left: number; width: number; height: number }): Rect {
  return {
    ...partial,
    right: partial.left + partial.width,
    bottom: partial.top + partial.height,
  };
}

const viewport = { width: 1000, height: 800 };

describe("computeAnchoredPosition", () => {
  it("opens below the trigger and right-aligns when there is room", () => {
    const trigger = rect({ top: 100, left: 400, width: 120, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 150 }, viewport);
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(134); // trigger.bottom (130) + gap (4)
    expect(pos.left).toBe(320); // trigger.right (520) - width (200)
  });

  it("flips above when there isn't enough room below and more room above", () => {
    const trigger = rect({ top: 700, left: 400, width: 120, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 150 }, viewport);
    expect(pos.placement).toBe("top");
    expect(pos.top).toBe(546); // trigger.top (700) - gap (4) - height (150)
  });

  it("clamps the panel on-screen when it would overflow the right edge", () => {
    const trigger = rect({ top: 100, left: 968, width: 30, height: 30 }); // right = 998
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 150 }, viewport);
    // right-align would put left at 798 (right edge 998 > 992); clamp to viewport - width - margin
    expect(pos.left).toBe(viewport.width - 200 - 8); // 792
  });

  it("clamps to the left margin when the trigger is near the left edge", () => {
    const trigger = rect({ top: 100, left: 4, width: 30, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 150 }, viewport);
    expect(pos.left).toBe(8); // margin floor
  });

  it("stays below (not flipped) when below is cramped but still roomier than above", () => {
    const trigger = rect({ top: 20, left: 400, width: 120, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 700 }, viewport);
    expect(pos.placement).toBe("bottom");
  });
});
