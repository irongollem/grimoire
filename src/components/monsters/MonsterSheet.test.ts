import { afterEach, describe, expect, it, vi } from "vitest";
import { useLowArt } from "@/composables/useLowArt";
import { sourceLabel } from "@/lib/library/sourceLabel";
import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import MonsterSheet from "./MonsterSheet.vue";
import type { Monster } from "@/types/monster.types";

/** The lore beside the stat block only: where a library creature's description comes from. */

const LORE = "A shaggy black bear that forages at the forest edge.";
const descriptionIds: Array<string | null> = [];

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (s: string | null | undefined, t?: string | null) => sourceLabel(s, t, new Map()),
  }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({
  useLibraryMonsterDescription: (id: () => string | null) => {
    descriptionIds.push(id());
    return { data: computed(() => (id() ? LORE : undefined)) };
  },
}));
// The real composables return a computed list, not a query object.
const encounters = ref<{ id: string; name: string; is_finished: boolean }[]>([]);
const lootTables = ref<{ id: string; name: string }[]>([]);
const lairOptions = ref<{ id: string; name: string }[]>([]);
vi.mock("@/composables/encounters/useEncounters", () => ({ useEncountersByMonster: () => computed(() => encounters.value) }));
vi.mock("@/composables/dungeon-features/useLootTables", () => ({ useMonsterLootTables: () => computed(() => lootTables.value) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: lairOptions }) }));

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
    source: "bfrd",
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

const stubs = { RouterLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" }, FocalImage: true, StatBlockPanel: true, TraitList: true, SpellcastingList: true, RichTextViewer: { props: ["content"], template: "<p class='rt'>{{ content }}</p>" } };

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

describe("MonsterSheet connections", () => {
  const mounted = (over: Partial<Monster> = {}) =>
    mount(MonsterSheet, { props: { monster: monster({ id: "m1", is_shared: false, ...over }) }, global: { stubs } });

  it("links the lair only when it is a place in this campaign's tree", () => {
    lairOptions.value = [{ id: "cave", name: "Stonejaw Cave" }];
    const found = mounted({ lair_location_id: "cave" });
    expect(found.text()).toContain("Lair: Stonejaw Cave");
    expect(found.find("a[href*='cave']").exists()).toBe(true);
    expect(mounted({ lair_location_id: "somewhere-in-another-campaign" }).text()).not.toContain("Lair:");
    expect(mounted({ lair_location_id: null }).text()).not.toContain("Lair:");
  });

  it("lists the encounters and loot tables it appears in, each linked to its own page", () => {
    encounters.value = [{ id: "e1", name: "Ambush at the Ford", is_finished: false }];
    lootTables.value = [{ id: "t1", name: "Owlbear nest" }];
    const w = mounted();
    expect(w.find("a[href='/encounters/e1']").text()).toContain("Ambush at the Ford");
    expect(w.find("a[href='/loot-tables/t1']").text()).toContain("Owlbear nest");
    expect(w.text()).toContain("Featured In");
    expect(w.text()).toContain("Loot Tables");
  });

  it("prints neither heading when it appears nowhere", () => {
    encounters.value = [];
    lootTables.value = [];
    const w = mounted();
    expect(w.text()).not.toContain("Featured In");
    expect(w.text()).not.toContain("Loot Tables");
  });
});

describe("MonsterSheet in low art (#1179)", () => {
  const lowArtSheet = (over: Partial<Monster> = {}) => {
    useLowArt().setLowArt(true);
    return mount(MonsterSheet, {
      props: { monster: monster({ id: "m1", is_shared: false, habitat: "forest", tags: ["beast"], ...over }) },
      global: { stubs: { ...stubs, FocalImage: { template: "<img class='record-img' />" } } },
    });
  };
  afterEach(() => { useLowArt().setLowArt(false); });

  // Bug: the sheet keeps its portrait column and downloads the picture the DM turned off.
  it("has no portrait column and hangs the CR as a tab", () => {
    const w = lowArtSheet({ image_url: "https://cdn.test/bear.webp" });
    expect(w.find(".record-img").exists()).toBe(false);
    expect(w.findAll('.sr-only').some((e) => e.text() === "Challenge rating 1/2")).toBe(true);
  });

  it("moves habitat, source and tags into the fact line and offers the Portrait button for the monster's own picture", () => {
    const w = lowArtSheet({ image_url: "https://cdn.test/bear.webp" });
    expect(w.text()).toContain("Habitat: forest");
    expect(w.text()).toContain("beast");
    expect(w.text()).toContain("Portrait");
  });

  it("offers no Portrait button when the monster has no picture of its own", () => {
    expect(lowArtSheet({ image_url: null }).text()).not.toContain("Portrait");
  });

  it("keeps the picture column with art on", () => {
    useLowArt().setLowArt(false);
    const w = mount(MonsterSheet, {
      props: { monster: monster({ id: "m1", is_shared: false }) },
      global: { stubs: { ...stubs, FocalImage: { template: "<img class='record-img' />" } } },
    });
    expect(w.find(".record-img").exists()).toBe(true);
  });
});
