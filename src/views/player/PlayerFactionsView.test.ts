import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerFactionsView from "./PlayerFactionsView.vue";

const mocks = vi.hoisted(() => ({
  graph: vi.fn(),
  visibleKin: vi.fn(),
}));

const house: Record<string, unknown> = { id: "h1", name: "House Thane", faction_type: "House", emblem_url: null, tags: [], description: null };

vi.mock("@/composables/kinship/useKinGraph", () => ({ usePlayerKinGraph: mocks.graph }));
vi.mock("@/composables/kinship/usePlayerKin", () => ({
  usePlayerVisibleKin: mocks.visibleKin,
  usePreviewMemberId: () => ref(null),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  usePlayerVisibleFactions: () => ({ data: ref([house]), isLoading: ref(false) }),
  usePartyMemberFactions: () => ({ data: ref([]) }),
  usePlayerFactionNpcs: () => ({ data: ref([]) }),
  usePlayerFactionPartyMembers: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useSharedLocations: () => ({ data: ref([{ id: "loc-1", name: "Thornkeep" }]) }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesNames: () => () => "" }));
vi.mock("@/composables/useGridColumns", () => ({ useBreakpointColumns: () => ref(1) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

const stubs = {
  VirtualGrid: defineComponent({
    props: ["items"],
    setup: (props, { slots }) => () => h("div", (props.items as unknown[]).map((item) => slots.default?.({ item }))),
  }),
  HousePlayerLineage: { template: "<div data-testid='lineage' />" },
  PageHeader: true,
  PlayerNotesWidget: true,
  PlayerConnectionsList: true,
};

describe("PlayerFactionsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.graph.mockReset();
    mocks.visibleKin.mockReset().mockReturnValue({ data: ref({ links: [], houses: [{ faction_id: "h1", members: ["npc:a"] }] }) });
  });

  it("shows the seat only when the player can see the place", async () => {
    house.seat_location_id = "loc-1";
    let w = mount(PlayerFactionsView, { global: { stubs } });
    await w.find(".cursor-pointer").trigger("click");
    expect(w.find("[data-testid='house-seat']").text()).toBe("seat: Thornkeep");
    house.seat_location_id = "hidden";
    w = mount(PlayerFactionsView, { global: { stubs } });
    await w.find(".cursor-pointer").trigger("click");
    expect(w.find("[data-testid='house-seat']").exists()).toBe(false);
    delete house.seat_location_id;
  });

  it("reads the houses from the player kin read and never builds the whole kin graph", async () => {
    const w = mount(PlayerFactionsView, { global: { stubs } });
    await w.find(".cursor-pointer").trigger("click");
    await flushPromises();
    expect(mocks.visibleKin).toHaveBeenCalled();
    expect(mocks.graph).not.toHaveBeenCalled();
    // The House the party knows about offers its Lineage tab.
    expect(w.text()).toContain("Lineage");
  });
});
