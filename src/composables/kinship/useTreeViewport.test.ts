import { describe, expect, it } from "vitest";
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
});
