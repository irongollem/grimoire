import { describe, expect, it } from "vitest";
import { effectScope, ref } from "vue";
import { useMapMeasure } from "@/composables/locations/useMapMeasure";
import type { MapScale } from "@/types/location.types";

const SCALE: MapScale = { unit: "mi", distance: 100, a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } };
const SIZE = { width: 2000, height: 1000 };

function make(scale: MapScale | null = SCALE, size: typeof SIZE | null = SIZE) {
  const scope = effectScope();
  const measure = scope.run(() => useMapMeasure({ scale: ref(scale), size: () => size }))!;
  return { measure, scope };
}

describe("useMapMeasure", () => {
  it("starts off, at a normal pace, with no route", () => {
    const { measure, scope } = make();
    expect(measure.measuring.value).toBe(false);
    expect(measure.paceId.value).toBe("normal");
    expect(measure.summary.value).toBeNull();
    scope.stop();
  });

  it("sums waypoints once there are two, and undo steps back", () => {
    const { measure, scope } = make();
    measure.start();
    measure.addPoint({ x: 0, y: 0, pin: null });
    expect(measure.summary.value).toBeNull();
    measure.addPoint({ x: 0.5, y: 0, pin: null });
    expect(measure.summary.value?.distance).toBeCloseTo(100, 6);
    measure.undo();
    expect(measure.points.value).toHaveLength(1);
    expect(measure.summary.value).toBeNull();
    scope.stop();
  });

  it("changing the pace changes the time, not the distance", () => {
    const { measure, scope } = make();
    measure.addPoint({ x: 0, y: 0, pin: null });
    measure.addPoint({ x: 0.24, y: 0, pin: null });
    const normal = measure.summary.value!;
    measure.paceId.value = "fast";
    const fast = measure.summary.value!;
    expect(fast.distance).toBe(normal.distance);
    expect(fast.time.totalHours).toBeLessThan(normal.time.totalHours);
    scope.stop();
  });

  it("cannot measure without a scale or a known image size", () => {
    for (const [scale, size] of [[null, SIZE], [SCALE, null]] as const) {
      const { measure, scope } = make(scale, size);
      measure.addPoint({ x: 0, y: 0, pin: null });
      measure.addPoint({ x: 0.5, y: 0, pin: null });
      expect(measure.summary.value).toBeNull();
      scope.stop();
    }
  });

  it("leaving the tool drops the route", () => {
    const { measure, scope } = make();
    measure.start();
    measure.addPoint({ x: 0, y: 0, pin: null });
    measure.stop();
    expect(measure.measuring.value).toBe(false);
    expect(measure.points.value).toEqual([]);
    scope.stop();
  });

  it("Escape leaves measure mode, and only while measuring", () => {
    const { measure, scope } = make();
    const press = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    press(); // not measuring: nothing to leave, and nothing breaks
    expect(measure.measuring.value).toBe(false);
    measure.start();
    measure.addPoint({ x: 0, y: 0, pin: null });
    press();
    expect(measure.measuring.value).toBe(false);
    expect(measure.points.value).toEqual([]);
    scope.stop();
  });
});
