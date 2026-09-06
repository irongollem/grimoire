import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({ markRead: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRoute: () => ({ params: { id: "quest-1" } }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  usePlayerVisibleQuest: () => ({ data: ref(quest()), isLoading: ref(false) }),
  useQuestObjectives: () => ({ data: ref([]) }),
  useQuestRefs: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/play/useReadItems", () => ({ useMarkRead: () => ({ mutate: mocks.markRead }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useSharedNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useSharedLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/monsters/useMonsters", () => ({ usePlayerVisibleMonsters: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ usePlayerQuestBeats: () => ({ data: ref([]) }) }));

function mountView() {
  return mount(PlayerQuestDetailView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        LoadingSpinner: true,
        FocalImage: true,
        PlayerQuestStoryThread: true,
        PlayerSiteMap: true,
        PlayerNotesWidget: true,
        QuestObjectiveStatusMark: true,
        AppModal: true,
      },
    },
  });
}

describe("PlayerQuestDetailView", () => {
  beforeEach(() => {
    mocks.markRead.mockReset();
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
});
