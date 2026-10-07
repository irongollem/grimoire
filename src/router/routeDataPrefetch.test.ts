import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/vue-query";

// Plain objects stand in for the stores: this module only reads three fields,
// and the real stores need a browser (localStorage) and a Supabase client.
const auth = { isAuthenticated: false, currentRole: null as string | null };
const campaign = { activeCampaignId: null as string | null };
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));

import { DATA_PREFETCH_PATHS, prefetchRouteData } from "./routeDataPrefetch";
import { npcListQuery } from "@/composables/npcs/useNpcs";
import { partyListQuery } from "@/composables/party/useParty";

function fakeClient() {
  const prefetchQuery = vi.fn((_options: unknown) => Promise.resolve());
  return { client: { prefetchQuery } as unknown as QueryClient, prefetchQuery };
}

function signIn(role: "dm" | "player" | null, campaignId: string | null) {
  auth.isAuthenticated = role !== null;
  auth.currentRole = role;
  campaign.activeCampaignId = campaignId;
}

describe("prefetchRouteData", () => {
  it("prefetches the NPC page's reads with the same keys the page uses", () => {
    signIn("dm", "c1");
    const { client, prefetchQuery } = fakeClient();
    prefetchRouteData(client, "/npcs");
    const keys = prefetchQuery.mock.calls.map(([options]) => (options as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(npcListQuery("c1").queryKey);
    expect(keys).toContainEqual(partyListQuery("c1").queryKey);
  });

  it("ignores a query string and a destination with no data read", () => {
    signIn("dm", "c1");
    const { client, prefetchQuery } = fakeClient();
    prefetchRouteData(client, "/calendar");
    expect(prefetchQuery).not.toHaveBeenCalled();
    prefetchRouteData(client, "/quests?x=1");
    expect(prefetchQuery).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for a player, without a campaign, or when signed out", () => {
    const { client, prefetchQuery } = fakeClient();
    signIn("player", "c1");
    prefetchRouteData(client, "/npcs");
    signIn("dm", null);
    prefetchRouteData(client, "/npcs");
    signIn(null, "c1");
    prefetchRouteData(client, "/npcs");
    expect(prefetchQuery).not.toHaveBeenCalled();
  });

  it("covers the destinations the sidebar leads with", () => {
    expect(DATA_PREFETCH_PATHS).toEqual(
      expect.arrayContaining(["/npcs", "/encounters", "/quests", "/locations", "/notes", "/party", "/factions"]),
    );
  });
});
