import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, reactive, ref, toRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerFactionsView from "./PlayerFactionsView.vue";
import { useAppUiStore } from "@/stores/ui/app";

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  graph: vi.fn(),
  visibleKin: vi.fn(),
  membershipFor: vi.fn(),
  linkedMemberId: { value: "pm-real" },
  factions: { value: [] as Row[] },
  memberships: { value: [] as Row[] },
  factionNpcs: { value: [] as Row[] },
  sharedNpcs: { value: [] as Row[] },
}));
for (const key of ["factions", "memberships", "factionNpcs", "sharedNpcs"] as const) mocks[key] = reactive(mocks[key]);

const house: Record<string, unknown> = { id: "h1", name: "House Thane", faction_type: "House", emblem_url: null, tags: [], description: null };

vi.mock("@/composables/kinship/useKinGraph", () => ({ usePlayerKinGraph: mocks.graph }));
vi.mock("@/composables/kinship/usePlayerKin", () => ({
  usePlayerVisibleKin: mocks.visibleKin,
  usePreviewMemberId: () => ref(null),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  usePlayerVisibleFactions: () => ({ data: toRef(mocks.factions, "value"), isLoading: ref(false) }),
  usePartyMemberFactions: (memberId: { value: string }) => {
    mocks.membershipFor(memberId);
    return { data: toRef(mocks.memberships, "value") };
  },
  usePlayerFactionNpcs: () => ({ data: toRef(mocks.factionNpcs, "value") }),
  usePlayerFactionPartyMembers: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useSharedLocations: () => ({ data: ref([{ id: "loc-1", name: "Thornkeep" }]) }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: () => ({ data: toRef(mocks.sharedNpcs, "value") }) }));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesNames: () => () => "" }));
vi.mock("@/composables/useGridColumns", () => ({ useBreakpointColumns: () => ref(1) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: mocks.linkedMemberId.value }) }));
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
  // The detail overlay teleports to <body>; render it in place so the wrapper can read it.
  teleport: true,
};

describe("PlayerFactionsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.graph.mockReset();
    mocks.factions.value = [house];
    mocks.memberships.value = [];
    mocks.factionNpcs.value = [];
    mocks.sharedNpcs.value = [];
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
  describe("faction members shown to a player", () => {
    const guild = { id: "g1", name: "Guild", faction_type: "Guild", emblem_url: null, tags: [], description: null, party_standing: "unknown" };
    const npc = (id: string, over: Row = {}): Row => ({
      id,
      name: "Real Name",
      disguise_name: null,
      disguise_portrait_url: null,
      is_revealed: false,
      unmasked_at: null,
      race: null,
      occupation: null,
      ...over,
    });
    async function openGuild() {
      mocks.factions.value = [guild];
      mocks.memberships.value = [{ faction_id: "g1", role: "Scout" }];
      const w = mount(PlayerFactionsView, { global: { stubs } });
      await w.find(".cursor-pointer").trigger("click");
      await flushPromises();
      return w;
    }

    it("lists a disguised member under the alias and never leaks the true name", async () => {
      mocks.factionNpcs.value = [{ id: "e1", npc_id: "n1", status: "Active", role: null }];
      mocks.sharedNpcs.value = [npc("n1", { disguise_name: "The Stranger" })];
      const w = await openGuild();
      expect(w.text()).toContain("The Stranger");
      expect(w.text()).not.toContain("Real Name");
    });

    it("omits members the player cannot see and members who are no longer active", async () => {
      mocks.factionNpcs.value = [
        { id: "e1", npc_id: "n1", status: "Active", role: null },
        { id: "e2", npc_id: "unshared", status: "Active", role: null },
        { id: "e3", npc_id: "n3", status: "Left", role: null },
      ];
      mocks.sharedNpcs.value = [npc("n1", { name: "Visible One" }), npc("n3", { name: "Departed One" })];
      const w = await openGuild();
      expect(w.text()).toContain("Visible One");
      expect(w.text()).not.toContain("Departed One");
      expect(w.text().match(/Member/g)?.length).toBe(1);
    });

    it("shows no member list to a player who does not belong to the faction", async () => {
      mocks.factions.value = [guild];
      mocks.memberships.value = [];
      mocks.factionNpcs.value = [{ id: "e1", npc_id: "n1", status: "Active", role: null }];
      mocks.sharedNpcs.value = [npc("n1", { name: "Visible One" })];
      const w = mount(PlayerFactionsView, { global: { stubs } });
      await w.find(".cursor-pointer").trigger("click");
      await flushPromises();
      expect(w.text()).not.toContain("KNOWN MEMBERS");
      expect(w.text()).not.toContain("Visible One");
    });
  });
  it("reads memberships as the previewed character while a DM previews, and as the linked character otherwise", () => {
    mocks.membershipFor.mockReset();
    mount(PlayerFactionsView, { global: { stubs } });
    expect(mocks.membershipFor.mock.calls[0][0].value).toBe("pm-real");

    const appUi = useAppUiStore();
    appUi.dmPreviewMode = true;
    appUi.dmPreviewPartyMemberId = "pm-preview";
    mocks.membershipFor.mockReset();
    mount(PlayerFactionsView, { global: { stubs } });
    expect(mocks.membershipFor.mock.calls[0][0].value).toBe("pm-preview");
  });
});
