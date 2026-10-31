import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import PlaceMapSimpleEditor from "./PlaceMapSimpleEditor.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { Location } from "@/types/location.types";

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:rest(.*)*", component: { template: "<div />" } }] });

const town = (over: Partial<Location> = {}) =>
  ({ id: "t", name: "Daggerford", location_type: "town", map_url: null, plan_size: null, map_layer_url: null, ...over }) as Location;

function mountEditor(startLayer: "picture" | "pins", loc: Location) {
  return mount(PlaceMapSimpleEditor, {
    props: { location: loc, locations: [], backTo: "/locations?at=t", startLayer },
    global: { plugins: [router], stubs: { MapLayersPanel: true, PlaceMapPinsEditor: true } },
  });
}

// #1125 frame 04: a town's editor has only Picture and Pins.
describe("PlaceMapSimpleEditor", () => {
  it("opens on the Picture, with the layers panel", () => {
    const w = mountEditor("picture", town());
    expect(w.findComponent({ name: "MapLayersPanel" }).exists()).toBe(true);
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(false);
  });

  it("offers exactly Picture and Pins", () => {
    const w = mountEditor("picture", town());
    expect((w.findComponent(SegmentedControl).props() as { options: { value: string }[] }).options.map((o) => o.value)).toEqual(["picture", "pins"]);
  });

  it("opens on Pins when asked, and places pins on the picture the place has", () => {
    const w = mountEditor("pins", town({ map_url: "https://x/p.png" }));
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(true);
  });

  it("asks for a Picture first when there is nothing to pin onto", () => {
    const w = mountEditor("pins", town());
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(false);
    expect(w.text()).toContain("Add the Picture first");
  });

  it("switches layer from the bar", async () => {
    const w = mountEditor("picture", town({ map_url: "https://x/p.png" }));
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "pins");
    await w.vm.$nextTick();
    expect(w.findComponent({ name: "PlaceMapPinsEditor" }).exists()).toBe(true);
  });

  it("links the back button to the place's Map tab, named for the place", () => {
    const back = mountEditor("picture", town()).findAllComponents({ name: "AppButton" }).find((b) => b.props("to"))!;
    expect(back.props("to")).toBe("/locations?at=t");
    expect(back.props("label")).toBe("Daggerford");
  });
});
