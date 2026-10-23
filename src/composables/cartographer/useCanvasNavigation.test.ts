import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useCanvasNavigation } from "./useCanvasNavigation";
import type { CellBounds } from "@/cartographer/viewport";
import { BASE_TILE_SIZE } from "@/cartographer/packSchema";

function makeNav(bounds: CellBounds | null = null) {
  const canvas = {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) as DOMRect,
  } as unknown as HTMLCanvasElement;
  const zoom = ref(1);
  const viewportOffset = ref({ x: 0, y: 0 });
  const nav = useCanvasNavigation({
    canvasEl: ref<HTMLCanvasElement | null>(canvas),
    zoom,
    viewportOffset,
    getBounds: () => bounds,
    devicePixelDims: () => ({ w: 800, h: 600, dpr: 1 }),
  });
  return { nav, zoom, viewportOffset };
}

function wheel(over: Partial<{ deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) {
  return {
    clientX: 110, clientY: 120, deltaX: 0, deltaY: 0, deltaMode: 0,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...over,
  };
}

function key(over: Partial<{ key: string; code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) {
  return { key: " ", code: "Space", ctrlKey: false, metaKey: false, altKey: false, preventDefault: vi.fn(), ...over };
}

describe("isPanStart", () => {
  it("pans on the middle button with any tool", () => {
    const { nav } = makeNav();
    expect(nav.isPanStart({ button: 1 }, "floor")).toBe(true);
    expect(nav.isForcedPan({ button: 1 })).toBe(true);
  });

  it("pans on the right button, after the tools that use it have had their say", () => {
    const { nav } = makeNav();
    expect(nav.isPanStart({ button: 2 }, "floor")).toBe(true);
    expect(nav.isForcedPan({ button: 2 })).toBe(false);
  });

  it("pans on a left press only for the Pan tool or while Space is held", () => {
    const { nav } = makeNav();
    expect(nav.isPanStart({ button: 0 }, "floor")).toBe(false);
    expect(nav.isPanStart({ button: 0 }, "pan")).toBe(true);
    nav.onKeyDown(key(), false);
    expect(nav.isPanStart({ button: 0 }, "floor")).toBe(true);
    expect(nav.isForcedPan({ button: 0 })).toBe(true);
  });
});

describe("Space", () => {
  it("is held between keydown and keyup, and keeps the page from scrolling", () => {
    const { nav } = makeNav();
    const down = key();
    expect(nav.onKeyDown(down, false)).toBe(true);
    expect(nav.spaceHeld.value).toBe(true);
    expect(down.preventDefault).toHaveBeenCalled();
    nav.onKeyUp({ key: " ", code: "Space" });
    expect(nav.spaceHeld.value).toBe(false);
  });

  it("is also recognised by the physical key alone", () => {
    const { nav } = makeNav();
    nav.onKeyDown(key({ key: "Unidentified", code: "Space" }), false);
    expect(nav.spaceHeld.value).toBe(true);
  });

  it("stays held through auto-repeat", () => {
    const { nav } = makeNav();
    nav.onKeyDown(key(), false);
    nav.onKeyDown(key(), false);
    expect(nav.spaceHeld.value).toBe(true);
  });

  it("is left alone while typing and when a modifier is down", () => {
    const { nav } = makeNav();
    const typing = key();
    expect(nav.onKeyDown(typing, true)).toBe(false);
    expect(typing.preventDefault).not.toHaveBeenCalled();
    expect(nav.onKeyDown(key({ ctrlKey: true }), false)).toBe(false);
    expect(nav.onKeyDown(key({ metaKey: true }), false)).toBe(false);
    expect(nav.onKeyDown(key({ altKey: true }), false)).toBe(false);
    expect(nav.spaceHeld.value).toBe(false);
  });

  it("ignores other keys", () => {
    const { nav } = makeNav();
    expect(nav.onKeyDown(key({ key: "f", code: "KeyF" }), false)).toBe(false);
    nav.onKeyDown(key(), false);
    nav.onKeyUp({ key: "f", code: "KeyF" });
    expect(nav.spaceHeld.value).toBe(true);
  });

  it("lets go when the window loses focus", () => {
    const { nav } = makeNav();
    nav.onKeyDown(key(), false);
    nav.onBlur();
    expect(nav.spaceHeld.value).toBe(false);
  });
});

describe("onWheel", () => {
  it("scrolls the map on a plain wheel and leaves the zoom", () => {
    const { nav, zoom, viewportOffset } = makeNav();
    nav.onWheel(wheel({ deltaX: 5, deltaY: 40 }));
    expect(zoom.value).toBe(1);
    expect(viewportOffset.value).toEqual({ x: 5, y: 40 });
  });

  it("scrolls sideways on Shift+wheel", () => {
    const { nav, viewportOffset } = makeNav();
    nav.onWheel(wheel({ deltaY: 40, shiftKey: true }));
    expect(viewportOffset.value).toEqual({ x: 40, y: 0 });
  });

  it("zooms at the cursor on Ctrl, Cmd or Alt+wheel", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      const { nav, zoom, viewportOffset } = makeNav();
      nav.onWheel(wheel({ deltaY: -100, [mod]: true }));
      expect(zoom.value).toBeGreaterThan(1);
      // Canvas-relative cursor is (100, 100); the world point under it must not move.
      expect((viewportOffset.value.x + 100) / zoom.value).toBeCloseTo(100, 6);
      expect((viewportOffset.value.y + 100) / zoom.value).toBeCloseTo(100, 6);
    }
  });

  it("does nothing without a canvas", () => {
    const { nav, zoom, viewportOffset } = makeNav();
    const bare = useCanvasNavigation({
      canvasEl: ref<HTMLCanvasElement | null>(null),
      zoom,
      viewportOffset,
      getBounds: () => null,
      devicePixelDims: () => ({ w: 0, h: 0, dpr: 1 }),
    });
    bare.onWheel(wheel({ deltaY: 40 }));
    bare.zoomTo("in");
    expect(viewportOffset.value).toEqual({ x: 0, y: 0 });
    expect(nav.spaceHeld.value).toBe(false);
  });
});

