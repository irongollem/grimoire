import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const given = vi.hoisted(() => ({
  places: [] as { id: string; name: string; parent_id: string | null }[],
  /** The place whose map both ends are pinned on, as the one-place read answers it. */
  map: null as Record<string, unknown> | null,
  party: [] as { id: string; current_location_id: string }[],
  countsFood: false,
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));
// The places, the party and the picture's size are their own composables' to read; here they are simply given.
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: ref(given.places) }),
  useLocation: (id: () => string | null) => ({ data: computed(() => (id() === null ? undefined : given.map)) }),
}));
vi.mock("@/composables/locations/useMapPictureSize", () => ({ useMapPictureSize: () => ref({ width: 1000, height: 500 }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: computed(() => given.party) }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({ useIsRuleEnabled: () => computed(() => given.countsFood) }));

import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";
import LocationJourney from "./LocationJourney.vue";

const pin = (id: string, x: number) => ({ child_location_id: id, child_name: id === "brightwater" ? "Brightwater" : "Saltmarsh", child_type: "city", child_image_url: null, x, y: 0.5, visible_to_players: true });

async function mountAt(locationId: string) {
  const wrapper = mount(LocationJourney, {
    props: { locationId },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
      stubs: { EventModal: true },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  fake.reset();
  setActivePinia(createPinia());
  const campaign = useCampaignStore();
  campaign.activeCampaignId = "c1";
  campaign.activeCampaign = { id: "c1", current_location_id: "brightwater" } as Campaign;
  given.party = [];
  given.countsFood = false;
  given.places = [
    { id: "region", name: "The Coast", parent_id: null },
    { id: "brightwater", name: "Brightwater", parent_id: "region" },
    { id: "saltmarsh", name: "Saltmarsh", parent_id: "region" },
  ];
  // 0.4 of a 1000-pixel width whose whole width is 100 miles: 40 miles as the crow flies.
  given.map = { id: "region", name: "The Coast", map_url: "coast.webp", map_layer_url: null, map_pins: [pin("brightwater", 0.2), pin("saltmarsh", 0.6)], map_scale: { unit: "mi", distance: 100, a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } } };
});

describe("LocationJourney", () => {
  // Bug caught: with no road between two towns the entry says nothing, though the map both are pinned on has a scale.
  it("measures in a straight line on the shared map when no road joins the two, and says so", async () => {
    const wrapper = await mountAt("saltmarsh");
    const said = wrapper.get("[data-testid=location-journey]").text();
    expect(said).toContain("40 mi");
    expect(said).toContain("in a straight line on the map of The Coast");
  });

  // Bug caught: the ruler on the picture overruling the distance someone wrote down for the road.
  it("goes by the road when there is one, whatever the map would measure", async () => {
    fake.seed("location_roads", [{ id: "r1", campaign_id: "c1", user_id: "dm", from_location_id: "brightwater", to_location_id: "saltmarsh", distance: 55, unit: "mi", name: "", going: "road" }]);
    const wrapper = await mountAt("saltmarsh");
    const said = wrapper.get("[data-testid=location-journey]").text();
    expect(said).toContain("55 mi");
    expect(said).not.toContain("straight line");
    // 55 miles at 24 a day: nights after 24 and 48 miles, and no place between the two towns.
    expect(wrapper.get("[data-testid=location-journey-stops]").text()).toBe("On the way: Night 1, then night 2.");
  });

  // Bug caught: the road's own encounter table not offered on the journey that takes that road; or a roll that
  // shows nothing.
  it("offers a roll on the table of the road the journey takes, and shows what came up", async () => {
    useCampaignStore().activeCampaign = { id: "c1", user_id: "dm", current_location_id: "brightwater" } as Campaign;
    fake.seed("roll_tables", [{ id: "t1", user_id: "dm", campaign_id: "c1", name: "The coast road", dice: "1d4", tags: [], entries: [{ id: "e1", min: 1, max: 4, label: "Smugglers on the shingle" }] }]);
    fake.seed("location_roads", [{ id: "r1", campaign_id: "c1", user_id: "dm", from_location_id: "brightwater", to_location_id: "saltmarsh", distance: 55, unit: "mi", name: "", going: "road", roll_table_id: "t1" }]);
    const wrapper = await mountAt("saltmarsh");
    const roll = wrapper.findAll("button").find((b) => b.text().includes("Roll on The coast road"));
    expect(roll).toBeDefined();
    await roll!.trigger("click");
    expect(wrapper.get("[data-testid=location-journey-tables]").text()).toContain("Smugglers on the shingle");
  });

  // PHB 2014 "Travel Pace": 24 miles a day, so 55 miles occupies three days; PHB "Food and Water": a ration a day each.
  // Bug caught: food counted for a table that never switched the rule on; or counted for the wrong number of days.
  it("says the food a journey takes only where the campaign counts food", async () => {
    fake.seed("location_roads", [{ id: "r1", campaign_id: "c1", user_id: "dm", from_location_id: "brightwater", to_location_id: "saltmarsh", distance: 55, unit: "mi", name: "", going: "road", roll_table_id: null }]);
    given.party = [{ id: "p1", current_location_id: "brightwater" }, { id: "p2", current_location_id: "brightwater" }, { id: "p3", current_location_id: "saltmarsh" }];
    const off = await mountAt("saltmarsh");
    expect(off.find("[data-testid=location-journey-food]").exists()).toBe(false);
    given.countsFood = true;
    const on = await mountAt("saltmarsh");
    expect(on.get("[data-testid=location-journey-food]").text()).toBe("Food for the road: 6 rations for 2 travellers (3 rations each).");
  });

  // Bug caught: a place with neither a road nor a shared scaled map shown a distance of nothing.
  it("says nothing when neither a road nor a map can say how far", async () => {
    given.map = { ...given.map, map_scale: null };
    const wrapper = await mountAt("saltmarsh");
    expect(wrapper.find("[data-testid=location-journey]").exists()).toBe(false);
  });
});
