import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { reactive, ref, toRef } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PlayerQuestDetailView from "./PlayerQuestDetailView.vue";
import type { Quest } from "@/types/quest.types";

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1",
    user_id: "dm-1",
    campaign_id: "campaign-1",
    parent_quest_id: null,
    title: "The Silent Bell",
    summary: "Something rings under the church at night.",
    status: "active",
    giver_npc_id: null,
    location_id: null,
    tags: [],
    player_visible_to: ["player-1"],
    started_at: null,
    resolved_at: null,
    entry_beat_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

type Row = object;
const mocks = vi.hoisted(() => ({
  markRead: vi.fn(),
  quest: { value: null as Row | null },
  objectives: { value: [] as Row[] },
  refs: { value: [] as Row[] },
  npcs: { value: [] as Row[] },
  locations: { value: [] as Row[] },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRoute: () => ({ params: { id: "quest-1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  usePlayerVisibleQuest: () => ({ data: toRef(mocks.quest, "value"), isLoading: ref(false) }),
  useQuestObjectives: () => ({ data: toRef(mocks.objectives, "value") }),
  useQuestRefs: () => ({ data: toRef(mocks.refs, "value") }),
}));
vi.mock("@/composables/player/useReadItems", () => ({ useMarkRead: () => ({ mutate: mocks.markRead }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: () => ({ data: toRef(mocks.npcs, "value") }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useSharedLocations: () => ({ data: toRef(mocks.locations, "value") }) }));
vi.mock("@/composables/monsters/usePlayerMonstersByIds", () => ({ usePlayerMonstersByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ usePlayerQuestBeats: () => ({ data: ref([]) }) }));

function mountView() {
  return mount(PlayerQuestDetailView, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        LoadingSpinner: true,
        FocalImage: true,
        PlayerQuestStoryThread: true,
        PlayerSiteMap: true,
        PlayerNotesWidget: true,
        QuestObjectiveStatusMark: true,
      },
    },
  });
}

Object.assign(mocks, {
  quest: reactive(mocks.quest),
  objectives: reactive(mocks.objectives),
  refs: reactive(mocks.refs),
  npcs: reactive(mocks.npcs),
  locations: reactive(mocks.locations),
});

describe("PlayerQuestDetailView", () => {
  beforeEach(() => {
    mocks.markRead.mockReset();
    mocks.quest.value = quest();
    mocks.objectives.value = [];
    mocks.refs.value = [];
    mocks.npcs.value = [];
    mocks.locations.value = [];
  });

  // Regression guard for #799: `quests.rewards` and the currency/item reward
  // columns are gone from the schema. Loot now reaches players through the
  // beat that grants it (`loot_placements`), never the quest header, so the
  // Rewards section — and the `hasCurrencyReward`/`currencyParts` computeds
  // that fed it — must not come back.
  it("renders no Rewards section — loot lives on the beat that grants it, not the quest header", async () => {
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Rewards");
    expect(wrapper.text()).toContain("Something rings under the church at night.");
  });
  const objective = (id: string, description: string, over: Row = {}): Row => ({
    id,
    description,
    status: "active",
    is_player_visible: true,
    ...over,
  });

  it("lists only objectives the party may see, keeps a failed one, and counts done out of those shown", async () => {
    mocks.objectives.value = [
      objective("o1", "Find the bell", { status: "complete" }),
      objective("o2", "Secret betrayal", { is_player_visible: false }),
      objective("o3", "Take the north road", { status: "dormant" }),
      objective("o4", "Save the miller", { status: "failed" }),
    ];
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Find the bell");
    expect(wrapper.text()).toContain("Save the miller");
    expect(wrapper.text()).not.toContain("Secret betrayal");
    expect(wrapper.text()).not.toContain("Take the north road");
    expect(wrapper.text()).toContain("1/2");
  });

  it("lists only player-visible links, and names a link whose target is not shared as ??? never by id", async () => {
    mocks.refs.value = [
      { id: "r1", ref_type: "npc", ref_id: "npc-seen", is_player_visible: true },
      { id: "r2", ref_type: "npc", ref_id: "npc-hidden-link", is_player_visible: false },
      { id: "r3", ref_type: "npc", ref_id: "npc-unshared", is_player_visible: true },
    ];
    mocks.npcs.value = [
      { id: "npc-seen", name: "Maera" },
      { id: "npc-hidden-link", name: "Dungeon Master's Spy" },
    ];
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Maera");
    expect(wrapper.text()).not.toContain("Dungeon Master's Spy");
    expect(wrapper.text()).toContain("???");
    expect(wrapper.text()).not.toContain("npc-unshared");
  });

  it("shows a key location as plain text, not a link, until the location is shared", async () => {
    mocks.refs.value = [
      { id: "r1", ref_type: "location", ref_id: "loc-shared", is_player_visible: true },
      { id: "r2", ref_type: "location", ref_id: "loc-unshared", is_player_visible: true },
    ];
    mocks.locations.value = [{ id: "loc-shared", name: "The Chapel" }];
    const wrapper = mountView();
    await flushPromises();
    const buttons = wrapper.findAll("button").map((b) => b.text());
    expect(buttons).toContain("The Chapel");
    expect(wrapper.text()).toContain("???");
    expect(buttons).not.toContain("???");
  });

  it("opens a giver's card with the name withheld unless the DM revealed the name field", async () => {
    mocks.quest.value = quest({ giver_npc_id: "n1" });
    mocks.npcs.value = [{ id: "n1", name: "Aldric", player_visible_fields: ["race"], race: "Elf" }];
    const wrapper = mountView();
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "Aldric")!.trigger("click");
    await flushPromises();
    const card = document.body.textContent ?? "";
    expect(card).toContain("Elf");
    expect(card).toContain("???");
    wrapper.unmount();
  });
});
