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
const placesRef = vi.hoisted(() => ({ value: [] as { id: string; name: string; location_type: string; parent_id: string | null }[] }));
const mapPlaceRef = vi.hoisted(() => ({ value: undefined as unknown }));
const askedMap = vi.hoisted(() => ({ ids: [] as (string | null)[] }));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
// The campaign's places are their own composable's to read (and test); here they are simply given.
vi.mock("@/composables/locations/useLocations", async () => {
  const { computed } = await import("vue");
  return {
    useAllLocations: () => ({ data: placesRef }),
    // The shared map's place, read by id; recorded so a test can see which map was asked for.
    useLocation: (id: () => string | null) => ({ data: computed(() => { askedMap.ids.push(id()); return id() === null ? undefined : mapPlaceRef.value; }) }),
  };
});
// The campaign's terrains are their own composable's to read; here the presets are given, snow renamed.
vi.mock("@/composables/locations/useTravel", async () => {
  const { computed } = await import("vue");
  return { useTravel: () => ({ terrains: computed(() => TERRAIN_PRESETS.map((t) => (t.key === "snow" ? { ...t, name: "Deep drift" } : t))), ways: computed(() => WAY_PRESETS), companionSpeed: () => null, openLand: computed(() => "open") }) };
});
// A 1000 x 1000 picture: a pin's fraction times 1000 is its pixel.
vi.mock("@/composables/locations/useMapPictureSize", async () => {
  const { computed } = await import("vue");
  return { useMapPictureSize: () => computed(() => ({ width: 1000, height: 1000 })) };
});

import { TERRAIN_PRESETS, WAY_PRESETS } from "@/rules/travelSpeed";
import { useCampaignStore } from "@/stores/campaign";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import LocationRoadsPanel from "./LocationRoadsPanel.vue";

const place = (id: string, name: string, type = "city") => ({ id, campaign_id: "c1", user_id: "dm", name, location_type: type, parent_id: null });
const road = (id: string, a: string, b: string, distance: number, over: Record<string, unknown> = {}) => ({ id, campaign_id: "c1", user_id: "dm", from_location_id: a, to_location_id: b, distance, unit: "mi", name: "", going: "road", terrain: "road", roll_table_id: null, ...over });

