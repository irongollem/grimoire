import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { ResolvedSceneEntity } from "@/ai/sceneEntities";

const reads = vi.hoisted(() => ({ locationIds: [] as unknown[], monsterText: [] as string[], enabled: [] as boolean[] }));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: { group_portrait_url: null } }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: (enabled: () => boolean) => ({
    mentionItems: ref([]),
    partyMembers: { get value() { reads.enabled.push(enabled()); return []; } },
    npcs: ref([{ id: "n1", name: "Vesper", portrait_url: "v.png" }, { id: "n2", name: "Orrin", portrait_url: "o.png" }]),
    monsterIndex: ref([]),
    locations: ref([]),
    factions: ref([]),
  }),
}));
const appearances = vi.hoisted(() => ({ data: { value: undefined as Map<string, string | null> | undefined } }));
vi.mock("@/composables/npcs/useNpcFields", () => ({
  useNpcAppearances: (ids: { value: string[] }) => ({ data: appearances.data, isError: ref(false), ids }),
}));
vi.mock("@/composables/locations/useLocationDescriptions", () => ({
  useLocationDescriptions: (ids: { value: string[] }) => { reads.locationIds.push(ids); return { data: ref(undefined), isError: ref(false) }; },
}));
vi.mock("@/composables/monsters/useMentionedMonsters", () => ({
  useMentionedMonsters: () => ref([]),
  useMentionedMonstersState: (text: () => string) => { reads.monsterText.push(text()); return { monsters: ref([]), loading: ref(false) }; },
}));

const { useAskSceneResolver } = await import("./askSceneMentions");

const labels = (entities: ResolvedSceneEntity[]) => entities.map((e) => e.label);

describe("useAskSceneResolver", () => {
  beforeEach(() => {
    appearances.data.value = new Map([["n1", "pale"], ["n2", "tall"]]);
    reads.enabled = [];
  });

  // Bug caught: one shared text for every card, so resolving a second card's description changed the first's entities.
  it("resolves each description to its own entities, whatever was asked in between", () => {
    const { resolve } = useAskSceneResolver();
    expect(labels(resolve("@Vesper at the weir").entities)).toEqual(["Vesper"]);
    expect(labels(resolve("@Orrin in the keep").entities)).toEqual(["Orrin"]);
    expect(labels(resolve("@Vesper at the weir").entities)).toEqual(["Vesper"]);
  });

  it("reads nothing, and says nothing is loading, for a description that names no one", () => {
    const { resolve } = useAskSceneResolver();
    expect(resolve("a stormy keep")).toEqual({ entities: [], loading: false });
  });

  // Bug caught: a card quoting ready while the looks of the people its own text names were still on their way.
  it("is loading only for the description whose own mentions have not arrived", () => {
    const { resolve } = useAskSceneResolver();
    appearances.data.value = undefined;
    expect(resolve("@Vesper at the weir").loading).toBe(true);
    expect(resolve("no one here @Nobody").loading).toBe(false);
    appearances.data.value = new Map([["n1", "pale"]]);
    expect(resolve("@Vesper at the weir").loading).toBe(false);
  });
});
