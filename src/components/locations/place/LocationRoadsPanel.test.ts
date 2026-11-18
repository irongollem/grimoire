import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }));
const placesRef = vi.hoisted(() => ({ value: [] as { id: string; name: string; location_type: string }[] }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
// The campaign's places are their own composable's to read (and test); here they are simply given.
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: placesRef }) }));

import { useCampaignStore } from "@/stores/campaign";
import LocationRoadsPanel from "./LocationRoadsPanel.vue";

const place = (id: string, name: string, type = "city") => ({ id, campaign_id: "c1", user_id: "dm", name, location_type: type, parent_id: null });
const road = (id: string, a: string, b: string, distance: number, over: Record<string, unknown> = {}) => ({ id, campaign_id: "c1", user_id: "dm", from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", roll_table_id: null, ...over });

async function mountPanel(locationId = "harbour") {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/locations", component: { template: "<div />" } }] });
  const wrapper = mount(LocationRoadsPanel, {
    props: { locationId },
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fake.reset();
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
  placesRef.value = [place("harbour", "Harbour"), place("brightwater", "Brightwater"), place("farholt", "Farholt"), place("cellar", "The Cellar", "room")];
});

describe("LocationRoadsPanel", () => {
  // Bug caught: a road entered from the other town's end missing here, a road between two other towns listed
  // here, or another campaign's road shown.
  it("lists the roads that lead from this place, whichever end they were entered from", async () => {
    fake.seed("location_roads", [
      road("r1", "brightwater", "harbour", 40, { name: "the coast road" }),
      road("r2", "brightwater", "farholt", 15),
      road("r3", "harbour", "farholt", 60, { campaign_id: "c2" }),
    ]);
    const wrapper = await mountPanel();
    const rows = wrapper.findAll('[data-testid="location-road"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain("Brightwater");
    expect(rows[0].text()).toContain("40 mi by the coast road");
  });

  // Bug caught: a road that could be added with no length or no destination; or added from the wrong place.
  it("adds a road from this place once it has somewhere to lead and a length", async () => {
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="location-road-add"]').trigger("click");
    const addButton = () => wrapper.findAll("button").find((b) => b.text() === "Add road")!;
    expect(addButton().attributes("disabled")).toBeDefined();
    const vm = wrapper.vm as unknown as { otherId: string; distance: number | null; name: string };
    vm.otherId = "brightwater";
    vm.distance = 40;
    vm.name = " the coast road ";
    await flushPromises();
    expect(addButton().attributes("disabled")).toBeUndefined();
    await addButton().trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads")).toEqual([
      expect.objectContaining({ campaign_id: "c1", user_id: "dm", from_location_id: "harbour", to_location_id: "brightwater", distance: 40, unit: "mi", name: "the coast road", going: "road" }),
    ]);
  });

  // Bug caught: a road's own encounter table chosen in the form and never written, or a road with none written
  // as an empty string, which the database refuses as not a table.
  it("gives a road the encounter table chosen for it, and none when none is chosen", async () => {
    // The roll tables are read once the campaign's own row is known (its owner scopes the read).
    useCampaignStore().activeCampaign = { id: "c1", user_id: "dm" } as never;
    fake.seed("roll_tables", [{ id: "t1", user_id: "dm", campaign_id: "c1", name: "The coast road", dice: "1d6", entries: [], tags: [] }]);
    fake.seed("location_roads", [road("r1", "harbour", "farholt", 60, { roll_table_id: "t1" })]);
    const wrapper = await mountPanel();
    expect(wrapper.get('[data-testid="location-road-table"]').text()).toContain("The coast road");

    await wrapper.get('[data-testid="location-road-add"]').trigger("click");
    const vm = wrapper.vm as unknown as { otherId: string; distance: number | null; rollTableId: string };
    vm.otherId = "brightwater";
    vm.distance = 40;
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "Add road")!.trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads").find((r) => r.to_location_id === "brightwater" || r.from_location_id === "brightwater")).toMatchObject({ roll_table_id: null });

    await wrapper.get('[data-testid="location-road-add"]').trigger("click");
    vm.otherId = "brightwater";
    vm.distance = 12;
    vm.rollTableId = "t1";
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "Add road")!.trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads").filter((r) => r.roll_table_id === "t1")).toHaveLength(2);
  });

  // Bug caught: a cancelled confirm that still removed the road.
  it("removes a road only once the removal is confirmed", async () => {
    fake.seed("location_roads", [road("r1", "harbour", "brightwater", 40)]);
    mocks.confirm.mockResolvedValue(false);
    const wrapper = await mountPanel();
    const removeButton = () => wrapper.get('[data-testid="location-road"] button[aria-label^="Remove"]');
    await removeButton().trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads")).toHaveLength(1);
    mocks.confirm.mockResolvedValue(true);
    await removeButton().trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads")).toHaveLength(0);
  });
});
