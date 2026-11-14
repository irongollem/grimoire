import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlaceMapEditorView from "./PlaceMapEditorView.vue";
import { useAppUiStore } from "@/stores/ui/app";
import { useLocationsUiStore } from "@/stores/ui/locations";
import type { Location } from "@/types/location.types";

const mocks = vi.hoisted(() => ({
  params: { id: "ash" } as Record<string, string>,
  query: {} as Record<string, string>,
  location: null as unknown,
  pending: false,
  allArgs: [] as unknown[],
  replace: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: mocks.params, query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: ref(mocks.location), isPending: ref(mocks.pending) }),
  useAllLocations: (...args: unknown[]) => {
    mocks.allArgs = args;
    return { data: ref([]), isPending: ref(false) };
  },
}));

const place = (over: Partial<Location>) => ({ id: "ash", name: "Ashmouth", location_type: "dungeon", is_battle_map: false, ...over }) as Location;

function mountView() {
  return mount(PlaceMapEditorView, {
    global: { stubs: { SiteMapEditor: true, LoadingSpinner: true, EmptyState: true, AppButton: true } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.params = { id: "ash" };
  mocks.query = {};
  mocks.location = place({});
  mocks.pending = false;
  mocks.replace.mockReset();
});

// #1125 decision 4: the editor is full screen, comes back to the place's Map tab, and `?layer=` picks the start.
describe("PlaceMapEditorView", () => {
  it("sends the back link to the place in the Atlas, and the Atlas to its Map tab", () => {
    const w = mountView();
    expect(w.findComponent({ name: "SiteMapEditor" }).props("backTo")).toBe("/locations?at=ash");
    expect(useLocationsUiStore().locationsPaneMode).toBe("map");
  });

  // Bug: a site opened from outside the active campaign listed no spaces.
  it("reads the Atlas of the place's own campaign", () => {
    mocks.location = place({ campaign_id: "camp-b" });
    mountView();
    const [, forCampaign] = mocks.allArgs as [unknown, () => string | null];
    expect(forCampaign()).toBe("camp-b");
  });

  it("takes the whole screen while open and gives it back when left", () => {
    const w = mountView();
    expect(useAppUiStore().editorFocus).toBe(true);
    w.unmount();
    expect(useAppUiStore().editorFocus).toBe(false);
  });

  it("opens a site on the layer in ?layer=", () => {
    mocks.query = { layer: "zoning" };
    expect(mountView().findComponent({ name: "SiteMapEditor" }).props("startLayer")).toBe("zoning");
  });

  it("opens a site on its Drawing when no layer is asked for, or one a site lacks", () => {
    expect(mountView().findComponent({ name: "SiteMapEditor" }).props("startLayer")).toBe("drawing");
    mocks.query = { layer: "pins" };
    expect(mountView().findComponent({ name: "SiteMapEditor" }).props("startLayer")).toBe("drawing");
  });

  // Bug: a battle map of any type must open the workbench, or its picture could not be lined up or its walls drawn.
  it("opens a battle map that is not a site in the Cartographer workbench", () => {
    mocks.location = place({ location_type: "city", is_battle_map: true });
    const w = mountView();
    expect(w.findComponent({ name: "SiteMapEditor" }).exists()).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  // The Atlas Map tab has the tools now; an old link must land there, not on an editor with nothing under it.
  it("sends a place that is neither a site nor a battle map to its Map tab, replacing the entry", () => {
    mocks.location = place({ location_type: "city", is_battle_map: false });
    mocks.query = { layer: "pins" };
    const w = mountView();
    expect(w.findComponent({ name: "SiteMapEditor" }).exists()).toBe(false);
    expect(mocks.replace).toHaveBeenCalledWith("/locations?at=ash");
    expect(useLocationsUiStore().locationsPaneMode).toBe("map");
  });

  it("shows no editor while the place is still loading, nor for a place that is gone", async () => {
    mocks.pending = true;
    let w = mountView();
    expect(w.findComponent({ name: "SiteMapEditor" }).exists()).toBe(false);

    mocks.pending = false;
    mocks.location = undefined;
    w = mountView();
    await flushPromises();
    expect(w.findComponent({ name: "SiteMapEditor" }).exists()).toBe(false);
    expect(w.findComponent({ name: "EmptyState" }).exists()).toBe(true);
  });
});
