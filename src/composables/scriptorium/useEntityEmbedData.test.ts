import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ref } from "vue";
import type { EntityRef } from "@/lib/scriptorium/entityEmbeds";

// ── A minimal chainable Supabase mock covering exactly the calls this
// composable makes: .from(table).select(...).eq(col, val)[.order(...)].single()/.maybeSingle(). ──

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>>,
  objectivesByQuest: {} as Record<string, unknown[]>,
}));

function makeBuilder(table: string) {
  const filters: Record<string, string> = {};
  const builder = {
    select: () => builder,
    eq: (col: string, val: string) => {
      filters[col] = val;
      return builder;
    },
    order: () => {
      const rows = mocks.objectivesByQuest[filters.quest_id] ?? [];
      return Promise.resolve({ data: rows, error: null });
    },
    single: () => {
      const row = mocks.tables[table]?.[filters.id];
      return Promise.resolve(row ? { data: row, error: null } : { data: null, error: new Error("not found") });
    },
    maybeSingle: () => {
      const row = mocks.tables[table]?.[filters.id] ?? null;
      return Promise.resolve({ data: row, error: null });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
  },
}));

import { useEntityEmbedData } from "./useEntityEmbedData";

function open(refs: EntityRef[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const refsRef = ref(refs);
  let api!: ReturnType<typeof useEntityEmbedData>;
  mount(
    defineComponent({
      setup() {
        api = useEntityEmbedData(refsRef);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api, refsRef };
}

beforeEach(() => {
  mocks.tables = { npcs: {}, monsters: {}, library_monsters: {}, spells: {}, items: {}, locations: {} };
  mocks.objectivesByQuest = {};
});

describe("useEntityEmbedData", () => {
  it("resolves an npc ref into formatted body HTML", async () => {
    mocks.tables.npcs["npc-1"] = { id: "npc-1", name: "Aldric", location_id: null };
    const { api } = open([{ type: "npc", id: "npc-1" }]);
    await flushPromises();
    expect(api().lookup.value["npc:npc-1"]).toContain("Aldric");
    expect(api().isLoading.value).toBe(false);
  });

  it("resolves an npc's location name through a secondary fetch", async () => {
    mocks.tables.npcs["npc-1"] = { id: "npc-1", name: "Aldric", location_id: "loc-1" };
    mocks.tables.locations["loc-1"] = { id: "loc-1", name: "Baldur's Gate", location_type: "city" };
    const { api } = open([{ type: "npc", id: "npc-1" }]);
    await flushPromises();
    expect(api().lookup.value["npc:npc-1"]).toContain("Baldur's Gate");
  });

  it("resolves a shared library monster ref (non-UUID id)", async () => {
    mocks.tables.library_monsters["srd_owlbear"] = {
      id: "srd_owlbear",
      name: "Owlbear",
      size: "large",
      monster_type: "monstrosity",
      alignment: "unaligned",
      stat_block: {
        armor_class: 13,
        hit_points: 59,
        speed: "40 ft.",
        challenge_rating: "3",
        str: 20,
        dex: 12,
        con: 17,
        int: 3,
        wis: 12,
        cha: 7,
      },
    };
    const { api } = open([{ type: "monster", id: "srd_owlbear" }]);
    await flushPromises();
    expect(api().lookup.value["monster:srd_owlbear"]).toContain("Owlbear");
  });

  it("resolves an item's granted spells through a secondary fetch", async () => {
    mocks.tables.items["item-1"] = {
      id: "item-1",
      name: "Wand of Magic Missile",
      item_type: "wand",
      rarity: "uncommon",
      subtype: null,
      cost: null,
      weight: null,
      damage_rolls: [],
      armor_class: null,
      properties: [],
      requires_attunement: false,
      spell_ids: ["spell-1"],
      tags: [],
    };
    mocks.tables.spells["spell-1"] = {
      id: "spell-1",
      name: "Magic Missile",
      level: 1,
      school: "evocation",
      classes: [],
      components: ["V", "S"],
    };
    const { api } = open([{ type: "item", id: "item-1" }]);
    await flushPromises();
    expect(api().lookup.value["item:item-1"]).toContain("Magic Missile");
  });

  it("resolves a quest's objectives, giver name and location name", async () => {
    mocks.tables.npcs["giver-1"] = { id: "giver-1", name: "Elder Maren", location_id: null };
    mocks.tables.locations["loc-1"] = { id: "loc-1", name: "The Sunken Keep", location_type: "dungeon" };
    mocks.objectivesByQuest["quest-1"] = [
      { id: "obj-1", quest_id: "quest-1", description: "Find the amulet", status: "active", sort_order: 0 },
    ];
    mocks.tables.quests = {
      "quest-1": {
        id: "quest-1",
        title: "The Sunken Road",
        status: "active",
        giver_npc_id: "giver-1",
        location_id: "loc-1",
        tags: [],
      },
    };
    const { api } = open([{ type: "quest", id: "quest-1" }]);
    await flushPromises();
    const html = api().lookup.value["quest:quest-1"];
    expect(html).toContain("The Sunken Road");
    expect(html).toContain("Elder Maren");
    expect(html).toContain("The Sunken Keep");
    expect(html).toContain("Find the amulet");
  });

  it("leaves the lookup entry undefined when the entity no longer resolves", async () => {
    const { api } = open([{ type: "npc", id: "gone" }]);
    await flushPromises();
    expect(api().lookup.value["npc:gone"]).toBeUndefined();
  });

  it("is not loading once every fetch has settled", async () => {
    mocks.tables.npcs["npc-1"] = { id: "npc-1", name: "Aldric", location_id: null };
    const { api } = open([{ type: "npc", id: "npc-1" }]);
    expect(api().isLoading.value).toBe(true);
    await flushPromises();
    expect(api().isLoading.value).toBe(false);
  });
});
