import { describe, it, expect, vi } from "vitest";
import {
  drawerTransition,
  railTransition,
  revealKeyframes,
  originTransform,
  REST_TRANSFORM,
  flipDelta,
  captureFlipPositions,
  playFlipTransition,
  FLIP_MOVE_THRESHOLD_PX,
  cardTurnStyle,
  CARD_TURN_MS,
  playBlockResize,
  resizeDuration,
  type FlipSnapshot,
} from "./motion";

const PANEL = { top: 100, left: 200, width: 400, height: 300 };

/**
 * Runs `body` as if the OS had reduce-motion on, and puts `matchMedia` back
 * afterwards however the body exits.
 *
 * Shared rather than written per test on purpose: two blocks had the same
 * twelve-line stub, which is the exact duplication `motion.ts` exists to stop
 * — and a reduce-motion double that drifts between tests is worse than none,
 * because both still pass while checking different things.
 */
function withReducedMotion(body: () => void): void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
  try {
    body();
  } finally {
    window.matchMedia = original;
  }
}

describe("originTransform", () => {
  it("moves the panel onto the origin's centre and shrinks it to the origin's width", () => {
    // Origin centre (60, 40); panel centre (400, 250) → travel (-340, -210).
    const from = originTransform({ top: 20, left: 20, width: 80, height: 40 }, PANEL);
    expect(from).toBe("translate(-340px, -210px) scale(0.2)");
  });

  it("lands where REST_TRANSFORM leaves it when the two rects coincide", () => {
    expect(originTransform(PANEL, PANEL)).toBe("translate(0px, 0px) scale(1)");
    expect(REST_TRANSFORM).toBe("translate(0, 0) scale(1)");
  });

  it("never scales up from an origin wider than the panel", () => {
    // Concentric with the panel, so only the scale is in question.
    const from = originTransform({ top: -50, left: -50, width: 900, height: 600 }, PANEL);
    expect(from).toBe("translate(0px, 0px) scale(1)");
  });

  it("falls back to scale 1 rather than NaN when the panel has not been laid out", () => {
    const from = originTransform({ top: 0, left: 0, width: 0, height: 0 }, { top: 0, left: 0, width: 0, height: 0 });
    expect(from).toBe("translate(0px, 0px) scale(1)");
  });
});

const BOX = {
  size: 240,
  startPadding: "6px",
  endPadding: "12px",
  startBorder: "1px",
  endBorder: "0px",
};

describe("revealKeyframes", () => {
  it("travels between a zero box and the measured one, on the block axis", () => {
    const [shut, open] = revealKeyframes("block", BOX);
    expect(shut).toEqual({
      height: "0px",
      paddingTop: "0px",
      paddingBottom: "0px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
      opacity: 0,
    });
    expect(open).toEqual({
      height: "240px",
      paddingTop: "6px",
      paddingBottom: "12px",
      borderTopWidth: "1px",
      borderBottomWidth: "0px",
      opacity: 1,
    });
  });

  it("drives width and the horizontal edges on the inline axis", () => {
    const [shut, open] = revealKeyframes("inline", BOX);
    expect(Object.keys(shut).sort()).toEqual(
      ["borderLeftWidth", "borderRightWidth", "opacity", "paddingLeft", "paddingRight", "width"],
    );
    expect(open.width).toBe("240px");
    expect(open.paddingLeft).toBe("6px");
    expect(open.borderLeftWidth).toBe("1px");
    // Nothing vertical: a rail that also collapsed its height would fold away
    // upward on its way in.
    expect(open.height).toBeUndefined();
  });

  it("collapses padding and borders too, not just the size", () => {
    // Left at rest, a padded panel shuts onto a stub of empty card and an
    // accordion's header rule is left hanging over nothing.
    const [shut] = revealKeyframes("block", { ...BOX, startPadding: "1rem", endPadding: "1rem" });
    expect(shut.paddingTop).toBe("0px");
    expect(shut.paddingBottom).toBe("0px");
    expect(shut.borderTopWidth).toBe("0px");
  });
});

