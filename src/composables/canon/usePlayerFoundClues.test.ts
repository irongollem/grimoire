import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const seen = vi.hoisted(() => ({
  places: [] as { id: string; name: string }[],
  people: [] as { id: string; name: string | null }[],
  items: new Map<string, { name: string }>(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/composables/locations/useLocations", () => ({ useSharedLocations: () => ({ data: ref(seen.places) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: () => ({ data: ref(seen.people) }) }));
vi.mock("@/composables/items/useItemsByIds", () => ({ useItemsByIds: () => ({ data: ref(seen.items) }) }));

import { newestFirst, usePlayerFoundClues, type PlayerFoundClue } from "./usePlayerFoundClues";
import { useCampaignStore } from "@/stores/campaign";

const clue = (over: Partial<PlayerFoundClue>): PlayerFoundClue => ({
  id: "k", title: "A locket", found_at: "2026-11-10T20:00:00Z", found_session_id: null, location_id: null, npc_id: null, item_id: null, document_id: null, ...over,
});

describe("newestFirst", () => {
  // Bug caught: found clues listed in the order the DM wrote them instead of the order the party found them.
  it("puts the clue found last on top, without reordering the input", () => {
    const input = [clue({ id: "old", found_at: "2026-11-01T00:00:00Z" }), clue({ id: "new", found_at: "2026-11-20T00:00:00Z" })];
    expect(newestFirst(input).map((c) => c.id)).toEqual(["new", "old"]);
    expect(input.map((c) => c.id)).toEqual(["old", "new"]);
  });
});

describe("usePlayerFoundClues", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useCampaignStore().activeCampaignId = "c1";
    seen.places = [{ id: "loc1", name: "The Drowned Mill" }];
    seen.people = [{ id: "npc1", name: "Old Bram" }, { id: "npc2", name: null }];
    seen.items = new Map([["it1", { name: "Brass key" }]]);
  });

  async function read() {
    let result!: ReturnType<typeof usePlayerFoundClues>;
    const Host = defineComponent({
      setup() {
        result = usePlayerFoundClues();
        return () => h("div");
      },
    });
    mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
    await flushPromises();
    return result;
  }

  // Bug caught: where a clue lay was shown for records the player cannot see (a hidden NPC's name, a place not shared),
  // or not shown for the ones they can. A name the projection withholds (null) is never printed.
  it("names where a clue lay only when the player can see that place, person or item", async () => {
    fake.onRpc("get_player_found_clues", () => [
      clue({ id: "a", found_at: "2026-11-01T00:00:00Z", location_id: "loc1" }),
      clue({ id: "b", found_at: "2026-11-02T00:00:00Z", npc_id: "npc1" }),
      clue({ id: "c", found_at: "2026-11-03T00:00:00Z", item_id: "it1" }),
      clue({ id: "d", found_at: "2026-11-04T00:00:00Z", npc_id: "npc2" }),
      clue({ id: "e", found_at: "2026-11-05T00:00:00Z", location_id: "unshared" }),
      clue({ id: "f", found_at: "2026-11-06T00:00:00Z" }),
      // Bug caught: a clue found in a handout read as lying nowhere.
      clue({ id: "g", found_at: "2026-11-07T00:00:00Z", document_id: "doc1" }),
    ]);
    const { rows } = await read();
    expect(rows.value.map((r) => [r.clue.id, r.where])).toEqual([
      ["g", { kind: "handout", name: "a handout" }],
      ["f", null],
      ["e", null],
      ["d", null],
      ["c", { kind: "item", name: "Brass key" }],
      ["b", { kind: "person", name: "Old Bram" }],
      ["a", { kind: "place", name: "The Drowned Mill" }],
    ]);
  });

  // Bug caught: the read was not scoped to the active campaign, so another campaign's clues could show here.
  it("asks for the active campaign's found clues", async () => {
    fake.onRpc("get_player_found_clues", (args) => (args.p_campaign_id === "c1" ? [clue({ id: "mine" })] : [clue({ id: "other" })]));
    expect((await read()).rows.value.map((r) => r.clue.id)).toEqual(["mine"]);
  });
});
