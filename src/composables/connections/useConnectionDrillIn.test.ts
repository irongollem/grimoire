import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Connection } from "@/types/connections.types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

import { peopleOf } from "@/lib/worldLinks/connections";
import { personMatches, useConnectionDrillIn } from "./useConnectionDrillIn";

const row = (over: Partial<Connection>): Connection => ({
  source: "npc_home", row_id: "r", type: "lives_in", outward: false, other_kind: "npc", other_id: "n1", other_name: "Harl",
  other_image: null, note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null, ...over,
});

describe("peopleOf", () => {
  it("keeps residents and PCs of a place, and members of a faction, and nothing else", () => {
    const rows = [
      row({ other_id: "a" }),
      row({ source: "pc_place", other_kind: "party_member", other_id: "b" }),
      row({ source: "link", type: "controls", other_kind: "faction", other_id: "c" }),
      row({ source: "membership", other_id: "d" }),
    ];
    expect(peopleOf("location", rows).map((r) => r.other_id)).toEqual(["a", "b"]);
    expect(peopleOf("faction", rows).map((r) => r.other_id)).toEqual(["d"]);
  });
});

describe("personMatches", () => {
  it("matches name or role, any case, and everyone on an empty filter", () => {
    expect(personMatches({ other_name: "Harl Dunmore", role: null }, "DUN")).toBe(true);
    expect(personMatches({ other_name: "Brenna", role: "Captain" }, "capt")).toBe(true);
    expect(personMatches({ other_name: "Brenna", role: null }, "capt")).toBe(false);
    expect(personMatches({ other_name: "Brenna", role: null }, "  ")).toBe(true);
  });
});

describe("useConnectionDrillIn", () => {
  let apps: App[] = [];
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: [row({ other_id: "a", other_name: "Harl" }), row({ other_id: "b", other_name: "Brenna" })], error: null });
    apps.forEach((a) => a.unmount());
    apps = [];
  });

  function mount<T>(setup: () => T): T {
    let out!: T;
    const app = createApp(defineComponent({ setup() { out = setup(); return () => h("div"); } }));
    app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
    app.mount(document.createElement("div"));
    apps.push(app);
    return out;
  }

  it("fetches nothing until opened, then reads, counts and filters", async () => {
    const open = ref(false);
    const filter = ref("");
    const drill = mount(() => useConnectionDrillIn({ kind: "location", id: "l1" }, open, filter));
    await nextTick();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(drill.count.value).toBeNull();

    open.value = true;
    await vi.waitFor(() => expect(drill.count.value).toBe(2));
    expect(mocks.rpc).toHaveBeenCalledWith("get_connections", { p_kind: "location", p_id: "l1", p_campaign_id: "c1" });

    filter.value = "bren";
    await nextTick();
    expect(drill.filtered.value.map((p) => p.other_name)).toEqual(["Brenna"]);
    expect(drill.count.value).toBe(2);
  });
});
