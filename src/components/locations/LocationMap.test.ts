import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocationMap from "./LocationMap.vue";
import { buildMapStack } from "@/lib/locations/mapStack";
import type { MapPin } from "@/types/location.types";

vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useSitePrepared", () => ({
  useSitePrepared: () => ({ marks: ref([]), counts: ref({}) }),
}));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: () => undefined }),
}));

const stack = buildMapStack({
  map_url: "https://example.test/world.webp",
  grid_calibration: null,
  map_layer_url: null,
  map_layer_calibration: null,
  plan_size: null,
});

const PIN: MapPin = {
  child_location_id: "loc-a",
  child_name: "Waterdeep",
  child_type: "city",
  child_image_url: null,
  x: 0.25,
  y: 0.5,
  visible_to_players: true,
};

function mountMap(props: { measuring: boolean }) {
  return mount(LocationMap, {
    props: {
      stack,
      pins: [PIN],
      children: [{ id: "loc-a", name: "Waterdeep", location_type: "city" }],
      mode: "view",
      ...props,
    },
  });
}

/** A clean tap: the frame hands `LocationMap` the pointerdown target and the release point. */
async function tap(target: Element, clientX: number, clientY: number) {
  await target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX, clientY }));
  await target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX, clientY }));
}

beforeEach(() => {
  setActivePinia(createPinia());
  // The frame converts client coordinates through its container's box; give
  // the DOM test one: 200 x 100 at the origin.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LocationMap measuring (#932)", () => {
  it("emits a waypoint at the tapped spot, as a fraction of the image", async () => {
    const wrapper = mountMap({ measuring: true });
    await tap(wrapper.find("img").element, 100, 25);
    expect(wrapper.emitted("measure-point")).toEqual([[{ x: 0.5, y: 0.25, pin: null }]]);
  });

  it("snaps a tap on a pin to the pin's own spot and names the place", async () => {
    const wrapper = mountMap({ measuring: true });
    await tap(wrapper.find("[data-pin-id='loc-a']").element, 60, 60);
    expect(wrapper.emitted("measure-point")).toEqual([
      [{ x: 0.25, y: 0.5, pin: { id: "loc-a", name: "Waterdeep" } }],
    ]);
  });

  it("does not open the pin while measuring", async () => {
    const wrapper = mountMap({ measuring: true });
    const pin = wrapper.find("[data-pin-id='loc-a']").element;
    await tap(pin, 60, 60);
    await tap(pin, 60, 60);
    expect(wrapper.emitted("pin-click")).toBeUndefined();
  });

  it("leaves taps to the pins when not measuring", async () => {
    const wrapper = mountMap({ measuring: false });
    await tap(wrapper.find("img").element, 100, 25);
    expect(wrapper.emitted("measure-point")).toBeUndefined();
  });

  it("draws the route it is given", () => {
    const wrapper = mount(LocationMap, {
      props: {
        stack,
        pins: [PIN],
        children: [],
        mode: "view",
        measuring: true,
        routePoints: [
          { x: 0.1, y: 0.1, pin: null },
          { x: 0.5, y: 0.5, pin: null },
        ],
      },
    });
    expect(wrapper.find("polyline").attributes("points")).toBe("0.1,0.1 0.5,0.5");
  });
});
