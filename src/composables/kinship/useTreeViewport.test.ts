import { describe, expect, it, vi } from "vitest";
import { useTreeViewport } from "./useTreeViewport";

describe("useTreeViewport", () => {
  it("zooms about a point and clamps the scale", () => {
    const v = useTreeViewport({ minScale: 0.5, maxScale: 2 });
    v.zoomBy(2, 100, 100);
    expect(v.scale.value).toBe(2);
    expect(v.x.value).toBe(-100);
    v.zoomBy(10, 0, 0);
    expect(v.scale.value).toBe(2);
    v.zoomBy(0.01, 0, 0);
    expect(v.scale.value).toBe(0.5);
  });

  it("fits content into the container, centred, never enlarging", () => {
    const v = useTreeViewport();
    v.fit(500, 400, 1000, 200);
    expect(v.scale.value).toBe(0.5);
    expect(v.x.value).toBe(0);
    expect(v.y.value).toBe(150);
    v.fit(500, 400, 100, 100);
    expect(v.scale.value).toBe(1);
    expect(v.x.value).toBe(200);
  });

  it("ignores a fit before the container has a size", () => {
    const v = useTreeViewport();
    v.fit(0, 0, 100, 100);
    expect(v.scale.value).toBe(1);
    expect(v.x.value).toBe(0);
  });

  it("centres a content point in the container at a scale", () => {
    const v = useTreeViewport();
    v.centreOn(400, 100, 360, 600, 0.8);
    expect(v.scale.value).toBe(0.8);
    expect(v.x.value).toBeCloseTo(180 - 320);
    expect(v.y.value).toBeCloseTo(300 - 80);
    v.centreOn(0, 0, 0, 0, 1);
    expect(v.scale.value).toBe(0.8);
  });

  describe("touch pan from a card", () => {
    const ev = (o: Partial<PointerEvent>, target: EventTarget, el: Element) =>
      ({ button: 0, pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0, target, currentTarget: el, preventDefault: vi.fn(), ...o }) as unknown as PointerEvent;

    it("leaves a tap alone: no capture, no drag, click not swallowed", () => {
      const v = useTreeViewport();
      const el = document.createElement("div");
      const capture = vi.fn();
      el.setPointerCapture = capture;
      const card = document.createElement("button");
      v.onPointerDown(ev({ clientX: 10, clientY: 10 }, card, el));
      v.onPointerMove(ev({ clientX: 13, clientY: 12 }, card, el));
      v.onPointerUp(ev({}, card, el));
      expect(capture).not.toHaveBeenCalled();
      expect(v.dragging.value).toBe(false);
      expect(v.x.value).toBe(0);
      const stop = vi.fn();
      v.onClickCapture({ stopPropagation: stop, preventDefault: vi.fn() } as unknown as MouseEvent);
      expect(stop).not.toHaveBeenCalled();
    });

    it("pans once the finger passes the slop, captures it, and swallows the click", () => {
      vi.useFakeTimers();
      const v = useTreeViewport();
      const el = document.createElement("div");
      const capture = vi.fn();
      el.setPointerCapture = capture;
      const card = document.createElement("button");
      v.onPointerDown(ev({ clientX: 10, clientY: 10 }, card, el));
      expect(capture).not.toHaveBeenCalled();
      v.onPointerMove(ev({ clientX: 30, clientY: 10 }, card, el));
      expect(capture).toHaveBeenCalledWith(1);
      expect(v.dragging.value).toBe(true);
      expect(v.x.value).toBe(20);
      v.onPointerMove(ev({ clientX: 40, clientY: 15 }, card, el));
      expect(v.x.value).toBe(30);
      expect(v.y.value).toBe(5);
      v.onPointerUp(ev({}, card, el));
      const stop = vi.fn();
      v.onClickCapture({ stopPropagation: stop, preventDefault: vi.fn() } as unknown as MouseEvent);
      expect(stop).toHaveBeenCalled();
      vi.runAllTimers();
      vi.useRealTimers();
    });

    it("still ignores a mouse press on a card", () => {
      const v = useTreeViewport();
      v.onPointerDown(ev({ pointerType: "mouse" }, document.createElement("button"), document.createElement("div")));
      expect(v.dragging.value).toBe(false);
    });
  });

  describe("forced pan", () => {
    function down(v: ReturnType<typeof useTreeViewport>, button: number, target: EventTarget) {
      const preventDefault = vi.fn();
      v.onPointerDown({ button, pointerId: 1, clientX: 0, clientY: 0, target, currentTarget: document.createElement("div"), preventDefault } as unknown as PointerEvent);
      return preventDefault;
    }

    it("does not start a drag on a button without a forced pan", () => {
      const v = useTreeViewport({ forcePan: () => false });
      down(v, 0, document.createElement("button"));
      expect(v.dragging.value).toBe(false);
    });

    it("pans over a button when the press is forced, and holds off autoscroll", () => {
      const v = useTreeViewport({ forcePan: (e) => e.button === 1 });
      const prevented = down(v, 1, document.createElement("button"));
      expect(v.dragging.value).toBe(true);
      expect(prevented).toHaveBeenCalled();
    });

    it("drops the click that ends a Space-drag", () => {
      vi.useFakeTimers();
      const v = useTreeViewport({ forcePan: () => true });
      down(v, 0, document.createElement("button"));
      v.onPointerUp({ pointerId: 1 } as PointerEvent);
      const stop = vi.fn();
      v.onClickCapture({ stopPropagation: stop, preventDefault: vi.fn() } as unknown as MouseEvent);
      expect(stop).toHaveBeenCalled();
      vi.runAllTimers();
      const later = vi.fn();
      v.onClickCapture({ stopPropagation: later, preventDefault: vi.fn() } as unknown as MouseEvent);
      expect(later).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("wheel", () => {
    function wheel(v: ReturnType<typeof useTreeViewport>, init: Partial<WheelEvent>) {
      const preventDefault = vi.fn();
      const e = { clientX: 0, clientY: 0, deltaX: 0, deltaY: -100, currentTarget: document.createElement("div"), preventDefault, ...init };
      v.onWheel(e as unknown as WheelEvent);
      return preventDefault;
    }

    it("leaves a plain wheel to the page", () => {
      const v = useTreeViewport();
      const e = wheel(v, {});
      expect(e).not.toHaveBeenCalled();
      expect(v.scale.value).toBe(1);
      expect(v.y.value).toBe(0);
    });

    it("zooms on ctrl or cmd + wheel and stops the page zooming too", () => {
      const v = useTreeViewport();
      const e = wheel(v, { ctrlKey: true });
      expect(e).toHaveBeenCalled();
      expect(v.scale.value).toBeGreaterThan(1);
      const m = wheel(v, { metaKey: true });
      expect(m).toHaveBeenCalled();
      const a = wheel(v, { altKey: true });
      expect(a).toHaveBeenCalled();
    });
  });
});
