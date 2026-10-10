import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import MonsterSheet from "./MonsterSheet.vue";
import type { Monster } from "@/types/monster.types";

/** The lore beside the stat block only: where a library creature's description comes from. */

const LORE = "A shaggy black bear that forages at the forest edge.";
const descriptionIds: Array<string | null> = [];

vi.mock("@/composables/monsters/useMonsters", () => ({
  useLibraryMonsterDescription: (id: () => string | null) => {
    descriptionIds.push(id());
    return { data: computed(() => (id() ? LORE : undefined)) };
  },
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncountersByMonster: () => ({ data: ref([]) }) }));
vi.mock("@/composables/dungeon-features/useLootTables", () => ({ useMonsterLootTables: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref([]) }) }));

function monster(overrides: Partial<Monster>): Monster {
  return {
    id: "srd_bear_black_bf",
    user_id: "",
    campaign_id: null,
    name: "Bear, Black",
    monster_type: "beast",
    size: "medium",
    alignment: "unaligned",
    habitat: null,
    source: "blackflag",
    tags: [],
    stat_block: { armor_class: 11, hit_points: "19", speed: "40 ft.", str: 15, dex: 10, con: 14, int: 2, wis: 12, cha: 7, challenge_rating: "1/2" },
    notes: null,
    image_url: null,
    cutout_url: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  } as Monster;
}

const stubs = { RouterLink: true, FocalImage: true, StatBlockPanel: true, TraitList: true, SpellcastingList: true, RichTextViewer: { props: ["content"], template: "<p class='rt'>{{ content }}</p>" } };

describe("MonsterSheet description", () => {
  it("shows a library creature's lore from its own read, not from the row", () => {
    const wrapper = mount(MonsterSheet, { props: { monster: monster({ is_shared: true }) }, global: { stubs } });
    expect(descriptionIds).toContain("srd_bear_black_bf");
    expect(wrapper.find(".rt.lore").text()).toBe(LORE);
  });

  it("shows a DM's own monster's description from the row and asks for no lore", () => {
    descriptionIds.length = 0;
    const wrapper = mount(MonsterSheet, {
      props: { monster: monster({ id: "m1", is_shared: false, description: "My homebrew bear." }) },
      global: { stubs },
    });
    expect(descriptionIds.every((id) => id === null)).toBe(true);
    expect(wrapper.find(".rt").text()).toBe("My homebrew bear.");
  });
});
