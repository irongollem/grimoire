import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { slugKey } from "./travelSettings";
import TravelTab from "./TravelTab.vue";

const { fake, h } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return {
    fake: createSupabaseFake(),
    h: { updateCampaign: vi.fn(), confirm: vi.fn(async () => true), companions: [] as { id: string; name: string; speed: number }[] },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1", activeCampaign: { id: "c1", open_land_terrain: "difficult" } }),
}));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useUpdateCampaign: () => ({ mutate: h.updateCampaign, isPending: ref(false) }),
}));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: ref(h.companions) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: h.confirm }) }));

async function mountTab() {
  const w = mount(TravelTab, {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  return w;
}

const button = (w: Awaited<ReturnType<typeof mountTab>>, scope: string, label: string) => {
  const hit = w.find(`[data-testid="${scope}"]`).findAll("button").find((b) => b.text() === label);
  if (!hit) throw new Error(`no ${label} in ${scope}`);
  return hit;
};

beforeEach(() => {
  fake.reset();
  h.updateCampaign.mockReset();
  h.companions = [];
});

describe("slugKey", () => {
  it("makes a unique key of lowercase a-z, 0-9 and underscores, at most 40", () => {
    expect(slugKey("Ash Waste!", [])).toBe("ash_waste");
    expect(slugKey("Ash Waste", ["ash_waste"])).toBe("ash_waste_2");
    const long = slugKey("x".repeat(60), ["x".repeat(40)]);
    expect(long).toMatch(/^[a-z0-9_]{1,40}$/);
    expect(long).not.toBe("x".repeat(40));
  });
});

describe("Campaign Settings, Travel", () => {
  it("writes the land with no road to open_land_terrain on the campaign", async () => {
    const w = await mountTab();
    await w.find('[data-testid="open-land-select"]').setValue("snow");
    expect(h.updateCampaign.mock.calls[0][0]).toEqual({ id: "c1", update: { open_land_terrain: "snow" } });
  });

  it("saves an overridden preset under the preset's own key, and shows it as changed", async () => {
    const w = await mountTab();
    await button(w, "terrain-difficult", "Edit").trigger("click");
    await w.find('[data-testid="terrain-factor"] input, input[data-testid="terrain-factor"]').setValue(0.4);
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("travel_terrains")).toMatchObject([{ key: "difficult", factor: 0.4, campaign_id: "c1" }]);
    expect(w.find('[data-testid="terrain-difficult"]').text()).toContain("Changed");
  });

  it("Back to the book deletes only that key", async () => {
    fake.seed("travel_terrains", [
      { id: "a", campaign_id: "c1", key: "snow", name: "Snow", factor: 0.5, sink: 0.25 },
      { id: "b", campaign_id: "c1", key: "ash", name: "Ash", factor: 0.5, sink: 1 },
    ]);
    const w = await mountTab();
    await button(w, "terrain-snow", "Back to the book").trigger("click");
    await flushPromises();
    expect(fake.rows("travel_terrains").map((r) => r.key)).toEqual(["ash"]);
  });

  it("adding a terrain slugs its name into a key not already in use", async () => {
    fake.seed("travel_terrains", [{ id: "b", campaign_id: "c1", key: "ash_waste", name: "Ash", factor: 0.5, sink: 1 }]);
    const w = await mountTab();
    await w.findAll("button").find((b) => b.text() === "Add a terrain")!.trigger("click");
    await w.find("input[placeholder='Ash waste']").setValue("Ash Waste");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("travel_terrains").map((r) => r.key)).toEqual(["ash_waste", "ash_waste_2"]);
  });

  it("shows a way that takes a companion's speed with the companion's name and feet", async () => {
    h.companions = [{ id: "k1", name: "Snowbeak", speed: 50 }];
    fake.seed("travel_ways", [
      { id: "w1", campaign_id: "c1", key: "dogsled_axe_beak", name: "Dogsled (axe beak)", kind: "vehicle", speed_feet: null, mph: null, companion_id: "k1", at_home: ["snow"], sink: {}, through_the_night: false },
    ]);
    const w = await mountTab();
    const row = w.find('[data-testid="way-dogsled_axe_beak"]');
    expect(row.find('[data-testid="way-speed"]').text()).toBe("Snowbeak's speed (50 ft)");
    expect(row.text()).toContain("At home on: Snow");
  });
});
