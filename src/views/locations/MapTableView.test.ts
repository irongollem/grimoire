// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { routes } from "@/router/routes";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return {
    running: vueRef<{ encounter_id: string } | null>(null),
    fightMap: vueRef<string | null>(null),
    thisMap: vueRef<string | null>("s1"),
  };
});

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRoute: () => ({ params: { id: "s1" } }) }));
vi.mock("@/composables/encounters/useEncounterLive", () => ({ useRunningEncounters: () => ({ firstRunning: h.running }) }));
vi.mock("@/composables/encounters/useEncounterRoom", async () => {
  const { computed } = await import("vue");
  return {
    useEncounterRoom: () => ({ surface: computed(() => (h.fightMap.value ? { mapLocation: { id: h.fightMap.value } } : null)) }),
    useLocationBattleSurface: () => ({ surface: computed(() => (h.thisMap.value ? { mapLocation: { id: h.thisMap.value } } : null)) }),
  };
});

import { useAppUiStore } from "@/stores/ui/app";
import MapTableView from "./MapTableView.vue";

const Fight = defineComponent({ name: "MapTableFight", props: ["encounterId"], template: "<div data-testid='fight' />" });
const Explore = defineComponent({ name: "MapTableExplore", props: ["placeId"], template: "<div data-testid='explore' />" });

function mountView() {
  return mount(MapTableView, { global: { stubs: { MapTableFight: Fight, MapTableExplore: Explore } } });
}

describe("MapTableView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.running.value = null;
    h.fightMap.value = null;
    h.thisMap.value = "s1";
  });

  it("explores this map while nothing is running", () => {
    const w = mountView();
    expect(w.find("[data-testid='explore']").exists()).toBe(true);
    expect(w.findComponent(Explore).props("placeId")).toBe("s1");
  });

  // A fight on another map must not take this screen over: the TV for the crypt stays on the crypt.
  it("stays exploring while the running fight is on a different map", () => {
    h.running.value = { encounter_id: "e1" };
    h.fightMap.value = "other-site";
    expect(mountView().find("[data-testid='fight']").exists()).toBe(false);
  });

  it("follows the running fight on this map, then returns to exploring when it ends, with no reload", async () => {
    const w = mountView();
    h.running.value = { encounter_id: "e1" };
    h.fightMap.value = "s1";
    await nextTick();
    expect(w.findComponent(Fight).props("encounterId")).toBe("e1");
    expect(w.find("[data-testid='explore']").exists()).toBe(false);
    h.running.value = null;
    await nextTick();
    expect(w.find("[data-testid='fight']").exists()).toBe(false);
    expect(w.find("[data-testid='explore']").exists()).toBe(true);
  });

  it("does not take a fight for this map when this place has no map of its own", () => {
    h.running.value = { encounter_id: "e1" };
    h.fightMap.value = "s1";
    h.thisMap.value = null;
    expect(mountView().find("[data-testid='fight']").exists()).toBe(false);
  });

  it("goes chromeless while open", () => {
    const w = mountView();
    expect(useAppUiStore().editorFocus).toBe(true);
    w.unmount();
    expect(useAppUiStore().editorFocus).toBe(false);
  });
});

describe("the Table screen routes", () => {
  // Epic #1133 decision 6: `/encounters/:id/table` goes; the map's screen is the only one.
  it("has one Table screen, per map, and none per fight", () => {
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("/locations/:id/table");
    expect(paths).not.toContain("/encounters/:id/table");
    expect(routes.find((r) => r.path === "/locations/:id/table")?.name).toBe("map-table");
  });
});
