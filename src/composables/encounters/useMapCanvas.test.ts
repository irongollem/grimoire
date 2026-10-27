import { afterEach, describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useMapCanvas } from "./useMapCanvas";

/**
 * The composable inside a host the way a map view holds it. The test DOM lays
 * nothing out, so the host measures 0×0: the image is never fitted, and the
 * view starts at scale 1 with no pan, with host coordinates equal to client
 * coordinates. That is the plainest ground to assert a gesture against.
 */
function mountCanvas(opts: Parameters<typeof useMapCanvas>[0] = {}) {
  let canvas!: ReturnType<typeof useMapCanvas>;
  const wrapper = mount(defineComponent({
    setup() {
      canvas = useMapCanvas(opts);
      return () => h("div", { ref: canvas.canvasHost });
    },
  }));
  canvas.onImageLoad({ target: { naturalWidth: 1000, naturalHeight: 500 } } as unknown as Event);
  const host = wrapper.element as HTMLElement;
  const wheel = (deltaY: number, clientX: number, clientY: number) =>
    ({ deltaY, clientX, clientY, currentTarget: host }) as unknown as WheelEvent;
  const pointer = (pointerId: number, clientX: number, clientY: number) =>
    ({ pointerId, clientX, clientY, currentTarget: host }) as unknown as PointerEvent;
  host.setPointerCapture = () => {};
  return { canvas, pointer, wheel };
}