async function mountPanel(locationId = "harbour") {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/locations", component: { template: "<div />" } }] });
  const wrapper = mount(LocationRoadsPanel, {
    props: { locationId },
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  return wrapper;
}

type Panel = Awaited<ReturnType<typeof mountPanel>>;
const form = (wrapper: Panel) => wrapper.get('[data-testid="location-road-form"]');
const addButton = (wrapper: Panel) => wrapper.findAll("button").find((b) => b.text() === "Add road")!;

/** Fill the road form as a DM does: the destination picker, the length and the name, then "Add road". */
async function enterRoad(wrapper: Panel, road: { to: string; distance: string; name?: string; table?: string }): Promise<void> {
  await wrapper.get('[data-testid="location-road-add"]').trigger("click");
  const pickers = form(wrapper).findAllComponents(EntityCombobox);
  pickers[0].vm.$emit("update:modelValue", road.to);
  await form(wrapper).get('input[type="number"]').setValue(road.distance);
  if (road.name !== undefined) await form(wrapper).get('input[placeholder="the coast road (optional)"]').setValue(road.name);
  if (road.table !== undefined) pickers[1].vm.$emit("update:modelValue", road.table);
  await flushPromises();
}

beforeEach(() => {
  fake.reset();
  mocks.confirm.mockReset();
  mocks.confirm.mockResolvedValue(true);
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
  mapPlaceRef.value = undefined;
  askedMap.ids = [];
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

  // Bug caught: a road that could be added with no length or no destination; added from the wrong place; or a
  // form whose fields were not bound to what is sent.
  it("adds a road from this place once it has somewhere to lead and a length", async () => {
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="location-road-add"]').trigger("click");
    expect(addButton(wrapper).attributes("disabled")).toBeDefined();
    await form(wrapper).findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "brightwater");
    await flushPromises();
    expect(addButton(wrapper).attributes("disabled")).toBeDefined();
    await form(wrapper).get('input[type="number"]').setValue("40");
    await form(wrapper).get('input[placeholder="the coast road (optional)"]').setValue(" the coast road ");
    await flushPromises();
    expect(addButton(wrapper).attributes("disabled")).toBeUndefined();
    await addButton(wrapper).trigger("click");
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

    await enterRoad(wrapper, { to: "brightwater", distance: "40" });
    await addButton(wrapper).trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads").find((r) => r.to_location_id === "brightwater" || r.from_location_id === "brightwater")).toMatchObject({ roll_table_id: null });

    await enterRoad(wrapper, { to: "brightwater", distance: "12", name: "the pass", table: "t1" });
    await addButton(wrapper).trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads").filter((r) => r.roll_table_id === "t1")).toHaveLength(2);
  });

  // Bug caught: the ground picked and the road still saved as plain road, or left unsaved with no pick.
  it("saves the ground the DM picked, and a road by default", async () => {
    const wrapper = await mountPanel();
    await enterRoad(wrapper, { to: "brightwater", distance: "12" });
    await form(wrapper).get("select[aria-label='The ground']").setValue("snow");
    await addButton(wrapper).trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads")).toEqual([expect.objectContaining({ distance: 12, terrain: "snow" })]);
    await enterRoad(wrapper, { to: "brightwater", distance: "5" });
    await addButton(wrapper).trigger("click");
    await flushPromises();
    expect(fake.rows("location_roads").find((r) => r.distance === 5)).toMatchObject({ terrain: "road" });
  });

  // Bug caught: the road list naming the ground by the preset's word instead of the campaign's.
  it("lists a road's ground by the campaign's name for it", async () => {
    fake.seed("location_roads", [road("r1", "harbour", "brightwater", 30, { terrain: "snow" })]);
    const wrapper = await mountPanel();
    expect(wrapper.get('[data-testid="location-road"]').text()).toContain("30 mi by road, deep drift");
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
  // Decision 2a: a road added between two places pinned on one scaled map is offered the map's measure to start
  // from. Bug caught: the measure silently written into the field (a road winds; the book's figure is truer), or
  // offered for a place that is not on the shared map.
  it("offers the shared map's straight-line distance, and fills it in only when asked", async () => {
    placesRef.value = [{ ...place("coast", "The Sword Coast", "region") }, { ...place("harbour", "Harbour"), parent_id: "coast" }, { ...place("brightwater", "Brightwater"), parent_id: "coast" }, { ...place("farholt", "Farholt") }];
    mapPlaceRef.value = {
      id: "coast", name: "The Sword Coast", map_url: "coast.webp", map_layer_url: null,
      // 0.1 of the width is 10 miles, so the 0.4 between the two pins is 40 miles.
      map_scale: { unit: "mi", distance: 10, a: { x: 0, y: 0 }, b: { x: 0.1, y: 0 } },
      map_pins: [
        { child_location_id: "harbour", child_name: "Harbour", x: 0.1, y: 0.5, visible_to_players: false },
        { child_location_id: "brightwater", child_name: "Brightwater", x: 0.5, y: 0.5, visible_to_players: false },
      ],
    };
    const wrapper = await mountPanel();
    await wrapper.get('[data-testid="location-road-add"]').trigger("click");
    form(wrapper).findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "brightwater");
    await flushPromises();

    const offer = wrapper.get('[data-testid="location-road-measured"]');
    expect(offer.text()).toContain("On the map of The Sword Coast it is 40 mi in a straight line.");
    expect((form(wrapper).get('input[type="number"]').element as HTMLInputElement).value).toBe("");
    await offer.findAll("button").find((b) => b.text() === "Use it")!.trigger("click");
    expect((form(wrapper).get('input[type="number"]').element as HTMLInputElement).value).toBe("40");

    // Farholt lies inside nothing Harbour does: there is no shared map to ask for, and nothing is offered.
    form(wrapper).findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "farholt");
    await flushPromises();
    expect(wrapper.find('[data-testid="location-road-measured"]').exists()).toBe(false);
  });
});
