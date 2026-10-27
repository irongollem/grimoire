import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Connection } from "@/types/connections.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

import { peopleOf } from "@/lib/worldLinks/connections";
import { isDrillInKind, personMatches, useConnectionDrillIn } from "./useConnectionDrillIn";

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

describe("isDrillInKind", () => {
  it("opens places and factions in place, and nothing else in search", () => {
    expect(isDrillInKind("location")).toBe(true);
    expect(isDrillInKind("faction")).toBe(true);
    expect(isDrillInKind("npc")).toBe(false);
  });
});

describe("useConnectionDrillIn", () => {
  let apps: App[] = [];
  beforeEach(() => {
    fake.reset();
    // Residents of l1 only: the same read for another place answers with other people.
    fake.onRpc("get_connections", (args) =>
      args.p_id === "l1" && args.p_campaign_id === "c1"
        ? [row({ other_id: "a", other_name: "Harl" }), row({ other_id: "b", other_name: "Brenna" })]
        : [row({ other_id: "z", other_name: "Elsewhere" })],
    );
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
    expect(fake.calls).toHaveLength(0);
    expect(drill.count.value).toBeNull();

    open.value = true;
    await vi.waitFor(() => expect(drill.count.value).toBe(2));
    expect(drill.people.value?.map((p) => p.other_name)).toEqual(["Harl", "Brenna"]);

    filter.value = "bren";
    await nextTick();
    expect(drill.filtered.value.map((p) => p.other_name)).toEqual(["Brenna"]);
    expect(drill.count.value).toBe(2);
  });
});
