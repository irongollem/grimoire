import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm" }) }));

import { useCampaignStore } from "@/stores/campaign";
import type { Location } from "@/types/location.types";
import LocationDetailSections from "./LocationDetailSections.vue";

// Every panel reads for itself and is tested on its own; here only which of them is mounted, and for what.
const STUBS = [
  "RichTextViewer", "LocationStateControls", "LocationLootPanel", "LocationJourney", "LocationRoadsPanel", "LocationDoors",
  "SiteWaysOutPanel", "StoreInventory", "SiteRoomsPanel", "LocationPlacements", "LocationSortPanel", "EntityBacklinks", "ConnectionsSection",
];

const town = (id: string, campaignId: string | null) => ({ id, campaign_id: campaignId, user_id: "dm", name: id, location_type: "city", parent_id: null, related_location_ids: [], description: null, npc_owner_id: null }) as unknown as Location;

function mountFor(location: Location) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)", component: { template: "<div />" } }] });
  return mount(LocationDetailSections, {
    props: { location },
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]], stubs: Object.fromEntries(STUBS.map((n) => [n, true])) },
  });
}

beforeEach(() => {
  fake.reset();
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = "c1";
});

describe("LocationDetailSections: Roads from here", () => {
  // Bug caught: a place of another campaign shown the open campaign's roads and party, and a road added there
  // written into the open campaign from a place of the other.
  it("shows a place's roads only when the place is of the campaign that is open", async () => {
    const here = mountFor(town("harbour", "c1"));
    await flushPromises();
    expect(here.findComponent({ name: "LocationRoadsPanel" }).exists()).toBe(true);
    expect(here.findComponent({ name: "LocationJourney" }).exists()).toBe(true);

    const elsewhere = mountFor(town("ravenhold", "c2"));
    await flushPromises();
    expect(elsewhere.findComponent({ name: "LocationRoadsPanel" }).exists()).toBe(false);
    expect(elsewhere.findComponent({ name: "LocationJourney" }).exists()).toBe(false);
  });

  // Bug caught: a half-written road kept when the DM opens the next place, then added from that place instead.
  it("starts the road panel afresh for each place opened", async () => {
    const wrapper = mountFor(town("harbour", "c1"));
    await flushPromises();
    const first = wrapper.findComponent({ name: "LocationRoadsPanel" }).vm;
    await wrapper.setProps({ location: town("brightwater", "c1") });
    await flushPromises();
    expect(wrapper.findComponent({ name: "LocationRoadsPanel" }).vm).not.toBe(first);
  });
});
