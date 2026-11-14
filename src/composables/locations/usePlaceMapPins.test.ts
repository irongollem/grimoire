import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlaceMapPins } from "./usePlaceMapPins";
import type { MapPin } from "@/types/location.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), toastError: vi.fn() }));

vi.mock("@/composables/locations/useLocations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/locations/useLocations")>()),
  useUpdateLocation: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: String }) }));

const pin = (over: Partial<MapPin> = {}): MapPin => ({
  child_location_id: "inn",
  child_name: "Old name",
  child_type: "tavern",
  child_image_url: null,
  x: 0.2,
  y: 0.3,
  visible_to_players: true,
  ...over,
});
const places = [
  { id: "town", parent_id: null, location_type: "town", name: "Town", image_url: null },
  { id: "inn", parent_id: "town", location_type: "tavern", name: "The Inn", image_url: null },
] as const;

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue({});
  mocks.toastError.mockReset();
});

describe("usePlaceMapPins", () => {
  it("reads the row's pins with the place's current name, and writes nothing for that", async () => {
    const { pins } = usePlaceMapPins(ref({ id: "town", map_pins: [pin()] }), ref(places));
    await flushPromises();
    expect(pins.value[0]?.child_name).toBe("The Inn");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("offers the place's descendants as candidates", () => {
    const { candidates } = usePlaceMapPins(ref({ id: "town", map_pins: [] }), ref(places));
    expect(candidates.value.map((c) => c.id)).toEqual(["inn"]);
  });

  it("writes map_pins once when the DM moves a pin, with the name refreshed", async () => {
    const { pins } = usePlaceMapPins(ref({ id: "town", map_pins: [pin()] }), ref(places));
    pins.value = [pin({ x: 0.8 })];
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({
      id: "town",
      update: { map_pins: [expect.objectContaining({ x: 0.8, child_name: "The Inn" })] },
    });
  });

  it("puts the row's pins back, and says so, when the write fails", async () => {
    mocks.update.mockRejectedValue(new Error("denied"));
    const { pins } = usePlaceMapPins(ref({ id: "town", map_pins: [pin()] }), ref(places));
    pins.value = [pin({ x: 0.8 })];
    await flushPromises();
    expect(pins.value[0]?.x).toBe(0.2);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("follows the row when it changes elsewhere", async () => {
    const row = ref({ id: "town", map_pins: [pin()] });
    const { pins } = usePlaceMapPins(row, ref(places));
    row.value = { id: "town", map_pins: [pin({ x: 0.5 })] };
    await flushPromises();
    expect(pins.value[0]?.x).toBe(0.5);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
