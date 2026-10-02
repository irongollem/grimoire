import { describe, it, expect } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { useMapCanvas } from "./useMapCanvas";

/**
 * The composable inside a host the way a map view holds it. The test DOM lays
 * nothing out, so the host measures 0×0: the image is never fitted, and the
 * view starts at scale 1 with no pan, with host coordinates equal to client
 * coordinates. That is the plainest ground to assert a gesture against.
 */
function mountCanvas() {
  let canvas!: ReturnType<typeof useMapCanvas>;
  const wrapper = mount(defineComponent({
    setup() {
      canvas = useMapCanvas();
      return () => h("div", { ref: canvas.canvasHost });
    },
  }));
  canvas.onImageLoad({ target: { naturalWidth: 1000, naturalHeight: 500 } } as unknown as Event);
  const host = wrapper.element as HTMLElement;
  const pointer = (pointerId: number, clientX: number, clientY: number) =>
    ({ pointerId, clientX, clientY, currentTarget: host }) as unknown as PointerEvent;
  host.setPointerCapture = () => {};
  return { canvas, pointer };
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
});
