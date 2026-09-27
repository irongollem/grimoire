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
  // library_monster_art / library_monster_art_canonical are selected in full
  // (no .eq() filter) by fetchLibraryMonsterArt, unlike every other table
  // here — a separate row-list store, keyed by table name, matches that shape.
  artRows: {} as Record<string, unknown[]>,
}));

const ART_TABLES = ["library_monster_art", "library_monster_art_canonical"];

function makeBuilder(table: string) {
  if (ART_TABLES.includes(table)) {
    return { select: () => Promise.resolve({ data: mocks.artRows[table] ?? [], error: null }) };
  }
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
  // useLibraryMonsterArt.ts imports this too (for its upsert/bulk mutations,
  // neither of which this composable calls) — unused here but needed so the
  // named import resolves.
  getCurrentUser: () => null,
}));

import { useEntityEmbedData } from "./useEntityEmbedData";

function open(refs: EntityRef[], seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(queryClient);
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
  mocks.artRows = { library_monster_art: [], library_monster_art_canonical: [] };
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

  it("applies the DM's library art override (a cutout) onto a shared monster embed", async () => {
    mocks.tables.library_monsters["srd_owlbear"] = {
      id: "srd_owlbear",
      name: "Owlbear",
      size: "large",
      monster_type: "monstrosity",
      alignment: "unaligned",
      image_url: "https://example.test/canonical.webp",
      cutout_url: null,
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
    mocks.artRows.library_monster_art = [
      { entry_id: "srd_owlbear", image_url: null, cutout_url: "https://example.test/mine-cut.webp", portrait_focal_point: null },
    ];
    const { api } = open([{ type: "monster", id: "srd_owlbear" }]);
    await flushPromises();
    const html = api().lookup.value["monster:srd_owlbear"];
    expect(html).toContain("https://example.test/mine-cut.webp");
    // The own row left image_url null, so the canonical picture survives —
    // withLibraryArt merges per field rather than replacing the whole row.
    expect(html).toContain("https://example.test/canonical.webp");
  });

  it("leaves a DM's own (non-shared) monster's art untouched by the library layers", async () => {
    const ownId = "11111111-1111-4111-8111-111111111111";
    mocks.tables.monsters[ownId] = {
      id: ownId,
      name: "Gnarl",
      size: "medium",
      monster_type: "beast",
      alignment: "unaligned",
      image_url: "https://example.test/own.webp",
      cutout_url: null,
      stat_block: {
        armor_class: 12,
        hit_points: 11,
        speed: "30 ft.",
        challenge_rating: "1/2",
        str: 14,
        dex: 12,
        con: 12,
        int: 2,
        wis: 10,
        cha: 6,
      },
    };
    mocks.artRows.library_monster_art_canonical = [
      { entry_id: ownId, image_url: "https://example.test/should-not-apply.webp", cutout_url: null, portrait_focal_point: null },
    ];
    const { api } = open([{ type: "monster", id: ownId }]);
    await flushPromises();
    const html = api().lookup.value[`monster:${ownId}`];
    expect(html).toContain("https://example.test/own.webp");
    expect(html).not.toContain("should-not-apply");
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

  it("reads a monster the Bestiary already cached, in the Bestiary's own shape (Sentry, 27 Sep 2026)", async () => {
    // Opening a creature in the Bestiary caches { monster, isShared } under
    // the shared key. The book used to read that entry as a bare row and
    // crash on stat_block, leaving Appendix A empty on the phone.
    const cached = {
      monster: {
        id: "7c4f1b2d-0000-4000-8000-000000000001",
        name: "Marzipan Sentry",
        size: "medium",
        monster_type: "construct",
        alignment: "unaligned",
        image_url: null,
        cutout_url: null,
        description: null,
        stat_block: { armor_class: 16, hit_points: "65 (10d8 + 20)", speed: "20 ft.", challenge_rating: "3", str: 16, dex: 8, con: 15, int: 3, wis: 10, cha: 5 },
      },
      isShared: false,
    };
    const { api } = open([{ type: "monster", id: cached.monster.id }], (qc) =>
      qc.setQueryData(["resolved-monster", cached.monster.id], cached),
    );
    await flushPromises();
    expect(api().lookup.value[`monster:${cached.monster.id}`]).toContain("Marzipan Sentry");
  });
});
