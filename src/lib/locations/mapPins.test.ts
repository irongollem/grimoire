import { describe, expect, it } from "vitest";
import { refreshPinMetadata } from "./mapPins";
import type { MapPin } from "@/types/location.types";

function pin(over: Partial<MapPin> = {}): MapPin {
  return {
    child_location_id: "a",
    child_name: "Old name",
    child_type: "village",
    child_image_url: null,
    x: 0.25,
    y: 0.5,
    visible_to_players: false,
    ...over,
  };
}

describe("refreshPinMetadata", () => {
  it("copies name, type and image from the live place and keeps position and visibility", () => {
    const [out] = refreshPinMetadata(
      [pin()],
      [{ id: "a", name: "Newname", location_type: "city", image_url: "https://x/y.webp" }],
    );
    expect(out).toEqual({
      child_location_id: "a",
      child_name: "Newname",
      child_type: "city",
      child_image_url: "https://x/y.webp",
      x: 0.25,
      y: 0.5,
      visible_to_players: false,
    });
  });

  it("keeps a pin whose place is not in the list rather than dropping the placement", () => {
    const original = pin({ child_location_id: "gone" });
    expect(refreshPinMetadata([original], [{ id: "a", name: "A", location_type: "city", image_url: null }])).toEqual([original]);
  });

  it("returns a copy, never the input array, when there is nothing to refresh", () => {
    const pins = [pin()];
    const out = refreshPinMetadata(pins, []);
    expect(out).toEqual(pins);
    expect(out).not.toBe(pins);
  });

  it("does not mutate the input pins", () => {
    const original = pin();
    refreshPinMetadata([original], [{ id: "a", name: "New", location_type: "city", image_url: null }]);
    expect(original.child_name).toBe("Old name");
  });
});
