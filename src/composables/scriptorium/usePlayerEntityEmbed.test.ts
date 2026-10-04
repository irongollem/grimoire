import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { usePlayerEntityEmbed } from "./usePlayerEntityEmbed";

const mocks = vi.hoisted(() => ({
  npcs: vi.fn(),
  locations: vi.fn(),
  monsters: vi.fn(),
  discoveries: vi.fn(),
  items: vi.fn(),
  storedRefs: vi.fn(),
  quests: vi.fn(),
  spell: vi.fn(),
  activeCampaignId: "camp-1",
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: mocks.npcs }));
vi.mock("@/composables/locations/useLocations", () => ({ useSharedLocations: mocks.locations }));
vi.mock("@/composables/monsters/usePlayerMonstersByIds", () => ({ usePlayerMonstersByIds: mocks.monsters }));
vi.mock("@/composables/encounters/useDiscoveredMonsters", () => ({ usePlayerDiscoveries: mocks.discoveries }));
vi.mock("@/composables/items/useItems", () => ({ usePlayerItemProjection: mocks.items }));
vi.mock("@/composables/items/useStoredItemRefs", () => ({ useStoredItemRefs: mocks.storedRefs }));
vi.mock("@/composables/quests/useQuests", () => ({ usePlayerVisibleQuests: mocks.quests }));
vi.mock("@/composables/spells/useSpells", () => ({ useLibrarySpell: mocks.spell }));

const NPC_ID = "11111111-1111-1111-1111-111111111111";
const theme = () => "onednd2024" as const;

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  mocks.activeCampaignId = "camp-1";
  mocks.npcs.mockReturnValue({
    data: ref([
      { id: NPC_ID, name: "Mira", portrait_url: null, race: "Elf", occupation: null },
      { id: "hidden", name: null, portrait_url: null, race: null, occupation: null },
    ]),
    isLoading: ref(false),
  });
});

describe("usePlayerEntityEmbed", () => {
  it("resolves an item by id, through the projection and by-id read, never a catalogue (#972)", () => {
    mocks.items.mockReturnValue({ data: ref([]), isLoading: ref(false) });
    mocks.storedRefs.mockReturnValue({
      find: (id: string) => (id === "srd_rope" ? { id, name: "Hempen Rope", description: "", rarity: "mundane", item_type: "gear", properties: [], damage_rolls: null, armor_class: null, tags: [] } : undefined),
      isLoading: ref(false),
    });
    const { html } = usePlayerEntityEmbed("item", "srd_rope", "camp-1", theme);
    expect(html.value).toContain("Hempen Rope");
    expect(mocks.storedRefs.mock.calls[0][0]()).toEqual(["srd_rope"]);
    expect(usePlayerEntityEmbed("item", "gone", "camp-1", theme).html.value).toBeNull();
  });

  it("resolves an NPC from the projection and starts no other type's query", () => {
    const { html } = usePlayerEntityEmbed("npc", NPC_ID, "camp-1", theme);
    expect(html.value).toContain("<h1>Mira</h1>");
    expect(html.value).toContain("Elf");
    for (const other of [mocks.locations, mocks.monsters, mocks.discoveries, mocks.items, mocks.storedRefs, mocks.quests, mocks.spell]) {
      expect(other).not.toHaveBeenCalled();
    }
  });

  it("is absent for an NPC whose name is not revealed, and for an unknown id", () => {
    expect(usePlayerEntityEmbed("npc", "hidden", "camp-1", theme).html.value).toBeNull();
    expect(usePlayerEntityEmbed("npc", "nope", "camp-1", theme).html.value).toBeNull();
  });

  it("is absent when the active campaign is not the handout's", () => {
    mocks.activeCampaignId = "camp-2";
    expect(usePlayerEntityEmbed("npc", NPC_ID, "camp-1", theme).html.value).toBeNull();
  });

  it("is absent for a monster the party has not discovered, even though the library lists it", () => {
    mocks.monsters.mockReturnValue({
      data: ref(new Map([["srd_owlbear", { id: "srd_owlbear", name: "Owlbear", stat_block: {} }]])),
      isLoading: ref(false),
    });
    mocks.discoveries.mockReturnValue({ data: ref([]), isLoading: ref(false) });
    expect(usePlayerEntityEmbed("monster", "srd_owlbear", "camp-1", theme).html.value).toBeNull();
    expect(mocks.npcs).not.toHaveBeenCalled();
    // Not discovered, so no id is asked for.
    expect(mocks.monsters.mock.calls[0][0]()).toEqual([]);
  });

  it("shows a discovered monster without its stats unless reveal_stats is set", () => {
    mocks.monsters.mockReturnValue({
      data: ref(new Map([["srd_owlbear", { id: "srd_owlbear", name: "Owlbear", size: "large", monster_type: "monstrosity", stat_block: {} }]])),
      isLoading: ref(false),
    });
    mocks.discoveries.mockReturnValue({
      data: ref([{ library_monster_id: "srd_owlbear", monster_id: null, reveal_stats: false }]),
      isLoading: ref(false),
    });
    const html = usePlayerEntityEmbed("monster", "srd_owlbear", "camp-1", theme).html.value;
    expect(html).toContain("Owlbear");
    expect(html).not.toContain("sc-statblock");
  });

  it("does not ask for a DM's own (uuid) spell, which a player cannot read", () => {
    mocks.spell.mockReturnValue({ data: ref(undefined), isLoading: ref(false) });
    const result = usePlayerEntityEmbed("spell", "3f2b8c1e-5d4a-4e7b-9a6c-1d2e3f4a5b6c", "camp-1", theme);
    expect(mocks.spell.mock.calls[0][0].value).toBe("");
    expect(result.html.value).toBeNull();
    expect(result.isLoading.value).toBe(false);
  });
});
