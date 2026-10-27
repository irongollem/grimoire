import { describe, it, expect } from "vitest";
import { computeAnchoredPosition, type Rect } from "@/lib/floatingPosition";

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
    // Below: 800 - 50 - 4 = 746, too short for 780. Above: 20 - 4 = 16. Neither fits; the roomier side wins.
    const trigger = rect({ top: 20, left: 400, width: 120, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 780 }, viewport);
    expect(pos.placement).toBe("bottom");
    // It cannot start at 54 without running off the bottom, so it is held 8px inside the viewport edge.
    expect(pos.top).toBe(12);
  });

  it("opens below when the room below exactly fits the panel", () => {
    // Below: 800 - 650 - 4 = 146 exactly the panel's height; above has more (646).
    const trigger = rect({ top: 620, left: 400, width: 120, height: 30 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 146 }, viewport);
    expect(pos.placement).toBe("bottom");
  });

  it("holds a panel that flipped above inside the top margin when it is taller than the room", () => {
    // Below: 800 - 790 - 4 = 6, above: 770 - 4 = 766. The panel (790) fits in neither; above is roomier.
    const trigger = rect({ top: 770, left: 400, width: 120, height: 20 });
    const pos = computeAnchoredPosition(trigger, { width: 200, height: 790 }, viewport);
    expect(pos.placement).toBe("top");
    // 770 - 4 - 790 is negative, so the panel is held at the 8px margin below the top edge.
    expect(pos.top).toBe(8);
  });
});
