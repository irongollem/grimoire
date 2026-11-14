// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const h = vi.hoisted(() => ({ place: null as unknown }));

vi.mock("@/composables/locations/useLocations", () => ({ useLocation: () => ({ data: ref(h.place) }) }));

import MapTablePlainMap from "./MapTablePlainMap.vue";

const pin = (id: string, name: string, visible: boolean, x = 0.25, y = 0.5) => ({
  child_location_id: id,
  child_name: name,
  child_type: "building",
  child_image_url: null,
  x,
  y,
  visible_to_players: visible,
});

function mountMap() {
  h.place = {
    id: "s1",
    name: "Targos",
    parent_id: null,
    map_url: "https://cdn/targos.webp",
    grid_calibration: null,
    map_layer_url: null,
    map_layer_stand_url: null,
    map_layer_calibration: null,
    plan_size: null,
    map_pins: [pin("a", "The Harbour", true), pin("b", "Secret Lair", false)],
  };
  return mount(MapTablePlainMap, { props: { placeId: "s1" } });
}

describe("MapTablePlainMap", () => {
  // Bug: a DM-only pin read out on the TV in front of the players.
  it("shows only the pins shared with players", () => {
    const names = mountMap().findAll("[data-testid='plain-map-pin']").map((p) => p.text());
    expect(names).toEqual(["The Harbour"]);
  });

  // Bug: pins placed against the letterboxed screen drift off the image they mark.
  it("sizes the frame to the image's ratio and places pins inside it", async () => {
    const w = mountMap();
    const img = w.get("img");
    Object.defineProperty(img.element, "naturalWidth", { value: 2000 });
    Object.defineProperty(img.element, "naturalHeight", { value: 1000 });
    await img.trigger("load");
    const frame = w.get("[data-testid='plain-map-frame']");
    expect(frame.attributes("style")).toContain("aspect-ratio: 2");
    const pinEl = frame.get("[data-testid='plain-map-pin']");
    expect(pinEl.attributes("style")).toContain("left: 25%");
    expect(pinEl.attributes("style")).toContain("top: 50%");
  });

  it("names the place as the party arrives", () => {
    expect(mountMap().get("[data-testid='arrival-name']").text()).toBe("Targos");
  });
});
