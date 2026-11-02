// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return {
    surface: vueRef<unknown>(null),
    remember: undefined as unknown as ReturnType<typeof import("vitest").vi.fn>,
    memory: vueRef(new Set<string>()),
    sight: vueRef(new Set<string>()),
  };
});

vi.mock("@/composables/encounters/useEncounterRoom", () => ({ useLocationBattleSurface: () => ({ surface: h.surface }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: ref({ id: "s1", name: "The Barrow" }) }),
  useLocations: () => ({
    data: ref([
      { id: "hall", name: "Entrance Hall", location_type: "room", sort_order: 1 },
      { id: "crypt", name: "Crypt", location_type: "room", sort_order: 2 },
    ]),
  }),
}));
vi.mock("@/composables/locations/useExploreParty", () => ({ usePartyTokenSizes: () => (id: string) => (id === "ogre" ? "large" : null) }));
vi.mock("@/composables/party/useActiveParty", () => ({
  useActiveParty: () => ({
    data: ref([
      { id: "tam", name: "Tamsin", current_hp: 5, max_hp: 9, portrait_url: null, portrait_focal_point: null },
      { id: "ogre", name: "Grum", current_hp: 5, max_hp: 9, portrait_url: null, portrait_focal_point: null },
      { id: "late", name: "Latecomer", current_hp: 5, max_hp: 9, portrait_url: null, portrait_focal_point: null },
    ]),
  }),
}));
vi.mock("@/composables/locations/useMapMemory", async () => {
  h.remember = vi.fn();
  return { useMapMemory: () => ({ memory: h.memory, isLoading: ref(false), remember: h.remember, hide: h.remember, replaceWith: h.remember, forgetAll: h.remember }) };
});
vi.mock("@/composables/encounters/usePartySight", () => ({
  usePartySight: () => ({ viewers: ref([{ x: 1, y: 0 }]), sight: h.sight }),
}));

import { useCampaignStore } from "@/stores/campaign";
import MapTableExplore from "./MapTableExplore.vue";

const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0 };
const Screen = defineComponent({
  name: "TableScreen",
  props: ["combatants", "fogMask", "seen", "viewers", "eyebrow", "title", "order", "follow", "followNote"],
  template: "<div />",
});

function mountView(over: { room?: string; exploreSite?: string } = {}) {
  const campaign = useCampaignStore();
  campaign.activeCampaign = {
    id: "c1",
    current_location_id: over.room ?? "hall",
    explore_party: { site_id: over.exploreSite ?? "s1", positions: { tam: { x: 1, y: 0 }, ogre: { x: 0, y: 0 } } },
  } as never;
  return mount(MapTableExplore, { props: { placeId: "s1" }, global: { stubs: { TableScreen: Screen } } }).findComponent({ name: "TableScreen" });
}

describe("MapTableExplore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.surface.value = { calibration, mapLocation: { id: "s1" }, live: null };
    h.memory.value = new Set();
    h.sight.value = new Set();
    h.remember.mockClear();
  });

  it("shows the party where the DM stood them, no initiative, and the room they are in", () => {
    const s = mountView();
    expect((s.props("combatants") as { name: string }[]).map((c) => c.name)).toEqual(["Tamsin", "Grum"]);
    expect(s.props("title")).toBe("Entrance Hall");
    expect(s.props("eyebrow")).toBe("The party is in");
    expect(s.props("order")).toBeFalsy();
  });

  it("gives a Large character the squares of their size", () => {
    const grum = (mountView().props("combatants") as { name: string; footprint: number }[]).find((c) => c.name === "Grum");
    expect(grum?.footprint).toBe(2);
  });

  // Decision 1 and 2: the fog is memory plus sight, not rooms marked Explored.
  it("fogs by what the map remembers plus what the party sees now, and hands the screen the party's viewers", () => {
    h.memory.value = new Set(["5,5"]);
    h.sight.value = new Set(["1,0"]);
    const s = mountView();
    expect([...(s.props("fogMask") as Set<string>)].sort()).toEqual(["1,0", "5,5"]);
    expect([...(s.props("seen") as Set<string>)]).toEqual(["1,0"]);
    expect(s.props("viewers")).toEqual([{ x: 1, y: 0 }]);
  });

  // The DM's window owns the memory; this screen only reads it.
  it("never writes the map's memory, however much the party sees", () => {
    h.sight.value = new Set(["1,0", "2,0"]);
    mountView();
    expect(h.remember).not.toHaveBeenCalled();
  });

  // The TV for a map the party is not on shows the map as remembered and no one standing on it.
  it("waits, with no tokens, on a map the party is not exploring", () => {
    h.memory.value = new Set(["5,5"]);
    const s = mountView({ exploreSite: "another-site" });
    expect(s.props("combatants")).toEqual([]);
    expect(s.props("eyebrow")).toBe("Waiting");
    expect([...(s.props("fogMask") as Set<string>)]).toEqual(["5,5"]);
  });

  it("says Exploring when the party is on the map but in no traced room", () => {
    expect(mountView({ room: "elsewhere" }).props("eyebrow")).toBe("Exploring");
  });
});
