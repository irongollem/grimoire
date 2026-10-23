import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useNpcWebCamera, type CameraGraph } from "./useNpcWebCamera";

function fakeGraph(zoom = 1): CameraGraph & { level: number } {
  const g = {
    level: zoom,
    panBy: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    fitToContents: vi.fn(),
    getZoomLevel: () => g.level,
    setZoomLevel: vi.fn(async (n: number) => {
      g.level = n;
    }),
  };
  return g;
}

function setup(graph: CameraGraph | null) {
  const onTaken = vi.fn();
  const setNodesDraggable = vi.fn();
  let camera!: ReturnType<typeof useNpcWebCamera>;
  const wrapper = mount(
    defineComponent({
      setup() {
        camera = useNpcWebCamera({ graph: () => graph, onTaken, setNodesDraggable });
        return () => h("div");
      },
    }),
  );
  return { camera, wrapper, onTaken, setNodesDraggable };
}

function wheel(over: Partial<WheelEvent>): WheelEvent {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  return { deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, clientX: 100, clientY: 50, currentTarget: el, ...over } as WheelEvent;
}

describe("useNpcWebCamera", () => {
  it("pans on a plain wheel, content moving the way a scroll does", async () => {
    const g = fakeGraph();
    const { camera, onTaken } = setup(g);
    await camera.onWheel(wheel({ deltaY: 40, deltaX: 10 }));
    expect(g.panBy).toHaveBeenCalledWith({ x: -10, y: -40 });
    expect(g.setZoomLevel).not.toHaveBeenCalled();
    expect(onTaken).toHaveBeenCalled();
  });

  it("zooms on ctrl, cmd or alt + wheel", async () => {
    for (const key of ["ctrlKey", "metaKey", "altKey"] as const) {
      const g = fakeGraph();
      await setup(g).camera.onWheel(wheel({ deltaY: -100, [key]: true }));
      expect(g.level).toBeGreaterThan(1);
    }
  });

  it("keeps the point under the cursor fixed by panning back from the centre anchor", async () => {
    const g = fakeGraph();
    await setup(g).camera.onWheel(wheel({ deltaY: -100, ctrlKey: true, clientX: 200, clientY: 50 }));
    const k = g.level;
    // Cursor is 100px right of centre and level with it.
    const pan = vi.mocked(g.panBy).mock.calls[0]?.[0];
    expect(pan?.x).toBeCloseTo(100 * (1 - k), 10);
    expect(pan?.y).toBeCloseTo(0, 10);
  });

  it("pans on a middle press and not on a left one", () => {
    const g = fakeGraph();
    const { camera } = setup(g);
    const target = document.createElement("div");
    const down = (button: number) => ({ button, clientX: 10, clientY: 10, pointerId: 1, currentTarget: target }) as unknown as PointerEvent;
    camera.onPointerDown(down(0));
    camera.onPointerMove({ clientX: 20, clientY: 20 } as PointerEvent);
    expect(g.panBy).not.toHaveBeenCalled();
    camera.onPointerDown(down(1));
    camera.onPointerMove({ clientX: 25, clientY: 18 } as PointerEvent);
    expect(g.panBy).toHaveBeenCalledWith({ x: 15, y: 8 });
    camera.onPointerUp();
    camera.onPointerMove({ clientX: 40, clientY: 40 } as PointerEvent);
    expect(g.panBy).toHaveBeenCalledTimes(1);
  });

  it("turns node dragging off while Space is held and back on after", async () => {
    const { camera, setNodesDraggable } = setup(fakeGraph());
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
    await Promise.resolve();
    expect(camera.spaceHeld.value).toBe(true);
    expect(setNodesDraggable).toHaveBeenLastCalledWith(false);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
    await Promise.resolve();
    expect(setNodesDraggable).toHaveBeenLastCalledWith(true);
  });

  it("maps the zoom keys to the graph", () => {
    const g = fakeGraph();
    const { onTaken } = setup(g);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", code: "Equal", ctrlKey: true }));
    expect(g.zoomIn).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", code: "Minus", ctrlKey: true }));
    expect(g.zoomOut).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "0", code: "Digit0", ctrlKey: true }));
    expect(g.fitToContents).toHaveBeenCalled();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", code: "Digit1", ctrlKey: true }));
    expect(g.setZoomLevel).toHaveBeenCalledWith(1);
    expect(onTaken).toHaveBeenCalledTimes(4);
  });

  it("does nothing before the graph exists", () => {
    const { camera, onTaken } = setup(null);
    camera.onWheel(wheel({ deltaY: 10 }));
    expect(onTaken).not.toHaveBeenCalled();
  });
});
