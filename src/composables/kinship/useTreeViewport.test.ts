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