describe("flipDelta", () => {
  it("reports rightward and downward movement as positive dx/dy", () => {
    // A card that moved to a later column/row in the grid. If the sign
    // flipped here, every reorder would visibly slide the wrong direction.
    const { dx, dy } = flipDelta({ left: 0, top: 0 }, { left: 100, top: 50 });
    expect(dx).toBe(100);
    expect(dy).toBe(50);
  });

  it("reports leftward and upward movement as negative dx/dy", () => {
    const { dx, dy } = flipDelta({ left: 200, top: 150 }, { left: 80, top: 20 });
    expect(dx).toBe(-120);
    expect(dy).toBe(-130);
  });

  it("reports zero movement for a rect that stayed put", () => {
    const rect = { left: 40, top: 40 };
    expect(flipDelta(rect, rect)).toEqual({ dx: 0, dy: 0 });
  });

  it("treats a sub-threshold delta as unmoved so layout rounding never animates", () => {
    // Below FLIP_MOVE_THRESHOLD_PX this must read as a no-op — otherwise
    // every grid render plays a barely-visible twitch on cards that never
    // actually reordered.
    const justUnder = FLIP_MOVE_THRESHOLD_PX - 0.1;
    const { dx, dy } = flipDelta({ left: 0, top: 0 }, { left: justUnder, top: -justUnder });
    expect(dx).toBe(0);
    expect(dy).toBe(0);
  });

  it("still reports a delta right at the threshold", () => {
    const { dx } = flipDelta({ left: 0, top: 0 }, { left: FLIP_MOVE_THRESHOLD_PX, top: 0 });
    expect(dx).toBe(FLIP_MOVE_THRESHOLD_PX);
  });
});

describe("captureFlipPositions", () => {
  it("is a safe no-op over an empty iterable", () => {
    // A reorder helper wired up before the grid has any cards should not
    // throw on its first render.
    expect(captureFlipPositions([]).size).toBe(0);
  });

  it("keys the snapshot by element so playFlipTransition can look each one up again", () => {
    const el = document.createElement("div");
    document.body.append(el);
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ left: 10, top: 20, right: 0, bottom: 0, width: 0, height: 0, x: 10, y: 20, toJSON() {} }),
    });
    const snapshot = captureFlipPositions([el]);
    expect(snapshot.get(el)).toMatchObject({ left: 10, top: 20 });
    el.remove();
  });
});

describe("cardTurnStyle", () => {
  it("rotates a played card a half turn and leaves an unplayed one square on", () => {
    expect(cardTurnStyle(true).transform).toBe("rotateY(180deg)");
    // Explicitly rotateY(0deg) rather than "none": the card has to travel back
    // when a draw is cancelled, and a transition needs two transforms to
    // interpolate between.
    expect(cardTurnStyle(false).transform).toBe("rotateY(0deg)");
  });

  it("takes long enough to be seen rotating rather than swapping faces", () => {
    expect(CARD_TURN_MS).toBeGreaterThan(400);
    expect(cardTurnStyle(true).transitionDuration).toBe(`${CARD_TURN_MS}ms`);
  });

  it("keeps the back face under reduced motion, and only drops the travel", () => {
    withReducedMotion(() => {
      const style = cardTurnStyle(true);
      expect(style.transitionDuration).toBe("0ms");
      // The rotation is state, not decoration — a reader who asked for less
      // motion must still end up looking at the back of a played card.
      expect(style.transform).toBe("rotateY(180deg)");
    });
  });
});

describe("playFlipTransition", () => {
  it("does not throw when Web Animations is unavailable", () => {
    // happy-dom has no `animate`, same as the real test DOM the rest of the
    // app relies on `canAnimate` to detect. If this threw, every component
    // that fires a reorder in a test would fail for reasons unrelated to
    // what it is testing.
    const el = document.createElement("div");
    document.body.append(el);
    const snapshot: FlipSnapshot = new Map([[el, { left: 0, top: 0 }]]);
    expect(() => playFlipTransition(snapshot)).not.toThrow();
    el.remove();
  });

  it("is a no-op under prefers-reduced-motion, without touching the DOM at all", () => {
    withReducedMotion(() => {
      const el = document.createElement("div");
      document.body.append(el);
      const getRect = vi.fn(() => ({ left: 0, top: 0 }) as DOMRect);
      Object.defineProperty(el, "getBoundingClientRect", { value: getRect });
      const snapshot: FlipSnapshot = new Map([[el, { left: 999, top: 999 }]]);
      playFlipTransition(snapshot);
      // Reduced motion bails before it re-measures anything, so a user who
      // asked the OS for no motion never pays for the layout read either.
      expect(getRect).not.toHaveBeenCalled();
      el.remove();
    });
  });

  it("is a safe no-op when a captured element has since left the document", () => {
    // A reorder can be followed immediately by a delete — the FLIP snapshot
    // captured before both mutations may point at an element the delete
    // just removed. That must not throw or animate a detached node.
    const el = document.createElement("div");
    // Deliberately never appended to document.body.
    const snapshot: FlipSnapshot = new Map([[el, { left: 0, top: 0 }]]);
    expect(() => playFlipTransition(snapshot)).not.toThrow();
  });
});