describe("zoomTo", () => {
  it("steps in and out about the canvas centre", () => {
    const { nav, zoom } = makeNav();
    nav.zoomTo("in");
    expect(zoom.value).toBeCloseTo(1.25, 6);
    nav.zoomTo("out");
    expect(zoom.value).toBeCloseTo(1, 6);
  });

  it("shows 100% from any zoom", () => {
    const { nav, zoom } = makeNav();
    zoom.value = 2.5;
    nav.zoomTo("actual");
    expect(zoom.value).toBeCloseTo(1, 6);
  });

  it("fits the painted bounds, centred on them", () => {
    // 10 x 10 cells plus a one-cell margin each side is 12 cells across; the
    // 600px canvas height is the tighter side.
    const { nav, zoom, viewportOffset } = makeNav({ minX: 0, minY: 0, maxX: 9, maxY: 9 });
    nav.zoomTo("fit");
    expect(zoom.value).toBeCloseTo(600 / (12 * BASE_TILE_SIZE), 6);
    const tilePx = BASE_TILE_SIZE * zoom.value;
    expect(viewportOffset.value.x).toBeCloseTo(5 * tilePx - 400, 6);
    expect(viewportOffset.value.y).toBeCloseTo(5 * tilePx - 300, 6);
  });

  it("fits an empty map at 100% on the origin cell", () => {
    const { nav, zoom, viewportOffset } = makeNav(null);
    zoom.value = 3;
    nav.zoomTo("fit");
    expect(zoom.value).toBe(1);
    expect(viewportOffset.value).toEqual({ x: 0.5 * BASE_TILE_SIZE - 400, y: 0.5 * BASE_TILE_SIZE - 300 });
  });
});