describe("useMapCanvas", () => {
  it("pans by a single pointer's movement", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.startPan(pointer(1, 100, 100));
    canvas.continuePan(pointer(1, 130, 90));

    expect(canvas.panX.value).toBe(30);
    expect(canvas.panY.value).toBe(-10);
    expect(canvas.scale.value).toBe(1);
  });

  it("ignores a pointer that never went down on the host", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.continuePan(pointer(1, 400, 400));

    expect(canvas.panX.value).toBe(0);
    expect(canvas.panY.value).toBe(0);
  });

  it("does not throw the map across the screen when a second finger lands", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.startPan(pointer(1, 100, 100));
    canvas.startPan(pointer(2, 300, 300));
    // The fingers report in turn. Each used to be measured against the
    // other's last position, so this one-pixel move panned by 200.
    canvas.continuePan(pointer(1, 101, 100));
    canvas.continuePan(pointer(2, 300, 301));

    expect(Math.abs(canvas.panX.value)).toBeLessThan(2);
    expect(Math.abs(canvas.panY.value)).toBeLessThan(2);
  });

  it("zooms about the point between two fingers as they spread", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.startPan(pointer(1, 100, 100));
    canvas.startPan(pointer(2, 200, 100));
    canvas.continuePan(pointer(2, 300, 100));

    // Twice as far apart, so twice the scale.
    expect(canvas.scale.value).toBeCloseTo(2);
    // The map point that sat midway between the fingers, (150, 100), is still
    // midway between them, now at (200, 100).
    expect(canvas.panX.value + 150 * canvas.scale.value).toBeCloseTo(200);
    expect(canvas.panY.value + 100 * canvas.scale.value).toBeCloseTo(100);
  });

  it("carries on as a plain pan when one of two fingers lifts", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.startPan(pointer(1, 100, 100));
    canvas.startPan(pointer(2, 200, 100));
    canvas.continuePan(pointer(2, 300, 100));
    const { value: panX } = canvas.panX;
    const { value: scale } = canvas.scale;

    canvas.endPan(pointer(2, 300, 100));
    canvas.continuePan(pointer(1, 105, 100));

    expect(canvas.panX.value).toBeCloseTo(panX + 5);
    expect(canvas.scale.value).toBe(scale);
  });

  it("forgets a cancelled touch, so the next drag is not read as a pinch", () => {
    const { canvas, pointer } = mountCanvas();

    canvas.startPan(pointer(1, 100, 100));
    canvas.endPan(pointer(1, 100, 100));
    canvas.startPan(pointer(2, 300, 300));
    canvas.continuePan(pointer(2, 320, 300));

    expect(canvas.panX.value).toBe(20);
    expect(canvas.scale.value).toBe(1);
  });

  it("zooms in when the wheel turns away from the user, keeping the point under the cursor fixed", () => {
    const { canvas, wheel } = mountCanvas();

    canvas.onWheel(wheel(-500, 200, 100));

    expect(canvas.scale.value).toBeGreaterThan(1);
    // The map point under the cursor before the zoom (host == map coordinates at scale 1) stays under it.
    expect(canvas.panX.value).toBeCloseTo(200 - 200 * canvas.scale.value);
    expect(canvas.panY.value).toBeCloseTo(100 - 100 * canvas.scale.value);
  });

  it("zooms out when the wheel turns toward the user", () => {
    const { canvas, wheel } = mountCanvas();
    canvas.onWheel(wheel(500, 0, 0));
    expect(canvas.scale.value).toBeLessThan(1);
  });

  it("stops zooming at the limits, which default to 0.1x and 8x", () => {
    const { canvas, wheel } = mountCanvas();
    for (let i = 0; i < 20; i++) canvas.onWheel(wheel(-1000, 0, 0));
    expect(canvas.scale.value).toBe(8);
    for (let i = 0; i < 40; i++) canvas.onWheel(wheel(1000, 0, 0));
    expect(canvas.scale.value).toBe(0.1);
  });

  it("honours custom zoom limits", () => {
    const { canvas, wheel } = mountCanvas({ minScale: 0.5, maxScale: 2 });
    for (let i = 0; i < 20; i++) canvas.onWheel(wheel(-1000, 0, 0));
    expect(canvas.scale.value).toBe(2);
    for (let i = 0; i < 40; i++) canvas.onWheel(wheel(1000, 0, 0));
    expect(canvas.scale.value).toBe(0.5);
  });

  it("stops following moves once the last finger lifts", () => {
    const { canvas, pointer } = mountCanvas();
    canvas.startPan(pointer(1, 0, 0));
    canvas.startPan(pointer(2, 10, 10));
    canvas.endPan(pointer(1, 0, 0));
    canvas.endPan(pointer(2, 10, 10));
    canvas.continuePan(pointer(2, 90, 90));
    expect(canvas.panX.value).toBe(0);
    expect(canvas.panY.value).toBe(0);
  });

  it("does nothing for the wheel or a touch before the image has loaded", () => {
    let canvas!: ReturnType<typeof useMapCanvas>;
    const wrapper = mount(defineComponent({
      setup() {
        canvas = useMapCanvas();
        return () => h("div");
      },
    }));
    const host = wrapper.element as HTMLElement;
    canvas.onWheel({ deltaY: -500, clientX: 0, clientY: 0, currentTarget: host } as unknown as WheelEvent);
    const touch = (x: number) => ({ pointerId: 1, clientX: x, clientY: 0, currentTarget: host }) as unknown as PointerEvent;
    canvas.startPan(touch(0));
    canvas.continuePan(touch(50));
    expect(canvas.scale.value).toBe(1);
    expect(canvas.panX.value).toBe(0);
  });
});

describe("useMapCanvas fitting", () => {
  afterEach(() => vi.restoreAllMocks());

  it("fits a wide image inside a square host by its limiting side and centres it", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 600, height: 600 } as DOMRect);
    const { canvas } = mountCanvas();
    // 1000x500 into 600x600: the width limits, so 0.6, and 300px of height is left to centre.
    expect(canvas.scale.value).toBeCloseTo(0.6);
    expect(canvas.panX.value).toBeCloseTo(0);
    expect(canvas.panY.value).toBeCloseTo(150);

    canvas.onWheel({ deltaY: -500, clientX: 0, clientY: 0, currentTarget: document.createElement("div") } as unknown as WheelEvent);
    expect(canvas.scale.value).not.toBeCloseTo(0.6);
    canvas.resetView();
    expect(canvas.scale.value).toBeCloseTo(0.6);
    expect(canvas.panY.value).toBeCloseTo(150);
  });
});