describe("drawerTransition / railTransition", () => {
  it("hands control back immediately where Web Animations is unavailable", () => {
    // jsdom has no `animate`, which is also the reduced-motion path: the panel
    // opens, it just does not travel. Vue still has to be told the transition ended.
    for (const hooks of [drawerTransition(), railTransition()]) {
      const el = document.createElement("div");
      const entered = vi.fn();
      const left = vi.fn();
      hooks.onEnter(el, entered);
      hooks.onLeave(el, left);
      expect(entered).toHaveBeenCalledOnce();
      expect(left).toHaveBeenCalledOnce();
      expect(hooks.css).toBe(false);
    }
  });
});

describe("resizeDuration", () => {
  it("gives a short hop the drawer's time and never less", () => {
    expect(resizeDuration(0)).toBe(200);
    expect(resizeDuration(40)).toBe(200);
  });

  it("gives distance more time, so a long unroll is seen to travel", () => {
    // The soundboard widget's ~640px crossing is the measured reference point.
    expect(resizeDuration(640)).toBe(340);
    expect(resizeDuration(300)).toBeGreaterThan(resizeDuration(100));
  });

  it("stops growing past a screen's worth of travel", () => {
    expect(resizeDuration(5000)).toBe(380);
  });

  it("times a collapse by how far it travels, not by its sign", () => {
    expect(resizeDuration(-640)).toBe(resizeDuration(640));
  });
});

describe("playBlockResize", () => {
  /** An element with a fixed measured height and a spy standing in for Web Animations. */
  function panel(height: number) {
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ height }) as DOMRect,
    });
    let settle: () => void = () => {};
    let fail: (reason: unknown) => void = () => {};
    const finished = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const animate = vi.fn(() => ({ finished }) as unknown as Animation);
    return { el, animate, settle, fail };
  }

  it("reports done at once where Web Animations is unavailable", () => {
    // The test DOM, and anyone who asked for reduced motion: the card is simply
    // at its new height, and the caller still hears that it is at rest.
    const { el } = panel(600);
    const done = vi.fn();
    playBlockResize(el, 200, done);
    expect(done).toHaveBeenCalledOnce();
  });

  it("does not animate a height that did not change", () => {
    const { el, animate } = panel(300);
    el.animate = animate as unknown as typeof el.animate;
    const done = vi.fn();
    playBlockResize(el, 300, done);
    expect(animate).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
  });

  it("travels from the old height to the measured new one, clipped on the way", async () => {
    const { el, animate, settle } = panel(600);
    el.animate = animate as unknown as typeof el.animate;
    el.style.overflow = "visible";
    const done = vi.fn();
    playBlockResize(el, 200, done);

    expect(animate).toHaveBeenCalledWith(
      [{ height: "200px" }, { height: "600px" }],
      expect.objectContaining({ duration: resizeDuration(400) }),
    );
    expect(el.style.overflow).toBe("hidden");
    expect(done).not.toHaveBeenCalled();

    settle();
    await Promise.resolve();
    await Promise.resolve();
    // Restored, not blanked: the panel had an overflow of its own.
    expect(el.style.overflow).toBe("visible");
    expect(done).toHaveBeenCalledOnce();
  });

  it("still reports done when the animation is cancelled", async () => {
    // A cancelled animation rejects. A caller waiting on `done` to drop its
    // "in flight" state would otherwise wait forever.
    const { el, animate, fail } = panel(600);
    el.animate = animate as unknown as typeof el.animate;
    const done = vi.fn();
    playBlockResize(el, 200, done);
    fail(new DOMException("cancelled", "AbortError"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toHaveBeenCalledOnce();
  });
});
