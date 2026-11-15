// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { GridCalibration } from "@/types/location.types";

const h = vi.hoisted(() => ({
  measure: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/lib/measureImage", () => ({ measureImage: h.measure }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutateAsync: h.mutate }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: h.toastError, fromError: (e: unknown) => String(e) }) }));

import { useHealPictureShape } from "./useHealPictureShape";

const cal = (over: Partial<GridCalibration> = {}): GridCalibration => ({ cells_per_image_width: 16, origin_x_pct: 0, origin_y_pct: 0, ...over });
const place = (id: string, calibration: GridCalibration | null, url = `${id}.png`) => ({
  id, map_url: url, grid_calibration: calibration, map_layer_url: null, map_layer_stand_url: null, map_layer_calibration: null, plan_size: null,
});
const settle = async () => {
  for (let i = 0; i < 5; i++) await nextTick();
  await Promise.resolve();
};

function heal(initial: ReturnType<typeof place> | null, enabled = true) {
  const target = ref(initial);
  const on = ref(enabled);
  const scope = effectScope();
  scope.run(() => useHealPictureShape({ place: () => target.value, enabled: () => on.value }));
  return { target, on };
}

describe("useHealPictureShape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.measure.mockResolvedValue({ width: 1000, height: 750 });
    h.mutate.mockResolvedValue({});
  });

  it("saves the corrected calibration once for a map whose shape is missing", async () => {
    // Bug it fails on: never recording the shape (the server keeps its cautious edge forever), or recording it on every refetch.
    const { target } = heal(place("a", cal()));
    await settle();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({ id: "a", update: { grid_calibration: cal({ image_height_over_width: 0.75 }) } });
    // The saved row comes back (a refetch hands the composable a new object): it is not measured or written again.
    target.value = place("a", cal({ image_height_over_width: 0.75 }));
    await settle();
    expect(h.measure).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledTimes(1);
  });

  it("does not save when the window is not the DM's", async () => {
    // Bug it fails on: a player's or a follower window writing the location row (RLS refuses it, and it is not theirs to write).
    heal(place("a", cal()), false);
    await settle();
    expect(h.measure).not.toHaveBeenCalled();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("does not save when the stored shape is within half a percent of the picture's", async () => {
    // Measured 0.75; stored 0.752 is 0.27% off.
    heal(place("a", cal({ image_height_over_width: 0.752 })));
    await settle();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("does not retry a save that failed, however often the map re-renders", async () => {
    // Bug it fails on: a failing write looping on every reactive change.
    h.mutate.mockRejectedValue(new Error("nope"));
    const { target } = heal(place("a", cal()));
    await settle();
    target.value = place("a", cal());
    await settle();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledTimes(1);
  });

  it("never writes one map's shape onto the map the DM has switched to", async () => {
    // Bug it fails on: measuring a stale canvas and writing the old picture's shape onto the new place. The first picture's
    // measurement lands after the DM has already moved to the second map.
    let finishFirst: (size: { width: number; height: number }) => void = () => undefined;
    h.measure.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    h.measure.mockResolvedValueOnce({ width: 100, height: 100 });
    const { target } = heal(place("a", cal()));
    target.value = place("b", cal());
    await settle();
    finishFirst({ width: 1000, height: 750 });
    await settle();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({ id: "b", update: { grid_calibration: cal({ image_height_over_width: 1 }) } });
  });

  it("decides from the place as it is when the picture is measured, so a grid lined up meanwhile is kept", async () => {
    // Bug it fails on: writing back the calibration as it was before the measurement, undoing the DM's own edit.
    let finish: (size: { width: number; height: number }) => void = () => undefined;
    h.measure.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { target } = heal(place("a", cal()));
    await settle();
    target.value = place("a", cal({ cells_per_image_width: 20 }));
    finish({ width: 1000, height: 750 });
    await settle();
    expect(h.mutate).toHaveBeenCalledWith({ id: "a", update: { grid_calibration: cal({ cells_per_image_width: 20, image_height_over_width: 0.75 }) } });
  });
});
