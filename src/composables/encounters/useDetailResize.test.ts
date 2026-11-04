import { describe, it, expect } from "vitest";
import { useDetailResize } from "./useDetailResize";

function drag(start: number, to: number, initial = 320) {
  const { detailWidth, startMouse } = useDetailResize(initial);
  startMouse({ clientX: start } as MouseEvent);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: to }));
  const width = detailWidth.value;
  document.dispatchEvent(new MouseEvent("mouseup"));
  return width;
}

describe("useDetailResize", () => {
  it("dragging the left edge leftwards widens the panel by the distance moved", () => {
    expect(drag(500, 450)).toBe(370);
  });

  it("cannot be dragged narrower than 200 or the stat block becomes unreadable", () => {
    expect(drag(500, 900)).toBe(200);
  });

  it("cannot be dragged wider than 700 or it swallows the map", () => {
    expect(drag(500, -900)).toBe(700);
  });

  it("stops following the pointer once the button is released", () => {
    const { detailWidth, startMouse } = useDetailResize(320);
    startMouse({ clientX: 500 } as MouseEvent);
    document.dispatchEvent(new MouseEvent("mouseup"));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    expect(detailWidth.value).toBe(320);
  });

  it("a finger drag clamps the same way", () => {
    const { detailWidth, startTouch } = useDetailResize(320);
    startTouch({ touches: [{ clientX: 500 }] } as unknown as TouchEvent);
    const move = new Event("touchmove") as Event & { touches: { clientX: number }[] };
    move.touches = [{ clientX: -900 }];
    document.dispatchEvent(move);
    expect(detailWidth.value).toBe(700);
    document.dispatchEvent(new Event("touchend"));
  });
});
