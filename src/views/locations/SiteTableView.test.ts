// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

const h = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return { explored: new Set<string>(), surface: vueRef<unknown>(null) };
});

vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRoute: () => ({ params: { id: "s1" } }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocation: () => ({ data: ref({ id: "s1", name: "The Barrow" }) }),
  useLocations: () => ({
    data: ref([
      { id: "hall", name: "Entrance Hall", location_type: "room", sort_order: 1 },
      { id: "crypt", name: "Crypt", location_type: "room", sort_order: 2 },
    ]),
  }),
}));
vi.mock("@/composables/encounters/useEncounterRoom", () => ({ useLocationBattleSurface: () => ({ surface: h.surface, regions: ref(REGIONS) }) }));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ stateOf: (id: string, fact: string) => (fact === "explored" && h.explored.has(id) ? { value: true } : undefined) }),
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

import { useCampaignStore } from "@/stores/campaign";
import SiteTableView from "./SiteTableView.vue";

const calibration = { cells_per_image_width: 30, origin_x_pct: 0, origin_y_pct: 0, origin_cell_x: 10, origin_cell_y: 20 };
const region = (roomId: string, cells: CellKey[]) => ({ region_role: "space", space_location_id: roomId, cells }) as LocationMapRegion;
// Region cells less the origin (10, 20): the hall is battle squares 0..2, the crypt 4..5 along the top row.
const REGIONS = [region("hall", ["10,20", "11,20", "12,20"]), region("crypt", ["14,20", "15,20"])];

const Screen = defineComponent({ name: "TableScreen", props: ["combatants", "fogMask", "eyebrow", "title", "order", "follow"], template: "<div />" });

function mountView(currentRoom = "hall") {
  const campaign = useCampaignStore();
  campaign.activeCampaign = {
    id: "c1",
    current_location_id: currentRoom,
    explore_party: { site_id: "s1", positions: { tam: { x: 1, y: 0 }, ogre: { x: 0, y: 0 } } },
  } as never;
  return mount(SiteTableView, { global: { stubs: { TableScreen: Screen } } }).findComponent({ name: "TableScreen" });
}

describe("SiteTableView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    h.explored = new Set(["hall"]);
    h.surface.value = { calibration };
  });

  // #1125 frame 13, exploring: the party and the room they are in; no initiative.
  it("shows the party where the DM stood them, and the name of the room they are in", () => {
    const s = mountView();
    expect((s.props("combatants") as { name: string }[]).map((c) => c.name)).toEqual(["Tamsin", "Grum"]);
    expect(s.props("title")).toBe("Entrance Hall");
    expect(s.props("order")).toBeFalsy();
  });

  it("gives a Large character the four squares of their size", () => {
    const s = mountView();
    const grum = (s.props("combatants") as { name: string; footprint: number }[]).find((c) => c.name === "Grum");
    expect(grum?.footprint).toBe(2);
  });

  it("lights the explored room and keeps an unexplored one black", () => {
    const fog = mountView().props("fogMask") as Set<string>;
    expect(fog.has("1,0")).toBe(true);
    expect(fog.has("4,0")).toBe(false);
  });

  // The party standing in a room is seeing it, even before the DM has marked it explored.
  it("lights the room the party stands in even when it is not marked explored", () => {
    expect((mountView("crypt").props("fogMask") as Set<string>).has("5,0")).toBe(true);
  });

  it("lights a room once it is explored", () => {
    h.explored = new Set(["hall", "crypt"]);
    expect((mountView().props("fogMask") as Set<string>).has("4,0")).toBe(true);
  });
});
