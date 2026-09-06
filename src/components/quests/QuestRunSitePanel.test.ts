import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunSitePanel from "./QuestRunSitePanel.vue";

const mocks = vi.hoisted(() => ({
  currentLocationId: null as string | null,
  locations: { value: [] as Array<Record<string, unknown>> },
  doors: { value: [] as Array<Record<string, unknown>> },
  stateOf: vi.fn((_id: string, _fact: string) => undefined as { value: boolean } | undefined),
  setLocation: vi.fn(),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { current_location_id: mocks.currentLocationId } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: mocks.locations }) }));
vi.mock("@/composables/locations/useLocationState", () => ({
  useLocationStateForRooms: () => ({ data: { value: [] }, stateOf: mocks.stateOf }),
}));
vi.mock("@/composables/locations/useSiteDoors", () => ({ useSiteDoors: () => ({ data: mocks.doors }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useSetCampaignLocation: () => ({ mutate: mocks.setLocation, isPending: { value: false } }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

const routerStub = { global: { stubs: { RouterLink: true } } };

describe("QuestRunSitePanel", () => {
  beforeEach(() => {
    mocks.currentLocationId = null;
    mocks.locations.value = [];
    mocks.doors.value = [];
    mocks.stateOf.mockReset();
    mocks.stateOf.mockReturnValue(undefined);
    mocks.setLocation.mockReset();
  });

  it("says the party's position is unknown rather than showing an empty site", () => {
    const wrapper = mount(QuestRunSitePanel, routerStub);
    expect(wrapper.text()).toContain("isn't known");
  });

  it("summarizes the site as one line: name, type, room count, explored count", () => {
    mocks.currentLocationId = "room-1";
    mocks.locations.value = [
      { id: "site-1", parent_id: null, location_type: "dungeon", name: "The Sunken Vault", sort_order: null },
      { id: "room-1", parent_id: "site-1", location_type: "room", name: "Antechamber", sort_order: 0 },
      { id: "room-2", parent_id: "site-1", location_type: "room", name: "Flooded Hall", sort_order: 1 },
    ];
    mocks.doors.value = [{ from_location_id: "room-1", to_location_id: "room-2", is_one_way: false, starts_locked: false }];
    mocks.stateOf.mockImplementation((id: string, fact: string) => (id === "room-1" && fact === "explored" ? { value: true } : undefined));
    const wrapper = mount(QuestRunSitePanel, routerStub);
    expect(wrapper.text()).toContain("The Sunken Vault · dungeon · 2 rooms · 1 explored");
    expect(wrapper.text()).toContain("Antechamber");
    expect(wrapper.text()).toContain("Flooded Hall");
  });

  it("moves the party in one click with no reason prompt, and says this is not a story write", async () => {
    mocks.currentLocationId = "room-1";
    mocks.locations.value = [
      { id: "site-1", parent_id: null, location_type: "dungeon", name: "The Sunken Vault", sort_order: null },
      { id: "room-1", parent_id: "site-1", location_type: "room", name: "Antechamber", sort_order: 0 },
      { id: "room-2", parent_id: "site-1", location_type: "room", name: "Flooded Hall", sort_order: 1 },
    ];
    mocks.doors.value = [{ from_location_id: "room-1", to_location_id: "room-2", is_one_way: false, starts_locked: false }];
    const wrapper = mount(QuestRunSitePanel, routerStub);
    expect(wrapper.text()).toContain("nothing here is written to any story");
    const target = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.text().includes("Flooded Hall"));
    await target!.trigger("click");
    expect(mocks.setLocation).toHaveBeenCalledWith(
      { id: "c1", locationId: "room-2" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });
});
